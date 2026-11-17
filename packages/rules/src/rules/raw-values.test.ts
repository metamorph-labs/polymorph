import { describe, expect, it } from 'vitest'

import { COLOURLESS_WORDS, findRawValue, refusedColour } from './raw-values'

describe('findRawValue', () => {
  it('catches the three ways a design value reaches TypeScript', () => {
    expect(findRawValue('#fff')?.text).toBe('#fff')
    expect(findRawValue('#4087de')?.text).toBe('#4087de')
    expect(findRawValue('padding: 24px')?.text).toBe('24px')
    expect(findRawValue('1.5rem')?.text).toBe('1.5rem')
    expect(findRawValue('rgba(0,0,0,.4)')?.text).toBe('rgba(0,0,0,.4)')
    expect(findRawValue('oklch(0.62 0.15 255)')?.text).toBe('oklch(0.62 0.15 255)')
  })

  it('quotes a colour function whole, or only its opening when it is built at runtime', () => {
    // The whole call is what the report compares with the theme's values.
    expect(findRawValue('0 2px 8px rgb(0 0 0 / 0.1)')?.text).toBe('2px')
    expect(findRawValue('shadow: rgb(0 0 0 / 0.1)')?.text).toBe('rgb(0 0 0 / 0.1)')
    expect(findRawValue('rgb(${r} 0 0)')?.text).toBe('rgb(')
    expect(findRawValue('hsl(var(--x) 50% 50%)')?.text).toBe('hsl(')
    expect(findRawValue('rgb(0 0 0')?.text).toBe('rgb(')
  })

  it('says which family the value belongs to', () => {
    expect(findRawValue('#fff')?.kind).toBe('colour')
    expect(findRawValue('rgba(0,0,0,.4)')?.kind).toBe('colour')
    expect(findRawValue('12px')?.kind).toBe('length')
  })

  it('ignores strings that only look like values', () => {
    // Each of these occurs in real code, and a looser pattern would match it.
    for (const clean of [
      '#root',
      '#/inbox',
      '#section-heading',
      'v1.2.0',
      'text-2xl',
      'sk-1a2b3c4d5e',
      'https://example.com/#top',
      'complex',
      '--pm-space-4',
      'sm',
    ]) {
      expect(findRawValue(clean), clean).toBeUndefined()
    }
  })

  it('is anchored, so a length must stand alone', () => {
    expect(findRawValue('20px')).toBeDefined()
    expect(findRawValue('gap-20px')).toBeUndefined()
    expect(findRawValue('20pxel')).toBeUndefined()
  })

  it('gives a reason, because agents act on the message', () => {
    expect(findRawValue('#fff')?.reason).toMatch(/role token/)
    expect(findRawValue('8px')?.reason).toMatch(/space, radius or size token/)
  })
})

/**
 * The colour check of a `style` a `<ThirdParty>` boundary lifts.
 *
 * A report inside a boundary has no answer but a zone, so a lawful value must
 * never be reported. `LAWFUL` holds, for each property the check reads, a value
 * with every keyword and function of the property's grammar and a token read
 * where a colour goes. `REFUSED` holds a colour for each of the same
 * properties. A property added to the check is added to both.
 */
