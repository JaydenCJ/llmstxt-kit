/**
 * Public API of llmstxt-kit. Everything the CLI does is reachable
 * programmatically: scan a docs tree, build and render llms.txt /
 * llms-full.txt, parse and validate existing files, and diff two files
 * structurally.
 */

export { VERSION } from "./version.js";
export {
  OPTIONAL_SECTION,
  type Diagnostic,
  type LinkEntry,
  type LlmsDoc,
  type Section,
  type Severity,
} from "./types.js";
export {
  CONFIG_FILE,
  ConfigError,
  DEFAULT_CONFIG,
  loadConfigFile,
  resolveConfig,
  type KitConfig,
  type UrlStyle,
} from "./config.js";
export {
  extractFrontmatter,
  firstHeading,
  firstParagraph,
  headings,
  humanize,
  inlineToPlain,
  truncate,
  type Frontmatter,
  type Heading,
} from "./markdown.js";
export {
  globToRegExp,
  listMarkdownFiles,
  matchAny,
  naturalCompare,
  scanDocs,
  type ScannedPage,
} from "./scan.js";
export {
  buildDoc,
  generate,
  pageUrl,
  renderLlmsFull,
  renderLlmsTxt,
  type GenerateResult,
} from "./generate.js";
export {
  parseLlmsTxt,
  type FlaggedLine,
  type ParsedDoc,
  type ParsedLink,
  type ParsedSection,
} from "./parse.js";
export { RULES, validateLlmsTxt, type ValidationResult } from "./validate.js";
export {
  diffLlmsTxt,
  formatDiff,
  type DocDiff,
  type LinkChange,
  type SectionDiff,
} from "./diffing.js";
