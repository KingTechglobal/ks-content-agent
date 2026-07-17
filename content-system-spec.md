# Content system — data & control plane spec (phase 1)

Covers the Firestore schema and the Telegram bot command structure. This is the spine everything else (generation agents, style engine, scheduler) plugs into.

---

## 1. Firestore collections

### `content_items`
One document per piece of content, regardless of platform.

```
content_items/{itemId}
{
  platform: "linkedin" | "instagram" | "tiktok" | "youtube" | "carousel",
  status: "idea" | "drafted" | "pending_review" | "approved" |
          "changes_requested" | "scheduled" | "posted" | "measured" | "archived",

  hook_pattern_id: "contrarian_hook_v1",   // ref to style_patterns
  topic: "why most Nigerian SMEs waste ad spend on Facebook",
  pain_point_ref: "sme_ecom_002",          // ref to your pain-point research doc

  body: {
    // shape differs by platform — script agent output vs article agent output
    // LinkedIn: { headline, hook, body_text, cta }
    // Script (IG/TikTok): { hook_line, beats: [ {vo_line, visual_note, duration_s} ], cta }
    // Carousel: { slides: [ {slide_no, heading, body} ] }
  },

  media_brief: "string, optional — notes for video/design production",

  telegram: {
    chat_id: "-100xxxxxxxxxx",
    message_id: 4821,
    thread: "linkedin" | "shorts" | "carousel" | "digest"
  },

  edit_history: [
    { at: timestamp, instruction: "make the hook sharper, less generic", by: "solomon" }
  ],

  scheduled_for: timestamp | null,
  posted_at: timestamp | null,
  performance_ref: "platform_performance/{id}" | null,

  created_at: timestamp,
  updated_at: timestamp
}
```

**Status transitions:**
```
idea → drafted → pending_review → approved → scheduled → posted → measured → archived
                        ↓
                changes_requested → drafted (regenerate loop)
```

### `style_patterns`
Your reusable framework library (see phase 2 below) — referenced by `hook_pattern_id`.

```
style_patterns/{patternId}
{
  name: "contrarian_hook_v1",
  platform: "any" | "linkedin" | "short_form",
  structure_description: "opens by naming a common belief, then flatly contradicts it in sentence 2",
  example_use_cases: ["pricing myths", "productivity advice", "hiring advice"],
  usage_count: 0,
  approval_count: 0,        // approval_rate = approval_count / usage_count
  last_used_at: timestamp
}
```

### `tax_obligations`
Fully decoupled from content — separate concern, same bot.

```
tax_obligations/{taxId}
{
  name: "VAT filing — Q3",
  due_date: timestamp,
  recurrence: "monthly" | "quarterly" | "annual" | "once",
  status: "upcoming" | "reminded" | "done" | "overdue",
  reminder_schedule: [7, 3, 1],   // days before due_date to ping
  telegram_message_id: "..." | null
}
```

### `feedback_log`
Every edit/reject/approve action, used to tune the style engine over time.

```
feedback_log/{logId}
{
  content_item_id: "...",
  pattern_id: "...",
  action: "approved" | "edited" | "rejected" | "regenerated",
  instruction: "string, optional",
  at: timestamp
}
```

---

## 2. Telegram control plane

### Webhook flow
```
Telegram → your webhook endpoint → route by message type:
  - callback_query (button press)  → handleCallback()
  - text message (in reply to a bot msg) → handleEditInstruction()
  - command (/status, /pending)    → handleCommand()
```

### Message format per content item
Each `content_items` doc in `pending_review` gets posted as one Telegram message with inline buttons:

```
[Platform icon] LinkedIn — draft ready
"Why most Nigerian SMEs waste ad spend on Facebook"

<preview text, first ~200 chars>

[ ✅ Approve ]  [ ✏️ Edit ]  [ 🔁 Regenerate ]  [ 🗑 Kill ]
```

`callback_data` encodes action + item id, kept short since Telegram limits it to 64 bytes:
```
approve:{itemId}
edit:{itemId}        → bot replies "send your edit instructions" and expects next text msg
regen:{itemId}
kill:{itemId}
```

### Edit flow
1. User taps `✏️ Edit` → bot sets a short-lived "awaiting edit" state keyed by `chat_id + user_id`
2. User's next text message is captured as the instruction, written to `edit_history`, status → `changes_requested`
3. Orchestrator picks up `changes_requested` items, re-runs the relevant generation agent with the instruction appended to its prompt, status → `pending_review` again
4. Every edit also writes a `feedback_log` entry — this is your training signal for the style engine

### Daily digest (avoid message flood)
Instead of posting each item the moment it's drafted, batch:
- Cron job at a fixed time (e.g. 8am WAT) queries all `pending_review` items
- Posts one digest message per platform thread, or a summary message with counts + a `/review` command to step through them one at a time
- Keeps the group usable instead of turning into a firehose

### Tax reminders (same bot, separate logic)
```
cron (daily) → query tax_obligations where due_date - now ∈ reminder_schedule
  → post reminder with [ ✅ Mark done ] button → callback updates status: "done"
```

### Threads
If using a Telegram supergroup with topics enabled: one thread per platform (`linkedin`, `shorts`, `carousel`) plus one for `tax`. Keeps review context clean instead of interleaved.

---

## Next
Phase 2 is the `style_patterns` library itself — naming and structuring the actual hook/frameworks (contrarian hook, numbered system reveal, problem-agitate-reveal, etc.) with enough detail that a generation agent can reliably apply one per piece. Want me to build that out next, starting with LinkedIn and short-form script patterns?
