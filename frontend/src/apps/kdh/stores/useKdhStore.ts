import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Calendar, CalendarSummary, Me } from "@/apps/kdh/types";

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
      calendars.value.unshift({
        id: created.id,
        name: created.name,
        invitee_count: created.invitees.length,
        created_at: created.created_at,
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
    renameCalendar,
    deleteCalendar,
  };
});
