import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readAgent } from './agent'
import { buildRegistry, type Registry } from './build'
import { agentSegment, CHARS_PER_TOKEN, estimateTokens, factored, renderSystemCard } from './card'
import { firstDifference } from './diff'
import { INSTALLED_PACKAGES } from './install'

/**
 * The system card's laws.
 *
 * Two claims and one budget. The budget matters most. An agent receives the
 * card *instead of* the repository, so a silent failure defeats the card's
 * purpose. A card that doubled in size would still render and still read
 * correctly, but it would stop fitting. The only symptom would be worse output
 * from a model nobody was watching.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry = buildRegistry(ROOT)
const card = renderSystemCard(registry)

/**
 * The budget, in characters, with the reason for the number.
 *
 * The card should cost low thousands of tokens. The theming section takes about
 * a page, because it is the one part of the system an agent cannot infer from a
 * component list. The vocabulary takes one line per member.
 *
 * The ceiling is deliberately only a few hundred characters (a handful of
 * lines) above the measured card. Because the margin is small, the next growth
 * (a member, a colour role or a prop name) fails this test on its first run.
 * Whoever adds it then decides here whether the growth is worth its characters.
 *
 * Raising the ceiling is allowed, and the reason goes here. Raise it after the
 * growth that needs it, never in advance. A raise is justified when the new
 * content is something an agent cannot infer and cannot work without. A model
 * not told that `CheckboxGroup` exists stacks bare Checkboxes. One not told
 * about `Histogram` uses a `BarChart` over a continuum. One not told about
 * `border.field` writes `border.default` on a field. One not told about
 * `messages` ships "Select all" to a French screen. Carrying names like these
 * is the card's job.
 *
 * Compress before raising. A member's opening sentence should match the length
 * of its neighbours' ("Inline status callout" is the house register), because
 * every agent pays for each paragraph on the card. One shared type is cheaper
 * than many: the chart tier's single `ChartMessages` type costs the card one
 * prop name per member, where a type per member would add eight type names and
 * forty-odd keys. A longer package scope carries the same information under a
 * longer name, and nothing can be compressed out of it.
 *
 * The card does not have to fit on one page. It must not grow without anyone
 * noticing, because an oversized card no longer fits the window it was sized
 * for.
 *
 * The current ceiling includes the conversation tier: twelve members and an
 * archetype that an agent building an AI product cannot infer and cannot work
 * without. A model not told about `ChatThread` wraps a Stack in a ScrollArea
 * and loses scroll-follow. One not told about `Markdown` uses a renderer with a
 * second type scale. One not told about `ApprovalCard` draws the permission
 * step as a ConfirmDialog. Their opening sentences are already compressed to
 * the house register, and what remains is names.
 *
 * It also includes a paragraph near the top naming the web frameworks and the
 * native renderers and how an agent picks one, and the platform section: one
 * line per platform, with the members absent there and their substitutes. A model building for iOS that is not told Tooltip has no
 * rendering there writes one anyway, and one not told the vocabulary exists in
 * Vue writes React into a Vue app. The same budget holds for the card rendered
 * for each platform, which leaves absent members out and adds each adapted
 * member's rendering.
 *
 * It also includes every compound part each member's export carries, with its
 * props (`AppShell.NavItem`, `Dashboard.Panel`), and Toast's real API: `toast()`
 * and its shorthands, `ToastHost`, `ToastNotice` and `ToastViewportTarget`. A
 * model not told about `AppShell.NavItem` builds the sidebar from Links, and one
 * shown Toast as a component with props writes a `<Toast>` that React does not
 * have.
 *
 * It also includes two sentences of the opening: a value the theme does not
 * derive goes in the system or palette document, and inside AppShell each route
 * renders one page archetype. A model not told where such a value goes writes
 * `--pm-*` declarations in application CSS. The application rules on app CSS
 * (`no-token-declarations`, `no-app-theme-selectors`, `no-app-member-selectors`,
 * `no-root-font-size`) are listed for the same reason: an agent not told them
 * writes token overrides in a stylesheet. And it includes the props a consumer's
 * screens were missing:
 * `onNavigate` on Link, Breadcrumbs and `AppShell.NavItem`, Alert's
 * `secondaryAction`, Card's `title` and `headingLevel`, ConfirmDialog's
 * `confirmWith`, RelativeTime's and CursorPagination's `mode`. A model not told
 * about one hand-builds it on every screen that needs it.
 *
 * It also includes AvatarButton and Image. A model not told about AvatarButton
 * stacks an invisible Button over an Avatar to open an account menu, and one
 * not told about Image writes a bare `<img>` with its own sizing and no failed
 * state.
 *
 * It also includes how another library's component is hosted: the `ThirdParty`
 * boundary beside `Bespoke` on rung 4, and `useThemeValues`. A model not told
 * puts a map in a Bespoke zone, or outside any boundary, and writes its
 * colours as literals, which stop matching on the first change of mode.
 *
 * It also includes List, with `List.Item`. A model not told
 * about List builds each row from a Stack, an Inline and Text, and joins its
 * fields into one string.
 *
 * It also includes the two selected-surface roles. A model not told about them
 * fills a selected row in a Bespoke zone with `selection.bg`, which an
 * achromatic system draws as its ink, the colour of the row's text.
 *
 * It also includes Diff. A model not told about Diff writes a change as
 * `old → new` in a string, or shows only the new side of it.
 *
 * It also includes Tree. A model not told about Tree nests Disclosures, or
 * draws a hierarchy one level at a time, and neither has the tree roles or the
 * arrow keys.
 *
 * It also includes the members a form, a long page, a conversation and an
 * operations screen were missing, each one line of names: ModeSwitch,
 * Highlight, Plan, LogView, AudioPlayer, RecordButton, PhoneInput,
 * DurationInput, MonthInput, CommentThread, Countdown, Meter, Lightbox,
 * TreeSelect, Rating, InlineEdit, TableOfContents, Tour, Menubar, FunnelChart
 * and Treemap. It includes the props added beside them: Badge's and Button's
 * `count`, Text's `lines`, PromptInput's `triggers`, AppShell's `navigation`,
 * Progress's `shape` and BarChart's `lines`. A model not told about
 * DurationInput takes seconds in a number field. One not told about TreeSelect
 * flattens a hierarchy into a Select of joined paths. One not told about Meter
 * draws a measurement as Progress, which says a task is under way. One not told
 * about Countdown writes its own interval and announces every second. Their
 * opening sentences are in the house register, and what remains is prop names.
 * It also includes the props that let a page name its sections and rename its
 * subject: Heading's `id`, DetailPage's `stickyAside`, the `titleEdit` of
 * PageHeader, DetailPage and Dashboard, and InlineEdit's `valueHidden`. A model
 * not told about `titleEdit` renames a page's subject in a Dialog. It also
 * includes each member's `agent:` segment and the three lines that explain
 * it: the actions an agent on the page may run and the states it reads, from
 * the spec's `agent` fence, for every member that has one, the notices a
 * Toast viewport holds, a plain Table's sort, AppShell's drawer and
 * destinations, the items of a List, a linked Card's press, the errors of an
 * ErrorSummary, a JsonTree's branches, a SplitPane's divider, whether a Button
 * is pressed or expanded, the marks of each chart that takes `onSelect`, the
 * series a chart's legend hides and shows, and the range a LineChart's or an
 * AreaChart's brush holds among them. A model not told what a member gives an
 * agent writes a screen an agent cannot operate, or wraps a control in one of
 * its own to expose it.
 *
 * It also includes MasterDetailPage and SearchPage, one line each, and
 * AuthPage's line names a setup step and a status. A model not told about
 * MasterDetailPage draws the selected item's detail under its table, where it
 * is off screen when the row is picked. One not told about SearchPage puts a
 * query's grouped results in a ListPage's one table. One not told that a
 * status is an AuthPage builds a page for "not found" from a Stack and a
 * Heading.
 *
 * It also includes the props a public page needs for a reader that runs no
 * script: Accordion's and Collapsible's `keepMounted`, Pagination's
 * `getPageHref`, CursorPagination's `previousHref` and `nextHref`, and Image's
 * `srcSet` and `fetchPriority`. A model not told about `keepMounted`
 * leaves an FAQ's answers out of the server's markup, and one not told about
 * `getPageHref` writes a pager a crawler cannot follow past the first page.
 * It also includes RichTextContent, one line. A model not told about it draws
 * a stored comment's document with Markdown, which reads a string, or walks
 * the JSON into Text and Heading itself and drops the nodes it does not know.
 * The line names its annotation props, `selectionActions` and its agent
 * segment. A model not told that the reader draws comment threads and offers
 * a control at selected words draws highlights and a floating bar itself,
 * which application code may not position.
 * It also includes RichTextInput's line, with its agent segment, and the ten
 * rich-text icon roles its toolbar draws. A model not told about RichTextInput
 * keeps a comment as Markdown in a Textarea, whose text the app cannot hold to
 * a field's formats, count as a server counts or anchor a comment thread to.
 * It also includes the Button and icon usage section: ten lines that say, for
 * each rule a screen's buttons and icons follow, whether the system holds it,
 * a rule checks it or nothing does, with the three checked rules among the
 * rules above it, the trailing icon roles and FormPage's `leadingAction`. A
 * model not told draws two main Buttons in a Dialog, puts Delete before
 * Cancel, and writes a check mark after a label, and the screen validation
 * then refuses the screen for a rule the card never stated.
 *
 * `packages/mcp/src/tools.test.ts` and `packages/mcp/transcript.test.ts` check
 * the same number from the tool that serves the card, so the three move
 * together.
 */
