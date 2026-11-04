# TCP / UDP proxy module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/proxy.md)

Sits between a real client and a real device to watch their exchanges and disturb them, without
changing either of them: the client connects to the local port of the proxy instead of the device,
and the proxy relays all the traffic both ways.

- **Redirections**: as many as needed, each over TCP or UDP, from a local address and port to a
  remote host:port; started one by one or all together. Addresses can be changed while a
  redirection is stopped; a redirection to its own local port is refused.
  - **TCP**: one connection to the device per client connection; the client's data is held until
    the device accepts the connection. A device that refuses the connection is reported in the log.
  - **UDP**: one session per client address:port, with its own socket to the device, so that the
    replies go back to the right client; closed after 60 s without a datagram.
- **Faults on the traffic**, specific to each redirection and changed on the fly:
  - latency and jitter (random delay from 0 to the chosen value), without changing the order of
    the sends;
  - datagram loss (UDP only: over TCP, a loss would make the stream inconsistent);
  - corruption: one bit of a random byte is flipped in the chosen share of the sends;
  - direction: both, client → device or device → client;
  - blocked traffic: data is ignored; in both directions, new connections are refused too;
  - immediate cut of all the current connections (UDP sessions included).
- **Current connections**: client, connection time and bytes relayed each way.
- **Log** of the exchanges: relayed data in hexadecimal and text (first 1,024 bytes of each send),
  direction, connection, applied fault (blocked, lost, corrupted, delay), connections, cuts and
  errors; filtered by redirection, freezable, exported as text. Data capture can be turned off
  for heavy traffic: only events are recorded then.
- **Simulator**: counters published as data points (redirections started, connections, bytes each
  way, sends ignored and corrupted); faults injectable on all redirections: delay, no response
  (data ignored) and cut (connections cut and refused).
