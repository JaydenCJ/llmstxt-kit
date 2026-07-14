---
order: 2
description: Log your first brew in under two minutes.
---

# Quickstart

With the server running, open `http://127.0.0.1:8347` and press **New brew**.
Pick a method (pour-over, espresso, immersion), enter the dose and grind
setting, and start the built-in timer.

When the cup is done, rate it and add tasting notes. Brewlog charts every
variable over time, so after a few brews you can see exactly which grind
setting produced your best cup.

```bash
# the same flow, from the terminal
brewlog add --method pour-over --dose 15g --water 250g --grind 18
brewlog list --last 5
```
