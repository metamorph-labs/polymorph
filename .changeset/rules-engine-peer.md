---
'@polymorph/rules': patch
---

**The rules' engine peer no longer reports as unmet in pnpm.** `@polymorph/rules` published its
optional peer as `"@polymorph/engine": "npm:@metamorph-labs/polymorph-engine@^<version>"`. pnpm
compares a peer's range as written with the version installed under that name, so `pnpm install`
warned of an unmet peer and `pnpm peers check` listed it, whatever version of the engine was
installed. The peer is now published as `"@polymorph/engine": "^<version>"`, which the engine
installed under its `@polymorph/engine` alias satisfies. Dependencies keep the alias form, which
tells the package manager where to install them from. Nothing changes in a consumer's manifest.
