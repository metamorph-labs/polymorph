import type { Registry } from './build'
import { CONVENTION_PROPS, optionsCarrier, TIER_ORDER, TIER_TITLE, wrapped } from './card-parts'
import { DEFAULT_FRAMEWORK, FRAMEWORK_NAMES, shippedParts, type Framework } from './frameworks'
import { DEFAULT_PLATFORM, NO_SUBSTITUTE, PLATFORM_STATUSES, type Platform } from './platforms'

/**
 * The system card: the whole vocabulary, compressed to fit an agent's context
 * window.
 *
 * The registry is the full catalogue, and the card summarises it. The card
 * differs by what it *leaves out*, and every omission is deliberate:
 *
 *  - **Prop names, not prop types.** "Button takes `variant`, `tone`, `size`"
 *    tells an agent that a button is configured, not styled. The union a
 *    variant accepts is a lookup, and lookups belong to the registry.
 *  - **No file paths.** An agent reads the card to decide *what* to compose.
 *    Where the source lives matters only to the installer.
 *  - **The conventions once.** Every governed control takes the same four ARIA
 *    hooks and `children`. Repeating them on every control would spend a large
 *    share of the budget on one sentence.
 *
 * The budget is a law (`card.test.ts`). A card that grew past a context window
 * would fail without any error: the agent would receive less of the system
 * than expected and write code against the part it saw.
 */

/**
 * Characters per token, the usual approximation for English prose.
 *
 * It is a named constant so the assumption is visible. No tokenizer is a
 * dependency here, so the budget is enforced in characters and *reported* in
 * tokens. If the ratio is wrong for a given model, only the reported number
 * changes, not the limit. That is why the law asserts on characters.
 */
export const CHARS_PER_TOKEN = 4

export const estimateTokens = (card: string) => Math.ceil(card.length / CHARS_PER_TOKEN)

export interface CardOptions {
  /**
   * The platform the vocabulary section is rendered for. Members absent there
   * are left out, and an adapted member says how it renders. Defaults to
   * `web`, where every member exists.
   */
  platform?: Platform
  /**
   * The web framework the card is written for. For `vue`, `svelte`, `solid`,
   * `angular` or `elements`, the paragraph on what a consumer installs names
   * that framework's packages and how a prop reads there, and members without a
   * shell in it are left out. It replaces text rather than adding to it, so such
   * a card is never longer than the React one. Defaults to `react`.
   */
  framework?: Framework
}

/**
 * What each native platform renders with, named on the card's line on picking a
 * platform: the UI toolkit and the module an app imports the members from.
 */
const NATIVE_RENDERERS: Partial<Record<Platform, string>> = {
  ios: 'SwiftUI (`PolymorphUI`)',
  android: 'Compose (`dev.polymorph.ui`)',
}

/** What a consumer installs, for each framework. The others also say how a prop reads. */
const INSTALLS: Record<Framework, string[]> = {
  react: [
    'A consumer installs `@polymorph/engine` (theme engine, runtime, Vite plugin),',
    '`@polymorph/react` (the React foundation: icon gateway, motion) and',
    '`@polymorph/rules` (the red rules), and either imports members from',
    '`@polymorph/react-ui` or vendors their source with `polymorph add`.',
  ],
  vue: [
    'A Vue app installs `@polymorph/engine`, `@polymorph/vue` and `@polymorph/rules`,',
    'and imports members from `@polymorph/vue-ui` (only those with a Vue shell are',
    'listed). Props keep their names; `onFoo` is `@foo`, a node prop is slot `#foo`.',
  ],
  svelte: [
    'A Svelte app installs `@polymorph/engine`, `@polymorph/svelte` and `@polymorph/rules`,',
    'and imports members from `@polymorph/svelte-ui` (only those with a Svelte shell are',
    'listed). Props keep their React names; a node prop is snippet `foo`.',
  ],
  solid: [
    'A Solid app installs `@polymorph/engine`, `@polymorph/solid` and `@polymorph/rules`,',
    'and imports members from `@polymorph/solid-ui` (only those with a Solid shell are',
    'listed). Props keep their React names; a node prop is a `JSX.Element`.',
  ],
  angular: [
    'An Angular app installs `@polymorph/engine`, `@polymorph/angular` and `@polymorph/rules`,',
    'and imports members from `@polymorph/angular-ui` (only those with an Angular shell are',
    'listed). A member is an element, `<pm-button>`; `onFoo` is `(foo)`, a node prop is `slot="foo"`.',
  ],
  elements: [
    'A page with no build loads the files `polymorph init --framework elements` copies;',
    'an app with a build imports members from `@polymorph/elements-ui` (only those with an',
    'element are listed). A member is an element, `<poly-button>`: a prop is its kebab',
    'attribute (`icon-only`), data a JSON attribute, a node prop a child with `slot="foo"`,',
    '`onFoo` the event `poly-foo`, and a function a property set from script.',
  ],
}

