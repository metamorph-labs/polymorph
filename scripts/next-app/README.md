# The Next.js fixture

A Next.js App Router application that `pnpm gate:next` (`scripts/gate-next.mjs`) builds from the
published builds of the engine, the rules, the React foundation and the React vocabulary. It is
not a workspace package and it is never installed: the gate copies it to `dist/app`, installs the
theme with `polymorph add theme:plain`, assembles its `node_modules` from the packages' `dist`
directories, and builds and serves it there. [docs/verification.md](../../docs/verification.md)
says what the gate checks.

Each route exists for one question.

| Route | What renders it | What it is for |
| --- | --- | --- |
| `/` | A server component | Members a server component imports, with one client component that holds state (`panels.tsx`). Their stylesheets must reach the page, and the page must hydrate. |
| `/elements` | A server component | Every way a server component hands an element to a client member: a FormField's control, a Dialog's or a Popover's trigger, a SettingsRow's control, an Avatar.Group's children, and the parts of Table and Tabs. |
| `/tickets` | A client component (`tickets.tsx`) | Members that take a function, which only a client component can pass: DataTable's cells and ListPage's handlers. A Tooltip there must find the provider the root layout rendered. |
| `/one` | A server component | One Button. The page must load Button's stylesheet and module, and none of the vocabulary's. |

`app/layout.tsx` is the root layout the consumer guide describes: the pre-paint script inline in
`<head>`, the pairing's attributes on `<html>`, and the theme installed by a client component
(`theme.tsx`). `eslint.config.js` is the application's own config, which `polymorph add` links the
red rules into.

The dependencies are written as `*`, because the gate links each one from this repository's
install and no package manager reads the ranges.
