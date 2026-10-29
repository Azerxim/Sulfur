# LDAP / RADIUS module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/ldap.md)

Four tabs: LDAP server and client, RADIUS server and client.

## LDAP

- **Server** LDAP v3, **LDAPS by default** (port 1636; plain LDAP on 1389; standard ports 389 /
  636 with administrator rights on Linux) on a read-only test directory, to check the centralized login of switches,
  firewalls, HMIs or applications:
  - directory written in **LDIF** (example directory with users and groups), edited while the
    server is running; `userPassword` in clear text or hashed ({SSHA}, {SHA}, {SSHA256}, {SSHA512});
    `memberOf` deduced from the groups (`member`, `uniqueMember`);
  - simple bind (DN and password) or anonymous (can be disabled), search with base / one level /
    subtree scopes and RFC 4515 filters (and, or, not, equality, substrings, ≥, ≤, presence), size
    limit, compare, rootDSE (naming contexts), “Who am I” extended operation; passwords are never
    returned and writes are refused (unwillingToPerform);
  - **LDAPS** or **StartTLS** with the self-signed certificate `LDAP@Sulfur`
    (`<userData>/modules/ldap/pki/own`);
  - event log (binds and their failure reason, searches with their filter) and counters; faults
    injected by the simulator (delay, no response, forced result code).
- **Client** (ldapts library): `ldap://` or `ldaps://` URL, StartTLS, bind DN and password
  (password not saved), authentication test with “Who am I”, search (base, scope, filter,
  attributes, limit) and history.
- The server implements the BER encoding and the LDAP protocol itself (the ldapjs library has been
  decommissioned).

## RADIUS

- **Server** RADIUS over UDP (RFC 2865, 2866), authentication on port 1812 and accounting on 1813
  (no administrator rights needed), to test the centralized login of switches, firewalls, Wi-Fi
  access points or HMIs:
  - **clients (NAS)** declared by address or CIDR network with their shared secret; requests from
    other addresses are ignored;
  - **PAP** and **CHAP** authentication of the **local accounts** (password in clear text, needed by
    CHAP) and of the **LDAP directory accounts** of the LDAP Server tab (running directory or the
    saved one, found by `uid` or another attribute, checked against `userPassword`; CHAP only with a
    clear-text `userPassword`); EAP is not supported;
  - **reply attributes** per account (and for the directory accounts), one `Name = value` per line:
    Service-Type, Session-Timeout, Filter-Id, Class, Framed-IP-Address, Reply-Message…,
    `Cisco-AVPair = shell:priv-lvl=15` or `Vendor-Specific = <vendor>:<type>:<value>`;
  - **Message-Authenticator** (RFC 3579) checked when present and added to every reply; it can be
    required in the Access-Requests (Blast-RADIUS protection);
  - **accounting**: Start / Interim-Update / Stop (authenticator checked), open sessions listed,
    Accounting-On / Off close the sessions of the device; **Status-Server** (RFC 5997) on both ports;
  - repeated requests get the same reply; clients, accounts and attributes edited while running; log
    (accept with the reply attributes, reject with its reason, ignored requests) and counters; faults
    injected by the simulator (delay, no response; a forced response is an Access-Reject).
- **Client**: server, ports, shared secret, timeout and retries, NAS-Identifier / NAS-IP-Address,
  PAP or CHAP Access-Request (password not saved) with additional attributes, Status-Server,
  accounting Start / Interim-Update / Stop of a session; replies checked (authenticator,
  Message-Authenticator), decoded attributes and history.
- The RADIUS protocol is implemented in the module (checked against the examples of RFC 2865).
