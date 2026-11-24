import { fork } from 'node:child_process'

import { validateSpec, type ScreenSpec, type SpecFault } from '@polymorph/spec'
import type { Browser, BrowserContext, Page } from 'playwright'

import type { ToolContext } from './tools'
import { submittedDocument, type SubmittedSpec } from './submitted'

/**
 * `render_screen`: a screen spec drawn in a real browser, as pictures and as measured faults.
 *
 * `validate` answers whether a spec is lawful. A lawful spec can still be a bad screen: a row
 * that does not fit a phone, a title squeezed to one letter a line, a table drawn with nothing
 * in it. Those show only when the screen is drawn, so this tool draws it and returns what a
 * person would see, and what a person would miss, as data.
 *
 * **Nothing here renders.** The drawing is done by the workbench's screen page
 * (`apps/workbench/src/screen/`), which is the composer's renderer with the real vocabulary. The
 * measuring is done by that page too. This module checks the request, has the page built, drives
 * a browser over it and arranges the answer. A second renderer in a front would be a second
 * source of truth about what a member looks like.
 *
 * **Where the page comes from.** The server runs from a checkout over stdio and has a pinned
 * dependency list, so it has no bundler and may print nothing. The entry point names a program
 * the workbench owns (`screenBuilder`). It runs as a child process the first time the tool is
 * called, builds the page in memory with the workbench's own Vite configuration, and sends the
 * files back over the process channel. The files stay in this process for its lifetime, as the
 * registry does, and the browser is given them by request interception. No port is opened and
 * no file is written. A published package would ship the built page beside its registry and
 * skip the build.
 *
 * **The browser is optional.** Playwright is an optional dependency, loaded when the tool is
 * called and not before. When the package or its Chromium is missing, the tool answers with the
 * command that installs it, and every other tool is unaffected, because nothing else imports
 * this module's browser.
 *
 * **The page has no network.** Every request it makes is answered from the built files or
 * refused, and a refused one is listed in the answer.
 */

/* -------------------------------------------------------------------------- */
/* The request and the answer                                                 */
/* -------------------------------------------------------------------------- */

export const VIEWPORTS = ['phone', 'desktop'] as const
export type Viewport = (typeof VIEWPORTS)[number]

/**
 * The two windows a screen is drawn in. They are the sizes the proof's lanes use
 * (`proof/shoot.mjs`), so a picture from this tool is comparable with one of theirs. The phone is
 * drawn at two device pixels a point, because its text is otherwise too small to read in a
 * picture.
 */
const WINDOWS: Record<Viewport, { width: number; height: number; deviceScaleFactor: number }> = {
  phone: { width: 375, height: 812, deviceScaleFactor: 2 },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
}

/**
 * How many windows of a page one picture holds. A picture is of the whole page, so that what is
 * under the first window is seen too. A very long page is cut here, because a reader of a
 * picture many windows tall can no longer read its text. The faults are measured over the whole
 * page either way.
 */
const PICTURED_WINDOWS = 3

export interface RenderScreenArgs {
  /** A screen spec, the document or its JSON text: what `validate` accepts. */
  spec: SubmittedSpec
  /** A shipped system. */
  system: string
  /** A shipped palette. The system's own when omitted. */
  palette?: string
  /** The system's default mode when omitted. */
  mode?: 'light' | 'dark'
  /** A JSON value for each input the screen should be drawn with, by input name. */
  data?: Record<string, unknown>
  /** Values that replace `data`'s for a second drawing: the screen with nothing in it. */
  empty?: Record<string, unknown>
  /** Both when omitted. */
  viewports?: Viewport[]
}

/**
 * How one input was filled: the run-time core's `Fill` (`@polymorph/screen`), which the page
 * reports for each declared input, with `empty` for one this tool filled from `empty`.
 */
export interface InputFill {
  name: string
  type: string
  from: 'data' | 'empty' | 'sample' | 'stub'
  value?: string
}

export interface LayoutFault {
  kind: 'sideways-scroll' | 'clipped-text' | 'small-target' | 'cut-off' | 'no-gap' | 'unseen-focus'
  element: string
  message: string
}

