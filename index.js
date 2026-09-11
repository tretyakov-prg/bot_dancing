const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const {
  SCHOOL_INFO,
  COURSES_KIDS,
  COURSES_ADULTS,
  COURSES_ALL,
  MENU_BUTTONS,
  QR_CONFIG,
  ORDER_STATUS,
  ORDER_STATUS_EMOJI,
  ORDER_STATUS_TEXT,
  STATUSES_OCCUPYING_SEAT,
  parseDaysFromSchedule
} = require('./config.js');

// ============ ПРОВЕРКА ТОКЕНА ============
const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error('❌ ОШИБКА: TELEGRAM_TOKEN не найден в .env файле!');
  process.exit(1);
}

const bot = new Telegraf(token);
const session = new LocalSession({ database: 'sessions.json' });
bot.use(session.middleware());

const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 123456789;

// ============ ФАЙЛОВОЕ ХРАНИЛИЩЕ ЗАЯВОК ============
const DATA_DIR = './data';
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const COUNTER_FILE = path.join(DATA_DIR, 'counter.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
      console.log(`📦 Загружено ${data.length} заявок из файла`);
      return data;
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки заявок:', error.message);
  }
  return [];
}

function saveOrders() {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
  } catch (error) {
    console.error('❌ Ошибка сохранения заявок:', error.message);
  }
}

function loadCounter() {
  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
      return data.counter || 1;
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки счётчика:', error.message);
  }
  return 1;
}

function saveCounter() {
  try {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ counter: orderCounter }, null, 2), 'utf8');
  } catch (error) {
    console.error('❌ Ошибка сохранения счётчика:', error.message);
  }
}

let orders = loadOrders();
let orderCounter = loadCounter();

// ============ ФУНКЦИИ РАБОТЫ С ЗАЯВКАМИ ============

function createOrder(session, course) {
  const order = {
    id: orderCounter++,
    orderNumber: `#${String(orderCounter - 1).padStart(4, '0')}`,
    course: course.name,
    courseId: session.course,
    courseType: session.courseType || 'unknown',
    name: session.name,
    phone: session.phone,
    date: session.date,
    amount: course.price,
    status: ORDER_STATUS.PENDING,
    userId: session.userId,
    username: session.username || 'нет',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paymentDate: null,
    notes: [],
    history: [{
      date: new Date().toISOString(),
      action: 'Создана заявка',
      by: 'user'
    }]
  };
  
  orders.push(order);
  saveOrders();
  saveCounter();
  return order;
}

function updateOrderStatus(orderId, status, note = '', by = 'admin') {
  const order = orders.find(o => o.id === orderId);
  if (!order) return false;
  
  const oldStatus = order.status;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  
  if (status === ORDER_STATUS.PAID) {
    order.paymentDate = new Date().toISOString();
  }
  
  order.history.push({
    date: new Date().toISOString(),
    action: `Статус изменён: ${ORDER_STATUS_TEXT[oldStatus]} → ${ORDER_STATUS_TEXT[status]}`,
    note: note,
    by: by
  });
  
  if (note) {
    order.notes.push({
      date: new Date().toISOString(),
      note: note
    });
  }
  
  saveOrders();
  return true;
}

function rescheduleOrder(orderId, newDate, newTime, reason = '', by = 'admin') {
  const order = orders.find(o => o.id === orderId);
  if (!order) return false;
  
  const oldDate = order.date;
  order.date = newDate + (newTime ? `, ${newTime}` : '');
  order.status = ORDER_STATUS.RESCHEDULED;
  order.updatedAt = new Date().toISOString();
  
  order.history.push({
    date: new Date().toISOString(),
    action: `Перенос: ${oldDate} → ${order.date}`,
    note: reason,
    by: by
  });
  
  if (reason) {
    order.notes.push({
      date: new Date().toISOString(),
      note: `Перенос: ${reason}`
    });
  }
  
  saveOrders();
  return true;
}

function markNoShow(orderId, reason = '', by = 'admin') {
  const order = orders.find(o => o.id === orderId);
  if (!order) return false;
  
  order.status = ORDER_STATUS.NO_SHOW;
  order.updatedAt = new Date().toISOString();
  
  order.history.push({
    date: new Date().toISOString(),
    action: 'Отмечен как "Не пришёл"',
    note: reason,
    by: by
  });
  
  if (reason) {
    order.notes.push({
      date: new Date().toISOString(),
      note: `Не пришёл: ${reason}`
    });
  }
  
  saveOrders();
  return true;
}

function getOccupiedSeats(courseId) {
  return orders.filter(o => 
    o.courseId === courseId && 
    STATUSES_OCCUPYING_SEAT.includes(o.status)
  ).length;
}

function getAvailableSeats(courseId) {
  const course = COURSES_ALL[courseId];
  if (!course) return 0;
  
  const occupied = getOccupiedSeats(courseId);
  return Math.max(0, course.maxStudents - occupied);
}

function hasAvailableSeats(courseId) {
  return getAvailableSeats(courseId) > 0;
}

function getOrdersByStatus(status) {
  return orders.filter(o => o.status === status);
}

function getStats() {
  const total = orders.length;
  const pending = getOrdersByStatus(ORDER_STATUS.PENDING).length;
  const paid = getOrdersByStatus(ORDER_STATUS.PAID).length;
  const confirmed = getOrdersByStatus(ORDER_STATUS.CONFIRMED).length;
  const cancelled = getOrdersByStatus(ORDER_STATUS.CANCELLED).length;
  const completed = getOrdersByStatus(ORDER_STATUS.COMPLETED).length;
  const rescheduled = getOrdersByStatus(ORDER_STATUS.RESCHEDULED).length;
  const noShow = getOrdersByStatus(ORDER_STATUS.NO_SHOW).length;
  
  const totalRevenue = orders
    .filter(o => STATUSES_OCCUPYING_SEAT.includes(o.status))
    .reduce((sum, o) => sum + o.amount, 0);
  
  const courseStats = {};
  orders.forEach(o => {
    if (STATUSES_OCCUPYING_SEAT.includes(o.status)) {
      courseStats[o.course] = (courseStats[o.course] || 0) + 1;
    }
  });
  
  const kidsCount = orders.filter(o => o.courseType === 'kids').length;
  const adultsCount = orders.filter(o => o.courseType === 'adults').length;
  
  return {
    total, pending, paid, confirmed, cancelled, completed,
    rescheduled, noShow, totalRevenue, courseStats, kidsCount, adultsCount
  };
}

