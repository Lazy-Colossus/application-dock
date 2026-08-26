import {
  defineConfigWithVueTs,
  vueTsConfigs,
} from "@vue/eslint-config-typescript";
import pluginVue from "eslint-plugin-vue";

// ESLint 9 flat config. Formatting is Prettier's job (`npm run format`), so the
// stylistic half of eslint-plugin-vue's "recommended" tier is switched off
// below rather than left to fight the formatter — this file only asserts things
// Prettier cannot: correctness, unused code, and Vue/TS misuse.
export default defineConfigWithVueTs(
  {
    name: "app/files-to-lint",
    files: ["**/*.{js,mjs,ts,mts,vue}"],
  },
  {
    name: "app/files-to-ignore",
    ignores: [".quasar/**", "dist/**", "node_modules/**", "coverage/**"],
  },
  pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  {
    name: "app/prettier-owns-formatting",
    rules: {
      // Layout rules Prettier already decides; keeping them would mean two
      // tools reformatting the same markup in opposite directions.
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/multiline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
      "vue/html-indent": "off",
      "vue/html-closing-bracket-newline": "off",
      "vue/attributes-order": "off",
      "vue/first-attribute-linebreak": "off",
    },
  },
  {
    name: "app/naming",
    rules: {
      // The rule guards against collisions with real HTML elements. Every
      // component added since is multi-word; Flashcard predates the rule and
      // renaming it would churn its imports and tests to no real benefit.
      "vue/multi-word-component-names": ["error", { ignores: ["Flashcard"] }],
    },
  },
);
