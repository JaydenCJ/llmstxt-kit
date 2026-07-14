# Authentication

Authentication is off by default because Brewlog binds loopback. Enable it
when exposing the server on a LAN:

```bash
brewlog serve --auth
brewlog token create --name kitchen-tablet
```

Tokens are random 32-byte values, stored hashed. Pass them in the
`Authorization: Bearer` header. Revoking a token (`brewlog token revoke`)
takes effect immediately; there is no session state to expire.
