# Modbus module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/modbus.md)

- **Transports**: Modbus TCP (MBAP header), Modbus/TCP Security (TLS), **RTU over TCP** (RTU frames
  with CRC in a TCP connection, as sent by serial-to-Ethernet gateways in transparent mode), and
  **Modbus RTU** / **Modbus ASCII** on a serial link (RS-232 / RS-485 port, baud rate, data bits,
  parity, stop bits; detected ports listed). Serial ports use the `serialport` library.
  - On a serial link and in RTU over TCP, Unit IDs go from 1 to 247: the server ignores requests
    for another Unit ID, as on a shared bus, and applies broadcast writes (Unit ID 0) to every
    device without replying. The client sends one request at a time and waits for the 3.5
    character silence between frames; Unit ID 0 sends broadcast writes.
  - RTU frames are delimited by function code (and announced byte count), then by a silence for an
    unknown function; invalid frames (CRC, LRC, noise) are counted in the server log. A CRC error
    closes an RTU over TCP connection; on a serial link the reader resynchronizes.
- **Server**: the four tables (coils, discrete inputs, input registers, holding registers),
  functions 1 to 6, 15, 16, 23 (read / write multiple) and 43 / 14 (device identification). Typed
  simulated points (Boolean, UInt16/Int16, UInt32/Int32, Float32, Float64, word order ABCD / CDAB /
  BADC / DCBA), editable while the server is running. List of connected clients (or the open serial
  port) and security event log.
  - **Several devices** on one server (gateway simulation): each responds to its Unit ID with its
    own memory, points and identification; an unconfigured Unit ID gets exception 0B, or is served
    by the first device if the option is checked. Devices are added, edited or removed while the
    server is running.
  - **Identification** (function 43 / 14): objects 00 to 06 (vendor, product code, revision, URL,
    product, model, application) per device; basic, regular (stream access, responses split when
    needed) and individual reads; conformity level 0x82.
  - **Register explorer**: raw memory of a device by pages (UInt16, Int16, hexadecimal, binary,
    bits), refreshed continuously; addresses taken by a point are highlighted and every value can
    be edited.
- **Client**: read / write on every table with decoding (UInt16 → Float64, hexadecimal, binary),
  write then read in one request (function 23), device identification read and periodic
  monitoring.
- **Security**:
  - **Modbus/TCP Security** (TLS ≥ 1.2, standard port 802) with mutual authentication using pinned
    X.509 certificates (trusted / rejected stores, approval from the interface);
  - **role-based authorization**: role read from the client certificate (extension
    `1.3.6.1.4.1.50316.802.1`), read / write permissions per role, default role or refusal;
  - IP allow list (CIDR), maximum number of connections, requests-per-second limit (exception 06),
    read-only mode, write-protected points, Unit ID filtering (exception 11), connections sending
    invalid frames are closed (TCP transports);
  - server certificate `MODBUS@Sulfur`, client certificate regenerated with the selected role;
    location: `<userData>/modules/modbus/pki/{server,client}`.
- Default ports 5020 (TCP) / 8020 (TLS): the standard ports 502 / 802 require administrator rights
  on Linux.
