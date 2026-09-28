# Tea Label Scan — Design Spec

Date: 2026-09-28
App id: `tea`
Status: approved in brainstorming, pending implementation plan

## Problem

Adding a tea means typing its details off the packet: the name (often part-Chinese), vendor,
year, cultivar, weight. The existing Jev **Autofill** button helps only once a name has been
typed, and only with category and origin. The New Tea page has no photo upload at all, only a
"Photo URL" text field; real upload exists only on the detail page, after saving.

## Intent

Take a photo of the tea's label while adding it, and have the form fill in what can be read
off it. Jev keeps the category-matching job it already does.

- The photo is read by **Claude vision** (Haiku 4.5, server-side). Jev is text-only, so it
  can't read the image itself.
- Fields filled: **name, category, origin, vendor, year, cultivar, grams purchased**. Harvest
  season and form are out.
- The scan **only fills empty fields**; it never overwrites what the user typed.
- A **"Use as tea photo"** checkbox (unchecked by default) decides whether the scanned photo
  also becomes the tea's photo when saved.

Success: for a typical vendor packet, one scan fills name, category, and most of the rest, and
the user only corrects and adds grams remaining, price, and storage.

## Scope

**In scope:**

- `POST /api/tea/scan-label`: an image in, a `LabelScanSuggestion` out.
- New service `tea_label_scan_service.py`, the only module that talks to Anthropic.
- The Jev category step reused, with the label text as extra context.
- "Scan label" button, thumbnail, status message and checkbox on the New Tea form.
- Uploading the scanned photo after a successful create, when the box is checked.
- `ANTHROPIC_API_KEY` config; also add the missing `TYPESAFE_API_KEY` passthrough to
  `docker-compose.yml` (it's in `config.py` but compose never forwards it).

**Out of scope:**

- Scanning on the detail/edit page (it already has real photo upload).
- Harvest season and form.
- Storing scan results or the raw label text.
- Scanning several photos (front + back) of one tea.
- Tuning the Jev confidence threshold; it stays as it is.

## Architecture

```
TeaForm ──"Scan label"──▶ useTeaCatalogueStore.scanLabel(file)
                              │  api.upload("/tea/scan-label", file)
                              ▼
routers/tea.py  POST /scan-label   (exceptions → HTTPException)
                              │
                              ▼
services/tea_label_scan_service.scan(username, content, content_type)
   1. validate image           (tea_service.image_extension — same 5MB / type rules)
   2. Claude Haiku 4.5         image + prompt → LabelReading (structured output)
   3. Jev category             tea_autofill_service.match_category(username, name, label_text)
   4. origin fallback          label origin, else category default_origin, else Almanac country
                              │
                              ▼
LabelScanSuggestion ──▶ TeaForm fills empty fields; keeps File + checkbox
NewTeaPage.save() ──▶ createTea ──▶ (checked) cabinet.uploadImage(id, file) ──▶ detail page
```

No new repository code: nothing is persisted by the scan itself. The photo is written only by
the existing `POST /teas/{id}/image` endpoint, after the tea exists.

## Backend

### Config (`app/core/config.py`)

```python
# Anthropic (Claude vision) — Tea Cabinet label scan. Server-side only.
# With this unset, the scan endpoint reports itself unconfigured (503).
anthropic_api_key: str = ""
label_scan_model: str = "claude-haiku-4-5"
```

`docker-compose.yml` gains `ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}` and
`TYPESAFE_API_KEY: ${TYPESAFE_API_KEY:-}`.

### Dependency

Add the official `anthropic` Python SDK to `requirements.txt` (pinned to the current
release at implementation time). The service calls `anthropic.Anthropic(api_key=...,
timeout=20.0, max_retries=1).messages.parse(...)`, not raw httpx.

### Schemas (`app/schemas/tea.py`)

```python
class LabelScanSuggestion(BaseModel):
    """What a photo of a tea's label could fill in. Empty/None = not read."""

    name: str = ""
    catalogue_node_id: str | None = None
    origin: str = ""
    vendor: str = ""
    year: int | None = None
    cultivar: str = ""
    grams: float | None = None
```

The model's structured-output shape (`LabelReading`) lives in the service module, not in
`schemas/`, because it's an internal contract with Claude, not the API:

```python
class LabelReading(BaseModel):
    name: str          # the tea's own name as printed, CJK kept; "" if unreadable
    vendor: str
    year: int | None
    cultivar: str
    grams: float | None  # net weight of the package in grams
    origin: str        # place of origin as printed (region/country); ""
    label_text: str    # all legible text, for Jev's context
```

### Service (`app/services/tea_label_scan_service.py`)

- `scan_enabled() -> bool`: whether `settings.anthropic_api_key` is set.
- `scan(username, content, content_type) -> LabelScanSuggestion`
  1. `tea_service.image_extension(content, content_type)`: raises `ValueError` for a bad
     type or >5MB (the client downscales first, see below, so this is a safety net).
  2. No key → `LabelScanNotConfiguredError`.
  3. One `messages.parse` call: a base64 `image` block, then a text prompt, with
     `output_format=LabelReading`, `max_tokens≈1024`. The prompt says: this is a photo of
     a tea package/label; copy text as printed; leave any field empty/null when not
     clearly shown rather than guessing; `name` is the tea itself, not the brand or a
     marketing line; `grams` is the net weight; `year` is the harvest/production year.
  4. Anthropic errors (connection, timeout, status, a `refusal` stop reason, or no parsed
     output) → `LabelScanUpstreamError`.
  5. Year sanity: drop a `year` outside `_MIN_YEAR..current year` and a non-positive
     `grams`, so the form never gets a value the write endpoint would reject.
  6. If `reading.name` or `reading.label_text` is non-empty and Jev is configured, call
     `tea_autofill_service.match_category(username, name, label_text)`. A Jev failure
     (not configured, upstream error) **does not fail the scan**: the category stays
     `None` and the Claude fields are still returned.
  7. Origin: `reading.origin`, else the matched category's origin as the existing
     autofill works it out.

### Autofill refactor (`tea_autofill_service.py`)

Split `suggest()` so the scan can reuse it without duplicating the catalogue/criteria code:

- `match_category(username, name, context="") -> AutofillSuggestion | None`: the current
  body of `suggest()`. When `context` is non-empty it goes into Jev's `state` as
  `label_text`, and the instructions gain one sentence: "`label_text`, when present, is
  all the text read off the tea's packaging; use it as further evidence."
- `suggest(username, name)` keeps its current behaviour (validation + `match_category`
  with no context), so `/autofill` and its tests don't change.

### Router (`app/routers/tea.py`)

```python
@router.post("/scan-label", response_model=LabelScanSuggestion)
async def scan_tea_label(file: Annotated[UploadFile, File()], current_user=...):
```

| Service raises | HTTP |
|---|---|
| `ValueError` (bad type / too large) | 422 |
| `LabelScanNotConfiguredError` | 503 "Label scan is not configured on this server (ANTHROPIC_API_KEY)" |
| `LabelScanUpstreamError` | 502 "Couldn't read the label right now" |

The sync SDK call runs via `run_in_threadpool` so it doesn't block the event loop.

## Frontend

### Types + store

- `types.ts`: `LabelScanSuggestion` interface mirroring the schema.
- `useTeaCatalogueStore.scanLabel(file: File): Promise<LabelScanSuggestion | null>`, using
  the existing `api.upload` (it already sends `FormData` correctly). `loading`/`error` as
  in `autofill`; `null` on failure, with the message in `error`.

### Downscaling (`src/apps/tea/image.ts`)

Phone photos are often over 5MB. A small `downscaleImage(file, maxSide = 1600): Promise<File>`
draws onto a canvas and re-encodes as JPEG (~0.85 quality) when the longest side is over
`maxSide` or the file is over ~4MB; otherwise it returns the original. The downscaled file
is used for **both** the scan and the saved photo. (1600px is enough for Claude to read
label text; it resizes large images down anyway.)

### TeaForm

Next to the "Photo URL" field:

- **"Scan label"** button → hidden `<input type="file" accept="image/*" capture="environment">`.
- After a pick: downscale, show a thumbnail (`URL.createObjectURL`, revoked on replace and
  unmount), with the button showing "Reading label…" and disabled while the request runs.
- On a result, **one merged patch** fills each field only when it is currently empty:
  `name`, `catalogue_node_id`, `origin` (also honouring the existing `touchedOrigin` guard),
  `vendor`, `cultivar`, `year` (when null), `grams_purchased` (when null). `grams_remaining`
  is set to the same grams when it is still `0`.
- Message under the thumbnail: "Filled name, vendor, year, category" (the fields actually
  changed), or "Couldn't read anything new from this photo", or the store error.
- **"Use as tea photo"** checkbox under the thumbnail, unchecked by default.
- `TeaForm` emits `update:scan` with `{ file: File, usePhoto: boolean } | null` so the
  page owns what happens on save. The form stays free of cabinet/save logic.

### NewTeaPage

- Holds `scan` from the form.
- `save()`: after `createTea` succeeds, if `scan?.usePhoto`, `await cabinet.uploadImage(id,
  scan.file)`. If that fails, the tea is still saved: navigate to the detail page anyway
  and leave the cabinet store's error set, so the detail page's existing photo controls
  can retry.
- `dirty` also counts a picked scan photo, so the leave-without-saving prompt covers it.

## Error handling summary

| Situation | What the user sees |
|---|---|
| No `ANTHROPIC_API_KEY` | Message: "Label scan is not configured on this server…" |
| Claude down / timeout / refusal | Message: "Couldn't read the label right now"; form unchanged |
| Jev down or unsure | Other fields filled; category left for the picker |
| Nothing legible | "Couldn't read anything new from this photo" |
| Photo upload after save fails | Tea saved; detail page with error, photo can be re-added |

## Testing

**Backend** (`backend/tests/test_tea_label_scan.py`), stubbing the Anthropic client via
`monkeypatch` on the module and the TypeSafe call via its existing test approach:

- Fields map from `LabelReading` to `LabelScanSuggestion`; blank fields stay blank.
- Out-of-range year and non-positive grams are dropped.
- Origin fallback: label origin wins; else the category default.
- Jev low confidence, not configured, or upstream error → `catalogue_node_id` `None`, the
  rest still returned.
- No Anthropic key → not-configured error; SDK error / refusal → upstream error.
- `match_category` puts `label_text` in state only when context is given; `suggest()`
  output is unchanged (existing autofill tests keep passing).
- Router: 422 for a non-image / >5MB, 503, 502 mapping; happy path returns the schema.

**Frontend:**

- `TeaForm.spec.ts`: a scan fills only empty fields and leaves typed ones alone; grams sets
  `grams_remaining` only from 0; message lists changed fields; `update:scan` emits the file
  and checkbox state.
- `NewTeaPage.spec.ts`: photo uploaded after save only when checked; save still navigates
  when the upload fails; a picked photo makes the page dirty.
- `useTeaCatalogueStore.spec.ts`: `scanLabel` posts the file, sets `loading`, routes errors.
- `image.spec.ts`: small images pass through untouched (canvas downscaling itself is
  browser-only and not unit-tested under jsdom).

## Costs and privacy

Each scan is one Haiku 4.5 call with a ~1600px image (roughly 1.5–2k input tokens), so
well under a cent per photo, plus one Jev call. The photo is sent to Anthropic; nothing
is sent unless the user presses "Scan label".
