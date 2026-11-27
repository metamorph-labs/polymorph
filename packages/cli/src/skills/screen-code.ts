import type { Registry } from '@polymorph/registry'

import { all, commands, Facts } from './facts'

/**
 * Two references of the screen skill, for a model that writes a screen in a framework's own code
 * in a consumer's app.
 *
 * `code.md` is the procedure for the file itself: the import line in each framework and route,
 * one screen in React and what differs in Vue, Svelte, Solid, Angular and an elements page, and
 * the container that renders an emitted spec. `app.md` is what surrounds the screen: what the
 * app's root mounts, forms, feedback and overlays, and navigation.
 *
 * The laws hold the names in these texts, not the code. Each example compiles against the
 * vocabulary with its framework's own checker (`tsc`, `vue-tsc`, `svelte-check`, `ngc` with strict
 * templates) and passes `validate`, and the React ones run in a browser; no suite runs them again,
 * so an example changed here is checked again by hand. The elements markup follows the elements'
 * states fixtures and the page the static-page check loads.
 */
export function codeReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  return `
# A screen in code, and the container of an emitted one

A screen written in code imports members, holds the screen's state and binds content to the
members' props. A container is such a file around a component \`emit\` wrote from a spec. The
examples are React, then what differs elsewhere. Read every member you use first:

${commands(run, 'component DataTable --framework <framework>')}

## 1. Import the members

| Framework | An app that installs the packages | An app that vendors the members |
| --- | --- | --- |
| \`react\` | \`import { Button } from '@polymorph/react-ui'\` | \`import { Button } from './polymorph/controls/Button'\` |
| \`vue\` | \`import { Button } from '@polymorph/vue-ui'\` | \`import Button from './polymorph/controls/Button.vue'\` |
| \`svelte\` | \`import { Button } from '@polymorph/svelte-ui'\` | \`import Button from './polymorph/controls/Button.svelte'\` |
| \`solid\` | \`import { Button } from '@polymorph/solid-ui'\` | \`import Button from './polymorph/controls/Button'\` |
| \`angular\` | \`import { Button } from '@polymorph/angular-ui'\`, the class in the component's \`imports\` | \`import { Button } from './polymorph/controls/Button'\`, the same |

- A vendored member is \`<dir>/<tier>/<Member>\` with the framework's extension, under the \`dir\`
  \`polymorph.json\` names (\`src/polymorph/\` by default), imported by a path relative to your file.
  In Vue, Svelte and Solid a vendored part is a file of its own (\`TabsContent.vue\`), written by
  that name: only the package's index makes it ${f.part('Tabs', 'Content')}.
- ${f.m('Icon')} is in every vocabulary package. A project that vendors imports it from the
  foundation: \`@polymorph/react\`, \`@polymorph/vue\` and so on.
- A member the project has not vendored is added, never written by hand:

${commands(run, 'add tabs --framework <framework>')}

## 2. A screen in React

\`\`\`tsx
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
\`\`\`

- ${f.m('ListPage')} draws its ${f.p('ListPage', 'emptyState')} in the table's place while
  ${f.p('ListPage', 'empty')} is true (no invoice exists). ${f.m('DataTable')} draws its own
  ${f.p('DataTable', 'emptyState')} when ${f.p('DataTable', 'data')} is empty (the search matched
  nothing).
- The screen holds its state (\`query\`) and derives what it shows (\`shown\`) as it renders.
  Polymorph has no data layer: data arrives as props or from the app's own fetching.
- The page's one main action is solid and accent. Here it goes to another page, so it is a
  ${f.m('Link')} with ${f.v('Link', 'variant', 'button')} and
  ${f.v('Link', 'buttonVariant', 'solid')}. An action that does the work in place is a
  ${f.m('Button')} with no ${f.p('Button', 'variant')}. Every other Button there is
  ${f.v('Button', 'variant', 'outline')} or ${f.v('Button', 'variant', 'ghost')}. [app.md](app.md)
  has the rule for navigation.

## 3. The same screen in another framework

Members, props, values and parts keep their React names. What differs:

| | Vue | Svelte | Solid | Angular |
| --- | --- | --- | --- | --- |
| A member | \`<Button>\` | \`<Button>\` | \`<Button>\` | \`<pm-button>\`, its class in \`imports\` |
| A value | \`:gap="5"\`, \`label="Save"\` | \`gap={5}\` | \`gap={5}\` | \`[gap]="5"\`, \`label="Save"\`; a boolean always bound, \`[iconOnly]="true"\` |
| A callback ${f.p('DataTable', 'onRowClick')} | \`@rowClick="open"\` | \`onRowClick={open}\` | \`onRowClick={open}\` | \`(rowClick)="open($event)"\`, the first argument only |
| A node prop ${f.p('ListPage', 'actions')} | \`<template #actions>\` | \`{#snippet actions()}\` inside the tags | \`actions={<Button … />}\` | the child marked \`slot="actions"\` |
| A part | \`<Table.Row>\` | \`<Table.Row>\` | \`<Table.Row>\` | \`<tr pmTableRow>\`, \`<li pmListItem>\`; another part is a tag, \`<pm-tabs-content>\` |

No member takes two-way binding (\`v-model\`, \`bind:value\`, \`[(value)]\`): pass the value and
handle its change event. A Solid component reads \`props.foo\` and never destructures its props.

\`\`\`ts
@Component({
  selector: 'app-invoices-page',
  imports: [DataTable, Link, ListPage, SearchInput],
  template: \`
    <pm-list-page title="Invoices" [empty]="invoices().length === 0" [emptyState]="none">
      <pm-link slot="actions" href="/invoices/new" variant="button" buttonVariant="solid"
        (navigate)="navigate.emit($event)">New invoice</pm-link>
      <pm-search-input slot="filters" aria-label="Search invoices" size="sm"
        [value]="query()" (change)="query.set($event)" />
      <pm-data-table label="Invoices" [columns]="columns" [data]="shown()" [getRowId]="rowId"
        (rowClick)="open.emit($event)" [emptyState]="{ icon: 'search', title: 'No match' }" />
    </pm-list-page>
  \`,
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
\`\`\`

## 4. A page with no build: the elements

\`\`\`html
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
  table.addEventListener('poly-row-click', (event) => location.assign(\`/invoices/\${event.detail.id}\`))
</script>
\`\`\`

- A prop is an attribute in kebab case (\`empty-state\`), or the property in camel case. Data is
  JSON. A boolean attribute present is true, and \`"false"\` is false.
- A node prop is a child with \`slot="<prop>"\` in kebab case, or the dotted name for a node inside
  an object prop: \`slot="empty-state.action"\`.
- A callback is the event \`poly-<name>\` in kebab case, its first argument as \`detail\`:
  ${f.p('DataTable', 'onRowClick')} is \`poly-row-click\`. \`click\` on \`<poly-button>\` is the
  native click, and \`poly-click\` is the member's.
- A function or a render prop is a property a script sets, such as ${f.p('DataTable', 'getRowId')}.
- A part is an element of its own (\`<poly-table-row>\`). Never write a member inside \`<table>\`
  or \`<p>\`.
- The red rules do not read HTML: \`validate\` and \`check\` leave a page unread. Write no \`class\`
  or \`style\` on an element and no raw \`<button>\` or \`<input>\`. Read each element against
  \`${run} card --framework elements\`, then serve the page and read the console, where an element
  reports each attribute it could not read.

## 5. The container of an emitted spec

The emitted component holds no state. The container imports it, holds the state, computes every
derived value, and passes each of the spec's \`inputs\`: data as values, callbacks as functions.

\`\`\`tsx
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
      onOpen={(invoice) => props.navigate(\`/invoices/\${invoice.id}\`)}
      onNavigate={props.navigate}
    />
  )
}
\`\`\`

| Framework | What differs |
| --- | --- |
| \`vue\` | \`import InvoicesView from './screens/InvoicesView.vue'\`; state in a \`ref\`, a derived value in a \`computed\`; a callback input is an event, \`@queryChange="(value: string) => (query = value)"\` |
| \`svelte\` | \`let query = $state('')\`, \`const shown = $derived(…)\`; callbacks are props, \`onQueryChange={(value) => (query = value)}\` |
| \`solid\` | \`const [query, setQuery] = createSignal('')\`; a derived value is a function, \`invoices={shown()}\` |
| \`angular\` | the class in \`imports\`, written \`<app-invoices-view>\`; callbacks are inputs, \`[onQueryChange]="setQuery"\`, each an arrow-function property so it keeps \`this\`: \`protected readonly setQuery = (value: string) => this.query.set(value)\` |

While the data has not arrived, the container passes \`true\` to each chart's
${f.p('LineChart', 'loading')} and to ${f.m('DataTable')}'s ${f.p('DataTable', 'loading')}, with
empty rows: a chart draws a skeleton on the first load and dims its last frame on a refetch.
Empty rows without \`loading\` draw the chart's empty sentence, its \`messages.empty\`. A failed
load is no member's state: the screen shows an ${f.m('Alert')} with
${f.v('Alert', 'tone', 'danger')}, a ${f.p('Alert', 'title')} and a retry
${f.p('Alert', 'action')} in the chart's panel. An Alert with no title and no children draws
nothing, its action included, so a spec binds its title to an input the container leaves empty
until a load fails. A ${f.m('Stat')} whose number has not arrived takes
${f.p('Stat', 'loading')}, in each entry of ${f.p('Dashboard', 'stats')} or on its own: its label
row stays, and its value and each part it is passed (${f.p('Stat', 'delta')},
${f.p('Stat', 'trend')}, ${f.p('Stat', 'spark')}, ${f.p('Stat', 'footer')}) draw a placeholder of
that part's size, so the card keeps its height when the number arrives. Pass
${f.p('Stat', 'value')} as the container has it, \`''\` on the first load, and the parts the loaded
card will have; nothing a loading Stat is passed about its number is drawn or read. A screen
reader hears ${f.p('Stat', 'loadingLabel')}, "Loading" by default, in the value's place. The stat
row draws nothing while ${f.p('Dashboard', 'stats')} is empty.

- Never edit the emitted file. Change the spec and emit it again.
- An emitted screen imports its members from \`@polymorph/<framework>-ui\`. In a project that vendors
  and does not install that package it does not build, and \`emit\` says so in a note: write that
  screen in code with the vendored imports.
- \`emit\` writes no elements page. There, the page's own script is the container.

The root, forms, toasts, dialogs and navigation are in [app.md](app.md).
`.trimStart()
}

