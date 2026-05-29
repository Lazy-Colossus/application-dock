import { config } from '@vue/test-utils';

// Globally stub Quasar components so tests don't need the full Quasar plugin
// install (which targets a real DOM). Tests focus on app-level logic; visual
// rendering is verified manually + via the running dev server.
config.global.stubs = {
  ...(config.global.stubs ?? {}),
  'q-icon': true,
  'q-btn': true,
  'q-page': { template: '<div><slot /></div>' },
  'q-layout': { template: '<div><slot /></div>' },
  'q-header': { template: '<header><slot /></header>' },
  'q-toolbar': { template: '<div><slot /></div>' },
  'q-toolbar-title': { template: '<div><slot /></div>' },
  'q-page-container': { template: '<div><slot /></div>' },
  'q-card': { template: '<div><slot /></div>' },
  'q-banner': { template: '<div><slot /></div>' },
  'q-spinner': true,
  'q-dialog': { template: '<div><slot /></div>' },
  'q-bottom-sheet': { template: '<div><slot /></div>' },
  'q-input': {
    template: '<div><input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /><div v-if="errorMessage">{{ errorMessage }}</div></div>',
    props: ['modelValue', 'error', 'errorMessage'],
    emits: ['update:modelValue']
  }
};
