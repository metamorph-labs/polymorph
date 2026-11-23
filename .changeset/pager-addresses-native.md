---
'@polymorph/native': patch
---

The SwiftUI and Compose contracts of Pagination and CursorPagination carry the web's new optional
addresses, `getPageHref`, `previousHref` and `nextHref`, each defaulting to `nil` or `null`, so a
screen that builds the props as before still compiles. No native rendering draws them: a native
pager's controls are the platform's buttons, and each calls its handler.
