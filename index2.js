const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// Set this via: firebase functions:config:set telegram.token="YOUR_BOT_TOKEN"
const BOT_TOKEN = functions.config().telegram.token;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ---------- Telegram helpers ----------

async function tgCall(method, payload) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function sendMessage(chatId, text, opts = {}) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    ...opts,
  });
}

async function answerCallback(callbackQueryId, text) {
  return tgCall("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

function reviewKeyboard(itemId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `approve:${itemId}` },
        { text: "✏️ Edit", callback_data: `edit:${itemId}` },
      ],
      [
        { text: "🔁 Regenerate", callback_data: `regen:${itemId}` },
        { text: "🗑 Kill", callback_data: `kill:${itemId}` },
      ],
    ],
  };
}

// ---------- Firestore helpers ----------

async function logFeedback(contentItemId, patternId, action, instruction = null) {
  await db.collection("feedback_log").add({
    content_item_id: contentItemId,
    pattern_id: patternId || null,
    action,
    instruction,
    at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// short-lived "awaiting edit" state, keyed by chat_id:user_id
function editStateKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

// ---------- Command handlers ----------

async function handlePending(chatId) {
  const snap = await db
    .collection("content_items")
    .where("status", "==", "pending_review")
    .limit(10)
    .get();

  if (snap.empty) {
    await sendMessage(chatId, "Nothing in pending_review right now.");
    return;
  }

  for (const doc of snap.docs) {
    const item = doc.data();
    const preview =
      (item.body?.headline || item.body?.hook_line || item.topic || "").slice(0, 200);
    await sendMessage(
      chatId,
      `*${item.platform.toUpperCase()}* — draft ready\n"${item.topic}"\n\n${preview}`,
      { reply_markup: reviewKeyboard(doc.id) }
    );
  }
}

async function handleStatus(chatId) {
  const statuses = [
    "idea", "drafted", "pending_review", "approved",
    "changes_requested", "scheduled", "posted", "measured",
  ];
  const counts = {};
  for (const s of statuses) {
    const snap = await db.collection("content_items").where("status", "==", s).get();
    counts[s] = snap.size;
  }
  const lines = statuses.map((s) => `${s}: ${counts[s]}`).join("\n");
  await sendMessage(chatId, `*Pipeline status*\n${lines}`);
}

async function handleGenerate(chatId, args) {
  // args: [platform, industry]
  const [platform, industry] = args;
  if (!platform) {
    await sendMessage(chatId, "Usage: /generate <platform> <industry>\ne.g. /generate linkedin real_estate");
    return;
  }
  // This writes an "idea" doc — the actual orchestrator (phase 3, deployed
  // separately or as another function) picks up idea-status docs, selects a
  // pattern, and calls the generation agent. This webhook's job is just the
  // control plane, not generation itself.
  const ref = await db.collection("content_items").add({
    platform,
    status: "idea",
    topic: null,
    pain_point_ref: industry ? `manual_dispatch_${industry}` : null,
    body: {},
    edit_history: [],
    scheduled_for: null,
    posted_at: null,
    performance_ref: null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  await sendMessage(chatId, `Queued for generation: ${platform}${industry ? " / " + industry : ""} (${ref.id})`);
}

async function handleCommand(chatId, text) {
  const [cmd, ...args] = text.trim().split(/\s+/);
  switch (cmd) {
    case "/pending":
      return handlePending(chatId);
    case "/status":
      return handleStatus(chatId);
    case "/generate":
      return handleGenerate(chatId, args);
    default:
      return sendMessage(chatId, "Commands: /pending, /status, /generate <platform> <industry>");
  }
}

// ---------- Callback (button press) handler ----------

async function handleCallback(callbackQuery) {
  const { id: callbackQueryId, data, message, from } = callbackQuery;
  const chatId = message.chat.id;
  const [action, itemId] = data.split(":");
  const itemRef = db.collection("content_items").doc(itemId);
  const itemSnap = await itemRef.get();

  if (!itemSnap.exists) {
    await answerCallback(callbackQueryId, "Item not found — may have been deleted.");
    return;
  }
  const item = itemSnap.data();

  switch (action) {
    case "approve":
      await itemRef.update({ status: "approved", updated_at: admin.firestore.FieldValue.serverTimestamp() });
      await logFeedback(itemId, item.hook_pattern_id, "approved");
      await answerCallback(callbackQueryId, "Approved ✅");
      await sendMessage(chatId, `Approved: ${item.topic || itemId}`);
      break;

    case "edit":
      await db
        .collection("edit_states")
        .doc(editStateKey(chatId, from.id))
        .set({
          item_id: itemId,
          set_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      await answerCallback(callbackQueryId, "Send your edit instructions as your next message.");
      await sendMessage(chatId, "Send your edit instructions now (as a plain reply).");
      break;

    case "regen":
      await itemRef.update({ status: "changes_requested", updated_at: admin.firestore.FieldValue.serverTimestamp() });
      await logFeedback(itemId, item.hook_pattern_id, "regenerated");
      await answerCallback(callbackQueryId, "Regenerating 🔁");
      break;

    case "kill":
      await itemRef.update({ status: "archived", updated_at: admin.firestore.FieldValue.serverTimestamp() });
      await logFeedback(itemId, item.hook_pattern_id, "rejected");
      await answerCallback(callbackQueryId, "Killed 🗑");
      break;

    default:
      await answerCallback(callbackQueryId, "Unknown action.");
  }
}

// ---------- Plain text message handler (edit instruction capture) ----------

async function handleTextMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const stateRef = db.collection("edit_states").doc(editStateKey(chatId, userId));
  const stateSnap = await stateRef.get();

  if (stateSnap.exists) {
    const { item_id } = stateSnap.data();
    const itemRef = db.collection("content_items").doc(item_id);
    const itemSnap = await itemRef.get();
    if (itemSnap.exists) {
      const item = itemSnap.data();
      await itemRef.update({
        status: "changes_requested",
        edit_history: admin.firestore.FieldValue.arrayUnion({
          at: new Date().toISOString(),
          instruction: message.text,
          by: "solomon",
        }),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      await logFeedback(item_id, item.hook_pattern_id, "edited", message.text);
      await sendMessage(chatId, "Got it — queued for regeneration with your instructions.");
    }
    await stateRef.delete();
    return;
  }

  if (message.text?.startsWith("/")) {
    await handleCommand(chatId, message.text);
  }
  // else: plain message with no pending edit state and no command — ignore
}

// ---------- Webhook entry point ----------

exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const update = req.body;

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleTextMessage(update.message);
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    // Still 200 — Telegram retries aggressively on non-200, which can
    // duplicate side effects. Log and move on instead.
    res.status(200).send("error logged");
  }
});
