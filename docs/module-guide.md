# Creating a module for Sulfur

**English** · [Français](module-guide.fr.md)

This guide explains how to write a module for Sulfur outside its repository, build it, install it
and share it. Anyone can do it: a module needs no approval and no signature.

It starts from the **module template** ([`examples/module-template`](../examples/module-template)),
a small but complete module: a counter in the main process, published as a data point, with its
interface and translations. For a richer example (chart, several points, own CSS), see
[`examples/test-signal`](../examples/test-signal). The API reference is the
[SDK README](../packages/sdk/README.md) and its TypeScript declarations.

## How a module works

A module has two parts, which share the same **manifest**:

| Part                 | Where it runs                              | Role                                                              |
| -------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| **main process** (optional) | Node, in the main process of Sulfur | servers, clients, network and file access; IPC channels `<id>:<action>` |
| **interface**        | React, in the Sulfur window                | page of the module in the sidebar                                 |

Both parts use the application only through the **SDK** `@azerxim/sulfur-sdk`: manifest, main
process context, data points, translations, interface components. React and the SDK are not bundled
in the module: Sulfur provides its own at run time.

Once built, a module becomes a **package**: a folder with `module.json` and the built files, then a
`<id>-<version>.sulfur-module` archive to install from the Settings.

> **Security.** The main process of a module runs with the rights of Sulfur (files, network).
> Packages are not signed: Sulfur shows the author and the version before installing, and loading
> the external modules is disabled by default. Only install your own modules or those of authors you
> trust, and tell the users of your modules clearly what they do.

## Requirements

- **Node.js 22** or later, and npm;
- **Sulfur 0.4** or later, to try the module;
- a **GitHub token** (Settings → Developer settings → Personal access tokens) with the
  `read:packages` scope: the SDK is published on GitHub Packages, which requires a token even for a
  public package.

## 1. Start from the template

Copy the [`examples/module-template`](../examples/module-template) folder wherever you like (it is a
standalone project), then:

```sh
export GITHUB_TOKEN=ghp_…   # read:packages token (Windows: set GITHUB_TOKEN=…)
npm install
npm run build
```

The `.npmrc` file of the template tells npm where to find the SDK. `npm run build` produces
`dist/my-module/` and the `dist/my-module-0.1.0.sulfur-module` archive.

Then choose the identifier of your module (lowercase letters, digits and dashes, e.g.
`acme-gateway`) and replace `my-module` everywhere:

- `src/manifest.js`: `id`, `name`, `description`, `author`;
- `src/i18n.js`: the top-level key of the translations and the second argument of
  `registerMessages` / `moduleT`;
- `package.json`: `name` and `description` (for npm only).

The identifier prefixes the IPC channels, the data points (`<id>/<point>`), the saved configuration
and the installation folder: it must not change once the module is shared, and must not be the one
of a Sulfur module.

```text
my-module/
  package.json, .npmrc, build.mjs
  src/
    manifest.js         manifest (defineManifest) and default settings
    i18n.js             translations (English, French)
    main/index.js       main process: default export { manifest, activate, … }
    renderer/index.jsx  interface: default export { manifest, icon, Component }
    renderer/style.css  Tailwind styles on the Sulfur theme
```

## 2. The manifest

```js
export const manifest = defineManifest({
  id: 'my-module',
  name: 'My module', // fallback name; the displayed one comes from the `my-module.name` key
  description: 'Counter published as a data point',
  version: '0.1.0', // version of the module (semver), to increase on every release
  author: 'Your name', // shown before installation
  edition: 'additional',
  minAppVersion: '0.4.0' // minimum version of Sulfur
})
```

`defineManifest` adds `apiVersion`, the module API version of the installed SDK. Sulfur refuses a
module whose API or `minAppVersion` does not suit it, with the reason in Settings → Modules.

## 3. The main process

`src/main/index.js` has a default export `{ manifest, activate(ctx), deactivate(), busy(),
migrateConfig() }`. Only `manifest` and `activate` are required.

```js
export default {
  manifest,
  activate(ctx) {
    ctx.handle('start', (options) => start(options)) // channel my-module:start
    ctx.expose({ name: t('my-module.name'), points: () => POINTS, read, write })
  },
  busy: () => timer !== null,
  deactivate() {
    stop()
  }
}
```

The `ctx` context:

| Member                      | Role                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `ctx.handle(action, fn)`    | channel `<id>:<action>` called by the interface; the result (or the thrown error) is sent back |
| `ctx.emit(event, payload)`  | event `<id>:<event>` broadcast to the interface                                          |
| `ctx.config()`              | saved configuration of the module (`{ <section>: value }`, written by the interface)     |
| `ctx.setConfig(section, v)` | replaces a section of that configuration                                                 |
| `ctx.expose(api)`           | publishes the data points of the module (see below)                                      |
| `ctx.peers()`               | points published by the other active modules                                             |
| `ctx.dataDir`               | data folder of the module (`<user data>/modules/<id>`)                                   |
| `ctx.log(...)`              | main process log (visible when Sulfur is started from a terminal)                        |

