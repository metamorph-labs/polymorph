import {
  ApplicationRef,
  Component,
  computed,
  createComponent,
  input,
  provideZonelessChangeDetection,
  signal,
  type Type,
} from '@angular/core'
import { createApplication } from '@angular/platform-browser'
import * as checkbox from '@zag-js/checkbox'
import * as dialog from '@zag-js/dialog'
import * as menu from '@zag-js/menu'
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { normalizeProps, Spread, useMachine } from './index'

/**
 * The Zag adapter against three machines, in a real browser, before any member
 * uses it: a checkbox (a bindable value, controlled and uncontrolled), a dialog
 * (entry effects that read the rendered panel, focus trapping and its return,
 * dismissal, and the cleanups its exit runs when it is destroyed open) and a
 * menu (keyboard navigation, highlight and a selection callback). Each machine
 * is bound the way a generated member binds it: its props a function over the
 * component's signals, its API a `computed`, and its prop getters written onto
 * elements by `Spread`.
 */

const destroyers: (() => void)[] = []

afterEach(() => {
  for (const destroy of destroyers.splice(0)) destroy()
})

async function render<T>(type: Type<T>, inputs: Record<string, unknown> = {}) {
  const app = await createApplication({ providers: [provideZonelessChangeDetection()] })
  const host = document.createElement('div')
  document.body.append(host)
  const ref = createComponent(type, { environmentInjector: app.injector, hostElement: host })
  for (const [name, value] of Object.entries(inputs)) ref.setInput(name, value)
  const appRef = app.injector.get(ApplicationRef)
  appRef.attachView(ref.hostView)
  const settle = async () => {
    await appRef.whenStable()
    await new Promise((done) => requestAnimationFrame(() => done(undefined)))
    await appRef.whenStable()
  }
  await settle()
  destroyers.push(() => {
    ref.destroy()
    app.destroy()
    host.remove()
  })
  return { ref, host, settle }
}

@Component({
  selector: 'zag-checkbox',
  imports: [Spread],
  template: `<label [pmSpread]="api().getRootProps()"
    ><span [pmSpread]="api().getControlProps()"></span
    ><span [pmSpread]="api().getLabelProps()">Accept the terms</span
    ><input [pmSpread]="api().getHiddenInputProps()"
  /></label>`,
})
class ZagCheckbox {
  readonly checked = input<boolean | undefined>(undefined)
  readonly changes = signal<unknown[]>([])
  readonly service = useMachine(checkbox.machine, () => ({
    id: 'terms',
    checked: this.checked(),
    onCheckedChange: (details: checkbox.CheckedChangeDetails) =>
      this.changes.update((list) => [...list, details.checked]),
  }))
  readonly api = computed(() => checkbox.connect(this.service, normalizeProps))
}

@Component({
  selector: 'zag-dialog',
  imports: [Spread],
  template: `<button type="button" [pmSpread]="api().getTriggerProps()">Open</button>
    <div [pmSpread]="api().getBackdropProps()"></div>
    <div [pmSpread]="api().getPositionerProps()">
      <div [pmSpread]="api().getContentProps()">
        <h2 [pmSpread]="api().getTitleProps()">Discard this ticket?</h2>
        <input aria-label="Reason" />
        <button type="button" [pmSpread]="api().getCloseTriggerProps()">Close</button>
      </div>
    </div>`,
})
class ZagDialog {
  readonly opens = signal<boolean[]>([])
  readonly service = useMachine(dialog.machine, () => ({
    id: 'discard',
    onOpenChange: (details: dialog.OpenChangeDetails) =>
      this.opens.update((list) => [...list, details.open]),
  }))
  readonly api = computed(() => dialog.connect(this.service, normalizeProps))
}

@Component({
  selector: 'zag-menu',
  imports: [Spread],
  template: `<button type="button" [pmSpread]="api().getTriggerProps()">Actions</button>
    <div [pmSpread]="api().getPositionerProps()">
      <ul [pmSpread]="api().getContentProps()">
        @for (item of items; track item) {
          <li [pmSpread]="api().getItemProps({ value: item })">{{ item }}</li>
        }
      </ul>
    </div>`,
})
class ZagMenu {
  readonly items = ['Edit', 'Duplicate', 'Archive']
  readonly selected = signal<string[]>([])
  readonly service = useMachine(menu.machine, () => ({
    id: 'actions',
    onSelect: (details: menu.SelectionDetails) =>
      this.selected.update((list) => [...list, details.value]),
  }))
  readonly api = computed(() => menu.connect(this.service, normalizeProps))
}

