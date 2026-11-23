import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { inheritedMethod, PolyElement, propertyOf } from '@polymorph/elements'
import { installTestTheme } from '@polymorph/engine/testing'

import { DEFINITIONS } from '../definitions'
import {
  ACTION_EVENT,
  drawScreen,
  FAULT_EVENT,
  type PolyScreen,
  type ScreenAction,
  type ScreenDrawing,
  type ScreenFault,
} from './index'

/**
 * What a document or a page can do to a drawing that it should not: an
 * address hidden in a list or a plain object, a document nested too deep to
 * read, a `members` value that cannot be read, a swap of `<poly-screen>`'s
 * children, and the arguments and the streaming a host is told of.
 */

beforeAll(installTestTheme)

const WAIT = { timeout: 15_000, interval: 20 }

const hosts: HTMLElement[] = []
const drawings: ScreenDrawing[] = []

afterEach(() => {
  for (const drawing of drawings.splice(0)) drawing.dispose()
  for (const host of hosts.splice(0)) host.remove()
})

function host(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)
  hosts.push(element)
  return element
}

/** A `<poly-screen>` with what it heard, its properties set before it connects. */
function screen(
  properties: Partial<Pick<PolyScreen, 'spec' | 'text' | 'data' | 'streaming' | 'members'>> = {},
  children: Node[] = [],
) {
  const into = host()
  const element = document.createElement('poly-screen')
  Object.assign(element, properties)
  element.append(...children)
  const actions: ScreenAction[] = []
  const faults: ScreenFault[] = []
  element.addEventListener(ACTION_EVENT, (event) =>
    actions.push((event as CustomEvent<ScreenAction>).detail),
  )
  element.addEventListener(FAULT_EVENT, (event) =>
    faults.push((event as CustomEvent<ScreenFault>).detail),
  )
  into.append(element)
  return { host: into, element, actions, faults }
}

const doc = (root: object, inputs: { name: string; type: string }[] = []) => ({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A screen a test draws.',
  inputs,
  root,
})

const script = (document: unknown): HTMLScriptElement => {
  const element = window.document.createElement('script')
  element.type = 'application/json'
  element.text = JSON.stringify(document)
  return element
}

/** Whether a value reads as a `javascript:` address once the DOM makes it text. */
function scripted(value: unknown): boolean {
  // A URL parser drops leading control characters and spaces, and tabs and newlines anywhere.
  const text = [...String(value ?? '')].filter(
    (char) => char !== '\t' && char !== '\n' && char !== '\r',
  )
  while (text.length > 0 && (text[0] as string).charCodeAt(0) <= 0x20) text.shift()
  return text.join('').toLowerCase().startsWith('javascript:')
}

const heading = (into: Element) => into.querySelector('h1, h2, h3')?.textContent

/** The text the drawing shows: every element's but a script's. */
const drawnText = (into: Element): string =>
  [...into.querySelectorAll('*')]
    .filter((element) => element.localName !== 'script' && element.closest('script') === null)
    .flatMap((element) =>
      [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE),
    )
    .map((node) => node.textContent)
    .join('')

describe('an address a screen may not hold', () => {
  it('is set nowhere, from a nested list, a plain object or a structured object in a list', async () => {
    const into = host()
    drawings.push(
      drawScreen(into, {
        document: doc({
          component: 'Stack',
          children: [
            {
              component: 'Link',
              props: { href: [['javascript:alert(document.domain)']] },
              children: ['Open'],
            },
            {
              component: 'Breadcrumbs',
              props: {
                items: [
                  { label: 'A', href: '/' },
                  { label: 'B', href: 'javascript:alert(1)' },
                  { label: 'C' },
                ],
              },
            },
            {
              component: 'Breadcrumbs',
              props: {
                items: [
                  { $object: { label: 'D', href: '/' } },
                  { $object: { label: 'E', href: [['javascript:alert(1)']] } },
                ],
              },
            },
            { component: 'Text', children: ['Drawn'] },
          ],
        }),
      }),
    )
    await vi.waitFor(() => expect(into.textContent).toContain('Drawn'), WAIT)
    // Every element in the drawing renders before it is read.
    await vi.waitFor(
      () =>
        expect(
          [...into.querySelectorAll('*')].every(
            (element) => !(element instanceof PolyElement) || element.matches(':state(poly-host)'),
          ),
        ).toBe(true),
      WAIT,
    )
    for (const anchor of into.querySelectorAll('a')) {
      expect(scripted(anchor.getAttribute('href')), anchor.outerHTML).toBe(false)
    }
    const link = into.querySelector('poly-link') as unknown as { href?: unknown } | null
    expect(scripted(link?.href)).toBe(false)
    for (const crumbs of into.querySelectorAll('poly-breadcrumbs')) {
      const items = (crumbs as unknown as { items?: { href?: unknown }[] }).items ?? []
      expect(items.filter((item) => scripted(item.href))).toEqual([])
    }
  })
})

