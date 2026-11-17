import type { MemberDependencies } from './platforms'
import { arr, nullable, obj, rec, str, validate, type Shape } from './shape'

/**
 * The framework map: which members each web framework's vocabulary renders,
 * and how a React prop reads in each of them.
 *
 * The vocabulary is one set of members. `@polymorph/react-ui` ships every
 * member in React. `@polymorph/vue-ui`, `@polymorph/svelte-ui`,
 * `@polymorph/solid-ui` and `@polymorph/angular-ui` ship the members `design/frameworks/<framework>.json`
 * marks native, as components that `pnpm shells` generates from each member's
 * description (`docs/shells.md`). `@polymorph/elements-ui` ships them as custom
 * elements (`<poly-button>`), each one the generated Solid member rendered into
 * an element in the light DOM, for a page written in HTML. A member is `native`
 * in a framework when that framework's vocabulary ships it, and `absent` when
 * it does not, in which case the entry says why.
 *
 * React is implicit. The React vocabulary is what the registry is read from,
 * so every member is native there and no file says so. Every other framework
 * has one file, `design/frameworks/<framework>.json`, and the registry
 * publishes each member's entry. That is what lets the tools answer per
 * framework: the screen validator refuses a member absent in the framework it
 * emits for, the system card leaves it out, and the MCP tools take a
 * framework.
 *
 * A framework differs from a platform. A platform (`platforms.ts`) is where a
 * screen runs, and a screen spec names it. A framework is how a web screen is
 * written, and the same spec emits for either, so it is an option of the
 * emitter and the validator and never a field of the spec.
 *
 * This module holds the map's names, its shape, its law and the React-to-Vue
 * reading of a prop, which the Svelte, Solid, Angular and elements shells read
 * too, and
 * reads no file, so the browser can import it
 * (`@polymorph/registry/frameworks`). The build reads the files
 * (`vocabulary.ts`) and checks them with `frameworkFaults` below, the same
 * function `frameworks.test.ts` runs.
 */

export const FRAMEWORKS = ['react', 'vue', 'svelte', 'solid', 'angular', 'elements'] as const
export type Framework = (typeof FRAMEWORKS)[number]

/** The framework a caller means when it names none: the vocabulary's own. */
export const DEFAULT_FRAMEWORK: Framework = 'react'

/** The frameworks with a map file. React has none, because every member is native there. */
export const MAPPED_FRAMEWORKS = [
  'vue',
  'svelte',
  'solid',
  'angular',
  'elements',
] as const satisfies readonly Framework[]
export type MappedFramework = (typeof MAPPED_FRAMEWORKS)[number]

/**
 * `native`: the framework's vocabulary ships the member. `absent`: it does
 * not, and `reason` says why. There is no `adapted`, because every framework
 * here renders the same web platform with the same recipes.
 */
export const FRAMEWORK_STATUSES = ['native', 'absent'] as const
export type FrameworkStatus = (typeof FRAMEWORK_STATUSES)[number]

/** The package each framework's members are imported from. */
export const FRAMEWORK_VOCABULARY: Readonly<Record<Framework, string>> = {
  react: '@polymorph/react-ui',
  vue: '@polymorph/vue-ui',
  svelte: '@polymorph/svelte-ui',
  solid: '@polymorph/solid-ui',
  angular: '@polymorph/angular-ui',
  elements: '@polymorph/elements-ui',
}

/** The package each framework's vocabulary is built on: the icon gateway, motion and the theme. */
export const FRAMEWORK_FOUNDATION: Readonly<Record<Framework, string>> = {
  react: '@polymorph/react',
  vue: '@polymorph/vue',
  svelte: '@polymorph/svelte',
  solid: '@polymorph/solid',
  angular: '@polymorph/angular',
  elements: '@polymorph/elements',
}

/** How each framework is named in a sentence. */
export const FRAMEWORK_NAMES: Readonly<Record<Framework, string>> = {
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  solid: 'Solid',
  angular: 'Angular',
  elements: 'elements',
}

