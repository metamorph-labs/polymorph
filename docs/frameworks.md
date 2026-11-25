# Frameworks

The vocabulary is one set of members, and on the web it ships in each framework below. `@polymorph/react-ui`
ships every member in React. `@polymorph/vue-ui` ships, in Vue, the members
`design/frameworks/vue.json` marks native, as single-file components that `pnpm shells` generates
from each member's description and styles with the React members' recipes
([shells.md](shells.md)). Every other member is absent in Vue, and its entry in the map says why.
The Vue vocabulary is built on `@polymorph/vue`, the Vue foundation. The two Vue packages are
published as `@metamorph-labs/polymorph-vue` and `@metamorph-labs/polymorph-vue-ui`. Every
framework uses the same engine and the same red rules. This page covers how a React prop reads in
Vue, the map that says which members the Vue vocabulary ships, and how the tools write and check
Vue code: the screen emitter, `polymorph init` and `polymorph add`. The same tools write and check
Svelte and Solid code ([below](#the-tools-in-svelte-and-solid)) and Angular code
([below](#the-tools-in-angular)), and know the elements ([below](#the-tools-in-elements)).

`@polymorph/svelte-ui` ships, in Svelte 5, the members `design/frameworks/svelte.json` marks native,
generated from the same descriptions and styled with the same recipes, on `@polymorph/svelte`, the
Svelte foundation; both are published as `@metamorph-labs/polymorph-svelte` and
`@metamorph-labs/polymorph-svelte-ui` ([From React to Svelte](#from-react-to-svelte)).
`@polymorph/solid-ui` ships, in Solid 1.9, the members `design/frameworks/solid.json` marks native,
generated from the same descriptions and styled with the same recipes, on `@polymorph/solid`, the
Solid foundation; both are published as `@metamorph-labs/polymorph-solid` and
`@metamorph-labs/polymorph-solid-ui` ([From React to Solid](#from-react-to-solid)).
`@polymorph/angular-ui` ships, in Angular 22, the members `design/frameworks/angular.json` marks
native, as standalone components generated from the same descriptions and styled with the same
recipes, on `@polymorph/angular`, the Angular foundation; both are published as
`@metamorph-labs/polymorph-angular` and `@metamorph-labs/polymorph-angular-ui`
([From React to Angular](#from-react-to-angular)).
`@polymorph/elements-ui` ships the members `design/frameworks/elements.json` marks native as custom
elements (`<poly-button>`), for a page written in HTML. Each element renders the generated Solid
member into itself, in the light DOM, on `@polymorph/elements`, the elements foundation, so the
elements are a distribution of the Solid rendering and not a second set of decisions; both are
published as `@metamorph-labs/polymorph-elements` and `@metamorph-labs/polymorph-elements-ui`
([From React to elements](#from-react-to-elements)).

A framework is not a platform. A platform ([native.md](native.md)) is where a screen runs, and a
screen spec names it: a spec for iOS emits SwiftUI, and one for Android emits Jetpack Compose. A
framework is how a web screen is written, and the same spec emits for any framework the emitter
writes, so the framework is an option of the emitter and the validator, never a field of the spec.
The emitter writes no elements page ([below](#the-tools-in-elements)).

## From React to Vue

| React | Vue |
| --- | --- |
| prop `foo` | prop `foo` (same name, same type) |
| event prop `onFoo: (payload) => void` | emitted event `foo` with the React callback's parameters; in a template `@foo="handler"` |
| `children` | the default slot |
| a `ReactNode`-typed prop `foo` | the named slot `foo` |
| a render prop `foo: ({ a, b }) => ReactNode` | the scoped slot `foo`, whose slot props are the argument's named values (`#rowDetail="{ row, close }"`) |
| `import { Button } from '@polymorph/react-ui'` | `import { Button } from '@polymorph/vue-ui'` |
| `<Icon name="close" />` | the same; `Icon` ships in `@polymorph/vue`, and `@polymorph/vue-ui` re-exports it |
| `data-member`, `data-*` | identical |
| no `className`/`style` on members | no `class`/`style` on members (the same red rule) |

The table is code as well as prose. `vueBinding(prop)` in `@polymorph/registry/frameworks` reads a
prop's name and the type the registry prints for it and returns `prop`, `event`, `slot` or
`scoped-slot` with the Vue name. The screen emitter calls it, and `pnpm shells` writes each Vue
member's props, emits and slots by the same reading ([shells.md](shells.md)), so the two cannot
disagree about a prop.

- **Events keep the prop's name, less `on`, with its first letter lowercased.** `onClick` is
  `click`, `onSortChange` is `sortChange`, written `@sortChange` (Vue also reads `@sort-change`).
- **A node-typed prop is a slot, whatever its value.** `ReactNode` and `ReactElement` are slots,
  so a string given to one is written as the slot's text.
- **A node inside a value is a render call.** `EmptyStateProps.secondaryAction` is a node inside
  a structured prop, which no slot can reach. In Vue it is a `VNode`, written `h(Button, { … })`,
  and the member renders it with `<component :is>`.
- **A compound part keeps its dotted name.** `<SettingsRow.Group>` resolves in `<script setup>` to
  the `Group` property of the imported `SettingsRow`.
- **A toast is raised, and the viewport is a part.** React's `toast()` is the foundation's
  `toast()`, and its `ToastHost` is `<Toast.Viewport />`, mounted once at the application root,
  outside the page transitions and any error boundary. `<Toast>` takes `toast()`'s options as
  props and declares a toast that shows while it is mounted, as React's `ToastNotice` does
  ([shells.md](shells.md#toast)). Svelte, Solid and Angular read Toast the same way; in Angular
  the viewport is `<pm-toast-viewport>`.
- **A member inherits no attributes.** A Vue member is declared with `inheritAttrs: false` and
  takes no `class` or `style`, so `class` on a member does nothing, as `className` does nothing on
  a React member. `no-raw-styles` removes it in both.

## From React to Svelte

| React | Svelte |
| --- | --- |
| prop `foo` | prop `foo` (same name, same type; `aria-label` is passed as `aria-label`) |
| event prop `onFoo: (payload) => void` | callback prop `onFoo` with the same payload, Svelte 5's own idiom for an event |
| `children` | the `children` snippet: the content between the member's tags |
| a member that reads or clones its children (FormField's control, Dialog's trigger, Avatar.Group's `max`) | the same, for a member or a plain element in the snippet, read from the document it renders; a server render reads its members and not its elements ([shells.md](shells.md#the-svelte-renderer)) |
| a `ReactNode`-typed prop `foo` | a snippet prop `foo` (`{#snippet foo()}…{/snippet}` inside the member's tags) |
| a render prop `foo: ({ a, b }) => ReactNode` | a snippet prop `foo` with the same object as its parameter (`Snippet<[Arg]>`, `{#snippet rowDetail({ row, close })}`) |
| a node inside a value (`EmptyStateProps.action`) | a snippet; a function that returns a node (a DataTable column's `cell`) is a snippet with its parameters (`{#snippet cell(row)}`) |
| `import { Button } from '@polymorph/react-ui'` | `import { Button } from '@polymorph/svelte-ui'` |
| `<Icon name="close" />` | the same; `Icon` ships in `@polymorph/svelte`, and `@polymorph/svelte-ui` re-exports it |
| a compound part `<Tabs.Content>` | the same: a property of its member |
| `data-member`, `data-*` | identical |
| no `className`/`style` on members | no `class`/`style` on members: a member ignores a prop it does not declare |

The mapping differs from Vue's in one way: in Svelte every React prop stays a prop of its React
name, because a callback and a snippet are props there. So a Svelte member's props interface is
the registry's props table, read as `vueBinding` reads it for the types (a node is a `Snippet`, an
event's payload is the DOM event), and the spec staleness law compares the two by name
([shells.md](shells.md#the-svelte-laws)). The screen emitter, `polymorph init` and
`polymorph add` write Svelte by this mapping ([below](#the-tools-in-svelte-and-solid)).

## From React to Solid

| React | Solid |
| --- | --- |
| prop `foo` | prop `foo` (same name, same type; `aria-label` is passed as `aria-label`) |
| event prop `onFoo: (payload) => void` | callback prop `onFoo` with the same payload, Solid's own idiom for an event; an item of a list the caller passed is that object itself (`onRowClick(row)`) |
| `children` | `children`, a `JSX.Element`: the content between the member's tags |
| a `ReactNode`-typed prop `foo` | a `JSX.Element` prop `foo` (`footer={<Button label="Done" />}`) |
| a render prop `foo: ({ a, b }) => ReactNode` | a function prop `foo` that takes the same object and returns a `JSX.Element` |
| a node inside a value (`EmptyStateProps.action`) | a `JSX.Element`; a function that returns a node (a DataTable column's `cell`) returns a `JSX.Element` |
| a ref prop `controlRef: Ref<HTMLInputElement>` | a function prop `controlRef` the member calls with its element, and with `null` when the element goes |
| `import { Button } from '@polymorph/react-ui'` | `import { Button } from '@polymorph/solid-ui'` |
| `<Icon name="close" />` | the same; `Icon` ships in `@polymorph/solid`, and `@polymorph/solid-ui` re-exports it |
| a compound part `<Tabs.Content>` | the same: a property of its member, and its own module's default export (`TabsContent.tsx`) |
| `data-member`, `data-*` | identical |
| no `className`/`style` on members | no `class`/`style` on members: a member ignores a prop it does not declare |

The mapping is React's, because a Solid component's props are an object, as a React component's
are: a callback, a node and a render function are props of their React names. A Solid member reads
its props through `props.<name>` and never destructures them, so it is the caller's JSX that makes
a value reactive (`open={held.open}`). The screen emitter, `polymorph init` and `polymorph add`
write Solid by this mapping ([below](#the-tools-in-svelte-and-solid)).

## From React to Angular

| React | Angular |
| --- | --- |
| prop `foo` | input `foo` (same name, same type; `aria-label` is the input `aria-label`): `foo="text"` or `[foo]="value"` |
| event prop `onFoo: (payload) => void` | output `foo`, emitting the callback's first argument: `(foo)="handler($event)"`; a callback of two arguments (Input's `onChange(value, event)`) emits the first |
| `children` | the member's content: what the caller writes between its tags |
| a `ReactNode`-typed prop `foo` | the named slot `foo`: content marked `slot="foo"` (`<pm-button slot="footer" label="Done" />`), or an `ng-container` with `ngProjectAs="[slot=foo]"` for text or several nodes |
| a render prop `foo: ({ a, b }) => ReactNode` | an input `foo` that takes an `ng-template`, rendered with each named value as a variable of that name (`<ng-template #detail let-row="row" let-close="close">`) and the whole object as its `$implicit` |
| a node inside a value (`EmptyStateProps.action`) | a `NodeTemplate`, an `ng-template`; a function that returns a node (a DataTable column's `cell`) is a `NodeTemplate` of its parameters, whose first is the template's `$implicit` |
| a ref prop `controlRef: Ref<HTMLInputElement>` | an input `controlRef` that takes a function the member calls with its element and with `null` when it goes, or an object whose `current` it sets |
| `import { Button } from '@polymorph/react-ui'` | `import { Button } from '@polymorph/angular-ui'`, listed in the component's `imports`, written `<pm-button>` |
| `<Icon name="close" />` | `<pm-icon name="close" />`; `Icon` ships in `@polymorph/angular`, and `@polymorph/angular-ui` re-exports it |
| a compound part `<Tabs.Content>` | a component of its own, `TabsContent`, written `<pm-tabs-content>`; a part that is a list's item or a table's section, row or cell is that element with the part's attribute (`<tr pmTableRow>`, `<td pmTableCell>`) |
| `data-member`, `data-*` | identical |
| no `className`/`style` on members | no `class`/`style` on members: a member's host element carries no attribute but its `display: contents` style and its mark, `data-pm-host`, and draws no box |

The mapping differs from React's where Angular's idiom differs. An output returns nothing to the
member that emits it, so a handler cannot hand a value back: ConfirmDialog closes when it is
confirmed, where React's waits on an `onConfirm` that returns a promise, and a caller that saves
first holds `open` itself. An Angular component renders inside a host element, which a member keeps
out of the document's layout and its accessibility tree (`display: contents`, and no attribute but
that style and its mark, `data-pm-host`, which the recipes' reach-through forms read), and `(click)` on a member hears the member's output, never the native click that
bubbles through its host. The base layer ships as `@polymorph/angular-ui/base.css`, which an
application lists among its global styles, because the Angular CLI compiles no stylesheet a module
imports.

## From React to elements

| React | elements |
| --- | --- |
| prop `foo` | attribute `foo` in kebab case (`icon-only`, `default-value`; an `aria-*` or `data-*` prop keeps its name) and property `foo` in camel case (`iconOnly`, `ariaLabel`) |
| a boolean prop | the attribute present is `true`, `"false"` is `false`, and absent is the member's default, so `dismissible="false"` turns off a default of `true` |
| a string, a number or a union of literals | the attribute's text, read as the literal it names, then as a number or a string where the type allows one |
| data: an array, an object, a named data type | a JSON attribute (`options='[{"value":"low","label":"Low"}]'`), or the property set to the value; data whose type holds a function (a messages catalogue with plural functions) is the property only |
| a callback an item of data requires (a Menu item's `onSelect`) | left out of the JSON, the element completes it: the event `poly-select` on the element, with `detail` `{ item, index }` and `value` where the member passes one |
| `Time`, `CalendarDate`, `CalendarDateTime`, a range of dates | an ISO 8601 attribute (`09:30`, `2026-07-15`, `2026-07-15T09:30`, `2026-07-01/2026-07-15`), or the property, set to the engine's value or to that text. On a page that loads a member's code when one of its elements first renders (`polymorph.js`), the property reads `undefined` until that code has loaded |
| event prop `onFoo: (payload) => void` | the event `poly-foo` (`onOpenChange` is `poly-open-change`): a `PolymorphEvent` whose `detail` is the callback's first argument, or `null`, and whose `args` is every argument the member passed, so `[null]` and `[]` differ; it bubbles and is composed |
| a controlled prop and its change event (`value` and `onChange`, `open` and `onOpenChange`) | the element follows the reader: after the change event, unless a listener calls `preventDefault()`, the element sets its own property to the new value, so `el.value` reads the current value. A controlled prop the page never set leaves the member uncontrolled, and the property reads the value the member last reported |
| a prop named as a method every element inherits (Diff's `before` and `after`) | the attribute only: the element has no property of that name, so `el.before()` is still `ChildNode.before()` |
| `children` | the element's content |
| a `ReactNode`-typed prop `foo` | a child with `slot="foo"`, in kebab case (`slot="secondary-action"`); `<template slot="foo">` gives text or several nodes with no wrapper |
| a node field of an object prop (`AppShell`'s `topbar.leading`) | a child with the dotted slot name (`slot="topbar.leading"`) |
| a render prop, a function, a ref (`DataTable`'s `rowDetail`, `validate`, `controlRef`) | a property set from script (`el.rowDetail = ({ row }) => node`); there is no attribute |
| `import { Button } from '@polymorph/react-ui'` | `<poly-button>`, defined once the page loads `polymorph.js`, or once an app with a build imports `@polymorph/elements-ui/controls/Button` (or `@polymorph/elements-ui`, every element) |
| `<Icon name="close" />` | `<poly-icon name="close"></poly-icon>`; `poly-icon` ships in `@polymorph/elements` |
| a compound part `<Tabs.Content>` | an element of its own, `<poly-tabs-content>`; a table's section, row or cell, a list's item and a comment (`<poly-table-row>`, `<poly-list-item>`) is replaced in the document by the element its member renders (`<tr>`, `<li>`) |
| `data-member`, `data-*` | identical, on the member's rendering inside the element |
| no `className`/`style` on members | no `class`/`style` on an element: it draws no box, and an inherited property reaches the member's content |

The mapping is React's, read through HTML. Every tag and every event begins with `poly-`, one
prefix for all of them: a member's event names a native one in places (`onChange`, `onClick`), and
the native event still bubbles through the element with its own meaning. So `click` on
`<poly-button>` is the native click, and `poly-click` is the member's. An element renders in the
light DOM: its member's rendering is the element's content, the page's stylesheets and `<label
for>` reach it, and `getElementById` finds the member's control. The element itself draws no box.
While it renders its member it carries the custom state `poly-host`, and the stylesheet gives
`:state(poly-host)` `display: contents`; a recipe that reads a member's parent or siblings also
reads them through the element ([shells.md](shells.md#the-elements-renderer)). The `id`, `title`, `role` and `aria-*` attributes that are props are read into props and
taken off the element, where they would name or describe the whole member.

A property never writes its attribute back, so a morphing swap and a script that both set a value
do not undo each other. Removing an attribute sets its prop to `undefined`, and the member's
default applies. An attribute a codec cannot read is reported in development and reads as
`undefined`; the no-build files report it on every page, because nothing builds that page for
development. The elements need Chrome 125, Safari 17.4 or Firefox 126, because the host is marked
with a custom state (`:state()`); an older engine draws each element as an inline box, and a
layout through one breaks. [consuming.md](consuming.md#a-page-with-no-build) says how a page loads
them and what it can set only from script.

An element observes its own children, and a slot is read again when what it holds changes. Each
`poly-*` element the slot still holds keeps its rendering, so a field among them keeps its text
and its focus, and only the nodes that arrived render. A slot that holds one element is read as a
list of one, so a node added beside it goes after it, and a slot that holds one text is read as
the string. A script places nodes in a slot with `fillSlot(element, slot, nodes)`, exported by
`@polymorph/elements`: `slot` is the slot as a `slot` attribute names it (`''` for the children,
`footer`, `empty-state.action`), on any element, a table's or a list's part included, before or
after the member renders. The placed nodes replace what the page wrote in that slot and are not
the element's children, so `restore` puts back only what the page wrote. The run-time renderer
places every child this way and writes no markup.

A member that throws as it first renders renders nothing, and the members around it render. One
that throws as it updates (an effect that runs again when a prop changes) keeps what it had
rendered. Either way the element dispatches `poly-error`, which does not bubble, with the error as
`detail`. Unless a listener cancels the event, the error is reported as an uncaught error is
(`reportError`), so `window`'s `error` event and an error monitor see it. An error a member's
event handler throws is the browser's uncaught error, with no `poly-error`.

A screen a model writes while the product runs is drawn as elements by `<poly-screen>`. Vue,
Svelte, Solid and Angular have no run-time renderer of their own, so a page in any of them uses
`<poly-screen>`: it imports `@polymorph/elements-ui/screen` once and writes the element as it
writes any custom element ([run-time-screens.md](run-time-screens.md)).

## Another library's component

A map, a rich-text editor or a data grid from another library is hosted the same way in every
framework: inside the vocabulary's `ThirdParty` boundary, which names the library
([rules.md](rules.md#rung-4-another-librarys-component)). A library that takes its colours and
sizes in JavaScript reads them from `useThemeValues`, which each foundation exports in the shape
its framework reads a value:

| Foundation | `useThemeValues(element?)` returns | Read it as |
| --- | --- | --- |
| `@polymorph/react` | the values, from a hook that renders again when they change. It takes a ref. | `theme.color('accent.bg')`, while the component renders or in an effect that lists `theme` |
| `@polymorph/vue` | a `ShallowRef` | `theme.value.color('accent.bg')`, in the template, a `watchEffect` or a computed value |
| `@polymorph/svelte` | an object with a `current` getter | `theme.current.color('accent.bg')`, in the template, an `$effect` or `$derived` |
| `@polymorph/solid` | an accessor | `theme().color('accent.bg')`, in the JSX, an effect or a memo |
| `@polymorph/angular` | a signal, made in an injection context | `theme().color('accent.bg')`, in the template, an `effect` or a `computed` |

An elements page has no component to hold a hook. `@polymorph/elements` re-exports the engine's
`readThemeValues(element?)`, which returns one reading of the same values each time it is called,
and the boundary is `<poly-third-party library="…" reason="…">`.

Given no element, each reads the document's values. Given the element the hosted component is
drawn in, it reads what that element resolves, so a scope around it is seen. An element that is
not in the document resolves nothing, so it reads as no element.
[theming.md](theming.md#reading-the-theme-as-data) lists the values.

Each is current wherever it is read in those places, and each gives a new reading only when the
theme changes: a member that changes its own tone does not make one. These differ by framework:

- **A server render and hydration.** A server has no document, so every colour is the empty
  string, every number is 0 and `themed` is false. In React, Vue and Solid the render that
  hydrates the server's markup gets the same empty values, so it matches the markup, and the
  component gets the document's values once it has hydrated. Svelte and Angular give the
  document's values to the first render in the browser.
- **The element in React.** Vue, Svelte, Solid and Angular read the element each time a value is
  read. React's hook takes its ref's element after each commit of the component that calls it,
  and renders the component again before the browser paints when the element is another one. A
  ref has no element until React has mounted it, so the first render reads the document's
  values. A ref that gets its element in a later render is read from then on, and a ref whose
  element is removed reads the document's values again. An effect that lists `theme` runs for
  each reading. The hook does not see a commit in which only a child component renders. If such
  a commit gives the ref another element, the hook keeps the element it held until the calling
  component renders again.
- **A read outside an effect in Svelte.** The hook follows the theme while the template, an
  `$effect` or a `$derived` reads `current`. Read in an event handler or another library's
  callback, `current` is a new reading each time.
- **A call outside a component.** Each hook is made for a component. Vue's also follows the
  theme in an `effectScope` outside a component, until the scope stops, and Solid's under a
  `createRoot`, until the root is disposed. Outside both, each does what `useDirection` and
  `useMediaQuery` of its foundation do. Vue's holds the reading taken at the call, and Vue warns
  that its lifecycle hooks have no component. Solid's follows the theme with nothing to release
  it, and Solid warns that the computation is never disposed. Angular's throws outside an
  injection context. Svelte's `current` is a new reading wherever no effect reads it.

## The colour mode

A page offers the choice of light, dark or the system's mode with a `ModeSwitch`, or with
entries in its account Menu or command palette ([mode-switch.md](../design/components/mode-switch.md)).
An entry reads the current choice from `useMode` and sets it with `setMode`, which each
foundation re-exports from the runtime. `useMode` returns `{ preference, mode }`: the preference,
`light`, `dark` or `system`, and the mode it resolves to. It changes after each `setMode`, from
any caller, and when the operating system's mode changes while `system` is applied.

| Foundation | `useMode()` returns | Read it as |
| --- | --- | --- |
| `@polymorph/react` | the reading, from a hook that renders again when it changes | `useMode().preference` |
| `@polymorph/vue` | a `ShallowRef` | `mode.value.preference`, in the template, a `watch` or a computed value |
| `@polymorph/svelte` | an object with a `current` getter | `mode.current.preference`, in the template, an `$effect` or `$derived` |
| `@polymorph/solid` | an accessor | `mode().preference`, in the JSX, an effect or a memo |
| `@polymorph/angular` | a signal, made in an injection context | `mode().preference`, in the template, an `effect` or a `computed` |

A server stores no preference, so a server render reads `system` and `light`. In React, Vue and
Solid the render that hydrates the server's markup reads the same, and the component reads the
document once it has hydrated. Svelte and Angular read the document on the first render in the
browser. A Vue account Menu's entries, which the Menu takes as `items`:

```ts
const mode = useMode()
const items = computed<MenuEntry[]>(() =>
  MODE_PREFERENCES.map((choice) => ({
    kind: 'checkbox',
    label: words[choice],
    checked: mode.value.preference === choice,
    onCheckedChange: (checked: boolean) => {
      if (checked) setMode(choice)
    },
  })),
)
```

## The framework map

`design/frameworks/vue.json` says, for every member, whether the Vue vocabulary ships it:

```json
{
  "framework": "vue",
  "members": {
    "Accordion": { "status": "native" },
    "ImageEditor": {
      "status": "absent",
      "reason": "no description draws it: its crop geometry (`image-editor.geometry.ts`) is the React vocabulary's, not the engine's, so a description cannot share it"
    }
  }
}
```

The map is the list of what Vue ships: a member is native exactly when it has a description in
`packages/shells`, and [shells.md](shells.md) says how one is described and the laws that hold the
generated member to the React one. `design/frameworks/svelte.json`, `solid.json` and
`angular.json` are the same list for Svelte, Solid and Angular, each held to the descriptions by its
vocabulary's law (`packages/svelte-ui/laws.test.ts`, `packages/solid-ui/laws.test.ts`,
`packages/angular-ui/laws.test.ts`), and `elements.json` for the elements
(`packages/elements-ui/laws.test.ts`). Every renderer writes every description, so every map marks
the same members native, and a member absent in all of them gives the reason it has no
description.
An absent member's `reason` names what its shell needs, or that no shell has been described for
it. The tools read the map through the registry, so an absent member is refused with that reason
wherever its framework is asked for it.

| Status | Meaning |
| --- | --- |
| `native` | the framework's vocabulary (`@polymorph/vue-ui` for Vue) ships the member |
| `absent` | it does not; `reason` says why |

React has no file. The React vocabulary is what the registry is read from, so every member is
native there. There is no `adapted` status, because every framework renders the same platform, the
web, with the same recipes.

The map's law (`packages/registry/src/frameworks.ts`, `frameworkFaults`, run by
`frameworks.test.ts` and by `pnpm registry`): the file has the map's shape and names its own
framework; every gallery member has an entry; no entry names something that is neither a member nor
a ladder primitive; the entries are sorted by name; no entry still carries the scaffold's `DECIDE`
placeholder; an absent entry says why, in words; and a native member brings no absent one. The last
clause reads the framework's own tree: every member whose file an install of a native member
copies, through what its component imports or what its fixture builds, is native too. The registry
also refuses a native member that the framework's vocabulary does not export from its entry. A
ladder primitive (`Bespoke`, `DensityScope`, `ToneScope`) may have an entry. One without an entry is
absent, with the reason that the file has none, because a framework without a shell for a rung
cannot open it.

The registry publishes the maps. The top-level `frameworks` lists `react`, `vue`, `svelte`,
`solid`, `angular` and `elements`, and every member and primitive has a `frameworks` entry for
each. The map's law covers every file. A member native in Vue also has a `frameworks.vue.shell`, read from the
Vue tree: `origin` (`installed` for `Icon`, which `@polymorph/vue` ships, `vendored` for the rest),
`sources` (its component, then each compound part the index attaches, such as `TabsContent.vue`
for `Tabs.Content`), `states` (its fixture), and `dependencies`: the members its component
composes, the packages its closure imports and every file an install copies.
`vendor.frameworks.vue` names the tree those files are rebased from, and its `packages` ranges
`@polymorph/vue`, `@polymorph/vue-ui` and the Zag machines, read from those two manifests only. A
member native in Svelte or Solid has the same `frameworks.svelte.shell` or
`frameworks.solid.shell`, read from `packages/svelte-ui/src` or `packages/solid-ui/src`: a Svelte
member's sources are `.svelte` files and its imports are read from both of its scripts
(`<script module>` and `<script>`), and a Solid member's are `.tsx` modules. A member native in
Angular has `frameworks.angular.shell`, read from `packages/angular-ui/src`: its sources are its
component's `.ts` module and each part's, which the index exports beside it as a component of its
own (`TabsContent.ts` for `Tabs.Content`, in the member's directory), so a part is its member's and
never a member of its own. `vendor.frameworks.svelte`, `.solid` and `.angular` range each
foundation, vocabulary and machine the same way, from that framework's own manifests, so the Solid
record pins every Zag machine to the exact version of the Solid foundation's `@zag-js/core`.

A member native in elements has `frameworks.elements.shell`, read from `packages/elements-ui/src`:
`origin` is `installed` for every element, because an install copies nothing for one, and
`dependencies` is empty. Its `sources` are its element's definition module and each part's
(`Tabs.ts` and `TabsContent.ts`), and `Icon`'s are none, because `poly-icon` ships in
`@polymorph/elements`. `vendor.frameworks.elements` has no support file, ranges
`@polymorph/elements` and `@polymorph/elements-ui` for an app with a build, and names in `noBuild`
the directory of the files a page with no build loads (`packages/elements-ui/dist/cdn`) and the
command that builds it (`pnpm build:packages`).

The tools read the map, with `framework` set to any framework but React:

| Tool | With `framework: 'vue'` (or `svelte`, `solid`, `angular`, `elements`) |
| --- | --- |
| `validateSpec(registry, spec, { framework })` | an absent member is a fault that gives the map's reason; a Vue screen that names a phone platform is a fault |
| `renderSystemCard(registry, { framework })` | the install paragraph names the Vue packages and the prop mapping, and absent members are left out; a Vue card is never longer than the React card of the same registry |
| `searchRegistry(registry, { framework })` | absent members are left out |
| MCP `search_components`, `get_system_card`, `validate`, `emit_screen` | take `framework` and answer as above. `validate` lints a single-file component as one, markup with no block as a component's template, and TypeScript or CSS as itself; for `svelte` it lints markup as a component, for `solid` TSX as Solid's, and for `angular` TypeScript as a component module, its inline template included, and markup as a component's template |
| MCP `get_install_plan`, `install` | take `framework` as `polymorph add --framework` does ([below](#vendoring-vue-members-polymorph-add---framework-vue)) |

The elements differ where an HTML page does. `validate` reads a spec against the elements map and
says a page is not read, because the red rules do not read HTML, and `emit_screen` refuses the
elements ([below](#the-tools-in-elements)).

## Emitting a screen for Vue

```sh
pnpm emit design/screens/inbox.json src/InboxView.vue        # the extension chooses Vue
pnpm emit design/screens/inbox.json --framework vue          # to stdout
```

An output whose extension contradicts `--framework` (`--framework vue` with a `.tsx` path) is
refused with the usage line, and nothing is written.

`emitScreen(spec, { framework: 'vue', registry })` (`packages/spec/src/emit-vue.ts`) writes one
single-file component. The emitter reads each prop's type from the registry, so it needs the
registry the spec was validated against; without one it refuses. `emitCheckedScreen` takes the
same options and lints the result as a `.vue` file, so the red rules read its template. Validation
runs first with the same framework, so a member with no Vue shell stops the emit with its reason.

The component, trimmed from the Relay inbox:

```vue
<script setup lang="ts">
/**
 * Relay's ticket queue — a filtered, sortable table under a page header.
 *
 * Emitted from a screen spec (`polymorph-screen/1`). Composition and bindings only:
 * this file holds no state, computes nothing, and expresses no style — the
 * container that renders it owns all three.
 */
import { h } from 'vue'
import { Button, DataTable, DensityScope, ListPage, type DataTableSort } from '@polymorph/vue-ui'
import type { Ticket } from './tickets'

export interface InboxViewProps {
  tickets: Ticket[]
  onSortChange: (sort: DataTableSort) => void
  onNewTicket: () => void
  onClearFilters: () => void
  // …
}

const props = defineProps<InboxViewProps>()
</script>

<template>
  <ListPage
    title="Inbox"
    :emptyState="{
      icon: 'search',
      secondaryAction: h(Button, { label: 'Clear filters', onClick: props.onClearFilters }),
    }"
  >
    <template #actions>
      <Button icon="add" label="New ticket" @click="props.onNewTicket" />
    </template>
    <!-- Rung 2, declared: A queue is scanned rather than read, … -->
    <DensityScope value="compact" as="section">
      <DataTable label="Tickets" :data="props.tickets" @sortChange="props.onSortChange" />
    </DensityScope>
  </ListPage>
</template>
```

- **The header** is the React emitter's comment, with the same emitted marker and spec name, so a
  tool that regenerates its own output recognises a Vue screen as it recognises a TSX one.
- **Every input is a prop**, callbacks included, declared with `defineProps`. A binding reads it
  from `props`. A parent passes a callback input as `:onStart` or as `@start`.
- **Types the React vocabulary exports** are imported from `@polymorph/vue-ui` under the same
  names. Every other module in `types` is imported as written.
- **Text reads back as typed.** A string is written as text or a static attribute only when Vue
  reads it unchanged. Anything else is a string literal in `{{ }}` or a bound attribute, with every
  quote, `&`, `<`, `>` and brace escaped, so no text closes the expression it sits in. Text and the
  bindings beside it are written on one line with nothing between, because Vue condenses a line
  break beside text to a space where React drops it.
- **An exception's reason** is an HTML comment before the element, or a block comment before a
  render call, and cannot close the comment it is in.

`packages/spec/src/vue.test.ts` emits the three Relay screens and checks that each compiles with
Vue's compiler (script and template), passes every red rule as a `.vue` file, is formatted the way
the repository formats code and matches its snapshot, and that the React emission of the same
specs matches its own snapshot.

## A Vue app: `polymorph init --framework vue`

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-app --framework vue
```

The same app `init` writes for React ([tooling.md](tooling.md#init)), in Vue:

| File | What it holds |
| --- | --- |
| `package.json` | `vue`, `@polymorph/engine`, `@polymorph/vue` and `@polymorph/vue-ui` as aliases of their published names, the system's fonts; dev dependencies `@polymorph/rules`, `@vitejs/plugin-vue`, `vue-eslint-parser`, `vue-tsc`, `eslint`, `stylelint`, `typescript`, `vite`; a `typecheck` script that runs `vue-tsc` |
| `index.html`, `src/main.ts` | the entry: the theme module first, then `createApp(App).mount('#app')` |
| `vite.config.ts` | `@vitejs/plugin-vue` and the engine's theme plugin |
| `polymorph.eslint.js` | the rules for `.ts` and `.vue` files, with `vue-eslint-parser` reading the templates (`installedEslintFragment(values, { framework: 'vue' })`) |
| `polymorph/system-card.md` | the card rendered for Vue |
| `AGENTS.md`, the skills, the MCP entries | the agent files `polymorph agents` writes ([harnesses.md](harnesses.md)), with Vue's terms in the `AGENTS.md` block |
| `src/screens/welcome.json` | the welcome spec: the React app's inputs and layout, with the title and the status line as `Heading` and `Text` |
| `src/screens/Welcome.vue` | the emitter's output for it |
| `src/App.vue` | the container that owns the state and renders the screen |

The theme files, the Stylelint fragment, the configs that spread both fragments and `.mcp.json`
are the React app's.

The aliases come from the registry: `PUBLISHED_NAMES` names each package's published name, and
`vendor.frameworks.vue.packages` ranges it as a caret on its own version, so the app installs
`npm:@metamorph-labs/polymorph-vue@^<version>` and `npm:@metamorph-labs/polymorph-vue-ui@^<version>`,
each at the version in the checkout's `package.json`.

Every member the welcome spec names must be native in the app's framework. `planInit` checks the
spec against the registry before anything is written, and a member that is absent stops `init`
with one line per member and its reason, leaving the directory as it was. The emit step runs
later, after the configs and the theme are on disk, so a refusal there would leave a directory a
second run refuses. `packages/cli/src/vue.test.ts` runs `init --framework vue` against the real
registry and checks the written tree, and checks that a registry with `Heading` absent writes
nothing.

## Vendoring Vue members: `polymorph add --framework vue`

```sh
node ../polymorph/packages/cli/bin/polymorph.js add tabs --framework vue
```

The plan reads each member's Vue shell from the registry (`frameworks.vue.shell`), so it copies
the files the Vue member is made of, read from the Vue tree:

| Vendored for Vue | From |
| --- | --- |
| the member's component and every compound part its index attaches (`Tabs.vue`, `TabsContent.vue`) | `sources` |
| its states fixture (`tabs.states.ts`) | `states` |
| the members its component and its fixture import (`Badge.vue` for Tabs) | the closure, walked in the Vue tree |
| each recipe and convention stylesheet they import | the closure, from `packages/recipes/src/`: every framework's members share the recipes |
| `css-modules.d.ts` | `vendor.frameworks.vue.support` |

Every file lands at the same path under `--dir` as its React counterpart would, so a recipe sits
beside its member and the member's `@polymorph/recipes/…` import is rewritten to it. A member the
Vue member does not compose does not come along, even when the React member composes it. `Icon`
ships in `@polymorph/vue`, so `add icon --framework vue` vendors nothing and says so. The packages
are the ones the closure imports (`@polymorph/vue` and the Zag machines) at the ranges in
`vendor.frameworks.vue.packages`,
the engine, and the rules and `vue-eslint-parser` as dev dependencies, because the generated ESLint
config reads `.vue` files with it. A member the Vue map marks absent is refused with the map's
reason.

`polymorph.json` records `"framework": "vue"`, so `diff` and `update` plan the same files, and the
generated `polymorph.eslint.js` parses `.vue` files and exempts the vendored ones as it exempts
vendored TSX. Once an install has a manifest, `add` plans in the framework it records: `add
theme:pastel` in a Vue install keeps the Vue config, and a `--framework` that differs from the
recorded one is refused. The MCP tools `get_install_plan` and `install` follow the same rule.

## The red rules in a template

The ESLint rules read a `.vue` file's `<script setup>` as they read TSX and its template through
`vue-eslint-parser`. [rules.md](rules.md#in-a-vue-template) lists what each rule reads there.

## The tools in Svelte and Solid

Everything the tools do for Vue they do for Svelte and Solid, parametrised by the framework: the
registry's maps and shells (above), the red rules ([rules.md](rules.md#in-a-svelte-file),
[rules.md](rules.md#in-solid-tsx)), the screen emitter, `polymorph init`, `polymorph add` and the
MCP tools' `framework` argument.

### Emitting a screen for Svelte or Solid

```sh
pnpm emit design/screens/inbox.json src/InboxView.svelte                 # the extension chooses Svelte
pnpm emit design/screens/inbox.json src/InboxView.tsx --framework solid  # TSX is React's otherwise
```

`emitScreen(spec, { framework: 'svelte', registry })` (`packages/spec/src/emit-svelte.ts`) writes
one Svelte 5 component. Its `<script module lang="ts">` holds the header, the imports and the
exported props interface; its `<script lang="ts">` destructures `$props()`; its markup composes
`@polymorph/svelte-ui` members, every prop under its React name. Trimmed from the Relay inbox:

```svelte
<script lang="ts">
let { tickets, summary, onNewTicket, onClearFilters, isEmpty /* … */ }: InboxViewProps = $props()
</script>

{#snippet summarySnippet()
  }<Grid columns={4} gap={6}
    ><Card
      ><Stat label={summary.open.label} value={summary.open.value} /></Card
    ><!-- … --></Grid
  >{/snippet
}{#snippet secondaryActionSnippet()
  }<Button variant="ghost" tone="neutral" label="Clear filters" onClick={onClearFilters}
  />{/snippet
}<ListPage
  title="Inbox"
  empty={isEmpty}
  summary={summarySnippet}
  emptyState={{
    icon: 'search',
    secondaryAction: secondaryActionSnippet,
  }}
  >{#snippet actions()}<Button icon="add" label="New ticket" onClick={onNewTicket} />{/snippet
  }<!-- Rung 2, declared: A queue is scanned rather than read, … --><DensityScope
    value="compact"
    as="section"
    ><DataTable label="Tickets" data={tickets} /></DensityScope
  ></ListPage
>
```

- **A callback is a prop**: `onClick={onNewTicket}`, as a Svelte member takes it.
- **A node-typed prop is a snippet**, `{#snippet actions()}…{/snippet}` inside the member's tags,
  and a string given to one is the snippet's text. `children` is the content between the tags.
- **A snippet declared inside a member's tags is in scope for everything else there.** One whose
  name is an input's (ListPage's `summary` beside the input `summary`) is declared at the top under
  another name and passed as an attribute, so the input stays readable.
- **An element inside a value** (`emptyState.secondaryAction`) is a snippet declared at the top of
  the markup and named in the value.
- **No whitespace stands between two nodes.** Svelte keeps one space for any whitespace between
  siblings, where React drops it, so each line break is written inside a tag, before its `>` or
  `/>`, or inside a block tag's braces. Text and the expressions beside it are written on one line.
- **Text reads back as typed**: a string goes between tags or in a static attribute only when Svelte
  reads it unchanged; anything else is an escaped string literal in braces.
- Prettier formats the two scripts with the target's config; it has no Svelte parser here, so the
  emitter lays out the markup itself, to the config's `printWidth`.

`emitScreen(spec, { framework: 'solid' })` writes the React emitter's TSX for Solid: the members
and the vocabulary's types come from `@polymorph/solid-ui`, and the component reads its inputs as
`props.tickets` instead of destructuring them, because a destructured Solid prop is read once and
does not follow its updates. It needs no registry, because a Solid member's props are the React
member's. `emitCheckedScreen` lints a Svelte screen as a `.svelte` file and a Solid one as Solid TSX
(`verify(…, { framework: 'solid' })`). Validation runs first with the same framework, so a member
the map marks absent stops the emit with its reason.

`packages/spec/src/svelte.test.ts` emits the three Relay screens and checks that each compiles
with Svelte's compiler with no warning and no whitespace between nodes, passes every red rule as a
`.svelte` file and matches its snapshot. `packages/spec/src/solid.test.ts` checks that each
typechecks with TypeScript and Solid's JSX types against `@polymorph/solid-ui`'s source, passes
every red rule as Solid TSX, is formatted the way the repository formats code and matches its
snapshot. `vue.test.ts` holds the React and Vue emissions to their snapshots, so a change made for
another framework that alters either fails there.

### Svelte and Solid apps: `polymorph init --framework svelte|solid`

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-app --framework svelte
node ../polymorph/packages/cli/bin/polymorph.js init my-app --framework solid
```

The same app as the Vue one, from one table of per-framework files (`packages/cli/src/init-app.ts`,
with each framework's values in `init-svelte.ts` and `init-solid.ts`):

| File | Svelte | Solid |
| --- | --- | --- |
| `package.json` | `svelte`, `@polymorph/engine`, `@polymorph/svelte` and `@polymorph/svelte-ui` as aliases of their published names; dev dependencies `@polymorph/rules`, `@sveltejs/vite-plugin-svelte`, `svelte-check`, `svelte-eslint-parser`, `eslint`, `stylelint`, `typescript`, `vite`; `typecheck` runs `svelte-check` | `solid-js`, `@polymorph/engine`, `@polymorph/solid` and `@polymorph/solid-ui` as aliases; dev dependencies `@polymorph/rules`, `vite-plugin-solid`, `eslint`, `stylelint`, `typescript`, `vite`; `typecheck` runs `tsc` |
| `index.html`, the entry | `src/main.ts`: the theme module first, then `mount(App, …)` | `src/main.tsx`: the theme module first, then `render(() => <App />, …)` |
| `tsconfig.json` | includes `.svelte` files | `jsx: preserve`, `jsxImportSource: solid-js` |
| `vite.config.ts` | `svelte()` and the engine's theme plugin | `solid()` and the engine's theme plugin |
| `polymorph.eslint.js` | the rules for `.ts` and `.svelte` files, with `svelte-eslint-parser` reading the markup | the rules for TSX, with the Solid settings and the Solid fix of a raw control |
| `polymorph/system-card.md`, the agent files | the card and the agent files ([harnesses.md](harnesses.md)) for Svelte | for Solid |
| `src/screens/Welcome.*` | `Welcome.svelte`, emitted | `Welcome.tsx`, emitted with `--framework solid` |
| the container | `src/App.svelte`, its state a `$state` | `src/App.tsx`, its state a signal |

The welcome spec is the Vue app's (`Heading`, `Text`, `Button` in a `Stack`). `planInit` checks it
against the framework's map before anything is written, and a member that is absent stops `init`
with its reason. The emit step names its framework when the path does not: a `.tsx` path is
React's unless the step says Solid. `packages/cli/src/frameworks.test.ts` plans both apps against
the real registry, compiles the Svelte container and welcome screen, typechecks the Solid ones,
lints each under the fragment the app gets, writes each whole app with the real emitter, and
checks that a registry with `Heading` absent writes nothing.

### Vendoring Svelte and Solid members

```sh
node ../polymorph/packages/cli/bin/polymorph.js add tabs --framework svelte
```

The plan reads each member's shell for the framework (`frameworks.svelte.shell`,
`frameworks.solid.shell`) and copies the files the member is made of in that framework, as it does
for Vue: its component and the compound parts its index attaches (`Tabs.svelte` and
`TabsContent.svelte`, or `Tabs.tsx` and `TabsContent.tsx`), its fixture (`tabs.states.svelte`,
`tabs.states.tsx`), the members they import, each recipe beside its member with the import rewritten
to it, and the tree's `css-modules.d.ts`. `Icon` ships in `@polymorph/svelte` and
`@polymorph/solid` and is not vendored. The packages are the ones the closure imports at the
framework's own ranges; a Svelte install adds `svelte-eslint-parser` as a dev dependency, because its
generated ESLint config reads `.svelte` files with it. `polymorph.json` records the framework, so
`diff`, `update` and a later `add` plan in it, and the MCP tools `get_install_plan` and `install`
follow the same rule.

## The tools in Angular

Everything the tools do for Vue they do for Angular: the registry's map and shells (above), the red
rules ([rules.md](rules.md#in-an-angular-component)), the screen emitter, `polymorph init`,
`polymorph add` and the MCP tools' `framework` argument. A `.ts` module that is not a declaration
file names Angular (`frameworkOfPath`), so `pnpm emit` and the MCP tool `emit_screen` read the
framework from a `.ts` path.

### Emitting a screen for Angular

```sh
pnpm emit design/screens/inbox.json src/inbox-view.ts         # the extension chooses Angular
pnpm emit design/screens/inbox.json --framework angular       # to stdout
```

`emitScreen(spec, { framework: 'angular', registry })` (`packages/spec/src/emit-angular.ts`)
writes one TypeScript module: the header, the imports, the exported props interface, and a
standalone component whose selector is `app-` and the spec's name in kebab case, whose `imports`
list the members it composes, and whose template is inline. Trimmed from the Relay inbox:

```ts
@Component({
  selector: 'app-inbox-view',
  imports: [Button, Card, DataTable, DensityScope, FilterBar, Grid, ListPage /* … */],
  template: `
    <ng-template #secondaryActionTemplate>
      <pm-button variant="ghost" tone="neutral" label="Clear filters" (click)="onClearFilters()()" />
    </ng-template>
    <pm-list-page
      title="Inbox"
      [empty]="isEmpty()"
      [emptyState]="{ icon: 'search', /* … */ secondaryAction: secondaryActionTemplate }"
    >
      <ng-container ngProjectAs="[slot=actions]">
        <pm-button icon="add" label="New ticket" (click)="onNewTicket()()" />
      </ng-container>
      <!-- Rung 2, declared: A queue is scanned rather than read, … -->
      <pm-density-scope value="compact" as="section">
        <pm-data-table
          label="Tickets"
          [stickyHeader]="true"
          [data]="tickets()"
          (sortChange)="onSortChange()($event)"
        />
      </pm-density-scope>
    </pm-list-page>
  `,
})
export class InboxView {
  readonly tickets = input.required<InboxViewProps['tickets']>()
  readonly onNewTicket = input.required<InboxViewProps['onNewTicket']>()
  // …
}
```

- **Every input is a signal input**, callbacks included, typed by the props interface, and the
  template reads it by calling it: `tickets()`, `summary().open.label`. A callback is an input and
  not an output of the screen, because an output named as a DOM event (`submit`, `change`) would
  also hear the native event that bubbles through the screen's element. A container passes a
  callback as a function that keeps `this` (`[onStart]="start"`, with `start` an arrow function).
- **A member's output calls the callback.** `onFoo` on a member is its output `foo`, and the
  handler calls the input: `(click)="onNewTicket()()"`. It passes `$event` only when both the
  member's callback and the screen's take an argument, because a call with an argument the
  function does not declare fails the template type check. The callback receives what the member
  emits, so its parameter is the type the member's output declares.
- **A node-typed prop is a named slot**: its content is projected through
  `<ng-container ngProjectAs="[slot=actions]">`, and a string given to one is that container's
  text. `children` is the content between the member's tags. A compound part is a component of its
  own (`<pm-settings-row-group>` for `SettingsRow.Group`), and a table's section, row or cell is
  the element the table needs with the part's attribute (`<tr pmTableRow>`).
- **An element inside a value** (`emptyState.secondaryAction`), or a render prop given an element,
  is an `<ng-template>` declared at the top of the template and named in the value. A template
  reference hides an input of the same name, so a template is named apart from every input.
- **A boolean is always bound** (`[stickyHeader]="true"`), because a bare attribute sets an input to
  `''`, and a number or a structure is a bound expression.
- **Text reads back as typed.** A string is written as text or a static attribute only when Angular
  reads it unchanged. Anything else is a string literal in an interpolation or a bound attribute,
  with every quote, `&`, `<`, `>`, brace, `@`, backtick and `$` written as a `\u` escape, which
  Angular's expression lexer reads. Text and the interpolations beside it are written on one line
  with nothing between, because Angular keeps whitespace that sits beside text. Whitespace between
  two elements is removed by Angular's compiler under its default `preserveWhitespaces: false`, so
  elements go one to a line.
- Prettier formats the module with the target's config, the inline template included, and adds no
  whitespace beside text.

`emitCheckedScreen` lints an Angular screen as a component module, its inline template extracted
and read by the Angular template parser (`verify(…, { framework: 'angular' })`). Validation runs
first with the same framework, so ImageEditor, which `design/frameworks/angular.json` marks absent,
stops the emit with its reason.

`packages/spec/src/angular.test.ts` emits the three Relay screens and checks that each compiles
with Angular's compiler (`ngc`, with `strictTemplates`) against `@polymorph/angular-ui`'s source,
passes every red rule as an Angular module, is formatted the way the repository formats code and
matches its snapshot (`__snapshots__/<name>.view.angular.ts.snap`). A table drawn from its parts,
which no Relay screen composes, is held to the same checks, so a section, row or cell written as the
element the table needs, and a part's output (`(click)` on `<tr pmTableRow>`), compile. No Relay
screen passes a render prop, so a render prop given an element is checked by its markup, against a
registry that gives a member one. It also checks that the selectors the emitter writes are the ones the
Angular vocabulary declares.

### An Angular app: `polymorph init --framework angular`

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-app --framework angular
```

The same app as the Vue one, with Angular's values in `packages/cli/src/init-angular.ts`:

| File | Angular |
| --- | --- |
| `package.json` | `@angular/core`, `@angular/common`, `@angular/compiler`, `@angular/platform-browser` at `~22.2.2`, `rxjs`, `tslib`, and `@polymorph/engine`, `@polymorph/angular` and `@polymorph/angular-ui` as aliases of their published names; dev dependencies `@polymorph/rules`, `@analogjs/vite-plugin-angular`, `@angular/build`, `@angular/compiler-cli`, `@angular-eslint/eslint-plugin-template`, `@angular-eslint/template-parser`, `eslint`, `stylelint`, `typescript` at `~6.0.3` (Angular's compiler requires 6.0), `vite`; `typecheck` runs `ngc -p tsconfig.json --noEmit` |
| `index.html`, the entry | `<app-root>` and `src/main.ts`: the theme module first, then `@polymorph/angular-ui/base.css`, then `bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] })` |
| `tsconfig.json` | `angularCompilerOptions.strictTemplates`, `vite/client` types for the stylesheet the entry imports, and an `outDir`, because the build emits through this program |
| `vite.config.ts` | `angular({ tsconfig: './tsconfig.json', jit: false })`, which compiles ahead of time as the Angular CLI does, and the engine's theme plugin |
| `polymorph.eslint.js` | the rules for `.ts` modules, read as Angular, with each component's inline template extracted by `@angular-eslint/eslint-plugin-template` and read, as an `.html` template is, by `@angular-eslint/template-parser` |
| `polymorph/system-card.md`, the agent files | the card and the agent files ([harnesses.md](harnesses.md)) for Angular |
| `src/screens/welcome.ts` | the welcome screen, emitted |
| the container | `src/app.ts`, the `app-root` component: its state a signal, the status line a `computed`, and `onStart` an arrow function |

The welcome spec is the Vue app's. `planInit` checks it against the Angular map before anything is
written, and a member that is absent stops `init` with its reason. `packages/cli/src/angular.test.ts`
plans the app against the real registry, compiles the container, the entry and the emitted welcome
screen with `ngc` against `@polymorph/angular-ui`'s source, lints them under the fragment the app
gets, writes the whole app with the real emitter, and checks that a registry with `Heading` absent
writes nothing.

### Vendoring Angular members

```sh
node ../polymorph/packages/cli/bin/polymorph.js add tabs --framework angular
```

The plan reads each member's Angular shell (`frameworks.angular.shell`) and copies, as it does for
Vue, its component and the compound parts its index exports (`Tabs.ts` and `TabsContent.ts`), its
fixture (`tabs.states.ts`), the members they import, each recipe beside its member with the import
rewritten to it, and the tree's `css-modules.d.ts`. `Icon` ships in `@polymorph/angular` and is not
vendored, and ImageEditor is refused with the map's reason. The install adds
`@angular-eslint/eslint-plugin-template` and `@angular-eslint/template-parser` as dev dependencies,
because its generated ESLint config extracts and reads templates with them. That config leaves the
vendored modules to the packaging rule, and the processor never reads one, so no vendored template
reaches the application rules. `polymorph.json` records `"framework": "angular"`, so `diff`,
`update` and a later `add` plan in it, and the MCP tools `get_install_plan` and `install` follow
the same rule.

Vendoring needs the Vite build that `init --framework angular` writes. A vendored member imports its
recipe as a CSS Module (`import styles from './button.module.css'`), and a theme install's generated
module imports the base layer. Vite compiles both. The Angular CLI compiles no stylesheet a module
imports, so in an Angular CLI app vendored members render with no styles. An Angular CLI app
installs `@polymorph/angular-ui` instead, whose published build compiles each recipe into its
component's `styles`, and lists `@polymorph/angular-ui/base.css` in `angular.json`'s `styles`.

## The tools in elements

The registry's map and shells (above) and every tool that reads the vocabulary take `elements`:
`get_system_card`, `search_components`, `validate` and `get_install_plan`, and their functions in
the registry and the CLI. The tools that write and check an application differ, because an
elements page is HTML with no build.

- **No screen is emitted.** A spec's inputs include callbacks and node renderers (`onRowClick`, a
  column's `cell`), and HTML has no syntax that binds either to a member; a page sets them from a
  script beside its markup. `emitScreen` (`packages/spec`), `pnpm emit --framework elements` or to
  a `.html` path, and the MCP tool `emit_screen` refuse the elements with that reason and write
  nothing. `validateSpec` still checks a spec against the elements map.
- **The red rules do not read HTML.** The rules read TSX, Vue, Svelte and Angular templates, and
  an elements page is none of them. `verify` with `framework: 'elements'` answers a `.html` file
  with a fatal result that says so, and reads a script beside the page as React's would be, with
  no module to import a rewritten `<button>` from. `polymorph check` leaves an elements page unread
  and says so in its notes.
- **A `.html` file is an elements page or an Angular template.** `codeFrameworkOf` reads it as an
  elements page in a project that uses the elements and not Angular, and as an Angular template
  otherwise. A project uses the elements when its `polymorph.json` records them or a
  `package.json` depends on `@polymorph/elements-ui`, because a page with no build has no
  `package.json`. The MCP tools that write accept a project that has a `polymorph.json` and no
  `package.json`.

### A page with no build: `polymorph init --framework elements`

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-site --framework elements
```

`init` copies the files a page loads the elements from into the app's static directory. They are
the elements vocabulary's build output, in the directory the registry names
(`vendor.frameworks.elements.noBuild`), so the checkout must have built them; a checkout that has
not is refused, with the command that builds them (`pnpm build:packages`). No public URL serves the
files, because the packages are published to a restricted registry. `--dir` names the static
directory (`public` by default):

| File | What it is |
| --- | --- |
| `public/polymorph/` | the files, copied: `polymorph.js`, its chunks, `polymorph-all.js`, `polymorph.css`, `prepaint.js` and `themes/<system>.css` |
| `public/polymorph/theme.css` | the theme sheet, compiled by the engine from the system's and its palette's documents |
| `public/index.html` | an example page: `<html data-system data-palette>`, the prepaint script first in `<head>`, the two stylesheets, the module script, and a few members with a `poly-click` listener |
| `polymorph.json` | the install: every copied file with its source and the hash it was written with, the theme sheet as generated, the system and palette, and `"framework": "elements"` |
| `polymorph/system-card.md`, the agent files | the elements card and the agent files `polymorph agents` writes ([harnesses.md](harnesses.md)): the `AGENTS.md` block, the skills and the MCP entries |

It writes no `package.json`, lint config or build, and runs no package manager. The example page
names members the elements map must mark native, and a member that is absent stops `init` with its
reason before anything is written. A system names web fonts, whose stylesheets the page links
itself; without them the page uses the fallback fonts.

### `add`, `update` and `diff` in an elements install

`polymorph add <member>` installs nothing and says why: `polymorph.js` defines every tag at once,
and a page with no build cannot compile a member's source. `polymorph add theme:<system>` and
`palette:<name>` add the pairing to the install and write the theme sheet again, with each system
on its own palette and on every other palette the install has; `<html data-system data-palette>`
chooses the one a page wears. `polymorph update` copies again each file the build changed and the
page's owner did not, writes the theme sheet again, and removes a copied file the build no longer
writes; a file its owner edited is kept and named, and `--force` takes ours. `polymorph diff`
reports each copied file as for any install. The MCP tools `get_install_plan` and `install` do the
same as `add`. `packages/cli/src/elements.test.ts` runs each of these against a fixture build.

## What a Vue member does

The emitter writes against this contract, and a Vue member is generated to it:

- Its props are the React member's, by the same names and types, the four ARIA hooks included.
  A prop changes nothing where the generated member already does what the prop asks.
  Accordion's and Collapsible's `keepMounted` keeps a closed region's content in the document,
  `hidden`, in React, which otherwise leaves it out. A generated member keeps it there in every
  case.
- It emits one event per `onFoo` prop, named `foo` and declared in `emits`, with the React
  callback's parameters (Input's `change` emits the value and the event).
- It has the default slot for `children`, a named slot for each node-typed prop and a scoped slot
  for each render prop, named as the prop is.
- It is declared with `inheritAttrs: false` and binds no `class` or `style` it is given.
- It renders a node passed inside a structured prop (`secondaryAction`) with `<component :is>`.
- A compound part is a property of its owner: `SettingsRow.Group`, `Table.Row`. Its file sits beside
  the member's as `<Member><Part>.vue`, and the vocabulary's entry attaches it.
- `@polymorph/vue-ui` exports every type `@polymorph/react-ui` exports, under the same name
  (`DataTableColumn`, `EmptyStateProps`, `BadgeTone`, `HeadingLevel`, …): a member's own from its
  component, and the foundation's (`IconRole`, `ControlSize`) from `@polymorph/vue`. The few it
  does not export are listed with the reason in `UNEXPORTED_TYPES`
  (`packages/shells/src/common.ts`): React's `assertGoverned` types, DatePicker's and Slider's
  props variants, and ImageEditor's types. The Svelte, Solid, Angular and elements vocabularies do
  the same, and a law in `packages/shells/src/shells.test.ts` holds every one of them to it.
- It sits at `packages/vue-ui/src/<tier>/<Member>.vue` beside `<member>.states.ts`, and imports its
  recipe from `@polymorph/recipes/<tier>/<file>.module.css`.
