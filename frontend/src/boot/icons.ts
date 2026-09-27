import { boot } from "quasar/wrappers";
import { LEAF_PATHS, LEAF_VIEWBOX } from "@/apps/tea/leaf";

// Drawn icons an app owns, addressable from the registry by a short name so
// `registry.ts` and the backend's `/api/apps` can still agree string for string.
const APP_ICONS: Record<string, string> = {
  "app:tea-leaf": `${LEAF_PATHS.map((d) => `${d}@@fill-rule:evenodd`).join("&&")}|${LEAF_VIEWBOX}`,
};

/** Quasar `iconMapFn`: resolve an `app:` name, leave anything else to Material. */
export function mapIcon(name: string): { icon: string } | undefined {
  const icon = APP_ICONS[name];
  return icon ? { icon } : undefined;
}

export default boot(({ app }) => {
  app.config.globalProperties.$q.iconMapFn = mapIcon;
});
