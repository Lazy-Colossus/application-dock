---
title: Tea
status: draft
created: 2026-09-06
updated: 2026-09-06
---

# PRD: Tea
*Working title — confirm.*

## 0. Document Purpose

This PRD is for the builder (a single developer who is also the sole user) and any downstream BMAD workflows — UX, architecture, and epic/story breakdown — that turn it into shippable work. It defines **Tea**, a new self-contained app inside the **Application Dock** platform. Vocabulary is anchored in the Glossary (§3) and used verbatim throughout; features are grouped with globally-numbered Functional Requirements (FRs) nested beneath them; inferred decisions are tagged inline `[ASSUMPTION: …]` and indexed in §9. It builds on the existing Application Dock platform architecture (FastAPI + Vue 3/Quasar/Pinia, JSON-file persistence, JWT auth) rather than restating it; platform mechanics live in `docs/planning-artifacts/architectures/architecture-application-dock-2026-06-12/architecture.md`. The feature source is `docs/stories/tea/idea-pool.md`.

## 1. Vision

**Tea** is a personal companion for gongfu tea practice — one place that holds both halves of the ritual: the *precision* of the brew and the *reflection* around it. At the table, it's an instrument — a per-infusion session timer that learns your brewing curve, a steep metronome for the pour-in-pour-out rhythm, water temperature and leaf grams captured per tea. Away from the rush, it's a quiet journal — each sitting recorded as an aesthetic object (the ware you used, mood, a photo of the table), a flavor wheel tapped through to leave a taste fingerprint, a meditation timer that turns the cooling wait into a breath.

Underneath both, it remembers: a **cabinet of teas** with grams ticking down as you drink, a **cabinet of teaware** — every gaiwan, pot, and kyusu with its material and volume, and the seasoning history of each pot — a **map** of where your teas traveled from, and a **personal almanac** of brewing parameters and ceremony vocabulary.

It is built for one person — you, at your own table, on your phone — not a marketplace, not a social network. Its job is to make each session a little more precise *and* a little more present, and to make sure nothing about your practice is forgotten: not the curve that brews this cake best, not what the third infusion tasted like last winter, not how much of it is left.

## 2. Target User

Single user: the builder, a gongfu tea drinker who brews multi-infusion sessions at home and wants one durable home for both the mechanics and the memory of the practice. Primary surface is a **phone at the tea table** — touch-first, glanceable, usable mid-brew with wet hands.

### 2.1 Jobs To Be Done

- **Functional — brew precisely.** Time each infusion accurately without squinting at a stopwatch mid-pour, and let each tea's own history suggest how long the next steep should run.
- **Functional — never lose the record.** Remember what I own, how much is left, where it came from, what it tasted like, and how I brewed it — across years, in one place.
- **Emotional — stay present.** Turn a functional wait (leaf opening, cup cooling) into a small deliberate ritual rather than dead time on a stopwatch.
- **Emotional — build an archive I enjoy revisiting.** Accrete a beautiful, personal record of my table — sittings as aesthetic objects — that rewards looking back.
- **Contextual — one-handed at the table.** Operate the essential controls while a pot or gaiwan is in the other hand.
- **Builder — a place to practice.** Ship and live in my own well-made tool; it is *for me* as both maker and drinker.

### 2.2 Non-Users (v1)

- Anyone but the builder — no multi-user accounts, no guests, no sharing surface (contrast KDH). A session may *note* guests as free text, but they are not users.
- Vendors / marketplaces — this is not for buying, selling, or discovering teas to purchase.
- The broader tea community — no social feed, no publishing, no leaderboards.

## 3. Glossary

*Downstream workflows and readers must use these terms exactly. FRs use these verbatim; no synonyms elsewhere in the PRD.*

