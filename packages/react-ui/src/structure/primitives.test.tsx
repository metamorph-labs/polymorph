import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { tokenColor, tokenLength } from '../controls/token-probe'
import { installTestTheme } from '@polymorph/engine/testing'
import { Avatar, avatarTone, initialsOf, type AvatarProps } from './Avatar'
import { Kbd, type KbdProps } from './Kbd'
import { Progress, type ProgressProps } from './Progress'
import { Separator, type SeparatorProps } from './Separator'
import { Spinner, type SpinnerProps } from './Spinner'

/**
 * The small primitives.
 *
 * Each is a few lines of CSS and one decision, which the tests check: no spacing
 * on a separator, scaling on a progress bar, fallback order on an avatar, and a
 * name on a spinner.
 */

beforeAll(installTestTheme)

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

describe('the closed surfaces', () => {
  it('leave no way to style any of them from a call site', () => {
    assertGoverned<SeparatorProps>(true)
    assertGoverned<KbdProps>(true)
    assertGoverned<SpinnerProps>(true)
    assertGoverned<ProgressProps>(true)
    assertGoverned<AvatarProps>(true)
  })
})

describe('Separator', () => {
  it('has no spacing of its own, so it cannot disturb the layout rhythm', () => {
    // This is the main API decision. A separator with margins would silently
    // change the spacing of every layout that used one.
    const style = getComputedStyle(mount(<Separator />))
    for (const side of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'] as const) {
      expect(style[side], side).toBe('0px')
    }
  })

  it('draws on the block edge horizontally and the inline edge vertically', () => {
    expect(getComputedStyle(mount(<Separator />)).borderTopWidth).toBe('1px')

    const vertical = mount(<Separator orientation="vertical" />)
    expect(getComputedStyle(vertical).borderTopWidth).toBe('0px')
    expect(getComputedStyle(vertical).borderLeftWidth).toBe('1px')
  })

  it('is decorative, because the grouping is already in the DOM', () => {
    expect(mount(<Separator />).getAttribute('aria-hidden')).toBe('true')
  })

  it('is announced when labelled, because the word is content', () => {
    const divider = mount(<Separator label="OR" />)
    // No longer decorative. Without `aria-hidden`, "OR" is read out.
    expect(divider.hasAttribute('aria-hidden')).toBe(false)
    expect(divider.textContent).toBe('OR')
    expect(divider.dataset['orientation']).toBe('horizontal')
  })

  it('places equal-width rules on either side of the label', () => {
    const divider = mount(<Separator label="OR" />)
    const [before, label, after] = [...divider.children] as HTMLElement[]

    for (const rule of [before, after]) {
      expect(getComputedStyle(rule as HTMLElement).borderTopWidth).toBe('1px')
      expect(getComputedStyle(rule as HTMLElement).borderTopColor).toBe(
        tokenColor('--pm-border-subtle'),
      )
    }
    // Equal growth: the label is centred between two rules of the same width.
    expect((before as HTMLElement).getBoundingClientRect().width).toBeCloseTo(
      (after as HTMLElement).getBoundingClientRect().width,
      0,
    )
    expect(getComputedStyle(label as HTMLElement).color).toBe(tokenColor('--pm-text-muted'))
    // The size system's icon–label gap at md (`design/components/README.md`):
    // each rule stays space-3 clear of the text.
    expect(getComputedStyle(divider).columnGap).toBe(tokenLength('--pm-space-3'))
  })

  it('rejects a labelled vertical separator at the type level', () => {
    // @ts-expect-error — the worded divider is horizontal only (separator.md).
    const unlawful = <Separator orientation="vertical" label="OR" />
    expect(unlawful).toBeTruthy()
  })
})

describe('Kbd', () => {
  it('is a real <kbd>, so it has key semantics natively', () => {
    expect(mount(<Kbd>K</Kbd>).tagName).toBe('KBD')
  })

  it('has a thicker bottom border so it looks raised', () => {
    // The only depth cue that survives `sharp` geometry and `flat` depth, which
    // together remove every other keycap cue.
    const style = getComputedStyle(mount(<Kbd>K</Kbd>))
    expect(Number.parseFloat(style.borderBottomWidth)).toBeGreaterThan(
      Number.parseFloat(style.borderTopWidth),
    )
  })

  it('keeps a narrow key from collapsing to its glyph', () => {
    expect(getComputedStyle(mount(<Kbd>K</Kbd>)).minInlineSize).toBe(
      tokenLength('--pm-icon-size-md'),
    )
  })
})

