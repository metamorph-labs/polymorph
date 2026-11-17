#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { capture, openStudio, PHONE, PORT, resetShots, run } from './shoot.mjs'

/**
 * `pnpm proof` performs the guarantees `docs/verification.md` describes and
 * writes their evidence to `proof/shots/`.
 *
 * Each churn below is performed on every run, not recorded once. The zone it
 * claims never changes is hashed, the edit is applied to the decision layer, the
 * suite runs against it, the zone is hashed again, the result is captured, and
 * the edit is reverted. On a re-run, either the claims hold or the script names
 * the one that stopped holding.
 *
 * The phone lane is not a churn. It re-shoots a representative slice at 375×812
 * and measures what a screenshot cannot be trusted to show: that nothing
 * scrolls sideways and no control crosses an edge. It is measured rather than
 * photographed for the same reason as `legibleAtNone`. A scene that fails it
 * fails the run.
 *
 * Reverting is a **content restore**: every file a churn declares is read before
 * the edit and written back after it, byte for byte. It does not use
 * `git checkout --`, which has the same flaw a `git status` zone measurement
 * would have (see `snapshot`). It answers "what does HEAD say?" when the
 * question is "what did this churn change?". With work in progress those
 * differ in both directions. A decision file with uncommitted new content would
 * be reverted to its old content, and an untracked one would not be reverted at
 * all (checkout fails on a pathspec git has never seen). Because nothing here
 * is destructive, the script also runs on a dirty tree.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SHOTS = resolve(ROOT, 'proof/shots')

const read = (file) => readFileSync(resolve(ROOT, file), 'utf8')
const write = (file, text) => writeFileSync(resolve(ROOT, file), text)

/** An edit that must match, because otherwise the churn would silently test nothing. */
function edit(file, from, to) {
  const before = read(file)
  if (!before.includes(from)) {
    throw new Error(`proof: ${file} no longer contains the text this churn edits:\n  ${from}`)
  }
  write(file, before.replace(from, to))
}

/**
 * A pairing, as set on the DOM: a scene names a system and a palette
 * (`docs/theming.md`).
 *
 * Every scene below pairs a system with its own `defaultPalette`, because those
 * pairings are in the eager sheet, one block each. A scene naming a
 * cross-pairing would capture a document with a pair no CSS block matches.
 * `ensurePairing` belongs to the app and is called by its pickers, and setting
 * the attributes by hand bypasses it. That is intended, because a scene that
 * drove the picker would be testing the picker.
 */
const pairing = (system, palette) => ({ 'data-system': system, 'data-palette': palette })

/**
 * The scenes. Three screens across every house system and both modes, plus the
 * two motion extremes and the states that only exist while something is open.
 */
const OVERLAY_SCENE = {
  route: '/relay/new',
  act: async (page) => {
    await page.getByLabel('Subject').fill('Webhook retries stop after the first 5xx')
    await page.getByRole('button', { name: 'Discard' }).first().click()
  },
}

/**
 * The command bar, opened as a user opens it.
 *
 * `ControlOrMeta` rather than `Meta`: the binding accepts either modifier
 * because products do, and a proof that only worked on a Mac would prove
 * something only about this laptop.
 *
 * The constant and its shots use the full name because *palette* has a second
 * meaning everywhere in this file. With the short name, a reader would look for
 * colours in `palette-keywords.png`.
 */
const COMMAND_PALETTE_SCENE = {
  route: '/relay',
  act: async (page) => {
    await page.keyboard.press('ControlOrMeta+k')
    await page.waitForSelector('[role="dialog"]')
  },
}

/**
 * A chart gallery scene.
 *
 * A gallery page opens on its own header and the member index, but these shots
 * are for the marks. So these scenes scroll the first fixture to the top of the
 * viewport before the shot, keeping its name in frame. `scrollY` gives a
 * distance instead, for a scene whose subject is not a single chart frame.
 */
const chartScene = (route, attrs, scrollY) => ({
  route,
  attrs,
  act: async (page) => {
    await page.evaluate((to) => {
      const root = document.scrollingElement
      if (root === null) return
      if (to !== undefined) {
        root.scrollTop = to
        return
      }
      // The chart frame is a `figure`, and the gallery's entry heading sits just
      // above it. 180px also clears the sticky topbar. At 120 the heading lands
      // under the topbar and is cut in half.
      const figure = document.querySelector('figure')
      // Throws rather than silently shooting the top of the page. A member with
      // no frame (Sparkline, which has no axes) passes a distance in `scrollY`.
      if (figure === null) throw new Error('no chart frame on this page; pass scrollY')
      root.scrollTop = figure.getBoundingClientRect().top + root.scrollTop - 180
    }, scrollY)
  },
})

const FLAGSHIP_LIGHT = { 'data-system': 'plain', 'data-palette': 'neutral', 'data-mode': 'light' }
const EMBER_LIGHT = { 'data-system': 'harbor', 'data-palette': 'ember', 'data-mode': 'light' }