/**
 * The ten usage rules a designer set for Button and icons, each marked by what
 * holds it: the system (held), a red rule that the validation of a screen
 * spec repeats (checked), or nothing (guidance). An agent reads the card
 * before it writes a screen, and the two rules about meaning are ones no tool
 * can check, so the card is where it is told them. The trailing roles are
 * read from the registry, which reads them from `design/icons.json`.
 */
function usageLines(registry: Registry): string[] {
  const trailing = registry.icons.trailing
  const roles = `${trailing.slice(0, -1).join(', ')} and ${trailing[trailing.length - 1] ?? ''}`
  return [
    '## Button and icon usage',
    '',
    'Held by the system, checked by a rule and by a screen spec’s validation, or guidance',
    'nothing checks:',
    '',
    '1. Guidance: an icon’s role means the action it stands for.',
    '2. Held: a glyph takes its text’s colour, so red text has a red icon.',
    '3. Held: an icon is a role, never a glyph, so one action draws one icon everywhere.',
    '4. Held: an icon-only Button shows its `label` as a tooltip on hover and focus.',
    `5. Checked (\`trailing-icon\`): an icon leads its text; only ${roles} trail it.`,
    '6. Held: a disabled control fades its icon with its text.',
    '7. Checked (`danger-last`): within one group of Buttons placed together, a danger Button',
    '   comes last. A destructive action in a group of its own, apart from the group that holds',
    '   the main Button, may come first. Held: no member gives it focus when a dialog opens.',
    '8. Checked (`one-main-button`): one solid accent Button, the default, per Dialog, Drawer,',
    '   Popover, Card or Dashboard.Panel; another action there is `outline` or `ghost`.',
    '9. Guidance: a label says what happens ("Delete volume", not "OK").',
    '10. Guidance: a status has a word, never colour alone. Badge takes its text, Progress a',
    '    `label` that says it, and a field in error FormField’s `error`.',
  ]
}

/**
 * How another library's component is hosted, which an agent needs before it
 * reaches for a map or an editor: the boundary by the name the framework
 * writes it, what it lifts, and the two ways the theme reaches the library.
 */
function hostingLines(framework: Framework): string[] {
  const foundation = framework === 'react' ? '@polymorph/react' : `@polymorph/${framework}`
  // A page loads the library's script itself, and the engine's reader takes the place of the hook.
  if (framework === 'elements') {
    return [
      "Another library's component (a map, an editor, a grid) goes inside",
      '`<poly-third-party library="…" reason="…">`, and what it holds takes a `style`. Give it the',
      `theme as \`var(--pm-…)\`, or as data from \`readThemeValues()\` (\`${foundation}\`). Write no`,
      'colour; controls and icons stay members.',
    ]
  }
  const boundary =
    framework === 'angular'
      ? '`<pm-third-party library="…" reason="…">`'
      : '`<ThirdParty library="…" reason="…">`'
  return [
    `Another library's component (a map, an editor, a grid) goes inside ${boundary}: its file may`,
    'import that library and its stylesheet, and what it holds takes a `style`. Give it the theme',
    `as \`var(--pm-…)\`, or as data from \`useThemeValues()\` (\`${foundation}\`). Write no colour;`,
    'controls and icons stay members.',
  ]
}

/**
 * What a call site cannot style on a member, for each framework: the props or
 * attributes it might try, and why each does nothing or is refused. React's
 * also states the client directive rule, which no other framework has.
 *
 * Angular's is the one that is refused rather than ignored. A static `class`
 * or `style` on `<pm-x>` lands on the host element, where an inherited
 * property reaches the member's content, and Angular ranks a template's
 * styling above the host's own `display: contents`. An element's `class` or
 * `style` lands on its host the same way, and nothing refuses it, because the
 * red rules do not read HTML.
 */