function formatOrderShort(order) {
  const statusEmoji = ORDER_STATUS_EMOJI[order.status] || '❓';
  return `${order.orderNumber} | ${order.name} | ${order.course} | ${statusEmoji}`;
}

// ============ ИНДИКАТОР ЗАПОЛНЕННОСТИ (без цифр!) ============
function getSeatsIndicator(courseId) {
  const course = COURSES_ALL[courseId];
  if (!course) return '';
  
  const occupied = getOccupiedSeats(courseId);
  const available = course.maxStudents - occupied;
  
  if (available <= 0) return '🔴';
  if (available <= 3) return '🟡';
  return '🟢';
}

// ============ КНОПКИ ============

function getMainMenu() {
  return Markup.keyboard([
    [MENU_BUTTONS.kids, MENU_BUTTONS.adults],
    [MENU_BUTTONS.info, MENU_BUTTONS.askAdmin],
    [MENU_BUTTONS.cancel]
  ])
  .resize()
  .persistent();
}

function getCourseButtons(courses) {
  const buttons = [];
  const courseKeys = Object.keys(courses);
  
  for (let i = 0; i < courseKeys.length; i += 2) {
    const row = [];
    const key1 = courseKeys[i];
    const available1 = getAvailableSeats(key1);
    const ind1 = available1 <= 0 ? '🔴 ' : '';
    row.push(Markup.button.callback(`${ind1}${courses[key1].name}`, `course_${key1}`));
    
    if (i + 1 < courseKeys.length) {
      const key2 = courseKeys[i + 1];
      const available2 = getAvailableSeats(key2);
      const ind2 = available2 <= 0 ? '🔴 ' : '';
      row.push(Markup.button.callback(`${ind2}${courses[key2].name}`, `course_${key2}`));
    }
    buttons.push(row);
  }
  
  buttons.push([Markup.button.callback('❌ Отмена', 'cancel')]);
  return Markup.inlineKeyboard(buttons);
}

function getConfirmButtons() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Подтвердить', 'confirm'),
      Markup.button.callback('✏️ Изменить', 'change')
    ],
    [
      Markup.button.callback('❌ Отмена', 'cancel')
    ]
  ]);
}

// Кнопки выбора дня недели (из расписания курса)
function getDayButtons(courseId) {
  const course = COURSES_ALL[courseId];
  if (!course) return Markup.inlineKeyboard([]);
  
  const days = parseDaysFromSchedule(course.schedule);
  
  if (days.length === 0) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', 'cancel')]
    ]);
  }
  
  // Группируем по 2 кнопки в ряд
  const buttons = [];
  for (let i = 0; i < days.length; i += 2) {
    const row = [];
    row.push(Markup.button.callback(days[i], `day_${days[i]}`));
    if (i + 1 < days.length) {
      row.push(Markup.button.callback(days[i + 1], `day_${days[i + 1]}`));
    }
    buttons.push(row);
  }
  
  buttons.push([Markup.button.callback('❌ Отмена', 'cancel')]);
  return Markup.inlineKeyboard(buttons);
}

// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============
function generateQRCode(data) {
  return new Promise((resolve, reject) => {
    QRCode.toDataURL(data, QR_CONFIG, (err, url) => {
      if (err) reject(err);
      else resolve(url);
    });
  });
}

function isAdmin(ctx) {
  return ctx.from.id === ADMIN_ID;
}

// ============ ГЕНЕРАЦИЯ СООБЩЕНИЙ ============

function generateWelcome(name) {
  return `💃 **Добро пожаловать в школу танцев "${SCHOOL_INFO.name}"!**\n\n` +
    `Я помогу вам записаться на занятия.\n\n` +
    `👶 **Детские группы** — для детей от 4 до 17 лет\n` +
    `🧑 **Взрослые группы** — для тех, кому 16+\n\n` +
    `📌 Если у вас возникнут вопросы, задайте их через "${MENU_BUTTONS.askAdmin}"\n\n` +
    `Выберите действие в меню ниже 👇`;
}

// БЕЗ счётчиков мест!
function generateCourseList(courses, title) {
  let message = `${title}\n\n`;
  
  for (const [key, course] of Object.entries(courses)) {
    const indicator = getSeatsIndicator(key);
    
    message += `**${course.name}** ${indicator}\n`;
    message += `💰 ${course.price}₽ | ⏱ ${course.duration}\n`;
    message += `📅 ${course.schedule}\n`;
    message += `🎯 ${course.level}\n\n`;
  }
  
  message += 'Для записи выберите группу в меню';
  return message;
}

// БЕЗ счётчиков мест!
function generateCourseSelected(course, occupied) {
  const indicator = getSeatsIndicator(course.id);
  
  return `${indicator} Вы выбрали курс: **${course.name}**\n\n` +
    `📖 ${course.description}\n` +
    `💰 Цена: ${course.price}₽\n` +
    `⏱ Длительность: ${course.duration}\n` +
    `📅 Расписание: ${course.schedule}\n` +
    `🎯 Уровень: ${course.level}\n\n` +
    `✍️ Введите ваше **имя и фамилию** для записи:`;
}

