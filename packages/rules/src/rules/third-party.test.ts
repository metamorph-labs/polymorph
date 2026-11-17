import { describe, expect, it } from 'vitest'

import {
  hostedLibraries,
  scanAngularComponent,
  scanMarkup,
  scanSource,
  type Exception,
} from '../inventory.js'
import { verifyCode, type VerifyOptions } from '../verify'
import { alternativesIn } from './alternatives'
import { MESSAGE_LIMIT } from './advice'

/**
 * The `<ThirdParty>` boundary (`docs/rules.md`), as every red rule reads it.
 *
 * The boundary hosts another library's component. It lifts what hosting needs:
 * `style` and a class on a plain element and on the library's own component,
 * raw lengths, the named library's import and its stylesheet. It lifts nothing
 * else, and it lifts nothing at all unless the file imports a binding from the
 * library it names, so these cases state each half in each syntax. They run
 * through `verify`, the path the MCP server takes, with every application rule
 * on.
 */

/**
 * Every framework the verifier reads but `elements`, whose screen is an HTML page the red
 * rules do not read (the last case below).
 */
type Framework = Exclude<NonNullable<VerifyOptions['framework']>, 'elements'>

const FILES: Record<Framework, string> = {
  react: 'apps/relay/src/Depots.tsx',
  vue: 'apps/relay/src/Depots.vue',
  svelte: 'apps/relay/src/Depots.svelte',
  solid: 'apps/relay/src/Depots.tsx',
  angular: 'apps/relay/src/depots.component.ts',
}

interface Report {
  rule: string
  message: string
  /** Whether the rule fixes it. */
  fixed: boolean
}

function lint(code: string, framework: Framework): Report[] {
  const result = verifyCode(code, {
    filename: FILES[framework],
    ...(framework === 'solid' || framework === 'angular' ? { framework } : {}),
  })
  expect(result.fatal, String(result.fatal)).toBeNull()
  return result.diagnostics.map(({ rule, message, fix }) => ({
    rule: rule.replace('polymorph/', ''),
    message,
    fixed: fix !== null,
  }))
}

const rulesOf = (code: string, framework: Framework): string[] =>
  [...new Set(lint(code, framework).map(({ rule }) => rule))].sort()

/** A screen in each syntax: its imports, then what the boundary holds. */
const SCREEN: Record<Framework, (imports: string, inside: string, library?: string) => string> = {
  react: (imports, inside, library = 'library="leaflet"') =>
    `${imports}\nimport { ThirdParty } from '@polymorph/react-ui'\n` +
    `export const Depots = () => <ThirdParty ${library} reason="depot map">${inside}</ThirdParty>\n`,
  solid: (imports, inside, library = 'library="leaflet"') =>
    `${imports}\nimport { ThirdParty } from '@polymorph/solid-ui'\n` +
    `export const Depots = () => <ThirdParty ${library} reason="depot map">${inside}</ThirdParty>\n`,
  vue: (imports, inside, library = 'library="leaflet"') =>
    `<script setup lang="ts">\n${imports}\nimport { ThirdParty } from '@polymorph/vue-ui'\n</script>\n\n` +
    `<template>\n  <ThirdParty ${library} reason="depot map">${inside}</ThirdParty>\n</template>\n`,
  svelte: (imports, inside, library = 'library="leaflet"') =>
    `<script lang="ts">\n${imports}\nimport { ThirdParty } from '@polymorph/svelte-ui'\n</script>\n\n` +
    `<ThirdParty ${library} reason="depot map">${inside}</ThirdParty>\n`,
  angular: (imports, inside, library = 'library="leaflet"') =>
    `import { Component } from '@angular/core'\n${imports}\n` +
    `import { ThirdParty } from '@polymorph/angular-ui'\n\n` +
    `@Component({\n  selector: 'app-depots',\n  imports: [ThirdParty],\n` +
    `  template: \`<pm-third-party ${library} reason="depot map">${inside}</pm-third-party>\`,\n})\n` +
    `export class Depots {}\n`,
}

const FRAMEWORKS = Object.keys(SCREEN) as Framework[]

/** A binding from the library the screens name, which is what makes a boundary host it. */
const LEAFLET = `import { latLng } from 'leaflet'\nvoid latLng`

/** The vocabulary and the foundation of each framework: polymorph's own packages. */
const OWN_VOCABULARY = [
  '@polymorph/react-ui',
  '@polymorph/react',
  '@polymorph/vue-ui',
  '@polymorph/svelte',
  '@polymorph/solid-ui',
  '@polymorph/angular-ui',
  '@polymorph/engine',
]

/** A module of each framework's runtime, and a `library` that names it or its package. */
const RUNTIMES: [source: string, library: string][] = [
  ['react', 'react'],
  ['react-dom/client', 'react-dom'],
  ['react-dom/client', 'react-dom/client'],
  ['vue', 'vue'],
  ['svelte', 'svelte'],
  ['svelte/store', 'svelte/store'],
  ['solid-js', 'solid-js'],
  ['solid-js/web', 'solid-js/web'],
  ['@angular/core', '@angular/core'],
  ['@angular/common/http', '@angular/common'],
  ['@angular/forms', '@angular/forms'],
  ['@angular/router', '@angular/router'],
]

/** The report on a boundary that hosts nothing. */
const UNHOSTED = /^Unexpected <(ThirdParty|pm-third-party)[ >]/

/** A plain element with a class and a raw length in its `style`. */
const STYLED: Record<Framework, string> = {
  react: `<div className="depots" style={{ height: '320px' }} />`,
  solid: `<div class="depots" style={{ height: '320px' }} />`,
  vue: `<div class="depots" style="height: 320px" />`,
  svelte: `<div class="depots" style="height: 320px"></div>`,
  angular: `<div class="depots" style="height: 320px"></div>`,
}

/** The library's own component with a `style`, where the syntax has one. */
const HOSTED: Partial<Record<Framework, [imports: string, inside: string]>> = {
  react: [
    `import { MapContainer } from 'react-leaflet'`,
    `<MapContainer style={{ height: '320px' }} />`,
  ],
  solid: [
    `import { MapContainer } from 'solid-leaflet'`,
    `<MapContainer style={{ height: '320px' }} />`,
  ],
  vue: [`import { LMap } from '@vue-leaflet/vue-leaflet'`, `<LMap style="height: 320px" />`],
  svelte: [`import { Map } from 'sveaflet'`, `<Map style="height: 320px" />`],
}

