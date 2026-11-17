---
'@polymorph/engine': patch
'@polymorph/theme': patch
---

**The contrast law computes APCA itself.** `@polymorph/engine` and `@polymorph/theme` no longer
depend on `apca-w3`, whose licence limits it to web content, or on `colorparsley`, which that
package pulled in under the AGPL. The theme holds the published formula (0.0.98G-4g) in
`packages/theme/src/color/apca.ts`, and a test pins it to a table of values computed with the
reference implementation, so every pairing's Lc and every emitted token is unchanged. A consumer
installs two packages fewer, and every remaining production dependency is under a permissive
licence.
