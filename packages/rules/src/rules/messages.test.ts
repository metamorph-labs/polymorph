import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { RULE_CLIMB } from '../ladder'
import { verifyCode, verifyCss, type Diagnostic } from '../verify'
import { MESSAGE_LIMIT } from './advice'

/**
 * The standard every report is held to (`advice.ts`): it carries its answer,
 * either as the rule's fix or as the alternatives it names, and it fits in 200
 * characters. This runs a corpus with one of each kind of report, in TSX, a
 * Vue template, Svelte markup, Solid TSX and an Angular component, through `verify`, the path the
 * MCP server's `validate` takes, so what is checked is what an agent receives.
 */

const ROOT = process.cwd()
const fixture = (name: string) =>
  readFileSync(resolve(ROOT, 'packages/rules/fixtures', name), 'utf8')

/**
 * A boundary that names no library, one the file imports no binding from, one
 * that is no package, and one each for polymorph's own package and a
 * framework's runtime.
 */
const UNHOSTED = `export const A = () => <><ThirdParty reason="map" /><ThirdParty library="made-up" reason="map" /><ThirdParty library="@/maps" reason="map" /><ThirdParty library="@polymorph/react-ui" reason="map" /><ThirdParty library="react" reason="map" /></>`

/**
 * A hosted library's file: a colour no pattern names, one with no role near
 * it, a colour function, and a `style` whose property names are not written
 * out, on a component with a long name.
 */
const HOSTED_COLOURS = `<div style={{ background: 'red', color: '#12f3a9', outline: '1px solid color-mix(in oklch, var(--pm-accent-bg), white)' }} /><MapContainerWithClusteredMarkers style={mapStyle} />`

/** One snippet per kind of report the application rules make. */
const SCREENS = [
  fixture('app-violations.tsx'),
  `const brand = '#4087de'; const s = { color: '#fff', borderRadius: '6px', fontSize: '15px', width: '320px' }`,
  `export const A = () => <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: 'red', fontWeight: 600, position: 'absolute' }} />`,
  `export const A = () => <div style={{ marginTop: 8 }} />`,
  `export const A = () => <div className="flex gap-2 p-4 items-center justify-between border rounded-lg" />`,
  `export const A = () => <p className="text-sm text-gray-500" />`,
  `export const A = () => <h2 className={styles.title} />`,
  `export const A = () => <a className="btn" href="/x" />`,
  `export const A = () => <><span className="text-sm text-gray-500" /><span className="badge" /><body className="font-sans" /></>`,
  `export const A = () => <p className="mt-2 max-w-prose text-sm text-gray-500 font-medium leading-6 tracking-tight underline" />`,
  `export const A = () => <div style={{ flexWrap: 'wrap' }} />`,
  // Two steps equally near, a negative length, a type size in the `font` shorthand.
  `const s = { marginTop: '10px', paddingInline: '80px', borderRadius: '6px', fontSize: '15px', margin: '-12px', font: '15px serif', minHeight: '34px' }`,
  `import { Card } from '@polymorph/react-ui'\nexport function Row({ Card }) { return <Card className="wide" /> }`,
  ...['search', 'password', 'color', 'datetime-local', 'radio', 'hidden', 'reset', 'month'].map(
    (type) => `export const A = () => <input type="${type}" />`,
  ),
  `export const A = () => <input type={kind} />`,
  `export const A = () => <select multiple />`,
  `export const A = () => <select>${'<option>x</option>'.repeat(12)}</select>`,
  `export const A = () => <textarea value={v} onChange={handle} />`,
  `export const A = () => <a href="/x" onClick={track}>x</a>`,
  `export const A = () => <tr onClick={open} />`,
  `export const A = () => <button onClick={close}><Icon name="close" /></button>`,
  `import { Rocket, Trash2 } from 'lucide-react'\nexport const A = () => <><Rocket /><Trash2 size={20} /></>`,
  `import { RotateCw } from 'lucide-react'\nexport const A = () => <RotateCw />`,
  `import { TrashIcon, CheckCircleIcon } from '@heroicons/react/24/outline'`,
  `export const A = () => <svg aria-label="Close" />`,
  `import { motion } from 'framer-motion'\nexport const A = () => <motion.div animate={{ height: 0 }} />`,
  `import { useSpring } from '@react-spring/web'`,
  `import gsap from 'gsap'`,
  `import { ResponsivePie } from '@nivo/pie'`,
  `import { scaleLinear } from 'd3-scale'`,
  `import { sankey } from 'd3-sankey'`,
  // Re-exports, which hand a library out as an import does.
  `export * from 'framer-motion'`,
  `export { AnimatePresence } from 'framer-motion'`,
  `export * from 'd3-scale'`,
  `export { BarChart } from 'recharts'`,
  `export const A = () => <><Hero title="a" /><PageHeader title="b" /><ConversationPage title="c" /></>`,
  // A boundary that hosts nothing, and the stylesheets no boundary here lifts.
  `import { ThirdParty } from '@polymorph/react-ui'\nimport 'bootstrap/dist/css/bootstrap.css'\nimport 'normalize.css'\n${UNHOSTED}`,
  `import { latLng } from 'leaflet'\nimport { ThirdParty } from '@polymorph/react-ui'\nexport const A = () => <ThirdParty library="leaflet" reason="map">${HOSTED_COLOURS}</ThirdParty>\nvoid latLng`,
]

