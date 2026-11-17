# Panel

Seeded drift, fence format — the shape `data-table.md` ships.

## API

```ts
interface PanelRegion {
  key: string
  span?: number
}

interface PanelProps {
  title: string
  regions: PanelRegion[]
  collapsible?: boolean
}
```

`PanelRegion` is a supporting type: its `key` and `span` must not be read as Panel's
props. `collapsible` is **spec-only**; the code's `dense` is **code-only**.

## Panel.Footer

A section headed with a part's name, and `Panel` has no such part, so the audit
reports it as unresolved.
