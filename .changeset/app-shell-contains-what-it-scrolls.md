---
'@polymorph/recipes': patch
---

AppShell's content region is positioned, so it is the containing block of what it scrolls. Text a
member hides from the eye, such as a Table's hidden caption, is positioned absolutely, and in a
browser where a size container is no longer a containing block it was laid out against the
document: a long page then made the document itself scroll, under the frame.
