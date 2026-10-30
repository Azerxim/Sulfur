# MQTT module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/mqtt.md)

- **Broker** (MQTT 3.1, 3.1.1 and 5.0, default port 1883; TLS on 8883 with a self-signed certificate
  `MQTT@Sulfur` generated on first start): persistent sessions and session expiry, QoS 0 / 1 / 2,
  retained messages, last will (with delay in 5.0), topic aliases, 5.0 subscription options (no local,
  retain as published, retain handling, subscription identifiers) and message properties forwarded to
  5.0 clients; shared subscriptions and enhanced authentication are not supported. **simulated topics** published by the broker itself
  (number, integer, boolean or text value; sine, ramp, random or toggle generator), periodically or
  at each change, as a value alone or JSON `{"value": …, "timestamp": …}`, with chosen QoS and
  retain flag. A settable topic accepts a new value published on `<topic>/set`. Optional
  authentication (users with hashed passwords; anonymous connections can be refused). List of the
  connected clients and their subscriptions, topic explorer (last content of each topic), message
  log with a topic filter (`+` and `#` wildcards) and connection events.
- **Client** (mqtt.js, MQTT 3.1, 3.1.1 or 5.0, TCP or TLS): client ID, user, clean session, keep
  alive, automatic reconnection, last will message; subscriptions with QoS and an optional JSON field
  (`value`, `data.temp`…) whose last value is shown; publication (topic, content, QoS, retain); log
  of the received messages.
- Points for the simulator and trends: simulated topics (writable: publishes the new value), number
  of clients and messages of the broker; last value of each client subscription (a subscription
  without wildcard is writable: the value is published on its topic).
- Simulator faults: delay (incoming publications), no response (CONNECT left unanswered, messages
  no longer delivered), connection cut (clients disconnected and refused), frozen values.
