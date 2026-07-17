# Content system — carousel/YouTube patterns + scheduler (phase 4)

Phase 3 deferred two things to close out the pipeline: the remaining pattern libraries (so `youtube_agent` has somewhere to route) and the publish layer (so `approved` items actually go live instead of sitting idle). Both live here since they're the last two pieces before this is a closed loop.

---

## Part A — Carousel & YouTube patterns

### Carousel patterns

Carousel body shape (from phase 1): `{ slides: [ {slide_no, heading, body} ] }`. Routes through `text_agent` — same shape family as LinkedIn, just chunked across slides instead of one block.

#### `single_idea_per_slide_v1`
**Shape:** Slide 1 is the hook (headline only, no body text — text-heavy slide 1 kills swipe-through). Slides 2 through n-1 each carry exactly one idea: a short heading + 1-2 lines max. Final slide is CTA + a compressed recap of the core claim, not a new idea.

**Constraints:**
- 6-8 slides total (below 6 feels thin, above 8 the swipe-through drop-off gets steep)
- Slide 1: heading only, ≤ 10 words, no body text
- Every internal slide: heading ≤ 6 words, body ≤ 2 short sentences
- No slide references "the next slide" or "swipe" as filler — let the content pull, not the instruction

**When to use:** Same funnel role as `numbered_system_reveal_v1` from phase 2 — works well converting the same numbered-system content into carousel format for cross-posting without duplicate generation cost (reuse the pain point, different pattern, different platform).

#### `before_after_bridge_v1`
**Shape:** First 2-3 slides establish the "before" state (the pain, dramatized). Middle slide is the bridge/mechanism — this is the one slide that's allowed to run longer since it's the payoff. Remaining slides show the "after" state + proof, final slide CTA.

**Constraints:**
- Bridge slide clearly visually distinct (this is a design note for `media_brief`, not just copy)
- "After" state must be specific and outcome-based, not "and now everything's better"

**When to use:** Nurture-stage, works especially well for the automation products where before/after is concrete (manual DM follow-up vs the WhatsApp qualification loop).

---

### YouTube patterns

YouTube is a new body shape, not a reuse of script_agent's beats format — long-form needs section structure with retention mechanics, not just VO+visual beats. New shape for `content_items.body`:

```
YouTube body shape:
{
  title_options: [string, string, string],  // 3 variants, pick-one at review
  hook_script: "first 15-30s, written in full",
  sections: [ {section_title, key_points: [string], est_duration_s} ],
  cta_script: "closing CTA, written in full"
}
```

Routes through a new `youtube_agent` — this is the one deferred from phase 3, now activated.

#### `retention_loop_v1`
**Shape:** Hook opens with a specific promise + a reason to stay to the end (open loop). Each section closes by teeing up the next one rather than resolving cleanly — retention comes from unresolved tension, not just good info per-section. Final section closes the original open loop explicitly before the CTA.

**Constraints:**
- Hook script must state the open loop by roughly the 20-second mark
- No section may fully answer its own setup — always bridges to the next
- Sections: 4-6 for a 10-15 min video; scale count, not per-section length, for longer videos

**When to use:** Fits your finance/education channel and the faceless anime-style channel — long-form breakdowns (e.g. adapting *Rich Dad Poor Dad* material) benefit from this more than a flat listicle structure.

#### `listicle_authority_v1`
**Shape:** Hook states the count + the stakes ("5 mistakes costing Nigerian SMEs their ad budget"). Each section is self-contained (unlike `retention_loop_v1` — this format's retention comes from "one more item" pull, not unresolved tension). Sections ordered weakest-to-strongest claim, biggest payoff last.

**Constraints:**
- Section count in title must match actual section count exactly
- Last section must be the strongest/most specific — never let the biggest item be item 1

**When to use:** Lower production overhead than `retention_loop_v1` (sections don't need to interlock), good default for faceless-channel volume content.

---

## Part B — Scheduler & publish layer

### What's missing without this
`approved` items currently have nowhere to go. `scheduled_for` exists on the schema (phase 1) but nothing writes to it or acts on it. This closes that gap.

### Scheduling logic

```
1. Cron (e.g. hourly) queries content_items where status == "approved"
   and scheduled_for == null

2. For each, assign a slot from a per-platform posting calendar:
     - LinkedIn: 2 slots/day, weekday only (e.g. 9am, 1pm WAT)
     - Instagram/TikTok: 1-2 slots/day, 7 days
     - YouTube: 2-3/week, fixed days
     - Carousel: piggybacks LinkedIn slots (alternate with text posts,
       don't double-book same slot)

3. Assign next open slot per platform, write scheduled_for, status stays
   "approved" (scheduled_for populated is what marks it queued —
   status: "scheduled" only flips once the publish job actually fires,
   so failed publishes are visible instead of silently marked scheduled)
```

Slot assignment should skip a platform's queue if buffer is already deep (e.g. don't schedule LinkedIn post #6 for tomorrow if posts #1-5 already cover the next 2.5 days) — keeps content fresh relative to when it was approved rather than stacking a backlog that goes stale.

### Publish job

```
Cron (e.g. every 15 min) queries content_items where:
  status == "approved" AND scheduled_for <= now AND posted_at == null

For each:
  1. Call the relevant platform API (LinkedIn API, Instagram Graph API,
     TikTok Content Posting API, YouTube Data API) with the content_items.body
  2. On success: status → "posted", posted_at = now
  3. On failure: status stays "approved", log to a `publish_failures`
     collection (item_id, platform, error, attempt_count), retry up to 3x
     across subsequent cron runs before flagging to Telegram for manual
     attention
```

**Platform API notes to account for (build-time, not spec-time detail):**
- LinkedIn's API has stricter app-review requirements for posting on behalf of a personal profile vs a company page — worth confirming which you're authenticated as before wiring this
- Instagram/TikTok require media to already be hosted at a public URL, not uploaded inline — so video/image assets from your Nano Banana/Kling pipeline need to land in storage (Firebase Storage, matching the rest of your stack) before the publish job can reference them
- YouTube uploads are resumable/chunked by design — for anything beyond short clips, the publish job needs to handle upload-in-progress state, not just fire-and-forget

### Measurement hook (sets up phase 5, not built now)
On successful publish, also write a stub to `platform_performance/{id}` referenced by `content_items.performance_ref` (already in phase 1 schema) — empty except `posted_at` and `platform_post_id`. A later measurement job can poll that same doc and fill in engagement stats without needing to re-derive which post maps to which platform ID after the fact.

---

## Where the pipeline stands after this

All four platforms have pattern libraries. Orchestrator can route to any of them. Approved content now actually gets scheduled and published, not just reviewed and stuck. The loop closes:

```
pain point → orchestrator selects pattern → agent generates → Telegram review
   → approved → scheduler assigns slot → publish job posts → (phase 5: measure)
```

## Next

Phase 5 is measurement — pulling engagement stats back from each platform API into `platform_performance`, and feeding that back into `style_patterns.approval_count`-style weighting so the system learns from what actually performs, not just what you approved in review (approval ≠ performance — something can look good in the Telegram preview and still flop, or vice versa).

Want to build that next, or pressure-test this phase (carousel/YouTube patterns + scheduler) against a real backlog item first before adding another layer?
