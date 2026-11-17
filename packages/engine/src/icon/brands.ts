/**
 * Third-party brand marks, as data (`design/components/icon.md`, brand marks).
 *
 * An icon role names a meaning, and the theme decides how it is drawn. A
 * provider's mark is different: its geometry and colours belong to the
 * provider and are fixed by their brand terms, so a sign-in button that
 * redraws the Google "G" in the accent colour is a trademark problem. Brand
 * marks are therefore a second, much smaller closed set, which every
 * framework's `BrandMark` draws from this data and application code only
 * names.
 *
 * The set is closed and grows only through a reviewed change, not through a
 * prop. The hex values are the providers' published colours, not design
 * values, and this is the one file that writes them.
 */

export const BRAND_MARKS = ['google', 'microsoft', 'github'] as const

export type BrandName = (typeof BRAND_MARKS)[number]

export function isBrandName(value: string): value is BrandName {
  return (BRAND_MARKS as readonly string[]).includes(value)
}

/** One mark: its `viewBox` and its filled paths, in the provider's colours. */
export interface BrandDrawing {
  viewBox: string
  paths: readonly { d: string; fill: string }[]
}

export const BRAND_DRAWINGS: Readonly<Record<BrandName, BrandDrawing>> = {
  // Google's standard-colour "G", as published in its sign-in branding guidelines.
  google: {
    viewBox: '0 0 48 48',
    paths: [
      {
        fill: '#EA4335',
        d: 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z',
      },
      {
        fill: '#4285F4',
        d: 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z',
      },
      {
        fill: '#FBBC05',
        d: 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z',
      },
      {
        fill: '#34A853',
        d: 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z',
      },
    ],
  },
  // Microsoft's four-square symbol, from its identity branding guidelines.
  microsoft: {
    viewBox: '0 0 21 21',
    paths: [
      { fill: '#F25022', d: 'M1 1h9v9H1z' },
      { fill: '#7FBA00', d: 'M11 1h9v9h-9z' },
      { fill: '#00A4EF', d: 'M1 11h9v9H1z' },
      { fill: '#FFB900', d: 'M11 11h9v9h-9z' },
    ],
  },
  // GitHub's terms make its mark monochrome, so only it takes the text colour.
  github: {
    viewBox: '0 0 16 16',
    paths: [
      {
        fill: 'currentColor',
        d: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z',
      },
    ],
  },
}
