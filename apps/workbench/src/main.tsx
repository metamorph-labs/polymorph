import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { installFonts } from './fonts'
import { installThemes } from './themes'

// Runs before React so the first painted frame is themed. The pre-paint script in <head> sets
// the attributes. This call supplies the values.
installThemes()

// Loads webfonts for the active system. Apps load fonts and the library never bundles them. The
// imports are in `fonts.ts`, keyed by family. This runs after `installThemes()` because that
// call writes `data-system`, so the first load is for the system on screen. Fonts belong to the
// system, so the palette does not affect them.
installFonts()

const root = document.getElementById('root')
if (!root) throw new Error('workbench: #root missing from index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
