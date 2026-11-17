import type { Rule } from 'eslint'

import iconSet from '../../../../design/icons.json' with { type: 'json' }
import { matchesAny } from '../glob'
import { distance } from '../stylelint/tokens.js'
import { either, fit, ZONE } from './advice'
import {
  angularAttribute,
  angularElementName,
  angularReporterFor,
  angularText,
  isAngularFile,
  meaningfulAngularChildren,
  startTagLoc,
  withAngularTemplate,
  type AngularElement,
} from './angular'
import {
  entranceFor,
  holdsComment,
  importText,
  occurrences,
  redeclared,
  removeLine,
  shadowedAt,
  type ImportDeclarationNode,
} from './fix'
import {
  elementName,
  fileDeclaresBespoke,
  insideBespoke,
  isSolidFile,
  type JsxOpeningElement,
} from './jsx'
import { isBareSpecifier } from './specifier'
import {
  isSvelteFile,
  meaningfulSvelteChildren,
  reportedMarkup,
  svelteElementName,
  svelteLiteral,
  svelteText,
  withMarkup,
  type SvelteElement,
} from './svelte'
import {
  isVueFile,
  meaningfulChildren,
  reported,
  importsOf,
  vueElementName,
  vueLiteral,
  vueText,
  withTemplate,
  type VueElement,
} from './vue'

/**
 * Stage 2: icons are referenced by meaning, never by glyph.
 *
 * `<Icon name="delete" />` names a role. The role-to-glyph map is a
 * decision-layer file, so remapping one icon or replacing the whole set changes
 * no call site. A direct glyph import or an inline `<svg>` makes that decision
 * at the call site instead, and an agent's invented icon name is no longer a
 * type error.
 *
 * The same rule keeps the icon set (`lucide`) confined to the map file. Point
 * `allowIn` at the map and apply the rule to the vocabulary too.
 *
 * **What it fixes.** An import from the set's React package is rewritten to use
 * `Icon` when the role map already names every glyph it imports. `<Trash2 />`
 * becomes `<Icon name="delete" />`, because `design/icons.json` maps `delete` to
 * `trash-2`. The drawing is the same, and the call site no longer names it.
 *
 * **What it says.** The report names the role for each glyph it imports: the
 * one the map draws it for, both when two roles share it, or the role nearest
 * by name when none uses it (`FiTrash` reads as `delete`), with the one
 * sentence that says how to add a role. An inline `<svg>` with a label or a
 * title is matched the same way.
 *
 * Every case that involves a choice is reported and left unchanged. A glyph no
 * role uses has no rewrite target, and needs a new role. A glyph two roles share
 * has two meanings, and a fixer must not choose between them. A glyph with a
 * `size`, a `color` or a `className` has been styled. `Icon`'s size is one of
 * three token steps and it has no colour prop, so choosing a step, or deciding
 * that the colour belongs to the context, is a decision. Dropping the prop would
 * make that decision silently.
 *
 * **In a Vue file** the imports are read from `<script setup>` and an inline
 * `<svg>` from the template, with the same answers. `lucide-vue-next` draws the
 * same glyphs under the same names, so its imports read as roles too. Nothing
 * in a Vue file is rewritten, because the fix rewrites JSX uses.
 *
 * **In a Svelte file** the imports are read from its scripts and an inline
 * `<svg>` from its markup, as in a Vue file, and nothing is rewritten.
 * `lucide-svelte` reads as roles. **In a Solid file** the fix rewrites an
 * import from `lucide-solid`, the set's Solid package, as it rewrites
 * `lucide-react` in React, and brings `Icon` in from `@polymorph/solid`. An
 * import from `lucide-react` there is reported and left unchanged. **In an
 * Angular component** the imports are read from the module and an inline
 * `<svg>` from its template, with the answers in template syntax
 * (`<pm-icon name="delete" />`). `lucide-angular` reads as roles, and nothing
 * is rewritten, because the glyphs are used in the template.
 */

