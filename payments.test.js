const { test } = require('node:test');
const assert = require('node:assert/strict');
const { amountInKopecks, invoiceFor, matchesPayment, registerPayments } = require('./payments');
const order = () => ({ id: 1, orderNumber: '#0001', userId: 10, courseId: 'dance', course: 'Танцы', date: 'Пн', amount: 900, status: 'pending', paymentPayload: 'unique', history: [] });
const payment = () => ({ invoice_payload: 'unique', currency: 'RUB', total_amount: 90000, telegram_payment_charge_id: 'tg', provider_payment_charge_id: 'yk' });
function harness(items = [order()]) {
  const handlers = {}; let writes = 0; let fail = false;
  registerPayments({ on: (name, fn) => handlers[name] = fn, command: (name, fn) => handlers[name] = fn, telegram: { sendMessage: async () => {} } }, {
    getOrders: () => items, saveOrders: () => { if (fail) throw Error('disk'); writes++; },
    getAvailableSeats: () => 1 - items.filter(o => o.status === 'paid' || o.checkoutQueryId).length, adminId: 99,
  });
  const ctx = { from: { id: 10 }, preCheckoutQuery: { ...payment(), id: 'q' }, message: { successful_payment: payment() }, reply: async () => {}, answerPreCheckoutQuery: async ok => { ctx.answer = ok; } };
  return { handlers, ctx, items, writes: () => writes, fail: () => fail = true };
}
test('900 рублей превращаются в 90000 копеек; неверные цены отклоняются', () => {
  assert.equal(amountInKopecks(900), 90000); assert.equal(amountInKopecks('900.50'), 90050);
  for (const value of [0, -1, NaN, Infinity, 'text', 1.001]) assert.throws(() => amountInKopecks(value));
});
test('счёт и чек соответствуют сохранённой стоимости', () => {
  const invoice = invoiceFor(order(), { YOOKASSA_PROVIDER_TOKEN: 'test', YOOKASSA_RECEIPT_ENABLED: 'true', YOOKASSA_VAT_CODE: '1', YOOKASSA_PAYMENT_MODE: 'full_prepayment' });
  assert.equal(invoice.prices[0].amount, 90000); assert.equal(invoice.currency, 'RUB');
  assert.equal(JSON.parse(invoice.provider_data).receipt.items[0].amount.value, '900.00');
  assert.throws(() => invoiceFor(order(), {}));
});
test('чужой плательщик, другая сумма, валюта и заявка отклоняются', () => {
  assert.equal(matchesPayment(order(), payment(), 11), false);
  for (const patch of [{ currency: 'USD' }, { total_amount: 1 }, { invoice_payload: 'bad' }]) assert.equal(matchesPayment(order(), { ...payment(), ...patch }, 10), false);
});
test('резерв последнего места сохраняется до подтверждения; повторная попытка блокируется', async () => {
  const h = harness(); await h.handlers.pre_checkout_query(h.ctx); assert.equal(h.ctx.answer, true); assert.equal(h.items[0].checkoutQueryId, 'q');
  h.ctx.preCheckoutQuery.id = 'q2'; await h.handlers.pre_checkout_query(h.ctx); assert.equal(h.ctx.answer, false);
  const other = { ...order(), id: 2, paymentPayload: 'other' }; h.items.push(other);
  h.ctx.preCheckoutQuery = { ...payment(), invoice_payload: 'other', id: 'q3' };
  await h.handlers.pre_checkout_query(h.ctx); assert.equal(h.ctx.answer, false);
});
test('подтверждение оплаты сохраняет транзакцию; повторное событие ничего не меняет', async () => {
  const h = harness(); await h.handlers.pre_checkout_query(h.ctx); await h.handlers.successful_payment(h.ctx);
  assert.equal(h.items[0].status, 'paid'); assert.equal(h.items[0].payment.providerChargeId, 'yk'); assert.equal(h.items[0].checkoutQueryId, undefined);
  const writes = h.writes(); await h.handlers.successful_payment(h.ctx); assert.equal(h.writes(), writes);
  await h.handlers.pre_checkout_query(h.ctx); assert.equal(h.ctx.answer, false);
});
test('ошибка хранения запрещает списание', async () => {
  const h = harness(); h.fail(); await h.handlers.pre_checkout_query(h.ctx); assert.equal(h.ctx.answer, false); assert.equal(h.items[0].checkoutQueryId, undefined);
});
test('ошибка хранения успешного платежа не оставляет ложный статус в памяти', async () => {
  const h = harness(); h.fail(); await assert.rejects(h.handlers.successful_payment(h.ctx)); assert.equal(h.items[0].status, 'pending'); assert.equal(h.items[0].payment, undefined);
});
test('платёж после отмены фиксируется, но не восстанавливает запись автоматически', async () => {
  const h = harness(); h.items[0].status = 'cancelled'; await h.handlers.successful_payment(h.ctx);
  assert.equal(h.items[0].status, 'cancelled'); assert.equal(h.items[0].payment.providerChargeId, 'yk');
});
