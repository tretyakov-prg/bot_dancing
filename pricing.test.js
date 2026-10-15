const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TARIFFS, tariffSnapshot, priceList } = require('./pricing');
const { invoiceFor } = require('./payments');
const { paymentBody } = require('./sbp');
const env = { YOOKASSA_PROVIDER_TOKEN: 'test', YOOKASSA_RETURN_URL: 'https://t.me/test_bot', YOOKASSA_RECEIPT_ENABLED: 'true', YOOKASSA_VAT_CODE: '1', YOOKASSA_PAYMENT_MODE: 'full_prepayment' };
test('все восемь тарифов передают полную сумму и название в оба способа оплаты и чек', () => {
  const amounts = [900, 1100, 4000, 5500, 6500, 7500, 8500, 15000];
  Object.keys(TARIFFS).forEach((id, index) => {
    const tariff = tariffSnapshot(id);
    const order = { id: 1, userId: 10, course: 'Танцы', orderNumber: '#0001', date: 'Пн', phone: '89123456789', tariff, amount: tariff.price, paymentPayload: 'test' };
    assert.equal(order.amount, amounts[index]);
    const invoice = invoiceFor(order, env); assert.equal(invoice.prices[0].amount, amounts[index] * 100); assert.equal(invoice.prices[0].label, tariff.name);
    for (const method of ['sbp', 'bank_card']) {
      const body = paymentBody(order, env, method);
      assert.equal(body.amount.value, amounts[index].toFixed(2)); assert.equal(body.receipt.items[0].amount.value, body.amount.value);
      assert.ok(body.receipt.items[0].description.includes(tariff.name));
    }
  });
});
test('срок начинается с активации, безлимит не получает выдуманное число посещений', () => {
  assert.equal(tariffSnapshot('unlimited').lessons, null); assert.equal(tariffSnapshot('unlimited').months, 1);
  assert.equal(tariffSnapshot('single').months, null); assert.match(priceList(), /с момента активации/);
  assert.throws(() => tariffSnapshot('toString'));
});
test('снимок тарифа независим от общего прайса, длительность всех направлений — час', () => {
  const snapshot = tariffSnapshot('pack4'); snapshot.price = 1; assert.equal(TARIFFS.pack4.price, 4000);
  const { COURSES_ALL } = require('./config');
  for (const course of Object.values(COURSES_ALL)) assert.equal(course.duration, '60 мин');
});