const BUDGET_CHARS = 40_870
/**
 * A platform card says, for every adapted member, how it renders there, which
 * the web card never has to; those notes are the only thing that makes the
 * iOS card larger than the web one. The ceiling for a platform card is
 * therefore the web budget plus room for about fifteen one-line notes.
 */
const PLATFORM_BUDGET_CHARS = BUDGET_CHARS + 800

describe('the system card fits a context window', () => {
  it(`is under ${BUDGET_CHARS} characters (~${Math.round(BUDGET_CHARS / CHARS_PER_TOKEN)} tokens)`, () => {
    // Reported in both units so a failure says how far over, not just that.
    expect(
      card.length,
      `system card is ${card.length} chars (~${estimateTokens(card)} tokens)`,
    ).toBeLessThanOrEqual(BUDGET_CHARS)
  })

  it('stays above a minimum size', () => {
    // The lower bound of the budget. A renderer that dropped a section would
    // pass the ceiling, so this floor catches it.
    expect(card.length).toBeGreaterThan(8_000)
  })
})

describe('it renders deterministically', () => {
  it('is the same card twice, from the same tree', () => {
    expect(firstDifference(card, renderSystemCard(buildRegistry(ROOT)))).toBeNull()
  }, 60_000)

  it('contains no absolute path or timestamp', () => {
    expect(card).not.toContain(ROOT)
    expect(card).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  })
})

