# DX職人 コラム投稿ボット(LINE)

LINEでテーマを送ると、Claude が記事を書き、gpt-image が見出しごとの画像を作り、サイトのリポジトリに push して公開します。

```
LINE → VPS(このボット) → Claude(記事) → gpt-image(画像) → git push → GitHub Pages
```

## 使い方(LINE側)

| 送る内容 | 動き |
|---|---|
| `IT導入補助金 LINE 見積` のようなテーマ | 記事+画像を作って公開。URLが返る |
| `次` | `data/keywords.json` の未執筆テーマで1本公開 |
| `候補` | 次に書くテーマを5つ表示 |
| `下書き <テーマ>` | 公開せず下書き(noindex・一覧に出ない)で作る |
| `公開 <slug>` | 下書きを公開 |
| `削除 <slug>` | 記事と画像を削除 |
| `一覧` | 最近の記事10本 |
| `ヘルプ` | コマンド一覧 |

1本あたり3〜6分。費用の目安は、文章(Claude)数十円、画像(gpt-image medium 7枚)で100円前後。

## VPSへの設置(Ubuntu想定)

### 1. Node.js 22 とリポジトリ

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo useradd -m -s /bin/bash bot          # ボット専用ユーザー
sudo -iu bot
ssh-keygen -t ed25519 -C "dx-syokunin-bot" # Enter連打でよい
cat ~/.ssh/id_ed25519.pub                 # → GitHub の Deploy keys に「Allow write access」で登録
exit
sudo mkdir -p /srv && sudo chown bot:bot /srv
sudo -iu bot
git clone git@github.com:tenani2023/dx-syokunin-website.git /srv/dx-syokunin-website
cd /srv/dx-syokunin-website && npm ci     # サイトのビルド用
cd bot && npm ci                           # ボット用
cp .env.example .env && nano .env         # キーを入れる
```

GitHub側: リポジトリ > Settings > Deploy keys > Add deploy key(**Allow write access** にチェック)。

### 2. LINE公式アカウント(投稿専用)

1. https://developers.line.biz/ でプロバイダーと **Messaging API** チャネルを作る。
2. 「Messaging API設定」で **チャネルアクセストークン(長期)** を発行 → `.env` の `LINE_CHANNEL_ACCESS_TOKEN`。
3. 「チャネル基本設定」の **チャネルシークレット** → `LINE_CHANNEL_SECRET`。
4. Webhook URL に `https://<ボットのドメイン>/webhook` を設定し、「Webhookの利用」をオン。応答メッセージ(自動応答)はオフ。
5. QRコードから自分のLINEで友だち追加して何か送る → 「登録されていません」と自分のユーザーIDが返るので、`.env` の `ALLOWED_USER_IDS` に入れる。

### 3. HTTPS(Caddy が最も簡単)

LINE の Webhook は HTTPS 必須です。VPSにサブドメイン(例: `bot.<ドメイン>`)のAレコードを向けてから:

```bash
sudo apt-get install -y caddy
sudo tee /etc/caddy/Caddyfile <<'EOF'
bot.example.jp {
    reverse_proxy localhost:3000
}
EOF
sudo systemctl reload caddy
```

### 4. 常駐(systemd)

```bash
sudo cp /srv/dx-syokunin-website/bot/deploy/dx-column-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dx-column-bot
sudo journalctl -u dx-column-bot -f      # ログ
```

### 5. 動作確認

LINEで「ヘルプ」と送る → コマンド一覧が返れば接続OK。
「下書き IT導入補助金 LINE 見積」と送ると、公開せずに1本作れます。

## 手元のPCで試す(LINEなし・pushしない)

`.env` に `LOCAL_MODE=1` と `REPO_DIR=D:\Projects\dx-syokunin`(自分のパス)を入れてから:

```bash
cd bot && npm run gen -- "IT導入補助金 LINE 見積システム" --draft
```

`column/posts/` に記事、`assets/column/<slug>/` に画像ができ、`column/<slug>.html` が生成されます。git には触りません。
`npm run serve`(リポジトリ直下)で http://localhost:8080/column/ を開いて確認できます。

## 更新

```bash
sudo -iu bot
cd /srv/dx-syokunin-website && git pull && npm ci && cd bot && npm ci
exit
sudo systemctl restart dx-column-bot
```

## 記事の書き方を変えたいとき

- 文体・SEOルール: `prompts/article.md`
- 次に書くテーマ: `data/keywords.json`
- CTA文言・カテゴリ・サイトURL: リポジトリ直下の `site.config.json`
