# Importing existing data

Already keeping a brewing spreadsheet? Brewlog imports CSV with a one-line
command and maps columns interactively the first time:

```bash
brewlog import brews.csv
```

Column mappings are remembered in `~/.brewlog/import-maps/`, so repeated
imports from the same source are fully automatic. Dates, doses and ratios
are normalised on the way in; anything the importer cannot parse is written
to a `rejected.csv` next to the input so no row is silently dropped.
