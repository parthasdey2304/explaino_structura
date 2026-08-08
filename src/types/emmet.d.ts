/**
 * Ambient module declaration for `emmet` (2.4.11).
 *
 * The package ships real types at `dist/index.d.ts`, but its `exports`
 * field has no `types` condition, so under `moduleResolution: "bundler"`
 * TypeScript can't resolve them and falls back to `any` with a
 * TS7016 error. This shim covers the small surface actually used by
 * src/lib/emmetExtension.ts (HTML abbreviation expansion) so the import
 * type-checks without needing to patch node_modules.
 */
declare module "emmet" {
  export interface ExtractedAbbreviation {
    abbreviation: string;
    location: number;
    start: number;
    end: number;
  }

  export interface ExtractOptions {
    lookAhead: boolean;
    type: "markup" | "stylesheet";
    prefix: string;
  }

  export function extract(
    line: string,
    pos?: number,
    options?: Partial<ExtractOptions>
  ): ExtractedAbbreviation | undefined;

  export interface UserConfig {
    type?: "markup" | "stylesheet";
    options?: Partial<{
      "output.field": (
        index: number,
        placeholder: string,
        offset: number,
        line: number,
        column: number
      ) => string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }

  export default function expandAbbreviation(
    abbr: string,
    config?: UserConfig
  ): string;
}
