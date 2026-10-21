import { defineManifest, registerMessages } from '@azerxim/sulfur-sdk'

/** Module externe de test : construit par tests/module-packages.test.js avec buildModule. */
export const manifest = defineManifest({
  id: 'demo',
  name: 'Demo',
  description: 'External test module',
  version: '1.2.0',
  minAppVersion: '0.4.0'
})

registerMessages(
  {
    en: { demo: { hello: 'Hello {name}', count: 'Clicked {count} time(s)' } },
    fr: { demo: { hello: 'Bonjour {name}', count: '{count} clic(s)' } }
  },
  'demo'
)
