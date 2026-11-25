import { optionsCarrier } from './card-parts'
import { controlledProps, FRAMEWORKS, type Framework, type FrameworkStatus } from './frameworks'
import { PLATFORMS, type Platform, type PlatformStatus } from './platforms'

/**
 * The vocabulary table a screen is checked and drawn with at run time
 * (`@polymorph/screen`): the part of the registry that `validateSpec` and the
 * run-time walk read, and nothing else.
 *
 * The registry is two megabytes and is built with the TypeScript compiler. A
 * page that checks a document a model wrote needs neither. It needs each
 * member's name, tier, purpose, props with their printed types, parts, lawful
 * cells, its entry on each platform and in each framework, and the icon
 * roles with the ones a trailing icon may take, which is what `validateSpec` reads (`SpecVocabulary` in
 * `packages/spec/src/validate.ts`). The walk also reads each member's
 * controlled props (`controlledProps`, the rule the elements follow) and,
 * in React, the function a call site calls in a member's place. The run-time
 * card reads the named data types the props take, with their fields.
 *
 * `pnpm registry` writes the table into `packages/screen/src/vocabulary.gen.ts`
 * in a compact form (`compactTable`), and the screen package expands it once
 * when it loads (`expandTable`). Both directions live here, beside the
 * registry the table is read from. `packages/screen/src/parity.test.ts` holds
 * the expanded table to the registry: every document gets the same faults
 * from both.
 *
 * This module reads no file, so the browser can import it
 * (`@polymorph/registry/screen-table`).
 */

/* -------------------------------------------------------------------------- */
/* The table                                                                  */
/* -------------------------------------------------------------------------- */

export interface TableProp {
  readonly name: string
  /** The printed TypeScript type, as the registry prints it. */
  readonly type: string
  readonly optional: boolean
}

/** A member's entry on one platform. Only an absent one says why and names a substitute. */
export interface TablePlatformEntry {
  readonly status: PlatformStatus
  readonly reason?: string
  readonly substitute?: string
}

/**
 * A member's entry in one web framework. Only an absent one says why. `shell`
 * names the files the framework's shell declares, without their directory and
 * extension, which is what `shippedParts` reads to find the parts a framework
 * carries; it is left out where the answer is React's.
 */
export interface TableFrameworkEntry {
  readonly status: FrameworkStatus
  readonly reason?: string
  readonly shell?: { readonly sources: readonly string[] }
}

/** A compound part: its name in its member (`Row` for `Table.Row`), its props and its controlled pairs. */
export interface TablePart {
  readonly name: string
  readonly props: readonly TableProp[]
  readonly controlled: Readonly<Record<string, string>>
}

export interface TableMember {
  readonly name: string
  readonly tier: string
  readonly purpose: string
  /** Its own props, and the props of the parts a native contract carries, named `Part.prop`. */
  readonly props: readonly TableProp[]
  readonly parts: readonly TablePart[]
  readonly grid: Readonly<Record<string, readonly string[]>> | null
  readonly platforms: Readonly<Record<Platform, TablePlatformEntry>>
  readonly frameworks: Readonly<Record<Framework, TableFrameworkEntry>>
  /** Each controlled prop with the event prop that reports its change (`controlledProps`). */
  readonly controlled: Readonly<Record<string, string>>
  /**
   * The function a React call site calls in the member's place (`toast` for
   * Toast), or `null`. React has no component of the member's name then, so a
   * document drawn in React cannot draw it.
   */
  readonly call: string | null
}

export interface TablePrimitive {
  readonly name: string
  /** The rung of the exception ladder it is. */
  readonly rung: number
  readonly purpose: string
  readonly props: readonly TableProp[]
  readonly platforms: Readonly<Record<Platform, TablePlatformEntry>>
  readonly frameworks: Readonly<Record<Framework, TableFrameworkEntry>>
  readonly controlled: Readonly<Record<string, string>>
}

/**
 * A named data type a member's props take (`SelectOption`), with its fields:
 * what the run-time card prints so a model can write one.
 */
export interface TableDataType {
  readonly name: string
  /** Its type parameters: `Row` for `DataTableColumn<Row>`. */
  readonly params: readonly string[]
  /** For a union of named data types (`MenuEntry`): their names; `fields` is empty then. */
  readonly union?: readonly string[]
  readonly fields: readonly TableProp[]
}

