import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { buildRegistry, type Registry } from '@polymorph/registry'

import {
  cond,
  describeMember,
  el,
  emit,
  member,
  run,
  slot,
  text,
  words,
  type MemberShell,
} from './dsl'
import { describedMembers, generateShells, SVELTE_TARGET } from './generate'
import {
  renderSvelteMember,
  svelteContext,
  svelteInterface,
  svelteType,
  type SvelteContext,
} from './svelte'
import type { RegistryMemberLike } from './common'

/**
 * The Svelte renderer's own checks: how it reads a prop and a description's
 * type, and what it writes for each construct whose Svelte spelling differs
 * from Vue's. The freshness law (`shells.test.ts`) holds the generated tree to
 * what the renderer writes now.
 */

const ROOT = resolve(import.meta.dirname, '../../..')

let registry: Registry
let members: MemberShell[]
let generated: Map<string, string>

beforeAll(async () => {
  registry = buildRegistry(ROOT)
  members = await describedMembers(registry)
  generated = await generateShells(ROOT, registry, members, [SVELTE_TARGET])
}, 120_000)

describe('a prop, read for Svelte', () => {
  const face = (props: { name: string; type: string; optional: boolean }[]) =>
    svelteInterface({ name: 'Probe', purpose: 'A probe', spec: null, props, grid: null }).props

  it('keeps every prop by its React name: a value, a callback and a snippet', () => {
    const props = face([
      { name: 'aria-label', type: 'string | undefined', optional: true },
      {
        name: 'onCheckedChange',
        type: '((checked: boolean) => void) | undefined',
        optional: false,
      },
      { name: 'children', type: 'ReactNode', optional: false },
      { name: 'footer', type: 'ReactNode', optional: true },
      { name: 'renderItem', type: '((item: { id: string }) => ReactNode)', optional: true },
    ])
    expect(
      props.map((prop) => [prop.name, prop.local, prop.kind, prop.type, prop.optional]),
    ).toEqual([
      ['aria-label', 'ariaLabel', 'prop', 'string', true],
      ['onCheckedChange', 'onCheckedChange', 'event', '(checked: boolean) => void', true],
      ['children', 'children', 'slot', 'Snippet', false],
      ['footer', 'footer', 'slot', 'Snippet', true],
      ['renderItem', 'renderItem', 'slot', 'Snippet<[{ id: string }]>', true],
    ])
  })

  it('reads a ref as the foundation’s, and a union of signatures as one the member calls either way', () => {
    const props = face([
      { name: 'controlRef', type: 'Ref<HTMLInputElement> | undefined', optional: true },
      {
        name: 'onValueChange',
        type: '((value: string) => void) | ((value: string[]) => void) | undefined',
        optional: true,
      },
    ])
    expect(props[0]?.type).toBe('ControlRef<HTMLInputElement | null>')
    expect(props[1]?.overloaded).toBe(true)
  })
})

describe('a description’s type, read for Svelte', () => {
  it('reads a node as a snippet, and a function that returns one as a snippet with its parameters', () => {
    expect(svelteType('{ content: VNode | string }')).toBe('{ content: Snippet | string }')
    expect(svelteType('{ cell?: (row: Row) => VNode | string; sortable?: boolean }')).toBe(
      '{ cell?: Snippet<[Row]>; sortable?: boolean }',
    )
    expect(svelteType("'a' | 'b'")).toBe("'a' | 'b'")
  })
})

