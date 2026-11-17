import { describe, expect, it } from 'vitest'

import { ratingMax, ratingModel, ratingPress, ratingStep } from './rating'

/**
 * The model every framework's Rating draws (`design/components/rating.md`).
 * The members' own tests press and arrow through it in a browser; these pin
 * the rounding, the fills, the words and the steps themselves.
 */

const fills = (value: number | null, readOnly = false, max?: number) =>
  ratingModel({ value, label: 'Rating', readOnly, max }).marks.map((mark) => mark.fill)

describe('ratingMax', () => {
  it('is 5 when it is not told, and a whole number from 2 to 10 otherwise', () => {
    expect(ratingMax(undefined)).toBe(5)
    expect(ratingMax(Number.NaN)).toBe(5)
    expect(ratingMax(10)).toBe(10)
    expect(ratingMax(7.4)).toBe(7)
    expect(ratingMax(1)).toBe(2)
    expect(ratingMax(40)).toBe(10)
  })
})

describe('a control', () => {
  it('holds a whole mark, and nothing for no value, 0 or less', () => {
    expect(ratingModel({ value: 3, label: 'Rating' }).value).toBe(3)
    expect(ratingModel({ value: 3.6, label: 'Rating' }).value).toBe(4)
    expect(ratingModel({ value: 9, label: 'Rating' }).value).toBe(5)
    expect(ratingModel({ value: 0, label: 'Rating' }).value).toBeNull()
    expect(ratingModel({ value: -2, label: 'Rating' }).value).toBeNull()
    expect(ratingModel({ value: undefined, label: 'Rating' }).value).toBeNull()
  })

  it('fills each mark up to the one it holds, and no mark in part', () => {
    expect(fills(3)).toEqual(['full', 'full', 'full', 'none', 'none'])
    expect(fills(null)).toEqual(['none', 'none', 'none', 'none', 'none'])
    expect(fills(4.4)).toEqual(['full', 'full', 'full', 'full', 'none'])
  })

  it('names each mark by the value it sets, in the plural the count takes', () => {
    const names = ratingModel({ value: null, label: 'Rating' }).marks.map((mark) => mark.name)
    expect(names).toEqual(['1 star', '2 stars', '3 stars', '4 stars', '5 stars'])
  })
})

describe('a shown rating', () => {
  it('holds a fraction to one decimal place, inside 0 and its most', () => {
    expect(ratingModel({ value: 4.34, label: 'Rating', readOnly: true }).value).toBe(4.3)
    expect(ratingModel({ value: 7, label: 'Rating', readOnly: true }).value).toBe(5)
    expect(ratingModel({ value: -1, label: 'Rating', readOnly: true }).value).toBe(0)
  })

  it('fills the mark the fraction lands in by its share, from the inline start', () => {
    const { marks } = ratingModel({ value: 4.3, label: 'Rating', readOnly: true })
    expect(marks.map((mark) => mark.fill)).toEqual(['full', 'full', 'full', 'full', 'part'])
    expect(marks[4]?.share).toBe('30%')
    expect(marks[3]?.share).toBeUndefined()
  })

  it('says the label, the value and the most in one sentence', () => {
    expect(ratingModel({ value: 4.34, label: 'Average rating', readOnly: true }).sentence).toBe(
      'Average rating: 4.3 out of 5',
    )
    expect(ratingModel({ value: null, label: 'Rating', readOnly: true }).sentence).toBe(
      'Rating: 0 out of 5',
    )
  })

  it("writes the numerals in the locale's digits and decimal sign", () => {
    const shown = ratingModel({ value: 4.3, label: 'Note', readOnly: true, locale: 'de' })
    expect(shown.sentence).toBe('Note: 4,3 out of 5')
    const arabic = ratingModel({ value: 2, label: 'Rating', locale: 'ar-EG' })
    expect(arabic.marks[1]?.name).toBe('٢ stars')
  })

  it('takes its words from the messages, with the numbers already written', () => {
    const model = ratingModel({
      value: 3.5,
      label: 'Bewertung',
      readOnly: true,
      locale: 'de',
      max: 4,
      messages: {
        mark: (value, numeral) => `${numeral} ${value === 1 ? 'Stern' : 'Sterne'}`,
        shown: (label, value, max) => `${label}: ${value} von ${max}`,
      },
    })
    expect(model.sentence).toBe('Bewertung: 3,5 von 4')
    expect(model.marks.map((mark) => mark.name)).toEqual([
      '1 Stern',
      '2 Sterne',
      '3 Sterne',
      '4 Sterne',
    ])
  })
})

describe('ratingPress', () => {
  it('chooses the pressed mark, and clears the mark the rating held', () => {
    expect(ratingPress(3, null, false)).toBe(3)
    expect(ratingPress(3, 2, false)).toBe(3)
    expect(ratingPress(3, 3, false)).toBeNull()
  })

  it('keeps a required rating’s mark', () => {
    expect(ratingPress(3, 3, true)).toBe(3)
  })
})

describe('ratingStep', () => {
  it('moves along the row by the reading direction, and stops at the ends', () => {
    expect(ratingStep('ArrowRight', 2, 5, 'ltr')).toBe(3)
    expect(ratingStep('ArrowLeft', 2, 5, 'ltr')).toBe(1)
    expect(ratingStep('ArrowRight', 2, 5, 'rtl')).toBe(1)
    expect(ratingStep('ArrowLeft', 2, 5, 'rtl')).toBe(3)
    expect(ratingStep('ArrowRight', 5, 5, 'ltr')).toBe(5)
    expect(ratingStep('ArrowLeft', 1, 5, 'ltr')).toBe(1)
  })

  it('takes Down as the next mark and Up as the previous, in either direction', () => {
    expect(ratingStep('ArrowDown', 2, 5, 'rtl')).toBe(3)
    expect(ratingStep('ArrowUp', 2, 5, 'rtl')).toBe(1)
  })

  it('takes Home and End to the first and the last mark', () => {
    expect(ratingStep('Home', 4, 5, 'ltr')).toBe(1)
    expect(ratingStep('End', 2, 7, 'rtl')).toBe(7)
  })

  it('takes no other key', () => {
    expect(ratingStep('PageUp', 2, 5, 'ltr')).toBeUndefined()
    expect(ratingStep('a', 2, 5, 'ltr')).toBeUndefined()
  })
})
