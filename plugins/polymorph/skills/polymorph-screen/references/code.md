# A screen in code, and the container of an emitted one

A screen written in code imports members, holds the screen's state and binds content to the
members' props. A container is such a file around a component `emit` wrote from a spec. The
examples are React, then what differs elsewhere. Read every member you use first:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 component DataTable --framework <framework>
```

## 1. Import the members

| Framework | An app that installs the packages | An app that vendors the members |
| --- | --- | --- |
| `react` | `import { Button } from '@polymorph/react-ui'` | `import { Button } from './polymorph/controls/Button'` |
| `vue` | `import { Button } from '@polymorph/vue-ui'` | `import Button from './polymorph/controls/Button.vue'` |
| `svelte` | `import { Button } from '@polymorph/svelte-ui'` | `import Button from './polymorph/controls/Button.svelte'` |
| `solid` | `import { Button } from '@polymorph/solid-ui'` | `import Button from './polymorph/controls/Button'` |
| `angular` | `import { Button } from '@polymorph/angular-ui'`, the class in the component's `imports` | `import { Button } from './polymorph/controls/Button'`, the same |

- A vendored member is `<dir>/<tier>/<Member>` with the framework's extension, under the `dir`
  `polymorph.json` names (`src/polymorph/` by default), imported by a path relative to your file.
  In Vue, Svelte and Solid a vendored part is a file of its own (`TabsContent.vue`), written by
  that name: only the package's index makes it `Tabs.Content`.
- `Icon` is in every vocabulary package. A project that vendors imports it from the
  foundation: `@polymorph/react`, `@polymorph/vue` and so on.
- A member the project has not vendored is added, never written by hand:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 add tabs --framework <framework>
```

## 2. A screen in React

```tsx
import { Button, DataTable, ListPage, SearchInput } from '@polymorph/react-ui'
import { useState } from 'react'

import type { Invoice } from './invoices'

export function InvoicesPage(props: {
  invoices: Invoice[]
  onNew: () => void
  onOpen: (invoice: Invoice) => void
}) {
  const [query, setQuery] = useState('')
  const shown = props.invoices.filter((invoice) =>
    invoice.customer.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <ListPage
      title="Invoices"
      actions={<Button icon="add" label="New invoice" onClick={props.onNew} />}
      filters={
        <SearchInput aria-label="Search invoices" size="sm" value={query} onChange={setQuery} />
      }
      empty={props.invoices.length === 0}
      emptyState={{ title: 'No invoices yet', description: 'An invoice shows here once it is sent.' }}
    >
      <DataTable
        label="Invoices"
        columns={[
          { key: 'customer', header: 'Customer' },
          { key: 'status', header: 'Status' },
          { key: 'total', header: 'Total', numeric: true },
        ]}
        data={shown}
        getRowId={(invoice) => invoice.id}
        onRowClick={props.onOpen}
        emptyState={{ icon: 'search', title: 'No invoice matches the search' }}
      />
    </ListPage>
  )
}
```

- `ListPage` draws its `emptyState` in the table's place while
  `empty` is true (no invoice exists). `DataTable` draws its own
  `emptyState` when `data` is empty (the search matched
  nothing).
- The screen holds its state (`query`) and derives what it shows (`shown`) as it renders.
  Polymorph has no data layer: data arrives as props or from the app's own fetching.
- The page's one main action is a `Button` with no `variant`: solid and
  accent. Every other Button there is `variant="outline"` or
  `variant="ghost"`.

## 3. The same screen in another framework

Members, props, values and parts keep their React names. What differs:

| | Vue | Svelte | Solid | Angular |
| --- | --- | --- | --- | --- |
| A member | `<Button>` | `<Button>` | `<Button>` | `<pm-button>`, its class in `imports` |
| A value | `:gap="5"`, `label="Save"` | `gap={5}` | `gap={5}` | `[gap]="5"`, `label="Save"`; a boolean always bound, `[iconOnly]="true"` |
| A callback `onRowClick` | `@rowClick="open"` | `onRowClick={open}` | `onRowClick={open}` | `(rowClick)="open($event)"`, the first argument only |
| A node prop `actions` | `<template #actions>` | `{#snippet actions()}` inside the tags | `actions={<Button … />}` | the child marked `slot="actions"` |
| A part | `<Table.Row>` | `<Table.Row>` | `<Table.Row>` | `<tr pmTableRow>`, `<li pmListItem>`; another part is a tag, `<pm-tabs-content>` |

No member takes two-way binding (`v-model`, `bind:value`, `[(value)]`): pass the value and
handle its change event. A Solid component reads `props.foo` and never destructures its props.