describe.each(FRAMEWORKS)('a <ThirdParty> boundary in %s', (framework) => {
  const screen = SCREEN[framework]

  it('lifts `style`, a class and a raw length on a plain element', () => {
    expect(rulesOf(screen(LEAFLET, STYLED[framework]), framework)).toEqual([])
  })

  it('reports the same element outside the boundary', () => {
    const outside = screen(LEAFLET, '').replace(/(<\/(?:ThirdParty|pm-third-party)>)/, `$1`)
    const code =
      framework === 'react' || framework === 'solid'
        ? outside.replace(/=> (<ThirdParty[^]*<\/ThirdParty>)/, `=> <>$1${STYLED[framework]}</>`)
        : outside.replace(/(<\/(?:ThirdParty|pm-third-party)>)/, `$1${STYLED[framework]}`)
    expect(rulesOf(code, framework)).toEqual(['no-raw-styles'])
  })

  it('lifts the named library’s stylesheet, in the file that declares it', () => {
    const code = screen(`${LEAFLET}\nimport 'leaflet/dist/leaflet.css'`, '')
    expect(rulesOf(code, framework)).toEqual([])
  })

  it('keeps the stylesheet of a library the file imports and does not host red, and names the boundary for it', () => {
    const code = screen(
      `${LEAFLET}\nimport { createGrid } from 'ag-grid-community'\nimport 'ag-grid-community/styles/ag-grid.css'\nvoid createGrid`,
      '',
    )
    const reports = lint(code, framework)
    expect(reports.map(({ rule }) => rule)).toEqual(['no-app-css'])
    const [{ message }] = reports as [Report]
    expect(message).toContain(
      framework === 'angular'
        ? '`<pm-third-party library="ag-grid-community" reason="…">`'
        : '`<ThirdParty library="ag-grid-community" reason="…">`',
    )
    expect(message.length).toBeLessThan(MESSAGE_LIMIT)
  })

  it('offers no boundary for the stylesheet of a package the file imports no binding from', () => {
    const sources = [
      'ag-grid-community/styles/ag-grid.css',
      'bootstrap/dist/css/bootstrap.css',
      'normalize.css',
    ]
    for (const source of sources) {
      const reports = lint(screen(`${LEAFLET}\nimport '${source}'`, ''), framework)
      expect(reports.map(({ rule }) => rule)).toEqual(['no-app-css'])
      const [{ message }] = reports as [Report]
      // The boundary is an answer only where a code span writes it as one.
      expect(message, source).not.toMatch(/`<(ThirdParty|pm-third-party)\b/)
      expect(alternativesIn(message, [1, 4]).some(({ member }) => member === 'ThirdParty')).toBe(
        false,
      )
      expect(alternativesIn(message, [1, 4]).length).toBeGreaterThan(0)
      expect(message.length).toBeLessThan(MESSAGE_LIMIT)
    }
  })

  it('keeps the application’s own stylesheet red', () => {
    for (const source of [
      './depots.css',
      '@/styles/depots.css',
      '~/depots.css',
      '$lib/depots.css',
    ]) {
      expect(rulesOf(screen(`${LEAFLET}\nimport '${source}'`, ''), framework), source).toEqual([
        'no-app-css',
      ])
    }
  })

  it('lifts nothing for a library the file imports no binding from', () => {
    // A stylesheet, a side-effect import, a type and a re-export bring no binding in.
    const imports = [
      `import 'leaflet/dist/leaflet.css'`,
      `import 'leaflet'`,
      `import type { Map } from 'leaflet'\nexport type Depot = Map`,
      `import { type Map } from 'leaflet'\nexport type Depot = Map`,
      `export { latLng } from 'leaflet'`,
      `import sheet from 'leaflet/dist/leaflet.css?inline'\nvoid sheet`,
      `import { MapContainer } from 'react-leaflet'\nvoid MapContainer`,
    ]
    for (const written of imports) {
      const reports = lint(screen(written, STYLED[framework]), framework)
      const boundary = reports.filter(({ message }) => UNHOSTED.test(message))
      expect(boundary, written).toHaveLength(1)
      expect(boundary[0]?.rule).toBe('no-raw-styles')
      expect(boundary[0]?.message).toContain('library="leaflet"')
      expect(boundary[0]?.message).toContain('(rung 4)')
      expect(boundary[0]?.message.length).toBeLessThan(MESSAGE_LIMIT)
      // An Angular template is linted apart from the module that holds the
      // imports, so there the report on the boundary is the whole refusal.
      if (framework === 'angular') continue
      const inside = reports.filter(({ message }) => !UNHOSTED.test(message))
      expect(
        inside.some(({ message }) => /^Unexpected `class(Name)?` on <div>/.test(message)),
      ).toBe(true)
      expect(inside.some(({ message }) => /^Unexpected `style` on <div>/.test(message))).toBe(true)
    }
  })

  it('keeps the stylesheet of a library the file imports no binding from red', () => {
    const cases: [imports: string, library: string][] = [
      [`import 'leaflet/dist/leaflet.css'`, 'leaflet'],
      [`import 'normalize.css'`, 'normalize.css'],
      [`import 'bootstrap/dist/css/bootstrap.css'`, 'bootstrap'],
      // An alias spelled as a package name.
      [`import 'styles/depots.css'`, 'styles'],
      [`import '@app/styles/depots.css'`, '@app/styles'],
    ]
    for (const [imports, library] of cases) {
      expect(rulesOf(screen(imports, '', `library="${library}"`), framework), library).toEqual([
        'no-app-css',
        'no-raw-styles',
      ])
    }
  })

  it('reads a dynamic import as a binding', () => {
    const code = screen(
      `import 'leaflet/dist/leaflet.css'\nconst leaflet = import('leaflet')\nvoid leaflet`,
      STYLED[framework],
    )
    expect(rulesOf(code, framework)).toEqual([])
  })

  it('reports a boundary that names no library, and lifts nothing inside it', () => {
    const computed = {
      react: 'library={name}',
      solid: 'library={name}',
      vue: ':library="name"',
      svelte: 'library={name}',
      angular: '[library]="name"',
    }[framework]
    for (const library of ['', 'library=""', computed]) {
      const reports = lint(
        screen(`${LEAFLET}\nimport 'leaflet/dist/leaflet.css'`, STYLED[framework], library),
        framework,
      )
      const boundary = reports.filter(({ message }) => UNHOSTED.test(message))
      expect(boundary, library).toHaveLength(1)
      expect(boundary[0]?.rule).toBe('no-raw-styles')
      expect(boundary[0]?.message).toContain('`library`')
      expect(boundary[0]?.message).toContain(
        framework === 'angular'
          ? '`<pm-third-party library="…" reason="…">` (rung 4)'
          : '`<ThirdParty library="…" reason="…">` (rung 4)',
      )
      expect(boundary[0]?.message.length).toBeLessThan(MESSAGE_LIMIT)
      const inside = reports.filter(({ message }) => !UNHOSTED.test(message))
      expect(
        inside.some(({ rule }) => rule === 'no-app-css'),
        library,
      ).toBe(true)
      expect(
        inside.some(({ message }) => /^Unexpected `class(Name)?` on <div>/.test(message)),
      ).toBe(true)
      expect(inside.some(({ message }) => /^Unexpected `style` on <div>/.test(message))).toBe(true)
    }
  })

  it('reports a boundary whose library is no package the file imports', () => {
    for (const library of ['made-up', '@/styles', './leaflet', 'leaflet/dist']) {
      const reports = lint(
        screen(`${LEAFLET}\nimport 'leaflet/dist/leaflet.css'`, '', `library="${library}"`),
        framework,
      )
      expect(reports.map(({ rule }) => rule).sort(), library).toEqual([
        'no-app-css',
        'no-raw-styles',
      ])
      const boundary = reports.find(({ message }) => UNHOSTED.test(message))
      expect(boundary?.message).toContain(`library="${library}"`)
      expect(boundary?.message).toContain('(rung 4)')
      expect(boundary?.message.length).toBeLessThan(MESSAGE_LIMIT)
    }
  })

  it('hosts nothing when it names a package of polymorph or a framework’s own runtime', () => {
    // A file imports these whether it hosts anything or not, so the binding
    // ties the name to no hosted component.
    const own: [imports: string, library: string, said: string][] = [
      ...OWN_VOCABULARY.map((library): [string, string, string] => [
        `import { Stack } from '${library}'\nvoid Stack`,
        library,
        "polymorph's own package",
      ]),
      ...RUNTIMES.map(([source, library]): [string, string, string] => [
        `import * as runtime from '${source}'\nvoid runtime`,
        library,
        "framework's own runtime",
      ]),
    ]
    for (const [imports, library, said] of own) {
      const reports = lint(screen(imports, STYLED[framework], `library="${library}"`), framework)
      const boundary = reports.filter(({ message }) => UNHOSTED.test(message))
      expect(boundary, library).toHaveLength(1)
      expect(boundary[0]?.rule).toBe('no-raw-styles')
      expect(boundary[0]?.message).toContain(`library="${library}"`)
      expect(boundary[0]?.message).toContain(said)
      expect(boundary[0]?.message).toContain('(rung 4)')
      expect(boundary[0]?.message.length).toBeLessThan(MESSAGE_LIMIT)
      // It lifts nothing, in an Angular template too: the name alone says so.
      const inside = reports.filter(({ message }) => !UNHOSTED.test(message))
      expect(
        inside.some(({ message }) => /^Unexpected `class(Name)?` on <div>/.test(message)),
        library,
      ).toBe(true)
      expect(inside.some(({ message }) => /^Unexpected `style` on <div>/.test(message))).toBe(true)
    }
  })

  it('still hosts a component library published in a framework’s scope', () => {
    const libraries: [source: string, library: string][] = [
      ['@angular/google-maps', '@angular/google-maps'],
      ['@angular/cdk/drag-drop', '@angular/cdk'],
      ['@angular/material/button', '@angular/material'],
      ['vue-router', 'vue-router'],
      ['react-leaflet', 'react-leaflet'],
    ]
    for (const [source, library] of libraries) {
      const imports = `import * as hosted from '${source}'\nvoid hosted`
      expect(
        rulesOf(screen(imports, STYLED[framework], `library="${library}"`), framework),
        library,
      ).toEqual([])
    }
  })

  it('keeps the report on a boundary under the limit, whatever it names', () => {
    const long = '@a-publisher-with-a-long-name/a-package-with-a-long-name-too'
    for (const library of [long, '@polymorph/a-package-with-a-very-long-name-of-its-own']) {
      const reports = lint(screen('', '', `library="${library}"`), framework)
      const boundary = reports.filter(({ message }) => UNHOSTED.test(message))
      expect(boundary, library).toHaveLength(1)
      expect(boundary[0]?.message.length).toBeLessThan(MESSAGE_LIMIT)
    }
  })

  it('reads `import L = require()` as a binding, and a type one as none', () => {
    expect(
      rulesOf(screen(`import L = require('leaflet')\nvoid L`, STYLED[framework]), framework),
    ).toEqual([])
    const typed = lint(
      screen(`import type L = require('leaflet')\nexport type Depot = L.Map`, STYLED[framework]),
      framework,
    )
    expect(typed.filter(({ message }) => UNHOSTED.test(message))).toHaveLength(1)
  })

  it('reads a boundary with no children as it reads one with them', () => {
    const childless = (imports: string, library: string) =>
      screen(imports, '', `library="${library}"`).replace(
        /(<(?:ThirdParty|pm-third-party)[^>]*)><\/(?:ThirdParty|pm-third-party)>/,
        '$1 />',
      )
    const hosted = childless(`${LEAFLET}\nimport 'leaflet/dist/leaflet.css'`, 'leaflet')
    expect(hosted).toContain('reason="depot map" />')
    expect(rulesOf(hosted, framework)).toEqual([])
    expect(rulesOf(childless(`import 'normalize.css'`, 'normalize.css'), framework)).toEqual([
      'no-app-css',
      'no-raw-styles',
    ])
    expect(rulesOf(childless(`import '@/styles/depots.css'`, '@/styles'), framework)).toEqual([
      'no-app-css',
      'no-raw-styles',
    ])
  })

  it('lifts the import of the library it names, where a rule bans its kind', () => {
    const chart = screen(`import { Sankey } from 'recharts'\nvoid Sankey`, '', 'library="recharts"')
    expect(rulesOf(chart, framework)).toEqual([])
    const part = screen(
      `import { ResponsiveSankey } from '@nivo/sankey'\nvoid ResponsiveSankey`,
      '',
      'library="@nivo/sankey"',
    )
    expect(rulesOf(part, framework)).toEqual([])
    const motion = screen(`import { gsap } from 'gsap'\nvoid gsap`, '', 'library="gsap"')
    expect(rulesOf(motion, framework)).toEqual([])
    // A path inside the package is the package.
    const path = screen(`import Chart from 'chart.js/auto'\nvoid Chart`, '', 'library="chart.js"')
    expect(rulesOf(path, framework)).toEqual([])
  })

  it('lifts no banned package through the npm scope of the library it names', () => {
    const cases: [imports: string, library: string, rule: string][] = [
      [
        `import { DataTable } from '@swimlane/ngx-datatable'\nimport { BarChart } from '@swimlane/ngx-charts'\nvoid [DataTable, BarChart]`,
        '@swimlane/ngx-datatable',
        'no-external-dataviz',
      ],
      [
        `import { Core } from '@nivo/core'\nimport { ResponsiveSankey } from '@nivo/sankey'\nvoid [Core, ResponsiveSankey]`,
        '@nivo/core',
        'no-external-dataviz',
      ],
      [
        `import { dragAndDrop } from '@formkit/drag-and-drop'\nimport autoAnimate from '@formkit/auto-animate'\nvoid [dragAndDrop, autoAnimate]`,
        '@formkit/drag-and-drop',
        'no-external-motion',
      ],
      [
        `import { OnClickOutside } from '@vueuse/components'\nimport { useMotion } from '@vueuse/motion'\nvoid [OnClickOutside, useMotion]`,
        '@vueuse/components',
        'no-external-motion',
      ],
      [
        `import { GoogleMap } from '@angular/google-maps'\nimport { trigger } from '@angular/animations'\nvoid [GoogleMap, trigger]`,
        '@angular/google-maps',
        'no-external-motion',
      ],
    ]
    for (const [imports, library, rule] of cases) {
      expect(rulesOf(screen(imports, '', `library="${library}"`), framework), library).toEqual([
        rule,
      ])
    }
  })

  it('lifts no banned module of a framework’s own runtime, whichever name the boundary writes', () => {
    // A framework's motion modules are on the motion rule's list and are the
    // framework's own, so no boundary hosts them.
    const cases: [imports: string, libraries: string[]][] = [
      [
        `import { onMount } from 'svelte'\nimport { fade } from 'svelte/transition'\nvoid [onMount, fade]`,
        ['svelte', 'svelte/transition'],
      ],
      [
        `import { trigger } from '@angular/animations'\nvoid trigger`,
        ['@angular/animations', '@angular/platform-browser/animations'],
      ],
    ]
    for (const [imports, libraries] of cases) {
      for (const library of libraries) {
        expect(rulesOf(screen(imports, '', `library="${library}"`), framework), library).toEqual([
          'no-external-motion',
          'no-raw-styles',
        ])
      }
    }
  })

  it('lifts no stylesheet through the npm scope of the library it names', () => {
    const code = screen(
      `import { GoogleMap } from '@angular/google-maps'\nimport '@angular/material/prebuilt-themes/azure-blue.css'\nvoid GoogleMap`,
      '',
      'library="@angular/google-maps"',
    )
    expect(rulesOf(code, framework)).toEqual(['no-app-css'])
  })

  it('keeps a banned library it does not name red', () => {
    const code = screen(`${LEAFLET}\nimport { Sankey } from 'recharts'\nvoid Sankey`, '')
    expect(rulesOf(code, framework)).toEqual(['no-external-dataviz'])
  })

  it('keeps a re-export of the library red', () => {
    const code = screen(
      `import { Sankey } from 'recharts'\nexport { BarChart } from 'recharts'\nvoid Sankey`,
      '',
      'library="recharts"',
    )
    expect(rulesOf(code, framework)).toEqual(['no-external-dataviz'])
  })

  it('keeps a raw control red', () => {
    expect(rulesOf(screen(LEAFLET, '<button>Zoom in</button>'), framework)).toEqual([
      'no-raw-interactive',
    ])
  })

  it('keeps an inline <svg> red', () => {
    const svg = framework === 'react' || framework === 'solid' ? '<svg />' : '<svg></svg>'
    expect(rulesOf(screen(LEAFLET, svg), framework)).toEqual(['no-external-icons'])
  })

  it('keeps a raw colour red, and answers with the theme’s values', () => {
    const inside = {
      react: `<div style={{ background: '#4087de' }} />`,
      solid: `<div style={{ background: '#4087de' }} />`,
      vue: `<div style="background: #4087de" />`,
      svelte: `<div style="background: #4087de"></div>`,
      angular: `<div style="background: #4087de"></div>`,
    }[framework]
    const reports = lint(screen(LEAFLET, inside), framework)
    expect(reports.map(({ rule }) => rule)).toEqual(['no-raw-styles'])
    const [{ message }] = reports as [Report]
    expect(message).toContain('`useThemeValues()`')
    expect(message.length).toBeLessThan(MESSAGE_LIMIT)
  })
})

describe.each(Object.keys(HOSTED) as Framework[])('the hosted component in %s', (framework) => {
  const [imports, inside] = HOSTED[framework] as [string, string]

  it('takes a `style` inside the boundary', () => {
    expect(rulesOf(SCREEN[framework](`${LEAFLET}\n${imports}`, inside), framework)).toEqual([])
  })
})

/** The vocabulary a screen imports its members from. An Angular template names them by selector. */
const VOCABULARY: Record<Framework, string> = {
  react: '@polymorph/react-ui',
  solid: '@polymorph/solid-ui',
  vue: '@polymorph/vue-ui',
  svelte: '@polymorph/svelte-ui',
  angular: '@polymorph/angular-ui',
}

/** A member with a class, and the same member with a `style`. */
const MEMBER: Record<Framework, [classed: string, styled: string]> = {
  react: [
    `<Button className="wide" label="Go" />`,
    `<Button style={{ width: '100%' }} label="Go" />`,
  ],
  solid: [`<Button class="wide" label="Go" />`, `<Button style={{ width: '100%' }} label="Go" />`],
  vue: [`<Button class="wide" label="Go" />`, `<Button style="width: 100%" label="Go" />`],
  svelte: [`<Button class="wide" label="Go" />`, `<Button style="width: 100%" label="Go" />`],
  angular: [
    `<pm-button class="wide" label="Go" />`,
    `<pm-button style="width: 100%" label="Go" />`,
  ],
}

/** A part of a member with a class, and the same part with a `style`. */
const PART: Record<Framework, [classed: string, styled: string]> = {
  react: [`<Table.Row className="wide" />`, `<Table.Row style={{ height: '48px' }} />`],
  solid: [`<Table.Row class="wide" />`, `<Table.Row style={{ height: '48px' }} />`],
  vue: [`<Table.Row class="wide" />`, `<Table.Row style="height: 48px" />`],
  svelte: [`<Table.Row class="wide" />`, `<Table.Row style="height: 48px" />`],
  angular: [`<tr pmTableRow class="wide"></tr>`, `<tr pmTableRow style="height: 48px"></tr>`],
}

describe.each(FRAMEWORKS)('a member inside the boundary in %s', (framework) => {
  const screen = (inside: string) =>
    SCREEN[framework](
      `${LEAFLET}\nimport { Button, Table } from '${VOCABULARY[framework]}'\nvoid [Button, Table]`,
      inside,
    )

  it('still takes no class and no `style`', () => {
    const [classed, styled] = MEMBER[framework]
    for (const [inside, prop] of [
      [classed, 'class(Name)?'],
      [styled, 'style'],
    ] as const) {
      const reports = lint(screen(inside), framework)
      expect(reports.map(({ rule }) => rule)).toEqual(['no-raw-styles'])
      expect(reports[0]?.message).toMatch(
        new RegExp(`^Unexpected \`${prop}\` on <(Button|pm-button)>\\.`),
      )
      expect(reports[0]?.fixed).toBe(true)
    }
  })

  it('takes none on a part of a member either', () => {
    const [classed, styled] = PART[framework]
    for (const [inside, prop] of [
      [classed, 'class(Name)?'],
      [styled, 'style'],
    ] as const) {
      const reports = lint(screen(inside), framework)
      expect(
        reports.map(({ rule }) => rule),
        inside,
      ).toEqual(['no-raw-styles'])
      expect(reports[0]?.message).toMatch(
        new RegExp(`^Unexpected \`${prop}\` on <(Table\\.Row|tr)>`),
      )
      expect(reports[0]?.message.length).toBeLessThan(MESSAGE_LIMIT)
    }
  })
})

