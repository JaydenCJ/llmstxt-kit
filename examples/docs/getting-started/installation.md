---
order: 1
---

# Installation

Brewlog ships as a single binary with no external services. Download the
release for your platform, place it on your `PATH`, and you are done.

```bash
curl -O https://example.test/releases/brewlog-latest.tar.gz
tar xzf brewlog-latest.tar.gz
./brewlog serve
```

The server binds `127.0.0.1:8347` by default and stores its journal in
`~/.brewlog/journal.db`. Nothing ever leaves your machine.

## Requirements

- Linux, macOS or Windows (x86-64 or arm64)
- 30 MB of disk space
