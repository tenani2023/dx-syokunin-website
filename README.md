# DX職人 サイト

建設・不動産向けにLINEで使えるAIシステムを提供する「DX職人」のサイト。
**https://dx-syokunin.jp** で公開(VPS 163.44.110.129 の nginx が、このリポジトリをそのまま配信)。

## 構成

```
index.html, contact/, style.css, script.js   … 手書きのページ
column/posts/*.md                            … コラムの原稿(Markdown)。ここだけ編集する
column/*.html, column/category/, column/feed.xml, sitemap.xml, 404.html
                                             … npm run build で自動生成(直接編集しない)
assets/column/<slug>/hero.jpg, s1.jpg …      … コラムの画像
site.config.json                             … サイトURL・カテゴリ・CTA文言・GA4
tools/                                       … ビルド・ローカルサーバー
bot/                                         … LINEから投稿するボット(VPSで動かす)
_products/                                   … 商品の受け渡し用(git管理外)
```

## 反映の流れ(メンバー向け)

```
あなたが GitHub の main に push
  → GitHub Webhook が VPS に通知(数秒)
  → VPS が取り込み → npm run build → dx-syokunin.jp に即反映
  → 作り直したファイルがあれば VPS が「サイトを再生成」としてコミットして push
```

- デザイン変更(index.html / style.css / script.js / 画像)も、コラムの原稿も、**main に push するだけ**で反映される。
- CSS・JS はブラウザが毎回更新を確認する設定なので、`?v=` を上げなくても反映される。
- 通知が届かなかったときの保険として、VPS は10分おきにも GitHub を確認している。
- LINE ボットも同じリポジトリに記事をコミットして push する。push が拒否されたら、`git pull --rebase` してから push し直す。
- 生成物(column/*.html など)を手で直さない。原稿か tools/ を直す。
- VPS 上のファイルを直接編集しない(次の更新で消える)。
- 反映に失敗したときは、管理者の LINE に通知が届く。

## コラムを書く・直す

```bash
npm ci            # 初回のみ
npm run build     # column/posts/*.md → HTML・一覧・カテゴリ・sitemap・RSS
npm run serve     # http://localhost:8080/ で確認
```

- 原稿は `column/posts/<slug>.md`。先頭の `---` の間に title / date / category / description などを書き、本文は `##` 見出しと段落。画像は `![代替テキスト](<slug>/s1.jpg)`。
- `draft: true` を付けると、ページは作られるが一覧・sitemap に出ず noindex になる。
- 手元でビルドし忘れて push しても、VPS がビルドする。
- LINEから投稿する場合は `bot/README.md`。