interface Options {
  /** Exact names or `name/` prefixes that ship glyphs. */
  packages?: string[]
  /** Globs of files allowed to import them: the role-to-glyph map. */
  allowIn?: string[]
  /**
   * Globs allowed to write an inline `<svg>`, and nothing else: the chart tier.
   *
   * This rule enforces two laws: icons are referenced by role, and pictures are
   * not hand-drawn at a call site. The chart tier needs the second lifted and the
   * first kept. A chart is SVG by nature, and a chart that needed a glyph would
   * still reference it by meaning. `allowIn` cannot express that, because it
   * exempts a file from the whole rule, including the glyph-import ban.
   */
  drawIn?: string[]
  /** Module prefixes the name heuristic must never fire on. */
  vocabularyModules?: string[]
}

const DEFAULT_PACKAGES = [
  'lucide-react',
  'lucide',
  'react-icons',
  '@heroicons/react',
  '@tabler/icons-react',
  '@radix-ui/react-icons',
  'react-feather',
  '@phosphor-icons/react',
  '@mui/icons-material',
  'bootstrap-icons',
  // The Vue sets. `@tabler/icons-vue` and `@phosphor-icons/vue` are caught by name.
  'lucide-vue-next',
  '@lucide/vue',
  '@heroicons/vue',
  '@iconify/vue',
  'vue-feather',
  // The Svelte and Solid sets, and unplugin-icons' virtual modules. The sets
  // with "icons" in their name, such as `@tabler/icons-svelte`, are caught by
  // name.
  'lucide-svelte',
  '@lucide/svelte',
  'svelte-heros',
  'svelte-heros-v2',
  'phosphor-svelte',
  '@iconify/svelte',
  'lucide-solid',
  '@lucide/solid',
  'solid-heroicons',
  '~icons',
  // The Angular sets. `@ng-icons/*`, `@tabler/icons-angular` and
  // `@angular/material/icon` are caught by name.
  'lucide-angular',
  '@lucide/angular',
  '@fortawesome/angular-fontawesome',
  'angular-feather',
]

/**
 * What an Angular set exports to draw its glyphs, beside the glyphs: its
 * module, its component and its providers (`LucideAngularModule`,
 * `FaIconComponent`, `FaIconLibrary`, `LUCIDE_ICONS`). They name no glyph.
 */
const ICON_MACHINERY =
  /^(Lucide(Angular|Icon)\w*|LUCIDE_\w+|Fa\w*(Module|Component|Library|Config|Stack)|FontAwesomeModule|FeatherModule)$/

/** Any other package whose name contains "icons". New sets appear faster than a
 *  list can be maintained. */
const ICON_NAME = /(^|[@/-])icons?([/-]|$)/i

const DEFAULT_VOCABULARY = ['@polymorph/']

/* -------------------------------------------------------------------------- */
/* The fix: a glyph, back to the role that draws it                           */
/* -------------------------------------------------------------------------- */

/** The React package of the set the role map uses: `lucide-react`. */
const GLYPH_PACKAGE = `${iconSet.set}-react`

/** The set's Solid package, which the fix rewrites in a Solid file: `lucide-solid`. */
const SOLID_GLYPH_PACKAGE = `${iconSet.set}-solid`

/** The packages that name the set's glyphs as `GLYPH_PACKAGE` does, so a glyph reads as its role. */
const SAME_GLYPHS = new Set([
  GLYPH_PACKAGE,
  `${iconSet.set}-vue-next`,
  `@${iconSet.set}/vue`,
  `${iconSet.set}-svelte`,
  `@${iconSet.set}/svelte`,
  SOLID_GLYPH_PACKAGE,
  `@${iconSet.set}/solid`,
  `${iconSet.set}-angular`,
  `@${iconSet.set}/angular`,
])

/** `trash-2` -> `Trash2`, the name of a glyph's component in the set's React package. */
const componentName = (glyph: string) =>
  glyph
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

/**
 * Component name -> the roles drawn with it, read from the committed map instead
 * of copied. Usually one role. A glyph two roles share has two.
 */
const ROLES_BY_GLYPH = new Map<string, string[]>()
for (const [role, meta] of Object.entries(iconSet.roles)) {
  const name = componentName(meta.glyph)
  ROLES_BY_GLYPH.set(name, [...(ROLES_BY_GLYPH.get(name) ?? []), role])
}