describe('it is the whole vocabulary, compressed', () => {
  it('names every component, under its tier', () => {
    for (const component of registry.components) {
      expect(card, component.name).toContain(`**${component.name}**`)
    }
  })

  it('names every law, every rung, every axis and every icon role', () => {
    for (const law of registry.laws) expect(card).toContain(law.name)
    for (const rung of registry.exceptions.ladder) expect(card).toContain(rung.name)
    for (const axis of registry.theme.axes) expect(card).toContain(`**${axis.name}**`)
    for (const role of registry.icons.roles) expect(card).toContain(role.name)
  })

  it('says how another library’s component is hosted, in each framework’s own words', () => {
    const flat = (text: string) => text.replace(/\s+/g, ' ')
    expect(flat(card)).toContain('goes inside `<ThirdParty library="…" reason="…">`')
    expect(flat(card)).toContain('`useThemeValues()` (`@polymorph/react`)')
    const angular = flat(renderSystemCard(registry, { framework: 'angular' }))
    expect(angular).toContain('goes inside `<pm-third-party library="…" reason="…">`')
    expect(angular).toContain('`useThemeValues()` (`@polymorph/angular`)')
    // A page has no hooks; the engine's reader, which the elements foundation re-exports, reads
    // the same values.
    const elements = flat(renderSystemCard(registry, { framework: 'elements' }))
    expect(elements).toContain('goes inside `<poly-third-party library="…" reason="…">`')
    expect(elements).toContain('`readThemeValues()` (`@polymorph/elements`)')
    expect(elements).not.toContain('useThemeValues')
    // The boundary's rules are lint rules for web code, so a native card leaves it out.
    for (const platform of ['ios', 'android'] as const) {
      expect(renderSystemCard(registry, { platform })).not.toContain('useThemeValues')
    }
  })

  it('states the destructive order in the words the rule and the specs use', () => {
    const flat = card.replace(/\s+/g, ' ')
    expect(flat).toContain(
      'within one group of Buttons placed together, a danger Button comes last. A destructive ' +
        'action in a group of its own, apart from the group that holds the main Button, may come first.',
    )
  })

  it('publishes the lawful cells, which are the ones a call site may write', () => {
    expect(card).toContain('solid(accent|danger)')
    expect(card).toContain('ghost(neutral|accent|danger)')
  })

  it('leaves out prop types and file paths, which the registry holds', () => {
    // Prop *types* and file paths would exceed the budget first, and the
    // registry has both for any reader that needs them.
    expect(card).not.toContain('packages/react-ui/src')
    expect(card).not.toContain('packages/recipes/src')
    expect(card).not.toContain('ReactElement')
    expect(card).not.toContain('| undefined')
  })

  it('states the conventions once instead of per component', () => {
    expect(card).toContain('aria-describedby')
    expect(card.split('aria-describedby')).toHaveLength(2)
  })

  /**
   * Five facts a contributor needs that a component list does not give.
   *
   * A member built without any one of them shows the gap. A mark cannot be
   * sized from step names, a stylesheet cannot be written without knowing which
   * literals are lawful, and nobody can add a member without knowing where the
   * contribution workflow starts.
   */
  it('prints the space magnitudes and control heights beside the step names', () => {
    const { space, controlHeight } = registry.theme.standardDensity
    // The magnitudes sit beside the step names, not in a separate table, because
    // a step and its magnitude are one fact.
    expect(card).toContain(`0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 → 0 2 4 8 12 16 24 32 48 64 96px`)
    expect(space['6']).toBe('24px')
    expect(card).toContain(
      `sm ${controlHeight['sm']} · md ${controlHeight['md']} · lg ${controlHeight['lg']}`,
    )
  })

  it('says which literals a stylesheet may write, since every other value is a token', () => {
    expect(card).toContain('structural rather than aesthetic')
    for (const literal of ['`0`', '`9999px`', '`auto`', '`none`', '`currentcolor`']) {
      expect(card, literal).toContain(literal)
    }
  })

  it('states both directions of the client directive rule, as the law checks both', () => {
    expect(card).toContain("`'use client'` runs both directions")
    expect(card).toContain('must not')
  })

  it('says a `class` or `style` on an Angular member is refused, not that it does nothing', () => {
    // A static one lands on `<pm-x>`, where an inherited property reaches the
    // member's content and Angular ranks it above the host's `display: contents`.
    const angular = renderSystemCard(registry, { framework: 'angular' }).replace(/\s+/g, ' ')
    expect(angular).toContain('A `class` or `style` on a member is outside its contract')
    expect(angular).toContain('the red rules remove a static one and report a bound one')
    expect(angular).not.toContain('does nothing')
  })

  it('says a `class` or `style` on an element reaches its content, and that no red rule reads HTML', () => {
    // An element's host keeps the page's attributes, so an inherited property reaches the
    // member's content, and the red rules read no HTML page to report it.
    const elements = renderSystemCard(registry, { framework: 'elements' }).replace(/\s+/g, ' ')
    expect(elements).toContain('A `class` or `style` on it is outside its contract')
    expect(elements).toContain('the red rules do not read HTML')
    expect(elements).not.toContain('does nothing')
  })

  it('points a contributor to the scaffold command and CONTRIBUTING.md', () => {
    expect(card).toContain('pnpm new:member <Name>')
    expect(card).toContain('CONTRIBUTING.md')
  })

  it('names the packages a consumer installs and the one the members come from', () => {
    // An agent writing imports needs the package names, and none of them can
    // be inferred from a component list.
    for (const name of [...INSTALLED_PACKAGES, '@polymorph/react-ui']) {
      expect(card, name).toContain(`\`${name}\``)
    }
  })
})

