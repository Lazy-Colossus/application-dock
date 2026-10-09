# Multiple Brew Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Several brew sessions can be open at once; opening Brew lets you continue one or start a new one, and switching never loses a steep.

**Architecture:** The server already stores any number of `in_progress` sessions. The phone keeps one active session (`tea-timer:live`). A new `park()` store action pushes the active session and clears it locally; the timer page shows a picker of the server's open sessions whenever nothing is live, gains a "Switch session" menu item, and parks instead of refusing when Brew is opened for a different tea. No backend change.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Pinia, Vitest + @vue/test-utils. All commands run from `frontend/`.

**Spec:** `docs/superpowers/specs/2026-10-04-tea-multiple-brews-design.md`

## Global Constraints

- One steep times at a time — no second clock or chime.
- A plain timer (no tea) is never parked.
- Parking never drops a session: on any failure the session stays live.
- All HTTP through `@/composables/useApi` (already the case in the stores touched).
- Frontend conventions: `defineProps<{}>()` generics, co-located `*.spec.ts`, minimal comments (only the non-obvious *why*).
- Do not reformat files wholesale with prettier — `TimerPage.vue`, `TimerPage.spec.ts`, `useTeaTimerStore.ts` and its spec are already off-prettier at HEAD; format only new files. `npx eslint src/apps/tea` must stay clean.

## Review Focus

- **Switch while offline** → the session stays live and an error says it couldn't be saved (Task 1 store test; Task 3 page test).
- **Discarding the last open session in the picker** → the page falls through to a ready timer, not an empty screen (Task 3).
- **Brew from a tea's page whose tea already has a parked session, while another tea is live** → the live one is parked and the requested tea's parked session is continued, not duplicated (Task 4).
- **Brew from another tea's page mid-steep** → nothing is parked, a notice says to stop the steep first (Task 4).
- **Picker after Switch shows the session just parked** → the open-session list is refetched after parking (Task 3).

---

### Task 1: `park()` on the timer store

**Files:**
- Modify: `frontend/src/apps/tea/stores/useTeaTimerStore.ts` (new function after `push`, add to the returned object)
- Test: `frontend/src/apps/tea/stores/useTeaTimerStore.spec.ts`

**Interfaces:**
- Produces: `park(): Promise<boolean>` on `useTeaTimerStore()` — `true` = session saved on the server and cleared locally; `false` = nothing changed locally except what `push()` itself does (`notice`/`teaware`/`tea` on 404/422), `error` set on a failed save.

