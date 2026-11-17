import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import type * as Playwright from 'playwright'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { LayoutFault } from './render'

/**
 * The layout measure `render_screen` answers with, run in a real browser over pages written for
 * it.
 *
 * Each fault kind has a page that has the fault and a page that looks like it and is lawful: a
 * title cut by its box and a title a member shortens with an ellipsis, a region that pans
 * because its content is too wide and a region built to pan. The second of each pair is the
 * reason the measure can be trusted, because a measure that reports the vocabulary's own
 * conventions is not read.
 *
 * The measure is the workbench's (`apps/workbench/src/screen/measure.ts`) and its test is here,
 * beside the tool that returns what it finds. The pages are plain HTML with raw lengths in
 * them, and a red rule refuses a raw length anywhere in application code, a test's text
 * included. No member is drawn: the measure reads the document, and a member is only one way
 * to produce one.
 *
 * The measure needs layout, which jsdom does not do, so this file opens Chromium itself, as
 * `packages/cli/scratch.test.ts` does.
 */

const ROOT = resolve(import.meta.dirname, '../../..')

/** What the measure returns. `render.ts` passes the same shape on as each view of an answer. */
interface Measurement {
  faults: LayoutFault[]
  truncated: string[]
  page: { width: number; height: number; scrollHeight: number }
}

/** Playwright belongs to the repository, so it is resolved from its root. */
const playwright = createRequire(resolve(ROOT, 'package.json'))('playwright') as typeof Playwright

/**
 * The module as a script. It imports nothing, so its functions are the page's globals once the
 * `export` keywords are removed.
 */
