# PRD — King Solomon content intelligence & control system

## 1. Problem

Solomon runs multiple content tracks (LinkedIn, Instagram, TikTok, YouTube) across eleven target-client industries, plus recurring tax/admin obligations, entirely manually. Content ideation, drafting, and scheduling take significant hands-on time, output quality is inconsistent because it isn't grounded in a repeatable framework, and there's no single place to review and approve work in progress from a phone.

## 2. Goal

A multi-agent system that continuously generates platform-specific, framework-grounded content, routes it through a single Telegram interface for review/edit/approval, publishes it, tracks performance, and feeds that performance back into how future content is generated — plus a lightweight tax/task reminder layer running on the same control plane.

**Success looks like:** Solomon can run his entire content operation — review, edit, approve, schedule — from Telegram in under 15 minutes a day, with output quality that doesn't require heavy rewriting, and a visible improvement in approval rate over time as the style engine learns which patterns work.

## 3. Users

Single operator (Solomon). No multi-user auth, no team permissions in v1. Design decisions can assume one Telegram chat/group as the entire interface — no separate web dashboard in v1.

## 4. Scope

### In scope (v1)
- Content generation agents: LinkedIn article, IG/TikTok script, carousel copy
- Style/framework engine (pattern library, not literal-imitation)
- Telegram control plane: review, edit, approve, reject, regenerate
- Firestore-backed state machine for content lifecycle
- Scheduler/publisher (initially may be semi-manual — agent prepares the post, Solomon publishes manually if a platform's API access is limited; full auto-publish where API access allows)
- Performance tracking (manual entry or API pull, platform-dependent) feeding back into pattern approval rates
- Tax/task reminder agent (separate concern, shared bot)

### Out of scope (v1)
- Multi-user / team accounts
- Web dashboard (Telegram is the only interface for now)
- Fully autonomous posting with zero human review
- Video generation/editing (scripts only — video production stays in your existing Nano Banana/Kling pipeline)
- Analytics beyond basic engagement metrics per post

### Future consideration (v2+)
- Web dashboard for browsing content history and pattern performance
- Auto-publish once you're comfortable trusting the pipeline
- Expansion beyond eleven industries as new verticals get added

## 5. Core features

| Feature | Description |
|---|---|
| Research agent | Pulls/organizes trend and pain-point input per industry to seed content ideas |
| Style engine | Maintains a library of named content frameworks/patterns (not creator-specific copying); selects a pattern per piece |
| LinkedIn agent | Generates long-form article drafts |
| Script agent | Generates IG Reels / TikTok scripts (hook, beats, CTA) |
| Carousel agent | Generates structured slide-by-slide copy for design tools |
| Telegram control plane | Single interface for reviewing, editing, approving, killing, regenerating content; daily digest to avoid message flood |
| Scheduler/publisher | Moves approved content to scheduled/posted state; publishes via API where available |
| Performance tracker | Records engagement metrics per post, updates pattern approval rates |
| Tax/reminder agent | Tracks recurring tax obligations, reminds on schedule, marks done via Telegram button |

## 6. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript / Node.js** | Matches your existing WhatsApp bot stack (Node.js, WhatsApp Cloud API), first-class Telegram and Firebase SDKs, one language across the whole system reduces context-switching |
| Bot interface | Telegram Bot API (webhook mode) | Free, reliable, supports inline keyboards and threaded topics for multi-platform review |
| Database | **Firestore** | Matches your existing real estate WhatsApp bot backend, generous free tier, good fit for a document-per-content-item model, no server/ops overhead |
| AI generation | **Claude / Gemini via Antigravity** | Antigravity is your existing build environment; Claude is your primary strategic/production partner already |
| Hosting | Cloud Run or a lightweight VPS (decide at build time based on cost) | Node.js webhook needs to run 24/7; Cloud Run scales to zero when idle, minimizing cost for a low-traffic single-operator bot |
| Scheduling/cron | Cloud Scheduler (if on GCP) or `node-cron` if self-hosted | Drives the daily digest and tax reminder checks |
| Design output | Structured JSON handed to Canva (manual paste or API if available) | Keeps carousel agent output machine-usable rather than a copy-paste blob |

**Why not Python:** nothing in this system needs Python's ML/data-science ecosystem — it's an orchestration and I/O-heavy system (bot handling, API calls, state management), which is Node's strength, and it keeps you in one language across your whole toolchain including your existing bots.

### Confirmed libraries (locked)

| Concern | Library | Notes |
|---|---|---|
| Telegram bot framework | `grammY` | Type-safe, supports long-polling (local dev) and webhook (Cloud Run) modes with no code rewrite between them |
| Firestore access | `firebase-admin` | Official server-side SDK, full read/write privileges |
| Test runner | `vitest` | Native TS support, minimal config, fast |
| Local dev transport | Long-polling via a CLI dev script | Lets Solomon test Telegram flows without an HTTPS webhook URL; switch to webhook only at deploy time |

Any future addition to this list (new dependency, new external API client) should be proposed and confirmed the same way before it's treated as locked — see `agent-instructions.md` §2 and §6.

## 7. Data model & control plane

See `content-system-spec.md` for the full Firestore schema and Telegram command structure. That document is the binding spec for phase 1 — this PRD should not duplicate it, only reference it.

## 8. Non-functional requirements

- **Cost**: system should run on Firestore/Cloud Run free-tier-adjacent usage for a single operator's volume; flag if any design choice risks meaningful cost (e.g. polling vs. webhooks)
- **Reliability**: a missed cron tick or a failed generation call should not silently drop content — failures should be visible in Telegram, not just logs
- **Security**: no secrets in code; Telegram bot should only respond to Solomon's chat ID(s), not be open to arbitrary users
- **Latency**: not real-time critical — a few minutes of delay on generation or digest posting is acceptable

## 9. Milestones

1. **Phase 1 — Control spine**: Telegram bot + Firestore state machine, tested with dummy content items (no real generation yet)
2. **Phase 2 — First generation agent**: Script agent (IG/TikTok) end-to-end: generate → Telegram review → approve → status update
3. **Phase 3 — Style engine**: Pattern library wired into the script agent; approval-rate tracking live
4. **Phase 4 — Remaining generation agents**: LinkedIn article agent, carousel agent, reusing the same pipeline
5. **Phase 5 — Scheduler/publisher**: Automated or semi-automated posting per platform
6. **Phase 6 — Performance tracking**: Feed real engagement data back into pattern approval rates
7. **Phase 7 — Tax/reminder agent**: Lowest-risk, most decoupled — can be built any time after phase 1

## 10. Open questions

- Which platforms have viable publish APIs for you today vs. which will need manual posting (TikTok and Instagram API access can be restrictive — confirm before assuming auto-publish)
- Where does trend/pain-point research data come from — manual input, a scraping agent, or both?
- Canva API access level — does manual paste-in suffice for v1, or is API integration worth the setup cost now?
