import { beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { GALLERIES } from '../galleries'
import { mount } from '../mount'

/**
 * The host law: a member's host element changes no member's box.
 *
 * An Angular component renders inside a host element of its own (`<pm-card>`),
 * which the other web renderers do not have. A host draws no box
 * (`display: contents`), but it is still the parent or the sibling a recipe
 * selector reads: `.grid > *` matches the host and not the Card it holds,
 * and `.row + .row` finds no row beside a row that sits in a host of its own.
 *
 * For every states fixture entry the law mounts the entry, then a copy of
 * what it rendered with each host that draws no box replaced by its children,
 * which is the document the other renderers draw. Every `[data-member]` box
 * has the same size in the mount as in the copy. A portal's content, at the
 * end of the body, is copied and compared with the mount's.
 *
 * The law reads boxes, so it finds a rule that a host stops from reaching the
 * member only when the rule changes a member's size: a span, a gap, a border,
 * a margin inside a member. A rule that sets only a colour is not measured.
 * The published build compiles the recipes through the same transform as
 * this project, which `packaging.test.ts` checks.
 *
 * The law is one module that each of four files calls for the members whose
 * names begin with a range of letters, so the browser runs the four in
 * parallel.
 */

/** A host that draws no box: a member's (`<pm-card>`), an icon's, an overlay's. */
const isHost = (node: Node): node is Element =>
  node instanceof Element &&
  node.localName.startsWith('pm-') &&
  getComputedStyle(node).display === 'contents'

/**
 * A copy of the nodes with each host replaced by its children. A host's
 * display is read from the live node, so it is read before the copy is
 * placed anywhere.
 */
export function unwrapped(nodes: Iterable<Node>): Node[] {
  const out: Node[] = []
  for (const node of nodes) {
    if (isHost(node)) {
      out.push(...unwrapped(node.childNodes))
      continue
    }
    const copy = node.cloneNode(false)
    for (const child of unwrapped(node.childNodes)) copy.appendChild(child)
    out.push(copy)
  }
  return out
}

/** Every `[data-member]` element's box, in document order: its name and its layout size. */
export function boxes(roots: readonly Element[]): string[] {
  return roots.flatMap((root) =>
    [root, ...root.querySelectorAll('[data-member]')]
      .filter((element) => element.hasAttribute('data-member'))
      .map((element) => {
        // The layout box, which a transform (a spinner's turn, an entrance's scale) leaves alone.
        const size =
          element instanceof HTMLElement
            ? [element.offsetWidth, element.offsetHeight]
            : element instanceof SVGSVGElement
              ? [element.clientWidth, element.clientHeight]
              : [element.getBoundingClientRect().width, element.getBoundingClientRect().height]
        return `${element.getAttribute('data-member')} ${size.map((value) => Math.round(value)).join('×')}`
      }),
  )
}

const frame = () => new Promise<void>((settle) => requestAnimationFrame(() => settle()))

/**
 * The frames a mount is given before it may count as still. A member's
 * entrance can wait a few frames before it starts.
 */
const FIRST_FRAMES = 8

/** Whether an animation that ends is playing: an entrance, a panel growing. A spinner's never ends. */
const moving = () =>
  document.getAnimations().some((animation) => {
    if (animation.playState !== 'running' && !animation.pending) return false
    const end = animation.effect?.getComputedTiming().endTime
    return typeof end === 'number' && Number.isFinite(end)
  })

/** The boxes once they are still: the same two frames running, with no animation that ends playing. */
async function settled(roots: () => Element[]): Promise<string[]> {
  let last = ''
  for (let attempt = 0; attempt < 120; attempt++) {
    await frame()
    const now = boxes(roots())
    const text = JSON.stringify(now)
    if (text === last && attempt >= FIRST_FRAMES && !moving()) return now
    last = text
  }
  return JSON.parse(last) as string[]
}

/** An image in the copy loads again, so its box is read once it has. */
async function loaded(roots: readonly Element[]): Promise<void> {
  const images = roots.flatMap((root) => [...root.querySelectorAll('img')])
  await Promise.all(images.map((image) => image.decode().catch(() => undefined)))
}

/** What a mount shows: what its own element holds, then what it portalled to the body, in order. */
function addedTo(before: ReadonlySet<Element>, host: Element): () => Element[] {
  return () => [
    ...host.children,
    ...[...document.body.children].filter((child) => !before.has(child) && child !== host),
  ]
}

/**
 * The host law over every states fixture whose member's name begins with a
 * letter from `first` to `last`.
 */
export function hostLaw(first: string, last: string): void {
  beforeAll(installTestTheme)
  const galleries = GALLERIES.filter((states) => {
    const letter = states.component.charAt(0)
    return letter >= first && letter <= last
  })
  describe(`hosts — a member's host changes no member's box (${first}–${last})`, () => {
    for (const states of galleries) {
      for (const entry of states.entries) {
        it(`${states.component} — ${entry.name}`, async () => {
          const before = new Set(document.body.children)
          const mounted = await mount(states, entry.name)
          const roots = addedTo(before, mounted.host)
          const actual = await settled(roots)

          // The copy of the mount sits where the mount does, at the mount's width.
          const [own, ...portalled] = roots()
          const width = mounted.host.getBoundingClientRect().width
          const copy = document.createElement('div')
          copy.style.width = `${width}px`
          copy.append(...unwrapped(mounted.host.childNodes))
          const copies = unwrapped(portalled).filter((node) => node instanceof Element)
          mounted.host.after(copy)
          document.body.append(...copies)
          try {
            await loaded([copy, ...copies])
            const expected = await settled(() => [...copy.children, ...copies])
            expect(own, 'the mount rendered').toBeDefined()
            expect(actual, 'each member’s box, against the document with no hosts').toEqual(
              expected,
            )
          } finally {
            copy.remove()
            for (const node of copies) node.remove()
            mounted.unmount()
          }
        })
      }
    }
  })
}
