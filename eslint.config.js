import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["scripts/.tmp/**", "scripts/.media-tmp/**", "**/dist/**", "**/node_modules/**", "**/coverage/**", "services/**", "apps/web/test-results/**", "apps/web/playwright-report/**", "assets/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  }
);
