# Content system — orchestrator & selection logic (phase 3)

Builds on phase 1 (data/control plane) and phase 2 (style_patterns library). This is the layer that actually decides *what* gets generated, *which pattern* it uses, and *which agent* produces it — the piece that turns a static schema + pattern library into a running pipeline.

---

## 1. What the orchestrator owns

Everything upstream of "post pending_review to Telegram" and downstream of "here's a pain point we haven't covered yet":

```
pain_point_ref + platform
        ↓
   [ORCHESTRATOR]
        ↓
  1. select pattern
  2. build agent prompt (pattern + few-shots + pain point + brand voice)
  3. dispatch to correct generation agent
  4. write result to content_items (status: drafted)
  5. advance to pending_review, trigger digest inclusion
```

It does NOT generate content itself — it's routing and prompt-assembly, not writing.

---

## 2. Trigger sources

The orchestrator runs on three separate triggers, not one big cron:

### a) Scheduled fill (daily)
Cron at a fixed time (e.g. 6am WAT, ahead of the 8am digest from phase 1) checks how many `pending_review` + `scheduled` items exist per platform thread. If below a target buffer (e.g. 3 LinkedIn, 5 short-form queued at all times), it pulls the next uncovered `pain_point_ref` per industry rotation and generates to fill the gap.

### b) Manual dispatch (Telegram command)
`/generate linkedin real_estate` — lets you force a specific platform/industry combo on demand instead of waiting for rotation. Parses the same way as phase 1's command handler, routes straight into step 2 below.

### c) Regenerate loop (from phase 1's edit flow)
`changes_requested` items re-enter here at step 2 only — pattern stays the same by default (the edit is usually about execution, not pattern choice), but the instruction from `edit_history` gets appended to the prompt. If the same item gets `changes_requested` twice in a row, escalate: force a different pattern from the same `when_to_use` pool rather than retrying the identical approach.

---

## 3. Pattern selection algorithm

Given `(platform, pain_point_tag, industry, funnel_stage)`:

```
1. Query style_patterns where:
     platform ∈ {requested_platform, "any"}
     AND pain_point_tag ∈ when_to_use.pain_point_tags
     AND industry ∈ when_to_use.industries
     AND funnel_stage == when_to_use.funnel_stage

2. If zero matches → relax industry filter (patterns are often industry-agnostic
   in structure; the industry-specificity comes from the topic, not the pattern)

3. If still zero matches → relax funnel_stage, log a gap
   (this tells you phase 2's library needs a new pattern for that combo)

4. From remaining candidates, weight by approval_rate:
     weight = approval_count / max(usage_count, 1)
     — but don't let a pattern with only 1-2 uses dominate on a lucky approval.
       Apply a minimum sample size: patterns under 5 uses get a flat baseline
       weight (0.5) instead of their raw rate, so early data doesn't overfit.

5. Weighted-random select (not always top-weighted) — keeps rotation varied
   instead of converging on one "safe" pattern and burning out the voice.

6. Log the selection reasoning to a lightweight `orchestrator_log` (pattern id,
   candidates considered, weight, reason) — this is what you'd check if output
   quality drifts and you need to know why a given pattern got picked.
```

**Why weighted-random over top-1:** a pattern that's technically highest-approval but used 40 times will feel repetitive to your audience even if each individual post tested well. Rotation is a feature, not noise.

---

## 4. Prompt assembly

The orchestrator builds one prompt per generation call. Structure:

```
[SYSTEM / brand voice block — static, same across all agents]
  - your tone, banned phrases, HOOK→PAIN→TRUTH→SHIFT→CTA framework as fallback
    default when no pattern fits

[PATTERN block — from style_patterns doc]
  - structure_description
  - constraints (hard rules — max words, banned openers, required elements)
  - 2-3 few_shot_examples verbatim

[CONTEXT block]
  - pain_point_ref content (pulled from your pain-point research doc)
  - industry
  - any edit_history instructions if this is a regenerate

[OUTPUT SPEC]
  - exact JSON shape expected back (matches content_items.body shape for
    that platform — headline/hook/body_text/cta for LinkedIn, beats array
    for script, etc.)
  - explicit instruction: JSON only, no preamble — this is what phase 1's
    error handling in the API call expects
```

Keeping brand-voice and pattern blocks separate (rather than merging into one giant instruction) means you can update your voice guidelines once and have it apply across every pattern, instead of editing 5+ pattern docs every time you refine tone.

---

## 5. Generation agent dispatch

One agent per output shape, not one agent per platform — LinkedIn and carousel are both "static text" shapes; IG script and TikTok script are the same "beats" shape. This keeps you at 2-3 agents instead of 5+:

```
- text_agent    → linkedin, carousel
- script_agent  → instagram (reels), tiktok
- (youtube_agent → deferred to phase 4 alongside YouTube patterns)
```

Each agent is a thin wrapper: takes the assembled prompt, calls the model, validates the JSON shape matches `content_items.body` for that platform, retries once on malformed JSON, then writes the doc.

---

## 6. Failure handling

- **Malformed JSON from agent:** retry once with the error appended ("previous output failed to parse: [error] — return valid JSON only"). Second failure → write to `content_items` with `status: idea` and a note in `media_brief`, skip rather than block the fill run.
- **Zero pattern matches even after relaxing filters:** log to a `pattern_gaps` collection (pain_point_tag, industry, platform, timestamp) — this becomes your backlog for phase-2-library expansion instead of silently failing.
- **Digest buffer never fills (agent keeps failing same pain point):** after 3 consecutive failures on the same `pain_point_ref`, orchestrator skips it for that day and logs it, rather than retrying indefinitely and burning quota.

---

## Next

Phase 4 is the two things this phase deferred: (1) carousel + YouTube pattern libraries so `youtube_agent` has something to route to, and (2) the scheduler — turning `approved` items into actual `scheduled_for` timestamps and posting via each platform's API, since right now approval just sits there without a publish step.

Want carousel/YouTube patterns first, or the scheduler/publish layer first?
