# Sulfur

[![CI](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml?query=branch%3Amain)
[![Release](https://img.shields.io/github/v/release/Azerxim/Sulfur)](https://github.com/Azerxim/Sulfur/releases/latest)
[![SDK](https://img.shields.io/npm/v/@azerxim/sulfur-sdk?label=SDK)](https://www.npmjs.com/package/@azerxim/sulfur-sdk)

**English** · [Français](README.fr.md)

Modular simulator application — Electron + React (JavaScript) + TailwindCSS v4.
English (default) and French interface, light or dark theme (follows the system by default).
See the [roadmap](ROADMAP.md) for what comes next. License: [Apache-2.0](LICENSE).

Anyone can extend Sulfur with their own modules, without approval or signature: write one with the
[module SDK](packages/sdk/README.md) by following the [module development guide](docs/module-guide.md),
then install its `.sulfur-module` package from *Settings → Modules*.

## Getting started

```bash
npm install
npm run dev        # development mode (HMR)
npm run build      # production build in out/
npm run dist       # installers (electron-builder) in dist/
npm test           # automated tests (Vitest)
npm run lint       # static analysis (ESLint)
npm run format     # formatting (Prettier)
npm run example:build # example external module → examples/test-signal/dist/
```

## Tests

The `tests/` folder holds integration tests run against real servers and clients (sockets, TLS,
certificates) plus unit tests: OPC UA security, live editing, arrays and structures, methods, alarms and events, history and NodeSet2 import, Modbus TCP, Modbus/TCP Security, RTU and ASCII (frames, RTU over TCP, serial link, broadcast), HTTP / REST (API, routes, authentication, HTTPS, webhooks), NTP (packets, simulated clock, client), Siemens S7 (addresses, codec, server and client, PDU splitting, faults), PLCSim Advanced (bridge protocol, manager), MQTT (topics and wildcards, broker and client, authentication, TLS, faults), SNMP (v1 / v2c / v3, Get / GetNext / GetBulk / Walk / Set, monitoring, traps and informs, faults), Syslog (RFC 5424 and 3164, TCP framing, UDP / TCP / TLS, faults), network explorer targets (private networks only), serial terminal (hexadecimal and escaped entries, frame splitting, control lines, serial ↔ TCP gateway), RADIUS (RFC 2865 examples, PAP / CHAP, Message-Authenticator, LDAP directory accounts, accounting), DHCP (packets, pool checked against the interface subnet, private networks only, leases, server and client, MAC filter), fault injection, node flows and trend recording on both protocols,
protocol and value encoding, saved configurations and import / export files (sections of modules that are not installed kept), module manifests and SDK exports, external module packages (loading, `.sulfur-module` archives, installation, update and removal), module template (built, packaged and run), translations (same keys and parameters in every language, every key used
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

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request: `npm ci`, lint,
formatting check, tests and build, on Ubuntu with Node 24. Run the same checks locally before pushing:

```bash
npm run lint && npm run format:check && npm test && npm run build
```

The module SDK has its own workflow (`.github/workflows/sdk.yml`), run on `sdk-v*` tags (e.g.
`sdk-v1.1.0`, equal to the version of `packages/sdk/package.json`): lint and tests, then publication
on GitHub Packages and staging on npm (`npm stage publish` with provenance, `NPM_TOKEN` secret:
stage-only token). A maintainer then approves the npm version with 2FA:

```bash
npm stage list @azerxim/sulfur-sdk
npm stage approve <id>
```

## Packaging

```bash
npm run dist:linux   # AppImage and .deb → dist/Sulfur-<version>-x86_64.AppImage, dist/Sulfur_<version>_amd64.deb
npm run dist:win     # NSIS installer → dist/Sulfur-Setup-<version>.exe (on Windows)
npm run dist:mac     # DMG → dist/Sulfur-<version>-x64.dmg and dist/Sulfur-<version>-arm64.dmg (on macOS)
```

- Configuration in `electron-builder.yml`. Application icon: `resources/icon.png` (1024 px, Linux and
  window icon, converted to .icns for macOS) and `resources/icon.ico` (Windows). `resources/` is packaged with the application;
  `build/` is reserved for packaging-only resources, such as `build/icons/` (Linux icon in each standard
  size, generated from `resources/icon.png`).
- The Windows installer lets the user choose the installation folder and creates a desktop shortcut.
  Installers are not code-signed: on macOS, the first launch requires right-click → *Open* (or
  `xattr -cr /Applications/Sulfur.app`).
- The CI runs lint, tests and build on `main` and on every pull request. On `v*` version tags, it also builds the
  Windows, Linux and macOS installers and attaches them to a draft GitHub release, along with the
  `latest*.yml` files used by the update system:

```bash
npm version patch          # bumps package.json and creates the vX.Y.Z tag
git push --follow-tags
```

- Updates (`src/main/updater.js`, electron-updater): the application checks the GitHub releases at
  startup, then every 6 hours; this can be turned off in *Settings → Updates*. Draft releases are
  ignored: an update is offered once its release is published. Installation is automatic on Windows,
  AppImage and .deb; on macOS (unsigned application), the new version is only reported, with a link to
  its release.

## Architecture

```
src/
├── main/                 # Electron main process
│   ├── index.js          # Window + lifecycle
│   ├── module-host.js    # Module loading, IPC
│   ├── config-store.js   # Saved module configurations (config.json)
│   ├── config-transfer.js # Configuration import / export (config:* channels)
│   ├── module-switch.js  # Enabled / disabled modules, packages (modules:* channels)
│   ├── external-modules.js # External modules: loading, refresh, package installation and removal
│   ├── module-packages.js # Package folders: checks, import, sulfur-module:// protocol
│   ├── system-info.js    # PC information (IP, system) — system:info channel
│   └── modules.js        # ← list of "main" modules
├── preload/index.js      # Secure bridge: window.sulfur.invoke / on
├── renderer/             # React interface
│   └── src/
│       ├── App.jsx       # Shell (sidebar + active module)
│       ├── components/   # Application components (Sidebar, error boundary)
│       ├── pages/        # Application pages (Home, Information, Settings)
│       ├── preferences.jsx # Language and theme (useI18n, usePreferences)
│       ├── module-config.js # Configuration import / export and reset
│       └── modules.js    # ← list of "renderer" modules
├── shared/               # Application code shared by main/renderer
│   ├── app.js            # Version of Sulfur
│   └── locales/          # Application strings (en.js, fr.js)
└── modules/              # Simulation modules (they only import the SDK)
    ├── builtin.js        # Manifest of the modules shipped with Sulfur
    ├── opcua/
    │   ├── main/         # node-opcua server + client
    │   ├── renderer/     # Module React interface
    │   └── shared/       # Shared constants
    ├── modbus/
    │   ├── main/         # Protocol, framing (MBAP, RTU, ASCII), serial link, server, client, PKI
    │   ├── renderer/     # Module React interface
    │   └── shared/       # Constants + value encoding (codec)
    ├── http/             # REST server (variables, routes, webhooks) + HTTP client
    ├── ntp/              # Time server with a simulated clock + NTP client
    ├── s7/               # Simulated S7 PLC (S7comm) + S7 client
    ├── plcsim/           # S7-PLCSIM Advanced virtual PLCs (Windows, PowerShell bridge to the API)
    ├── mqtt/             # MQTT broker (simulated topics) + MQTT client
    ├── snmp/             # SNMP agent (simulated MIB, notifications) + manager and trap receiver
    ├── syslog/           # Syslog server (UDP / TCP / TLS) + message sender
    ├── dns/              # Authoritative DNS server (local zone, forwarding) + DNS client
    ├── dhcp/             # Test DHCP server for an isolated private network + DHCP client
    ├── ldap/             # LDAP / LDAPS directory (LDIF, BER protocol) and RADIUS server + clients
    ├── ftp/              # FTP / FTPS and SFTP servers (confined folder, users) + clients
    ├── tftp/             # TFTP server (confined folder, options) + TFTP client
    ├── simulator/        # Fault injection and node flows (uses the points of the other modules)
    ├── trends/           # Trends, data logging and CSV export (same)
    ├── ca/               # Certificate authority: authorities, issuance, CSR, revocation (CRL), PKCS#12
    ├── explorer/         # Network explorer: targets restricted to the private networks
    └── serial/           # Serial terminal (RS-232 / RS-485, hexadecimal log) + serial ↔ TCP gateway
packages/
└── sdk/                  # Module SDK @azerxim/sulfur-sdk (contract, i18n, points, UI components,
                          #   package build and .sulfur-module archives)
examples/
├── test-signal/          # Example external module (signal generator, data points)
└── module-template/      # Template to start your own module
docs/
└── module-guide.md       # Module development guide
```

## Module SDK

The modules only use the application through the **module SDK** `@azerxim/sulfur-sdk`
(`packages/sdk`, documented in its [README](packages/sdk/README.md)): manifest, translations and
common strings, data points, saved configuration, certificates, passwords, served folders and the
shared UI components (`Button`, `Card`, `Tabs`…). The Sulfur build resolves it from its sources (see
`aliases.mjs`); a test checks that the modules import nothing else from the application. The SDK is
published on npm and on GitHub Packages by the `SDK` workflow on the `sdk-v*` tags (e.g. `sdk-v1.1.0`,
equal to the version of `packages/sdk/package.json`), so that additional modules, including your own, can be built
outside this repository.

## Languages and theme

Language and theme are chosen in **Settings** (remembered, including by the main process so the window
opens directly in the right theme). The language applies to the interface and to the messages produced
by the main process (errors, server logs). Defaults: English, theme of the operating system.

- Strings are stored per dictionary: `packages/sdk/src/locales/` (strings common to the modules:
  `ui`, generic `errors`, `simulations`, `certs`), `src/shared/locales/` (application) and
  `src/modules/<id>/shared/locales/` (each module, keys prefixed with the module identifier).
- In code: `t('ui.monitoring', { count: 3 })`. In React: `const { t } = useI18n()`.
  Inside a module, use the `t` from `src/modules/<id>/shared/i18n.js`.
- A key missing from a language is displayed in English.
- A module that does not provide the selected language is displayed **entirely in English** (common
  strings included), without mixing languages.

**Adding a language** (e.g. German):

1. declare `de: { label: 'Deutsch', locale: 'de-DE' }` in `packages/sdk/src/languages.js`;
2. create `de.js` next to each `en.js` (`packages/sdk/src/locales/`, `src/shared/locales/` and
   `src/modules/*/shared/locales/`);
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

**Import / export** (Settings → General → Configurations): all module configurations are exported to a single JSON
file to share a test setup:

```json
{ "format": "sulfur-config", "version": 1, "appVersion": "0.2.0", "exportedAt": "…",
  "modules": { "opcua": { "server": { … } }, "modbus": { "client": { … } } } }
```

Importing replaces the configuration of the modules present in the file. The sections of a module
that is not loaded (external module not installed or not loaded, module of another version of
Sulfur) are kept in `<userData>/modules/<id>/config.json` and listed: the module finds them once it
is installed and loaded, and the next export includes them again. Unusable sections (invalid or
reserved identifier, content that is not an object) are ignored and listed. Importing is refused while a server is running or a client is connected (a module
reports this through an optional `busy()` in its main part). If a module interface fails to display (e.g.
inconsistent configuration), a button restores its default configuration.

### Enabling and disabling modules

**Settings → Modules → Enabled modules** lists every module, with its version, and a checkbox. A disabled module is hidden from
the sidebar, the home page and the startup page choices; it is stopped at once (its channels and its
points for the simulator and the trends are removed) and is no longer loaded at the next start.
Its saved configuration is kept, and still exported and imported. Disabling a module whose server
is running or whose client is connected is refused: stop it first. A re-enabled module is loaded
immediately. The list is kept by the main process in `<userData>/preferences.json`
(`disabledModules`).

### Module packages

To create your own module, follow the [module development guide](docs/module-guide.md), which
starts from the template in [`examples/module-template`](examples/module-template).

An external module (developed with the SDK, yours included) is shared as a **package**: a single
`<id>-<version>.sulfur-module` file (ZIP archive of `module.json` and the built files), produced by
`packModule` of the SDK. **Settings → Modules → External modules → Install a package…** reads and
checks it (descriptor, files, compatibility, identifier not used by a built-in module), then shows
the module, its version, its author and the version already installed before asking for
confirmation; nothing is written before that. The package is extracted to
`<userData>/module-packages/<id>`, in place of the previous version. The same list removes an
installed package. When the external modules are loaded, Sulfur refreshes them right after an
installation or a removal; both are refused while a server of an external module is running or a
client is connected.

Packages are **not signed**: anyone can create and install their own module, without any approval.
Since a module runs with the rights of Sulfur (files, network), loading the external modules is
disabled by default, and the confirmation reminds that the origin of the package cannot be checked.
Reading an archive is limited (relative paths only, 2000 files, 200 MB once extracted, CRC checked).

### Module manifest

Each module declares a manifest, the same object for its main and renderer parts:

| Field           | Content                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `id`            | identifier, prefix of the IPC channels (`[a-z0-9-]+`, unique)               |
| `name`          | fallback name (the displayed one comes from the `<id>.name` key)            |
| `description`   | fallback description (`<id>.description` key)                               |
| `version`       | version of the module (semver)                                              |
| `author`        | author or publisher (optional), shown before a package is installed         |
| `edition`       | `standard` (built into Sulfur) or `additional` (separate package)            |
| `apiVersion`    | version of the module API the module is written for (semver)               |
| `minAppVersion` | minimum version of Sulfur (semver)                                          |

The module API (`MODULE_API_VERSION` of the SDK, equal to its version, currently 1.1.0) follows semantic
versioning: a module written for API 1.2 works with every 1.x API from 1.2 on, not with a 2.x API.
The main process checks every manifest before loading the module: an invalid manifest, an identifier
that is reserved (`modules`, `config`, `home`, `info`, `settings`) or already used, an incompatible
module API or a too recent `minAppVersion` refuses the module, which then does not exist for the
application (no channels, configuration or page). The refused modules are listed with the reason in
**Settings → Modules**. The modules shipped with Sulfur use `builtinManifest({ id, name,
description })` (`src/modules/builtin.js`): version of the application, standard edition, current
module API. A module developed outside the repository uses `defineManifest` of the SDK with its own
`version` and `minAppVersion`.

### Adding a module

1. Create `src/modules/<id>/` with `main/index.js`, `renderer/index.js` and `shared/`. Import the
   application code only through the SDK (`@azerxim/sulfur-sdk`, `/main`, `/ui`).
2. **Main**: export `{ manifest, activate(ctx), deactivate(), busy() }` (`busy` optional); the manifest
   comes from `builtinManifest(…)` (see above).
   - `ctx.handle('action', fn)` exposes the IPC channel `<id>:action`
   - `ctx.emit('event', payload)` broadcasts `<id>:event` to the interface
   - `ctx.expose(api)` publishes the module's data points (list, read, write, injectable faults) for
     the simulator and the trends; `ctx.peers()` returns those of the other modules. The contract is
     described in the SDK (`PointsApi`).
3. **Renderer**: export `{ manifest, icon, Component }` (`lucide-react` icon).
   - `window.sulfur.invoke('<id>:action', ...args)` / `window.sulfur.on('<id>:event', fn)`
4. Register the module in `src/main/modules.js` and `src/renderer/src/modules.js`.
5. Provide its strings in `shared/locales/` (at least `en.js`, then `index.js`:
   `registerMessages({ en, fr }, '<id>')`) and a `shared/i18n.js` exporting `t = moduleT('<id>')`.
   The displayed name and description come from the `<id>.name` / `<id>.description` keys.

## OPC UA module

- **Server**: simulated variables (sine, ramp, random, toggle, static) exposed under
  `Objects/<root folder>` with NodeIds `ns=1;s=<folder>.<variable>`. Default endpoint:
  `opc.tcp://localhost:4840/UA/Sulfur`. A String variable receives the generated value as text.
  - **Arrays** (fixed size, elements simulated with a phase shift) and **structured types**
    (ExtensionObject, `Name:Type` fields, `[]` for an array);
  - **methods** with input / output arguments: echo, read / write of the variables of the same name,
    or failure with a chosen status code;
  - acknowledgeable **limit alarms** (ExclusiveLimitAlarmType: HighHigh, High, Low, LowLow), and
    **events** raised on demand;
  - **history**: historized variables keep their last 10,000 values (HistoryRead);
  - **NodeSet2 XML import**: the types and nodes of the file are added to the address space; required
    companion models shipped with node-opcua (DI, Machinery…) are loaded automatically. Imported files
    are saved with the configuration.

  Variables, methods and alarms can be edited while the server is running; structured types and
  imported models are loaded at start.
- **Client**: connects to any OPC UA server, browses the address space, reads/writes (arrays and
  structures included, as JSON) and monitors values in real time (subscriptions), calls methods, reads
  history, receives events and alarms and acknowledges them.
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

## Modbus module

- **Transports**: Modbus TCP (MBAP header), Modbus/TCP Security (TLS), **RTU over TCP** (RTU frames
  with CRC in a TCP connection, as sent by serial-to-Ethernet gateways in transparent mode), and
  **Modbus RTU** / **Modbus ASCII** on a serial link (RS-232 / RS-485 port, baud rate, data bits,
  parity, stop bits; detected ports listed). Serial ports use the `serialport` library.
  - On a serial link and in RTU over TCP, Unit IDs go from 1 to 247: the server ignores requests
    for another Unit ID, as on a shared bus, and applies broadcast writes (Unit ID 0) to every
    device without replying. The client sends one request at a time and waits for the 3.5
    character silence between frames; Unit ID 0 sends broadcast writes.
  - RTU frames are delimited by function code (and announced byte count), then by a silence for an
    unknown function; invalid frames (CRC, LRC, noise) are counted in the server log. A CRC error
    closes an RTU over TCP connection; on a serial link the reader resynchronizes.
- **Server**: the four tables (coils, discrete inputs, input registers, holding registers),
  functions 1 to 6, 15, 16, 23 (read / write multiple) and 43 / 14 (device identification). Typed
  simulated points (Boolean, UInt16/Int16, UInt32/Int32, Float32, Float64, word order ABCD / CDAB /
  BADC / DCBA), editable while the server is running. List of connected clients (or the open serial
  port) and security event log.
  - **Several devices** on one server (gateway simulation): each responds to its Unit ID with its
    own memory, points and identification; an unconfigured Unit ID gets exception 0B, or is served
    by the first device if the option is checked. Devices are added, edited or removed while the
    server is running.
  - **Identification** (function 43 / 14): objects 00 to 06 (vendor, product code, revision, URL,
    product, model, application) per device; basic, regular (stream access, responses split when
    needed) and individual reads; conformity level 0x82.
  - **Register explorer**: raw memory of a device by pages (UInt16, Int16, hexadecimal, binary,
    bits), refreshed continuously; addresses taken by a point are highlighted and every value can
    be edited.
- **Client**: read / write on every table with decoding (UInt16 → Float64, hexadecimal, binary),
  write then read in one request (function 23), device identification read and periodic
  monitoring.
- **Security**:
  - **Modbus/TCP Security** (TLS ≥ 1.2, standard port 802) with mutual authentication using pinned
    X.509 certificates (trusted / rejected stores, approval from the interface);
  - **role-based authorization**: role read from the client certificate (extension
    `1.3.6.1.4.1.50316.802.1`), read / write permissions per role, default role or refusal;
  - IP allow list (CIDR), maximum number of connections, requests-per-second limit (exception 06),
    read-only mode, write-protected points, Unit ID filtering (exception 11), connections sending
    invalid frames are closed (TCP transports);
  - server certificate `MODBUS@Sulfur`, client certificate regenerated with the selected role;
    location: `<userData>/modules/modbus/pki/{server,client}`.
- Default ports 5020 (TCP) / 8020 (TLS): the standard ports 502 / 802 require administrator rights
  on Linux.

## HTTP / REST module

- **Server** HTTP or HTTPS (self-signed certificate `HTTP@Sulfur`, generated on first start), default
  port 8080:
  - **simulated variables** (number, integer, boolean, text, JSON; sine, ramp, random, toggle),
    editable while running, exposed by a built-in REST API: `GET <base>/variables`,
    `GET <base>/variables/<name>`, `PUT | PATCH | POST <base>/variables/<name>` (body
    `{ "value": … }` or the value alone) for writable variables;
  - **routes** checked in order: method, path with parameters (`/api/devices/:id`, `*` at the end),
    status, headers, delay and response body template (`{{var.<name>}}`, `{{params.<name>}}`,
    `{{query.<name>}}`, `{{headers.<name>}}`, `{{body.<field>}}`, `{{now}}`, `{{uuid}}`…); a route
    can assign a variable from the request (e.g. `body.value`);
  - **authentication**: Basic (users, passwords hashed with scrypt as soon as they are entered),
    Bearer token or API key in a header; CORS headers;
  - **webhooks**: outgoing JSON calls at each change of the chosen variables (with a minimum spacing)
    or periodically;
  - log of received requests and webhook calls, with their bodies.
- **Client**: requests with every method to a base address or a full URL (authentication, common
  headers, unverified certificates accepted on request), readable response (status, duration,
  headers, indented JSON) and history; **monitoring** of a JSON value (path such as `data.value`)
  polled periodically and published as a point; with a write method, the simulator can write it.
  Client passwords, tokens and keys are not saved.
- Simulator faults: response delay, no response, connection cut, forced HTTP status (on all requests
  or those concerning the chosen variables), frozen values.

## NTP module

- **Server** (UDP, default port 1123; standard port 123 needs administrator rights on Linux):
  responds to NTP v1 to v4 client requests with a **simulated clock**: offset from real time (time
  jumps of ±1 min to ±1 year in one click) or fixed start time, drift in ppm; announced stratum
  (1 to 16), leap indicator, reference identifier and precision. Everything applies live. Useful to
  test the timestamps of devices and the validity of their certificates. List of recent clients and
  log.
- **Client**: single or periodic query of a server; clock offset, round-trip delay, stratum, leap
  indicator, reference, precision, root delay and dispersion; history. A response whose Origin field
  does not match the request is ignored.
- Points for the simulator and trends: server time, offset (writable: a flow can cause time jumps),
  drift, stratum and leap indicator (writable), request count; offset, delay and stratum measured by
  the client.
- Simulator faults: delay (simulated network latency, included in the round-trip delay), no
  response, Kiss-o'-Death (DENY, RSTR, RATE), frozen clock.

## Siemens S7 module

- **Simulated PLC** (S7comm over ISO-on-TCP, default port 1102; standard port 102 is often taken on
  Windows by the Siemens services and needs administrator rights on Linux): inputs (I), outputs (Q),
  markers (M) and configurable data blocks; **simulated points** at S7 addresses (`DB1.DBD0`,
  `MW10`, `Q0.0`… in Bool, Byte, Int, DInt, Real, LReal, String… types) with the usual generators;
  negotiated PDU size (240, 480, 960); CPU identification returned in the system status lists (SZL
  0x0011, 0x001C) and operating state (0x0424); RUN / STOP by hand or by the clients (PI services);
  write protection; memory explorer (raw bytes, editable); connected clients and log. Clients
  connect with any rack and slot. Checked against Snap7.
- **Client**: connection by rack and slot (PG, OP or S7 basic connection) or explicit TSAPs, PDU
  negotiation; typed reads and writes by address (international or German notation: `E0.1`, `AW2`);
  raw byte reads and writes split according to the PDU size; CPU identification (order number,
  firmware, serial number…), operating state, warm / cold restart and STOP (confirmed); **monitoring**
  grouped in multi-variable requests, kept across restarts and published as points. S7-1200 / 1500:
  enable PUT/GET and use data blocks with standard access.
- Simulator faults: response delay, no response, connection cut, forced item return code (hardware
  fault, access denied, address out of range… on reads, writes or both), frozen values.

## PLCSim Advanced module (Windows)

Drives the S7-1500 virtual PLCs of **S7-PLCSIM Advanced** through its Simulation Runtime API (.NET
assembly `Siemens.Simatic.Simulation.Runtime.Api`), loaded by Windows PowerShell 5.1 in a background
process: no native module to compile. The API folder is detected automatically (latest version in
`C:\Program Files (x86)\Common Files\Siemens\PLCSIMADV\API\<version>`) or set in the module.

- Connection to the API (optionally when Sulfur starts): API version, Runtime Manager availability,
  network mode (Softbus or TCP/IP).
- **Remote PC**: connection to the Runtime Manager of another PC (IP address or name, port opened in
  the PLCSIM Advanced control panel, 50000 by default); the instances listed and driven are then
  those of that PC. Connection loss is reported.
- **Without PLCSIM Advanced installed**: the module asks for the folder containing the API DLLs
  (copied from a PC where it is installed). The API is a native Windows library (C++/CLI): it cannot
  be loaded on Linux or macOS, where the module stays unavailable.
- **Instances**: creation (CPU type), power on / off, RUN / STOP, memory reset, deletion, IP address
  of each interface. The program is downloaded from TIA Portal.
- **Variables**: tag table of the downloaded program (filter, arrays expanded), or addresses of the
  inputs, outputs and markers; **monitoring** of several instances, written from the list and
  published as points: a simulator flow can drive the inputs of the virtual PLC to simulate the
  process. Monitored variables are kept across restarts.
- Real-API test: `SULFUR_PLCSIM_LIVE=1 npm test` (creates, powers on and deletes a test instance).

## MQTT module

- **Broker** (MQTT 3.1, 3.1.1 and 5.0, default port 1883; TLS on 8883 with a self-signed certificate
  `MQTT@Sulfur` generated on first start): persistent sessions and session expiry, QoS 0 / 1 / 2,
  retained messages, last will (with delay in 5.0), topic aliases, 5.0 subscription options (no local,
  retain as published, retain handling, subscription identifiers) and message properties forwarded to
  5.0 clients; shared subscriptions and enhanced authentication are not supported. **simulated topics** published by the broker itself
  (number, integer, boolean or text value; sine, ramp, random or toggle generator), periodically or
  at each change, as a value alone or JSON `{"value": …, "timestamp": …}`, with chosen QoS and
  retain flag. A settable topic accepts a new value published on `<topic>/set`. Optional
  authentication (users with hashed passwords; anonymous connections can be refused). List of the
  connected clients and their subscriptions, topic explorer (last content of each topic), message
  log with a topic filter (`+` and `#` wildcards) and connection events.
- **Client** (mqtt.js, MQTT 3.1, 3.1.1 or 5.0, TCP or TLS): client ID, user, clean session, keep
  alive, automatic reconnection, last will message; subscriptions with QoS and an optional JSON field
  (`value`, `data.temp`…) whose last value is shown; publication (topic, content, QoS, retain); log
  of the received messages.
- Points for the simulator and trends: simulated topics (writable: publishes the new value), number
  of clients and messages of the broker; last value of each client subscription (a subscription
  without wildcard is writable: the value is published on its topic).
- Simulator faults: delay (incoming publications), no response (CONNECT left unanswered, messages
  no longer delivered), connection cut (clients disconnected and refused), frozen values.

## SNMP module

- **Agent** (net-snmp, UDP, default port 1161; standard port 161 needs administrator rights on
  Linux): SNMPv1, v2c and v3. Read community and read / write community, SNMPv3 users (USM: MD5 or
  SHA-1 / SHA-2 authentication, DES or AES encryption), engine ID chosen or generated. System group
  of MIB-II (sysDescr, sysObjectID, sysUpTime, sysContact, sysName, sysLocation, sysServices) and
  **simulated objects** (Integer, Counter32, Gauge32, TimeTicks, OctetString, IpAddress, OID;
  sine, ramp, random or toggle generator), writable by SetRequest if declared so. Get, GetNext,
  GetBulk and Set requests, request log.
- **Notifications**: the agent sends a notification (chosen OID, chosen objects attached) to
  destinations in SNMPv1 (trap), SNMPv2c or SNMPv3 (trap or acknowledged inform); an SNMPv3
  notification uses one of the agent users and the agent engine ID.
- **Manager**: Get, GetNext, GetBulk, Walk and Set requests in v1, v2c or v3 (several OIDs at once,
  typed values for Set); monitored OIDs read periodically; **notification receiver** (default port
  1162; all communities accepted, SNMPv3 traps and informs with the manager user) with the list of received traps
  and informs.
- Points for the simulator and trends: simulated objects (writable), request count, notifications
  sent (writing sends the notification); monitored OIDs (writable: sends a SetRequest with the type of
  the last read), notifications received.
- Simulator faults: delay, no response, forced error (genErr, tooBig, noSuchName, badValue,
  noAccess, resourceUnavailable, authorizationError — on all requests, reads or writes), frozen
  values.

## Syslog module

- **Server**: receives Syslog messages over UDP and TCP (default port 1514; standard port 514 needs
  administrator rights on Linux) and TLS (port 6514, self-signed certificate `Syslog@Sulfur`). On
  TCP / TLS, each message is read with its own framing (RFC 6587): length prefix (octet counting) or
  end of line. Messages are parsed in RFC 5424 (timestamp, host, application, process, message ID,
  structured data) or RFC 3164 (BSD) format, free text otherwise; the last 2,000 are kept. Counts
  per severity, filter by minimum severity and text, details of each message (structured data, raw
  message), pause of the display.
- **Sender**: messages in RFC 5424 or RFC 3164 format over UDP, TCP (length prefix or end of line) or
  TLS; facility, severity, host name, application, process, message ID, structured data; text with
  `{n}` (message number) and `{time}`; burst of several messages per send, periodic sending, preview
  of the raw message, history.
- Points for the simulator and trends: message count, errors (severity ≤ 3), last severity and last
  message received, open connections; messages sent, and a `send message` point: writing a text
  sends a message with the sender settings.
- Simulator fault: connection cut (TCP / TLS connections closed and refused).

## DNS module

- **Server** authoritative for a test domain, over UDP and TCP (default port 1053, standard port 53
  with administrator rights on Linux):
  - zone records A, AAAA, CNAME, MX, TXT, SRV, PTR, NS, edited while the server is running; relative
    names attached to the domain, `@` for the domain, `*.name` wildcards; SOA record generated at the
    zone apex and reverse records (PTR) deduced from the A / AAAA records;
  - CNAME chains followed inside the zone, NXDOMAIN (with SOA) for an unknown name of the zone,
    empty answer for a name without a record of the requested type, truncation (TC) of UDP answers
    larger than the size accepted by the client (EDNS);
  - names outside the zone forwarded to upstream servers, or refused (REFUSED);
  - log of the received queries (client, name, type, response, answers) and counters; faults
    injected by the simulator (delay, no response, forced SERVFAIL / NXDOMAIN / REFUSED).
- **Client**: query of any type (ANY included) over UDP or TCP (automatic retry over TCP when the
  answer is truncated), recursion flag, PTR from an IP address; response code, flags, answer,
  authority and additional sections with their TTL, duration and history.

## DHCP module

Test DHCP server for an **isolated network, restricted to the private networks** (10.0.0.0/8,
172.16.0.0/12, 192.168.0.0/16), to commission devices on a bench.

- **Server** (RFC 2131, ports 67 / 68), with safeguards:
  - **stopped by default**, never started automatically (neither at launch nor by an imported
    configuration); every start shows a **warning** that must be confirmed (the main process refuses
    a start without this confirmation);
  - **interface chosen explicitly** (none by default, never 0.0.0.0): its subnet must be entirely
    private. The server sends from the address of this interface, so its broadcast replies only
    leave through it; on Linux and macOS, it also listens on 255.255.255.255 to receive the
    broadcasts of the clients without an address;
  - **pool checked** against the subnet of the interface (host addresses only, server address
    excluded, 256 addresses at most); gateway inside the subnet, announced DNS servers private;
  - option **only answer the listed MAC addresses**; requests forwarded by a relay (giaddr) are
    ignored;
  - **log** of every request, offer, assignment (ACK), refusal (NAK), release and conflict
    (DECLINE), also written to `<userData>/modules/dhcp/logs/server.log`; table of the leases
    (offered, assigned, declined) with their expiry.
- **Client**: on an interface with a private address, with the MAC address of the interface or
  another one (random button, locally administered address): DISCOVER (lists the offers of every
  server), full lease (DISCOVER, OFFER, REQUEST, ACK) and RELEASE. It never changes the
  configuration of the interface; offers outside the private networks are ignored.
- On Linux, ports 67 and 68 require administrator rights or the `CAP_NET_BIND_SERVICE` capability.
  Node.js cannot bind a socket to an interface: on Linux and macOS, the broadcasts of the other
  interfaces reach the server (and its log), but its replies only leave through the chosen interface;
  use the MAC filter on a PC connected to several networks.

## LDAP / RADIUS module

Four tabs: LDAP server and client, RADIUS server and client.

### LDAP

- **Server** LDAP v3, **LDAPS by default** (port 1636; plain LDAP on 1389; standard ports 389 /
  636 with administrator rights on Linux) on a read-only test directory, to check the centralized login of switches,
  firewalls, HMIs or applications:
  - directory written in **LDIF** (example directory with users and groups), edited while the
    server is running; `userPassword` in clear text or hashed ({SSHA}, {SHA}, {SSHA256}, {SSHA512});
    `memberOf` deduced from the groups (`member`, `uniqueMember`);
  - simple bind (DN and password) or anonymous (can be disabled), search with base / one level /
    subtree scopes and RFC 4515 filters (and, or, not, equality, substrings, ≥, ≤, presence), size
    limit, compare, rootDSE (naming contexts), “Who am I” extended operation; passwords are never
    returned and writes are refused (unwillingToPerform);
  - **LDAPS** or **StartTLS** with the self-signed certificate `LDAP@Sulfur`
    (`<userData>/modules/ldap/pki/own`);
  - event log (binds and their failure reason, searches with their filter) and counters; faults
    injected by the simulator (delay, no response, forced result code).
- **Client** (ldapts library): `ldap://` or `ldaps://` URL, StartTLS, bind DN and password
  (password not saved), authentication test with “Who am I”, search (base, scope, filter,
  attributes, limit) and history.
- The server implements the BER encoding and the LDAP protocol itself (the ldapjs library has been
  decommissioned).

### RADIUS

- **Server** RADIUS over UDP (RFC 2865, 2866), authentication on port 1812 and accounting on 1813
  (no administrator rights needed), to test the centralized login of switches, firewalls, Wi-Fi
  access points or HMIs:
  - **clients (NAS)** declared by address or CIDR network with their shared secret; requests from
    other addresses are ignored;
  - **PAP** and **CHAP** authentication of the **local accounts** (password in clear text, needed by
    CHAP) and of the **LDAP directory accounts** of the LDAP Server tab (running directory or the
    saved one, found by `uid` or another attribute, checked against `userPassword`; CHAP only with a
    clear-text `userPassword`); EAP is not supported;
  - **reply attributes** per account (and for the directory accounts), one `Name = value` per line:
    Service-Type, Session-Timeout, Filter-Id, Class, Framed-IP-Address, Reply-Message…,
    `Cisco-AVPair = shell:priv-lvl=15` or `Vendor-Specific = <vendor>:<type>:<value>`;
  - **Message-Authenticator** (RFC 3579) checked when present and added to every reply; it can be
    required in the Access-Requests (Blast-RADIUS protection);
  - **accounting**: Start / Interim-Update / Stop (authenticator checked), open sessions listed,
    Accounting-On / Off close the sessions of the device; **Status-Server** (RFC 5997) on both ports;
  - repeated requests get the same reply; clients, accounts and attributes edited while running; log
    (accept with the reply attributes, reject with its reason, ignored requests) and counters; faults
    injected by the simulator (delay, no response; a forced response is an Access-Reject).
- **Client**: server, ports, shared secret, timeout and retries, NAS-Identifier / NAS-IP-Address,
  PAP or CHAP Access-Request (password not saved) with additional attributes, Status-Server,
  accounting Start / Interim-Update / Stop of a session; replies checked (authenticator,
  Message-Authenticator), decoded attributes and history.
- The RADIUS protocol is implemented in the module (checked against the examples of RFC 2865).

## FTP / SFTP module

One module for the two file transfer protocols, in four tabs (FTP server and client, SFTP server
and client). Both servers serve the same folder by default (`<userData>/modules/ftp/files`) and can
run at the same time; the simulator faults apply to both. The module opens on the SFTP server tab.

### FTP / FTPS

- **Server** FTP (default port 2121) serving a folder, to test PLC backups, recipes and logs:
  - plain FTP, explicit FTPS (AUTH TLS, optionally required) or implicit FTPS, with the server
    self-signed certificate;
  - passive mode (port range and announced address configurable) and active mode, which only
    connects back to the client address; resume (REST), append, MLSD / MLST, SIZE, MDTM, ASCII
    and binary types;
  - users authenticated by password (only the scrypt hash is kept), read-only users, optional
    read-only anonymous login; clients confined to the served folder, symbolic links included;
  - log of logins and transfers, optional command log (passwords masked); counters; faults injected
    by the simulator (delay, no response, connection cut, forced reply on transfers).
- **Client** (basic-ftp library, passive mode): plain FTP or FTPS, optional certificate check,
  folder browsing, transfers, folder creation, rename and delete, and display of the command
  dialog. The password is not saved.

### SFTP

- **Server** SFTP (ssh2 library, default port 2222) serving a folder, to test firmware updates and
  configuration backups of devices:
  - SFTP subsystem only (no shell or command); clients confined to the served folder, symbolic
    links included;
  - users authenticated by password (only the scrypt hash is kept) and/or authorized public keys
    (OpenSSH format), read-only users; users edited while the server is running;
  - Ed25519 host key generated on the first start (`<userData>/modules/ftp/hostkey`), SHA256
    fingerprint displayed to check or pin it on the clients;
  - log of logins, transfers (path and size), folder creations, deletions and renames; counters;
    faults injected by the simulator (delay, connection cut).
- **Client**: password or private key (OpenSSH / PEM, passphrase), expected host key fingerprint
  (connection refused if it changed), folder browsing, download and upload with a file dialog,
  folder creation, rename and delete. Passwords and keys are not saved.

## TFTP module

- **Server** TFTP (default port 6969) serving a folder, to test firmware downloads and
  configuration backups of network devices:
  - octet and netascii modes, blksize, tsize and timeout options (RFC 2347 to 2349), block number
    rollover beyond 65535 blocks;
  - uploads allowed or not, existing files replaced or not; files written at once before the last
    acknowledgement; paths confined to the served folder;
  - timeout, retransmissions and maximum block size changed while running; log of transfers
    (size, rate, retransmissions); faults injected by the simulator (delay, no response, forced
    error).
- **Client**: download (GET) and upload (PUT) with a file dialog, block size and file size
  negotiation, progress, abort and history.

## Simulator module

Acts on the servers and clients of the other modules through the points they publish.

- **Fault injection**: response delay, no response, connection cut (open connections closed, new
  ones refused), forced Modbus exception or S7 return code (all requests, reads or writes), forced OPC UA status code
  (BadSensorFailure, BadCommunicationError…) and frozen values on chosen points. A fault is
  activated by hand or by a flow, until it is stopped or for a given duration; editing an active
  fault applies it immediately.
- **Flows** (as in Node-RED): nodes linked by wires pass messages (`msg.payload`) to each other,
  edited on a canvas (drag from the palette, link an output to an input, Delete removes the
  selection). **Deploy** sends all flows to the main process, where they run continuously; deployed
  flows are restarted at launch, and **Stop** / **Restart** pause them. A flow can be disabled.
  Nodes:
  - triggers: *Trigger* (by hand, at deployment and/or every n seconds), *Point change*;
  - points: *Read a point*, *Write a point* (`msg.payload` or a fixed value);
  - time and faults: *Wait*, *Ramp* (linear, from the current value or a given one), *Fault*
    (activate / stop a fault of the table, or from `msg.payload`); faults activated by flows are
    stopped at redeployment;
  - logic: *Switch* (one output per rule: =, ≠, <, ≤, >, ≥, between, true, false, otherwise),
    *Scale*, *Counter*, *Change filter* (with deadband);
  - *Function*: JavaScript run for each message in an isolated context (`vm`), limited to 1 s, with
    `msg`, `node`, `context`, `flow` and `global`; one or more outputs;
  - *Generator*: sine, ramp, random or toggle values, paused / restarted by a message;
  - *Debug*: messages shown in the Debug tab, with node warnings and errors.
  Each node shows its status under it (last value, pending messages, error). Linking a *Point change*
  of a module to a *Write a point* of another simulates a gateway between protocols.
- **Recording**: the changes of chosen points (servers or values monitored by the clients) are
  recorded as a new flow (writes and waits), which can be edited and replayed.
- Scenarios saved by an earlier version (or found in an imported configuration) are converted into
  flows: a manual trigger followed by one node per step, looped back for a looping scenario.

## Trends module

- Periodic sampling (50 ms minimum) of up to 8 points: server variables and points, values monitored
  by the OPC UA and Modbus clients (booleans as 0 / 1). The last 100,000 samples are kept.
- Real-time chart with a sliding window (1 min to 1 h, or the whole recording), drag to zoom,
  crosshair and tooltip listing every curve; one shared chart (one axis) or one chart per point
  for points on different scales. Colorblind-safe palette, light and dark variants.
- Table of the points with the value at the cursor (or the last one), min and max.
- **CSV export** (`;` separator, ISO timestamps, decimal point or comma), one column per point.

## Certificate authority module

Test PKI to equip a bench without OpenSSL: certificates for OPC UA, Modbus/TCP Security, MQTT,
HTTPS, Syslog TLS, or real devices.

- **Authorities**: self-signed root, or intermediate signed by a root (path length 0); ECDSA P-256 /
  P-384 or RSA 2048 to 4096 keys. Import of an existing authority (certificate + private key, PEM or
  DER, encrypted key with its password).
- **Issuance** with a new key, by profile: TLS server, TLS client, server and client, **OPC UA
  application** (application URI mandatory, key usages required by the OPC UA security policies)
  and **Modbus/TCP Security** (client role in extension `1.3.6.1.4.1.50316.802.1`, read by the
  Modbus server). Alternative names DNS, IP and URI (names of this PC added in one click); validity
  limited to that of the authority.
- **Signing of a request (CSR PKCS#10)** generated by a device: subject, key and alternative names of
  the request (completed by those entered); the private key stays on the device.
- **Revocation** with a reason and **revocation list** (CRL v2 with CRL number, valid 30 days,
  regenerated on each revocation or on demand).
- **Export**: certificate (PEM, DER), certificate and chain up to the root (PEM), private key (PEM
  PKCS#8), **PKCS#12** (.p12 / .pfx) protected by a password with the OpenSSL 3 parameters
  (PBES2 AES-256-CBC / PBKDF2-SHA256, HMAC-SHA256), CRL (PEM, DER). Details of every certificate
  (decoded fields, SHA-256 / SHA-1 thumbprints, PEM to copy).
- Storage: `<userData>/modules/ca/authorities/<id>` (private keys with 600 rights). Authorities are
  not part of the exported configuration.

## Network explorer module

Prepares the exploration of a test network, **restricted to the private networks** (RFC 1918):
10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16.

- **Targets**: addresses (`192.168.1.10`), CIDR networks (`192.168.1.0/24`, without the network and
  broadcast addresses), ranges (`10.0.0.10-50` or `10.0.0.10-10.0.0.50`) and host names, separated
  by commas, spaces or line breaks; 4,096 addresses at most. The main process checks every entry: an
  entry that leaves the private networks, even partly, is refused as a whole, as is a host name that
  resolves outside them (`localhost` included).
- The private networks of the PC are proposed (limited to their /24); the addresses covered by the
  entry are listed as it is typed.
- Searching for and identifying the devices at these addresses is planned for a later version (see
  the [roadmap](ROADMAP.md#later)).

## Serial terminal module

Talks to a device on an RS-232 or RS-485 link (USB adapter, built-in port), to test it or watch
what it sends.

- **Port**: detected ports listed (free entry accepted), baud rate, 5 to 8 data bits, parity (none,
  even, odd, mark, space), 1, 1.5 (Windows only) or 2 stop bits, hardware (RTS / CTS) or software
  (XON / XOFF) flow control. RS-485 requires an adapter that switches the transmit direction by
  itself, as most USB adapters do. A port already used by another application, or by the Modbus
  module, is refused.
- **Control lines**: DTR and RTS set at opening and switched while the port is open, CTS, DSR and DCD
  read every 250 ms, BREAK (TX line held low for 250 ms).
- **Sending**: text (UTF-8, with the `\r`, `\n`, `\t`, `\0`, `\e`, `\\` and `\xNN` sequences)
  followed by the chosen line ending, or bytes in hexadecimal (`01 03 00 00 00 0A`, `01030000000A` or
  `0x01, 0x03…`); preview of the bytes, history of the last 20 entries, periodic sending (10 ms
  minimum).
- **Log** of the exchanges (5,000 entries): received bytes grouped into frames after a silence
  (20 ms by default) and optionally at each line feed, sent frames with their origin (gateway client,
  data point); hexadecimal and / or text view (control characters shown as `\r`, `\xNN`…),
  millisecond timestamps, pause, export to a text file; byte and frame counters.
- **Serial ↔ TCP gateway**: raw TCP server (default port 4001, like ser2net or a device server in
  TCP server mode) relaying the serial port to its clients (one by default, up to 16): what they send
  is written to the port, what the port receives is sent to every client. The exchanges appear in
  the log; the gateway stops with the port.
- **Data points** for the simulator and the trends: port open, counters, last frame received (text
  and hexadecimal), control lines; writing `send text`, `send hex`, `DTR` or `RTS` sends data or
  switches a line from a flow.

## License

Sulfur is distributed under the [Apache License 2.0](LICENSE) — Copyright © 2026 Maxime MALLET. The
modules of this repository are the **standard** modules; **additional** modules, distributed as
separate packages, are planned, and anyone can build their own module with the SDK (see the
[roadmap](ROADMAP.md#standard-and-additional-modules)).

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Each contributor signs the
[Contributor License Agreement](CLA.md) once, on their first pull request.
