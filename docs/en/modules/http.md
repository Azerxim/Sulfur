# HTTP / REST module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/http.md)

- **Server** HTTP or HTTPS (self-signed certificate `HTTP@Sulfur`, generated on first start), default
  port 8080:
  - **simulated variables** (number, integer, boolean, text, JSON; sine, ramp, random, toggle),
    editable while running, exposed by a built-in REST API: `GET <base>/variables`,
    `GET <base>/variables/<name>`, `PUT | PATCH | POST <base>/variables/<name>` (body
    `{ "value": … }` or the value alone) for writable variables;
  - **routes** checked in order: method, path with parameters (`/api/devices/:id`, `*` at the end),
    status, headers, delay and response body template (`{{var.<name>}}`, `{{params.<name>}}`,
    `{{query.<name>}}`, `{{headers.<name>}}`, `{{body.<field>}}`, `{{now}}`, `{{uuid}}`…); a route
    can assign a variable from the request (e.g. `body.value`);
  - **authentication**: Basic (users, passwords hashed with scrypt as soon as they are entered),
    Bearer token or API key in a header; CORS headers;
  - **webhooks**: outgoing JSON calls at each change of the chosen variables (with a minimum spacing)
    or periodically;
  - log of received requests and webhook calls, with their bodies.
- **Client**: requests with every method to a base address or a full URL (authentication, common
  headers, unverified certificates accepted on request), readable response (status, duration,
  headers, indented JSON) and history; **monitoring** of a JSON value (path such as `data.value`)
  polled periodically and published as a point; with a write method, the simulator can write it.
  Client passwords, tokens and keys are not saved.
- Simulator faults: response delay, no response, connection cut, forced HTTP status (on all requests
  or those concerning the chosen variables), frozen values.