describe('a part of a member inside the boundary', () => {
  const screen = (imports: string, inside: string) => SCREEN.react(`${LEAFLET}\n${imports}`, inside)
  const TABLE = `import { Table } from '@polymorph/react-ui'`

  it('loses the prop to the fix, as a member does', () => {
    for (const framework of ['react', 'solid', 'vue', 'svelte'] as const) {
      const code = SCREEN[framework](
        `${LEAFLET}\nimport { Table } from '${VOCABULARY[framework]}'`,
        PART[framework][0],
      )
      const [report] = lint(code, framework)
      expect(report?.fixed, framework).toBe(true)
      expect(report?.message).toContain('the fix removes it')
    }
  })

  it('is reported and left when its root names something passed in', () => {
    const code =
      `${LEAFLET}\nimport { Table, ThirdParty } from '@polymorph/react-ui'\n` +
      `export function Depots({ Table }) {\n` +
      `  return <ThirdParty library="leaflet" reason="depot map"><Table.Row className="wide" /></ThirdParty>\n` +
      `}\n`
    const reports = lint(code, 'react')
    expect(reports.map(({ rule }) => rule)).toEqual(['no-raw-styles'])
    expect(reports[0]?.fixed).toBe(false)
    expect(reports[0]?.message).toContain('on <Table.Row>, a name the vocabulary governs')
  })

  it('is told from a dotted name of the hosted library, which takes a `style`', () => {
    const code = screen(
      `import * as Leaflet from 'react-leaflet'`,
      `<Leaflet.MapContainer className="map" style={{ height: '320px' }} />`,
    )
    expect(rulesOf(code, 'react')).toEqual([])
  })

  it('is read as it was outside the boundary', () => {
    // A class on a part is left alone there, and a `style` is reported unfixed.
    const outside = (part: string) =>
      `${TABLE}\nexport const Depots = () => <Table><Table.Body>${part}</Table.Body></Table>\n`
    expect(lint(outside(PART.react[0]), 'react')).toEqual([])
    const [styled] = lint(outside(`<Table.Row style={{ display: 'flex' }} />`), 'react')
    expect(styled?.rule).toBe('no-raw-styles')
    expect(styled?.fixed).toBe(false)
  })
})

