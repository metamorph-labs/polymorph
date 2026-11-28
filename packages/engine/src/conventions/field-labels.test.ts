import { afterEach, describe, expect, it } from 'vitest'

import { fieldLabelIds } from './field-labels'

/**
 * `fieldLabelIds`, which MultiSelect's list on every framework refers to the
 * labels of its field by. The fields here are plain DOM.
 */

afterEach(() => {
  document.body.replaceChildren()
})

/** An input with this id, at the end of the body. */
function input(id: string): HTMLInputElement {
  const element = document.createElement('input')
  element.id = id
  document.body.append(element)
  return element
}

/** A `<label for>` naming the field with this id, at the start of the body. */
function labelFor(id: string, words: string): HTMLLabelElement {
  const label = document.createElement('label')
  label.htmlFor = id
  label.textContent = words
  document.body.prepend(label)
  return label
}

describe('fieldLabelIds', () => {
  it('gives a label with no id one made from the prefix, and returns it', () => {
    const field = input('assignee')
    const label = labelFor('assignee', 'Assignee')
    expect(fieldLabelIds(field, 'pm-1')).toBe('pm-1-label-0')
    expect(label.id).toBe('pm-1-label-0')
  })

  it('keeps the id a label has, and returns every label in document order', () => {
    const field = input('assignee')
    const first = labelFor('assignee', 'Assignee')
    first.id = 'own'
    const around = document.createElement('label')
    around.append('Owner ', field)
    document.body.append(around)
    expect(fieldLabelIds(field, 'pm-1')).toBe('own pm-1-label-1')
    expect(first.id).toBe('own')
  })

  it('returns nothing for a field no label names, or no field', () => {
    expect(fieldLabelIds(input('alone'), 'pm-1')).toBeUndefined()
    expect(fieldLabelIds(null, 'pm-1')).toBeUndefined()
    expect(fieldLabelIds(document.createElement('div'), 'pm-1')).toBeUndefined()
  })
})