- **Session** — one brewing sitting of a single **Tea**. The core record. Holds an ordered list of **Infusions** plus optional enrichments: a **Flavor Fingerprint**, **Cha Xi** fields, and a **Meditation** period. Both timing and journaling are optional — a Session may have timed Infusions and no notes, or notes and no timing. References exactly one Tea and zero or more **Teaware** items.
- **Infusion** — one steep within a Session, numbered 1..N. Carries a target **Steep Time** and an actual elapsed time. Also called a steep.
- **Steep Time** — the duration of a single Infusion.
- **Brewing Curve** — the source of each Infusion's suggested Steep Time for a given Tea. v1 prefills from the highest-**Rated** past Session of that Tea; with no rated history it falls back to the Tea's own **Brewing Parameters**, then to the **Almanac** family default. Shown as a suggestion the user can override live.
- **Rating** — a user's quality score for a Session. Drives Brewing Curve prefill (the highest-Rated Session's Steep Times win).
- **Brewing Parameters** — recommended leaf grams, water temperature, and per-Infusion Steep Times. Held on a Tea (its Cabinet record) and defaulted per tea family in the **Almanac**.
- **Session Timer** — the at-the-table tool that runs a Session's Infusions, timing each and recording actual times against the Brewing Curve.
- **Steep Metronome** — a rhythmic visual/audio pulse mode for the pour-in-pour-out cadence of fast Infusions.
- **Meditation** — an optional silent sitting period attached to a Session (e.g., while the cup cools), run as a timed phase.
- **Tea** — a specific tea the user owns, held in **The Cabinet** (e.g., a 2019 sheng puer cake). Carries type/family, **Origin**, grams remaining, and links to its Sessions.
- **The Cabinet** — the inventory of Teas, including grams remaining and a **Running Low** shelf.
- **Running Low** — a Cabinet filter/shelf surfacing Teas at or below a grams threshold.
- **Teaware** — a brewing or serving vessel/utensil the user owns (gaiwan, pot, kyusu, chawan, pitcher…). Carries a type, material, and volume; porous pots also carry a **Seasoning Log**. Also called *ware*.
- **The Teaware Cabinet** — the inventory of Teaware.
- **Seasoning Log** — the record, on a porous Teaware item (e.g., a yixing pot), of which Teas have been brewed in it — supporting the practice of dedicating one pot to one tea-type.
- **Cha Xi** — the aesthetic layer of a Session: the Teaware used, mood, guests, and a photo of the table setup.
- **Flavor Wheel** — the tap-through tasting tool (categories → notes such as honey, petrichor, roasted, marine, camphor) used to capture taste during or after a Session. *(The idea pool calls this the "Tea Wheel".)*
- **Flavor Fingerprint** — the set of Flavor Wheel notes saved for a Session; may be aggregated per Tea for side-by-side comparison.
- **Origin** — the provenance of a Tea (region, mountain, village) with optional coordinates for the **Tea Map**.
- **Tea Map** — a map view pinning each Tea's Origin.
- **Almanac** — the **Cha Dao Almanac**: a seeded, user-extensible reference of Brewing Parameters, tea families, and ceremony vocabulary (Chinese + Japanese terms).

## 4. Features

*FRs are numbered globally (FR-1…). Features are ordered by dependency: the two Cabinets first (they hold what a Session references), then the Session and its at-the-table tools, then the reflective and knowledge layers.*

### 4.1 The Cabinet (Teas)

**Description:** The Cabinet is the inventory of every Tea the user owns. It is the anchor most other features reference. Each Tea carries identity (name, type/family, form — cake / loose / bag / sample), **Origin**, grams remaining, its own recommended **Brewing Parameters**, free notes, and an optional photo. Grams remaining decrements automatically as Sessions record leaf used, and the **Running Low** shelf surfaces what's nearly gone. Opening a Tea shows its Session history and aggregated memory — times brewed, last brewed, and its aggregated **Flavor Fingerprint**.

**Functional Requirements:**

#### FR-1: Manage teas

The user can add, edit, and archive a Tea. Fields: name, type/family (from Almanac families), form, Origin, initial grams, recommended Brewing Parameters (grams, water temperature, per-Infusion Steep Times), notes, optional photo.

**Consequences (testable):**
- A newly added Tea appears in the Cabinet with its full grams remaining and zero Sessions.
- Archiving a Tea hides it from the default Cabinet and Session tea-picker but preserves its Sessions and history.
- Type/family selection offers the Almanac's family list and accepts a free-text family not yet in the Almanac.