export interface ScreenView {
  viewport: Viewport
  /** The window, in CSS pixels. */
  window: { width: number; height: number }
  /** The whole height of the page. More than the window's when the page scrolls. */
  pageHeight: number
  /** Which image of the answer this view is, counted from 1. */
  image: number
  /**
   * How much of the page the image shows, in CSS pixels from its top: the whole page, up to
   * `PICTURED_WINDOWS` windows. Under `pageHeight`, the rest is measured and not pictured.
   */
  imageHeight: number
  faults: LayoutFault[]
  /** Text a member shortened with an ellipsis. By design, and listed so it can be checked. */
  truncated: string[]
  /** Elements that threw while they rendered. Each shows as a fault chip in the picture. */
  failed: { path: string; component: string; message: string }[]
}

/**
 * `sampled` is a screen given no data, `populated` is the screen with `data`, and `empty` is the
 * screen with `empty` laid over `data`.
 */
export type ScreenStateName = 'sampled' | 'populated' | 'empty'

export interface ScreenState {
  state: ScreenStateName
  inputs: InputFill[]
  views: ScreenView[]
}

export interface RenderScreenAnswer {
  /** True when the screen was drawn and nothing was found: no layout fault and no failed element. */
  ok: boolean
  /** Why nothing was drawn, when the request itself was wrong. */
  fatal: string | null
  /** The spec's faults, as `validate` reports them. A spec with any is not drawn. */
  specFaults?: SpecFault[]
  pairing?: { system: string; palette: string; mode: 'light' | 'dark' }
  states?: ScreenState[]
  /** Requests the page made that are not part of it. The page has no network, so each was refused. */
  blocked?: string[]
  /** Errors the page threw outside any element. */
  errors?: string[]
}

export interface RenderedScreen {
  answer: RenderScreenAnswer
  /** One PNG for each view, in the order the views number them. */
  images: Buffer[]
}

/**
 * The tool cannot draw at all: the server was started without the page's builder, the build
 * failed, or there is no browser. Its message is written for an agent to act on or pass on.
 */
export class ScreenUnavailableError extends Error {
  override name = 'ScreenUnavailableError'
}

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

/** One built file: its bytes and the type the browser is told. */
interface PageFile {
  body: Buffer
  contentType: string
}

type PageFiles = ReadonlyMap<string, PageFile>

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  woff: 'font/woff',
  woff2: 'font/woff2',
}

const contentTypeOf = (name: string): string =>
  CONTENT_TYPES[name.slice(name.lastIndexOf('.') + 1)] ?? 'application/octet-stream'

/** What the builder sends: the files, or why there are none. */
type BuilderMessage =
  { files: { name: string; body: string | Uint8Array }[] } | { error: string } | undefined

/**
 * Runs the builder and collects the page. The child gets no stdout: this process's stdout is the
 * protocol, and a child that inherited it could write into a frame.
 */
function build(builder: string): Promise<PageFiles> {
  return new Promise((resolve, reject) => {
    const refuse = (reason: string) =>
      reject(
        new ScreenUnavailableError(
          `render_screen could not build the page it draws in (${builder}): ${reason}`,
        ),
      )

    const child = fork(builder, [], {
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      // The flags of this process are its loader's, and the builder is plain node.
      execArgv: [],
    })

    let complaint = ''
    let answered = false
    child.stderr?.on('data', (chunk: Buffer) => (complaint += chunk.toString()))
    child.on('error', (error) => refuse(error.message))
    child.on('message', (raw) => {
      const message = raw as BuilderMessage
      answered = true
      if (message === undefined || 'error' in message) {
        refuse(message?.error ?? 'the builder sent nothing')
        return
      }
      resolve(
        new Map(
          message.files.map(({ name, body }) => [
            name,
            { body: Buffer.from(body), contentType: contentTypeOf(name) },
          ]),
        ),
      )
    })
    child.on('exit', (code) => {
      if (!answered) refuse(complaint.trim() || `the builder exited with code ${String(code)}`)
    })
  })
}

