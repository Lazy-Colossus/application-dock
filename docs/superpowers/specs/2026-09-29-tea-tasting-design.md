# Tasting Sheet — Design Spec

Date: 2026-09-29
App id: `tea`
Status: approved in brainstorming, pending implementation plan

## Problem

The Cha Xi Journal records the table (photo, moods, guests, notes) but not the tea itself. Everything
a tasting notebook asks — the aroma at each stage, the body, the mouthfeel, hui gan, sheng jin, how
the tea sits in the body — can only go into free-text notes, so it can't be read at a glance or
compared across sittings.

## Intent

User's answers:

- **The user's Chinese tasting notebook is the baseline**, in English: its 香&气 (Aroma & Qi)
  and 感&觉 (Sensation) page, field for field — some fields rated, some written.
- Plus **dry & wet leaf**, **liquor colour & clarity**, and **cup / lid aroma**. Not a taste
  (sweet / bitter / umami) section.
- **Per session**, never per infusion.
- **One long Cha Xi page**: the tasting sections sit, collapsible, under the table's fields.
- Beyond the entry page, it shows as **a line on Journal cards** and **averages on the tea's page**.
  Side-by-side comparison waits.

Success: a sitting can be tasted at the table in the notebook's own vocabulary without leaving the
brew strip, and a tea's page says what the tea is usually like.

## Scope

**In scope:** a typed `Tasting` on `TeaSession`; a declarative field list driving one
`TastingFields` component on the Cha Xi page and the Journal form; a Tasting block on the entry
page; a tasting line on Journal cards; a tasting summary on the tea's page.

**Out of scope:** the Flavor Wheel and user-defined fields (PRD FR-15, FR-16); comparing two
sittings side by side (the other half of FR-17); per-infusion tasting; a taste section.

## Relationship to the Tea PRD

This is a structured superset of FR-15's "flavor fingerprint" for the user's own vocabulary, and
delivers FR-17's per-tea aggregate as the tea page's summary. The wheel's tap-through notes and its
extensibility remain future work; the free-text aroma fields are where such notes go today.

## Data model

### `Tasting` (new, `app/schemas/tea_session.py`)

★ = optional integer 1–5. Every field is optional; text defaults to `""`, picks to `[]`.

| Section | Field | Kind | Notebook |
|---|---|---|---|
| **Leaf** | `leaf.dry` | text — dry leaf look & fragrance | new |
| | `leaf.wet` | text — warmed / wet leaf fragrance | new |
| | `leaf.spent` | text — spent leaves | 叶底, new |
| | `leaf.quality` | ★ | new |
| **Liquor** | `liquor.colour` | one of `pale_jade, yellow_green, golden, amber, orange_red, red, deep_red, dark_brown` | new |
| | `liquor.clarity` | ★ | new |
| **Aroma & Qi** | `aroma.aroma` | text | 香气 |
| | `aroma.aroma_type` | text | 香型 |
| | `aroma.richness` | ★ | 丰富程度 |
| | `aroma.top_note` | text — at the nose | 前调（鼻前） |
| | `aroma.middle_note` | text — liquor in the mouth | 中调（茶汤在口中） |
| | `aroma.base_note` | text — after swallowing | 后调（吞咽后） |
| | `aroma.tail_note` | text — a minute or two after | 尾调（饮后一两分钟） |
| | `aroma.cup_aroma` | text — empty cup / lid | new |
| | `aroma.structure` | picks of `single, simple, coarse, short, high, layered, complex, delicate, long, deep` | 香气结构: 单一 简单 粗狂 短促 高扬 多元 复杂 细腻 悠长 沉稳 |
| **Sensation** | `sensation.body` | one of `watery, light, mild, mellow, thick` | 汤感浓度: 水味 淡 和 醇 浓 |
| | `sensation.smoothness` | ★ | 顺滑 |
| | `sensation.saturation` | one of `low, medium, fairly_high, high` | 饱和度: 低 中 稍高 高 |
| | `sensation.throat` | ★ | 喉韵 |
| | `sensation.mouthfeel.{thin, dry, astringent, rough, thick, moist, slick, cooling}` | ★ each | 触觉: 薄 干 涩 粗 厚 润 滑 清凉 |
| | `sensation.hui_gan.{strength, duration}` | ★ each | 回甘: 明显程度 持久程度 |
| | `sensation.sheng_jin.{strength, duration}` | ★ each | 生津: 明显程度 持久程度 |
| | `sensation.body_feel` | picks of `none, sweating, warmth, head_rush` | 体感: 体感不明显 手/背出汗 温和且持续的发热 头晕上头且冒冷汗 |
| | `sensation.body_feel_other` | text | 体感: the blank |

