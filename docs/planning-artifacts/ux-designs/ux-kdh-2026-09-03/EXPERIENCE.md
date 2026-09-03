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

- **Form factor: two layouts, phone and web**, splitting at **700px**. The phone
  layout is primary and is the constraint the interface was designed against; the
  web layout is the same app given room — a centred band at 66% of the window,
  larger numerals, and cells tall enough to list the voters. There is no third
  size: a tablet takes whichever side of the breakpoint it falls on.
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
| Month tally | Beneath the grid, always | Per-person vote totals for the visible month, ranked, with bars | FR-14 |
| Clear my month | Month header menu (anyone claimed) | Drop your own votes and notes across the visible month | FR-15 |

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
- What you left on a day is a **vote**. The day sheet still *asks* ("Can you make
  it?") and names the three states in plain words — that is the moment of
  answering — but everywhere else the app calls the thing by one name.
- Never "due", "overdue", "streak", or any count of days remaining. Nothing in KDH
  is an obligation.

## Component Patterns

**Day cell.** The coverage count sits in a padded target that highlights on hover;
pointing at it shows a floating list of who is on that day, in roster order, with if-needed people marked — the day sheet's content
without the tap. It is **hover-only**, so it does not exist on a phone; that is
acceptable because the sheet already carries the same list one tap away, and a
long-press equivalent would fight the tap that opens the sheet. A touch affordance
is an open question, not an oversight.

Tap opens the day sheet on any day that is not past. A **past day does not open at
all** — its sheet had nothing to offer but a "this has been and gone" line — but it
stays *readable*: the hover list above still names who was there. That is why a past
cell is inert to the click rather than `disabled`; disabling a button suppresses
pointer events on its children and would take the hover list with it.

**Your own answer in the cell.** The leading corner of the reserved crown row is
kept for the current person's own vote — filled for free, half-filled for if
needed, in the same green and yellow the day sheet's answer buttons use. It is
the only personal mark in a cell of group facts, which is why it gets a corner
nothing else uses and why it is not folded into the count. Being in the same
place in every cell, it makes the month scannable for your own days without
reading a number. It shows at both sizes: on a phone nothing else identifies you,
and on web scanning a corner still beats finding your name among six.

Because a "can't" is stored as no vote, this mark means **days you said yes to**,
not days you answered — a deliberate no is indistinguishable from silence here.

**Name dropdown.** The control sits on the **right of the header**, beside the admin
menu — it is a control, not part of the calendar's name, and the title needs the
room. Selecting a row claims that person and closes the dropdown; **switching is
picking someone else**, and there is no release-to-nobody control. **Unclaimed, it is the loudest
thing on the page** — styled as a required field
left blank (negative border and text, warning glyph), because nothing else can be done until it is
answered. Claimed, it settles into a quiet pill showing that person's colour and name. Closed by
default once claimed. Selecting a row claims that
person immediately and closes. The claim is stored per calendar in `localStorage`;
a stored claim naming a since-removed invitee is discarded silently on load.

**Day sheet.** Opens with the day's shape as a proportional bar, then the people who
answered — filled glyph for free, half-filled for if needed, and nobody else, since
an unanswered day is treated as a no. The three-state control is **explicit** here —
three labelled options carrying the same glyphs as the rows — because this is where
a person deliberately answers. On the grid itself
a tap **cycles** `none → free → if needed → none` for running down a month
quickly. Both write the same vote.

**Header menu.** Open to anyone who has claimed a name, because it carries one
action of their own: *Clear my votes for {Month}*. It clears only the current
person's marks, only in the month on screen, and only from today onward — past
days are records and stay. **Notes go with the votes**, and a day carrying only a
note is swept too: this is a person erasing their mark on the month, and leaving
the notes would make "clear" a lie. Days holding nothing of yours are not counted,
so the confirmation's number is the number of days that will actually change.

It confirms first, where bulk answering does not: collecting days by hand states
intent, but one tap in a menu can undo a month. The confirmation puts what goes
and what is safe on **separate lines**, the reassurance quieter than the warning.

Clearing a month is the one place notes are swept. Answering **Can't** — in the
sheet or across a selection — always keeps them, which is exactly when a note
earns its place.

**Month tally.** Under the grid and moving with it: one line per invitee giving
how many days in the visible month they have voted on, **busiest first**, each with
a bar scaled to the busiest person's count. The total leads; `(N past)` follows it
only in the month containing today, since no other month has two halves. Today
counts as current. The bar splits current from past in the same two shades, and
someone who has said nothing keeps an **empty track** — the visible gap is the
point. Bars are decorative (`aria-hidden`); the number is right beside them. It answers *who has not said anything yet*, which the
grid cannot show at a glance: a thin day is visible, but whose silence made it thin
is not. Someone who has not voted reads "nothing yet", quieter than the rest — this
app does not nag. Before anyone has voted the whole thing collapses to a single
sentence. A departed invitee appears only in a month where they voted, tagged LEFT.

**Admin controls.** Absent for guests. Never rendered disabled. They live in the
same menu, so a guest opens a shorter one rather than a different surface.

## State Patterns

| State | Treatment |
|---|---|
| Loading | The month renders its skeleton grid at `{wash-0}`; no spinner over the whole page |
| Empty (no votes) | Every cell `{wash-0}`; a single line beneath: "Nobody has picked a day yet." |
| Empty tally | One line, "Nobody has voted this month yet." — never a column of zeroes |
| Unclaimed | Month fully readable; cells inert; header reads "Who are you?" |
| Past day | 30% opacity, inert, votes and chosen mark still visible |
| Your answer, unset | No mark in the leading corner — the same as a deliberate "can't" |
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
- **A selection mode, not a drag.** The month header toggles into selecting; a tap
  then collects a day rather than opening it, and the collected days are answered
  together — with the **same three answers as the day sheet**, in the same words
  and glyphs, presented as equal thirds so none reads as the default. Applying one
  **overwrites** every collected day: bulk settles a day rather than filling in
  only the ones you had not answered, and **Can't** clears the answer outright. Still no drag and no range: a drag over a grid of tap targets is too
  easily started by accident, the same reason there is no swipe.
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
   you?* Six names.
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
4. Everyone is freely available. She marks it chosen; a crown appears above the date.
5. **The climax beat:** she does not message anyone. The next person to open the
   calendar sees the crown and knows.

## Open Questions

- How should the hover list of voters be reached on a touch screen, where there is
  no hover? Nothing is lost today — the day sheet shows the same list on tap — so
  this is a convenience to add, not a gap to close.
- Is the day sheet a bottom sheet or a full screen? Sheet assumed.
- What does the month header hold for an admin — an overflow menu, or controls
  inline? Menu assumed.
- ~~Does releasing a claim need a confirmation?~~ **Resolved 2026-09-03:** there is no release
  control. Switching by picking another name covers the real case.