describe('Spinner', () => {
  it('announces what is loading, from inside the live region', () => {
    // `status` is a live region that reads its *contents* when it appears, so the
    // label is text inside it. An `aria-label` on `status` would not be announced.
    render(<Spinner label="Fetching tickets" />)
    expect(screen.getByRole('status').textContent).toBe('Fetching tickets')
  })

  it('announces a default when no label is given', () => {
    render(<Spinner />)
    expect(screen.getByRole('status').textContent).toBe('Loading')
  })

  it('hides that text visually, because the glyph shows it', () => {
    render(<Spinner label="Loading" />)
    const label = screen.getByRole('status').lastElementChild as HTMLElement
    expect(label.getBoundingClientRect().width).toBeLessThan(2)
  })

  it('inherits its colour from its context', () => {
    expect(getComputedStyle(mount(<Spinner />)).color).toBe(tokenColor('--pm-text-primary'))
  })

  it('rotates the glyph, not the label', () => {
    // The label is inside the status element, so rotating the root would rotate
    // the label too.
    const root = mount(<Spinner label="Loading" />)
    const glyph = root.querySelector('svg')?.parentElement as HTMLElement
    expect(getComputedStyle(glyph).animationName).not.toBe('none')
    expect(getComputedStyle(root).animationName).toBe('none')
  })
})

describe('Progress', () => {
  function bar(props: Partial<ProgressProps> = {}) {
    return mount(<Progress value={50} label="Import" {...props} />)
  }

  it('exposes its role, name and value', () => {
    const root = bar({ value: 33 })
    expect(root.getAttribute('role')).toBe('progressbar')
    expect(root.getAttribute('aria-label')).toBe('Import')
    expect(root.getAttribute('aria-valuenow')).toBe('33')
    expect(root.getAttribute('aria-valuemin')).toBe('0')
    expect(root.getAttribute('aria-valuemax')).toBe('100')
  })

  it('clamps the value to the 0–100 range', () => {
    expect(bar({ value: 140 }).getAttribute('aria-valuenow')).toBe('100')
    expect(bar({ value: -20 }).getAttribute('aria-valuenow')).toBe('0')
  })

  it('scales the fill rather than resizing it', () => {
    // Compositor-only law: a width transition on a bar that updates every few
    // hundred ms would cause a layout pass each time.
    const fill = bar({ value: 25 }).firstElementChild as HTMLElement
    expect(getComputedStyle(fill).inlineSize).toBe(getComputedStyle(bar()).inlineSize)
    expect(fill.style.transform).toBe('scaleX(0.25)')
    expect(getComputedStyle(fill).transformOrigin.startsWith('0px')).toBe(true)
  })

  it('transitions the transform and nothing that reflows', () => {
    const fill = bar().firstElementChild as HTMLElement
    expect(getComputedStyle(fill).transitionProperty).toBe('transform')
  })

  it('uses the danger colour only when tone is danger', () => {
    expect(
      getComputedStyle(bar({ tone: 'danger' }).firstElementChild as HTMLElement).backgroundColor,
    ).toBe(tokenColor('--pm-danger-solid'))

    // The default fill is `accent.gradient`: a linear-gradient in a
    // gradient-seeded theme, otherwise the pinned solid equal to `accent.bg`. The
    // test accepts whichever form the theme resolved.
    const token = getComputedStyle(document.documentElement)
      .getPropertyValue('--pm-accent-gradient')
      .trim()
    const fill = getComputedStyle(bar().firstElementChild as HTMLElement)
    if (token.startsWith('linear-gradient')) {
      expect(fill.backgroundImage).toContain('linear-gradient')
    } else {
      expect(fill.backgroundColor).toBe(tokenColor('--pm-accent-gradient'))
      expect(fill.backgroundColor).toBe(tokenColor('--pm-accent-bg'))
    }
  })
})

