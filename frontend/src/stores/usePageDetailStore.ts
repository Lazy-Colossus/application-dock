import { ref } from "vue";
import { defineStore } from "pinia";

/**
 * A page's own contribution to the shell's title bar.
 *
 * Route meta gives the shell a static title ("Listies"); this lets the page
 * add what it is actually showing ("chuina trip"), so an app does not need a
 * second header of its own with a second back arrow. `MainLayout` clears it on
 * every route change, so a page that forgets to tidy up cannot leak its detail
 * onto the next screen.
 */
export const usePageDetailStore = defineStore("pageDetail", () => {
  const detail = ref<string | null>(null);

  function setDetail(value: string | null): void {
    const trimmed = value?.trim();
    detail.value = trimmed ? trimmed : null;
  }

  function clearDetail(): void {
    detail.value = null;
  }

  return { detail, setDetail, clearDetail };
});
