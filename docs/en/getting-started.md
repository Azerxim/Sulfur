# Getting started

[Documentation](README.md) · **English** · [Français](../fr/getting-started.md)

## Install a release

Installers are attached to the [GitHub releases](https://github.com/Azerxim/Sulfur/releases/latest):

| System | File |
| --- | --- |
| Windows | `Sulfur-Setup-<version>.exe` (NSIS installer, choice of folder, desktop shortcut) |
| Linux | `Sulfur-<version>-x86_64.AppImage` or `Sulfur_<version>_amd64.deb` |
| macOS | `Sulfur-<version>-x64.dmg` (Intel) or `Sulfur-<version>-arm64.dmg` (Apple silicon) |

The installers are not code-signed yet:

- Windows shows the SmartScreen warning: *More info → Run anyway*;
- macOS blocks the first launch: right-click the application → *Open*, or run
  `xattr -cr /Applications/Sulfur.app`.

Sulfur then checks for new versions by itself (see [Updates](development.md#updates)).

## Run from the sources

Requirements: **Node.js 24** and npm.

```bash
git clone https://github.com/Azerxim/Sulfur.git
cd Sulfur
npm install
npm run dev
```

`npm run dev` starts the application with hot reload of the interface. See [Development](development.md)
for the other commands.

## First steps

The sidebar lists the modules, followed by three pages:

- **Home**: presentation of Sulfur, getting-started steps and the modules grouped by kind;
- **Information**: host name, system, versions, and the addresses of every network interface (useful
  to point a remote client at Sulfur);
- **Settings**: three tabs.
  - *General*: language, theme, page shown at start-up, import / export of the configurations;
  - *Modules*: enabled modules, external module packages (see [Managing modules](module-management.md));
  - *Updates*: automatic check for new versions.

A typical session:

1. open a protocol module (for example **Modbus**), set up the server and start it;
2. connect to it from the client tab of the same module, or from an external client, on `localhost`
   and the displayed port;
3. use the **Simulator** to inject faults or run flows, and **Trends** to chart the values.

Settings are saved as they are edited and restored at the next launch, but **servers are never started
automatically**.

## Default ports

Default ports are above 1024 so that no administrator rights are needed on Linux. Every port can be
changed in its module.

| Module | Default port | Standard port |
| --- | --- | --- |
| OPC UA | 4840 | 4840 |
| Modbus | 5020 (TCP), 8020 (TLS) | 502, 802 |
| Siemens S7 | 1102 | 102 |
| PLCSim Advanced (remote PC) | 50000 | 50000 |
| HTTP / REST | 8080 | 80, 443 |
| MQTT | 1883, 8883 (TLS) | 1883, 8883 |
| SNMP | 1161 (agent), 1162 (notifications) | 161, 162 |
| Syslog | 1514 (UDP / TCP), 6514 (TLS) | 514, 6514 |
| NTP | 1123 (UDP) | 123 |
| DNS | 1053 (UDP / TCP) | 53 |
| DHCP | 67 / 68 (UDP) | 67 / 68 |
| LDAP | 1636 (LDAPS), 1389 (LDAP) | 636, 389 |
| RADIUS | 1812 (authentication), 1813 (accounting) | 1812, 1813 |
| FTP / SFTP | 2121 (FTP), 2222 (SFTP) | 21, 22 |
| TFTP | 6969 (UDP) | 69 |
| Serial ↔ TCP gateway | 4001 | — |

On Linux, ports below 1024 need administrator rights or the `CAP_NET_BIND_SERVICE` capability. On
Windows, port 102 is often taken by the Siemens services (TIA Portal, PLCSIM).

## Where data is stored

Sulfur keeps its data in the user data folder:

| System | Folder |
| --- | --- |
| Windows | `%APPDATA%\sulfur\` |
| Linux | `~/.config/sulfur/` |
| macOS | `~/Library/Application Support/sulfur/` |

| Path | Content |
| --- | --- |
| `preferences.json` | Language, theme, disabled modules, loading of the external modules, automatic updates |
| `modules/<id>/config.json` | Saved settings of a module (see [Saved configurations](configuration.md)) |
| `modules/<id>/pki/` | Certificate stores of the modules that use TLS (OPC UA, Modbus, LDAP…) |
| `modules/ca/authorities/` | Authorities of the certificate authority module |
| `module-packages/<id>/` | Installed external modules |

Deleting the folder of a module resets it; its certificates are generated again at the next start.
