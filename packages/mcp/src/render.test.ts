import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { afterAll, describe, expect, it } from 'vitest'

import {
  browserAdvice,
  renderScreen,
  ScreenUnavailableError,
  type RenderScreenAnswer,
  type RenderScreenArgs,
  type ToolContext,
} from './tools'

/**
 * `render_screen`, as a function.
 *
 * The tool draws in a real browser, so these tests run one: Playwright's Chromium, started by the
 * tool itself, over the page the workbench's builder builds in memory. Nothing is mocked. A
 * picture is checked as a PNG of the size its window says, and a fault by a screen written to
 * have it.
 *
 * The requests that are wrong are checked first, and none of them starts a browser. The measure
 * itself has its own file (`measure.test.ts`), with a page for each fault kind. This file checks
 * that a fault in a drawn spec reaches the answer.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

/** What the entry point passes: the builder the workbench owns. */
const BUILDER = resolve(ROOT, 'apps/workbench/screen.build.mjs')
const context: ToolContext = { registry, root: ROOT, screenBuilder: BUILDER }

const SCRATCH = mkdtempSync(resolve(tmpdir(), 'polymorph-render-'))
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }))

/** A first call builds the page and starts a browser. */
const SLOW = 120_000

const button = (label: string) => ({ component: 'Button', props: { label } })

/** A screen with one input of each kind: data, a flag and a callback. */
const TICKETS = {
  spec: 'polymorph-screen/1',
  name: 'Tickets',
  purpose: 'A list of tickets under a title.',
  inputs: [
    { name: 'title', type: 'string' },
    { name: 'tickets', type: 'Ticket[]' },
    { name: 'columns', type: 'DataTableColumn<Ticket>[]' },
    { name: 'getRowId', type: '(ticket: Ticket) => string' },
    { name: 'onNewTicket', type: '() => void' },
  ],
  root: {
    component: 'Stack',
    props: { gap: 4, p: 4 },
    children: [
      { component: 'Text', children: [{ $: 'title' }] },
      { component: 'Button', props: { label: 'New ticket', onClick: { $: 'onNewTicket' } } },
      {
        component: 'DataTable',
        props: {
          label: 'Tickets',
          data: { $: 'tickets' },
          columns: { $: 'columns' },
          getRowId: { $: 'getRowId' },
          emptyState: { $object: { title: 'No tickets yet' } },
        },
      },
    ],
  },
}

const DATA = {
  title: 'Open tickets',
  tickets: [
    { id: 'T-1042', subject: 'Webhook retries stop after the first 5xx' },
    { id: 'T-1041', subject: 'Invoice PDF shows the wrong billing period' },
  ],
  columns: [
    { key: 'id', header: 'Ticket' },
    { key: 'subject', header: 'Subject' },
  ],
}

/** A row of actions told not to wrap: wider than a phone, and well inside a desktop. */
const WIDE = {
  spec: 'polymorph-screen/1',
  name: 'WideRow',
  purpose: 'A row of actions that does not wrap.',
  inputs: [],
  root: {
    component: 'Inline',
    props: { gap: 2, p: 4, wrap: false },
    children: [
      'Export as spreadsheet',
      'Duplicate workspace',
      'Archive every ticket',
      'Invite a teammate',
    ].map(button),
  },
}

const render = (spec: unknown, args: Partial<RenderScreenArgs> = {}, tools = context) =>
  renderScreen(tools, { spec: JSON.stringify(spec), system: 'plain', ...args })

