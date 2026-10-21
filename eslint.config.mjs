import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

export default [
  { ignores: ['out/', 'dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    rules: {
      // `_` préfixe une variable volontairement ignorée (déstructuration pour retirer une clé…)
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }]
    }
  },
  // Process principal, preload, tests et configuration : Node
  {
    files: [
      'src/main/**',
      'src/preload/**',
      'src/modules/*/main/**',
      'packages/sdk/src/main/**',
      'tests/**',
      '*.{js,mjs}'
    ],
    languageOptions: { globals: globals.node }
  },
  // Le preload accède aussi au document de la page
  {
    files: ['src/preload/**'],
    languageOptions: { globals: globals.browser }
  },
  // Interface React
  {
    files: ['src/renderer/**', 'src/modules/*/renderer/**', 'packages/sdk/src/ui/**', 'packages/sdk/src/host/**'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    // Règles classiques des hooks ; celles destinées au React Compiler ne sont pas activées.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  // Code partagé main / interface
  {
    files: [
      'src/shared/**',
      'src/modules/*/shared/**',
      'src/modules/*.js',
      'packages/sdk/src/*.js',
      'packages/sdk/src/locales/**'
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  // En dernier : désactive les règles de mise en forme, laissées à Prettier
  prettier
]
