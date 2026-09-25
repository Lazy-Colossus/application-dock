import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { nearestSectionIndex } from "../shelf";

/**
 * Which section owns its leaves: the one whose centre is nearest 42% down the
 * viewport. Driven by scroll position, never by a timer — nothing on this page
 * moves unless the person moved first.
 */
export function useSectionInView(
  scrollEl: Ref<HTMLElement | null>,
  sectionEls: Ref<(HTMLElement | null)[]>,
) {
  const activeIndex = ref(0);
  let queued = false;

  function measure(): void {
    queued = false;
    const container = scrollEl.value;
    if (!container) return;
    const mid = container.scrollTop + container.clientHeight * 0.42;
    // A null entry, or a stale one left behind after its section was deleted
    // and no longer attached to the document, must never win the nearest
    // race — it is mapped to a centre too far away to be picked, rather than
    // filtered out (which would shift every later index out of alignment
    // with the page's own section array).
    const centers = sectionEls.value.map((el) =>
      el && el.isConnected ? el.offsetTop + el.offsetHeight / 2 : Number.POSITIVE_INFINITY,
    );
    const nearest = nearestSectionIndex(centers, mid);
    if (nearest >= 0) activeIndex.value = nearest;
  }

  function onScroll(): void {
    if (queued) return;
    queued = true;
    requestAnimationFrame(measure);
  }

  onMounted(() => {
    scrollEl.value?.addEventListener("scroll", onScroll, { passive: true });
    measure();
  });
  onBeforeUnmount(() => scrollEl.value?.removeEventListener("scroll", onScroll));

  return { activeIndex, measure };
}
