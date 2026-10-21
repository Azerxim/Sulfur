/**
 * Construit le paquet du module dans dist/test-signal (node examples/test-signal/build.mjs, ou
 * npm run example:build). Un module développé hors du dépôt importe `@azerxim/sulfur-sdk/build`.
 */
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import { buildModule } from '../../packages/sdk/src/build/index.js'
import { manifest } from './src/manifest.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(root, 'dist', manifest.id)

await buildModule({
  manifest,
  group: 'tools',
  root,
  renderer: 'src/renderer/index.jsx',
  main: 'src/main/index.js',
  outDir,
  vite: { renderer: { plugins: [tailwindcss()] } }
})
console.log(`Paquet construit : ${outDir}`)