const BASELINE_SCENES = {
  // The flagship system, and the default the product opens in. Both modes,
  // because the ink budget's one inversion exists only in dark mode. At
  // `chromaBudget: none` the primary fill is ink in light and near-white in
  // dark, so a single frame would show only half of what neutral does.
  'inbox-plain-light': {
    route: '/relay',
    attrs: { ...pairing('plain', 'neutral'), 'data-mode': 'light' },
  },
  'inbox-plain-dark': {
    route: '/relay',
    attrs: { ...pairing('plain', 'neutral'), 'data-mode': 'dark' },
  },

  'inbox-pastel-light': {
    route: '/relay',
    attrs: { ...pairing('pastel', 'amethyst'), 'data-mode': 'light' },
  },
  'inbox-pastel-dark': {
    route: '/relay',
    attrs: { ...pairing('pastel', 'amethyst'), 'data-mode': 'dark' },
  },
  'inbox-terminal-dark': {
    route: '/relay',
    attrs: { ...pairing('terminal', 'petrol'), 'data-mode': 'dark' },
  },
  'inbox-harbor-light': {
    route: '/relay',
    attrs: { ...pairing('harbor', 'ember'), 'data-mode': 'light' },
  },
  'inbox-harbor-dark': {
    route: '/relay',
    attrs: { ...pairing('harbor', 'ember'), 'data-mode': 'dark' },
  },

  // Three more systems, one frame each of the same DOM. The two-theme test is
  // only as strong as the number of systems it covers, so it covers every
  // system the repo ships, each in its own palette.
  'inbox-journal-light': {
    route: '/relay',
    attrs: { ...pairing('journal', 'umber'), 'data-mode': 'light' },
  },
  'inbox-press-light': {
    route: '/relay',
    attrs: { ...pairing('press', 'carmine'), 'data-mode': 'light' },
  },
  'inbox-pop-dark': {
    route: '/relay',
    attrs: { ...pairing('pop', 'orchid'), 'data-mode': 'dark' },
  },

  // The three calibrated registers, each in its default pairing. `pebble` and
  // `desktop` are worth shooting together because their paint is identical: both
  // declare `azure`, and every colour token they resolve is byte-identical. The
  // two frames can differ only in geometry, density and motion, which is the
  // clearest demonstration of the system/palette split.
  'inbox-pebble-light': {
    route: '/relay',
    attrs: { ...pairing('pebble', 'azure'), 'data-mode': 'light' },
  },
  'inbox-desktop-light': {
    route: '/relay',
    attrs: { ...pairing('desktop', 'azure'), 'data-mode': 'light' },
  },
  'inbox-flint-light': {
    route: '/relay',
    attrs: { ...pairing('flint', 'cobalt'), 'data-mode': 'light' },
  },

  // Glassmorphic, which expresses depth as a translucent material. A resting
  // inbox does not show the glass, so besides the catalogue frame, two scenes
  // open the command palette and let the pane blur the rows behind it. Both
  // modes, because the mix is a per-mode law (96%/91%). Dark glass is measurably
  // more translucent, and only a pair of frames shows that.
  'inbox-glassmorphic-light': {
    route: '/relay',
    attrs: { ...pairing('glassmorphic', 'azure'), 'data-mode': 'light' },
  },
  'glass-glassmorphic-light': {
    route: '/relay',
    attrs: { ...pairing('glassmorphic', 'azure'), 'data-mode': 'light' },
    act: async (page) => {
      await COMMAND_PALETTE_SCENE.act(page)
    },
  },
  'glass-glassmorphic-dark': {
    route: '/relay',
    attrs: { ...pairing('glassmorphic', 'azure'), 'data-mode': 'dark' },
    act: async (page) => {
      await COMMAND_PALETTE_SCENE.act(page)
    },
  },

  /*
   * The page exemplars: whole page types beyond the ticketing demo. Two frames,
   * chosen for what only they show. The analytics dashboard is the chart tier
   * inside an archetype (and under glass, the material behind real panels). The
   * billing settings page is the settings row layout on journal's paper
   * surface. The other four exemplars make the same zero-CSS claim and are
   * covered by the same red rules, so they are left out to keep the proof short.
   */
  'pages-analytics-glassmorphic-light': {
    route: '/pages/analytics',
    attrs: { ...pairing('glassmorphic', 'azure'), 'data-mode': 'light' },
  },
  'pages-billing-journal-dark': {
    route: '/pages/billing',
    attrs: { ...pairing('journal', 'umber'), 'data-mode': 'dark' },
  },

  /*
   * The blocks bar for charts. This is a capture lane, not a claim: a reviewer
   * compares these frames with the canonical wheel's own values.
   *
   * Shot under **plain/neutral** on purpose. `neutral` is achromatic, and an
   * achromatic palette has no anchor to rotate the chart wheel onto, so it
   * takes the canonical wheel, derived from four ordinary seed fields. These
   * frames therefore show the canonical colours on this vocabulary's marks,
   * which makes the side-by-side a fair one.
   *
   * One frame per member, at the top of its gallery, where each fixture's first
   * entry is its main composition. Plus the panel, which is what a block is: a
   * chart inside a titled surface it does not own.
   */
  'charts-bar-plain': chartScene('/gallery/bar-chart', FLAGSHIP_LIGHT),
  'charts-line-plain': chartScene('/gallery/line-chart', FLAGSHIP_LIGHT),
  'charts-area-plain': chartScene('/gallery/area-chart', FLAGSHIP_LIGHT),
  'charts-heatmap-plain': chartScene('/gallery/heatmap', FLAGSHIP_LIGHT),
  'charts-donut-plain': chartScene('/gallery/donut-chart', FLAGSHIP_LIGHT),
  // The sparkline has no frame to anchor on, because it has no axes. This scene
  // gives a distance and shows several at once, which matches how a sparkline
  // is read: beside a number, not alone.
  'charts-sparkline-plain': chartScene('/gallery/sparkline', FLAGSHIP_LIGHT, 700),
  // The composition, in dark mode. The dark wheel is the light one re-lit, not
  // a second set of hues, and only a dark frame shows that. Anchored by
  // distance rather than by the frame, because the block here is a stat row and
  // a panel, and scrolling to the chart would crop half of it.
  'charts-panel-plain-dark': chartScene(
    '/gallery/dashboard',
    { ...pairing('plain', 'neutral'), 'data-mode': 'dark' },
    620,
  ),

  // The before frame for churn g. A hued palette, because rotating an
  // achromatic palette's `accentHue` changes nothing: the wheel has no anchor.
  'charts-donut-ember': chartScene('/gallery/donut-chart', EMBER_LIGHT),

  'form-pastel-light': {
    route: '/relay/new',
    attrs: { ...pairing('pastel', 'amethyst'), 'data-mode': 'light' },
  },
  'settings-terminal-dark': {
    route: '/relay/settings',
    attrs: { ...pairing('terminal', 'petrol'), 'data-mode': 'dark' },
  },

  // The command bar twice: once whole, and once mid-query. Only the second
  // frame shows that a command can be found by a word it does not contain.
  'command-palette-pastel-dark': {
    ...COMMAND_PALETTE_SCENE,
    attrs: { ...pairing('pastel', 'amethyst'), 'data-mode': 'dark' },
  },
  'command-palette-keywords': {
    route: '/relay',
    attrs: { ...pairing('pastel', 'amethyst'), 'data-mode': 'dark' },
    act: async (page) => {
      await COMMAND_PALETTE_SCENE.act(page)
      await page.keyboard.type('appear')
    },
  },

  // Motion (churn c). Only the scope attribute differs, and `none` must leave
  // every state readable, not only still.
  'overlay-motion-expressive': { ...OVERLAY_SCENE, attrs: { 'data-motion': 'expressive' } },
  'overlay-motion-none': { ...OVERLAY_SCENE, attrs: { 'data-motion': 'none' } },
  'inbox-motion-none': { route: '/relay', attrs: { 'data-motion': 'none' } },

  // Density, which is the other scope a screen can be re-scoped by.
  'inbox-density-comfortable': { route: '/relay', attrs: { 'data-density': 'comfortable' } },
}