describe('the Zag adapter: checkbox', () => {
  it('toggles an uncontrolled value and reports it, with the machine’s attributes', async () => {
    const { ref, host, settle } = await render(ZagCheckbox)
    const root = host.querySelector('label') as HTMLLabelElement
    const field = host.querySelector('input') as HTMLInputElement
    expect(root.getAttribute('data-state')).toBe('unchecked')
    expect(field.type).toBe('checkbox')
    expect(field.checked).toBe(false)

    await userEvent.click(host.querySelector('[data-part="label"]') as HTMLElement)
    await settle()
    expect(root.getAttribute('data-state')).toBe('checked')
    expect(field.checked).toBe(true)
    expect(ref.instance.changes()).toEqual([true])

    await userEvent.click(root)
    await settle()
    expect(root.getAttribute('data-state')).toBe('unchecked')
    expect(ref.instance.changes()).toEqual([true, false])
  })

  it('follows a controlled value from a signal input and asks for a change without making it', async () => {
    const { ref, host, settle } = await render(ZagCheckbox, { checked: true })
    const root = host.querySelector('label') as HTMLLabelElement
    expect(root.getAttribute('data-state')).toBe('checked')

    await userEvent.click(root)
    await settle()
    expect(ref.instance.changes()).toEqual([false])
    expect(root.getAttribute('data-state')).toBe('checked')

    ref.setInput('checked', false)
    await settle()
    expect(root.getAttribute('data-state')).toBe('unchecked')
  })
})

describe('the Zag adapter: dialog', () => {
  it('opens from its trigger, moves focus into the panel, and returns it on Escape', async () => {
    const { ref, host, settle } = await render(ZagDialog)
    const trigger = host.querySelector('button') as HTMLButtonElement
    const content = host.querySelector('[data-part="content"]') as HTMLElement
    expect(content.hidden).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(trigger)
    await settle()
    expect(content.hidden).toBe(false)
    expect(content.getAttribute('role')).toBe('dialog')
    expect(content.getAttribute('aria-modal')).toBe('true')
    expect(content.getAttribute('aria-labelledby')).toBe(host.querySelector('h2')?.id)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await expect.poll(() => content.contains(document.activeElement)).toBe(true)
    expect(ref.instance.opens()).toEqual([true])

    await userEvent.keyboard('{Escape}')
    await settle()
    expect(content.hidden).toBe(true)
    expect(ref.instance.opens()).toEqual([true, false])
    await expect.poll(() => document.activeElement).toBe(trigger)
  })

  it('lets the page go when it is destroyed open: siblings shown, scroll unlocked, no trap', async () => {
    // A control beside the dialog, which the open modal hides and traps focus away from.
    const outside = document.createElement('button')
    outside.textContent = 'Outside'
    document.body.append(outside)
    destroyers.push(() => outside.remove())
    const { ref, host, settle } = await render(ZagDialog)
    await userEvent.click(host.querySelector('button') as HTMLButtonElement)
    await settle()
    const content = host.querySelector('[data-part="content"]') as HTMLElement
    expect(content.hidden).toBe(false)
    await expect.poll(() => outside.getAttribute('aria-hidden')).toBe('true')
    await expect.poll(() => document.body.hasAttribute('data-scroll-lock')).toBe(true)
    await expect.poll(() => content.contains(document.activeElement)).toBe(true)

    ref.destroy()
    expect(outside.hasAttribute('aria-hidden')).toBe(false)
    expect(document.body.hasAttribute('data-scroll-lock')).toBe(false)
    expect(document.body.style.overflow).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
    outside.focus()
    await settle()
    expect(document.activeElement).toBe(outside)
    expect(ref.instance.opens()).toEqual([true])
  })

  it('closes from its close trigger', async () => {
    const { host, settle } = await render(ZagDialog)
    await userEvent.click(host.querySelector('button') as HTMLButtonElement)
    await settle()
    const content = host.querySelector('[data-part="content"]') as HTMLElement
    expect(content.hidden).toBe(false)
    await userEvent.click(host.querySelector('[data-part="close-trigger"]') as HTMLElement)
    await settle()
    expect(content.hidden).toBe(true)
  })
})

describe('the Zag adapter: menu', () => {
  it('opens on a key, moves its highlight with the arrows, and selects with Enter', async () => {
    const { ref, host, settle } = await render(ZagMenu)
    const trigger = host.querySelector('button') as HTMLButtonElement
    const content = host.querySelector('[data-part="content"]') as HTMLElement
    expect(content.hidden).toBe(true)

    trigger.focus()
    await userEvent.keyboard('{ArrowDown}')
    await settle()
    expect(content.hidden).toBe(false)
    expect(content.getAttribute('role')).toBe('menu')
    const items = [...host.querySelectorAll('li')]
    await expect.poll(() => items[0]?.hasAttribute('data-highlighted')).toBe(true)

    await userEvent.keyboard('{ArrowDown}')
    await settle()
    expect(items[1]?.hasAttribute('data-highlighted')).toBe(true)
    expect(items[0]?.hasAttribute('data-highlighted')).toBe(false)

    await userEvent.keyboard('{Enter}')
    await settle()
    expect(ref.instance.selected()).toEqual(['Duplicate'])
    expect(content.hidden).toBe(true)
  })

  it('selects an item with a click', async () => {
    const { ref, host, settle } = await render(ZagMenu)
    await userEvent.click(host.querySelector('button') as HTMLButtonElement)
    await settle()
    await userEvent.click([...host.querySelectorAll('li')][2] as HTMLElement)
    await settle()
    expect(ref.instance.selected()).toEqual(['Archive'])
  })
})
