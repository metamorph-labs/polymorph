import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectExceptions,
  DEFAULT_IGNORE,
  DEFAULT_INCLUDE,
  formatTable,
  hostedLibraries,
  inventoryFiles,
  RUNGS,
  scanAngularComponent,
  scanAngularTemplate,
  scanMarkup,
  scanSource,
  type Exception,
} from './inventory.js'

/**
 * The inventory.
 *
 * Two fixtures drive it: one screen that uses the ladder correctly and one that
 * bypasses it. The second shows that an undeclared deviation fails. It is a
 * committed fixture so the law can be tested without breaking the repo.
 */

const ROOT = process.cwd()

const read = (name: string) => readFileSync(resolve(ROOT, 'packages/rules/fixtures', name), 'utf8')

const declared = scanSource(
  'fixtures/app-declared-exceptions.tsx',
  read('app-declared-exceptions.tsx'),
)
const sneaky = scanSource(
  'fixtures/app-undeclared-deviation.tsx',
  read('app-undeclared-deviation.tsx'),
)

const kinds = (found: Exception[]) => found.map((exception) => exception.kind)

describe('the declared ladder', () => {
  it('finds rung 2, a contextual scope, and which one', () => {
    const scopes = declared.filter((exception) => exception.rung === RUNGS.scope)
    expect(kinds(scopes)).toEqual(['DensityScope', 'ToneScope'])
    expect(scopes[0]?.reason).toBe('compact')
    expect(scopes[1]?.reason).toBe('inverse')
  })

  it('finds rung 3, a patch, and the decision it re-assigns', () => {
    const patches = declared.filter((exception) => exception.rung === RUNGS.patch)
    expect(kinds(patches)).toEqual(['Card patch'])
    expect(patches[0]?.reason).toContain('radius')
  })

  it('finds rung 4, a Bespoke zone, and reports its reason', () => {
    const zones = declared.filter((exception) => exception.rung === RUNGS.bespoke)
    expect(zones).toHaveLength(1)
    expect(zones[0]?.reason).toContain("what's-new panel")
  })

  it('reports no undeclared deviation, because the disable is inside the zone', () => {
    // The rule is turned off in that file, but inside a declared zone, which is
    // what makes it lawful.
    expect(declared.filter((exception) => exception.rung === RUNGS.undeclared)).toEqual([])
  })

  it('records a line for every finding, so the table gives a location', () => {
    for (const exception of declared) expect(exception.line, exception.kind).toBeGreaterThan(0)
  })
})

describe('the undeclared deviation', () => {
  it('is found and labelled as an undeclared disable', () => {
    const undeclared = sneaky.filter((exception) => exception.rung === RUNGS.undeclared)
    expect(undeclared).toHaveLength(1)
    expect(undeclared[0]?.kind).toBe('undeclared disable')
    expect(undeclared[0]?.reason).toContain('polymorph/no-raw-interactive')
  })

  it('is what makes `pnpm inventory` exit non-zero', () => {
    // The CLI's only failure condition, asserted here instead of by running it.
    // A rung is a decision, and only a missing rung is a defect.
    expect(sneaky.some((exception) => exception.rung === null)).toBe(true)
  })

  it('ignores a disable that names another plugin’s rule', () => {
    const found = scanSource(
      'x.tsx',
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any\nconst a: any = 1\n',
    )
    expect(found).toEqual([])
  })

  it('is still found next to a childless <Bespoke/>, which covers nothing', () => {
    /*
     * A self-closing zone has no children, so it covers no disable except its
     * own. Scoping it to its parent (one `.parent` too many) would cover every
     * sibling in the enclosing element. This file would then report one declared
     * exception and miss the undeclared disable beside it.
     */
    const found = scanSource(
      'x.tsx',
      [
        'const Screen = () => (',
        '  <div>',
        '    <Bespoke reason="promo art" />',
        '    {/* eslint-disable-next-line polymorph/no-raw-interactive */}',
        '    <button onClick={go}>Go</button>',
        '  </div>',
        ')',
      ].join('\n'),
    )

    expect(kinds(found)).toEqual(['Bespoke', 'undeclared disable'])
  })

  it('does not mistake text about a disable for a disable', () => {
    // The message the CLI prints quotes the syntax it forbids. A file explaining
    // the ladder must not fail the build for describing it.
    const found = scanSource(
      'x.tsx',
      'const help = "eslint-disable-next-line polymorph/no-raw-interactive is not the way"\n',
    )
    expect(found).toEqual([])
  })
})

