(function () {
  'use strict';

  /* ---------- タブ(業種の切り替え・活用場面の切り替え) ---------- */
  document.querySelectorAll('[data-tabs]').forEach(function (root) {
    var list = root.querySelector('[role="tablist"]');
    if (!list) return;
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));

    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab, false); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, true); }
      });
    });

    select(tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0], false);
  });

  /* ---------- LINEのトークのデモ ---------- */
  (function () {
    var log = document.getElementById('demoLog');
    var foot = document.getElementById('demoFoot');
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.demo__tab'));
    if (!log || !foot) return;

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      estate: {
        hello: 'こんにちは。紹介したい物件の特徴を、トークで送ってください。',
        steps: [
          { me: 'サンプルハイツ203、2LDK南向き、駅徒歩8分、宅配ボックスあり。紹介文つくって。',
            bot: '紹介文の下書きです。',
            card: { title: '物件紹介文(下書き)', text: '南向きで日当たりのよい2LDKです。駅から徒歩8分。宅配ボックス付きで、不在時の荷物の受け取りにも対応できます。' } },
          { me: 'もう少し短くして。',
            bot: '短くしました。',
            card: { title: '物件紹介文(下書き)', text: '駅徒歩8分、南向きの2LDK。宅配ボックス付きです。' } }
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
        f.appendChild(icon('i-doc'));
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

  /* ---------- スクロールで現れる ---------- */
  (function () {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var groups = [
      '.section__head', '.statement__inner', '.band__inner', '.keys__list > li', '.cards > li', '.points > li',
      '.map__title', '.map__grid > div', '.flow3', '.tabs', '.tasks__title', '.tasks__list > li', '.steps > li',
      '.program__title', '.program__lead', '.price', '.faq__item', '.change__row', '.line__text', '.demo',
      '.product', '.company > div', '.contact__inner > *', '.note'
    ];
    var items = Array.prototype.slice.call(document.querySelectorAll(groups.join(',')));
    if (!items.length) return;
    if (reduce || !('IntersectionObserver' in window)) return;

    // 同じ親の中では順に少しずらす
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

  /* ---------- ヘッダーの影 ---------- */
  var header = document.getElementById('header');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- スマホ用メニュー ---------- */
  var menuBtn = document.getElementById('menuBtn');
  var gnav = document.getElementById('gnav');

  function setMenu(open) {
    gnav.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  }

  if (menuBtn && gnav) {
    menuBtn.addEventListener('click', function () {
      setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
    });
    gnav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menuBtn.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.header')) setMenu(false);
    });
  }

  /* ---------- 現在地の表示(ヘッダー・スマホ固定メニュー) ---------- */
  var links = Array.prototype.slice.call(
    document.querySelectorAll('.gnav a[href^="#"], .bnav a[href^="#"]')
  );
  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
  var ticking = false;

  function updateCurrent() {
    ticking = false;
    var line = window.innerHeight * 0.4;
    var current = sections[0];
    sections.forEach(function (s) {
      if (s.getBoundingClientRect().top <= line) current = s;
    });
    var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (atBottom) current = document.getElementById('contact') || current;

    // 固定メニューにない区間は、直前の項目を現在地とする
    var map = { worries: 'top', about: 'top', usecase: 'top', change: 'support', systems: 'line', flow: 'line', faq: 'line', company: 'line', top: 'none', parent: 'features' };
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var inBnav = !!a.closest('.bnav');
      var on = id === current.id || (inBnav && map[current.id] === id);
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(updateCurrent); }
  }, { passive: true });
  window.addEventListener('resize', updateCurrent);
  updateCurrent();
})();
