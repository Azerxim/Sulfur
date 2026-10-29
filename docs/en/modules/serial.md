# Serial terminal module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/serial.md)

Talks to a device on an RS-232 or RS-485 link (USB adapter, built-in port), to test it or watch
what it sends.

- **Port**: detected ports listed (free entry accepted), baud rate, 5 to 8 data bits, parity (none,
  even, odd, mark, space), 1, 1.5 (Windows only) or 2 stop bits, hardware (RTS / CTS) or software
  (XON / XOFF) flow control. RS-485 requires an adapter that switches the transmit direction by
  itself, as most USB adapters do. A port already used by another application, or by the Modbus
  module, is refused.
- **Control lines**: DTR and RTS set at opening and switched while the port is open, CTS, DSR and DCD
  read every 250 ms, BREAK (TX line held low for 250 ms).
- **Sending**: text (UTF-8, with the `\r`, `\n`, `\t`, `\0`, `\e`, `\\` and `\xNN` sequences)
  followed by the chosen line ending, or bytes in hexadecimal (`01 03 00 00 00 0A`, `01030000000A` or
  `0x01, 0x03…`); preview of the bytes, history of the last 20 entries, periodic sending (10 ms
  minimum).
- **Log** of the exchanges (5,000 entries): received bytes grouped into frames after a silence
  (20 ms by default) and optionally at each line feed, sent frames with their origin (gateway client,
  data point); hexadecimal and / or text view (control characters shown as `\r`, `\xNN`…),
  millisecond timestamps, pause, export to a text file; byte and frame counters.
- **Serial ↔ TCP gateway**: raw TCP server (default port 4001, like ser2net or a device server in
  TCP server mode) relaying the serial port to its clients (one by default, up to 16): what they send
  is written to the port, what the port receives is sent to every client. The exchanges appear in
  the log; the gateway stops with the port.
- **Data points** for the simulator and the trends: port open, counters, last frame received (text
  and hexadecimal), control lines; writing `send text`, `send hex`, `DTR` or `RTS` sends data or
  switches a line from a flow.
