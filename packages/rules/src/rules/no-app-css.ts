import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

import type { Rule } from 'eslint'

import type { TokenValues } from '../stylelint/catalogue.js'
import { fit, MESSAGE_LIMIT, ZONE } from './advice'
import { angularSelector, componentMetadata, isAngularFile, withAngularTemplate } from './angular'
import {
  importsBindingFrom,
  importsHostedLibrary,
  isPackageSpecifier,
  packageOf,
  THIRD_PARTY_ELEMENT,
  thirdPartySpan,
} from './jsx'
import { marginAdvice, readLayout, unmappedAdvice, type Declaration } from './layout'
import { isStylesheet, pathOf } from './specifier'
import { reportedMarkup, withMarkup, type SvelteStyleElement } from './svelte'
import { reported, reporterFor, topLevelBlocks, vueLiteral, type VueText } from './vue'

/**
 * Stage 1: application code has no stylesheets.
 *
 * A screen with its own CSS file has a place to put a design decision, and that
 * leads to drift. Importing the vocabulary's own styles or a webfont is not a
 * decision, so the configuration allows both.
 *
 * This rule catches imports. The companion source test catches a stylesheet
 * that exists but is never imported, because ESLint never visits such a file.
 *
 * **What it says.** The report reads the stylesheet, when it is a file in the
 * project, and says what its rules become. Spacing and flow are the layout
 * primitives' props and colour and type a member's own props, named as the
 * rewrite. `@keyframes` are motion, which belongs to the member that moves.
 * Anything else has no member prop, and goes inline in a `<Bespoke>` zone. The
 * file is only read: a stylesheet outside the project, or past a size a
 * stylesheet has no reason to reach, gets the general answer.
 *
 * **A package's stylesheet** (`leaflet/dist/leaflet.css`) is another library's
 * component's. A file that hosts that library in a `<ThirdParty>` boundary may
 * import it, and a boundary hosts only in a file that imports a binding from
 * the library (`jsx.ts`). So the report names the boundary only where one
 * would lift the import: in a file that already imports a binding from the
 * package. Anywhere else it says what lifts the stylesheet, and for a package
 * that is only a stylesheet (`normalize.css`), that nothing does.
 *
 * **A Vue file's `<style>` block** is the same violation as an import: a
 * stylesheet in application code. It is reported with what its rules become,
 * read from the block, and one with a `src` is reported as an import of it.
 * **A Svelte file's `<style>` block** is read the same way. **An Angular
 * component's `styles`** are its stylesheet, read the same way, its
 * `styleUrl` and `styleUrls` are imports of their files, and a `<style>`
 * element in its template is a block.
 */

interface Options {
  /** Module prefixes whose stylesheets may be imported. */
  allowImportsFrom?: string[]
  /** The theme's values, so a spacing rule names its step. */
  values?: TokenValues
}

const DEFAULT_ALLOWED = ['@polymorph/', '@fontsource/', '@fontsource-variable/']

/** A stylesheet larger than this is not read: the report falls back to the general answer. */
const READ_LIMIT = 256 * 1024

/** What a stylesheet declares: its declarations, and whether it defines keyframes. */
export interface StylesheetReading {
  declarations: Declaration[]
  keyframes: boolean
}

/**
 * The declarations in a stylesheet's text, block by block from the innermost
 * out, so nested SCSS reads like flat CSS. Comments are dropped first, so a
 * commented-out rule is not read as one.
 */
export function readStylesheet(css: string): StylesheetReading {
  let text = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const keyframes = /@(-\w+-)?keyframes\b/i.test(text)
  const declarations: Declaration[] = []
  const seen = new Set<string>()
  const innermost = /\{([^{}]*)\}/g
  while (innermost.test(text)) {
    text = text.replace(innermost, (_, block: string) => {
      for (const line of block.split(';')) {
        const match = /^\s*([a-z][a-z-]+)\s*:\s*(.+?)\s*$/is.exec(line)
        const property = match?.[1]?.toLowerCase()
        if (!match || !property || seen.has(property)) continue
        seen.add(property)
        declarations.push({ property, value: match[2] as string, written: property })
      }
      return ';'
    })
  }
  return { declarations, keyframes }
}