describe('refusedColour', () => {
  const LAWFUL: Record<string, string[]> = {
    color: [
      'inherit',
      'initial',
      'unset',
      'revert',
      'revert-layer',
      'currentColor',
      'transparent',
      'var(--pm-text-primary)',
      'var(--pm-text-primary) !important',
      'var(--tone, var(--pm-text-primary))',
    ],
    'background-color': ['transparent', 'var(--pm-bg-subtle)'],
    'border-color': ['currentcolor transparent', 'var(--a) var(--b) var(--c) var(--d)'],
    'border-block-start-color': ['var(--pm-border-subtle)'],
    'outline-color': ['invert', 'var(--pm-focus-ring)'],
    'text-decoration-color': ['currentColor'],
    'caret-color': ['auto', 'var(--pm-accent-bg)'],
    'accent-color': ['auto', 'var(--pm-accent-bg)'],
    'scrollbar-color': ['auto', 'var(--thumb) var(--track)'],
    '-webkit-text-fill-color': ['currentcolor'],
    '-webkit-tap-highlight-color': ['transparent'],
    'stop-color': ['var(--pm-accent-bg)'],
    fill: ['none', 'currentColor', 'context-fill', 'url(#stripes)', 'url(#stripes) none'],
    stroke: ['none', 'context-stroke', 'var(--pm-border-strong)'],
    '--rdg-background-color': ['var(--pm-bg-surface)', '59 130 246', 'inherit'],
    '--color': ['var(--pm-text-primary)'],
    background: [
      'none',
      'var(--pm-bg-subtle)',
      'url(marker-red.png) no-repeat center / cover',
      'var(--a) url("red-white.png") repeat-x fixed top left / auto 50% padding-box content-box',
      'url(a.png) repeat-y scroll bottom right / contain border-box',
      'url(a.png) space round local text',
      'url(a.png) repeat border-area',
      'url(a.png) x-start y-start / cover',
      'url(a.png) x-end y-end',
      'url(a.png) block-start inline-start',
      'url(a.png) block-end inline-end',
      'url(a.png) start end',
      'url(data:image/png;base64,iVBORw0KGgo=) no-repeat',
      'linear-gradient(to bottom right, var(--a), transparent 50%)',
      'linear-gradient(0.25turn, var(--a) 0 10px, var(--b))',
      'linear-gradient(in oklch longer hue, var(--a), var(--b))',
      'linear-gradient(in srgb-linear, var(--a), var(--b))',
      'linear-gradient(in hsl shorter hue to right, var(--a), var(--b))',
      ...[
        'srgb',
        'srgb-linear',
        'display-p3',
        'display-p3-linear',
        'a98-rgb',
        'prophoto-rgb',
        'rec2020',
        'rec2100-pq',
        'rec2100-hlg',
        'rec2100-linear',
        'xyz',
        'xyz-d50',
        'xyz-d65',
        'lab',
        'oklab',
      ].map((space) => `linear-gradient(in ${space}, var(--a), var(--b))`),
      ...['shorter', 'longer', 'increasing', 'decreasing'].flatMap((arc) =>
        ['hsl', 'hwb', 'lch', 'oklch'].map(
          (space) => `conic-gradient(in ${space} ${arc} hue, var(--a), var(--b))`,
        ),
      ),
      'radial-gradient(circle farthest-corner at top, var(--a) 0, var(--b) 100%)',
      'radial-gradient(ellipse closest-side at 20% 30%, var(--a), var(--b))',
      'radial-gradient(farthest-side at left, var(--a), var(--b))',
      'radial-gradient(closest-corner, var(--a), var(--b))',
      'conic-gradient(from 45deg at center, var(--a), var(--b))',
      'repeating-linear-gradient(45deg, var(--a) 0 10px, transparent 10px 20px)',
      'repeating-radial-gradient(var(--a), var(--b) 10px)',
      'repeating-conic-gradient(var(--a) 0 15deg, var(--b) 0 30deg)',
      'image-set("a.png" 1x, "a-2x.png" 2x)',
      'image-set(url(a.avif) type("image/avif"), url(a.png) 2dppx)',
      'cross-fade(url(a.png) 20%, url(b.png))',
      'element(#legend)',
      'paint(checkerboard)',
      'paint(checkerboard, 8px)',
      'env(safe-area-inset-top) 0 / calc(100% - 2 * var(--pm-space-4)) auto',
      'calc(pi * 1px) calc(e * 1px) / min(10px, 1em) max(1px, 2px) no-repeat',
      'clamp(0px, 10%, 40px) round(up, 10.5px, 1px)',
      'round(down, 10.5px, 1px) round(nearest, 10.5px, 1px) round(to-zero, 10.5px, 1px)',
      'calc(-infinity * 1px) calc(nan * 1px)',
    ],
    'background-image': ['none', 'url(a.png), linear-gradient(var(--a), var(--b))'],
    border: [
      '0',
      'none',
      'hidden',
      '1px solid',
      '1px solid var(--pm-border-subtle)',
      'thin dashed currentColor',
      'medium dotted',
      'thick double',
      '2px groove',
      '2px ridge',
      '2px inset',
      '2px outset',
      'calc(1px * 2) solid var(--pm-border-subtle) !important',
    ],
    'border-top': ['1px solid var(--pm-border-subtle)'],
    'border-inline-start': ['thin dashed'],
    'border-block': ['medium none'],
    outline: [
      'none',
      'auto',
      '2px solid var(--pm-focus-ring)',
      'invert dotted 1px',
      'thick double',
    ],
    'column-rule': ['1px solid var(--pm-border-subtle)', 'thin dotted', 'medium inset'],
    'text-decoration': [
      'none',
      'underline',
      'underline dotted',
      'underline overline wavy from-font',
      'line-through 2px var(--pm-text-danger)',
      'underline dashed auto',
      'underline double',
      'spelling-error',
      'grammar-error',
      'blink',
    ],
    'text-emphasis': [
      'none',
      'filled dot',
      'open circle var(--pm-accent-bg)',
      'double-circle',
      'triangle',
      'filled sesame',
      '"x" var(--pm-accent-bg)',
    ],
    '-webkit-text-stroke': ['1px var(--pm-text-primary)', 'thin', 'medium', 'thick currentColor'],
    'box-shadow': [
      'none',
      'inset 0 0 0 1px var(--pm-border-subtle)',
      '0 1px 2px var(--pm-shadow), inset 0 0 0 1px var(--pm-border-subtle)',
      '0 0 0 calc(infinity * 1px) var(--pm-bg-scrim)',
    ],
    'text-shadow': ['none', '0 1px 2px var(--pm-shadow)'],
    filter: [
      'none',
      'blur(4px) brightness(0.8) contrast(1.2) grayscale(1) hue-rotate(90deg)',
      'invert(1) opacity(0.5) saturate(2) sepia(1)',
      'drop-shadow(0 1px 2px var(--pm-shadow))',
      'url(#grain)',
    ],
    'backdrop-filter': ['none', 'blur(8px) saturate(180%)'],
    'border-image': [
      'none',
      'var(--x) 1 stretch',
      'url(frame.png) 30 fill / 10px / 0 round',
      'url(frame.png) 30 30 repeat space',
      'url(frame.png) 27 / auto',
      'linear-gradient(var(--a), var(--b)) 1',
    ],
    'border-image-source': ['none', 'url(frame.png)', 'linear-gradient(var(--a), var(--b))'],
    'list-style-image': ['none', 'url(dot.png)'],
    caret: ['auto', 'bar', 'block', 'underscore', 'manual var(--pm-accent-bg)'],
  }

  it.each(Object.entries(LAWFUL))('takes every lawful value of `%s`', (property, values) => {
    for (const value of values) expect(refusedColour(property, value), value).toBeNull()
  })

  /** A colour in each property the check reads, with the text the report quotes. */
  const REFUSED: [property: string, value: string, quoted: string][] = [
    ['color', 'red', 'red'],
    ['color', 'RebeccaPurple', 'RebeccaPurple'],
    ['color', 'CanvasText', 'CanvasText'],
    ['color', '-webkit-link', '-webkit-link'],
    ['color', 'var(--pm-text-primary, black)', 'black'],
    ['color', 'color(display-p3 1 0 0)', 'color(display-p3 1 0 0)'],
    ['color', 'device-cmyk(0 1 1 0)', 'device-cmyk(0 1 1 0)'],
    ['color', 'color-mix(in oklch, var(--a), white)', 'color-mix('],
    ['background-color', 'white', 'white'],
    ['border-color', 'currentcolor gray', 'gray'],
    ['border-block-start-color', 'silver', 'silver'],
    ['outline-color', 'Highlight', 'Highlight'],
    ['text-decoration-color', 'crimson', 'crimson'],
    ['caret-color', 'red', 'red'],
    ['accent-color', 'hotpink', 'hotpink'],
    ['scrollbar-color', 'var(--thumb) navy', 'navy'],
    ['-webkit-text-fill-color', 'black', 'black'],
    ['-webkit-tap-highlight-color', 'yellow', 'yellow'],
    ['stop-color', 'teal', 'teal'],
    ['fill', 'tomato', 'tomato'],
    ['fill', 'url(#stripes) black', 'black'],
    ['stroke', 'ButtonText', 'ButtonText'],
    ['--rdg-background-color', 'white', 'white'],
    ['--color', 'black', 'black'],
    ['background', 'red', 'red'],
    ['background', 'url(a.png) no-repeat center / cover white', 'white'],
    ['background', 'linear-gradient(to right, red, blue)', 'red'],
    ['background', 'contrast-color(var(--a))', 'contrast-color('],
    ['background', 'paint(checkerboard, red)', 'red'],
    ['background-image', 'radial-gradient(circle at top, var(--a), navy)', 'navy'],
    ['border', '1px solid black', 'black'],
    ['border-top', 'thin dashed gray', 'gray'],
    ['border-inline-start', '1px solid Canvas', 'Canvas'],
    ['border-block', '1px solid white', 'white'],
    ['outline', '2px solid Highlight', 'Highlight'],
    ['column-rule', '1px solid silver', 'silver'],
    ['text-decoration', 'underline wavy red', 'red'],
    ['text-emphasis', 'filled dot red', 'red'],
    ['-webkit-text-stroke', '1px black', 'black'],
    ['box-shadow', '0 1px 2px black', 'black'],
    ['text-shadow', '0 1px 2px black', 'black'],
    ['filter', 'drop-shadow(0 1px 2px black)', 'black'],
    ['backdrop-filter', 'drop-shadow(0 0 2px white)', 'white'],
    ['border-image', 'linear-gradient(red, blue) 1 stretch', 'red'],
    ['border-image-source', 'linear-gradient(red, blue)', 'red'],
    ['list-style-image', 'linear-gradient(red, blue)', 'red'],
    ['caret', 'bar red', 'red'],
    // A function that makes a colour is refused in every property.
    ['--grid-accent', 'light-dark(white, black)', 'light-dark(white, black)'],
    [
      'mask-image',
      'linear-gradient(color-mix(in srgb, black, white), transparent)',
      'color-mix(in srgb, black, white)',
    ],
  ]

  it.each(REFUSED)('refuses `%s: %s`', (property, value, quoted) => {
    expect(refusedColour(property, value)).toBe(quoted)
  })

  it('holds a lawful value for every word the check takes', () => {
    const written = new Set(
      Object.values(LAWFUL)
        .flat()
        .join(' ')
        .toLowerCase()
        .match(/-?[a-z][\w-]*/g),
    )
    for (const word of COLOURLESS_WORDS) expect(written, word).toContain(word)
  })

  // The check lists no colour. This list is the test's: a word the check takes
  // must never be one of these.
  const NAMED =
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue ' +
    'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk ' +
    'crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki ' +
    'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue ' +
    'dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite ' +
    'gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen ' +
    'lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen ' +
    'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen ' +
    'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream ' +
    'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum ' +
    'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen ' +
    'steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  const SYSTEM =
    'accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext ' +
    'field fieldtext graytext highlight highlighttext linktext mark marktext selecteditem ' +
    'selecteditemtext visitedtext activeborder activecaption appworkspace background ' +
    'buttonhighlight buttonshadow captiontext inactiveborder inactivecaption ' +
    'inactivecaptiontext infobackground infotext menu menutext scrollbar threeddarkshadow ' +
    'threedface threedhighlight threedlightshadow threedshadow window windowframe windowtext'

  it('refuses every named colour and system colour, alone and in a shorthand', () => {
    for (const name of `${NAMED} ${SYSTEM}`.split(' ')) {
      expect(COLOURLESS_WORDS, name).not.toContain(name)
      expect(refusedColour('color', name), name).toBe(name)
      expect(refusedColour('background', `url(a.png) no-repeat ${name}`), name).toBe(name)
      expect(refusedColour('border', `1px solid ${name}`), name).toBe(name)
    }
  })

  it('reads every property that is in one matrix in the other', () => {
    const refused = new Set(REFUSED.map(([property]) => property))
    for (const property of Object.keys(LAWFUL)) expect(refused, property).toContain(property)
  })

  it('takes any word in a property that takes no colour', () => {
    const plain: [property: string, value: string][] = [
      ['display', 'flex'],
      ['cursor', 'pointer'],
      ['font-family', 'serif'],
      ['border-style', 'solid'],
      ['transition', 'color 1s, background-color 1s'],
      ['will-change', 'color'],
      ['color-scheme', 'light dark'],
      ['print-color-adjust', 'exact'],
      ['forced-color-adjust', 'none'],
      ['fill-rule', 'evenodd'],
      ['stroke-linecap', 'round'],
      ['list-style', 'square inside'],
      // A mask's image paints no colour: only its alpha or its luminance is read.
      ['mask', 'linear-gradient(black, transparent) center / contain no-repeat alpha'],
      ['mask-image', 'linear-gradient(to bottom, black, transparent)'],
      ['-webkit-mask-image', 'radial-gradient(circle, white, transparent)'],
    ]
    for (const [property, value] of plain) {
      expect(refusedColour(property, value), `${property}: ${value}`).toBeNull()
    }
  })

  // A name with `color` inside it may hold a mode or a scheme, and a report on
  // one has no lawful answer. Only a name that ends in it is read as a colour's.
  it('reads a custom property as a colour’s only when its name ends in `color`', () => {
    const modes: [property: string, value: string][] = [
      ['--x-color-mode', 'dark'],
      ['--mantine-color-scheme', 'dark'],
      ['--bs-color-scheme', 'light'],
      ['--toastify-color-transition', 'bounce'],
      ['--colorful', 'yes'],
    ]
    for (const [property, value] of modes) {
      expect(refusedColour(property, value), `${property}: ${value}`).toBeNull()
    }
    expect(refusedColour('--ag-header-background-color', 'white')).toBe('white')
    expect(refusedColour('--swiper-theme-colour', 'white')).toBe('white')
  })
})
