import { describe, expect, it } from 'vitest'

import { promptPick, promptToken } from './prompt-token'

/**
 * The token rule every framework's PromptInput follows. The members' tests
 * drive it through typing (`@polymorph/conformance/prompt-triggers`); these
 * pin the rule itself.
 */

const PEOPLE = { char: '@' }
const COMMANDS = { char: '/', at: 'start' as const }
const BOTH = [PEOPLE, COMMANDS]

describe('promptToken', () => {
  it('finds a trigger at the start of the prompt and after whitespace', () => {
    expect(promptToken('@ad', 3, BOTH)).toEqual({ trigger: 0, start: 0, query: 'ad' })
    expect(promptToken('Ask @ad', 7, BOTH)).toEqual({ trigger: 0, start: 4, query: 'ad' })
    expect(promptToken('Line one\n@', 10, BOTH)).toEqual({ trigger: 0, start: 9, query: '' })
  })

  it('reads the query up to the caret, not to the end of the word', () => {
    expect(promptToken('Ask @adam', 7, BOTH)).toEqual({ trigger: 0, start: 4, query: 'ad' })
  })

  it('finds nothing for a character inside a word', () => {
    expect(promptToken('ada@example', 11, BOTH)).toBeNull()
    expect(promptToken('a@b@c', 5, BOTH)).toBeNull()
  })

  it('closes at whitespace between the character and the caret', () => {
    expect(promptToken('Ask @ada lo', 11, BOTH)).toBeNull()
    expect(promptToken('Ask @ada ', 9, BOTH)).toBeNull()
  })

  it('lets a trigger that opens at the start open only as the first character', () => {
    expect(promptToken('/sum', 4, BOTH)).toEqual({ trigger: 1, start: 0, query: 'sum' })
    expect(promptToken('Then /sum', 9, BOTH)).toBeNull()
    expect(promptToken(' /sum', 5, BOTH)).toBeNull()
  })

  it('finds nothing without a caret or without triggers', () => {
    expect(promptToken('@ad', null, BOTH)).toBeNull()
    expect(promptToken('@ad', 3, [])).toBeNull()
    expect(promptToken('', 0, BOTH)).toBeNull()
  })

  it('takes the first trigger with the character', () => {
    expect(promptToken('@a', 2, [PEOPLE, { char: '@', at: 'start' }])?.trigger).toBe(0)
  })
})

describe('promptPick', () => {
  const token = { trigger: 0, start: 4, query: 'ad' }

  it('replaces the token with the insertion and a space, and puts the caret after the space', () => {
    expect(promptPick('Ask @ad', token, 7, '@Ada Lovelace')).toEqual({
      text: 'Ask @Ada Lovelace ',
      caret: 18,
    })
  })

  it('keeps the text after the caret, and adds no second space before whitespace', () => {
    expect(promptPick('Ask @ad about it', token, 7, '@Ada Lovelace')).toEqual({
      text: 'Ask @Ada Lovelace about it',
      caret: 18,
    })
    expect(promptPick('Ask @adtoday', token, 7, '@Ada')).toEqual({
      text: 'Ask @Ada today',
      caret: 9,
    })
  })

  it('removes the token and adds nothing for an empty insertion', () => {
    expect(promptPick('/cl', { trigger: 1, start: 0, query: 'cl' }, 3, '')).toEqual({
      text: '',
      caret: 0,
    })
  })

  it('leaves the caret in no token', () => {
    for (const insertion of ['@Ada', '/summarize', '']) {
      const next = promptPick('Ask @ad', token, 7, insertion)
      expect(promptToken(next.text, next.caret, BOTH)).toBeNull()
    }
  })
})
