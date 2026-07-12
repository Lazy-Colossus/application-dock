---
title: "Product Brief: Hotaru — Japanese Vocabulary"
status: ready
created: 2026-06-10
updated: 2026-06-10
---

# Product Brief: Hotaru — Japanese Vocabulary

> **Name:** Hotaru (蛍, "firefly") — evoking 蛍雪, the classic image of studying by firefly-light. Chosen for its calm, gentle, bookish feel that matches the product's soul.

## Executive Summary

Hotaru is a tool for learning Japanese vocabulary *effectively* — built for people who already know hiragana and katakana and want to genuinely retain words, not just flip cards. It is a new self-contained app inside the existing **Application Dock** platform: a session-based browser app you open, use for a focused stretch, and close. Its bet: vocabulary sticks best when you practise it from more than one angle, when learners share the memory tricks that work, and — in time — when AI supplies the right example sentence or word breakdown right when you need it.

The core is dependable: practise vocabulary chapter-by-chapter (organised against the Genki textbook) or by your own topics, with each word drilled as both **recognition** and active **production**, and spaced repetition deciding what is worth seeing. What makes it *smart* is the layer on top. A shared master vocabulary lets two learners co-build the library and — crucially — leave shared notes on each word, a free space for whatever helps a word stick. A later AI phase deepens this: example sentences generated from words you already know, suggested mnemonics, and word-structure analysis.

The experience stays calm and low-pressure throughout — no streaks, overdue-card walls, or leaderboards — but that is the manner, not the mission. The mission is effective, cooperative, increasingly intelligent vocabulary learning. Why now: the household is studying Japanese from Genki and wants a tool built around how words actually stick, and the Application Dock platform makes adding a new app cheap. The MVP is architected to accept the AI layer but does not yet ship it.

## The Problem

Most vocabulary tools don't help you *learn* words well — they help you drill them shallowly. The typical experience is single-mode recognition flipping (see the card, flip the card), which builds passive familiarity but not the active recall you need to use a word. The aids that actually work are scattered or missing: good example sentences, a breakdown of how a word is built, and the personal mnemonics that make a word click — each living in another tool, on inconsistent volunteer-uploaded web pages, or just in someone's head. Two people learning side by side have no way to pool those hard-won tricks.

Rolling your own tool usually trades one problem for another: brittle exact-match grading, the chore of hand-entering every word with all its metadata, and still no cooperative dimension.

And then there is the pressure problem. Tools like Anki are excellent at memory science but quick to make you feel bad — miss a few days and you face "247 cards due," breakable streaks, and counters that nag, turning a pleasant habit into low-grade guilt and eventual abandonment. That matters, but it is the *secondary* failure: the primary one is that these tools simply aren't very good at making words stick, alone or together.

## The Solution

A vocabulary app whose **core loop is built for retention, not just review**: pick a textbook chapter (e.g. `Genki_3`) or a topic/theme and practise it. Words are presented in more than one way — **recognition** (see the Japanese, recall the meaning) and **production** (recall and produce the Japanese) — so you build active recall — what lets you actually use a word, not just passive familiarity. Spaced repetition serves the most useful words right now, in a session-bounded set with a clean end — never an overdue-debt wall. The only visible progress signal is a **subtle per-word colour** showing how well you know it: encouraging at a glance, never a scolding number.

Content comes in two ways: **imported Genki vocabulary** (by chapter) and **low-friction manual entry** for anything else. There is **one shared master vocabulary list** for the household, but each user keeps their **own private progress**; any word can be flagged **shared** or **private**.

The cooperative heart is the **shared per-word notes** space: on any word, a learner can jot whatever helps — a memory hack, a usage tip, a question, a small running discussion — and their partner sees it. The personal, hard-won tricks that make a word click become a quiet gift between two people — cooperation with zero pressure.

## What Makes This Different

- **Built for retention, not just review.** Every word is practised as both recognition *and* active production — so you can produce Japanese, not just recognise it. This is the core bet.
- **Cooperative memory-building.** A shared word list plus a shared per-word notes space let two learners pool whatever makes words stick, turning the most idiosyncratic part of learning into a mutual asset. Progress stays private; no rivalry mechanics.
- **(Phase II) AI tuned to *your* vocabulary.** AI that writes example sentences using only words you already know (comprehensible input), analyses word structure, suggests starter mnemonics, fills gaps in patchy scraped data, and explains usage nuance — on an explicit "✨ improve" action, so cost and latency stay controlled.
- **A trustworthy boring core, with optional spice.** The chapter-by-chapter loop always works; playful extras (see Vision) are strictly opt-in and never required.