/**
 * The extension of a file a framework's screen is written in. React and Solid
 * both write TSX, so a `.tsx` path names neither on its own. An Angular screen
 * is a standalone component in a TypeScript module, its template inline. An
 * elements page is HTML, and so is an Angular template, so a `.html` path names
 * neither on its own either.
 */
export const FRAMEWORK_EXTENSIONS: Readonly<Record<Framework, string>> = {
  react: '.tsx',
  vue: '.vue',
  svelte: '.svelte',
  solid: '.tsx',
  angular: '.ts',
  elements: '.html',
}

/**
 * The framework a file's extension names, or `undefined` when it names none
 * alone: `.vue` is Vue, `.svelte` is Svelte and a `.ts` module (not a
 * declaration file) is an Angular component, `.tsx` is React or Solid, and
 * `.html` is an Angular template or an elements page.
 */
export function frameworkOfPath(path: string): Framework | undefined {
  if (path.endsWith(FRAMEWORK_EXTENSIONS.vue)) return 'vue'
  if (path.endsWith(FRAMEWORK_EXTENSIONS.svelte)) return 'svelte'
  if (path.endsWith(FRAMEWORK_EXTENSIONS.angular) && !path.endsWith('.d.ts')) return 'angular'
  return undefined
}

/**
 * The framework a file of application code is read in. Every tool that reads
 * code asks this one function: the MCP server's `validate`, `fix`, `fix_file`
 * and `emit_screen`, and `polymorph check`. So a file `check` passes is the
 * file `fix_file` leaves alone.
 *
 * `asked`, the framework the caller names, wins. Otherwise the extension
 * answers for a `.vue` or `.svelte` file. Three answers need the project. A
 * `.html` file is an elements page in a project that uses the elements and not
 * the Angular vocabulary, and an Angular template otherwise. A `.ts` module is
 * an Angular component in a package that uses the Angular vocabulary, and only
 * then is its inline template read. TSX is Solid's in a package that uses the
 * Solid vocabulary and not the React one. `uses` asks whether the package
 * `path` is in (the project's own package without a path) uses a framework's
 * vocabulary; a project uses one when a `package.json` depends on it or
 * `polymorph.json` records it, because a page with no build has no
 * `package.json`. Without a project to ask it is `null`, and the answer is
 * React's, or Angular's for a `.html` file.
 */
export function codeFrameworkOf(
  asked: Framework | undefined,
  path: string | undefined,
  uses: ((framework: Framework) => boolean) | null,
): Framework {
  if (asked !== undefined) return asked
  if (path !== undefined && path.endsWith(FRAMEWORK_EXTENSIONS.elements)) {
    return uses !== null && uses('elements') && !uses('angular') ? 'elements' : 'angular'
  }
  const named = path === undefined ? undefined : frameworkOfPath(path)
  if (named === 'vue' || named === 'svelte') return named
  if (uses === null) return 'react'
  if (named === 'angular') return uses('angular') ? 'angular' : 'react'
  return uses('solid') && !uses('react') ? 'solid' : 'react'
}

/**
 * How the scaffold's placeholder begins, as on the platform map. An entry whose
 * reason still starts with it is refused, so an author decides.
 */
export const UNDECIDED = 'DECIDE'

/**
 * What an install of one member copies in a framework other than React, read
 * from that framework's generated tree (`readShells` in `install.ts`). The
 * fields mirror a member's own `origin`, `files` and `dependencies`, which
 * describe the React member.
 */
export interface FrameworkShell {
  /**
   * `installed` when an install copies nothing for the member: the
   * framework's foundation ships it (`Icon` is exported by `@polymorph/vue`,
   * `@polymorph/svelte`, `@polymorph/solid`, `@polymorph/angular` and
   * `@polymorph/elements`), or the framework is `elements`, whose page loads
   * every element from the files `polymorph init` copies. `vendored` when its
   * source is copied.
   */
  origin: 'installed' | 'vendored'
  /**
   * The files that declare the member: its component, then its compound parts;
   * in elements, its element's definition module, then its parts'. Empty when
   * the foundation ships it.
   */
  sources: string[]
  /** Its states fixture, or `null`. */
  states: string | null
  dependencies: {
    /** The members its own files compose, without the fixture. */
    components: string[]
    /** The packages its closure imports, without the framework itself. */
    packages: string[]
    /** Every file an install copies with it, its own included. Empty when installed. */
    files: string[]
  }
}

