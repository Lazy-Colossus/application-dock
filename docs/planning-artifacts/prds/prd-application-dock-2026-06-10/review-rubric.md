# PRD Quality Review — Hotaru — Japanese Vocabulary

## Overall verdict

This is a strong, well-calibrated hobby-stakes PRD: it has a genuine thesis (cooperative, pressure-free drilling), every FR carries testable consequences, the Glossary is disciplined, and the three UJs trace cleanly to the FRs that claim to realize them. The single substantive defect is a cross-reference mismatch — MVP Scope cites feature groups as "F1–F5" while the document numbers nothing "F#" anywhere else — plus a couple of minor glossary/scope edge cases worth tightening. Nothing here blocks a green light to build; the issues are nits and one easily-fixed reference drift.

## Decision-readiness — strong

A builder can act on this. Decisions are stated as decisions, not buried: the 5-tier Familiarity (FR-20), exact-match Typed scoring with a self-grade fallback (FR-14), and "scope selection suffices for agreed vocab — no assigned-set concept" (§8) are all resolved explicitly rather than left dangling. Trade-offs are named with what was given up: §6.2 defers fuzzy matching, AI enrichment, and the emotionally load-bearing "big picture" connections, and §8 records what was resolved during drafting rather than smoothing it away. Open Questions is honestly empty (§8) — appropriate for a passion project where the two users are the deciders. The one real tension (the deferred connection feature) is flagged with a `[NOTE FOR PM]` at §6.2 rather than at a safe checkpoint.

No findings.

## Substance over theater — strong

Little furniture here. There are no padded personas — the two real users (Dani, Jake) drive concrete decisions (per-User Familiarity, Shared/Private isolation, cooperative Notes). The Vision (§1) is product-specific and could not swap into another PRD: "the memorize-it-yourself companion to Dani and Jake's shared Genki study" and the explicit anti-nagging stance are earned, not boilerplate. NFRs (§11) avoid the "must be scalable/secure" trap — performance is bounded honestly to "snappy on a couch/bus session" and explicitly disclaims scale targets, which is the correct move at these stakes. The Phase II AI Readiness section (§10) is the one place to watch for innovation theater, but it is framed as a *constraint on v1 design* (optional empty fields, a service seam) rather than claimed novelty, so it earns its place.

No findings.

## Strategic coherence — strong

The PRD has a clear thesis and bets on it: drilling is solo, but the product's distinctive value is the *cooperative, zero-pressure* layer (Shared Notes) and a deliberate refusal of coercive mechanics. Feature prioritization follows the thesis — the calm-bounds FR-18 and the permanent "no competitive mechanics" non-goal (§5) are structural, not afterthoughts, and the counter-metric SM-C1 explicitly guards against drifting away from the thesis under engagement pressure. Success Metrics (§7) validate the thesis (does it stick; is the cooperative layer real; does the library grow past the textbook) rather than measuring vanity activity. MVP scope is coherently an "experience" kind — the loop quality and calm are the point.

No findings.

## Done-ness clarity — strong

This is the dimension the PRD invests in most, and it holds up. Every FR (FR-1 … FR-24) carries a **Consequences (testable)** block with verifiable conditions. Spot checks: FR-7 gives concrete isolation assertions ("A Private Word is visible and drillable only to its creator"); FR-14 specifies "exact match" scoring and the precise non-match fallback; FR-18 is testable as a negative ("No 'cards due' backlog count is shown anywhere"); FR-20 pins Familiarity to "5 discrete levels". I found no "handles X gracefully" / "reasonable performance" / "user-friendly" adjectives standing in for criteria.

### Findings
- **low** Soft verbs in two consequences (§4.3 FR-11, §4.4 FR-21) — "conveys per-Word (or distribution of) Familiarity" and "convey Familiarity via colour/level" are slightly looser than the rest. They are still testable (something Familiarity-derived is rendered per Word/scope), but a story author must pick the representation. *Fix:* optional — state the minimum (e.g. "each Word in the overview shows its 5-level Familiarity colour"); acceptable to leave to UX given stakes.
- **low** FR-19 "weaker … Words are favoured over well-known ones" is testable only probabilistically. *Fix:* acceptable as-is; the `[ASSUMPTION]` correctly punts the algorithm to architecture, and a deterministic ordering check ("given two Words of differing Familiarity, the lower appears first/more often") is derivable.

## Scope honesty — strong

Omissions are explicit, not inferred. §5 Non-Goals does real work and distinguishes *permanent stance* (no competitive mechanics) from *deferral* (audio, AI, grammar/kanji) — an unusually honest distinction. §6.2 maps deferrals to phases. Assumptions are tagged inline (`[ASSUMPTION]` at FR-2, FR-4, FR-14, FR-19, FR-22) and round-trip to the §9 index. The dataset-assembly pipeline is repeatedly and clearly carved out of app scope (FR-9 Notes, §6.2). Open-items density is low and appropriate for a green-light hobby PRD: five assumptions (all benign or user-confirmed), one `[NOTE FOR PM]`, zero open questions.

No findings.

## Downstream usability — strong (with one mechanical fix)