/** `background-color` as a React style object writes it. A custom property keeps its name. */
const camel = (property: string): string =>
  property.startsWith('--')
    ? property
    : property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

/** One declaration as a `style` on a plain element, in each spelling the syntax has. */
const DECLARED: Record<Framework, (property: string, value: string) => string[]> = {
  react: (property, value) => [
    `<div style={{ '${camel(property)}': '${value}' }} />`,
    `<div style={{ '${camel(property)}': '${value}' } as CSSProperties} />`,
  ],
  solid: (property, value) => [
    `<div style={{ '${property}': '${value}' }} />`,
    `<div style="${property}: ${value}" />`,
    `<div style={open() ? { '${property}': '${value}' } : undefined} />`,
  ],
  vue: (property, value) => [
    `<div style="${property}: ${value}" />`,
    `<div :style="{ '${property}': '${value}' }" />`,
    `<div :style="[{ '${property}': '${value}' }]" />`,
  ],
  svelte: (property, value) => [
    `<div style="${property}: ${value}"></div>`,
    `<div style:${property}="${value}"></div>`,
    `<div style:${property}={'${value}'}></div>`,
  ],
  angular: (property, value) => [
    `<div style="${property}: ${value}"></div>`,
    `<div [style.${property}]="'${value}'"></div>`,
    `<div [style]="'${property}: ${value}'"></div>`,
    `<div [ngStyle]="{ '${property}': '${value}' }"></div>`,
    `<div [ngStyle]="open ? { '${property}': '${value}' } : null"></div>`,
  ],
}

