// Основная логика интерфейса приложения «Генератор QR-кодов для оплаты».
// Загружается последним (после config.js, storage.js, gost.js).
// Инициализация происходит по событию DOMContentLoaded.

(function (window) {
  'use strict';

  var state = {
    data: null,   // данные из localStorage
    lessons: [],  // список занятий (name+sum)
    children: []  // список детей
  };

  var el = {};

  function $(id) { return document.getElementById(id); }

  function init() {
    el.payerLastName = $('payer-lastname');
    el.payerDocType = $('payer-doc-type');
    el.payerDocNumber = $('payer-doc-number');
    el.payerInn = $('payer-inn');
    el.childrenList = $('children-list');
    el.addChildBtn = $('add-child-btn');
    el.month = $('month');
    el.year = $('year');
    el.template = $('template');
    el.matrixHead = $('matrix-head');
    el.matrixBody = $('matrix-body');
    el.addLessonBtn = $('add-lesson-btn');
    el.lessonsGrid = $('lessons-grid');
    el.generateBtn = $('generate-btn');
    el.resetBtn = $('reset-btn');
    el.error = $('error');
    el.result = $('result');
    el.requisitesToggleBtn = $('requisites-toggle-btn');
    el.requisitesDetail = $('requisites-detail');

    fillMonthSelect();

    state.data = window.paymentStore.load();

    // Занятия: пользовательские, иначе из конфига
    if (state.data.lessons && state.data.lessons.length) {
      state.lessons = state.data.lessons;
    } else {
      state.lessons = (window.APP_SETTINGS.DefaultLessons || []).map(function (l) {
        return { name: l.name, sum: l.sum };
      });
    }

    state.children = state.data.children || [];

    // Если детей нет — создаём одного пустого
    if (!state.children.length) {
      state.children.push(emptyChild());
    }

    restoreForm();
    renderChildren();
    renderLessonsGrid();
    renderMatrix();

    el.addChildBtn.addEventListener('click', addChild);
    el.addLessonBtn.addEventListener('click', addLesson);
    el.generateBtn.addEventListener('click', generateAll);
    el.resetBtn.addEventListener('click', resetAll);

    el.requisitesToggleBtn.addEventListener('click', toggleRequisites);

    // Маска "Номер документа" для паспорта: NN..(4) пробел NNNNNN(6)
    el.payerDocNumber.addEventListener('input', function () {
      var digits = el.payerDocNumber.value.replace(/\D/g, '').slice(0, 10);
      var parts = [digits.slice(0, 4), digits.slice(4, 10)];
      el.payerDocNumber.value = parts.filter(Boolean).join(' ');
      save();
    });

    // чипы вставки плейсхолдеров
    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        el.template.value += chip.textContent;
        save();
      });
    });
  }

  function emptyChild() {
    return { id: window.paymentStore.nextId(), fullName: '', className: '', lessonIds: {} };
  }

  function fillMonthSelect() {
    var names = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль',
      'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    for (var i = 0; i < 12; i++) {
      var opt = document.createElement('option');
      opt.value = String(i + 1).padStart(2, '0');
      opt.textContent = names[i];
      el.month.appendChild(opt);
    }
  }

  function restoreForm() {
    var d = state.data;
    el.payerLastName.value = d.payer.lastName || '';
    el.payerDocType.value = d.payer.docType || '';
    el.payerDocNumber.value = d.payer.docNumber || '';
    el.payerInn.value = d.payer.inn || '';
    el.year.value = d.year || '';
    el.month.value = d.month || window.paymentStore.currentMonth();
    el.template.value = d.template || (window.APP_SETTINGS.DefaultTemplate || '');
  }

  // --- Дети ---
  function renderChildren() {
    el.childrenList.innerHTML = '';
    state.children.forEach(function (child, i) {
      var row = document.createElement('div');
      row.className = 'child-block';

      var f = document.createElement('input');
      f.type = 'text';
      f.placeholder = 'ФИО ребёнка';
      f.value = child.fullName;
      f.addEventListener('input', function () { child.fullName = f.value; renderMatrix(); save(); });

      var c = document.createElement('input');
      c.type = 'text';
      c.placeholder = 'Класс, 1 "А"';
      c.value = child.className;
      c.className = 'child-class-input';
      c.addEventListener('input', function () { child.className = c.value; save(); });

      var del = document.createElement('button');
      del.className = 'btn btn-small btn-danger child-del';
      del.textContent = '✕';
      del.addEventListener('click', function () {
        state.children.splice(i, 1);
        if (!state.children.length) state.children.push(emptyChild());
        renderChildren();
        renderMatrix();
        save();
      });

      row.appendChild(f);
      row.appendChild(c);
      row.appendChild(del);
      el.childrenList.appendChild(row);
    });
  }

  function addChild() {
    state.children.push(emptyChild());
    renderChildren();
    renderMatrix();
    save();
  }

  // --- Занятия ---
  function addLesson() {
    state.lessons.push({ name: '', sum: '' });
    renderLessonsGrid();
    renderMatrix();
    save();
  }

  // Списко занятий: редактируемые поля "название" и "стоимость"
  function renderLessonsGrid() {
    el.lessonsGrid.innerHTML = '';
    state.lessons.forEach(function (lesson, i) {
      var row = document.createElement('div');
      row.className = 'lesson-row';

      var n = document.createElement('input');
      n.type = 'text';
      n.placeholder = 'Название занятия';
      n.value = lesson.name;
      n.className = 'lesson-name-input';
      n.addEventListener('input', function () { lesson.name = n.value; renderMatrix(); save(); });

      var s = document.createElement('input');
      s.type = 'text';
      s.placeholder = 'Стоимость, ₽';
      s.value = lesson.sum;
      s.inputmode = 'decimal';
      s.className = 'lesson-sum-input';
      s.addEventListener('input', function () { lesson.sum = s.value; renderMatrix(); save(); });

      var del = document.createElement('button');
      del.className = 'btn btn-small btn-danger lesson-del';
      del.textContent = '✕';
      del.addEventListener('click', function () {
        state.lessons.splice(i, 1);
        state.children.forEach(function (ch) { delete ch.lessonIds[lesson.name]; });
        renderLessonsGrid();
        renderMatrix();
        save();
      });

      row.appendChild(n);
      row.appendChild(s);
      row.appendChild(del);
      el.lessonsGrid.appendChild(row);
    });
  }

  // --- Таблица "Занятие × Ребёнок" ---
  function renderMatrix() {
    // Заголовок: пустая клетка + разусмеры детей
    el.matrixHead.innerHTML = '';
    var thEmpty = document.createElement('th');
    thEmpty.textContent = 'Занятие / Стоимость';
    el.matrixHead.appendChild(thEmpty);

    state.children.forEach(function (child) {
      var th = document.createElement('th');
      th.textContent = child.fullName || 'Ребёнок';
      th.title = child.className || '';
      el.matrixHead.appendChild(th);
    });

    // Телo: строки занятий
    el.matrixBody.innerHTML = '';
    state.lessons.forEach(function (lesson, li) {
      var tr = document.createElement('tr');

      // Название + стоимость
      var tdName = document.createElement('td');
      var lbl = document.createElement('div');
      lbl.className = 'lesson-label';
      lbl.textContent = lesson.name + (lesson.sum ? ' — ' + lesson.sum + ' ₽' : '');
      tdName.appendChild(lbl);
      tr.appendChild(tdName);

      // Чекбоксы для каждого ребёнка
      state.children.forEach(function (child) {
        var td = document.createElement('td');
        td.className = 'matrix-check';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!child.lessonIds[lesson.name];
        cb.addEventListener('change', function () {
          if (cb.checked) child.lessonIds[lesson.name] = true;
          else delete child.lessonIds[lesson.name];
          save();
        });
        td.appendChild(cb);
        tr.appendChild(td);
      });

      el.matrixBody.appendChild(tr);
    });
  }

  function collectForm() {
    return {
      payer: {
        lastName: el.payerLastName.value.trim(),
        docType: el.payerDocType.value.trim(),
        docNumber: el.payerDocNumber.value.trim(),
        inn: el.payerInn.value.trim()
      },
      template: el.template.value.trim(),
      month: el.month.value,
      year: el.year.value.trim(),
      lessons: state.lessons,
      children: state.children
    };
  }

  function save() {
    state.data = collectForm();
    window.paymentStore.save(state.data);
  }

  function clearError() { el.error.classList.add('hidden'); el.error.textContent = ''; }
  function showError(msg) { el.error.textContent = msg; el.error.classList.remove('hidden'); }

  // Сформировать QR по каждому занятию для каждого ребёнка
  function generateAll() {
    clearError();
    var form = collectForm();

    if (!form.payer.lastName) { showError('Заполните ФИО плательщика.'); return; }
    if (!form.year) { showError('Укажите год.'); return; }
    if (!state.lessons.length) { showError('Добавьте хотя бы одно занятие.'); return; }

    // Валидация детей
    var hasFilled = false;
    state.children.forEach(function (ch) { if (ch.fullName) hasFilled = true; });
    if (!hasFilled) { showError('Заполните ФИО хотя бы одного ребёнка.'); return; }

    // Проверим, что есть хоть одна отметка
    var anyMark = false;
    state.children.forEach(function (ch) {
      Object.keys(ch.lessonIds || {}).forEach(function (k) { if (k) anyMark = true; });
    });
    if (!anyMark) { showError('Отметьте, какие занятия посещает каждый ребёнок.'); return; }

    save();
    renderResults(form);
  }

  function renderResults(form) {
    el.result.innerHTML = '';
    el.result.classList.remove('hidden');

    // Для каждого ребёнка — свой набор занятий (по чекбоксам)
    state.children.forEach(function (child) {
      if (!child.fullName) return;

      state.lessons.forEach(function (lesson) {
        if (!child.lessonIds[lesson.name]) return; // не посещает

        var purpose = window.buildGost.fillTemplate(form.template, {
          child: { fullName: child.fullName, className: child.className },
          lesson: lesson.name,
          month: form.month,
          year: form.year,
          monthName: window.paymentStore.monthName(form.month)
        });

        var gost = window.buildGost.buildGostString(purpose, lesson.sum, {
          lastName: form.payer.lastName,
          payerAddress: '',
          docType: form.payer.docType,
          docNumber: form.payer.docNumber,
          inn: form.payer.inn
        });

        var card = document.createElement('div');
        card.className = 'result-card';

        var head = document.createElement('div');
        head.className = 'result-head';

        var title = document.createElement('div');
        title.className = 'result-title';
        title.textContent = child.fullName + ' · ' + lesson.name + (lesson.sum ? ' — ' + lesson.sum + ' ₽' : '');

        var toggle = document.createElement('button');
        toggle.className = 'btn btn-primary btn-small result-toggle';
        toggle.textContent = 'Показать QR';
        toggle.addEventListener('click', function () {
          var expanded = card.classList.toggle('expanded');
          toggle.textContent = expanded ? 'Скрыть QR' : 'Показать QR';
        });

        head.appendChild(title);
        head.appendChild(toggle);

        var body = document.createElement('div');
        body.className = 'result-body';

        var wrap = document.createElement('div');
        wrap.className = 'qr-canvas';
        var canvas = document.createElement('canvas');
        wrap.appendChild(canvas);

        var p = document.createElement('div');
        p.className = 'result-purpose';
        p.textContent = purpose;

        var dl = document.createElement('button');
        dl.className = 'btn btn-secondary btn-small result-download';
        dl.textContent = 'Скачать PNG';
        dl.disabled = true;
        dl.addEventListener('click', function () {
          var fname = (child.fullName + '_' + lesson.name).replace(/[^a-zа-яё0-9]+/gi, '_') + '_qr.png';
          var link = document.createElement('a');
          link.download = fname;
          link.href = canvas.toDataURL('image/png');
          link.click();
        });

        body.appendChild(wrap);
        body.appendChild(p);
        body.appendChild(dl);

        QRLib.toCanvas(canvas, gost, {
          width: 200,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' }
        }).then(function () {
          dl.disabled = false;
        }).catch(function () {
          var err = document.createElement('div');
          err.className = 'result-err';
          err.textContent = 'Ошибка генерации QR';
          body.appendChild(err);
        });

        card.appendChild(head);
        card.appendChild(body);
        el.result.appendChild(card);
      });
    });
  }

  function resetAll() {
    if (!confirm('Сбросить все сохранённые данные?')) return;
    window.paymentStore.clear();
    location.reload();
  }

  // Показать/скрыть реквизиты получателя (школы) из конфига
  var REQUISITE_LABELS = [
    ['Name', 'Наименование'],
    ['PersonalAcc', 'Расчётный счёт'],
    ['BankName', 'Банк'],
    ['BIC', 'БИК'],
    ['CorrespAcc', 'Корр. счёт'],
    ['KPP', 'КПП'],
    ['PayeeINN', 'ИНН получателя'],
    ['CBC', 'КБК'],
    ['OKTMO', 'ОКТМО']
  ];

  function renderRequisitesDetail(visible) {
    var c = window.SCHOOL_PAYMENT;
    el.requisitesToggleBtn.textContent = visible ? 'Скрыть' : 'Показать';
    if (!visible) { el.requisitesDetail.classList.add('hidden'); return; }
    el.requisitesDetail.innerHTML = '';
    REQUISITE_LABELS.forEach(function (pair) {
      var row = document.createElement('div');
      row.className = 'req-row';
      var label = document.createElement('span');
      label.className = 'req-label';
      label.textContent = pair[1];
      var value = document.createElement('code');
      value.textContent = c[pair[0]];
      row.appendChild(label);
      row.appendChild(value);
      el.requisitesDetail.appendChild(row);
    });
    el.requisitesDetail.classList.remove('hidden');
  }

  function toggleRequisites() {
    var visible = !el.requisitesDetail.classList.contains('hidden') && el.requisitesDetail.childNodes.length > 2;
    // перерисовываем только при показе, чтобы текст всегда был актуален
    renderRequisitesDetail(!visible);
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);