const MEMBER_CONTRACT: Record<Framework, string[]> = {
  react: [
    'Every governed component omits `className`, `style` and `css` from its public',
    'props. State surfaces as `data-*` attributes for CSS and tests, never as class',
    'names. Rest state is the *absence* of `data-state`.',
    '',
    "`'use client'` runs both directions: a component that calls a hook or takes a",
    'handler must carry the directive, and a purely static one must not.',
  ],
  vue: [
    'A member declares no `class` or `style` and inherits no attributes, so either on',
    'a member does nothing. State surfaces as `data-*` attributes for CSS and tests,',
    'never as class names. Rest state is the *absence* of `data-state`.',
  ],
  svelte: [
    'A member declares no `class` or `style` and ignores a prop it does not declare, so',
    'either on a member does nothing. State surfaces as `data-*` attributes for CSS and',
    'tests, never as class names. Rest state is the *absence* of `data-state`.',
  ],
  solid: [
    'A member declares no `class`, `classList` or `style` and ignores a prop it does not',
    'declare, so each on a member does nothing. State surfaces as `data-*` attributes',
    'for CSS and tests, never as class names. Rest state is the *absence* of `data-state`.',
  ],
  angular: [
    'A member’s host element draws no box (`display: contents`). A `class` or `style` on a',
    'member is outside its contract: the red rules remove a static one and report a bound',
    'one. State surfaces as `data-*` attributes for CSS and tests, never as class names.',
    'Rest state is the *absence* of `data-state`.',
  ],
  elements: [
    'A member’s element draws no box (`display: contents`). A `class` or `style` on it is',
    'outside its contract: an inherited property reaches the member’s content, and the red',
    'rules do not read HTML to report it. State surfaces as `data-*` attributes for CSS and',
    'tests, never as class names. Rest state is the *absence* of `data-state`.',
  ],
}

/**
 * Where a member is added. A member is written once, in React, with a
 * description from which `pnpm shells` writes every other framework's.
 */
function addingLines(framework: Framework): string[] {
  if (framework === 'react') {
    return [
      'Adding a member: `pnpm new:member <Name>` scaffolds its files and wires every',
      'list that has to know; `CONTRIBUTING.md` has the steps.',
    ]
  }
  return wrapped(
    'Adding a member is done in polymorph: `pnpm new:member <Name>` scaffolds the React ' +
      `member and its description, from which \`pnpm shells\` writes the ${FRAMEWORK_NAMES[framework]} ` +
      'one; `CONTRIBUTING.md` has the steps.',
    80,
  )
}

type CardComponent = Registry['components'][number]
type CardProp = CardComponent['props'][number]

/** Prop names, `*` marking a required one, without the conventions stated once. */
function propNames(props: readonly CardProp[]): string[] {
  return props
    .filter((prop) => !CONVENTION_PROPS.has(prop.name))
    .map((prop) => (prop.optional ? prop.name : `${prop.name}*`))
}

/** `Label: a, b*`, or the label alone when it takes nothing the card lists. */
const labelled = (label: string, names: readonly string[]) =>
  names.length === 0 ? label : `${label}: ${names.join(', ')}`

/**
 * What an agent on the page may do with a member, then what it reads, on a
 * web card: `agent: check, uncheck | checked, disabled`. A secret state is
 * marked, because an agent asked for it gets `{ secret: true }`. `null` for a
 * member agents cannot see, and on a native card, where there is no agent
 * bridge. The names are the whole segment: the types, parts and handlers are
 * in the registry's `agent` field.
 */
export function agentSegment(component: CardComponent, platform: Platform): string | null {
  if (component.agent === null || platform !== DEFAULT_PLATFORM) return null
  const actions = component.agent.actions.map((action) => action.name)
  const states = component.agent.states.map((state) =>
    state.secret ? `${state.name} (secret)` : state.name,
  )
  const read = states.length === 0 ? '' : `${actions.length === 0 ? '' : ' '}| ${states.join(', ')}`
  return `agent: ${actions.join(', ')}${read}`
}

/**
 * Said once above the vocabulary on a card that lists an `agent:` segment, so
 * each segment is names alone.
 */
