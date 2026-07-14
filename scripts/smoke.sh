#!/usr/bin/env bash
# Smoke test for llmstxt-kit: exercises the real CLI end to end against the
# bundled example docs tree. No network, idempotent, runs from a clean
# checkout (after `npm install`). Prints "SMOKE OK" on success.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "SMOKE FAIL: $1" >&2
  exit 1
}

# 1. Build (idempotent).
npm run build >/dev/null 2>&1 || fail "npm run build failed"
CLI="node $ROOT/dist/cli.js"
echo "[smoke] build ok"

# 2. --version matches package.json; --help documents every subcommand.
PKG_VERSION="$(node -p "require('$ROOT/package.json').version")"
CLI_VERSION="$($CLI --version)"
[ "$CLI_VERSION" = "$PKG_VERSION" ] || fail "--version mismatch: $CLI_VERSION != $PKG_VERSION"
HELP="$($CLI --help)"
for word in generate validate diff; do
  echo "$HELP" | grep -q "$word" || fail "--help missing $word"
done
echo "[smoke] --help/--version ok ($CLI_VERSION)"

# 3. Error handling: unknown commands/files exit 2 (distinct from lint's 1).
set +e
$CLI frobnicate >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "unknown command should exit 2"; }
$CLI validate "$WORKDIR/nope.txt" >/dev/null 2>&1; [ $? -eq 2 ] || { set -e; fail "missing file should exit 2"; }
set -e
echo "[smoke] error handling ok (exit 2)"

# 4. Generate llms.txt + llms-full.txt from the example docs tree.
(
  cd examples
  $CLI generate --out "$WORKDIR/llms.txt" --full --full-out "$WORKDIR/llms-full.txt" >/dev/null
) || fail "generate failed"
grep -q '^# Brewlog$' "$WORKDIR/llms.txt" || fail "llms.txt missing H1"
grep -q '^> A self-hosted coffee-brewing journal' "$WORKDIR/llms.txt" || fail "llms.txt missing summary"
grep -q '^## Getting started$' "$WORKDIR/llms.txt" || fail "llms.txt missing pinned section"
grep -q '\[Installation\](https://example.test/docs/getting-started/installation.md)' "$WORKDIR/llms.txt" \
  || fail "llms.txt missing Installation link"
[ "$(grep '^## ' "$WORKDIR/llms.txt" | tail -n 1)" = "## Optional" ] || fail "Optional section is not last"
grep -q 'internal-notes' "$WORKDIR/llms.txt" && fail "draft page leaked into llms.txt" || true
grep -q '^Source: https://example.test/docs/guides/backup.md$' "$WORKDIR/llms-full.txt" \
  || fail "llms-full.txt missing Source line"
grep -q 'Restores are atomic' "$WORKDIR/llms-full.txt" || fail "llms-full.txt missing page body"
echo "[smoke] generate ok ($(grep -c '^- \[' "$WORKDIR/llms.txt") links)"

# 5. The generated file passes the bundled validator with zero findings.
OUT="$($CLI validate "$WORKDIR/llms.txt")" || fail "validate of generated file failed"
echo "$OUT" | grep -q 'OK (0 errors, 0 warnings)' || fail "validator reported findings on generated file: $OUT"
echo "[smoke] validate ok (generated file is clean)"

# 6. A broken file fails with the right rule codes and exit 1.
printf '# One\n\n# Two\n\n## S\n\n- broken item\n' > "$WORKDIR/bad.txt"
set +e
BAD_OUT="$($CLI validate "$WORKDIR/bad.txt")"; BAD_CODE=$?
set -e
[ "$BAD_CODE" -eq 1 ] || fail "broken file should exit 1, got $BAD_CODE"
echo "$BAD_OUT" | grep -q 'E102' || fail "expected E102 (extra H1)"
echo "$BAD_OUT" | grep -q 'E105' || fail "expected E105 (malformed item)"

# 7. --strict turns a warnings-only file into a failure.
printf '# T\n\n## S\n\n- [a](/a.md)\n' > "$WORKDIR/warn.txt"
$CLI validate "$WORKDIR/warn.txt" >/dev/null || fail "warnings alone should pass by default"
set +e
$CLI validate "$WORKDIR/warn.txt" --strict >/dev/null; STRICT_CODE=$?
set -e
[ "$STRICT_CODE" -eq 1 ] || fail "--strict should exit 1 on warnings, got $STRICT_CODE"
echo "[smoke] lint rules + --strict ok"

# 8. diff: identical -> 0, edited -> 1 with a change report, json mode works.
$CLI diff "$WORKDIR/llms.txt" "$WORKDIR/llms.txt" | grep -q 'identical' || fail "self-diff not identical"
sed 's/\[Installation\]/[Setup]/' "$WORKDIR/llms.txt" > "$WORKDIR/edited.txt"
set +e
DIFF_OUT="$($CLI diff "$WORKDIR/llms.txt" "$WORKDIR/edited.txt")"; DIFF_CODE=$?
set -e
[ "$DIFF_CODE" -eq 1 ] || fail "diff of edited file should exit 1, got $DIFF_CODE"
echo "$DIFF_OUT" | grep -q 'title changed' || fail "diff missing title change: $DIFF_OUT"
set +e
JSON_OUT="$($CLI diff "$WORKDIR/llms.txt" "$WORKDIR/edited.txt" --format json)"
set -e
echo "$JSON_OUT" | grep -q '"identical": false' || fail "diff --format json missing identical:false"
echo "[smoke] diff ok (exit 1 + change report)"

# 9. Idempotency: regenerating produces byte-identical output.
(
  cd examples
  $CLI generate --out "$WORKDIR/llms2.txt" >/dev/null
) || fail "regenerate failed"
cmp -s "$WORKDIR/llms.txt" "$WORKDIR/llms2.txt" || fail "regenerated llms.txt differs"
echo "[smoke] idempotency ok"

echo "SMOKE OK"
