# Signing the installers and publishing Sulfur on the stores

**English** · [Français](distribution.fr.md)

Today the CI produces **unsigned** installers (`CSC_IDENTITY_AUTO_DISCOVERY: 'false'` in
`.github/workflows/ci.yml`) and attaches them to a GitHub release. Consequences:

- Windows shows the SmartScreen warning "Windows protected your PC";
- macOS blocks the first launch (right-click → *Open*, or `xattr -cr`) and Squirrel.Mac refuses to
  install updates: `src/main/updater.js` only reports the new version.

This document describes how to **sign** the Windows and macOS packages, then how to publish Sulfur
on the **Microsoft Store**, the **Mac App Store**, **Flathub** (Flatpak) and the **Snap Store**.
Vendor rules change often: check the pages listed in [Sources](#sources) before committing.

## Overview

| Channel             | Account                          | Cost (Oct. 2026)             | Signature                                  | Updates                 |
| ------------------- | -------------------------------- | ---------------------------- | ------------------------------------------ | ----------------------- |
| Windows installer   | Azure or a certificate authority | ~$10/month (Artifact Signing) or OV / EV certificate | Authenticode (yours)               | electron-updater        |
| macOS DMG / zip     | Apple Developer Program          | $99/year                     | Developer ID + notarization                | electron-updater        |
| Microsoft Store     | Partner Center                   | free                         | MSIX signed by Microsoft                   | the Store               |
| Mac App Store       | Apple Developer Program (same)   | included                     | Apple Distribution + sandbox               | the Store               |
| Flathub             | GitHub account                   | free                         | Flathub repository (built from source)     | Flathub                 |
| Snap Store          | Ubuntu One account               | free                         | Snap Store                                 | snapd                   |

In all four stores, the store updates the application: the built-in updater must be disabled (see
[Updates per channel](#updates-per-channel)).

## 1. Signing the Windows installer

Since 2023, the private key of a code signing certificate must be kept in a hardware module (HSM,
USB token or cloud HSM): signing in CI with a plain `.pfx` file is no longer possible. Since
March 1, 2026, a code signing certificate (OV or EV) lasts **460 days at most**. Two options:

### Option A — Azure Artifact Signing (recommended)

Managed Microsoft service (formerly *Trusted Signing*): no certificate to buy and no HSM to manage,
certificates renewed automatically, signatures recognized by SmartScreen. Basic plan around
$10/month (5,000 signatures). Check eligibility (organization or individual developer, country) on
the service page.

1. In Azure: create an Artifact Signing account, validate the identity (name shown in the
   signature), create a *Public Trust* certificate profile.
2. Create an app registration (Entra ID) with a secret, and give it the
   *Trusted Signing Certificate Profile Signer* role on the account.
3. In `electron-builder.yml` (option still marked *beta* by electron-builder):

   ```yaml
   win:
     target: nsis
     icon: resources/icon.ico
     azureSignOptions:
       publisherName: Maxime MALLET # exactly the CN of the certificate
       endpoint: https://weu.codesigning.azure.net # region of the account
       codeSigningAccountName: sulfur-signing
       certificateProfileName: sulfur-public
   ```

4. GitHub secrets of the Windows job: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
   (read directly by the PowerShell signing module, not by electron-builder).

### Option B — OV or EV certificate from a certificate authority

Certificate bought from an authority (DigiCert, Sectigo, SSL.com, GlobalSign…), delivered on a USB
token or in their cloud HSM. In CI, use the authority's cloud signing service (e.g. SSL.com eSigner,
DigiCert KeyLocker) through `win.signtoolOptions` or a custom `win.signtoolOptions.sign` script.
Since 2024, an EV certificate no longer gives immediate SmartScreen reputation: it builds up with
downloads, whatever the certificate type.

### Verify

```powershell
signtool verify /pa /v dist\Sulfur-Setup-<version>.exe
Get-AuthenticodeSignature dist\Sulfur-Setup-<version>.exe
```

The executables inside must be signed too (electron-builder does it by default: `Sulfur.exe`,
uninstaller, native modules). `signtool verify` must show the timestamp (a timestamped signature
stays valid after the certificate expires).

## 2. Signing and notarizing macOS

An **Apple Developer Program** account is required ($99/year, for a person or an organization with
a D-U-N-S number).

1. In *Certificates, Identifiers & Profiles*: create a **Developer ID Application** certificate and
   export it as a `.p12` with its password.
2. For notarization, create an App Store Connect API key (*Users and Access → Integrations*,
   *Developer* role): `.p8` file, *Key ID* and *Issuer ID*.
3. `electron-builder.yml`:

   ```yaml
   mac:
     # … existing dmg and zip targets
     hardenedRuntime: true
     gatekeeperAssess: false
     entitlements: build/entitlements.mac.plist
     entitlementsInherit: build/entitlements.mac.plist
     notarize: true
   ```

   `build/entitlements.mac.plist`, entitlements Electron needs with the hardened runtime:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
     <dict>
       <key>com.apple.security.cs.allow-jit</key>
       <true/>
       <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
       <true/>
     </dict>
   </plist>
   ```

4. GitHub secrets of the macOS job, and remove `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` for that job:

   | Secret                        | Content                                         |
   | ----------------------------- | ----------------------------------------------- |
   | `CSC_LINK`                    | the `.p12`, base64-encoded                      |
   | `CSC_KEY_PASSWORD`            | its password                                    |
   | `APPLE_API_KEY`               | path of the `.p8` (written from a base64 secret) |
   | `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | API key identifiers                    |

### Verify

```sh
codesign --verify --deep --strict --verbose=2 /Applications/Sulfur.app
spctl --assess --type execute --verbose /Applications/Sulfur.app   # "source=Notarized Developer ID"
xcrun stapler validate dist/Sulfur-<version>-arm64.dmg
```

Once the application is signed, Squirrel.Mac accepts updates: in `updateSupport`
(`src/main/updater.js`), `canInstall` can become true on macOS (the zip and `latest-mac.yml` are
already produced).

## Updates per channel

In a store, the built-in updater must neither offer nor install versions: the store does it, and
Flathub and the Mac App Store refuse an application that updates itself. To add to `updateSupport`
before the first publication:

| Channel         | Detection in the main process             |
| --------------- | ----------------------------------------- |
| Microsoft Store | `process.windowsStore === true`           |
| Mac App Store   | `process.mas === true`                    |
| Snap            | `process.env.SNAP` set                    |
| Flatpak         | `process.env.FLATPAK_ID` set              |

In these cases: `supported: false` (*Updates* tab saying that the store handles updates, no
automatic check). Release notes can still be shown.

## 3. Microsoft Store

Registration is **free** for individual developers and, since May 2026, for companies
([storedeveloper.microsoft.com](https://storedeveloper.microsoft.com)).

Two ways to publish:

- **MSIX (recommended)**: package built by electron-builder (`appx` target), **signed by Microsoft**
  on publication (no certificate to buy), installation and updates handled by the Store.
- **Win32 installer**: submit the NSIS installer through a stable HTTPS URL; it must then be signed
  (section 1) and Sulfur keeps its own updater.

With MSIX:

1. In Partner Center, reserve the name *Sulfur*, then note in *Product identity*:
   `Package/Identity/Name`, `Package/Identity/Publisher` (`CN=…`) and `PublisherDisplayName`.
2. `electron-builder.yml`:

   ```yaml
   appx:
     identityName: 12345Topazdev.Sulfur # Package/Identity/Name
     publisher: CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX # Package/Identity/Publisher
     publisherDisplayName: Maxime MALLET
     applicationId: Sulfur
     backgroundColor: '#0b0f14'
     languages: [en-US, fr-FR]
   ```

   Build on Windows: `npx electron-builder --win appx --publish never`. Store visuals (tiles) go in
   `build/appx/` (`StoreLogo.png`, `Square150x150Logo.png`, `Square44x44Logo.png`,
   `Wide310x150Logo.png`).
3. Submit the `.appx` / `.msix` in Partner Center: EN / FR description, screenshots, age rating,
   privacy policy (URL required even without data collection), *Developer tools* category. Can be
   automated in CI with the [`msstore`](https://learn.microsoft.com/windows/apps/publish/msstore-dev-cli/overview) CLI.

Sulfur-specific points: an MSIX application runs in *full trust* (ports, serial port, PowerShell for
PLCSim Advanced work), but its installation folder is read-only and its writes to `%APPDATA%` are
virtualized (paths stay the Electron ones, no code change). Describe the external modules clearly in
the listing: the Store policy regulates dynamically loaded code, and the review decides.

## 4. Mac App Store

Apple Developer Program account (the same as for Developer ID). The application must run in Apple's
**sandbox**, which requires changes:

1. **Apple Distribution** (application) and **Mac Installer Distribution** (`.pkg` package)
   certificates, `fr.topazdev.sulfur` app identifier, *Mac App Store* provisioning profile listing
   the entitlements below.
2. `electron-builder.yml`:

   ```yaml
   mas:
     entitlements: build/entitlements.mas.plist
     entitlementsInherit: build/entitlements.mas.inherit.plist
     provisioningProfile: build/sulfur.provisionprofile
     hardenedRuntime: false
   ```

   `build/entitlements.mas.plist` (Sulfur entitlements; `inherit` only contains `app-sandbox` and
   `inherit`):

   ```xml
   <dict>
     <key>com.apple.security.app-sandbox</key><true/>
     <key>com.apple.security.application-groups</key>
     <array><string>TEAMID.fr.topazdev.sulfur</string></array>
     <key>com.apple.security.network.client</key><true/>
     <key>com.apple.security.network.server</key><true/>
     <key>com.apple.security.files.user-selected.read-write</key><true/>
     <key>com.apple.security.device.serial</key><true/>
   </dict>
   ```

3. Build with `npx electron-builder --mac mas` (and `mas-dev` to try locally with a development
   profile), then upload the `.pkg` with the **Transporter** app (or the Xcode command line tools),
   and submit the version in App Store Connect. Notarization is not needed: Apple takes care of it.

Sulfur-specific points:

- **External modules**: guideline 2.5.2 of the *App Review Guidelines* forbids downloading or
  executing code that adds features. In the Mac App Store build (`process.mas`), disable loading and
  installing external modules.
- **Files**: in the sandbox, the application only sees its container and the files chosen by the
  user. Served folders (FTP, TFTP, HTTP) and certificate stores must be chosen through a dialog, and
  remembered with *security-scoped bookmarks* to be found again on the next start.
- **Network**: `network.server` covers the simulated servers. Ports below 1024 (DHCP 67, Syslog 514,
  TFTP 69…) are allowed without administrator rights on recent macOS versions.
- **PLCSim Advanced** is Windows-only: no effect here.

## 5. Flathub (Flatpak)

Flathub builds the application **from source**, without network access during the build: the
AppImage or the .deb are not submitted.

1. **Identifier**: `fr.topazdev.sulfur`. To get the *verified* badge, you must control the
   `topazdev.fr` domain (`/.well-known/org.flathub.VerifiedApps.txt` file over HTTPS). Without the
   domain, the identifier would be `io.github.azerxim.Sulfur`.
2. **Files to add to the Sulfur repository** (Flathub wants them upstream):
   - `fr.topazdev.sulfur.metainfo.xml` (AppStream): name, summary, EN description, `Apache-2.0`
     license, screenshots (stable URLs), `<releases>` updated on every version, `Development`
     category; validated by `flatpak run --command=flatpak-builder-lint org.flatpak.Builder appstream …`;
   - `fr.topazdev.sulfur.desktop` and an SVG icon (or a 256 px PNG at least).
3. **Manifest** `fr.topazdev.sulfur.yml` (in the Flathub repository of the application):

   ```yaml
   id: fr.topazdev.sulfur
   runtime: org.freedesktop.Platform
   runtime-version: '25.08' # take the latest version available at submission time
   sdk: org.freedesktop.Sdk
   base: org.electronjs.Electron2.BaseApp
   base-version: '25.08'
   sdk-extensions: [org.freedesktop.Sdk.Extension.node24]
   command: run.sh
   separate-locales: false
   finish-args:
     - --share=ipc
     - --socket=x11 # or --socket=wayland with --ozone-platform-hint=auto
     - --device=dri
     - --share=network # simulated servers and clients
     - --device=all # serial ports (to justify to the reviewers)
   modules:
     - name: sulfur
       buildsystem: simple
       build-options:
         append-path: /usr/lib/sdk/node24/bin
         env: { XDG_CACHE_HOME: /run/build/sulfur/flatpak-node/cache, npm_config_offline: 'true' }
       build-commands:
         - npm ci --offline
         - npm run build
         - npx electron-builder --linux --dir --publish never
         - cp -a dist/linux-unpacked /app/main
         - install -Dm755 run.sh /app/bin/run.sh
         # + desktop, metainfo and icon in /app/share/…
       sources:
         - type: git
           url: https://github.com/Azerxim/Sulfur.git
           tag: v0.5.0
           commit: <sha of the tag>
         - generated-sources.json # npm dependencies, produced by flatpak-node-generator
         - type: script
           dest-filename: run.sh
           commands: ['exec zypak-wrapper /app/main/sulfur "$@"']
   ```

   `generated-sources.json` is produced by `flatpak-node-generator npm package-lock.json`
   ([flatpak-builder-tools](https://github.com/flatpak/flatpak-builder-tools)). Native modules
   (`serialport`) are rebuilt during the build; `electron` itself comes from the generated sources
   (`ELECTRON_CACHE` / `electron_config_cache` variables, see the tool documentation).
4. Try locally: `flatpak run org.flatpak.Builder --user --install --force-clean build fr.topazdev.sulfur.yml`.
5. **Submission**: fork [flathub/flathub](https://github.com/flathub/flathub), create a branch from
   `new-pr`, add the manifest and `generated-sources.json`, open the pull request. Once accepted,
   Flathub creates the `flathub/fr.topazdev.sulfur` repository; each version is a pull request on
   that repository (can be automated with `x-checker-data` and the Flathub bot).

Sulfur-specific points: as with the AppImage or the .deb, ports below 1024 (DHCP 67, Syslog 514,
TFTP 69) are only reachable if the distribution opens them to users
(`net.ipv4.ip_unprivileged_port_start`); in a Flatpak, however, Sulfur cannot be started with
elevated rights: servers must then use a high port. The built-in updater must be disabled (see
above). Flathub asks for minimal static permissions: `--device=all` and `--share=network` are
justified by the purpose of the application, to explain in the pull request.

## 6. Snap Store

1. Ubuntu One account on [snapcraft.io](https://snapcraft.io), then `snapcraft login` and
   `snapcraft register sulfur` (check that the name is available).
2. `electron-builder.yml`, `snap` target (`snap` key, default base of electron-builder; the
   `snapcraft` key with `base: core24` is still *beta* in electron-builder):

   ```yaml
   linux:
     target: [AppImage, deb, snap]
   snap:
     summary: Modular industrial protocol simulator
     grade: stable
     confinement: strict
     plugs:
       - default
       - network
       - network-bind
       - home
       - removable-media
       - raw-usb # USB-serial adapters (/dev/ttyUSB*, /dev/ttyACM*)
       - serial-port # manual connection or auto-connect request to the Snap Store
   ```

3. Publish: `snapcraft upload --release=edge dist/sulfur_<version>_amd64.snap`, try it
   (`snap install sulfur --edge`), then promote to `beta` or `stable` from the dashboard or with
   `snapcraft release`.
4. CI: `snapcraft export-login --snaps=sulfur --acls=package_upload,package_release - | base64 -w0`
   and store the result in the `SNAPCRAFT_STORE_CREDENTIALS` secret (electron-builder passes it to
   snapcraft).

Sulfur-specific points: in strict confinement, serial port access is not guaranteed on every
distribution (`serial-port` depends on snapd hotplug, `raw-usb` only covers USB); an auto-connect
request is made on the [Snapcraft forum](https://forum.snapcraft.io). As with Flatpak, ports below
1024 depend on the distribution and Sulfur cannot be started with elevated rights. Disable the
built-in updater (`process.env.SNAP`).

## 7. CI integration

Recommended order: sign first (Windows and macOS, without changing the distribution channels), then
add the stores one by one.

| Step                       | Job                     | Secrets                                                              |
| -------------------------- | ----------------------- | -------------------------------------------------------------------- |
| Windows signing            | `package` (Windows)     | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`          |
| macOS signing              | `package` (macOS)       | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |
| Microsoft Store            | new Windows job         | Partner Center credentials (`msstore` CLI)                           |
| Mac App Store              | new macOS job           | distribution certificates, profile, App Store Connect API key        |
| Snap Store                 | `package` (Linux)       | `SNAPCRAFT_STORE_CREDENTIALS`                                        |
| Flathub                    | outside the Sulfur CI   | — (pull request on `flathub/fr.topazdev.sulfur`)                     |

Signing secrets must only be available on `v*` tags (not on pull requests from forks).

## Release checklist

- [ ] `signtool verify /pa` on the installer and `Sulfur.exe`; installation without the "unknown
      publisher" warning.
- [ ] `spctl --assess` and `stapler validate` on the DMG; first launch without Gatekeeper block;
      automatic update from the previous version.
- [ ] Store builds: built-in updater disabled, consistent *Updates* tab.
- [ ] Mac App Store: external modules disabled, chosen folders found again after a restart.
- [ ] Flatpak and Snap: simulated servers started (high ports if needed), serial port reachable.
- [ ] Store listings: version, EN / FR release notes, screenshots up to date.

## Sources

- electron-builder: [Windows signing](https://www.electron.build/docs/features/code-signing/code-signing-win),
  [Mac App Store](https://www.electron.build/docs/mas), [Snap](https://www.electron.build/docs/snap/)
- [Azure Artifact Signing](https://azure.microsoft.com/products/artifact-signing) and
  [pricing](https://azure.microsoft.com/fr-fr/pricing/details/artifact-signing/)
- Code signing certificate validity (460 days): [GlobalSign](https://www.globalsign.com/en/blog/code-signing-validity-changes)
- Microsoft Store: [free registration (individuals)](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/),
  [free registration (companies)](https://blogs.windows.com/windowsdeveloper/2026/05/07/publish-to-microsoft-store-as-a-company-now-with-free-registration-and-faster-onboarding/)
- Flathub: [requirements](https://docs.flathub.org/docs/for-app-authors/requirements),
  [submission](https://docs.flathub.org/docs/for-app-authors/submission)
- Apple: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Snap and serial port: [Snapcraft forum](https://forum.snapcraft.io/t/need-help-with-access-to-usb-serial-ports-was-classic-confinement-request-zworkbench/11188)
