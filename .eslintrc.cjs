module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  ignorePatterns: ['dist', 'node_modules'],
  settings: {
    react: { version: 'detect' },
  },

  // Base linting for JS/TS
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],

  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
  },

  overrides: [
    // ✅ TypeScript-only rules
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        // TS-only rule customizations can go here if needed
      },
    },

    // ✅ JS server files (optional Node tuning)
    {
      files: ['server/**/*.js', 'server/**/*.cjs', 'server/**/*.mjs'],
      env: { node: true, browser: false },
      rules: {
        // Keep JS ergonomic; TS-specific rules won’t apply now.
      },
    },

    // ✅ Tests: relax typing a bit (optional but very helpful)
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**/*'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
