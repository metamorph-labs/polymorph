# .changeset/

Versioning for the packages' public surfaces, with
[changesets](https://github.com/changesets/changesets).

Changesets records an intent to release next to the change that motivates it. A package's
version history then records what happened to its public surface, rather than numbers bumped
from memory. Publishing is a separate step, `pnpm publish:packages`
(`scripts/publish-packages.mjs`), because the registry names differ from the workspace names.
[CONTRIBUTING.md](../CONTRIBUTING.md#releasing) has the release steps.

```bash
pnpm changeset                    # describe a change and pick its bump
pnpm changeset status --verbose   # the version the next release gives each package, and why
pnpm version-packages             # apply the pending changesets and write CHANGELOGs
```

## One version

Every package carries one version, the release's, and the release tag is `v` and that version.
`fixed` in `config.json` holds every `@polymorph/*` package in one group, so
`pnpm version-packages` moves all of them to the same next version, including a package that no
pending changeset names. A consumer pins every package it installs at that one number, and the
same number names the tag the native packages are checked out at. A law refuses a package at
another version (`packages/registry/src/install.test.ts`).

A package's `CHANGELOG.md` still records only what changed in that package. A release that did
not change it adds a heading with no notes under it.

## What is versioned, and how

| Packages | Versioned | Shipped |
| --- | --- | --- |
| The published web packages: `@polymorph/engine`, `@polymorph/rules`, `@polymorph/recipes`, `@polymorph/screen`, and each web framework's foundation and vocabulary (`@polymorph/react` and `@polymorph/react-ui`, and the same pair for `vue`, `svelte`, `solid`, `elements` and `angular`) | by changesets, at the release's version in each `package.json`, with a `CHANGELOG.md` | to GitHub Packages by `pnpm publish:packages` |
| The internal packages: `@polymorph/theme`, `@polymorph/registry`, `@polymorph/cli`, `@polymorph/mcp`, `@polymorph/spec`, `@polymorph/shells`, `@polymorph/conformance`, `@polymorph/native` | by changesets, the same way, for the tools' release notes | nowhere: they run from a checkout |
| The native packages: `platforms/ios`, `platforms/android`, `platforms/dart` | by the repository's release tag | with the tag |

Every package stays `"private": true` in the workspace, and the publish script writes the
registry manifest. `privatePackages: { version: true, tag: false }` lets changesets version them
anyway: versions and changelogs update, and changesets creates no tags. The release's one tag,
`v<version>`, is made on the release commit (CONTRIBUTING.md). `pnpm publish:packages` prints the
command with the version filled in, so the tag's number is never typed from memory.

`@polymorph/workbench` and `@polymorph/docs` are ignored because they are apps, not packages
anyone installs.

**The native packages are not npm packages**, and not workspace packages, so changesets does
not version them. They are versioned with the repository: an app depends on them through a
checkout or a git submodule of it, and moves to a release by checking out that release's tag.
SwiftPM, Gradle's `includeBuild` and a Dart path dependency all build what the checkout holds,
so the `version` in `platforms/android/{tokens,ui}/build.gradle.kts` and in
`platforms/dart/pubspec.yaml` is not what an app resolves, and the Swift package declares none.
A change to them that an app sees is described in a changeset with no packages in its front
matter (as `native-platforms.md` is), for the release notes of the tag.

Add a changeset when a change alters what a consumer sees: a package's `exports`, a member's
props, a token name, a rule's behaviour. Write it for someone upgrading: what changed and what
they need to do, not how the work was done. Keep one changeset per package where you can, so
each package's changelog reads as one entry per release. A changeset with no packages in its
front matter bumps nothing and appears in no changelog, so a note meant for a package's
changelog names the package: a new package's first note names it, and a change to the native
packages names `@polymorph/native`, whose changelog records what ships at the tag.

## Picking the bump

Every published package follows semver. A release takes the highest bump any pending changeset
names, and every package takes that bump with it (`fixed`). A breaking change to one package is
therefore a major release of all of them. `pnpm changeset status --verbose` prints the result
before anything changes.

The vocabulary is pre-release, and the owner keeps every package on the 1.0.x line until the
first stable release: every pending changeset is a patch, whatever the table below would say
for the same change after that release. The split of `@polymorph/core` into the engine and the
React foundation, the renames and the moved exports therefore ship as patches of the renamed
packages, and the consumers on this machine move in the same step as the merge.

| Bump | When | Examples |
| --- | --- | --- |
| **major** | a consumer's code can break, or a layout changes | an export, member, prop, variant or token removed or renamed; a package renamed or split; an export moved to another package; a prop newly required; a red rule that now fails code it used to pass; a **layout change** |
| **minor** | something new, nothing broken | a new member, an optional prop, a new variant or token, a new house system or palette, a new export |
| **patch** | a fix to existing behaviour | a bug fix, an accessibility fix, a recipe adjustment within the same tokens |

**Visible changes are not breaking, unless they change layout.** A product chooses a pairing,
not exact pixels, so a change in colour, type, radius, shadow, motion or a spacing step is a
minor or a patch, even though it changes measurements. A *layout change* is different. A member
or archetype arranges its parts differently: a slot moves, the direction of flow or wrapping
changes, a region appears or disappears, or it adapts at a different container size. That can
break the screen around it, so it is a major.

Adding is never breaking: a new member, variant, tone, size or optional prop is a minor. When a
change could go either way, make it additive (an optional prop beside the old behaviour, or a
deprecation with a removal date) and ship the removal as the major.
