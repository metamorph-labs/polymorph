# Widget

Seeded drift, table format — the shape `dialog.md` ships.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | required | agrees with the code |
| `tone` | `'neutral' \| 'danger'` | `'neutral'` | the escaped pipe must not read as a column |
| `ghost` | `boolean` | `false` | **spec-only** — declared here, never built |
| `children` | `ReactNode` | — | allowlisted, so it is compared in neither direction |

The code also ships `size`, which no row above names — **code-only**.

## Widget.Item

A part, specified in a section headed with its name, as `app-shell.md` specifies
`AppShell.NavItem`.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | required | agrees with the code |
| `icon` | `string` | — | **spec-only** — declared here, never built |

The code also ships `selected`, which no row above names — **code-only**.
