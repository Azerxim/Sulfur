# DNS module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/dns.md)

- **Server** authoritative for a test domain, over UDP and TCP (default port 1053, standard port 53
  with administrator rights on Linux):
  - zone records A, AAAA, CNAME, MX, TXT, SRV, PTR, NS, edited while the server is running; relative
    names attached to the domain, `@` for the domain, `*.name` wildcards; SOA record generated at the
    zone apex and reverse records (PTR) deduced from the A / AAAA records;
  - CNAME chains followed inside the zone, NXDOMAIN (with SOA) for an unknown name of the zone,
    empty answer for a name without a record of the requested type, truncation (TC) of UDP answers
    larger than the size accepted by the client (EDNS);
  - names outside the zone forwarded to upstream servers, or refused (REFUSED);
  - log of the received queries (client, name, type, response, answers) and counters; faults
    injected by the simulator (delay, no response, forced SERVFAIL / NXDOMAIN / REFUSED).
- **Client**: query of any type (ANY included) over UDP or TCP (automatic retry over TCP when the
  answer is truncated), recursion flag, PTR from an IP address; response code, flags, answer,
  authority and additional sections with their TTL, duration and history.
