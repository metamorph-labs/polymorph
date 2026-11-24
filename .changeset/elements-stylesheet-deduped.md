---
'@polymorph/elements-ui': patch
---

**The no-build stylesheet writes each repeated rule once.** `polymorph.css` held one copy of the
focus and motion conventions for every recipe that composes them. It now keeps the last copy of
each repeated rule, which is the one that decided the cascade, so no element's style changes and
the file is about 30% smaller before compression.