/** The table, expanded: the shape `validateSpec` reads, with what the run-time walk and the card add. */
export interface ScreenTable {
  /** The registry's version: the release the table was generated for. */
  readonly version: string
  readonly components: readonly TableMember[]
  readonly exceptions: { readonly primitives: readonly TablePrimitive[] }
  readonly icons: {
    readonly roles: readonly { readonly name: string }[]
    /** The roles a Button's trailing icon may take. */
    readonly trailing: readonly string[]
  }
  /**
   * The named data types the members' props take, sorted by name. The
   * generated table always has them; a vocabulary built by hand may leave
   * them out, and its card then prints none.
   */
  readonly dataTypes?: readonly TableDataType[]
}

/* -------------------------------------------------------------------------- */
/* The compact form                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A prop: its name, the index of its printed type in `types`, and `1` when it
 * is optional. A printed type is often long and often repeated (an icon role
 * union is a thousand characters on every prop that takes a role), so each is
 * written once.
 */
export type CompactProp = readonly [name: string, type: number, optional: 0 | 1]

/** The platforms on which a member is not native. A platform left out is `{ status: 'native' }`. */
export type CompactPlatforms = Readonly<Partial<Record<Platform, TablePlatformEntry>>>

/** The frameworks whose entry is not a bare `native`. A framework left out is `{ status: 'native' }`. */
export type CompactFrameworks = Readonly<Partial<Record<Framework, TableFrameworkEntry>>>

export interface CompactPart {
  readonly name: string
  readonly props: readonly CompactProp[]
}

export interface CompactMember {
  readonly name: string
  readonly tier: string
  readonly purpose: string
  readonly props: readonly CompactProp[]
  readonly parts?: readonly CompactPart[]
  readonly grid?: Readonly<Record<string, readonly string[]>>
  readonly platforms?: CompactPlatforms
  readonly frameworks?: CompactFrameworks
  readonly call?: string
}

export interface CompactPrimitive {
  readonly name: string
  readonly rung: number
  readonly purpose: string
  readonly props: readonly CompactProp[]
  readonly platforms?: CompactPlatforms
  readonly frameworks?: CompactFrameworks
}

export interface CompactDataType {
  readonly name: string
  readonly params?: readonly string[]
  readonly union?: readonly string[]
  readonly fields: readonly CompactProp[]
}

/** The table as `pnpm registry` writes it. */
export interface CompactTable {
  readonly version: string
  /** Every printed type, once, in the order the props first name them. */
  readonly types: readonly string[]
  readonly members: readonly CompactMember[]
  readonly primitives: readonly CompactPrimitive[]
  readonly roles: readonly string[]
  readonly trailing: readonly string[]
  readonly dataTypes: readonly CompactDataType[]
}

/* -------------------------------------------------------------------------- */
/* From the registry                                                          */
/* -------------------------------------------------------------------------- */

/** A prop as the registry publishes it, of which the table keeps the name, the type and whether it is optional. */
interface SourceProp {
  readonly name: string
  readonly type: string
  readonly optional: boolean
}

interface SourceEntries {
  readonly platforms: Readonly<Record<Platform, TablePlatformEntry & { readonly as?: string }>>
  readonly frameworks: Readonly<
    Record<
      Framework,
      {
        readonly status: FrameworkStatus
        readonly reason?: string
        readonly shell?: { readonly sources: readonly string[] }
      }
    >
  >
}

/**
 * What the table is made from: the registry (`Registry` in `build.ts`), read
 * through the fields the table keeps. Typed here rather than imported, so a
 * page that imports this module to expand the table reaches none of the
 * registry builder.
 */