export const noAppCss: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Application code may not contain or import stylesheets.' },
    schema: [
      {
        type: 'object',
        properties: {
          allowImportsFrom: { type: 'array', items: { type: 'string' } },
          values: { type: 'object' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      stylesheet: 'Unexpected stylesheet import `{{source}}`. {{advice}}',
      styleBlock: 'Unexpected <style> block. {{advice}}',
      componentStyles: 'Unexpected component `styles`. {{advice}}',
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as Options
    const allowed = options.allowImportsFrom ?? DEFAULT_ALLOWED
    // In a `.vue` file a report's answer is written in template syntax.
    const report = reporterFor(context, noAppCss.meta?.messages)
    // The boundary as a sentence names it, bare: by its selector in an Angular file.
    const boundaryTag = isAngularFile(context)
      ? angularSelector(THIRD_PARTY_ELEMENT)
      : THIRD_PARTY_ELEMENT

    /** The stylesheet's text, when it is a readable file inside the project. */
    function contents(source: string): string | null {
      if (!source.startsWith('.')) return null
      const path = resolve(dirname(resolve(context.cwd, context.filename)), pathOf(source))
      const inside = relative(context.cwd, path)
      if (inside.startsWith('..') || isAbsolute(inside)) return null
      try {
        if (!existsSync(path) || statSync(path).size > READ_LIMIT) return null
        return readFileSync(path, 'utf8')
      } catch {
        return null
      }
    }

    function advice(source: string): string {
      const head = `Unexpected stylesheet import \`${source}\`.`
      if (!isPackageSpecifier(source)) return adviceFor(head, contents(source), 'file')
      const library = packageOf(source)
      // A package's stylesheet belongs to the component it styles.
      if (importsBindingFrom(context, source)) {
        return fit(head, [
          `Host the library's component in ${thirdPartySpan(library)} (rung 4).`,
          'The file that declares it may import this.',
        ])
      }
      // A package that is a stylesheet has no component to host.
      if (isStylesheet(library)) {
        return fit(head, [
          'A stylesheet-only package hosts no component, so no boundary lifts it: the theme ' +
            'styles the page and members carry the rest (rung 1).',
        ])
      }
      // The boundary is not offered: written alone it would host nothing. The
      // package is named while the report fits.
      const lifted = (from: string) =>
        `It is lifted only in a file that imports a binding from ${from} and hosts it in ` +
        `<${boundaryTag}> (rung 4).`
      const named = lifted(`\`${library}\``)
      return `${head} ${named}`.length < MESSAGE_LIMIT ? named : lifted('its package')
    }

    /** What a stylesheet's rules become, from its text, or the general answer without it. */
    function adviceFor(
      head: string,
      css: string | null,
      what: 'file' | 'block' | 'styles',
    ): string {
      const general = [
        'Spacing becomes `gap={…}` or `p={…}` on `<Stack>`, `<Inline>` or `<Grid>` (rung 1).',
        `Colour and type are a member's props; the rest is \`style\` in a ${ZONE} zone.`,
      ]
      if (css === null) return fit(head, general)

      const { declarations, keyframes } = readStylesheet(css)
      if (keyframes) {
        return fit(head, [
          "Its `@keyframes` are motion, which is the member's own: `<Spinner>`, `<Skeleton>` and " +
            'the overlays animate their states (rung 1).',
          `A one-off animation goes in a ${ZONE} zone.`,
        ])
      }
      if (declarations.length === 0) return fit(head, general)

      const reading = readLayout(declarations, options.values)
      const margin = marginAdvice(reading)
      const rest = reading.unmappedKind === 'other' || reading.unmappedKind === 'motion'
      if (reading.replacement === null || rest) {
        const [first, second] = reading.unmapped.map((property) => `\`${property}\``)
        const named = second ? `${first} and ${second}` : first
        // A file whose only rule says nothing on its own (`flex-wrap`) gives
        // no specific answer, so the general one stands.
        const specific = [
          rest
            ? `${named} ${second ? 'have' : 'has'} no member prop: write ${second ? 'them' : 'it'} as \`style\` inside a ${ZONE} zone (rung 4).`
            : unmappedAdvice(reading),
          reading.replacement === null ? '' : `The spacing is ${reading.replacement}.`,
          margin,
        ].filter((sentence) => sentence !== '')
        return fit(head, specific.length > 0 ? specific : general)
      }
      return fit(head, [
        `Its rules are ${reading.replacement} (rung 1), so the ${what} can go.`,
        unmappedAdvice(reading),
        margin,
      ])
    }

    function check(node: Rule.Node, source: string): void {
      if (!isStylesheet(source)) return
      if (allowed.some((prefix) => source.startsWith(prefix))) return
      // The stylesheet of a library the file hosts comes with its component.
      if (importsHostedLibrary(context, source)) return
      report({ node, messageId: 'stylesheet', data: { source, advice: advice(source) } })
    }

    /** Each `<style>` block of a Vue file: a `src` is an import, the rest is read whole. */
    function checkBlocks(): void {
      for (const block of topLevelBlocks(context).filter((entry) => entry.rawName === 'style')) {
        const source = vueLiteral(block, 'src')
        if (typeof source === 'string') {
          check(reported(block.startTag), source)
          continue
        }
        // As written: the reader drops comments line by line.
        const css = block.children
          .map((child) => (child.type === 'VText' ? (child as VueText).value : ''))
          .join('')
        report({
          node: reported(block.startTag),
          messageId: 'styleBlock',
          data: { advice: adviceFor('Unexpected <style> block.', css, 'block') },
        })
      }
    }

    const markup = {
      SvelteStyleElement(block: SvelteStyleElement) {
        const css = block.children.map((child) => child.value).join('')
        report({
          node: reportedMarkup(block.startTag),
          messageId: 'styleBlock',
          data: { advice: adviceFor('Unexpected <style> block.', css, 'block') },
        })
      },
    }

    /** A string an Angular component's metadata writes out, or `null` when it is computed. */
    function written(node: { type: string; [key: string]: unknown }): string | null {
      if (node.type === 'Literal' && typeof node['value'] === 'string') return node['value']
      if (node.type === 'TemplateLiteral' && (node['expressions'] as unknown[]).length === 0) {
        const [quasi] = node['quasis'] as { value: { cooked: string } }[]
        return quasi?.value.cooked ?? null
      }
      return null
    }

    /**
     * An Angular component's stylesheets: `styles`, read whole, and each file
     * `styleUrl` and `styleUrls` name, as an import of it.
     */
    function checkComponent(call: Rule.Node): void {
      const metadata = componentMetadata(call as Parameters<typeof componentMetadata>[0])
      if (metadata === null) return
      const styles = metadata.get('styles')
      if (styles !== undefined) {
        const value = styles.value
        const parts =
          value.type === 'ArrayExpression'
            ? (value['elements'] as { type: string; [key: string]: unknown }[])
            : [value]
        const texts = parts.map(written)
        const css = texts.every((text) => text !== null) ? texts.join('\n') : null
        report({
          node: styles,
          messageId: 'componentStyles',
          data: { advice: adviceFor('Unexpected component `styles`.', css, 'styles') },
        })
      }
      for (const name of ['styleUrl', 'styleUrls']) {
        const property = metadata.get(name)
        if (property === undefined) continue
        const value = property.value
        const parts =
          value.type === 'ArrayExpression'
            ? (value['elements'] as { type: string; [key: string]: unknown }[])
            : [value]
        for (const part of parts) {
          const source = written(part)
          if (source !== null) check(part as unknown as Rule.Node, source)
        }
      }
    }

    /**
     * A `<style>` element in an Angular template, read as a block. Angular's
     * template parser lifts it into the component's styles and leaves no node
     * for it, so the template's text is read, its comments blanked first.
     */
    const angularTemplate = {
      Program() {
        const text = context.sourceCode.text.replace(/<!--[\s\S]*?-->/g, (comment) =>
          ' '.repeat(comment.length),
        )
        for (const match of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
          const start = context.sourceCode.getLocFromIndex(match.index)
          const end = context.sourceCode.getLocFromIndex(match.index + match[0].length)
          report({
            loc: { start, end },
            messageId: 'styleBlock',
            data: {
              advice: adviceFor('Unexpected <style> block.', match[1] ?? '', 'block'),
            },
          })
        }
      },
    }

    const angular = isAngularFile(context)
    const script: Rule.RuleListener = {
      Program() {
        checkBlocks()
      },
      CallExpression(node) {
        if (angular) checkComponent(node)
      },
      ImportDeclaration(node) {
        check(node, String(node.source.value))
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
          check(node, node.source.value)
        }
      },
      ExportAllDeclaration(node) {
        if (node.source) check(node, String(node.source.value))
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, String(node.source.value))
      },
    }

    return withAngularTemplate(context, withMarkup(context, script, markup), angularTemplate)
  },
}
