const { randomUUID } = require('crypto');

function amountInKopecks(value) {
  const amount = Number(value);
  const kopecks = Math.round(amount * 100);
  if (!Number.isFinite(amount) || kopecks <= 0 || !Number.isSafeInteger(kopecks) || Math.abs(amount * 100 - kopecks) > 0.00001) {
    throw new Error('Некорректная стоимость занятия');
  }
  return kopecks;
}

function invoiceFor(order, env = process.env) {
  if (!env.YOOKASSA_PROVIDER_TOKEN) throw new Error('Не задан YOOKASSA_PROVIDER_TOKEN');
  const amount = amountInKopecks(order.amount);
  const invoice = {
    title: `Занятие: ${order.course}`.slice(0, 32),
    description: `${order.orderNumber}: ${order.course}. День: ${order.date}`.slice(0, 255),
    payload: order.paymentPayload,
    provider_token: env.YOOKASSA_PROVIDER_TOKEN,
    currency: 'RUB',
    prices: [{ label: 'Одно занятие', amount }],
    start_parameter: `order_${order.id}`,
  };
  if (env.YOOKASSA_RECEIPT_ENABLED === 'true') {
    const vat = Number(env.YOOKASSA_VAT_CODE);
    if (!Number.isInteger(vat) || vat < 1 || vat > 12 || !env.YOOKASSA_PAYMENT_MODE) {
      throw new Error('Настройте НДС и способ расчёта для чека');
    }
    invoice.need_email = true;
    invoice.send_email_to_provider = true;
    invoice.provider_data = JSON.stringify({ receipt: { items: [{
      description: `Занятие: ${order.course}`.slice(0, 128), quantity: '1.00',
      amount: { value: (amount / 100).toFixed(2), currency: 'RUB' },
      vat_code: vat, payment_mode: env.YOOKASSA_PAYMENT_MODE, payment_subject: 'service',
    }] } });
  }
  return invoice;
}

function matchesPayment(order, payment, userId) {
  return Boolean(order && order.userId === userId && order.paymentPayload === payment.invoice_payload &&
    payment.currency === 'RUB' && payment.total_amount === amountInKopecks(order.amount));
}

function registerPayments(bot, { getOrders, saveOrders, getAvailableSeats, adminId }) {
  const notifyAdmin = text => bot.telegram.sendMessage(adminId, text).catch(() => console.error('Не удалось уведомить администратора об оплате'));
  const findOrder = payload => getOrders().find(o => o.paymentPayload === payload);

  bot.on('pre_checkout_query', async ctx => {
    const query = ctx.preCheckoutQuery;
    const order = findOrder(query.invoice_payload);
    if (!matchesPayment(order, query, ctx.from.id) || order.status !== 'pending' || order.payment || order.sbp) {
      return ctx.answerPreCheckoutQuery(false, 'Счёт недействителен или уже оплачен. Обратитесь к администратору.');
    }
    if (order.checkoutQueryId && order.checkoutQueryId !== query.id) {
      return ctx.answerPreCheckoutQuery(false, 'Предыдущий платёж ещё обрабатывается. Обратитесь к администратору.');
    }
    if (!order.checkoutQueryId && getAvailableSeats(order.courseId) <= 0) {
      return ctx.answerPreCheckoutQuery(false, 'Свободных мест больше нет. Выберите другое занятие.');
    }
    // Резерв сохраняется до результата или ручной сверки: таймаут не доказывает отмену платежа.
    order.checkoutQueryId = query.id;
    order.checkoutStartedAt = new Date().toISOString();
    try { saveOrders(); } catch (error) {
      delete order.checkoutQueryId;
      delete order.checkoutStartedAt;
      return ctx.answerPreCheckoutQuery(false, 'Не удалось сохранить заявку. Попробуйте позже.');
    }
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on('successful_payment', async ctx => {
    const payment = ctx.message.successful_payment;
    const order = findOrder(payment.invoice_payload);
    if (!matchesPayment(order, payment, ctx.from.id)) {
      await notifyAdmin(`⚠️ Получен платёж с несовпадающими реквизитами. Проверьте ЮKassa: ${payment.provider_payment_charge_id}`);
      return ctx.reply('Платёж требует сверки. Администратор уведомлён.');
    }
    if (order.payment?.telegramChargeId === payment.telegram_payment_charge_id) return;
    if (order.payment) {
      await notifyAdmin(`⚠️ Повторный платёж по заявке ${order.orderNumber}: ${payment.provider_payment_charge_id}. Проверьте необходимость возврата.`);
      return;
    }
    const previous = JSON.parse(JSON.stringify(order));
    const needsReview = order.status !== 'pending';
    order.payment = {
      telegramChargeId: payment.telegram_payment_charge_id,
      providerChargeId: payment.provider_payment_charge_id,
      amount: payment.total_amount, currency: payment.currency,
    };
    order.paymentDate = order.updatedAt = new Date().toISOString();
    if (!needsReview) order.status = 'paid';
    delete order.checkoutQueryId;
    delete order.checkoutStartedAt;
    order.history.push({ date: order.updatedAt, action: 'Платёж подтверждён Telegram / ЮKassa', by: 'payment_provider' });
    try { saveOrders(); } catch (error) {
      for (const key of Object.keys(order)) delete order[key];
      Object.assign(order, previous);
      await notifyAdmin(`⚠️ Не удалось сохранить платёж ${payment.provider_payment_charge_id}. Требуется сверка.`);
      throw error;
    }
    await notifyAdmin(`${needsReview ? '⚠️ Требуется сверка статуса.' : '✅ Оплачено.'} ${order.orderNumber}: ${order.course}, ${order.amount} ₽. Платёж ЮKassa: ${payment.provider_payment_charge_id}`);
    await ctx.reply(needsReview
      ? 'Оплата получена. Статус записи изменился во время оплаты; администратор уточнит запись.'
      : `✅ Оплата ${order.amount} ₽ получена!\nЗаявка ${order.orderNumber}\n${order.course}\nДень: ${order.date}`);
  });

  bot.command('payment_release', async ctx => {
    if (ctx.from.id !== adminId) return;
    const match = ctx.message.text.match(/^\/payment_release(?:@\w+)? (\d+) CONFIRM$/);
    if (!match) return ctx.reply('После проверки в ЮKassa, что платёж не прошёл и не обрабатывается: /payment_release ID CONFIRM');
    const order = getOrders().find(o => o.id === Number(match[1]));
    if (!order || order.payment || !order.checkoutQueryId) return ctx.reply('Нет незавершённого платежа для сброса.');
    delete order.checkoutQueryId;
    delete order.checkoutStartedAt;
    order.paymentPayload = randomUUID(); // Старые счета больше не принимаются.
    order.history.push({ date: new Date().toISOString(), action: 'Платёж проверен администратором; резерв снят', by: 'admin' });
    saveOrders();
    await ctx.reply('Резерв снят. Клиент может получить новый счёт командой /payments.');
  });
}

module.exports = { amountInKopecks, invoiceFor, matchesPayment, registerPayments };