/** The reports the rules make about a Vue single-file component, one of each kind. */
const sfc = (template: string, script = '') =>
  `<script setup lang="ts">\n${script}\n</script>\n\n<template>\n  ${template}\n</template>\n`

const VUE_SCREENS = [
  fixture('vue/app-violations.vue'),
  sfc(
    `<div class="flex gap-2 p-4" style="display: flex; gap: 12px" :style="{ marginTop: '8px' }" />`,
  ),
  sfc('<p class="text-sm text-gray-500" /><span class="badge" />'),
  sfc(`<button type="button" @click="save">Save</button><button><Icon name="close" /></button>`),
  sfc(
    '<input type="search" /><input type="month" /><select multiple /><textarea /><a href="/x" @click="track">x</a><tr @click="open" />',
  ),
  sfc('<svg aria-label="Close" /><Transition><p>a</p></Transition>'),
  `${sfc('<Card />')}\n<style>\n@keyframes pop {\n  to {\n    opacity: 1;\n  }\n}\n</style>\n`,
  sfc('<Bar />', "import { Bar } from 'vue-chartjs'\nimport { useMotion } from '@vueuse/motion'"),
  sfc(
    '<ThirdParty reason="map" /><third-party library="made-up" reason="map" /><ThirdParty library="@/maps" reason="map" /><ThirdParty library="@polymorph/vue-ui" reason="map" /><ThirdParty library="vue" reason="map" />',
    "import { ThirdParty } from '@polymorph/vue-ui'\nimport 'bootstrap/dist/css/bootstrap.css'",
  ),
  sfc(
    `<ThirdParty library="leaflet" reason="map"><div style="background: red; color: #12f3a9" :style="{ outline: '1px solid color-mix(in oklch, var(--pm-accent-bg), white)' }" /><div v-bind:style="styles" /></ThirdParty>`,
    "import { latLng } from 'leaflet'\nimport { ThirdParty } from '@polymorph/vue-ui'\nvoid latLng",
  ),
]

/** The reports the rules make about a Svelte component, one of each kind. */
const component = (markup: string, script = '') =>
  `<script lang="ts">\n${script}\n</script>\n\n${markup}\n`

const SVELTE_SCREENS = [
  fixture('svelte/app-violations.svelte'),
  component(
    `<div class="flex gap-2 p-4" class:hidden={closed} style="display: flex; gap: 12px" style:margin-top="8px"></div>`,
  ),
  component('<p class="text-sm text-gray-500"></p><span class="badge"></span><Stack gap="12px" />'),
  component(
    '<button type="button" onclick={save}>Save</button><button><Icon name="close" /></button>',
  ),
  component(
    '<input type="search" /><input type="month" /><select multiple></select><textarea></textarea><a href="/x" on:click={track}>x</a><tr onclick={open}></tr>',
  ),
  component(
    '<svg aria-label="Close"></svg><p transition:fade>a</p><p in:slide>b</p><li animate:flip>c</li>',
    "import { fade, slide } from 'svelte/transition'",
  ),
  `${component('<Card />')}\n<style>\n  @keyframes pop {\n    to {\n      opacity: 1;\n    }\n  }\n</style>\n`,
  component(
    '<Bar />',
    "import { Bar } from 'svelte-chartjs'\nimport { Trash2 } from 'lucide-svelte'\nimport { spring } from 'svelte/motion'",
  ),
  component(
    '<ThirdParty reason="map" /><ThirdParty library="made-up" reason="map" /><ThirdParty library="@/maps" reason="map" /><ThirdParty library="@polymorph/svelte-ui" reason="map" /><ThirdParty library="svelte" reason="map" />',
    "import { ThirdParty } from '@polymorph/svelte-ui'\nimport 'bootstrap/dist/css/bootstrap.css'",
  ),
  component(
    `<ThirdParty library="leaflet" reason="map"><div style="background: red" style:outline="1px solid {w}"></div><div {style}></div></ThirdParty>`,
    "import { latLng } from 'leaflet'\nimport { ThirdParty } from '@polymorph/svelte-ui'\nvoid latLng",
  ),
]

