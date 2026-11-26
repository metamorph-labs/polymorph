import { describe, expect, it } from 'vitest'

/**
 * The law for a disabled control (`design/components/README.md`, Disabled): it is not a tab
 * stop, and nothing inside a disabled member is one. Every web shell's `src/laws.test` calls it
 * with a mount of its own, over every entry of every states fixture, so a member that says it is
 * disabled and still takes Tab fails in the shell that draws it that way.
 *
 * A contract statement reads one part of one member (`docs/conformance.md`). This rule is about
 * every member, in every state its fixture shows, so it is a law over the fixtures and not a
 * line in each spec.
 *
 * The law reads the tab order from the document and presses no key: Tab does not stop on every
 * control in WebKit, and what the law states is which elements may be stops.
 */

/** What a browser gives a place in the tab order without a `tabindex` of its own. */
const FOCUSABLE = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[tabindex]',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ')

/** An element that says it is disabled, by ARIA or by the members' own attribute. */
const SAYS_DISABLED = '[aria-disabled="true"], [data-disabled]:not([data-disabled="false"])'

/**
 * The one position the rule leaves in the tab order. A day an application's
 * `isDateUnavailable` refuses is `aria-disabled` and cannot be chosen, and the arrows still
 * reach it, because a calendar's grid is walked by its geometry and a person hears why the day
 * is struck through. So the grid's one tab stop may be on it.
 */
const CROSSED = '[data-unavailable]'

/** An element as a fault names it: its tag and the attributes that tell one part from another. */
function named(element: Element): string {
  const shown = ['data-member', 'data-part', 'role', 'aria-label', 'aria-disabled', 'tabindex']
    .filter((attribute) => element.hasAttribute(attribute))
    .map((attribute) => `${attribute}="${element.getAttribute(attribute) ?? ''}"`)
  const words = (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)
  return `<${[element.tagName.toLowerCase(), ...shown].join(' ')}>${words === '' ? '' : ` "${words}"`}`
}

/** Whether Tab can stop on the element: in the tab order, enabled to the browser, and drawn. */
function tabStop(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || element.matches(':disabled')) return false
  if (element.closest('[inert], [hidden]') !== null) return false
  if (element.getClientRects().length === 0) return false
  return getComputedStyle(element).visibility === 'visible'
}

/**
 * Every tab stop under `root` that says it is disabled, or that sits inside an element that
 * does, each as one line. An empty list is the law holding.
 */
export function disabledTabStops(root: ParentNode = document.body): string[] {
  const faults: string[] = []
  for (const element of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (!tabStop(element) || element.closest(CROSSED) !== null) continue
    const holder = element.closest(SAYS_DISABLED)
    if (holder === null) continue
    faults.push(
      holder === element
        ? `${named(element)} says it is disabled and is a tab stop`
        : `${named(element)} is a tab stop inside the disabled ${named(holder)}`,
    )
  }
  return faults
}

/** A states fixture as the law reads it: the member and its entries. */
export interface DisabledLawGallery {
  readonly component: string
  readonly entries: readonly { readonly name: string; readonly rendersNothing?: boolean }[]
}

export interface DisabledLaw<Gallery extends DisabledLawGallery> {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Every states fixture the shell ships (its `galleries.ts`). */
  readonly galleries: readonly Gallery[]
  /** Mounts one entry of a fixture, as the shell's other laws mount it. */
  mount(
    gallery: Gallery,
    entry: Gallery['entries'][number],
  ): Promise<{ unmount: () => void }> | { unmount: () => void }
}

/** One frame, after which a machine that sets its attributes once it has mounted has set them. */
const frame = () => new Promise<void>((settle) => requestAnimationFrame(() => settle()))

/** Runs the law for one shell. Call it once, at the top level of the shell's `src/laws.test`. */
export function disabledLaw<Gallery extends DisabledLawGallery>({
  shell,
  galleries,
  mount,
}: DisabledLaw<Gallery>): void {
  describe(`a disabled control is not a tab stop — every fixture entry, the ${shell} shell`, () => {
    for (const gallery of galleries) {
      it(gallery.component, { timeout: 120_000 }, async () => {
        const faults: string[] = []
        for (const entry of gallery.entries) {
          if (entry.rendersNothing) continue
          const { unmount } = await mount(gallery, entry)
          await frame()
          for (const fault of disabledTabStops()) faults.push(`${entry.name}: ${fault}`)
          unmount()
        }
        expect(faults).toEqual([])
      })
    }
  })

  describe(`the disabled check detects faults, in the ${shell} shell`, () => {
    const probe = (html: string): string[] => {
      const host = document.createElement('div')
      host.innerHTML = html
      document.body.append(host)
      try {
        return disabledTabStops(host)
      } finally {
        host.remove()
      }
    }

    it('finds a tab stop that says it is disabled', () => {
      expect(probe('<div role="button" aria-disabled="true" tabindex="0">Archive</div>')).toEqual([
        '<div role="button" aria-disabled="true" tabindex="0"> "Archive" says it is disabled and is a tab stop',
      ])
    })

    it('finds a tab stop inside a member that says it is disabled', () => {
      const faults = probe(
        '<div data-member="probe" data-disabled=""><button>Remove</button></div>',
      )
      expect(faults).toHaveLength(1)
      expect(faults[0]).toContain('is a tab stop inside the disabled <div data-member="probe">')
    })

    it('passes a control the browser disables, one out of the tab order, one not drawn and an unavailable day', () => {
      expect(
        probe(
          '<div data-disabled="">' +
            '<button disabled>Save</button>' +
            '<div role="option" aria-disabled="true" tabindex="-1">Closed</div>' +
            '<button style="display: none">Hidden</button>' +
            '</div>' +
            // A calendar's unavailable day, which the arrows cross.
            '<table><tr><td role="gridcell" aria-disabled="true">' +
            '<div data-unavailable="" tabindex="0">14</div>' +
            '</td></tr></table>' +
            '<button>Enabled</button>',
        ),
      ).toEqual([])
    })
  })
}
