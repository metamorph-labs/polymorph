import { afterEach, describe, expect, it } from 'vitest'

import { syncTriggerAnchor } from './trigger-anchor'

/**
 * The trigger anchor the generated overlays use: the machine's ARIA moved onto
 * the governed control inside, and focus returned to it on close.
 */

afterEach(() => {
  document.body.replaceChildren()
})

function anchored(description?: string) {
  const anchor = document.createElement('span')
  const control = document.createElement('button')
  control.textContent = 'Open'
  if (description !== undefined) control.setAttribute('aria-describedby', description)
  anchor.append(control)
  const panel = document.createElement('div')
  panel.id = 'panel'
  panel.tabIndex = -1
  const elsewhere = document.createElement('button')
  elsewhere.textContent = 'Elsewhere'
  document.body.append(anchor, panel, elsewhere)
  return { anchor, control, panel, elsewhere }
}

describe('the control’s description', () => {
  it('keeps an error id the field adds after the overlay first described the control', () => {
    const { anchor, control } = anchored('hint')
    syncTriggerAnchor(anchor, { 'aria-describedby': 'tip' }, true)
    expect(control.getAttribute('aria-describedby')).toBe('hint tip')
    // FormField renders its error, and the framework writes the control's own description.
    control.setAttribute('aria-describedby', 'hint error')
    syncTriggerAnchor(anchor, { 'aria-describedby': 'tip' }, true)
    expect(control.getAttribute('aria-describedby')).toBe('hint error tip')
    syncTriggerAnchor(anchor, {}, false)
    expect(control.getAttribute('aria-describedby')).toBe('hint error')
  })

  it('removes the attribute when neither the field nor the overlay describes the control', () => {
    const { anchor, control } = anchored()
    syncTriggerAnchor(anchor, { 'aria-describedby': 'tip' }, true)
    syncTriggerAnchor(anchor, {}, false)
    expect(control.hasAttribute('aria-describedby')).toBe(false)
  })
})

describe('focus on close', () => {
  it('returns to the control from inside the panel', () => {
    const { anchor, control, panel } = anchored()
    syncTriggerAnchor(anchor, { 'aria-controls': 'panel' }, true)
    panel.focus()
    syncTriggerAnchor(anchor, { 'aria-controls': 'panel' }, false)
    expect(document.activeElement).toBe(control)
  })

  it('stays on a control the reader moved to while the overlay closed', () => {
    const { anchor, elsewhere } = anchored()
    syncTriggerAnchor(anchor, { 'aria-controls': 'panel' }, true)
    elsewhere.focus()
    syncTriggerAnchor(anchor, { 'aria-controls': 'panel' }, false)
    expect(document.activeElement).toBe(elsewhere)
  })
})

/*
 * A machine focuses its panel a frame after the panel opens. These tests close
 * the overlay before that focus, then make it as the machine does.
 */
describe('focus that arrives in the panel after the close', () => {
  it('goes back to the control', () => {
    const { anchor, control, panel } = anchored()
    syncTriggerAnchor(anchor, { 'aria-controls': 'panel' }, true)
    syncTriggerAnchor(anchor, { 'aria-controls': 'panel' }, false)
    expect(document.activeElement).toBe(control)
    panel.focus()
    expect(document.activeElement).toBe(control)
  })

  it('goes back to the control the reader moved to', () => {
    const { anchor, panel, elsewhere } = anchored()
    syncTriggerAnchor(anchor, { 'aria-controls': 'panel' }, true)
    elsewhere.focus()
    syncTriggerAnchor(anchor, { 'aria-controls': 'panel' }, false)
    panel.focus()
    expect(document.activeElement).toBe(elsewhere)
  })

  it('stays in the panel once the overlay is open again', () => {
    const { anchor, panel } = anchored()
    syncTriggerAnchor(anchor, { 'aria-controls': 'panel' }, true)
    syncTriggerAnchor(anchor, { 'aria-controls': 'panel' }, false)
    syncTriggerAnchor(anchor, { 'aria-controls': 'panel' }, true)
    panel.focus()
    expect(document.activeElement).toBe(panel)
  })
})
