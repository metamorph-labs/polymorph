/**
 * The Zag adapter for Angular: a machine driven by signals (`useMachine`),
 * its props in the description's spelling (`normalizeProps`, `mergeParts`)
 * and the directive that writes them onto an element (`Spread`).
 */
export { createBindable } from './bindable'
export type { AngularBindable } from './bindable'
export { isDomProperty, writeStyle, writeValue } from './dom'
export { useMachine } from './machine'
export { mergeParts, normalizeProps } from './normalize-props'
export { Spread } from './spread'
