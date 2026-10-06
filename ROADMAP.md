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
- [ ] **Packaging**: application icon, Windows (NSIS) and Linux (AppImage) installers produced by the CI.

## Simulation features

Make the simulators more useful for testing real equipment and software.

- [ ] **Fault injection**: response delays, dropped connections, forced exceptions (Modbus) or bad
  status codes (OPC UA), to test how clients behave when things go wrong.
- [ ] **Scenarios**: chain value changes over time (scripted or recorded) and replay them.
- [ ] **Trends and data logging**: charts of monitored values, CSV export.
- [ ] **OPC UA**: arrays and structured types, methods, events and alarms, history read, address space
  import (NodeSet2 XML).
- [ ] **Modbus**: register explorer on the server side, several Unit IDs on one server (gateway
  simulation), device identification (function 43 / 14), read/write multiple registers (function 23).

## New modules: IT and supervision

Simpler protocols, quick to deliver, useful to supervise and integrate equipment.

- [ ] **MQTT**: broker and client, TLS, topic simulation; **Sparkplug B** on top of MQTT
- [ ] **SNMP**: agent and manager, v1 / v2c / v3 (USM authentication and encryption), simulated MIB
  and traps
- [ ] **Syslog**: server and sender, UDP / TCP / TLS
- [ ] **HTTP / REST**: simulated server and client (JSON, webhooks, HTTPS, authentication)
- [ ] **NTP**: simulated time server, including a deliberately shifted clock to test timestamping and
  certificate validity on equipment

## New modules: industrial automation

- [ ] **Siemens S7** (S7comm)
- [ ] **EtherNet/IP (CIP)**: Rockwell / Allen-Bradley controllers
- [ ] **BACnet/IP**: building automation (HVAC, lighting)
- [ ] **OPC UA PubSub**: publish / subscribe mode of OPC UA, as an extension of the OPC UA module

## New modules: energy and transport

- [ ] **IEC 60870-5-104** and **DNP3**: telecontrol
- [ ] **IEC 61850** (MMS, GOOSE): electrical substations; requires a native library (libiec61850)

Each new module follows the existing module contract (main / renderer / shared, its own translations).
The order within each version will be set according to needs.

## Later

- **Links between modules**: map a variable from one module to another (e.g. an OPC UA variable
  mirrored to a Modbus register) to simulate a gateway or a complete installation.
- **Security hardening**:
  - enable the renderer sandbox;
  - encrypt the saved configurations that contain secrets;
  - validate certificates against a certificate authority, with revocation lists, in addition to
    pinning;
  - OPC UA X.509 user tokens.
- **Interface**: several windows, keyboard shortcuts, accessibility review, more languages.
- **Updates**: automatic application updates.

## Known limitations

- Applying a numeric simulation (sine, ramp…) to an OPC UA `String` variable fails.
- Number fields use the operating system's decimal separator, whatever the interface language.
- On the very first launch after choosing the light theme in an older version, the window may open
  dark once.
- The interface bundle is large (≈ 830 kB); it has not been optimized yet.
