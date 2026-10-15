// Общий прайс для всех направлений. Один визит = один час.
const TARIFFS = Object.freeze({
  trial: { name: 'Пробное занятие', price: 900, lessons: 1, months: null },
  single: { name: 'Разовое занятие', price: 1100, lessons: 1, months: null },
  pack4: { name: 'Абонемент на 4 занятия', price: 4000, lessons: 4, months: 1 },
  pack6: { name: 'Абонемент на 6 занятий', price: 5500, lessons: 6, months: 1 },
  pack8: { name: 'Абонемент на 8 занятий', price: 6500, lessons: 8, months: 1 },
  pack10: { name: 'Абонемент на 10 занятий', price: 7500, lessons: 10, months: 1 },
  pack12: { name: 'Абонемент на 12 занятий', price: 8500, lessons: 12, months: 1 },
  unlimited: { name: 'Безлимитный абонемент', price: 15000, lessons: null, months: 1 },
});
const rubles = amount => Number(amount).toLocaleString('ru-RU') + ' ₽';
function tariffSnapshot(id) {
  if (!Object.hasOwn(TARIFFS, id)) throw Error('Выберите тариф');
  return { id, ...TARIFFS[id], lessonMinutes: 60 };
}
function priceList() {
  return '💰 Единый прайс для всех направлений\n⏱ 1 занятие — 1 час\n\n' +
    Object.values(TARIFFS).slice(0, 2).map(t => `${t.name} — ${rubles(t.price)}`).join('\n') +
    '\n\n🎟 Абонементы\n' + Object.values(TARIFFS).slice(2, 7).map(t => `${t.lessons} занятий — ${rubles(t.price)}`).join('\n').replace('4 занятий', '4 занятия') +
    '\n\n♾ Безлимит на 1 месяц — 15 000 ₽\n\n📅 Все абонементы действуют 1 месяц с момента активации.';
}
function orderItem(order) { return `${order.tariff?.name || 'Занятие'}: ${order.course}`; }
module.exports = { TARIFFS, rubles, tariffSnapshot, priceList, orderItem };
