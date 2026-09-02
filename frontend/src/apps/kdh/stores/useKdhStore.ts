import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Calendar, CalendarSummary, Me } from "@/apps/kdh/types";

export const useKdhStore = defineStore("kdh", () => {
  const calendars = ref<CalendarSummary[]>([]);
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
    me,
    loading,
    error,
    fetchMe,
    fetchCalendars,
    createCalendar,
  };
});
