import { dirname, relative, resolve, sep } from 'node:path'

import type { Rule } from 'eslint'

import { isBareSpecifier } from './specifier'

/**
 * The packaging-boundary rule: vendored component source may not import from
 * elsewhere in this repository.
 *
 * The packaging boundary guarantees that a file still works after it is copied.
 * `polymorph add button` copies `Button.tsx`, its stylesheet and its fixture
 * into another repository, and every import in them must still resolve there.
 * Two kinds of import break that, and both look reasonable while the file is
 * still here:
 *
 *  - **A relative path that leaves the vendorable tree.** `../../react/src/…`
 *    and `../../../design/icons.json` resolve in this monorepo and resolve to
 *    nothing in a consumer's `components/ui/` directory.
 *  - **A deep import into a published package.** `@polymorph/react/src/…`
 *    works here because the workspace is the source, but it is not part of the
 *    package's exports and a consumer does not install it. The published
 *    subpaths are the contract, and `/src/` shows that a path bypassed it.
 *
 * A third kind is about the boundary rather than resolution. The boundary a
 * consumer installs is `@polymorph/engine` and `@polymorph/react`. A vendored
 * file that imports `@polymorph/theme` would make a consumer install a package
 * the engine already provides. One that imports `@polymorph/react-ui` imports
 * the vocabulary it was copied out of, which a vendoring consumer does not
 * install. One that imports `@polymorph/rules`, `@polymorph/registry`,
 * `@polymorph/spec`, `@polymorph/cli` or `@polymorph/mcp` would pull a dev-time
 * tool into their app. The `internal` option covers this.
 *
 * The rule is about where imports reach, not about style. Relative imports
 * inside the tree are expected. A component that composes another component
 * gets it copied alongside, which is what the registry's dependency closure
 * computes.
 */

interface Options {
  /** The vendorable tree, repo-relative. Relative imports may not leave it. */
  root?: string
  /**
   * Packages a vendored file may not import: repo-internal ones, and dev-time
   * ones. It reaches what they provide through `@polymorph/engine` or
   * `@polymorph/react`.
   */
  internal?: string[]
  /** Globs of exempt files: tests and harnesses, which are never copied. */
  allowIn?: string[]
}

/**
 * `@polymorph/engine` and `@polymorph/react` are the boundary, but their source
 * paths are not part of it.
 */
const SOURCE_PATH = /^(@polymorph\/[^/]+)\/src\//

/**
 * Where a vendored file reaches what an internal package gives it. Member
 * code imports `@polymorph/react`, which re-exports the engine and, through
 * it, the theme: that import is right in `packages/react-ui` and in a vendored
 * copy alike. A sibling member travels with the file. A dev-time tool has no
 * runtime part a component could use, so its import goes.
 */
function insteadOf(name: string): string {
  if (name === '@polymorph/theme') {
    return 'Import it from `@polymorph/react`, which re-exports the engine and the theme.'
  }
  if (name === '@polymorph/react-ui') {
    return 'Import the member by its relative path; it is copied with this file.'
  }
  return 'It is a dev-time tool, which no component uses at runtime: remove the import.'
}

/** What a path out of the tree was reaching for, as the published package that has it. */
function packageFor(target: string): string {
  // The last `packages/<name>/` in the path, so a checkout under a directory
  // called `packages` still names the package the path reached.
  const inside = /^.*(?:^|[/\\])packages[/\\]([^/\\]+)[/\\]/.exec(target)?.[1]
  if (inside === 'engine' || inside === 'theme' || inside === 'react') {
    return 'Import it from `@polymorph/react`, which re-exports the engine and the theme.'
  }
  if (/(?:^|[/\\])design[/\\]/.test(target)) {
    return 'Read its data from `@polymorph/react`, which re-exports the roles.'
  }
  return 'Reach it through `@polymorph/react`.'
}

const DEFAULT_INTERNAL = [
  '@polymorph/theme',
  '@polymorph/react-ui',
  '@polymorph/rules',
  '@polymorph/registry',
  '@polymorph/spec',
  '@polymorph/cli',
  '@polymorph/mcp',
]

export const vendorableImports: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Vendorable component source imports only the published boundary, packages, and files ' +
        'that travel with it.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          root: { type: 'string' },
          internal: { type: 'array', items: { type: 'string' } },
          allowIn: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      escapes:
        'Import `{{source}}` escapes the vendorable tree, so it resolves to nothing once copied. ' +
        '{{instead}}',
      deep: 'Import `{{source}}` reaches into a package’s source. Import `{{package}}` or a published subpath of it.',
      internal: 'Import `{{source}}` is not in the boundary a consumer installs. {{instead}}',
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as Options
    const root = options.root ?? 'packages/react-ui/src'
    const internal = options.internal ?? DEFAULT_INTERNAL
    const allowIn = options.allowIn ?? []

    // `matchesAny` is intentionally not used. `allowIn` here covers this rule's
    // own exemptions, and the config expresses those as ESLint `ignores`. The
    // option lets a caller add one without a second config block.
    if (allowIn.some((glob) => context.filename.includes(glob))) return {}

    const cwd = context.cwd
    const rootDir = resolve(cwd, root)

    const check = (node: Rule.Node, source: string): void => {
      if (isBareSpecifier(source)) {
        const name = internal.find((pkg) => source === pkg || source.startsWith(`${pkg}/`))
        if (name !== undefined) {
          context.report({
            node,
            messageId: 'internal',
            data: { source, instead: insteadOf(name) },
          })
          return
        }
        const deep = SOURCE_PATH.exec(source)
        if (deep) {
          context.report({ node, messageId: 'deep', data: { source, package: deep[1] as string } })
        }
        return
      }

      const target = resolve(dirname(context.filename), source)
      const inside = relative(rootDir, target)
      // A leading `..`, or an absolute result, means the path left the tree.
      if (inside.startsWith(`..${sep}`) || inside === '..' || inside.startsWith(sep)) {
        context.report({
          node,
          messageId: 'escapes',
          data: { source, instead: packageFor(target) },
        })
      }
    }

    return {
      ImportDeclaration(node) {
        check(node as Rule.Node, String(node.source.value))
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node as Rule.Node, String(node.source.value))
      },
      ExportAllDeclaration(node) {
        if (node.source) check(node as Rule.Node, String(node.source.value))
      },
    }
  },
}