/**
 * The phone lane (`docs/layout.md`, the phone register).
 *
 * The same pipeline at 375×812, with shots named `phone-*`. The set is a
 * representative slice rather than the whole gallery list: a control, Hero, the
 * two table members and four page archetypes from the galleries, then the
 * overlays and the two Relay screens from the product. These are members whose
 * layout adapts at phone width.
 *
 * **Three of them are shot in Relay because a gallery cannot show their
 * behaviour.** A page archetype's narrow step is a container query, and a
 * container query is answered by an ancestor container, which for a page is
 * AppShell's content region. A bare gallery has no shell, so the padding never
 * steps and the drawer topbar never appears. The gallery shots show the
 * members adapting, and the Relay shots are the only place the shell-scoped
 * half of the layout rules is visible. The overlay has its own reason, below.
 *
 * No pairing is named. This lane is about geometry, so a bare scene using
 * whatever `design/defaults.json` says is the right frame. A pairing here would
 * only capture colour a second time.
 *
 * **The lane grows with the tier.** A member added to a tier that adapts joins
 * the lane in the same change. Hero is the example. It sits at the top of the
 * display scale, and the phone is where the top of a type scale causes
 * problems (a hero title can clip at 390px). Otherwise the lane would only
 * record where the last review found a fault, instead of guarding against the
 * next one.
 */
/**
 * A sheet has arrived when its bottom edge meets the viewport's bottom edge.
 * This checks the sheet presentation's geometry (`docs/layout.md`, sheets), not
 * its mount. The panel mounts at `translateY(100%)` and moves in on a spring,
 * so waiting on the selector alone can capture it still rising from the bottom
 * edge on a loaded machine.
 */
function sheetArrived(page) {
  return page.waitForFunction(() => {
    const sheet = document.querySelector('[data-presentation="sheet"]')
    if (sheet === null) return false
    const box = sheet.getBoundingClientRect()
    // `clientHeight`, the same edge `fitsThePhone` measures against.
    return Math.abs(box.bottom - document.documentElement.clientHeight) < 2
  })
}

