# Sulfur roadmap

**English** · [Français](ROADMAP.fr.md)

Planned direction for Sulfur, ordered by priority. Versions group work by theme; there are no fixed
dates. Items further down are less certain and may change.

## Initialization

- [X] Modular Electron + React + TailwindCSS shell: modules with a main part (IPC) and a renderer part
- [X] **OPC UA** module: simulated server (variables editable while running) and client (browse,
  read / write, subscriptions); security modes and policies, users with hashed passwords,
  certificate stores with approval
- [X] **Modbus TCP** module: server (four tables, typed simulated points) and client (decoding, polling);
  Modbus/TCP Security (mutual TLS, role-based authorization), IP allow list, rate limiting,
  read-only mode, security log
- [X] Information page (IP addresses, system), Settings page
- [X] English (default) and French, light and dark themes, collapsible sections

## Stabilization

Make what exists reliable before adding features.

- [x] **Save configurations**: today, server and client settings are lost when the app closes. Save them
  per module and restore them on start.
- [x] **Import / export** configurations as JSON files, to share a test setup.
- [X] **Automated tests in the repository**: OPC UA, Modbus and translation tests with Vitest
  (`npm test`).
- [x] **Continuous integration** (GitHub Actions): build, tests and lint on every push.
- [x] **Lint and formatting**: ESLint + Prettier with a shared configuration.
- [x] **Packaging**: application icon, Windows (NSIS) and Linux (AppImage) installers produced by the CI.

## Simulation features

Make the simulators more useful for testing real equipment and software.

- [x] **Fault injection**: response delays, dropped connections, forced exceptions (Modbus) or bad
  status codes (OPC UA), to test how clients behave when things go wrong.
- [x] **Scenarios**: chain value changes over time (scripted or recorded) and replay them (Simulator
  module, like fault injection).
- [x] **Node flows** in the manner of Node-RED: graphical editor, deployed flows running
  continuously (triggers, points, ramps, faults, logic, JavaScript function, generators, debug);
  they replace scenarios, which are converted automatically.
- [x] **Trends and data logging**: charts of monitored values, CSV export (Trends module).
- [x] **OPC UA**: arrays and structured types, methods, events and alarms, history read, address space
  import (NodeSet2 XML).
- [x] **Modbus**: register explorer on the server side, several Unit IDs on one server (gateway
  simulation), device identification (function 43 / 14), read/write multiple registers (function 23).

## Standard and premium editions

Sulfur is distributed under the [Apache License 2.0](LICENSE). The application and the **standard**
modules stay free and open source in this repository; **premium** modules, marked *(premium)* in
this roadmap, will be developed in a private repository and distributed separately under a
commercial license. Unmarked modules are standard.

| Edition | Modules |
| --- | --- |
| **Standard** (free, Apache-2.0) | OPC UA, Modbus TCP, HTTP / REST, NTP, Siemens S7, PLCSim Advanced, Simulator, Trends, then MQTT, SNMP, Syslog |
| **Premium** (commercial license) | Sparkplug B, EtherNet/IP (CIP), BACnet/IP, OPC UA PubSub, IEC 60870-5-104, DNP3, IEC 61850 |

Modules already published under Apache-2.0 stay standard. Structure to set up before the first
premium module:

- [x] **License**: Apache-2.0 for the application and the standard modules, contributors'
  [CLA](CLA.md) signed on the first pull request (so that contributions can also be used in the
  premium edition).
- [ ] **Module manifest**: id, version, edition (`standard` / `premium`), required module API
  version and minimum Sulfur version; an incompatible module is refused with a clear message.
- [ ] **Module SDK**: publish the module contract (`ctx.handle` / `emit` / `expose` / `peers`,
  `src/shared/points.js`, i18n helpers, shared UI components) as a versioned package, so that
  premium modules can be built outside this repository. The module API follows semantic
  versioning.
- [ ] **External modules**: `src/main/modules.js` and `src/renderer/src/modules.js` become a
  registry fed by the built-in modules and by the module packages installed in the user data
  folder. The interface of an external module is loaded dynamically (dedicated protocol) and shares
  React and the UI components through the SDK instead of bundling them again.
- [ ] **Module packages**: signed archives (Ed25519), signature checked before loading: only modules
  signed by the publisher are loaded, since a module runs with the rights of the main process.
  Installing, updating and removing modules from a *Modules* page in the Settings.
- [ ] **Licenses**: signed license file, verified offline with a public key embedded in the
  application (holder, expiry date, premium modules covered); *License* page in the Settings.
  Without a valid license, a premium module is listed but locked.
- [ ] **Configurations**: on import, the sections of a premium module that is not installed or not
  licensed are kept and reported (they are ignored today).
- [ ] **Premium repository**: private repository with its own CI (build against the SDK, tests,
  package signature), end user license agreement (EULA), release of the packages alongside the
  application installers.

## New modules: IT and supervision

Simpler protocols, quick to deliver, useful to supervise and integrate equipment.

- [ ] **MQTT**: broker and client, TLS, topic simulation
- [ ] **Sparkplug B** *(premium)*: on top of the MQTT module
- [ ] **SNMP**: agent and manager, v1 / v2c / v3 (USM authentication and encryption), simulated MIB
  and traps
- [ ] **Syslog**: server and sender, UDP / TCP / TLS
- [x] **HTTP / REST**: simulated server and client (JSON, webhooks, HTTPS, authentication)
- [x] **NTP**: simulated time server, including a deliberately shifted clock to test timestamping and
  certificate validity on equipment

## New modules: industrial automation

- [x] **Siemens S7** (S7comm): simulated PLC (I / Q / M / DB memory, simulated points,
  identification, RUN / STOP) and client (rack / slot or TSAP, typed reads / writes, monitoring)
- [x] **Siemens PLCSim Advanced**: drive virtual S7-1500 PLCs (create and start instances, read /
  write tags, points published for the simulator and trends). Windows only: PLCSim Advanced must be
  installed and the user gives the path to its DLLs (Simulation Runtime API) in the module settings.
- [ ] **EtherNet/IP (CIP)** *(premium)*: Rockwell / Allen-Bradley controllers
- [ ] **BACnet/IP** *(premium)*: building automation (HVAC, lighting)
- [ ] **OPC UA PubSub** *(premium)*: publish / subscribe mode of OPC UA, as an extension of the OPC UA module

## New modules: energy and transport

- [ ] **IEC 60870-5-104** and **DNP3** *(premium)*: telecontrol
- [ ] **IEC 61850** (MMS, GOOSE) *(premium)*: electrical substations; requires a native library (libiec61850)

Each new module follows the existing module contract (main / renderer / shared, its own translations);
premium modules use the module SDK and are distributed as signed packages.
The order within each version will be set according to needs.

## Later

- **Links between modules**: map a variable from one module to another (e.g. an OPC UA variable
  mirrored to a Modbus register) to simulate a gateway or a complete installation.
  Already possible with a simulator flow (*Point change* → *Write a point*); a direct link, without
  a flow, remains to be offered.
- **Security hardening**:
  - enable the renderer sandbox;
  - encrypt the saved configurations that contain secrets;
  - validate certificates against a certificate authority, with revocation lists, in addition to
    pinning;
  - OPC UA X.509 user tokens.
- **Interface**: several windows, keyboard shortcuts, accessibility review, more languages.
- **Updates**: automatic application updates.

## Known limitations

- Number fields use the operating system's decimal separator, whatever the interface language.
- On the very first launch after choosing the light theme in an older version, the window may open
  dark once.
- The interface bundle is large (≈ 1.9 MB); it has not been optimized yet.
