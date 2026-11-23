---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
'@polymorph/recipes': patch
---

Pagination takes `getPageHref(page)`, and CursorPagination takes `previousHref` and `nextHref`.
Both are optional. With them, each control that goes to another page is a real `<a href>` with the
look of the Button it replaces, so a crawler reaches a public list's later pages and a reader can
open one in a new tab. In the append form, `nextHref` is the "Load more" action's address. A click
that would navigate the current tab calls the existing handler (`onPageChange`, `onPrevious`,
`onNext`) with the browser's navigation stopped, so the app changes the page as it does today; a
click with a modifier key opens the address. The current page, a control with nowhere to go, a
held pager and a window in flight stay Buttons. A link follows from Enter and not from Space, as
a link does. Without the props, the markup is unchanged. On a page written in HTML,
`previous-href` and `next-href` are attributes, and `getPageHref` is a property set from script.
The pagers' recipes gain the link's classes, which compose Button's.
