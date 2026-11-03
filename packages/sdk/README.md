# Sulfur module SDK

**English** · [Français](README.fr.md)

`@azerxim/sulfur-sdk` is the contract between [Sulfur](https://github.com/Azerxim/Sulfur) and its
modules: manifest, main-process context, data points, translations and shared interface components.
The modules shipped with Sulfur use it exclusively, so a module written against the SDK can be
developed outside the Sulfur repository.

The package version **is the module API version** (`MODULE_API_VERSION`) and follows semantic
versioning: a module written for SDK 1.2 works with every Sulfur that provides a 1.x module API from
1.2 on, not with a 2.x API. Removing or changing an export requires a new major version.

## Installation

The package is published on [npm](https://www.npmjs.com/package/@azerxim/sulfur-sdk), with no
configuration or token needed:

```sh
npm install --save-dev @azerxim/sulfur-sdk
```

It is also published on GitHub Packages. To install it from there, add to the `.npmrc` of the
module project (`GITHUB_TOKEN`: personal access token with the `read:packages` scope, required by
GitHub Packages even for public packages):

```ini
@azerxim:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

## Entry points

| Import                       | Where             | Content                                                                                     |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| `@azerxim/sulfur-sdk`        | main and renderer | manifest (`defineManifest`, `checkManifest`), translations (`registerMessages`, `moduleT`, `formatTime`…), data points (`pointKey`, `toNumber`, `FAULT_TYPES`), `withDefaults`, private networks, `simulate` |
| `@azerxim/sulfur-sdk/main`   | main process      | `ensureCertificate` (self-signed TLS certificate), `hashPassword` / `verifyPassword` (scrypt), served folders confined to their root (`resolveInside`, `prepareRoot`) |
| `@azerxim/sulfur-sdk/ui`     | renderer (React)  | `Button`, `Card`, `Input`, `CommitInput`, `Select`, `Field`, `Checkbox`, `Tabs`, `TabbedPage`, `StatusDot`, `ErrorBanner`, `Modal`, `CertificatesDialog`, `usePersistentState`, `useStoredState` |
| `@azerxim/sulfur-sdk/build`  | Node (build)      | `buildModule` (package of an external module), `packModule` (`.sulfur-module` archive), `sulfurShared` (Vite plugin) |
| `@azerxim/sulfur-sdk/archive` | Node             | reading and writing `.sulfur-module` archives (`packModule`, `readModuleArchive`)             |
| `@azerxim/sulfur-sdk/module.css` | CSS (Tailwind v4) | Tailwind utilities of an external module, on the Sulfur theme (`theme.css`) |
| `@azerxim/sulfur-sdk/host`   | Sulfur only       | configuration cache of the interface; not for modules                                      |

TypeScript declarations are included (`types/`); they describe the whole contract, in particular
`ModuleContext`, `MainModule`, `RendererModule` and `PointsApi`.

## A module

```js
// shared/constants.js
import { defineManifest } from '@azerxim/sulfur-sdk'

export const DEMO_MODULE = defineManifest({
  id: 'demo', // prefix of the IPC channels
  name: 'Demo',
  description: 'Demo module',
  version: '1.0.0',
  author: 'Jane Doe', // optional, shown before installation
  edition: 'additional',
  minAppVersion: '0.5.0'
})
```

```js
// main/index.js — main process
import { ensureCertificate } from '@azerxim/sulfur-sdk/main'
import { DEMO_MODULE } from '../shared/constants'

let running = false

export default {
  manifest: DEMO_MODULE,
  activate(ctx) {
    ctx.handle('start', async () => {
      const { cert, key } = await ensureCertificate(`${ctx.dataDir}/pki`, 'Demo@Sulfur')
      running = true
      ctx.emit('status', { running })
    })
    ctx.expose({ name: 'Demo', points: () => [], read: () => ({}), write: async () => {} })
  },
  busy: () => running,
  deactivate() {
    running = false
  }
}
```

```jsx
// renderer/index.js — interface
import { faCube } from '@fortawesome/free-solid-svg-icons'
import { Button, Card, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { DEMO_MODULE } from '../shared/constants'

function DemoView() {
  const [config, setConfig] = usePersistentState('demo', 'server', { port: 1234 })
  return (
    <Card title="Demo">
      <Button onClick={() => window.sulfur.invoke('demo:start', config)}>Start</Button>
    </Card>
  )
}

export default { manifest: DEMO_MODULE, icon: faCube, Component: DemoView }
```

Translations: `registerMessages({ en, fr }, 'demo')` then `moduleT('demo')`; the displayed name and
description come from the `demo.name` and `demo.description` keys. Common strings (`ui.start`,
`errors.alreadyStarted`…) are provided by the SDK.

## Multiple servers and clients

A module can offer as many servers, clients… ("roles") as the user wants, none existing at first
(API 1.2):

```js
// main/index.js — one instance per server or client created in the interface
import { defineInstances } from '@azerxim/sulfur-sdk/main'

const instances = defineInstances(ctx, {
  server: {
    label: () => t('ui.server'),
    create: (instance, { emit }) => new DemoServer({ onStatus: (s) => emit('status', s) }),
    busy: (server) => server.running,
    dispose: (server) => server.stop()
  }
})
instances.handle('server', 'start', (server, config) => server.start(config)) // demo:server:start (id, config)
```

```jsx
// renderer: one tab per instance, add buttons, rename and remove
import { InstancesPage, useInstanceStatuses } from '@azerxim/sulfur-sdk/ui'
import { instanceSection } from '@azerxim/sulfur-sdk'

function DemoView() {
  const statuses = useInstanceStatuses('demo', 'server')
  return (
    <InstancesPage moduleId="demo" roles={[{ role: 'server', label: 'Server', icon: faServer }]} statuses={statuses}>
      {(instance) => <ServerPanel instance={instance} status={statuses[instance.id] ?? {}} />}
    </InstancesPage>
  )
}
// In the panel: usePersistentState('demo', instanceSection('server', instance.id), defaults)
```

`instancesPointsApi` (`@azerxim/sulfur-sdk`) builds the module's data points from those of each
instance; `migrateToInstances` converts the configuration of a version that had a single server and
client.

## External module

Step by step, from a ready-to-use template: see the
[module development guide](https://github.com/Azerxim/Sulfur/blob/main/docs/module-guide.md).

A module developed outside the Sulfur repository is delivered as a **package**: a folder holding
its `module.json` descriptor (manifest, sidebar group, files) and its built files. `buildModule`
produces it with [Vite](https://vite.dev):

```js
// build.mjs — node build.mjs
import tailwindcss from '@tailwindcss/vite'
import { buildModule, packModule } from '@azerxim/sulfur-sdk/build'
import { DEMO_MODULE } from './src/shared/constants.js'

await buildModule({
  manifest: DEMO_MODULE,
  group: 'tools', // 'tools', 'automation' or 'it'
  renderer: 'src/renderer/index.jsx',
  main: 'src/main/index.js', // optional: module without a main process part
  outDir: 'dist/demo',
  vite: { renderer: { plugins: [tailwindcss()] } }
})
await packModule('dist/demo') // dist/demo-1.0.0.sulfur-module, to install from the Settings
```

```
dist/demo/
  module.json    manifest, group, renderer, main, style
  renderer.mjs   default export { manifest, icon, Component }
  main.mjs       default export { manifest, activate, … }
  style.css      Tailwind utilities of the module
```

- **Shared modules**: React (`react`, `react/jsx-runtime`, `react-dom`) and the SDK are not
  bundled; Sulfur provides its own at run time (a single instance: same translations, same
  language, same React state). The other dependencies (`@fortawesome/free-solid-svg-icons` icon
  definitions, npm libraries) are bundled in the package. Icons are rendered with the SDK's `Icon`
  (`<Icon icon={faCube} className="size-4" />`), never by importing `@fortawesome/react-fontawesome`:
  it would be bundled and the styles it adds to the page would override the Tailwind sizes. Native dependencies are not supported.
- **Styles**: the CSS imported by the interface becomes `style.css`. With Tailwind CSS v4, start
  from `@import '@azerxim/sulfur-sdk/module.css';` (then `@source` to the module sources): only the
  utilities of the module are generated, on the variables of the Sulfur theme (light theme
  included).
- **Archive**: `packModule(dir)` writes the package as a single `<id>-<version>.sulfur-module`
  file (ZIP archive, `module.json` first) next to the folder, to share the module.
- **Installation**: Settings → Modules → *External modules* → *Install a package…*: Sulfur checks
  the archive, shows the module, its version and its author, then installs it after confirmation
  (an installed version is replaced). During development, the package folder can also be copied
  into the packages folder (*Open* button). Then check *Load the external modules* and click
  *Refresh* (no need to restart Sulfur). The descriptor is checked before any code runs; a refused
  package is listed with the reason. Packages are not signed, so anyone can build and install their
  own module; since a module runs with the rights of Sulfur, loading them is disabled by default
  (see the
  [roadmap](https://github.com/Azerxim/Sulfur/blob/main/ROADMAP.md#standard-and-additional-modules)).

## Roadmap

Planned changes to the module API: [SDK roadmap](ROADMAP.md).

## License

[Apache License 2.0](LICENSE). Additional modules built with the SDK may use their own license.
