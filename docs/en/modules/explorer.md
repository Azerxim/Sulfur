# Network explorer module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/explorer.md)

Prepares the exploration of a test network, **restricted to the private networks** (RFC 1918):
10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16.

- **Targets**: addresses (`192.168.1.10`), CIDR networks (`192.168.1.0/24`, without the network and
  broadcast addresses), ranges (`10.0.0.10-50` or `10.0.0.10-10.0.0.50`) and host names, separated
  by commas, spaces or line breaks; 4,096 addresses at most. The main process checks every entry: an
  entry that leaves the private networks, even partly, is refused as a whole, as is a host name that
  resolves outside them (`localhost` included).
- The private networks of the PC are proposed (limited to their /24); the addresses covered by the
  entry are listed as it is typed.
- Searching for and identifying the devices at these addresses is planned for a later version (see
  the [roadmap](../../../ROADMAP.md#later)).
