# Shared Cabinets — Design Spec

Date: 2026-09-27
App id: `tea`
Status: approved in brainstorming, pending implementation plan

## Problem

The tea app is single-user end to end: each dock user owns a private document
(`DATA_DIR/tea/users/{username}.json`) with their teas, custom catalogue nodes and sessions. A
household that drinks from one physical shelf cannot share it — each person would keep a separate,
diverging copy of the same teas and grams. The upcoming Teaware Cabinet must also belong to
whichever cabinet it is assigned to, so the cabinet needs to become a shareable unit first.

## Intent

**Household sharing** (user's answer): two or more people drink from the same shelf. Every member
adds teas, brews and logs sessions; grams go down whoever drinks.

Success: two dock users see and edit one cabinet; each brews with their own timer and suggestions,
and neither can clobber the other's sessions.

## Scope

**In scope:**

- Cabinets as first-class entities with an id and an owner (`tea/cabinets/{cabinet_id}.json`).
- One cabinet per person; a cabinet may have several members.
- Owner adds members by dock username; members may leave; owner may remove members.
- Lazy one-time migration of existing `users/{username}.json` documents and their images.
- `brewed_by` on sessions; own-only live sessions; household-aware Brewing Curve.
- Household sheet in the UI; brewer labels once a cabinet has more than one member.

**Out of scope:**

- Several cabinets per person, cabinet switcher.
- Ownership transfer.
- Joining with a non-empty cabinet (merge or park). Joining requires an empty cabinet.
- Invitations that need accepting — adding is immediate, as in Shared Notes.
- Roles beyond owner/member; read-only viewers.
- Live push of partner changes (SSE). Data refreshes on the normal fetches.
- Teaware — designed separately and resumed on top of this model.

## Relationship to the Tea PRD

PRD: [`prd-tea-2026-09-06/prd.md`](../../planning-artifacts/prds/prd-tea-2026-09-06/prd.md).
**Where they disagree, this spec (the later decision) wins:**

- **§2.2 "no sharing surface", §5 "Not multi-user, not social", NFR-5 "Single-user privacy"** are
  narrowed: household members may share one cabinet. Still no public sharing, feed, guests as
  users, or read-only viewers. The PRD is updated to say so as part of this work.

## Requirements

### Functional

- **SC-1** A user with no cabinet sees an implicit empty cabinet they own; the first write creates
  it.
- **SC-2** The owner can add a dock user as a member. Refused when the name is not in the roster,
  is the owner, belongs to another cabinet that has other members, or owns a non-empty cabinet
  (any teas, sessions or custom catalogue nodes).
- **SC-3** A member can leave; the owner can remove any member. The owner cannot leave while other
  members remain. Everything a leaver logged stays in the cabinet; the leaver starts with a fresh
  empty cabinet.
- **SC-4** Every member can add, edit and delete teas and custom catalogue nodes, and upload tea
  photos.
- **SC-5** Every session records `brewed_by`, set by the server. Only the brewer can update or
  discard their session.
- **SC-6** Recovery / resume lists only the caller's own in-progress sessions.
- **SC-7** A tea's session history shows all members' finished sessions, with the brewer named
  when the cabinet has more than one member.
- **SC-8** The Brewing Curve prefers the caller's best-rated session, then anyone's, then the tea,
  the Almanac, generic. The label says whose session it came from.
- **SC-9** Deleting a tea still deletes its sessions; the confirmation states how many, and how many
  were brewed by others.

### Non-functional

- **NFR-a** Membership has a single source of truth; no change can leave it inconsistent.
- **NFR-b** Migration is crash-safe: a crash at any step is recovered by the next request.
- **NFR-c** A request that raced a membership change never re-creates a deleted cabinet file.
- **NFR-d** A single-member cabinet looks and behaves exactly as the app does today.

## Data model

### Files under `DATA_DIR/tea/`

```
cabinets/{cabinet_id}.json   cabinet document (replaces users/{username}.json)
images/{cabinet_id}/         tea photos (was images/{username}/)
memberships.json             {"jakub": "c_8f3a…", "partner": "c_8f3a…"}
```

- `memberships.json` maps **every** member — owner included — to their cabinet id. It is the only
  record of membership. Written atomically via `atomic_write_json` under its own `key_lock`.
- Cabinet ids are `c_` + a uuid4 hex, validated on every path join like usernames are today.

### `TeaDoc` (changed — schema v3)

| Field | Change |
|---|---|
| `schema_version` | `3` |
| `id: str` | new — the cabinet id |
| `owner: str` | new — owner's username |

Members are **not** stored in the document; the cabinet view derives them from the map.

### `TeaSession` (changed)

| Field | Change |
|---|---|
| `brewed_by: str` | new — username; server-owned like `id`, `updated_at` |

`brewed_by` lives on `TeaSession`, not `TeaSessionWrite`, so it can never come from a request
body.

### `migrate()`

v2 → v3 adds `id` and `owner` (passed in by the migrating caller) and sets `brewed_by = owner` on
every existing session.

## Repository (`tea_repo.py`)

- `cabinet_for(username) -> str | None` — read the map.
- `create_cabinet(username) -> str` — under the membership lock: new id, write an empty v3 doc,
  then the map entry.
- `read_doc(cabinet_id)`, `doc_transaction(cabinet_id)`, `find_image` / `save_image` /
  `delete_image(cabinet_id, tea_id)` — the existing functions, now keyed by cabinet id.
- `doc_transaction` raises `CabinetGoneError` (a `LookupError` subclass defined in the repo) when
  the cabinet file does not exist, instead of creating it (NFR-c). Creation happens only in
  `create_cabinet`.
- `membership_transaction()` — context manager: map lock, read map, yield, write map.
- `delete_cabinet(cabinet_id)` — remove the doc and its images folder.

### Lazy migration of legacy data

When `cabinet_for(username)` returns `None` and `users/{username}.json` exists, under the
membership lock:

1. Re-check the map. If `username` now has an entry, just delete any leftover
   `users/{username}.json` and stop.
2. Pick the cabinet id: reuse an unreferenced `cabinets/*.json` whose `owner == username` (left by
   an interrupted attempt), else a new id. Write `cabinets/{id}.json` = the migrated doc with
   `owner = username`.
3. If `images/{username}/` exists, move it to `images/{id}/`.
4. Write the map entry.
5. Delete `users/{username}.json`.

Every step is safe to repeat: a crash before step 4 leaves the legacy file, and the retry reuses
the same id (step 2), so images are never split across two folders. A crash after step 4 is
finished by step 1 on the next request.

## Services

- `tea_cabinet_service.py` (new) — `resolve(username, *, create: bool) -> str | None`;
  `get_cabinet(username)`; `add_member(owner, username)`; `remove_member(caller, username)`.
  Raises `PermissionError` (not owner / not your session), `ValueError` (refusals from SC-2/SC-3).
- Existing tea services (`tea_service`, `tea_catalogue_service`, `tea_session_service`,
  `tea_curve_service`) resolve the cabinet once per call: `resolve(..., create=False)` for reads
  (none → empty doc), `create=True` for writes.
- **Add member:** in `membership_transaction` → validate (SC-2) → under the target's cabinet lock,
  check it is empty, then `delete_cabinet` it → map `target → owner's id`. Lock order is always
  membership, then cabinet.
- **Remove / leave:** in `membership_transaction` → check permission and the owner rule → delete
  the target's map entry.
- **Sessions:** on create, `brewed_by = caller`. Update or discard of a session whose `brewed_by`
  differs from the caller → `PermissionError`. `list_in_progress` filters on `brewed_by == caller`.
- **Curve:** `best_session` source, searched first among the caller's sessions, then among all.
  Labels: "from your best session (★5, 12 Sep)" / "from partner's best session (★5, 12 Sep)".
  `CurveSource` is unchanged.

## API

| Route | Who | Returns |
|---|---|---|
| `GET /api/tea/cabinet` | any user | `CabinetView { id: str \| null, owner, members: list[str], is_owner }` |
| `POST /api/tea/cabinet/members` `{ username }` | owner | `CabinetView` |
| `DELETE /api/tea/cabinet/members/{username}` | owner, or that member | `CabinetView` of the caller's cabinet afterwards |

`members` includes the owner. With no cabinet yet, `id` is `null` and the caller is owner and sole
member.

Error mapping in the router (nowhere else):

| Exception | Status |
|---|---|
| `PermissionError` | 403 |
| `ValueError` | 422 with the message as `detail` |
| `CabinetGoneError` | 409 "Your cabinet changed — reload" (all tea routes) |
| `FileNotFoundError` | 404 (unchanged) |

`TeaSession` responses now include `brewed_by`.

## Frontend

### Units

- `stores/useTeaCabinetStore.ts` (new) — `cabinet`, `loading`, `error`; `fetch`, `addMember`,
  `removeMember`, `leave`. All HTTP via `useApi`. After a join or leave that changes the caller's
  cabinet id, it triggers a refetch of the teas, catalogue and sessions stores.
- `components/HouseholdSheet.vue` (new) — owner view: members with Remove, an Add field that
  autocompletes from the dock roster, refusal `detail` shown inline. Member view: owner, members,
  "Leave cabinet" with a confirmation ("You'll start with an empty cabinet. Everything you logged
  stays here.").
- `CabinetPage.vue` — the "Cabinet" title becomes a button opening the sheet; reads
  "Cabinet · with partner" (or "with 2 others") when shared.
- `TeaSessionsList.vue` — "· {brewed_by}" on others' sessions when there is more than one member.
- Tea delete confirmation — "Also deletes N sessions (M by others)" when M > 0.
- `types.ts` — `Cabinet` interface; `brewed_by: string` on `TeaSession`.

### Error handling

A 409 from any tea call shows "Your cabinet changed — reload" and runs the same full refetch as
joining or leaving (covers being removed mid-session). Membership refusals show the backend
`detail` in the sheet.

## Testing

**Backend (pytest, `tmp_path` DATA_DIR):**

- Migration: v2 doc with sessions and an image → cabinet doc, moved images, map entry,
  `brewed_by` filled. Simulated crashes after each step recover on the next request.
- Membership: every SC-2/SC-3 refusal; successful add (target's empty cabinet removed), remove,
  leave; the leaver's next read is an empty cabinet.
- `doc_transaction` on a deleted cabinet raises and does not re-create the file; router → 409.
- Sessions: `brewed_by` set by the server; foreign update or discard → 403; `list_in_progress` is
  own-only.
- Curve: own best → anyone's best → tea → almanac → generic, with the right label.
- Router mapping for 403 / 409 / 422.

**Frontend (vitest, co-located `*.spec.ts`):**

- `useTeaCabinetStore` actions, errors into `error`, refetch after a join or leave.
- `HouseholdSheet` owner and member views, inline refusal.
- Title and brewer labels only when there is more than one member.
- 409 notice and refetch.

## Epics

- **Epic A — Shared Cabinets.** Cabinet storage and lazy migration, membership map and service,
  cabinet-keyed repository, session `brewed_by` rules, household curve, cabinet API, cabinet
  store, Household sheet, brewer labels, 409 handling, PRD update, tests. This is the
  implementation plan's entire scope.
- **Next:** Teaware Cabinet, stored inside the cabinet document (decisions already agreed in its
  brainstorm).