describe('what the inventory looks at', () => {
  it('scans application code, because exceptions are made from the vocabulary', () => {
    expect(DEFAULT_INCLUDE).toEqual([
      'apps/**/*.ts',
      'apps/**/*.tsx',
      'apps/**/*.vue',
      'apps/**/*.svelte',
      'apps/**/*.html',
    ])
  })

  it('keeps the harness exemption identical to the one ESLint uses', () => {
    // Declared in three places (here, `eslint.config.ts`, `repo-laws.test.ts`),
    // so widening it takes three deliberate edits instead of one.
    expect(DEFAULT_IGNORE).toContain('apps/*/src/harness/**')
  })

  it('finds real files under that rule', () => {
    const files = inventoryFiles(ROOT)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(file.startsWith('apps/'), file).toBe(true)
      expect(file.includes('/harness/'), file).toBe(false)
    }
  })

  /**
   * Relay's exception count, the repo's main measure of vocabulary coverage.
   *
   * Relay is a three-screen product with a table, a validated form, a confirm
   * dialog, toasts and four live theme axes. It deviates from the vocabulary
   * twice, both times intentionally and by name. Everything else is vocabulary,
   * because the red rules leave no other place to put a decision.
   *
   * A third exception here is not a failure to work around. It means the
   * vocabulary is missing a member, which is the signal this mechanism exists
   * to give.
   *
   * The workbench also hosts two components from other libraries
   * (`apps/workbench/src/hosted`), each inside a boundary that names its
   * library. They are the worked examples of that route, not Relay's.
   */
  it('reports exactly the exceptions the workbench declares, and no others', () => {
    const found = collectExceptions(ROOT)

    expect(
      found.map((exception) => `${exception.rung} ${exception.kind} ${exception.file}`),
    ).toEqual([
      '4 ThirdParty apps/workbench/src/hosted/DepotMap.tsx',
      '4 ThirdParty apps/workbench/src/hosted/NoteEditor.tsx',
      '2 DensityScope apps/workbench/src/relay/InboxPage.tsx',
      '4 Bespoke apps/workbench/src/relay/WhatsNew.tsx',
    ])
  })

  it('names the two libraries the workbench hosts', () => {
    // The hosted examples (`apps/workbench/src/hosted`): a map and a rich-text editor.
    expect(hostedLibraries(collectExceptions(ROOT))).toEqual(['@tiptap/core', 'leaflet'])
  })

  it('finds nothing undeclared anywhere in the product', () => {
    // The failing condition, stated separately. Declared exceptions are the
    // ladder working as designed, and an undeclared one bypasses it.
    expect(collectExceptions(ROOT).filter((exception) => exception.rung === null)).toEqual([])
  })

  it('gives the rung-4 zone a reason specific enough to review', () => {
    const [bespoke] = collectExceptions(ROOT).filter(
      (exception) => exception.rung === RUNGS.bespoke,
    )
    expect(bespoke?.reason.length, 'a one-word reason is not a reason').toBeGreaterThan(30)
  })
})