describe('Avatar', () => {
  it('takes two letters from a name of any shape', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL')
    expect(initialsOf('Rowan')).toBe('RO')
    expect(initialsOf('  Grace  Brewster  Murray  Hopper ')).toBe('GH')
    expect(initialsOf('')).toBe('')
  })

  it('falls back in order: image, then initials, then the glyph', () => {
    expect(mount(<Avatar name="Ada Lovelace" />).dataset['fallback']).toBe('initials')
    expect(mount(<Avatar name="" />).dataset['fallback']).toBe('icon')
    expect(mount(<Avatar name="Ada Lovelace" src="data:," />).dataset['fallback']).toBeUndefined()
  })

  it('falls back to the initials when the image fails to load', async () => {
    const root = mount(<Avatar name="Ada Lovelace" src="data:," />)
    const image = root.querySelector('img') as HTMLImageElement

    // A broken URL shows the initials, not an empty circle, because the name is
    // always available.
    image.dispatchEvent(new Event('error'))
    await vi.waitFor(() => expect(root.dataset['fallback']).toBe('initials'))
    expect(root.textContent).toBe('AL')
  })

  it('paints the initials underneath, so a slow image never leaves a gap', () => {
    const root = mount(<Avatar name="Ada Lovelace" src="data:," />)
    expect(root.textContent).toBe('AL')
    expect(root.querySelector('img')).not.toBeNull()
  })

  it('is round at every geometry', () => {
    const root = mount(<Avatar name="Ada Lovelace" />)
    expect(getComputedStyle(root).borderTopLeftRadius).toBe(tokenLength('--pm-radius-pill'))
  })

  it('exposes the name only when it stands alone', () => {
    const alone = mount(<Avatar name="Ada Lovelace" label="Ada Lovelace" />)
    expect(alone.getAttribute('role')).toBe('img')
    expect(alone.getAttribute('aria-label')).toBe('Ada Lovelace')

    // Beside visible text it would repeat the name.
    const beside = mount(<Avatar name="Ada Lovelace" />)
    expect(beside.getAttribute('aria-hidden')).toBe('true')
  })

  /*
   * The spec rejects hash-to-hue, because a computed hue is outside the role
   * system and unmeasured by the contrast law. So the hash picks a *role*.
   */
  it('gives a name the same colour every time, on every machine', () => {
    // A pure function of the name, so a person recognises the mark across
    // reloads and sessions.
    expect(avatarTone('Ada Lovelace')).toBe(avatarTone('Ada Lovelace'))
    expect(mount(<Avatar name="Ada Lovelace" />).dataset['tone']).toBe(avatarTone('Ada Lovelace'))
  })

  it('picks from the role table rather than from a hue wheel', () => {
    const tones = new Set(
      ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Barbara Liskov'].map(
        avatarTone,
      ),
    )
    // Every possible result is a family the theme emits and `laws.test.ts`
    // measures, in both modes, under every preset.
    for (const tone of tones) {
      expect(['accent', 'info', 'success', 'warning', 'danger']).toContain(tone)
    }
    // It also spreads names across families. One family for every name would
    // make the feature useless.
    expect(tones.size).toBeGreaterThan(1)
  })

  it('pairs the tone the way the role table pairs it', () => {
    const root = mount(<Avatar name="Ada Lovelace" />)
    const tone = root.dataset['tone'] as string
    expect(getComputedStyle(root).color).toBe(tokenColor(`--pm-${tone}-text`))
    expect(getComputedStyle(root).backgroundColor).toBe(tokenColor(`--pm-${tone}-subtle`))
  })

  it('sets no tone when the initials are not shown', () => {
    // An image covers the initials, and the glyph fallback means there is no
    // name to hash.
    expect(mount(<Avatar name="Ada Lovelace" src="data:," />).dataset['tone']).toBeUndefined()
    expect(mount(<Avatar name="" />).dataset['tone']).toBeUndefined()
  })

  it('grows with its size, from the space scale', () => {
    const sm = mount(<Avatar name="Ada Lovelace" size="sm" />)
    const lg = mount(<Avatar name="Ada Lovelace" size="lg" />)
    expect(getComputedStyle(sm).inlineSize).toBe(tokenLength('--pm-space-6'))
    expect(getComputedStyle(lg).inlineSize).toBe(tokenLength('--pm-space-8'))
  })
})

