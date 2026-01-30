import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const sharedGlobals = {
  ...globals.browser,
  ...globals.node,
};

export default [
  {
    ignores: ["dist", "node_modules", "docs/typedoc"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ignores: ["server/**/*"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: sharedGlobals,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react-hooks/set-state-in-effect": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: sharedGlobals,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-undef": "off",
    },
  },
  {
    files: ["server/**/*.{js,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**/*"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
