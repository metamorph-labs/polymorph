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

/**
 * Measures a page whose body is the given markup. The body has no margin of its own. `before`
 * acts on the page after it is drawn and before it is measured, as a person would: a press, a
 * focus, a scroll.
 */
async function measure(
  body: string,
  names: Record<string, string> = {},
  before?: () => Promise<void>,
): Promise<Measurement> {
  await page.setContent(
    `<!doctype html><html><head><style>body { margin: 0; font: 14px/20px sans-serif }</style></head>` +
      `<body>${body}</body></html>`,
  )
  await before?.()
  await page.addScriptTag({ content: SCRIPT })
  return page.evaluate(
    (memberNames) =>
      (
        globalThis as unknown as {
          measureLayout: (names: Record<string, string>) => Promise<Measurement>
        }
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

describe('no-gap', () => {
  /** A text field as Input draws it: a bordered, rounded frame around a native input. */
  const field = (label: string) =>
    '<span data-member="input" style="display: inline-flex; align-items: center; height: 32px; ' +
    'padding: 0 8px; border: 1px solid #888; border-radius: 6px">' +
    `<input aria-label="${label}" style="height: 30px; border: 0; padding: 0" /></span>`
  /** A table as Table draws it: a wrapper that paints nothing, around rows with rules. */
  const table =
    '<div data-member="table"><table style="width: 100%; border-collapse: collapse">' +
    '<thead><tr><th style="padding: 8px; text-align: start; border-bottom: 1px solid #ccc">Name</th></tr></thead> ' +
    '<tbody><tr><td style="padding: 8px">Ada</td></tr></tbody></table></div>'
  const card = (inside: string, padding = '16px') =>
    `<div data-member="card" style="display: block; padding: ${padding}; border: 1px solid #ccc; ` +
    `border-radius: 8px">${inside}</div>`
  const names = {
    card: 'Card',
    input: 'Input',
    table: 'Table',
    'search-input': 'SearchInput',
    'form-field': 'FormField',
  }

  it('reports a field that touches the table after it in a Card, which puts no space between them', async () => {
    const measured = await measure(
      `<div style="padding: 40px">${card(field('Search') + table)}</div>`,
      names,
    )

    expect(measured.faults).toEqual([
      {
        kind: 'no-gap',
        element: 'Input',
        message:
          'Its bottom edge touches Table "Name Ada", with no gap. Both are in Card "Name Ada", ' +
          'which lays them out in flow and puts no space between them.',
      },
    ])
  })

  it('follows the edge out through a box that ends where the field ends', async () => {
    const formField = `<div data-member="form-field" style="display: flex; flex-direction: column">${field('Search')}</div>`
    const measured = await measure(
      `<div style="padding: 40px">${card(formField + table)}</div>`,
      names,
    )

    expect(kinds(measured)).toEqual(['no-gap'])
    expect(measured.faults[0]?.message).toContain('touches Table "Name Ada"')
  })

  it('reports a search field placed directly in a bordered box, with no inset', async () => {
    const search = `<span data-member="search-input" style="display: inline-flex">${field('Search')}</span>`
    const measured = await measure(
      `<div style="padding: 40px"><div style="border: 1px solid #ccc">${search}</div></div>`,
      names,
    )

    expect(measured.faults).toEqual([
      {
        kind: 'no-gap',
        element: 'Input',
        message: 'Its top border lies against the inside of the border of div, with no inset.',
      },
    ])
  })

  it('reports two controls drawn side by side with nothing between them once', async () => {
    const button = (name: string) =>
      `<button data-member="button" style="height: 32px; border: 1px solid #888; border-radius: 6px">${name}</button>`
    const measured = await measure(
      `<div style="padding: 40px">${card(button('Cancel') + button('Save'))}</div>`,
      { ...names, button: 'Button' },
    )

    expect(measured.faults.map((fault) => [fault.kind, fault.element])).toEqual([
      ['no-gap', 'Button "Cancel"'],
    ])
    expect(measured.faults[0]?.message).toContain('Its right edge touches Button "Save"')
  })

  it('does not report a field the box spaces, or two fields a layout places', async () => {
    const stack = (gap: string) =>
      `<div data-member="stack" style="display: flex; flex-direction: column; gap: ${gap}">` +
      `${field('First')}${field('Second')}</div>`
    const measured = await measure(
      `<div style="display: flex; flex-direction: column; gap: 24px; padding: 40px">` +
        `${card(stack('8px'))}${card(stack('0'))}</div>`,
      names,
    )

    expect(measured.faults).toEqual([])
  })

  it('does not report a table edge to edge in a bordered body, as ListPage draws one', async () => {
    const measured = await measure(
      '<div data-member="list-page" style="padding: 40px">' +
        `<div style="display: grid; overflow: clip; border: 1px solid #ccc; border-radius: 12px"><div>${table}</div></div></div>`,
      names,
    )

    expect(measured.faults).toEqual([])
  })

  it('does not report the rows of a List or a Menu, which are parts of one member', async () => {
    const row = (name: string) =>
      `<li style="padding: 8px; border-bottom: 1px solid #eee; background: #fafafa">${name}</li>`
    const item = (name: string) =>
      `<div role="menuitem" tabindex="-1" style="height: 32px; padding: 0 8px; background: #fafafa">${name}</div>`
    const measured = await measure(
      '<div style="display: flex; flex-direction: column; gap: 24px; padding: 40px">' +
        `<ul data-member="list" style="margin: 0; padding: 0; list-style: none; border: 1px solid #ccc; border-radius: 8px">${row('Inbox')}${row('Sent')}</ul>` +
        `<div data-member="menu" role="menu" style="border: 1px solid #ccc; border-radius: 8px">${item('Rename')}${item('Delete')}</div>` +
        '</div>',
      { list: 'List', menu: 'Menu' },
    )

    expect(measured.faults).toEqual([])
  })

  it('does not report the parts of one member: a clear button, a split button, a segmented group', async () => {
    const part = 'height: 32px; min-width: 32px; border: 0; border-radius: 0'
    const measured = await measure(
      '<div style="display: flex; flex-direction: column; align-items: start; gap: 16px; padding: 40px">' +
        '<span data-member="input" style="display: inline-flex; height: 32px; padding-inline-start: 8px; border: 1px solid #888; border-radius: 6px">' +
        `<input aria-label="Search" style="border: 0; padding: 0" /><button aria-label="Clear" style="${part}">×</button></span>` +
        '<span data-member="split-button" style="display: inline-flex; border: 1px solid #888; border-radius: 6px">' +
        `<button style="${part}">Save</button><button aria-label="More" style="${part}">▾</button></span>` +
        '<div data-member="segmented-control" role="radiogroup" aria-label="Range" style="display: inline-flex; border: 1px solid #888; border-radius: 8px">' +
        `<button role="radio" aria-checked="true" style="${part}">Day</button><button role="radio" aria-checked="false" tabindex="-1" style="${part}">Week</button></div>` +
        '</div>',
      { ...names, 'split-button': 'SplitButton', 'segmented-control': 'SegmentedControl' },
    )

    expect(measured.faults).toEqual([])
  })

  it('does not report two members a member joins in its own flex row', async () => {
    const measured = await measure(
      '<div style="padding: 40px"><span data-member="phone-input" style="display: inline-flex">' +
        '<button data-member="select" style="height: 32px; border: 1px solid #888; border-radius: 6px 0 0 6px">+44</button>' +
        `${field('Phone')}</span></div>`,
      { ...names, 'phone-input': 'PhoneInput', select: 'Select' },
    )

    expect(measured.faults).toEqual([])
  })

  it('does not report a full-bleed image in a Card, which paints no edge of its own', async () => {
    const measured = await measure(
      `<div style="padding: 40px">${card(
        '<div data-member="image" style="display: block"><div style="height: 120px; background: #8ab"></div></div>' +
          '<div data-member="stack" style="display: flex; flex-direction: column; padding: 16px"><p data-member="text" style="margin: 0">Harbour at dawn</p></div>',
        '0',
      )}</div>`,
      { ...names, image: 'Image', stack: 'Stack', text: 'Text' },
    )

    expect(measured.faults).toEqual([])
  })

  it('does not report a bar built to span its container, whose rule is its separation', async () => {
    const measured = await measure(
      '<div style="padding: 40px"><div style="border: 1px solid #ccc">' +
        '<div data-member="banner" style="padding: 8px 16px; background: #eef; border-bottom: 1px solid #99c">Maintenance tonight</div>' +
        '<div data-member="page-header" style="padding: 16px"><h1 style="margin: 0">Invoices</h1></div>' +
        '</div></div>',
      { banner: 'Banner', 'page-header': 'PageHeader' },
    )

    expect(measured.faults).toEqual([])
  })

  it('does not report a borderless button a member places flush inside its own frame', async () => {
    // DatePicker's calendar button and the Search button in SearchPage's field fill the frame's
    // height. Only one border is drawn there, the frame's.
    const measured = await measure(
      '<div style="padding: 40px"><span data-member="date-picker" style="display: inline-flex; align-items: stretch; height: 32px; ' +
        'padding-inline-start: 8px; border: 1px solid #888; border-radius: 6px"><input aria-label="Due date" style="border: 0; padding: 0" />' +
        '<button data-member="button" aria-label="Show calendar" style="min-width: 32px; border: 0; border-radius: 6px; background: #eee">▦</button></span></div>',
      { 'date-picker': 'DatePicker', button: 'Button' },
    )

    expect(measured.faults).toEqual([])
  })

  it('does not take a border that focus recolours for the member’s own', async () => {
    // Lightbox's backing holds a ghost Button flush. The Button's border is transparent at rest,
    // and the focus convention colours it while the open Lightbox has focus on it.
    const measured = await measure(
      '<style>.ghost { height: 32px; border: 1px solid transparent; border-radius: 8px; background: transparent }' +
        '.ghost:focus-visible { border-color: #1d4ed8; outline: 2px solid #1d4ed8; outline-offset: -2px }</style>' +
        '<div style="padding: 40px"><div style="display: inline-flex; border: 1px solid #ccc; border-radius: 8px">' +
        '<button id="close" class="ghost" data-member="button">Close</button></div></div>',
      { button: 'Button' },
      async () => {
        await page.focus('#close')
      },
    )

    expect(measured.faults).toEqual([])
  })

  it('does not report a member its own recipe positions at an edge', async () => {
    const measured = await measure(
      '<div style="padding: 40px"><pre data-member="code-block" style="position: relative; margin: 0; padding: 16px; border: 1px solid #ccc">npm install' +
        '<button data-member="copy-button" style="position: absolute; top: 0; right: 0; height: 32px; border: 1px solid #888; border-radius: 6px">Copy</button></pre></div>',
      { 'code-block': 'CodeBlock', 'copy-button': 'CopyButton' },
    )

    expect(measured.faults).toEqual([])
  })
})

describe('unseen-focus', () => {
  const BLUE = '#1d4ed8'
  /** A page whose buttons draw the given focus rule, each in a box with room around it. */
  const styled = (rule: string, body: string) =>
    `<style>button { height: 32px; border: 0; background: transparent } ${rule}</style>` +
    `<div style="padding: 40px">${body}</div>`

  it('reports a control that shows no mark when it has keyboard focus', async () => {
    const measured = await measure(
      styled('button:focus-visible { outline: none }', '<button>Save</button>'),
    )

    expect(measured.faults).toEqual([
      {
        kind: 'unseen-focus',
        element: 'button "Save"',
        message:
          'With keyboard focus, it shows no mark: nothing on it or around it draws an outline or ' +
          'changes at its edge.',
      },
    ])
  })

  // Command's search field: while its modal dialog is open, focus can be nowhere else, and the
  // caret shows it. The exception holds only while the field is the dialog's one control.
  it('does not report the one text field of a modal dialog, and reports it beside another control', async () => {
    const dialog = (inside: string) =>
      `<style>input:focus-visible { outline: none } button:focus-visible { outline: 2px solid ${BLUE} }</style>` +
      `<div role="dialog" aria-modal="true" aria-label="Commands" style="padding: 40px">${inside}</div>`
    const field = '<input type="search" aria-label="Search commands" style="border: 0">'
    const unseen = (measured: Measurement) =>
      measured.faults.filter((fault) => fault.kind === 'unseen-focus').map((fault) => fault.element)

    expect(unseen(await measure(dialog(field)))).toEqual([])
    expect(unseen(await measure(dialog(`${field}<button>Close</button>`)))).toEqual([
      expect.stringContaining('Search commands'),
    ])
  })

  it('reports an outline under 2px that is the only mark', async () => {
    const measured = await measure(
      styled(`button:focus-visible { outline: 1px solid ${BLUE} }`, '<button>Save</button>'),
    )

    expect(measured.faults[0]?.message).toBe(
      'With keyboard focus, its only mark is its outline, 1px wide, under the 2px floor.',
    )
  })

  it('measures keyboard focus after a pointer press, which leaves `:focus-visible` unmatched', async () => {
    const measured = await measure(
      styled('button:focus-visible { outline: none }', '<button id="save">Save</button>'),
      {},
      async () => {
        await page.click('#save')
      },
    )

    expect(kinds(measured)).toEqual(['unseen-focus'])
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('save')
    expect(await page.evaluate(() => document.activeElement?.matches(':focus-visible'))).toBe(false)
  })

  it('takes a mark that is a fill, or that a script draws a task after the focus, as a mark', async () => {
    // A menu library sets the highlight from its focus handler, and its framework commits it in
    // a microtask: Radix's `data-highlighted` is drawn this way.
    const measured = await measure(
      '<style>.row { height: 32px; outline: none } .row[data-highlighted] { background: #dbeafe }' +
        'button:focus-visible { outline: none; background: #dbeafe }</style>' +
        '<div style="padding: 40px"><button style="height: 32px; border: 0">Save</button>' +
        '<div role="menu"><div class="row" role="menuitem" tabindex="-1">Rename</div></div></div>' +
        '<script>' +
        'document.addEventListener("focusin", (event) => queueMicrotask(() => event.target.setAttribute("data-highlighted", "")));' +
        'document.addEventListener("focusout", (event) => queueMicrotask(() => event.target.removeAttribute("data-highlighted")));' +
        '</script>',
    )

    expect(measured.faults).toEqual([])
  })

  it('takes a mark drawn on the box around the control, on a sibling, or on a pseudo-element', async () => {
    const measured = await measure(
      `<style>input, a, .thumb { outline: none }` +
        `.frame:has(> input:focus-visible), .card:has(:focus-visible), .code:focus-within .cell { outline: 2px solid ${BLUE}; outline-offset: -2px }` +
        `.thumb::before { content: ""; display: block; width: 24px; height: 24px; background: #ccc }` +
        `.thumb:focus-visible::before { background: ${BLUE} }</style>` +
        '<div style="display: flex; flex-direction: column; align-items: start; gap: 24px; padding: 40px">' +
        '<span class="frame" style="display: inline-flex; height: 32px; border: 1px solid #888"><input aria-label="Search" style="border: 0" /></span>' +
        '<div class="card" style="position: relative; padding: 16px; border: 1px solid #ccc">Invoices<a href="/invoices" aria-label="Open invoices" style="position: absolute; inset: 0"></a></div>' +
        '<div class="code" style="position: relative; display: flex; gap: 8px"><input aria-label="Code" style="position: absolute; inset: 0; opacity: 0" />' +
        '<span class="cell" style="width: 32px; height: 40px; border: 1px solid #888"></span><span class="cell" style="width: 32px; height: 40px; border: 1px solid #888"></span></div>' +
        '<div class="thumb" role="slider" tabindex="0" aria-label="Volume" aria-valuenow="5"></div>' +
        '</div>',
    )

    expect(measured.faults).toEqual([])
  })

  it('asks whether a control can be seen once it has focus, which can reveal it', async () => {
    // ChatMessage's actions are at no opacity until focus is inside the message.
    const measured = await measure(
      styled(
        `.actions { opacity: 0 } .message:focus-within .actions { opacity: 1 }` +
          `button:focus-visible { outline: 2px solid ${BLUE}; outline-offset: -2px }`,
        '<div class="message"><p>The retry policy stops after five attempts.</p>' +
          '<div class="actions"><button>Copy</button></div></div>',
      ),
    )

    expect(measured.faults).toEqual([])
  })

  it('reports an outline faint against the fill inside the edge, and not one the fill sets off', async () => {
    // The same white outline, inside the edge: lost on a clear button on a white page, and plain
    // on a filled button, where it takes the button's own text colour.
    const rule =
      'button:focus-visible { outline: 2px solid currentColor; outline-offset: -2px }' +
      `.solid { background: ${BLUE}; color: #fff } .clear { color: #fff }`
    const measured = await measure(
      styled(rule, '<button class="solid">Save</button> <button class="clear">Cancel</button>'),
    )

    expect(measured.faults).toEqual([
      {
        kind: 'unseen-focus',
        element: 'button "Cancel"',
        message:
          'With keyboard focus, its mark is faint: its outline is 1:1 against the fill inside ' +
          'its edge, under 3:1.',
      },
    ])
  })

  it('composites a translucent outline over what is around it before it measures it', async () => {
    const outside = (colour: string) =>
      `button:focus-visible { outline: 2px solid ${colour}; outline-offset: 2px }`
    const opaque = await measure(styled(outside(BLUE), '<button>Save</button>'))
    const translucent = await measure(
      styled(outside('rgb(29 78 216 / 0.5)'), '<button>Save</button>'),
    )

    expect(opaque.faults).toEqual([])
    expect(translucent.faults[0]?.message).toBe(
      'With keyboard focus, its mark is faint: its outline is 2.3:1 against the background ' +
        'around it, under 3:1.',
    )
  })

  it('reports an outline outside the edge that a box which does not scroll cuts', async () => {
    const measured = await measure(
      styled(
        `button:focus-visible { outline: 2px solid ${BLUE}; outline-offset: 2px }`,
        '<div style="width: 200px; overflow: hidden"><button style="display: block">Save</button></div>',
      ),
    )

    expect(measured.faults).toEqual([
      {
        kind: 'unseen-focus',
        element: 'button "Save"',
        message:
          'With keyboard focus, its mark is cut: 4px of its outline is hidden on the left by ' +
          'div "Save", which cannot scroll to it.',
      },
    ])
  })

  it('reports an outline cut by the edge of the page', async () => {
    const measured = await measure(
      `<style>button:focus-visible { outline: 2px solid ${BLUE}; outline-offset: 2px }</style>` +
        '<button style="display: block; height: 32px; margin-top: 40px">Save</button>',
    )

    expect(measured.faults[0]?.message).toBe(
      'With keyboard focus, its mark is cut: 4px of its outline lies past the left edge of the page.',
    )
  })

  it('does not report an outline inside the edge, or outside it where the region scrolls to it', async () => {
    const measured = await measure(
      styled(
        `.inside:focus-visible { outline: 2px solid ${BLUE}; outline-offset: -2px }` +
          `.outside:focus-visible { outline: 2px solid ${BLUE}; outline-offset: 2px }`,
        '<div style="width: 200px; overflow: hidden"><button class="inside" style="display: block">Save</button></div>' +
          '<div style="height: 80px; padding: 8px; overflow-y: auto" tabindex="0">' +
          '<p style="height: 200px; margin: 0">Terms</p><button class="outside" style="display: block">Accept</button></div>',
      ),
    )

    expect(measured.faults).toEqual([])
  })

  it('measures a row of a roving list, and not a control kept out of the tab order', async () => {
    const measured = await measure(
      styled(
        '[role="menuitem"], button { outline: none }',
        '<div role="menu"><div role="menuitem" tabindex="-1" style="height: 32px">Rename</div></div>' +
          '<button tabindex="-1" aria-label="Show options" style="margin-top: 24px">▾</button>',
      ),
    )

    expect(measured.faults.map((fault) => fault.element)).toEqual(['div "Rename"'])
  })

  it('skips a control that a modal dialog keeps focus away from', async () => {
    const measured = await measure(
      styled(
        '.behind:focus-visible { outline: none }',
        '<button class="behind">Behind</button>' +
          '<div id="dialog" role="dialog" aria-modal="true"><button id="inside">Close</button></div>' +
          '<script>document.addEventListener("focusin", (event) => {' +
          ' if (!document.getElementById("dialog").contains(event.target)) document.getElementById("inside").focus() })</script>',
      ),
    )

    expect(measured.faults).toEqual([])
  })

  it('measures the outline of a control a focus trap gives focus back to, and nothing else on it', async () => {
    // The trap refocuses the control as soon as focus leaves, so it is never drawn without focus.
    const trapped = (rule: string) =>
      styled(
        rule,
        '<button id="day">15</button>' +
          '<script>document.getElementById("day").addEventListener("focusout", (event) => {' +
          ' queueMicrotask(() => event.target.focus({ focusVisible: true })) })</script>',
      )
    const held = () => page.evaluate(() => document.getElementById('day')?.focus())

    const seen = await measure(
      trapped(`button:focus-visible { outline: 2px solid ${BLUE} }`),
      {},
      held,
    )
    expect(seen.faults).toEqual([])

    const faint = await measure(
      trapped('button:focus-visible { outline: 2px solid #eeeeee }'),
      {},
      held,
    )
    expect(faint.faults[0]?.message).toMatch(/^With keyboard focus, its mark is faint: /)

    // With no outline its mark may be a fill, which cannot be compared with the control at rest.
    const filled = await measure(
      trapped('button:focus-visible { outline: none; background: #dbeafe }'),
      {},
      held,
    )
    expect(filled.faults).toEqual([])
  })

  it('skips a text field that is the only control in a modal dialog, where the caret shows focus', async () => {
    const palette = (more: string) =>
      styled(
        'input { height: 32px; border: 0; outline: none }',
        `<div role="dialog" aria-modal="true"><input aria-label="Search the commands" />${more}</div>`,
      )

    expect(
      (await measure(palette('<div role="option" style="height: 32px">Open settings</div>')))
        .faults,
    ).toEqual([])
    const beside = await measure(palette('<button style="margin: 24px">Close</button>'))
    expect(beside.faults.map((fault) => fault.element)).toEqual(['input "Search the commands"'])
  })

  it('puts focus, scrolling and the page’s transitions back as they were', async () => {
    const measured = await measure(
      '<style>button { transition: background-color 1s }</style>' +
        '<div style="padding: 40px"><input id="name" aria-label="Name" />' +
        '<div id="log" style="height: 60px; overflow-y: auto" tabindex="0"><p style="height: 300px; margin: 0">Log</p>' +
        '<button style="height: 32px">Load more</button></div></div>',
      {},
      async () => {
        await page.focus('#name')
        await page.evaluate(() => {
          document.getElementById('log')?.scrollTo(0, 50)
        })
      },
    )

    expect(measured.faults).toEqual([])
    expect(
      await page.evaluate(() => ({
        focused: document.activeElement?.id,
        scrolled: document.getElementById('log')?.scrollTop,
        sheets: document.querySelectorAll('style').length,
        transition: getComputedStyle(document.querySelector('button') as Element)
          .transitionDuration,
      })),
    ).toEqual({ focused: 'name', scrolled: 50, sheets: 2, transition: '1s' })
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