#### FR-2: Track grams remaining

Grams remaining decrements by the leaf grams recorded on each finalized Session of that Tea; the user can also adjust grams manually (correction, restock, breakage).

**Consequences (testable):**
- Finalizing a Session that recorded 7 g reduces that Tea's grams remaining by exactly 7 g.
- A manual grams adjustment is recorded distinctly from Session decrements so history stays legible.
- Grams remaining never displays below 0; reaching ≤ 0 flags the Tea as empty rather than erroring.

#### FR-3: Running Low shelf

The Cabinet surfaces a Running Low shelf listing Teas at or below a grams threshold.

**Consequences (testable):**
- A Tea crossing at or below the threshold appears on Running Low without a page reload after the Session that crossed it is finalized. [ASSUMPTION: a single global threshold in v1, e.g. 10 g, rather than per-tea thresholds.]

#### FR-4: Browse, search, and filter the Cabinet

The user can browse, search by name, and filter Teas by type/family, form, Running Low, and Origin region.

#### FR-5: Tea detail and aggregated memory

Opening a Tea shows its recommended Brewing Parameters, grams remaining, reverse-chronological Session history, and aggregates: times brewed, last brewed date, and an aggregated Flavor Fingerprint across its Sessions.

### 4.2 The Teaware Cabinet

**Description:** A parallel inventory for *ware* — every gaiwan, pot, kyusu, pitcher, cup, and chawan. Each Teaware item carries a type, material, volume, optional photo, and notes. Porous pots additionally carry a **Seasoning Log**: the record of which Teas have been brewed in them, supporting the practice of dedicating one pot to one tea-type. A Session references the Teaware used, and that reference is what feeds each pot's Seasoning Log.

**Functional Requirements:**

#### FR-6: Manage teaware

The user can add, edit, and archive a Teaware item. Fields: name, type (gaiwan / pot / kyusu / pitcher / cup / chawan / other), material (porcelain / yixing / glass / other), volume (ml), optional photo, notes, and a "porous / seasons" flag.

**Consequences (testable):**
- Archiving a Teaware item hides it from pickers but preserves its Seasoning Log and its links from past Sessions.

#### FR-7: Seasoning Log

A Teaware item flagged as porous accrues a Seasoning Log; when a Session that used that item is finalized, the Session's Tea (and its family) is appended to the log with a date.

**Consequences (testable):**
- Finalizing a Session that used a porous pot adds one dated entry to that pot's Seasoning Log naming the Tea.
- The log surfaces the dominant tea-family for the pot (e.g. "23 sessions — all shou puer") so the user can spot a pot drifting off its dedication.

#### FR-8: Browse and filter teaware

The user can browse and filter Teaware by type, material, and volume.

### 4.3 Gongfu Session Timer

**Description:** The core at-the-table instrument. The user starts a **Session** for a chosen Tea, optionally records the Teaware used, water temperature, and leaf grams, then runs **Infusions** one after another. Each Infusion is a large, glanceable, one-handed countdown started and stopped with a single tap. The suggested **Steep Time** for each Infusion comes from the **Brewing Curve** — prefilled from the highest-**Rated** past Session of that Tea, falling back to the Tea's own Brewing Parameters, then the Almanac family default — and the user can override it live. Actual elapsed time is recorded per Infusion. Finalizing the Session persists it, decrements grams (FR-2), and appends to any porous pot's Seasoning Log (FR-7). Timing is optional at the whole-Session level (see FR-16, journal-only Sessions), and journaling is optional here.

**Functional Requirements:**

#### FR-9: Start a session

