import type { Rule } from 'eslint'

import { matchesAny } from '../glob'
import { fit, ZONE } from './advice'
import {
  angularElementName,
  angularReporterFor,
  BINDING,
  componentMetadata,
  elementOfAttribute,
  EVENT,
  isAngularFile,
  reportedTemplate,
  withAngularTemplate,
  writtenName,
  type AngularBoundAttribute,
  type AngularBoundEvent,
  type AngularTextAttribute,
} from './angular'
import { occurrences, type ImportDeclarationNode } from './fix'
import { fileDeclaresBespoke, hostsBanned, insideBespoke } from './jsx'
import { isBareSpecifier } from './specifier'
import {
  directiveText,
  elementOfTag,
  reportedMarkup,
  svelteElementName,
  withMarkup,
  type SvelteDirective,
} from './svelte'
import { importsOf, reported, vueElementName, withTemplate, type VueElement } from './vue'

/**
 * Stage 2: the motion engine stays inside the vocabulary.
 *
 * Motion binds to component state, not to screens (`docs/motion.md`). An app
 * that calls the engine directly makes its own motion decisions per screen, and
 * the engine can no longer be replaced. The Stylelint rule
 * `polymorph/no-motion-outside-vocabulary` covers the CSS side of this law
 * (`transition`/`animation` outside the vocabulary).
 *
 * Point `allowIn` at the vocabulary's own motion internals and the same rule
 * confines the engine there. That keeps it replaceable, and makes "motion is
 * re-exported nowhere" a checked rule instead of an intention.
 *
 * **What it says.** The report reads what the file does with the library and
 * names the member that already does it: a `motion.div` fading in is an
 * entrance, which Dialog, Drawer, Popover and Toast animate for themselves; a
 * height animation is Collapsible's; a `whileTap` scale is Button's press
 * feedback. A call no member makes is a zone, rung 4.
 *
 * **In a Vue file** the imports are read from `<script setup>`, and Vue's own
 * `<Transition>` and `<TransitionGroup>` in the template are the same reach:
 * an entrance and exit written at a call site, which the overlays already
 * animate.
 *
 * **In a Svelte file** the imports are read from its scripts, and Svelte's
 * own motion is the same reach: an import from `svelte/transition`,
 * `svelte/animate`, `svelte/motion` or `svelte/easing`, and a `transition:`,
 * `in:`, `out:` or `animate:` directive on any element. The answer is read
 * from the function's name: `slide` is a section opening and closing, `fade`,
 * `fly`, `scale` and the rest are an entrance and exit, and a function no
 * member makes (`animate:flip`) is a zone. **In Solid TSX** the libraries'
 * components (`<Motion.div>`, `<Presence>`, `<Transition>`) are read as their
 * React counterparts are.
 *
 * **In an Angular component** Angular's own motion is the same reach: an
 * import from `@angular/animations` or `@angular/platform-browser/animations`,
 * a component's `animations`, and in its template a trigger (`[@fade]`,
 * `@fade`) or an enter or leave animation (`animate.enter`, `[animate.enter]`,
 * `(animate.leave)`). An import and the metadata are read by the `style()`
 * calls the file makes: a height is a section opening and closing, and an
 * opacity or a transform an entrance and exit. An enter or leave animation is
 * an entrance and exit, and a trigger is read by its name (`expand` opens a
 * section, `fade` enters); a trigger whose name says neither is a zone.
 */

/** What a use of the library is for, read from the code. */
type MotionUse = 'presence' | 'collapse' | 'press' | 'spin' | 'spring'

/**
 * The members that already carry each kind of motion, as the report names
 * them. `fix-api.test.ts` checks each name against `design/components/`.
 */
export const MOTION_MEMBERS: Record<MotionUse, { members: string[]; is: string }> = {
  presence: { members: ['Dialog', 'Drawer', 'Popover', 'Toast'], is: 'an entrance and exit' },
  collapse: { members: ['Collapsible', 'Accordion'], is: 'a section opening and closing' },
  press: { members: ['Button'], is: 'press feedback' },
  spin: { members: ['Spinner'], is: 'a loading spin' },
  spring: { members: ['Switch', 'Slider', 'Tabs'], is: 'a spring on a thumb or indicator' },
}

