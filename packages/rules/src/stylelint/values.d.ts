export interface RawValue {
  text: string
  reason: string
  index: number
}

export declare const STRUCTURAL_LITERALS: ReadonlySet<string>
export declare function isGovernedProperty(property: string): boolean
export declare function findRawValues(value: string, property: string): RawValue[]
