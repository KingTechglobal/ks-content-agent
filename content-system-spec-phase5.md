# Content system — measurement & performance feedback loop (phase 5)

Closes the loop phase 4 set up: `platform_performance` stubs get written on publish, but nothing pulls real engagement data into them or feeds that back into pattern selection. This phase does both — so the system learns from what actually performed, not just what got approved in Telegram review.

Approval ≠ performance. Something can sail through review and still flop, or get a rough edit pass and still be your best post that month. Right now `style_patterns.approval_count` only reflects the first signal. This phase adds the second.

---

## 1. `platform_performance` — filled in

Schema (extends the stub from phase 4):

```
platform_performance/{id}
{
  content_item_id: "...",
  platform: "linkedin" | "instagram" | "tiktok" | "youtube" | "carousel",
  platform_post_id: "...",
  posted_at: timestamp,

  metrics: {
    // shape differs slightly by platform, normalize what you can
    impressions: number,
    likes: number,
    comments: number,
    shares: number | null,        // not all platforms expose this
    saves: number | null,         // IG/TikTok only
    watch_time_s: number | null,  // video platforms only
    completion_rate: number | null, // video platforms only
    click_throughs: number | null   // if a link/CTA is trackable
  },

  performance_score: number,      // normalized 0-1, see section 3
  measured_at: [timestamp],       // array — see section 2, multiple pulls
  is_final: boolean               // true once past the measurement window
}
```

---

## 2. Measurement job — when and how often to pull

Engagement isn't static the moment it's posted — a post can be flat at 1 hour and take off by day 3, especially LinkedIn. Pulling once and calling it final would misjudge patterns. Pull on a decaying schedule instead:

```
Cron checks content_items where status == "posted":
  - +6h after posted_at   → first pull
  - +24h                  → second pull
  - +72h                  → third pull
  - +7d                   → final pull, mark is_final = true

Each pull appends to metrics (overwrite, not accumulate) and pushes
posted_at + interval onto measured_at[].
```

After `is_final = true`, status flips `posted → measured` (already in phase 1's status enum — this is what activates it). Stop polling that item's platform API after this point; no point spending API quota on a post that's basically flatlined.

**Platform API notes:**
- LinkedIn's API exposes limited engagement metrics for personal profile posts vs organization pages — company-page posts have a fuller analytics API. Worth checking which tier you're on before assuming impressions/CTR are available at all.
- Instagram/TikTok insights APIs require the account to be a Business/Creator account, not personal — likely already true given your UGC/content work, but worth confirming before this phase gets built.
- YouTube Analytics API gives you watch time and audience retention curves, not just view count — retention curve data is worth capturing raw (not just completion_rate) since it's diagnostic for which `retention_loop_v1` sections lose viewers, feeding back into phase 2's pattern refinement later.

---

## 3. Normalizing `performance_score`

Raw metrics aren't comparable across platforms or even across your own posts if follower count/reach varies. Normalize per-platform before it's usable for weighting:

```
For each platform, maintain a rolling baseline (median of last N posts,
N=~20, recalculated periodically):

  performance_score = weighted_avg(
    engagement_rate  (likes+comments+shares / impressions) vs baseline,
    depth_signal      (comments/saves weighted higher than likes —
                        cheap engagement shouldn't outweigh real signal),
    completion_signal (video only: completion_rate vs baseline)
  )

  Clamp to 0-1, where 0.5 = "performed at your median," not an absolute
  floor. This keeps the score meaningful as your baseline shifts over time
  instead of drifting stale against a fixed number from month one.
```

Comments/saves weighted higher than raw likes because they're harder to get accidentally — a like can be a thumb-scroll reflex, a save or comment is closer to actual signal that the content mattered to someone.

---

## 4. Feeding back into `style_patterns`

This is the actual point of the phase — closing the loop from phase 2/3.

```
On content_items.status → "measured":
  1. Look up the pattern_id used (from content_items.hook_pattern_id)
  2. Update style_patterns doc:
       - performance_scores: append this item's performance_score to a
         rolling array (or rolling average, capped at last ~30 uses)
       - blended_weight = combine approval_rate (phase 3) and
         avg(performance_scores), roughly 40/60 — performance matters
         more than review approval since review approval is a proxy,
         performance is the actual outcome
```

Updated `style_patterns` selection weight (phase 3's algorithm, revised):

```
weight = (0.4 * approval_rate) + (0.6 * avg_performance_score)

Same minimum-sample-size guard from phase 3 applies here too — a pattern
with only 2-3 measured posts shouldn't swing hard on one viral or one dud.
Use a flat baseline weight until n ≥ 5 measured posts.
```

This means a pattern that reviews clean every time (high approval) but consistently underperforms will get phased out of rotation automatically — which is the actual failure mode worth catching, since it's invisible from the Telegram review flow alone.

---

## 5. Weekly digest addition

Rather than only a real-time dashboard, add one artifact to the existing daily-digest cadence from phase 1: a **weekly rollup** (e.g. Monday mornings) posted to a dedicated Telegram thread, summarizing:

- Top 3 / bottom 3 posts by `performance_score` across all platforms
- Any pattern whose `blended_weight` moved meaningfully (up or down) this week
- Any `pattern_gaps` entries from phase 3 that are still unresolved (patterns you're missing for a pain point/platform combo)

This is what actually makes phase 5 useful day to day — raw data sitting in Firestore doesn't change your behavior, a weekly "here's what's working" nudge does.

---

## Where the pipeline stands after this

Full loop, closed:

```
pain point → pattern selected (weighted by approval + performance)
   → generated → reviewed → approved → scheduled → published
   → measured → performance_score computed → pattern weight updated
   → (loops back to pattern selection for the next piece)
```

Every layer from phase 1 through 5 is now live: schema, control plane, pattern library, orchestration, publishing, and measurement feeding weighting.

## Next

This closes the core system. What's left is genuinely optional refinement, not missing plumbing:

- **Pattern authoring UI** — right now new patterns get added by hand to Firestore; a lightweight Telegram or web form for drafting new `style_patterns` docs would lower the friction of expanding the library
- **Cross-industry pattern reuse analysis** — now that performance data exists, you could mine it for which patterns transfer well across your 11 industries vs which are industry-locked
- **A/B pattern testing** — deliberately forcing two patterns on the same pain point occasionally to get cleaner signal than natural rotation gives you

None of these block the system from running end to end. Want to scope one of these, or actually run this against a real pain point now that all five phases exist?