/** Names a presence library exports for mounting and unmounting. */
const PRESENCE_EXPORTS =
  /^(AnimatePresence|Presence|CSSTransition|Transition|TransitionGroup|SwitchTransition)$/
const SPRING_EXPORTS = /^(useSpring|useSprings|useTransition|animated|useTrail|useChain)$/

/**
 * Svelte's own motion functions, by name, and the kind of motion each is: what
 * a directive that uses one is, and what an import of one from a `svelte/`
 * module is. A function not listed (`flip`, `tweened`) is a call no member
 * makes.
 */
const SVELTE_MOTION: Record<string, MotionUse> = {
  slide: 'collapse',
  fade: 'presence',
  fly: 'presence',
  scale: 'presence',
  blur: 'presence',
  draw: 'presence',
  crossfade: 'presence',
  send: 'presence',
  receive: 'presence',
  spring: 'spring',
  Spring: 'spring',
}

/** The kind of motion a Svelte function is, by its name, or `undefined`. */
const svelteMotion = (name: string): MotionUse | undefined =>
  Object.hasOwn(SVELTE_MOTION, name) ? SVELTE_MOTION[name] : undefined

/** The members that already make a kind of motion, as a clause: `` `<Button>` already has it ``. */
function whoAnimates(use: MotionUse): string {
  const named = MOTION_MEMBERS[use].members.map((member) => `\`<${member}>\``)
  return named.length === 1
    ? `${named[0]} already has it`
    : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]} animate their own`
}

interface AstNode {
  type: string
  [key: string]: unknown
}

/** The keys of an object literal, or of every object inside it (`variants`). */
function keysIn(value: AstNode | undefined): string[] {
  if (value === undefined) return []
  if (value.type === 'JSXExpressionContainer') return keysIn(value['expression'] as AstNode)
  if (value.type !== 'ObjectExpression') return []
  return (value['properties'] as AstNode[]).flatMap((property) => {
    if (property.type !== 'Property') return []
    const key = property['key'] as { name?: string; value?: unknown }
    const name = typeof key.name === 'string' ? key.name : String(key.value)
    return [name, ...keysIn(property['value'] as AstNode)]
  })
}

interface Options {
  /** Exact names or `name/` prefixes that are motion engines. */
  packages?: string[]
  /** Globs of files allowed to import them: the vocabulary's motion internals. */
  allowIn?: string[]
}

const DEFAULT_PACKAGES = [
  'motion',
  'framer-motion',
  '@react-spring/web',
  '@react-spring/core',
  'react-spring',
  'popmotion',
  'gsap',
  'animejs',
  'react-transition-group',
  'auto-animate',
  '@formkit/auto-animate',
  // The Vue bindings.
  'motion-v',
  '@vueuse/motion',
  // Svelte's own motion modules, and the Svelte bindings.
  'svelte/transition',
  'svelte/animate',
  'svelte/motion',
  'svelte/easing',
  'svelte-motion',
  '@humanspeak/svelte-motion',
  // The Solid bindings.
  'solid-motionone',
  '@motionone/solid',
  'solid-transition-group',
  '@solid-primitives/transition-group',
  // Angular's own animation packages.
  '@angular/animations',
  '@angular/platform-browser/animations',
]

/** Vue's built-in presence components, in either spelling a template uses. */
const VUE_PRESENCE = new Set(['Transition', 'TransitionGroup'])

export const noExternalMotion: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Motion is owned by the vocabulary and never imported by app code.' },
    schema: [
      {
        type: 'object',
        properties: {
          packages: { type: 'array', items: { type: 'string' } },
          allowIn: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      motionImport: 'Unexpected motion library `{{source}}`. {{advice}}',
      motionReexport: 'Unexpected re-export of `{{source}}`. {{advice}}',
      motionElement: 'Unexpected <{{element}}>. {{advice}}',
      motionDirective: 'Unexpected `{{directive}}` on <{{element}}>. {{advice}}',
      motionMetadata: 'Unexpected component `animations`. {{advice}}',
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as Options
    const packages = options.packages ?? DEFAULT_PACKAGES
    if (matchesAny(context.filename, options.allowIn ?? [])) return {}
    // Import bans apply per file, so a file that declares a zone is exempt as a
    // whole. The zone is still declared and listed in the inventory.
    if (fileDeclaresBespoke(context)) return {}

    /** What an export of the library is for, by its name alone: a presence or a spring. */
    function useByName(name: string): { use: MotionUse; code: string; doing: string } | null {
      if (PRESENCE_EXPORTS.test(name)) return { use: 'presence', code: name, doing: '' }
      if (SPRING_EXPORTS.test(name)) return { use: 'spring', code: name, doing: '' }
      return null
    }

    /** What a re-export hands out, by the names it re-exports. */
    function reexportUse(node: Rule.Node): { use: MotionUse; code: string; doing: string } | null {
      if (node.type !== 'ExportNamedDeclaration') return null
      for (const specifier of node.specifiers) {
        const name = specifier.local.type === 'Identifier' ? specifier.local.name : null
        const found = name === null ? null : useByName(name)
        if (found) return found
      }
      return null
    }

    /**
     * What the file does with the import, as the kind of motion it is, and
     * the code that showed it: `motion.div` animating `opacity`.
     */
    function useOf(node: Rule.Node): { use: MotionUse; code: string; doing: string } | null {
      const declaration = node as unknown as ImportDeclarationNode
      if (String(declaration.source?.value).startsWith('@angular/animations')) {
        return angularStyleUse()
      }
      const svelte = String(declaration.source?.value).startsWith('svelte/')
      for (const specifier of declaration.specifiers ?? []) {
        const local = specifier.local.name
        const imported = specifier.imported?.name ?? local
        const named = useByName(imported)
        if (named) return named
        const own = svelte ? svelteMotion(imported) : undefined
        if (own !== undefined) return { use: own, code: imported, doing: '' }

        for (const { parent } of occurrences(context.sourceCode, local)) {
          // `<motion.div …>`: the member expression is the element's name.
          const member = parent as AstNode
          if (member.type !== 'JSXMemberExpression') continue
          const opening = (member['parent'] as AstNode | undefined) ?? null
          if (opening?.type !== 'JSXOpeningElement') continue
          const tag = `${local}.${String((member['property'] as { name?: string }).name)}`
          const attributes = (opening['attributes'] as AstNode[]).filter(
            (attribute) => attribute.type === 'JSXAttribute',
          )
          const named = (name: string) =>
            attributes.find((attribute) => (attribute['name'] as { name?: string }).name === name)
          const keys = ['initial', 'animate', 'exit', 'variants', 'transition'].flatMap((name) =>
            keysIn(named(name)?.['value'] as AstNode | undefined),
          )
          if (named('layout') || keys.includes('height')) {
            return { use: 'collapse', code: tag, doing: ' animating its height' }
          }
          if (keys.includes('rotate') && keys.includes('repeat')) {
            return { use: 'spin', code: tag, doing: ' rotating on repeat' }
          }
          if (named('whileTap') || named('whileHover')) {
            return {
              use: 'press',
              code: tag,
              doing: ` with ${named('whileTap') ? 'whileTap' : 'whileHover'}`,
            }
          }
          const moved = ['opacity', 'scale', 'x', 'y'].find((key) => keys.includes(key))
          if (moved) return { use: 'presence', code: tag, doing: ` animating ${moved}` }
        }
      }
      return null
    }

    /**
     * What the file's Angular animations do, read from the `style({ … })`
     * calls it makes with `@angular/animations`' `style`: a height is a section
     * opening and closing, and an opacity or a transform an entrance and exit.
     */
    function angularStyleUse(): { use: MotionUse; code: string; doing: string } | null {
      const program = context.sourceCode.ast as unknown as { body: AstNode[] }
      const locals = program.body.flatMap((statement) => {
        const declaration = statement as unknown as ImportDeclarationNode
        if (statement.type !== 'ImportDeclaration') return []
        if (!String(declaration.source?.value).startsWith('@angular/animations')) return []
        return (declaration.specifiers ?? [])
          .filter((specifier) => (specifier.imported?.name ?? specifier.local.name) === 'style')
          .map((specifier) => specifier.local.name)
      })
      const keys = locals.flatMap((local) =>
        occurrences(context.sourceCode, local).flatMap(({ node, parent }) => {
          const call = parent as AstNode
          if (call.type !== 'CallExpression' || call['callee'] !== node) return []
          return keysIn((call['arguments'] as AstNode[])[0])
        }),
      )
      if (keys.some((key) => /^(height|maxHeight|max-height)$/.test(key))) {
        return { use: 'collapse', code: 'style()', doing: ' animating height' }
      }
      const moved = ['opacity', 'transform', 'scale'].find((key) => keys.includes(key))
      if (moved) return { use: 'presence', code: 'style()', doing: ` animating ${moved}` }
      return null
    }

    /**
     * The member that already makes the motion the code reaches for, or the
     * zone. A re-export is answered the same way, because what it hands out is
     * what an import would have used, and it says why it is a leak.
     */
    function advice(node: Rule.Node, source: string, reexport: boolean): string {
      const head = reexport
        ? `Unexpected re-export of \`${source}\`.`
        : `Unexpected motion library \`${source}\`.`
      const found = reexport
        ? reexportUse(node)
        : node.type === 'ImportDeclaration'
          ? useOf(node)
          : null
      const leak = 'A re-export leaks the library as an import does.'
      if (found === null) {
        return fit(
          head,
          reexport
            ? [
                `Drop it: compose the member that moves (rung 1), or keep a one-off in a ${ZONE} zone (rung 4).`,
                leak,
              ]
            : [
                "No member makes this call: motion binds to a member's states, so a one-off goes in a " +
                  `${ZONE} zone (rung 4).`,
              ],
        )
      }
      const { is } = MOTION_MEMBERS[found.use]
      return fit(head, [
        `\`${found.code}\`${found.doing} is ${is}: ${whoAnimates(found.use)} (rung 1).`,
        reexport ? leak : `A one-off goes in a ${ZONE} zone.`,
      ])
    }

    // A report on an Angular file writes its answer in template syntax.
    const report = angularReporterFor(context, noExternalMotion.meta?.messages)

    function check(node: Rule.Node, source: string, messageId: string): void {
      if (!isBareSpecifier(source)) return
      const banned = packages.find((name) => source === name || source.startsWith(`${name}/`))
      if (banned === undefined) return
      // A file that hosts the library in a `<ThirdParty>` boundary may import
      // it. The boundary names the banned entry itself, so one that names
      // `svelte` or a sibling in the same npm scope lifts nothing here.
      if (messageId === 'motionImport' && hostsBanned(context, banned)) return
      report({
        node,
        messageId,
        data: { source, advice: advice(node, source, messageId === 'motionReexport') },
      })
    }

    const template = {
      VElement(element: VueElement) {
        const name = vueElementName(element, importsOf(context))
        const presence = name.charAt(0).toUpperCase() + name.slice(1)
        if (!VUE_PRESENCE.has(presence)) return
        const node = reported(element.startTag)
        if (insideBespoke(context, node)) return
        const { members, is } = MOTION_MEMBERS.presence
        const named = members.map((member) => `\`<${member}>\``)
        const head = `Unexpected <${element.rawName}>.`
        context.report({
          node,
          messageId: 'motionElement',
          data: {
            element: element.rawName,
            advice: fit(head, [
              `It is ${is}: ${named.slice(0, -1).join(', ')} and ${named.at(-1) as string} animate their own (rung 1).`,
              `A one-off goes in a ${ZONE} zone.`,
            ]),
          },
        })
      },
    }

    /** An answer for a kind of motion, or the zone when no member makes it. */
    function useAdvice(head: string, use: MotionUse | undefined): string {
      return use === undefined
        ? fit(head, [
            "No member makes it: motion binds to a member's states, so a one-off goes in a " +
              `${ZONE} zone (rung 4).`,
          ])
        : fit(head, [
            `It is ${MOTION_MEMBERS[use].is}: ${whoAnimates(use)} (rung 1).`,
            `A one-off goes in a ${ZONE} zone.`,
          ])
    }

    /** What a legacy trigger is, by its name: `expand` opens a section, `fade` enters. */
    function triggerUse(name: string): MotionUse | undefined {
      if (/expand|collapse|height|accordion/i.test(name)) return 'collapse'
      if (/fade|enter|leave|appear|scale|fly|pop|slide/i.test(name)) return 'presence'
      return undefined
    }

    /** A trigger or an enter or leave animation in an Angular template, on any element. */
    function angularMotion(
      node: AngularBoundAttribute | AngularBoundEvent | AngularTextAttribute,
      use: MotionUse | undefined,
    ): void {
      const element = elementOfAttribute(node)
      if (element === null) return
      const reported = reportedTemplate(node)
      if (insideBespoke(context, reported)) return
      const written = writtenName(context.sourceCode, node)
      const name = angularElementName(element)
      report({
        node: reported,
        messageId: 'motionDirective',
        data: {
          directive: written,
          element: name,
          advice: useAdvice(`Unexpected \`${written}\` on <${name}>.`, use),
        },
      })
    }

    /** `animate.enter` and `animate.leave`, Angular's enter and leave animations. */
    const ENTER_LEAVE = /^animate\.(enter|leave)$/

    const angularTemplate = {
      TextAttribute(node: AngularTextAttribute) {
        if (ENTER_LEAVE.test(node.name)) angularMotion(node, 'presence')
      },
      BoundAttribute(node: AngularBoundAttribute) {
        if (node.__originalType === BINDING.animation) angularMotion(node, 'presence')
        if (node.__originalType === BINDING.legacyAnimation) {
          angularMotion(node, triggerUse(node.name))
        }
      },
      // A trigger's callback (`(@fade.done)`) belongs to the trigger, which is
      // reported where it is bound.
      BoundEvent(node: AngularBoundEvent) {
        if (node.__originalType === EVENT.animation) angularMotion(node, 'presence')
      },
    }

    const markup = {
      // `transition:fade`, `in:fly`, `out:fade`, `animate:flip`: Svelte's own
      // motion, on any element.
      SvelteDirective(directive: SvelteDirective) {
        if (directive.kind !== 'Transition' && directive.kind !== 'Animation') return
        const element = elementOfTag(directive.parent)
        if (element === null) return
        const node = reportedMarkup(directive)
        if (insideBespoke(context, node)) return
        const written = directiveText(context.sourceCode, directive)
        const name = svelteElementName(element)
        const called = written.slice(written.indexOf(':') + 1)
        const use = svelteMotion(called.slice(called.lastIndexOf('.') + 1))
        const head = `Unexpected \`${written}\` on <${name}>.`
        context.report({
          node,
          messageId: 'motionDirective',
          data: {
            directive: written,
            element: name,
            advice:
              use === undefined
                ? fit(head, [
                    "No member makes it: motion binds to a member's states, so a one-off goes in a " +
                      `${ZONE} zone (rung 4).`,
                  ])
                : fit(head, [
                    `It is ${MOTION_MEMBERS[use].is}: ${whoAnimates(use)} (rung 1).`,
                    `A one-off goes in a ${ZONE} zone.`,
                  ]),
          },
        })
      },
    }

    const angular = isAngularFile(context)
    const script: Rule.RuleListener = {
      // An Angular component's `animations`: the triggers its template plays.
      CallExpression(node) {
        if (!angular) return
        const animations = componentMetadata(node as Parameters<typeof componentMetadata>[0])?.get(
          'animations',
        )
        if (animations === undefined) return
        const found = angularStyleUse()
        const head = 'Unexpected component `animations`.'
        report({
          node: animations,
          messageId: 'motionMetadata',
          data: {
            advice:
              found === null
                ? useAdvice(head, undefined)
                : fit(head, [
                    `\`${found.code}\`${found.doing} is ${MOTION_MEMBERS[found.use].is}: ` +
                      `${whoAnimates(found.use)} (rung 1).`,
                    `A one-off goes in a ${ZONE} zone.`,
                  ]),
          },
        })
      },
      ImportDeclaration(node) {
        check(node, String(node.source.value), 'motionImport')
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
          check(node, node.source.value, 'motionImport')
        }
      },
      ExportAllDeclaration(node) {
        if (node.source) check(node, String(node.source.value), 'motionReexport')
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, String(node.source.value), 'motionReexport')
      },
    }

    return withAngularTemplate(
      context,
      withMarkup(context, withTemplate(context, script, template), markup),
      angularTemplate,
    )
  },
}
