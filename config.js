// ============ СТАТУСЫ ЗАЯВОК ============
const ORDER_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  RESCHEDULED: 'rescheduled',
  NO_SHOW: 'no_show'
};

const ORDER_STATUS_EMOJI = {
  [ORDER_STATUS.PENDING]: '⏳',
  [ORDER_STATUS.PAID]: '✅',
  [ORDER_STATUS.CONFIRMED]: '📌',
  [ORDER_STATUS.CANCELLED]: '❌',
  [ORDER_STATUS.COMPLETED]: '🎉',
  [ORDER_STATUS.RESCHEDULED]: '🔄',
  [ORDER_STATUS.NO_SHOW]: '🚫'
};

const ORDER_STATUS_TEXT = {
  [ORDER_STATUS.PENDING]: 'Ожидает оплаты',
  [ORDER_STATUS.PAID]: 'Оплачено',
  [ORDER_STATUS.CONFIRMED]: 'Подтверждено',
  [ORDER_STATUS.CANCELLED]: 'Отменено',
  [ORDER_STATUS.COMPLETED]: 'Завершено',
  [ORDER_STATUS.RESCHEDULED]: 'Перенесено',
  [ORDER_STATUS.NO_SHOW]: 'Не пришёл'
};

const STATUSES_OCCUPYING_SEAT = [
  ORDER_STATUS.PAID,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.COMPLETED
];

const ADMIN_COMMANDS = {
  stats: '/stats',
  orders: '/orders',
  order: '/order',
  status: '/status',
  reschedule: '/reschedule',
  noshow: '/noshow',
  help: '/adminhelp',
  export: '/export',
  seats: '/seats'
};

// ============ ИНФОРМАЦИЯ О ШКОЛЕ ============
const SCHOOL_INFO = {
  name: 'Танцы Авеню',
  address: 'Выборгское ш., 15 (этаж 2)',
  phone: '+7 (996) 783-74-11',
  phoneRaw: '89967837411',
  email: 'danceavenue15@mail.ru',
  website: 'https://davenue.ru/',
  workHours: 'пн-пт 15:00 - 22:00, сб 12:00-19:00',
  social: {
    instagram: 'https://www.instagram.com/dance__avenue',
    telegram: 'https://t.me/danceavenuenew',
    vk: 'https://vk.ru/dance_avenue1'
  }
};

// ============ ПАРСЕР ДНЕЙ ИЗ РАСПИСАНИЯ ============
// Преобразует сокращения дней в полные названия
const DAY_NAMES = {
  'пн': 'Понедельник',
  'вт': 'Вторник',
  'ср': 'Среда',
  'чт': 'Четверг',
  'пт': 'Пятница',
  'сб': 'Суббота',
  'вс': 'Воскресенье'
};

// Извлекает список дней из строки расписания
// Пример: "пн/ср 17:00-18:00, пт 16:30-18:00" → ['Понедельник', 'Среда', 'Пятница']
function parseDaysFromSchedule(schedule) {
  if (!schedule) return [];
  
  const days = new Set();
  const lower = schedule.toLowerCase();
  
  // Ищем все сокращения дней в строке
  for (const [short, full] of Object.entries(DAY_NAMES)) {
    if (lower.includes(short)) {
      days.add(full);
    }
  }
  
  return Array.from(days);
}