describe('it lists each member’s whole surface', () => {
  const line = (text: string, name: string) =>
    text.split('\n').find((row) => row.startsWith(`- **${name}**`)) ?? ''

  it('lists every compound part of every member, with the part’s own props', () => {
    for (const component of registry.components) {
      for (const part of component.parts) {
        expect(line(card, component.name), `${component.name}.${part.name}`).toContain(
          ` · ${component.name}.${part.name}`,
        )
      }
    }
    expect(line(card, 'AppShell')).toContain('AppShell.NavItem: ')
    expect(line(card, 'AppShell')).toContain('AppShell.NavGroup: label*')
    expect(line(card, 'Dashboard')).toContain('Dashboard.Panel: title')
    expect(line(card, 'Tabs')).toContain('Tabs.Content: value*')
    expect(line(card, 'Table')).toContain('Table.Row: interactive, onClick, selected')
    // A part's props are listed with the part, not again among the member's.
    expect(card).not.toContain('Row.selected')
  })

  it('publishes Toast as React ships it: toast() with its options, the host, the notice and the target', () => {
    const toast = line(card, 'Toast')
    expect(toast).toContain(' · toast(): action, content, description, dismissible, durationMs')
    expect(toast).toContain('onDismiss, retained, title*, tone')
    expect(toast).toContain(' · toast.{success, danger, warning, info, promise, dismiss}')
    expect(toast).toContain(' · ToastHost: messages*')
    expect(toast).toMatch(/ · ToastNotice: [^·]*eventKey, onDismiss, title\*, tone/)
    expect(toast).toContain(' · ToastViewportTarget')
    // A companion whose props are the member's own is named and not listed again.
    expect(line(card, 'FormField')).toMatch(/ · ToastFormField$/)
  })

  it('lists the parts another framework’s shell declares, and none of React’s exports', () => {
    // An element's parts are elements of their own (`<poly-toast-viewport>`), read from their
    // definition modules.
    for (const framework of ['vue', 'svelte', 'solid', 'angular', 'elements'] as const) {
      const toast = line(renderSystemCard(registry, { framework }), 'Toast')
      expect(toast, framework).toContain(' · Toast.Viewport')
      expect(toast, framework).toContain(' · action, content, description')
      expect(toast, framework).not.toContain('ToastHost')
      expect(toast, framework).not.toContain('toast()')
    }
  })

  it('lists a native member’s props and the parts its contract carries, and none of React’s exports', () => {
    // SwiftUI's and Compose's Toast is a member whose props are the options. A
    // native card that named `toast()` or `ToastHost` would send an agent after
    // functions the platform does not have.
    for (const platform of ['ios', 'android'] as const) {
      const rendered = renderSystemCard(registry, { platform })
      const toast = line(rendered, 'Toast')
      expect(toast, platform).toContain(' · action, content, description')
      expect(toast, platform).not.toContain('toast()')
      expect(toast, platform).not.toContain('ToastHost')
      expect(toast, platform).not.toContain('ToastNotice')
      expect(line(rendered, 'FormField'), platform).not.toContain('ToastFormField')
      expect(line(rendered, 'Table'), platform).toContain(
        'Table.Row: interactive, onClick, selected',
      )
      expect(line(rendered, 'Table'), platform).not.toMatch(/ · Table\.Head( ·|$)/)
      expect(line(rendered, 'AppShell'), platform).not.toContain('AppShell.NavItem')
    }
  })
})

