# Saved configurations

[Documentation](README.md) · **English** · [Français](../fr/configuration.md)

## What is saved

The server and client settings of every module (port, security, variables and points, endpoint,
prepared request…) are saved as they are edited and restored at the next start. Servers are **not**
started automatically.

Each module has its own file, `<userData>/modules/<id>/config.json` (see
[Where data is stored](getting-started.md#where-data-is-stored)), organized in **sections**:

```json
{
  "server": { "port": 5020, "points": [ … ] },
  "client": { "host": "127.0.0.1", "port": 5020 }
}
```

The file is written synchronously and atomically (temporary file, then rename): a change is not lost if
the application closes right after, and the file is never half written.

Secrets are kept out of these files: client passwords, tokens and keys (OPC UA, HTTP, LDAP, RADIUS,
FTP / SFTP…) are not saved, and server-side user passwords are stored as scrypt hashes only.

## In a module

In the interface of a module, `usePersistentState` (SDK, `/ui`) replaces `useState`:

```jsx
const [server, setServer] = usePersistentState('modbus', 'server', DEFAULT_SERVER, {
  persist: ({ password, ...rest }) => rest // optional: what is actually saved
})
```

- the saved value is **completed with the defaults** (`withDefaults`): missing keys take their default
  value, objects are completed recursively, saved arrays replace the default ones. A setting added in a
  later version therefore keeps its default value;
- changes are saved 300 ms after the last edit, and immediately when the window closes;
- all configurations are loaded once before the first render: the panels open without waiting.

In the main process, `ctx.config()` reads the configuration and `ctx.setConfig(section, value)` replaces
a section, for state owned by the main process (for example the deployed flows of the simulator).

### Migrations

A module may export `migrateConfig(config)` in its main part. It converts a configuration written by an
earlier version, both when it is loaded and when it is imported. Example: the simulator converts the
scenarios of earlier versions into flows.

### Reset

If the interface of a module fails to display (inconsistent configuration, for example), its error page
offers a button that restores the default configuration (`<id>:config:reset`).

## Import / export

*Settings → General → Configurations* exports the configuration of every module to a single JSON file,
to share or archive a test setup:

```json
{
  "format": "sulfur-config",
  "version": 1,
  "appVersion": "0.4.0",
  "exportedAt": "2026-10-29T10:00:00.000Z",
  "modules": {
    "opcua": { "server": { … } },
    "modbus": { "client": { … } }
  }
}
```

Importing a file:

- replaces the configuration of the modules present in the file, after their `migrateConfig`;
- **keeps the sections of modules that are not loaded** (external module not installed or not loaded,
  module of another version of Sulfur) in their `config.json`, and lists them: the module finds
  them once it is installed and loaded, and the next export includes them again;
- ignores and lists unusable sections (invalid or reserved identifier, content that is not an object);
- is **refused while a server is running or a client is connected**: a module reports this with
  `busy()` in its main part.

A file with another `format`, invalid JSON or a more recent `version` is refused with an explicit
message.

## Application preferences

Preferences that are not tied to a module are kept by the main process in `<userData>/preferences.json`:
language, theme, disabled modules, loading of the external modules and automatic updates. They are not
part of the exported configuration.
