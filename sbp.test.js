const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSbpService, isActiveSbp, paymentBody } = require('./sbp');
const env = { YOOKASSA_SHOP_ID: '123', YOOKASSA_SECRET_KEY: 'test', YOOKASSA_RETURN_URL: 'https://t.me/example_bot' };
const makeOrder = () => ({ id: 1, userId: 10, courseId: 'dance', course: 'Танцы', date: 'Пн', orderNumber: '#0001', amount: 900, phone: '89123456789', status: 'pending', history: [] });
const result = (status = 'pending') => ({ id: 'payment-1', status, paid: status === 'succeeded', recipient: { account_id: '123' }, metadata: { order_id: '1', user_id: '10' }, amount: { value: '900.00', currency: 'RUB' }, confirmation: { confirmation_url: 'https://yoomoney.ru/checkout/test' } });
function setup() {
  const orders = [makeOrder()]; const calls = []; let reply = result(); let fail = false; let diskFail = false; const notifications = [];
  const options = { getOrders: () => orders, saveOrders: () => { if (diskFail) throw Error('disk'); },
    getAvailableSeats: () => 1 - orders.filter(o => o.status === 'paid' || isActiveSbp(o)).length,
    telegram: { sendMessage: async (...args) => notifications.push(args) }, adminId: 99, env,
    fetchImpl: async (url, options) => { calls.push({ url, options }); if (fail) throw Error('timeout'); return { ok: true, json: async () => reply }; },
  };
  return { orders, calls, options, notifications, api: createSbpService(options), setReply: value => reply = value, fail: value => fail = value, disk: value => diskFail = value };
}
test('СБП: заранее заполнены сумма, назначение, возврат в бот и телефон для чека', () => {
  const body = paymentBody(makeOrder(), { ...env, YOOKASSA_RECEIPT_ENABLED: 'true', YOOKASSA_VAT_CODE: '1', YOOKASSA_PAYMENT_MODE: 'full_prepayment' });
  assert.equal(body.amount.value, '900.00'); assert.equal(body.payment_method_data.type, 'sbp'); assert.equal(body.capture, true);
  assert.equal(body.receipt.customer.phone, '79123456789'); assert.equal(body.confirmation.return_url, env.YOOKASSA_RETURN_URL);
});
test('одновременные нажатия создают один платёж и резерв последнего места', async () => {
  const h = setup(); await Promise.all([h.api.ensure(h.orders[0]), h.api.ensure(h.orders[0])]);
  assert.equal(h.calls.length, 1); assert.equal(isActiveSbp(h.orders[0]), true);
  h.orders.push({ ...makeOrder(), id: 2 }); await assert.rejects(h.api.ensure(h.orders[1]), /мест/);
  await h.api.ensure(h.orders[0]); assert.equal(h.calls[1].options.method, 'GET');
});
test('после таймаута и перезапуска повторяются тот же запрос и ключ', async () => {
  const h = setup(); h.fail(true); await assert.rejects(h.api.ensure(h.orders[0]));
  h.fail(false); const restarted = createSbpService(h.options); await restarted.ensure(h.orders[0]);
  assert.equal(h.calls[0].options.headers['Idempotence-Key'], h.calls[1].options.headers['Idempotence-Key']);
  assert.equal(h.calls[0].options.body, h.calls[1].options.body);
});
test('слишком старый неопределённый запрос не создаёт второе списание', async () => {
  const h = setup(); h.fail(true); await assert.rejects(h.api.ensure(h.orders[0])); h.fail(false);
  h.orders[0].sbp.createdAt = '2020-01-01T00:00:00.000Z'; await assert.rejects(h.api.ensure(h.orders[0]), /сверка/); assert.equal(h.calls.length, 1);
});
test('оплата подтверждается только по ответу API; повторная проверка не дублирует уведомления', async () => {
  const h = setup(); await h.api.ensure(h.orders[0]); h.setReply(result('succeeded')); await h.api.refresh(h.orders[0]);
  assert.equal(h.orders[0].status, 'paid'); assert.equal(h.orders[0].payment.providerChargeId, 'payment-1'); assert.equal(h.notifications.length, 2);
  await h.api.refresh(h.orders[0]); assert.equal(h.notifications.length, 2);
});
test('неверная сумма, магазин или пользователь не подтверждают оплату', async () => {
  for (const patch of [{ amount: { value: '1.00', currency: 'RUB' } }, { recipient: { account_id: 'other' } }, { metadata: { order_id: '1', user_id: '11' } }, { paid: false }]) {
    const h = setup(); await h.api.ensure(h.orders[0]); h.setReply({ ...result('succeeded'), ...patch });
    await assert.rejects(h.api.refresh(h.orders[0])); assert.equal(h.orders[0].status, 'pending');
  }
});
test('отмена в ЮKassa освобождает место и разрешает новый платёж', async () => {
  const h = setup(); await h.api.ensure(h.orders[0]); const key = h.orders[0].sbp.key;
  h.setReply(result('canceled')); await h.api.refresh(h.orders[0]); assert.equal(isActiveSbp(h.orders[0]), false);
  h.setReply({ ...result(), id: 'payment-2' }); await h.api.ensure(h.orders[0]); assert.notEqual(h.orders[0].sbp.key, key);
});
test('ошибка диска до запроса не создаёт платёж; после ответа не теряет резерв', async () => {
  const h = setup(); h.disk(true); await assert.rejects(h.api.ensure(h.orders[0])); assert.equal(h.calls.length, 0); assert.equal(h.orders[0].sbp, undefined);
  h.disk(false); await h.api.ensure(h.orders[0]); h.setReply(result('succeeded')); h.disk(true);
  await assert.rejects(h.api.refresh(h.orders[0])); assert.equal(h.orders[0].status, 'pending'); assert.equal(isActiveSbp(h.orders[0]), true);
});
test('отмена записи во время оплаты не скрывает полученные деньги', async () => {
  const h = setup(); await h.api.ensure(h.orders[0]); h.orders[0].status = 'cancelled'; h.setReply(result('succeeded')); await h.api.poll();
  assert.equal(h.orders[0].status, 'cancelled'); assert.equal(h.orders[0].sbp.needsReview, true); assert.ok(h.orders[0].payment);
});
test('HTTP 400 показывает причину, освобождает резерв и не повторяется фоном', async () => {
  const h = setup(); let requests = 0;
  h.options.fetchImpl = async () => { requests++; return { ok: false, status: 400, json: async () => ({ type: 'error', code: 'invalid_request', parameter: 'receipt', description: 'Receipt is missing', id: 'error-uuid' }) }; };
  const api = createSbpService(h.options);
  await assert.rejects(api.ensure(h.orders[0]), /receipt.*Receipt is missing/);
  assert.equal(h.orders[0].sbp.status, 'rejected'); assert.equal(isActiveSbp(h.orders[0]), false);
  await api.poll(); assert.equal(requests, 1);
  const oldKey = h.orders[0].sbp.key;
  h.options.env = { ...env, YOOKASSA_RECEIPT_ENABLED: 'true', YOOKASSA_VAT_CODE: '1', YOOKASSA_PAYMENT_MODE: 'full_prepayment' };
  h.options.fetchImpl = async () => ({ ok: true, json: async () => result() });
  await createSbpService(h.options).ensure(h.orders[0]);
  assert.notEqual(h.orders[0].sbp.key, oldKey); assert.ok(h.orders[0].sbp.requestBody.receipt);
});
test('HTTP 500 и конфликт идемпотентности не снимают резерв и не меняют ключ', async () => {
  for (const [status, parameter] of [[500, ''], [400, 'Idempotence-Key']]) {
    const h = setup(); h.options.fetchImpl = async () => ({ ok: false, status, json: async () => ({ type: 'error', code: 'invalid_request', parameter }) });
    const api = createSbpService(h.options); await assert.rejects(api.ensure(h.orders[0])); const key = h.orders[0].sbp.key;
    await assert.rejects(api.ensure(h.orders[0])); assert.equal(h.orders[0].sbp.key, key); assert.equal(isActiveSbp(h.orders[0]), true);
  }
});
test('сообщение API не раскрывает секрет из настроек', async () => {
  const h = setup(); h.options.env = { ...env, YOOKASSA_SECRET_KEY: 'sensitive_secret' };
  h.options.fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ description: 'bad sensitive_secret' }) });
  await assert.rejects(createSbpService(h.options).ensure(h.orders[0]), error => !error.message.includes('sensitive_secret') && error.message.includes('[скрыто]'));
});
test('карта: запрос открывает форму ЮKassa, успешная оплата сохраняется как bank_card', async () => {
  const h = setup(); await h.api.ensure(h.orders[0], 'bank_card');
  const body = JSON.parse(h.calls[0].options.body);
  assert.equal(body.payment_method_data.type, 'bank_card'); assert.equal(body.amount.value, '900.00'); assert.equal(body.confirmation.type, 'redirect');
  h.setReply(result('succeeded')); await h.api.refresh(h.orders[0]);
  assert.equal(h.orders[0].payment.method, 'bank_card'); assert.match(h.notifications[1][1], /карта/);
});
test('активная оплата картой не создаёт параллельный платёж СБП', async () => {
  const h = setup(); await h.api.ensure(h.orders[0], 'bank_card');
  const key = h.orders[0].sbp.key; const value = await h.api.ensure(h.orders[0], 'sbp');
  assert.equal(value.method, 'bank_card'); assert.equal(value.key, key);
  assert.equal(h.calls.filter(c => c.options.method === 'POST').length, 1);
});
test('после отказа СБП можно оплатить картой с новым ключом', async () => {
  const h = setup(); const originalFetch = h.options.fetchImpl;
  h.options.fetchImpl = async (url, options) => JSON.parse(options.body || '{}').payment_method_data?.type === 'sbp'
    ? { ok: false, status: 400, json: async () => ({ type: 'error', code: 'invalid_request', description: 'Payment method is not available' }) }
    : originalFetch(url, options);
  const api = createSbpService(h.options); await assert.rejects(api.ensure(h.orders[0], 'sbp'));
  const key = h.orders[0].sbp.key; await api.ensure(h.orders[0], 'bank_card');
  assert.notEqual(h.orders[0].sbp.key, key); assert.equal(h.orders[0].sbp.method, 'bank_card');
});
test('неподдерживаемый способ оплаты не вызывает API', async () => {
  const h = setup(); await assert.rejects(h.api.ensure(h.orders[0], 'unknown')); assert.equal(h.calls.length, 0);
});
