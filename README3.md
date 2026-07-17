# Fully free deployment — no GCP billing account needed

The only reason you hit that billing prompt is that **Cloud Functions Gen 2** requires a Blaze (pay-as-you-go) billing account attached to the project — even though you'd stay inside the free tier. Firestore itself doesn't require this. So: keep Firestore, drop Cloud Functions, run the same code as a plain Node server on a genuinely free host.

## Free hosting options (pick one)

| Host | Free tier notes |
|---|---|
| **Render.com** | Free web service, sleeps after ~15 min idle, wakes on next request (few sec delay). No card required for free tier. Recommended — simplest setup. |
| **Fly.io** | Free allowance, doesn't sleep the same way, slightly more CLI setup. |
| **Railway.app** | Free trial credit, then a small monthly cap — good for testing, may need a plan later if this becomes real production traffic. |

Instructions below use **Render**, since it's the least setup for what you need. Same code works on any of them.

---

## 1. Get a Firestore service account key (still free, Spark plan)

1. Firebase Console → your project → gear icon → **Project Settings**
2. **Service Accounts** tab → **Generate new private key**
3. This downloads a `.json` file — you'll paste its *entire contents* into an environment variable, not commit it to a repo

If your project doesn't have Firestore enabled yet: Console → Build → Firestore Database → **Create database** → Native mode → pick a region. No billing prompt should appear for this step — if it does, make sure you're not accidentally on a project that already tried to enable Cloud Functions.

## 2. Push this code to a GitHub repo

Render deploys from a GitHub repo. Create a new repo, add `server.js` and `package.json` from this folder, push.

## 3. Create the Render service

1. [render.com](https://render.com) → sign up (no card needed for free tier) → **New +** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. **Environment variables** (Render dashboard → Environment):
   - `TELEGRAM_BOT_TOKEN` = your bot token from BotFather
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = the *entire contents* of the service account JSON file, pasted as one line (Render's env var field accepts multi-line/JSON fine — just paste the whole thing)
5. Deploy. Render gives you a URL like `https://your-service-name.onrender.com`

## 4. Point Telegram at it

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-service-name.onrender.com/telegram-webhook"
```

Confirm:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

## 5. Test

In your Telegram group:
```
/status
```

## The one real tradeoff vs Cloud Functions

Render's free tier **sleeps after ~15 minutes of no traffic** and takes a few seconds to wake on the next request. For a Telegram bot that's mostly fine — Telegram will just show "typing" a beat longer on the first message after idle. If that bugs you later, two free-ish fixes:
- A free uptime pinger (e.g. UptimeRobot) hitting your `/` health-check route every 10 min keeps it awake
- Or move to Fly.io, which doesn't sleep the same way

Neither requires a credit card or billing account — this whole path stays genuinely free while you're validating the system.

## What's unchanged from the Cloud Functions version

Same Firestore schema, same command set (`/status`, `/pending`, `/generate`), same approve/edit/regen/kill button logic. Only the hosting layer changed — everything downstream (orchestrator, generation agent, scheduler) still just reads/writes the same `content_items` collection, so nothing else in the spec needs to change because of this switch.
