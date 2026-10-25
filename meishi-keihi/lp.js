/* 俺の精算係 LP: LINEのトークの再現(文言は製品の原文。店名・金額・番号は架空) */
(function () {
  'use strict';

  var log = document.getElementById('mkLog');
  var foot = document.getElementById('mkFoot');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.mk-demo__tab'));
  if (!log || !foot) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 手入力の日付ボタン(今日・昨日・おととい)
  function md(offset) {
    var d = new Date();
    d.setDate(d.getDate() - offset);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function ymd(offset) {
    var d = new Date();
    d.setDate(d.getDate() - offset);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  var USUAL = ['📸 撮影する', '🖼️ 写真を選ぶ', '🗂 確認待ち', '🧾 経費', '📇 名刺'];
  var RECEIVED = '🧾 経費として受け付けました。読み取り中です（数秒〜1分）。\n終わったら確認カードが届きます。続けて別の写真を送っても大丈夫です。';

  function expenseCard(o) {
    return {
      flex: {
        band: '🧾 経費の確認', amount: o.amount, sub: o.shop,
        rows: [
          ['利用日', o.date], ['勘定科目', '未設定・事務担当が確認'], ['支払元', o.source],
          ['税率内訳', o.tax], ['インボイス', o.invoice || 'なし'], ['品目', o.items || '—'], ['メモ', '—']
        ],
        fix: o.fix, info: ['ℹ️ 科目は未設定のまま申請できます（事務担当が確認して補完します）。', o.footnote],
        btn: o.btn, btns: [['金額', '日付', '支払先'], ['支払元', '科目', 'その他'], ['取消']]
      }
    };
  }

  var SCENES = {
    expense: {
      hint: '現場の職人さんが、立て替えたレシートを送る場面です',
      steps: [
        { label: '📸 レシートの写真を送る', me: { photo: 'receipt' },
          bot: [{ text: RECEIVED }, expenseCard({
            amount: '¥3,280', shop: '〇〇ホームセンター', date: '2026-10-20 12:31', source: '未選択',
            tax: '10%: ¥3,280（税¥298）', invoice: 'T0000000000000', items: 'ガムテープ / 養生シート',
            fix: ['申請の前に直すこと（1件）', '・支払元（立替・会社カードなど）を選んでください。'],
            footnote: '読取結果です。金額・日付は画像と見比べてください。', btn: '支払元を選ぶ'
          })] },
        { label: '「支払元を選ぶ」を押す', me: { text: '支払元を選ぶ' },
          bot: [{ text: '支払元を選んでください。\n・立替（従業員）（立替・後で本人に精算）\n・会社カード\n・小口現金（会社の現金）\n・会社口座振込\n\n⭐ を選ぶと次回から自動で入ります。⭐なしは今回だけです。',
            qr: ['立替（従業員）', '⭐いつも:立替（従業員）', '会社カード', '⭐いつも:会社カード', '小口現金', '⭐いつも:小口現金'] }] },
        { label: '「⭐いつも:立替（従業員）」を押す', me: { text: '立替（従業員）（次回からも使う）' },
          bot: [expenseCard({
            amount: '¥3,280', shop: '〇〇ホームセンター', date: '2026-10-20 12:31',
            source: '立替（従業員）（立替・後で本人に精算）・いつもの支払元',
            tax: '10%: ¥3,280（税¥298）', invoice: 'T0000000000000', items: 'ガムテープ / 養生シート',
            footnote: '読取結果です。金額・日付は画像と見比べてください。', btn: '📨 支払元と内容を確認して申請'
          })] },
        { label: '「📨 支払元と内容を確認して申請」を押す', me: { text: '支払元と内容を確認して申請' },
          bot: [{ flex: { band: '📨 申請しました（管理者の承認待ち）', amount: '¥3,280', sub: '2026-10-20  〇〇ホームセンター', meta: 'EXP-0001 / 科目は事務担当が確認', done: true }, qr: USUAL }] }
      ]
    },
    manual: {
      hint: '感熱紙がかすれて、読み取れなかった場面です',
      steps: [
        { label: '📸 かすれたレシートを送る', me: { photo: 'receipt-blur' },
          bot: [{ text: RECEIVED }, { text: '⚠️ 読み取れませんでした。明るい場所で、全体が写るように撮り直してください。\n（問い合わせ番号 D-4F7A21C9）',
            qr: ['✏️ 手入力で登録', '📸 撮影する', '🖼️ 写真を選ぶ', '🗂 確認待ち', '🧾 経費'] }] },
        { label: '「✏️ 手入力で登録」を押す', me: { text: '手入力で登録' },
          bot: [{ text: '✏️ 手入力で登録します。レシートを見ながら、4つの質問に答えてください。最後に確認カードが出ます。' },
            { text: '（1/4） 合計金額（税込）を、数字だけで送ってください。\n例: 1280\n（対象: 日付未入力 支払先未入力 —）', qr: ['キャンセル'] }] },
        { label: '「800」と送る', me: { text: '800' },
          bot: [{ text: '（2/4） 消費税率はどれですか？\n食品・飲み物（店内飲食・お酒を除く）や新聞は 8%、それ以外はふつう 10% です。',
            qr: ['10%', '8%（食品など）', '分からない・両方', 'キャンセル'] }] },
        { label: '「10%」を押す', me: { text: '10%' },
          bot: [{ text: '（3/4） 利用日（レシートの日付）を選んでください。\nほかの日は「10/12」のように送ってください。',
            qr: ['今日 ' + md(0), '昨日 ' + md(1), 'おととい ' + md(2), '📅 カレンダー', 'キャンセル'] }] },
        { label: '「今日」を押す', me: { text: '今日 ' + md(0) },
          bot: [{ text: '（4/4） 支払先（お店・会社の名前）を送ってください。\n例: 〇〇商店 本店', qr: ['省略する', 'キャンセル'] }] },
        { label: '「〇〇パーキング」と送る', me: { text: '〇〇パーキング' },
          bot: [expenseCard({
            amount: '¥800', shop: '〇〇パーキング', date: ymd(0),
            source: '立替（従業員）（立替・後で本人に精算）・いつもの支払元', tax: '10%: ¥800',
            footnote: '手入力の内容です。レシートと見比べてから申請してください。', btn: '📨 支払元と内容を確認して申請'
          })] }
      ]
    },
    returned: {
      hint: '事務担当が、金額の違いに気づいて差し戻した場面です',
      intro: [{ text: '↩️ 経費 EXP-0001 が差し戻されました。\n内容: 10/20 〇〇ホームセンター ¥3,280\n理由: 金額がレシートと違います\n\n下のボタンで直すと、もう一度申請されます。直すところが無ければ「このまま出し直す」。ほかの項目は事務担当に伝えてください。',
        qr: ['💴 金額を直す', '📅 日付を直す', '🏪 支払先を直す', '📨 このまま出し直す'] }],
      steps: [
        { label: '「💴 金額を直す」を押す', me: { text: '金額を直す' },
          bot: [{ text: '💴 合計金額（税込）を、数字だけで送ってください。\n例: 1280\n（対象: 10/20 〇〇ホームセンター ¥3,280）', qr: ['キャンセル'] }] },
        { label: '「3580」と送る', me: { text: '3580' },
          bot: [{ text: '📨 EXP-0001 を出し直しました（承認待ち）。\n内容: 10/20 〇〇ホームセンター ¥3,580\nほかにも直すときは下のボタンから。',
            qr: ['💴 金額を直す', '📅 日付を直す', '🏪 支払先を直す'] }] }
      ]
    },
    card: {
      hint: '打ち合わせで、名刺をもらった場面です',
      steps: [
        { label: '「名刺」と送る', me: { text: '名刺' },
          bot: [{ text: '📇 名刺\n名刺を撮影するか、写真を選んでください。1枚につき1件として受け付けます。\n登録した名刺は本人と管理者だけが見られます（共有は管理画面から）。' }] },
        { label: '📸 名刺の写真を送る', me: { photo: 'card' },
          bot: [{ text: '📇 名刺として受け付けました。読み取り中です（数秒〜1分）。\n終わったら確認カードが届きます。続けて別の写真を送っても大丈夫です。' },
            { flex: { band: '📇 名刺の確認', navy: true, amount: '山田 太郎', sub: '〇〇建設株式会社 / 工事部 / 主任',
              rows: [['フリガナ', 'ヤマダ タロウ'], ['メール', 'taro@example.jp'], ['電話', '03-0000-0000'], ['携帯', '090-0000-0000'], ['住所', '東京都〇〇区1-2-3'], ['URL', 'https://example.jp'], ['メモ', '—']],
              btn: '✅ この内容で登録', btns: [['編集', '取消']] } }] },
        { label: '「✅ この内容で登録」を押す', me: { text: 'この内容で登録' },
          bot: [{ text: '✅ 名刺を登録しました（CT-0001）\n〇〇建設株式会社 山田 太郎\n\n続けて登録する場合は次の名刺を送ってください。', qr: USUAL }] }
      ]
    }
  };

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

  function photo(kind) {
    var m = el('div', 'mk-msg mk-msg--me mk-msg--photo');
    if (kind === 'card') {
      var c = el('span', 'mk-bizcard');
      c.appendChild(el('small', null, '〇〇建設株式会社 工事部 主任'));
      c.appendChild(el('b', null, '山田 太郎'));
      c.appendChild(el('i')); c.appendChild(el('i'));
      m.appendChild(c);
      m.setAttribute('aria-label', '名刺の写真');
      return m;
    }
    var r = el('span', 'mk-receipt' + (kind === 'receipt-blur' ? ' mk-receipt--blur' : ''));
    r.appendChild(el('b', null, kind === 'receipt-blur' ? '〇〇パーキング' : '〇〇ホームセンター'));
    r.appendChild(el('i')); r.appendChild(el('i')); r.appendChild(el('i'));
    var s = el('i'); s.className = 's'; r.appendChild(s);
    r.appendChild(el('b', 't', kind === 'receipt-blur' ? '合計 ¥800' : '合計 ¥3,280'));
    m.appendChild(r);
    m.setAttribute('aria-label', 'レシートの写真');
    return m;
  }

  function flex(f) {
    var box = el('div', 'mk-flex' + (f.done ? ' mk-flex--done' : ''));
    box.appendChild(el('p', 'mk-flex__band' + (f.navy ? ' mk-flex__band--navy' : ''), f.band));
    var body = el('div', 'mk-flex__body');
    body.appendChild(el('p', 'mk-flex__amount', f.amount));
    if (f.sub) body.appendChild(el('p', 'mk-flex__sub', f.sub));
    if (f.meta) body.appendChild(el('p', 'mk-flex__meta', f.meta));
    if (f.rows) {
      var dl = el('dl', 'mk-flex__rows');
      f.rows.forEach(function (r) {
        var d = el('div');
        d.appendChild(el('dt', null, r[0]));
        d.appendChild(el('dd', null, r[1]));
        dl.appendChild(d);
      });
      body.appendChild(dl);
    }
    if (f.fix) {
      var fx = el('div', 'mk-flex__fix');
      fx.appendChild(el('b', null, f.fix[0]));
      fx.appendChild(el('span', null, f.fix[1]));
      body.appendChild(fx);
    }
    if (f.info) {
      var inf = el('div', 'mk-flex__info');
      f.info.forEach(function (t) { if (t) inf.appendChild(el('p', null, t)); });
      body.appendChild(inf);
    }
    if (f.btn) body.appendChild(el('p', 'mk-flex__btn', f.btn));
    (f.btns || []).forEach(function (row) {
      var p = el('p', 'mk-flex__btns' + (row.length === 2 ? ' mk-flex__btns--2' : ''));
      if (row.length === 1) p.style.gridTemplateColumns = '1fr';
      row.forEach(function (t) { p.appendChild(el('span', null, t)); });
      body.appendChild(p);
    });
    box.appendChild(body);
    return box;
  }

  function botMessage(msg) {
    var m = el('div', 'mk-msg mk-msg--bot');
    if (msg.text) m.appendChild(el('p', null, msg.text));
    if (msg.flex) m.appendChild(flex(msg.flex));
    if (msg.qr) {
      var q = el('div', 'mk-qr');
      msg.qr.forEach(function (t) { q.appendChild(el('span', null, t)); });
      m.appendChild(q);
    }
    return m;
  }

  var scene = null, index = 0, timers = [];
  function clearTimers() { timers.forEach(window.clearTimeout); timers = []; }

  function showSuggest(focus) {
    foot.textContent = '';
    var step = scene.steps[index];
    var btn;
    if (!step) {
      btn = el('button', 'mk-suggest mk-suggest--again', 'もう一度ためす');
      btn.type = 'button';
      btn.addEventListener('click', function () { start(scene, true); });
    } else {
      foot.appendChild(el('p', 'mk-foot__label', 'タップして送信'));
      btn = el('button', 'mk-suggest');
      btn.type = 'button';
      btn.appendChild(el('span', 'mk-suggest__text', step.label));
      var ic = el('span', 'mk-suggest__icon');
      ic.appendChild(icon('i-send'));
      btn.appendChild(ic);
      btn.addEventListener('click', send);
    }
    foot.appendChild(btn);
    log.scrollTop = log.scrollHeight;
    if (focus) btn.focus({ preventScroll: true });
  }

  function send() {
    var step = scene.steps[index];
    var hadFocus = foot.contains(document.activeElement);
    foot.textContent = '';
    add(step.me.photo ? photo(step.me.photo) : el('p', 'mk-msg mk-msg--me', step.me.text));
    var delay = 0;
    step.bot.forEach(function (msg, i) {
      var typing = null;
      timers.push(window.setTimeout(function () {
        if (reduce) return;
        typing = el('div', 'mk-msg mk-msg--bot');
        var dots = el('span', 'mk-typing');
        dots.setAttribute('aria-hidden', 'true');
        dots.appendChild(el('i')); dots.appendChild(el('i')); dots.appendChild(el('i'));
        typing.appendChild(dots);
        add(typing);
      }, delay));
      delay += reduce ? 0 : (msg.flex ? 1300 : 700);
      timers.push(window.setTimeout(function () {
        if (typing && typing.parentNode) log.removeChild(typing);
        add(botMessage(msg));
        if (i === step.bot.length - 1) {
          index += 1;
          showSuggest(hadFocus);
        }
      }, delay));
      delay += reduce ? 0 : 250;
    });
  }

  function start(s, focus) {
    clearTimers();
    scene = s; index = 0;
    log.textContent = '';
    log.classList.toggle('is-anim', !reduce);
    add(el('p', 'mk-msg mk-msg--hint', s.hint));
    (s.intro || []).forEach(function (m) { add(botMessage(m)); });
    showSuggest(focus);
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.setAttribute('aria-pressed', t === tab ? 'true' : 'false'); });
      start(SCENES[tab.getAttribute('data-scene')], false);
    });
  });
  start(SCENES.expense, false);
})();
