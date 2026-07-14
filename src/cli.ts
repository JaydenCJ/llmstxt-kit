#!/usr/bin/env node
/**
 * CLI entry point: `llmstxt generate | validate | diff`.
 *
 * Exit codes are stable and script-friendly:
 *   0  success / no lint errors / files identical
 *   1  lint errors (or warnings under --strict) / files differ
 *   2  usage, config or I/O error
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { boolFlag, parseArgs, stringFlag, type FlagSpec } from "./cliargs.js";
import { ConfigError, resolveConfig, type KitConfig, type UrlStyle } from "./config.js";
import { diffLlmsTxt, formatDiff } from "./diffing.js";
import { generate } from "./generate.js";
import { scanDocs } from "./scan.js";
import { validateLlmsTxt } from "./validate.js";
import { VERSION } from "./version.js";

const USAGE = `llmstxt-kit ${VERSION} — generate, lint and diff llms.txt files

Usage:
  llmstxt generate [docsDir] [options]   Build llms.txt (and llms-full.txt) from a Markdown tree
  llmstxt validate <file...> [options]   Lint llms.txt files against the spec
  llmstxt diff <old> <new> [options]     Structural diff of two llms.txt files
  llmstxt --help | --version

generate options:
  --config <path>       Config file (default: ./llmstxt.config.json when present)
  --name <text>         Site name for the H1
  --summary <text>      Blockquote summary
  --base-url <url>      URL prefix for every link
  --url-style <style>   md | clean | html (default: md)
  --out <path>          Where to write llms.txt (default: llms.txt)
  --full                Also write llms-full.txt with page bodies inlined
  --full-out <path>     Where to write llms-full.txt (default: llms-full.txt)
  --stdout              Print llms.txt to stdout instead of writing files
  --quiet               Suppress the summary lines

validate options:
  --strict              Treat warnings as failures (exit 1)
  --format <fmt>        text | json (default: text)
  --quiet               Only set the exit code; print nothing

diff options:
  --format <fmt>        text | json (default: text)

Exit codes: 0 ok, 1 findings/differences, 2 usage or I/O error.
`;

/** Run the CLI; returns the process exit code. */
export function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (command === undefined || command === "--help" || command === "help") {
    process.stdout.write(USAGE);
    return command === undefined ? 2 : 0;
  }
  if (command === "--version" || command === "version") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  try {
    switch (command) {
      case "generate":
        return runGenerate(rest);
      case "validate":
        return runValidate(rest);
      case "diff":
        return runDiff(rest);
      default:
        return usageError(`unknown command "${command}"`);
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`llmstxt: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
}

function usageError(message: string): number {
  process.stderr.write(`llmstxt: ${message}\nRun "llmstxt --help" for usage.\n`);
  return 2;
}

/** "1 link", "2 links" — every user-facing count goes through here. */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------- generate

const GENERATE_FLAGS: FlagSpec[] = [
  { name: "config", type: "string" },
  { name: "name", type: "string" },
  { name: "summary", type: "string" },
  { name: "base-url", type: "string" },
  { name: "url-style", type: "string" },
  { name: "out", type: "string" },
  { name: "full", type: "boolean" },
  { name: "full-out", type: "string" },
  { name: "stdout", type: "boolean" },
  { name: "quiet", type: "boolean" },
];

function runGenerate(argv: string[]): number {
  const args = parseArgs(argv, GENERATE_FLAGS);
  if (args.errors.length > 0) return usageError(args.errors.join("; "));
  if (args.positionals.length > 1) {
    return usageError(`generate takes at most one docsDir, got ${args.positionals.length}`);
  }
  const urlStyle = stringFlag(args, "url-style");
  if (urlStyle !== undefined && !["md", "clean", "html"].includes(urlStyle)) {
    return usageError(`--url-style must be md, clean or html, got "${urlStyle}"`);
  }
  if (boolFlag(args, "stdout") && boolFlag(args, "full")) {
    return usageError("--stdout and --full cannot be combined (llms-full.txt needs a file)");
  }

  const overrides: Partial<KitConfig> = {
    name: stringFlag(args, "name"),
    summary: stringFlag(args, "summary"),
    baseUrl: stringFlag(args, "base-url"),
    urlStyle: urlStyle as UrlStyle | undefined,
    docsDir: args.positionals[0],
  };
  const config = resolveConfig(process.cwd(), stringFlag(args, "config"), overrides);

  const docsRoot = resolve(process.cwd(), config.docsDir);
  if (!existsSync(docsRoot) || !statSync(docsRoot).isDirectory()) {
    process.stderr.write(`llmstxt: docs directory not found: ${docsRoot}\n`);
    return 2;
  }

  const pages = scanDocs(docsRoot, config);
  if (pages.length === 0) {
    process.stderr.write(`llmstxt: no Markdown pages found under ${docsRoot}\n`);
    return 2;
  }
  const result = generate(pages, config);

  if (boolFlag(args, "stdout")) {
    process.stdout.write(result.llmsTxt);
    return 0;
  }

  const outArg = stringFlag(args, "out") ?? "llms.txt";
  writeOut(resolve(process.cwd(), outArg), result.llmsTxt);
  const quiet = boolFlag(args, "quiet");
  if (!quiet) {
    process.stdout.write(
      `llms.txt: ${count(result.sectionCount, "section")}, ${count(result.linkCount, "link")} -> ${outArg}\n`
    );
  }
  if (boolFlag(args, "full")) {
    const fullArg = stringFlag(args, "full-out") ?? "llms-full.txt";
    writeOut(resolve(process.cwd(), fullArg), result.llmsFull);
    if (!quiet) {
      process.stdout.write(
        `llms-full.txt: ${count(result.pageCount, "page")}, ${count(result.fullWordCount, "word")} -> ${fullArg}\n`
      );
    }
  }
  return 0;
}

function writeOut(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

// ---------------------------------------------------------------- validate

const VALIDATE_SPEC: FlagSpec[] = [
  { name: "strict", type: "boolean" },
  { name: "format", type: "string" },
  { name: "quiet", type: "boolean" },
];

function runValidate(argv: string[]): number {
  const args = parseArgs(argv, VALIDATE_SPEC);
  if (args.errors.length > 0) return usageError(args.errors.join("; "));
  if (args.positionals.length === 0) return usageError("validate needs at least one file");
  const format = stringFlag(args, "format") ?? "text";
  if (format !== "text" && format !== "json") {
    return usageError(`--format must be text or json, got "${format}"`);
  }
  const strict = boolFlag(args, "strict");
  const quiet = boolFlag(args, "quiet");

  const reports: Array<{
    file: string;
    ok: boolean;
    errors: number;
    warnings: number;
    diagnostics: ReturnType<typeof validateLlmsTxt>["diagnostics"];
  }> = [];
  let worst = 0;

  for (const file of args.positionals) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) {
      process.stderr.write(`llmstxt: file not found: ${path}\n`);
      return 2;
    }
    const result = validateLlmsTxt(readFileSync(path, "utf8"));
    const failed = !result.ok || (strict && result.warningCount > 0);
    if (failed) worst = Math.max(worst, 1);
    reports.push({
      file,
      ok: !failed,
      errors: result.errorCount,
      warnings: result.warningCount,
      diagnostics: result.diagnostics,
    });
  }

  if (!quiet) {
    if (format === "json") {
      process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
    } else {
      for (const report of reports) {
        for (const d of report.diagnostics) {
          process.stdout.write(
            `${report.file}:${d.line} ${d.severity} ${d.rule} ${d.message}\n`
          );
        }
        const verdict = report.ok ? "OK" : "FAIL";
        process.stdout.write(
          `${report.file}: ${verdict} (${count(report.errors, "error")}, ${count(report.warnings, "warning")})\n`
        );
      }
    }
  }
  return worst;
}

// -------------------------------------------------------------------- diff

const DIFF_SPEC: FlagSpec[] = [{ name: "format", type: "string" }];

function runDiff(argv: string[]): number {
  const args = parseArgs(argv, DIFF_SPEC);
  if (args.errors.length > 0) return usageError(args.errors.join("; "));
  if (args.positionals.length !== 2) {
    return usageError(`diff needs exactly two files, got ${args.positionals.length}`);
  }
  const format = stringFlag(args, "format") ?? "text";
  if (format !== "text" && format !== "json") {
    return usageError(`--format must be text or json, got "${format}"`);
  }
  const texts: string[] = [];
  for (const file of args.positionals) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) {
      process.stderr.write(`llmstxt: file not found: ${path}\n`);
      return 2;
    }
    texts.push(readFileSync(path, "utf8"));
  }
  const diff = diffLlmsTxt(texts[0] as string, texts[1] as string);
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(diff, null, 2)}\n`);
  } else {
    process.stdout.write(formatDiff(diff));
  }
  return diff.identical ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
