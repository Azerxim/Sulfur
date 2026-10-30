# CoAP / LwM2M module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/coap.md)

Protocols of constrained sensors and connected devices, alongside MQTT: CoAP (RFC 7252) over UDP and
LwM2M (OMA), which builds on CoAP to manage devices remotely. Four tabs.

- **Simulated CoAP server** (port 5683 by default):
  - resources simulated like the MQTT topics (number, integer, boolean or text; fixed or generated
    value), served as text or as JSON `{ "value": …, "timestamp": … }`;
  - read (GET), change (PUT) of the resources that allow it, 4.04, 4.05, 4.06 or 4.15 response
    otherwise;
  - observe (RFC 7641): confirmable notifications, at most every N ms per resource; an observer that
    rejects a notification (RST) or no longer acknowledges it is forgotten;
  - discovery through `/.well-known/core` (RFC 6690);
  - resources changed while the server runs; faults injected by the simulator (delay, no response,
    forced response code); request log.
- **CoAP client**: GET / POST / PUT / DELETE requests, confirmable (retransmitted until
  acknowledged) or not, with parameters (Uri-Query), content format and requested format (Accept);
  discovery of the resources of a server, observe with its notifications; history of the exchanges
  (code, format, response time, payload).
- **LwM2M server** (port 5690 by default, so that the CoAP server can run too; 5683 works when free):
  - registration interface: register (`POST /rd`), update, deregister, expiry of a registration that
    is not updated; objects announced by each device;
  - operations on a registered device: read (TLV, SenML JSON or text), write, execute, discover and
    observe; values decoded and named for the known objects (Device, Temperature, Light Control…).
- **Simulated LwM2M device**: registers with an LwM2M server (Sulfur's or another one), updates its
  registration before it expires and registers again when needed; Device (3), Temperature (3303,
  simulated temperature, minimum and maximum measured) and Light Control (3311) objects; read as
  text, TLV or SenML JSON, write, execute (reboot, minimum and maximum reset), observe.
- **Data points**: CoAP server resources (writable), requests received, registered devices,
  temperature and light of the simulated device.

Not supported yet: CoAP over DTLS (`coaps`), block-wise transfers (RFC 7959) and LwM2M bootstrap.