const AGENT_LEGEND =
  'An `agent:` segment names what an agent on the page may run (`@polymorph/engine/agent`), ' +
  'then after `|` what it reads, never a `(secret)` value. A member without one is hidden ' +
  'from agents.'

/**
 * One member: its props, then each compound part's (`Table.Row: selected`),
 * then, on React's web card, the member's other exports (`ToastNotice: …`).
 *
 * A function export whose options are the member's props carries them, because
 * the member has no component of its name: Toast's props are `toast()`'s. An
 * export whose props are all the member's own (`ToastFormField` beside
 * FormField) is listed by name. Another framework's card and a native
 * platform's card leave the exports out, because they are React's: SwiftUI's
 * and Compose's Toast is a member whose props are the options.
 */
function componentLine(component: CardComponent, platform: Platform, framework: Framework): string {
  const entry = component.platforms[platform]
  const adapted = entry.status === 'adapted' ? ` (adapted: ${entry.as ?? ''})` : ''
  // A part's props are listed with the part.
  const own = component.props.filter((prop) => !prop.name.includes('.'))
  const named = (props: readonly CardProp[]) => new Set(props.map((prop) => prop.name))
  const ownNames = named(own)
  const exported = framework === 'react' && platform === DEFAULT_PLATFORM ? component.exports : []
  const carrier = exported.length === 0 ? undefined : optionsCarrier(component)

  const segments: string[] = []
  if (carrier === undefined) {
    if (propNames(own).length > 0) segments.push(propNames(own).join(', '))
  } else {
    segments.push(labelled(`${carrier.name}()`, propNames(own)))
    if (carrier.members.length > 0) segments.push(`${carrier.name}.{${carrier.members.join(', ')}}`)
  }
  for (const part of shippedParts(component, platform, framework)) {
    segments.push(labelled(`${component.name}.${part.name}`, propNames(part.props)))
  }
  for (const other of exported) {
    if (other === carrier) continue
    const label = other.kind === 'function' ? `${other.name}()` : other.name
    const same = other.props.every((prop) => ownNames.has(prop.name))
    segments.push(labelled(label, same ? [] : propNames(other.props)))
  }

  const agent = agentSegment(component, platform)
  if (agent !== null) segments.push(agent)

  const grid =
    component.grid === null
      ? ''
      : ` · lawful cells: ${Object.entries(component.grid)
          .map(([variant, tones]) => `${variant}(${tones.join('|')})`)
          .join(' ')}`

  const purpose = component.purpose === '' ? '' : ` — ${component.purpose}`
  const surface = segments.map((segment) => ` · ${segment}`).join('')
  return `- **${component.name}**${adapted}${purpose}${surface}${grid}`
}

/**
 * One line per platform: how many members are native, adapted and absent
 * there, and each absent member with its substitute. The substitutes are the
 * part an agent cannot infer, so they are named rather than counted. Members
 * that share a substitute share a clause, which keeps a platform without
 * charts to one clause instead of nine.
 */
function platformLines(registry: Registry): string[] {
  const members = [...registry.components, ...registry.exceptions.primitives]
  return registry.platforms.map((platform) => {
    const counts = PLATFORM_STATUSES.map(
      (status) =>
        `${members.filter((member) => member.platforms[platform].status === status).length} ${status}`,
    ).join(' · ')

    const bySubstitute = new Map<string, string[]>()
    for (const member of members) {
      const entry = member.platforms[platform]
      if (entry.status !== 'absent') continue
      const substitute = entry.substitute ?? NO_SUBSTITUTE
      bySubstitute.set(substitute, [...(bySubstitute.get(substitute) ?? []), member.name])
    }
    const clauses = [...bySubstitute]
      .map(([substitute, names]) => {
        const listed = names.sort((a, b) => a.localeCompare(b)).join(', ')
        return substitute === NO_SUBSTITUTE
          ? `${listed} (no substitute)`
          : `${listed} → ${substitute}`
      })
      .sort((a, b) => a.localeCompare(b))

    return `- **${platform}** — ${counts}${clauses.length === 0 ? '' : ` (${clauses.join('; ')})`}`
  })
}

