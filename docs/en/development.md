# Development

[Documentation](README.md) · **English** · [Français](../fr/development.md)

## Commands

Requirements: **Node.js 24** and npm.

| Command | Purpose |
| --- | --- |
| `npm install` | Install the dependencies |
| `npm run dev` | Start in development mode, with hot reload of the interface |
| `npm run build` | Production build in `out/` |
| `npm run preview` | Run the production build |
| `npm test` | Run the tests once (Vitest) |
| `npm run test:watch` | Run the tests again on every change |
| `npm run lint` | Static analysis (ESLint) |
| `npm run format` | Format every file (Prettier) |
| `npm run format:check` | Check the formatting without changing anything (CI) |
| `npm run example:build` | Build the example external module in `examples/test-signal/dist/` |
| `npm run dist:win` / `dist:linux` / `dist:mac` | Build the installers in `dist/` |

Before pushing, run the same checks as the CI:

```bash
npm run lint && npm run format:check && npm test && npm run build
```

## Tests

The `tests/` folder holds one file per module or topic. Most are **integration tests run against real
servers and clients**: sockets, TLS, certificates, serial frames. Each test uses a free port
(`freePort()`) and a temporary folder (`tempDir()`) from `tests/helpers.js`; the test files run one at a
time.

They cover, among others:

- every protocol module: OPC UA, Modbus (TCP, TLS, RTU, ASCII), HTTP, NTP, S7, PLCSim Advanced (bridge
  protocol), MQTT, SNMP, Syslog, DNS, DHCP, LDAP, RADIUS, FTP, SFTP, TFTP, serial terminal;
- the tools: fault injection, node flows, trend recording, certificate authority, network explorer;
- the application: saved configurations and import / export, module host and manifests, SDK exports,
  external module packages (`.sulfur-module` archives, installation, update, removal), the module
  template (built, packaged and run), updates and release notes;
- the translations: same keys and parameters in every language, every key used in the code exists.

The PLCSim Advanced test against the real Siemens API is skipped unless requested, on Windows with
PLCSIM Advanced installed:

```bash
SULFUR_PLCSIM_LIVE=1 npm test
```

## Lint and formatting

- **ESLint** (`eslint.config.mjs`): recommended JavaScript rules, Node or browser globals depending on
  the process, React hook rules (`rules-of-hooks`, `exhaustive-deps`) for the interface.
- **Prettier** (`.prettierrc.json`): no semicolons, single quotes, 120 columns. Formatting rules are
  left to Prettier (`eslint-config-prettier`). Markdown files are not formatted.
- VS Code: the recommended extensions (ESLint, Prettier) are listed in `.vscode/extensions.json`.

## Continuous integration

| Workflow | Trigger | Steps |
| --- | --- | --- |
| `ci.yml` | Push to `main`, pull requests, `v*` tags | `npm ci`, lint, formatting check, tests and build on Ubuntu with Node 24 |
| `ci.yml` (packaging) | `v*` tags only | Windows, Linux and macOS installers, attached to a draft GitHub release |
| `sdk.yml` | `sdk-v*` tags | Lint and tests, then publication of the SDK on npm and GitHub Packages |
| `cla.yml` | Pull requests | Signature of the [Contributor License Agreement](../../CLA.md) |

## Packaging

```bash
npm run dist:win     # NSIS installer → dist/Sulfur-Setup-<version>.exe (on Windows)
npm run dist:linux   # AppImage and .deb → dist/Sulfur-<version>-x86_64.AppImage, dist/Sulfur_<version>_amd64.deb
npm run dist:mac     # DMG → dist/Sulfur-<version>-x64.dmg and dist/Sulfur-<version>-arm64.dmg (on macOS)
```

- The configuration is in `electron-builder.yml`.
- Icons: `resources/icon.png` (1024 px; Linux, window icon, converted to `.icns` for macOS) and
  `resources/icon.ico` (Windows). `resources/` is packaged with the application; `build/` holds the
  packaging-only resources, such as `build/icons/` (Linux icon in every standard size).
- The Windows installer lets the user choose the installation folder and creates a desktop shortcut.
- Native modules are not rebuilt for Electron: `serialport` ships prebuilt N-API binaries, and the
  optional native modules of `ssh2` have a JavaScript fallback.
- The installers are **not code-signed**. Signing them and publishing on the Microsoft Store, Mac App
  Store, Flathub and Snap Store are described in [Distribution](distribution.md).

## Releasing a version

```bash
npm version patch          # bumps package.json and creates the vX.Y.Z tag
git push --follow-tags
```

The CI builds the three installers and attaches them, with the `latest*.yml` files used by the updates,
to a **draft** GitHub release. Review the release, then publish it.

## Updates

`src/main/updater.js` (electron-updater) checks the GitHub releases at start-up, then every 6 hours. The
check can be turned off in *Settings → Updates*. Draft releases are ignored: an update is offered once
its release is published.

| System | Behaviour |
| --- | --- |
| Windows, AppImage, .deb | The update is downloaded and installed |
| macOS | The new version is only reported, with a link to its release (unsigned application) |

## Releasing the SDK

The module SDK (`packages/sdk`) has its own version and workflow:

1. bump the version in `packages/sdk/package.json`;
2. push a tag `sdk-v<version>` with the same version (for example `sdk-v1.1.0`);
3. the `SDK` workflow runs lint and tests, publishes on GitHub Packages and stages the version on npm
   (`npm stage publish` with provenance; `NPM_TOKEN` secret, stage-only token);
4. a maintainer approves the npm version with 2FA:

```bash
npm stage list @azerxim/sulfur-sdk
npm stage approve <id>
```

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md): license and CLA, checks to run, strings in English and
French, tests to add.
