import {
  cond,
  describeMember,
  each,
  el,
  fx,
  identity,
  lit,
  member,
  portal,
  run,
  slot,
  text,
} from '../dsl'

/** A picture of one colour field with a sun and a ridge, at the size given, as React's fixture draws it. */
const scene = (width: number, height: number, sky: string, ground: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="${width}" height="${height}" fill="${sky}"/>` +
      `<circle cx="${width * 0.72}" cy="${height * 0.34}" r="${Math.min(width, height) * 0.12}" fill="#f2c879"/>` +
      `<path d="M0 ${height}V${height * 0.7}L${width * 0.25} ${height * 0.48}l${width * 0.22} ${height * 0.27} ${width * 0.2}-${height * 0.2} ${width * 0.33} ${height * 0.29}V${height}z" fill="${ground}"/>` +
      '</svg>',
  )

const PREVIEW = {
  src: scene(960, 600, '#2f4a6b', '#1c2f47'),
  alt: 'The checkout page with an error banner over the payment form',
}

const SET = [
  { src: scene(1200, 800, '#2f4a6b', '#1c2f47'), alt: 'A harbour at dusk' },
  { src: scene(800, 1000, '#3b5d3a', '#1f331e'), alt: 'A pine ridge in the morning' },
  { src: scene(1200, 900, '#6b3f2f', '#3a2018'), alt: 'Red cliffs over a dry river' },
]

const WIDE = {
  src: scene(2400, 900, '#2f4a6b', '#1c2f47'),
  alt: 'A panorama of the harbour from the north wall',
}

const TALL = {
  src: scene(600, 1600, '#3b5d3a', '#1f331e'),
  alt: 'The settings screen on a phone, scrolled to the bottom',
}

const view = (label: string) => [fx('Button', { variant: 'outline', tone: 'neutral', label })]

const ghost = { variant: lit('ghost'), tone: lit('neutral'), size: lit('sm'), iconOnly: 'true' }

/** A travel Button's part, by its name, as `focusAfterMove` finds it. */
const TRAVEL = (part: 'previous' | 'next') =>
  `panel.querySelector<HTMLButtonElement>('[data-lightbox-part="${part}"] button')`

/**
 * Lightbox (`design/components/lightbox.md`): a picture opened large over the
 * page, fitted inside the window, with previous and next when there are
 * several. It is a positioned Dialog variant, here as in React: Dialog's
 * machine, so its focus trap, focus on close, focus return, Escape and the
 * press outside, and Dialog's scrim and presence, with a panel of its own that
 * fills the window. Each picture is an Image.
 *
 * The member holds what React's member holds and the machine does not: the
 * position, mirrored while the app does not control it, the arrow keys, read
 * by the page's direction, and where focus goes when a travel Button that has
 * it is disabled at an end.
 */
export default describeMember({
  member: 'Lightbox',
  dir: 'overlays',
  recipe: 'overlays/lightbox',
  types: {
    LightboxImage: '{ src: string; alt: string }',
    // `position` counts from 1: "2 of 5".
    LightboxMessages:
      '{ close: string; previous: string; next: string; position: (position: number, count: number) => string }',
  },
  defaults: {
    defaultIndex: '0',
    messages:
      "() => ({ close: 'Close', previous: 'Previous picture', next: 'Next picture', position: (position, count) => `${position} of ${count}` })",
  },
  state: {
    // The control whose press opened the panel, as in Dialog: focus returns to it.
    opener: 'null as HTMLElement | null',
    // The picture shown while the app does not control the position.
    mirror: 'defaultIndex',
  },
  machine: {
    of: 'dialog',
    context: {
      // An empty list has nothing to show, so the panel never opens for it.
      open: 'open === undefined ? undefined : open && images.length > 0',
      defaultOpen: 'defaultOpen === undefined ? undefined : defaultOpen && images.length > 0',
      // Dialog's focus order. The panel has no body control and no footer, so it is close.
      initialFocusEl: "() => modalFocusTarget(panel, 'primary')",
      finalFocusEl: '() => opener',
    },
    events: { onOpenChange: { emit: 'openChange', payload: 'details.open' } },
  },
  derived: {
    within: '(at: number) => Math.min(Math.max(at, 0), Math.max(images.length - 1, 0))',
    // The picture shown: the app's `index`, else the mirror, clamped to the list.
    shown: 'within(index ?? mirror)',
    several: 'images.length > 1',
    // The picture as a list of one, keyed by its position, so a picture that is still
    // arriving never shows the last one in its place.
    current: 'images.slice(shown, shown + 1)',
    openFrom: `(event?: Event) => {
      if (images.length === 0) return
      if (event?.currentTarget instanceof HTMLElement) opener = event.currentTarget
      api.setOpen(true)
    }`,
    // A move the reader asks for: the mirror follows it, and the app hears it.
    travel:
      "(to: number) => { if (to < 0 || to >= images.length || to === shown) return; mirror = to; emit('indexChange', to) }",
    // ArrowLeft and ArrowRight by the page's direction; a key with a modifier is left alone.
    keyDown:
      "(event: KeyboardEvent) => { if (!several || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return; const rtl = getComputedStyle(event.currentTarget as HTMLElement).direction === 'rtl'; const forward = rtl ? 'ArrowLeft' : 'ArrowRight'; const back = rtl ? 'ArrowRight' : 'ArrowLeft'; if (event.key !== forward && event.key !== back) return; event.preventDefault(); travel(event.key === forward ? shown + 1 : shown - 1) }",
    // A browser takes focus from a Button as it is disabled: Firefox and WebKit leave it on
    // the disabled Button, and Chromium on the page. Either way it goes to the other travel
    // Button, which the move has enabled.
    focusAfterMove: `() => { if (panel === null) return; const previous = ${TRAVEL('previous')}; const next = ${TRAVEL('next')}; const active = document.activeElement; const lost = active === null || active === document.body || ((active === previous || active === next) && (active as HTMLButtonElement).disabled); if (!lost) return; const other = [previous, next].find((button) => button !== null && !button.disabled); other?.focus() }`,
  },
  effects: [{ watch: 'shown', mount: false, run: 'focusAfterMove()' }],
  // The spec's `agent` fence. A move goes through `travel` and a close through the machine, so
  // the member reports `indexChange` and `openChange` as it does for a person's controls. A move
  // is refused where its control is disabled or absent. The panel names the lightbox, and it is
  // withheld, because every control in it is the lightbox's own.
  agent: {
    on: 'panel',
    state: {
      open: 'api.open',
      index: 'shown',
      images: 'images.map((image) => ({ alt: image.alt }))',
    },
    actions: {
      close: 'api.open && api.setOpen(false)',
      next: `(() => {
        if (!api.open) throw new Error('The lightbox is closed.')
        if (shown === images.length - 1) throw new Error('This is the last picture.')
        travel(shown + 1)
      })()`,
      previous: `(() => {
        if (!api.open) throw new Error('The lightbox is closed.')
        if (shown === 0) throw new Error('This is the first picture.')
        travel(shown - 1)
      })()`,
    },
    withholds: 'panel',
  },
  presence: {
    scrimPresent: { open: 'api.open', ref: 'scrim', binding: 'dialog.scrim' },
    panelPresent: { open: 'api.open', ref: 'panel', binding: 'dialog.panel' },
  },
  template: [
    // The caller's control opens the panel; it receives the click handler, as React clones it.
    slot('trigger', { pass: { onClick: 'openFrom' } }),
    portal(
      cond('scrimPresent', [
        el('div', {
          part: 'scrim',
          class: ['scrim'],
          spread: ['api.getBackdropProps()'],
          // Present through the exit, which `hidden` would cut short.
          attrs: { hidden: 'undefined' },
          // The machine reads a press inside the panel's box as a press inside the panel, and
          // this panel's box is the window, so it hears no press outside. A press beside the
          // picture lands on the scrim, which closes the lightbox, as Radix's press outside
          // closes React's.
          on: { click: run('api.setOpen(false)') },
          ref: 'scrim',
        }),
      ]),
      cond('panelPresent', [
        el('div', { class: ['positioner'], spread: ['api.getPositionerProps()'] }, [
          el(
            'div',
            {
              part: 'panel',
              class: ['panel'],
              spread: ['api.getContentProps()'],
              attrs: { hidden: 'undefined', ...identity('Lightbox') },
              on: { keydown: run('keyDown($event)') },
              ref: 'panel',
            },
            [
              el('h2', { part: 'title', class: ['title'], spread: ['api.getTitleProps()'] }, [
                text('label'),
              ]),
              el('div', { part: 'stage', class: ['stage'] }, [
                each('current', 'picture', 'shown', [
                  member('Image', {
                    src: 'picture.src',
                    alt: 'picture.alt',
                    loading: lit('eager'),
                  }),
                ]),
              ]),
              cond('several', [
                el(
                  'div',
                  {
                    part: 'previous',
                    class: ['previous'],
                    attrs: { 'data-lightbox-part': lit('previous') },
                  },
                  [
                    member(
                      'Button',
                      {
                        ...ghost,
                        icon: lit('previous'),
                        label: 'messages.previous',
                        disabled: 'shown === 0',
                      },
                      { on: { click: run('travel(shown - 1)') } },
                    ),
                  ],
                ),
                el(
                  'div',
                  { part: 'next', class: ['next'], attrs: { 'data-lightbox-part': lit('next') } },
                  [
                    member(
                      'Button',
                      {
                        ...ghost,
                        icon: lit('next'),
                        label: 'messages.next',
                        disabled: 'shown === images.length - 1',
                      },
                      { on: { click: run('travel(shown + 1)') } },
                    ),
                  ],
                ),
                el('p', { part: 'position', class: ['position'], attrs: { role: lit('status') } }, [
                  text('messages.position(shown + 1, images.length)'),
                ]),
              ]),
              el(
                'div',
                { part: 'close', class: ['close'], attrs: { 'data-dialog-part': lit('close') } },
                [
                  member(
                    'Button',
                    { ...ghost, icon: lit('close'), label: 'messages.close' },
                    { on: { click: run('api.setOpen(false)') } },
                  ),
                ],
              ),
            ],
          ),
        ]),
      ]),
    ),
  ],
  states: [
    {
      name: 'one picture — no previous, next or position',
      props: { label: 'Attachment preview', images: [PREVIEW] },
      slots: { trigger: view('View the preview') },
    },
    {
      name: 'open — the second of three pictures',
      props: { defaultOpen: true, defaultIndex: 1, label: 'Photographs', images: SET },
      slots: { trigger: view('View the photographs') },
    },
    {
      name: 'several pictures',
      props: { label: 'Photographs', images: SET },
      slots: { trigger: view('View the photographs') },
    },
    {
      name: 'a wide picture — fitted by its width',
      props: { label: 'Panorama', images: [WIDE] },
      slots: { trigger: view('View the panorama') },
    },
    {
      name: 'a tall picture — fitted by its height',
      props: { label: 'Phone screenshot', images: [TALL] },
      slots: { trigger: view('View the screenshot') },
    },
    {
      name: 'a picture that fails — Image’s fallback',
      props: {
        label: 'Attachment preview',
        images: [{ src: '', alt: 'The preview of the uploaded receipt' }],
      },
      slots: { trigger: view('View the receipt') },
    },
  ],
})
