import { computed, ref, watch } from "vue";
import type { Invitee } from "@/apps/kalendariq/types";

const STORAGE_PREFIX = "kalendariq.claim.";

function storageKey(calendarId: string): string {
  return `${STORAGE_PREFIX}${calendarId}`;
}

/** Read a stored claim, tolerating a browser that refuses storage entirely. */
function readStoredClaim(calendarId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(calendarId));
  } catch {
    // Private mode, or site data blocked. Not remembering who you are is a mild
    // inconvenience, not an error worth showing anyone.
    return null;
  }
}

function writeStoredClaim(calendarId: string, inviteeId: string | null): void {
  try {
    if (inviteeId === null)
      window.localStorage.removeItem(storageKey(calendarId));
    else window.localStorage.setItem(storageKey(calendarId), inviteeId);
  } catch {
    // Same: the claim still works for this page view, it just will not persist.
  }
}

/**
 * Which invitee this phone is voting as, remembered per calendar.
 *
 * A convenience, not a security boundary (AR-6): everyone shares one login, the
 * claim lives in `localStorage`, and the server validates only that the invitee
 * exists and is active. Nothing here is trusted.
 */
export function useClaimedName(
  calendarId: () => string,
  invitees: () => Invitee[],
) {
  const claimedId = ref<string | null>(null);

  /** The claimed invitee, or null if the claim is stale, corrupt or absent. */
  const claimed = computed<Invitee | null>(
    () =>
      invitees().find(
        (i) => i.id === claimedId.value && i.removed_at === null,
      ) ?? null,
  );

  const hasClaim = computed(() => claimed.value !== null);

  function claim(inviteeId: string): void {
    claimedId.value = inviteeId;
    writeStoredClaim(calendarId(), inviteeId);
  }

  function release(): void {
    claimedId.value = null;
    writeStoredClaim(calendarId(), null);
  }

  /** Load the stored claim. Call once the roster is known. */
  function restore(): void {
    claimedId.value = readStoredClaim(calendarId());
  }

  // A claim naming someone since removed resolves to null above; drop the dead
  // value too, so it is not carried around or written back later.
  watch(
    () => [claimedId.value, invitees().length] as const,
    () => {
      if (
        claimedId.value !== null &&
        claimed.value === null &&
        invitees().length > 0
      ) {
        release();
      }
    },
    { immediate: true },
  );

  return { claimed, claimedId, hasClaim, claim, release, restore };
}
