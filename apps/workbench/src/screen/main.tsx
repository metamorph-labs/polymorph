import {
  FONT_ROLES,
  gallerySlug,
  setMode,
  setMotionTemperament,
  setPalette,
  setSystem,
} from '@polymorph/engine'
import { ScreenDrawing } from '@polymorph/react/screen'
import { TooltipProvider } from '@polymorph/react-ui'
import type { Fill } from '@polymorph/screen'
import { VOCABULARY } from '@polymorph/screen/vocabulary'
import { createScreen } from '@polymorph/screen/walk'
import type { ScreenSpec } from '@polymorph/spec/schema'
import { createRoot, type Root } from 'react-dom/client'

import { addressOf, drawFault, EVERY_MEMBER, MEMBERS, resolveComponent } from '../composer/draw'
import { FAMILY_LOADERS } from '../fonts'
import { ensurePairing, installThemes, SYSTEMS } from '../themes'
import { measureLayout, type Measurement } from './measure'

/**
 * The screen page: a document that draws one screen spec and measures it.
 *
 * The MCP tool `render_screen` (`docs/tooling.md`) loads this page in a browser it drives, asks
 * it to draw a spec under a pairing, and then asks for the layout faults and takes the pictures.
 * The page has no route, toolbar or registry of its own. What it draws is in the request (the
 * spec, the pairing and the data), and what the spec's names mean is the run-time core's
 * vocabulary table, which `pnpm registry` writes from the same registry the server reads.
 *
 * The spec is drawn as the composer draws it (`../composer/draw.tsx`): by the run-time renderer
 * (`@polymorph/react/screen`) with the real vocabulary, so the picture is of the members a person
 * will get. A binding is filled instead of being shown as a placeholder: with the request's data
 * where it has some, and otherwise with a sample of the input's type. A callback answers by its
 * declared type. The run-time core fills them (`@polymorph/screen`), and says how it filled each
 * one (`Fill`).
 *
 * The page talks through one object on `window`, because the tool calls it from outside the
 * document. Everything that crosses is JSON.
 */

/** A member's name, as the request lists the server's registry. */
interface MemberName {
  name: string
}

export interface DrawRequest {
  /** A spec the tool has already checked with `validateSpec`. */
  spec: ScreenSpec
  /**
   * The members of the server's registry. A layout fault names the member a screen's author
   * wrote, by these names.
   */
  members: MemberName[]
  system: string
  palette: string
  mode: 'light' | 'dark'
  /** JSON values by input name. An input with none is sampled from its type. */
  data: Record<string, unknown>
}

export interface DrawReport {
  /** How each declared input was filled. */
  fills: Fill[]
  /** Each element that threw while it rendered. It shows as a fault chip in the picture. */
  failures: { path: string; component: string; message: string }[]
}

export interface ScreenPage {
  /** Draws a spec, and resolves when fonts and layout have settled. */
  draw: (request: DrawRequest) => Promise<DrawReport>
  /**
   * The layout faults of what is drawn, at the window's current size. It resolves after it has
   * moved keyboard focus through every control and put focus back.
   */
  measure: () => Promise<Measurement>
}

declare global {
  interface Window {
    polymorphScreen?: ScreenPage
  }
}

// Supplies the theme values and the eager pairings before anything is drawn, as `main.tsx` does.
installThemes()

const container = document.getElementById('root')
if (!container) throw new Error('screen: #root missing from screen.html')

let root: Root | null = null
let memberNames: Record<string, string> = {}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/**
 * Loads the `@font-face` rules of a system's families and waits for them. `fonts.ts` starts the
 * same loads from the `data-system` attribute and does not wait, which is right for an app and
 * wrong for a picture: text measured in a fallback face has a different width.
 */
async function loadFonts(systemName: string): Promise<void> {
  const system = SYSTEMS.find((candidate) => candidate.name === systemName)
  if (system === undefined) return
  const families = new Set(FONT_ROLES.map((role) => system.fonts[role].family))
  // A family that fails to load leaves its fallback stack, and the failed request is reported
  // by the tool, which sees every request the page makes.
  await Promise.all([...families].map((family) => FAMILY_LOADERS[family]?.().catch(() => {})))
}

/**
 * Waits for the drawn screen to stop changing. A face starts loading when layout first needs it,
 * so the wait is for a frame, then for the faces, then for the layout the faces changed.
 */
async function settled(): Promise<void> {
  await frame()
  await document.fonts.ready
  await frame()
  await document.fonts.ready
  await frame()
}

async function draw(request: DrawRequest): Promise<DrawReport> {
  const { spec, members, system, palette, mode, data } = request

  // A fresh root for each drawing, so no member keeps state from the one before.
  root?.unmount()
  root = createRoot(container as HTMLElement)
  window.scrollTo(0, 0)

  // The pairing's block is installed before either attribute names it, so no frame is unstyled.
  ensurePairing(system, palette)
  setSystem(system)
  setPalette(palette)
  setMode(mode)
  // A picture is one frame. With motion off, that frame is the settled state and not a member
  // halfway through its entrance.
  setMotionTemperament('none')
  await loadFonts(system)

  memberNames = Object.fromEntries(members.map((member) => [gallerySlug(member.name), member.name]))

  const failures: DrawReport['failures'] = []
  const screen = createScreen({
    document: spec,
    vocabulary: VOCABULARY,
    data,
    fill: 'sample',
    members: EVERY_MEMBER,
  })
  // The renderer reports an element it could not draw. One that threw is a failure of the
  // picture. One the React vocabulary has no component for (Toast, which React calls as
  // `toast()`) is drawn as its fault chip, and is not one that threw.
  const fail = screen.fail
  screen.fail = (fault) => {
    if (fault.component !== undefined && resolveComponent(fault.component) !== null) {
      failures.push({
        path: addressOf(fault.path),
        component: fault.component,
        message: fault.message,
      })
    }
    fail(fault)
  }

  // The delays of every Tooltip are set once for an app, at its root.
  root.render(
    <TooltipProvider>
      <ScreenDrawing screen={screen} members={MEMBERS} faults="inline" renderFault={drawFault} />
    </TooltipProvider>,
  )
  await settled()

  return { fills: [...screen.fills], failures }
}

window.polymorphScreen = { draw, measure: () => measureLayout(memberNames) }