/**
 * Prints a colour family as a product when it is one, and in full when it is
 * not.
 *
 * The four status tones have the same ten roles each. Writing the grid out
 * repeats the four tone names for each of the ten suffixes (`danger.solid,
 * warning.solid, success.solid, info.solid`, and so on), which costs the card
 * six hundred characters. Brace notation is the same list, factored. No role is
 * lost, and a reader expands it without instructions. A family that is not a
 * clean product stays in the long form, for example `gradient`, whose two roles
 * come from two families. A factoring with inaccurate terms is worse than the
 * long form.
 */
export function factored(roles: string[]): string {
  const groups = new Map<string, string[]>()
  for (const role of roles) {
    const dot = role.indexOf('.')
    if (dot === -1) return roles.join(', ')
    const prefix = role.slice(0, dot)
    groups.set(prefix, [...(groups.get(prefix) ?? []), role.slice(dot + 1)])
  }

  const [first, ...rest] = [...groups.values()]
  if (groups.size < 2 || first === undefined) return roles.join(', ')
  const same = rest.every(
    (suffixes) =>
      suffixes.length === first.length && suffixes.every((suffix, at) => suffix === first[at]),
  )
  if (!same) return roles.join(', ')

  return `{${[...groups.keys()].join(', ')}}.{${first.join(', ')}}`
}

