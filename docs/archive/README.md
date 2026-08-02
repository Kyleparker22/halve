# Golf App — Spec Set

> **Name:** TBD. `APPNAME` is a placeholder throughout — one find-and-replace when it lands.

## Decisions locked

| Decision | Choice |
|---|---|
| Scope | Full feature set — rounds, bets, want-to-play, feed, bag, chat, trips, GPS |
| Sequencing | Usable deliverable at every milestone (~27 weeks incl. AI trip builder) |
| Booking | Outbound deep links from v1; partner applications submitted at M3 |
| AI trip builder | Added as M7. Travel affiliates (Stay22, Viator) wired but not relied on for revenue |
| Name | Deferred — resolve by M4 at the latest |

## Documents

| File | What's in it |
|---|---|
| `00-product-spec.md` | What the app is, why it can win, full feature set, non-goals, per-milestone success criteria |
| `01-data-model.md` | Complete Postgres schema, every table and column, RLS policy summary |
| `02-architecture.md` | Stack, repo layout, the three things that will hurt if done wrong, security and performance guardrails |
| `03-build-plan.md` | M0–M6 with exit tests, parallel non-code track, where the plan is most likely to slip |
| `04-integrations-and-costs.md` | Real costs, verified constraints on booking and social-save, legal notes, open questions |
| `05-m0-kickoff-prompt.md` | Copy-paste prompt to start M0 in Claude Code, plus a verification checklist |
| `06-ai-trip-builder.md` | AI trip planning from crew preferences — competitive reality, reconciliation design, the grounding pipeline that prevents recommending private courses, data sources, affiliate economics |

## The short version

The incumbents built for the solo golfer improving their game. Nobody built for the group.

The differentiated loop is: friend's trip review → your want-to-play list → trip planning → booking → your review → someone else's list. Everything else is table stakes that keeps people in the app between rounds.

## Start here

1. Read `00-product-spec.md`
2. Skim `03-build-plan.md` for the shape of the next 27 weeks
3. Set up Supabase and GolfCourseAPI accounts
4. Paste `05-m0-kickoff-prompt.md` into Claude Code

## Immediate non-code actions

- Trademark clearance with a real attorney once the name is settled — Justia screening is a stale proxy, not clearance
- Apple Developer ($99/yr) and Google Play ($25) enrollment — these take days
- Register domains the day the name is decided
- Buy usgolfdata.com course-access dataset ($399) before M7 — it's the field that prevents recommending a private club

## Pre-launch burn

**$40–70/month.** The whole thing is cheap until you have users.
