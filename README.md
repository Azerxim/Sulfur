# Sulfur

[![CI](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml/badge.svg)](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml)

**English** · [Français](README.fr.md)

Modular simulator application — Electron + React (JavaScript) + TailwindCSS v4.
English (default) and French interface, dark (default) or light theme.
See the [roadmap](ROADMAP.md) for what comes next.

## Getting started

```bash
npm install
npm run dev        # development mode (HMR)
npm run build      # production build in out/
npm run dist       # installers (electron-builder) in dist/
npm test           # automated tests (Vitest)
npm run lint       # static analysis (ESLint)
npm run format     # formatting (Prettier)
```

## Tests

The `tests/` folder holds integration tests run against real servers and clients (sockets, TLS,
certificates) plus unit tests: OPC UA security, live editing, arrays and structures, methods, alarms and events, history and NodeSet2 import, Modbus TCP and Modbus/TCP Security, HTTP / REST (API, routes, authentication, HTTPS, webhooks), NTP (packets, simulated clock, client), Siemens S7 (addresses, codec, server and client, PDU splitting, faults), PLCSim Advanced (bridge protocol, manager), fault injection, node flows and trend recording on both protocols,
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

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request: `npm ci`, lint,
formatting check, tests and build, on Ubuntu with Node 24. Run the same checks locally before pushing:

```bash
npm run lint && npm run format:check && npm test && npm run build
```

## Packaging

```bash
npm run dist:linux   # AppImage → dist/Sulfur-<version>-x86_64.AppImage
npm run dist:win     # NSIS installer → dist/Sulfur-Setup-<version>.exe (on Windows)
```

- Configuration in `electron-builder.yml`. Application icon: `resources/icon.png` (1024 px, Linux and
  window icon) and `resources/icon.ico` (Windows). `resources/` is packaged with the application;
  `build/` is reserved for packaging-only resources.
- The Windows installer lets the user choose the installation folder and creates a desktop shortcut.
  Installers are not code-signed.
- The CI builds both installers on `main`, on `v*` tags and on manual runs (*Actions → CI → Run
  workflow*); they are downloadable as artifacts of the run. On a `v*` tag, a draft GitHub release is
  created with the installers attached:

```bash
npm version patch          # bumps package.json and creates the vX.Y.Z tag
git push --follow-tags
```

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
│   ├── points.js         # Data points shared between modules (contract)
│   └── locales/          # Common strings (en.js, fr.js)
└── modules/              # Simulation modules
    ├── opcua/
    │   ├── main/         # node-opcua server + client
    │   ├── renderer/     # Module React interface
    │   └── shared/       # Shared constants
    ├── modbus/
    │   ├── main/         # Protocol, server, client, PKI, security
    │   ├── renderer/     # Module React interface
    │   └── shared/       # Constants + value encoding (codec)
    ├── http/             # REST server (variables, routes, webhooks) + HTTP client
    ├── ntp/              # Time server with a simulated clock + NTP client
    ├── s7/               # Simulated S7 PLC (S7comm) + S7 client
    ├── plcsim/           # S7-PLCSIM Advanced virtual PLCs (Windows, PowerShell bridge to the API)
    ├── simulator/        # Fault injection and node flows (uses the points of the other modules)
    └── trends/           # Trends, data logging and CSV export (same)
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
   - `ctx.expose(api)` publishes the module's data points (list, read, write, injectable faults) for
     the simulator and the trends; `ctx.peers()` returns those of the other modules. The contract is
     described in `src/shared/points.js`.
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

## Modbus TCP module

- **Server**: the four tables (coils, discrete inputs, input registers, holding registers),
  functions 1 to 6, 15, 16, 23 (read / write multiple) and 43 / 14 (device identification). Typed
  simulated points (Boolean, UInt16/Int16, UInt32/Int32, Float32, Float64, word order ABCD / CDAB /
  BADC / DCBA), editable while the server is running. List of connected clients and security event
  log.
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
    invalid frames are closed;
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
- **Instances**: creation (CPU type), power on / off, RUN / STOP, memory reset, deletion, IP address
  of each interface. The program is downloaded from TIA Portal.
- **Variables**: tag table of the downloaded program (filter, arrays expanded), or addresses of the
  inputs, outputs and markers; **monitoring** of several instances, written from the list and
  published as points: a simulator flow can drive the inputs of the virtual PLC to simulate the
  process. Monitored variables are kept across restarts.
- Real-API test: `SULFUR_PLCSIM_LIVE=1 npm test` (creates, powers on and deletes a test instance).

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
