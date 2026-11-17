# harness/

**This directory is the dev tool, not the product.** It is the only place in
`apps/` allowed to contain CSS.

The red rules are the lint rules (ESLint and Stylelint) that fail CI. They
treat `apps/**` as application code: no CSS files, no `style` props, no raw
interactive elements. Their purpose is to stop a screen from making a design
decision. The workbench harness, however, is the tool used to inspect the
system. The token gallery must draw a swatch in any resolved colour, and the
toolbar is plain HTML controls with its own stylesheet, outside the vocabulary
it switches.

So `apps/*/src/harness/**` is a declared, bounded exemption from the app-code
red rules. It is configured in the root `eslint.config.ts`, next to the rules
themselves, as the `HARNESS` glob that both app-code rule blocks ignore. The
same glob covers `apps/docs/src/harness/`, the docs site's swatch and type-ramp
specimens. Everything outside it stays under all the rules: the studio, the
composer, the page exemplars and Relay, the demo product.

Two rules still apply here. Accessibility is never suspended. Anything the
harness shares with the system (colour, type, spacing) must read `--pm-*`
tokens rather than hardcoded values. Stylelint's motion containment rule also
applies to every CSS file under `apps/`, including this directory.

The page baseline, meaning how `<body>` looks, is not set here. It is in
`@polymorph/react-ui`'s base layer. This directory holds only harness chrome:
the toolbar, the galleries and component pages, the token gallery, the mood
board and the overview page.

The red rules and the exception ladder are described in
[docs/rules.md](../../../../docs/rules.md).
