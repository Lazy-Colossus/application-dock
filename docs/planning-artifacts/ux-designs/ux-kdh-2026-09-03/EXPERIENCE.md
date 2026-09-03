---
title: "KDH — Experience (EXPERIENCE.md)"
status: draft
created: 2026-09-03
updated: 2026-09-03
sources:
  - ../../../superpowers/specs/2026-09-02-kdh-design.md
  - ../../epics-kdh.md
  - .decision-log.md
design_ref: ./DESIGN.md
inherits_ui_system: "Vue 3 + Quasar v2 (Material-based)"
---

# KDH — Experience Spine

> The how-it-works contract. `DESIGN.md` is the peer document and owns the visual
> identity; tokens are referenced here by name as `{token}`. **Both spines win
> over any mock.** Mock: [`mockups/directions.html`](./mockups/directions.html).

## Foundation

- **Form factor: phone, one layout.** Everyone does everything on a phone,
  admins included. There is no desktop variant and no wide breakpoint. A tablet or
  laptop gets the phone layout centred in the viewport.
- **UI system:** Vue 3 + Quasar v2, inherited from the dock. `DESIGN.md` defines
  KDH's own tokens rather than extending the shell's Carbon theme — KDH is its own
  world, like Hotaru, and does not inherit Hotaru's.
- **Lives inside the shell.** One card on the dock landing page, its own route,
  platform conventions for identity, persistence and the HTTP boundary.
- **Two capabilities, decided by login.** A guest (the shared account) reads,
  claims a name, votes, and recolours themselves. Everyone else additionally
  creates, renames and deletes calendars, manages invitees, and marks chosen days.
  Admin controls are **hidden** from guests, not disabled.

## Information Architecture

| Surface | Reached from | Purpose | Realizes |
|---|---|---|---|
| Calendar list | Dock card → `/kdh` | Every calendar, newest first: name + headcount, the invitees' names beneath, and the next-or-last session | FR-5, FR-17 |
| Create calendar | List (admins only) | Name + initial roster | FR-4 |
| Month | List, or a shared link to `/kdh/c/:id` | The month; the whole point of the app | FR-12, FR-14, FR-16 |
| Name dropdown | Month header | Claim, switch or release your name; change your colour | FR-10, FR-11, FR-9 |
| Day sheet | Tapping a day cell | Who is on that date; set your own answer | FR-13, FR-15 |
| Roster management | Month header menu (admins only) | Add and remove invitees | FR-8 |

The IA gained the **day sheet** during this session: FR-13 as written put names in
the cell, which a 44px cell cannot hold. Names moved one tap away.

## Voice and Tone

Plain, short, never coy. The app never nags and never celebrates.

- Unclaimed prompt: **"Who are you?"** — not "Select your identity".
- Empty month: **"Nobody has picked a day yet."**
- Guest empty list: **"No calendars yet — ask an admin to create one."**
- Availability states read as a person would say them: **Free** · **If needed** ·
  **Can't**. The stored values are `yes` / `if_needed` / absent; those names never
  reach the screen.
- Never "due", "overdue", "streak", or any count of days remaining. Nothing in KDH
  is an obligation.

## Component Patterns

**Day cell.** Tap always opens the day sheet — a past day is worth reading, and an
admin can mark any day chosen without having claimed a name. What a past day loses
is the ability to *answer*, not to be opened; it is dimmed, and its sheet says so.

**Name dropdown.** Selecting a row claims that person and closes the dropdown; **switching is
picking someone else**, and there is no release-to-nobody control. **Unclaimed, it is the loudest
thing on the page** — styled as a required field
left blank (negative border and text, warning glyph), because nothing else can be done until it is
answered. Claimed, it settles into a quiet pill showing that person's colour and name. Closed by
default once claimed. Selecting a row claims that
person immediately and closes. The claim is stored per calendar in `localStorage`;
a stored claim naming a since-removed invitee is discarded silently on load.

