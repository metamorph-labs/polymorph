import { FRAMEWORKS, type Registry } from '@polymorph/registry'

/** A skill names a member, a prop, a part or a value the registry does not have. */
export class SkillFactError extends Error {
  constructor(message: string) {
    super(`skills: ${message}`)
    this.name = 'SkillFactError'
  }
}

/**
 * What a text names in code font that is not a member: an export of a package, or a declaration
 * in a native source file. `Facts.x` records each with where it is declared, as a module
 * (`@polymorph/react/screen`) or a path below the repository root, and `agents.test.ts` holds
 * every one to that source.
 */
export const NAMED = new Map<string, string>()

/**
 * What the texts say about members, read from the registry. Every member,
 * prop, part and value a sentence names comes through here, and one the
 * registry lacks throws, so a renamed prop stops the texts from being written
 * rather than reaching a model.
 */
export class Facts {
  constructor(private readonly registry: Registry) {}

  private member(name: string) {
    const found = [...this.registry.components, ...this.registry.exceptions.primitives].find(
      (member) => member.name === name,
    )
    if (found === undefined) throw new SkillFactError(`no member called ${name}`)
    return found
  }

  /** `name` in code font, once the registry has the member. */
  m(name: string): string {
    this.member(name)
    return `\`${name}\``
  }

  /**
   * `name` in code font: an export of the module `from`, or a declaration in the file or
   * directory at the path `from`. It is for what a text names that is not a member.
   */
  x(name: string, from: string): string {
    const known = NAMED.get(name)
    if (known !== undefined && known !== from) {
      throw new SkillFactError(`${name} is named from ${known} and from ${from}`)
    }
    NAMED.set(name, from)
    return `\`${name}\``
  }

  /** The type of a member's prop, which must exist. */
  private type(member: string, prop: string): string {
    const found = this.member(member).props.find((entry) => entry.name === prop)
    if (found === undefined) throw new SkillFactError(`${member} has no prop ${prop}`)
    return found.type
  }

  /** `prop` in code font, once `member` has it. */
  p(member: string, prop: string): string {
    this.type(member, prop)
    return `\`${prop}\``
  }

  /** The type of a data type's field, which must exist. */
  private fieldType(type: string, name: string): string {
    const declared = this.registry.dataTypes.find((entry) => entry.name === type)
    if (declared === undefined) throw new SkillFactError(`no data type called ${type}`)
    const found = declared.fields.find((entry) => entry.name === name)
    if (found === undefined) throw new SkillFactError(`${type} has no field ${name}`)
    return found.type
  }

  /** `name` in code font, once the data type `type` has the field. */
  field(type: string, name: string): string {
    this.fieldType(type, name)
    return `\`${name}\``
  }

  /** The string values a data type's field allows, in its order. */
  fieldValues(type: string, name: string): string[] {
    return [...this.fieldType(type, name).matchAll(/"([^"]+)"/g)].map((match) => match[1] as string)
  }

  /** What the registry says a member is for, in the member's own words. */
  purpose(name: string): string {
    const purpose = (this.member(name) as { purpose?: string }).purpose
    if (purpose === undefined || purpose === '') {
      throw new SkillFactError(`${name} states no purpose`)
    }
    return purpose
  }

  /** The string values a prop's type allows, in its order. */
  values(member: string, prop: string): string[] {
    return [...this.type(member, prop).matchAll(/"([^"]+)"/g)].map((match) => match[1] as string)
  }

  /** `prop="value"` in code font, once the prop takes the value. */
  v(member: string, prop: string, value: string): string {
    if (!this.values(member, prop).includes(value)) {
      throw new SkillFactError(`${member}'s ${prop} takes no "${value}"`)
    }
    return `\`${prop}="${value}"\``
  }

  /** `Member.Part` in code font, once the member has the part. */
  part(member: string, part: string): string {
    const parts = (this.member(member) as { parts?: unknown }).parts
    if (!Array.isArray(parts) || !parts.some((entry: { name?: string }) => entry.name === part)) {
      throw new SkillFactError(`${member} has no part ${part}`)
    }
    return `\`${member}.${part}\``
  }

