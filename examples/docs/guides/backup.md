---
title: Backups and restore
---

Everything Brewlog knows lives in one SQLite file. Back it up by copying
`~/.brewlog/journal.db` anywhere you like, or use the built-in helper:

```bash
brewlog backup --to /mnt/nas/brewlog/
brewlog restore /mnt/nas/brewlog/journal-2026-07-01.db
```

Restores are atomic: the incoming file is verified before it replaces the
live journal, and the previous journal is kept as `journal.db.bak`.
