import {
  FRAMEWORKS,
  MAPPED_FRAMEWORKS,
  type Framework,
  type MappedFramework,
  type Registry,
} from '@polymorph/registry'

/**
 * What the installer needs to vendor the Vue, Svelte, Solid and Angular
 * vocabularies, and to know the elements vocabulary, which it never vendors,
 * all of it read from the registry.
 *
 * The registry describes each React member file by file. For a member native
 * in another framework it also publishes that framework's shell
 * (`frameworks.<framework>.shell`): where it ships, the files that declare it
 * (its component and the compound parts its index attaches), and the closure
 * an install copies, read from that vocabulary's generated tree.
 * `registry.vendor.frameworks.<framework>` names the tree those files are
 * rebased from, and ranges the framework's own packages: its foundation, its
 * vocabulary and what its members import (`frameworkRanges`).
 */

/** Every framework vocabulary's source tree but React's, from the registry. */
export function frameworkRoots(registry: Registry): string[] {
  return MAPPED_FRAMEWORKS.map((framework) => registry.vendor.frameworks[framework].root)
}

/** Whether a framework is one with a map and a tree of its own: any but React. */
export const isMapped = (framework: Framework): framework is MappedFramework =>
  (MAPPED_FRAMEWORKS as readonly string[]).includes(framework)

/**
 * The ranges an install in `framework` writes the framework's own packages at:
 * its foundation, its vocabulary and every package its members import.
 *
 * React's are `registry.packages`. Another framework's are
 * `registry.vendor.frameworks.<framework>.packages`, which the registry reads
 * from that framework's manifests only. A package missing there is not looked
 * up in `registry.packages`: React's range for it is not one the framework's
 * vocabulary was built with. The ranges differ between frameworks too: the
 * Solid vocabulary pins each Zag machine to one version, and the others take a
 * caret range. The engine, the rules and the fonts are shared by every
 * framework and are always read from `registry.packages`.
 */
export function frameworkRanges(
  registry: Registry,
  framework: Framework,
): Readonly<Record<string, string>> {
  return isMapped(framework) ? registry.vendor.frameworks[framework].packages : registry.packages
}

/** `react, vue, svelte, solid, angular or elements`: the frameworks a refusal names. */
export const KNOWN_FRAMEWORKS = `${FRAMEWORKS.slice(0, -1).join(', ')} or ${FRAMEWORKS.at(-1) ?? ''}`

/** A member the framework's vocabulary does not ship, asked for by name. */
export class UnshippedMemberError extends Error {
  constructor(
    readonly member: string,
    readonly framework: Framework,
    readonly reason: string | undefined,
  ) {
    super(
      (framework === 'elements'
        ? `polymorph: ${member} has no element`
        : `polymorph: ${member} has no ${framework} shell to vendor`) +
        (reason === undefined ? '' : ` — ${reason}`),
    )
    this.name = 'UnshippedMemberError'
  }
}

/**
 * An install asked for in one framework where the manifest records another.
 *
 * `polymorph.json` records the framework of the members an install vendored,
 * and `diff` and `update` re-plan from it. A second framework in the same
 * install would rewrite the lint configs for one and leave the other's
 * members behind, so it is refused.
 */
export class FrameworkMismatchError extends Error {
  constructor(
    readonly installed: Framework,
    readonly asked: Framework,
  ) {
    super(
      `polymorph: this install vendors ${installed} members (polymorph.json), so it cannot add ` +
        `${asked} ones — leave out --framework, or install ${asked} into another repository`,
    )
    this.name = 'FrameworkMismatchError'
  }
}

/** A name that is not a web framework the vocabulary ships in. */
export class UnknownFrameworkError extends Error {
  constructor(readonly framework: string) {
    super(`polymorph: there is no framework called "${framework}" — ${KNOWN_FRAMEWORKS}`)
    this.name = 'UnknownFrameworkError'
  }
}

/**
 * The framework an install plans in: the one asked for, which must be the one
 * the manifest records when there is a manifest; else the recorded one; else
 * React.
 *
 * `recorded` is the manifest's `framework` (`'vue'`, `'svelte'`, `'solid'`,
 * `'angular'` or `'elements'`, or `undefined` for React), and `null` when there
 * is no manifest yet.
 */
export function installFramework(
  recorded: MappedFramework | undefined | null,
  asked: string | undefined,
): Framework {
  if (asked !== undefined && !(FRAMEWORKS as readonly string[]).includes(asked)) {
    throw new UnknownFrameworkError(asked)
  }
  const installed: Framework | null = recorded === null ? null : (recorded ?? 'react')
  if (installed !== null && asked !== undefined && asked !== installed) {
    throw new FrameworkMismatchError(installed, asked as Framework)
  }
  return (asked as Framework | undefined) ?? installed ?? 'react'
}
