import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, ref, type Ref } from "vue";
import { useSectionInView } from "./useSectionInView";

// happy-dom (like jsdom) never lays anything out, so offsetTop/offsetHeight
// are 0 on every element by default — both must be faked per DOM.node.
function fakeEl(top: number, height: number, connected = true): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "offsetTop", { value: top, configurable: true });
  Object.defineProperty(el, "offsetHeight", { value: height, configurable: true });
  // A real, "in view" section is attached to the document; a detached node
  // (left behind after its section was removed from the page) is not.
  if (connected) document.body.appendChild(el);
  return el;
}

function fakeScroll(scrollTop: number, clientHeight: number): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollTop", { value: scrollTop, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  return el;
}

// Mounts a throwaway component so the composable's onMounted/onBeforeUnmount
// have a real component instance, then hands back its exposed activeIndex
// and measure() plus the sectionEls ref so a test can mutate it between
// measurements (simulating sections appearing/disappearing).
function harness(scrollEl: HTMLElement, initial: (HTMLElement | null)[]) {
  const scroll: Ref<HTMLElement | null> = ref(scrollEl);
  const sections: Ref<(HTMLElement | null)[]> = ref(initial);
  const wrapper = mount(
    defineComponent({
      setup() {
        return useSectionInView(scroll, sections);
      },
      render: () => null,
    }),
  );
  return { wrapper, sections };
}

describe("useSectionInView", () => {
  it("activates the section whose centre is nearest the midline", () => {
    // mid = 0 + 1000 * 0.42 = 420. Centres: 100, 400, 800 — 400 is nearest.
    const scrollEl = fakeScroll(0, 1000);
    const els = [fakeEl(0, 200), fakeEl(300, 200), fakeEl(700, 200)];
    const { wrapper } = harness(scrollEl, els);

    wrapper.vm.measure();

    expect(wrapper.vm.activeIndex).toBe(1);
  });

  it("never lets a null or detached entry win over a real one", () => {
    // mid = 420. The detached element's geometry (centre exactly 420) would
    // win if its disconnected state were ignored — the real element's centre
    // (100) is far further away and must win anyway.
    const scrollEl = fakeScroll(0, 1000);
    const real = fakeEl(0, 200);
    const detached = fakeEl(410, 20, false);
    const { wrapper } = harness(scrollEl, [real, detached, null]);

    wrapper.vm.measure();

    expect(wrapper.vm.activeIndex).toBe(0);
  });

  it("keeps its last good value when every entry is null", () => {
    const scrollEl = fakeScroll(0, 1000);
    const els = [fakeEl(0, 200), fakeEl(300, 200), fakeEl(700, 200)];
    const { wrapper, sections } = harness(scrollEl, els);
    wrapper.vm.measure();
    expect(wrapper.vm.activeIndex).toBe(1); // establishes the "last good" value

    sections.value = [null, null, null];
    wrapper.vm.measure();

    // nearestSectionIndex returns -1 here; the >= 0 guard must leave
    // activeIndex alone rather than snapping it to -1 or defaulting to 0.
    expect(wrapper.vm.activeIndex).toBe(1);
  });

  it("does not point at a section that no longer exists once the array shrinks", () => {
    const scrollEl = fakeScroll(0, 1000);
    const els = [fakeEl(0, 200), fakeEl(300, 200), fakeEl(700, 200)];
    const { wrapper, sections } = harness(scrollEl, els);
    wrapper.vm.measure();
    expect(wrapper.vm.activeIndex).toBe(1);

    // Two sections are deleted; only the first survives.
    sections.value = [els[0]];
    wrapper.vm.measure();

    expect(wrapper.vm.activeIndex).toBe(0);
    expect(wrapper.vm.activeIndex).toBeLessThan(sections.value.length);
  });
});
