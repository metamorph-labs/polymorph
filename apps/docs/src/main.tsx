import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { installFonts } from './fonts'
import { pageFor } from './pages'
import { currentPath, interceptLinks } from './router'
import { installThemes } from './themes'

installThemes()

// Webfonts, per system. Apps load fonts and the library never bundles them. The
// imports live in `fonts.ts`, keyed by family and loaded for the active system.
// This runs after the themes because hydration has just written `data-system`,
// so the first load starts at once and is for the system on screen. Fonts
// belong to the system, so the palette plays no part here.
installFonts()

// Before the first render, so the router handles the first link click.
interceptLinks()

const root = document.getElementById('root')
if (!root) throw new Error('docs: #root missing from index.html')

// The route's chunk is loaded before the first render. The document may arrive
// with the page already drawn (`scripts/site.mjs`), and rendering before the
// chunk is in memory would replace that markup with an empty region for a frame
// (`pages.ts`). A chunk that fails to load still renders: the page then loads
// through `lazy`, and `ChunkBoundary` reports the failure.
void pageFor(currentPath())
  .preload()
  .catch(() => {})
  .then(() => {
    // The render replaces the saved markup, and with it the content region,
    // which is the page's scroll container. A reader may have scrolled the
    // saved page while the script loaded, so the offset is read before the
    // render and given to the new region after it. The render is flushed so
    // the region exists when the offset is set.
    const offset = document.getElementById('content')?.scrollTop ?? 0
    const app = createRoot(root)
    flushSync(() => {
      app.render(
        <StrictMode>
          <App />
        </StrictMode>,
      )
    })
    if (offset > 0) document.getElementById('content')?.scrollTo(0, offset)
  })
