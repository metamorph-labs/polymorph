'use client'

import { useLayoutEffect, useMemo, useState, useSyncExternalStore, type RefObject } from 'react'

import {
  readThemeValues,
  themeVersion,
  UNTHEMED_VALUES,
  watchTheme,
  type ThemeValues,
} from '@polymorph/engine'

/**
 * The snapshot of a server render, which React also reads while it hydrates.
 * The engine's version is never negative, so the two always differ and React
 * renders again once it has hydrated.
 */
const ON_SERVER = -1
const onServer = (): number => ON_SERVER

/**
 * Follows the engine, and has React compare its snapshot as soon as it does.
 * The engine's version grows when it takes its first listener, because nothing
 * watched before. React compares after it subscribes only on a commit that
 * rendered a new snapshot, and a tree that `<Activity>` shows again subscribes
 * on a commit that did not.
 */
function follow(onChange: () => void): () => void {
  const release = watchTheme(onChange)
  onChange()
  return release
}

/** One reading per change: a new `version` or a new `element` is what makes a new one. */
function valuesAt(version: number, element: Element | null): ThemeValues {
  return version === ON_SERVER ? UNTHEMED_VALUES : readThemeValues(element)
}

/**
 * The theme as data, kept current (`readThemeValues` in `@polymorph/engine`
 * says what it holds). It is for another library's component inside a
 * `<ThirdParty>` boundary that takes its colours, radii, type and spacing
 * through a JavaScript API. The result is a new object each time the pairing,
 * the mode, the density, a scope or the reading direction changes. The
 * component renders again then, and an effect that lists the result as a
 * dependency runs again.
 *
 * A value is read while the component renders, in an effect or in a handler.
 * A server has no document, so on a server render every colour is the empty
 * string and every number 0, and `themed` is false. The render that hydrates
 * the server's markup returns the same, and the component renders again with
 * the document's values once React has hydrated it.
 *
 * `scopeRef` is a ref to an element inside the region the hosted component is
 * drawn in. The values are read from that element, so a density, tone or mode
 * scope around it is seen. Without a ref the values are the document root's.
 *
 * The hook takes the ref's element after each commit of the component that
 * calls it. When the element is not the one it held, the component renders
 * again with a reading from the new one before the browser paints. A ref has
 * no element until React has mounted it, so the first render reads the
 * document root's values. A ref that gets its element in a later render is
 * read from then on, and a ref whose element is removed reads the root's
 * values again. An effect that lists the result runs for each reading.
 *
 * The hook does not see a commit in which only a child component renders. If
 * such a commit gives the ref another element, the hook keeps the element it
 * held until the calling component renders again. While that element is out
 * of the document, the values are the document root's.
 */
export function useThemeValues(scopeRef?: RefObject<Element | null>): ThemeValues {
  const version = useSyncExternalStore(follow, themeVersion, onServer)
  // A ref is not read while React renders, so its element is held as state.
  const [element, setElement] = useState<Element | null>(null)
  const takeElement = (): void => setElement(scopeRef?.current ?? null)
  // After every commit of the component, so with no dependency list: React can give the ref its
  // element, another element or none in any of them. Setting the element the state already
  // holds renders nothing.
  useLayoutEffect(takeElement)
  return useMemo(() => valuesAt(version, element), [version, element])
}
