import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { installFonts } from './fonts'
import { interceptLinks } from './router'
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

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
