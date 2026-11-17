/**
 * Props a test changes after it mounts, as a parent's state changes: a
 * `$state` object, which `render` (`../mount.ts`) passes to the component, so
 * the component follows each change.
 */
export function live<Props extends Record<string, unknown>>(initial: Props): Props {
  const props = $state(initial)
  return props
}

/**
 * Props a test replaces whole, as an application replaces a long list it
 * holds in `$state.raw`: each prop is a raw value, so a new array is passed as
 * it is and not wrapped item by item in a proxy. A prop is followed when it is
 * set again; the test names every prop it will set in `initial`.
 */
export function liveRaw<Props extends Record<string, unknown>>(initial: Props): Props {
  const props = {} as Props
  for (const key of Object.keys(initial) as (keyof Props)[]) {
    let value = $state.raw(initial[key])
    Object.defineProperty(props, key, {
      enumerable: true,
      get: () => value,
      set: (next: Props[keyof Props]) => {
        value = next
      },
    })
  }
  return props
}