Honest note: the advantage here is fit and the specific combination — cooperative human memory aids today, AI tuned to each learner's own vocabulary tomorrow — not a defensible technical moat. The app also rides the Application Dock platform to ship cheaply.

## Who This Serves

**Primary users — two people in one household studying Japanese together.** They already know kana, are working through Genki, and want self-paced practice that respects their time and never guilt-trips them. Success for them: opening the app is pleasant, a short session feels complete, and they occasionally help each other with a shared memory trick.

The app starts with **2 hardcoded users** and is designed so more can be added later.

## Success Criteria

Right-sized to a passion project — signals, not KPIs:

- **Words actually stick** — *production* recall (not just recognition) improves over time, visible in the familiarity colour trending up. This is the headline signal: the tool teaches effectively.
- **The cooperative layer earns its place** — shared per-word notes get written and read between the two users, and demonstrably help recall.
- **Adding and growing the library is low-friction** — manual entry and Genki import are easy enough that vocabulary keeps accumulating.
- **It gets used voluntarily, repeatedly** — sustained, self-motivated return *without* streak/guilt mechanics pulling people back.
- **A session feels complete** — clear start, satisfying bounded set, clean end; no "still 180 to go."

## Scope

**In — MVP (Phase I):**
- New app registered in the Application Dock shell (registry + routes + backend router).
- Vocabulary organised by **textbook + chapter** (e.g. `Genki_3`) or by **topic/theme**; practise a chosen group. (Richer, more nuanced categorisation can follow later — see Phase III+.)
- Genki vocabulary import (by chapter) + low-friction manual word entry.
- One shared master vocabulary list; words flagged shared vs private; per-user private progress.
- Practice modes: **Recognition** and **Production**.
- Automatic, invisible spaced-repetition scheduling (no due counts / no backlog); subtle per-word familiarity colour.
- Session-bounded practice with a clean end.
- Shared, human-authored notes per word (free-form: memory hacks, tips, questions, light discussion).
- 2 hardcoded users.
- **Architected for AI** (Phase II ready): word records carry optional fields AI can later populate; a clear service seam for enrichment; the "✨ improve" affordance designed (may be stubbed).

**Explicitly out of the MVP:**
- All AI enrichment behaviour (deferred to Phase II — see below).
- Listening practice mode (no reliable free audio source yet).
- Streaks, leaderboards, challenges, due-debt, any competitive or coercive mechanic — **out by principle, not by phase**.
- Daily Mix, Vocab Wrapped, Pokédex-style collection view (Phase III spice).
- User self-management / expansion beyond the 2 hardcoded users.
- Grammar, kanji study, and other non-vocabulary Japanese learning.

**Phase II (next):** AI "improve word/dataset" gap-fill, AI mnemonic suggestions, AI word-structure analysis (e.g. kanji/compound breakdown), AI nuance explainer — via an explicit user-pressed action.

**Phase III+ (later):** AI example sentences from known vocabulary (comprehensible input ⭐), forgiving AI grader for production answers, **grammar and kanji practice**, more nuanced vocabulary categorisation, Daily Mix, Vocab Wrapped, Pokédex collection view, additional cooperative touches (Blend mix, "partner knows this" glow), listening mode, user expansion.

## Design Principles (north star — carry into PRD)

1. **Effective learning is the mission.** Multiple practice angles, active recall, and — over time — the right example, structural insight, or mnemonic at the moment it helps.
2. **Cooperative by design.** Two learners co-build the library and pool the memory aids that work; never competitive.
3. **Architect for AI from day one; ship without it.**
4. **Calm is the manner, not the mission.** No streaks, leaderboards, due-debt, or forced practice; sustainable practice is what compounds. A supporting value, not the defining one.
5. **Low-friction content in.** Source data may be patchy; manual entry stays easy; AI later fills gaps.
6. **Minimal visible progress signal** (one familiarity colour); scheduling stays automatic and invisible.

## Vision

If it succeeds, Hotaru grows from a vocabulary trainer into a smarter, cooperative companion for Japanese learning. AI enrichment makes every word "complete enough" — personalised example sentences drawn from each learner's known vocabulary, word-structure analysis, nuance on demand — so the tool actively teaches, not just tests. The cooperative layer deepens with shared frontiers, and gentle, opt-in delight arrives. Further out, it extends beyond vocabulary into grammar and kanji, and beyond two hardcoded users — always holding the founding bet: learn effectively and together, and stay calm enough to keep coming back.