  /** The props every one of `members` has, among `wanted`, in code font. */
  shared(members: string[], wanted: string[]): string[] {
    const found = wanted.filter((prop) =>
      members.every((member) => this.member(member).props.some((entry) => entry.name === prop)),
    )
    if (found.length === 0)
      throw new SkillFactError(`${members.join(', ')} share none of ${wanted}`)
    return found.map((prop) => `\`${prop}\``)
  }

  /** The prop of `member` whose type lists the icon roles. */
  roleProp(member: string): string {
    const role = this.registry.icons.roles[0]?.name
    const found = this.member(member).props.find((entry) => entry.type.includes(`"${role}"`))
    if (role === undefined || found === undefined) {
      throw new SkillFactError(`${member} has no prop that takes an icon role`)
    }
    return `\`${found.name}\``
  }

  /** Each type a member's `patch` takes, with the members that take it and its keys. */
  patches(): { type: string; members: string[]; keys: string[] }[] {
    const byType = new Map<string, string[]>()
    for (const member of this.registry.components) {
      const patch = member.props.find((entry) => entry.name === 'patch')
      if (patch === undefined) continue
      const type = patch.type.split('|')[0]?.trim() ?? ''
      byType.set(type, [...(byType.get(type) ?? []), member.name])
    }
    return [...byType].map(([type, members]) => {
      const declared = this.registry.dataTypes.find((entry) => entry.name === type)
      if (declared === undefined) throw new SkillFactError(`no data type called ${type}`)
      return { type, members, keys: declared.fields.map((field) => field.name) }
    })
  }

  /** The names of the theme's design axes. */
  axes(): string[] {
    return this.registry.theme.axes.map((axis) => axis.name)
  }

  /** The members of a tier, in the registry's order. */
  tier(name: string): string[] {
    return this.registry.components.filter((member) => member.tier === name).map((m) => m.name)
  }
}

/** Words in code font in a sentence: `a`, `a and b`, `a, b and c`. */
export function all(words: readonly string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

/** One file of a skill, at its path below the skills directory. */
export interface SkillFile {
  path: string
  contents: string
}

/** The skills, in the order the always-loaded text names them. */
export const SKILL_NAMES = [
  'polymorph-screen',
  'polymorph-rules',
  'polymorph-setup',
  'polymorph-theme',
  'polymorph-runtime-screen',
  'polymorph-agent-bridge',
  'polymorph-native',
] as const
export type SkillName = (typeof SKILL_NAMES)[number]

/**
 * The job each skill is for, in a few words. The always-loaded text and the
 * plugin's README list the skills with it, so a harness that matches no skill
 * description still learns which one to read.
 */
export const SKILL_USES: Record<SkillName, string> = {
  'polymorph-screen': 'any screen: a form, a table, a chart, a chat, formatted text',
  'polymorph-rules': 'a red-rule violation, a need no member covers',
  'polymorph-setup': 'installing, vendoring, upgrading, the agent files',
  'polymorph-theme': 'how the app looks',
  'polymorph-runtime-screen': 'a screen a model writes at run time',
  'polymorph-agent-bridge': 'an agent that operates the page',
  'polymorph-native': 'a SwiftUI or Compose screen',
}

/** A fenced shell block of commands, each starting with `run`. */
export function commands(run: string, ...lines: string[]): string {
  return ['```sh', ...lines.map((line) => `${run} ${line}`), '```'].join('\n')
}

/** Words in a sentence as alternatives: `a`, `a or b`, `a, b or c`. */
export function either(words: readonly string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`
}

/** Front matter and body, as one `SKILL.md`. */
export function skill(name: SkillName, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body.trim()}\n`
}

/** The table that tells a framework from the packages a project depends on. */
export function frameworkTable(): string {
  const rows = FRAMEWORKS.filter((framework) => framework !== 'elements').map(
    (framework) => `| \`@polymorph/${framework}-ui\` | \`${framework}\` |`,
  )
  return [
    '| The project has | The framework |',
    '| --- | --- |',
    ...rows,
    '| `"framework": "elements"` in `polymorph.json` | `elements`: `<poly-*>` custom elements in HTML pages with no build |',
  ].join('\n')
}
