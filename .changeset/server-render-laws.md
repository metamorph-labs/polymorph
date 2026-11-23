---
'@polymorph/vue-ui': patch
'@polymorph/angular': patch
---

A Vue application that renders on a server hydrates a declared `Toast` with no mismatch. The
member draws nothing, and its template was empty, which a server renders as no markup and a browser
as a comment. It now writes a branch that never renders, which is a comment in both.

`typeInto` and `pressOnce`, the Angular foundation's helpers for a states fixture, no longer call
`cancelAnimationFrame` when a server destroys a fixture that asked for no frame. A server has no
such function, so a server render of a fixture that uses one threw as the server destroyed it, and
returned no markup.

Every states fixture entry of the Vue, Solid and Angular vocabularies is now rendered on a server
and hydrated by a law (`packages/{vue,solid,angular}-ui/server-render.test.ts`). Vue's and
Angular's members hydrate. Solid's do except the entries the law lists, in members that are
given a node inside a value or a slot ([docs/consuming.md](../docs/consuming.md#a-solid-app)).