function generateDaySelection(courseId) {
  const course = COURSES_ALL[courseId];
  const days = parseDaysFromSchedule(course.schedule);
  
  return `📅 **Выберите день недели для занятий:**\n\n` +
    `🎯 Курс: **${course.name}**\n` +
    `🕐 Время: ${course.schedule.split(' ').slice(1).join(' ')}\n\n` +
    `📌 Доступные дни: ${days.join(', ')}\n\n` +
    `👇 Выберите удобный день:`;
}

function generateConfirm(session) {
  const course = COURSES_ALL[session.course];
  const indicator = getSeatsIndicator(session.course);
  
  return `📋 **Проверьте данные записи:**\n\n` +
    `🎯 Курс: ${course.name} ${indicator}\n` +
    `👤 Имя: ${session.name}\n` +
    `📱 Телефон: ${session.phone}\n` +
    `📅 День: ${session.date}\n` +
    `💰 Сумма: ${course.price}₽\n\n` +
    `✅ Всё верно?`;
}

function generateInfo() {
  return `🏫 **Школа танцев "${SCHOOL_INFO.name}"**\n\n` +
    `📍 Адрес: ${SCHOOL_INFO.address}\n` +
    `☎️ Телефон: ${SCHOOL_INFO.phone}\n` +
    `📧 Email: ${SCHOOL_INFO.email}\n` +
    `🌐 Сайт: ${SCHOOL_INFO.website}\n` +
    `🕐 Режим работы: ${SCHOOL_INFO.workHours}\n\n` +
    `📌 По всем вопросам обращайтесь к администратору через "${MENU_BUTTONS.askAdmin}"`;
}

function generateAskAdmin() {
  return `👤 **Связь с администратором**\n\n` +
    `Напишите ваш вопрос, и я передам его администратору.\n\n` +
    `📌 Что можно спросить:\n` +
    `• Уточнить расписание\n` +
    `• Задать вопрос по оплате\n` +
    `• Узнать о наличии мест\n` +
    `• Любые другие вопросы\n\n` +
    `✍️ Напишите ваш вопрос одним сообщением:`;
}

function generateQuestionSent() {
  return `✅ **Ваш вопрос отправлен администратору!**\n\n` +
    `Администратор свяжется с вами в ближайшее время.\n\n` +
    `📌 Если вопрос срочный, позвоните:\n${SCHOOL_INFO.phone}`;
}

function generateAdminNewQuestion(user, question) {
  return `📨 **Новый вопрос от пользователя!**\n\n` +
    `👤 Имя: ${user.firstName}\n` +
    `🆔 ID: \`${user.id}\`\n` +
    `📱 Username: @${user.username || 'нет'}\n\n` +
    `❓ **Вопрос:**\n${question}`;
}

function generateAdminNewOrder(session, course) {
  return `🆕 **Новая запись!**\n\n` +
    `🎯 Курс: ${course.name}\n` +
    `👤 Имя: ${session.name}\n` +
    `📱 Телефон: ${session.phone}\n` +
    `📅 День: ${session.date}\n` +
    `💰 Сумма: ${course.price}₽\n` +
    `🆔 Пользователь: ${session.userId}\n` +
    `📱 Username: @${session.username || 'нет'}\n\n` +
    `⏳ Ожидает оплаты`;
}

// ============ ОБРАБОТЧИКИ ============

bot.start(async (ctx) => {
  ctx.session = { step: 'choose_course' };
  
  await ctx.reply(
    generateWelcome(ctx.from.first_name),
    {
      parse_mode: 'Markdown',
      ...getMainMenu()
    }
  );
});

bot.command('id', async (ctx) => {
  await ctx.reply(
    `🆔 **Ваш ID в Telegram:**\n\n` +
    `ID: \`${ctx.from.id}\`\n` +
    `Имя: ${ctx.from.first_name || ''}\n` +
    `Username: @${ctx.from.username || 'нет'}\n\n` +
    `💡 Добавьте в .env как ADMIN_ID`,
    { parse_mode: 'Markdown' }
  );
});

// ============ АДМИН-КОМАНДЫ ============

