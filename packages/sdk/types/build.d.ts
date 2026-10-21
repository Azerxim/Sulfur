/** SDK des modules Sulfur — construction d'un paquet de module externe (Node, avec Vite). */
import type { InlineConfig, Plugin } from 'vite'
import type { ModuleGroup, ModuleManifest, ModulePackage } from './index.js'

/** Plugin Vite : imports fournis par l'application (React, SDK) lus à l'exécution, non embarqués. */
export function sulfurShared(side: 'main' | 'renderer'): Plugin

/** Construit le paquet d'un module externe ; retourne le descripteur écrit dans module.json. */
export function buildModule(options: {
  manifest: ModuleManifest
  group: ModuleGroup
  /** Point d'entrée de l'interface (export par défaut : RendererModule). */
  renderer: string
  /** Point d'entrée du process principal (export par défaut : MainModule). */
  main?: string
  /** Dossier du projet (par défaut : dossier courant). */
  root?: string
  /** Dossier du paquet (par défaut : dist), vidé au préalable. */
  outDir?: string
  /** Options Vite ajoutées à chaque construction. */
  vite?: { renderer?: InlineConfig; main?: InlineConfig }
}): Promise<ModulePackage>