const PHONE_SCENES = {
  'phone-button': { route: '/gallery/button' },
  'phone-hero': { route: '/gallery/hero' },
  'phone-table': { route: '/gallery/table' },
  'phone-data-table': { route: '/gallery/data-table' },
  'phone-form-page': { route: '/gallery/form-page' },
  'phone-list-page': { route: '/gallery/list-page' },
  'phone-dashboard': { route: '/gallery/dashboard' },
  'phone-auth-page': { route: '/gallery/auth-page' },
  'phone-conversation-page': { route: '/gallery/conversation-page' },
  'phone-master-detail-page': { route: '/gallery/master-detail-page' },
  /*
   * The sheet, shot in Relay rather than in `/gallery/dialog` because the
   * gallery shot does not work.
   *
   * A Dialog is portalled to the document with no z-index of its own. It paints
   * above the page because it comes last. That holds in a product but not in
   * the workbench, whose toolbar is `position: sticky; z-index: 10`. At desktop
   * width this does not matter, because the panel is a card in the middle of the
   * screen. At 375 the panel covers the whole screen, so the workbench toolbar
   * paints over the panel it is meant to display and the frame shows a blank
   * white rectangle. Relay has no such chrome, and a sheet over a real screen is
   * a better picture anyway.
   */
  'phone-dialog': {
    ...OVERLAY_SCENE,
    settleMs: 900,
  },
  /*
   * The overlay slice (`docs/layout.md`, sheets): an open menu, select, picker
   * and toast at phone width, where the sheet register and the Toaster's phone
   * geometry apply. Shot in Relay for phone-dialog's reason, which applies more
   * strongly here. A gallery page renders every `defaultOpen` fixture at once,
   * which at 375 stacks all of a member's open sheets on the same bottom edge.
   * The workbench also mounts no `<Toaster />` outside the toast fixture. Relay
   * routes have no workbench chrome, and a sheet over a real screen is a better
   * picture anyway.
   *
   * Each sheet act waits for arrival (the panel's bottom edge meeting the
   * viewport), not for mount. The panel mounts off-screen and moves in on a
   * spring, and on a loaded machine a fixed settle after mount can capture the
   * menu sheet still rising from the bottom edge. The settle after arrival is
   * for paint (the scrim's fade, the item cascade) and uses the phone-dialog
   * constant.
   */
  'phone-menu-sheet': {
    route: '/relay',
    act: async (page) => {
      // The account menu is in the sidebar, which is a drawer at phone width,
      // so the scene follows a user's path: drawer, then menu.
      await page.getByRole('button', { name: 'Open navigation' }).click()
      await page.getByRole('button', { name: 'Account' }).click()
      await sheetArrived(page)
    },
    settleMs: 900,
  },
  'phone-select-sheet': {
    route: '/relay/settings',
    act: async (page) => {
      await page.getByRole('combobox', { name: 'System' }).click()
      await sheetArrived(page)
    },
    settleMs: 900,
  },
  'phone-date-picker-sheet': {
    route: '/relay/new',
    act: async (page) => {
      await page.getByRole('button', { name: 'Show calendar' }).click()
      await sheetArrived(page)
    },
    settleMs: 900,
  },
  'phone-toast': {
    route: '/relay/settings',
    act: async (page) => {
      // One switch toggle raises `toast.success` in the phone register: full
      // width above the safe area, as `design/components/toast.md` specifies.
      await page.getByRole('switch', { name: 'Daily digest' }).click()
      await page.waitForSelector('li[data-tone]')
    },
  },
  'phone-relay-inbox': { route: '/relay' },
  'phone-relay-new': { route: '/relay/new' },
}

/**
 * The phone lane's assertion. This is the actual check. The shots are what a
 * reader compares the claim against, not the claim itself.
 *
 * "No horizontal viewport scroll, no clipped control" is three measurements:
 *
 * 1. The document does not scroll sideways. Measured against
 *    `documentElement.clientWidth`, which equals `window.innerWidth` or is 15px
 *    smaller. `innerWidth` includes the classic scrollbar, so comparing against
 *    it would allow a scrollbar's width of slack and miss the `100vw` mistake.
 *    This is stricter than the law's own wording.
 *
 * 2. No visible element's box crosses either edge of the window. Both edges
 *    are checked, because the typical fault crosses the left one. A
 *    `justify-content: flex-end` row too wide for its column pushes its first
 *    control off the left edge, where nothing scrolls and the control cannot be
 *    reached. That control is clipped but never affects `scrollWidth`.
 *
 * 3. No scroll port pans sideways, except a Table's. Table is the one member
 *    the layout rules allow to pan (composition degrades, content does not;
 *    `docs/layout.md`). The exemption is keyed on `data-overflowing`, Table's
 *    own marker for an active scroll region, which also makes it focusable and
 *    labelled. Without (3) the lane would miss faults inside AppShell. The
 *    content region is a vertical scroller, and `overflow-y: auto` forces the
 *    inline axis to `auto` as well, so a page too wide for the shell would
 *    scroll inside it and the document would never report it.
 *
 * Only visible elements are measured (`checkVisibility` with visibility,
 * opacity and content-visibility all counted), and this scope is required, not
 * defensive. The shell's closed drawer is a full-width panel at
 * `translateX(-100%)`, off the left edge on purpose and hidden. Measuring
 * hidden, staged surfaces would report the intended layout as a fault.
 *
 * 1px of tolerance everywhere, for subpixel layout at deviceScaleFactor 2.
 */
