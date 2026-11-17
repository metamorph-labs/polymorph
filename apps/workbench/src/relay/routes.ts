/**
 * Relay's routes. The shell needs to know them before it loads Relay. `App` imports this file
 * rather than the barrel so the route check does not download Relay. `RelayApp` and its screens
 * load by dynamic import once a route matches.
 */
export const RELAY_ROOT = '/relay'

export function isRelayRoute(pathname: string): boolean {
  return pathname === RELAY_ROOT || pathname.startsWith(`${RELAY_ROOT}/`)
}
