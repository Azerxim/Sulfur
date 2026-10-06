# Sulfur

**English** · [Français](README.fr.md)

Modular simulator application — Electron + React (JavaScript) + TailwindCSS v4.
English (default) and French interface, dark (default) or light theme.
See the [roadmap](ROADMAP.md) for what comes next.

## Getting started

```bash
npm install
npm run dev        # development mode (HMR)
npm run build      # production build in out/
npm run dist       # packaging (electron-builder) in dist/
npm test           # automated tests (Vitest)
npm run lint       # static analysis (ESLint)
npm run format     # formatting (Prettier)
```

## Tests

The `tests/` folder holds integration tests run against real servers and clients (sockets, TLS,
certificates) plus unit tests: OPC UA security and live editing, Modbus TCP and Modbus/TCP Security,
protocol and value encoding, saved configurations and import / export files, translations (same keys and parameters in every language, every key used
in the code exists). Each test uses a free port and a temporary certificate store.

```bash
npm test             # run once
npm run test:watch   # re-run on change
```

## Lint and formatting

- **ESLint** (`eslint.config.mjs`): recommended JavaScript rules, Node / browser globals depending on the
  process, React hook rules (`rules-of-hooks`, `exhaustive-deps`) for the interface.
- **Prettier** (`.prettierrc.json`): no semicolons, single quotes, 120 columns. Formatting rules are left
  to Prettier (`eslint-config-prettier`). Markdown files are not formatted.

```bash
npm run lint           # report problems
npm run format         # format all files
npm run format:check   # check formatting without modifying (CI)
```

VS Code: the recommended extensions (ESLint, Prettier) are listed in `.vscode/extensions.json`.

## Architecture

```
src/
├── main/                 # Electron main process
│   ├── index.js          # Window + lifecycle
│   ├── module-host.js    # Module loading, IPC
│   ├── config-store.js   # Saved module configurations (config.json)
│   ├── config-transfer.js # Configuration import / export (config:* channels)
│   ├── system-info.js    # PC information (IP, system) — system:info channel
│   └── modules.js        # ← list of "main" modules
├── preload/index.js      # Secure bridge: window.sulfur.invoke / on
├── renderer/             # React interface
│   └── src/
│       ├── App.jsx       # Shell (sidebar + active module)
│       ├── components/   # Shared UI components (Card, CertificatesDialog…)
│       ├── pages/        # Application pages (Information, Settings)
│       ├── preferences.jsx # Language and theme (useI18n, usePreferences)
│       ├── module-config.js # Saved module settings (usePersistentState)
│       └── modules.js    # ← list of "renderer" modules
├── shared/               # Code shared by main/renderer (i18n, languages, simulator…)
│   └── locales/          # Common strings (en.js, fr.js)
└── modules/              # Simulation modules
    ├── opcua/
    │   ├── main/         # node-opcua server + client
    │   ├── renderer/     # Module React interface
    │   └── shared/       # Shared constants
    └── modbus/
        ├── main/         # Protocol, server, client, PKI, security
        ├── renderer/     # Module React interface
        └── shared/       # Constants + value encoding (codec)
```

## Languages and theme

Language and theme are chosen in **Settings** (remembered, including by the main process so the window
opens directly in the right theme). The language applies to the interface and to the messages produced
by the main process (errors, server logs). Defaults: English, dark theme.

- Strings are stored per dictionary: `src/shared/locales/` (application) and
  `src/modules/<id>/shared/locales/` (each module, keys prefixed with the module identifier).
- In code: `t('ui.monitoring', { count: 3 })`. In React: `const { t } = useI18n()`.
  Inside a module, use the `t` from `src/modules/<id>/shared/i18n.js`.
- A key missing from a language is displayed in English.
- A module that does not provide the selected language is displayed **entirely in English** (common
  strings included), without mixing languages.

**Adding a language** (e.g. German):

1. declare `de: { label: 'Deutsch', locale: 'de-DE' }` in `src/shared/languages.js`;
2. create `de.js` next to each `en.js` (`src/shared/locales/` and `src/modules/*/shared/locales/`);
3. register it in the neighbouring `index.js`: `registerMessages({ fr, en, de })`.

The **light theme** redefines the Tailwind color variables (`ink`, `slate`, accents) under
`:root[data-theme='light']` in `src/renderer/src/index.css`: components have no theme-specific classes.
Text placed on the accent color uses `text-on-accent`.

## Saved configurations

