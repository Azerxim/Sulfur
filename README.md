# Sulfur

[![CI](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Azerxim/Sulfur/actions/workflows/ci.yml?query=branch%3Amain)
[![Release](https://img.shields.io/github/v/release/Azerxim/Sulfur)](https://github.com/Azerxim/Sulfur/releases/latest)
[![SDK](https://img.shields.io/npm/v/@azerxim/sulfur-sdk?label=SDK)](https://www.npmjs.com/package/@azerxim/sulfur-sdk)

**English** · [Français](README.fr.md)

**Sulfur** is a modular desktop simulator for industrial and IT protocols. Each module provides a
simulated **server** and a **client**, to test devices, supervision software and integrations without
the real installation, and to reproduce faults on demand. Cross-cutting tools inject faults, chain
behaviours in Node-RED style flows and chart any value.

- Windows, Linux and macOS; interface in English and French, light or dark theme.
- Extensible: anyone can write their own module with the [module SDK](packages/sdk/README.md), without
  approval or signature.
- Built with Electron, React and TailwindCSS v4. License: [Apache-2.0](LICENSE).

## Modules

| Family | Modules |
| --- | --- |
| Industrial protocols | [OPC UA](docs/en/modules/opcua.md) · [Modbus](docs/en/modules/modbus.md) (TCP, TLS, RTU, ASCII) · [Siemens S7](docs/en/modules/s7.md) · [PLCSim Advanced](docs/en/modules/plcsim.md) |
| IT and network protocols | [HTTP / REST](docs/en/modules/http.md) · [MQTT](docs/en/modules/mqtt.md) · [SNMP](docs/en/modules/snmp.md) · [Syslog](docs/en/modules/syslog.md) · [NTP](docs/en/modules/ntp.md) · [DNS](docs/en/modules/dns.md) · [DHCP](docs/en/modules/dhcp.md) · [LDAP / RADIUS](docs/en/modules/ldap.md) · [FTP / SFTP](docs/en/modules/ftp.md) · [TFTP](docs/en/modules/tftp.md) |
| Tools | [Simulator](docs/en/modules/simulator.md) (faults and flows) · [Trends](docs/en/modules/trends.md) · [Certificate authority](docs/en/modules/ca.md) · [Network explorer](docs/en/modules/explorer.md) · [Serial terminal](docs/en/modules/serial.md) |

## Installation

Download the installer for your system from the
[latest release](https://github.com/Azerxim/Sulfur/releases/latest): `.exe` (Windows), `.AppImage` or
`.deb` (Linux), `.dmg` (macOS). The installers are not signed yet: see
[Getting started](docs/en/getting-started.md#install-a-release) for the first launch.

## Development

Requirements: **Node.js 24** and npm.

```bash
npm install
npm run dev        # start in development mode (hot reload)
npm test           # automated tests (Vitest)
npm run build      # production build in out/
```

Before pushing, run the same checks as the CI:

```bash
npm run lint && npm run format:check && npm test && npm run build
```

All commands, tests, CI, packaging and releases: [Development](docs/en/development.md).

## Documentation

The full documentation is in [docs/en/](docs/en/README.md):

- [Getting started](docs/en/getting-started.md): installation, first steps, default ports, where data is stored
- [Architecture](docs/en/architecture.md): processes, module host, IPC, data points, SDK, manifests
- [Saved configurations](docs/en/configuration.md): persistence of the settings, import / export
- [Managing modules](docs/en/module-management.md): enabling modules, installing external packages
- [Languages and theme](docs/en/i18n-and-theme.md): translations, adding a language, themes
- [Creating a module](docs/en/module-guide.md): write, build and share your own module
- [Distribution](docs/en/distribution.md): signing the installers and publishing on the stores

See the [roadmap](ROADMAP.md) for what comes next.

## Contributing and license

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Each contributor signs the
[Contributor License Agreement](CLA.md) once, on their first pull request.

Sulfur is distributed under the [Apache License 2.0](LICENSE) — Copyright © 2026 Maxime MALLET. The
modules of this repository are the **standard** modules; **additional** modules, distributed as separate
packages, are planned, and anyone can build their own module with the SDK (see the
[roadmap](ROADMAP.md#standard-and-additional-modules)).
