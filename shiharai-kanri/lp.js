/* テナニ 支払管理(仮称) LP: 社長がスマホで承認する流れの再現(文言は製品の画面の原文) */
(function () {
  'use strict';

  var screen = document.getElementById('skScreen');
  if (!screen) return;
  var stepsEl = document.getElementById('skSteps');
  var restartBtn = document.getElementById('skRestart');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var timers = [];

  // 架空のデータ
  var PLANS = {
    toso: {
      name: '架空塗装 株式会社', amount: '192,500 円', date: '2026-10-29 (木)', dateShort: '2026-10-29',
      bankShort: '架空銀行 東支店', bankFull: '架空銀行 (9999) 東支店 (210) 普通', last4: '7777', holder: 'ｶ)ｶｸｳﾄｿｳ', ver: 2,
      bill: '2026-1108', billDate: '2026-10-06', due: '2026-11-20', file: 'seikyu-2026-1108.pdf (PDF・1 KB)', changed: true
    },
    setsubi: {
      name: '架空設備工業 株式会社', amount: '1,210,000 円', date: '2026-10-29 (木)', dateShort: '2026-10-29',
      bankShort: '架空銀行 中央支店', bankFull: '架空銀行 (9999) 中央支店 (102) 当座', last4: '2222', holder: 'ｶ)ｶｸｳｾﾂﾋﾞｺｳｷﾞﾖｳ', ver: 1,
      bill: '2026-1107', billDate: '2026-10-06', due: '2026-11-20', file: 'seikyu-2026-1107.pdf (PDF・1 KB)', changed: false
    }
  };
  var REASON = '振込先が変わっています。変更の連絡が本物か、前から知っている電話番号で確かめてから、もう一度依頼してください。';
  var NAV = ['ホーム', '承認する', '支払日別', '請求・未払', '取引先・振込先', '利用者', '自分の設定', '用語'];
  var ORDER = ['login', 'code', 'home', 'list', 'changed', 'approve'];

  var state;

  function later(fn, ms) { timers.push(setTimeout(fn, reduce ? 0 : ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function bar(on) {
    if (!on) return '<div class="sk-app__bar"><p class="sk-app__title">TENANi 支払管理</p></div>';
    return '<div class="sk-app__bar"><p class="sk-app__title">TENANi 支払管理</p><p class="sk-app__nav">' +
      NAV.map(function (n) { return '<span' + (n === on ? ' class="is-on"' : '') + '>' + n + '</span>'; }).join('') + '</p></div>';
  }

  function render(html, step) {
    screen.innerHTML = '<div class="sk-app' + (reduce ? '' : ' is-anim') + '">' + html + '</div>';
    var body = screen.querySelector('.sk-app__body');
    if (body) body.scrollTop = 0;
    markStep(step);
  }

  function markStep(step) {
    if (!stepsEl) return;
    var idx = ORDER.indexOf(step);
    Array.prototype.forEach.call(stepsEl.children, function (li, i) {
      li.classList.toggle('is-done', step === 'end' || i < idx);
      li.classList.toggle('is-now', i === idx);
    });
  }

  /* ---------- 1. ログイン ---------- */
  function login() {
    render(bar() +
      '<div class="sk-app__body"><div class="sk-app__center">' +
        '<h4>TENANi 支払管理</h4>' +
        '<div class="sk-app__box">' +
          '<span class="sk-app__label">会社コード</span><span class="sk-app__input">kakuu-koumuten</span>' +
          '<span class="sk-app__label">メールアドレス</span><span class="sk-app__input">taro@example.jp</span>' +
          '<span class="sk-app__label">パスワード</span><span class="sk-app__input">••••••••••••</span>' +
          '<p style="margin-top:14px"><button type="button" class="sk-app__btn sk-app__btn--block sk-hot" data-go="login">ログインする</button></p>' +
        '</div>' +
      '</div></div>', 'login');
  }

  /* ---------- 2. 確認コード ---------- */
  function code() {
    render(bar() +
      '<div class="sk-app__body"><div class="sk-app__center">' +
        '<h4>確認コード</h4>' +
        '<p>認証アプリに表示されている 6 桁の数字を入力してください (管理者・承認者は、パスワードに加えて確認コードが必要です)。</p>' +
        '<div class="sk-app__box">' +
          '<span class="sk-app__label">確認コード (6 桁)</span><span class="sk-app__input sk-app__input--code" id="skCode">&nbsp;</span>' +
          '<p style="margin-top:14px"><button type="button" class="sk-app__btn sk-app__btn--block" id="skCodeBtn" disabled>確かめる</button></p>' +
          '<p style="margin-top:10px"><span class="sk-app__link sk-app__small" data-off>ログアウトしてやり直す</span></p>' +
        '</div>' +
      '</div></div>', 'code');
    var box = document.getElementById('skCode');
    var digits = '482916';
    for (var i = 1; i <= digits.length; i++) {
      (function (n) { later(function () { box.textContent = digits.slice(0, n); }, 260 * n); })(i);
    }
    later(function () {
      var btn = document.getElementById('skCodeBtn');
      btn.disabled = false;
      btn.classList.add('sk-hot');
      btn.setAttribute('data-go', 'code');
    }, 260 * digits.length + 100);
  }

  /* ---------- 3. ホーム ---------- */
  function home() {
    render(bar('ホーム') +
      '<div class="sk-app__body">' +
        '<h4>ホーム</h4>' +
        '<div class="sk-app__box">' +
          '<p><b>今日 10/26 (月) — あなたがすること</b></p>' +
          '<ul><li><button type="button" class="sk-app__link sk-hot" data-go="home">承認する: 2 件</button></li>' +
          '<li><span class="sk-app__link" data-off>振込先の確認: 1 件</span> (振込先のすり替えを防ぐ確認)</li></ul>' +
          '<p class="sk-app__small" style="margin-top:8px">支払日別の予定で、今週・来週の支払と、止まっているものを確かめられます。</p>' +
        '</div>' +
        '<div class="sk-app__box">' +
          '<p class="sk-app__link" style="text-decoration:none;font-weight:700">承認する</p>' +
          '<p>承認待ちの支払予定 <b>2</b> 件</p>' +
          '<p>承認待ちの調整 (請求から差し引く額) <b>0</b> 件</p>' +
          '<p>承認待ちの、お金が動く判断 (訂正・取消・付替え・照合の変更など) <b>0</b> 件</p>' +
          '<p class="sk-app__muted">金額・相手・振込先・予定日を確かめて承認します (承認者)。承認しても、振込はまだ行われません。</p>' +
        '</div>' +
      '</div>', 'home');
  }

  /* ---------- 4. 承認待ちの一覧 ---------- */
  function item(p) {
    return '<div class="sk-app__item">' +
      '<p class="sk-app__item-name">' + p.name + '</p>' +
      (p.changed ? '<span class="sk-app__tag">振込先が前回の承認から変わりました</span>' : '') +
      '<dl class="sk-app__kv">' +
        '<dt>金額</dt><dd class="is-amount">' + p.amount + '</dd>' +
        '<dt>予定日</dt><dd>' + p.date + '</dd>' +
        '<dt>振込先</dt><dd>' + p.bankShort + '<br>下 4 桁 <b>' + p.last4 + '</b> / ' + p.holder + '</dd>' +
        '<dt>何の支払か</dt><dd>請求 ' + p.bill + ' (期日 ' + p.due + ')<br>請求額 ' + p.amount + ' / 未払残 ' + p.amount + ' / 原本 1 件</dd>' +
        '<dt>作成者</dt><dd>架空 花子</dd>' +
      '</dl>' +
      '<button type="button" class="sk-app__btn" data-off>内容を確認する</button>' +
    '</div>';
  }

  function list() {
    var two = !state.rejected;
    var n = two ? 2 : 1;
    render(bar('承認する') +
      '<div class="sk-app__body">' +
        '<h4>承認する</h4>' +
        '<p class="sk-app__next"><b>次に判断すること:</b> 上から順に、金額・相手・振込先・予定日を確かめて承認するか差し戻します。承認しても振込はまだ行われません。</p>' +
        '<p><button type="button" class="sk-app__btn sk-hot" data-go="list">上から順に確認する (' + n + ' 件)</button></p>' +
        '<p class="sk-app__muted sk-app__small">承認待ち: 支払予定 ' + n + ' 件 (先頭)・お金が動く判断 (その下)・債務を減らす調整 0 件 (最後)。どれも、依頼した本人は承認できません。</p>' +
        '<p><b>支払予定 (' + n + ' 件)</b></p>' +
        '<p class="sk-app__small">合計 ' + (two ? '1,402,500' : '1,210,000') + ' 円。注意が必要なもの (振込先の変更・予定日の注意) を先頭に、予定日の近い順に並べています。</p>' +
        (two ? '<p class="sk-app__group">注意が必要 (振込先の変更・予定日の注意・予定日を過ぎた) — 1 件・192,500 円</p>' + item(PLANS.toso) : '') +
        '<p class="sk-app__group">予定日 2026-10-29 — 1 件・1,210,000 円</p>' + item(PLANS.setsubi) +
      '</div>', two ? 'list' : 'approve');
  }

  /* ---------- 5. 承認の画面(1件) ---------- */
  function table(p) {
    return '<dl class="sk-app__table">' +
      '<dt>今回認める金額</dt><dd class="is-amount">' + p.amount + '</dd>' +
      '<dt>相手 (取引先)</dt><dd>' + p.name + '</dd>' +
      '<dt>振込先</dt><dd>' + p.bankFull + '<br>口座番号 下 4 桁 <b>' + p.last4 + '</b> / 名義 ' + p.holder + ' (版 ' + p.ver + ')</dd>' +
      '<dt>予定日</dt><dd>' + p.date + '</dd>' +
      '<dt>請求</dt><dd>' + p.bill + ' / 請求日 ' + p.billDate + ' / 請求額 ' + p.amount + ' / 支払期日 ' + p.due + '<br>未払残 ' + p.amount + ' / 予約中 0 円</dd>' +
      '<dt>原本</dt><dd><span class="sk-app__link" data-off>' + p.file + '</span></dd>' +
      '<dt>予定の作成者</dt><dd>架空 花子 (版 1)</dd>' +
      '<dt>状態</dt><dd>承認待ち</dd>' +
    '</dl>';
  }

  function detailBody(p, extra) {
    var next = p.changed ? '<p><span class="sk-app__link sk-app__small" data-off>この予定は後で判断する → 次の承認へ (' + PLANS.setsubi.name + ')</span></p>' : '';
    return '<div class="sk-app__body">' +
      (extra || '') +
      '<h4>支払予定の承認</h4>' +
      '<p class="sk-app__muted">今回認める内容の全てです。金額・相手・振込先・予定日を確かめてください。</p>' +
      (p.changed ? '<p class="sk-app__warn">振込先が前回の承認から変わっています。取引先からの変更の連絡が本物か (電話など、前から知っている連絡先で) 確かめてから承認してください。</p>' : '') +
      table(p) + next +
      '<p class="sk-app__small"><span class="sk-app__link" data-off>承認待ちの一覧へ戻る</span>　<span class="sk-app__link" data-off>請求の詳細</span></p>' +
    '</div>';
  }

  function detail(key) {
    var p = PLANS[key];
    state.current = key;
    render(bar('承認する') + detailBody(p) +
      '<div class="sk-app__dock">' +
        '<p>承認すると、経理担当がこの予定を ' + p.dateShort + ' の支払の準備に入れられるようになります。<b>この操作では、銀行への振込はまだ行われません。</b>内容が違う・確かめたいことがある場合は「差し戻す」で理由を伝えます。</p>' +
        '<div class="sk-app__row">' +
          '<button type="button" class="sk-app__btn' + (p.changed ? '" data-off' : ' sk-hot" data-go="approve"') + '>承認する</button>' +
          '<button type="button" class="sk-app__btn sk-app__btn--line' + (p.changed ? ' sk-hot" data-go="reject"' : '" data-off') + '>差し戻す</button>' +
        '</div>' +
      '</div>', p.changed ? 'changed' : 'approve');
  }

  /* ---------- 6. 差し戻す ---------- */
  function reject() {
    var p = PLANS[state.current];
    render(bar('承認する') + detailBody(p) +
      '<div class="sk-app__dock">' +
        '<span class="sk-app__label">差し戻す理由 (経理担当に表示されます)</span>' +
        '<span class="sk-app__input sk-app__input--area" id="skReason"></span>' +
        '<div class="sk-app__row">' +
          '<button type="button" class="sk-app__btn" id="skReasonBtn" disabled>理由を付けて差し戻す</button>' +
          '<button type="button" class="sk-app__btn sk-app__btn--line" data-off>やめる</button>' +
        '</div>' +
      '</div>', 'changed');
    var box = document.getElementById('skReason');
    var step = 3;
    for (var i = step; i < REASON.length + step; i += step) {
      (function (n) { later(function () { box.textContent = REASON.slice(0, n); }, 30 * n); })(i);
    }
    later(function () {
      box.textContent = REASON;
      var btn = document.getElementById('skReasonBtn');
      btn.disabled = false;
      btn.classList.add('sk-hot');
      btn.setAttribute('data-go', 'rejected');
    }, 30 * REASON.length + 150);
  }

  function rejected() {
    state.rejected = true;
    render(bar('承認する') +
      '<div class="sk-app__body">' +
        '<p class="sk-app__done">差し戻しました。経理担当に理由が表示されます。</p>' +
        '<p class="sk-app__small sk-app__muted">差し戻す理由: ' + REASON + '</p>' +
        '<p><button type="button" class="sk-app__link sk-hot" data-go="back">承認待ちの一覧へ戻る</button></p>' +
        '<h4>支払予定の承認</h4>' + table(PLANS.toso).replace('<dd>承認待ち</dd>', '<dd>差し戻し</dd>') +
      '</div>', 'changed');
  }

  /* ---------- 7. 承認した後 ---------- */
  function approved() {
    render(bar('承認する') +
      '<div class="sk-app__body">' +
        '<p class="sk-app__done">承認しました。経理担当が「今回の支払を準備する」から準備できます。</p>' +
        '<p>承認待ちの支払予定は、ほかにありません。</p>' +
        '<p class="sk-app__small">判断: 承認 (架空 太郎)</p>' +
        '<div class="sk-app__box">' +
          '<p class="sk-app__small">承認した内容に誤りがあった場合は、出力前なら承認を取り消せます。取り消した承認では準備を確定・出力できません。承認の記録は残ります。</p>' +
          '<p style="margin-top:8px"><button type="button" class="sk-app__btn sk-app__btn--line" data-off>承認を取り消す</button></p>' +
        '</div>' +
        '<h4>支払予定の承認</h4>' + table(PLANS.setsubi).replace('<dd>承認待ち</dd>', '<dd>承認済み</dd>') +
      '</div>', 'end');
  }

  /* ---------- 進め方 ---------- */
  var actions = {
    login: function (btn) {
      btn.textContent = 'ログイン中…';
      btn.disabled = true;
      btn.classList.remove('sk-hot');
      later(code, 700);
    },
    code: home,
    home: list,
    list: function () { detail(state.rejected ? 'setsubi' : 'toso'); },
    reject: reject,
    rejected: rejected,
    back: list,
    approve: approved
  };

  screen.addEventListener('click', function (e) {
    var el = e.target.closest('[data-go]');
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-go')];
    if (fn) fn(el);
  });

  function start() {
    clearTimers();
    state = { rejected: false, current: null };
    login();
  }

  if (restartBtn) restartBtn.addEventListener('click', start);
  start();
})();
