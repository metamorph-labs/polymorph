import type { ReactNode } from 'react'

/**
 * The children Stack, Inline and Grid take. Their spacing props, the patch and
 * `spacingAttrs` are framework-free and live in the engine
 * (`@polymorph/engine`, re-exported by this package); only the children's type
 * is React's.
 */
export interface LayoutChildren {
  children?: ReactNode
}