export function renderSystemCard(registry: Registry, options: CardOptions = {}): string {
  const platform = options.platform ?? DEFAULT_PLATFORM
  const framework = options.framework ?? DEFAULT_FRAMEWORK
  const natives = registry.platforms
    .filter((name) => name !== DEFAULT_PLATFORM)
    .map((name) => `${name} renders ${NATIVE_RENDERERS[name] ?? name}`)
  const out: string[] = []
  const write = (...lines: string[]) => out.push(...lines)

  write(
    '# Polymorph — system card',
    '',
    'A closed vocabulary of governed components plus a theme engine. Application',
    'code composes components and binds content; it expresses no style. Colour,',
    'space, type, shape and motion are decided by the theme and reached only',
    'through component props, which are typed enums, so no value is off a scale.',
    'A value the theme does not derive goes in the system or palette document;',
    'app CSS declares no `--pm-*` property.',
    '',
    `Generated from source; prop types, anatomies, file paths and closures are in`,
    `the registry (\`${registry.schema}\`).`,
    '',
    ...INSTALLS[framework],
    '',
    ...wrapped(
      'One vocabulary, rendered for every framework and platform. A web app picks the ' +
        `framework it is written in: ${registry.frameworks.join(', ')} (this card is ` +
        `${framework}${framework.endsWith('s') ? "'" : "'s"}); \`get_system_card\` takes a \`framework\`, and ` +
        '`polymorph init --framework` writes an app in it. A native screen picks its ' +
        `platform: ${natives.join(', ')}; Platforms below says what each renders.`,
      80,
    ),
    '',
    ...addingLines(framework),
    '',
    '## The rules that will stop you',
    '',
  )

  for (const law of registry.laws) {
    const where = law.stage === null ? law.applies : `${law.applies}, stage ${law.stage}`
    write(`- \`${law.name}\` (${where}) — ${law.summary}`)
  }

  write(
    '',
    ...MEMBER_CONTRACT[framework],
    '',
    ...usageLines(registry),
    '',
    '## When the vocabulary has no word for it',
    '',
    'The exception ladder — always take the highest rung that works. An undeclared',
    'deviation is the only forbidden one.',
    '',
  )

  for (const rung of registry.exceptions.ladder) {
    const marker = rung.declaredAs === null ? '' : ` (\`${rung.declaredAs}\`)`
    write(`${rung.rung}. **${rung.name}**${marker} — ${rung.summary}.`)
  }

  // The boundary is a web member: its rules are lint rules for web code.
  if (platform === DEFAULT_PLATFORM) write('', ...hostingLines(framework))

  write(
    '',
    '## The vocabulary',
    '',
    'Props are listed by name; `*` marks required. Every component additionally',
    'accepts `children` where it has a slot and the four ARIA hooks a `FormField`',
    'wires (`aria-label`, `aria-labelledby`, `aria-describedby`, `aria-required`).',
    'Inside AppShell, each route renders one page archetype.',
    '',
  )

  if (platform !== DEFAULT_PLATFORM) {
    write(
      `Rendered for **${platform}**: members absent there are left out (see Platforms), and an`,
      'adapted member says how it renders.',
      '',
    )
  }

  const present = registry.components.filter(
    (component) =>
      component.platforms[platform].status !== 'absent' &&
      component.frameworks[framework].status !== 'absent',
  )
  if (present.some((component) => agentSegment(component, platform) !== null)) {
    write(...wrapped(AGENT_LEGEND, 80), '')
  }
  const tiers = [...new Set([...TIER_ORDER, ...present.map((c) => c.tier)])]
  for (const tier of tiers) {
    const members = present.filter((component) => component.tier === tier)
    if (members.length === 0) continue
    write(`### ${TIER_TITLE[tier] ?? tier}`, '')
    for (const component of members) write(componentLine(component, platform, framework))
    write('')
  }

  write(
    '## Platforms',
    '',
    'On a platform a member is native (its own form, from the platform’s primitives),',
    'adapted (rendered another way) or absent (use the substitute). `get_system_card` and',
    '`search_components` take a `platform`; a screen spec names one.',
    '',
    ...platformLines(registry),
    '',
  )

  write(
    '## Icon roles',
    '',
    'Closed enum of *meanings*, never glyph names. Sizes: ' + `${registry.icons.sizes.join(', ')}.`,
    '',
    registry.icons.roles.map((role) => role.name).join(', ') + '.',
    '',
    '## Theme — systems, palettes, pairings',
    '',
    'A **system** is the structural personality: the eight axes below, three font',
    'slots, presentation defaults. A **palette** is the colour voice: accent hue,',
    'optional gradient partner, neutral tint, chroma budget. A **pairing** is one of',
    'each, worn by the DOM (`data-system` + `data-palette`); every palette is lawful',
    'on every system, and everything else derives from those decisions.',
    '',
    '**Axes.**',
    '',
  )

  for (const axis of registry.theme.axes) {
    const exposed = axis.exposed ? ' *(exposed to recipes as a flag)*' : ''
    write(`- **${axis.name}** — ${axis.values.join(' | ')}${exposed}`)
  }

  write('', '**Systems.** `(kind, mode) — default palette · axes` in the order above.', '')
  for (const system of registry.theme.systems) {
    const axes = registry.theme.axes.map((axis) => system.axes[axis.name]).join(', ')
    write(
      `- **${system.name}** (${system.kind}, ${system.defaultMode}) — ${system.defaultPalette} · ${axes}`,
    )
  }

  write('', '**Palettes.**', '')
  for (const palette of registry.theme.palettes) {
    const gradient = palette.gradientHue === undefined ? '' : ` · gradient ${palette.gradientHue}`
    write(
      `- **${palette.name}** — accent ${palette.accentHue}${gradient} · tint ` +
        `${palette.neutralTint} · ${palette.chromaBudget} chroma`,
    )
  }

  write('')

  write('## Token families', '', '**Colour roles.** Every fill, text and edge.', '')
  for (const [family, roles] of Object.entries(registry.theme.colorRoles)) {
    write(`- **${family}** — ${factored(roles)}`)
  }

  write('', '**Scales.** Every measure. A prop takes a step, never a value.', '')
  for (const [scale, steps] of Object.entries(registry.theme.scales)) {
    // The space scale is the only one that prints its magnitudes. A step name
    // gives the step's position but not the distance between steps, and an
    // agent asked for a 24px mark cannot find step 6 without them.
    const px =
      scale === 'space'
        ? ` → ${steps
            .map((step) => (registry.theme.standardDensity.space[step] ?? '').replace(/px$/, ''))
            .join(' ')}px at standard density`
        : ''
    write(`- **${scale}** — ${steps.join(', ')}${px}`)
  }

  const { controlHeight } = registry.theme.standardDensity
  write(
    '',
    `Control heights: sm ${controlHeight['sm']} · md ${controlHeight['md']} · lg ${controlHeight['lg']}. Density rescales space and ` +
      'controls and nothing else, on a 2px grid.',
    '',
    `Each token resolves to a \`--pm-*\` custom property — ${registry.theme.customProperties.length} of them ` +
      'across the shipped pairings, and component CSS may reference nothing else.',
    'The only literals it may write are structural rather than aesthetic: `0`, `1px`',
    'and `2px` hairlines, `100%` and `200%`, `9999px` for a pill, `auto`, `none`,',
    '`transparent`, viewport units, `currentcolor` and the CSS-wide keywords.',
    '',
  )

  return out.join('\n')
}
