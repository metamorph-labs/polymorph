import { describeMember, el, identity, lit, run, slot } from '../dsl'

/** Arrow steps in ratio space: 2 of 100 per press, 10 per page. */
const STEP = 0.02
const PAGE_STEP = 0.1

/** A value held to 0–1, as an expression. */
const unit = (value: string) => `Math.min(1, Math.max(0, ${value}))`

/**
 * React's FixtureBox, tall: filler a pane can hold without another member's
 * recipe, drawn by the fixture-box recipe the React fixture uses.
 */
const pane = (name: string) => ({
  element: 'span',
  class: ['box.box'],
  attrs: { 'data-tall': '' },
  children: [name],
})

/**
 * SplitPane (`design/components/split-pane.md`): two regions on one axis,
 * resized by a divider the reader drags or steps by keyboard. No machine fits
 * it, as no substrate fits the React member: a grid, a separator and the WAI
 * window-splitter keys, written here as handlers.
 *
 * The unit is a ratio. The px floors are converted to ratio space over the
 * measured box, kept current by a ResizeObserver, so the separator publishes
 * and clamps to the bounds `minmax()` paints. `latest` is the value a release
 * commits: the last position a move reached, which a controlled caller may not
 * have taken yet, re-read whenever the ratio changes.
 */
export default describeMember({
  member: 'SplitPane',
  dir: 'layout',
  recipe: 'layout/split-pane',
  types: {
    SplitPaneOrientation: "NonNullable<SplitPaneProps['orientation']>",
  },
  recipes: { box: 'conventions/fixture-box' },
  defaults: { orientation: lit('horizontal'), defaultRatio: '0.5', startMin: '0', endMin: '0' },
  state: {
    // Mirrored, not owned, as in Slider: an uncontrolled pane still publishes its value.
    mirror: unit('defaultRatio'),
    dragging: 'false',
    bounds: '{ min: 0, max: 1 }',
    latest: unit('ratio ?? defaultRatio'),
  },
  derived: {
    horizontal: "orientation === 'horizontal'",
    current: unit('ratio ?? mirror'),
    clamp: '(value: number) => Math.min(bounds.max, Math.max(bounds.min, value))',
    effective: 'clamp(current)',
    startId: '`${uid}-start`',
    // Rounded to four decimals, so 2% steps land on 2% marks and not on floating-point error.
    move: `(next: number) => { const clamped = Math.round(clamp(${unit('next')}) * 10000) / 10000; if (clamped === latest) return; latest = clamped; mirror = clamped; emit('ratioChange', clamped) }`,
    // The floors in ratio space over the box less the divider. In a box too small for both
    // floors, or before one is measured, the bounds are the whole range; `minmax()` still
    // draws the floors.
    measure: `() => { if (root === null) return; const box = root.getBoundingClientRect(); const line = divider?.getBoundingClientRect(); const usable = (horizontal ? box.width : box.height) - (line === undefined ? 0 : horizontal ? line.width : line.height); if (usable <= 0 || startMin + endMin >= usable) { bounds = { min: 0, max: 1 }; return } bounds = { min: ${unit('startMin / usable')}, max: ${unit('1 - endMin / usable')} } }`,
    // One pointer, captured, so the divider follows it wherever it goes. A pointer that lifted
    // before this ran cannot be captured; the drag starts either way.
    pointerDown:
      '(event: PointerEvent) => { try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId) } catch { /* an inactive pointer: nothing to capture */ } dragging = true }',
    // Each move reads the live box, so a container that resizes mid-drag cannot leave the
    // divider behind. The divider's centre is the position under the pointer.
    pointerMove:
      "(event: PointerEvent) => { if (!dragging || root === null) return; const box = root.getBoundingClientRect(); const handle = (event.currentTarget as HTMLElement).getBoundingClientRect(); const thickness = horizontal ? handle.width : handle.height; const usable = (horizontal ? box.width : box.height) - thickness; if (usable <= 0) return; const rtl = horizontal && getComputedStyle(root).direction === 'rtl'; const along = horizontal ? (rtl ? box.right - event.clientX : event.clientX - box.left) : event.clientY - box.top; move((along - thickness / 2) / usable) }",
    pointerUp:
      "(event: PointerEvent) => { if (!dragging) return; const target = event.currentTarget as HTMLElement; if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId); dragging = false; emit('commit', latest) }",
    // The window-splitter keys, on the split axis only: the cross-axis arrows do nothing, so a
    // reader can scroll past. Every step commits, because a keyboard step is also a release.
    keyDown: `(event: KeyboardEvent) => { const rtl = horizontal && getComputedStyle(event.currentTarget as HTMLElement).direction === 'rtl'; const grow = horizontal ? (rtl ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown'; const shrink = horizontal ? (rtl ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp'; let next: number; switch (event.key) { case grow: next = current + ${STEP}; break; case shrink: next = current - ${STEP}; break; case 'PageUp': next = current + ${PAGE_STEP}; break; case 'PageDown': next = current - ${PAGE_STEP}; break; case 'Home': next = bounds.min; break; case 'End': next = bounds.max; break; default: return } event.preventDefault(); move(next); emit('commit', latest) }`,
  },
  effects: [
    // The same floors are a different ratio in every container, so a resize measures again.
    { run: 'measure()', watch: '[orientation, startMin, endMin]', resize: ['root'] },
    // A ratio the caller sets is the value the next release commits.
    { run: 'latest = current', watch: 'current', mount: false },
  ],
  // The spec's `agent` fence. The position is the start pane's share in percent, as the
  // separator reports it, and `set` moves the divider as a drag does and commits, as a key press
  // does, within the same bounds.
  agent: {
    on: 'divider',
    state: { position: 'Math.round(effective * 100)' },
    actions: {
      set: {
        argument: 'number',
        run: `(() => {
          move(value / 100)
          emit('commit', latest)
        })()`,
      },
    },
  },
  template: el(
    'div',
    {
      part: 'root',
      class: ['root'],
      ref: 'root',
      attrs: { 'data-orientation': 'orientation', ...identity('SplitPane') },
      // The ratio as an `fr` pair and the floors as px: data the recipe's tracks read.
      geometry: {
        '--pm-split-start': '`${effective}fr`',
        '--pm-split-end': '`${1 - effective}fr`',
        '--pm-split-start-min': '`${startMin}px`',
        '--pm-split-end-min': '`${endMin}px`',
      },
    },
    [
      el('div', { part: 'start', class: ['pane'], attrs: { id: 'startId' } }, [slot('start')]),
      el('div', {
        part: 'divider',
        class: ['divider'],
        ref: 'divider',
        attrs: {
          'data-split-pane-part': lit('divider'),
          role: lit('separator'),
          tabindex: lit('0'),
          'aria-label': 'label',
          // ARIA names the divider line's axis, the opposite word from `orientation`.
          'aria-orientation': "horizontal ? 'vertical' : 'horizontal'",
          'aria-controls': 'startId',
          'aria-valuenow': 'Math.round(effective * 100)',
          'aria-valuemin': 'Math.round(bounds.min * 100)',
          'aria-valuemax': 'Math.round(bounds.max * 100)',
          'data-state': "dragging ? 'dragging' : undefined",
        },
        on: {
          pointerdown: run('pointerDown($event)'),
          pointermove: run('pointerMove($event)'),
          pointerup: run('pointerUp($event)'),
          pointercancel: run('pointerUp($event)'),
          keydown: run('keyDown($event)'),
        },
      }),
      el('div', { part: 'end', class: ['pane'] }, [slot('end')]),
    ],
  ),
  states: [
    {
      name: 'even — the default apportionment',
      props: { label: 'Resize navigator' },
      slots: { start: [pane('navigator')], end: [pane('canvas')] },
    },
    {
      name: 'apportioned — a narrow start pane',
      props: { label: 'Resize navigator', defaultRatio: 0.3 },
      slots: { start: [pane('navigator')], end: [pane('canvas')] },
    },
    {
      name: 'floors — minmax holds what the ratio cannot',
      props: { label: 'Resize navigator', startMin: 160, endMin: 160 },
      slots: { start: [pane('navigator')], end: [pane('canvas')] },
    },
    {
      // Inside a fixed-height box, as the React entry is: a stacked split
      // divides the height its container gives it.
      name: 'stacked — request above response',
      many: {
        within: { element: 'div', class: ['harness'] },
        each: [
          {
            props: { label: 'Resize response', orientation: 'vertical' },
            slots: { start: [pane('request')], end: [pane('response')] },
          },
        ],
      },
    },
    {
      name: 'controlled — the app owns the ratio',
      props: { label: 'Resize navigator', ratio: 0.66 },
      slots: { start: [pane('navigator')], end: [pane('canvas')] },
    },
  ],
})