- **Errors**: throw an `Error` with a translated message (`t('my-module.errors.…')`); the interface
  receives it as is.
- **`busy()`**: returns `true` while a server is running or a client is connected. Sulfur then
  refuses to disable, update or remove the module, and to import a configuration.
- **`deactivate()`**: stop everything (servers, timers, sockets): the module can be disabled or
  reloaded without restarting Sulfur.
- **`migrateConfig(config)`**: converts a configuration saved by an earlier version of the module
  (on load and on import).
- `@azerxim/sulfur-sdk/main` provides tools for servers: self-signed TLS certificate
  (`ensureCertificate`), hashed passwords (`hashPassword`), confined served folders
  (`resolveInside`).

The npm dependencies of the main process are bundled in the package; native modules (with compiled
code) are not supported.

## 4. The interface

`src/renderer/index.jsx` has a default export `{ manifest, icon, Component }`: the sidebar icon (a
[lucide-react](https://lucide.dev/icons) component) and the React component of the page.

```jsx
const invoke = (action, ...args) => window.sulfur.invoke(`${ID}:${action}`, ...args)

function MyModuleView() {
  const [settings, setSettings] = usePersistentState(ID, 'counter', DEFAULTS)
  const [state, setState] = useState(null)
  useEffect(() => window.sulfur.on(`${ID}:state`, setState), []) // returns the unsubscribe function
  return (
    <Card title={t('my-module.counter')}>
      <Button onClick={() => invoke('start', settings).then(setState)}>{t('ui.start')}</Button>
    </Card>
  )
}
```

- **Components** (`@azerxim/sulfur-sdk/ui`): `Button`, `Card`, `Input`, `CommitInput`, `Select`,
  `Field`, `Checkbox`, `Tabs`, `StatusDot`, `ErrorBanner`, `Modal`… They follow the theme and the
  language of Sulfur.
- **Saved settings**: `usePersistentState(id, section, defaults)` replaces `useState`; the value is
  saved, restored on start, exported with the Sulfur configurations, and readable in the main
  process through `ctx.config()[section]`.
- **Styles**: `style.css` imports `@azerxim/sulfur-sdk/module.css`; only the Tailwind utilities used
  by the module are generated, on the theme colors (`ink`, `slate`, `sulfur`…), light theme
  included. Prefix your own CSS classes with the module identifier.

## 5. Translations

`registerMessages({ en, fr }, '<id>')` declares the strings, `moduleT('<id>')` gives the `t`
function. Keys are prefixed with the identifier; `<id>.name` and `<id>.description` are the displayed
name and description. Common strings (`ui.start`, `ui.stop`…) come from the SDK. If your module does
not provide the selected language, it is displayed entirely in English.

## 6. Data points

The points published by `ctx.expose` show up in the **simulator** (flows, scenarios) and the
**trends** under the `<id>/<point>` key:

```js
ctx.expose({
  name: t('my-module.name'),
  points: () => [{ id: 'value', group: 'server', name: 'value', dataType: 'Double', numeric: true, writable: false }],
  read: (ids) => Object.fromEntries(ids.map((id) => [id, values[id]])),
  write: async (id, value) => {
    /* throw a translated error if not possible */
  }
})
```

`faultTypes()` and `setFaults()` (optional) add the fault injection of the simulator (delay, no
response, disconnection…).

## 7. Build, install, try

```sh
npm run build
```

1. In Sulfur: **Settings → Modules → External modules → Install a package…**, choose
   `dist/<id>-<version>.sulfur-module` and confirm.
2. Check **Load the external modules**, then **Refresh**. The module shows up in the sidebar, with
   the *External* badge in Settings → Modules.

**During development**, it is faster to copy (or link) the `dist/<id>` folder into the packages
folder (**Open** button of the same card), then click **Refresh** after each `npm run build`: the
new version is loaded without restarting Sulfur. The packages folder is
`<user data>/module-packages`: `~/.config/Sulfur` (Linux), `%APPDATA%\Sulfur` (Windows),
`~/Library/Application Support/Sulfur` (macOS).

**Troubleshooting**:

- a refused module is listed in Settings → Modules with the reason (invalid manifest, incompatible
  API, identifier already used, missing file…);
- start Sulfur from a terminal to see `ctx.log` and the errors of the main process;
- an interface that fails to load is also listed in Settings → Modules; to debug it, run Sulfur from
  its sources (`npm run dev`) and open the developer tools with F12.

## 8. Publish and share

- Increase `version` in the manifest, rebuild, and share the `<id>-<version>.sulfur-module` file
  (GitHub release, website, message…). Installing it over an installed version replaces it; the
  configuration of the module is kept (`migrateConfig` if its format changed).
- Fill in `author` and a clear description: this is what the user sees before confirming.
- Keep the same `id` from one version to the next.
- Choose the license of your module freely.

## Compatibility

The module is written for the API of the installed SDK (`apiVersion`). The API follows semantic
versioning: a module written for API 1.1 works with every Sulfur that provides a 1.x API from 1.1
on, not with a 2.x API. Set `minAppVersion` to the oldest version of Sulfur you tried the module on.