/** The built page of each builder, kept for the life of the process. */
const built = new Map<string, Promise<PageFiles>>()

function pageOf(builder: string): Promise<PageFiles> {
  const known = built.get(builder)
  if (known !== undefined) return known
  const building = build(builder)
  built.set(builder, building)
  // A failed build is not kept, so the next call tries again.
  building.catch(() => built.delete(builder))
  return building
}

/* -------------------------------------------------------------------------- */
/* The browser                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Why a browser could not be started, as an instruction, or `null` when the failure is not one
 * of the two expected ones.
 *
 * The package is missing after an install that skipped optional dependencies. The browser is
 * missing until Playwright has downloaded one, which an install does not do.
 */
export function browserAdvice(error: unknown, root: string): string | null {
  const message = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: unknown } | null)?.code

  if (
    code === 'ERR_MODULE_NOT_FOUND' ||
    code === 'MODULE_NOT_FOUND' ||
    /Cannot find (?:module|package) ['"]playwright/.test(message)
  ) {
    return (
      'render_screen needs Playwright, an optional dependency that is not installed. In ' +
      `${root}, run \`pnpm install\` without \`--no-optional\`, then ` +
      '`pnpm exec playwright install chromium`. Every other tool works without it.'
    )
  }

  if (/Executable doesn't exist|playwright install/.test(message)) {
    return (
      'render_screen needs a Chromium that Playwright has not downloaded. In ' +
      `${root}, run \`pnpm exec playwright install chromium\`. Every other tool works without it.`
    )
  }

  return null
}

async function launch(root: string): Promise<Browser> {
  try {
    const { chromium } = await import('playwright')
    return await chromium.launch()
  } catch (error) {
    const advice = browserAdvice(error, root)
    if (advice !== null) throw new ScreenUnavailableError(advice)
    throw error
  }
}

/**
 * The address the page is loaded from. Nothing listens there: every request is answered from
 * memory before it reaches a network. It is `https` so the document is a secure context, as a
 * deployed app's is.
 */
const ORIGIN = 'https://screen.polymorph.invalid'

/** What the page puts on `window` (`apps/workbench/src/screen/main.tsx`). */
interface ScreenPage {
  draw: (request: unknown) => Promise<{
    fills: InputFill[]
    failures: ScreenView['failed']
  }>
  measure: () => Promise<{
    faults: LayoutFault[]
    truncated: string[]
    page: { width: number; height: number; scrollHeight: number }
  }>
}

/**
 * The document's global object, as the functions below see it. Each of them is sent to the
 * browser as source and runs there, so it can name nothing from this module but a type.
 */
type Hosted = { polymorphScreen?: ScreenPage }

/** A context whose every request is answered from the built page or refused. */
async function openContext(
  browser: Browser,
  files: PageFiles,
  viewport: Viewport,
  mode: 'light' | 'dark',
  blocked: Set<string>,
): Promise<BrowserContext> {
  const { width, height, deviceScaleFactor } = WINDOWS[viewport]
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor,
    colorScheme: mode,
  })
  await context.route('**/*', async (route) => {
    const url = route.request().url()
    const file = url.startsWith(`${ORIGIN}/`)
      ? files.get(decodeURIComponent(new URL(url).pathname.slice(1)))
      : undefined
    if (file === undefined) {
      blocked.add(url)
      await route.abort()
      return
    }
    await route.fulfill({ status: 200, body: file.body, contentType: file.contentType })
  })
  return context
}

/**
 * Loads the page and waits until it offers its functions. A page that throws while it loads
 * never offers them, so the wait is raced against the page's first error, and the failure
 * carries that error and not the wait's timeout.
 */
async function openPage(context: BrowserContext, errors: Set<string>): Promise<Page> {
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.add(error.message))
  const threw = new Promise<Error>((resolve) => page.once('pageerror', resolve))

  await page.goto(`${ORIGIN}/screen.html`)
  const ready = page
    .waitForFunction(() => (globalThis as unknown as Hosted).polymorphScreen !== undefined)
    .then(() => null)
  // When the page throws first, this wait ends later, with the browser, and nothing awaits it.
  ready.catch(() => {})

  const failure = await Promise.race([ready, threw])
  if (failure !== null) {
    throw new ScreenUnavailableError(
      `render_screen could not start the page it draws in: ${failure.message}`,
    )
  }
  return page
}