/** A colour in a syntax no pattern lists, with the text the report quotes. */
const COLOURS: [property: string, value: string, quoted: string][] = [
  ['background', 'red', 'red'],
  ['color', 'rebeccapurple', 'rebeccapurple'],
  ['border', '1px solid white', 'white'],
  ['border-color', 'ButtonText', 'ButtonText'],
  ['outline', '2px solid Highlight', 'Highlight'],
  ['box-shadow', '0 1px 2px black', 'black'],
  ['background-image', 'linear-gradient(to right, red, blue)', 'red'],
  ['background', 'color-mix(in oklch, var(--pm-accent-bg), white)', 'color-mix('],
  ['color', 'var(--pm-text-primary, black)', 'black'],
  ['fill', 'tomato', 'tomato'],
  ['--rdg-background-color', 'white', 'white'],
  ['--grid-accent', 'light-dark(white, black)', 'light-dark(white, black)'],
]

/** What a lifted `style` may write. */
const LAWFUL: [property: string, value: string][] = [
  ['background', 'var(--pm-bg-subtle)'],
  ['border', '1px solid var(--pm-border-subtle)'],
  ['color', 'inherit'],
  ['color', 'currentColor'],
  ['background-color', 'transparent'],
  ['background', 'none'],
  ['outline', 'none'],
  ['background', 'url(marker-red.png) no-repeat center / cover'],
  ['background', 'url(data:image/png;base64,AAAA) no-repeat'],
  ['box-shadow', 'inset 0 0 0 1px var(--pm-border-subtle)'],
  ['background-image', 'linear-gradient(to right, var(--pm-accent-bg), transparent)'],
  ['text-decoration', 'underline dotted'],
  ['color-scheme', 'light dark'],
  ['--rdg-background-color', 'var(--pm-bg-surface)'],
  // Each shorthand takes every keyword of its own grammar.
  ['border-image', 'var(--grid-frame) 1 stretch'],
  ['border-image', 'var(--grid-frame) 1 fill / 1px / 0 round space'],
  ['outline', '2px solid invert'],
  ['text-decoration', 'underline wavy from-font spelling-error'],
  ['background', 'url(tile.png) repeat-x fixed border-area'],
  // A custom property with `color` inside its name holds no colour.
  ['--grid-color-mode', 'dark'],
  ['--grid-color-scheme', 'light'],
  // A property that takes no colour takes any word.
  ['mask', 'linear-gradient(to right, transparent, black)'],
  ['display', 'flex'],
  ['cursor', 'pointer'],
  ['font-family', 'serif'],
  ['border-style', 'solid'],
]

describe.each(FRAMEWORKS)('a colour inside the boundary in %s', (framework) => {
  const screen = (inside: string) => SCREEN[framework](LEAFLET, inside)

  it.each(COLOURS)('refuses `%s: %s`', (property, value, quoted) => {
    for (const inside of DECLARED[framework](property, value)) {
      const reports = lint(screen(inside), framework)
      expect(
        reports.map(({ rule }) => rule),
        inside,
      ).toEqual(['no-raw-styles'])
      const [{ message }] = reports as [Report]
      expect(message, inside).toContain(`Unexpected colour \`${quoted}\`.`)
      expect(message).toContain('`useThemeValues()`')
      expect(message.length).toBeLessThan(MESSAGE_LIMIT)
    }
  })

  it.each(LAWFUL)('takes `%s: %s`', (property, value) => {
    for (const inside of DECLARED[framework](property, value)) {
      expect(lint(screen(inside), framework), inside).toEqual([])
    }
  })
})

