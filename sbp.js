const { randomUUID } = require('crypto');
const { amountInKopecks } = require('./payments');
const isActiveSbp = order => Boolean(order.sbp && !['canceled', 'succeeded', 'rejected'].includes(order.sbp.status));

function paymentBody(order, env, method = 'sbp') {
  if (!['sbp', 'bank_card'].includes(method)) throw Error('Неизвестный способ оплаты');
  const returnUrl = new URL(env.YOOKASSA_RETURN_URL);
  if (returnUrl.protocol !== 'https:') throw Error('YOOKASSA_RETURN_URL должен начинаться с https://');
  const body = {
    amount: { value: (amountInKopecks(order.amount) / 100).toFixed(2), currency: 'RUB' },
    capture: true, payment_method_data: { type: method },
    confirmation: { type: 'redirect', return_url: returnUrl.href },
    description: `${order.orderNumber}: занятие ${order.course}`.slice(0, 128),
    metadata: { order_id: String(order.id), user_id: String(order.userId) },
  };
  if (env.YOOKASSA_RECEIPT_ENABLED === 'true') {
    const phone = String(order.phone).replace(/^8(?=\d{10}$)/, '7');
    const vat = Number(env.YOOKASSA_VAT_CODE);
    if (!/^7\d{10}$/.test(phone)) throw Error('Для чека нужен телефон в формате 8XXXXXXXXXX');
    if (!Number.isInteger(vat) || vat < 1 || vat > 12 || !env.YOOKASSA_PAYMENT_MODE) throw Error('Настройте параметры чека');
    body.receipt = { customer: { phone }, items: [{
      description: `Занятие: ${order.course}`.slice(0, 128), quantity: '1.00', amount: body.amount,
      vat_code: vat, payment_mode: env.YOOKASSA_PAYMENT_MODE, payment_subject: 'service',
    }] };
  }
  return body;
}