bot.command('adminhelp', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ У вас нет прав доступа');
  
  await ctx.reply(
    `👑 **Админ-панель**\n\n` +
    `📊 **Статистика:**\n` +
    `/stats - общая статистика\n` +
    `/seats - занятость мест по курсам\n\n` +
    `📋 **Заявки:**\n` +
    `/orders - все заявки\n` +
    `/orders pending - ожидают оплаты\n` +
    `/orders paid - оплаченные\n` +
    `/orders no_show - не пришли\n` +
    `/order [ID] - информация по заявке\n\n` +
    `🔄 **Управление:**\n` +
    `/status [ID] [статус] - изменить статус\n` +
    `/reschedule [ID] [дата] [время] [причина] - перенести\n` +
    `/noshow [ID] [причина] - отметить "не пришёл"\n\n` +
    `📤 **Экспорт:**\n` +
    `/export - все заявки в файл`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('stats', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ У вас нет прав доступа');
  
  const stats = getStats();
  
  let message = 
    `📊 **Статистика заявок**\n\n` +
    `📋 Всего: ${stats.total}\n` +
    `👶 Детские: ${stats.kidsCount}\n` +
    `🧑 Взрослые: ${stats.adultsCount}\n\n` +
    `⏳ Ожидают оплаты: ${stats.pending}\n` +
    `✅ Оплачено: ${stats.paid}\n` +
    `📌 Подтверждено: ${stats.confirmed}\n` +
    `🔄 Перенесено: ${stats.rescheduled}\n` +
    `🚫 Не пришли: ${stats.noShow}\n` +
    `❌ Отменено: ${stats.cancelled}\n` +
    `🎉 Завершено: ${stats.completed}\n\n` +
    `💰 Выручка: ${stats.totalRevenue}₽\n\n` +
    `📈 **Популярные курсы:**\n`;
  
  if (Object.keys(stats.courseStats).length === 0) {
    message += `Пока нет записей`;
  } else {
    for (const [course, count] of Object.entries(stats.courseStats)) {
      message += `• ${course}: ${count} чел.\n`;
    }
  }
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('seats', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ У вас нет прав доступа');
  
  let message = `👥 **Занятость мест по курсам**\n\n`;
  
  message += `👶 **Детские группы:**\n`;
  for (const [key, course] of Object.entries(COURSES_KIDS)) {
    const occupied = getOccupiedSeats(key);
    const available = course.maxStudents - occupied;
    const emoji = available <= 0 ? '🔴' : available <= 3 ? '🟡' : '🟢';
    message += `${emoji} ${course.name}: ${occupied}/${course.maxStudents}\n`;
  }
  
  message += `\n🧑 **Взрослые группы:**\n`;
  for (const [key, course] of Object.entries(COURSES_ADULTS)) {
    const occupied = getOccupiedSeats(key);
    const available = course.maxStudents - occupied;
    const emoji = available <= 0 ? '🔴' : available <= 3 ? '🟡' : '🟢';
    message += `${emoji} ${course.name}: ${occupied}/${course.maxStudents}\n`;
  }
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('orders', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ У вас нет прав доступа');
  
  const args = ctx.message.text.split(' ');
  const statusFilter = args[1] || 'all';
  
  let filteredOrders = orders;
  let statusText = 'все';
  
  if (statusFilter !== 'all') {
    filteredOrders = orders.filter(o => o.status === statusFilter);
    statusText = ORDER_STATUS_TEXT[statusFilter] || statusFilter;
  }
  
  if (filteredOrders.length === 0) {
    return ctx.reply(`📋 Заявок со статусом "${statusText}" нет.`);
  }
  
  let message = `📋 **Заявки (${statusText})**: ${filteredOrders.length}\n\n`;
  
  const displayOrders = filteredOrders.slice(0, 10);
  displayOrders.forEach((order, index) => {
    message += `${index + 1}. ${formatOrderShort(order)}\n`;
  });
  
  if (filteredOrders.length > 10) {
    message += `\n... и еще ${filteredOrders.length - 10}`;
  }
  
  message += `\n\n💡 /order [ID] — детали`;
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.command('order', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ У вас нет прав доступа');
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('❌ Пример: /order 5');
  
  const orderId = parseInt(args[1]);
  const order = orders.find(o => o.id === orderId);
  
  if (!order) return ctx.reply(`❌ Заявка #${orderId} не найдена.`);
  
  const statusEmoji = ORDER_STATUS_EMOJI[order.status] || '❓';
  const statusText = ORDER_STATUS_TEXT[order.status] || order.status;
  const typeText = order.courseType === 'kids' ? '👶 Детская' : '🧑 Взрослая';
  
  let message =
    `📋 **Заявка ${order.orderNumber}** (ID: ${order.id})\n\n` +
    `🎯 Курс: ${order.course}\n` +
    `👥 Категория: ${typeText}\n` +
    `👤 Имя: ${order.name}\n` +
    `📱 Телефон: ${order.phone}\n` +
    `📅 День: ${order.date}\n` +
    `💰 Сумма: ${order.amount}₽\n` +
    `📌 Статус: ${statusEmoji} ${statusText}\n` +
    `🆔 Пользователь: ${order.userId}\n` +
    `📅 Создана: ${new Date(order.createdAt).toLocaleString('ru-RU')}\n`;
  
  if (order.paymentDate) {
    message += `💳 Оплачена: ${new Date(order.paymentDate).toLocaleString('ru-RU')}\n`;
  }
  
  if (order.history && order.history.length > 1) {
    message += `\n📜 **История:**\n`;
    order.history.slice(-5).forEach(h => {
      message += `• ${new Date(h.date).toLocaleString('ru-RU')}: ${h.action}${h.note ? ` (${h.note})` : ''}\n`;
    });
  }
  
  const buttons = [];
  
  if (order.status === ORDER_STATUS.PENDING) {
    buttons.push([Markup.button.callback('✅ Оплачено', `admin_paid_${order.id}`)]);
  }
  
  if (order.status === ORDER_STATUS.PAID) {
    buttons.push([Markup.button.callback('📌 Подтвердить', `admin_confirm_${order.id}`)]);
  }
  
  if (STATUSES_OCCUPYING_SEAT.includes(order.status)) {
    buttons.push([Markup.button.callback('🔄 Перенести', `admin_reschedule_${order.id}`)]);
    buttons.push([Markup.button.callback('🚫 Не пришёл', `admin_noshow_${order.id}`)]);
    buttons.push([Markup.button.callback('🎉 Завершено', `admin_complete_${order.id}`)]);
  }
  
  buttons.push([Markup.button.callback('❌ Отменить', `admin_cancel_${order.id}`)]);
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.command('status', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ У вас нет прав доступа');
  
  const args = ctx.message.text.split(' ');
  if (args.length < 3) {
    return ctx.reply(
      '❌ Пример: /status 5 paid\n\n' +
      'Статусы: pending, paid, confirmed, cancelled, completed, rescheduled, no_show'
    );
  }
  
  const orderId = parseInt(args[1]);
  const newStatus = args[2];
  
  if (!Object.values(ORDER_STATUS).includes(newStatus)) {
    return ctx.reply(`❌ Неверный статус: ${newStatus}`);
  }
  
  const order = orders.find(o => o.id === orderId);
  if (!order) return ctx.reply(`❌ Заявка #${orderId} не найдена.`);
  
  const oldStatus = order.status;
  updateOrderStatus(orderId, newStatus, `Изменено вручную: ${oldStatus} → ${newStatus}`);
  
  const statusEmoji = ORDER_STATUS_EMOJI[newStatus];
  await ctx.reply(
    `✅ **Заявка ${order.orderNumber} обновлена!**\n\n` +
    `📌 Новый статус: ${statusEmoji} ${ORDER_STATUS_TEXT[newStatus]}`,
    { parse_mode: 'Markdown' }
  );
  
  try {
    const userMessages = {
      [ORDER_STATUS.PAID]: '✅ Ваша оплата получена! Спасибо!',
      [ORDER_STATUS.CONFIRMED]: '📌 Ваша запись подтверждена! Ждем вас!',
      [ORDER_STATUS.CANCELLED]: '❌ Ваша запись отменена.',
      [ORDER_STATUS.COMPLETED]: '🎉 Курс завершен! Спасибо за участие!',
      [ORDER_STATUS.NO_SHOW]: '🚫 Вы были отмечены как не пришедшие на занятие.'
    };
    
    if (userMessages[newStatus]) {
      await bot.telegram.sendMessage(
        order.userId,
        `📨 **Обновление по заявке ${order.orderNumber}**\n\n${userMessages[newStatus]}`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (e) {
    console.log('Не удалось уведомить пользователя');
  }
});

bot.command('reschedule', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ У вас нет прав доступа');
  
  const args = ctx.message.text.split(' ');
  if (args.length < 4) {
    return ctx.reply(
      '❌ Пример: /reschedule 5 15.12 18:00 Клиент заболел\n\n' +
      'Формат: /reschedule [ID] [дата] [время] [причина]'
    );
  }
  
  const orderId = parseInt(args[1]);
  const newDate = args[2];
  const newTime = args[3];
  const reason = args.slice(4).join(' ') || 'Без причины';
  
  const order = orders.find(o => o.id === orderId);
  if (!order) return ctx.reply(`❌ Заявка #${orderId} не найдена.`);
  
  const oldDate = order.date;
  rescheduleOrder(orderId, newDate, newTime, reason);
  
  await ctx.reply(
    `🔄 **Заявка ${order.orderNumber} перенесена!**\n\n` +
    `📅 Было: ${oldDate}\n` +
    `📅 Стало: ${newDate}, ${newTime}\n` +
    `📝 Причина: ${reason}\n\n` +
    `ℹ️ Место на старом курсе освобождено и засчитано на новом.`,
    { parse_mode: 'Markdown' }
  );
  
  try {
    await bot.telegram.sendMessage(
      order.userId,
      `🔄 **Ваша запись перенесена!**\n\n` +
      `🎯 Курс: ${order.course}\n` +
      `📅 Новая дата: ${newDate}, ${newTime}\n` +
      `📝 Причина: ${reason}\n\n` +
      `📍 ${SCHOOL_INFO.address}\n` +
      `☎️ ${SCHOOL_INFO.phone}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    console.log('Не удалось уведомить пользователя');
  }
});

bot.command('noshow', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ У вас нет прав доступа');
  
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    return ctx.reply('❌ Пример: /noshow 5 Клиент не пришёл без предупреждения');
  }
  
  const orderId = parseInt(args[1]);
  const reason = args.slice(2).join(' ') || 'Без причины';
  
  const order = orders.find(o => o.id === orderId);
  if (!order) return ctx.reply(`❌ Заявка #${orderId} не найдена.`);
  
  markNoShow(orderId, reason);
  
  await ctx.reply(
    `🚫 **Заявка ${order.orderNumber}** отмечена как "Не пришёл"\n\n` +
    `📝 Причина: ${reason}\n\n` +
    `ℹ️ Место освобождено для других учеников.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('export', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ У вас нет прав доступа');
  
  if (orders.length === 0) return ctx.reply('📋 Нет заявок для экспорта.');
  
  let text = '📋 ЭКСПОРТ ЗАЯВОК\n';
  text += `Дата: ${new Date().toLocaleString('ru-RU')}\n`;
  text += `Всего: ${orders.length}\n`;
  text += `${'='.repeat(50)}\n\n`;
  
  orders.forEach((order, index) => {
    const statusEmoji = ORDER_STATUS_EMOJI[order.status] || '❓';
    const typeText = order.courseType === 'kids' ? 'Детская' : 'Взрослая';
    text += `${index + 1}. ${order.orderNumber} (ID: ${order.id})\n`;
    text += `   👤 ${order.name}\n`;
    text += `   🎯 ${order.course} [${typeText}]\n`;
    text += `   📱 ${order.phone}\n`;
    text += `   📅 ${order.date}\n`;
    text += `   💰 ${order.amount}₽\n`;
    text += `   📌 ${statusEmoji} ${ORDER_STATUS_TEXT[order.status]}\n`;
    text += `   📅 ${new Date(order.createdAt).toLocaleString('ru-RU')}\n`;
    
    if (order.history && order.history.length > 0) {
      text += `   📜 История:\n`;
      order.history.forEach(h => {
        text += `      • ${new Date(h.date).toLocaleString('ru-RU')}: ${h.action}\n`;
      });
    }
    text += '\n';
  });
  
  const filename = `orders_${Date.now()}.txt`;
  fs.writeFileSync(filename, text, 'utf8');
  
  await ctx.replyWithDocument(
    { source: filename },
    { caption: `📋 Экспорт заявок (${orders.length} шт.)` }
  );
  
  fs.unlinkSync(filename);
});

// ============ ОБРАБОТКА КНОПОК МЕНЮ ============

bot.hears(MENU_BUTTONS.kids, async (ctx) => {
  ctx.session.step = 'choose_course';
  ctx.session.courseType = 'kids';
  
  await ctx.reply(
    '👶 **Выберите детский курс:**',
    {
      parse_mode: 'Markdown',
      ...getCourseButtons(COURSES_KIDS)
    }
  );
});

bot.hears(MENU_BUTTONS.adults, async (ctx) => {
  ctx.session.step = 'choose_course';
  ctx.session.courseType = 'adults';
  
  await ctx.reply(
    '🧑 **Выберите взрослый курс:**',
    {
      parse_mode: 'Markdown',
      ...getCourseButtons(COURSES_ADULTS)
    }
  );
});

bot.hears(MENU_BUTTONS.info, async (ctx) => {
  await ctx.reply(
    generateInfo(),
    {
      parse_mode: 'Markdown',
      ...getMainMenu()
    }
  );
});

bot.hears(MENU_BUTTONS.askAdmin, async (ctx) => {
  ctx.session.step = 'ask_admin';
  
  await ctx.reply(
    generateAskAdmin(),
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel_question')]
      ])
    }
  );
});

bot.hears(MENU_BUTTONS.cancel, async (ctx) => {
  ctx.session = { step: 'choose_course' };
  await ctx.reply(
    '❌ **Запись отменена.**\n\nВыберите группу в меню.',
    {
      parse_mode: 'Markdown',
      ...getMainMenu()
    }
  );
});

// ============ ВЫБОР КУРСА ============

bot.action(/course_(.+)/, async (ctx) => {
  const courseKey = ctx.match[1];
  const course = COURSES_ALL[courseKey];
  
  if (!course) {
    await ctx.answerCbQuery('Курс не найден');
    return;
  }
  
  const available = getAvailableSeats(courseKey);
  if (available <= 0) {
    await ctx.answerCbQuery('❌ На этот курс нет свободных мест', { show_alert: true });
    return;
  }
  
  ctx.session.course = courseKey;
  ctx.session.step = 'enter_name';
  
  const occupied = getOccupiedSeats(courseKey);
  
  await ctx.editMessageText(
    generateCourseSelected(course, occupied),
    { parse_mode: 'Markdown' }
  );
  await ctx.answerCbQuery();
});

// ============ ВЫБОР ДНЯ НЕДЕЛИ ============

bot.action(/day_(.+)/, async (ctx) => {
  const day = ctx.match[1];
  
  if (!ctx.session || !ctx.session.course) {
    await ctx.answerCbQuery('Сессия истекла, начните заново');
    return;
  }
  
  ctx.session.date = day;
  ctx.session.step = 'confirm';
  
  await ctx.editMessageText(
    generateConfirm(ctx.session),
    {
      parse_mode: 'Markdown',
      ...getConfirmButtons()
    }
  );
  await ctx.answerCbQuery(`Выбран: ${day}`);
});

// ============ ОБРАБОТКА ТЕКСТА ============

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  
  if (text.startsWith('/')) return;
  
  const menuButtons = Object.values(MENU_BUTTONS);
  if (menuButtons.includes(text)) return;

  // Вопрос администратору
  if (ctx.session && ctx.session.step === 'ask_admin') {
    const userId = ctx.from.id;
    const username = ctx.from.username || 'нет';
    const firstName = ctx.from.first_name || 'Пользователь';
    
    const adminMessage = generateAdminNewQuestion(
      { id: userId, username, firstName },
      text
    );
    
    try {
      await bot.telegram.sendMessage(ADMIN_ID, adminMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ Ответить', callback_data: `reply_${userId}_${Date.now()}` }],
            [{ text: '✅ Решено', callback_data: `resolved_${userId}` }]
          ]
        }
      });
      
      ctx.session.step = 'choose_course';
      await ctx.reply(
        generateQuestionSent(),
        {
          parse_mode: 'Markdown',
          ...getMainMenu()
        }
      );
    } catch (error) {
      console.error('❌ Ошибка отправки админу:', error);
      await ctx.reply('❌ Ошибка. Попробуйте позже.', { ...getMainMenu() });
    }
    return;
  }

  // Админ отвечает на вопрос
  if (ctx.from.id === ADMIN_ID && ctx.session && ctx.session.step === 'admin_reply') {
    const userId = ctx.session.replyTo;
    const answer = text;
    
    try {
      await bot.telegram.sendMessage(
        userId,
        `📨 **Ответ от администратора:**\n\n${answer}\n\n` +
        `💡 Задайте вопрос снова через "${MENU_BUTTONS.askAdmin}"`,
        {
          parse_mode: 'Markdown',
          ...getMainMenu()
        }
      );
      
      await ctx.reply(`✅ Ответ отправлен!\n\n📝 ${answer}`);
    } catch (error) {
      await ctx.reply('❌ Не удалось отправить ответ.');
    }
    
    ctx.session.step = 'choose_course';
    return;
  }

  // Запись
  if (!ctx.session || ctx.session.step === 'choose_course') {
    await ctx.reply(
      `ℹ️ Выберите группу в меню, чтобы начать запись`,
      { ...getMainMenu() }
    );
    return;
  }

  switch (ctx.session.step) {
    case 'enter_name':
      ctx.session.name = text;
      ctx.session.step = 'enter_phone';
      
      await ctx.reply(
        `✅ Имя сохранено: **${text}**\n\n` +
        `📱 Введите ваш **номер телефона** (8XXXXXXXXXX):`,
        { parse_mode: 'Markdown' }
      );
      break;

    case 'enter_phone':
      const phoneRegex = /^8\d{10}$/;
      if (!phoneRegex.test(text)) {
        await ctx.reply(
          '❌ Неверный формат.\n\nВведите как **8XXXXXXXXXX** (11 цифр).\nПример: 89123456789',
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      ctx.session.phone = text;
      ctx.session.step = 'choose_day';
      
      // Показываем кнопки с доступными днями из расписания курса
      await ctx.reply(
        generateDaySelection(ctx.session.course),
        {
          parse_mode: 'Markdown',
          ...getDayButtons(ctx.session.course)
        }
      );
      break;

    default:
      await ctx.reply(`ℹ️ Выберите группу в меню`, { ...getMainMenu() });
  }
});

// ============ ПОДТВЕРЖДЕНИЕ ============

bot.action('confirm', async (ctx) => {
  const course = COURSES_ALL[ctx.session.course];
  const amount = course.price;
  const paymentData = `Оплата танцев: ${course.name}, ${ctx.session.name}`;
  
  const available = getAvailableSeats(ctx.session.course);
  if (available <= 0) {
    await ctx.answerCbQuery('❌ Мест больше нет', { show_alert: true });
    await ctx.editMessageText(
      '😔 К сожалению, места закончились, пока вы заполняли форму.\n\n' +
      'Попробуйте выбрать другой курс.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('👶 Детские группы', 'show_kids')],
          [Markup.button.callback('🧑 Взрослые группы', 'show_adults')]
        ])
      }
    );
    return;
  }
  
  try {
    const qrCodeUrl = await generateQRCode(paymentData);
    
    ctx.session.userId = ctx.from.id;
    ctx.session.username = ctx.from.username;
    
    const order = createOrder(ctx.session, course);
    
    const adminNotify = generateAdminNewOrder(ctx.session, course) + 
      `\n\n🆔 ID заявки: ${order.id}\n📋 ${order.orderNumber}`;
    
    await bot.telegram.sendMessage(ADMIN_ID, adminNotify, { parse_mode: 'Markdown' });
    
    await ctx.editMessageText(
      `✅ **Запись оформлена!**\n\n` +
      `📋 Заявка: ${order.orderNumber}\n` +
      `🎯 Курс: ${course.name}\n` +
      `📅 День: ${ctx.session.date}\n` +
      `💰 Сумма: ${amount}₽\n\n` +
      `💳 **Оплата через СБП**\n` +
      `Отсканируйте QR-код:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Я оплатил', 'paid')],
          [Markup.button.callback('❓ Вопрос', 'ask_question')],
          [Markup.button.callback('🔄 Заново', 'restart')]
        ])
      }
    );
    
    await ctx.replyWithPhoto(
      { source: Buffer.from(qrCodeUrl.split(',')[1], 'base64') },
      {
        caption: `💳 **Оплата: ${amount}₽**\n\n` +
                 `1️⃣ Откройте приложение банка\n` +
                 `2️⃣ "Оплата по QR-коду"\n` +
                 `3️⃣ Наведите на QR-код\n` +
                 `4️⃣ Подтвердите платёж\n\n` +
                 `После оплаты нажмите "✅ Я оплатил"`,
        parse_mode: 'Markdown'
      }
    );
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('❌ Ошибка:', error);
    await ctx.reply('❌ Ошибка. Попробуйте позже.', { ...getMainMenu() });
  }
});

bot.action('show_kids', async (ctx) => {
  await ctx.editMessageText(
    '👶 **Выберите детский курс:**',
    {
      parse_mode: 'Markdown',
      ...getCourseButtons(COURSES_KIDS)
    }
  );
  await ctx.answerCbQuery();
});

bot.action('show_adults', async (ctx) => {
  await ctx.editMessageText(
    '🧑 **Выберите взрослый курс:**',
    {
      parse_mode: 'Markdown',
      ...getCourseButtons(COURSES_ADULTS)
    }
  );
  await ctx.answerCbQuery();
});

// ============ ОСТАЛЬНЫЕ ОБРАБОТЧИКИ ============

bot.action('paid', async (ctx) => {
  const course = COURSES_ALL[ctx.session.course];
  
  const order = orders.find(o => 
    o.userId === ctx.from.id && 
    o.status === ORDER_STATUS.PENDING &&
    o.course === course.name
  );
  
  if (order) {
    updateOrderStatus(order.id, ORDER_STATUS.PAID, 'Оплата подтверждена пользователем', 'user');
    
    await bot.telegram.sendMessage(ADMIN_ID,
      `✅ **Оплата подтверждена!**\n\n` +
      `📋 ${order.orderNumber}\n` +
      `🎯 ${order.course}\n` +
      `👤 ${order.name}\n` +
      `📅 ${order.date}\n` +
      `💰 ${order.amount}₽`,
      { parse_mode: 'Markdown' }
    );
  }
  
  await ctx.editMessageText(
    `🎉 **Спасибо за оплату!**\n\n` +
    `Ваша запись на курс **"${course.name}"** подтверждена!\n\n` +
    `📅 День: ${ctx.session.date}\n` +
    `🕐 Время: ${course.schedule}\n` +
    `📍 ${SCHOOL_INFO.address}\n` +
    `☎️ ${SCHOOL_INFO.phone}\n\n` +
    `💪 До встречи!`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Новая запись', 'restart')]
      ])
    }
  );
  
  await ctx.answerCbQuery('✅ Оплата подтверждена!');
});

bot.action('ask_question', async (ctx) => {
  ctx.session.step = 'ask_admin';
  
  await ctx.editMessageText(
    '✍️ **Напишите ваш вопрос:**\n\nАдминистратор ответит в ближайшее время.',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel_question')]
      ])
    }
  );
  await ctx.answerCbQuery();
});

