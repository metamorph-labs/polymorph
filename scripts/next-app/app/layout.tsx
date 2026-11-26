import type { ReactNode } from 'react'

import { TooltipProvider } from '@polymorph/react-ui'

import { PREPAINT_SCRIPT } from '../src/polymorph/themes/prepaint'
import { Theme } from './theme'

export const metadata = { title: 'Polymorph on Next.js' }

/**
 * The root layout, a server component. The pre-paint script applies a stored
 * theme choice before the first paint, and for a reader who stored no mode
 * the installed system's default mode, so `<html>` may carry attributes the
 * server did not render, and `suppressHydrationWarning` says so for that one
 * element. The system, the palette and the script are the ones
 * `polymorph add theme:plain` compiled.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-system="plain" data-palette="neutral" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      </head>
      <body>
        <Theme />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
