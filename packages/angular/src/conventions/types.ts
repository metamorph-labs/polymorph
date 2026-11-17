/** An element type of a list a member renders, for the parameters of its loop's methods. */
export type Each<T> = T extends readonly (infer Item)[]
  ? Item
  : T extends Iterable<infer Item>
    ? Item
    : never

/** The value an output emits, for the parameter of a handler a member binds to another member's output. */
export type Emitted<O> = O extends { emit(value: infer T): void } ? T : never
