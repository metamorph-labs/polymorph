import type { Rule } from 'eslint'

import { matchesAny } from '../glob'
import {
  componentStringOf,
  reportedTemplate,
  withAngularTemplate,
  type AngularNode,
  type AngularTextAttribute,
} from './angular'
import { reportedMarkup, withMarkup, type SvelteLiteral } from './svelte'

/**
 * Stage 2: a pattern-scoped token may be used only inside its pattern.
 *
 * `--pm-shell-topbar-height` has meaning inside an AppShell and none outside
 * one. Using it elsewhere reads a decision outside the context that owns it
 * (token scopes, `docs/concepts.md`). The owner map declares who owns what, in
 * one file.
 *
 * This is the TypeScript rule, for a namespace referenced in a string or
 * template literal, in a static attribute of Svelte markup, or in a static
 * attribute or a bound string of an Angular template. The Stylelint
 * rule of the same name covers CSS, where these tokens are defined and mostly
 * read.
 *
 * Its report names the owner, the file the pattern lives in, so a reader can
 * see whether this file should be one.
 */

interface Options {
  /** Namespace prefix -> globs of the files that own it. */
  owners?: Record<string, string[]>
}

/**
 * The files that own a namespace, named by the first: `app-shell.module.css`,
 * `archetypes/` for a glob over a directory, or `list-page.module.css and 6
 * more`.
 */
export function ownerOf(globs: readonly string[]): string {
  const [first] = globs
  if (first === undefined) return 'no file'
  const segments = first.split('/')
  const literal = segments.filter((segment) => !segment.includes('*'))
  const name = `${literal[literal.length - 1] ?? first}${literal.length < segments.length ? '/' : ''}`
  return globs.length > 1 ? `${name} and ${globs.length - 1} more` : name
}

export const scopedTokenOwners: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Pattern-scoped tokens are referenced only by their owning pattern.' },
    schema: [
      {
        type: 'object',
        properties: {
          owners: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      outOfScope:
        '`{{namespace}}*` belongs to {{owner}}, not this file ' +
        '(packages/rules/scoped-token-owners.json). Read a theme-scoped token here, or list the ' +
        'file if it owns the pattern.',
    },
  },

  create(context) {
    const owners = ((context.options[0] ?? {}) as Options).owners ?? {}
    const namespaces = Object.entries(owners).filter(
      ([, globs]) => !matchesAny(context.filename, globs),
    )
    if (namespaces.length === 0) return {}

    function check(node: Rule.Node, text: string): void {
      for (const [namespace, globs] of namespaces) {
        if (!text.includes(namespace)) continue
        context.report({
          node,
          messageId: 'outOfScope',
          data: { namespace, owner: ownerOf(globs) },
        })
        return
      }
    }

    // A component's inline template is read where the template parser reads it.
    const script: Rule.RuleListener = {
      Literal(node) {
        if (typeof node.value !== 'string' || componentStringOf(node) === 'template') return
        check(node, node.value)
      },
      TemplateElement(node) {
        if (componentStringOf(node) === 'template') return
        check(node as unknown as Rule.Node, node.value.raw)
      },
    }

    // `style="height: var(--pm-shell-topbar-height)"` in Svelte markup, and in
    // a static attribute or a bound string of an Angular template.
    return withAngularTemplate(
      context,
      withMarkup(context, script, {
        SvelteLiteral(node: SvelteLiteral) {
          check(reportedMarkup(node), node.value)
        },
      }),
      {
        TextAttribute(node: AngularTextAttribute) {
          check(reportedTemplate(node), node.value)
        },
        LiteralPrimitive(node: AngularNode & { value: unknown }) {
          if (typeof node.value === 'string') check(reportedTemplate(node), node.value)
        },
      },
    )
  },
}