The PRD feeds UX/architecture/stories and is built for extraction: a disciplined Glossary (§3) headed "Downstream work must use these terms exactly. No synonyms elsewhere," FRs that read standalone, and UJs cross-referenced from the FRs that realize them (FR-8→UJ-2, FR-16→UJ-1, FR-24→UJ-3). FR / UJ / SM IDs are unique and contiguous (FR-1..24, UJ-1..3, SM-1..3 + SM-C1). The one snag is the F1–F5 cross-reference (see Mechanical notes) — it resolves by position but not by literal token, which is exactly the kind of thing a source-extracting downstream workflow trips on.

### Findings
- **medium** Dangling "F1–F5" references (§6.1 In Scope, and §4.1 description "(F1)" pattern in §6.1 lines) — MVP Scope tags each bullet "(F1)…(F5)", but no feature, FR, or section is labeled "F1"–"F5" anywhere in the document. They map by position to feature groups §4.1–§4.5, but the token is undefined. *Fix:* relabel to the section numbers (§4.1–§4.5) or introduce explicit "F1…F5" labels on the feature group headings so the reference resolves literally.

## Shape fit — strong

Correctly shaped for a hobby / solo-pair product. Rigor is light where it should be (no market sizing, no scale NFRs, empty Open Questions) while the substance bar is met. UJs are present and load-bearing because this *is* an experience product with meaningful UX (the cooperative payoff in UJ-3 is the thesis in miniature) — not over-formalized. Brownfield context (new app inside the existing Application Dock platform) is handled accurately: §11 references real platform conventions (single HTTP boundary, layered backend, JSON persistence, self-contained app dir) consistent with the repo's actual architecture, and FR-1/FR-2 follow the documented "adding a new app" + hardcoded-user pattern. No enterprise furniture was forced in.

No findings.

## Mechanical notes

- **ID continuity:** FR-1 through FR-24 contiguous and unique; no gaps or duplicates. UJ-1..3 and SM-1..3 + SM-C1 clean. Good.
- **Cross-reference drift (medium, repeated above):** "F1–F5" in §6.1 has no defining target. Either relabel to §4.1–§4.5 or add F-labels to the feature group headings.
- **Assumptions Index roundtrip:** all five inline `[ASSUMPTION]` tags (FR-2, FR-4, FR-14, FR-19, FR-22) appear in §9, and every §9 entry has an inline origin. Clean roundtrip. Minor: the FR-2 assumption text appears twice (inline §4.1 and §9) with slightly different wording — harmless.
- **Glossary drift / undefined nouns in FRs:**
  - **"Textbook + chapter"** (FR-5, FR-12-adjacent, Glossary Lesson def) — "chapter" is used as the sub-unit of a Lesson but is not itself a Glossary term. Low impact (its meaning is obvious from context), but a strict extractor sees an undefined noun. *Optional fix:* fold "chapter" into the Lesson definition explicitly or treat Lesson as already the chapter-level unit.
  - **"kana"** appears in FRs (FR-4 "reading (kana)", FR-14 "types the kana") and is defined only parenthetically in the Word glossary entry ("a reading (kana)"). Acceptable.
  - Terms otherwise used consistently: Word, Master Vocabulary List, Lesson, Topic, Scope, Direction (JP→EN/EN→JP), Scoring Mode, Grade (Correct/Close/Incorrect), Familiarity, Progress, Note, Shared/Private all match Glossary casing and form across FRs and UJs. No synonym drift detected (e.g. "card" is used only for the UI rendering of a Word, never as a competing term for Word).
- **UJ ↔ FR consistency (checked per task):**
  - UJ-1 (Jake drills Lesson 2): picker→scope (FR-10), pre-session overview (FR-11), Anki flow (FR-12), Direction (FR-13), Scoring incl. Self-grade and Typed (FR-14), 3-level Grade (FR-15/Glossary), mid-drill Note flagged Shared (FR-16, FR-23), end summary + no nag (FR-17, FR-18). Fully realized — no UJ-1 beat lacks an FR.
  - UJ-2 (Dani adds off-textbook word): manual entry of 3 fields (FR-8), Topic tag or loose (FR-6), Shared/Private choice (FR-7), immediately drillable (FR-8). Consistent.
  - UJ-3 (Dani sees Jake's note): Shared Note visible to partner (FR-24). Consistent. Minor: UJ-3 shows the note surfacing *during a later drill on the same Lesson 2 set*; FR-24's consequences assert visibility "on that Word" but don't specifically state Notes surface *within the drill flow*. The FR-16 mid-session note-attach implies notes live in the drill context, so this is covered transitively, but a story author may want an explicit "Shared Notes are visible on the Word during a Practice Session" consequence. **low.**
- **Non-Goals ↔ MVP Scope ↔ Features consistency (checked per task):** No contradictions found. The strongest internal-consistency win is the calm/no-pressure stance, asserted four times in alignment (§1 vision, FR-18, §5 Non-Goals permanent stance, §7 SM-C1 counter-metric, §11 calm guardrail) — no FR anywhere reintroduces streaks/due-counts. AI is consistently out of v1 (§5, §6.2) while §10/FR-4 only reserve *empty data fields and a seam*, which is not a contradiction (architecting-for vs shipping). Topics-are-shared is consistent across Glossary, FR-6, and §8.