describe('a colour inside the boundary', () => {
  const screen = (inside: string, imports = '') => SCREEN.react(`${LEAFLET}\n${imports}`, inside)

  it('is refused on the hosted component as on a plain element', () => {
    const code = screen(
      `<MapContainer style={{ background: 'white' }} />`,
      `import { MapContainer } from 'react-leaflet'`,
    )
    expect(lint(code, 'react').map(({ message }) => message.slice(0, 26))).toEqual([
      'Unexpected colour `white`.',
    ])
  })

  it('is read at each end of a conditional', () => {
    const code = screen(`<div style={{ color: open ? 'var(--pm-text-primary)' : 'gray' }} />`)
    expect(lint(code, 'react').map(({ message }) => message.slice(0, 25))).toEqual([
      'Unexpected colour `gray`.',
    ])
    const angular = SCREEN.angular(LEAFLET, `<div [style.color]="open ? 'inherit' : 'gray'"></div>`)
    expect(lint(angular, 'angular').map(({ message }) => message.slice(0, 25))).toEqual([
      'Unexpected colour `gray`.',
    ])
  })

  it('is not read from a value computed where it is written', () => {
    const computed = [
      `<div style={{ background: theme.color('bg.subtle') }} />`,
      '<div style={{ border: `1px solid ${tone}` }} />',
      `<div style={{ color: tone }} />`,
    ]
    for (const inside of computed) expect(lint(screen(inside), 'react'), inside).toEqual([])
  })

  it('is read in a `style`, and not in a prop of the library’s own component', () => {
    const imports = `import { Polyline } from 'react-leaflet'`
    expect(lint(screen(`<Polyline color="red" />`, imports), 'react')).toEqual([])
    // A colour a pattern names is reported wherever it is written.
    expect(lint(screen(`<Polyline color="#ff0000" />`, imports), 'react')).toHaveLength(1)
  })

  it('is reported once where a pattern already names it', () => {
    const code = screen(`<div style={{ background: '#4087de', color: 'rgb(0 0 0)' }} />`)
    expect(lint(code, 'react')).toHaveLength(2)
  })

  it('is lifted by a zone, as every style is', () => {
    const code =
      `${LEAFLET}\nimport { Bespoke, ThirdParty } from '@polymorph/react-ui'\n` +
      `export const Depots = () => (\n` +
      `  <ThirdParty library="leaflet" reason="depot map"><Bespoke reason="legend"><div style={{ background: 'red' }} /></Bespoke></ThirdParty>\n` +
      `)\n`
    expect(lint(code, 'react')).toEqual([])
  })
})

/** A `style` that writes `red` for a colour, in each form the rule reads it through. */
const READ_THROUGH: Record<Framework, string[]> = {
  react: [
    `<div style={{ '--rdg-background-color': 'red' } as CSSProperties} />`,
    `<div style={{ color: 'red' } satisfies CSSProperties} />`,
    `<div style={({ color: 'red' })!} />`,
    `<div style={open ? { color: 'red' } : undefined} />`,
    `<div style={open && { color: 'red' }} />`,
    `<div style={{ height: 4, ...(open ? { color: 'red' } : {}) }} />`,
    `<div style={{ ...{ color: 'red' } }} />`,
    `<div style={{ ['color']: 'red' }} />`,
    "<div style={{ [`color`]: 'red' }} />",
    '<div style={`height: ${h}px; color: red`} />',
    `<div style={'height: ' + h + 'px; color: red'} />`,
    '<div style={{ border: `${w}px solid red` }} />',
    `<div style={'--c1-color: red'} />`,
    `<div style={'--grid_line-color: red'} />`,
    `<div css={{ '&:hover': { color: 'red' } }} />`,
    '<div css={css`&:hover { color: red }`} />',
  ],
  solid: [
    `<div style={{ '--rdg-background-color': 'red' } as JSX.CSSProperties} />`,
    `<div style={open ? { color: 'red' } : undefined} />`,
    `<div style={{ height: '4px', ...(open ? { color: 'red' } : {}) }} />`,
    `<div style={{ ['color']: 'red' }} />`,
    '<div style={`height: ${h}px; color: red`} />',
    `<div style="--c1-color: red" />`,
  ],
  vue: [
    `<div :style="[{ color: 'red' }]" />`,
    `<div :style="[{ height: '4px' }, open ? { color: 'red' } : {}]" />`,
    `<div :style="{ color: 'red' } as CSSProperties" />`,
    `<div :style="<CSSProperties>{ color: 'red' }" />`,
    `<div :style="open ? { color: 'red' } : undefined" />`,
    `<div :style="open && { color: 'red' }" />`,
    `<div :style="{ ...{ color: 'red' } }" />`,
    `<div :style="{ ['color']: 'red' }" />`,
    '<div :style="`height: ${h}px; color: red`" />',
    '<div :style="{ border: `${w}px solid red` }" />',
    `<div style="--c1-color: red" />`,
  ],
  svelte: [
    `<div style={open ? 'color: red' : null}></div>`,
    '<div style={`height: ${h}px; color: red`}></div>',
    `<div style="height: {h}px; color: red"></div>`,
    `<div style:color={open ? 'red' : null}></div>`,
    `<div style:border="{w}px solid red"></div>`,
    `<div style="--c1-color: red"></div>`,
  ],
  angular: [
    `<div [ngStyle]="open ? { color: 'red' } : null"></div>`,
    `<div [ngStyle]="open && { color: 'red' }"></div>`,
    `<div [ngStyle]="{ color: 'red' }!"></div>`,
    `<div [ngStyle]="{ height: h, ...{ color: 'red' } }"></div>`,
    `<div style="height: {{h}}px; color: red"></div>`,
    `<div [style]="'height: ' + h + 'px; color: red'"></div>`,
    `<div [style.border]="w + 'px solid red'"></div>`,
    `<div style="--c1-color: red"></div>`,
  ],
}

/** A `style` whose property names are not written out. */
const UNREAD: Record<Framework, string[]> = {
  react: [
    `<div style={styles} />`,
    `<div style={styleFor(tone)} />`,
    `<div style={theme.styles} />`,
    `<div style={open ? styles : undefined} />`,
    `<div style={{ ...base }} />`,
    `<div style={{ height: 4, ...(open ? base : {}) }} />`,
    `<div style={{ [key]: 'var(--pm-bg-subtle)' }} />`,
    "<div style={{ [`--grid-${name}`]: 'var(--pm-bg-subtle)' }} />",
    '<div style={`${base}; height: 4px`} />',
    '<div style={`border-${side}: 1px solid`} />',
  ],
  solid: [
    `<div style={styles} />`,
    `<div style={styles()} />`,
    `<div style={{ ...base }} />`,
    `<div style={{ [key]: 'var(--pm-bg-subtle)' }} />`,
    '<div style={`${base}; height: 4px`} />',
  ],
  vue: [
    `<div :style="styles" />`,
    `<div :style />`,
    `<div :style="styleFor(tone)" />`,
    `<div :style="[base, { height: '4px' }]" />`,
    `<div :style="{ ...base }" />`,
    `<div :style="{ [key]: 'var(--pm-bg-subtle)' }" />`,
  ],
  svelte: [
    `<div {style}></div>`,
    `<div style={styles}></div>`,
    `<div style="{base}"></div>`,
    `<div style="{base}; height: 4px"></div>`,
    `<div style={styleFor(tone)}></div>`,
  ],
  angular: [
    `<div [style]="styles"></div>`,
    `<div [ngStyle]="styles"></div>`,
    `<div [attr.style]="styles"></div>`,
    `<div [ngStyle]="styleFor(tone)"></div>`,
    `<div [ngStyle]="{ ...base }"></div>`,
    `<div style="{{base}}"></div>`,
    `<div [style]="styles | async"></div>`,
  ],
}