/**
 * What surrounds a screen in a consumer's app: the root's theme module and the members mounted
 * once, the mode and the language, forms, feedback and overlays, and navigation. The skill links
 * it as `references/app.md`, beside `code.md`.
 */
export function appReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  const toastHost = f.x('ToastHost', '@polymorph/react-ui')
  const tooltipProvider = f.x('TooltipProvider', '@polymorph/react-ui')
  const links = all([
    f.m('Link'),
    f.part('AppShell', 'NavItem'),
    f.m('Breadcrumbs'),
    f.m('SectionNav'),
    f.part('List', 'Item'),
    f.m('Card'),
  ])
  return `
# The app around a screen: root, forms, feedback and navigation

The examples are React, and each section says what differs elsewhere. An app \`init\` wrote has the
root below. In another app, check each line.

## 1. The root

- The entry imports the theme module first: \`import 'virtual:polymorph/theme'\`. It brings the
  theme's stylesheet, the fonts its system names and the reader's stored choice. An Angular entry
  imports \`@polymorph/angular-ui/base.css\` next. The Vite plugin writes \`data-system\`,
  \`data-palette\` and the pre-paint script into \`index.html\`: never write them, and never select on
  them in CSS.
- The toast viewport is mounted once, outside the routes and outside any error boundary.
- In React a ${f.m('Tooltip')} needs ${tooltipProvider} above it. ${f.m('AppShell')} brings its own;
  a root without AppShell wraps the app in one.
- Polymorph has no router and no data layer. The router is the app's own dependency, which the app
  installs: a package outside \`@polymorph\` is allowed for routing and for data, and the red rules
  pass a router's imports and components. Its provider goes inside the two above, around the
  routes. This root uses React Router.

\`\`\`tsx
import 'virtual:polymorph/theme'

import { ToastHost, TooltipProvider } from '@polymorph/react-ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from './App'

const TOASTS = { dismiss: 'Dismiss', notification: 'Notification', viewport: 'Notifications (F8)' }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastHost messages={TOASTS}>
      <TooltipProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </TooltipProvider>
    </ToastHost>
  </StrictMode>,
)
\`\`\`

\`\`\`html
<!-- Vue, Svelte, Solid: once, in the root component -->
<Toast.Viewport />
<!-- Angular: ToastViewport in the root's imports -->
<pm-toast-viewport />
<!-- elements: once, in <body> -->
<poly-toast-viewport></poly-toast-viewport>
\`\`\`

A new page is mounted by the app's router, or by the root in an app without one. \`init\` wrote a
placeholder screen, Welcome, from \`src/screens/welcome.json\`, and its root component
(\`src/App.tsx\`, \`src/App.vue\`, \`src/App.svelte\` or \`src/app.ts\`) renders it. Replace what
the root component renders with the app's routes, one page per route, and delete the Welcome spec
and the file emitted from it once nothing renders them.

- **Mode.** ${f.m('ModeSwitch')} with a ${f.p('ModeSwitch', 'label')} and no
  ${f.p('ModeSwitch', 'value')} shows the reader's choice of light, dark or system and applies it.
  A Menu or command entry calls ${f.x('setMode', '@polymorph/engine/runtime')} with \`'light'\`,
  \`'dark'\` or \`'system'\`, and reads the choice from ${f.x('useMode', '@polymorph/react')}, which
  every foundation exports. The palette holds both modes: write no \`dark\` class, no
  \`prefers-color-scheme\` rule and no second stylesheet.
- **Language.** \`lang\` on \`<html>\`, and \`dir="rtl"\` for a right-to-left language: every member
  follows it. No provider sets a locale or words for the whole app. A member that formats dates or
  numbers takes \`locale\`, and a member with words of its own takes \`messages\` or a prop for each
  phrase, such as ${f.m('Stat')}'s ${f.p('Stat', 'deltaLabel')}, English when left out. Pass the
  app's translations to each, as ${toastHost} takes its three words.

## 2. Forms

${commands(run, 'component FormField --framework <framework>')}

\`\`\`tsx
import {
  Button,
  Card,
  FormField,
  FormPage,
  Input,
  Select,
  Stack,
  Textarea,
  toast,
} from '@polymorph/react-ui'
import { useState } from 'react'

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'chat', label: 'Chat' },
  { value: 'phone', label: 'Phone' },
]

export interface TicketDraft {
  subject: string
  channel: string
  details: string
}

export function NewTicketPage(props: {
  save: (draft: TicketDraft) => Promise<void>
  onDone: () => void
}) {
  const [subject, setSubject] = useState('')
  const [channel, setChannel] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const subjectError = submitted && subject.trim() === '' ? 'Give the ticket a subject.' : undefined
  const channelError = submitted && channel === null ? 'Choose a channel.' : undefined

  async function submit() {
    setSubmitted(true)
    if (subject.trim() === '' || channel === null) return
    setSaving(true)
    try {
      await props.save({ subject, channel, details })
      toast.success('Ticket created')
      props.onDone()
    } catch {
      toast.danger('The ticket was not saved', { description: 'Try again in a moment.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormPage
      title="New ticket"
      onSubmit={submit}
      actions={<Button type="submit" label="Create ticket" loading={saving} />}
    >
      <Card>
        <Stack gap={5}>
          <FormField label="Subject" required error={subjectError}>
            <Input value={subject} onChange={setSubject} />
          </FormField>
          <FormField label="Channel" required error={channelError}>
            <Select
              options={CHANNELS}
              placeholder="Choose a channel"
              value={channel}
              onChange={setChannel}
            />
          </FormField>
          <FormField label="Details">
            <Textarea rows={5} value={details} onChange={setDetails} />
          </FormField>
        </Stack>
      </Card>
    </FormPage>
  )
}
\`\`\`

The route that mounts the page passes the router's navigation as \`onDone\`: in React Router,
\`onDone={() => navigate('/tickets')}\`, with \`navigate\` from \`useNavigate()\`.

- ${f.m('FormPage')} with ${f.p('FormPage', 'onSubmit')} renders a real \`<form>\`: Enter submits
  from any field, and a failed submit moves focus to the first invalid field. Its
  ${f.p('FormPage', 'actions')} hold one submit Button, solid accent by default, and quiet ones. A
  destructive action goes in ${f.p('FormPage', 'leadingAction')}, behind a ${f.m('ConfirmDialog')}.
- ${f.m('FormField')} wraps one control and wires its label, ${f.p('FormField', 'description')},
  ${f.p('FormField', 'required')} and ${f.p('FormField', 'error')}. A non-empty error marks the
  control invalid and links the message; never set the control's ${f.p('Input', 'invalid')} as
  well. Two fields side by side are a ${f.m('Grid')} with ${f.p('Grid', 'columns')} of 2.
- Errors are computed from the values and a \`submitted\` flag, so none shows before the first
  submit. A server's error for a field goes in that field's error.
- ${f.m('Input')}'s and ${f.m('Textarea')}'s ${f.p('Input', 'onChange')} hand over the text as a
  \`string\`, then the change event, so \`onChange={setSubject}\` stores it.
  ${f.m('Select')}'s hands over \`string | null\`.
- A ${f.m('Select')}'s ${f.p('Select', 'value')} is \`string | null\`, and \`null\` is nothing chosen:
  the trigger shows its ${f.p('Select', 'placeholder')}. Start it at \`null\`, store what
  ${f.p('Select', 'onChange')} hands over as it is, and set \`null\` to clear the choice, as a form
  does when it resets after a save. With ${f.p('Select', 'emptyOption')}, \`null\` is that choice,
  such as a filter's "All". Never \`undefined\`: a Select given \`undefined\` holds the choice
  itself, as one given no ${f.p('Select', 'value')} does, and stops following the form's state.
  Never \`''\`: no option has it.
- While the request runs, the submit Button takes ${f.p('Button', 'loading')}, and a click does
  nothing.
- A long form also lists its errors above the fields in ${f.m('ErrorSummary')}, whose
  ${f.p('ErrorSummary', 'errors')} is \`{ label, fieldId }[]\`, each \`fieldId\` the
  ${f.p('FormField', 'id')} of its FormField.
- Vue writes \`@submit\` and \`<template #actions>\`, Angular \`(submit)\`. On a page with no build, a
  \`<form>\` around the elements posts each member's value under its \`name\`.

## 3. Feedback and overlays

| The screen needs | Use |
| --- | --- |
| The outcome of an action | \`toast.success(title)\`, \`toast.danger\`, \`toast.warning\`, \`toast.info\`, or \`toast.promise(promise, { loading, success, error })\` for one card through the wait |
| A failure that stays until the screen resolves it | ${f.x('ToastNotice', '@polymorph/react-ui')} in React, \`<Toast>\` in a template elsewhere: shown while it is rendered |
| A region that is loading | ${f.m('Skeleton')} in the content's place, ${f.p('DataTable', 'loading')} on a DataTable, ${f.m('Spinner')} for a wait of unknown length |
| An action that is running | the Button's ${f.p('Button', 'loading')}; a ConfirmDialog whose ${f.p('ConfirmDialog', 'onConfirm')} returns a promise stays pending until it settles |
| Nothing to show | ${f.m('EmptyState')}, or the archetype's \`emptyState\`; a failed load is one with \`icon="error"\` and a retry action |
| A status inside the page | ${f.m('Alert')} with a ${f.p('Alert', 'tone')} |
| A notice for the whole app until its cause ends | ${f.m('Banner')} in AppShell's ${f.p('AppShell', 'banner')} |
| To confirm a destructive action | ${f.m('ConfirmDialog')}: a question, its consequence and a verb |
| A task over the page | ${f.m('Dialog')} with a ${f.p('Dialog', 'title')} and a ${f.p('Dialog', 'footer')}, or ${f.m('Drawer')} at the side |

\`\`\`tsx
import { Alert, Button, ConfirmDialog } from '@polymorph/react-ui'

export function DeleteInvoice(props: { remove: () => Promise<void> }) {
  return (
    <ConfirmDialog
      title="Delete this invoice?"
      description="The customer keeps the copy they were sent."
      confirmLabel="Delete invoice"
      trigger={<Button variant="ghost" tone="danger" icon="delete" label="Delete" />}
      onConfirm={props.remove}
    />
  )
}

export function LoadFailed(props: { retry: () => void }) {
  return (
    <Alert
      tone="danger"
      title="The invoices did not load"
      action={<Button variant="ghost" size="sm" label="Try again" onClick={props.retry} />}
    />
  )
}
\`\`\`

- \`toast\` comes from \`@polymorph/react-ui\` in React, from the foundation (\`@polymorph/vue\` and
  so on) elsewhere, and from \`polymorph.js\` on a page with no build. With no viewport mounted, a
  toast draws nowhere.
- A danger or warning toast, and one with an \`action\`, stays until it is dismissed. A success or
  info toast leaves on its own.
- An Angular ConfirmDialog closes when it is confirmed: hold ${f.p('ConfirmDialog', 'open')} in the
  component to keep it open while saving. On a page with no build, the \`poly-confirm\` listener
  calls \`event.waitUntil(promise)\`.

## 4. Navigation

${links} with an \`href\` draw a real \`<a href>\`. Without ${f.p('Link', 'onNavigate')} the
browser loads the address. With it, a plain click calls \`onNavigate(href)\` instead. A click with a
modifier key or another button, or on an ${f.p('Link', 'external')} Link, stays the browser's.

\`\`\`tsx
import { AppShell } from '@polymorph/react-ui'
import type { ReactNode } from 'react'

export function Shell(props: { path: string; navigate: (href: string) => void; children: ReactNode }) {
  return (
    <AppShell
      sidebar={
        <AppShell.NavItem
          icon="inbox"
          label="Invoices"
          href="/invoices"
          current={props.path.startsWith('/invoices')}
          onNavigate={props.navigate}
        />
      }
      transitionKey={props.path}
    >
      {props.children}
    </AppShell>
  )
}
\`\`\`

| Framework | The router, passed to \`onNavigate\` |
| --- | --- |
| \`react\` | React Router: \`(href) => navigate(href)\`, \`navigate\` from \`useNavigate()\`. TanStack Router: \`(href) => navigate({ href })\`. Next.js: \`(href) => router.push(href)\` |
| \`vue\` | \`@navigate="(href) => router.push(href)"\` |
| \`svelte\` | \`onNavigate={goto}\` in SvelteKit |
| \`solid\` | \`onNavigate={navigate}\`, \`navigate\` from \`useNavigate()\` of \`@solidjs/router\` |
| \`angular\` | \`(navigate)="router.navigateByUrl($event)"\` |
| \`elements\` | a \`poly-navigate\` listener on the element, or \`listens="navigate"\` on it for a listener by delegation; without either, the link follows its \`href\` |

- ${f.m('AppShell')} renders once, at the root route, and each route renders one page archetype
  inside it. The app sets ${f.p('AppShell', 'transitionKey')} to the path,
  ${f.p('AppShell', 'pending')} while the router loads, and \`current\` on each item: which paths a
  section holds is the router's knowledge.
- A pager takes addresses too: ${f.m('Pagination')}'s ${f.p('Pagination', 'getPageHref')} beside
  ${f.p('Pagination', 'onPageChange')}, ${f.m('CursorPagination')}'s
  ${f.p('CursorPagination', 'previousHref')} and ${f.p('CursorPagination', 'nextHref')}.
- An \`onClick\` on an \`<a>\` is a red-rule violation. A link that routes is a Link with
  \`onNavigate\`, and work that changes data is a Button.
- An action that goes to another page, such as a page's "New ticket", is a ${f.m('Link')} with
  ${f.v('Link', 'variant', 'button')}, never a ${f.m('Button')} whose handler calls the router. It
  stays an \`<a href>\`, so it opens in a new tab and copies as an address, and it takes a
  Button's look. Its ${f.p('Link', 'buttonVariant')} is \`soft\` unless set: set
  ${f.v('Link', 'buttonVariant', 'solid')} when it is the page's one main action. It has no icon,
  no loading and no disabled state.
`.trimStart()
}
