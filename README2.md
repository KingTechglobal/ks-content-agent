# Getting this fully online — step by step

## 0. Prerequisites
- Node.js installed locally (18+)
- `npm install -g firebase-tools`
- A Firebase project created (console.firebase.google.com) with **Firestore enabled** (Native mode)
- Your Telegram bot token from BotFather
- Your Telegram group (supergroup, Topics enabled) — bot must already be added as admin

## 1. Log in and init

```bash
firebase login
cd telegram-bot
firebase init functions
```
When prompted: pick your existing project, choose JavaScript, say **no** to ESLint (or yes if you want it), say **no** to installing dependencies now (you'll do it below).

This creates a `functions/` folder — replace its `index.js` and `package.json` with the ones I've given you (or copy mine in).

## 2. Install dependencies

```bash
cd functions
npm install
```

## 3. Set your bot token as a secret config value

Never hardcode the token in the file. Set it via Firebase config:

```bash
firebase functions:config:set telegram.token="YOUR_BOT_TOKEN_HERE"
```

## 4. Deploy

```bash
firebase deploy --only functions
```

This gives you a URL like:
```
https://us-central1-YOUR_PROJECT.cloudfunctions.net/telegramWebhook
```
Copy that — you need it next.

## 5. Point Telegram at your function

Run this once (replace both placeholders):

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_CLOUD_FUNCTION_URL>"
```

You should get back `{"ok":true,"result":true,"description":"Webhook was set"}`.

Verify it's live:
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```
`url` should show your Cloud Function, and `last_error_message` should be empty.

## 6. Test it

In your Telegram group, type:
```
/status
```
You should get a reply with pipeline counts (all zeros if Firestore is empty — that's expected on first run).

Try:
```
/generate linkedin real_estate
```
This writes an `idea`-status doc to `content_items` in Firestore — confirm it in the Firebase console.

## What this webhook does NOT do yet

This is the **control plane only** — phase 1's Telegram routing, wired to real Firestore. It does not:
- Actually run the orchestrator (phase 3 — pattern selection + prompt assembly)
- Call the generation agent (Gemini via Antigravity, per your stack)
- Schedule or publish anything (phase 4)

Those are separate Cloud Functions / cron jobs (Cloud Scheduler + Pub/Sub triggering additional functions) that read from the same Firestore collections this webhook writes to and reacts to. This piece just makes sure your thumb-taps and typed commands in Telegram turn into real database state — everything downstream plugs into the same `content_items` collection.

## Immediate next step

The orchestrator (phase 3) needs to exist as its own scheduled Cloud Function that:
1. Queries `content_items` where `status == "idea"`
2. Runs pattern selection against `style_patterns`
3. Calls your generation agent
4. Writes the result back with `status: "drafted"` → triggers a follow-up function that posts it to Telegram as `pending_review`

Want me to write that piece next, so `/generate` actually produces a draft instead of just queuing an empty idea doc?