/** A `style` whose names are written out and whose values are computed: the rule reads no colour there. */
const READABLE: Record<Framework, string[]> = {
  react: [
    `<div style={{ height }} />`,
    `<div style={{ color: tone }} />`,
    `<div style={{ background: theme.color('bg.subtle') }} />`,
    '<div style={{ border: `1px solid ${tone}` }} />',
    `<div style={undefined} />`,
    `<div style={null} />`,
    `<div style={open && { height: 4 }} />`,
    `<div style={{ height: 4, ...(open ? { width: 8 } : {}) }} />`,
    `<div style={{ '--rdg-background-color': 'var(--pm-bg-surface)' } as CSSProperties} />`,
    '<div style={`height: ${h}px`} />',
  ],
  solid: [
    `<div style={{ height: height() }} />`,
    `<div style={{ 'border-color': theme().color('border.subtle') }} />`,
    `<div style={open() ? { width: '8px' } : undefined} />`,
  ],
  vue: [
    `<div :style="{ height }" />`,
    `<div :style="[{ height: h }, open ? { width: w } : {}]" />`,
    `<div :style="{ color: tone }" />`,
    `<div :style="{ '--rdg-background-color': 'var(--pm-bg-surface)' } as CSSProperties" />`,
  ],
  svelte: [
    `<div style:height={h}></div>`,
    `<div style:color></div>`,
    `<div style="height: {h}px"></div>`,
    `<div style={open ? 'height: 4px' : null}></div>`,
  ],
  angular: [
    `<div [style.color]="tone"></div>`,
    `<div [ngStyle]="{ height: h }"></div>`,
    `<div style="height: {{h}}px"></div>`,
    `<div [style]="null"></div>`,
    `<div [ngStyle]="open ? { height: h } : null"></div>`,
  ],
}

describe.each(FRAMEWORKS)('a `style` inside the boundary in %s', (framework) => {
  const screen = (inside: string) => SCREEN[framework](LEAFLET, inside)

  it.each(READ_THROUGH[framework])('is read for colour through `%s`', (inside) => {
    const reports = lint(screen(inside), framework)
    expect(reports.map(({ message }) => message.slice(0, 25))).toEqual([
      'Unexpected colour `red`. ',
    ])
  })

  it.each(UNREAD[framework])('is refused when its names are not written out: `%s`', (inside) => {
    const reports = lint(screen(inside), framework)
    expect(reports.map(({ rule }) => rule)).toEqual(['no-raw-styles'])
    const [{ message }] = reports as [Report]
    expect(message).toMatch(/^Unexpected `[^`]+` whose property names are not written out\. /)
    expect(message).toContain('write it in place')
    expect(message.length).toBeLessThan(MESSAGE_LIMIT)
    expect(alternativesIn(message, [1, 3, 4])).toEqual([{ rung: 4 }])
  })

  it.each(READABLE[framework])('takes a value computed where it is written: `%s`', (inside) => {
    expect(lint(screen(inside), framework)).toEqual([])
  })
})

describe('a `style` inside the boundary', () => {
  const screen = (inside: string) => SCREEN.react(LEAFLET, inside)

  it('is refused and read for colour where both apply', () => {
    const reports = lint(screen(`<div style={{ ...base, color: 'red' }} />`), 'react')
    expect(reports.map(({ message }) => message.slice(0, 25))).toEqual([
      'Unexpected `style` whose ',
      'Unexpected colour `red`. ',
    ])
  })

  it('is refused on the hosted component as on a plain element', () => {
    const code = SCREEN.react(
      `${LEAFLET}\nimport { MapContainer } from 'react-leaflet'`,
      `<MapContainer style={mapStyle} />`,
    )
    expect(lint(code, 'react').map(({ message }) => message.slice(0, 25))).toEqual([
      'Unexpected `style` whose ',
    ])
  })

  it('is lifted by a zone, as every style is', () => {
    const code =
      `${LEAFLET}\nimport { Bespoke, ThirdParty } from '@polymorph/react-ui'\n` +
      `export const Depots = () => (\n` +
      `  <ThirdParty library="leaflet" reason="depot map"><Bespoke reason="legend"><div style={styles} /></Bespoke></ThirdParty>\n` +
      `)\n`
    expect(lint(code, 'react')).toEqual([])
  })

  it('is reported as any `style` is outside a boundary that hosts', () => {
    const code = SCREEN.react('', `<div style={styles} />`)
    const messages = lint(code, 'react').map(({ message }) => message)
    expect(messages.some((message) => message.startsWith('Unexpected `style` on <div>.'))).toBe(
      true,
    )
    expect(messages.some((message) => message.includes('not written out'))).toBe(false)
  })
})

describe('what the boundary reads as its library', () => {
  it('reads a name written as a string expression', () => {
    for (const library of [`library={'leaflet'}`, 'library={`leaflet`}', 'library=" leaflet "']) {
      const code = SCREEN.react(`${LEAFLET}\nimport 'leaflet/dist/leaflet.css'`, '', library)
      expect(rulesOf(code, 'react'), library).toEqual([])
    }
  })

  it('reads a path inside the library as the library', () => {
    const code = SCREEN.react(
      `import Chart from 'chart.js/auto'\nvoid Chart`,
      STYLED.react,
      'library="chart.js"',
    )
    expect(rulesOf(code, 'react')).toEqual([])
  })

  it('does not read the library a wrapper draws as imported', () => {
    const code = SCREEN.react(
      `import { MapContainer } from 'react-leaflet'\nvoid MapContainer`,
      '',
      'library="react-leaflet"',
    )
    expect(rulesOf(code, 'react')).toEqual([])
    const sheet = SCREEN.react(
      `import { MapContainer } from 'react-leaflet'\nimport 'leaflet/dist/leaflet.css'\nvoid MapContainer`,
      '',
      'library="react-leaflet"',
    )
    const reports = lint(sheet, 'react')
    expect(reports.map(({ rule }) => rule)).toEqual(['no-app-css'])
    expect(reports[0]?.message).toContain('a binding from `leaflet`')
  })

  it('does not read a tag in a comment or a string', () => {
    const code =
      `// <ThirdParty library="leaflet" reason="…"> hosts a map.\n` +
      `import 'leaflet/dist/leaflet.css'\n` +
      `export const HINT = '<ThirdParty library="leaflet" reason="…">'\n`
    expect(rulesOf(code, 'react')).toEqual(['no-app-css'])
  })

  it('does not read a path alias as a library', () => {
    const code = SCREEN.react(`import '@/styles/depots.css'`, '', 'library="@/styles"')
    expect(rulesOf(code, 'react')).toEqual(['no-app-css', 'no-raw-styles'])
  })

  // An Angular module reads its template's text for the boundaries, so each
  // case names the library only where an attribute of another name holds it.
  it.each([
    [
      'a `data-library` attribute',
      '<pm-third-party [library]="name" data-library="recharts" reason="flow"><div></div></pm-third-party>',
    ],
    [
      'the word in its `reason`',
      `<pm-third-party [library]="name" reason="hosts library='recharts' here"><div></div></pm-third-party>`,
    ],
    [
      'a tag in a comment',
      '<!-- <pm-third-party library="recharts" reason="flow"></pm-third-party> --><div></div>',
    ],
  ])('does not read %s in an Angular template as the library', (_, template) => {
    const code =
      `import { Component } from '@angular/core'\nimport { Sankey } from 'recharts'\n` +
      `import { ThirdParty } from '@polymorph/angular-ui'\n\n` +
      `@Component({\n  selector: 'app-flow',\n  imports: [ThirdParty],\n` +
      `  template: \`${template}\`,\n})\n` +
      `export class Flow {\n  protected readonly name = 'recharts'\n  protected readonly chart = Sankey\n}\n`
    expect(rulesOf(code, 'angular')).toContain('no-external-dataviz')
  })
})