describe('it says what exists on each platform', () => {
  const members = [...registry.components, ...registry.exceptions.primitives]

  it('counts native, adapted and absent per platform, and names each absent member’s substitute', () => {
    expect(card).toContain('## Platforms')
    for (const platform of registry.platforms) {
      const count = (status: string) =>
        members.filter((member) => member.platforms[platform].status === status).length
      expect(card).toContain(
        `- **${platform}** — ${count('native')} native · ${count('adapted')} adapted · ${count('absent')} absent`,
      )
    }
    const line = card.split('\n').find((text) => text.startsWith('- **ios**')) ?? ''
    expect(line).toContain('Tooltip → Text')
    expect(line).toContain('Command → SearchInput')
  })

  it('names every framework and native renderer, and how an agent picks one', () => {
    // An agent told only of React writes React into a Vue app, and one not told
    // which toolkit a platform renders with cannot read its screen's imports.
    // The paragraph is wrapped, so it is read with its line breaks as spaces.
    const prose = (text: string) => text.replace(/\s+/g, ' ')
    expect(prose(card)).toContain(`${registry.frameworks.join(', ')} (this card is react's)`)
    expect(prose(renderSystemCard(registry, { framework: 'vue' }))).toContain(
      "(this card is vue's)",
    )
    expect(prose(renderSystemCard(registry, { framework: 'elements' }))).toContain(
      "(this card is elements')",
    )
    expect(prose(card)).toContain('`polymorph init --framework`')
    expect(prose(card)).toContain('ios renders SwiftUI (`PolymorphUI`)')
    expect(prose(card)).toContain('android renders Compose (`dev.polymorph.ui`)')
  })

  it('is the web card by default', () => {
    expect(firstDifference(card, renderSystemCard(registry, { platform: 'web' }))).toBeNull()
    expect(card).not.toContain('(adapted:')
  })

  for (const platform of ['ios', 'android'] as const) {
    it(`renders the vocabulary for ${platform}: absent members left out, adapted ones say how`, () => {
      const rendered = renderSystemCard(registry, { platform })
      expect(rendered).toContain(`Rendered for **${platform}**`)
      for (const component of registry.components) {
        const entry = component.platforms[platform]
        const row = `- **${component.name}**`
        if (entry.status === 'absent') expect(rendered, component.name).not.toContain(`${row} `)
        else if (entry.status === 'adapted') {
          expect(rendered, component.name).toContain(`${row} (adapted: ${entry.as ?? ''})`)
        } else expect(rendered, component.name).toContain(row)
      }
    })

    it(`fits the platform budget for ${platform}`, () => {
      const rendered = renderSystemCard(registry, { platform })
      expect(
        rendered.length,
        `${platform} card is ${rendered.length} chars (~${estimateTokens(rendered)} tokens)`,
      ).toBeLessThanOrEqual(PLATFORM_BUDGET_CHARS)
    })
  }
})

