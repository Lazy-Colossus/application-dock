// Test-only helpers. Imported by *.spec.ts files, never by the app.

import type { VueWrapper } from "@vue/test-utils";

/**
 * Find a child component by CSS selector and keep its `VueWrapper` type.
 *
 * Vue Test Utils types a selector lookup as `WrapperLike`, which has no
 * `props()` — the runtime object does. The cast is the whole point of this
 * helper: it lives here once instead of at every call site.
 */
export function componentAt(
  wrapper: VueWrapper,
  selector: string,
): {
  props: (name?: string) => unknown;
  attributes: (name?: string) => string;
} {
  return wrapper.findComponent(selector) as unknown as {
    props: (name?: string) => unknown;
    attributes: (name?: string) => string;
  };
}
