/**
 * Construit le paquet du module (dist/<id>) puis son archive dist/<id>-<version>.sulfur-module, à
 * installer dans Sulfur : Paramètres → Modules → Modules externes → Installer un paquet…
 */
import tailwindcss from '@tailwindcss/vite'
import { buildModule, packModule } from '@azerxim/sulfur-sdk/build'
import { manifest } from './src/manifest.js'

const outDir = `dist/${manifest.id}`

await buildModule({
  manifest,
  group: 'tools', // groupe de la barre latérale : 'tools', 'automation' ou 'it'
  renderer: 'src/renderer/index.jsx',
  main: 'src/main/index.js', // à retirer pour un module sans process principal
  outDir,
  vite: { renderer: { plugins: [tailwindcss()] } }
})
console.log(`Paquet construit : ${outDir}`)
console.log(`Archive à installer : ${await packModule(outDir)}`)