bot.action('cancel_question', async (ctx) => {
  ctx.session.step = 'choose_course';
  await ctx.editMessageText(
    '❌ Вопрос отменен.',
    { parse_mode: 'Markdown', ...getMainMenu() }
  );
  await ctx.answerCbQuery();
});

bot.action('change', async (ctx) => {
  ctx.session.step = 'enter_name';
  await ctx.editMessageText('✏️ Введите **имя и фамилию**:', { parse_mode: 'Markdown' });
  await ctx.answerCbQuery();
});

bot.action('cancel', async (ctx) => {
  ctx.session = { step: 'choose_course' };
  await ctx.editMessageText('❌ **Запись отменена.**', { parse_mode: 'Markdown' });
  await ctx.answerCbQuery();
});

bot.action('restart', async (ctx) => {
  ctx.session = { step: 'choose_course' };
  await ctx.editMessageText(
    '🔄 **Начинаем заново!**\n\nВыберите группу в меню.',
    { parse_mode: 'Markdown', ...getMainMenu() }
  );
  await ctx.answerCbQuery();
});

// ============ АДМИН: INLINE КНОПКИ ============

bot.action(/admin_paid_(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔ Нет прав');
  
  const orderId = parseInt(ctx.match[1]);
  const order = orders.find(o => o.id === orderId);
  if (!order) return ctx.answerCbQuery('❌ Не найдена');
  
  updateOrderStatus(orderId, ORDER_STATUS.PAID, 'Через админ-панель');
  await ctx.answerCbQuery('✅ Оплата подтверждена');
  await ctx.reply(`✅ Заявка ${order.orderNumber} — оплачена.`);
  
  try {
    await bot.telegram.sendMessage(order.userId,
      `✅ **Оплата получена!**\n\nКурс: **"${order.course}"**\n\n📍 ${SCHOOL_INFO.address}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
});

bot.action(/admin_confirm_(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔ Нет прав');
  
  const orderId = parseInt(ctx.match[1]);
  const order = orders.find(o => o.id === orderId);
  if (!order) return ctx.answerCbQuery('❌ Не найдена');
  
  updateOrderStatus(orderId, ORDER_STATUS.CONFIRMED, 'Через админ-панель');
  await ctx.answerCbQuery('📌 Подтверждено');
  await ctx.reply(`📌 Заявка ${order.orderNumber} подтверждена.`);
  
  try {
    await bot.telegram.sendMessage(order.userId,
      `📌 **Ваша запись подтверждена!**\n\nКурс: **"${order.course}"**\n📅 ${order.date}\n📍 ${SCHOOL_INFO.address}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
});

bot.action(/admin_cancel_(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔ Нет прав');
  
  const orderId = parseInt(ctx.match[1]);
  const order = orders.find(o => o.id === orderId);
  if (!order) return ctx.answerCbQuery('❌ Не найдена');
  
  updateOrderStatus(orderId, ORDER_STATUS.CANCELLED, 'Отмена через админ-панель');
  await ctx.answerCbQuery('❌ Отменено');
  await ctx.reply(`❌ Заявка ${order.orderNumber} отменена.\n\nℹ️ Место освобождено.`);
  
  try {
    await bot.telegram.sendMessage(order.userId,
      `❌ **Ваша запись отменена.**\n\n☎️ ${SCHOOL_INFO.phone}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}
});

bot.action(/admin_complete_(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔ Нет прав');
  
  const orderId = parseInt(ctx.match[1]);
  const order = orders.find(o => o.id === orderId);
  if (!order) return ctx.answerCbQuery('❌ Не найдена');
  
  updateOrderStatus(orderId, ORDER_STATUS.COMPLETED, 'Курс завершён');
  await ctx.answerCbQuery('🎉 Завершено');
  await ctx.reply(`🎉 Заявка ${order.orderNumber} завершена.`);
});

bot.action(/admin_noshow_(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔ Нет прав');
  
  const orderId = parseInt(ctx.match[1]);
  const order = orders.find(o => o.id === orderId);
  if (!order) return ctx.answerCbQuery('❌ Не найдена');
  
  markNoShow(orderId, 'Отмечено через админ-панель');
  await ctx.answerCbQuery('🚫 Отмечено');
  await ctx.reply(
    `🚫 Заявка ${order.orderNumber} — "Не пришёл".\n\n` +
    `ℹ️ Место освобождено.\n` +
    `💡 Перенести: /reschedule ${order.id} [дата] [время]`
  );
});

bot.action(/admin_reschedule_(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔ Нет прав');
  
  const orderId = parseInt(ctx.match[1]);
  const order = orders.find(o => o.id === orderId);
  if (!order) return ctx.answerCbQuery('❌ Не найдена');
  
  await ctx.answerCbQuery();
  await ctx.reply(
    `🔄 **Перенос заявки ${order.orderNumber}**\n\n` +
    `Текущая дата: ${order.date}\n\n` +
    `Используйте команду:\n` +
    `\`/reschedule ${order.id} [дата] [время] [причина]\`\n\n` +
    `Пример:\n` +
    `\`/reschedule ${order.id} 15.12 18:00 Клиент заболел\``,
    { parse_mode: 'Markdown' }
  );
});

// ============ ОТВЕТЫ АДМИНА ============

bot.action(/reply_(.+)_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет прав');
  
  const userId = parseInt(ctx.match[1]);
  ctx.session.replyTo = userId;
  ctx.session.step = 'admin_reply';
  
  await ctx.answerCbQuery('✏️ Введите ответ');
  await ctx.reply(
    `✍️ **Ответ для пользователя ID ${userId}:**`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Отменить', callback_data: 'cancel_reply' }]]
      }
    }
  );
});

