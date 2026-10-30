# Syslog module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/syslog.md)

- **Server**: receives Syslog messages over UDP and TCP (default port 1514; standard port 514 needs
  administrator rights on Linux) and TLS (port 6514, self-signed certificate `Syslog@Sulfur`). On
  TCP / TLS, each message is read with its own framing (RFC 6587): length prefix (octet counting) or
  end of line. Messages are parsed in RFC 5424 (timestamp, host, application, process, message ID,
  structured data) or RFC 3164 (BSD) format, free text otherwise; the last 2,000 are kept. Counts
  per severity, filter by minimum severity and text, details of each message (structured data, raw
  message), pause of the display.
- **Sender**: messages in RFC 5424 or RFC 3164 format over UDP, TCP (length prefix or end of line) or
  TLS; facility, severity, host name, application, process, message ID, structured data; text with
  `{n}` (message number) and `{time}`; burst of several messages per send, periodic sending, preview
  of the raw message, history.
- Points for the simulator and trends: message count, errors (severity ≤ 3), last severity and last
  message received, open connections; messages sent, and a `send message` point: writing a text
  sends a message with the sender settings.
- Simulator fault: connection cut (TCP / TLS connections closed and refused).