export interface FrameworkEntry {
  status: FrameworkStatus
  /** Why the member is absent, or a note on a native one. Required when `absent`. */
  reason?: string
  /**
   * Published by the registry, never written in a map: for a member native in
   * a mapped framework, what an install of it copies there.
   */
  shell?: FrameworkShell
}

export type MemberFrameworks = Record<Framework, FrameworkEntry>

export interface FrameworkDocument {
  framework: MappedFramework
  members: Record<string, FrameworkEntry>
}

/** Where a framework's map lives, relative to the repository root. */
export const frameworkFile = (framework: MappedFramework): string =>
  `design/frameworks/${framework}.json`

const STATUS: Shape = str({
  enum: FRAMEWORK_STATUSES,
  description:
    '`native`: the framework’s vocabulary ships the member. `absent`: it does not, and ' +
    '`reason` says why.',
})

const REASON: Shape = str({
  description: 'Why it is absent. Required, and not blank, when `absent`.',
})

export const FRAMEWORK_ENTRY: Shape = obj(
  { status: STATUS, reason: REASON },
  { optional: ['reason'] },
)

const FRAMEWORK_SHELL: Shape = obj(
  {
    origin: str({
      enum: ['installed', 'vendored'],
      description:
        '`installed`: an install copies nothing, because the framework’s foundation ships the ' +
        'member, or the framework is `elements`, whose page loads every element from the ' +
        'files `polymorph init` copies. `vendored`: an install copies its source.',
    }),
    sources: arr(
      str({
        description:
          'A file that declares the member: its component, then its parts; in elements, ' +
          'its element’s definition module, then its parts’.',
      }),
    ),
    states: nullable(str({ description: 'The states fixture, vendored with the member.' })),
    dependencies: obj({
      components: arr(str({ description: 'A member its own files compose.' })),
      packages: arr(
        str({ description: 'A package its closure imports, without the framework itself.' }),
      ),
      files: arr(
        str({ description: 'A file an install copies with it, from the framework’s own tree.' }),
      ),
    }),
  },
  {
    description:
      'What an install of the member copies in this framework, read from the framework’s ' +
      'generated tree. Present for a member native in a framework other than React.',
  },
)

/** A member's entry in one framework as the registry publishes it: the map's entry and its shell. */
export const PUBLISHED_FRAMEWORK_ENTRY: Shape = obj(
  { status: STATUS, reason: REASON, shell: FRAMEWORK_SHELL },
  { optional: ['reason', 'shell'] },
)

export const FRAMEWORK_DOCUMENT: Shape = obj({
  framework: str({ enum: MAPPED_FRAMEWORKS }),
  members: rec(FRAMEWORK_ENTRY, {
    description: 'Member -> its entry in this framework. Every member has one, sorted by name.',
  }),
})

/** Every member is native in React, the vocabulary the registry is read from. */
const REACT_ENTRY: FrameworkEntry = { status: 'native' }

/**
 * The entry a ladder primitive gets in a framework whose file does not name
 * it. The primitives (`Bespoke`, `DensityScope`, `ToneScope`) may have an
 * entry and need not: a framework that has no shell for a rung cannot open it,
 * so the reading that refuses is the safe one.
 */
const unmapped = (framework: MappedFramework): FrameworkEntry => ({
  status: 'absent',
  reason: `${frameworkFile(framework)} has no entry for it`,
})

const byName = (a: string, b: string) => a.localeCompare(b)

