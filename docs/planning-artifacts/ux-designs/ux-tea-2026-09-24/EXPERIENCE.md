# Tea Cabinet — Experience

> The how-it-works contract. [`DESIGN.md`](DESIGN.md) is the peer document and owns how it looks;
> this one references its tokens by name. **Both spines win over any mock.**
>
> Requirements live in the design spec:
> [`2026-09-24-tea-cabinet-design.md`](../../../superpowers/specs/2026-09-24-tea-cabinet-design.md).
> Where this document and the spec disagree about behaviour, the spec's FR wins and this document
> is wrong and should be fixed.

## Who is using this, and when

One person, at their own tea table, usually mid-session with a warm pot in reach. The phone is in
one hand. The room is dim. The question being asked is almost always one of three:

1. *What do I have?* — answered by scrolling.
2. *How much of this is left?* — answered without tapping anything.
3. *I just brewed 7g.* — must be answerable in one tap and one gesture.

Everything else — provenance, price, cultivar, notes — is consulted occasionally and entered once.
The design follows that split exactly: the shelf serves the first three, a tea's page serves the
rest.

## The shelf

The landing screen. Teas grouped into class sections in the fixed order green, yellow, white,
oolong, red, dark, other. **A class with no teas is not rendered** — an empty heading is a promise
the shelf can't keep.

Within a section, teas sort by name A–Z, with anything at 0g falling to the end **of its own
section**. A finished tea stays on the shelf; there is no archive. It goes quiet — `ink-out` name,
`track-out` rim — but it stays where you'd look for it, because "did I finish that Longjing or just
misplace it" is a real question.

Scrolling changes which section owns its leaves. Nothing else moves.

**Empty cabinet.** The first run shows one line and the add control: *"Nothing on the shelf yet.
Add the first tea."* No illustration, no onboarding.

**While loading**, the shelf shows nothing but the header — no skeleton rows. The list arrives in
one response and usually within a frame or two; a skeleton would flash and be gone.

**On failure**, an error banner (`raised`, leading `ink` rule) sits under the header with what
happened and what to do: *"Couldn't load your cabinet. Check your connection and try again."* The
shelf below stays empty rather than showing stale data.

## Changing how much is left

The everyday act, and the one the whole layout is arranged around.

Tapping a rim on the shelf opens the grams sheet: minus, the number, plus, and Save. Steps of 1g
per tap; press and hold to run. Above Save, a hint states where you started — *"was 38g"* — so a
mis-tap is obvious before it's committed, and there's no undo to design.

The change is **optimistic**: the gauge redraws immediately and the write goes out behind it. If
the write fails, the gauge returns to where it was and the error banner explains. The gauge never
shows a number that isn't on disk without saying so.

The same sheet opens from the large gauge on a tea's page. It is the only way grams change — there
is no session log, no auto-decrement, and no "brew this" action in v1.

**The rule the sheet enforces:** remaining may not exceed purchased. Trying to save more than you
bought is refused with *"You've only bought 100g of this. Change the amount bought first."* —
naming the fix rather than the violation.

## A tea's page

Reached by tapping a tea's name. The whole record, grouped under *Where it's from*, *What it cost*,
*On the shelf*, then Notes. Everything on this page is editable in place; there is no separate edit
mode and no pencil icon — tapping a value opens the right control for it.

Price per gram appears under what you paid, computed and never stored, and only when both the price
and the amount bought are known. A field you've never filled shows nothing at all rather than a
dash or a placeholder — an empty cabinet of fields is not a to-do list.

**Removing a tea** is the last thing on the page, in `ink-lo`, worded as what it does: *"Remove
from cabinet."* It asks once, naming the tea, and says plainly that the notes go with it.

## Adding a tea

Two fields are required: a name and a classification. Everything else can be filled now, later or
never. The form must never feel like a gate between you and a shelf entry.

### Classifying it

The picker opens as a sheet. Tiers appear one under the next as you narrow, and stop when the tea
has no deeper kinds — one tap for a bare class, three for Rou Gui. Choices are **chips, not
dropdowns**: every option at a tier stays visible, so the taxonomy is learned in passing rather
than hunted through, and the whole thing is one thumb.

A selected chip fills with its class's `liquor`. Chips below the top tier take the class's `head`
colour, because they belong to it.

**Every tier below the first ends with "+ Add one."** A tea missing from the catalogue is added in
place, with the parent stated rather than asked for. Three fields, two of them optional: name,
Chinese, and where it's usually from. The cost of adding a node must stay below the cost of giving
up and typing the tea's identity into the notes — that is the whole reason the catalogue will stay
accurate.

The sheet says what your own additions mean: *"Everyone's catalogue starts the same; what you add
is yours alone, and the teas that ship with the app are never changed by it."*

### Prefill, announced before it happens

When you pick a node, the picker's footer states what is about to be filled in and that you can
change it: *"Origin will fill in as Wuyi Shan, Fujian — you can change it."*

The rule, precisely: walk from the chosen node up its ancestors, take the first `default_origin`
found, and write it into `origin` **only if the field is untouched**. Prefill never overwrites
something you typed and never fires twice for the same field. In v1 origin is the only field this
applies to; the mechanism is built to widen when the Almanac adds suggested brewing parameters.

## Leaving a form with unsaved changes

Asked once, plainly: *"Leave without saving? Your changes to this tea will be lost."* Sixteen
fields is enough typing that silently discarding it would be a betrayal; one confirm is enough that
it doesn't become nagging.

## Deleting a catalogue node

Allowed only for nodes you added and only when no tea points at one. Refused otherwise, with the
count: *"Three teas are classified as Wuyi yancha. Reclassify them first."* Nothing is ever
silently reparented or cascaded — a taxonomy that rewrites your records while you're not looking is
worse than no taxonomy.

Teas that ship with the app cannot be deleted or renamed. Renaming your own nodes is not in v1.

## Voice

Sentence case, plain verbs, no exclamation marks, no apologies. The interface never says "Oops."

Errors state what happened and the next move. Empty states are invitations, not decoration. An
action keeps its name from the button through to the result: *Save* saves, *Add to catalogue* adds
to the catalogue, *Remove from cabinet* removes from the cabinet.

Tea terms are used correctly and without translation into marketing English: the classes are green,
yellow, white, oolong, red and dark, not "black" for red; a class heading carries its Chinese; a
cake is a cake. The person using this app knows more about tea than the app does, and the copy
should never imply otherwise.

## Accessibility floor

- Every gauge is a 44px target, and the gauge *is* the target.
- Colour is never the only carrier of meaning: class is also named in text, low is also a dashed
  fill and a tick, empty is also a `0`.
- `prefers-reduced-motion` removes the leaf transition; the visual states remain.
- Keyboard focus is visible on every control, on the sheets included.
- Chinese is marked `lang="zh"` so a screen reader doesn't read it as Latin.
