import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Page, PageSummary } from "@/apps/pagemage/types";

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const usePagemageStore = defineStore("pagemage", () => {
  const pages = ref<PageSummary[]>([]);
  const currentPage = ref<Page | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function fetchPages(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      pages.value = await api.get<PageSummary[]>("/pagemage/pages");
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function upload(file: File): Promise<PageSummary | null> {
    loading.value = true;
    error.value = null;
    try {
      const summary = await api.upload<PageSummary>("/pagemage/pages", file);
      // Newest-first list, and this one was just uploaded — put it on top.
      pages.value.unshift(summary);
      return summary;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function fetchPage(pageId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      currentPage.value = await api.get<Page>(`/pagemage/pages/${pageId}`);
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function savePage(pageId: string, html: string): Promise<boolean> {
    saving.value = true;
    error.value = null;
    try {
      currentPage.value = await api.put<Page>(`/pagemage/pages/${pageId}`, {
        html,
      });
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function createShare(pageId: string): Promise<string | null> {
    error.value = null;
    try {
      const shared = await api.post<Page>(`/pagemage/pages/${pageId}/share`);
      currentPage.value = shared;
      return shared.share_token;
    } catch (e) {
      error.value = message(e);
      return null;
    }
  }

  async function revokeShare(pageId: string): Promise<boolean> {
    error.value = null;
    try {
      currentPage.value = await api.del<Page>(`/pagemage/pages/${pageId}/share`);
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    }
  }

  return {
    pages,
    currentPage,
    loading,
    saving,
    error,
    fetchPages,
    upload,
    fetchPage,
    savePage,
    createShare,
    revokeShare,
  };
});
