# Module SDK roadmap

**English** · [Français](ROADMAP.fr.md)

Planned changes to the module API (`@azerxim/sulfur-sdk`). The package version is the module API
version: new exports and optional fields come in a minor version, removing or changing an export
needs a new major version. The application side (module host, Settings, built-in modules) is in
the [Sulfur roadmap](https://github.com/Azerxim/Sulfur/blob/main/ROADMAP.md#standard-and-additional-modules).

## Module API 1.2

- [ ] **Module extensions**: a module adds a tab to the page of another module, so that an
  additional module can extend a standard one instead of having its own page (S7CommPlus tab of the
  Siemens S7 module from Siemens S7 Enhanced, PubSub tab of the OPC UA module…).
  - `RendererModule.extensions` (optional): `[{ target, tab: { id, label, icon, Component } }]`,
    `target` being the identifier of the extended module; `id` unique within the target page.
  - `useExtensions(target)` (`@azerxim/sulfur-sdk/ui`): tabs contributed to a module, read by that
    module to show them after its own tabs; empty when nothing extends it.
  - Props of a contributed tab: identifier of the target module and of the contributing module; the
    tab calls the IPC channels of its own module (`<own id>:<action>`), never those of the target.
  - Manifest: optional `extends: [<target id>]` field, shown before installation; a module whose
    target is missing or disabled still loads, its tabs are simply not shown.
  - TypeScript declarations and module guide updated; module template example.

## Module API 1.3

- [ ] **Licences and trial mode** of paid modules (see the
  [Sulfur roadmap](https://github.com/Azerxim/Sulfur/blob/main/ROADMAP.md#standard-and-additional-modules));
  a module without this field stays free, nothing changes for it.
  - Manifest: optional `license: { trialDays, purchaseUrl, publicKey }` field (trial period, 30 days
    by default; purchase page; publisher's Ed25519 public key), shown before installation.
  - `ctx.license` (main process) and `useLicense()` (`@azerxim/sulfur-sdk/ui`): status (`trial`,
    `licensed`, `expired`), trial days left, licence holder and end of maintenance, event on each
    change; the module decides what it restricts according to the status.
  - Licence file signature checked in the SDK, offline; `sulfur-license` command-line tool
    (`@azerxim/sulfur-sdk/license`) to generate the publisher's key pair and sign licences.
  - TypeScript declarations, module guide (paid modules section) and tests.