describe('a boundary around another library’s component', () => {
  const REASON = 'depot map: no member draws map tiles'
  const hosted = scanSource('fixtures/app-third-party.tsx', read('app-third-party.tsx'))

  it('is found at rung 4, with the library it names and its reason', () => {
    expect(hosted).toEqual([
      {
        file: 'fixtures/app-third-party.tsx',
        line: 16,
        rung: RUNGS.bespoke,
        kind: 'ThirdParty',
        library: 'leaflet',
        reason: REASON,
      },
    ])
  })

  it('is found in a Vue template, in Svelte markup and in an Angular template', () => {
    const read3 = [
      scanMarkup('fixtures/vue/app-third-party.vue', read('vue/app-third-party.vue')),
      scanMarkup('fixtures/svelte/app-third-party.svelte', read('svelte/app-third-party.svelte')),
      scanAngularComponent(
        'fixtures/angular/app-third-party.component.ts',
        read('angular/app-third-party.component.ts'),
      ),
    ]
    for (const found of read3) {
      expect(found.map(({ rung, kind, library, reason }) => [rung, kind, library, reason])).toEqual(
        [[RUNGS.bespoke, 'ThirdParty', 'leaflet', REASON]],
      )
    }
  })

  it('gives the libraries an application hosts, each once', () => {
    const second = scanSource(
      'apps/app/src/Notes.tsx',
      `export const Notes = () => (
        <>
          <ThirdParty library="@tiptap/react" reason="rich text: no member edits marks">{null}</ThirdParty>
          <ThirdParty library="leaflet" reason="a second map">{null}</ThirdParty>
        </>
      )`,
    )
    expect(hostedLibraries([...hosted, ...declared, ...second])).toEqual([
      '@tiptap/react',
      'leaflet',
    ])
    expect(hostedLibraries(declared)).toEqual([])
  })

  it('names the library in the table', () => {
    expect(formatTable(hosted)).toMatch(
      /rung 4\s+fixtures\/app-third-party\.tsx:16\s+ThirdParty leaflet/,
    )
  })

  /**
   * A boundary hosts nothing unless its `library` is written out, and lint
   * reports it (`no-raw-styles`). The inventory reads the same attribute the
   * same way: a missing, an empty or a computed one is no library, so the
   * boundary is listed with no rung, which fails the run, and the list of
   * hosted libraries never holds a placeholder or an expression.
   */
  describe('with no library written out', () => {
    const NAMELESS = [null, 'ThirdParty with no library', undefined]
    const read = (found: Exception[]) =>
      found.map(({ rung, kind, library }) => [rung, kind, library])

    it('is listed with no rung in TSX, and names no hosted library', () => {
      const found = scanSource(
        'apps/app/src/Map.tsx',
        `export const A = () => (
          <>
            <ThirdParty />
            <ThirdParty library="" reason="b" />
            <ThirdParty library={name} reason="c" />
            <ThirdParty library={\`\${scope}/core\`} reason="d" />
            <ThirdParty library={'leaflet'} reason="e" />
            <ThirdParty library={\`chart.js\`} reason="f" />
          </>
        )`,
      )
      expect(read(found)).toEqual([
        NAMELESS,
        NAMELESS,
        NAMELESS,
        NAMELESS,
        [RUNGS.bespoke, 'ThirdParty', 'leaflet'],
        [RUNGS.bespoke, 'ThirdParty', 'chart.js'],
      ])
      expect(found[0]?.reason).toBe('(no reason given)')
      expect(found[2]?.reason).toBe('c')
      expect(hostedLibraries(found)).toEqual(['chart.js', 'leaflet'])
    })

    it('is listed with no rung in a Vue template, Svelte markup and an Angular template', () => {
      const vue = scanMarkup(
        'apps/app/src/Map.vue',
        '<template><ThirdParty :library="name" reason="a" /><ThirdParty v-bind:library="name" reason="b" /><ThirdParty reason="c" /><ThirdParty library="leaflet" reason="d" /></template>',
      )
      expect(read(vue)).toEqual([NAMELESS, NAMELESS, NAMELESS, [4, 'ThirdParty', 'leaflet']])
      const svelte = scanMarkup(
        'apps/app/src/Map.svelte',
        `<ThirdParty library={name} reason="a" /><ThirdParty library="{name}" reason="b" /><ThirdParty library={'leaflet'} reason="c" /><ThirdParty library="leaflet" reason="d" />`,
      )
      expect(read(svelte)).toEqual([NAMELESS, NAMELESS, NAMELESS, [4, 'ThirdParty', 'leaflet']])
      const angular = scanAngularTemplate(
        'apps/app/src/map.component.html',
        '<pm-third-party [library]="name" reason="a" /><pm-third-party library="{{ name }}" reason="b" /><pm-third-party library="leaflet" reason="c" />',
      )
      expect(read(angular)).toEqual([NAMELESS, NAMELESS, [4, 'ThirdParty', 'leaflet']])
      expect(hostedLibraries([...vue, ...svelte, ...angular])).toEqual(['leaflet'])
    })

    it('is told from a declared one in the table, by the missing rung', () => {
      const found = scanSource(
        'apps/app/src/Map.tsx',
        'export const A = () => <ThirdParty library={name} reason="depot map" />',
      )
      expect(formatTable(found)).toMatch(
        /—\s+apps\/app\/src\/Map\.tsx:1\s+ThirdParty with no library\s+depot map/,
      )
    })
  })

  // An attribute of another name, and the words inside a value, name no library.
  it('reads the library from the attribute of that name only', () => {
    const tags = [
      `<ThirdParty reason="hosts library='recharts' here" :library="name" />`,
      `<ThirdParty :library="name" data-library="recharts" reason="flow" />`,
    ]
    for (const tag of tags) {
      const found = scanMarkup('apps/app/src/Flow.vue', `<template>${tag}</template>`)
      expect(hostedLibraries(found), tag).toEqual([])
      expect(found.map(({ rung }) => rung)).toEqual([null])
    }
    const angular = scanAngularTemplate(
      'apps/app/src/flow.component.html',
      `<pm-third-party reason="hosts library='recharts' here" [library]="name" data-library="recharts"></pm-third-party>`,
    )
    expect(hostedLibraries(angular)).toEqual([])
    // A tag in a comment is no tag.
    expect(
      scanAngularTemplate(
        'apps/app/src/flow.component.html',
        '<!-- <pm-third-party library="recharts" reason="flow"></pm-third-party> -->',
      ),
    ).toEqual([])
  })

  it('says so when no reason is written', () => {
    const [bare] = scanSource(
      'apps/app/src/Map.tsx',
      'export const A = () => <ThirdParty library="leaflet" />',
    )
    expect(bare?.reason).toBe('(no reason given)')
  })

  it('does not account for a disable, which only a Bespoke zone does', () => {
    const widened = scanSource(
      'apps/app/src/Map.tsx',
      `export const A = () => (
        <ThirdParty library="leaflet" reason="depot map">
          {/* eslint-disable-next-line polymorph/no-raw-interactive -- zoom */}
          <button>Zoom in</button>
        </ThirdParty>
      )`,
    )
    expect(widened.map(({ rung, kind }) => [rung, kind])).toEqual([
      [RUNGS.bespoke, 'ThirdParty'],
      [RUNGS.undeclared, 'undeclared disable'],
    ])
  })
})

