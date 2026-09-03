import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type {
  Calendar,
  CalendarSummary,
  Me,
  VoteStatus,
} from "@/apps/kdh/types";

export const useKdhStore = defineStore("kdh", () => {
  const calendars = ref<CalendarSummary[]>([]);
  const currentCalendar = ref<Calendar | null>(null);
  const me = ref<Me | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchMe(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      me.value = await api.get<Me>("/kdh/me");
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchCalendars(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      calendars.value = await api.get<CalendarSummary[]>("/kdh/calendars");
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchCalendar(calendarId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    currentCalendar.value = null;
    try {
      currentCalendar.value = await api.get<Calendar>(
        `/kdh/calendars/${calendarId}`,
      );
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function renameCalendar(
    calendarId: string,
    name: string,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.put<Calendar>(`/kdh/calendars/${calendarId}`, {
        name,
      });
      currentCalendar.value = updated;
      // Keep the cached list honest, so returning to it does not show the old name.
      const summary = calendars.value.find((c) => c.id === calendarId);
      if (summary) summary.name = updated.name;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteCalendar(calendarId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      // 204 — `useApi` hands back `undefined`; there is nothing to read.
      await api.del(`/kdh/calendars/${calendarId}`);
      calendars.value = calendars.value.filter((c) => c.id !== calendarId);
      if (currentCalendar.value?.id === calendarId)
        currentCalendar.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /** Active invitees in roster order — the shape the list summary carries. */
  function roster(calendar: Calendar) {
    return [...calendar.invitees]
      .filter((i) => i.removed_at === null)
      .sort((a, b) => a.order - b.order);
  }

  /** Keep the cached summary's session dates honest after a marking, so the
   *  list does not still advertise a session that was called off. Needs the
   *  server's date, which `me` carries. */
  function syncSessions(calendar: Calendar): void {
    const summary = calendars.value.find((c) => c.id === calendar.id);
    const boundary = me.value?.today;
    if (!summary || !boundary) return;

    const upcoming = calendar.chosen_dates.filter((d) => d >= boundary);
    const past = calendar.chosen_dates.filter((d) => d < boundary);
    summary.next_session = upcoming.length > 0 ? upcoming[0] : null;
    summary.last_session = past.length > 0 ? past[past.length - 1] : null;
  }

  /** Keep the cached summary honest after a roster change, so returning to the
   *  list does not show a stale headcount or a departed name. */
  function syncSummary(calendar: Calendar): void {
    const summary = calendars.value.find((c) => c.id === calendar.id);
    if (summary) {
      const active = roster(calendar);
      summary.invitee_count = active.length;
      summary.invitee_names = active.map((i) => i.name);
    }
  }

  async function addInvitee(calendarId: string, name: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.post<Calendar>(
        `/kdh/calendars/${calendarId}/invitees`,
        { name },
      );
      currentCalendar.value = updated;
      syncSummary(updated);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function removeInvitee(
    calendarId: string,
    inviteeId: string,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.del<Calendar>(
        `/kdh/calendars/${calendarId}/invitees/${inviteeId}`,
      );
      currentCalendar.value = updated;
      syncSummary(updated);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Set one vote, optimistically.
   *
   * The cell has to move under the thumb — a round trip before anything visible
   * happens makes a month of taps feel broken. The previous vote map is kept so
   * a failure can put it back exactly.
   */
  async function setVote(
    calendarId: string,
    inviteeId: string,
    date: string,
    status: VoteStatus | "none",
  ): Promise<void> {
    const calendar = currentCalendar.value;
    if (!calendar) return;

    const previous = calendar.votes;
    const votes: Record<string, Record<string, VoteStatus>> = {
      ...previous,
      [date]: { ...(previous[date] ?? {}) },
    };
    if (status === "none") delete votes[date][inviteeId];
    else votes[date][inviteeId] = status;
    if (Object.keys(votes[date]).length === 0) delete votes[date];
    calendar.votes = votes;

    error.value = null;
    try {
      currentCalendar.value = await api.put<Calendar>(
        `/kdh/calendars/${calendarId}/votes`,
        { invitee_id: inviteeId, date, status },
      );
    } catch (e) {
      // Put the month back exactly as it was; a half-applied grid is worse
      // than no change at all.
      if (currentCalendar.value) currentCalendar.value.votes = previous;
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function setChosen(
    calendarId: string,
    date: string,
    chosen: boolean,
  ): Promise<void> {
    error.value = null;
    try {
      const updated = await api.put<Calendar>(
        `/kdh/calendars/${calendarId}/chosen`,
        { date, chosen },
      );
      currentCalendar.value = updated;
      syncSessions(updated);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * Answer many days at once.
   *
   * Not optimistic, unlike a single vote: this is one deliberate action rather
   * than a thumb running down a month, a spinner is honest here, and the server
   * applies it all-or-nothing so a half-updated grid is not a state that exists.
   */
  async function setVotesBulk(
    calendarId: string,
    inviteeId: string,
    dates: string[],
    status: VoteStatus | "none",
    clearNotes = false,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      currentCalendar.value = await api.put<Calendar>(
        `/kdh/calendars/${calendarId}/votes/bulk`,
        { invitee_id: inviteeId, dates, status, clear_notes: clearNotes },
      );
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function setNote(
    calendarId: string,
    inviteeId: string,
    date: string,
    text: string,
  ): Promise<void> {
    error.value = null;
    try {
      currentCalendar.value = await api.put<Calendar>(
        `/kdh/calendars/${calendarId}/notes`,
        { invitee_id: inviteeId, date, text },
      );
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  async function createCalendar(
    name: string,
    inviteeNames: string[],
  ): Promise<Calendar> {
    loading.value = true;
    error.value = null;
    try {
      const created = await api.post<Calendar>("/kdh/calendars", {
        name,
        invitee_names: inviteeNames,
      });
      const active = roster(created);
      calendars.value.unshift({
        id: created.id,
        name: created.name,
        invitee_count: active.length,
        invitee_names: active.map((i) => i.name),
        created_at: created.created_at,
        next_session: null,
        last_session: null,
      });
      return created;
    } catch (e) {
      // Surface the error AND rethrow, so the caller does not navigate on failure.
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    calendars,
    currentCalendar,
    me,
    loading,
    error,
    fetchMe,
    fetchCalendars,
    fetchCalendar,
    createCalendar,
    addInvitee,
    removeInvitee,
    setVote,
    setChosen,
    setVotesBulk,
    setNote,
    renameCalendar,
    deleteCalendar,
  };
});
