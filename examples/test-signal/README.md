# External test module: Test signal

[Français](README.fr.md)

Small but complete external module, to load into Sulfur to try the external modules: a signal
generator (sine, ramp, square) whose values are published as data points for the simulator and
the trends.

| Part         | What it exercises                                                                        |
| ------------ | ---------------------------------------------------------------------------------------- |
| main process | channels `test-signal:start` / `stop` / `status` / `setpoint` / `ping`, `tick` event, `busy()` |
| data points  | `test-signal/sine`, `ramp`, `square`, `running` (read) and `setpoint` (write)              |
| interface    | SDK components, saved configuration (`usePersistentState`), `lucide-react` icon           |
| translations | English and French (`registerMessages`, `moduleT`), common SDK texts (`ui.start`)         |
| styles       | Tailwind utilities on the Sulfur theme (light theme included) and own CSS                |

## Build

From the repository root (after `npm install`):

```sh
npm run example:build
```

The package is written to `examples/test-signal/dist/test-signal/` (`module.json`, `main.mjs`,
`renderer.mjs`, `style.css`), and its archive to `examples/test-signal/dist/test-signal-0.1.0.sulfur-module`.

## Load into Sulfur

1. Settings → Modules → *External modules*: **Install a package…**, choose
   `dist/test-signal-0.1.0.sulfur-module` and confirm the installation.
2. Check **Load the external modules**, then click **Refresh**.

During development, you can instead copy the `dist/test-signal` folder into the packages folder
(**Open** button): `module-packages/test-signal/module.json`, then click **Refresh** after each
rebuild (the new version is loaded without restarting Sulfur).

The module shows up in the *Tools* group, with the *External* badge in Settings → Modules.

Packages folder: `<user data>/module-packages`, that is `~/.config/sulfur` in development
(`npm run dev`), `~/.config/Sulfur` (Linux), `%APPDATA%\Sulfur` (Windows) or
`~/Library/Application Support/Sulfur` (macOS) for the installed application.

## Outside the repository

The example imports the SDK from its sources (`../../packages/sdk`). A module developed in its own
repository installs `@azerxim/sulfur-sdk` and imports `@azerxim/sulfur-sdk/build` (build.mjs) and
`@azerxim/sulfur-sdk/module.css` (style.css): see the [SDK README](../../packages/sdk/README.md#external-module).
