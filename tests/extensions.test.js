import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { checkManifest, defineManifest, packageManifest } from '@azerxim/sulfur-sdk'
import { collectExtensions, setModuleExtensions, useExtensions } from '../packages/sdk/src/ui/extensions.jsx'
import { APP_VERSION } from '@shared/app'

const manifest = (id, extra = {}) =>
  defineManifest({ id, name: id, version: '1.0.0', minAppVersion: '0.1.0', edition: 'additional', ...extra })

/** Onglet dont le rendu montre les propriétés reçues. */
const Tab = ({ target, module, extra }) => createElement('p', null, `${module}→${target}${extra ?? ''}`)

const enhanced = {
  manifest: manifest('s7-enhanced', { extends: ['s7', 'opcua'] }),
  extensions: [
    { target: 's7', tab: { id: 's7plus', label: 'S7CommPlus', Component: Tab } },
    { target: 'opcua', tab: { id: 'pubsub', label: 'PubSub', Component: Tab } },
    // Cible absente du champ extends : ignorée.
    { target: 'modbus', tab: { id: 'x', label: 'X', Component: Tab } },
    // Onglet invalide (pas de composant) : ignoré.
    { target: 's7', tab: { id: 'broken', label: 'Broken' } },
    // Identifiant déjà pris dans la page visée : ignoré.
    { target: 's7', tab: { id: 's7plus', label: 'Again', Component: Tab } }
  ]
}

afterEach(() => {
  vi.restoreAllMocks()
  setModuleExtensions([])
})

describe('Extensions : manifeste', () => {
  it('accepte une liste de modules complétés et la garde dans le descripteur du paquet', () => {
    expect(checkManifest(manifest('a', { extends: ['s7', 'opcua'] }), { appVersion: APP_VERSION })).toBeNull()
    expect(packageManifest({ ...manifest('a', { extends: ['s7'] }), renderer: 'renderer.mjs' }).extends).toEqual(['s7'])
  })

  it('refuse un champ extends invalide', () => {
    for (const value of ['s7', ['S7'], ['a'], ['s7', 's7'], [1]]) {
      expect(checkManifest(manifest('a', { extends: value }), { appVersion: APP_VERSION })).toEqual({
        reason: 'invalid',
        params: { field: 'extends' }
      })
    }
  })
})

describe('Extensions : onglets apportés', () => {
  it('ne retient que les onglets valides déclarés dans le manifeste', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = collectExtensions([{ manifest: manifest('s7') }, enhanced])
    expect(list.map((e) => [e.target, e.module, e.id, e.label])).toEqual([
      ['s7', 's7-enhanced', 's7plus', 'S7CommPlus'],
      ['opcua', 's7-enhanced', 'pubsub', 'PubSub']
    ])
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('fournit au composant le module visé et le module qui l’apporte, sans changer d’identité', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const [first] = collectExtensions([enhanced])
    expect(renderToStaticMarkup(createElement(first.Component, { extra: '!' }))).toBe('<p>s7-enhanced→s7!</p>')
    // Recalcul (activation d'un autre module) : même composant, l'état de l'onglet est conservé.
    expect(collectExtensions([enhanced])[0].Component).toBe(first.Component)
  })

  it('les fournit au module visé avec useExtensions', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const Labels = ({ target }) =>
      createElement(
        'i',
        null,
        useExtensions(target)
          .map((e) => e.label)
          .join(',')
      )
    setModuleExtensions([enhanced])
    expect(renderToStaticMarkup(createElement(Labels, { target: 's7' }))).toBe('<i>S7CommPlus</i>')
    expect(renderToStaticMarkup(createElement(Labels, { target: 'modbus' }))).toBe('<i></i>')
    // Module qui apporte les onglets désactivé : plus d'onglets.
    setModuleExtensions([])
    expect(renderToStaticMarkup(createElement(Labels, { target: 's7' }))).toBe('<i></i>')
  })
})