async function fitsThePhone(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const width = doc.clientWidth
    const faults = []

    if (doc.scrollWidth > width + 1) {
      faults.push(`the document scrolls sideways — ${doc.scrollWidth}px of content in ${width}px`)
    }

    const PANS = new Set(['auto', 'scroll'])
    const visible = (node) =>
      node.checkVisibility({
        visibilityProperty: true,
        opacityProperty: true,
        contentVisibilityAuto: true,
      })
    const name = (node) => {
      const classes =
        typeof node.className === 'string' && node.className.trim().length > 0
          ? `.${node.className.trim().split(/\s+/).join('.')}`
          : ''
      return `${node.tagName.toLowerCase()}${classes}`.slice(0, 90)
    }

    const over = []
    for (const node of document.querySelectorAll('*')) {
      if (!visible(node)) continue
      const style = getComputedStyle(node)

      if (PANS.has(style.overflowX) && node.scrollWidth > node.clientWidth + 1) {
        if (!node.hasAttribute('data-overflowing')) {
          over.push(
            `${name(node)} pans sideways — ${node.scrollWidth}px in ${node.clientWidth}px, and it is not a table`,
          )
        }
        // Anything inside a pannable port can be reached by panning, which is
        // what the layout rules allow for a table. The port was measured above.
        continue
      }

      let ported = false
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (PANS.has(getComputedStyle(parent).overflowX)) {
          ported = true
          break
        }
      }
      if (ported) continue

      const box = node.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue
      if (box.right > width + 1) {
        over.push(`${name(node)} runs past the right edge — ${box.right.toFixed(1)} > ${width}`)
      } else if (box.left < -1) {
        over.push(`${name(node)} starts off the left edge — ${box.left.toFixed(1)}`)
      }
    }

    // Enough to diagnose without flooding the output. One broken page can put a
    // whole subtree over the edge, and the first few entries name the ancestor.
    faults.push(...over.slice(0, 6))
    if (over.length > 6) faults.push(`…and ${over.length - 6} more elements over an edge`)
    return faults
  })
}

/**
 * The zones a churn is measured over, by content.
 *
 * `apps` applies to every churn and is the system's central claim. `recipes`
 * applies to churns f and g. The likely shortcut in a re-paint is not an
 * application edit but a hand-tuned stylesheet ("the badge looks wrong in
 * teal"), so the vocabulary's own CSS is hashed too. A recipe may not know
 * which theme it is in (`docs/rules.md`), and hashing this zone checks that law
 * during a real re-paint.
 */
const ZONES = {
  apps: { label: 'apps/', pathspec: ['apps/'] },
  recipes: {
    label: 'the recipes',
    pathspec: ['packages/recipes/src', 'packages/react-ui/src', 'packages/react/src'],
    keep: (file) => file.endsWith('.css'),
  },
}

/**
 * Churns. Each edits only the decision layer, and a change in a watched zone is
 * a failure.
 *
 * `files` is what gets reverted, so it must list every file `apply` touches. A
 * file it edits without declaring would stay edited after the run.
 */