bot.action('cancel_reply', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет прав');
  ctx.session.step = 'choose_course';
  await ctx.reply('❌ Ответ отменён.');
  await ctx.answerCbQuery();
});

bot.action(/resolved_(.+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('⛔ Нет прав');
  const userId = parseInt(ctx.match[1]);
  await ctx.answerCbQuery('✅ Отмечено');
  await ctx.reply(`✅ Вопрос пользователя ${userId} решён.`);
});

// ============ ЗАПУСК ============
console.log('💃 Бот для записи на танцы запускается...');
console.log(`👤 ID администратора: ${ADMIN_ID}`);
console.log(`👶 Детских курсов: ${Object.keys(COURSES_KIDS).length}`);
console.log(`🧑 Взрослых курсов: ${Object.keys(COURSES_ADULTS).length}`);
console.log(`📦 Загружено заявок: ${orders.length}`);
console.log(`🔢 Следующий номер заявки: ${orderCounter}`);

bot.launch()
  .then(() => console.log('✅ Бот успешно запущен!'))
  .catch((err) => console.error('❌ Ошибка запуска:', err));

process.once('SIGINT', () => {
  bot.stop('SIGINT');
  console.log('\n👋 Бот остановлен');
});

process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  saveOrders();
  saveCounter();
  console.log('💾 Данные сохранены');
});