- [ ] **Step 1: Write the failing tests.** Add a new `describe` block at the end of `useTeaTimerStore.spec.ts` (it reuses the file's `tea()`, `ALMANAC`, `mockCurve`, `httpError`, `steep` helpers and `putMock`):

```ts
describe("park", () => {
  it("saves the session on the server, then clears it", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    await steep(store, 21);
    const sessionId = store.live!.sessionId;
    putMock.mockClear();

    expect(await store.park()).toBe(true);
    expect(putMock).toHaveBeenCalledWith(
      `/tea/sessions/${sessionId}`,
      expect.objectContaining({ status: "in_progress" }),
    );
    expect(store.live).toBeNull();
    expect(localStorage.getItem("tea-timer:live")).toBeNull();
  });

  it("won't park a plain timer or a running steep", async () => {
    const store = useTeaTimerStore();
    await steep(store, 11);
    expect(await store.park()).toBe(false);

    mockCurve(ALMANAC);
    await store.attachTea(tea());
    store.start();
    putMock.mockClear();
    expect(await store.park()).toBe(false);
    expect(putMock).not.toHaveBeenCalled();
    expect(store.live).not.toBeNull();
  });

  it("keeps the session and reports when the save fails", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    await steep(store, 21);
    putMock.mockRejectedValue(httpError(0));

    expect(await store.park()).toBe(false);
    expect(store.live?.tea?.id).toBe("t-1");
    expect(store.error).toBe("Couldn't save this session — check your connection and try again.");
  });

  it("keeps a session whose tea was deleted elsewhere, as a plain timer", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    await steep(store, 21);
    putMock.mockRejectedValue(httpError(404));

    expect(await store.park()).toBe(false);
    expect(store.live).not.toBeNull();
    expect(store.live?.tea).toBeNull();
    expect(store.notice).toContain("no longer in your cabinet");
  });
});
```

- [ ] **Step 2: Run to verify they fail.**
Run: `npx vitest run src/apps/tea/stores/useTeaTimerStore.spec.ts`
Expected: the four `park` tests FAIL (`store.park is not a function`).

- [ ] **Step 3: Implement.** In `useTeaTimerStore.ts`, directly after the `push` function:

```ts
  /** Step away from the live session, leaving it on the server to continue later. */
  async function park(): Promise<boolean> {
    const session = live.value;
    if (!session?.tea || session.steepStartedAt !== null) return false;
    await push();
    // push() reports through state, not a return value: a 404 has detached
    // the tea (and set the notice), a failed request has left it unsynced.
    if (live.value !== session || !session.tea) return false;
    if (unsynced.value) {
      error.value = "Couldn't save this session — check your connection and try again.";
      return false;
    }
    end();
    return true;
  }
```

`end` is declared later in the store with `function` — hoisting makes the call fine. Add `park,` to the returned object right after `push,`.

- [ ] **Step 4: Run to verify they pass.**
Run: `npx vitest run src/apps/tea/stores/useTeaTimerStore.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/apps/tea/stores/useTeaTimerStore.ts src/apps/tea/stores/useTeaTimerStore.spec.ts
git commit -m "feat(tea): timer store can park the live session on the server"
```

---

### Task 2: Open-session card names the vessel

**Files:**
- Modify: `frontend/src/apps/tea/components/RecoveryCard.vue`
- Test: `frontend/src/apps/tea/components/RecoveryCard.spec.ts`

**Interfaces:**
- Produces: `RecoveryCard` props `{ session: TeaSession; teaName: string; vesselName?: string | null }`; emits unchanged (`resume`, `discard`). Text reads `Unfinished {tea} session · in {vessel} · {when} · {n} infusions`, the vessel part only when `vesselName` is given.

- [ ] **Step 1: Write the failing test.** Append inside the `describe("RecoveryCard")` block:

```ts
  it("names the vessel when there is one", () => {
    const withVessel = mount(RecoveryCard, {
      props: { session: SESSION, teaName: "Tieguanyin", vesselName: "Zhuni" },
    });
    expect(withVessel.get("[data-testid=recovery-text]").text()).toContain(
      "Unfinished Tieguanyin session · in Zhuni ·",
    );
    const without = mount(RecoveryCard, { props: { session: SESSION, teaName: "Tieguanyin" } });
    expect(without.get("[data-testid=recovery-text]").text()).not.toContain(" in ");
  });
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/apps/tea/components/RecoveryCard.spec.ts`
Expected: the new test FAILS.

- [ ] **Step 3: Implement.** In `RecoveryCard.vue`, change the text line and the props:

```vue
    <p class="recovery__text" data-testid="recovery-text">
      Unfinished {{ teaName }} session<template v-if="vesselName"> · in {{ vesselName }}</template>
      · {{ when }} · {{ brewedCount }}
      {{ brewedCount === 1 ? "infusion" : "infusions" }}
    </p>
```

```ts
const props = defineProps<{ session: TeaSession; teaName: string; vesselName?: string | null }>();
```

- [ ] **Step 4: Run to verify it passes.**
Run: `npx vitest run src/apps/tea/components/RecoveryCard.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/apps/tea/components/RecoveryCard.vue src/apps/tea/components/RecoveryCard.spec.ts
git commit -m "feat(tea): an unfinished session's card names its vessel"
```

---

### Task 3: Session picker, New brew, and Switch session on the timer page

**Files:**
- Modify: `frontend/src/apps/tea/pages/TimerPage.vue`
- Test: `frontend/src/apps/tea/pages/TimerPage.spec.ts`

**Interfaces:**
- Consumes: `timer.park(): Promise<boolean>` (Task 1); `RecoveryCard` `vesselName` prop (Task 2); `sessions.fetchInProgress()`, `sessions.inProgress`, `sessions.discard(id)` (existing, `useTeaSessionsStore`).
- Produces (test ids): `timer-picker` (picker wrapper), `timer-new-brew` (button), `timer-switch` (menu button). Existing ids unchanged.

- [ ] **Step 1: Write the failing tests.** In `TimerPage.spec.ts`, add a session builder above `describe("TimerPage")`:

```ts
function openSession(overrides: Partial<TeaSession> = {}): TeaSession {
  return {
    id: "s-9",
    brewed_by: "jakub",
    teaware_id: null,
    vessel_volume_ml: null,
    tea_id: "t-1",
    status: "in_progress",
    started_at: "2026-09-25T19:40:00Z",
    updated_at: "2026-09-25T19:55:00Z",
    finished_at: null,
    leaf_grams: 6,
    water_temp_c: 95,
    rating: null,
    curve_source: "almanac",
    curve_source_label: "almanac: Tieguanyin",
    away_tea_name: "",
    away_class_id: null,
    timed: true,
    cha_xi: null,
    tasting: null,
    image_url: null,
    infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
    ...overrides,
  };
}
```

Then add these tests inside `describe("TimerPage")`:

```ts
  it("shows a picker of open sessions instead of the timer when nothing is live", async () => {
    routes([openSession(), openSession({ id: "s-8", tea_id: "t-2" })]);
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.findAll("[data-testid=recovery-card]")).toHaveLength(2);
    expect(wrapper.find("[data-testid=timer-band]").exists()).toBe(false);

    await wrapper.get("[data-testid=timer-new-brew]").trigger("click");
    expect(wrapper.find("[data-testid=timer-picker]").exists()).toBe(false);
    expect(wrapper.get("[data-testid=timer-band]").text()).toContain("tap to start");
  });

  it("falls through to the timer once the last open session is discarded", async () => {
    routes([openSession()]);
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=recovery-discard]").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-testid=timer-picker]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=timer-band]").exists()).toBe(true);
  });

  it("switches away from a session, then lists it to continue", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([
        { number: 1, target_seconds: 20, actual_seconds: 21 },
        { number: 2, target_seconds: 25, actual_seconds: null },
      ]),
    );
    const wrapper = mount(TimerPage);
    await flushPromises();
    routes([openSession({ id: "s-a" })]);

    await wrapper.get("[data-testid=timer-menu]").trigger("click");
    await wrapper.get("[data-testid=timer-switch]").trigger("click");
    await flushPromises();

    expect(useTeaTimerStore().live).toBeNull();
    expect(putMock.mock.calls.at(-1)![1]).toMatchObject({ status: "in_progress" });
    expect(wrapper.find("[data-testid=timer-picker]").exists()).toBe(true);
    await wrapper.get("[data-testid=recovery-resume]").trigger("click");
    expect(useTeaTimerStore().live?.sessionId).toBe("s-a");
  });

  it("keeps the session when switching fails", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([
        { number: 1, target_seconds: 20, actual_seconds: 21 },
        { number: 2, target_seconds: 25, actual_seconds: null },
      ]),
    );
    putMock.mockRejectedValue(httpError(0));
    const wrapper = mount(TimerPage);
    await flushPromises();

    await wrapper.get("[data-testid=timer-menu]").trigger("click");
    await wrapper.get("[data-testid=timer-switch]").trigger("click");
    await flushPromises();

    expect(useTeaTimerStore().live?.sessionId).toBe("s-a");
    expect(wrapper.get("[data-testid=timer-error]").text()).toContain("Couldn't save");
  });

  it("offers Switch session only for a tea session, and not mid-steep", async () => {
    routes();
    const plain = mount(TimerPage);
    await flushPromises();
    await plain.get("[data-testid=timer-menu]").trigger("click");
    expect(plain.find("[data-testid=timer-switch]").exists()).toBe(false);
    plain.unmount();

    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([{ number: 1, target_seconds: 20, actual_seconds: null }]),
    );
    setActivePinia(createPinia());
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=timer-band]").trigger("click");
    await wrapper.get("[data-testid=timer-menu]").trigger("click");
    expect(wrapper.get("[data-testid=timer-switch]").attributes("disabled")).toBeDefined();
  });
```

The existing test "offers to resume an unfinished server session" keeps passing unchanged (the picker still uses `RecoveryCard`). "shows a failed recovery fetch" must keep passing: the sessions error stays outside the picker/timer switch.

- [ ] **Step 2: Run to verify they fail.**
Run: `npx vitest run src/apps/tea/pages/TimerPage.spec.ts`
Expected: the five new tests FAIL; all others PASS.

- [ ] **Step 3: Implement the template.** In `TimerPage.vue`:

(a) Add the Switch item as the first button inside `<div v-if="menu" class="timer__menu">`:

```vue
        <button
          v-if="timer.live?.tea"
          data-testid="timer-switch"
          :disabled="timer.running"
          @click="onSwitch"
        >
          Switch session
        </button>
```

(b) Replace the whole `<template v-if="!timer.live"> … </template>` block (sessions error + `RecoveryCard` loop) with the sessions error alone, placed right after the existing `timer-error` paragraph:

```vue
    <p v-if="sessions.error && !timer.live" class="timer__notice" data-testid="timer-sessions-error">
      {{ sessions.error }}
    </p>
```

(c) Wrap the header and the timer body in a picker/timer switch. Move `<header class="timer__bar">…</header>` down so the page reads, in order: the `timer-notice` / `timer-error` / `timer-sessions-error` paragraphs, then:

```vue
    <section v-if="picking" class="timer__picker" data-testid="timer-picker">
      <p class="timer__picker-title">Open brews</p>
      <RecoveryCard
        v-for="session in sessions.inProgress"
        :key="session.id"
        :session="session"
        :tea-name="teaName(session.tea_id)"
        :vessel-name="vesselName(session.teaware_id)"
        @resume="onResume(session)"
        @discard="sessions.discard(session.id)"
      />
      <button class="timer__new-brew" data-testid="timer-new-brew" @click="newBrew = true">
        + New brew
      </button>
    </section>

    <template v-else>
      <header class="timer__bar">…unchanged…</header>
      <TeaCup … />
      <p class="timer__elapsed" …>…</p>
      <div class="timer__nudge">…</div>
      <div class="timer__chips">…</div>
      <p class="timer__source" …>…</p>
      <button class="timer__finish" …>…</button>
      <button class="timer__band" …>…</button>
    </template>
```

The scrim and all sheets stay after the `v-else` block, unchanged. (The `timer-notice` and `timer-error` paragraphs move above the header; that's intended — they now show in both modes.)

- [ ] **Step 4: Implement the script.** In `<script setup>`:

```ts
const newBrew = ref(false);
const picking = computed(
  () => !timer.live && !newBrew.value && sessions.inProgress.length > 0,
);

function vesselName(teawareId: string | null): string | null {
  return teaware.items.find((w) => w.id === teawareId)?.name ?? null;
}

async function onSwitch(): Promise<void> {
  menu.value = false;
  if (!(await timer.park())) return;
  newBrew.value = false;
  await sessions.fetchInProgress();
}
```

Put `newBrew`/`picking` next to `sheet`/`menu`, and the two functions next to `teaName`.

- [ ] **Step 5: Add the picker styles** to the `<style scoped>` block, after `.timer__notice`:

```scss
.timer__picker {
  padding-top: 12px;
}
.timer__picker-title {
  margin: 4px 18px 6px;
  color: #8b7a63;
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.timer__new-brew {
  display: block;
  margin: 18px auto 0;
  background: transparent;
  border: 1px solid #3a2f25;
  border-radius: 16px;
  color: #e4d9c6;
  font-family: inherit;
  font-size: 14px;
  padding: 8px 20px;
  cursor: pointer;
}
```

- [ ] **Step 6: Run to verify.**
Run: `npx vitest run src/apps/tea/pages/TimerPage.spec.ts && npx eslint src/apps/tea`
Expected: all PASS, eslint clean.

- [ ] **Step 7: Commit.**

```bash
git add src/apps/tea/pages/TimerPage.vue src/apps/tea/pages/TimerPage.spec.ts
git commit -m "feat(tea): pick an open brew or start a new one; switch away from a brew"
```

---

### Task 4: Brew from another tea's page parks the active session

**Files:**
- Modify: `frontend/src/apps/tea/pages/TimerPage.vue` (`onMounted`)
- Test: `frontend/src/apps/tea/pages/TimerPage.spec.ts`

**Interfaces:**
- Consumes: `timer.park()` (Task 1), `openSession()` test builder (Task 3).

- [ ] **Step 1: Rewrite the obsolete test and add new ones.** In `TimerPage.spec.ts`, replace the test `"blocks swapping to a different tea while the unfinished session has brewed steeps"` entirely with:

```ts
  it("parks a brewed session to start a different tea", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([
        { number: 1, target_seconds: 20, actual_seconds: 21 },
        { number: 2, target_seconds: 25, actual_seconds: null },
      ]),
    );
    routeQuery.value = { tea: "t-2" };
    mount(TimerPage);
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      "/tea/sessions/s-a",
      expect.objectContaining({ tea_id: "t-1", status: "in_progress" }),
    );
    const live = useTeaTimerStore().live;
    expect(live?.tea?.id).toBe("t-2");
    expect(live?.sessionId).not.toBe("s-a");
  });

  it("parks a brewed session and continues the requested tea's open one", async () => {
    routes([openSession({ id: "s-8", tea_id: "t-2" })]);
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([
        { number: 1, target_seconds: 20, actual_seconds: 21 },
        { number: 2, target_seconds: 25, actual_seconds: null },
      ]),
    );
    routeQuery.value = { tea: "t-2" };
    mount(TimerPage);
    await flushPromises();
    expect(useTeaTimerStore().live?.sessionId).toBe("s-8");
  });

  it("won't switch tea mid-steep", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      JSON.stringify({
        ...JSON.parse(
          localLiveSession([
            { number: 1, target_seconds: 20, actual_seconds: 21 },
            { number: 2, target_seconds: 25, actual_seconds: null },
          ]),
        ),
        steepStartedAt: Date.now() - 5_000,
      }),
    );
    routeQuery.value = { tea: "t-2" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(useTeaTimerStore().live?.tea?.id).toBe("t-1");
    expect(putMock).not.toHaveBeenCalled();
    expect(wrapper.get("[data-testid=timer-notice]").text()).toBe(
      "Your Tieguanyin steep is still running — stop it before brewing Dragonwell.",
    );
  });
```

Keep `"still swaps to a different tea when the unfinished session has no brewed steeps"` unchanged — it pins the in-place swap for an empty session.

- [ ] **Step 2: Run to verify they fail.**
Run: `npx vitest run src/apps/tea/pages/TimerPage.spec.ts`
Expected: the three new tests FAIL; the rest PASS.

- [ ] **Step 3: Implement.** In `TimerPage.vue`, extract the nothing-live branch of `onMounted` into a function and use it from both paths. Replace the whole `onMounted(async () => { … })` with:

```ts
/** With nothing live: continue the requested tea's open session, else start it fresh. */
async function openRequested(
  wanted: string | null,
  tea: Tea | undefined,
  teawareLoad: Promise<void>,
): Promise<void> {
  // An unfinished server session for the requested tea must be resumed
  // rather than orphaned by attaching a brand-new one.
  await sessions.fetchInProgress();
  const existing = wanted ? sessions.inProgress.find((s) => s.tea_id === wanted) : undefined;
  if (existing) {
    await teawareLoad;
    onResume(existing);
    return;
  }
  if (tea) await timer.attachTea(tea);
}

onMounted(async () => {
  // Not awaited here: the cabinet/in-progress fetches below don't need it,
  // and only the resume branch does — await it there instead.
  const teawareLoad = teaware.items.length === 0 ? teaware.fetchItems() : Promise.resolve();
  if (cabinet.teas.length === 0) await cabinet.fetchTeas();
  const wanted = typeof route.query.tea === "string" ? route.query.tea : null;
  const tea = wanted ? cabinet.teas.find((t) => t.id === wanted) : undefined;

  // A local session always wins over the server.
  if (!timer.live) {
    await openRequested(wanted, tea, teawareLoad);
    return;
  }

  if (!tea || timer.live.tea?.id === tea.id) return;

  const current = timer.live.tea;
  if (current && timer.running) {
    timer.notice = `Your ${current.name} steep is still running — stop it before brewing ${tea.name}.`;
    return;
  }
  if (current && timer.brewed.length > 0) {
    // Re-targeting would file this tea's steeps under the new one; park it instead.
    if (await timer.park()) await openRequested(wanted, tea, teawareLoad);
    return;
  }
  await timer.attachTea(tea);
});
```

- [ ] **Step 4: Run the whole tea suite and lint.**
Run: `npx vitest run src/apps/tea && npx eslint src/apps/tea && npx vue-tsc --noEmit -p tsconfig.json`
Expected: all PASS, no lint or type errors.

- [ ] **Step 5: Commit.**

```bash
git add src/apps/tea/pages/TimerPage.vue src/apps/tea/pages/TimerPage.spec.ts
git commit -m "feat(tea): brewing another tea parks the session you're on"
```

---

### Task 5: Story doc

**Files:**
- Create: `docs/stories/tea/for-review/multiple-brews.story.md`

- [ ] **Step 1: Write the story.**

```markdown
# Story: Multiple brew sessions

## Status
Ready for Review

## Story
**As a** tea drinker with more than one tea on the go,
**I want** to keep several brew sessions open and pick which one to continue when I open Brew,
**so that** I can move between teas through the day without finishing or losing one.

## Acceptance Criteria
1. Opening Brew with nothing active and open sessions on the server shows them as cards — tea, vessel, when started, infusions so far — with Continue and Discard, and a New brew button that shows the timer ready to start. With none open, Brew goes straight to the timer.
2. The timer's ⋯ menu has Switch session for a tea session: it saves the session and returns to the picker, which lists it. It is disabled mid-steep and absent for a plain timer.
3. If the save fails, the session stays active and an error says so.
4. Brew from another tea's page parks the active session (if it has brewed steeps) and continues that tea's open session, or starts one. Mid-steep it refuses with a notice. A session with no steeps yet just swaps tea, as before.
5. Only one steep times at a time.

## Dev Notes
- Spec: `docs/superpowers/specs/2026-10-04-tea-multiple-brews-design.md`; plan: `docs/superpowers/plans/2026-10-04-tea-multiple-brews.md`.
- Parked sessions live on the server as `in_progress`; the phone keeps one active session in `tea-timer:live`. `useTeaTimerStore.park()` pushes then clears.
- Out of scope: simultaneous steeps; parking a plain timer.
```

- [ ] **Step 2: Commit.**

```bash
git add docs/stories/tea/for-review/multiple-brews.story.md
git commit -m "docs(tea): multiple brew sessions story, ready for review"
```
