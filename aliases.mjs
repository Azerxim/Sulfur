import { resolve } from 'path'

/**
 * Alias de résolution communs au build (electron-vite) et aux tests (Vitest). Le SDK des modules
 * est résolu depuis ses sources (packages/sdk), comme le ferait un module externe depuis le paquet
 * publié : `@azerxim/sulfur-sdk`, `/main`, `/ui`, `/build` (construction des modules externes) et
 * `/host` (réservé à l'application), ainsi que `/archive` (archives des paquets, Node).
 */
export const aliases = ({ renderer = true } = {}) => [
  { find: /^@azerxim\/sulfur-sdk$/, replacement: resolve('packages/sdk/src/index.js') },
  { find: /^@azerxim\/sulfur-sdk\/archive$/, replacement: resolve('packages/sdk/src/archive.js') },
  { find: /^@azerxim\/sulfur-sdk\/(main|ui|host|build)$/, replacement: resolve('packages/sdk/src/$1/index.js') },
  { find: '@shared', replacement: resolve('src/shared') },
  { find: '@modules', replacement: resolve('src/modules') },
  ...(renderer ? [{ find: '@renderer', replacement: resolve('src/renderer/src') }] : [])
]