/** The reports the rules make about Solid TSX, one of each kind. */
const SOLID_SCREENS = [
  fixture('solid/app-violations.tsx'),
  `export const A = () => <div class="flex gap-2 p-4" classList={{ 'text-sm': true }} style="display: flex; gap: 12px" />`,
  `export const A = () => <><div onclick={open} /><li on:click={open} /><a href="/x" oncapture:click={track} /></>`,
  `import { Card } from '@polymorph/solid-ui'\nexport function Row({ Card }) { return <Card class="wide" /> }`,
  `export const A = () => <textarea value={note()} onChange={(e) => setNote(e.target.value)} />`,
  `import { Trash2, Rocket } from 'lucide-solid'\nexport const A = () => <><Trash2 /><Rocket /></>`,
  `import { Motion, Presence } from 'solid-motionone'\nexport const A = () => <Presence><Motion.div animate={{ opacity: 1 }} /></Presence>`,
  `import { Line } from 'solid-chartjs'`,
  `import { ThirdParty } from '@polymorph/solid-ui'\nimport 'bootstrap/dist/css/bootstrap.css'\n${UNHOSTED}`,
  `import { latLng } from 'leaflet'\nimport { ThirdParty } from '@polymorph/solid-ui'\nexport const A = () => <ThirdParty library="leaflet" reason="map">${HOSTED_COLOURS}</ThirdParty>\nvoid latLng`,
]

/** The reports the rules make about an Angular component, one of each kind. */
const angular = (template: string, script = '', metadata = '') =>
  `import { Component } from '@angular/core'\n${script}\n@Component({\n  selector: 'app-inbox',${metadata}\n  template: \`${template}\`,\n})\nexport class Inbox {}\n`

const ANGULAR_SCREENS = [
  fixture('angular/app-violations.component.ts'),
  angular(
    `<div class="flex gap-2 p-4" [class.hidden]="closed" style="display: flex; gap: 12px" [style.margin-top.px]="8"></div>`,
  ),
  angular(
    '<p class="text-sm text-gray-500"></p><span class="badge"></span><pm-stack gap="12px" /><pm-card [ngClass]="x" />',
  ),
  angular(
    '<button type="button" (click)="save()">Save</button><button><pm-icon name="close" /></button>',
  ),
  angular(
    '<input type="search" /><input type="month" /><select multiple></select><textarea></textarea><a href="/x" (click)="track()">x</a><tr (click)="open()"></tr>',
  ),
  angular(
    '<svg aria-label="Close"></svg><p [@fade]="on">a</p><p animate.enter="in">b</p><li [@wobble]="x">c</li>',
  ),
  angular('<pm-card />', '', '\n  styles: `@keyframes pop { to { opacity: 1 } }`,'),
  angular(
    '<p>Chart</p>',
    "import { BaseChartDirective } from 'ng2-charts'\nimport { LucideAngularModule, Trash2 } from 'lucide-angular'\nimport { trigger } from '@angular/animations'",
  ),
  angular(
    '<pm-third-party reason="map" /><pm-third-party library="made-up" reason="map" /><pm-third-party library="@/maps" reason="map" /><pm-third-party library="@polymorph/angular-ui" reason="map" /><pm-third-party library="@angular/platform-browser-dynamic" reason="map" />',
    "import 'bootstrap/dist/css/bootstrap.css'\nimport 'normalize.css'",
  ),
  angular(
    `<pm-third-party library="leaflet" reason="map"><div style="background: red" [style.color]="'#12f3a9'" [ngStyle]="{ outline: '1px solid color-mix(in oklch, var(--pm-accent-bg), white)' }"></div><div [attr.style]="styles"></div></pm-third-party>`,
    "import { latLng } from 'leaflet'\nvoid latLng",
  ),
]