Validation: ★ outside 1–5 refused; picks unique, stored in the listed order; `body_feel` `none`
cannot be combined with another feeling. Models: `Leaf`, `Liquor`, `Aroma`, `Mouthfeel`,
`Intensity` (`strength`, `duration`), `Sensation`, `Tasting` — nested sub-models default to empty
instances, so a partial tasting is valid.

### Session (changed)

`TeaSessionWrite` and `JournalEdit` gain `tasting: Tasting | None = None`. It rides live snapshots
like `cha_xi`; finishing keeps it; a Journal edit replaces it.

### `TeaDoc` — schema v6

`migrate()` v5 → v6 is a version bump only.

## Frontend

### `tasting.ts` (new) — the field list and pure helpers

- `TASTING_SECTIONS`: `{ key, title, zh, fields: TastingField[] }[]` in the order above, where
  `TastingField = { path, label, zh?, kind: "text" | "stars" | "scale" | "picks", options? }` and
  options carry `{ value, label, zh }`. English labels, Chinese shown small beside them.
- `emptyTasting()`, `isEmptyTasting(t)`, `getAt(t, path)`, `setAt(t, path, value)` (returns a new
  object).
- `tastingLine(t): string` — up to three parts joined by " · ": `aroma_type` (else `aroma`), the
  `body` label, then the highest-rated of hui gan strength, throat, smoothness as
  "hui gan ★★★★" (ties in that order). `""` when nothing applies.
- `tastingSummary(sessions): TastingSummary | null` — over sessions with a non-empty tasting;
  `null` if none. Holds `count`; for every ★ field rated at least once, its average (one decimal)
  and how many rated it; the most common `body` and `saturation` (ties → the earlier scale value);
  `structure` picks by frequency; recurring aroma words — `aroma` and `aroma_type` split on commas,
  trimmed, lower-cased, kept when they occur in two or more sittings.
- `hasChaXi` (in `journal.ts`) also returns true for a non-empty tasting.

### Components

- `StarRating.vue` — five stars, `v-model` `number | null`; tapping the current value clears it;
  each star's accessible name is "N of 5".
- `TastingFields.vue` — `v-model` `Tasting | null`; renders `TASTING_SECTIONS` as collapsible
  sections headed "Aroma & Qi · 6 noted". A section starts open when it already holds a value.
  Kinds: text input, `StarRating`, single-pick chips in scale order, multi-pick chips. Emits
  `null` once every field is empty again.

### Pages

- **Cha Xi page:** `TastingFields` below `ChaXiFields`, bound to the live session's `tasting`
  through the timer store (`setTasting`), synced by the same 1.5 s debounce and flush-on-leave.
- **Journal form:** `TastingFields` below the cha xi fields; `tasting` is sent on create and edit.
- **Journal entry page:** a Tasting block listing only filled fields by section — stars as
  ★★★★☆, picks as words, the four aroma stages as nose → mouth → after swallowing → tail.
- **Journal card:** `tastingLine` under the moods when non-empty.
- **Tea page:** a Tasting section when `tastingSummary` is non-null: "across N tasted sittings",
  the ★ averages, the usual body and saturation, frequent structure words, recurring aroma words.
  Computed from the sessions the page already loads; no new endpoint.

## Testing

Backend (`backend/tests/test_tea_tasting.py`): a full tasting round-trips through snapshot, finish
and Journal edit; pick normalisation; refusals (★0, ★6, unknown pick, repeated pick, `none` with
another feeling); v5 → v6.

Frontend: `hasChaXi` true for a tasting-only sitting; `tasting.ts` (`isEmptyTasting`, `tastingLine` parts/priority/empty, `tastingSummary`
averages skipping unrated fields, usual body with tie rule, recurring words needing ≥ 2 sittings,
none tasted → null; every `TASTING_SECTIONS` path resolves on `emptyTasting()`), `StarRating`,
`TastingFields` (each kind, counts, open-when-filled, back to null), Cha Xi page tasting sync,
entry page filled-only display, card line, tea page summary shown only with tasted sittings,
form sends `tasting`.

## Docs

A story in `docs/stories/tea/`, moved to `for-review/` when built; a pointer from PRD §4.6.

## Delivery

Two commits-worth of stages on `main`: (1) backend schema v6 and tests; (2) frontend list,
components, pages and summary.
