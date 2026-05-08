import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // New react-hooks v7 rules fire on pre-existing code patterns.
      // Downgraded to "warn" until the frontend refactor (Phase 7) fixes them.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  // react-refresh only applies to component files (.tsx), not hooks/utils (.ts)
  {
    files: ['**/*.tsx'],
    extends: [reactRefresh.configs.vite],
    rules: {
      // Pre-existing: utility exports mixed with components — fixed in Phase 7 frontend refactor
      'react-refresh/only-export-components': 'warn',
    },
  },
])
