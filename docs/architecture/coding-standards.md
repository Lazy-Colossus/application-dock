# Coding Standards

Loaded into every dev agent's context (via `core-config.yaml#devLoadAlwaysFiles`). Keep terse — these are rules the dev agent must follow, not a manifesto.

## Philosophy

**Clean Code.** Names mean what they say. Functions do one thing. Modules have one reason to change. Read before you write — match the surrounding style.

**YAGNI.** Build what the story asks for. Not the abstraction you might need. Not the interface for the second caller that doesn't exist yet. Three similar lines is better than a premature abstraction. If a feature isn't in the AC, don't add it.

**No dead code.** Don't commit commented-out blocks. Don't leave `// removed` markers. Don't ship feature flags for code you control unless required. If you remove something, remove it.

**No unnecessary comments.** Default to writing none. Add one only when the WHY isn't obvious from the code — a hidden constraint, a non-obvious invariant, a workaround for a specific bug. Don't restate WHAT the code does.

## Python (Backend)

**Formatter:** [Black](https://github.com/psf/black) with default settings. Run before commit. CI enforces.

**Linter:** [Ruff](https://docs.astral.sh/ruff/) for static checks (PEP 8, unused imports, common bugs).

**Type hints:** Required on all public function signatures (parameters and return types). Internal helpers exempt.

**Imports:** Standard library → third party → local, separated by blank lines. Ruff handles ordering (`isort` rule).

**Style:**
- `snake_case` for functions, variables, modules.
- `PascalCase` for classes and Pydantic models.
- Constants `UPPER_SNAKE_CASE`.
- Docstrings only when behavior isn't obvious from the signature — single line preferred, triple-quoted block only when documenting non-obvious invariants.
- Prefer `pathlib.Path` over `os.path`.
- Prefer f-strings over `.format()` or `%`.

**Errors:**
- Raise standard Python exceptions in repos and services (`FileNotFoundError`, `ValueError`).
- Translate to `HTTPException` only at the router layer.
- Never swallow exceptions silently in repos.

## TypeScript / Vue (Frontend)

**Formatter:** [Prettier](https://prettier.io/) (Quasar's default config). Run before commit. CI enforces.

**Linter:** ESLint (Quasar's default config: `@vue/eslint-config-typescript` + `prettier`).

**Style:**
- Vue SFCs: `<script setup lang="ts">` (Composition API).
- `PascalCase` for component filenames and component names (`ScoreEntryPanel.vue`).
- `camelCase` for composables, prefixed `use` (`useArcherySessionStore.ts`).
- TypeScript interfaces/types: `PascalCase`.
- CSS classes: `kebab-case`.
- Prefer `const` over `let`. Avoid `var`.
- No `any` unless you write a comment explaining why.
- Prefer `interface` over `type` for object shapes; `type` for unions/intersections.

**Vue specifics:**
- One component per file.
- Props typed with `defineProps<{ ... }>()` (generic syntax, not options).
- Emits typed with `defineEmits<{ (e: 'tap', n: number): void }>()`.
- Don't mutate props.
- Reactive state via `ref()` or `reactive()`; prefer `ref` for primitives, `reactive` for objects only when you need deep reactivity.

**State management (Pinia):**
- Every store exposes `loading: Ref<boolean>` and `error: Ref<string | null>` alongside its data refs.
- Every async store action sets `loading = true` before the call and `loading = false` in a `finally` block.
- Errors land in `store.error`. Components display them — never `console.error` alone.

**HTTP:**
- ALL HTTP calls go through `src/composables/useApi.ts`. No raw `fetch`/`axios` in components or stores.
- `useApi` throws `ApiError` (Error subclass with `.status`, `.detail`) on non-2xx.

## API conventions (cross-cutting)

- Endpoints: plural `kebab-case` (`/api/archery/sessions`).
- JSON fields: `snake_case`.
- Responses: direct serialization — Pydantic model or array. No `{ data: ... }` envelopes.
- Dates: ISO 8601 strings (`"2026-05-28T14:00:00Z"`).
- Errors: FastAPI default `{ "detail": "..." }`.
- Status codes: standard (200, 201, 204, 400, 404, 409, 422).

## File organization

- Backend layered: `routers/` (HTTP only) → `services/` (logic) → `repositories/` (I/O only). Don't skip layers.
- Frontend feature-grouped: `src/apps/{app-id}/` for app-specific code; `src/components/` for shared primitives only.
- See `source-tree.md` for the full file tree.

## Tests

- Backend: `pytest`, tests in `backend/tests/`, files named `test_*.py`. Use `tmp_path` for filesystem isolation; `monkeypatch` to override `settings.data_dir`.
- Frontend: Vitest (Quasar default). Co-located `*.spec.ts` next to the component being tested.
- Test the public contract, not the implementation. Don't mock things you own (call them).
- One assertion per test where practical. Multiple assertions OK if they're checking facets of the same behavior.

## Persistence

- All file writes use atomic write-then-rename: `_atomic_write_json(path, payload)` writes to `path.with_suffix(".tmp")` then `os.replace()`.
- Never bypass this for any persisted state.

## Forbidden

- ❌ `{ "data": ..., "status": "ok" }` response envelopes.
- ❌ Unix timestamps in JSON (use ISO 8601).
- ❌ Raw `fetch`/`axios` in Vue components or stores.
- ❌ Archery-specific code under `src/components/` (use `src/apps/archery/components/`).
- ❌ Pinia stores without `loading` + `error` refs and the `finally` pattern.
- ❌ Direct file I/O outside `repositories/`.
- ❌ Skipping `black` or `prettier` before commit.
