import { defineConfig } from 'vitest/config'
import { aliases } from './aliases.mjs'

export default defineConfig({
  resolve: { alias: aliases() },
  // Composants React du SDK (rendus par les tests des modules externes) : JSX comme dans l'application.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    setupFiles: ['tests/setup.js'],
    // Serveurs réels (sockets, génération de certificats) : un fichier à la fois, délais confortables.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000
  }
})
