# The app around a screen: root, forms, feedback and navigation

The examples are React, and each section says what differs elsewhere. An app `init` wrote has the
root below. In another app, check each line.

## 1. The root

- The entry imports the theme module first: `import 'virtual:polymorph/theme'`. It brings the
  theme's stylesheet, the fonts its system names and the reader's stored choice. An Angular entry
  imports `@polymorph/angular-ui/base.css` next. The Vite plugin writes `data-system`,
  `data-palette` and the pre-paint script into `index.html`: never write them, and never select on
  them in CSS.
- The toast viewport is mounted once, outside the routes and outside any error boundary.
- In React a `Tooltip` needs `TooltipProvider` above it. `AppShell` brings its own;
  a root without AppShell wraps the app in one.

```tsx
import 'virtual:polymorph/theme'

import { ToastHost, TooltipProvider } from '@polymorph/react-ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'

const TOASTS = { dismiss: 'Dismiss', notification: 'Notification', viewport: 'Notifications (F8)' }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastHost messages={TOASTS}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ToastHost>
  </StrictMode>,
)
```

```html
<!-- Vue, Svelte, Solid: once, in the root component -->
<Toast.Viewport />
<!-- Angular: ToastViewport in the root's imports -->
<pm-toast-viewport />
<!-- elements: once, in <body> -->
<poly-toast-viewport></poly-toast-viewport>
```

- **Mode.** `ModeSwitch` with a `label` and no
  `value` shows the reader's choice of light, dark or system and applies it.
  A Menu or command entry calls `setMode` with `'light'`,
  `'dark'` or `'system'`, and reads the choice from `useMode`, which
  every foundation exports. The palette holds both modes: write no `dark` class, no
  `prefers-color-scheme` rule and no second stylesheet.
- **Language.** `lang` on `<html>`, and `dir="rtl"` for a right-to-left language: every member
  follows it. No provider sets a locale or words for the whole app. A member that formats dates or
  numbers takes `locale`, and a member with words of its own takes `messages`, English when left
  out. Pass the app's translations to each, as `ToastHost` takes its three words.

## 2. Forms

```sh
npx -y @metamorph-labs/polymorph@1.0.18 component FormField --framework <framework>
```

```tsx
import { Button, Card, FormField, FormPage, Input, Select, Stack, toast } from '@polymorph/react-ui'
import { useState } from 'react'

const TERMS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
]

export function NewInvoicePage(props: {
  save: (draft: { customer: string; terms: string }) => Promise<void>
  onDone: () => void
}) {
  const [customer, setCustomer] = useState('')
  const [terms, setTerms] = useState('30')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const customerError = submitted && customer.trim() === '' ? 'Name the customer.' : undefined

  async function submit() {
    setSubmitted(true)
    if (customer.trim() === '') return
    setSaving(true)
    try {
      await props.save({ customer, terms })
      toast.success('Invoice created')
      props.onDone()
    } catch {
      toast.danger('The invoice was not saved', { description: 'Try again in a moment.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormPage
      title="New invoice"
      onSubmit={submit}
      actions={<Button type="submit" label="Create invoice" loading={saving} />}
    >
      <Card>
        <Stack gap={5}>
          <FormField label="Customer" required error={customerError}>
            <Input value={customer} onChange={setCustomer} />
          </FormField>
          <FormField label="Payment terms">
            <Select options={TERMS} value={terms} onChange={(value) => setTerms(value ?? '30')} />
          </FormField>
        </Stack>
      </Card>
    </FormPage>
  )
}
```

- `FormPage` with `onSubmit` renders a real `<form>`: Enter submits
  from any field, and a failed submit moves focus to the first invalid field. Its
  `actions` hold one submit Button, solid accent by default, and quiet ones. A
  destructive action goes in `leadingAction`, behind a `ConfirmDialog`.
