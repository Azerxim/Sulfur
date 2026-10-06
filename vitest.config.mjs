import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@modules': resolve('src/modules'),
      '@renderer': resolve('src/renderer/src')
    }
  },
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