describe('the table', () => {
  it('says so when there is nothing to report', () => {
    expect(formatTable([])).toContain('Every screen is vocabulary')
  })

  it('puts the rung, the location, the kind and the reason in one row', () => {
    const table = formatTable(declared)
    expect(table).toContain('RUNG')
    expect(table).toContain('rung 4')
    expect(table).toContain('fixtures/app-declared-exceptions.tsx:')
    expect(table).toContain("what's-new panel")
  })

  it('marks an undeclared deviation as having no rung at all', () => {
    expect(formatTable(sneaky)).toMatch(/—\s+fixtures\/app-undeclared-deviation\.tsx/)
  })
})

describe('a Vue or Svelte component', () => {
  const vue = scanMarkup(
    'fixtures/vue/app-declared-exceptions.vue',
    read('vue/app-declared-exceptions.vue'),
  )
  const svelte = scanMarkup(
    'fixtures/svelte/app-undeclared-deviation.svelte',
    read('svelte/app-undeclared-deviation.svelte'),
  )

  it('finds every declared rung in the markup, with its value, patch and reason', () => {
    expect(vue.map((exception) => [exception.rung, exception.kind, exception.reason])).toEqual([
      [RUNGS.scope, 'DensityScope', 'compact'],
      [RUNGS.scope, 'ToneScope', 'inverse'],
      [RUNGS.patch, 'Card patch', "{ radius: 'lg' }"],
      [RUNGS.bespoke, 'Bespoke', "The what's-new panel draws its own confetti"],
    ])
  })

  it('finds a patch in each spelling the syntax has, with the expression it is bound to', () => {
    const patches = (file: string, markup: string) =>
      scanMarkup(file, markup).map((exception) => [exception.kind, exception.reason])
    expect(
      patches(
        'apps/app/src/Cards.vue',
        `<template><Card :patch="{ radius: 'lg' }" /><Card v-bind:patch="rounder" /><Card patch /></template>`,
      ),
    ).toEqual([
      ['Card patch', "{ radius: 'lg' }"],
      ['Card patch', 'rounder'],
      ['Card patch', '(empty patch)'],
    ])
    // A Svelte object literal has braces inside the braces that bind it.
    expect(
      patches(
        'apps/app/src/Cards.svelte',
        `<Card patch={{ radius: 'lg' }} /><Card patch={rounder} />`,
      ),
    ).toEqual([
      ['Card patch', "{ radius: 'lg' }"],
      ['Card patch', 'rounder'],
    ])
  })

  it('counts a disable inside a zone or a string as declared, at its line in the file', () => {
    expect(vue.filter((exception) => exception.rung === RUNGS.undeclared)).toEqual([])
    expect(vue.find((exception) => exception.kind === 'DensityScope')?.line).toBe(9)
  })

  it('reports a disable in the script and one in markup outside a self-closing zone', () => {
    const undeclared = svelte.filter((exception) => exception.rung === RUNGS.undeclared)
    expect(undeclared.map((exception) => [exception.line, exception.reason])).toEqual([
      [4, 'polymorph/no-raw-styles'],
      [13, 'polymorph/no-raw-interactive'],
    ])
    expect(kinds(svelte)).toContain('ToneScope')
    expect(svelte.find((exception) => exception.kind === 'ToneScope')?.reason).toBe('inverse')
  })
})

