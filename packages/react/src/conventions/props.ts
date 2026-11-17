import type { ComponentPropsWithoutRef, ElementType } from 'react'

/**
 * The prop-typing conventions every governed component follows.
 *
 * A component's public props are closed: variant, tone, size, content slots and
 * behaviour. Style cannot be passed because the type has no field for it. The
 * lint rule (`polymorph/no-raw-styles`) is a second check, for JS callers and
 * for cases a type cannot see.
 */

/** Every prop a call site could use to set style directly. */
export type StyleEscapeHatch = 'className' | 'style' | 'css'

/** Strips the escape hatches from any prop bag. */
export type Governed<P> = Omit<P, StyleEscapeHatch>

/**
 * Native attributes a governed component may forward, without the escape
 * hatches and without the props the component defines itself.
 *
 * `Owned` lets a component that redefines a native prop (Button's `type`,
 * Input's `size`) declare it once in its own props instead of colliding with
 * the DOM type.
 */
export type NativeProps<E extends ElementType, Owned extends string = never> = Omit<
  ComponentPropsWithoutRef<E>,
  StyleEscapeHatch | Owned
>

/**
 * `true` when `P` has no escape hatch, otherwise a tuple naming the ones it has.
 * Use it only through `assertGoverned`, which explains why.
 */
export type GovernedCheck<P> = StyleEscapeHatch & keyof P extends never
  ? true
  : ['style escape hatch leaked into public props:', StyleEscapeHatch & keyof P]

/**
 * Compile-time assertion that a component's public props are closed. Every
 * component's test file calls it, so `pnpm typecheck` enforces closure. A leaked
 * `className` fails the build instead of waiting for review, and it fails before
 * the `no-raw-styles` lint rule sees any call site that uses it.
 *
 * ```ts
 * assertGoverned<ButtonProps>(true)
 * ```
 *
 * It is a function, not a bare type alias. A conditional type's constraint is
 * checked where the generic is declared, so `type Assert<P> = MustBeTrue<…>`
 * fails to compile on its own definition and cannot be used. Checking the
 * argument moves the check to the call site, where the error names the
 * offending key.
 */
export function assertGoverned<P>(closed: GovernedCheck<P>): void {
  void closed
}
