/**
 * The limits of the test tooling on one browser engine, each named once
 * (`docs/verification.md`, the browser matrix).
 *
 * Every browser project defines `__PM_ENGINE__` as the engine it runs in. A
 * test may not branch on the engine to pass. It may only declare a skip on one
 * of the limits below, `it.skipIf(TAB_PASSES_BUTTONS)(…)`, so the reason a
 * test does not run on an engine is written here, beside the limit's name.
 *
 * Each limit belongs to the tooling or to a setting of the engine, and never
 * to a member. A member that behaves differently on an engine is fixed, or the
 * difference is recorded in its spec.
 */
declare const __PM_ENGINE__: string | undefined

/** The engine the suite runs in. It is Chromium where no project defines one. */
const ENGINE = typeof __PM_ENGINE__ === 'string' ? __PM_ENGINE__ : 'chromium'

/**
 * Tab passes over buttons, checkboxes, radios and links.
 *
 * WebKit on macOS follows Safari's default setting, in which Tab visits text
 * fields and elements that carry a `tabindex`, and Option+Tab visits every
 * control. Playwright offers no way to change the setting. A test that presses
 * Tab to reach a button or a link reads the setting and not the member, so it
 * skips on WebKit. Programmatic focus, the arrow keys inside a member and Tab
 * between text fields are tested there as everywhere.
 */
export const TAB_PASSES_BUTTONS = ENGINE === 'webkit'

/**
 * A script cannot read the data of a paste it dispatches.
 *
 * Gecko returns `""` from `getData()` on a `ClipboardEvent` a script creates,
 * though the `DataTransfer` is attached, and Playwright's Firefox grants no
 * clipboard permission that a real paste could use. A test that pastes skips
 * on Firefox.
 */
export const PASTE_IS_UNREADABLE = ENGINE === 'firefox'

/**
 * No scrollbar is drawn.
 *
 * Playwright's headless Firefox hides every scrollbar with a style sheet of
 * its own, so `scrollbar-width` computes as `none` whatever the page's rule
 * says. A test that reads the computed scrollbar skips on Firefox.
 */
export const SCROLLBARS_ARE_HIDDEN = ENGINE === 'firefox'

/**
 * The test cannot emulate a media feature.
 *
 * A test turns on `prefers-reduced-motion` through a DevTools protocol session
 * (`cdp()`), which Playwright opens only in Chromium. A test that needs the
 * emulation skips on the other engines.
 */
export const NO_MEDIA_EMULATION = ENGINE !== 'chromium'
