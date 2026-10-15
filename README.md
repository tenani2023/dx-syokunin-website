# DX職人 サイト

建設・不動産向けにLINEで使えるAIシステムを提供する「DX職人」のサイト。GitHub Pages で公開。

## 構成

```
index.html, contact/, style.css, script.js   … 手書きのページ
column/posts/*.md                            … コラムの原稿(Markdown)。ここだけ編集する
column/*.html, column/category/, column/feed.xml, sitemap.xml
                                             … npm run build で自動生成(直接編集しない)
assets/column/<slug>/hero.jpg, s1.jpg …      … コラムの画像
site.config.json                             … サイトURL・カテゴリ・CTA文言
tools/                                       … ビルド・ローカルサーバー
bot/                                         … LINEから投稿するボット(VPSで動かす)
_products/                                   … 商品の受け渡し用(git管理外)
```

## コラムを書く・直す

```bash
npm ci            # 初回のみ
npm run build     # column/posts/*.md → HTML・一覧・カテゴリ・sitemap・RSS
npm run serve     # http://localhost:8080/ で確認
```

- 原稿は `column/posts/<slug>.md`。先頭の `---` の間に title / date / category / description などを書き、本文は `##` 見出しと段落。画像は `![代替テキスト](<slug>/s1.jpg)`。
- `draft: true` を付けると、ページは作られるが一覧・sitemap に出ず noindex になる。
- GitHub に push すると、Actions が同じビルドを実行して生成物をコミットする(手元でビルドし忘れても反映される)。
- LINEから投稿する場合は `bot/README.md`。

## 公開URLを変えるとき(独自ドメイン)

`site.config.json` の `url` を変えて `npm run build`。GitHub Pages のカスタムドメイン設定と `CNAME` ファイルもあわせて用意する。
