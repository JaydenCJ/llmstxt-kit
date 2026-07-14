---
description: Error envelope, status codes and every error code the API returns.
---

# Errors

Every non-2xx response carries the same envelope:

```json
{ "code": "brew_not_found", "message": "no brew with id 42" }
```

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_payload` | Body failed schema validation |
| 401 | `missing_token` | Auth enabled, no bearer token |
| 404 | `brew_not_found` | Unknown brew id |
| 409 | `duplicate_import` | Same CSV row imported twice |