Server and client settings of each module (port, security, variables / points, endpoint, prepared
request…) are saved as they are edited and restored on the next start, in
`<userData>/modules/<id>/config.json` (Linux: `~/.config/sulfur/…`, Windows: `%APPDATA%\sulfur\…`).
Servers are not started automatically. The OPC UA client password is never saved.

In a module interface, `usePersistentState('<id>', '<section>', defaults)` replaces `useState`: the saved
value is completed with the defaults, so settings added in a later version keep their default value.

**Import / export** (Settings → Configurations): all module configurations are exported to a single JSON
file to share a test setup:

```json
{ "format": "sulfur-config", "version": 1, "appVersion": "0.1.0", "exportedAt": "…",
  "modules": { "opcua": { "server": { … } }, "modbus": { "client": { … } } } }
```

Importing replaces the configuration of the modules present in the file (modules unknown to this version
are ignored and listed). It is refused while a server is running or a client is connected (a module
reports this through an optional `busy()` in its main part). If a module interface fails to display (e.g.
inconsistent configuration), a button restores its default configuration.

### Adding a module

1. Create `src/modules/<id>/` with `main/index.js`, `renderer/index.js` and `shared/`.
2. **Main**: export `{ manifest, activate(ctx), deactivate(), busy() }` (`busy` optional).
   - `ctx.handle('action', fn)` exposes the IPC channel `<id>:action`
   - `ctx.emit('event', payload)` broadcasts `<id>:event` to the interface
3. **Renderer**: export `{ manifest, icon, Component }` (`lucide-react` icon).
   - `window.sulfur.invoke('<id>:action', ...args)` / `window.sulfur.on('<id>:event', fn)`
4. Register the module in `src/main/modules.js` and `src/renderer/src/modules.js`.
5. Provide its strings in `shared/locales/` (at least `en.js`, then `index.js`:
   `registerMessages({ en, fr }, '<id>')`) and a `shared/i18n.js` exporting `t = moduleT('<id>')`.
   The displayed name and description come from the `<id>.name` / `<id>.description` keys.

## OPC UA module

- **Server**: simulated variables (sine, ramp, random, toggle, static) exposed under
  `Objects/<root folder>` with NodeIds `ns=1;s=<folder>.<variable>`. Default endpoint:
  `opc.tcp://localhost:4840/UA/Sulfur`.
- **Client**: connects to any OPC UA server, browses the address space, reads/writes and monitors
  values in real time (subscriptions).
- **Security** (server and client):
  - `None`, `Sign`, `SignAndEncrypt` modes and Basic256Sha256, Aes128-Sha256-RsaOaep,
    Aes256-Sha256-RsaPss policies (+ deprecated Basic256 / Basic128Rsa15);
  - anonymous and/or username / password authentication (users defined on the server);
    passwords are hashed (scrypt + salt) as soon as they are entered, only the digest is kept;
  - server certificate `OPCUA@Sulfur` (generated on first start);
  - separate server / client certificate stores, with approval of rejected certificates from the
    interface. Location: `<userData>/modules/opcua/pki/{server,client}`
    (Linux: `~/.config/sulfur/…`, Windows: `%APPDATA%\sulfur\…`);
  - on the client side, “Discover endpoints” lists the mode / policy pairs offered by the server.

## Modbus TCP module

- **Server**: the four tables (coils, discrete inputs, input registers, holding registers),
  functions 1 to 6, 15 and 16. Typed simulated points (Boolean, UInt16/Int16, UInt32/Int32,
  Float32, Float64, word order ABCD / CDAB / BADC / DCBA), editable while the server is running.
  List of connected clients and security event log.
- **Client**: read / write on every table with decoding (UInt16 → Float64, hexadecimal, binary)
  and periodic monitoring.
- **Security**:
  - **Modbus/TCP Security** (TLS ≥ 1.2, standard port 802) with mutual authentication using pinned
    X.509 certificates (trusted / rejected stores, approval from the interface);
  - **role-based authorization**: role read from the client certificate (extension
    `1.3.6.1.4.1.50316.802.1`), read / write permissions per role, default role or refusal;
  - IP allow list (CIDR), maximum number of connections, requests-per-second limit (exception 06),
    read-only mode, write-protected points, Unit ID filtering (exception 11), connections sending
    invalid frames are closed;
  - server certificate `MODBUS@Sulfur`, client certificate regenerated with the selected role;
    location: `<userData>/modules/modbus/pki/{server,client}`.
- Default ports 5020 (TCP) / 8020 (TLS): the standard ports 502 / 802 require administrator rights
  on Linux.