const SCRIPT = ts
  .transpileModule(readFileSync(resolve(ROOT, 'apps/workbench/src/screen/measure.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  .outputText.replace(/^export /gm, '')

const PHONE = { width: 375, height: 812 }

let browser: Playwright.Browser
let page: Playwright.Page

beforeAll(async () => {
  browser = await playwright.chromium.launch()
  page = await browser.newPage({ viewport: PHONE })
}, 60_000)

afterAll(async () => {
  await browser?.close()
})

/** Measures a page whose body is the given markup. The body has no margin of its own. */
async function measure(body: string, names: Record<string, string> = {}): Promise<Measurement> {
  await page.setContent(
    `<!doctype html><html><head><style>body { margin: 0; font: 14px/20px sans-serif }</style></head>` +
      `<body>${body}</body></html>`,
  )
  await page.addScriptTag({ content: SCRIPT })
  return page.evaluate(
    (memberNames) =>
      (
        globalThis as unknown as { measureLayout: (names: Record<string, string>) => Measurement }
      ).measureLayout(memberNames),
    names,
  )
}

const kinds = (measurement: Measurement) => measurement.faults.map((fault) => fault.kind)

describe('a page that fits', () => {
  it('has no fault, and reports the window and the page height', async () => {
    const measured = await measure(
      '<main><h1>Inbox</h1><p>Three tickets are open.</p><button>New ticket</button></main>' +
        '<div style="height: 1200px"></div>',
    )

    expect(measured.faults).toEqual([])
    expect(measured.truncated).toEqual([])
    expect(measured.page.width).toBe(PHONE.width)
    expect(measured.page.height).toBe(PHONE.height)
    expect(measured.page.scrollHeight).toBeGreaterThan(1200)
  })
})

describe('sideways-scroll', () => {
  it('reports a page wider than its window, with both widths', async () => {
    const measured = await measure('<div style="width: 600px; height: 20px"></div>')

    expect(measured.faults).toEqual([
      {
        kind: 'sideways-scroll',
        element: 'the page',
        message: 'The page scrolls sideways: 600px of content in a 375px window.',
      },
    ])
  })

  it('reports a region that pans because its content is too wide for it', async () => {
    const measured = await measure(
      '<section style="width: 200px; overflow-x: auto"><div style="width: 500px">Wide</div></section>',
    )

    expect(kinds(measured)).toEqual(['sideways-scroll'])
    expect(measured.faults[0]?.element).toBe('section "Wide"')
    expect(measured.faults[0]?.message).toContain('500px of content in 200px')
  })

  it('does not report a region built to pan: named, focusable, or marked by its member', async () => {
    const wide = '<div style="width: 500px">Wide</div>'
    const measured = await measure(
      `<div style="width: 200px; overflow-x: auto" aria-label="Plans">${wide}</div>` +
        `<div style="width: 200px; overflow-x: auto" tabindex="0">${wide}</div>` +
        `<div style="width: 200px; overflow-x: auto" role="tablist">${wide}</div>` +
        `<div style="width: 200px; overflow-x: auto" data-overflowing>${wide}</div>` +
        `<pre style="width: 200px; overflow-x: auto; margin: 0">${'code '.repeat(40)}</pre>`,
    )

    expect(measured.faults).toEqual([])
  })
})

describe('clipped-text', () => {
  it('reports text its own box cuts with no ellipsis', async () => {
    const measured = await measure(
      '<h2 style="width: 80px; margin: 0; overflow: hidden; white-space: nowrap">' +
        'Webhook retries stop after the first 5xx</h2>',
    )

    expect(kinds(measured)).toEqual(['clipped-text'])
    expect(measured.faults[0]?.element).toBe('h2 "Webhook retries stop after the first 5xx"')
    expect(measured.faults[0]?.message).toContain('80px shows of')
    expect(measured.faults[0]?.message).toContain('with no ellipsis')
  })

  it('lists text a member shortens with an ellipsis apart, and not as a fault', async () => {
    const measured = await measure(
      '<h2 style="width: 80px; margin: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis">' +
        'Webhook retries stop after the first 5xx</h2>',
    )

    expect(measured.faults).toEqual([])
    expect(measured.truncated).toEqual(['h2 "Webhook retries stop after the first 5xx"'])
  })

  it('reports text drawn outside a box too narrow for one of its words', async () => {
    const measured = await measure(
      '<div style="display: flex; width: 300px"><h1 style="width: 40px; margin: 0; white-space: nowrap">' +
        'Retries</h1></div>',
    )

    expect(kinds(measured)).toEqual(['clipped-text'])
    expect(measured.faults[0]?.message).toContain('in a 40px box')
    expect(measured.faults[0]?.message).toContain('drawn outside the box')
  })

  it('does not report the box that hides text from sight on purpose', async () => {
    const measured = await measure(
      '<span style="position: absolute; width: 1px; height: 1px; overflow: hidden; white-space: nowrap">' +
        'Skip to the main content</span>',
    )

    expect(measured.faults).toEqual([])
    expect(measured.truncated).toEqual([])
  })
})

describe('cut-off', () => {
  it('reports a control a box hides, and names the box', async () => {
    const measured = await measure(
      '<div style="width: 120px; height: 40px; overflow: hidden">' +
        '<button style="margin-left: 90px; width: 80px; height: 32px">Save</button></div>',
    )

    expect(kinds(measured)).toEqual(['cut-off'])
    expect(measured.faults[0]?.element).toBe('button "Save"')
    expect(measured.faults[0]?.message).toBe(
      '50px of it is hidden on the right by div "Save", which does not scroll.',
    )
  })

  it('reports text past the edge of the page that nothing scrolls to', async () => {
    const measured = await measure(
      '<p style="position: absolute; left: -60px; top: 0; margin: 0; width: 120px">Filters</p>',
    )

    expect(kinds(measured)).toEqual(['cut-off'])
    expect(measured.faults[0]?.message).toBe(
      '60px of it lies past the left edge of the page, where nothing scrolls.',
    )
  })

  it('does not report content a region scrolls to', async () => {
    const measured = await measure(
      '<div style="height: 60px; overflow-y: auto" tabindex="0">' +
        '<p style="margin: 0; height: 300px">A long description.</p><button>Save</button></div>',
    )

    expect(measured.faults).toEqual([])
  })

  it('does not report a hidden drawer, which is off the edge on purpose', async () => {
    const measured = await measure(
      '<nav style="position: fixed; left: -300px; width: 280px; visibility: hidden">' +
        '<a href="/inbox">Inbox</a></nav>',
    )

    expect(measured.faults).toEqual([])
  })

  it('names the outermost thing a box hides once, and not each thing inside it', async () => {
    const measured = await measure(
      '<div style="width: 100px; height: 30px; overflow: hidden"><div style="width: 300px">' +
        '<button style="margin-left: 120px; width: 150px">Export <span>all</span></button></div></div>',
    )

    expect(kinds(measured)).toEqual(['cut-off'])
  })
})

describe('small-target', () => {
  const SMALL = 'width: 16px; height: 16px; padding: 0; border: 0'

  it('reports two controls under the floor that sit inside each other’s reach', async () => {
    const measured = await measure(
      `<div style="display: flex; gap: 4px; padding: 40px">` +
        `<button style="${SMALL}" aria-label="Previous"></button>` +
        `<button style="${SMALL}" aria-label="Next"></button></div>`,
    )

    expect(kinds(measured)).toEqual(['small-target', 'small-target'])
    expect(measured.faults[0]?.element).toBe('button "Previous"')
    expect(measured.faults[0]?.message).toBe(
      'Its hit area is under the 24px touch-target floor: its box is 16px by 16px, and ' +
        'button "Next" is inside the 24px circle centred on it.',
    )
  })

  it('does not report a small control with nothing near it, as the criterion allows', async () => {
    const measured = await measure(
      `<div style="padding: 40px"><button style="${SMALL}" aria-label="Dismiss"></button></div>`,
    )

    expect(measured.faults).toEqual([])
  })

  it('counts the hit area and not the box: a label row takes the touches around a checkbox', async () => {
    const row = (name: string) =>
      `<label style="display: flex; align-items: center; height: 32px; gap: 8px">` +
      `<input type="checkbox" style="width: 16px; height: 16px; margin: 0" />${name}</label>`
    const measured = await measure(`<div style="padding: 40px">${row('Email')}${row('Push')}</div>`)

    expect(measured.faults).toEqual([])
  })

  it('counts the frame of a text field as its hit area, inside its own member', async () => {
    const field =
      '<div data-member="input" style="display: flex; align-items: center; height: 32px; width: 200px">' +
      '<input aria-label="Search" style="height: 18px; border: 0; padding: 0; flex: 1" /></div>'
    const measured = await measure(
      `<div style="padding: 40px">${field}<button style="height: 32px">Go</button></div>`,
    )

    expect(measured.faults).toEqual([])
  })

  it('reports a field with no frame that is shorter than the floor beside another control', async () => {
    const measured = await measure(
      '<div style="padding: 40px"><input aria-label="Search" ' +
        'style="display: block; height: 14px; border: 0; padding: 0" />' +
        '<button style="display: block; width: 200px; height: 32px">Go</button></div>',
    )

    expect(kinds(measured)).toEqual(['small-target'])
    expect(measured.faults[0]?.element).toBe('input "Search"')
  })

  it('reports a control whose centre a neighbour’s hit area covers', async () => {
    const dot = (name: string) => `<button class="dot" aria-label="${name}"></button>`
    const measured = await measure(
      '<style>.dot { position: relative; width: 4px; height: 4px; padding: 0; border: 0 }' +
        '.dot::after { content: ""; position: absolute; inset: -10px }</style>' +
        `<div style="display: flex; gap: 6px; padding: 40px">${dot('One')}${dot('Two')}</div>`,
    )

    expect(measured.faults.map((fault) => fault.element)).toContain('button "One"')
    expect(kinds(measured).every((kind) => kind === 'small-target')).toBe(true)
  })

  it('does not measure a control under another layer, whatever reaches over its centre there', async () => {
    // Two dialogs open at once, one drawn over the other. A hit area in the upper one reaches
    // over the centre of a control in the lower one, and under that hit area is the upper
    // dialog's panel, so the lower control is covered and not crowded.
    const dot = (name: string) => `<button class="dot" aria-label="${name}"></button>`
    const measured = await measure(
      '<style>.dot { position: relative; display: block; width: 4px; height: 4px; padding: 0; border: 0 }' +
        '.dot::after { content: ""; position: absolute; inset: -10px }</style>' +
        `<div style="padding: 40px">${dot('Lower')}</div>` +
        `<div style="position: fixed; inset: 0; padding: 40px 0 0 48px; background: white">${dot('Upper')}</div>`,
    )

    expect(measured.faults).toEqual([])
  })

  it('exempts a link set inside a sentence, and a control that is disabled', async () => {
    const measured = await measure(
      '<p style="padding: 40px">Read <a href="/a">the first</a> <a href="/b">and the second</a> page.' +
        `<button style="${SMALL}" disabled aria-label="Previous"></button>` +
        `<button style="${SMALL}" disabled aria-label="Next"></button></p>`,
    )

    expect(measured.faults).toEqual([])
  })

  it('asks a control under the first window by scrolling to it, and puts the page back', async () => {
    const measured = await measure(
      '<div style="height: 2000px"></div>' +
        `<div style="display: flex; gap: 4px; padding: 40px">` +
        `<button style="${SMALL}" aria-label="Previous"></button>` +
        `<button style="${SMALL}" aria-label="Next"></button></div>`,
    )

    expect(kinds(measured)).toEqual(['small-target', 'small-target'])
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  })
})

describe('how a fault names its element', () => {
  it('names the member a screen’s author wrote, from the slug the member writes', async () => {
    const measured = await measure(
      '<div data-member="settings-row" style="display: flex; width: 300px">' +
        '<span style="display: block; width: 20px; white-space: nowrap">Seats</span></div>',
      { 'settings-row': 'SettingsRow' },
    )

    expect(measured.faults[0]?.element).toBe('span "Seats" in SettingsRow')
  })

  it('names a member’s own root by the member alone', async () => {
    const measured = await measure(
      '<div style="width: 120px; height: 40px; overflow: hidden">' +
        '<button data-member="button" style="margin-left: 90px; width: 80px">Create key</button></div>',
      { button: 'Button' },
    )

    expect(measured.faults[0]?.element).toBe('Button "Create key"')
  })
})

describe('a page with many faults of one kind', () => {
  it('lists a few and counts the rest', async () => {
    const clipped = (index: number) =>
      `<h3 style="width: 60px; margin: 0; overflow: hidden; white-space: nowrap">` +
      `A heading that does not fit, number ${index}</h3>`
    const measured = await measure(
      Array.from({ length: 10 }, (_, index) => clipped(index)).join(''),
    )

    expect(measured.faults).toHaveLength(7)
    expect(measured.faults.at(-1)).toEqual({
      kind: 'clipped-text',
      element: '4 more',
      message: '4 more elements have this fault.',
    })
  })
})