/**
 * Lint and the inventory read a boundary's tag and its `library` the same way
 * (`markup.js`). A boundary lint lifts for is then one the inventory lists
 * with its library, and one that hosts nothing for lint names no hosted
 * library in the inventory.
 */
describe('a boundary as lint and the inventory read it', () => {
  type Syntax = 'react' | 'vue' | 'svelte' | 'angular'
  const NAME = `const name = 'leaflet'\nvoid name`
  const HELD = '<div style="height: 320px"></div>'

  const WRITE: Record<Syntax, (open: string, close: string) => string> = {
    react: (open, close) =>
      `${LEAFLET}\n${NAME}\nimport { ThirdParty } from '@polymorph/react-ui'\n` +
      `export const Depots = () => ${open}<div style={{ height: '320px' }} />${close}\n`,
    vue: (open, close) =>
      `<script setup lang="ts">\n${LEAFLET}\n${NAME}\n` +
      `import { ThirdParty } from '@polymorph/vue-ui'\n</script>\n\n` +
      `<template>\n  ${open}${HELD}${close}\n</template>\n`,
    svelte: (open, close) =>
      `<script lang="ts">\n${LEAFLET}\n${NAME}\n` +
      `import { ThirdParty } from '@polymorph/svelte-ui'\n</script>\n\n${open}${HELD}${close}\n`,
    angular: (open, close) =>
      `import { Component } from '@angular/core'\n${LEAFLET}\n` +
      `import { ThirdParty } from '@polymorph/angular-ui'\n\n` +
      `@Component({\n  selector: 'app-depots',\n  imports: [ThirdParty],\n` +
      `  template: \`${open}${HELD}${close}\`,\n})\n` +
      `export class Depots {\n  protected readonly name = 'leaflet'\n}\n`,
  }

  const SCAN: Record<Syntax, (file: string, source: string) => Exception[]> = {
    react: scanSource,
    vue: scanMarkup,
    svelte: scanMarkup,
    angular: scanAngularComponent,
  }

  /** A boundary's tags as written, and whether it hosts `leaflet`. */
  const CASES: [Syntax, open: string, close: string, hosts: boolean][] = [
    ['react', '<ThirdParty library="leaflet" reason="map">', '</ThirdParty>', true],
    ['react', `<ThirdParty library={'leaflet'} reason="map">`, '</ThirdParty>', true],
    ['react', '<ThirdParty library={name} reason="map">', '</ThirdParty>', false],
    ['vue', '<ThirdParty library="leaflet" reason="map">', '</ThirdParty>', true],
    ['vue', '<third-party library="leaflet" reason="map">', '</third-party>', true],
    ['vue', '<third-party :library="name" reason="map">', '</third-party>', false],
    [
      'vue',
      `<third-party data-library="leaflet" reason="hosts library='leaflet' here">`,
      '</third-party>',
      false,
    ],
    // Vue resolves a lowercase tag only to a name the script imports.
    ['vue', '<thirdparty library="leaflet" reason="map">', '</thirdparty>', false],
    ['svelte', '<ThirdParty library="leaflet" reason="map">', '</ThirdParty>', true],
    ['svelte', `<ThirdParty library={'leaflet'} reason="map">`, '</ThirdParty>', false],
    // Svelte reads a tag as written, so this one is a custom element.
    ['svelte', '<third-party library="leaflet" reason="map">', '</third-party>', false],
    ['angular', '<pm-third-party library="leaflet" reason="map">', '</pm-third-party>', true],
    [
      'angular',
      '<pm-third-party [library]="name" data-library="leaflet" reason="map">',
      '</pm-third-party>',
      false,
    ],
  ]

  it.each(CASES)('%s: %s', (syntax, open, close, hosts) => {
    const code = WRITE[syntax](open, close)
    // Lint lifts the `style` the boundary holds only where the boundary hosts.
    expect(!rulesOf(code, syntax).includes('no-raw-styles'), 'lint lifts').toBe(hosts)
    expect(hostedLibraries(SCAN[syntax](FILES[syntax], code)), 'the inventory lists').toEqual(
      hosts ? ['leaflet'] : [],
    )
  })
})

describe('the boundary as an answer', () => {
  it('is read back as a rung-4 alternative', () => {
    expect(
      alternativesIn(
        "Unexpected stylesheet import `leaflet/dist/leaflet.css`. It is another library's: host " +
          'its component in `<ThirdParty library="leaflet" reason="…">` in this file (rung 4).',
        [4],
      ),
    ).toEqual([{ member: 'ThirdParty', prop: 'library', rung: 4 }])
  })
})

describe('the boundary on an elements page', () => {
  // An elements page is HTML, which no red rule reads, so the verifier says so rather than
  // reading it as an Angular template or returning an empty, lawful-looking result.
  const page =
    '<poly-third-party library="leaflet" reason="depot map">\n' +
    '  <div class="depots" style="height: 320px"></div>\n' +
    '</poly-third-party>\n'

  it('is not read, and the result says why', () => {
    const result = verifyCode(page, { framework: 'elements', filename: 'public/depots.html' })
    expect(result.diagnostics).toEqual([])
    expect(result.fatal).toBe('an elements page is HTML, and the red rules do not read HTML pages')
  })

  it('leaves a script beside the page read as React’s module would be, with no module to import from', () => {
    const script = `import { animate } from 'motion'\nexport const open = () => animate('.x', {})\n`
    const elements = verifyCode(script, { framework: 'elements', filename: 'public/depots.ts' })
    const react = verifyCode(script, { filename: 'public/depots.ts' })
    expect(elements.fatal).toBeNull()
    expect(elements.diagnostics.map(({ rule }) => rule)).toContain('polymorph/no-external-motion')
    expect(elements.diagnostics.map(({ rule }) => rule)).toEqual(
      react.diagnostics.map(({ rule }) => rule),
    )
  })
})
