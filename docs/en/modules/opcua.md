# OPC UA module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/opcua.md)

- **Server**: simulated variables (sine, ramp, random, toggle, static) exposed under
  `Objects/<root folder>` with NodeIds `ns=1;s=<folder>.<variable>`. Default endpoint:
  `opc.tcp://localhost:4840/UA/Sulfur`. A String variable receives the generated value as text.
  - **Arrays** (fixed size, elements simulated with a phase shift) and **structured types**
    (ExtensionObject, `Name:Type` fields, `[]` for an array);
  - **methods** with input / output arguments: echo, read / write of the variables of the same name,
    or failure with a chosen status code;
  - acknowledgeable **limit alarms** (ExclusiveLimitAlarmType: HighHigh, High, Low, LowLow), and
    **events** raised on demand;
  - **history**: historized variables keep their last 10,000 values (HistoryRead);
  - **NodeSet2 XML import**: the types and nodes of the file are added to the address space; required
    companion models shipped with node-opcua (DI, Machinery…) are loaded automatically. Imported files
    are saved with the configuration.

  Variables, methods and alarms can be edited while the server is running; structured types and
  imported models are loaded at start.
- **Client**: connects to any OPC UA server, browses the address space, reads/writes (arrays and
  structures included, as JSON) and monitors values in real time (subscriptions), calls methods, reads
  history, receives events and alarms and acknowledges them.
- **Security** (server and client):
  - `None`, `Sign`, `SignAndEncrypt` modes and Basic256Sha256, Aes128-Sha256-RsaOaep,
    Aes256-Sha256-RsaPss policies (+ deprecated Basic256 / Basic128Rsa15);
  - anonymous and/or username / password authentication (users defined on the server);
    passwords are hashed (scrypt + salt) as soon as they are entered, only the digest is kept;
  - server certificate `OPCUA@Sulfur` (generated on first start);
  - separate server / client certificate stores, with approval of rejected certificates from the
    interface. Location: `<userData>/modules/opcua/pki/{server,client}`
    (Linux: `~/.config/sulfur/…`, Windows: `%APPDATA%\sulfur\…`);
  - on the client side, “Discover endpoints” lists the mode / policy pairs offered by the server.