- `FormField` wraps one control and wires its label, `description`,
  `required` and `error`. A non-empty error marks the
  control invalid and links the message; never set the control's `invalid` as
  well. Two fields side by side are a `Grid` with `columns` of 2.
- Errors are computed from the values and a `submitted` flag, so none shows before the first
  submit. A server's error for a field goes in that field's error.
- While the request runs, the submit Button takes `loading`, and a click does
  nothing.
- A long form also lists its errors above the fields in `ErrorSummary`, whose
  `errors` is `{ label, fieldId }[]`, each `fieldId` the
  `id` of its FormField.
- Vue writes `@submit` and `<template #actions>`, Angular `(submit)`. On a page with no build, a
  `<form>` around the elements posts each member's value under its `name`.

## 3. Feedback and overlays

| The screen needs | Use |
| --- | --- |
| The outcome of an action | `toast.success(title)`, `toast.danger`, `toast.warning`, `toast.info`, or `toast.promise(promise, { loading, success, error })` for one card through the wait |
| A failure that stays until the screen resolves it | `ToastNotice` in React, `<Toast>` in a template elsewhere: shown while it is rendered |
| A region that is loading | `Skeleton` in the content's place, `loading` on a DataTable, `Spinner` for a wait of unknown length |
| An action that is running | the Button's `loading`; a ConfirmDialog whose `onConfirm` returns a promise stays pending until it settles |
| Nothing to show | `EmptyState`, or the archetype's `emptyState`; a failed load is one with `icon="error"` and a retry action |
| A status inside the page | `Alert` with a `tone` |
| A notice for the whole app until its cause ends | `Banner` in AppShell's `banner` |
| To confirm a destructive action | `ConfirmDialog`: a question, its consequence and a verb |
| A task over the page | `Dialog` with a `title` and a `footer`, or `Drawer` at the side |

```tsx
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
```

- `toast` comes from `@polymorph/react-ui` in React, from the foundation (`@polymorph/vue` and
  so on) elsewhere, and from `polymorph.js` on a page with no build. With no viewport mounted, a
  toast draws nowhere.
- A danger or warning toast, and one with an `action`, stays until it is dismissed. A success or
  info toast leaves on its own.
- An Angular ConfirmDialog closes when it is confirmed: hold `open` in the
  component to keep it open while saving. On a page with no build, the `poly-confirm` listener
  calls `event.waitUntil(promise)`.

## 4. Navigation

`Link`, `AppShell.NavItem`, `Breadcrumbs`, `SectionNav`, `List.Item` and `Card` with an `href` draw a real `<a href>`. Without `onNavigate` the
browser loads the address. With it, a plain click calls `onNavigate(href)` instead. A click with a
modifier key or another button, or on an `external` Link, stays the browser's.

```tsx
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
```

| Framework | The router, passed to `onNavigate` |
| --- | --- |
| `react` | React Router: `(href) => navigate(href)`, `navigate` from `useNavigate()`. TanStack Router: `(href) => navigate({ href })`. Next.js: `(href) => router.push(href)` |
| `vue` | `@navigate="(href) => router.push(href)"` |
| `svelte` | `onNavigate={goto}` in SvelteKit |
| `solid` | `onNavigate={navigate}`, `navigate` from `useNavigate()` of `@solidjs/router` |
| `angular` | `(navigate)="router.navigateByUrl($event)"` |
| `elements` | a `poly-navigate` listener on the element, or `listens="navigate"` on it for a listener by delegation; without either, the link follows its `href` |

- `AppShell` renders once, at the root route, and each route renders one page archetype
  inside it. The app sets `transitionKey` to the path,
  `pending` while the router loads, and `current` on each item: which paths a
  section holds is the router's knowledge.
- A pager takes addresses too: `Pagination`'s `getPageHref` beside
  `onPageChange`, `CursorPagination`'s
  `previousHref` and `nextHref`.
- An `onClick` on an `<a>` is a red-rule violation. A link that routes is a Link with
  `onNavigate`, and work that changes data is a Button.
