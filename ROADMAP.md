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

- [X] **Save configurations**: today, server and client settings are lost when the app closes. Save them
  per module and restore them on start.
- [X] **Import / export** configurations as JSON files, to share a test setup.
- [X] **Automated tests in the repository**: OPC UA, Modbus and translation tests with Vitest
  (`npm test`).
- [X] **Continuous integration** (GitHub Actions): build, tests and lint on every pull
  request, installers on every version tag.
- [X] **Lint and formatting**: ESLint + Prettier with a shared configuration.
- [X] **Packaging**: application icon, Windows (NSIS), Linux (AppImage, .deb)
  and macOS (DMG) installers produced by the CI.
- [X] **Updates**: new versions detected from the GitHub releases, downloaded and installed from the
  settings (Windows, AppImage, .deb; on macOS, link to the release). Automatic check can be turned off.

## Simulation features

Make the simulators more useful for testing real equipment and software.

- [X] **Fault injection**: response delays, dropped connections, forced exceptions (Modbus) or bad
  status codes (OPC UA), to test how clients behave when things go wrong.
- [X] **Scenarios**: chain value changes over time (scripted or recorded) and replay them (Simulator
  module, like fault injection).
- [X] **Node flows** in the manner of Node-RED: graphical editor, deployed flows running
  continuously (triggers, points, ramps, faults, logic, JavaScript function, generators, debug);
  they replace scenarios, which are converted automatically.
- [X] **Trends and data logging**: charts of monitored values, CSV export (Trends module).
- [X] **OPC UA**: arrays and structured types, methods, events and alarms, history read, address space
  import (NodeSet2 XML).
- [X] **Modbus**: register explorer on the server side, several Unit IDs on one server (gateway
  simulation), device identification (function 43 / 14), read/write multiple registers (function 23).

## Standard and premium editions

Sulfur is distributed under the [Apache License 2.0](LICENSE). The application and the **standard**
modules stay free and open source in this repository; **premium** modules, marked *(premium)* in
this roadmap, will be developed in a private repository and distributed separately under a
commercial license. Unmarked modules are standard.

| Edition                                | Modules                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Standard** (free, Apache-2.0)  | OPC UA, Modbus TCP, HTTP / REST, NTP, MQTT, SNMP, Syslog, TCP / UDP proxy, Siemens S7, PLCSim Advanced, Simulator, Trends |
| **Premium** (commercial license) | Siemens S7 Enhanced, Sparkplug B, EtherNet/IP (CIP), BACnet/IP, OPC UA PubSub, IEC 60870-5-104, DNP3, IEC 61850 |

Modules already published under Apache-2.0 stay standard. Structure to set up before the first
premium module:

- [X] **License**: Apache-2.0 for the application and the standard modules, contributors'
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

- [X] **MQTT**: broker and client, TLS, topic simulation
- [ ] **Sparkplug B** *(premium)*: on top of the MQTT module
- [X] **SNMP**: agent and manager, v1 / v2c / v3 (USM authentication and encryption), simulated MIB
  and traps
- [X] **Syslog**: server and sender, UDP / TCP / TLS
- [X] **HTTP / REST**: simulated server and client (JSON, webhooks, HTTPS, authentication)
- [X] **NTP**: simulated time server, including a deliberately shifted clock to test timestamping and
  certificate validity on equipment
- [ ] **TCP / UDP proxy**: relay placed between a real client and a real device (several forwards,
  local port → remote host:port), hexadecimal log of the exchanges with export, and fault injection
  on the traffic (latency, packet loss, disconnections, frame corruption) to test devices without
  modifying them

## New modules: industrial automation

- [X] **Siemens S7** (S7comm): simulated PLC (I / Q / M / DB memory, simulated points,
  identification, RUN / STOP) and client (rack / slot or TSAP, typed reads / writes, monitoring)
- [X] **Siemens PLCSim Advanced**: drive virtual S7-1500 PLCs (create and start instances, read /
  write tags, points published for the simulator and trends). Windows only: PLCSim Advanced must be
  installed and the user gives the path to its DLLs (Simulation Runtime API) in the module settings.
- [ ] **Siemens S7 Enhanced** *(premium)*: S7CommPlus protocol of the S7-1200 / S7-1500 (firmware
  V4 and later): symbolic access to optimized data blocks (no PUT / GET to enable), browsing of the
  PLC tags, secure communication (TLS) of recent firmware; extends the Siemens S7 module
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

## Known limitations

- Number fields use the operating system's decimal separator, whatever the interface language.
- The interface bundle is large (≈ 2.1 MB); it has not been optimized yet.
- The MQTT broker does not support shared subscriptions (`$share/…`) nor MQTT 5.0 enhanced
  authentication (AUTH packet).
