# DHCP module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/dhcp.md)

Test DHCP server for an **isolated network, restricted to the private networks** (10.0.0.0/8,
172.16.0.0/12, 192.168.0.0/16), to commission devices on a bench.

- **Server** (RFC 2131, ports 67 / 68), with safeguards:
  - **stopped by default**, never started automatically (neither at launch nor by an imported
    configuration); every start shows a **warning** that must be confirmed (the main process refuses
    a start without this confirmation);
  - **interface chosen explicitly** (none by default, never 0.0.0.0): its subnet must be entirely
    private. The server sends from the address of this interface, so its broadcast replies only
    leave through it; on Linux and macOS, it also listens on 255.255.255.255 to receive the
    broadcasts of the clients without an address;
  - **pool checked** against the subnet of the interface (host addresses only, server address
    excluded, 256 addresses at most); gateway inside the subnet, announced DNS servers private;
  - option **only answer the listed MAC addresses**; requests forwarded by a relay (giaddr) are
    ignored;
  - **log** of every request, offer, assignment (ACK), refusal (NAK), release and conflict
    (DECLINE), also written to `<userData>/modules/dhcp/logs/server.log`; table of the leases
    (offered, assigned, declined) with their expiry.
- **Client**: on an interface with a private address, with the MAC address of the interface or
  another one (random button, locally administered address): DISCOVER (lists the offers of every
  server), full lease (DISCOVER, OFFER, REQUEST, ACK) and RELEASE. It never changes the
  configuration of the interface; offers outside the private networks are ignored.
- On Linux, ports 67 and 68 require administrator rights or the `CAP_NET_BIND_SERVICE` capability.
  Node.js cannot bind a socket to an interface: on Linux and macOS, the broadcasts of the other
  interfaces reach the server (and its log), but its replies only leave through the chosen interface;
  use the MAC filter on a PC connected to several networks.
