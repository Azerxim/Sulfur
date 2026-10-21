import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { aliases } from './aliases.mjs'

export default defineConfig({
  main: {
    resolve: { alias: aliases({ renderer: false }) }
  },
  preload: {
    resolve: { alias: aliases({ renderer: false }) }
  },
  renderer: {
    resolve: { alias: aliases() },
    plugins: [react(), tailwindcss()]
  }
})