const STYLESHEETS = [
  '.hero {\n  transition: opacity 200ms;\n}\n',
  '[data-member="date-picker"][data-state="open"] .x {\n  animation: pop 200ms;\n}\n',
  '@keyframes pop {\n  to {\n    opacity: 1;\n  }\n}\n',
  '.a {\n  color: var(--pm-motion-duration-surface-exti);\n}\n',
  fixture('app-css-violations.css'),
  // A token of each family, the longest names first, so the longest report is in the corpus.
  '.a {\n  --pm-selection-bg-hover: red;\n  --pm-control-height-md: 1px;\n  --pm-radius-control: 0;\n  --pm-motion-duration-surface-exit: 0s;\n}\n',
  '[data-palette="petrol"][data-mode="dark"] .card .header .title {\n  color: red;\n}\n',
  '[data-density="compact"] .a,\n[data-tone="inverse"] .b,\n[data-motion="calm"] .c {\n  gap: 0;\n}\n',
  '.toolbar [data-member="reasoning-disclosure"][data-state="open"] .x,\n[data-member] .y {\n  margin: 0;\n}\n',
  'html[data-system="plain"][data-palette="neutral"] {\n  font: 13px/1.5 system-ui;\n}\n',
]

async function corpus(): Promise<Diagnostic[]> {
  const found: Diagnostic[] = []
  for (const code of SCREENS) {
    const result = verifyCode(code, { filename: 'apps/relay/src/Inbox.tsx' })
    expect(result.fatal, code).toBeNull()
    found.push(...result.diagnostics)
  }
  for (const code of VUE_SCREENS) {
    const result = verifyCode(code, { filename: 'apps/relay/src/Inbox.vue' })
    expect(result.fatal, code).toBeNull()
    found.push(...result.diagnostics)
  }
  for (const code of SVELTE_SCREENS) {
    const result = verifyCode(code, { filename: 'apps/relay/src/Inbox.svelte' })
    expect(result.fatal, code).toBeNull()
    found.push(...result.diagnostics)
  }
  for (const code of SOLID_SCREENS) {
    const result = verifyCode(code, { filename: 'apps/relay/src/Inbox.tsx', framework: 'solid' })
    expect(result.fatal, code).toBeNull()
    found.push(...result.diagnostics)
  }
  for (const code of ANGULAR_SCREENS) {
    const result = verifyCode(code, {
      filename: 'apps/relay/src/inbox.component.ts',
      framework: 'angular',
    })
    expect(result.fatal, code).toBeNull()
    found.push(...result.diagnostics)
  }
  found.push(
    ...verifyCode(fixture('vendorable-violations.tsx'), {
      surface: 'vocabulary',
      filename: resolve(ROOT, 'packages/react-ui/src/controls/Button.tsx'),
    }).diagnostics,
  )
  for (const css of STYLESHEETS) found.push(...(await verifyCss(css)).diagnostics)
  found.push(
    ...(await verifyCss(fixture('vocabulary-violations.css'), { surface: 'vocabulary' }))
      .diagnostics,
  )
  return found
}

describe('every report', () => {
  it('fits in 200 characters', async () => {
    const reports = await corpus()
    expect(reports.length).toBeGreaterThan(60)
    const long = reports
      .filter((report) => report.message.length >= MESSAGE_LIMIT)
      .map((report) => `${report.message.length}: ${report.message}`)
    expect(long).toEqual([])
  })

  it('carries its answer: a fix, or the alternatives it names', async () => {
    const reports = await corpus()
    const bare = reports
      .filter((report) => (RULE_CLIMB[report.rule] ?? []).length > 0)
      .filter((report) => report.fix === null && report.alternatives.length === 0)
      .map((report) => `${report.rule}: ${report.message}`)
    expect(bare).toEqual([])
  })

  it('names every rung its alternatives are on among the rule’s rungs', async () => {
    for (const report of await corpus()) {
      const climb = RULE_CLIMB[report.rule] ?? []
      for (const { rung } of report.alternatives) {
        if (rung === null) expect(climb, report.message).toEqual([])
        else expect(climb, report.message).toContain(rung)
      }
    }
  })
})

describe('a diagnostic from verify', () => {
  it('carries the rule’s fix as the edit ESLint would make', () => {
    const code = `import { Button } from '@polymorph/react-ui'\nexport const A = () => <Button className="x" label="Go" />`
    const [report] = verifyCode(code).diagnostics
    expect(report?.fix).not.toBeNull()
    const { range, text } = report?.fix as { range: [number, number]; text: string }
    expect(code.slice(0, range[0]) + text + code.slice(range[1])).toBe(
      `import { Button } from '@polymorph/react-ui'\nexport const A = () => <Button label="Go" />`,
    )
  })

  it('carries the alternatives its message names, with the nearest token by value', () => {
    const [report] = verifyCode(
      `export const A = () => <div style={{ display: 'flex', gap: 12 }} />`,
    ).diagnostics
    expect(report?.fix).toBeNull()
    expect(report?.alternatives).toEqual([{ member: 'Inline', prop: 'gap', rung: 1 }])
    // The theme's values reach the rule through `verify`, so the step is named.
    expect(report?.message).toContain('`<Inline gap={4}>`')
  })
})
