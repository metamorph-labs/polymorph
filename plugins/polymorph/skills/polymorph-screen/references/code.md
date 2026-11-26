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
import { DataTable, Link, ListPage, SearchInput } from '@polymorph/react-ui'
import { useState } from 'react'

import type { Invoice } from './invoices'

export function InvoicesPage(props: {
  invoices: Invoice[]
  navigate: (href: string) => void
  onOpen: (invoice: Invoice) => void
}) {
  const [query, setQuery] = useState('')
  const shown = props.invoices.filter((invoice) =>
    invoice.customer.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <ListPage
      title="Invoices"
      actions={
        <Link href="/invoices/new" variant="button" buttonVariant="solid" onNavigate={props.navigate}>
          New invoice
        </Link>
      }
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
- The page's one main action is solid and accent. Here it goes to another page, so it is a
  `Link` with `variant="button"` and
  `buttonVariant="solid"`. An action that does the work in place is a
  `Button` with no `variant`. Every other Button there is
  `variant="outline"` or `variant="ghost"`. [app.md](app.md)
  has the rule for navigation.

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
  imports: [DataTable, Link, ListPage, SearchInput],
  template: `
    <pm-list-page title="Invoices" [empty]="invoices().length === 0" [emptyState]="none">
      <pm-link slot="actions" href="/invoices/new" variant="button" buttonVariant="solid"
        (navigate)="navigate.emit($event)">New invoice</pm-link>
      <pm-search-input slot="filters" aria-label="Search invoices" size="sm"
        [value]="query()" (change)="query.set($event)" />
      <pm-data-table label="Invoices" [columns]="columns" [data]="shown()" [getRowId]="rowId"
        (rowClick)="open.emit($event)" [emptyState]="{ icon: 'search', title: 'No match' }" />
    </pm-list-page>
  `,
})
export class InvoicesPage {
  readonly invoices = input.required<Invoice[]>()
  readonly navigate = output<string>()
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
  <poly-link slot="actions" href="/invoices/new" variant="button" button-variant="solid">New invoice</poly-link>
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
      onNavigate={props.navigate}
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

While the data has not arrived, the container passes `true` to each chart's
`loading` and to `DataTable`'s `loading`, with
empty rows: a chart draws a skeleton on the first load and dims its last frame on a refetch.
Empty rows without `loading` draw the chart's empty sentence, its `messages.empty`. A failed
load is no member's state: the screen shows an `Alert` with
`tone="danger"`, a `title` and a retry
`action` in the chart's panel. An Alert with no title and no children draws
nothing, its action included, so a spec binds its title to an input the container leaves empty
until a load fails. `Dashboard` and `Stat` take no loading prop, and the stat row
draws nothing while `stats` is empty.

- Never edit the emitted file. Change the spec and emit it again.
- An emitted screen imports its members from `@polymorph/<framework>-ui`. In a project that vendors
  and does not install that package it does not build, and `emit` says so in a note: write that
  screen in code with the vendored imports.
- `emit` writes no elements page. There, the page's own script is the container.

The root, forms, toasts, dialogs and navigation are in [app.md](app.md).