/** The width and height a PNG declares, read from its header. */
function sizeOf(png: Buffer): { width: number; height: number } {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

const viewsOf = (answer: RenderScreenAnswer) => answer.states?.flatMap((state) => state.views) ?? []

describe('a request that cannot be drawn', () => {
  it('refuses text that is not JSON', async () => {
    const { answer, images } = await renderScreen(context, { spec: '{ not json', system: 'plain' })

    expect(answer.ok).toBe(false)
    expect(answer.fatal).toContain('the spec is not JSON')
    expect(images).toEqual([])
  })

  it('answers an unlawful spec with its faults, as `validate` does, and draws nothing', async () => {
    const { answer, images } = await render({
      ...WIDE,
      root: { component: 'Buton', props: { label: 'Save' } },
    })

    expect(answer.ok).toBe(false)
    expect(answer.fatal).toContain('not lawful')
    expect(answer.specFaults?.length).toBeGreaterThan(0)
    expect(JSON.stringify(answer.specFaults)).toContain('Buton')
    expect(answer.states).toBeUndefined()
    expect(images).toEqual([])
  })

  it('refuses a native spec, whose members a browser does not draw', async () => {
    const { answer } = await render({ ...WIDE, platform: 'ios' })

    expect(answer.ok).toBe(false)
    expect(answer.fatal).toContain('`ios`')
    expect(answer.fatal).toContain('web screens')
  })

  it('names the systems when the system is not one', async () => {
    const { answer } = await render(WIDE, { system: 'brutalist' })

    expect(answer.fatal).toContain('no shipped system is called `brutalist`')
    for (const system of registry.theme.systems)
      expect(answer.fatal).toContain(`\`${system.name}\``)
  })

  it('names the palettes when the palette is not one', async () => {
    const { answer } = await render(WIDE, { palette: 'mauve' })

    expect(answer.fatal).toContain('no shipped palette is called `mauve`')
    expect(answer.fatal).toContain('`neutral`')
  })

  it('refuses data for an input the spec does not declare, so no key is dropped unseen', async () => {
    const { answer, images } = await render(TICKETS, { data: { ...DATA, ticket: [] } })

    expect(answer.ok).toBe(false)
    expect(answer.fatal).toContain('`data.ticket` names no input the spec declares')
    expect(answer.fatal).toContain('`title`, `tickets`, `columns`')
    expect(images).toEqual([])
  })

  it('refuses a value for a callback, in `data` or in `empty`', async () => {
    const { answer } = await render(TICKETS, { data: DATA, empty: { onNewTicket: 'noop' } })

    expect(answer.fatal).toContain('`empty.onNewTicket` is a callback')
    expect(answer.fatal).toContain('stubs every callback')
  })

  it('says a spec with no data inputs takes none', async () => {
    const { answer } = await render(WIDE, { data: { title: 'x' } })

    expect(answer.fatal).toContain('The inputs that take data are none.')
  })
})

describe('a server that cannot draw', () => {
  it('says so when it was started without the page’s builder', async () => {
    const drawing = render(WIDE, {}, { registry, root: ROOT })

    await expect(drawing).rejects.toBeInstanceOf(ScreenUnavailableError)
    await expect(drawing).rejects.toThrow('bin/polymorph-mcp.js')
  })

  it('reports why the build failed, in the builder’s own words', async () => {
    const failing = resolve(SCRATCH, 'failing.mjs')
    writeFileSync(
      failing,
      "process.send({ error: 'screen.html is missing' }, () => process.exit(1))\n",
    )
    const drawing = render(WIDE, {}, { ...context, screenBuilder: failing })

    await expect(drawing).rejects.toBeInstanceOf(ScreenUnavailableError)
    await expect(drawing).rejects.toThrow('screen.html is missing')
  })

  it('reports a builder that stops without an answer, with what it printed', async () => {
    const silent = resolve(SCRATCH, 'silent.mjs')
    writeFileSync(silent, "process.stderr.write('no bundler here\\n')\nprocess.exit(3)\n")
    const drawing = render(WIDE, {}, { ...context, screenBuilder: silent })

    await expect(drawing).rejects.toThrow('no bundler here')
  })

  it('reports a builder that is not there, and tries again on the next call', async () => {
    const absent = resolve(SCRATCH, 'absent.mjs')
    const tools = { ...context, screenBuilder: absent }

    await expect(render(WIDE, {}, tools)).rejects.toBeInstanceOf(ScreenUnavailableError)

    // The failed build was not kept: the same path, once it holds a builder, is run again.
    writeFileSync(absent, "process.send({ error: 'second attempt' }, () => process.exit(1))\n")
    await expect(render(WIDE, {}, tools)).rejects.toThrow('second attempt')
  })

  it(
    'reports a page that throws while it loads, with the page’s own error',
    async () => {
      const broken = resolve(SCRATCH, 'broken.mjs')
      const page = '<!doctype html><script>throw new Error("the page is broken")</script>'
      writeFileSync(
        broken,
        `process.send({ files: [{ name: 'screen.html', body: ${JSON.stringify(page)} }] }, ` +
          '() => process.exit(0))\n',
      )
      const drawing = render(WIDE, {}, { ...context, screenBuilder: broken })

      await expect(drawing).rejects.toBeInstanceOf(ScreenUnavailableError)
      await expect(drawing).rejects.toThrow('the page is broken')
    },
    SLOW,
  )

  it('turns a missing browser into the command that installs it', () => {
    const missing = new Error(
      "browserType.launch: Executable doesn't exist at /cache/chromium/headless_shell\n" +
        'Please run the following command to download new browsers: npx playwright install',
    )

    const advice = browserAdvice(missing, '/checkout')
    expect(advice).toContain('pnpm exec playwright install chromium')
    expect(advice).toContain('/checkout')
    expect(advice).toContain('Every other tool works without it')
  })

  it('turns a missing Playwright into the install that brings it', () => {
    const missing = Object.assign(new Error("Cannot find package 'playwright' imported from x"), {
      code: 'ERR_MODULE_NOT_FOUND',
    })

    const advice = browserAdvice(missing, '/checkout')
    expect(advice).toContain('optional dependency')
    expect(advice).toContain('`pnpm install`')
    expect(advice).toContain('pnpm exec playwright install chromium')
  })

  it('leaves any other failure to be reported as it is', () => {
    expect(browserAdvice(new Error('Target page crashed'), '/checkout')).toBeNull()
    expect(browserAdvice('a string', '/checkout')).toBeNull()
  })
})

describe('a lawful spec, drawn', () => {
  it(
    'returns one picture for each width, of the window’s size, with nothing to report',
    async () => {
      const { answer, images } = await render(TICKETS, { data: DATA })

      expect(answer.fatal).toBeNull()
      expect(answer.ok, JSON.stringify(answer, null, 2)).toBe(true)
      expect(answer.pairing).toEqual({ system: 'plain', palette: 'neutral', mode: 'light' })
      expect(answer.states?.map((state) => state.state)).toEqual(['populated'])
      expect(answer.blocked).toBeUndefined()
      expect(answer.errors).toBeUndefined()

      const [phone, desktop] = viewsOf(answer)
      expect(phone).toMatchObject({
        viewport: 'phone',
        window: { width: 375, height: 812 },
        image: 1,
        faults: [],
        failed: [],
      })
      expect(desktop).toMatchObject({
        viewport: 'desktop',
        window: { width: 1440, height: 900 },
        image: 2,
        faults: [],
        failed: [],
      })

      // The phone is drawn at two device pixels a point, and the desktop at one.
      expect(images).toHaveLength(2)
      expect(sizeOf(images[0] as Buffer)).toEqual({ width: 750, height: 1624 })
      expect(sizeOf(images[1] as Buffer)).toEqual({ width: 1440, height: 900 })
    },
    SLOW,
  )

  it(
    'says how every input was filled: data, a sample from the type, or a stub',
    async () => {
      const { answer } = await render(TICKETS, {
        data: { tickets: DATA.tickets, columns: DATA.columns },
        viewports: ['desktop'],
      })

      expect(answer.states?.[0]?.inputs).toEqual([
        { name: 'title', type: 'string', from: 'sample', value: '"⟨title⟩"' },
        { name: 'tickets', type: 'Ticket[]', from: 'data' },
        { name: 'columns', type: 'DataTableColumn<Ticket>[]', from: 'data' },
        {
          name: 'getRowId',
          type: '(ticket: Ticket) => string',
          from: 'stub',
          value: 'answers the key of its first argument, and is not told to the host',
        },
        {
          name: 'onNewTicket',
          type: '() => void',
          from: 'stub',
          value: 'is told to the host, and answers nothing',
        },
      ])
      // One width was asked for, so one view and one picture come back.
      expect(viewsOf(answer).map((view) => view.viewport)).toEqual(['desktop'])
    },
    SLOW,
  )

  it(
    'draws the empty screen beside the populated one, and they are different pictures',
    async () => {
      const { answer, images } = await render(TICKETS, { data: DATA, empty: { tickets: [] } })

      expect(answer.states?.map((state) => state.state)).toEqual(['populated', 'empty'])
      expect(viewsOf(answer).map((view) => view.image)).toEqual([1, 2, 3, 4])
      expect(images).toHaveLength(4)

      const emptied = answer.states?.[1]?.inputs ?? []
      expect(emptied.find((fill) => fill.name === 'tickets')?.from).toBe('empty')
      expect(emptied.find((fill) => fill.name === 'title')?.from).toBe('data')

      // Same width and state order, so the populated and the empty phone are images 1 and 3.
      expect((images[0] as Buffer).equals(images[2] as Buffer)).toBe(false)
      expect((images[1] as Buffer).equals(images[3] as Buffer)).toBe(false)
    },
    SLOW,
  )

  it(
    'draws `empty` alone when there is no `data`, and one sampled screen when there is neither',
    async () => {
      const emptied = await render(TICKETS, { empty: { tickets: [] }, viewports: ['phone'] })
      expect(emptied.answer.states?.map((state) => state.state)).toEqual(['empty'])

      const sampled = await render(TICKETS, { viewports: ['phone'] })
      expect(sampled.answer.states?.map((state) => state.state)).toEqual(['sampled'])
      expect(sampled.answer.states?.[0]?.inputs.map((fill) => fill.from)).toEqual([
        'sample',
        'sample',
        'sample',
        'stub',
        'stub',
      ])
      expect(sampled.images).toHaveLength(1)
    },
    SLOW,
  )

  it(
    'draws under the pairing asked for, and under the system’s own palette and mode when not',
    async () => {
      const asked = await render(WIDE, {
        system: 'journal',
        palette: 'azure',
        mode: 'dark',
        viewports: ['desktop'],
      })
      expect(asked.answer.pairing).toEqual({ system: 'journal', palette: 'azure', mode: 'dark' })

      const terminal = registry.theme.systems.find((system) => system.name === 'terminal')
      const own = await render(WIDE, { system: 'terminal', viewports: ['desktop'] })
      expect(own.answer.pairing).toEqual({
        system: 'terminal',
        palette: terminal?.defaultPalette,
        mode: terminal?.defaultMode,
      })

      // A dark page and a light one are not the same bytes.
      const light = await render(WIDE, { system: 'journal', mode: 'light', viewports: ['desktop'] })
      expect((asked.images[0] as Buffer).equals(light.images[0] as Buffer)).toBe(false)
    },
    SLOW,
  )
})

describe('the page’s network', () => {
  it(
    'refuses every request that is not part of the page, and lists it',
    async () => {
      // A page that asks for something outside itself, and otherwise answers as the real one does.
      const reaching = resolve(SCRATCH, 'reaching.mjs')
      const page =
        '<!doctype html><script>' +
        'fetch("https://example.com/tracking.json").catch(() => {});' +
        'window.polymorphScreen = {' +
        ' draw: async () => ({ fills: [], failures: [] }),' +
        ' measure: () => ({ faults: [], truncated: [],' +
        ' page: { width: innerWidth, height: innerHeight, scrollHeight: innerHeight } }) }' +
        '</script>'
      writeFileSync(
        reaching,
        `process.send({ files: [{ name: 'screen.html', body: ${JSON.stringify(page)} }] }, ` +
          '() => process.exit(0))\n',
      )
      const { answer, images } = await render(
        WIDE,
        { viewports: ['desktop'] },
        { ...context, screenBuilder: reaching },
      )

      expect(answer.blocked).toEqual(['https://example.com/tracking.json'])
      expect(images).toHaveLength(1)
    },
    SLOW,
  )
})

describe('a lawful spec that is a bad screen', () => {
  it(
    'reports a row that does not fit a phone, at the phone’s width and not the desktop’s',
    async () => {
      const { answer, images } = await render(WIDE)

      expect(answer.fatal).toBeNull()
      expect(answer.ok).toBe(false)

      const [phone, desktop] = viewsOf(answer)
      expect(phone?.faults.map((fault) => fault.kind)).toContain('sideways-scroll')
      expect(phone?.faults[0]?.message).toMatch(/scrolls sideways: [\d.]+px of content in a 375px/)
      expect(desktop?.faults).toEqual([])
      // The picture is still returned: the fault is shown as well as named.
      expect(images).toHaveLength(2)
    },
    SLOW,
  )

  it(
    'pictures the whole of a page taller than its window, and says how tall',
    async () => {
      const tall = {
        ...WIDE,
        root: {
          component: 'Stack',
          props: { gap: 8, p: 4 },
          children: Array.from({ length: 30 }, (_, index) => button(`Action ${index + 1}`)),
        },
      }
      const { answer, images } = await render(tall, { viewports: ['phone'] })

      const [phone] = viewsOf(answer)
      expect(phone?.pageHeight).toBeGreaterThan(812)
      expect(phone?.imageHeight).toBe(Math.min(phone?.pageHeight ?? 0, 3 * 812))
      expect(sizeOf(images[0] as Buffer).height).toBe((phone?.imageHeight ?? 0) * 2)
    },
    SLOW,
  )

  it(
    'lists an element that threw while it rendered, and still returns the picture',
    async () => {
      // A list where a line of text goes. The spec is lawful, and the data is not what it binds.
      const { answer, images } = await render(TICKETS, {
        data: { ...DATA, title: { not: 'text' } },
        viewports: ['desktop'],
      })

      const [desktop] = viewsOf(answer)
      expect(answer.ok).toBe(false)
      expect(desktop?.failed).toHaveLength(1)
      expect(desktop?.failed[0]).toMatchObject({ component: 'Text', path: '$.children[0]' })
      expect(images).toHaveLength(1)
    },
    SLOW,
  )
})
