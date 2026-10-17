# DX職人 コラム投稿ボット(LINE)

LINEでテーマを送ると、OpenAI(gpt-5.5)が記事を書き、gpt-image が見出しごとの画像を作り、サイトのリポジトリに push して公開します。

```
LINE → VPS(このボット) → OpenAI(記事) → gpt-image(画像) → ビルドして即公開(dx-syokunin.jp) + git push(GitHub)
```

## 使い方(LINE側)

| 送る内容 | 動き |
|---|---|
| メニュー「コラム投稿」/ `候補` | Search Console・GA4・既存記事・キーワード表をもとに「次に書くべき4本」を理由付きで提案。**ボタン(クイックリプライ)をタップすると、その記事を作って公開** |
| `下書き候補` | 同じ提案だが、タップすると下書きで作る |
| ボタン「別の候補」 | 提案済みを除いて、もう4本 |
| ボタン「自分で入力」 | 次に送った文章をテーマにして1本作る |
| `テーマ <内容>` | その内容で記事+画像を作って公開 |
| `下書き <内容>` | 公開せず下書き(noindex・一覧に出ない)で作る |
| `公開 <slug>` | 下書きを公開 |
| `削除 <slug>` | 記事と画像を削除 |
| `一覧` | 最近の記事10本 |
| `ヘルプ` | コマンド一覧 |

候補には「改稿」も含まれます(表示は多いのに順位やCTRが伸びない記事を、同じURLのまま書き直す)。
`SUGGEST_CRON`(既定: 毎週月曜8:00)に、管理者へ候補が自動で届きます。
上の決まった形以外の文章では記事を作りません(公式アカウントでの普段のやりとりで誤って公開しないため)。

## 管理者・スタッフ

公式アカウント「-公式-DX職人 お問合せ」(@385peiyb)はお客さまとのチャットと共用。ボットは管理者・スタッフ以外には反応しない(下の合言葉を除く)。

- **管理者**: `.env` の `ADMIN_USER_IDS`。スタッフ申請の承認・却下、`スタッフ一覧`、`スタッフ停止 <名前>`。
- **スタッフ登録**: LINE で `スタッフ登録` → 名前 → 確認 → 管理者に「承認 / 却下」ボタン付きの通知 → 承認でスタッフになり、管理者と同じように投稿できる(投稿の承認は不要)。
- 名簿は VPS の `bot/var/staff.json`(正)と、スプレッドシートの「スタッフ」タブ(写し)。
- **リッチメニュー**: 管理者・スタッフにだけ個別に付ける(デフォルトにはしない)。いまは「コラム投稿」1枠。画像はデスクトップの `開発環境/canva-rich/generate_dx_syokunin_staff_richmenu.js` で作って `bot/assets/richmenu-staff.png` にコピーし、VPS で `npm run richmenu`(作り直して全員にリンク)。
- 自分の LINE ユーザーIDを知りたいときは `コラム登録` と送る。

1本あたり3〜6分。費用の目安は、文章(gpt-5.5)数十円、画像(gpt-image medium 7枚)で100円前後。候補の提案は1回数十円。

## Google 連携(候補の精度を上げる・記録を残す)

無くても動きますが、つなぐと「実際に検索されている語」をもとに候補を選べます。
サービスアカウントは tenani-project(dx-line)のものを流用: **dxline@dxline.iam.gserviceaccount.com**(GCP プロジェクト `dxline`)。鍵は VPS の `/srv/dx-syokunin-website/bot/google-key.json`(git には入らない)。

1. **API を有効化**(プロジェクト dxline。Sheets は有効済み):
   - Search Console API: https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=dxline
   - Analytics Data API: https://console.developers.google.com/apis/api/analyticsdata.googleapis.com/overview?project=dxline
2. **Search Console**: `dx-syokunin.jp` をドメインプロパティで登録(DNS の TXT で確認)→ 設定 > ユーザーと権限 で上のメールを**フル**で追加。`.env` の `GSC_SITE_URL=sc-domain:dx-syokunin.jp`。
3. **スプレッドシート**(記録用): 上のメールを**編集者**で共有。`.env` の `SHEET_ID` に URL の `/d/` と `/edit` の間の ID。タブ(記事・検索クエリ・候補・ログ)はボットが自動で作る。
4. **GA4**: プロパティを作り、測定ID(`G-…`)をリポジトリの `site.config.json` の `ga4` に入れて `npm run build`(トップと contact は手書きなので別途タグを入れる)。プロパティID(数字)を `.env` の `GA4_PROPERTY_ID` に。管理 > プロパティのアクセス管理 で上のメールを**閲覧者**で追加。

## VPS(163.44.110.129)の構成

