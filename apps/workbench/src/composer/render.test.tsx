/**
 * @vitest-environment jsdom
 *
 * The composer's drawing law. Every shipped screen spec renders without throwing. Unknown members
 * become visible faults, bindings become named placeholders, and a node that cannot render becomes
 * one fault chip rather than a blank canvas. The file requests a DOM in its docblock because it
 * tests React output. It uses jsdom rather than a browser project on purpose. The renderer's own
 * browser tests (`packages/react/src/screen/screen.test.tsx`) draw with every member in Chromium.
 * This file checks the options the composer draws with, which jsdom can observe.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { validateSpec } from '@polymorph/spec/validate'
import type { ScreenInput, ScreenSpec, SpecElement } from '@polymorph/spec/schema'
import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { propsOf, renderSpec, resolveComponent } from './render'
import { REGISTRY } from '../registry'

beforeAll(() => {
  // jsdom 30 provides neither, and the vocabulary's phone-layout hooks call both. They are
  // stubbed here rather than guarded in components, because a browser always has them and a guard
  // for a test-only environment would put test concerns into the product.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

/** One element drawn as the composer draws a document whose root it is. */
function drawElement(root: SpecElement, inputs: ScreenInput[] = []) {
  return render(
    <>
      {renderSpec({ spec: 'polymorph-screen/1', name: 'Probe', purpose: 'A probe.', inputs, root })}
    </>,
  )
}

const SCREENS_DIR = resolve(import.meta.dirname, '../../../../design/screens')
const shipped = readdirSync(SCREENS_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({
    file,
    spec: JSON.parse(readFileSync(join(SCREENS_DIR, file), 'utf8')) as ScreenSpec,
  }))

describe('every shipped screen spec renders', () => {
  it('finds at least three shipped screen specs', () => {
    expect(shipped.length).toBeGreaterThanOrEqual(3)
  })

  for (const { file, spec } of shipped) {
    it(file, () => {
      // The document must be lawful first, because the renderer only draws and does not validate.
      expect(validateSpec(REGISTRY, spec).faults).toEqual([])
      const { container } = render(<>{renderSpec(spec)}</>)
      expect(container.firstElementChild, `${file} rendered nothing`).not.toBeNull()
      // Bindings render as chips or samples, never as the raw {"$": …} object.
      expect(container.textContent).not.toContain('[object Object]')
      // A lawful shipped screen renders with zero fault chips. "Renders without throwing" alone
      // would also pass for a canvas full of error boundaries. This assertion catches a member the
      // renderer cannot draw.
      expect(container.textContent, `${file} has fault chips`).not.toContain('could not render')
      expect(container.textContent).not.toContain('unknown member')
      expect(container.textContent).not.toContain('not renderable')
    })
  }
})

describe('the renderer shows what it cannot draw', () => {
  it('renders an unknown member as a visible fault', () => {
    const { container } = drawElement({ component: 'GhostPanel' })
    expect(container.textContent).toContain('unknown member')
    expect(container.textContent).toContain('GhostPanel')
  })

  it('renders a binding in a child position as its own name', () => {
    const { container } = drawElement({ component: 'Card', children: [{ $: 'tickets' }] }, [
      { name: 'tickets', type: 'Ticket[]' },
    ])
    expect(container.textContent).toContain('⟨tickets⟩')
  })

  it('resolves compound parts by property access, as the validator does', () => {
    expect(resolveComponent('SettingsRow.Group')).not.toBeNull()
    expect(resolveComponent('Table.Row')).not.toBeNull()
    expect(resolveComponent('SettingsRow.Ghost')).toBeNull()
  })

  it('renders a structured value in a child position as a fault', () => {
    // `$object` is a prop form. In a children position, returning `null` would skip it silently,
    // and the canvas would not show something the document contains.
    const { container } = drawElement({
      component: 'Card',
      children: [{ $object: { label: 'a column, misplaced' } }],
    })
    expect(container.textContent).toContain('not a node')
    expect(container.textContent).toContain('$.children[0]')
  })

  it('reads the props of a compound part, not those of its owner', () => {
    // The rule `validate.ts` uses, shared with the stub scan. A scan that stripped any dotted
    // prefix from the owner's whole prop list would stub a required `Header.onSort` onto
    // `Table.Cell`. That handler would be on the wrong element and unnoticed until it fired.
    expect(propsOf('Table.Header').map((prop) => prop.name)).toContain('onSort')
    expect(propsOf('Table.Cell').map((prop) => prop.name)).not.toContain('onSort')
    expect(
      propsOf('SettingsRow.Group')
        .map((prop) => prop.name)
        .sort(),
    ).toEqual(['children', 'title'])
    expect(propsOf('SettingsRow').map((prop) => prop.name)).not.toContain('Group.title')
    // A part whose props the registry lists only under the part.
    expect(
      propsOf('Dashboard.Panel')
        .map((prop) => prop.name)
        .sort(),
    ).toEqual(['children', 'title'])
    expect(propsOf('AppShell.NavItem').map((prop) => prop.name)).toContain('label')
    expect(propsOf('Dashboard.Region')).toEqual([])
  })

  it('renders a node that throws as one fault chip, not a blank canvas', () => {
    // DataTable with columns that are not a list is an invalid intermediate state a live editor
    // passes through. Every required prop has a value, so the table is drawn, and it throws.
    const { container } = drawElement({
      component: 'Stack',
      props: { gap: 4 },
      children: [
        {
          component: 'DataTable',
          props: {
            label: 'broken on purpose',
            data: [{ $object: { id: 'a' } }],
            columns: 'not a list',
            emptyState: { $object: { title: 'None' } },
          },
        },
        { component: 'Badge', children: ['still here'] },
      ],
    })
    expect(container.textContent).toContain('could not render')
    expect(container.textContent).toContain('still here')
  })

  it('renders an element with a required prop left out as one fault chip', () => {
    // The walk draws no element whose required prop has no value, and says which it lacks.
    const { container } = drawElement({
      component: 'Stack',
      props: { gap: 4 },
      children: [
        { component: 'DataTable', props: { label: 'missing its columns' } },
        { component: 'Badge', children: ['still here'] },
      ],
    })
    expect(container.textContent).toContain('not renderable')
    expect(container.textContent).toContain('still here')
  })
})
