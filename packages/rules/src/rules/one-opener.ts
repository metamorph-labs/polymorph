import type { Rule } from 'eslint'

import { fit } from './advice'
import { elementName, type JsxOpeningElement } from './jsx'
import {
  angularMember,
  angularReporterFor,
  angularSelector,
  isAngularTemplate,
  startTagLoc,
  withAngularTemplate,
  type AngularElement,
} from './angular'
import { reportedMarkup, svelteElementName, withMarkup, type SvelteElement } from './svelte'
import { importsOf, reported, vueElementName, withTemplate, type VueElement } from './vue'

/**
 * Stage 2: a page has exactly one opener.
 *
 * PageHeader and Hero both render the page's `<h1>`, so a screen that composes
 * both has two. A page composes **exactly one of PageHeader or Hero**
 * (`design/components/hero.md`). That pair rule protects the one-h1 law, which
 * is a law about a page. This is therefore the only red rule about composition
 * rather than expression.
 *
 * **What it cannot see.** A file-scoped rule reads one module. It cannot see a
 * page assembled across modules, such as a route that renders `<Hero>` and a
 * layout component that renders `<PageHeader>`, and no configuration changes
 * that. In this repository, the corpus check in
 * `packages/rules/src/repo-laws.test.ts` ("the one-h1 law counts a pair") covers
 * that case by reading every app file and every component that renders an
 * `<h1>`. That check cannot ship to consumers, because it tests this
 * repository's trees. This rule ships instead. It catches the common case (one
 * page, one file, both openers) in a consumer's repo, where the corpus check
 * does not exist. `no-app-css` splits its law the same way, for the same reason.
 *
 * A module that opens two ways, such as a ternary between a Hero and a
 * PageHeader, is also reported. This is intended, not a tolerated false
 * positive: a screen with two openers has two identities, and the fix is the
 * same (choose one, or split the file).
 *
 * **No `<Bespoke>` exemption.** Every other stage-2 rule is suspended inside a
 * declared zone, but this one is not. Rung 4 suspends the vocabulary rules, and
 * the exception ladder states that accessibility laws are never suspended
 * (`docs/rules.md`). Two h1s break the accessibility part of the law, so the
 * ladder's answer is rung 1: the vocabulary already has the opener the page
 * needs. `RULE_CLIMB` records exactly that.
 *
 * **What it says.** Which opener to keep. A page archetype in the same module
 * (`ListPage`, `AuthPage`, …) renders the page's `<h1>` from its own `title`,
 * so the answer there is the archetype's title and neither explicit opener.
 * Without one, the report names the rule from `design/components/hero.md`:
 * PageHeader on a working screen, Hero on an opening page.
 *
 * **In a Vue file** the openers and archetypes are read from the template
 * (`<PageHeader>` or `<page-header>`), which is walked before the report. **In
 * a Svelte file** they are the markup's components, which are part of the
 * program and walked before its end. **In an Angular template** they are the
 * elements their selectors name (`<pm-page-header>`, `<pm-hero>`), and the
 * report names them so.
 */

interface Options {
  /** The openers: components that render the page's `<h1>`. */
  openers?: string[]
  /** Page archetypes -> what renders the page's `<h1>` from their `title`. */
  archetypes?: Record<string, string>
}

const DEFAULT_OPENERS = ['PageHeader', 'Hero']

/** Where a report points: a node, or an Angular element's start tag. */
type ReportTarget = { node: Rule.Node } | { loc: NonNullable<Rule.Node['loc']> }

/**
 * The page archetypes in `design/archetypes/`, each of which renders the
 * page's `<h1>` from its `title`. `fix-api.test.ts` checks the list against
 * those specs.
 */
export const PAGE_ARCHETYPES: Record<string, string> = {
  ListPage: 'its PageHeader',
  DetailPage: 'its PageHeader',
  FormPage: 'its PageHeader',
  SettingsPage: 'its PageHeader',
  Dashboard: 'its PageHeader',
  ConversationPage: 'its PageHeader',
  MasterDetailPage: 'its PageHeader',
  SearchPage: 'its PageHeader',
  AuthPage: "its card's title",
}

export const oneOpener: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'A page composes exactly one opener — PageHeader or Hero, never both.' },
    schema: [
      {
        type: 'object',
        properties: {
          openers: { type: 'array', items: { type: 'string' } },
          archetypes: { type: 'object', additionalProperties: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      bothOpeners:
        "Unexpected <{{second}}> beside <{{first}}>: each renders the page's <h1>. {{advice}}",
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as Options
    const openers = new Set(options.openers ?? DEFAULT_OPENERS)
    const archetypes = options.archetypes ?? PAGE_ARCHETYPES

    /** The first kind of opener seen, and the first of the other kind: one report per page. */
    let first: string | null = null
    let second: { name: string; at: ReportTarget } | null = null
    let archetype: string | null = null

    function seen(name: string, at: ReportTarget): void {
      if (Object.hasOwn(archetypes, name)) archetype ??= name
      if (second !== null || !openers.has(name)) return

      if (first === null) {
        first = name
        return
      }
      // Reported at the first opener of the other kind, which the reader can
      // delete without losing the page's opener.
      if (name !== first) second = { name, at }
    }

    const template = {
      VElement(element: VueElement) {
        seen(vueElementName(element, importsOf(context)), { node: reported(element.startTag) })
      },
    }

    const markup = {
      SvelteElement(element: SvelteElement) {
        if (element.kind !== 'component') return
        seen(svelteElementName(element), { node: reportedMarkup(element.startTag) })
      },
    }

    // The template is walked before the program's end, where the report is made.
    const script: Rule.RuleListener = {
      JSXOpeningElement(node: Rule.Node) {
        const name = elementName(node as unknown as JsxOpeningElement)
        if (name) seen(name, { node })
      },

      // The archetype can come after the pair, so the report waits for the
      // whole module.
      'Program:exit'() {
        if (first === null || second === null) return
        // An Angular template names a member by its selector.
        const named = (member: string) => (angular ? angularSelector(member) : member)
        const head = `Unexpected <${named(second.name)}> beside <${named(first)}>: each renders the page's <h1>.`
        const advice =
          archetype !== null
            ? `<${named(archetype)}> renders ${archetypes[archetype]} from \`<${archetype} title="…">\`: ` +
              'keep that and drop both here (rung 1).'
            : 'Keep `<PageHeader>` on a working screen or `<Hero>` on an opening page (rung 1).'
        report({
          ...second.at,
          messageId: 'bothOpeners',
          data: { first: named(first), second: named(second.name), advice: fit(head, [advice]) },
        })
      },
    }

    const angular = isAngularTemplate(context)
    // A report on an Angular template writes its answer in template syntax.
    const report = angularReporterFor(context, oneOpener.meta?.messages)
    const angularTemplate = {
      Element(element: AngularElement) {
        const name = angularMember(element)
        if (name !== null) seen(name, { loc: startTagLoc(context, element) })
      },
    }

    // The template is walked first: the report is made at the program's end.
    return withAngularTemplate(
      context,
      withMarkup(context, withTemplate(context, script, template, 'before'), markup),
      angularTemplate,
    )
  },
}
