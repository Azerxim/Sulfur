# Sulfur module template

**English** · [Français](README.fr.md)

Starting point for your own Sulfur module: a counter in the main process, published as a data point
for the simulator and the trends, with its interface, saved settings and translations (English,
French). Copy this folder, then follow the [module development guide](../../docs/module-guide.md).

```sh
export GITHUB_TOKEN=ghp_…   # token with the read:packages scope (the SDK is on GitHub Packages)
npm install
npm run build               # dist/my-module/ and dist/my-module-0.1.0.sulfur-module
```

Install the archive in Sulfur: Settings → Modules → *External modules* → **Install a package…**, then
check **Load the external modules** and click **Refresh**.

Before sharing your module, replace `my-module` with your own identifier (`src/manifest.js`,
`src/i18n.js`) and fill in `name`, `description` and `author`.
