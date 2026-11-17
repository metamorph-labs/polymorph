export interface TokenRead {
  /** The property named, e.g. `--pm-accent-bg`. */
  name: string
  /** `var` or `style`, the two ways a stylesheet reads a property. */
  how: string
  /** Where the name starts inside the string it was found in. */
  index: number
}

export declare const PM_PREFIX: string
export declare function customPropertiesIn(css: string): string[]
export declare function blankComments(css: string): string
export declare function readsIn(text: string): TokenRead[]
export declare function distance(a: string, b: string): number
export declare function nearest(name: string, known: Iterable<string>): string[]
export declare function suggestion(name: string, known: Iterable<string>): string