describe('the colour families are factored where they are a product', () => {
  it('writes the status grid once instead of forty times', () => {
    expect(card).toContain('{danger, warning, success, info}.{solid,')
    expect(card).not.toContain('warning.solidHover')
  })

  it('leaves a family that is not a product in the long form', () => {
    // Two roles from two different families. Factoring them would need a term
    // that neither family has.
    expect(factored(['accent.gradient', 'bg.wash'])).toBe('accent.gradient, bg.wash')
    expect(factored(['xs', 'sm'])).toBe('xs, sm')
    expect(factored(['a.one', 'a.two', 'b.one'])).toBe('a.one, a.two, b.one')
    expect(factored(['a.one', 'a.two', 'b.one', 'b.two'])).toBe('{a, b}.{one, two}')
  })
})

/**
 * The agent segment, shown on copies of the registry: one in which no member
 * carries a fence, and one in which three do. The copies are made from the
 * tree's registry with every fence cleared first, so these hold whichever
 * specs carry a fence. A card with no visible member carries neither a segment
 * nor the sentence that explains them, so the segment costs nothing until a
 * member is visible to agents.
 */
describe('it says what an agent may do with each member it can see', () => {
  const contract = (...lines: string[]) =>
    readAgent(['## Agent', '```agent', ...lines, '```'].join('\n'), 'sample.md').agent
  const hidden = JSON.parse(JSON.stringify(registry)) as Registry
  for (const component of hidden.components) component.agent = null
  const baseline = renderSystemCard(hidden)
  const sample = JSON.parse(JSON.stringify(hidden)) as Registry
  const member = (name: string) => {
    const found = sample.components.find((component) => component.name === name)
    if (found === undefined) throw new Error(`no ${name} in the registry`)
    return found
  }
  member('Checkbox').agent = contract(
    'state checked tristate as box aria-checked',
    'state disabled boolean',
    'action check sets checked calls onCheckedChange',
    'action uncheck sets checked calls onCheckedChange',
  )
  member('PasswordInput').agent = contract('state value text secret', 'state disabled boolean')
  member('Button').agent = contract('action press calls onClick', 'destructive when tone=danger')
  const line = (text: string, name: string) =>
    text.split('\n').find((row) => row.startsWith(`- **${name}**`)) ?? ''
  const LEGEND = 'An `agent:` segment names what an agent on the page may run'

  it('lists no segment and no legend when no member has a fence', () => {
    expect(baseline).not.toContain(' · agent: ')
    expect(baseline).not.toContain(LEGEND)
  })

  it('is the card the tree renders, with the segments of the members whose spec has a fence', () => {
    const visible = registry.components.filter((component) => component.agent !== null)
    expect(card.includes(LEGEND)).toBe(visible.length > 0)
    for (const component of visible) {
      expect(line(card, component.name), component.name).toContain(
        ` · ${agentSegment(component, 'web') ?? ''}`,
      )
    }
  })

  it('lists the actions, then after `|` the states, marking a secret one', () => {
    const text = renderSystemCard(sample)
    expect(line(text, 'Checkbox')).toContain(' · agent: check, uncheck | checked, disabled')
    expect(line(text, 'PasswordInput')).toContain(' · agent: | value (secret), disabled')
    expect(line(text, 'Button')).toMatch(/ · agent: press( · |$)/)
    expect(text.split(LEGEND)).toHaveLength(2)
  })

  it('adds only the segment to a member’s line', () => {
    const before = line(baseline, 'Checkbox')
    const after = line(renderSystemCard(sample), 'Checkbox')
    const segment = ' · agent: check, uncheck | checked, disabled'
    expect(after.replace(segment, '')).toBe(before)
    expect(after.length - before.length).toBe(segment.length)
  })

  it('costs the card one sentence, said once, and each visible member its segment', () => {
    const text = renderSystemCard(sample)
    const lines = text.split('\n')
    const start = lines.findIndex((row) => row.startsWith(LEGEND))
    const end = lines.indexOf('', start)
    const legend = lines.slice(start, end + 1).join('\n')
    expect(legend.length).toBeLessThan(200)
    const segments = ['Checkbox', 'PasswordInput', 'Button'].map(
      (name) => line(text, name).length - line(baseline, name).length,
    )
    expect(segments.every((added) => added > 0 && added <= 60)).toBe(true)
    expect(text.length - baseline.length).toBe(
      segments.reduce((sum, added) => sum + added, 0) + legend.length + 1,
    )
  })

  it('lists it on every web framework’s card and on no native card', () => {
    for (const framework of ['vue', 'svelte', 'solid', 'angular'] as const) {
      expect(line(renderSystemCard(sample, { framework }), 'Checkbox'), framework).toContain(
        ' · agent: check, uncheck',
      )
    }
    for (const platform of ['ios', 'android'] as const) {
      const text = renderSystemCard(sample, { platform })
      expect(text, platform).not.toContain(' · agent: ')
      expect(text, platform).not.toContain(LEGEND)
      expect(agentSegment(member('Checkbox'), platform)).toBeNull()
    }
  })
})