const CHURNS = [
  {
    id: 'a',
    title: 'Swap the default system',
    claim: 'design/defaults.json is the only edit; the product opens in a different system.',
    files: ['design/defaults.json'],
    // This file says only which system a product opens in. The system declares
    // its own palette, which churn f covers.
    //
    // The default is `plain`, so the swap starts from it. The target is
    // `terminal` because the two are as far apart as the catalogue allows: light
    // against dark, ink against teal, soft borders against sharp flat edges. A
    // churn that captured a small difference would show the same mechanism less
    // clearly.
    apply: () => edit('design/defaults.json', '"system": "plain"', '"system": "terminal"'),
    scenes: { 'churn-a-default-terminal': { route: '/relay' } },
  },
  {
    id: 'b',
    title: 'Amend two pattern tokens',
    claim: 'A taller topbar and a roomier page, from the two stylesheets that own those scopes.',
    files: [
      'packages/recipes/src/archetypes/app-shell.module.css',
      'packages/recipes/src/archetypes/list-page.module.css',
    ],
    apply: () => {
      edit(
        'packages/recipes/src/archetypes/app-shell.module.css',
        '--pm-shell-topbar-height: calc(var(--pm-space-7) + var(--pm-space-6));',
        '--pm-shell-topbar-height: calc(var(--pm-space-8) + var(--pm-space-7));',
      )
      edit(
        'packages/recipes/src/archetypes/list-page.module.css',
        '--pm-page-padding-x: var(--pm-space-7);\n  --pm-page-padding-y: var(--pm-space-6);',
        '--pm-page-padding-x: var(--pm-space-9);\n  --pm-page-padding-y: var(--pm-space-8);',
      )
    },
    scenes: { 'churn-b-pattern-amendment': { route: '/relay' } },
  },
  {
    id: 'e',
    title: 'Remap an icon role and thicken every stroke',
    claim: '`settings` points at a different glyph and the whole set draws heavier.',
    files: ['design/icons.json', 'packages/react/src/icon/map.tsx', 'packages/theme/src/derive.ts'],
    apply: () => {
      // The role keeps its meaning and changes its glyph, which is what a role
      // enum allows. `map.test.ts` cross-checks the two files, so both change.
      //
      // The map lives in `@polymorph/react`. The icon gateway is installed rather
      // than vendored, so remapping a role is an upgrade a consumer takes, not a
      // file they edit.
      // The anchor is the value alone, because it is unique in the file and does
      // not depend on how the surrounding object in icons.json is wrapped.
      edit('design/icons.json', '"glyph": "settings"', '"glyph": "wrench"')
      edit('packages/react/src/icon/map.tsx', '  Settings,\n', '  Wrench,\n')
      edit('packages/react/src/icon/map.tsx', '  settings: Settings,', '  settings: Wrench,')
      /*
       * Widen the temperament spread rather than set one number. A churn that
       * made `soft` heavier than `stark` would fail `derive.test.ts`, because a
       * stark theme drawing thinner than a soft one is incoherent whatever the
       * values.
       */
      edit(
        'packages/theme/src/derive.ts',
        '  soft: -0.25,\n  standard: 0,\n  stark: 0.25,',
        '  soft: -0.5,\n  standard: 0,\n  stark: 0.5,',
      )
    },
    scenes: { 'churn-e-icons': { route: '/relay', attrs: pairing('terminal', 'petrol') } },
  },
  {
    id: 'f',
    title: 'Re-paint a system',
    claim: 'One word in one system file, and pastel wears terminal’s teal on its own bones.',
    files: ['design/systems/pastel.json'],
    zones: ['apps', 'recipes'],
    /*
     * The lane for the system/palette split. A system names a palette, and the
     * colours live in a separate file. `defaultPalette` is the only word that
     * changes, and `design/palettes/` is not touched. The resulting pairing
     * (`pastel/petrol`) is not shipped anywhere. It is derived from the two
     * files, emitted and applied without existing as a written theme.
     */
    apply: () =>
      edit(
        'design/systems/pastel.json',
        '"defaultPalette": "amethyst"',
        '"defaultPalette": "petrol"',
      ),
    /*
     * This churn runs typecheck rather than the whole suite, and the reason is
     * part of what it shows.
     *
     * `pnpm test` pins the shipped catalogue by name, on purpose and in several
     * places. The CLI's install plan knows `theme:pastel` carries amethyst, the
     * MCP catalogue tool reports it, the scratch app installs it, and
     * `laws.test.ts` holds pastel and terminal to different paint so the two
     * original systems cannot quietly converge. Under this churn pastel declares
     * petrol, so every one of those pins fails. That supports the claim: the
     * re-paint was noticed by assertions about the catalogue, in several files,
     * and by no line of `apps/` or of a recipe.
     *
     * The pairing's own lawfulness is outside this lane, and skipping the suite
     * does not skip it. The cross-product law resolves every system × every
     * palette through contrast and coherence on the unchurned tree, so
     * `pastel/petrol` is proven lawful before anything selects it.
     */
    suite: 'typecheck',
    /*
     * Named attributes, because pastel is not the default system. A bare scene
     * would capture the default, an unchanged frame of plain, filed as evidence
     * for a re-paint it never showed. It would also keep passing.
     *
     * Under the churn, `pastel/petrol` is pastel's own eager pairing, because
     * `defaultPalette` now names petrol. So this follows the rule at the top of
     * the file: the block exists in the emitted sheet.
     */
    scenes: {
      'churn-f-palette-swap': { route: '/relay', attrs: pairing('pastel', 'petrol') },
    },
  },
  {
    id: 'g',
    title: 'Rotate a palette and re-paint the data layer',
    claim:
      'One number in one palette file turns the whole chart wheel; no application edit, no recipe edit.',
    files: ['design/palettes/ember.json'],
    zones: ['apps', 'recipes'],
    /*
     * This lane exists because a chart palette is the easiest thing in a design
     * system to leave outside the decision layer. Chart colours are commonly
     * hard-coded (a `colors` array in a config file, five hexes in a theme
     * object), and then re-painting a product re-paints everything except its
     * data.
     *
     * The wheel is **rigid**: every anchor turns by the same angle. So
     * `accentHue` is the only number that needs to change, and the family spread
     * the palette gates were tuned against is preserved. 31° → 150° moves ember's
     * amber to a green, 119° around. That is far enough that no slot lands where
     * any slot was, and into a gap no other palette occupies, so the accent-hue
     * band law passes on the churned tree without an exemption.
     */
    apply: () => edit('design/palettes/ember.json', '"accentHue": 31', '"accentHue": 150'),
    /*
     * Typecheck rather than the whole suite, as in churn f, for this churn's own
     * reason. The cap-pinning catalogue laws record ember's caps by name, and a
     * hue rotation legitimately moves them. Those laws failing on an unreviewed
     * retune means they work, so it is not a defect in the churn or in the laws.
     * The churn's claim is the zone diff (no application edit, no recipe edit),
     * and the zone hash checks that without the suite. The caps' own lawfulness
     * is proven on the unchurned tree, where the catalogue the laws pin is the
     * one that shipped.
     */
    suite: 'typecheck',
    scenes: { 'churn-g-chart-repalette': chartScene('/gallery/donut-chart', EMBER_LIGHT) },
  },
]

/**
 * The part of the motion re-theme guarantee (`docs/verification.md`) that a
 * screenshot cannot show.
 *
 * "Every state remains legible at `none`" is a claim about what is on screen. A
 * single-frame screenshot cannot tell a panel that has arrived from one that is
 * 40% of the way in. So it is measured: at `none` every duration must be zero,
 * and every visible surface must be at full opacity and untransformed, with no
 * grace frame.
 */
