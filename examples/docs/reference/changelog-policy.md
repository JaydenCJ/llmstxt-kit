# Changelog policy

Brewlog follows Semantic Versioning. Patch releases never change the journal
schema; minor releases may add columns but always migrate forward
automatically; major releases can require an explicit `brewlog migrate` run.

Release notes list every schema change with the exact migration applied, so
self-hosters can audit what will happen before upgrading.
