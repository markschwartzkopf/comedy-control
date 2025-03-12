import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    files: ['src/server/**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './src/server/tsconfig.json', // Server tsconfig.json
      },
      globals: { ...globals.node, NodeJS: true },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/ban-ts-comment': 'off', // Allow @ts-ignore comments
      '@typescript-eslint/no-floating-promises': 'error', // Ensure promises are handled
    },
  },
  {
    files: ['src/browser/**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './src/browser/tsconfig.json', // Browser tsconfig.json
      },
      globals: { ...globals.browser },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/ban-ts-comment': 'off', // Allow @ts-ignore comments
      '@typescript-eslint/no-floating-promises': 'error', // Ensure promises are handled
      '@typescript-eslint/no-explicit-any': 'off', // Allow any type for flexibility
    },
  },
];