tenani-project と同じ VPS(Ubuntu 24.04、root、nginx + certbot + pm2、Node 20 は nvm)。ディレクトリだけ分けている。
接続: `ssh -i <tenani-project/dx-line/key-2025-11-05-14-13.pem> root@163.44.110.129`

```
dx-syokunin.jp ─ nginx ─┬─ /            → /srv/dx-syokunin-website (静的ファイルをそのまま配信)
                        ├─ /webhook     → 127.0.0.1:3200 (LINE)
                        └─ /deploy      → 127.0.0.1:3200 (GitHub の push 通知 → git pull → 再生成)
pm2: dx-syokunin-bot  (cwd /srv/dx-syokunin-website/bot, src/index.mjs)
```

- サイトは GitHub Pages ではなく VPS 上のリポジトリを直接配信する。ボットが記事を作ると、その場でビルドされて即反映、同時に GitHub にも push される(バックアップ兼、github.io 側も更新)。
- PC から GitHub に push したときは、GitHub Webhook(`/deploy`)が VPS を更新する。保険として cron で 10 分おきに `git pull --ff-only && build` も回す。
- git の origin は fetch が https(鍵不要)、push が ssh(VPS の鍵 `/root/.ssh/id_ed25519_dx_syokunin` を GitHub の Deploy keys に **Allow write access** で登録)。

### 設置(済)の要点

```bash
git clone https://github.com/tenani2023/dx-syokunin-website.git /srv/dx-syokunin-website
cd /srv/dx-syokunin-website && git remote set-url --push origin git@github.com:tenani2023/dx-syokunin-website.git
npm ci && (cd bot && npm ci)
cp /dx-line/dxline-b15eb08bb4b5.json bot/google-key.json
cp bot/deploy/nginx-dx-syokunin-proxy.conf /etc/nginx/snippets/dx-syokunin-proxy.conf
cp bot/deploy/nginx-dx-syokunin.jp.conf /etc/nginx/sites-available/dx-syokunin.jp
ln -s /etc/nginx/sites-available/dx-syokunin.jp /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d dx-syokunin.jp --redirect
pm2 start bot/deploy/ecosystem.config.cjs && pm2 save
```

### LINE 公式アカウント(投稿専用・新規チャネル)

1. https://developers.line.biz/ で **Messaging API** チャネルを作る。
2. チャネルアクセストークン(長期)→ `LINE_CHANNEL_ACCESS_TOKEN`、チャネルシークレット → `LINE_CHANNEL_SECRET`。値は手元の `bot/.env` に書き、VPS へは `scp` で送る(チャットに貼らない)。
3. Webhook URL: `https://dx-syokunin.jp/webhook` → 検証 → 「Webhookの利用」オン。応答メッセージ・あいさつメッセージはオフ。
4. 友だち追加して「コラム登録」と送る → 自分のユーザーIDが返るので `ALLOWED_USER_IDS` に入れて `pm2 restart dx-syokunin-bot`。

チャネルはお問い合わせ用の公式アカウント「-公式-DX職人 お問合せ」(@385peiyb)と共用。ボットは登録したユーザー以外には一切反応しない(合言葉「コラム登録」を除く)ので、お客さまとのチャットはこれまでどおり LINE Official Account Manager で行える。

### 動作確認・運用

```bash
pm2 logs dx-syokunin-bot            # ログ
pm2 restart dx-syokunin-bot         # .env を変えたら
cd /srv/dx-syokunin-website/bot && npm run deploy   # 手動で pull + 再生成
```

LINEで「ヘルプ」→ コマンド一覧が返れば接続OK。「下書き IT導入補助金 LINE 見積」で公開せずに1本作れる。

## 手元のPCで試す(LINEなし・pushしない)

`.env` に `LOCAL_MODE=1` と `REPO_DIR=D:\Projects\dx-syokunin`(自分のパス)を入れてから:

```bash
cd bot && npm run gen -- "IT導入補助金 LINE 見積システム" --draft
```

`column/posts/` に記事、`assets/column/<slug>/` に画像ができ、`column/<slug>.html` が生成されます。git には触りません。
`npm run serve`(リポジトリ直下)で http://localhost:8080/column/ を開いて確認できます。

## 更新(ボットのコードを変えたとき)

PC から GitHub に push すれば `/deploy` で VPS に反映される。ボット本体(bot/)を変えた場合はさらに:

```bash
ssh -i <pem> root@163.44.110.129 'cd /srv/dx-syokunin-website/bot && npm ci --omit=dev && pm2 restart dx-syokunin-bot'
```

## 記事の書き方を変えたいとき

- 文体・SEOルール: `prompts/article.md`
- 次に書くテーマ: `data/keywords.json`
- CTA文言・カテゴリ・サイトURL: リポジトリ直下の `site.config.json`