describe('the Svelte renderer writes what a description says', () => {
  const probe = (shell: Partial<MemberShell>, props: RegistryMemberLike['props'] = []) => {
    const description = describeMember({
      member: 'Probe',
      dir: 'structure',
      recipe: null,
      template: [],
      states: [],
      ...shell,
    })
    const component: RegistryMemberLike = {
      name: 'Probe',
      purpose: 'A probe',
      spec: null,
      props,
      grid: null,
    }
    const shared = svelteContext(registry, members)
    const context: SvelteContext = {
      ...shared,
      locations: new Map([
        ...shared.locations,
        ['Probe', { home: 'vocabulary', dir: 'structure' }],
      ]),
      props: new Map([...shared.props, ['Probe', svelteInterface(component).props]]),
      source: 'probe.ts',
    }
    return renderSvelteMember(description, component, context)
  }

  it('calls the callback prop for an event, and names `$event` the handler’s event', () => {
    const out = probe(
      {
        template: el('button', {
          on: { click: emit('dismiss', { args: ['$event.detail'] }), keydown: run('note($event)') },
        }),
      },
      [{ name: 'onDismiss', type: '((detail: number) => void) | undefined', optional: true }],
    )
    expect(out).toContain('onclick={(event) => { onDismiss?.(event.detail) }}')
    expect(out).toContain('onkeydown={(event) => { note(event) }}')
  })

  it('merges a machine’s props and the member’s handler on one element, typed', () => {
    const out = probe({
      template: el('div', { spread: ['api.getRootProps()'], on: { keydown: run('$event.key') } }),
    })
    expect(out).toContain(
      '{...attributes(mergeParts(api.getRootProps(), { onKeydown: (event: KeyboardEvent) => { event.key } }))}',
    )
  })

  it('writes static text as a string, and lays siblings out with the line breaks inside tags', () => {
    const out = probe({
      template: el('p', {}, [
        words(' *'),
        text('label'),
        el('span', { attrs: { 'data-long': "'a value long enough to break the line it is on'" } }, [
          words('Plain'),
        ]),
        cond('label', [el('b', {}, [words('more text, long enough to break the line it is on')])]),
      ]),
    })
    // A token's closing brace starts the next line, so the line break is inside the braces.
    expect(out).toContain("{' *'\n")
    expect(out).toContain(
      '<span data-long="a value long enough to break the line it is on">Plain</span',
    )
    const markup = out.slice(out.lastIndexOf('</script>') + '</script>'.length).trim()
    expect(markup).not.toMatch(/>\n\s*</)
    expect(markup).not.toMatch(/\}\n\s*\{/)
  })

  it('passes a named slot as a snippet declared beside the member, and a conditional one as undefined', () => {
    const out = probe(
      {
        template: member(
          'Dialog',
          { title: "'Title'" },
          {
            slots: { default: [words('Body')], footer: [slot('footer')] },
            slotWhen: { footer: 'slots.footer' },
          },
        ),
      },
      [{ name: 'footer', type: 'ReactNode', optional: true }],
    )
    expect(out).toMatch(/\{#snippet footerOfDialog\d+\(\)\}\{@render footer\?\.\(\)\}\{\/snippet/)
    expect(out).toMatch(
      /<Dialog title="Title" footer=\{slots\.footer \? footerOfDialog\d+ : undefined\}>Body<\/Dialog/,
    )
  })

  it('replaces an element whose `key` changes, as `{#key}` does', () => {
    const out = probe({ template: el('table', { attrs: { key: 'month' } }) })
    expect(out).toContain('{#key month}<table></table>{/key')
  })

  it('renders a member between the text nodes its slot reads it by, hidden past the slot’s take', () => {
    const out = probe({ template: el('span') })
    const markup = out.slice(out.lastIndexOf('</script>') + '</script>'.length).trim()
    expect(markup).toBe(
      [
        '{@render joined.start?.()',
        '}{#if joined.shown',
        '  }<span></span',
        '>{/if',
        '}{@render joined.end?.()}',
      ].join('\n'),
    )
  })

  it('renders a slot it reads in an outlet with the caller’s snippet, probed once the script is done', () => {
    const out = probe(
      {
        template: el('div', { attrs: { 'data-count': 'slotted(slots.default).count' } }, [
          slot('default', { pass: { id: 'uid' } }),
        ]),
        effects: [{ run: 'note()' }],
      },
      [{ name: 'children', type: 'ReactNode', optional: false }],
    )
    expect(out).toContain('<SlotOutlet scope={childrenScope} snippet={children}\n')
    expect(out).toContain(
      'const childrenScope: SlotScope = new SlotScope({ pass: (): Record<string, unknown> => ({ id: uid }) })',
    )
    const script = out.slice(0, out.lastIndexOf('</script>'))
    expect(script.trimEnd().endsWith('childrenScope.probe(() => children)')).toBe(true)
    expect(script.indexOf('watchEffect(effect1')).toBeLessThan(
      script.indexOf('childrenScope.probe'),
    )
  })

  it('hands a presence its anchored side, its appear as a getter read once, and its reflow', () => {
    const out = probe({
      state: { settled: 'false' },
      presence: {
        present: {
          open: 'settled',
          ref: 'chip',
          binding: 'taginput.chip',
          side: 'bottom',
          align: 'center',
          appear: 'settled',
          reflow: 'taginput.reflow',
        },
      },
      template: cond('present', [el('li', { ref: 'chip' })]),
    })
    expect(out).toContain(
      "usePresence(() => settled, () => chip, 'taginput.chip', { side: 'bottom', align: 'center', get appear() { return settled }, reflow: 'taginput.reflow' })",
    )
  })

  it('refuses a slot it reads that takes arguments or a fallback', () => {
    // A slot read through `slotted` renders in an outlet, which draws the caller's snippet with no
    // arguments and no fallback. A slot that passes props and has a fallback is refused earlier,
    // by the shared check (`checkSlots`), which `shells.test.ts` holds.
    const children = [{ name: 'children', type: 'ReactNode', optional: true }]
    const reading = (outlet: ReturnType<typeof slot>) => ({
      template: el('div', { attrs: { 'data-count': 'slotted(slots.default).count' } }, [outlet]),
    })
    expect(() => probe(reading(slot('default', { fallback: [words('None')] })), children)).toThrow(
      /takes arguments or a fallback/,
    )
    expect(() => probe(reading(slot('default', { props: { id: 'uid' } })), children)).toThrow(
      /takes arguments or a fallback/,
    )
  })

  it('refuses an event modifier Svelte has no spelling for', () => {
    expect(() => probe({ template: el('div', { on: { 'click.self': run('go()') } }) })).toThrow(
      /modifier "self"/,
    )
  })
})

describe('the generated Svelte vocabulary', () => {
  it('declares every type once, in the component that owns it', () => {
    const declarations = new Map<string, string[]>()
    for (const [path, source] of generated) {
      if (!path.endsWith('.svelte') || path.endsWith('.states.svelte')) continue
      for (const match of source.matchAll(/^export (?:interface|type) (\w+)/gm)) {
        const name = match[1] as string
        declarations.set(name, [...(declarations.get(name) ?? []), path])
      }
    }
    expect([...declarations].filter(([, paths]) => paths.length > 1)).toEqual([])
    expect(declarations.get('CheckboxProps')).toEqual([
      'packages/svelte-ui/src/controls/Checkbox.svelte',
    ])
  })

  it('writes one component per member and part, one fixture per member, and the entry', () => {
    const components = [...generated.keys()].filter(
      (path) => path.endsWith('.svelte') && !path.endsWith('.states.svelte'),
    )
    expect(components.length).toBe(
      members.reduce((count, shell) => count + 1 + (shell.parts?.length ?? 0), 0),
    )
    expect(generated.has('packages/svelte-ui/src/index.ts')).toBe(true)
    expect(generated.has('packages/svelte/src/icon/Icon.svelte')).toBe(true)
  })
})