```ts
@Component({
  selector: 'app-invoices-page',
  imports: [Button, DataTable, ListPage, SearchInput],
  template: `
    <pm-list-page title="Invoices" [empty]="invoices().length === 0" [emptyState]="none">
      <pm-button slot="actions" icon="add" label="New invoice" (click)="create.emit()" />
      <pm-search-input slot="filters" aria-label="Search invoices" size="sm"
        [value]="query()" (change)="query.set($event)" />
      <pm-data-table label="Invoices" [columns]="columns" [data]="shown()" [getRowId]="rowId"
        (rowClick)="open.emit($event)" [emptyState]="{ icon: 'search', title: 'No match' }" />
    </pm-list-page>
  `,
})
export class InvoicesPage {
  readonly invoices = input.required<Invoice[]>()
  readonly create = output()
  readonly open = output<Invoice>()
  protected readonly columns = [{ key: 'customer', header: 'Customer' }]
  protected readonly none = { title: 'No invoices yet' }
  protected readonly query = signal('')
  protected readonly shown = computed(() => this.invoices().filter((i) => i.customer.includes(this.query())))
  protected readonly rowId = (invoice: Invoice) => invoice.id
}
```

## 4. A page with no build: the elements

```html
<poly-list-page title="Invoices" empty-state='{"title":"No invoices yet"}'>
  <poly-button slot="actions" icon="add" label="New invoice"></poly-button>
  <poly-data-table label="Invoices"
    columns='[{"key":"customer","header":"Customer"},{"key":"total","header":"Total","numeric":true}]'
    empty-state='{"icon":"search","title":"No invoice matches the search"}'></poly-data-table>
</poly-list-page>
<script type="module">
  const table = document.querySelector('poly-data-table')
  table.getRowId = (invoice) => invoice.id
  table.data = await (await fetch('/api/invoices')).json()
  table.addEventListener('poly-row-click', (event) => location.assign(`/invoices/${event.detail.id}`))
</script>
```

- A prop is an attribute in kebab case (`empty-state`), or the property in camel case. Data is
  JSON. A boolean attribute present is true, and `"false"` is false.
- A node prop is a child with `slot="<prop>"` in kebab case, or the dotted name for a node inside
  an object prop: `slot="empty-state.action"`.
- A callback is the event `poly-<name>` in kebab case, its first argument as `detail`:
  `onRowClick` is `poly-row-click`. `click` on `<poly-button>` is the
  native click, and `poly-click` is the member's.
- A function or a render prop is a property a script sets, such as `getRowId`.
- A part is an element of its own (`<poly-table-row>`). Never write a member inside `<table>`
  or `<p>`.
- The red rules do not read HTML: `validate` and `check` leave a page unread. Write no `class`
  or `style` on an element and no raw `<button>` or `<input>`. Read each element against
  `npx -y @metamorph-labs/polymorph@1.0.18 card --framework elements`, then serve the page and read the console, where an element
  reports each attribute it could not read.

## 5. The container of an emitted spec

The emitted component holds no state. The container imports it, holds the state, computes every
derived value, and passes each of the spec's `inputs`: data as values, callbacks as functions.

```tsx
import { useState } from 'react'

import type { Invoice } from './screens/invoices'
import { InvoicesView } from './screens/InvoicesView'

export function Invoices(props: { invoices: Invoice[]; navigate: (href: string) => void }) {
  const [query, setQuery] = useState('')
  const shown = props.invoices.filter((invoice) =>
    invoice.customer.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <InvoicesView
      invoices={shown}
      isEmpty={props.invoices.length === 0}
      query={query}
      onQueryChange={setQuery}
      getRowId={(invoice) => invoice.id}
      onOpen={(invoice) => props.navigate(`/invoices/${invoice.id}`)}
      onNew={() => props.navigate('/invoices/new')}
    />
  )
}
```

| Framework | What differs |
| --- | --- |
| `vue` | `import InvoicesView from './screens/InvoicesView.vue'`; state in a `ref`, a derived value in a `computed`; a callback input is an event, `@queryChange="(value: string) => (query = value)"` |
| `svelte` | `let query = $state('')`, `const shown = $derived(…)`; callbacks are props, `onQueryChange={(value) => (query = value)}` |
| `solid` | `const [query, setQuery] = createSignal('')`; a derived value is a function, `invoices={shown()}` |
| `angular` | the class in `imports`, written `<app-invoices-view>`; callbacks are inputs, `[onQueryChange]="setQuery"`, each an arrow-function property so it keeps `this`: `protected readonly setQuery = (value: string) => this.query.set(value)` |

- Never edit the emitted file. Change the spec and emit it again.
- An emitted screen imports its members from `@polymorph/<framework>-ui`. In a project that vendors
  and does not install that package it does not build, and `emit` says so in a note: write that
  screen in code with the vendored imports.
- `emit` writes no elements page. There, the page's own script is the container.

The root, forms, toasts, dialogs and navigation are in [app.md](app.md).
