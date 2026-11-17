'use client'

import { useEffect } from 'react'

import { installThemes } from '../src/polymorph/themes'

/**
 * Imports the theme module `polymorph add` generated, which brings the
 * compiled theme, the base layer and the fonts, and runs its hydration once
 * the page has hydrated: a stale stored choice is replaced, and the mode
 * follows the system's setting from then on.
 */
export function Theme() {
  useEffect(installThemes, [])
  return null
}