interface Drawn {
  fills: InputFill[]
  view: Omit<ScreenView, 'image'>
  png: Buffer
}

/** One state in one window: draw, take the picture, then measure. */
async function drawState(page: Page, viewport: Viewport, request: unknown): Promise<Drawn> {
  const report = await page.evaluate(
    (sent) => (globalThis as unknown as Required<Hosted>).polymorphScreen.draw(sent),
    request,
  )
  const { width, height } = WINDOWS[viewport]
  const pageHeight = await page.evaluate(
    () => (document.scrollingElement ?? document.documentElement).scrollHeight,
  )
  const imageHeight = Math.min(Math.max(pageHeight, height), PICTURED_WINDOWS * height)
  // The picture is taken before the measure, which scrolls controls into the window to ask
  // what a touch on them lands on, and moves keyboard focus through them.
  const png = await page.screenshot({
    type: 'png',
    fullPage: true,
    clip: { x: 0, y: 0, width, height: imageHeight },
    animations: 'disabled',
    caret: 'hide',
  })
  const measured = await page.evaluate(() =>
    (globalThis as unknown as Required<Hosted>).polymorphScreen.measure(),
  )

  return {
    fills: report.fills,
    png,
    view: {
      viewport,
      window: { width: measured.page.width, height: measured.page.height },
      pageHeight: measured.page.scrollHeight,
      imageHeight,
      faults: measured.faults,
      truncated: measured.truncated,
      failed: report.failures,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* The tool                                                                   */
/* -------------------------------------------------------------------------- */

const refused = (fatal: string): RenderedScreen => ({
  answer: { ok: false, fatal },
  images: [],
})

/** The quoted names of a list, for a sentence that says what exists. */
const named = (names: readonly string[]): string => names.map((name) => `\`${name}\``).join(', ')

/**
 * The keys of `data` or `empty` that cannot fill anything, each with the reason. A key that
 * names no input would be dropped without a word, and the picture would then show a sampled
 * screen its caller believes is populated.
 */
function unusable(
  argument: 'data' | 'empty',
  values: Record<string, unknown> | undefined,
  spec: ScreenSpec,
): string[] {
  return Object.keys(values ?? {}).flatMap((key) => {
    const input = spec.inputs.find((candidate) => candidate.name === key)
    if (input === undefined) return [`\`${argument}.${key}\` names no input the spec declares`]
    if (input.type.includes('=>')) {
      return [
        `\`${argument}.${key}\` is a callback (\`${input.type}\`), which JSON cannot hold; the ` +
          'page stubs every callback',
      ]
    }
    return []
  })
}

/**
 * Draws a screen spec and returns its pictures and its layout faults.
 *
 * The spec is checked first, by the check `validate` runs, and an unlawful one is not drawn: its
 * faults are the answer. A spec for `ios` or `android` is refused, because its members are drawn
 * by SwiftUI or Compose and this tool runs a browser.
 *
 * The React members draw the picture. Every web framework's members import the same recipes
 * (`@polymorph/recipes`), so the layout measured here is the layout of each.
 */
export async function renderScreen(
  context: ToolContext,
  args: RenderScreenArgs,
): Promise<RenderedScreen> {
  const read = submittedDocument(args.spec)
  if ('fatal' in read) return refused(read.fatal)
  const { document } = read

  const platform = (document as { platform?: unknown } | null)?.platform
  if (platform === 'ios' || platform === 'android') {
    return refused(
      `the spec's platform is \`${platform}\`, and render_screen draws web screens in a browser. ` +
        'A native screen is drawn by its own toolchain (docs/native.md).',
    )
  }

  const checked = validateSpec(context.registry, document)
  if (!checked.ok) {
    return {
      answer: {
        ok: false,
        fatal: 'the spec is not lawful, so it was not drawn. Fix the faults, then call again.',
        specFaults: checked.faults,
      },
      images: [],
    }
  }
  const spec = document as ScreenSpec

  const { systems, palettes } = context.registry.theme
  const system = systems.find((candidate) => candidate.name === args.system)
  if (system === undefined) {
    return refused(
      `no shipped system is called \`${args.system}\`. The systems are ` +
        `${named(systems.map((candidate) => candidate.name))}.`,
    )
  }
  const palette = args.palette ?? system.defaultPalette
  if (!palettes.some((candidate) => candidate.name === palette)) {
    return refused(
      `no shipped palette is called \`${palette}\`. The palettes are ` +
        `${named(palettes.map((candidate) => candidate.name))}.`,
    )
  }
  const mode = args.mode ?? (system.defaultMode === 'dark' ? 'dark' : 'light')

  const unusableKeys = [
    ...unusable('data', args.data, spec),
    ...unusable('empty', args.empty, spec),
  ]
  if (unusableKeys.length > 0) {
    const declared = spec.inputs.filter((input) => !input.type.includes('=>'))
    return refused(
      `${unusableKeys.join('; ')}. The inputs that take data are ` +
        `${declared.length === 0 ? 'none' : named(declared.map((input) => input.name))}.`,
    )
  }

  if (context.screenBuilder === undefined) {
    throw new ScreenUnavailableError(
      'render_screen draws in a page this server was not given a builder for. Start the server ' +
        'from its entry point (`bin/polymorph-mcp.js`), which names it.',
    )
  }

  // With no `data` and no `empty` there is one drawing, of the sampled screen. `empty` alone
  // draws the empty screen alone.
  const states: { state: ScreenStateName; data: Record<string, unknown> }[] = []
  if (args.data !== undefined) states.push({ state: 'populated', data: args.data })
  if (args.empty !== undefined)
    states.push({ state: 'empty', data: { ...args.data, ...args.empty } })
  if (states.length === 0) states.push({ state: 'sampled', data: {} })

  const viewports = VIEWPORTS.filter((viewport) => (args.viewports ?? VIEWPORTS).includes(viewport))
  const members = context.registry.components.map(({ name, props, parts }) => ({
    name,
    props,
    parts,
  }))

  const files = await pageOf(context.screenBuilder)
  const browser = await launch(context.root)
  const blocked = new Set<string>()
  const errors = new Set<string>()

  let drawn: Drawn[][]
  try {
    // One window each, at the same time. Each draws every state in turn in one document.
    drawn = await Promise.all(
      viewports.map(async (viewport) => {
        const browserContext = await openContext(browser, files, viewport, mode, blocked)
        const page = await openPage(browserContext, errors)

        const results: Drawn[] = []
        for (const { data } of states) {
          results.push(
            await drawState(page, viewport, {
              spec,
              members,
              system: system.name,
              palette,
              mode,
              data,
            }),
          )
        }
        return results
      }),
    )
  } finally {
    await browser.close()
  }

  const images: Buffer[] = []
  const answered: ScreenState[] = states.map(({ state }, stateIndex) => {
    const perViewport = drawn.map((results) => results[stateIndex] as Drawn)
    return {
      state,
      // An input filled from `empty` is named so, where the page only knows it was given data.
      inputs: (perViewport[0]?.fills ?? []).map((fill) =>
        fill.from === 'data' && state === 'empty' && Object.hasOwn(args.empty ?? {}, fill.name)
          ? { ...fill, from: 'empty' as const }
          : fill,
      ),
      views: perViewport.map(({ view, png }) => {
        images.push(png)
        return { ...view, image: images.length }
      }),
    }
  })

  const clean = answered.every((state) =>
    state.views.every((view) => view.faults.length === 0 && view.failed.length === 0),
  )

  return {
    answer: {
      ok: clean && errors.size === 0,
      fatal: null,
      pairing: { system: system.name, palette, mode },
      states: answered,
      ...(blocked.size === 0 ? {} : { blocked: [...blocked] }),
      ...(errors.size === 0 ? {} : { errors: [...errors] }),
    },
    images,
  }
}