/**
 * The single role a glyph component represents, or `null` when there is not
 * exactly one. The package exports each glyph under three names (`Trash2`,
 * `Trash2Icon`, `LucideTrash2`), and all three are the same drawing.
 */
function roleOf(imported: string): string | null {
  const spellings = [imported, imported.replace(/Icon$/, ''), imported.replace(/^Lucide/, '')]
  const roles = spellings.map((name) => ROLES_BY_GLYPH.get(name)).find((found) => found)
  return roles?.length === 1 ? (roles[0] as string) : null
}

/* -------------------------------------------------------------------------- */
/* The report: which role a glyph is, by name                                 */
/* -------------------------------------------------------------------------- */

/** `trash-2` -> `['trash']`: the words of a glyph name, without its variant number. */
const words = (name: string) => name.split('-').filter((part) => part !== '' && !/^\d+$/.test(part))

/**
 * How alike two kebab names are, from 0 to 1, or 0 when they are not alike
 * enough to name. Two measures, because glyph names differ in two ways: by
 * words (`trash-can` and `trash-2` share the drawing, and `check-circle` and
 * `circle-check` are the same one), and by spelling (`serch`). Half the words
 * shared counts; so does an edit distance of one letter in four. Closer than
 * that, `rocket` would read as `locked`.
 */
export function nameSimilarity(a: string, b: string): number {
  const [left, right] = [words(a), words(b)]
  if (left.length === 0 || right.length === 0) return 0
  const shared = left.filter((word) => right.includes(word)).length
  const overlap = shared / new Set([...left, ...right]).size
  const [x, y] = [left.join('-'), right.join('-')]
  const spelling = 1 - distance(x, y) / Math.max(x.length, y.length)
  const score = Math.max(overlap, spelling)
  return overlap >= 0.5 || spelling >= 0.75 ? score : 0
}

/**
 * A component name from any icon set, as the kebab name of what it draws:
 * `FiTrash` -> `trash`, `TrashIcon` -> `trash`, `IconX` -> `x`,
 * `DeleteOutlined` -> `delete`, `LucideSettings` -> `settings`, and Font
 * Awesome's `faTrashCan` -> `trash-can`.
 */
export function glyphName(imported: string, source: string): string {
  let name = imported
    .replace(/^Lucide/, '')
    .replace(/^fa(?=[A-Z0-9])/, '')
    .replace(/^Icon(?=[A-Z0-9])/, '')
    .replace(/Icon$/, '')
    .replace(/(Outlined|Outline|Rounded|Sharp|TwoTone|Filled|Fill|Solid|Bold|Light|Duotone)$/, '')
  // `react-icons` prefixes each glyph with its set: `Fi`, `Md`, `Hi2`, `Io5`.
  if (source.startsWith('react-icons')) {
    name = name
      .replace(/^[A-Z][a-z]?[a-z0-9]?(?=[A-Z])/, '')
      .replace(/^(Outline|Solid|Reg|Fill)(?=[A-Z])/, '')
      .replace(/Alt$/, '')
  }
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase()
}