async function legibleAtNone(page) {
  await page.goto(`http://localhost:${PORT}/relay/new`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'none'))
  await page.getByLabel('Subject').fill('Webhook retries stop after the first 5xx')
  await page.getByRole('button', { name: 'Discard' }).first().click()

  // No settle. That is the test: at `none` there is nothing to settle.
  return page.evaluate(() => {
    const faults = []
    const identity = (value) => value === 'none' || value === 'matrix(1, 0, 0, 1, 0, 0)'

    /*
     * `alertdialog`, and on purpose the assertion does not accept either role.
     *
     * The scene is Relay's discard confirm, a ConfirmDialog at its default
     * `danger` tone. It interrupts the user for an answer rather than being a
     * surface they chose to open, so `Dialog` gives it `role="alertdialog"`. That
     * role determines what a screen reader announces, and a probe that accepted
     * either role would miss a silent downgrade.
     */
    const panel = document.querySelector('[role="alertdialog"]')
    if (!panel) {
      return document.querySelector('[role="dialog"]') === null
        ? ['the discard confirm never opened']
        : ['the discard confirm opened as a dialog — the alertdialog role was lost']
    }

    for (const [label, node] of [
      ['confirm panel', panel],
      ['scrim', panel.parentElement],
    ]) {
      const style = getComputedStyle(node)
      if (Number.parseFloat(style.opacity) < 1) faults.push(`${label} opacity ${style.opacity}`)
      if (!identity(style.transform)) faults.push(`${label} transform ${style.transform}`)
    }

    // And nothing anywhere is still animating.
    for (const node of document.querySelectorAll('*')) {
      const style = getComputedStyle(node)
      for (const duration of style.transitionDuration.split(', ')) {
        if (duration !== '0s') {
          faults.push(`${node.tagName.toLowerCase()} still transitions over ${duration}`)
          return faults
        }
      }
    }
    return faults
  })
}

/**
 * The interruption guarantee (`docs/verification.md`). Opens and closes the
 * dialog as fast as Playwright can click, then asserts the two things a broken
 * interruption would lose: the final state matches the last click, and the
 * typed input is still there.
 */
async function survivesInterruption(page) {
  await page.goto(`http://localhost:${PORT}/relay/new`, { waitUntil: 'networkidle' })
  const subject = 'Webhook retries stop after the first 5xx'
  await page.getByLabel('Subject').fill(subject)

  /*
   * The trigger, located so that it cannot match anything else.
   *
   * There are two buttons called *Discard* in this scene: the one in the form
   * that raises the confirm, and the confirm's own answer. `getByRole` reads the
   * accessibility tree, and a modal Radix dialog puts `aria-hidden` on
   * everything outside itself. So once the panel opens, the only *Discard* with
   * a role is the one inside it. `.first()` would then resolve to the answer
   * rather than the trigger, clicking it would confirm the discard, and the
   * screen would navigate to the inbox. The next round would wait thirty seconds
   * for a trigger no longer on the page and fail the whole run. Scoping to the
   * `<form>` makes the locator match only the trigger, because the panel is
   * portalled to the document.
   *
   * The click is dispatched rather than performed, for a related reason. A
   * forced click still lands at a coordinate, and while the panel is open that
   * coordinate belongs to the panel. This probe claims only that reversing a
   * transition mid-flight loses nothing. Where a pointer would land behind a
   * scrim is not part of it.
   */
  const open = page.locator('form button', { hasText: 'Discard' })
  for (let round = 0; round < 8; round += 1) {
    await open.dispatchEvent('click')
    await page.keyboard.press('Escape')
  }

  await page.waitForTimeout(600)
  const faults = []
  // Report a navigation here, rather than failing later with a timeout in
  // whatever runs next.
  if (!page.url().endsWith('/relay/new')) faults.push(`the mash navigated to ${page.url()}`)
  // Both roles, because this probe is about dismissal, not ARIA.
  // `getByRole('dialog')` does not match an `alertdialog`, so checking only one
  // role would make the check unable to fail. The correct role is asserted
  // once, in `legibleAtNone`.
  const panels = page.locator('[role="dialog"], [role="alertdialog"]')
  if ((await panels.count()) > 0) faults.push('the confirm survived its own dismissal')
  if ((await page.getByLabel('Subject').inputValue()) !== subject) faults.push('the draft was lost')
  return faults
}

/**
 * A zone's content, hashed, so a churn can be measured against itself.
 *
 * This does not use `git status --porcelain -- apps/`, which answers a
 * different question: "does `apps/` differ from HEAD?" That gives the same
 * answer only on a clean tree. With application work in progress, every churn
 * would report the author's uncommitted files as its own diff. It could also
 * miss a real change: a churn that edits an already modified file leaves ` M`
 * in both readings.
 *
 * The claim is about the churn ("applying this edit changes nothing in the zone
 * it names"), so the zone is compared before and after applying it. Tracked and
 * untracked files are both included, and `.gitignore` is honoured, so `dist/`
 * is excluded.
 */
async function snapshot(names) {
  const digests = new Map()

  for (const name of names) {
    const zone = ZONES[name]
    const files = (
      await capture('git', [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        ...zone.pathspec,
      ])
    )
      .split('\n')
      .filter(Boolean)
      .filter(zone.keep ?? (() => true))

    for (const file of files.sort()) {
      const path = resolve(ROOT, file)
      digests.set(
        file,
        existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'absent',
      )
    }
  }

  return digests
}

/** The files the churn moved, or `null` for the empty diff the claim asserts. */
function changed(before, after) {
  const moved = [...new Set([...before.keys(), ...after.keys()])]
    .filter((file) => before.get(file) !== after.get(file))
    .sort()
  return moved.length === 0 ? null : moved.join('\n')
}