function createSbpService({ getOrders, saveOrders, getAvailableSeats, telegram, adminId, env = process.env, fetchImpl = fetch }) {
  const locks = new Map();
  const configured = () => Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY && env.YOOKASSA_RETURN_URL);
  function commit(order, mutate) {
    const previous = JSON.parse(JSON.stringify(order));
    try { mutate(); saveOrders(); } catch (error) {
      for (const key of Object.keys(order)) delete order[key];
      Object.assign(order, previous);
      throw error;
    }
  }
  async function request(route, body, key) {
    if (!configured()) throw Error('Настройте shopId, секретный ключ и адрес возврата ЮKassa');
    const response = await fetchImpl(`https://api.yookassa.ru/v3/payments${route}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Basic ${Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json', ...(key ? { 'Idempotence-Key': key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const sanitize = value => {
        let text = typeof value === 'string' ? value : '';
        for (const secret of [env.YOOKASSA_SECRET_KEY, env.TELEGRAM_TOKEN,
          Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString('base64')]) {
          if (secret) text = text.split(secret).join('[скрыто]');
        }
        return text.replace(/[\r\n\t]/g, ' ').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
          .replace(/\+?\d{10,16}/g, '[номер]').slice(0, 500);
      };
      const info = { httpStatus: response.status, code: sanitize(details.code), parameter: sanitize(details.parameter),
        description: sanitize(details.description), requestId: sanitize(details.id) };
      const error = new Error(`ЮKassa: HTTP ${info.httpStatus}; ${info.code || 'неизвестная ошибка'}; поле: ${info.parameter || 'не указано'}; ${info.description || 'ответ без описания'}; запрос: ${info.requestId || 'не указан'}`);
      error.yookassa = info;
      // Конфликт ключа может относиться к уже существующему платежу: не снимаем резерв.
      error.creationRejected = Boolean(body && response.status === 400 && details.type === 'error' &&
        details.code === 'invalid_request' && !/idempotence/i.test(`${details.parameter || ''} ${details.description || ''}`));
      throw error;
    }
    return response.json();
  }
  function exclusive(order, fn) {
    if (locks.has(order.id)) return locks.get(order.id);
    const promise = Promise.resolve().then(fn).finally(() => locks.delete(order.id));
    locks.set(order.id, promise);
    return promise;
  }
  async function notify(order) {
    if (order.sbp.status !== 'succeeded') return;
    for (const [flag, chatId, text] of [
      ['userNotified', order.userId, `✅ Оплата ${order.amount} ₽ получена. Заявка ${order.orderNumber}: ${order.course}. День: ${order.date}.${order.sbp.needsReview ? ' Администратор уточнит статус записи.' : ''}`],
      ['adminNotified', adminId, `${order.sbp.needsReview ? '⚠️ Требуется сверка записи.' : `✅ Оплачено: ${order.sbp.method === 'bank_card' ? 'карта' : 'СБП'}.`} ${order.orderNumber}: ${order.course}, ${order.amount} ₽. ЮKassa: ${order.sbp.id}`],
    ]) {
      if (order.sbp[flag]) continue;
      try {
        await telegram.sendMessage(chatId, text);
        commit(order, () => { order.sbp[flag] = true; });
      } catch { console.error(`Не удалось сохранить/отправить уведомление СБП: заявка ${order.id}`); }
    }
  }
  async function apply(order, payment) {
    if (!payment.id || (order.sbp.id && order.sbp.id !== payment.id) ||
        payment.recipient?.account_id !== String(env.YOOKASSA_SHOP_ID) ||
        payment.metadata?.order_id !== String(order.id) || payment.metadata?.user_id !== String(order.userId) ||
        payment.amount?.currency !== 'RUB' || amountInKopecks(payment.amount?.value) !== amountInKopecks(order.amount) ||
        !['pending', 'waiting_for_capture', 'succeeded', 'canceled'].includes(payment.status) ||
        (payment.status === 'succeeded' && payment.paid !== true)) throw Error('Реквизиты платежа ЮKassa не совпадают с заявкой');
    commit(order, () => {
      order.sbp.id = payment.id;
      order.sbp.status = payment.status;
      if (payment.confirmation?.confirmation_url) {
        const url = new URL(payment.confirmation.confirmation_url);
        if (url.protocol !== 'https:') throw Error('Некорректная ссылка оплаты');
        order.sbp.url = url.href;
      }
      if (payment.status === 'succeeded' && !order.payment) {
        order.sbp.needsReview = order.status !== 'pending';
        order.payment = { providerChargeId: payment.id, amount: amountInKopecks(order.amount), currency: 'RUB', method: order.sbp.method || order.sbp.requestBody?.payment_method_data?.type || 'sbp' };
        order.paymentDate = order.updatedAt = new Date().toISOString();
        if (!order.sbp.needsReview) order.status = 'paid';
        order.history.push({ date: order.updatedAt, action: 'Оплата подтверждена API ЮKassa', by: 'payment_provider' });
      } else if (payment.status === 'succeeded' && order.payment.providerChargeId !== payment.id) {
        order.sbp.needsReview = true;
      }
    });
    await notify(order);
    return order.sbp;
  }
  async function refreshUnlocked(order) {
    if (!order.sbp) return null;
    if (order.sbp.status === 'succeeded') { await notify(order); return order.sbp; }
    if (['canceled', 'rejected'].includes(order.sbp.status)) return order.sbp;
    let result;
    if (order.sbp.id) result = await request(`/${encodeURIComponent(order.sbp.id)}`);
    else {
      // ЮKassa хранит ключ идемпотентности 24 часа. Поздний POST может создать второй платёж.
      if (Date.now() - Date.parse(order.sbp.createdAt) > 23 * 60 * 60 * 1000) throw Error('Неизвестный результат создания платежа: нужна сверка в ЮKassa');
      try {
        result = await request('', order.sbp.requestBody, order.sbp.key);
      } catch (error) {
        if (error.yookassa) commit(order, () => {
          order.sbp.lastError = error.yookassa;
          if (error.creationRejected) order.sbp.status = 'rejected';
        });
        throw error;
      }
    }
    return apply(order, result);
  }
  const refresh = order => exclusive(order, () => refreshUnlocked(order));
  const ensure = (order, method = 'sbp') => exclusive(order, async () => {
    if (!['sbp', 'bank_card'].includes(method)) throw Error('Неизвестный способ оплаты');
    if (order.sbp && isActiveSbp(order)) {
      try { await refreshUnlocked(order); } catch (error) {
        if (!error.creationRejected) throw error;
      }
      if (isActiveSbp(order) || order.sbp.status === 'succeeded') return order.sbp;
    }
    if (order.payment || order.status !== 'pending') throw Error('Заявка уже обработана');
    if (order.checkoutQueryId) throw Error('Сначала завершите ранее начатую оплату Telegram');
    if (getAvailableSeats(order.courseId) <= 0) throw Error('Свободных мест больше нет');
    if (!configured()) throw Error('Оплата через ЮKassa ещё не настроена');
    const body = paymentBody(order, env, method);
    commit(order, () => {
      if (order.sbp) (order.sbpHistory ||= []).push(order.sbp);
      order.sbp = { method, key: randomUUID(), status: 'creating', createdAt: new Date().toISOString(), requestBody: body };
      // Отключаем старые Telegram-счета этой заявки, пока оплата идёт через СБП.
      order.paymentPayload = randomUUID();
    });
    return refreshUnlocked(order);
  });
  let polling = false;
  async function poll() {
    if (polling || !configured()) return;
    polling = true;
    try {
      for (const order of getOrders()) {
        if (!order.sbp || ['canceled', 'rejected'].includes(order.sbp.status) || (order.sbp.status === 'succeeded' && order.sbp.userNotified && order.sbp.adminNotified)) continue;
        try { await refresh(order); } catch (error) { console.error(`СБП, заявка ${order.id}: ${error.message}`); }
      }
    } finally { polling = false; }
  }
  const reconcile = (order, paymentId) => exclusive(order, async () => {
    if (!order.sbp) throw Error('У заявки нет платежа СБП');
    return apply(order, await request(`/${encodeURIComponent(paymentId)}`));
  });
  return { configured, ensure, refresh, poll, reconcile };
}
module.exports = { isActiveSbp, paymentBody, createSbpService };
