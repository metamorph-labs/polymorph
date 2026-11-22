import { StrictMode } from 'react'
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
// with the page already drawn (`prerender.mjs`), and rendering before the chunk
// is in memory would replace that markup with an empty region for a frame
// (`pages.ts`). A chunk that fails to load still renders: the page then loads
// through `lazy`, and `ChunkBoundary` reports the failure.
void pageFor(currentPath())
  .preload()
  .catch(() => {})
  .then(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
