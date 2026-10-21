import { onBeforeUnmount, ref, type Ref } from "vue";

const PHONE_QUERY = "(max-width: 700px)";

/** True while the screen is phone-sized, where the planner is view-only. */
export function usePhone(): Ref<boolean> {
  const phone = ref(false);
  // jsdom and old browsers have no matchMedia.
  const query = window.matchMedia?.(PHONE_QUERY);
  if (!query) return phone;
  phone.value = query.matches;
  const update = (e: MediaQueryListEvent) => (phone.value = e.matches);
  query.addEventListener("change", update);
  onBeforeUnmount(() => query.removeEventListener("change", update));
  return phone;
}
