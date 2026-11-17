import { afterEach, describe, expect, it } from 'vitest'

import { accessibleName, shownText } from './name'

/**
 * The accessible name the bridge reports for a member's control, and the
 * text it matches a query's `text` against, read from real markup.
 */

afterEach(() => {
  document.body.replaceChildren()
})

/** Renders markup into the body and returns the element with `id="subject"`. */
function subject(markup: string): Element {
  document.body.innerHTML = markup
  const found = document.getElementById('subject')
  if (!found) throw new Error('the markup has no #subject')
  return found
}

describe('accessibleName', () => {
  it('reads aria-labelledby first, in the order its ids name', () => {
    const element = subject(
      '<span id="b">Replies</span><span id="a">Email</span><button id="subject" aria-labelledby="a b" aria-label="Other">Text</button>',
    )
    expect(accessibleName(element)).toBe('Email Replies')
  })

  it('reads aria-label when aria-labelledby names nothing', () => {
    const element = subject(
      '<button id="subject" aria-labelledby="missing" aria-label=" Select   row ">Text</button>',
    )
    expect(accessibleName(element)).toBe('Select row')
  })

  it('reads a label that wraps the control', () => {
    const element = subject(
      '<label><button id="subject" role="checkbox"><svg aria-hidden="true"></svg></button><span>Email me</span></label>',
    )
    expect(accessibleName(element)).toBe('Email me')
  })

  it('reads a label that wraps an element that is not labelable', () => {
    const element = subject('<label><span id="subject" role="checkbox"></span>Urgent</label>')
    expect(accessibleName(element)).toBe('Urgent')
  })

  it('reads a label that names the control with for', () => {
    const element = subject('<label for="subject">Title</label><input id="subject" />')
    expect(accessibleName(element)).toBe('Title')
  })

  it('reads alt, then the text, then title', () => {
    expect(accessibleName(subject('<img id="subject" alt="Logo" title="Ignored" />'))).toBe('Logo')
    expect(
      accessibleName(subject('<button id="subject" title="Ignored">Save <b>draft</b></button>')),
    ).toBe('Save draft')
    expect(
      accessibleName(
        subject('<button id="subject" title="Close"><svg aria-hidden="true"></svg></button>'),
      ),
    ).toBe('Close')
  })

  it('leaves out what assistive technology does not read', () => {
    const element = subject(
      '<button id="subject">Save<span aria-hidden="true">★</span><span hidden>secret</span><img alt=" now" /></button>',
    )
    expect(accessibleName(element)).toBe('Save now')
  })

  it('names a table by its caption, and by nothing when it has none', () => {
    const rows = '<tbody><tr><td>T-1041</td><td>Login loop</td></tr></tbody>'
    expect(
      accessibleName(subject(`<table id="subject"><caption>Tickets</caption>${rows}</table>`)),
    ).toBe('Tickets')
    expect(accessibleName(subject(`<table id="subject">${rows}</table>`))).toBe('')
    expect(
      accessibleName(subject(`<table id="subject" aria-label="Open tickets">${rows}</table>`)),
    ).toBe('Open tickets')
  })

  it('names a member by the caption of the table it draws, and not of one passed to it', () => {
    const table = '<table><caption>Tickets</caption><tbody><tr><td>T-1041</td></tr></tbody></table>'
    // Table's wrapper holds its table, and DataTable's root holds the Table member.
    expect(accessibleName(subject(`<div id="subject">${table}</div>`))).toBe('Tickets')
    expect(
      accessibleName(
        subject(`<div id="subject"><p>1 selected</p><div data-member="table">${table}</div></div>`),
      ),
    ).toBe('Tickets')
    // A table deeper in the element is the application's content, read as text.
    expect(accessibleName(subject(`<div id="subject"><section>${table}</section></div>`))).toBe(
      'Tickets T-1041',
    )
  })

  it('names nothing for no element', () => {
    expect(accessibleName(null)).toBe('')
  })
})

describe('shownText', () => {
  it("reads the element's text, without a field's content or a select's options", () => {
    const element = subject(
      '<div id="subject">Status<br>open<textarea>first value</textarea><select><option>One</option></select></div>',
    )
    expect(shownText(element)).toBe('Status open')
  })

  it('reads each element that is not inline as words of its own', () => {
    const element = subject(
      '<div id="subject" role="tablist"><button>Open</button><button>Solved</button><button>Sp<span>am</span></button></div>',
    )
    expect(shownText(element)).toBe('Open Solved Spam')
    expect(accessibleName(element)).toBe('Open Solved Spam')
  })
})
