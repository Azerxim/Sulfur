# NTP module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/ntp.md)

- **Server** (UDP, default port 1123; standard port 123 needs administrator rights on Linux):
  responds to NTP v1 to v4 client requests with a **simulated clock**: offset from real time (time
  jumps of ±1 min to ±1 year in one click) or fixed start time, drift in ppm; announced stratum
  (1 to 16), leap indicator, reference identifier and precision. Everything applies live. Useful to
  test the timestamps of devices and the validity of their certificates. List of recent clients and
  log.
- **Client**: single or periodic query of a server; clock offset, round-trip delay, stratum, leap
  indicator, reference, precision, root delay and dispersion; history. A response whose Origin field
  does not match the request is ignored.
- Points for the simulator and trends: server time, offset (writable: a flow can cause time jumps),
  drift, stratum and leap indicator (writable), request count; offset, delay and stratum measured by
  the client.
- Simulator faults: delay (simulated network latency, included in the round-trip delay), no
  response, Kiss-o'-Death (DENY, RSTR, RATE), frozen clock.
