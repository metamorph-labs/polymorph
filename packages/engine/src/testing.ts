import {
  composeTheme,
  DATA_ATTRS,
  emitThemesCSS,
  installThemeCSS,
  parsePalette,
  parseSystem,
  resolveTheme,
  type ResolvedTheme,
} from '@polymorph/theme'

import { agentEntries } from './conventions/agent'

import amethyst from '../../../design/palettes/amethyst.json' with { type: 'json' }
import pastel from '../../../design/systems/pastel.json' with { type: 'json' }

/**
 * Installs a real theme so a test can read a computed style and get a token back.
 *
 * Component tests must go through the cascade. In the vocabulary, appearance
 * comes from `--pm-*` custom properties, and a test that asserts a hardcoded
 * pixel value does not check that.
 */
export function installTestTheme(): ResolvedTheme {
  const theme = resolveTheme(composeTheme(parseSystem(pastel), parsePalette(amethyst)))
  installThemeCSS(emitThemesCSS([theme]))
  document.documentElement.setAttribute(DATA_ATTRS.system, theme.system)
  document.documentElement.setAttribute(DATA_ATTRS.palette, theme.palette)
  document.documentElement.setAttribute(DATA_ATTRS.mode, 'light')
  return theme
}

/** A host with a fixed width, so `1fr` tracks and `100%` resolve to real sizes. */
export function fixedWidthHost(width = 600): HTMLElement {
  const host = document.createElement('div')
  host.style.width = `${width}px`
  document.body.append(host)
  return host
}

/** A registered agent member, as a test reads it: its id, its name and its two elements. */
export interface AgentRegistration {
  readonly id: string
  readonly member: string
  /** The element that names the member. */
  readonly element: Element | null
  /** The regions whose members it withholds (`withholds contents`); empty when it withholds none. */
  readonly withholds: readonly Element[]
}

/**
 * Every member registered with the agent registry, withheld ones included,
 * which a bridge does not report. A test reads it to show that a member it
 * expects to be withheld is registered, so the bridge's silence about it is
 * the withholding and not a member that never registered. It holds no state
 * and no action, which only a bridge reads.
 */
export function agentRegistrations(): AgentRegistration[] {
  const read = <Read>(get: (() => Read | null | undefined) | undefined): Read | null => {
    try {
      return get?.() ?? null
    } catch {
      return null
    }
  }
  return agentEntries().map(({ id, handle }) => {
    const regions = read(handle.withholds)
    return {
      id,
      member: handle.member,
      element: read(handle.element),
      withholds: (Array.isArray(regions) ? regions : [regions]).filter(
        (region): region is Element => Boolean(region),
      ),
    }
  })
}
