# 🎮 Dashbet - Telegram Gaming Platform

Dashbet is a Telegram Mini App gaming platform with Chicken Road (Mines) and Fast Keno games, integrated with Ethiopian payment systems (Telbirr & CBE Birr).

## Features

- **Chicken Road (Mines)**: 5x5 grid game - avoid bombs, cash out for multiplied winnings
- **Fast Keno**: Pick 1-10 numbers from 1-40, match drawn numbers to win
- **Wallet System**: Deposit via Telbirr/CBE Birr, withdraw to your account
- **Referral Program**: Earn 10 ETB for every friend who deposits 100+ ETB
- **20% Cashback**: Get 20% back on daily losses
- **Promo Codes**: Redeem codes for bonus credits
- **Admin Panel**: Approve/reject deposits and withdrawals via API

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **Bot**: node-telegram-bot-api
- **Frontend**: Vanilla HTML/CSS/JS (Telegram Mini App)

## Deployment on Render

### Step 1: Push to GitHub

```bash
cd dashbet
git init
git add .
git commit -m "Initial commit - Dashbet"
git remote add origin https://github.com/YOUR_USERNAME/dashbet.git
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to [render.com](https://render.com) and sign in
2. Click **New** → **Web Service**
3. Connect your GitHub repo
4. Render will auto-detect the `render.yaml` config
5. Set these environment variables:
   - `TELEGRAM_BOT_TOKEN`: `8454921439:AAEuHjqKo72uxnY2SU7zljA13kUwoMW-5JM`
   - `MINI_APP_URL`: `https://dashbet.onrender.com` (your Render URL)
6. Click **Deploy**

### Step 3: Set Up Telegram Bot

1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/mybots` → Select your bot
3. Go to **Bot Settings** → **Menu Button** → Set URL to your Render URL
4. Go to **Bot Settings** → **Configure Mini App** → Set the Mini App URL

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `MINI_APP_URL` | Your deployed app URL |
| `TELBIRR_PHONE` | Telbirr phone for deposits |
| `CBE_BIRR_PHONE` | CBE Birr phone for deposits |
| `CBE_ACCOUNT_NUMBER` | CBE account for deposits |
| `ADMIN_KEY` | Admin API key (auto-generated on Render) |
| `ADMIN_IDS` | Comma-separated Telegram IDs of admins |

## Admin API

Use the admin key in the `X-Admin-Key` header:

- `GET /api/admin/deposits` - List all deposits
- `POST /api/admin/deposits/:id/approve` - Approve a deposit
- `POST /api/admin/deposits/:id/reject` - Reject a deposit
- `GET /api/admin/withdrawals` - List all withdrawals
- `POST /api/admin/withdrawals/:id/approve` - Approve withdrawal
- `POST /api/admin/withdrawals/:id/reject` - Reject withdrawal
- `GET /api/admin/stats` - Platform statistics

## Default Promo Code

- `DASHBET100` - Gives 50 ETB bonus (first 1000 users)
