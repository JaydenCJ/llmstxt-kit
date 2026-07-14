/**
 * Tiny, dependency-free argument parser. Supports `--flag value`,
 * `--flag=value`, boolean flags and positionals; unknown flags and
 * missing values are collected as errors instead of throwing, so the CLI
 * can report every problem in one pass.
 */

export interface FlagSpec {
  name: string;
  type: "string" | "boolean";
}

export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positionals: string[];
  errors: string[];
}

/** Parse argv (already stripped of node + script) against a flag spec. */
export function parseArgs(argv: string[], specs: FlagSpec[]): ParsedArgs {
  const byName = new Map(specs.map((s) => [s.name, s]));
  const out: ParsedArgs = { flags: {}, positionals: [], errors: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith("--")) {
      out.positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const spec = byName.get(name);
    if (spec === undefined) {
      out.errors.push(`unknown flag --${name}`);
      continue;
    }
    if (spec.type === "boolean") {
      if (eq !== -1) {
        out.errors.push(`flag --${name} does not take a value`);
      } else {
        out.flags[name] = true;
      }
      continue;
    }
    if (eq !== -1) {
      out.flags[name] = arg.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out.errors.push(`flag --${name} requires a value`);
      continue;
    }
    out.flags[name] = next;
    i++;
  }
  return out;
}

/** Typed accessor: string flag or undefined. */
export function stringFlag(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags[name];
  return typeof v === "string" ? v : undefined;
}

/** Typed accessor: boolean flag, defaulting to false. */
export function boolFlag(args: ParsedArgs, name: string): boolean {
  return args.flags[name] === true;
}
