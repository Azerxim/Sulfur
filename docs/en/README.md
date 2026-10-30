# Sulfur documentation

**English** · [Français](../fr/README.md) · [Back to the project](../../README.md)

## Guides

| Guide | Content |
| --- | --- |
| [Getting started](getting-started.md) | Installation, first launch, ports, where data is stored |
| [Architecture](architecture.md) | Source tree, processes, module host, IPC, module SDK, manifests |
| [Saved configurations](configuration.md) | Persistence of the settings, import / export of a test setup |
| [Managing modules](module-management.md) | Enabling and disabling modules, external module packages |
| [Languages and theme](i18n-and-theme.md) | Translations, adding a language, light and dark themes |
| [Development](development.md) | Tests, lint and formatting, CI, packaging, updates, releases |
| [Creating a module](module-guide.md) | Writing, building and sharing your own module with the SDK |
| [Distribution](distribution.md) | Signing the installers and publishing on the stores |

## Modules

**Industrial protocols**

| Module | Purpose |
| --- | --- |
| [OPC UA](modules/opcua.md) | Server with variables, structures, methods, alarms and history; full client |
| [Modbus](modules/modbus.md) | TCP, Modbus/TCP Security, RTU over TCP, RTU / ASCII on a serial link |
| [Siemens S7](modules/s7.md) | Simulated S7comm PLC and S7 client |
| [PLCSim Advanced](modules/plcsim.md) | Drives S7-PLCSIM Advanced virtual PLCs (Windows) |

**IT and network protocols**

| Module | Purpose |
| --- | --- |
| [HTTP / REST](modules/http.md) | REST server (variables, routes, webhooks) and HTTP client |
| [MQTT](modules/mqtt.md) | MQTT 3.1 to 5.0 broker with simulated topics, and client |
| [SNMP](modules/snmp.md) | v1 / v2c / v3 agent with simulated MIB and notifications, manager |
| [Syslog](modules/syslog.md) | UDP / TCP / TLS server and message sender |
| [NTP](modules/ntp.md) | Time server with a simulated clock, and client |
| [DNS](modules/dns.md) | Authoritative server for a test zone, and client |
| [DHCP](modules/dhcp.md) | Test DHCP server for an isolated private network, and client |
| [LDAP / RADIUS](modules/ldap.md) | Test directory (LDAP / LDAPS) and RADIUS server, with their clients |
| [FTP / SFTP](modules/ftp.md) | FTP / FTPS and SFTP servers on a confined folder, with their clients |
| [TFTP](modules/tftp.md) | TFTP server and client |
| [TCP / UDP proxy](modules/proxy.md) | Relay between a client and a device: log and faults on the traffic |

**Tools**

| Module | Purpose |
| --- | --- |
| [Simulator](modules/simulator.md) | Fault injection and Node-RED style flows across all the modules |
| [Trends](modules/trends.md) | Real-time charts and CSV export of any data point |
| [Certificate authority](modules/ca.md) | Test PKI: authorities, issuance, CSR signing, revocation, PKCS#12 |
| [Network explorer](modules/explorer.md) | Targets restricted to the private networks |
| [Serial terminal](modules/serial.md) | RS-232 / RS-485 terminal and serial ↔ TCP gateway |

## Elsewhere in the repository

- [Module SDK reference](../../packages/sdk/README.md) (`@azerxim/sulfur-sdk`)
- [Module template](../../examples/module-template/README.md) and
  [example external module](../../examples/test-signal/README.md)
- [Roadmap](../../ROADMAP.md) · [Contributing](../../CONTRIBUTING.md) · [License](../../LICENSE)
