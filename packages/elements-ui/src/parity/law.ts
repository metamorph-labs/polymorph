import { render } from 'solid-js/web'
import { beforeAll, describe, expect, it } from 'vitest'

import { PolyElement } from '@polymorph/elements'
import { installTestTheme } from '@polymorph/engine/testing'
import type { ComponentStates } from '@polymorph/solid'

import { GALLERIES as SOLID_GALLERIES } from '../../../solid-ui/src/galleries'
import { GALLERIES } from '../galleries'
import { mount } from '../mount'

/**
 * The parity law: every states fixture entry renders the same document as an
 * element and as the Solid member it wraps.
 *
 * The elements render the Solid members, so the two can differ only where the
 * page's markup meets the member: a slot that reads the light DOM differently
 * from JSX, an attribute that reads into a different prop, a recipe rule a
 * host breaks. For every entry, the element mount's document, with each
 * element that draws no box replaced by its children, is the Solid mount's:
 * the same tags, classes, ids, `for`, roles, `aria-*` and `data-*` attributes,
 * and text, with the ids an instance makes compared by where they first
 * appear. Every `[data-member]` box has the same size in both. A portal's
 * content, at the end of the body, is compared with the mount's.
 *
 * The law is one module that each of four files calls for the members whose
 * names begin with a range of letters, so the browser runs the four in
 * parallel.
 */

/** One node as the law compares it: an element's tag, compared attributes and children, or text. */
export type Shape = string | { tag: string; attributes: Record<string, string>; children: Shape[] }

const compared = (name: string) =>
  name === 'class' ||
  name === 'id' ||
  name === 'for' ||
  name === 'role' ||
  name.startsWith('aria-') ||
  name.startsWith('data-')

/** The ids an instance makes (`cl-4`, and the ids a machine builds from one), by first appearance. */
export function naming(): (value: string) => string {
  const seen = new Map<string, string>()
  return (value) =>
    value.replace(/\bcl-\d+\b/g, (id) => {
      if (!seen.has(id)) seen.set(id, `id${seen.size}`)
      return seen.get(id) as string
    })
}

/** The nodes as the law compares them, each element that draws no box replaced by its children. */
export function shapes(nodes: Iterable<Node>, name: (value: string) => string): Shape[] {
  const out: Shape[] = []
  for (const node of nodes) {
    if (node instanceof PolyElement) {
      out.push(...shapes(node.childNodes, name))
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = (node as Text).data
      if (text === '') continue
      // Adjacent text is one text, however a renderer split it.
      const last = out.at(-1)
      if (typeof last === 'string') out[out.length - 1] = last + text
      else out.push(text)
    } else if (node instanceof Element) {
      const attributes: Record<string, string> = {}
      for (const attribute of [...node.attributes].sort((a, b) => a.name.localeCompare(b.name))) {
        if (compared(attribute.name)) attributes[attribute.name] = name(attribute.value)
      }
      out.push({ tag: node.localName, attributes, children: shapes(node.childNodes, name) })
    }
  }
  return out
}

/** Every `[data-member]` element's box, in document order: its name and its layout size. */
function boxes(roots: readonly Element[]): string[] {
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
 * entrance can wait a few frames before it starts (an Accordion's open
 * panel measures itself, then grows), and two equal frames before it starts
 * are not the mount at rest.
 */
const FIRST_FRAMES = 8

/** Whether an animation that ends is playing: an entrance, a panel growing. A spinner's never ends. */
const moving = () =>
  document.getAnimations().some((animation) => {
    if (animation.playState !== 'running' && !animation.pending) return false
    const end = animation.effect?.getComputedTiming().endTime
    return typeof end === 'number' && Number.isFinite(end)
  })

/**
 * What a mount shows once it is still: its document and its boxes, the same
 * two frames running, after its first frames and with no animation that ends
 * still playing.
 */
async function settled(roots: () => Element[]): Promise<{ document: Shape[]; boxes: string[] }> {
  let last = ''
  for (let attempt = 0; attempt < 120; attempt++) {
    await frame()
    const now = { document: shapes(roots(), naming()), boxes: boxes(roots()) }
    const text = JSON.stringify(now)
    if (text === last && attempt >= FIRST_FRAMES && !moving()) return now
    last = text
  }
  return JSON.parse(last) as { document: Shape[]; boxes: string[] }
}

/**
 * Waits until an entry that selects words (`selects`) has selected them, so
 * both mounts are compared at the selection the entry describes. Each fixture
 * selects the words a moment after the member is drawn, and an engine that
 * draws frames faster than the display's rate can pass the first frames of
 * `settled` before then.
 */
async function selected(text: string | undefined): Promise<void> {
  if (text === undefined) return
  for (let attempt = 0; attempt < 120; attempt++) {
    if (document.getSelection()?.toString().includes(text) === true) return
    await frame()
  }
}

/**
 * An empty element a portal left at the end of the body: a closed overlay's
 * container, which shows nothing. A Solid fixture that passes a member inside
 * an object prop makes the member each time the prop is read (Solid reads a
 * prop through a getter), so it can leave more of these than the one member
 * an element renders.
 */
const emptyContainer = (element: Element) =>
  element.localName === 'div' && element.attributes.length === 0 && element.childNodes.length === 0

/** What a mount shows: what its own element holds, then what it portalled to the body, in order. */
function addedTo(before: ReadonlySet<Element>, host: Element): () => Element[] {
  return () => [
    ...host.children,
    ...[...document.body.children].filter(
      (child) => !before.has(child) && child !== host && !emptyContainer(child),
    ),
  ]
}

const solidEntry = (component: string, name: string) =>
  (SOLID_GALLERIES as readonly ComponentStates[])
    .find((gallery) => gallery.component === component)
    ?.entries.find((entry) => entry.name === name)

/**
 * The parity law over every states fixture whose member's name begins with a
 * letter from `first` to `last`.
 */
export function parityLaw(first: string, last: string): void {
  beforeAll(installTestTheme)
  const galleries = GALLERIES.filter((states) => {
    const letter = states.component.charAt(0)
    return letter >= first && letter <= last
  })
  describe(`parity — an element renders what its Solid member renders (${first}–${last})`, () => {
    for (const states of galleries) {
      for (const entry of states.entries) {
        it(`${states.component} — ${entry.name}`, async () => {
          const solid = solidEntry(states.component, entry.name)
          expect(solid, `the Solid fixture has "${entry.name}"`).toBeDefined()

          const beforeSolid = new Set(document.body.children)
          const host = document.createElement('div')
          document.body.append(host)
          const dispose = render(() => solid?.render(), host)
          await selected(entry.selects?.text)
          const expected = await settled(addedTo(beforeSolid, host))
          dispose()
          host.remove()

          const beforeElements = new Set(document.body.children)
          const mounted = await mount(entry)
          await selected(entry.selects?.text)
          const actual = await settled(addedTo(beforeElements, mounted.host))
          mounted.unmount()

          expect(actual.document, 'the document, each element replaced by its children').toEqual(
            expected.document,
          )
          expect(actual.boxes, 'each member’s box').toEqual(expected.boxes)
        })
      }
    }
  })
}