describe('a prop a document names reaches the element only through the member', () => {
  it('has an accessor of the element’s own for every prop set through a property', () => {
    // A prop whose name is a method every element inherits is set by its attribute instead.
    const missing: string[] = []
    for (const [tag, definition] of Object.entries(DEFINITIONS)) {
      const type = customElements.get(tag)
      expect(type, tag).toBeDefined()
      for (const prop of Object.keys(definition.props)) {
        const property = propertyOf(prop)
        if (inheritedMethod(property)) continue
        const own = Object.getOwnPropertyDescriptor(
          (type as typeof PolyElement).prototype,
          property,
        )
        if (own?.set === undefined) missing.push(`${tag} ${prop}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('sets nothing a document names that the member does not take', async () => {
    const into = host()
    drawings.push(
      drawScreen(into, {
        document: doc({
          component: 'Text',
          props: {
            innerHTML: '<img src=x onerror=alert(1)>',
            outerHTML: '<b>x</b>',
            onclick: 'alert(1)',
            style: 'color: red',
            className: 'x',
            id: 'taken',
          },
          children: ['Plain'],
        }),
      }),
    )
    await vi.waitFor(() => expect(into.textContent).toBe('Plain'), WAIT)
    const text = into.querySelector('poly-text') as HTMLElement
    expect(text.innerHTML).not.toContain('<img')
    expect(text.onclick).toBeNull()
    expect(text.getAttribute('style')).toBeNull()
    expect(text.className).toBe('')
    expect(text.id).toBe('')
    expect(into.querySelector('img, b')).toBeNull()
  })
})

describe('a document nested too deep to read', () => {
  const depth = 5_000
  /** A document whose root holds `depth` nested lists. */
  const deepText = `{"spec":"polymorph-screen/1","name":"Deep","purpose":"Nested.","inputs":[],"root":{"component":"Stack","children":${'['.repeat(depth)}${']'.repeat(depth)}}}`
  /** A document whose root holds `depth` nested Stacks. */
  const deepSpec = () => {
    let root: object = { component: 'Text', children: ['Bottom'] }
    for (let level = 0; level < depth; level += 1) root = { component: 'Stack', children: [root] }
    return doc(root)
  }

  it('is a fault when it arrives as text, and setting the text never throws', async () => {
    const { host: into, element, faults } = screen()
    await vi.waitFor(() => expect(element.matches(':state(poly-host)')).toBe(true), WAIT)
    expect(() => {
      element.text = deepText.slice(0, deepText.length / 2)
      element.text = deepText
    }).not.toThrow()
    await vi.waitFor(() => expect(faults.length).toBeGreaterThan(0), WAIT)
    expect(into.textContent).toBe('')
  })

  it('is a fault when it is set as an object or written in the script child', async () => {
    const errors: unknown[] = []
    const heard = (event: PromiseRejectionEvent) => errors.push(event.reason)
    window.addEventListener('unhandledrejection', heard)
    try {
      for (const made of [
        () => screen({ spec: deepSpec() }),
        () => screen({}, [script(deepSpec())]),
      ]) {
        const { host: into, faults } = made()
        await vi.waitFor(() => expect(faults.length).toBeGreaterThan(0), WAIT)
        expect(drawnText(into)).not.toContain('Bottom')
      }
      const into = host()
      const told: ScreenFault[] = []
      expect(() =>
        drawings.push(
          drawScreen(into, { document: deepSpec(), onFault: (fault) => told.push(fault) }),
        ),
      ).not.toThrow()
      expect(told.length).toBeGreaterThan(0)
      await new Promise((settle) => setTimeout(settle, 50))
      expect(into.textContent).not.toContain('Bottom')
      expect(errors).toEqual([])
    } finally {
      window.removeEventListener('unhandledrejection', heard)
    }
  })
})

describe('<poly-screen> whose children the page replaces', () => {
  const titled = (title: string) => doc({ component: 'Heading', children: [title] })

  it('draws the new script’s document when a swap replaces its children', async () => {
    const { host: into, element } = screen({}, [script(titled('First'))])
    await vi.waitFor(() => expect(heading(into)).toBe('First'), WAIT)
    element.replaceChildren(script(titled('Second')))
    await vi.waitFor(() => expect(heading(into)).toBe('Second'), WAIT)
  })

  it('draws again when a swap puts back the same script', async () => {
    const kept = script(titled('Kept'))
    const { host: into, element } = screen({}, [kept])
    await vi.waitFor(() => expect(heading(into)).toBe('Kept'), WAIT)
    element.replaceChildren(kept)
    await vi.waitFor(() => expect(heading(into)).toBe('Kept'), WAIT)
  })

  it('draws the new document when a morph keeps the script and changes its text', async () => {
    const kept = script(titled('Before'))
    const { host: into, element } = screen({}, [kept])
    await vi.waitFor(() => expect(heading(into)).toBe('Before'), WAIT)
    // A morph removes what the server's markup does not hold, and changes the script's text.
    for (const child of [...element.children]) if (child !== kept) child.remove()
    kept.textContent = JSON.stringify(titled('After'))
    await vi.waitFor(() => expect(heading(into)).toBe('After'), WAIT)
  })
})

describe('a members value that cannot be read', () => {
  const both = doc({
    component: 'Stack',
    children: [
      { component: 'Text', children: ['Text drawn'] },
      { component: 'Button', props: { label: 'Button drawn' } },
    ],
  })

  it('allows nothing, and is a fault, when the attribute is not JSON', async () => {
    const into = host()
    const element = document.createElement('poly-screen')
    element.setAttribute('members', '["Stack","Text"')
    const faults: ScreenFault[] = []
    element.addEventListener(FAULT_EVENT, (event) =>
      faults.push((event as CustomEvent<ScreenFault>).detail),
    )
    element.spec = both
    into.append(element)
    await vi.waitFor(() => expect(faults.some(({ path }) => path === 'members')).toBe(true), WAIT)
    await new Promise((settle) => setTimeout(settle, 50))
    expect(into.textContent).toBe('')
  })

  it('allows nothing, and is a fault, when the property is not a list', async () => {
    const { host: into, faults } = screen({
      spec: both,
      members: 'Stack Text' as unknown as readonly string[],
    })
    await vi.waitFor(() => expect(faults.some(({ path }) => path === 'members')).toBe(true), WAIT)
    await new Promise((settle) => setTimeout(settle, 50))
    expect(into.textContent).toBe('')
  })
})

describe('a control drawn under another name', () => {
  it('is a new field, which holds nothing the reader typed under the old name', async () => {
    const field = (name: string) => ({
      component: 'FormField',
      props: { label: name },
      children: [{ component: 'Input', props: { name } }],
    })
    const into = host()
    const drawing = drawScreen(into, {
      document: doc({ component: 'Stack', children: [field('email')] }),
    })
    drawings.push(drawing)
    const typed = await vi.waitFor(() => {
      const found = into.querySelector('input')
      if (found === null) throw new Error('no field yet')
      return found
    }, WAIT)
    await userEvent.fill(typed, 'a@b.c')
    await vi.waitFor(() => expect(drawing.values).toEqual({ email: 'a@b.c' }), WAIT)
    drawing.update({
      document: doc({ component: 'Stack', children: [field('phone'), field('email')] }),
    })
    await vi.waitFor(() => expect(into.querySelectorAll('input')).toHaveLength(2), WAIT)
    const [phone, email] = into.querySelectorAll('input')
    // Each field is keyed by its place and its name, so neither is the field typed in before.
    expect(phone).not.toBe(typed)
    expect(email).not.toBe(typed)
    expect(phone?.value).toBe('')
    // What values reports is what each field shows.
    expect(drawing.values).toEqual({ phone: phone?.value, email: email?.value })
  })
})

describe('a field the document gives no value', () => {
  const reason = {
    component: 'FormField',
    props: { label: 'Reason' },
    children: [{ component: 'Input', props: { name: 'reason' } }],
  }

  it('keeps what the reader types while the screen passes it back as the field’s default', async () => {
    const into = host()
    const drawing = drawScreen(into, {
      document: doc({ component: 'Stack', children: [reason] }, [{ name: 'note', type: 'string' }]),
    })
    drawings.push(drawing)
    const input = await vi.waitFor(() => {
      const found = into.querySelector('input')
      if (found === null) throw new Error('no field yet')
      return found
    }, WAIT)
    // A key at a time: each change sets the field's default again.
    await userEvent.click(input)
    await userEvent.keyboard('spam')
    await vi.waitFor(() => expect(drawing.values).toEqual({ reason: 'spam' }), WAIT)
    expect(input.value).toBe('spam')
    expect(document.activeElement).toBe(input)
    drawing.update({ data: { note: 'other' } })
    expect(input.value).toBe('spam')
    expect(drawing.values).toEqual({ reason: 'spam' })
  })

  it('shows what values reports when a Dialog that holds it opens again', async () => {
    const into = host()
    const drawing = drawScreen(into, {
      document: doc({
        component: 'Dialog',
        props: {
          title: 'Report this message',
          trigger: { component: 'Button', props: { label: 'Report' } },
        },
        children: [reason],
      }),
    })
    drawings.push(drawing)
    const trigger = () =>
      [...into.querySelectorAll('button')].find((button) => button.textContent === 'Report')
    const field = () => document.querySelector<HTMLInputElement>('[role="dialog"] input')
    await vi.waitFor(() => expect(trigger()).toBeDefined(), WAIT)
    await userEvent.click(trigger() as HTMLButtonElement)
    const input = await vi.waitFor(() => {
      const found = field()
      if (found === null) throw new Error('not open yet')
      return found
    }, WAIT)
    await userEvent.fill(input, 'spam')
    await vi.waitFor(() => expect(drawing.values).toEqual({ reason: 'spam' }), WAIT)
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull(), WAIT)
    await userEvent.click(trigger() as HTMLButtonElement)
    await vi.waitFor(() => expect(field()?.value).toBe('spam'), WAIT)
    expect(drawing.values).toEqual({ reason: 'spam' })
  })
})

describe('what a host is told', () => {
  it('tells an action the arguments the member passed: null for a cleared choice, none for a press', async () => {
    const { host: into, actions } = screen({
      spec: doc(
        {
          component: 'Stack',
          children: [
            {
              component: 'FormField',
              props: { label: 'Priority' },
              children: [
                {
                  component: 'Select',
                  props: {
                    name: 'priority',
                    value: 'high',
                    emptyOption: 'No priority',
                    options: [
                      { $object: { value: 'high', label: 'High' } },
                      { $object: { value: 'low', label: 'Low' } },
                    ],
                    onChange: { $: 'onPriority' },
                  },
                },
              ],
            },
            { component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } },
          ],
        },
        [
          { name: 'onPriority', type: '(value: string | null) => void' },
          { name: 'onSave', type: '() => void' },
        ],
      ),
    })
    const trigger = await vi.waitFor(() => {
      const found = into.querySelector<HTMLElement>('[role="combobox"]')
      if (found === null) throw new Error('no select yet')
      return found
    }, WAIT)
    await userEvent.click(trigger)
    const none = await vi.waitFor(() => {
      const found = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
        option.textContent?.includes('No priority'),
      )
      if (found === undefined) throw new Error('no options yet')
      return found
    }, WAIT)
    await userEvent.click(none)
    await vi.waitFor(() => expect(actions.map(({ name }) => name)).toContain('onPriority'), WAIT)
    const save = [...into.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Save'),
    ) as HTMLButtonElement
    await userEvent.click(save)
    await vi.waitFor(() => expect(actions.map(({ name }) => name)).toContain('onSave'), WAIT)
    expect(actions.find(({ name }) => name === 'onPriority')?.args).toEqual([null])
    expect(actions.find(({ name }) => name === 'onSave')?.args).toEqual([])
  })

  it('reports what a truncated answer lacks once the host says nothing more is to come', async () => {
    const text = JSON.stringify(
      doc({ component: 'Stack', children: [{ component: 'Button', props: { label: 'Save' } }] }),
    )
    // The answer stops inside the Button, before its required label.
    const cut = text.slice(0, text.indexOf('"label"'))
    const { element, faults } = screen({ text: cut, streaming: true })
    await vi.waitFor(() => expect(element.matches(':state(poly-host)')).toBe(true), WAIT)
    expect(faults).toEqual([])
    element.streaming = false
    await vi.waitFor(() => expect(faults.length).toBeGreaterThan(0), WAIT)
  })
})