/** The roles nearest a kebab glyph name, by their own name or their glyph's, best first. */
export function nearestRoles(name: string): string[] {
  const scored = Object.entries(iconSet.roles)
    .map(([role, meta]) => ({
      role,
      score: Math.max(nameSimilarity(name, role), nameSimilarity(name, meta.glyph)),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
  const [best] = scored
  return best ? scored.filter(({ score }) => score === best.score).map(({ role }) => role) : []
}

const icon = (role: string) => `\`<Icon name="${role}" />\``

/**
 * The one sentence on adding a role, rung 5. It names no file: the role map
 * ships inside `@polymorph/react`, so a consumer reads this as a role to ask
 * polymorph for, and this repository adds it in `design/icons.json`.
 */
const PROMOTE = "A meaning with no role becomes a new role in polymorph's icon set (rung 5)."

/** What a glyph with no role and no near name is: the promotion, in its own sentence. */
const NO_ROLE =
  "has no role and none is close by name, so it becomes a new role in polymorph's icon set (rung 5)."

/**
 * The `Icon` component and the modules that export it. It ships in the React
 * foundation, and the vocabulary re-exports it.
 */
const GATEWAY = 'Icon'
const GATEWAY_MODULES = ['@polymorph/react-ui', '@polymorph/react']
const GATEWAY_HOME = '@polymorph/react'

/** The same in a Solid app: the Solid foundation ships `Icon`, and its vocabulary re-exports it. */
const SOLID_GATEWAY_MODULES = ['@polymorph/solid-ui', '@polymorph/solid']
const SOLID_GATEWAY_HOME = '@polymorph/solid'

/**
 * The props that are kept, and the `Icon` prop each becomes. An accessible name
 * has its own prop, and `key` belongs to React, not to either component. `Icon`
 * has no place for any other prop, so any other prop stops the fix.
 */
const CARRIED: Record<string, string> = { 'aria-label': 'label', key: 'key' }

interface Use {
  /** The `<Glyph … />` opening element, which is the whole element when self-closing. */
  opening: Rule.Node
  text: string
}

interface AttributeNode {
  type: string
  name?: { type: string; name?: string }
  value?: Rule.Node | null
}

interface OpeningNode {
  type: string
  name: unknown
  selfClosing?: boolean
  attributes: AttributeNode[]
}

export const noExternalIcons: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: { description: 'Icons are referenced by semantic role, not imported as glyphs.' },
    schema: [
      {
        type: 'object',
        properties: {
          packages: { type: 'array', items: { type: 'string' } },
          allowIn: { type: 'array', items: { type: 'string' } },
          drawIn: { type: 'array', items: { type: 'string' } },
          vocabularyModules: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      iconImport: 'Unexpected icon import `{{source}}`. {{advice}}',
      inlineSvg: 'Unexpected inline <svg>. {{advice}}',
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as Options
    const packages = options.packages ?? DEFAULT_PACKAGES
    const allowIn = options.allowIn ?? []
    const vocabulary = options.vocabularyModules ?? DEFAULT_VOCABULARY

    if (matchesAny(context.filename, allowIn)) return {}
    const mayDraw = matchesAny(context.filename, options.drawIn ?? [])
    const bespokeFile = fileDeclaresBespoke(context)
    const sourceCode = context.sourceCode
    // A Solid file's glyphs come from the set's Solid package, and `Icon` from
    // the Solid foundation.
    const solid = isSolidFile(context)
    const glyphPackage = solid ? SOLID_GLYPH_PACKAGE : GLYPH_PACKAGE
    const gatewayModules = solid ? SOLID_GATEWAY_MODULES : GATEWAY_MODULES
    const gatewayHome = solid ? SOLID_GATEWAY_HOME : GATEWAY_HOME

    /** `aria-hidden` or `aria-hidden={true}`, which an `Icon` with no label already is. */
    function decorative(attribute: AttributeNode): boolean {
      const value = attribute.value as
        | { type: string; value?: unknown; expression?: { type: string; value?: unknown } }
        | null
        | undefined
      if (!value) return true
      if (value.type === 'Literal') return value.value === 'true'
      return value.expression?.type === 'Literal' && value.expression.value === true
    }

    /** One `<Glyph … />` rewritten, or `null` when the use is anything else. */
    function rewrite(identifier: object, parent: object, role: string): Use | null {
      const opening = parent as OpeningNode
      if (opening.type !== 'JSXOpeningElement' || opening.name !== identifier) return null
      // A glyph has no children to keep. One written with children is a shape
      // this fix does not handle.
      if (!opening.selfClosing) return null

      const element = opening as unknown as Rule.Node
      if (holdsComment(sourceCode, element)) return null
      // `Icon` means something else at this position, such as a prop with that
      // name, so writing it here would not refer to the `Icon` component.
      if (shadowedAt(sourceCode, element, GATEWAY)) return null

      const props: string[] = []
      let hidden = false
      for (const attribute of opening.attributes) {
        const name = attribute.name?.type === 'JSXIdentifier' ? attribute.name.name : undefined
        if (attribute.type !== 'JSXAttribute' || name === undefined) return null
        if (name === 'aria-hidden') {
          // Marked decorative, which `Icon` is by default. Marked not decorative
          // with no label to announce is a case the fix does not handle.
          if (!decorative(attribute)) return null
          hidden = true
          continue
        }
        const carried = CARRIED[name]
        // A size, a colour, a class or a handler was set deliberately, and
        // `Icon` has no single place to put it.
        if (carried === undefined || !attribute.value) return null
        props.push(`${carried}=${sourceCode.getText(attribute.value)}`)
      }

      // Both hidden and labelled. `Icon` is one or the other, because a label
      // makes it an image a screen reader announces. Keeping the label would
      // expose what the author hid, and dropping it would remove the name.
      if (hidden && opening.attributes.some((attribute) => attribute.name?.name === 'aria-label')) {
        return null
      }

      return { opening: element, text: [`<${GATEWAY} name="${role}"`, ...props, '/>'].join(' ') }
    }

    /**
     * The whole import rewritten (every glyph it names, every place each is
     * used), or `null`. It is all or nothing: an import with one specifier
     * still in use cannot be removed, and a partial rewrite leaves the violation.
     */
    function glyphFix(node: Rule.Node): Rule.ReportFixer | null {
      const declaration = node as unknown as ImportDeclarationNode
      if (declaration.importKind === 'type') return null

      // A bare `import 'lucide-react'` exists for its side effects, and this fix
      // must not remove it.
      if (declaration.specifiers.length === 0) return null

      /** Local name -> the role its glyph represents, where there is exactly one. */
      const roles = new Map<string, string | null>()
      for (const specifier of declaration.specifiers) {
        const imported =
          specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type'
            ? specifier.imported?.name
            : undefined
        roles.set(specifier.local.name, imported === undefined ? null : roleOf(imported))
      }

      const locals = [...roles.keys()]
      // A name declared again in an inner scope (a parameter called `Trash2`)
      // means "every place the name appears" covers two different bindings.
      if (locals.some((name) => redeclared(sourceCode, name))) return null
      // `import { Trash2 as trash }`: `<trash />` is then an intrinsic element of
      // that name, not the import. Nobody writes this, and the fix does not guess.
      if (locals.some((name) => !/^[A-Z]/.test(name))) return null
      // A comment is the one place a name can be used without appearing in the
      // AST: `@type {typeof Trash2}` in a file checked as JavaScript.
      const comments = sourceCode.getAllComments().map((comment) => comment.value)
      if (locals.some((name) => comments.some((text) => new RegExp(`\\b${name}\\b`).test(text)))) {
        return null
      }

      const [start, end] = node.range as [number, number]
      const uses: Use[] = []
      for (const [local, role] of roles) {
        for (const { node: identifier, parent } of occurrences(sourceCode, local)) {
          const [at] = identifier.range as [number, number]
          // The import's own mention of the name.
          if (at >= start && at < end) continue
          // Used, but its glyph has no single role, or used as something other
          // than a self-closing element: passed as a value, named in a type, or
          // wrapping children.
          const use = role === null ? null : rewrite(identifier, parent, role)
          if (use === null) return null
          uses.push(use)
        }
      }

      // Imported and never used: the import is removed, and nothing needs `Icon`.
      const entrance =
        uses.length === 0
          ? ({ kind: 'present' } as const)
          : entranceFor(sourceCode, GATEWAY, gatewayModules, gatewayHome)
      if (entrance === null) return null

      return (fixer) => [
        ...(entrance.kind === 'append'
          ? [fixer.insertTextAfterRange(entrance.after.range as [number, number], `, ${GATEWAY}`)]
          : []),
        // The `Icon` import replaces the glyph import. Where `Icon` is already in
        // scope, the line is removed.
        entrance.kind === 'declare'
          ? fixer.replaceText(node, importText(sourceCode, GATEWAY, entrance.module))
          : removeLine(sourceCode, fixer, node),
        ...uses.map((use) => fixer.replaceText(use.opening, use.text)),
      ]
    }

    /**
     * What each imported glyph is as a role. A glyph the map draws for one role
     * is that role; for two, both; for none, the role nearest by name.
     */
    function importAdvice(node: Rule.Node, source: string, fixed: boolean): string {
      const head = `Unexpected icon import \`${source}\`.`
      const declaration = node as unknown as ImportDeclarationNode
      const named =
        declaration.importKind === 'type'
          ? []
          : declaration.specifiers.flatMap((specifier) => {
              const imported =
                specifier.type === 'ImportSpecifier' ? specifier.imported?.name : undefined
              return imported === undefined ||
                specifier.importKind === 'type' ||
                ICON_MACHINERY.test(imported)
                ? []
                : [imported]
            })
      if (named.length === 0) {
        return fit(head, [`Name each icon by its role: \`<Icon name="…" />\` (rung 1). ${PROMOTE}`])
      }

      let mapped = true
      const sentences = named.map((imported) => {
        const glyph = glyphName(imported, source)
        const own = SAME_GLYPHS.has(source) ? ROLES_BY_GLYPH.get(componentName(glyph)) : undefined
        if (own && own.length === 1) return `\`${imported}\` is ${icon(own[0] as string)} (rung 1).`
        if (own && own.length > 1) {
          return `\`${imported}\` draws two roles, ${either(own.map(icon))}; pick the meaning (rung 1).`
        }
        mapped = false
        const near = nearestRoles(glyph)
        if (near.length > 0) {
          return `\`${imported}\` reads as ${either(near.slice(0, 2).map(icon))} (rung 1).`
        }
        return `\`${imported}\` ${NO_ROLE}`
      })
      // A glyph with no role at all needs the promotion more than a second
      // glyph needs its sentence, and its own sentence carries the promotion,
      // so the answer survives however short the message has to be.
      const lone = sentences.find((sentence) => sentence.endsWith(NO_ROLE))
      if (lone !== undefined) {
        return fit(head, [lone, ...sentences.filter((sentence) => sentence !== lone)])
      }
      if (fixed) sentences.push('The fix rewrites it.')
      else if (mapped)
        sentences.push("`Icon` takes `label` and a `size` step, so map the glyph's props by hand.")
      else sentences.push(PROMOTE)
      return fit(head, sentences)
    }

    /** An inline `<svg>` named by its label or title, as the role nearest that name. */
    function svgAdvice(node: Rule.Node): string {
      const opening = node as unknown as OpeningNode
      const labelled = opening.attributes.find(
        (attribute) => attribute.type === 'JSXAttribute' && attribute.name?.name === 'aria-label',
      )?.value as { type: string; value?: unknown } | null | undefined
      const element = (
        node.parent as unknown as {
          children?: {
            type: string
            openingElement?: OpeningNode
            children?: { type: string; value?: unknown }[]
          }[]
        }
      ).children
      const title = element
        ?.find(
          (child) =>
            child.type === 'JSXElement' &&
            elementName(child.openingElement as unknown as JsxOpeningElement) === 'title',
        )
        ?.children?.find((child) => child.type === 'JSXText')?.value
      const label =
        labelled?.type === 'Literal' && typeof labelled.value === 'string'
          ? labelled.value
          : typeof title === 'string'
            ? title.trim()
            : null
      return svgAdviceFor(label)
    }

    /** An inline `<svg>`, from its label or title: the role nearest that name, or a new role. */
    function svgAdviceFor(label: string | null): string {
      const head = 'Unexpected inline <svg>.'
      const near = label ? nearestRoles(label.toLowerCase().replace(/\s+/g, '-')) : []
      if (label && near.length > 0) {
        return fit(head, [
          `Its label reads as ${either(near.slice(0, 2).map((role) => `\`<Icon name="${role}" label="${label}" />\``))} (rung 1).`,
          `One-off art goes in a ${ZONE} zone.`,
        ])
      }
      return fit(head, [
        `Draw a role with \`<Icon name="…" />\` (rung 1). ${PROMOTE}`,
        `One-off art goes in a ${ZONE} zone.`,
      ])
    }

    /** A Vue `<svg>` named by its static `aria-label` or its `<title>`, as in TSX. */
    function vueSvgAdvice(element: VueElement): string {
      const labelled = vueLiteral(element, 'aria-label')
      const title = meaningfulChildren(element.children).find(
        (child): child is VueElement => child.type === 'VElement' && child.rawName === 'title',
      )
      return svgAdviceFor(
        typeof labelled === 'string' ? labelled : title ? vueText(title.children) : null,
      )
    }

    /** A Svelte `<svg>` named by its static `aria-label` or its `<title>`, as in TSX. */
    function svelteSvgAdvice(element: SvelteElement): string {
      const labelled = svelteLiteral(element, 'aria-label')
      const title = meaningfulSvelteChildren(element.children).find(
        (child): child is SvelteElement =>
          child.type === 'SvelteElement' && svelteElementName(child as SvelteElement) === 'title',
      )
      return svgAdviceFor(
        typeof labelled === 'string' ? labelled : title ? svelteText(title.children) : null,
      )
    }

    const template = {
      VElement(element: VueElement) {
        if (mayDraw || vueElementName(element, importsOf(context)) !== 'svg') return
        const node = reported(element.startTag)
        if (insideBespoke(context, node)) return
        context.report({ node, messageId: 'inlineSvg', data: { advice: vueSvgAdvice(element) } })
      },
    }

    /** An Angular `<svg>` named by its static `aria-label` or its `<title>`, as in TSX. */
    function angularSvgAdvice(element: AngularElement): string {
      const labelled = angularAttribute(element, 'aria-label')?.value
      const title = meaningfulAngularChildren(element.children).find(
        (child): child is AngularElement =>
          child.type === 'Element' && angularElementName(child as AngularElement) === 'title',
      )
      return svgAdviceFor(
        typeof labelled === 'string' ? labelled : title ? angularText(title.children) : null,
      )
    }

    // A report on an Angular file writes its answer in template syntax.
    const report = angularReporterFor(context, noExternalIcons.meta?.messages)
    const angularTemplate = {
      Element(element: AngularElement) {
        if (mayDraw || element.name !== ':svg:svg') return
        if (insideBespoke(context, element as unknown as Rule.Node)) return
        report({
          loc: startTagLoc(context, element),
          messageId: 'inlineSvg',
          data: { advice: angularSvgAdvice(element) },
        })
      },
    }

    const markup = {
      SvelteElement(element: SvelteElement) {
        if (mayDraw || element.kind !== 'html' || svelteElementName(element) !== 'svg') return
        const node = reportedMarkup(element.startTag)
        if (insideBespoke(context, node)) return
        context.report({
          node,
          messageId: 'inlineSvg',
          data: { advice: svelteSvgAdvice(element) },
        })
      },
    }

    // A Vue, Svelte or Angular file's glyphs are used in its markup, which the
    // fix does not read.
    const fixes = !isVueFile(context) && !isSvelteFile(context) && !isAngularFile(context)

    const script: Rule.RuleListener = {
      ImportDeclaration(node) {
        if (bespokeFile) return
        const source = String(node.source.value)
        // Only packages ship glyphs. `./icon/Icon` is a file in this repo.
        if (!isBareSpecifier(source)) return
        // `@polymorph/react`, the gateway's home, is the correct import. No
        // polymorph package ships glyphs, so the name heuristic never applies
        // to one.
        if (vocabulary.some((prefix) => source.startsWith(prefix))) return
        const banned =
          packages.some((name) => source === name || source.startsWith(`${name}/`)) ||
          ICON_NAME.test(source)
        if (!banned) return
        const fix = fixes && source === glyphPackage ? glyphFix(node) : null
        const advice = importAdvice(node as Rule.Node, source, fix !== null)
        report({
          node,
          messageId: 'iconImport',
          data: { source, advice },
          ...(fix ? { fix } : {}),
        })
      },

      JSXOpeningElement(node: Rule.Node) {
        if (mayDraw) return
        const name = elementName(node as unknown as JsxOpeningElement)
        if (name !== 'svg') return
        if (insideBespoke(context, node)) return
        context.report({ node, messageId: 'inlineSvg', data: { advice: svgAdvice(node) } })
      },
    }

    return withAngularTemplate(
      context,
      withMarkup(context, withTemplate(context, script, template), markup),
      angularTemplate,
    )
  },
}