/**
 * Vue resolves a tag to a component by more than its spelling, and lint reads
 * a tag as Vue does (`vueTagName`). The inventory reads it the same way, so a
 * zone or a boundary lint honours is one the inventory lists.
 */
describe('a Vue tag in kebab case or lower case', () => {
  const sfc = (imports: string, template: string) =>
    `<script setup lang="ts">\nimport { ${imports} } from '@polymorph/vue-ui'\n</script>\n\n<template>\n${template}\n</template>\n`

  it('is the member lint reads it as', () => {
    const found = scanMarkup(
      'apps/app/src/Map.vue',
      sfc(
        'Bespoke, Card, DensityScope, ThirdParty, ToneScope',
        [
          '  <third-party library="leaflet" reason="depot map"><div /></third-party>',
          '  <bespoke reason="promo art"><div /></bespoke>',
          '  <density-scope value="compact"><card :patch="{ radius: \'lg\' }" /></density-scope>',
          '  <tone-scope value="inverse" />',
        ].join('\n'),
      ),
    )
    expect(found.map(({ line, rung, kind }) => [line, rung, kind])).toEqual([
      [6, RUNGS.bespoke, 'ThirdParty'],
      [7, RUNGS.bespoke, 'Bespoke'],
      [8, RUNGS.scope, 'DensityScope'],
      [8, RUNGS.patch, 'Card patch'],
      [9, RUNGS.scope, 'ToneScope'],
    ])
    expect(hostedLibraries(found)).toEqual(['leaflet'])
  })

  it('accounts for a disable inside a <bespoke> zone, to its end tag', () => {
    const template = [
      '  <bespoke reason="promo art">',
      '    <!-- eslint-disable-next-line polymorph/no-raw-interactive -->',
      '    <button>Go</button>',
      '  </bespoke>',
      '  <!-- eslint-disable-next-line polymorph/no-raw-interactive -->',
      '  <button>Stop</button>',
    ].join('\n')
    const found = scanMarkup('apps/app/src/Promo.vue', sfc('Bespoke', template))
    expect(found.map(({ line, rung, kind }) => [line, rung, kind])).toEqual([
      [6, RUNGS.bespoke, 'Bespoke'],
      [10, RUNGS.undeclared, 'undeclared disable'],
    ])
  })

  it('is an element where Vue reads one: a name the script does not import, and Svelte markup', () => {
    const zone =
      '<bespoke reason="promo art"><!-- eslint-disable polymorph/no-raw-styles --></bespoke>'
    // Lower case with no hyphen resolves only to a name the script imports.
    expect(kinds(scanMarkup('apps/app/src/Promo.vue', sfc('Card', zone)))).toEqual([
      'undeclared disable',
    ])
    // Svelte's tags are case sensitive.
    expect(kinds(scanMarkup('apps/app/src/Promo.svelte', zone))).toEqual(['undeclared disable'])
    expect(
      kinds(
        scanMarkup('apps/app/src/Map.svelte', '<third-party library="leaflet" reason="map" />'),
      ),
    ).toEqual([])
  })
})

describe('an Angular component', () => {
  const angular = scanAngularComponent(
    'fixtures/angular/app-declared-exceptions.component.ts',
    read('angular/app-declared-exceptions.component.ts'),
  )

  it('finds every declared rung in its inline template, by the members’ selectors', () => {
    expect(
      angular
        .filter((exception) => exception.rung !== RUNGS.undeclared)
        .map((exception) => [exception.line, exception.rung, exception.kind, exception.reason]),
    ).toEqual([
      [11, RUNGS.scope, 'DensityScope', 'compact'],
      [12, RUNGS.scope, 'ToneScope', 'inverse'],
      [13, RUNGS.patch, 'Card patch', "{ radius: 'lg' }"],
      [16, RUNGS.bespoke, 'Bespoke', "The what's-new panel draws its own confetti"],
    ])
  })

  it('reports a disable in its template outside the zone, at its line in the module', () => {
    expect(
      angular
        .filter((exception) => exception.rung === RUNGS.undeclared)
        .map((exception) => [exception.line, exception.reason]),
    ).toEqual([[20, 'polymorph/no-raw-interactive']])
  })

  it('reads an external template as it reads an inline one', () => {
    expect(
      scanAngularTemplate(
        'apps/app/src/x.component.html',
        '<pm-bespoke reason="art"></pm-bespoke>',
      ),
    ).toEqual([
      {
        file: 'apps/app/src/x.component.html',
        line: 1,
        rung: RUNGS.bespoke,
        kind: 'Bespoke',
        reason: 'art',
      },
    ])
  })
})
