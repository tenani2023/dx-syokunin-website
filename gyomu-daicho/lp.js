/* 俺の番頭 LP: 社長がスマホで見積・請求・入金を承認する流れ(画面はイメージ) */
(function () {
  'use strict';

  var screen = document.getElementById('skScreen');
  if (!screen) return;
  var stepsEl = document.getElementById('skSteps');
  var restartBtn = document.getElementById('skRestart');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var LINES = [
    ['足場架設', '300㎡', 270000],
    ['高圧洗浄', '320㎡', 64000],
    ['外壁塗装(シリコン・3回塗り)', '320㎡', 800000],
    ['付帯部塗装(雨樋・破風)', '1式', 68000]
  ];
  var NAV = ['今日', '見積', '請求・入金', '承認待ち'];
  var ORDER = ['quote', 'invoice', 'payment'];

  function bar(on) {
    return '<div class="sk-app__bar"><p class="sk-app__title">俺の番頭</p><p class="sk-app__nav">' +
      NAV.map(function (n) { return '<span' + (n === on ? ' class="is-on"' : '') + '>' + n + '</span>'; }).join('') + '</p></div>';
  }

  function render(html, step) {
    screen.innerHTML = '<div class="sk-app' + (reduce ? '' : ' is-anim') + '">' + html + '</div>';
    var body = screen.querySelector('.sk-app__body');
    if (body) body.scrollTop = 0;
    if (!stepsEl) return;
    var idx = ORDER.indexOf(step);
    Array.prototype.forEach.call(stepsEl.children, function (li, i) {
      li.classList.toggle('is-done', step === 'end' || i < idx);
      li.classList.toggle('is-now', i === idx);
    });
  }

  function hint(text) { return '<p class="sk-app__hint">' + text + '</p>'; }

  /* ---------- 今日 ---------- */
  function today() {
    render(bar('今日') +
      '<div class="sk-app__body">' +
        '<h4>今日やること</h4>' +
        '<p><b>承認してほしい見積(1件)</b></p>' +
        '<div class="sk-app__item">' +
          '<p class="sk-app__item-name">青葉ハイツ 外壁塗装工事</p>' +
          '<p class="sk-app__small">青葉不動産 株式会社 ・ 営業 鈴木</p>' +
          '<p class="sk-app__small">金額：1,322,200 円</p>' +
          '<p style="margin-top:6px"><button type="button" class="sk-app__btn sk-hot" data-go="quote">内容を確認</button></p>' +
        '</div>' +
        '<p><b>まだ入金がない請求(1件)</b></p>' +
        '<div class="sk-app__item">' +
          '<p class="sk-app__item-name">山田建設 株式会社</p>' +
          '<p class="sk-app__small">期日を6日すぎています ・ 295,000 円</p>' +
        '</div>' +
      '</div>', 'quote');
  }

  /* ---------- 1. 見積の承認 ---------- */
  function quote(done) {
    var rows = LINES.map(function (l) {
      return '<tr><td>' + l[0] + '</td><td>' + l[1] + '</td><td>' + l[2].toLocaleString('ja-JP') + '</td></tr>';
    }).join('');
    var ops = done
      ? '<p class="sk-app__done">見積を承認しました。</p>' +
        hint('お客さまから注文が入り、経理が請求書を作りました') +
        '<p><button type="button" class="sk-app__btn sk-hot" data-go="invoice">請求を確認</button></p>'
      : '<div class="sk-app__row" style="margin-top:10px">' +
          '<button type="button" class="sk-app__btn sk-hot" data-go="approveQuote">承認する</button>' +
          '<button type="button" class="sk-app__btn sk-app__btn--line" data-off>差し戻す</button>' +
        '</div>' +
        '<p class="sk-app__small" style="margin-top:6px">直してほしいときは、理由をつけて差し戻せます。</p>';
    render(bar('見積') +
      '<div class="sk-app__body">' +
        '<h4>見積 青葉ハイツ 外壁塗装工事</h4>' +
        '<dl class="sk-app__table"><dt>宛先</dt><dd>青葉不動産 株式会社</dd><dt>工事場所</dt><dd>青葉ハイツ(3階建て・12戸)</dd><dt>工期</dt><dd>11月4日〜11月22日</dd><dt>作成</dt><dd>営業 鈴木</dd></dl>' +
        '<table class="sk-app__lines"><thead><tr><th>品名</th><th>数量</th><th>金額</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<dl class="sk-app__sum"><dt>小計(税抜)</dt><dd>1,202,000円</dd><dt>消費税</dt><dd>120,200円</dd><dt>合計(税込)</dt><dd class="is-amount">1,322,200円</dd></dl>' +
        ops +
      '</div>', done ? 'invoice' : 'quote');
  }

  /* ---------- 2. 請求 / 3. 入金 ---------- */
  function money(kind, done) {
    var isPay = kind === 'payment';
    var rows = isPay
      ? '<dt>お客さま</dt><dd>青葉不動産 株式会社</dd><dt>入金額</dt><dd class="is-amount">1,322,200円</dd><dt>入金日</dt><dd>11月28日</dd><dt>未回収</dt><dd>' + (done ? '<b>0円</b>' : '1,322,200円 → 0円') + '</dd>'
      : '<dt>お客さま</dt><dd>青葉不動産 株式会社</dd><dt>請求額</dt><dd class="is-amount">1,322,200円</dd><dt>支払期日</dt><dd>11月30日</dd><dt>作成</dt><dd>経理 佐藤</dd>';
    var ops;
    if (!done) {
      ops = '<p><button type="button" class="sk-app__btn sk-app__btn--block sk-hot" data-go="' + (isPay ? 'confirmPay' : 'confirmInvoice') + '">承認して確定</button></p>';
    } else if (isPay) {
      ops = '<p class="sk-app__done">回収済みになりました。</p>' +
        '<p class="sk-app__small">見積から入金まで、ひとつの記録でつながっています。</p>';
    } else {
      ops = '<p class="sk-app__done">請求を確定しました。</p>' +
        hint('期日の前に、お客さまから入金がありました') +
        '<p><button type="button" class="sk-app__btn sk-hot" data-go="payment">入金を確認</button></p>';
    }
    render(bar(isPay ? '請求・入金' : '承認待ち') +
      '<div class="sk-app__body">' +
        '<h4>' + (isPay ? '入金の確認' : '請求の確認') + '</h4>' +
        '<p class="sk-app__small">青葉ハイツ 外壁塗装工事</p>' +
        '<dl class="sk-app__table">' + rows + '</dl>' + ops +
      '</div>', done ? (isPay ? 'end' : 'payment') : kind);
  }

  var actions = {
    quote: function () { quote(false); },
    approveQuote: function () { quote(true); },
    invoice: function () { money('invoice', false); },
    confirmInvoice: function () { money('invoice', true); },
    payment: function () { money('payment', false); },
    confirmPay: function () { money('payment', true); }
  };

  screen.addEventListener('click', function (e) {
    var el = e.target.closest('[data-go]');
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-go')];
    if (fn) fn(el);
  });

  if (restartBtn) restartBtn.addEventListener('click', today);
  today();
})();