**Day sheet.** The three-state control is **explicit** here — three labelled
options — because this is where a person deliberately answers. On the grid itself
a tap **cycles** `none → free → if needed → none` for running down a month
quickly. Both write the same vote.

**Admin controls.** Absent for guests. Never rendered disabled.

## State Patterns

| State | Treatment |
|---|---|
| Loading | The month renders its skeleton grid at `{wash-0}`; no spinner over the whole page |
| Empty (no votes) | Every cell `{wash-0}`; a single line beneath: "Nobody has picked a day yet." |
| Unclaimed | Month fully readable; cells inert; header reads "Who are you?" |
| Past day | 30% opacity, inert, votes and chosen mark still visible |
| Optimistic write | Cell updates immediately; on failure it reverts and the message appears beneath the header |
| Error | One line under the month header. Never a toast — this app is often open for three seconds |
| Palette exhausted | The add-invitee control explains the limit rather than failing on submit |

## Interaction Primitives

- **Tap a cell** → day sheet. **Tap a state in the sheet** → write, sheet stays open.
- **Tap a cell when unclaimed** → the sheet opens with a "say who you are" prompt
  in place of the answer controls, so the first tap still teaches the model but the
  sheet stays reachable for reading and for admin marking.
- **Arrows** move one month. There is no swipe: a swipe on a 7×5 grid of tap
  targets is too easy to trigger while aiming for a Tuesday.
- **No drag, no multi-select, no range.** Marking a stretch of days is repeated
  taps by design; ranges are a v2 idea, not a missing feature.
- Every write is optimistic and reverts on failure.

## Accessibility Floor

- **Colour is never the only signal.** The count is in every cell; chosen and
  provisional are shapes. A person who cannot separate `{wash-4}` from `{wash-5}`
  loses nothing that the number does not carry.
- Touch targets ≥ `{touch-min}`; the day cell is itself the target.
- The month is a table with `scope`d weekday headers. Each cell's accessible name
  reads date, then coverage, then state — *"14 September, all six free, chosen"* —
  so the grid is usable without seeing the wash at all.
- Text meets 4.5:1 against its own wash step; `{ink-on-light}` exists for exactly
  this reason at steps 5–6.
- `prefers-reduced-motion` removes the sheet transition. No ambient motion exists
  to disable.

## Key Flows

### Tom gets the link on the bus

Tom plays in the campaign, has no dock account, and has never opened KDH.

1. Dani pastes the link into the group chat. Tom taps it on his phone.
2. He logs in once with the shared credentials Dani pinned in the chat.
3. The month is already there and readable — a few days glowing, most dark. He can
   see the shape of it before he has done anything.
4. He taps the 14th. Instead of the day sheet, the header dropdown opens: *Who are
   you?* Six names, each with a colour dot.
5. He taps **Tom**. The dropdown closes; the header now shows his mint dot.
6. He taps the 14th again. The sheet opens: Dani, Jake, Ash and Rae are free, Kit
   is *if needed*. He taps **Free**. The 14th goes to `{wash-6}` behind the sheet.
7. **The climax beat:** he closes the sheet and the month has changed under him —
   the 14th is now the brightest thing on the screen, and he can see that the
   answer is settled without anyone having said so.
8. He closes the tab. Next week the link opens straight to the month, still as Tom.

### Dani calls it

Dani is an admin with her own dock account.

1. She opens KDH from the dock and picks the DnD calendar.
2. Two days are at full coverage. One carries a lilac hairline — provisional.
3. She taps it: Kit is only *if needed*. She taps the other.
4. Everyone is freely available. She marks it chosen; a diamond appears.
5. **The climax beat:** she does not message anyone. The next person to open the
   calendar sees the diamond and knows.

## Open Questions

- Is the day sheet a bottom sheet or a full screen? Sheet assumed.
- What does the month header hold for an admin — an overflow menu, or controls
  inline? Menu assumed.
- ~~Does releasing a claim need a confirmation?~~ **Resolved 2026-09-03:** there is no release
  control. Switching by picking another name covers the real case.
