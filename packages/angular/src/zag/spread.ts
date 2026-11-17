import { Directive, ElementRef, inject, input, type OnChanges, type OnDestroy } from '@angular/core'

import { writeStyle, writeValue } from './dom'

type Listener = (event: Event) => unknown

/**
 * Writes an object of attributes and listeners, in the description's spelling
 * (`normalizeProps`), onto one element, as Vue writes a spread object:
 * `onClick` and every `on` key as a listener (`onKeydown` listens for
 * `keydown`, and a name that ends in `Capture` listens in the capture phase),
 * `class` as the class attribute, `style` as style properties, and any other
 * key as a DOM property where the element has one and an attribute otherwise
 * (`writeValue`). Each write writes the difference from the last: an entry
 * that is gone, or is `undefined`, is removed.
 *
 * One DOM listener is kept per event and calls the entry's current handler, so
 * a getter that returns a new function on every read does not add and remove
 * listeners.
 */
class PartsWriter {
  private applied: Readonly<Record<string, unknown>> = {}
  private readonly handlers = new Map<string, Listener>()
  private readonly listeners = new Map<string, { type: string; capture: boolean; run: Listener }>()

  constructor(private readonly element: HTMLElement) {}

  write(next: Readonly<Record<string, unknown>>): void {
    const before = this.applied
    const element = this.element
    for (const key of Object.keys(before)) {
      if (key in next) continue
      if (/^on[A-Z]/.test(key)) this.listen(key, undefined)
      else if (key === 'style') writeStyle(element, {}, styleOf(before[key]))
      else if (key === 'class') element.removeAttribute('class')
      else writeValue(element, key, undefined)
    }
    for (const [key, value] of Object.entries(next)) {
      if (/^on[A-Z]/.test(key)) {
        this.listen(key, typeof value === 'function' ? (value as Listener) : undefined)
        continue
      }
      if (key === 'style') {
        writeStyle(element, styleOf(value), styleOf(before[key]))
        continue
      }
      if (Object.is(before[key], value) && key in before) continue
      if (key === 'class') {
        const text = classText(value)
        if (text === '') element.removeAttribute('class')
        else element.setAttribute('class', text)
        continue
      }
      writeValue(element, key, value)
    }
    this.applied = { ...next }
  }

  /** Removes every listener it added. */
  release(): void {
    for (const { type, capture, run } of this.listeners.values())
      this.element.removeEventListener(type, run, capture)
    this.listeners.clear()
    this.handlers.clear()
  }

  private listen(key: string, handler: Listener | undefined): void {
    if (handler === undefined) {
      this.handlers.delete(key)
      const held = this.listeners.get(key)
      if (held !== undefined) {
        this.element.removeEventListener(held.type, held.run, held.capture)
        this.listeners.delete(key)
      }
      return
    }
    this.handlers.set(key, handler)
    if (this.listeners.has(key)) return
    const capture = key.endsWith('Capture')
    const type = (capture ? key.slice(2, -'Capture'.length) : key.slice(2)).toLowerCase()
    const run: Listener = (event) => this.handlers.get(key)?.(event)
    this.element.addEventListener(type, run, capture)
    this.listeners.set(key, { type, capture, run })
  }
}

/**
 * Writes an object of attributes and listeners onto its element:
 * `<div [pmSpread]="parts()">`. An Angular template cannot spread an object
 * onto an element, and a machine's prop getters return one
 * (`api.getTriggerProps()`), so this writes each entry with `PartsWriter`.
 */
@Directive({ selector: '[pmSpread]' })
export class Spread implements OnChanges, OnDestroy {
  readonly pmSpread = input.required<Readonly<Record<string, unknown>>>()

  private readonly writer = new PartsWriter(inject(ElementRef).nativeElement as HTMLElement)

  ngOnChanges(): void {
    this.writer.write(this.pmSpread())
  }

  ngOnDestroy(): void {
    this.writer.release()
  }
}

function styleOf(value: unknown): Readonly<Record<string, unknown>> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value))
    return value as Readonly<Record<string, unknown>>
  if (typeof value === 'string') {
    const out: Record<string, string> = {}
    for (const declaration of value.split(';')) {
      const at = declaration.indexOf(':')
      if (at === -1) continue
      out[declaration.slice(0, at).trim()] = declaration.slice(at + 1).trim()
    }
    return out
  }
  return {}
}

function classText(value: unknown): string {
  if (Array.isArray(value))
    return value
      .map(classText)
      .filter((name) => name !== '')
      .join(' ')
  return typeof value === 'string' ? value.trim() : ''
}
