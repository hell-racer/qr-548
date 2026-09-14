// Хранение данных в браузере (localStorage).
// Сохраняем: данные плательщика, список детей, список занятий, шаблон назначения,
// месяц/год, и какие занятия посещает каждый ребёнок.
//
// Структура хранимых данных (одна JSON-запись по ключу "payment-app"):
// {
//   payer: { lastName, docType, docNumber },
//   children: [
//     { id, fullName, className, lessonIds: { "<имя занятия>": true, ... } }
//   ],
//   template: "ПОУ, <ФИО>, <класс>, <занятие>, <период>",
//   month: "09", year: "2026",
//   lessons: [ { name, sum } ]
// }

(function (global) {
  'use strict';

  var STORAGE_KEY = 'payment-app';
  var NEXT_ID = 1;

  function defaultData() {
    return {
      payer: { lastName: '', docType: '', docNumber: '', inn: '' },
      children: [],
      template: window.APP_SETTINGS ? window.APP_SETTINGS.DefaultTemplate : '',
      month: currentMonth(),
      year: currentYear(),
      lessons: [] // пустой список по умолчанию; заполняется из config при первом запуске
    };
  }

  function currentMonth() {
    return pad2(new Date().getMonth() + 1); // 1..12
  }
  function currentYear() {
    return String(new Date().getFullYear());
  }
  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // Сгенерировать уникальный id для ребёнка.
  function nextId() {
    return 'c' + (Date.now().toString(36)) + '_' + (NEXT_ID++);
  }

  // Прочитать все данные (объединив с дефолтами).
  function load() {
    var d = defaultData();
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        d.payer = extend({}, d.payer, parsed.payer);

        // --- Миграция: старая модель `child` -> новая `children` ---
        if (Array.isArray(parsed.children) && parsed.children.length) {
          d.children = parsed.children.map(normalizeChild);
        } else if (parsed.child && parsed.child.fullName) {
          d.children = [{
            id: nextId(),
            fullName: parsed.child.fullName || '',
            className: parsed.child.className || '',
            lessonIds: toLessonIdMap(parsed.lessonIds || {})
          }];
        }

        if (typeof parsed.template === 'string') d.template = parsed.template;
        // Миграция старых токенов плейсхолдеров на новые.
        d.template = d.template
          .split('<ФИО ребенка>').join('<ФИО>')
          .split('<месяц, год>').join('<период>');
        if (parsed.month) d.month = parsed.month;
        if (parsed.year) d.year = parsed.year;
        if (Array.isArray(parsed.lessons) && parsed.lessons.length) d.lessons = parsed.lessons;
      }
    } catch (e) {
      // повреждённые данные игнорируем
    }
    return d;
  }

  function normalizeChild(c) {
    if (!c || typeof c !== 'object') c = {};
    return {
      id: c.id || nextId(),
      fullName: c.fullName || '',
      className: c.className || '',
      lessonIds: toLessonIdMap(c.lessonIds || {})
    };
  }

  // Помогает хранить lessonIds как мапу имён → true, с очисткой.
  function toLessonIdMap(obj) {
    var map = {};
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (var k in obj) {
        if (obj[k]) map[k] = true;
      }
    }
    return map;
  }

  function save(data) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // localStorage может быть недоступен (приватный режим и т.п.)
    }
  }

  function clear() {
    try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function hasData(data) {
    data = data || load();
    return !!(data.payer && data.payer.lastName && data.children && data.children.length &&
      data.children.some(function (ch) { return ch.fullName; }));
  }

  // простая "глубокая-но-неглубокая" склейка объектов
  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (src && typeof src === 'object') {
        for (var k in src) {
          if (src[k] !== undefined && src[k] !== '') target[k] = src[k];
        }
      }
    }
    return target;
  }

  // Русское название месяца по номеру (01..12).
  var MONTH_NAMES = ['', 'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

  function monthName(mm) {
    var n = parseInt(mm, 10);
    return MONTH_NAMES[n] || '';
  }

  global.paymentStore = {
    KEY: STORAGE_KEY,
    load: load,
    save: save,
    clear: clear,
    hasData: hasData,
    monthName: monthName,
    currentMonth: currentMonth,
    currentYear: currentYear,
    nextId: nextId
  };
})(window);