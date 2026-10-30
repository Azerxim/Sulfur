# Managing modules

[Documentation](README.md) · **English** · [Français](../fr/module-management.md)

Modules are managed in *Settings → Modules*. Sulfur has two kinds of modules:

- **built-in** modules (`standard` edition), shipped with the application and documented in
  [modules/](README.md#modules);
- **external** modules, written by anyone with the [module SDK](../../packages/sdk/README.md) and installed
  from a package file. To write one, follow [Creating a module](module-guide.md).

## Enabling and disabling modules

*Settings → Modules → Enabled modules* lists every module with its version and a checkbox.

A disabled module:

- is hidden from the sidebar, the home page and the start-up page choices;
- is stopped at once: its IPC channels and its data points (simulator, trends) are removed;
- is no longer loaded at the next start;
- keeps its saved configuration, which is still exported and imported.

Disabling a module whose server is running or whose client is connected is refused: stop it first. A
re-enabled module is loaded immediately. The list is kept in `<userData>/preferences.json`
(`disabledModules`).

## Refused modules

Before loading a module, the main process checks its [manifest](architecture.md#manifest). A module is
refused when its manifest is invalid, its identifier is reserved (`modules`, `config`, `home`, `info`,
`settings`) or already used, its module API is incompatible, its `minAppVersion` is more recent than
Sulfur, or its activation fails. A refused module does not exist for the application (no channels,
configuration or page); it is listed with the reason in *Settings → Modules*.

## External module packages

An external module is shared as a **package**: a single `<id>-<version>.sulfur-module` file, a ZIP
archive of `module.json` and the built files, produced by `packModule` of the SDK.

### Installing

1. *Settings → Modules → External modules → Install a package…*
2. Sulfur reads and checks the package (descriptor, files, compatibility, identifier not used by a
   built-in module), then shows the module, its version, its author and the version already installed.
   Nothing is written before you confirm.
3. The package is extracted to `<userData>/module-packages/<id>`, in place of the previous version.
4. Check **Load the external modules** (off by default), then **Refresh**.

The same list removes an installed package. When the external modules are loaded, Sulfur refreshes
them right after an installation or a removal. Both are refused while a server of an external module is
running or one of its clients is connected.

### Security

Packages are **not signed**: anyone can create and install their own module, without any approval. Since
a module runs with the rights of Sulfur (files, network), take into account that:

- loading the external modules is **disabled by default**;
- the installation confirmation reminds that the origin of the package cannot be checked: only install
  packages from a source you trust;
- reading an archive is limited: relative paths only, 2,000 files, 200 MB once extracted, CRC checked.