// ============ КУРСЫ ДЛЯ ДЕТЕЙ ============
const COURSES_KIDS = {
  'Хип-хоп 8-11': {
    id: 'Хип-хоп 8-11',
    name: 'Хип-хоп 8-11',
    price: 900,
    duration: '60 мин',
    schedule: 'вт/чт 17:00-18:30',
    description: 'Энергичный уличный танец. Подходит для начинающих.',
    level: 'Начинающий',
    maxStudents: 15
  },
  'Хип-хоп 12+': {
    id: 'Хип-хоп 12+',
    name: 'Хип-хоп 12+',
    price: 900,
    duration: '60 мин',
    schedule: 'Вт/Чт 18:30-20:00',
    description: 'Энергичный уличный танец. Подходит для начинающих.',
    level: 'Начинающий',
    maxStudents: 15
  },
  'Модерн 4-5': {
    id: 'Модерн 4-5',
    name: 'Модерн 4-5',
    price: 900,
    duration: '60 мин',
    schedule: 'вт/чт 16:00-17:00',
    description: 'Современная хореография. Для всех уровней.',
    level: 'Начинающий',
    maxStudents: 10
  },
  'Модерн 6-8': {
    id: 'Модерн 6-8',
    name: 'Модерн 6-8',
    price: 900,
    duration: '60 мин',
    schedule: 'вт/чт 17:00-18:00',
    description: 'Современная хореография. Для всех уровней.',
    level: 'Начинающий',
    maxStudents: 10
  },
  'Модерн 9-14': {
    id: 'Модерн 9-14',
    name: 'Модерн 9-14',
    price: 900,
    duration: '60 мин',
    schedule: 'сб 13:00-14:00',
    description: 'Современная хореография. Для всех уровней.',
    level: 'Начинающий',
    maxStudents: 10
  },
  'К-поп 13+ Новички': {
    id: 'К-поп 13+ Новички',
    name: 'К-поп 13+ Новички',
    price: 900,
    duration: '120 мин',   // ← ИЗМЕНЕНО: было 60 мин
    schedule: 'пт 19:00-21:00',
    description: 'Корейская хореография. Для начинающего уровня.',
    level: 'Начинающий',
    maxStudents: 10
  },
  'К-поп 13+ Продолжающие': {
    id: 'К-поп 13+ Продолжающие',
    name: 'К-поп 13+ Продолжающие',
    price: 900,
    duration: '120 мин',   // ← ИЗМЕНЕНО: было 60 мин
    schedule: 'сб 17:00-19:00',
    description: 'Корейская хореография. Для тех кто раньше уже занимался.',
    level: 'Продолжающие',
    maxStudents: 10
  },
  'Акробатика 7+': {
    id: 'Акробатика 7+',
    name: 'Акробатика 7+',
    price: 900,
    duration: '60 мин',
    schedule: 'сб 13:00-14:00',
    description: 'Акробатические занятия для развития координации и ловкости.',
    level: 'Начинающие',
    maxStudents: 10
  },
  'Контемпорари 9+': {
    id: 'Контемпорари 9+',
    name: 'Контемпорари 9+',
    price: 900,
    duration: '60 мин',
    schedule: 'вт/чт 18:00-19:00',
    description: 'Современная но плавная хореография с классической базой.',
    level: 'Начинающие',
    maxStudents: 10
  },
  'Брейк данс 5-7': {
    id: 'Брейк данс 5-7',
    name: 'Брейк данс 5-7',
    price: 900,
    duration: '60 мин',
    schedule: 'пн/ср 17:00-18:00, пт 16:30-18:00',
    description: 'Импровизация и способности тела против гравитации.',
    level: 'Начинающие',
    maxStudents: 10
  },
  'Брейк данс 7-10': {
    id: 'Брейк данс 7-10',
    name: 'Брейк данс 7-10',
    price: 900,
    duration: '60 мин',
    schedule: 'пн/ср 18:00-19:00, пт 16:30-18:00',
    description: 'Импровизация и способности тела против гравитации.',
    level: 'Продолжающие',
    maxStudents: 10
  },
  'Джаз-фанк 12+': {
    id: 'Джаз-фанк 12+',
    name: 'Джаз-фанк 12+',
    price: 900,
    duration: '60 мин',
    schedule: 'сб 14:00-16:00',
    description: 'Дерзкий, ритмичный но при этом женственный танец.',
    level: 'Продолжающие',
    maxStudents: 10
  },
  'Джаз-фанк 13-17 Новички': {
    id: 'Джаз-фанк 13-17 Новички',
    name: 'Джаз-фанк 13-17 Новички',
    price: 900,
    duration: '60 мин',
    schedule: 'пт 19:00-20:00',
    description: 'Дерзкий, ритмичный но при этом женственный танец. Для новичков.',
    level: 'Начинающие',
    maxStudents: 10
  },
  'Джаз-фанк 13-17 Продолжающие': {
    id: 'Джаз-фанк 13-17 Продолжающие',
    name: 'Джаз-фанк 13-17 Продолжающие',
    price: 900,
    duration: '90 мин',
    schedule: 'пн/ср 19:30-21:00',
    description: 'Дерзкий, ритмичный но при этом женственный танец. Для продолжающих.',
    level: 'Продолжающие',
    maxStudents: 15
  },
  'Джаз-фанк 8-12 Продолжающие': {
    id: 'Джаз-фанк 8-12 Продолжающие',
    name: 'Джаз-фанк 8-12 Продолжающие',
    price: 900,
    duration: '90 мин',
    schedule: 'пн/ср 18:00-19:30',
    description: 'Дерзкий, ритмичный но при этом женственный танец. Для продолжающих.',
    level: 'Продолжающие',
    maxStudents: 15
  },
  'Джаз-фанк 8-12 Новички': {
    id: 'Джаз-фанк 8-12 Новички',
    name: 'Джаз-фанк 8-12 Новички',
    price: 900,
    duration: '60 мин',
    schedule: 'пт 18:00-19:00',
    description: 'Дерзкий, ритмичный но при этом женственный танец. Для новичков.',
    level: 'Начинающие',
    maxStudents: 10
  },
  'Стрит шоу 5-7 Продолжающие': {
    id: 'Стрит шоу 5-7 Продолжающие',
    name: 'Стрит шоу 5-7 Продолжающие',
    price: 900,
    duration: '60 мин',
    schedule: 'пн/ср/пт 17:00-18:00',
    description: 'Зрелищный командный танцевальный стиль. Для продолжающих.',
    level: 'Продолжающие',
    maxStudents: 15
  }
};

