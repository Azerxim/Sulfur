# Architecture

[Documentation](README.md) · **English** · [Français](../fr/architecture.md)

Sulfur is an Electron application. Each protocol or tool is a **module** made of two parts: one runs in
the main process (Node.js: sockets, files, certificates), the other in the interface (React). The two
parts talk through IPC channels named after the module.

## Source tree

```text
src/
├── main/                    # Electron main process
│   ├── index.js             # Window and lifecycle
│   ├── module-host.js       # Module loading, context, IPC
│   ├── modules.js           # ← list of the built-in "main" modules
│   ├── config-store.js      # Saved module configurations (config.json)
│   ├── config-bundle.js     # Format of the import / export file
│   ├── config-transfer.js   # Configuration import / export (config:* channels)
│   ├── module-switch.js     # Enabled / disabled modules, packages (modules:* channels)
│   ├── external-modules.js  # External modules: loading, refresh, installation, removal
│   ├── module-packages.js   # Package folders: checks, import, sulfur-module:// protocol
│   ├── preferences.js       # preferences.json (theme, language…)
│   ├── system-info.js       # PC information (system:* channels)
│   ├── updater.js           # Automatic updates (electron-updater)
│   └── releases.js          # Release notes
├── preload/index.js         # Secure bridge: window.sulfur.invoke / on
├── renderer/                # React interface
│   └── src/
│       ├── App.jsx          # Shell: sidebar and active page
│       ├── modules.js       # ← list of the built-in "renderer" modules
│       ├── components/      # Sidebar, error boundary, Markdown
│       ├── pages/           # Home, Information, Settings
│       ├── preferences.jsx  # Language and theme (useI18n, usePreferences)
│       └── module-config.js # Import / export and reset of the configurations
├── shared/                  # Application code shared by main and renderer
│   ├── app.js               # Version of Sulfur
│   └── locales/             # Application strings (en.js, fr.js)
└── modules/                 # Built-in modules (they only import the SDK)
    ├── builtin.js           # Manifest of the built-in modules
    └── <id>/
        ├── main/            # Main process part (servers, clients, protocol)
        ├── renderer/        # React interface
        └── shared/          # Constants, codecs, translations (shared/locales/)
packages/
└── sdk/                     # Module SDK @azerxim/sulfur-sdk
examples/
├── module-template/         # Template to start your own module
└── test-signal/             # Example external module
docs/                        # This documentation
tests/                       # Vitest tests (see Development)
```

Path aliases (`aliases.mjs`, shared by the build and the tests): `@shared`, `@modules`, `@renderer` and
`@azerxim/sulfur-sdk[/main|/ui|/build|/host|/archive]`, resolved from `packages/sdk/src`.

## Start-up and shutdown

1. The main process reads `preferences.json` and applies the language, so that its messages are
   translated from the start.
2. The `ModuleHost` checks the manifest of every module, then activates the enabled ones: the
   application services (`system`, `updater`), the built-in modules in the order of
   `src/main/modules.js`, then the external modules if their loading is enabled.
3. The window opens directly in the saved theme: the preload receives it as an argument and sets
   `data-theme` before the page runs, so there is no flash of the wrong theme.
4. The interface loads the saved configuration of every module before its first render.

On quit, the modules are deactivated in reverse order: the cross-cutting modules (simulator, trends),
registered after the protocol modules whose points they use, are stopped first.

## Module host and context

`src/main/module-host.js` gives each module a context `ctx`:

| Member | Purpose |
| --- | --- |
| `ctx.handle(action, fn)` | Registers the IPC channel `<id>:<action>`, callable from the interface |
| `ctx.emit(event, payload)` | Broadcasts `<id>:<event>` to every window |
| `ctx.dataDir` | Persistent data folder of the module (`<userData>/modules/<id>`) |
| `ctx.config()` | Saved configuration of the module |
| `ctx.setConfig(section, value)` | Replaces a section of that configuration (state owned by the main process) |
| `ctx.expose(api)` | Publishes the data points of the module for the other modules |
| `ctx.peers()` | Points published by the other active modules: `[{ id, api }]` |
| `ctx.log(...args)` | Log prefixed with the module identifier |

The host also registers, for each module, the `<id>:config:load`, `<id>:config:save` and
`<id>:config:reset` channels (see [Saved configurations](configuration.md)).

A module whose manifest is invalid or incompatible, or whose activation fails, is refused: it has no
channel, no configuration and no page, and is listed with the reason in *Settings → Modules*.

## IPC

The preload (`src/preload/index.js`) exposes a single object to the interface:

```js
const data = await window.sulfur.invoke('modbus:server:start', config) // throws on error
const unsubscribe = window.sulfur.on('modbus:server:status', (status) => { … })
```

- channel names must match `<moduleId>:<action>`; any other name is refused by the preload;
- a handler's result is wrapped in `{ ok, data }` or `{ ok: false, error }` by the host, and
  `invoke` turns an error back into an exception carrying the (translated) message;
