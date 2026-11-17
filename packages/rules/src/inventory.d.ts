/**
 * Types for `inventory.js`. It is plain JS because node runs it directly. The
 * types here let `pnpm typecheck` cover every caller.
 */

export interface Exception {
  file: string
  line: number
  /**
   * 2 scope, 3 patch, 4 Bespoke or ThirdParty. `null` is an undeclared
   * deviation: a disable outside every zone, or a `<ThirdParty>` that writes
   * no `library` out.
   */
  rung: number | null
  kind: string
  reason: string
  /**
   * The package a `<ThirdParty>` boundary names, as its `library` writes it
   * out. Absent for every other kind, and for a boundary that writes none out.
   */
  library?: string
}

/** The `kind` of a `<ThirdParty>` that writes no `library` out. Its `rung` is `null`. */
export declare const NAMELESS_BOUNDARY: string

export declare const RUNGS: {
  scope: 2
  patch: 3
  bespoke: 4
  undeclared: null
}

/** Rung number -> the marker `scanSource` recognises for it. */
export declare const RUNG_MARKERS: Record<number, string>

export declare const DEFAULT_INCLUDE: string[]
export declare const DEFAULT_IGNORE: string[]

export declare function inventoryFiles(
  root: string,
  include?: string[],
  ignore?: string[],
): string[]
export declare function scanSource(file: string, source: string): Exception[]
export declare function scanMarkup(file: string, source: string): Exception[]
export declare function scanAngularTemplate(
  file: string,
  template: string,
  line?: number,
): Exception[]
export declare function scanAngularComponent(file: string, source: string): Exception[]
export declare function collectExceptions(
  root: string,
  include?: string[],
  ignore?: string[],
): Exception[]
export declare function formatTable(exceptions: Exception[]): string
export declare function hostedLibraries(exceptions: Exception[]): string[]
