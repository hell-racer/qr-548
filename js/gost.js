// Сборка строки ГОСТ Р 56042-2014 из фиксированных (config.js) и редактируемых полей.
// Порядок и теги сверены с РАБОЧИМ QR, который успешно распознаётся СБОЛ
// (сгенерирован на https://sbqr.ru/):
//
//   ST00012|Name=...|PersonalAcc=...|BankName=...|BIC=...|CorrespAcc=...
//   |KPP=...|PayeeINN=...|lastName=...|payerAddress=...|Purpose=...|CBC=...|OKTMO=...|Sum=...
//
// Сумма (Sum) — своя для каждого занятия. Назначение (Purpose) строится из
// шаблона с подстановкой плейсхолдеров.
// Поля разделяются символом '|'. Строка кодируется в UTF-8.

(function (global) {
  'use strict';

  var PLACEHOLDERS = {
    child:        { token: '<ФИО>',          key: 'fullName' },
    className:    { token: '<класс>',        key: 'className' },
    lesson:       { token: '<занятие>',      key: null },
    monthYear:    { token: '<период>',       key: null }
  };

  /**
   * Подставить значения из данных пользователя в шаблон назначения.
   * @param {string} template - шаблон, например "ПОУ, <ФИО ребенка>, <класс>, <занятие>, <месяц, год>".
   * @param {object} data - объект данных { child: {fullName, className}, lesson, monthName, year }.
   * @returns {string} назначение платежа с подставленными значениями.
   */
  function fillTemplate(template, data) {
    data = data || {};
    var d = data.child || {};
    var result = String(template || '')
      .split(PLACEHOLDERS.child.token).join(d.fullName || '')
      .split(PLACEHOLDERS.className.token).join(d.className || '')
      .split(PLACEHOLDERS.monthYear.token).join(monthLabel(data))
      .split(PLACEHOLDERS.lesson.token).join(data.lesson || '');
    // всё, кроме "<год>" — закрываем остаточные пустые подставляемые рамки
    return result.replace(/<\s*[/\w\s,]+\s*>/g, function (m) {
      // Если остался какой-то нераспознанный плейсхолдер, оставляем как есть.
      return m;
    }).trim();
  }

  // "сентябрь 2026" из month ("09") и year ("2026")
  function monthLabel(data) {
    var name = data.monthName || (global.paymentStore && global.paymentStore.monthName(data.month));
    var parts = [];
    if (name) parts.push(name);
    if (data.year) parts.push(data.year);
    return parts.join(' ');
  }

  /**
   * Собрать строку ГОСТ для QR-кода.
   * @param {string} purpose - назначение платежа (итоговое, уже подставленное).
   * @param {string} sumRubles - сумма в рублях.
   * @param {object} payer - необязательные данные плательщика { lastName, payerAddress, docType, docNumber, inn }.
   * @returns {string} строка ГОСТ Р 56042-2014.
   */
  function buildGostString(purpose, sumRubles, payer) {
    var c = global.SCHOOL_PAYMENT;
    payer = payer || {};

    var parts = [
      c.ST,
      'Name=' + c.Name,
      'PersonalAcc=' + c.PersonalAcc,
      'BankName=' + c.BankName,
      'BIC=' + c.BIC,
      'CorrespAcc=' + c.CorrespAcc,
      'KPP=' + c.KPP,
      'PayeeINN=' + c.PayeeINN
    ];

    // Необязательные данные плательщика (если заполнены).
    var lastName = payer.lastName || c.PayerLastName || '';
    var payerAddress = payer.payerAddress || c.PayerAddress || '';
    if (lastName.trim()) {
      parts.push('lastName=' + lastName.trim());
    }
    if (payerAddress.trim()) {
      parts.push('payerAddress=' + payerAddress.trim());
    }

    // Документ плательщика (ДУЛ): вид и номер.
    var docType = (payer.docType || '').trim();
    var docNumber = (payer.docNumber || '').trim();
    if (docType) {
      parts.push('PayerIdType=' + docType);
    }
    if (docNumber) {
      parts.push('PayerIdNum=' + docNumber);
    }

    // ИНН плательщика (необязательно).
    var inn = (payer.inn || '').trim();
    if (inn) {
      parts.push('PayerINN=' + inn);
    }

    // Назначение платежа (обязательное).
    parts.push('Purpose=' + (purpose || '').trim());

    // Бюджетные реквизиты: КБК (CBC), ОКТМО.
    parts.push('CBC=' + c.CBC);
    parts.push('OKTMO=' + c.OKTMO);

    // Сумма — в конце строки (в копейках).
    var rubles = parseFloat(String(sumRubles || '').replace(',', '.'));
    if (!isNaN(rubles) && rubles > 0) {
      var kopecks = Math.round(rubles * 100);
      parts.push('Sum=' + kopecks);
    }

    return parts.join('|');
  }

  /**
   * Проверка, что строка умещается в выбранную версию QR.
   * @param {string} gost - уже собранная строка.
   * @returns {boolean}
   */
  function validateLength(gost) {
    var utf8Length = new TextEncoder ? new TextEncoder().encode(gost || '').length : (gost || '').length;
    return utf8Length <= 480;
  }

  global.buildGost = {
    PLACEHOLDERS: PLACEHOLDERS,
    fillTemplate: fillTemplate,
    monthLabel: monthLabel,
    buildGostString: buildGostString,
    validateLength: validateLength
  };
})(window);