async function suite(mode) {
  const typecheck = await run('pnpm', ['typecheck'])
  // `typecheck` is for the churns that change the catalogue the suite pins.
  // Only churns f and g may ask for it, and each explains why in its notes.
  if (mode === 'typecheck') {
    return { ok: typecheck.code === 0, summary: 'typecheck only, on purpose (churns f and g)' }
  }

  const tests = await run('pnpm', ['test'])
  const summary = /Tests {2}(.+)/.exec(tests.out)?.[1]?.trim() ?? 'no summary'
  return { ok: typecheck.code === 0 && tests.code === 0, summary }
}

/**
 * The content a churn will restore, read before the churn edits anything.
 *
 * Reading here rather than in the churn makes the `files` list authoritative.
 * A file `apply` edits without declaring is not restored. A declared file that
 * is missing fails here, with an error, before anything has been touched,
 * rather than at the revert.
 */
function restorePoint(files) {
  return files.map((file) => [file, read(file)])
}

async function main() {
  const commit = await capture('git', ['rev-parse', '--short', 'HEAD'])
  console.log(`proof: HEAD ${commit}\n`)
  resetShots(SHOTS)

  const results = []

  console.log('— baseline —')
  let studio = await openStudio()
  let motionFaults = []
  let interruptionFaults = []
  try {
    for (const [name, scene] of Object.entries(BASELINE_SCENES)) {
      await studio.shot(SHOTS, name, scene)
      console.log(`  ${name}`)
    }
    motionFaults = await legibleAtNone(studio.page)
    interruptionFaults = await survivesInterruption(studio.page)
  } finally {
    await studio.close()
  }

  console.log(`\n  motion=none legibility: ${motionFaults.length === 0 ? 'clean' : 'FAULTS'}`)
  for (const fault of motionFaults) console.log(`    ${fault}`)
  console.log(`  interruption mash:      ${interruptionFaults.length === 0 ? 'clean' : 'FAULTS'}`)
  for (const fault of interruptionFaults) console.log(`    ${fault}`)
  if (studio.problems.length > 0) {
    console.error('proof: the product logged errors while being photographed:')
    console.error(studio.problems.join('\n'))
    process.exit(1)
  }

  /*
   * The phone lane. It has its own studio, because a studio has one viewport.
   * The rebuild takes a second and a half and ensures no shot is taken at the
   * wrong width.
   */
  console.log('\n— phone, 375×812 —')
  const phoneFaults = []
  studio = await openStudio({ viewport: PHONE })
  try {
    for (const [name, scene] of Object.entries(PHONE_SCENES)) {
      await studio.shot(SHOTS, name, scene)
      const faults = await fitsThePhone(studio.page)
      console.log(`  ${name}: ${faults.length === 0 ? 'fits' : 'FAULTS'}`)
      for (const fault of faults) console.log(`    ${fault}`)
      phoneFaults.push(...faults.map((fault) => `${name}: ${fault}`))
    }
  } finally {
    await studio.close()
  }
  if (studio.problems.length > 0) {
    console.error('proof: the product logged errors while being photographed on the phone:')
    console.error(studio.problems.join('\n'))
    process.exit(1)
  }

  for (const churn of CHURNS) {
    console.log(`\n— churn ${churn.id}: ${churn.title} —`)
    const zones = churn.zones ?? ['apps']
    let outcome
    const before = await snapshot(zones)
    const restore = restorePoint(churn.files)
    try {
      churn.apply()
      const checks = await suite(churn.suite)
      const diff = changed(before, await snapshot(zones))

      studio = await openStudio()
      try {
        for (const [name, scene] of Object.entries(churn.scenes)) {
          await studio.shot(SHOTS, name, scene)
        }
      } finally {
        await studio.close()
      }

      outcome = { ...churn, diff, checks, problems: studio.problems }
    } finally {
      for (const [file, text] of restore) write(file, text)
    }

    results.push(outcome)
    const watched = zones.map((name) => ZONES[name].label).join(' + ')
    console.log(`  ${watched} diff: ${outcome.diff ?? 'empty'}`)
    console.log(`  suite: ${outcome.checks.ok ? 'green' : 'RED'} — ${outcome.checks.summary}`)
  }

  console.log('\n— inventory —')
  const inventory = await run('node', ['packages/rules/bin/inventory.js'])
  console.log(inventory.out.trim())

  console.log('\n— red rules, on the seeded fixtures —')
  const fixtures = await run('pnpm', [
    'vitest',
    'run',
    '--project',
    'logic',
    'packages/rules/src/fixtures.test.ts',
  ])
  console.log(/Tests {2}(.+)/.exec(fixtures.out)?.[0]?.trim() ?? 'no summary')

  const failures = [
    ...results.filter((result) => result.diff !== null || !result.checks.ok),
    ...motionFaults,
    ...interruptionFaults,
    ...phoneFaults,
  ]
  const shots =
    Object.keys(BASELINE_SCENES).length + Object.keys(PHONE_SCENES).length + results.length
  console.log(
    `\nproof: ${results.length} churns, ${Object.keys(PHONE_SCENES).length} phone scenes, ` +
      `${failures.length} failing, ${shots} shots in proof/shots/`,
  )
  process.exit(failures.length === 0 && inventory.code === 0 ? 0 : 1)
}

try {
  await main()
} catch (error) {
  // A stale anchor or a build failure means the proof is out of date. It is not
  // a crash, so no stack trace is printed.
  console.error(`\n${error.message}`)
  process.exit(1)
}