describe('Avatar.Group', () => {
  function group(max?: number) {
    return mount(
      <Avatar.Group label="Assignees" max={max}>
        <Avatar name="Ada Lovelace" />
        <Avatar name="Grace Hopper" />
        <Avatar name="Alan Turing" />
        <Avatar name="Katherine Johnson" />
        <Avatar name="Barbara Liskov" />
      </Avatar.Group>,
    )
  }

  it('is a named group whose members are standalone marks', () => {
    const set = group(3)
    expect(set.getAttribute('role')).toBe('group')
    expect(set.getAttribute('aria-label')).toBe('Assignees')
    // A group has no adjacent name text, so every member exposes its own name
    // instead of being hidden from screen readers.
    const marks = [...set.querySelectorAll('[role="img"]')]
    expect(marks.map((mark) => mark.getAttribute('aria-label'))).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Alan Turing',
    ])
  })

  it('shows the surplus as a "+N" in real, unhidden text', () => {
    const set = group(3)
    const chip = set.lastElementChild as HTMLElement
    expect(chip.textContent).toBe('+2')
    // Initials are hidden because they only depict a name. "+2" is information,
    // and it is the overflow's text alternative.
    expect(chip.hasAttribute('aria-hidden')).toBe(false)
    expect(chip.closest('[aria-hidden]')).toBeNull()
    // Read as text, so one step stronger than the fallback glyph's muted colour.
    expect(getComputedStyle(chip).color).toBe(tokenColor('--pm-text-secondary'))
    expect(getComputedStyle(chip).backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
  })

  it('draws every mark and no chip while the set fits', () => {
    const set = group()
    expect(set.querySelectorAll('[role="img"]')).toHaveLength(5)
    expect(set.textContent).not.toContain('+')
  })

  it('overlaps each mark onto the previous one by a quarter of its diameter', () => {
    const set = group(3)
    const marks = [...set.children] as HTMLElement[]
    const diameter = Number.parseFloat(tokenLength('--pm-space-7'))

    expect(getComputedStyle(marks[0] as HTMLElement).marginInlineStart).toBe('0px')
    for (const mark of marks.slice(1)) {
      expect(Number.parseFloat(getComputedStyle(mark).marginInlineStart)).toBeCloseTo(
        -diameter / 4,
        1,
      )
    }
    // Checks the geometry, not just the declaration: neighbours really overlap.
    const [first, second] = marks
    expect((second as HTMLElement).getBoundingClientRect().left).toBeLessThan(
      (first as HTMLElement).getBoundingClientRect().right,
    )
  })

  it('rings every mark in the surface colour, so each face stays legible', () => {
    const set = group(3)
    for (const mark of [...set.children] as HTMLElement[]) {
      // The charts' 2px surface-gap rule applied to a circle: marks are separated
      // by the surface colour, never by a stroke.
      expect(getComputedStyle(mark).boxShadow).toContain('0px 0px 0px 2px')
    }
  })

  it('sizes the chip like the set, so it lines up as one more mark', () => {
    const set = mount(
      <Avatar.Group label="Assignees" max={1}>
        <Avatar name="Ada Lovelace" size="lg" />
        <Avatar name="Grace Hopper" size="lg" />
      </Avatar.Group>,
    )
    const chip = set.lastElementChild as HTMLElement
    expect(chip.dataset['size']).toBe('lg')
    expect(getComputedStyle(chip).inlineSize).toBe(tokenLength('--pm-space-8'))
  })

  it('warns in dev when members mix sizes, because the overlap assumes one diameter', () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mount(
        <Avatar.Group label="Assignees">
          <Avatar name="Ada Lovelace" size="sm" />
          <Avatar name="Grace Hopper" size="lg" />
        </Avatar.Group>,
      )
      expect(warned).toHaveBeenCalledWith(expect.stringContaining('Avatar.Group'))

      warned.mockClear()
      mount(
        <Avatar.Group label="Assignees">
          <Avatar name="Ada Lovelace" />
          <Avatar name="Grace Hopper" />
        </Avatar.Group>,
      )
      expect(warned).not.toHaveBeenCalled()
    } finally {
      warned.mockRestore()
    }
  })
})
