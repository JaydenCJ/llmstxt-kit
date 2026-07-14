# API overview

The REST API listens on the same port as the web UI and speaks JSON. All
endpoints live under `/api/v1/` and require a token when authentication is
enabled. Responses use conventional status codes; errors carry a machine-
readable `code` and a human-readable `message`.

```bash
curl -s http://127.0.0.1:8347/api/v1/brews?last=3 \
  -H "Authorization: Bearer $BREWLOG_TOKEN"
```
