// ============ КОНФИГУРАЦИЯ БОТА ============
// ============ СТАТУСЫ ЗАЯВОК ============
const ORDER_STATUS = {
  PENDING: 'pending',      // Ожидает оплаты
  PAID: 'paid',           // Оплачено
  CONFIRMED: 'confirmed', // Подтверждено
  CANCELLED: 'cancelled', // Отменено
  COMPLETED: 'completed'  // Завершено
};

const ORDER_STATUS_EMOJI = {
  [ORDER_STATUS.PENDING]: '⏳',
  [ORDER_STATUS.PAID]: '✅',
  [ORDER_STATUS.CONFIRMED]: '📌',
  [ORDER_STATUS.CANCELLED]: '❌',
  [ORDER_STATUS.COMPLETED]: '🎉'
};

const ORDER_STATUS_TEXT = {
  [ORDER_STATUS.PENDING]: 'Ожидает оплаты',
  [ORDER_STATUS.PAID]: 'Оплачено',
  [ORDER_STATUS.CONFIRMED]: 'Подтверждено',
  [ORDER_STATUS.CANCELLED]: 'Отменено',
  [ORDER_STATUS.COMPLETED]: 'Завершено'
};

// ============ АДМИН-КОМАНДЫ ============
const ADMIN_COMMANDS = {
  stats: '/stats',
  orders: '/orders',
  order: '/order',
  status: '/status',
  help: '/adminhelp',
  export: '/export'
};

// Основная информация о школе
const SCHOOL_INFO = {
  name: 'Танцующий город',
  address: 'ул. Танцевальная, д. 15',
  phone: '+7 (999) 123-45-67',
  phoneRaw: '89991234567', // Для кнопки звонка
  email: 'dance@example.com',
  website: 'https://dance-school.ru',
  workHours: '09:00 - 22:00',
  social: {
    instagram: 'https://instagram.com/dance_school',
    telegram: 'https://t.me/dance_school',
    vk: 'https://vk.com/dance_school'
  }
};

// ============ КУРСЫ ТАНЦЕВ ============
const COURSES = {
  'hip_hop': {
    id: 'hip_hop',
    name: '🕺 Hip-Hop',
    price: 1500,
    duration: '60 мин',
    schedule: 'Пн/Ср 18:00-19:00',
    description: 'Энергичный уличный танец. Подходит для начинающих.',
    level: 'Начинающий',
    maxStudents: 15,
    currentStudents: 8,
    image: null // Можно добавить URL картинки
  },
  'ballet': {
    id: 'ballet',
    name: '🩰 Балет',
    price: 2000,
    duration: '90 мин',
    schedule: 'Вт/Чт 19:00-20:30',
    description: 'Классический балет. Развивает грацию и осанку.',
    level: 'Средний',
    maxStudents: 12,
    currentStudents: 10,
    image: null
  },
  'salsa': {
    id: 'salsa',
    name: '💃 Сальса',
    price: 1700,
    duration: '60 мин',
    schedule: 'Пт 20:00-21:00, Сб 16:00-17:00',
    description: 'Латинские ритмы. Идеально для пар.',
    level: 'Начинающий',
    maxStudents: 20,
    currentStudents: 14,
    image: null
  },
  'modern': {
    id: 'modern',
    name: '✨ Современный танец',
    price: 1800,
    duration: '75 мин',
    schedule: 'Ср/Пт 20:00-21:15',
    description: 'Современная хореография. Для всех уровней.',
    level: 'Любой',
    maxStudents: 15,
    currentStudents: 6,
    image: null
  },
  'stretching': {
    id: 'stretching',
    name: '🧘‍♀️ Стретчинг',
    price: 1200,
    duration: '45 мин',
    schedule: 'Пн/Ср/Пт 09:00-09:45',
    description: 'Растяжка и гибкость. Подготовка к танцам.',
    level: 'Начинающий',
    maxStudents: 10,
    currentStudents: 5,
    image: null
  }
};

// ============ КНОПКИ МЕНЮ ============
const MENU_BUTTONS = {
  signup: '💃 Записаться',
  courses: '📋 Курсы',
  info: 'ℹ️ Информация',
  askAdmin: '❓ Вопрос администратору',
  cancel: '❌ Отменить запись'
};