The user can start a Session by picking a Tea from the Cabinet, and optionally set the Teaware used, water temperature, and leaf grams (grams prefilled from the Tea's recommended Brewing Parameters).

**Consequences (testable):**
- Starting a Session with no prior history still opens with a first Infusion whose suggested Steep Time comes from the fallback chain (Tea params → Almanac family), never blank.

#### FR-10: Run and time infusions

The user can run sequential Infusions; each shows a large countdown to its suggested Steep Time, started/stopped by a single large-target tap, with the ability to add the next Infusion, adjust the current Steep Time live, and re-run. The screen stays awake while a Session is active.

**Consequences (testable):**
- Each Infusion records the actual elapsed Steep Time, independent of the suggested time.
- The primary start/stop control is operable one-handed and reachable without precise aim (large hit area).
- The device screen does not sleep while an Infusion is counting. [ASSUMPTION: via the Screen Wake Lock API where the mobile browser supports it; degrade gracefully where it doesn't.]

#### FR-11: Brewing Curve prefill

Each Infusion's suggested Steep Time is prefilled from the highest-Rated past Session of the same Tea; with no rated history it falls back to the Tea's Brewing Parameters, then the Almanac family default, and is labelled with its source.

**Consequences (testable):**
- Given two past Sessions of a Tea rated 5 and 3, the timer prefills Infusion Steep Times from the 5-rated Session.
- The suggestion label states its origin ("from your best session" / "tea default" / "almanac: young sheng").

#### FR-12: Finalize and rate a session

The user can finalize a Session, optionally applying a Rating, which persists the Session, decrements grams, and updates Seasoning Logs.

**Consequences (testable):**
- A finalized Session appears in the Journal (§4.7) and on its Tea's detail (FR-5).
- An unfinalized Session that is abandoned does not decrement grams or write a Seasoning Log entry. [ASSUMPTION: in-progress Sessions are held distinctly from finalized ones, mirroring the archery in-progress/finalised split.]

### 4.4 Steep Metronome

**Description:** For fast gongfu Infusions where the whole steep is a few seconds and the rhythm is pour-in-pour-out, a metronome mode replaces the countdown-watching with a gentle recurring pulse — visual, and optionally audio/haptic — so the user keeps cadence without staring at a number mid-pour.

**Functional Requirements:**

#### FR-13: Metronome pulse during an infusion

Within a Session the user can switch an Infusion into Steep Metronome mode: a recurring visual pulse at a configurable interval, with optional sound and vibration, that the user can start and stop hands-free-ish (single large tap).

**Consequences (testable):**
- The pulse interval is configurable (e.g. 3–15 s) and persists as a per-user preference.
- Sound and vibration are each independently toggleable and respect a silent/haptic-off setting. [ASSUMPTION: audio requires a user gesture to start, per mobile-browser autoplay rules; the Session-start tap satisfies this.]

### 4.5 Tea Meditation Timer

**Description:** Reframes the functional wait — leaf opening, cup cooling — as deliberate practice. The user can attach a silent **Meditation** period to a Session: brew, then breathe while it cools, on a calm minimal screen with a gentle start and end cue. It contributes to a simple practice count the user can look back on.

**Functional Requirements:**

#### FR-14: Attach a meditation period

The user can start a silent Meditation of a chosen duration attached to the current Session, presented on a minimal calming screen with gentle start/end cues.

**Consequences (testable):**
- Completing a Meditation records its duration on the Session.
- A running Meditation is interruptible without corrupting the Session; a cancelled Meditation records nothing.
- The user can see a lifetime/rolling count of completed Meditations. [ASSUMPTION: a simple total and current-streak, not a full analytics surface, in v1.]

### 4.6 Flavor Wheel (Tea Wheel) & Flavor Fingerprint

**Description:** During or after a Session the user taps through a hierarchical **Flavor Wheel** (categories → notes such as honey, petrichor, roasted, marine, camphor) to capture what the tea tastes like. The selected notes become the Session's **Flavor Fingerprint**. The wheel ships with a sensible default vocabulary and is user-extensible. Fingerprints can be compared across a Tea's Sessions and side-by-side across Teas.

**Functional Requirements:**

#### FR-15: Capture a flavor fingerprint

The user can tap through the Flavor Wheel to select one or more notes for a Session, saved as its Flavor Fingerprint.

**Consequences (testable):**
- Selected notes persist on the Session and render on its Journal card and Tea detail.
- The wheel is navigable one-handed with large touch targets during a live Session.

#### FR-16: Extend the wheel

The user can add custom categories and notes to the Flavor Wheel, which then appear for future Sessions.

#### FR-17: Compare fingerprints

The user can view a Tea's aggregated Flavor Fingerprint across its Sessions and compare fingerprints of two or more Sessions or Teas side by side.

### 4.7 Cha Xi Journal

**Description:** The reflective home of the practice. **Cha Xi** enriches a Session with the aesthetics of the sitting — the Teaware used, mood, guests, and a photo of the table setup — and the **Journal** is the browsable, reverse-chronological archive of all Sessions rendered as visual cards. Because a Session is unified but optional, the Journal also lets the user record a **journal-only Session** for a tea brewed elsewhere (a teahouse, a friend's table) with no timing at all.

**Functional Requirements:**

#### FR-18: Enrich a session with cha xi

The user can add to a Session: the Teaware used (from the Teaware Cabinet), a mood, guests (free text), and a photo of the setup.

**Consequences (testable):**
- Teaware chosen here is what feeds the Seasoning Log (FR-7).
- A photo is stored and rendered on the Session's Journal card. [ASSUMPTION: photos are stored as image files on disk under `DATA_DIR`, referenced by path from the JSON Session record, since binary can't live in JSON.]

#### FR-19: Browse the journal

The user can browse all Sessions as a reverse-chronological wall of visual cards, and open any card to see full detail — Tea, Teaware, Infusion timings, Flavor Fingerprint, photo, Meditation, Rating, and notes.

#### FR-20: Search and filter the journal

The user can search and filter the Journal by Tea, Teaware, date range, mood, and Rating.

#### FR-21: Journal-only session

The user can create a Session with journaling but no timing (no Infusions run) for a tea brewed away from the app.

**Consequences (testable):**
- A journal-only Session appears in the Journal and on its Tea's detail but records no Brewing Curve data and does not require grams. [ASSUMPTION: grams decrement is skipped unless the user explicitly enters leaf used.]

### 4.8 Tea Map

**Description:** A map of everywhere the shelf has traveled from. Each Tea's **Origin** can carry coordinates; the Tea Map pins all origins and lets the user tap a pin to see the Teas from that place.

**Functional Requirements:**

#### FR-22: Set a tea's origin location

The user can set a Tea's Origin as a searchable place and/or coordinates.

**Consequences (testable):**
- Origin place search resolves to coordinates for pinning. [ASSUMPTION: reuse the platform place-search endpoint/maps config already built for the Listies "Place" column rather than introducing a second maps integration.]

#### FR-23: View the tea map

The user can view a map pinning every Tea that has coordinates and tap a pin to list the Teas from that Origin.

### 4.9 Cha Dao Almanac

**Description:** A quiet curated reference the user can grow into a personal tea encyclopedia: tea families with their default Brewing Parameters, and ceremony vocabulary in Chinese and Japanese with meanings. It ships seeded and is user-extensible, and its family Brewing Parameters are the last link in the Session Timer's suggestion fallback chain (FR-11).

**Functional Requirements:**

#### FR-24: Read and search the almanac

The user can browse and search the Almanac's seeded content — tea families (with default Brewing Parameters) and ceremony vocabulary terms (term, script, reading, meaning).

#### FR-25: Extend the almanac

The user can edit seeded Almanac entries and add their own families, parameters, and vocabulary.

**Consequences (testable):**
- An edited family default Brewing Parameter is what the Timer fallback (FR-11) uses thereafter.

#### FR-26: Seed content

The Almanac ships with a starter body of curated families and vocabulary so it is useful on first open.

**Consequences (testable):**
- On first launch, before any user edits, the Almanac lists a non-empty set of tea families with default Brewing Parameters covering the common categories (e.g. green, young sheng, aged sheng, shou, oolong, black, white, Japanese greens). [NOTE FOR PM: the seed's breadth is a content task, not just code — scope the initial family/vocabulary list explicitly.]

## 5. Non-Goals (Explicit)

- **Not multi-user, not social.** No accounts beyond the single dock user, no sharing, no feed, no publishing, no leaderboards. Guests are free text on a Session, not users.
- **Not commerce.** No buying, selling, price tracking, vendor catalogs, or purchase recommendations.
- **Not a hardware hub.** No integration with smart scales, kettles, or thermometers in v1 — temperature and grams are entered by hand.
- **Not an AI sommelier.** No automated flavor inference, tea identification from photos, or ML-generated tasting notes; the Flavor Fingerprint is what the user taps.
- **Not becoming a general note-taking or calendar app** — it stays scoped to tea practice.

## 6. MVP Scope

### 6.1 In Scope

All nine features, per the user's decision to ship the full idea pool in the first pass: The Cabinet, The Teaware Cabinet, Gongfu Session Timer (with Brewing Curve prefill), Steep Metronome, Tea Meditation Timer, Flavor Wheel & Fingerprint, Cha Xi Journal, Tea Map, and Cha Dao Almanac — on a phone-first responsive surface, behind the existing dock auth, persisted as JSON files (plus on-disk photos) via the platform repository pattern.

### 6.2 Out of Scope for MVP

- **Averaged / ML Brewing Curve.** v1 prefills from the single highest-Rated Session; smoothing across many Sessions is deferred to v2.
- **Aging / cellar projections.** The Cabinet tracks grams and notes; predictive aging curves for puer are deferred. [NOTE FOR PM: emotionally load-bearing for puer drinkers — revisit if it earns a slot.]
- **Rich meditation analytics.** v1 is a count + streak; trends/charts deferred.
- **Offline-first PWA / installability.** Nice for at-the-table use; treat as a v2 enhancement unless it proves necessary. [NOTE FOR PM: flag — phone-at-the-table with spotty wifi may push this earlier.]
- **Multi-device real-time sync conflict handling** beyond the platform's single-writer JSON model.
- **Export / backup UX** beyond whatever the platform already provides.

## 7. Success Metrics

Personal-project framing — the metrics are about *lived use*, not growth.

**Primary**
- **SM-1**: Real-session logging — in a typical week the user actually brews with, essentially every home session gets a Session recorded (timed or journal-only). Validates FR-9, FR-12, FR-21.
- **SM-2**: Stopwatch retired — the user stops reaching for a separate phone stopwatch/timer during gongfu sessions. Validates FR-10, FR-11, FR-13.

**Secondary**
- **SM-3**: The archive rewards looking back — a year in, opening a Tea shows a complete, pleasant history (grams, sessions, fingerprints, photos) the user chooses to revisit. Validates FR-5, FR-19.
- **SM-4**: The memory stays true — grams remaining and Seasoning Logs match reality closely enough to trust. Validates FR-2, FR-7.

**Counter-metrics (do not optimize)**
- **SM-C1**: Logging friction — capturing a Session must not turn brewing into data entry. If recording a normal timed Session takes meaningful fiddling beyond the brewing itself, the app is failing even if SM-1 rises. Counterbalances SM-1.
- **SM-C2**: Feature sprawl vs. presence — more surfaces/settings is not the goal; if the app starts feeling like a database to maintain rather than a calmer table, that counts against it. Counterbalances the breadth of §6.1.

## 8. Open Questions

1. **Photo storage & size.** Confirm on-disk photo storage under `DATA_DIR` with path references from JSON; decide max dimension / compression and whether EXIF orientation must be handled (phone photos).
2. **Maps reuse.** Confirm the Listies place-search/maps integration is reusable for Tea Map origins, or whether a lighter approach (manual coordinates only) suffices for v1.
3. **Screen wake lock coverage.** Which target mobile browsers support the Wake Lock API, and what's the graceful degradation where they don't?
4. **Almanac seed breadth.** What is the exact starter list of tea families (with default Brewing Parameters) and vocabulary terms? Content scope, not just code.
5. **Running Low threshold model.** Single global grams threshold vs. per-tea — start global?
6. **Rating scale.** What Rating scale (e.g. 1–5 stars) drives "highest-rated," and how are ties broken (most recent wins?)?
7. **Grams accounting for shared boil / multiple teas.** Edge cases (blending, re-using leaf across days) — ignore in v1?

## 9. Assumptions Index

- §4.1 FR-3 — a single global Running Low grams threshold in v1, not per-tea.
- §4.3 FR-10 — screen kept awake via the Wake Lock API where supported, graceful degradation otherwise.
- §4.3 FR-12 — in-progress Sessions held distinctly from finalized ones (mirrors the archery in-progress/finalised split).
- §4.4 FR-13 — audio playback requires a user gesture; the Session-start tap satisfies mobile autoplay rules.
- §4.5 FR-14 — Meditation surfacing is a simple total + streak in v1, not full analytics.
- §4.7 FR-18 — photos stored as image files on disk under `DATA_DIR`, referenced by path from the JSON Session record.
- §4.7 FR-21 — journal-only Sessions skip grams decrement unless leaf used is explicitly entered.
- §4.8 FR-22 — Tea Map reuses the platform place-search/maps integration built for Listies rather than adding a second maps stack.

## 10. Cross-Cutting NFRs

*System-wide qualities not owned by one feature. Platform mechanics (auth, JSON persistence, atomic writes, 3-layer backend) are inherited from Application Dock and stated here only where Tea leans on them specifically.*

- **NFR-1 — Phone-first at the table.** The primary surface is a phone held at the tea table. Core session controls (start/stop, next infusion, metronome) must be operable one-handed, with large touch targets, and remain legible at arm's length and in warm/dim lighting.
- **NFR-2 — Glanceable timing.** A live Infusion's remaining time must be readable in under a second's glance; the active control must never require precise aim.
- **NFR-3 — Interruptibility.** Any live activity (Infusion, Metronome, Meditation) can be paused, cancelled, or abandoned without corrupting the Session; an app backgrounded mid-Session recovers to a coherent state on return.
- **NFR-4 — Persistence & integrity.** All persisted state uses the platform repository pattern with atomic writes (write-tmp-then-replace); no write path bypasses it. Photos are stored on disk under `DATA_DIR` and referenced by path. In-progress Sessions survive a reload.
- **NFR-5 — Single-user privacy.** All data sits behind the existing dock JWT auth; there is no sharing surface and no third-party data egress beyond the maps/place-search the platform already uses.
- **NFR-6 — Responsive fallback.** Though phone-first, the app is usable on a desktop browser (cataloguing, journaling, almanac) via responsive layout — no separate desktop build.
- **NFR-7 — Accessibility & platform standards.** Meets the platform's accessibility and coding standards (contrast, focus states, keyboard use on desktop); audio and haptic cues are never the sole channel — a visual equivalent always accompanies them.
- **NFR-8 — Offline resilience (soft).** Transient network loss at the table must not lose an in-progress Session's timing data. [ASSUMPTION: achieved by keeping live timing in client state and persisting on finalize/checkpoint, not by full offline-PWA in v1 — see §6.2.]

## 11. Aesthetic & Tone

*This app is half instrument, half sanctuary; the reflective half only works if it feels calm. Captured here for UX; not a set of FRs.*

- **Feeling:** quiet, warm, deliberate, uncluttered. The table should feel unhurried even while a precise timer runs. Restraint over density; whitespace and stillness are features.
- **Instrument vs. journal register.** The Session Timer / Metronome may read as precise and legible — clear numerals, high contrast, unambiguous controls. The Journal / Cha Xi / Meditation surfaces should read softer — imagery-forward, gentle motion, minimal chrome. The app should shift register between the two halves without feeling like two apps.
- **Motion & sound:** gentle and optional. Cues (pulse, meditation start/end) are soft, never jarring; everything audible/haptic is silenceable.
- **References / anti-references:** aligns with the platform's existing ukiyo-e / forest "hotaru" design explorations (paper, ink, dusk, firefly) already in `docs/planning-artifacts/ux-designs/`. Anti-reference: dashboard-y, gamified, notification-heavy productivity apps — no streaked "don't break the chain" pressure on the Meditation count, no badges.
- **Product-generated text:** sparse and respectful of the vocabulary (correct Chinese/Japanese terms from the Almanac); never chatty or salesy.