/** `A`, `A and B`, `A, B and C`. */
const listed = (names: readonly string[]): string =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/**
 * Every way the framework files fail the map's law, as sentences that name the
 * file and the member.
 *
 * `members` is the gallery as the registry builds it, and every one of them
 * has an entry in every file. `primitives` are the ladder's primitives, which
 * may have an entry. `documents` is each file's parsed JSON, or `undefined`
 * for a file that does not exist. `composes` is, per framework, every member
 * an install of each member copies there: what its files compose and what its
 * fixture builds, read from that framework's own tree. Only the build reads
 * the tree, and it needs the map to know which members to read, so it checks
 * the map without `composes` first and with it once the tree is read. Without
 * it, the clause about composition is not checked.
 *
 * The law, per file: it has the shape above and names its own framework;
 * every member has an entry and no entry names something that is neither a
 * member nor a primitive; the entries are sorted by name; no entry still
 * carries the scaffold's `DECIDE` placeholder; an `absent` entry says why, in
 * words; and a `native` member composes no member absent there, because an
 * install of it copies that member's files, which the framework does not ship.
 */
export function frameworkFaults(
  members: readonly string[],
  documents: Partial<Record<MappedFramework, unknown>>,
  primitives: readonly string[] = [],
  composes?: Partial<Record<MappedFramework, MemberDependencies>>,
): string[] {
  const faults: string[] = []
  const known = new Set([...members, ...primitives])

  for (const framework of MAPPED_FRAMEWORKS) {
    const file = frameworkFile(framework)
    const document = documents[framework]
    if (document === undefined) {
      faults.push(`${file}: missing — every framework but React has a map`)
      continue
    }

    const shapeFaults = validate(FRAMEWORK_DOCUMENT, document, file)
    if (shapeFaults.length > 0) {
      faults.push(...shapeFaults)
      continue
    }

    const map = document as FrameworkDocument
    const say = (message: string) => faults.push(`${file}: ${message}`)

    if (map.framework !== framework) {
      say(`names its framework "${map.framework}" — the file is the map for ${framework}`)
    }

    const names = Object.keys(map.members)
    for (const name of members) {
      if (!Object.hasOwn(map.members, name)) {
        say(`no entry for ${name} — every member has one in every framework`)
      }
    }
    for (const name of names) {
      if (!known.has(name)) say(`${name} is not a member of the vocabulary`)
    }

    const sorted = [...names].sort(byName)
    const first = names.findIndex((name, at) => name !== sorted[at])
    if (first !== -1) {
      say(`entries are not sorted by name — ${sorted[first]} belongs before ${names[first]}`)
    }

    for (const [name, entry] of Object.entries(map.members)) {
      if (entry.reason?.startsWith(UNDECIDED)) {
        say(
          `${name} still has the scaffold’s ${UNDECIDED} placeholder — decide whether ${framework} ` +
            'ships it',
        )
        continue
      }
      if (entry.status === 'absent' && entry.reason === undefined) {
        say(`${name} is absent and does not say why (\`reason\`)`)
      } else if (entry.reason !== undefined && entry.reason.trim() === '') {
        say(`${name} has a blank reason — say why, or leave \`reason\` out of a native entry`)
      }
      const copied = composes?.[framework]?.[name]
      if (entry.status === 'native' && copied !== undefined) {
        // A primitive without an entry is absent (`unmapped`).
        const absent = copied.filter(
          (composed) => (map.members[composed]?.status ?? 'absent') === 'absent',
        )
        if (absent.length > 0) {
          say(
            `${name} is native but composes ${listed(absent)}, absent in ${framework} — an ` +
              `install of it would copy files ${framework} does not ship; give ` +
              `${absent.length === 1 ? 'it' : 'them'} a shell, or mark ${name} absent and say why`,
          )
        }
      }
    }
  }

  return faults
}

/**
 * Each name's entries, keyed by name, from documents that passed
 * `frameworkFaults`. A primitive the file does not name is absent there.
 */
export function frameworksByMember(
  names: readonly string[],
  documents: Record<MappedFramework, FrameworkDocument>,
): Map<string, MemberFrameworks> {
  return new Map(
    names.map((name) => [
      name,
      {
        react: REACT_ENTRY,
        ...Object.fromEntries(
          MAPPED_FRAMEWORKS.map((framework) => [
            framework,
            documents[framework].members[name] ?? unmapped(framework),
          ]),
        ),
      } as MemberFrameworks,
    ]),
  )
}