- each module wraps its channels in a small `renderer/api.js`.

The identifiers `modules`, `config`, `home`, `info` and `settings` are reserved for the application.
Its own main process services are loaded as modules too: `system` (PC information, theme, language)
and `updater` (updates).

## Data points

Protocol modules publish their values as **data points** with `ctx.expose(api)`; the cross-cutting
modules ([Simulator](modules/simulator.md), [Trends](modules/trends.md)) find them with `ctx.peers()`.
The contract (`PointsApi`, described in `packages/sdk/src/points.js`):

| Member | Content |
| --- | --- |
| `name` | Displayed name of the module |
| `points()` | `[{ id, group: 'server' \| 'client', name, dataType, numeric, writable }]` |
| `read(ids)` | `{ [id]: value }`, `undefined` when unavailable |
| `write(id, value)` | Writes a value (Promise), throws a translated error if impossible |
| `faultTypes()` | Injectable faults: `[{ type, codes?, points? }]` |
| `setFaults(faults)` | Active faults of this module: `[{ id, type, params, points }]` |

Outside its module, a point is designated by `<moduleId>/<local id>` (`pointKey` / `parsePointKey`).
Common fault types: `delay`, `noResponse`, `cut`, `exception`, `badStatus`, `kissOfDeath`, `freeze`.

## Module SDK

Modules use the application only through the **module SDK** `@azerxim/sulfur-sdk` (`packages/sdk`,
see its [README](../../packages/sdk/README.md)):

| Entry point | Content |
| --- | --- |
| `@azerxim/sulfur-sdk` | Manifest, translations and common strings, data points, configuration helpers |
| `@azerxim/sulfur-sdk/main` | Main process helpers: certificates, passwords, served folders |
| `@azerxim/sulfur-sdk/ui` | Shared React components (`Button`, `Card`, `Tabs`…), `usePersistentState`, theme |
| `@azerxim/sulfur-sdk/build` | Build and packaging of external modules (`packModule`) |
| `@azerxim/sulfur-sdk/host` | Reserved for the application |

The Sulfur build resolves the SDK from its sources; a test checks that the built-in modules import
nothing else from the application. The SDK is also published on npm so that modules can be built
outside this repository (see [Creating a module](module-guide.md)).

## Manifest

Each module declares a manifest, the same object for its main and renderer parts:

| Field | Content |
| --- | --- |
| `id` | Identifier, prefix of the IPC channels (`[a-z0-9-]+`, unique) |
| `name` | Fallback name (the displayed one comes from the `<id>.name` key) |
| `description` | Fallback description (`<id>.description` key) |
| `version` | Version of the module (semver) |
| `author` | Author or publisher (optional), shown before a package is installed |
| `edition` | `standard` (built into Sulfur) or `additional` (separate package) |
| `apiVersion` | Version of the module API the module is written for (semver) |
| `minAppVersion` | Minimum version of Sulfur (semver) |

The module API (`MODULE_API_VERSION` of the SDK, equal to its version) follows semantic versioning: a
module written for API 1.2 works with every 1.x API from 1.2 on, not with a 2.x API. A manifest is
refused when it is invalid, uses a reserved or already used identifier, targets an incompatible module
API or requires a more recent Sulfur.

Built-in modules use `builtinManifest({ id, name, description })` (`src/modules/builtin.js`): version
of the application, standard edition, current module API. An external module uses `defineManifest` of
the SDK with its own `version` and `minAppVersion`.

## Adding a built-in module

To write a module **outside** this repository, follow [Creating a module](module-guide.md) instead.

1. Create `src/modules/<id>/` with `main/index.js`, `renderer/index.js` and `shared/`. Import the
   application code only through the SDK (`@azerxim/sulfur-sdk`, `/main`, `/ui`).
2. **Main part**: export `{ manifest, activate(ctx), deactivate(), busy(), migrateConfig() }`. The
   manifest comes from `builtinManifest(…)`; `busy()` (server running, client connected) and
   `migrateConfig(config)` (conversion of an older configuration) are optional.
3. **Renderer part**: export `{ manifest, icon, Component }` (`lucide-react` icon). Wrap the channels
   in `renderer/api.js` with `window.sulfur.invoke` / `window.sulfur.on`.
4. Register the module in `src/main/modules.js` and `src/renderer/src/modules.js`. Cross-cutting
   modules come last.
5. Provide its strings in `shared/locales/` (at least `en.js`, then `index.js`:
   `registerMessages({ en, fr }, '<id>')`) and a `shared/i18n.js` exporting `t = moduleT('<id>')`.
   The displayed name and description come from the `<id>.name` and `<id>.description` keys.
6. Publish its values with `ctx.expose(api)` so that the simulator and the trends can use them.
7. Add its tests in `tests/<id>.test.js` and its page in `docs/modules/`.
