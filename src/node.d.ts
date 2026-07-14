/**
 * Minimal ambient declarations for the handful of Node.js built-ins this
 * project uses. Declaring them in-repo keeps `typescript` the only
 * devDependency (no `@types/node`); the surface below is intentionally
 * restricted to exactly what `src/` calls, so a typo against a real Node
 * API still fails to compile.
 */

declare module "node:fs" {
  export interface DirentLike {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function readdirSync(
    path: string,
    options: { withFileTypes: true }
  ): DirentLike[];
  export function existsSync(path: string): boolean;
  export function statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
  };
  export function mkdirSync(
    path: string,
    options?: { recursive?: boolean }
  ): void;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function dirname(p: string): string;
  export function basename(p: string, ext?: string): string;
  export function extname(p: string): string;
  export const sep: string;
}

declare var process: {
  argv: string[];
  cwd(): string;
  exitCode: number | undefined;
  exit(code?: number): never;
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
  env: Record<string, string | undefined>;
};

declare var console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
