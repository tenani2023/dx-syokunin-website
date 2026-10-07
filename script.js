(function () {
  'use strict';

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- スマホ用メニュー ---------- */
  var menuBtn = document.getElementById('menuBtn');
  var nav = document.getElementById('nav');

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  }

  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menuBtn.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.site-header')) setMenu(false);
    });
  }

  /* ---------- 現在地(ナビ) ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
  var targets = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  var ticking = false;

  function updateCurrent() {
    ticking = false;
    var line = window.innerHeight * 0.4;
    var current = null;
    targets.forEach(function (s) {
      if (s && s.getBoundingClientRect().top <= line) current = s;
    });
    links.forEach(function (a, i) {
      if (targets[i] === current && current) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  /* ---------- モバイル固定CTA(相談エリアでは隠す) ---------- */
  var mobileCta = document.getElementById('mobileCta');
  var contact = document.getElementById('contact');

  function updateDock() {
    if (!mobileCta || !contact) return;
    var r = contact.getBoundingClientRect();
    var visible = r.top < window.innerHeight && r.bottom > 0;
    mobileCta.classList.toggle('is-hidden', visible);
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(function () { updateCurrent(); updateDock(); }); }
  }, { passive: true });
  window.addEventListener('resize', function () { updateCurrent(); updateDock(); });
  updateCurrent();
  updateDock();

  /* ---------- スクロールで現れる ---------- */
  (function () {
    var groups = [
      '.section-label', '.section h2', '.section > .wrap > .intro', '.stat', '.player',
      '.challenge-card', '.calc-card', '.change-row', '.feature-grid article', '.feature-list li',
      '.product-card', '.system-more .card', '.case-card', '.program-list article', '.program-after',
      '.consultation-card', '.timeline article', '.price-note', '.subsidy-highlight', '.subsidy-metrics article',
      '.company-card', '.faq-list', '.contact > .wrap > *'
    ];
    var items = Array.prototype.slice.call(document.querySelectorAll(groups.join(',')));
    if (!items.length || reduce || !('IntersectionObserver' in window)) return;

    var counts = [];
    items.forEach(function (el) {
      var parent = el.parentNode, entry = null;
      for (var i = 0; i < counts.length; i++) if (counts[i].p === parent) entry = counts[i];
      if (!entry) { entry = { p: parent, n: 0 }; counts.push(entry); }
      el.style.setProperty('--d', Math.min(entry.n, 5) * 0.08 + 's');
      entry.n += 1;
      el.classList.add('reveal');
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -10% 0px' });
    items.forEach(function (el) { io.observe(el); });
  })();

  /* ---------- 問い合わせフォーム(メールアプリで作成) ---------- */
  (function () {
    var form = document.getElementById('contactForm');
    if (!form) return;
    var err = document.getElementById('formError');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        err.hidden = false;
        var first = form.querySelector(':invalid');
        if (first) first.focus();
        return;
      }
      err.hidden = true;
      var v = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
      var checked = function (n) {
        return Array.prototype.map.call(form.querySelectorAll('[name="' + n + '"]:checked'), function (el) { return el.value; }).join('、');
      };
      var lines = [
        '【DX職人 お問い合わせ】', '',
        '会社名：' + v('会社名'),
        'お名前：' + v('お名前'),
        'メールアドレス：' + v('メールアドレス'),
        '電話番号：' + (v('電話番号') || '(未記入)'),
        '業種：' + checked('業種'),
        'ご相談内容：' + (checked('ご相談内容') || '(未選択)'), '',
        '楽にしたい作業、気になっていること：', v('内容') || '(未記入)', ''
      ];
      var subject = encodeURIComponent('【DX職人】ご相談（' + v('会社名') + '）');
      var body = encodeURIComponent(lines.join('\n'));
      window.location.href = 'mailto:info@senwa-solutions.com?subject=' + subject + '&body=' + body;
    });
    // LINEのURLが未設定の間は「準備中」表示
    var lineUrl = window.DX_LINE_URL || '';
    document.querySelectorAll('a[href="LINE_URL_PLACEHOLDER"]').forEach(function (a) {
      if (lineUrl) { a.href = lineUrl; return; }
      a.removeAttribute('href'); a.removeAttribute('target');
      if (a.classList.contains('cta')) { a.classList.add('is-disabled'); a.textContent = 'LINE公式アカウントは準備中です'; }
      else { a.textContent = 'LINE公式アカウント(準備中)'; }
    });
  })();

  /* ---------- LINEのトークのデモ ---------- */
  (function () {
    var log = document.getElementById('demoLog');
    var foot = document.getElementById('demoFoot');
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.demo__tab'));
    if (!log || !foot) return;

    var SCENARIOS = {
      estimate: {
        hello: 'こんにちは。つくりたい書類の内容を、トークで送ってください。',
        steps: [
          { me: 'サンプル様邸の外壁塗装、見積書をお願い。足場一式15万、塗装一式48万。',
            bot: '見積書の下書きを作りました。内容をご確認ください。',
            card: { title: '御見積書(下書き)', rows: [['宛先', 'サンプル様'], ['件名', '外壁塗装工事'], ['足場一式', '150,000円'], ['塗装一式', '480,000円'], ['合計(税別)', '630,000円']] } },
          { me: '内容OK。PDFで送って。',
            bot: 'PDFをお届けしました。台帳にも記録しています。',
            file: '御見積書_サンプル様.pdf' }
        ]
      },
      report: {
        hello: 'お疲れさまです。今日の現場のことを、メモのまま送ってください。',
        steps: [
          { me: 'A邸の基礎。配筋検査OK、午後から型枠。雨で30分中断。',
            bot: '日報の下書きを作りました。',
            card: { title: '作業日報(下書き)', rows: [['現場', 'A邸 新築工事'], ['作業', '配筋検査(合格)、型枠の設置'], ['特記', '降雨で約30分中断']] } },
          { me: '明日9時から生コン、も入れておいて。',
            bot: '「明日の予定：9時から生コンクリート打設」を追記しました。内容を確認して、問題なければ提出してください。' }
        ]
      },
      attendance: {
        hello: 'おはようございます。「出勤」「退勤」と送るだけで記録できます。',
        steps: [
          { me: '出勤。今日はA邸の現場。',
            bot: '出勤を記録しました。',
            card: { title: '勤怠の記録', rows: [['日付', '6月3日(火)'], ['出勤', '8:02'], ['現場', 'A邸 新築工事']] } },
          { me: '退勤。休憩は1時間。',
            bot: '退勤を記録しました。今日の勤務時間をまとめています。',
            card: { title: '本日の勤務', rows: [['退勤', '17:31'], ['休憩', '1時間'], ['勤務時間', '8時間29分'], ['今月の合計', '3日 / 25時間10分']] } }
        ]
      }
    };

    var current = null, index = 0, timer = null;

    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }
    function icon(id) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon');
      svg.setAttribute('aria-hidden', 'true');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#' + id);
      svg.appendChild(use);
      return svg;
    }
    function add(node) {
      log.appendChild(node);
      log.scrollTop = log.scrollHeight;
    }
    function botMessage(step) {
      var m = el('div', 'msg msg--bot');
      m.appendChild(el('p', null, step.bot));
      if (step.card) {
        var c = el('div', 'msg__card');
        c.appendChild(el('p', 'msg__card-title', step.card.title));
        (step.card.rows || []).forEach(function (r) {
          var row = el('p', 'msg__card-row');
          row.appendChild(el('span', null, r[0]));
          row.appendChild(el('span', null, r[1]));
          c.appendChild(row);
        });
        if (step.card.text) c.appendChild(el('p', 'msg__card-text', step.card.text));
        m.appendChild(c);
      }
      if (step.file) {
        var f = el('p', 'msg__file');
        f.appendChild(icon('i-file-text'));
        f.appendChild(el('span', null, step.file));
        m.appendChild(f);
      }
      return m;
    }
    function showSuggest() {
      foot.textContent = '';
      var step = current.steps[index];
      var btn;
      if (!step) {
        btn = el('button', 'suggest suggest--again', 'もう一度ためす');
        btn.type = 'button';
        btn.addEventListener('click', function () { start(current, true); });
        foot.appendChild(btn);
        return btn;
      }
      foot.appendChild(el('p', 'phone__foot-label', 'タップして送信'));
      btn = el('button', 'suggest');
      btn.type = 'button';
      btn.appendChild(el('span', 'suggest__text', step.me));
      var ic = el('span', 'suggest__icon');
      ic.appendChild(icon('i-send'));
      btn.appendChild(ic);
      btn.addEventListener('click', send);
      foot.appendChild(btn);
      return btn;
    }
    function send() {
      var step = current.steps[index];
      var hadFocus = foot.contains(document.activeElement);
      foot.textContent = '';
      add(el('p', 'msg msg--me', step.me));
      var typing = el('p', 'msg msg--bot');
      var dots = el('span', 'typing');
      dots.setAttribute('aria-hidden', 'true');
      dots.appendChild(el('i')); dots.appendChild(el('i')); dots.appendChild(el('i'));
      typing.appendChild(dots);
      if (!reduce) add(typing);
      timer = window.setTimeout(function () {
        if (typing.parentNode) log.removeChild(typing);
        add(botMessage(step));
        index += 1;
        var next = showSuggest();
        log.scrollTop = log.scrollHeight;
        if (hadFocus) next.focus({ preventScroll: true });
      }, reduce ? 0 : 900);
    }
    function start(scenario, focus) {
      window.clearTimeout(timer);
      current = scenario; index = 0;
      log.textContent = '';
      add(el('p', 'msg msg--hint', '下のメッセージをタップすると送信できます'));
      add(el('p', 'msg msg--bot', scenario.hello));
      var btn = showSuggest();
      if (focus) btn.focus({ preventScroll: true });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.setAttribute('aria-pressed', t === tab ? 'true' : 'false'); });
        start(SCENARIOS[tab.getAttribute('data-demo')], false);
      });
    });
    start(SCENARIOS.estimate, false);
  })();
})();