export interface TableSource {
  readonly version: string
  readonly components: readonly (SourceEntries & {
    readonly name: string
    readonly tier: string
    readonly purpose: string
    readonly props: readonly SourceProp[]
    readonly parts: readonly { readonly name: string; readonly props: readonly SourceProp[] }[]
    readonly grid: Readonly<Record<string, readonly string[]>> | null
    readonly exports: readonly {
      readonly name: string
      readonly kind: string
      readonly props: readonly { readonly name: string }[]
    }[]
  })[]
  readonly exceptions: {
    readonly primitives: readonly (SourceEntries & {
      readonly name: string
      readonly rung: number
      readonly purpose: string
      readonly props: readonly SourceProp[]
    })[]
  }
  readonly icons: {
    readonly roles: readonly { readonly name: string }[]
    readonly trailing: readonly string[]
  }
  readonly dataTypes: readonly {
    readonly name: string
    readonly params: readonly string[]
    readonly union?: readonly string[]
    readonly fields: readonly SourceProp[]
  }[]
}

type RegistryProps = readonly SourceProp[]
type RegistryPlatforms = SourceEntries['platforms']
type RegistryFrameworks = SourceEntries['frameworks']

/** The name of a shell's file without its directory and extension: `TableRow`. */
const stem = (source: string): string =>
  source.slice(source.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')

/**
 * The table in its compact form, from the registry. Deterministic, as the
 * registry is: every list keeps the registry's order.
 */
export function compactTable(registry: TableSource): CompactTable {
  const types: string[] = []
  const index = new Map<string, number>()
  const typeOf = (type: string): number => {
    const known = index.get(type)
    if (known !== undefined) return known
    index.set(type, types.length)
    types.push(type)
    return types.length - 1
  }
  const props = (list: RegistryProps): CompactProp[] =>
    list.map((prop) => [prop.name, typeOf(prop.type), prop.optional ? 1 : 0] as const)

  const platforms = (entries: RegistryPlatforms): CompactPlatforms | undefined => {
    const kept: Partial<Record<Platform, TablePlatformEntry>> = {}
    for (const platform of PLATFORMS) {
      const entry = entries[platform]
      if (entry.status === 'native') continue
      // Only an absent entry's reason and substitute reach a fault.
      kept[platform] =
        entry.status === 'absent'
          ? {
              status: entry.status,
              ...(entry.reason === undefined ? {} : { reason: entry.reason }),
              ...(entry.substitute === undefined ? {} : { substitute: entry.substitute }),
            }
          : { status: entry.status }
    }
    return Object.keys(kept).length === 0 ? undefined : kept
  }

  /**
   * A shell's files matter only where they can name a part: a member with
   * parts in React, or a shell with more than its own file. Otherwise
   * `shippedParts` answers with React's parts, which are none, either way.
   */
  const frameworks = (
    entries: RegistryFrameworks,
    hasParts: boolean,
  ): CompactFrameworks | undefined => {
    const kept: Partial<Record<Framework, TableFrameworkEntry>> = {}
    for (const framework of FRAMEWORKS) {
      const entry = entries[framework]
      const sources = entry.shell?.sources ?? []
      const shell = hasParts || sources.length > 1 ? entry.shell : undefined
      if (entry.status === 'native' && shell === undefined) continue
      kept[framework] = {
        status: entry.status,
        ...(entry.status === 'absent' && entry.reason !== undefined
          ? { reason: entry.reason }
          : {}),
        ...(shell === undefined ? {} : { shell: { sources: shell.sources.map(stem) } }),
      }
    }
    return Object.keys(kept).length === 0 ? undefined : kept
  }

  const members = registry.components.map((component): CompactMember => {
    const platformEntries = platforms(component.platforms)
    const frameworkEntries = frameworks(component.frameworks, component.parts.length > 0)
    const call = optionsCarrier(component)?.name
    return {
      name: component.name,
      tier: component.tier,
      purpose: component.purpose,
      props: props(component.props),
      ...(component.parts.length === 0
        ? {}
        : {
            parts: component.parts.map((part) => ({ name: part.name, props: props(part.props) })),
          }),
      ...(component.grid === null ? {} : { grid: component.grid }),
      ...(platformEntries === undefined ? {} : { platforms: platformEntries }),
      ...(frameworkEntries === undefined ? {} : { frameworks: frameworkEntries }),
      ...(call === undefined ? {} : { call }),
    }
  })

  const primitives = registry.exceptions.primitives.map((primitive): CompactPrimitive => {
    const platformEntries = platforms(primitive.platforms)
    const frameworkEntries = frameworks(primitive.frameworks, false)
    return {
      name: primitive.name,
      rung: primitive.rung,
      purpose: primitive.purpose,
      props: props(primitive.props),
      ...(platformEntries === undefined ? {} : { platforms: platformEntries }),
      ...(frameworkEntries === undefined ? {} : { frameworks: frameworkEntries }),
    }
  })

  const dataTypes = registry.dataTypes.map((type): CompactDataType => ({
    name: type.name,
    ...(type.params.length === 0 ? {} : { params: type.params }),
    ...(type.union === undefined ? {} : { union: type.union }),
    fields: props(type.fields),
  }))

  return {
    version: registry.version,
    types,
    members,
    primitives,
    roles: registry.icons.roles.map((role) => role.name),
    trailing: [...registry.icons.trailing],
    dataTypes,
  }
}

/* -------------------------------------------------------------------------- */
/* Back to the table                                                          */
/* -------------------------------------------------------------------------- */

const NATIVE = { status: 'native' } as const

/** The table from its compact form: every platform and framework keyed, every prop's type in place. */
export function expandTable(compact: CompactTable): ScreenTable {
  const props = (list: readonly CompactProp[]): TableProp[] =>
    list.map(([name, type, optional]) => ({
      name,
      type: compact.types[type] ?? '',
      optional: optional === 1,
    }))
  const platforms = (kept: CompactPlatforms = {}) =>
    Object.fromEntries(PLATFORMS.map((platform) => [platform, kept[platform] ?? NATIVE])) as Record<
      Platform,
      TablePlatformEntry
    >
  const frameworks = (kept: CompactFrameworks = {}) =>
    Object.fromEntries(
      FRAMEWORKS.map((framework) => [framework, kept[framework] ?? NATIVE]),
    ) as Record<Framework, TableFrameworkEntry>
  const own = (list: readonly TableProp[]) => list.filter((prop) => !prop.name.includes('.'))

  return {
    version: compact.version,
    components: compact.members.map((member) => {
      const memberProps = props(member.props)
      return {
        name: member.name,
        tier: member.tier,
        purpose: member.purpose,
        props: memberProps,
        parts: (member.parts ?? []).map((part) => {
          const partProps = props(part.props)
          return { name: part.name, props: partProps, controlled: controlledProps(partProps) }
        }),
        grid: member.grid ?? null,
        platforms: platforms(member.platforms),
        frameworks: frameworks(member.frameworks),
        controlled: controlledProps(own(memberProps)),
        call: member.call ?? null,
      }
    }),
    exceptions: {
      primitives: compact.primitives.map((primitive) => {
        const primitiveProps = props(primitive.props)
        return {
          name: primitive.name,
          rung: primitive.rung,
          purpose: primitive.purpose,
          props: primitiveProps,
          platforms: platforms(primitive.platforms),
          frameworks: frameworks(primitive.frameworks),
          controlled: controlledProps(own(primitiveProps)),
        }
      }),
    },
    icons: { roles: compact.roles.map((name) => ({ name })), trailing: compact.trailing },
    dataTypes: compact.dataTypes.map((type) => ({
      name: type.name,
      params: type.params ?? [],
      ...(type.union === undefined ? {} : { union: type.union }),
      fields: props(type.fields),
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* The generated module                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The module `pnpm registry` writes into `packages/screen/src/vocabulary.gen.ts`.
 *
 * The table is one JSON text handed to `JSON.parse`, which an engine reads
 * faster than an object literal of the same size, and which keeps the module
 * free of anything but data. The text is single-quoted, so the JSON's own
 * double quotes stay as they are.
 */
export function renderTableModule(compact: CompactTable): string {
  // The quote and the backslash are escaped, and so are U+2028 and U+2029, which a parser older
  // than ES2019 reads as line breaks inside a string.
  const json = JSON.stringify(compact)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029')
  return [
    '/* Generated by `pnpm registry` from the registry — do not edit. The vocabulary',
    ' * table a screen is checked and drawn with at run time, in its compact form',
    ' * (`packages/registry/src/screen-table.ts`); `vocabulary.ts` expands it. */',
    "import type { CompactTable } from '@polymorph/registry/screen-table'",
    '',
    `export const TABLE: CompactTable = /* @__PURE__ */ JSON.parse('${json}')`,
    '',
  ].join('\n')
}
