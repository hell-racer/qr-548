// Автотест генератора QR-кода (запуск: node test/test.js)
//
// Проверяет реальную логику (config.js, gost.js, vendor/qrcode.umd.js):
// строка ГОСТ Р 56042-2014 собирается корректно, а QR-код создаётся
// с компактной выбором версии (как на sbqr.ru) и без переполнения.

'use strict';

var fs = require('fs');
var vm = require('vm');
var util = require('util');

// Загружаем UMD-бандл qrcode (vendor/qrcode.umd.js) в изолированный контекст,
// имитируя браузерный скоп. Глобальная переменная QRLib становится доступной.
var code = fs.readFileSync(require.resolve('../vendor/qrcode.umd.js'), 'utf8');
var sandbox = {
  console: console,
  TextEncoder: (typeof TextEncoder !== 'undefined') ? TextEncoder : util.TextEncoder,
  navigator: { userAgent: 'node-test' }
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'qrcode.umd.js' });
var QRLib = sandbox.QRLib;

global.window = {};
require('../js/config.js');
require('../js/gost.js');

// Подключим storage.js с фейковым localStorage для проверки сохранения.
var lsStore = {};
global.window.localStorage = {
  getItem: function (k) { return lsStore[k] !== undefined ? lsStore[k] : null; },
  setItem: function (k, v) { lsStore[k] = String(v); },
  removeItem: function (k) { delete lsStore[k]; }
};
require('../js/storage.js');

// Реальные и средние сценарии + эталон sbqr.
var tests = [
  { name: 'эталон sbqr (с payer)', purpose: 'Назначение 1', sum: '1500', payer: { lastName: 'Крылов Владимир Георгиевич', payerAddress: 'Ореховый проезд' } },
  { name: 'короткое назначение', purpose: 'Оплата за питание', sum: '1500' },
  { name: 'среднее назначение', purpose: 'ПОУ, Крылова О.В., 6 "О", Создание инженерных систем на базе модульных конструкторов, сентябрь 2026', sum: '1234.56' },
  { name: 'без суммы', purpose: 'Оплата за питание', sum: '' },
  { name: 'нечисловая сумма', purpose: 'Питание', sum: 'abc' }
];

var levels = ['L', 'M', 'Q', 'H'];

var passed = 0, failed = 0;

function utf8len(str) {
  var n = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    n += c > 0x7ff ? 3 : (c > 0x7f ? 2 : 1);
  }
  return n;
}

tests.forEach(function (t) {
  var gost = window.buildGost.buildGostString(t.purpose, t.sum, t.payer);
  var bytes = utf8len(gost);

  var levelResults = [];
  var lOk = false;
  levels.forEach(function (name) {
    try {
      var qr = QRLib.create(gost, { errorCorrectionLevel: name });
      levelResults.push(name + ':OK(v' + qr.version + ', ' + qr.modules.size + 'x' + qr.modules.size + ')');
      if (name === 'M') lOk = true;
    } catch (e) {
      levelResults.push(name + ':FAIL(' + (e.message || e) + ')');
    }
  });

  // проверяем, что начинает распознаваться строка целиком с полей CBC/OKTMO/Name
  var hasCbc = gost.indexOf('CBC=00000000000131131022') !== -1;
  var hasOkTmo = gost.indexOf('OKTMO=') !== -1;
  var hasName = gost.indexOf('Name=Департамент') !== -1;

  var allOk = lOk && hasCbc && hasOkTmo && hasName;
  if (allOk) passed++; else failed++;

  console.log((allOk ? 'PASS' : 'FAIL') + ' | ' + t.name + ' | utf8=' + bytes + ' | ' + levelResults.join(' ') + ' | cbc=' + (hasCbc ? 'y' : 'n') + ' oktmo=' + (hasOkTmo ? 'y' : 'n'));
});