// ============ СООБЩЕНИЯ ============
const MESSAGES = {
  welcome: (name) => 
    `💃 **Добро пожаловать в школу танцев "${SCHOOL_INFO.name}"!**\n\n` +
    `Я помогу вам записаться на занятия.\n\n` +
    `📌 Если у вас возникнут вопросы, вы можете задать их администратору через кнопку "${MENU_BUTTONS.askAdmin}" в меню.\n\n` +
    `Выберите действие в меню ниже 👇`,

  courseList: () => {
    let message = '📋 **Доступные курсы:**\n\n';
    for (const [key, course] of Object.entries(COURSES)) {
      message += `**${course.name}**\n`;
      message += `💰 ${course.price}₽ | ⏱ ${course.duration}\n`;
      message += `📅 ${course.schedule}\n`;
      message += `${course.description}\n`;
      message += `🎯 Уровень: ${course.level}\n`;
      message += `👥 Свободно: ${course.maxStudents - course.currentStudents} мест\n\n`;
    }
    message += 'Для записи нажмите кнопку "💃 Записаться" в меню';
    return message;
  },

  info: () =>
    `🏫 **Школа танцев "${SCHOOL_INFO.name}"**\n\n` +
    `📍 Адрес: ${SCHOOL_INFO.address}\n` +
    `☎️ Телефон: ${SCHOOL_INFO.phone}\n` +
    `📧 Email: ${SCHOOL_INFO.email}\n` +
    `🌐 Сайт: ${SCHOOL_INFO.website}\n` +
    `🕐 Режим работы: ${SCHOOL_INFO.workHours}\n\n` +
    `💃 Направления:\n` +
    Object.values(COURSES).map(c => `• ${c.name}`).join('\n') + '\n\n' +
    `📌 По всем вопросам обращайтесь к администратору через кнопку "${MENU_BUTTONS.askAdmin}"`,

  courseSelected: (course) =>
    `✅ Вы выбрали курс: **${course.name}**\n\n` +
    `📖 ${course.description}\n` +
    `💰 Цена: ${course.price}₽\n` +
    `⏱ Длительность: ${course.duration}\n` +
    `📅 Расписание: ${course.schedule}\n` +
    `🎯 Уровень: ${course.level}\n` +
    `👥 Свободно: ${course.maxStudents - course.currentStudents} мест\n\n` +
    `✍️ Введите ваше **имя и фамилию** для записи:`,

  confirm: (session) => {
    const course = COURSES[session.course];
    return `📋 **Проверьте данные записи:**\n\n` +
      `🎯 Курс: ${course.name}\n` +
      `👤 Имя: ${session.name}\n` +
      `📱 Телефон: ${session.phone}\n` +
      `📅 Дни: ${session.date}\n` +
      `💰 Сумма: ${course.price}₽\n\n` +
      `✅ Всё верно?`;
  },

  payment: (course, amount) =>
    `✅ **Запись оформлена!**\n\n` +
    `📋 Данные записи:\n` +
    `🎯 Курс: ${course.name}\n` +
    `💰 Сумма к оплате: ${amount}₽\n\n` +
    `💳 **Оплата через СБП**\n` +
    `Отсканируйте QR-код для оплаты:`,

  paymentSuccess: (course) =>
    `🎉 **Спасибо за оплату!**\n\n` +
    `Ваша запись на курс **"${course.name}"** подтверждена!\n\n` +
    `📅 Ждем вас по расписанию:\n` +
    `${course.schedule}\n\n` +
    `📍 ${SCHOOL_INFO.address}\n` +
    `☎️ ${SCHOOL_INFO.phone}\n\n` +
    `💪 До встречи на занятиях!`,

  askAdmin: () =>
    `👤 **Связь с администратором**\n\n` +
    `Напишите ваш вопрос, и я передам его администратору.\n\n` +
    `📌 Что можно спросить:\n` +
    `• Уточнить расписание\n` +
    `• Задать вопрос по оплате\n` +
    `• Узнать о наличии мест\n` +
    `• Любые другие вопросы\n\n` +
    `✍️ Напишите ваш вопрос одним сообщением:`,

  questionSent: () =>
    `✅ **Ваш вопрос отправлен администратору!**\n\n` +
    `Администратор свяжется с вами в ближайшее время.\n\n` +
    `📌 Если вопрос срочный, позвоните по телефону:\n` +
    `${SCHOOL_INFO.phone}`,

  adminNewQuestion: (user, question) =>
    `📨 **Новый вопрос от пользователя!**\n\n` +
    `👤 Имя: ${user.firstName}\n` +
    `🆔 ID: \`${user.id}\`\n` +
    `📱 Username: @${user.username || 'нет'}\n\n` +
    `❓ **Вопрос:**\n${question}\n\n` +
    `💡 Чтобы ответить, нажмите "Ответить" на это сообщение.`,

  adminNewOrder: (session, course) =>
    `🆕 **Новая запись!**\n\n` +
    `🎯 Курс: ${course.name}\n` +
    `👤 Имя: ${session.name}\n` +
    `📱 Телефон: ${session.phone}\n` +
    `📅 Дни: ${session.date}\n` +
    `💰 Сумма: ${course.price}₽\n` +
    `🆔 Пользователь: ${session.userId}\n` +
    `📱 Username: @${session.username || 'нет'}\n\n` +
    `⏳ Ожидает оплаты`
};

// ============ QR КОД ============
const QR_CONFIG = {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 300,
  color: {
    dark: '#000000',
    light: '#ffffff'
  }
};

// ============ ЭКСПОРТ ============
module.exports = {
  SCHOOL_INFO,
  COURSES,
  MENU_BUTTONS,
  MESSAGES,
  QR_CONFIG,
  ORDER_STATUS,
  ORDER_STATUS_EMOJI,
  ORDER_STATUS_TEXT,
  ADMIN_COMMANDS
};