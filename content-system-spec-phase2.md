# Content system — style patterns library (phase 2)

Builds on phase 1's `style_patterns` collection. This defines the actual pattern set — enough structural detail that a generation agent can pick one, apply it reliably, and produce output that matches your voice instead of generic AI copy.

Covers LinkedIn and short-form script (IG/TikTok) patterns first, per the phase 1 handoff. Carousel and YouTube patterns are a follow-on phase once these two are validated in production.

---

## 1. How a pattern gets applied

A pattern isn't just a name — it's a set of constraints the generation agent must satisfy. Each pattern doc needs:

- **`structure_description`** — the shape, sentence by sentence or beat by beat
- **`constraints`** — hard rules (length, banned phrasing, required elements)
- **`when_to_use`** — which pain points / funnel stages it fits
- **`few_shot_examples`** — 2-3 real examples in your voice, used as in-context examples in the generation prompt (not just a label the model free-associates from)

Without `few_shot_examples`, "contrarian_hook_v1" is just a name and the model will drift toward generic LinkedIn-guru cadence within a few generations. The examples are what keep it anchored to your actual voice.

Updated `style_patterns` schema (extends phase 1):

```
style_patterns/{patternId}
{
  name: "contrarian_hook_v1",
  platform: "any" | "linkedin" | "short_form",
  category: "hook" | "full_structure",

  structure_description: "...",
  constraints: {
    max_hook_words: 12,
    banned_openers: ["I used to think", "Here's the thing", "Unpopular opinion:"],
    required_elements: ["specific number or named entity in first line"]
  },
  when_to_use: {
    funnel_stage: "cold" | "warm" | "nurture",
    industries: ["real_estate", "fintech", "ecom", "coaching"],
    pain_point_tags: ["lead_qualification", "manual_followup", "ad_waste"]
  },
  few_shot_examples: [
    { topic: "...", output: "..." }
  ],

  usage_count: 0,
  approval_count: 0,
  last_used_at: timestamp
}
```

`when_to_use` is what lets the orchestrator (phase 3) auto-select a pattern for a given `pain_point_ref` instead of you picking manually every time.

---

## 2. LinkedIn patterns

### `contrarian_hook_v1`
**Shape:** Line 1 names a belief the reader holds. Line 2 flatly contradicts it — no hedging, no "but actually." Body then earns the contradiction with one concrete mechanism or example. Close on the reframed principle, not a summary.

**Constraints:**
- Hook ≤ 12 words, no question marks in the hook line
- The contradiction must land in sentence 2, not buried in paragraph 3
- One proof point only — resist stacking three examples, it dilutes the snap

**When to use:** Cold-audience posts where the goal is stopping the scroll, not converting. Good for pain-point awareness content (e.g. "your WhatsApp leads aren't cold, your follow-up is").

**Example (real estate, Nigerian market):**
> Most agents think slow leads went cold.
> They didn't. Your response time did.
> [body: stat/mechanism on response-time decay, e.g. lead quality dropping after first hour of silence]
> Speed isn't a nice-to-have in this market — it's the qualification filter itself.

---

### `numbered_system_reveal_v1`
**Shape:** Hook states a specific outcome + a number ("3 filters," "the 2-message qualification loop"). Each numbered item is one sentence — no elaboration inline. CTA offers the full breakdown (DM, comment, link) rather than closing the loop entirely.

**Constraints:**
- 3–5 numbered items, never more (readability collapses past 5 on mobile)
- Each item starts with a verb or a named noun, not "the fact that..."
- Hook must contain the actual number, not "a few ways to..."

**When to use:** Warm audience, positions you as the operator who's already solved the problem. Strong for showcasing the automation systems (WhatsApp bot logic, lead scoring) without giving away the full build.

**Example (fintech):**
> The 3-message sequence that qualifies a lead before a human ever replies:
> 1. Confirm intent (buy/rent/invest — not a survey, a single tap)
> 2. Budget band, framed as a range not an interrogation
> 3. Timeline — this is the field that predicts close rate, not the budget
> Everything after this is a warm handoff, not more qualifying.

---

### `problem_agitate_reveal_v1`
**Shape:** Classic PAR but compressed for LinkedIn's attention span — problem in 1 line, agitation in 2-3 lines (cost of inaction, made specific/local), reveal is the mechanism not the pitch.

**Constraints:**
- Agitation section must use a concrete cost (naira figure, time lost, leads lost) — never abstract ("this is costing you")
- Reveal ends on the mechanism, CTA is separate and short (1 line max)

**When to use:** Maps directly to your HOOK → PAIN → TRUTH → SHIFT → CTA framework — this pattern is that framework's LinkedIn-native form. Default for nurture-stage content.

---

## 3. Short-form script patterns (IG/TikTok)

### `pattern_interrupt_open_v1`
**Shape:** First line of VO is a claim that contradicts what the visual shows, or names the viewer's exact situation in the first 2 seconds. Beats are short (3-5s each), each beat = one idea, visual note tied to the line not decorative.

**Constraints:**
- `hook_line` must be speakable in under 3 seconds
- No more than 6 beats total for sub-30s scripts
- Every beat needs a `visual_note` — no beat can be VO-only

**When to use:** Cold TikTok/Reels traffic, top-of-funnel awareness for the automation products or UGC course.

---

### `problem_demo_proof_v1`
**Shape:** Open on the pain point dramatized (not stated — shown), cut to the fix in action (screen recording / mock UI), close on a proof beat (number, testimonial line, before/after).

**Constraints:**
- Demo beat must show the actual product/system, not a stock analogy
- Proof beat is the last beat, never buried mid-script
- CTA line is spoken, not just on-screen text

**When to use:** Product demo content for the WhatsApp bot / Content Intelligence System itself once you're showcasing it publicly. Also fits UGC-course affiliate content.

---

## 4. Approval-rate feedback loop

`approval_count / usage_count` per pattern (already in phase 1 schema) is how the orchestrator eventually deprioritizes patterns that keep getting `changes_requested` or `rejected` in `feedback_log`, without you having to manually retire them. Once you have ~15-20 uses logged per pattern, phase 3's orchestrator can start weighting selection by approval rate instead of round-robin.

---

## Next

Phase 3 is the orchestrator/selection logic: given a `pain_point_ref` + `platform`, auto-pick a pattern from `when_to_use` matches, weighted by approval rate, and hand off to the relevant generation agent (LinkedIn agent vs script agent) with the pattern's `few_shot_examples` injected into the prompt.

Want me to build that next, or lock in carousel + YouTube patterns first so all four platforms have a pattern library before wiring up selection logic?
