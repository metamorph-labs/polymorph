import { DestroyRef, inject, signal, type Signal } from '@angular/core'

import { readThemeValues, watchTheme, type ThemeValues } from '@polymorph/engine'

/**
 * The theme as data, as a signal kept current until the component is
 * destroyed (`readThemeValues` in `@polymorph/engine` says what it holds).
 * Call it in an injection context. It is for another library's component
 * inside a `<pm-third-party>` boundary that takes its colours, radii, type and
 * spacing through a JavaScript API. The signal holds a new object each time
 * the pairing, the mode, the density, a scope or the reading direction
 * changes, so a template, an `effect` or a `computed` that reads it runs
 * again then.
 *
 * `scope` returns an element inside the region the component is drawn in
 * (`() => this.host().nativeElement`, for a `viewChild`). Its values are read
 * from that element, so a density or tone scope around it is seen. Without
 * one the values are the document root's.
 *
 * On a server render every colour is the empty string and every number 0,
 * and `themed` is false.
 */
export function useThemeValues(scope?: () => Element | null | undefined): Signal<ThemeValues> {
  // Injected before anything is subscribed: outside an injection context this throws, and a
  // listener taken before it would have nothing to release it.
  const destroyed = inject(DestroyRef)
  const values = signal<ThemeValues>(readThemeValues(scope))
  destroyed.onDestroy(watchTheme(() => values.set(readThemeValues(scope))))
  return values.asReadonly()
}
