/**
 * A value as a client member receives it from a React server component, for a
 * test of a member that reads an element it is given.
 *
 * React's client hands such a value over as a lazy reference: an object marked
 * `react.lazy` whose `_payload` is a thenable for the real value and whose
 * `_init` returns the value once it has loaded and throws the thenable until
 * then. An element arrives this way while its parts load, and so does the
 * `type` of an element that names a client component. This builds the same
 * shape, so a member's test can pass it one without a server.
 *
 * With no `loaded`, the value has already loaded, which is what a member
 * usually meets: the thenable says so the way React marks one it has read.
 * With `loaded`, the reference stays pending until that promise settles.
 * `pnpm gate:next` (`scripts/gate-next.mjs`) checks the members against a real
 * server.
 */
export function serverPassed<T>(value: T, loaded?: Promise<unknown>): T {
  let ready = loaded === undefined
  const payload =
    loaded === undefined
      ? Object.assign(Promise.resolve(value), { status: 'fulfilled', value })
      : loaded.then(() => {
          ready = true
          return value
        })
  const reference = {
    $$typeof: Symbol.for('react.lazy'),
    _payload: payload,
    _init: () => {
      if (ready) return value
      throw payload
    },
  }
  return reference as unknown as T
}