/* -------------------------------------------------------------------------- */
/* A React prop, read in Vue                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What a React prop is in a Vue member, by its name and its printed type.
 *
 * The mapping is fixed (`docs/frameworks.md`), and this function is it, so the
 * screen emitters and the shells read a prop the same way. Svelte keeps every
 * prop under its React name and reads the same kinds: a slot is a snippet prop
 * there, and a scoped slot a snippet with its argument.
 *
 *  - `children` is the default slot.
 *  - `onFoo` is the emitted event `foo`, with the same single payload.
 *  - a prop typed `ReactNode` or `ReactElement` is the named slot of the same
 *    name.
 *  - a render prop, a function that returns a node, is the scoped slot of the
 *    same name, and its argument is the slot's props.
 *  - anything else is the prop of the same name and type.
 */
export type VueBinding =
  | { kind: 'prop'; name: string }
  | { kind: 'event'; name: string }
  | { kind: 'slot'; name: string }
  | { kind: 'scoped-slot'; name: string }

/** A type the React vocabulary renders as a node. */
const NODE_TYPE = /^(React\.)?(ReactNode|ReactElement|ReactPortal)\b|^JSX\.Element\b/

/**
 * The top-level members of a printed union, without `undefined`:
 * `((value: string) => void) | undefined` -> `['((value: string) => void)']`.
 * Brackets and quotes are tracked, so a `|` inside a generic, an object type,
 * a parameter list or a string literal does not split.
 */
export function unionParts(printed: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let at = 0; at < printed.length; at += 1) {
    const char = printed[at] as string
    if (quote !== null) {
      if (char === '\\') at += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if ('(<{['.includes(char)) depth += 1
    else if (')}]'.includes(char) || (char === '>' && printed[at - 1] !== '=')) depth -= 1
    else if (char === '|' && depth === 0) {
      parts.push(printed.slice(start, at).trim())
      start = at + 1
    }
  }
  parts.push(printed.slice(start).trim())
  return parts.filter((part) => part !== '' && part !== 'undefined')
}

/** The part without the parentheses a union wraps a function type in. */
function unwrapped(part: string): string {
  let text = part
  while (text.startsWith('(') && closing(text, 0) === text.length - 1)
    text = text.slice(1, -1).trim()
  return text
}

/** The index of the bracket that closes the one at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0
  for (let at = open; at < text.length; at += 1) {
    const char = text[at] as string
    if ('(<{['.includes(char)) depth += 1
    else if (')}]'.includes(char) || (char === '>' && text[at - 1] !== '=')) {
      depth -= 1
      if (depth === 0) return at
    }
  }
  return -1
}

/** A function type's return type, or `null` when the part is not a function type. */
function returnType(part: string): string | null {
  let text = unwrapped(part)
  if (text.startsWith('<')) {
    const end = closing(text, 0)
    if (end === -1) return null
    text = text.slice(end + 1).trim()
  }
  if (!text.startsWith('(')) return null
  const end = closing(text, 0)
  if (end === -1) return null
  const rest = text.slice(end + 1).trim()
  return rest.startsWith('=>') ? rest.slice(2).trim() : null
}

const rendersNode = (printed: string): boolean =>
  unionParts(printed).some((part) => NODE_TYPE.test(unwrapped(part)))

export function vueBinding(prop: { name: string; type: string }): VueBinding {
  const parts = unionParts(prop.type)
  const renderProp = parts.some((part) => {
    const returns = returnType(part)
    return returns !== null && rendersNode(returns)
  })

  if (prop.name === 'children') {
    return { kind: renderProp ? 'scoped-slot' : 'slot', name: 'default' }
  }
  if (/^on[A-Z]/.test(prop.name)) {
    const event = prop.name.slice(2)
    return { kind: 'event', name: event.charAt(0).toLowerCase() + event.slice(1) }
  }
  if (renderProp) return { kind: 'scoped-slot', name: prop.name }
  if (parts.some((part) => NODE_TYPE.test(unwrapped(part))))
    return { kind: 'slot', name: prop.name }
  return { kind: 'prop', name: prop.name }
}