// ============ КУРСЫ ДЛЯ ВЗРОСЛЫХ ============
const COURSES_ADULTS = {
  'Леди микс 16+': {
    id: 'Леди микс 16+',
    name: 'Леди микс 16+',
    price: 900,
    duration: '60 мин',
    schedule: 'вт/чт 19:00-20:00',
    description: 'Женственное направление направленное на развитие пластики и харизмы.',
    level: 'Начинающий',
    maxStudents: 15
  },
  'Растяжка 16+': {
    id: 'Растяжка 16+',
    name: 'Растяжка 16+',
    price: 900,
    duration: '60 мин',
    schedule: 'Вт/Чт 20:00-21:00',
    description: 'Занятия направлены на расслабление мышц и снятие усталости.',
    level: 'Начинающий',
    maxStudents: 10
  },
  'Соло латина 16+': {
    id: 'Соло латина 16+',
    name: 'Соло латина 16+',
    price: 900,
    duration: '60 мин',
    schedule: 'Вт/Чт 21:00-22:00',
    description: 'Энергичный сольный танец с латиноамериканскими ритмами.',
    level: 'Начинающий',
    maxStudents: 10
  },
  'Герли хорео 16+': {
    id: 'Герли хорео 16+',
    name: 'Герли хорео 16+',
    price: 900,
    duration: '60 мин',
    schedule: 'пн 20:00-21:00, сб 12:00-13:00',
    description: 'Женственный стиль для девушек с характером.',
    level: 'Начинающий',
    maxStudents: 10
  },
  'Джаз-фанк 18+ Новички (ср/пт)': {
    id: 'Джаз-фанк 18+ Новички (ср/пт)',
    name: 'Джаз-фанк 18+ Новички',
    price: 900,
    duration: '60 мин',
    schedule: 'ср 21:00-22:00, пт 20:00-21:00',
    description: 'Дерзкий, ритмичный но при этом женственный танец. Для новичков.',
    level: 'Начинающие',
    maxStudents: 10
  },
  'Йога 16+': {
    id: 'Йога 16+',
    name: 'Йога 16+',
    price: 900,
    duration: '60 мин',
    schedule: 'чт/сб 9:00-10:15',
    description: 'Практики направленные на обретение гармонии тела и духа.',
    level: 'Начинающий',
    maxStudents: 10
  },
  'Зумба 16+': {
    id: 'Зумба 16+',
    name: 'Зумба 16+',
    price: 900,
    duration: '60 мин',
    schedule: 'ср 19:00-20:00, сб 15:00-16:00',
    description: 'Энергичная танцевальная тренировка для поддержания тонуса тела.',
    level: 'Начинающий',
    maxStudents: 10
  },
  'Хай Хиллс 18+ (пн/сб)': {
    id: 'Хай Хиллс 18+ (пн/сб)',
    name: 'Хай Хиллс 18+',
    price: 900,
    duration: '60 мин',
    schedule: 'пн 21:00-22:00, сб 13:00-14:00',
    description: 'Грациозный танец на каблуках развивающий гибкость и женственность.',
    level: 'Начинающий',
    maxStudents: 10
  },
  'Джаз-фанк 18+ Новички (ср/сб)': {
    id: 'Джаз-фанк 18+ Новички (ср/сб)',
    name: 'Джаз-фанк 18+ Новички',
    price: 900,
    duration: '60 мин',
    schedule: 'ср 20:00-21:00, сб 17:00-18:00',
    description: 'Дерзкий, ритмичный но при этом женственный танец. Для новичков.',
    level: 'Начинающие',
    maxStudents: 10
  },
  'Хай Хиллс 18+ (ср/сб)': {
    id: 'Хай Хиллс 18+ (ср/сб)',
    name: 'Хай Хиллс 18+',
    price: 900,
    duration: '60 мин',
    schedule: 'ср 21:00-22:00, сб 16:00-17:00',
    description: 'Грациозный танец на каблуках развивающий гибкость и женственность.',
    level: 'Начинающий',
    maxStudents: 10
  }
};

// Объединённый список
const COURSES_ALL = { ...COURSES_KIDS, ...COURSES_ADULTS };

// ============ КНОПКИ МЕНЮ ============
const MENU_BUTTONS = {
  kids: '👶 Детские группы',
  adults: '🧑 Взрослые группы',
  info: 'ℹ️ Информация',
  askAdmin: '❓ Вопрос администратору',
  cancel: '❌ Отменить запись'
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
  COURSES_KIDS,
  COURSES_ADULTS,
  COURSES_ALL,
  MENU_BUTTONS,
  QR_CONFIG,
  ORDER_STATUS,
  ORDER_STATUS_EMOJI,
  ORDER_STATUS_TEXT,
  STATUSES_OCCUPYING_SEAT,
  ADMIN_COMMANDS,
  DAY_NAMES,
  parseDaysFromSchedule
};