// Проверка, что эталонная строка (как на sbqr.ru) собирается идентично по структуре.
(function () {
  var a = window.buildGost.buildGostString('Назначение 1', '1500', {
    lastName: 'Крылов Владимир Георгиевич',
    payerAddress: 'Ореховый проезд',
    docType: 'Паспорт РФ',
    docNumber: '12 34 567890',
    inn: '773702700000'
  });
  var ok = a.indexOf('|PayerIdType=Паспорт РФ|PayerIdNum=1234567890|PayerINN=773702700000|Purpose=') > 0 &&
    a.indexOf('ST00012|') === 0 &&
    a.indexOf('CorrespAcc=40102810545370000003|') > 0 &&
    a.indexOf('|CBC=00000000000131131022|OKTMO=0|Sum=150000') > 0;
  if (ok) { passed++; console.log('PASS | структура эталонной строки (CBC в конце, порядок полей)'); }
  else { failed++; console.log('FAIL | структура эталонной строки (ожидали CBC/OKTMO/Sum в конце)'); }
})();

console.log('');
// Проверка подстановки плейсхолдеров в шаблон назначения.
(function () {
  var filled = window.buildGost.fillTemplate('ПОУ, <ФИО>, <класс>, <занятие>, <период>', {
    child: { fullName: 'Крылов Артём', className: '5 "Б"' },
    lesson: 'Робототехника',
    month: '09',
    year: '2026',
    monthName: 'сентябрь'
  });
  var expected = 'ПОУ, Крылов Артём, 5 "Б", Робототехника, сентябрь 2026';
  if (filled === expected) {
    passed++; console.log('PASS | подстановка шаблона: ' + filled);
  } else {
    failed++; console.log('FAIL | подстановка шаблона. Ожидали: "' + expected + '" получили: "' + filled + '"');
  }
})();

// Проверка сохранения данных через paymentStore в localStorage (как в браузере).
(function () {
  window.paymentStore.save({
    payer: { lastName: 'Крылова', docType: 'Паспорт', docNumber: '1111' },
    children: [
      { id: 'x1', fullName: 'Крылов Артём', className: '5 "Б"', lessonIds: { 'Робототехника': true } },
      { id: 'x2', fullName: 'Крылова Алиса', className: '7 "А"', lessonIds: {} }
    ],
    template: 'ПОУ, <ФИО>, <класс>, <занятие>, <период>',
    month: '09', year: '2026',
    lessons: [{ name: 'Робототехника', sum: '1500' }]
  });
  var loaded = window.paymentStore.load();
  var ok = loaded.payer.lastName === 'Крылова' &&
    loaded.children.length === 2 &&
    loaded.children[0].fullName === 'Крылов Артём' &&
    loaded.children[0].lessonIds['Робототехника'] === true &&
    loaded.month === '09' && loaded.year === '2026' && loaded.lessons.length === 1;
  if (ok) { passed++; console.log('PASS | paymentStore: сохранение и чтение нескольких детей'); }
  else { failed++; console.log('FAIL | paymentStore: данные детей не сохранились/прочитались'); }
})();

// Проверка миграции старой модели `child` -> `children`.
(function () {
  window.localStorage.setItem('payment-app', JSON.stringify({
    payer: { lastName: 'Иванова' },
    child: { fullName: 'Иванов Пётр', className: '3 "В"' },
    template: 'ПОУ, <ФИО>, <класс>, <занятие>, <период>',
    month: '01', year: '2020',
    lessons: []
  }));
  var loaded = window.paymentStore.load();
  var ok = loaded.children &&
    loaded.children.length === 1 &&
    loaded.children[0].fullName === 'Иванов Пётр' &&
    loaded.children[0].className === '3 "В"';
  if (ok) { passed++; console.log('PASS | миграция child -> children'); }
  else { failed++; console.log('FAIL | миграция child -> children'); }
})();

// Проверка миграции старых токенов шаблона на новые.
(function () {
  window.localStorage.setItem('payment-app', JSON.stringify({ template: 'ПОУ, <ФИО ребенка>, <класс>, <занятие>, <месяц, год>', month: '01', year: '2020' }));
  var loaded = window.paymentStore.load();
  var ok = loaded.template === 'ПОУ, <ФИО>, <класс>, <занятие>, <период>';
  if (ok) { passed++; console.log('PASS | миграция токенов шаблона'); }
  else { failed++; console.log('FAIL | миграция токенов шаблона: "' + loaded.template + '"'); }
})();

console.log('');
console.log('Итог: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);