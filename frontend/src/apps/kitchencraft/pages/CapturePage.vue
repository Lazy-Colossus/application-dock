<template>
  <q-page class="kitchencraft-app">
    <div class="kc-band">
      <PageBar title="Add a recipe" />

      <form class="kc-form" @submit.prevent="save()">
        <!--
          The name reads first, but the body still holds focus on open: the flow
          is paste, tap UP to the name, Save — three interactions, under ten
          seconds (NFR-7), and the order matches Flow 1's own beat sheet.
        -->
        <div class="kc-form__group">
          <label class="kc-label" for="capture-name">Name</label>
          <input
            id="capture-name"
            v-model="name"
            type="text"
            class="kc-field"
            :class="{ 'kc-field--error': nameError }"
            autocomplete="off"
            :aria-invalid="Boolean(nameError)"
            aria-describedby="capture-name-error"
            data-testid="name"
          />
          <p
            id="capture-name-error"
            class="kc-error"
            role="alert"
            aria-live="polite"
            data-testid="name-error"
          >
            {{ nameError }}
          </p>
        </div>

        <div class="kc-form__group">
          <label class="kc-label" for="capture-body">Recipe text</label>
          <textarea
            id="capture-body"
            ref="bodyField"
            v-model="body"
            class="kc-field kc-field--body"
            :class="{ 'kc-field--error': bodyError }"
            :aria-invalid="Boolean(bodyError)"
            aria-describedby="capture-body-error"
            data-testid="body"
          ></textarea>
          <p
            id="capture-body-error"
            class="kc-error"
            role="alert"
            aria-live="polite"
            data-testid="body-error"
          >
            {{ bodyError }}
          </p>
        </div>

        <!-- One line above the button, and both fields keep everything. -->
        <p v-if="saveFailed" class="kc-error" data-testid="save-failed">
          Couldn't save — nothing has been lost, try again.
        </p>

        <div class="kc-actions">
          <button
            type="submit"
            class="kc-btn"
            :disabled="saving"
            data-testid="save"
          >
            Save
          </button>
          <button
            type="button"
            class="kc-btn kc-btn--quiet"
            data-testid="cancel"
            @click="cancel()"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import PageBar from "@/apps/kitchencraft/components/PageBar.vue";
import { useKitchencraftStore } from "@/apps/kitchencraft/stores/useKitchencraftStore";
import "./../css/kitchencraft.sass";

const store = useKitchencraftStore();
const router = useRouter();

const name = ref("");
const body = ref("");
const nameError = ref("");
const bodyError = ref("");
const saveFailed = ref(false);
const saving = ref(false);
const bodyField = ref<HTMLTextAreaElement | null>(null);

onMounted(() => bodyField.value?.focus());

/**
 * Only two things can reject a save, and the message names which (FR-3).
 *
 * No other validation exists on this surface — no optional field is allowed to
 * stand between a paste and a saved recipe, which is the whole point of the
 * screen.
 */
function validate(): boolean {
  nameError.value = name.value.trim() ? "" : "Give it a name.";
  bodyError.value = body.value.trim() ? "" : "Paste or type the recipe text.";
  return !nameError.value && !bodyError.value;
}

async function save(): Promise<void> {
  saveFailed.value = false;
  if (!validate()) return;

  saving.value = true;
  try {
    await store.createRecipe({ name: name.value, body: body.value });
    // Back to the collection, where the new recipe is at the top as a one-line
    // row with nothing greyed out and nothing asking for anything else.
    void router.push("/kitchencraft");
  } catch {
    // The store already routed the message into `store.error`. Nothing here
    // clears either field: the paste is the irreplaceable half.
    saveFailed.value = true;
  } finally {
    saving.value = false;
  }
}

function cancel(): void {
  void router.push("/kitchencraft");
}
</script>
