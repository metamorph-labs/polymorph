# Behaviour conformance

This page covers the behaviour conformance law: the contract fence a spec writes under its
accessibility and behaviour prose, the grammar of its statements, what the runner checks for
each one, how each framework's shell is run against the same statements, and the ledgers of
deliberate divergences. The same runner holds each spec's agent fence; the agent statements
section below says what it checks for each, and [agents.md](agents.md) covers the fence.

Terms used on this page:

- **Member**: one component in the vocabulary. **Spec**: its design document in
  `design/components/` or `design/archetypes/`.
- **States fixture**: a member's `*.states.tsx`. Its entries are the states the member promises,
  and every statement here starts from one of them.
- **Shell**: one framework's rendering of the vocabulary. The React vocabulary in
  `packages/react-ui` is written by hand; the Vue, Svelte, Solid and Angular vocabularies and the
  elements are generated ([shells.md](shells.md)).
- **Law**: a test that enforces a design claim. [verification.md](verification.md) lists the
  others.

## Why it exists

The React shell gets its behaviour from React Aria and Radix, and the Vue, Svelte, Solid and
Angular shells get theirs from Zag's machines, as the elements do through the Solid members they
render. Two behaviour layers drift in small things: when
focus is restored, which keys do what, how an overlay dismisses, what is announced. A spec's A11y,
Behaviour and Keyboard sections already say what should happen. The contract fence restates the
testable part of that prose in a fixed grammar, and the conformance law runs every statement
against each shell in a real browser.

The runner reads a browser's DOM, so the law covers every web shell, the elements included. The SwiftUI and Compose
members are not run against the contract statements; the laws that hold them are in
[verification.md](verification.md#the-ios-gate) and
[verification.md](verification.md#the-android-gate).

## The contract fence

A contract is a fenced block marked `contract`, at the end of the spec section whose prose it
restates. The prose stays; the fence adds to it. One statement goes on each line:

````md
## A11y

Radix modal semantics: focus trap, initial focus (first tabbable in body, else primary
action, else close), focus return to trigger, …

```contract
role panel dialog when open md
name panel from title when open md
key Enter opens
focus on-open body when with a form
focus on-close trigger
dismiss both
dismiss none when non-dismissible
```
````

A fence sits in a section whose heading names A11y, Behaviour (or Behavior) or Keyboard. A
combined heading, one with ` — ` in it, runs on into the next lines until a blank line
(`## Motion — none. Icons — none. A11y — …`) and counts by its whole text; a plain heading is
only its own line. A fence anywhere else is a fault. Fences are read the way CommonMark reads
them: three or more backticks or tildes open one, the first word of the info string is its
language, and only a run of the same character at least as long closes it. So a ```` ````md ````
block that shows a contract fence, like the one above, is skipped whole.

Every member with keyboard, focus, dismissal or announcement behaviour has a contract: every overlay
(Tabs and Command among them), every control, and Accordion, Alert, AudioPlayer, Carousel, ChatThread,
Collapsible, DataTable, ErrorSummary, JsonTree, LogView, Pagination, Plan, SearchPage, Spinner, Stepper, PromptInput,
SplitPane, Tree and Table, whose rows take a click. `packages/registry/src/registry.test.ts` fails when one of them
has none. A structure or layout member with no behaviour has no fence.

## The grammar

| Statement | Claim |
| --- | --- |
| `role <part> <role>` | the part has that ARIA role, explicit or native |
| `name <part> from <prop>` | the part's accessible name is the value of that prop |
| `name <part> from children` | the part's accessible name is computed from its content |
| `key <Key> <effect> [on <part>]` | with focus on the part, pressing the key has the effect |
| `key <Key> focuses <part>` | with focus on the page outside the member, pressing the key puts focus in the part |
| `click <effect> on <part>` | a pointer click on the part has the effect |
| `focus on-open <part>` | opening the member puts focus in the part |
| `focus on-close trigger` | closing it puts focus back on its trigger |
| `focus on-close previous` | closing it puts focus back where it was before it opened |
| `focus on-close nearest` | closing it, once its trigger has left the page, puts focus on the focusable element nearest where the trigger was |
| `dismiss outside` / `escape` / `both` / `none` | exactly these gestures close it |
| `announces busy` / `live:polite` / `live:assertive` | in the state, the member carries that channel |
| `announces live:polite "<message>"` (or `live:assertive`) | in the state, a region of that channel says the message |
| `attr <part> <attribute>[=<value>]` | in the state, the part carries the attribute |

Any statement may end with `when <state>`, and `announces` and `attr` must. The state is the rest
of the line after the first ` when ` outside the quoted message, because fixture entry names are
sentences.

An `announces` statement without a message is for a region that must exist before its first
message, because a region that mounts with its words already in it announces nothing: CopyButton
renders its status empty at rest. A member whose live region is always there states what the
region says in the state instead, because the bare form would hold in every state:
`announces live:polite "Loading options" when loading`. The message is compared as words the
region contains, so a localized ellipsis or a count after it does not matter.

The closed lists are data in `packages/registry/src/behaviour.ts`:

| List | Values |
| --- | --- |
| Keys | `Enter`, `Space`, `Escape`, `Tab`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `Backspace`, `Delete`, `F8`, `F10` |
| Modifiers | `Shift`, `Control`, `Alt`, `Meta`, written before the key and joined with `+`: `Shift+Tab`, `Alt+ArrowDown` |
| Key effects | `opens`, `closes`, `activates`, `moves-focus-next`, `moves-focus-previous`, `moves-focus-first`, `moves-focus-last`, `selects`, `clears`, `commits`, `increments`, `decrements`, `focuses`, `nothing` |
| Click effects | `activates` |
| Dismissals | `outside`, `escape`, `both`, `none` |
| Announcement channels | `busy`, `live:polite`, `live:assertive` |
| Roles | the WAI-ARIA 1.2 roles |

A part is a lower-case name from the spec's anatomy (`panel`, `trigger`, `option`). An attribute
is a `data-*` or `aria-*` name; `tabindex`, because whether a part is a tab stop is behaviour; or
`autocorrect`, `autocapitalize` or `spellcheck`, because whether a field changes what is typed is
behaviour too.
An attribute value may be quoted, `data-state="open"`; without a value, presence is the claim.

A line that breaks the grammar is a fault with the file and the line. So is a state that names
no entry of the member's states fixture, or whose opening words two entries share; a claim made
twice, however it is spelled (`data-state=open` and `data-state="open"` are one claim); and a
second `dismiss` for one state, because exactly one set of gestures closes a member.
`pnpm registry` fails on any of them, and the registry publishes every member's parsed contract
as its `behaviour`.

## What the runner checks

The runner is `packages/conformance/src/run.ts` (`@polymorph/conformance`), shared by every
shell's law. It runs one statement at a time,
from a fresh mount of one fixture entry.

**The entry.** A statement with `when <state>` starts from the entry with that name, or the one
entry whose name begins with those words and continues past a word boundary: `when open md`
names `open md — the panel itself, at the size it defaults to`. Words that begin two entries'
names name neither, and the statement is a fault until it says enough to name one: Slider's
fixture has two range entries, so `when range` names neither and `when range — two thumbs` names
the first. A statement without a state
starts from the first entry that renders what it needs: the parts it names, a closed member for
`opens` and `focus`, an open one for `closes` and `dismiss`. The registry reads entry names from
the fixture's source, so a state names an entry whose name is a literal, not a template.

**The pointer.** Before every mount the runner moves the real pointer to the bottom-left corner
of the viewport. A pointer press leaves it over the trigger it pressed, and an entry that
rendered a trigger under it would open on hover before the statement ran.

**Opening and closing.** `focus` and `dismiss` statements, and a `closes` key on an entry that
mounts closed, open the member the way its contract does: with its first `opens` key, pressed
on that statement's part (the trigger unless it names another). With no opening key, focusing
the trigger may open the member (a tooltip, a hover card); if it does not, a pointer press on the
trigger does. A `focus on-close` statement closes it with the contract's first `closes` key that
names no part, else Escape. The element focused before the opening key, which
`focus on-close previous` returns to, is the part that key is pressed on: the trigger, unless
the contract's first `opens` key names another part (DatePicker opens from a segment).

**Each statement.**

| Statement | Holds when |
| --- | --- |
| `role` | the first element of the part has the role, as DOM Testing Library computes it |
| `name … from <prop>` | with the prop set to a probe value, the part's accessible name is the probe |
| `name … from children` | the name is not empty, no `aria-label` or `aria-labelledby` replaces it, and the part contains its text |
| `focus on-open` | after opening, focus is inside the part |
| `focus on-close trigger` | after closing, focus is inside the trigger |
| `focus on-close previous` | after closing, focus is on the element focused before the opening key |
| `focus on-close nearest` | the runner puts a Button of its own just after the trigger (the part the member opens from), opens the member, takes the trigger alone out of the document, and closes the member; focus is then on its Button, the first focusable element after where the trigger was. The member stays in the page, so its own close path runs. The trigger goes back before the statement ends |
| `dismiss` | from the open member, Escape closes it exactly when the statement says, and so does a press outside the member |
| `announces busy` | an element of the member carries `aria-busy="true"` |
| `announces live:polite` | an element of the member carries `aria-live="polite"`, or `role="status"` or `role="log"` without `aria-live` |
| `announces live:assertive` | an element of the member carries `aria-live="assertive"`, or `role="alert"` without it |
| `announces … "<message>"` | one of those elements contains the message's words |
| `attr` | the first element of the part carries the attribute, with the value when one is given |

The elements of the member are the element the entry rendered into, every element carrying the
member's `data-member`, the panel, and everything inside them. A region anywhere else on the
page says nothing about this member: React Aria's page-wide announcer keeps every member's
messages, and another member's status is that member's. A region inside a `hidden` or
`aria-hidden="true"` subtree is not counted either, because it announces nothing.

A press outside is dispatched on whatever is under a corner of the viewport that the member does
not cover: not the panel, the trigger, the element the entry rendered into, or an element
carrying the member's `data-member`. It is dispatched rather than performed, because a modal's
scrim covers the page and a real click would land on the panel. The runner supplies what a
dispatched press lacks: it first moves the real pointer to that corner, and after a `mousedown`
nobody prevented it moves focus as a real press does, to the focusable element under the corner,
or out of the member when there is none. A member held open by the pointer over its trigger, or by
focus on it, is judged on the press a reader makes.

**Keys.** The runner focuses the `on` part (its first enabled element; its last for a move
backwards), presses the key, and waits for the effect. When focus does not land in the part (it
takes no focus and holds nothing that does), the statement fails, because the key would go to the
page. The same holds for the part a member is opened from.

| Effect | Holds when |
| --- | --- |
| `opens` / `closes` | the panel appears or goes. A member with no panel part opens and closes the focused control's `aria-expanded` |
| `activates` | one of the member's handlers runs, or the focused element's checked, pressed, selected, expanded, `data-state` or `data-selected` attribute changes, or a click reaches it. On a native `<button>` a click reaching it does not count, because the browser makes one of Enter and Space whatever the handler does; a click the member passes on to another of its elements (FileUpload's file picker) does |
| `moves-focus-next` / `-previous` | the current item becomes the next or previous of its set, wrapping at the ends |
| `moves-focus-first` / `-last` | the current item becomes the first or last of its set |
| `selects` | the item current after the key is selected (`aria-selected`, `aria-checked` or `aria-pressed` true, an `aria-current`, or a checked, active or on `data-state`), and was not before |
| `commits` | in a field, the text it held before the key is gone from it (taken, not kept with a newline added); with no field focused, what the trigger shows changes |
| `clears` | the focused field had text and becomes empty, and the panel stays open or closed as it was, unless the contract says the same key `closes` from the same part in the same state |
| `increments` / `decrements` | the current element's `aria-valuenow`, or its field's number, rises or falls |
| `nothing` | after a beat, none of the member's handlers has run, and focus, the current item, the panel, the field's text, the current item's state and the number of chosen items are all as they were |
| `focuses` | the runner puts focus on a Button of its own outside the member and presses the key there; focus is then in the named part (Toast's F8). The Button is removed when the statement ends |

The current item is the focused element, or the element its `aria-activedescendant` names. Its
set is the enabled items of its role inside the nearest composite (`tablist`, `menu`, `listbox`,
`radiogroup`, `grid`, `tree`, `toolbar`), or inside the member. In a grid the set is the cells.
A field with virtual focus moves through the list it controls. `Tab` and `Shift+Tab` move
through the member's tab stops, whatever their roles. Under virtual focus the runner cannot put
focus on an item, so a move backwards that starts on the first item takes one step in first, with
the contract's own next key. Before `commits` or `clears`, the runner types a draft into an empty
field.

**Clicks.** The runner mounts the entry with a spy in each handler, presses the real pointer on
the `on` part's first enabled element, and waits for the effect. `activates` holds when one of
the member's handlers runs, or the part's checked, pressed, selected, expanded, `data-state` or
`data-selected` attribute changes. A click always reaches the element it presses, so that is no
evidence. DataTable's row shows its click through the `onRowClick` spy; Table's row, whose
`onClick` the entry sets and no spy reaches, through the entry: a click selects the row.

**Handlers.** `HANDLERS` in `parts.ts` names, per member, the handler props it calls when a key or a
click takes effect: Button's `onClick`, PromptInput's `onSubmit`, Pagination's `onPageChange`,
DataTable's `onRowClick`. For `activates` and `nothing` the runner mounts the entry with a spy in
each, through the adapter's `overrides`. A `nothing` statement fails when the key calls a spy, so
a guard that lets the handler run cannot pass on an unchanged screen, and `activates` on a native
button holds when the key or the click calls one. Only the calls after the key or the click count:
a handler a member calls while it mounts is not the key's effect. A member is listed when a
`nothing` statement guards a handler or its activation has nothing else to show, and the law checks
that each listed handler is a prop its spec's API declares, in a props table row or a type in its
fences.

## The agent statements

A spec's agent fence (`## Agent`, [agents.md](agents.md)) is run by the same runner, through the
same adapters, harness, `PARTS` table and state resolution, in `packages/conformance/src/agent.ts`.
`conform` takes an agent statement as it takes a contract statement, and `agentConformanceLaw` in
`@polymorph/conformance/law` holds every fence a shell ships: `conformanceLaw` calls it for a
generated shell, and the React law calls it beside its contract statements.

Each statement starts from a fresh mount of one states fixture entry, with an agent bridge from
`@polymorph/engine/agent` installed. The member under test is the registered handle whose element
is inside the element the entry rendered into, or, for an overlay whose element is portalled out
of it, the handle of that member's name the mount registered. The runner learns each element
through the bridge's policy, which it hands every member's element and hides none. A statement
starts from an entry in which the bridge lists the member, so an overlay whose element is its
panel starts from an open entry. A statement with `when <state>` starts from that entry; one
without starts from the first entry that can run it. The check of an undeclared action and the
`destructive` statements, which the grammar gives no entry, try the entries the fence's `when`
clauses name before the rest. A mount waits `REGISTER_BUDGET` (three seconds) for the member to
register. The runner records, for each shell's adapter, every entry on which a mount registered
nothing, with the props it set on the member, and a later search for an entry passes over it, so
such an entry costs the wait once per member, shell and set of props. An entry a `when` names is
mounted whatever the record says, and before a search fails for want of an entry it mounts each
entry it passed over. An entry `WINDOW_SIZES` in `parts.ts` lists
is mounted at the window size it gives, through the harness's `viewport`, and the window gets its
own size back when the statement ends, whether it held or not. An action that exists only below a
breakpoint is pinned to such an entry (AppShell's `open` and `close`). The runner waits with the
harness's `waitFor` and with timers. After it mounts an entry at another window size it lets two
animation frames pass, each ended by a timer when no frame comes, because an entry's `presses`
acts on its first frame.

| Statement | Holds when |
| --- | --- |
| `state` | the snapshot lists the member with the state, and the value is of the declared type (an `id` names one of the member's choices, or is `null`; a `number` is `null` while the member holds none) |
| `state … as <part> <evidence>` | the part shows the value the snapshot reports, read at the mount and again after each action the fence says `sets` it. An action that removes the member's element unlists it (a Dialog's close), and the part then shows what the step's `changed` reports; with `present`, the member is unlisted only while the part is absent |
| `state … secret` | the snapshot holds `{ secret: true }`; after the runner types a probe into the member's field (the evidence's part, else its `field` part), the probe is in no snapshot, no query for it, and no result or change event of any action the member allows |
| `action` | the snapshot lists the action with the fence's argument type and its `among`; with a probe value it reports success and emits exactly one change event with `source: 'agent'`, to the bridge's subscribers and as `polymorph:agentchange` on the member's element (or the document, once the element has left it) |
| `action … sets <state>` | the state holds the new value (the probe, for an action with an argument), the result's `changed` names it, and its evidence agrees. After a step that unlists the member, the new value is read from the step's result, not from a later snapshot |
| `action … calls <handler>` | a spy in the handler ran: a prop the adapter's `overrides` set, or an entry's handler that `CHOICE_PROBES` gives the member. A handler no prop reaches, a field of a toast store record, is counted when the fixture reports it during the step: it dispatches `polymorph:fixturecall` (`FIXTURE_CALL_EVENT`) on `document` with the handler's name as the `detail`. Only such a handler is reported; Toast's pinned notices report their `onDismiss` and their action's `onClick` |
| `action … presses <part>` | the step's click reached one element of the part, and for an action that takes an id, that element's accessible name begins with the label of the choice the probe names |
| `action <id or ids>` | before the probe runs, a disabled choice is refused with `invalid-value` and nothing changes |
| `action <id or ids> among <state>` | the probe is a choice of that state; before it runs, a choice of another `choices` state whose id that state does not hold is refused with `invalid-value` and nothing changes |
| `destructive when <prop>=<value>` | on an entry with the prop set through `overrides`, each action is marked for a person; with no `confirm` it returns `needs-confirmation`, with a `confirm` that answers no it returns `declined`, and in both nothing changes and no spy runs; with one that answers yes it runs and calls its handler |
| `destructive option when <field>=<value>` | the same, for each action that takes an id, naming an enabled choice the member marks destructive; and the action runs with no one to ask when it names a choice that is not marked |
| `destructive never` | on an entry with `tone` set to `danger`, no action is marked for a person, and each runs with no one to ask |
| `withholds contents` | on an entry where a registered member's element is inside the member's region (its handle's `withholds` element, else its own element), the snapshot lists the member and none of those inside, no query finds one, a step on one by its id returns `unknown-member`, and a step by a target that names one never reaches it. The registrations are read with `agentRegistrations` from `@polymorph/engine/testing`, because the bridge reports no withheld member |

The probe for an argument: the opposite of the current value for `boolean`, a fixed text for
`text`, the current value plus one for `number`, an enabled choice other than the current one
for `id`, and two enabled choices for `ids`, of the state the action chooses among when it names
one. A choice marked destructive is passed over, except by `destructive option when`.

The law also checks each member with a fence as a whole:

- every part an evidence names or an action presses has a locator in `PARTS` that does not find
  it by the attribute the evidence reads, and a secret state with no evidence has a `field` part;
- an action the fence does not declare is refused with `not-allowed`, and the snapshot's actions
  and the refusal's `allowed` list are the fence's actions;
- on its `disabled` fixture entry (the entry named `disabled`, else the first whose name begins
  with it), the member's `disabled` state is true, it lists no action, and a step returns
  `disabled` and changes nothing;
- a `CHOICE_PROBES` entry is kept only for a member whose fence calls an entry's handler;
- a `WINDOW_SIZES` row names a member, an entry of the shell's fixture for it, and an entry a
  statement of the member's fence names with `when`.

`FALSE_STATEMENTS` holds one false agent statement of every kind beside the contract ones: a
state of the wrong type, evidence that does not agree, an action that sets a state it does not
change, an action that calls a handler it does not call, an action that calls a handler the
fixture reports for another action only (Toast's `dismiss` and the action's `onClick`), an action
that presses a part it does not press, an action that chooses among another list than its
member's (LineChart's `choose` among the legend's `series`), a `destructive when` on a prop that does
not make the member destructive, a `destructive option when` on a member with no destructive
choice, a `destructive never` on a member whose danger tone is destructive, a state whose
`present` evidence stays when the member is unlisted (Dialog's open state read off its trigger,
which stays when the panel closes), and a `withholds contents` on Dialog, whose footer Buttons are
the application's and are listed. Each must fail
with its reason through every shell's adapter.

```sh
pnpm exec vitest run src/conformance.test -t "agent"                                    # every shell
pnpm exec vitest run src/conformance.test -t "agent conformance — the .* shell Select "  # one member
pnpm exec vitest run --project ui src/conformance.test.tsx -t "agent"                   # the React shell
```

## Writing a statement

1. Read the section's prose. Write a statement for each testable sentence, and nothing the prose
   does not say. When the member handles a key the prose is silent on, add the sentence to the
   prose too.
2. Name parts as the anatomy names them. A part the member's locator table lacks gets a selector
   in `packages/conformance/src/parts.ts`.
3. Name a state by the opening words of a fixture entry, enough of them that no other entry's
   name begins with the same words. When no entry renders the state, the statement cannot be
   run; add the entry to the fixture, which is where the spec's States table says it belongs.
4. Run the law for the member:

   ```sh
   pnpm exec vitest run --project ui src/conformance.test.tsx -t "<Member>"
   ```

5. A statement that fails is a finding. Fix the member, or fix the spec when the member is right.
   The ledger is for the third case only.

## Parts

`parts.ts` maps each member's part names to CSS selectors. A selector reads what a shell renders
by contract rather than by substrate: element names, ARIA roles and attributes, `data-member`, the
`data-*` attributes the recipe keys on, and the hooks a member renders for its parts: Dialog's
`data-dialog-part`, a date field's `data-segment`, and `data-<member>-part` on the parts the
runner could otherwise find only through a substrate's nesting or through the attribute it is
checking (`data-tabs-part`, `data-accordion-part`, `data-calendar-part`, `data-menu-part`,
`data-carousel-part`, `data-image-editor-part`, `data-image-part`, `data-split-pane-part`,
`data-chat-thread-part`, `data-log-view-part`, `data-toast-part`, `data-tour-part`,
`data-search-page-part`, `data-rich-text-input-part`). Another shell is located by the same table, so it
renders the same hooks. A selector that starts with `:scope` searches only the element the entry
rendered into, which is how a trigger is told from the same control in a portalled panel. Any
other selector searches the document, because overlays portal out of the mount. `root` needs no
entry: it is the element that carries the member's `data-member`. An `input` selector skips
`type="hidden"`, which carries a form value and is not a control.

Two part names have a meaning to the runner. `trigger` is the control that opens a popup, and
`panel` is the popup. A selector that matched by role would make a `role` statement about that
part true by construction, and one that matched by an attribute would do the same for an `attr`
statement about it. So a part with a `role` statement is not located by `[role`, a part with an
`attr` statement is not located by that attribute, and the law fails on a selector that is.

Some selectors still read the member's composition rather than a hook, because the part is a
vocabulary member (a Button takes no hook) or a substrate element that takes no prop:

| Member | Part | Selector reads |
| --- | --- | --- |
| Combobox, MultiSelect | `panel`, `list` | the element with the member's `data-member` that holds no input |
| Dialog, ConfirmDialog | `primary`, `cancel`, `confirm` | the footer's first or last Button |
| SplitButton | `primary`, `trigger` | the first and last Button of the pair |
| Carousel | `slide`, `viewport`, `next` | the viewport as the first child, its slides, the last control Button |
| Pagination | `current`, `page` | the one soft Button, and the ghost Buttons that carry a number |
| Stepper | `current`, `done` | the step children of the root |
| Toast | `viewport` | the region Radix wraps around the list, as the element that holds `data-toast-part="list"` |
| Collapsible, FileUpload, SegmentedControl | `trigger`, `dropzone`, `segment` | a button that is a child of the root |
| Alert | `dismiss` | the icon-only Button in the Alert |

## Each framework's shell

The runner imports nothing but the DOM. A shell reaches it through two objects:

- **A mount adapter**, `{ mount(member, { state, overrides }) }`, which renders the member's
  states fixture entry with that name and returns `{ root, unmount() }`. `overrides` sets props on
  the member inside the entry, over the fixture's own: a probe string for `name … from <prop>`,
  or a spy function in each handler prop for `activates` and `nothing`. The React adapter is
  `packages/react-ui/src/conformance/react.tsx`. It finds the member's element in the tree the
  entry returns and clones it with the overrides, and it says so when an entry builds the member
  inside a component of its own, where the element cannot be reached.
- **A harness**: `keyboard(keys)` in user-event's syntax, `click(element)`, `hover(element)` (the
  real pointer, moved over an element whatever covers it), `roleOf(element)` and `nameOf(element)`
  from DOM Testing Library, and `waitFor(check, timeout)`. Every law uses the one in
  `@polymorph/conformance/harness`, so no two shells are judged by two readings of the DOM.

A shell for another framework lives in this repository, beside `packages/react-ui`, so its law
runs in `pnpm gate` against the same specs. It brings its own states fixtures, with the same entry
names, and its own adapter. Its law reads the contracts with `readContract` from
`@polymorph/registry/behaviour` (or from the registry's `behaviour` field), resolves each state
with `resolveState`, and calls `conform(subject, statement, adapter, harness)` for every
statement, with the same `PARTS` and `HANDLERS`. `packages/react-ui/src/conformance.test.tsx` is
the React shell's law. A generated shell's law is one call: `conformanceLaw` from
`@polymorph/conformance/law`, given the shell's name, its adapter, its galleries, its ledger and the
specs. `packages/vue-ui/src/conformance.test.ts`, `packages/svelte-ui/src/conformance.test.ts`,
`packages/solid-ui/src/conformance.test.ts` and `packages/angular-ui/src/conformance.test.ts` make
it, each with its adapter in `src/conformance/<framework>.ts`, which mounts a generated fixture
entry with the overrides spread over its member's props ([shells.md](shells.md)).
`packages/elements-ui/src/conformance.test.ts` makes it for the elements. Their adapter
(`src/conformance/elements.ts`) mounts an entry's markup, as a page writes it, and reaches the
entry's subject, the first element of the member's tag: a probe string through the element's
property for the prop, and a spy in a handler prop as a listener for the event of its name
(`onClick` is `poly-click`). The runner reads the document the elements render, their hosts
included, and a part's locator that names the footer's last Button also finds a Button a page
wrote there, inside its element (`packages/conformance/src/parts.ts`). Every law
carries the same suite of false statements (`FALSE_STATEMENTS` in `@polymorph/conformance/law`),
one of every kind, both focus moments and every key and click effect, each of which must fail with
its reason, so an adapter whose spied handler never fires cannot pass a `nothing` statement.

## The ledger

Each shell keeps a ledger of the statements it deliberately does not meet:
`packages/react-ui/src/conformance/ledger.ts` for React, and `src/conformance/ledger.ts` in
`packages/vue-ui`, `packages/svelte-ui`, `packages/solid-ui` and `packages/angular-ui` for the
generated shells. Each entry names the member, the statement exactly as the fence writes it, the
reason, and `fails`: words of the runner's reason for the failure. An entry belongs there only
when the substrate behaves differently from the spec for a reason that can be stated and the spec
keeps its claim. When the shell is right and the spec is wrong, the spec changes instead, and when
the shell is wrong and can be fixed, it is fixed.

The law runs every ledger entry too. An entry whose statement holds is stale and fails the
law, so a divergence that has been fixed cannot stay declared. An entry whose statement fails for
a reason that does not contain its `fails` words fails the law as well, because an entry excuses
one divergence, not every way the statement could break. A `dismiss` failure names each wrong
gesture, joined by `; `, so its reason must be that one gesture alone: an entry for the press
outside does not also excuse Escape.

The React ledger holds no entry.

The Vue, Svelte, Solid and Angular ledgers each hold the one entry every shell built on Zag's
machines shares (`ZAG_LEDGER` in `@polymorph/conformance`). The elements' ledger is the same
entries, for the members the elements ship, because the elements render the Solid members. Tooltip's
`dismiss both when long content` is met for Escape and not for a press outside: Zag closes a
tooltip when the pointer leaves its trigger or focus leaves it, and keeps no outside-press
listener. A tooltip a reader opens is held by one of the two, and the runner's press moves both.
The entry opens its tooltip with `defaultOpen`, which holds neither, so a press outside leaves it
open, where Radix closes it.

## Where it is checked

| File | What it checks |
| --- | --- |
| `packages/registry/src/behaviour.ts` | the grammar, the parser, the state resolution and the registry shape |
| `packages/registry/src/behaviour.test.ts` | every spec's contract parses; the grammar rejects what it does not define, with the rule and the line |
| `packages/registry/src/registry.test.ts` | the registry carries each member's contract, read from the spec the law reads; every overlay and control has one, and so does every other member that takes keys or focus, dismisses or announces |
| `packages/react-ui/src/conformance.test.tsx` | every statement holds against the React shell; every state resolves to one entry and every part has a locator that does not assume the statement; every listed handler is declared in its spec's API; every ledger entry still diverges, for its declared reason; and the runner fails a false statement of every kind and every key and click effect |
| `packages/conformance/src/law.ts` | the law a generated shell calls: every contract parses; every statement of every member the shell ships holds against it; every state resolves to one of its fixture entries; every entry of its ledger still diverges, for its declared reason; and the runner fails a false statement of every kind and every key and click effect through its adapter. Its `agentConformanceLaw` holds the agent fences the same way, for the React shell and the generated ones, and it runs `focusAfterRemovalLaw` too |
| `packages/conformance/src/focus-after-removal.ts` | where focus goes when an Alert, a Banner or an ArtifactPane that holds it leaves the page: each member's fixture entry is mounted through the shell's adapter, focus is put on its close control, and the adapter unmounts the entry, as an application's state change does; focus is then on the element after it. The application removes these members, so no contract statement can say it. `conformanceLaw` calls it, and the React law calls it beside its contract statements |
| `packages/conformance/src/agent.ts` | the agent statements: what the runner checks for a `state`, an `action`, each `destructive` statement, an undeclared action and a disabled entry |
| `packages/registry/src/agent.test.ts`, `agent-staleness.test.ts` | every spec's agent fence parses, and the grammar rejects what it does not define; each React member and description registers what its fence declares ([agents.md](agents.md)) |
| `packages/{vue,svelte,solid,angular}-ui/src/conformance.test.ts` | the law above, for the Vue, Svelte, Solid and Angular shells |
| `packages/elements-ui/src/conformance.test.ts` | the law above, for the elements, through an adapter that mounts each entry's markup |
| `packages/react-ui/src/conformance-runner.test.ts` | the runner itself, through an adapter that renders plain DOM: a key on a part that takes no focus fails; only the calls a key or a click makes count; a region in a hidden subtree is not heard; and a press outside moves the pointer and focus as a reader's does |

```sh
pnpm exec vitest run packages/registry/src/behaviour.test.ts            # the grammar
pnpm exec vitest run --project ui src/conformance.test.tsx              # the law, every member
pnpm exec vitest run --project ui src/conformance.test.tsx -t "Dialog"  # one member
pnpm exec vitest run src/conformance.test -t "agent"                    # the agent fences, every shell
```

## What it does not check

- **Pointer gestures other than a click.** A right-click, a long press, a drag or a hover is not
  a statement. The name tip an icon-only Button shows after the pointer rests on it, and on
  keyboard focus, is held by `nameTipLaw` (`packages/conformance/src/name-tip.ts`), which every
  shell's `controls/name-tip.test` calls with its adapter: the delay, keyboard focus, none on a
  labelled Button, only the Tooltip inside one, the members that draw Button's icon-only box, the
  tip over a modal Dialog, and WCAG 1.4.13's four statements: not announced twice, dismissed by
  Escape with the Dialog left open, hoverable and persistent.
  ContextMenu's contract covers its paired visible control, which is its keyboard path, and the
  member's own tests cover the right-click.
- **Typeahead and focus traps.** They are not in the grammar. The overlay tests cover the trap
  (`packages/react-ui/src/overlays/dialog.test.tsx` tabs through it).
- **Scroll positions.** No statement says where a scrolling part rests. A Tabs strip wider than
  its container is held by `tabsOverflowLaw` (`packages/conformance/src/tabs-overflow.ts`), which
  each generated shell's `tabs.test` calls with its adapter, and by
  `packages/react-ui/src/overlays/tabs.test.tsx` for the React shell. Where a LogView rests as
  lines arrive and after the reader scrolls, what each line says, whether a long line wraps,
  and how long a line takes to arrive in a log of five thousand are held by `logViewLaw`
  (`packages/conformance/src/log-view.ts`), which every shell's `log-view.test` calls with a
  mount of its own, and the React member's test too. Which section a
  TableOfContents marks as the page scrolls, at the page's end and after a click, and where a
  click puts focus, are held by `tableOfContentsLaw`
  (`packages/conformance/src/table-of-contents.ts`), which every shell's `table-of-contents.test`
  calls with a mount of its own. Where a DetailPage's aside with `stickyAside` is drawn as the
  page scrolls, in a window shorter than the aside and at the width where the page stacks its
  columns, is held by `detailPageAsideLaw` (`packages/conformance/src/detail-page-aside.ts`),
  which every shell's `detail-page.test` calls with its adapter, and the React member's test too.
- **Several instances of one member at once.** A statement mounts one fixture entry and reads
  one member. Where focus goes when a toast that holds it leaves a stack of several, by its
  close control, its action, Escape, its owner's removal or a newer toast's eviction; that
  Escape outside the notifications reaches no toast, and an Escape something else handled or an
  input method is handling dismisses none; what the live regions say as toasts are raised,
  updated and leave; that a toast raised under the id of a card that is still leaving is a card
  of its own; and that the timers wait while the window is in the background and run
  again when focus falls out of the notifications with no `focusout`, are held by
  `toastFocusLaw` (`packages/conformance/src/toast-focus.ts`), which every shell's `toast.test`
  calls with a mount of its own, the React shell's too.
- **A prop the application changes after the mount.** A statement starts from a states fixture
  entry, and the runner sets props only as it mounts. Where focus goes when the app holds a
  Pagination or a CursorPagination whose button has focus, and when that hold ends, is held by
  `pagerHoldLaw` (`packages/conformance/src/pager-hold.ts`), which every shell's
  `pagination.test` and `cursor-pagination.test` call with a mount of their own. The law runs
  once on a pager without addresses and once on one with them, whose controls are links while
  they can be followed, so a press or a hold draws a control again as a new element. The React
  shell calls it from `packages/react-ui/src/structure/assemblies.test.tsx` and
  `cursor-pagination.test.tsx`. A Tree's level arrives after the mount too. Its tab stop as rows
  are replaced, who holds its open branches, and where focus is when a level or more of one
  arrives are held by `treeLaw` (`packages/conformance/src/tree.ts`), with the whole arrow-key
  model, which every shell's `tree.test` calls with a mount of its own. PromptInput's list
  follows what a reader types and the options the app loads for it: where a trigger opens, the
  filter, a pick's text and the query the app hears are held by `promptTriggersLaw`
  (`packages/conformance/src/prompt-triggers.ts`), which every shell's `prompt-input.test`
  calls with a mount of its own. RichTextInput's editor holds a document that real input
  changes: what the field draws and reports, a format from a key and from its control with the
  words that announce it, the link form, the text style Menu, a pick from the suggestion list,
  the selection bar at selected words, the handle its slots receive and a submit are held by
  `richTextInputLaw` (`packages/conformance/src/rich-text-input.ts`), which every shell's
  `rich-text-input.test` calls with its adapter, and the React member's test too.
  RichTextContent draws a document as other members: the member each node is drawn as, the
  levels and numbers, the app's entity where it draws one and the token where it does not,
  highlights nested as the editor nests them, a press and Enter on a highlight, and the selection
  bar at selected words with the positions it maps them by are held by `richTextContentLaw`
  (`packages/conformance/src/rich-text-content.ts`), which every shell's
  `rich-text-content.test` calls with its adapter, and the React member's test too. A Plan's steps
  change while its run goes on. Which step its
  status line names, and that the line changes only when the front of the run does, are held by
  `planLaw` (`packages/conformance/src/plan.ts`), which every shell's `plan.test` calls with a
  mount of its own. A TreeSelect's popup
  holds a Tree, and `treeSelectLaw` (`packages/conformance/src/tree-select.ts`) runs `treeLaw` on
  it and holds what a choice, the empty choice and a level that arrives while the popup is open
  do there, which every shell's `tree-select.test` calls with a mount of its own. An InlineEdit's save
  that waits is held by the app too. What its field does while the save is in flight, where
  focus goes when the save fails or the app closes the field, and the row's height in both
  forms are held by `inlineEditLaw` (`packages/conformance/src/inline-edit.ts`), with what
  Enter, Escape and leaving the field do, which every shell's `inline-edit.test` calls with a
  mount of its own. An InlineEdit in a page's `titleEdit` sits beside the page's `<h1>`. That the
  page keeps one `<h1>` named by the saved title while the field is open, with no control inside
  it, that the header keeps its height and the actions their place, and that a title given alone
  draws no title row are held by `pageTitleLaw` (`packages/conformance/src/page-title.ts`), which
  every shell's `page-header.test` calls with a mount of its own. A SearchPage's `empty` and
  `pending` change as its query runs. That Enter in its field calls `onSubmit` once and the
  browser stays on the page, that its landmark is a form
  exactly when it has `onSubmit`, that focus stays in the field as the results give way to the
  empty state and back, that `pending` marks only the results and keeps them, and that no state
  holds a live region of its own are held by `searchPageLaw`
  (`packages/conformance/src/search-page.ts`), which every shell's `search-page.test` calls with
  a mount of its own, and the React member's test too.
- **Where a part is drawn.** A statement reads attributes, names and handlers, and not a box.
  Where a toast is drawn while a finger drags it and after the finger lets go is held by
  `toastSwipeLaw` (`packages/conformance/src/toast-swipe.ts`), which each generated shell's
  `toast.test` calls with a mount of its own, and by
  `packages/react-ui/src/overlays/toast.test.tsx` for the React shell. Where AppShell draws its
  navigation on top, and the drawer it becomes below the breakpoint, is held by
  `appShellTopLaw` (`packages/conformance/src/app-shell-top.ts`), which every shell's
  `app-shell.test` calls with its adapter, the React shell from
  `packages/react-ui/src/archetypes/archetypes.test.tsx`. Where a CommentThread
  draws a reply and a reply to a reply, in both writing directions and in a box narrower than a
  phone, how many comments each of its lists holds, and each comment's name are held by
  `commentThreadLaw` (`packages/conformance/src/comment-thread.ts`), which every shell's
  `comment-thread.test` calls with its adapter. How far a Progress
  ring's arc runs, the box it fills at each size, and that a right-to-left page fills the bar
  from the right and does not turn the ring are held by `progressRingLaw`
  (`packages/conformance/src/progress-ring.ts`), which every shell's `progress.test` calls with
  a mount of its own. Which picture a Lightbox
  shows after a key or a press, where focus is when its previous or next Button is disabled at an
  end, and how its picture fits inside the window are held by `lightboxLaw`
  (`packages/conformance/src/lightbox.ts`), which every shell's `lightbox.test` calls with a mount
  of its own.
  That a Dialog's panel stays inside a window shorter than its content, at phone and desktop
  width and in both presentations, with its title and footer inside the panel and its body the
  part that scrolls, is held by `dialogFitLaw` (`packages/conformance/src/dialog-fit.ts`), which
  every shell's `dialog.test` calls with a mount of its own, and the React member's test too.
  How a Rating draws a filled, an empty and a part-filled mark, what a press on the chosen mark
  does, where its arrows stop and which way they move in a right-to-left document are held by
  `ratingLaw` (`packages/conformance/src/rating.ts`), which every shell's `rating.test` calls
  with a mount of its own. Where a Tour's panel and
  its cut-out are drawn beside a target, centred without one, and inside the window at phone
  width, with where focus goes when a step opens and when the tour ends, is held by `tourLaw`
  (`packages/conformance/src/tour.ts`), which every shell's `tour.test` calls with a mount of its
  own, and the React member's test too. Where a BarChart's
  `lines` sit against its bars, its one set of gridlines, the names a screen reader hears for a
  line and the keyboard walk from the bars onto the lines are held by `barLinesLaw`
  (`packages/conformance/src/bar-lines.ts`), which every shell's `bar-chart.test` calls with a
  mount of its own.
  A FunnelChart's bar lengths against its values, the words drawn beside its bars, its keys,
  its pointer and its direction are held by `funnelChartLaw`
  (`packages/conformance/src/funnel-chart.ts`), which every shell's `funnel-chart.test` calls
  with a mount of its own. A Treemap's tiles covering its plot with areas proportional to their
  values, its label plates, its keys, its pointer and its direction are held by `treemapLaw`
  (`packages/conformance/src/treemap.ts`), which every shell's `treemap.test` calls the same way.
  That no part of a chart is drawn past the inline edges of its box, for every states fixture
  entry at a wide and a phone width and in both directions, is held by `chartBoxLaw`
  (`packages/conformance/src/chart-box.ts`), which each shell's tests of the chart members call
  with the shell's adapter (`docs/charts.md` lists them).
  Which arrangement a MasterDetailPage draws at a width, and where focus goes when its detail
  comes or goes or the page crosses its breakpoint, are held by `masterDetailLaw`
  (`packages/conformance/src/master-detail.ts`), which every shell's `master-detail-page.test`
  calls with a mount of its own, and the React member's test too.
- **The value a field reports.** A statement reads a part's state, and not what a handler
  receives. What a PhoneInput reports after typing, a commit, a country chosen and a paste, the
  country a shared calling code takes, what a controlled value draws and the E.164 limit are
  held by `phoneInputLaw` (`packages/conformance/src/phone-input.ts`), which every shell's
  `phone-input.test` calls with a mount of its own.
- **The text a member reads out.** A statement reads a part's name, and not the text of a
  member that is no control. What a Diff says for each kind of change, the rows its line form
  draws, and where focus is when a collapsed run opens are held by `diffLaw`
  (`packages/conformance/src/diff.ts`), which every shell's `diff.test` calls with a mount of
  its own. Which characters a Highlight marks, and that its text is read once with no mark
  announced, are held by `highlightLaw` (`packages/conformance/src/highlight.ts`), which every
  shell's `highlight.test` calls the same way.
- **The document outside the member.** A statement reads the member's own parts. What a
  ModeSwitch's press does to the document's mode, and how it follows a mode another caller sets,
  another ModeSwitch and the operating system's mode under `system`, are held by `modeSwitchLaw`
  (`packages/conformance/src/mode-switch.ts`), which every shell's `mode-switch.test` calls with
  a mount of its own.
- **What a media element does.** A statement reads the document, and not a media element's
  own state. What an AudioPlayer does with a real recording, its press, its end, one player
  pausing another, a seek and a failure, is held by `audioPlayerLaw`
  (`packages/conformance/src/audio-player.ts`), which every shell's `audio-player.test` calls
  with a mount of its own.
- **Which handler a press calls.** `activates` holds when any handler runs. Which of
  RecordButton's two a press calls in each state, that a press changes nothing until the app
  passes `recording`, where focus is when the app does, and what its meter says are held by
  `recordButtonLaw` (`packages/conformance/src/record-button.ts`), which every shell's
  `record-button.test` calls with a mount of its own.
- **What a field reports, and when.** A statement reads a part's value, and not what a handler
  receives. The seconds a DurationInput reports and when, a step that carries, a typed count it
  refuses, its bounds, its hidden field and the words its counts say are held by
  `durationInputLaw` (`packages/conformance/src/duration-input.ts`), which every shell's
  `duration-input.test` calls with a mount of its own.
- **A rule over a prop's values.** A statement reads one fixture entry, and not a rule that
  holds across values. The tone a Meter picks on each side of each threshold, the clamping of
  a value outside its range, the words it says as its value, the name of its status glyph and
  the edge its fill grows from are held by `meterLaw` (`packages/conformance/src/meter.ts`),
  which every shell's `meter.test` calls with a mount of its own.
- **Time passing.** A statement reads the member once, as it mounts. What a Countdown draws
  as its time passes, the second it changes on, when it calls `onEnd`, what it does while the
  document is hidden, and that it says nothing at each second are held by `countdownLaw`
  (`packages/conformance/src/countdown.ts`), on a faked clock, which every shell's
  `countdown.test` calls with a mount of its own.
- **The value a field reports as it is typed.** A statement steps a part and reads it, and does
  not read what the handler is called with. The `YYYY-MM` text a MonthInput reports on each
  digit, its bounds, its read-only form and a value the application holds are held by
  `monthInputLaw` (`packages/conformance/src/month-input.ts`), which every shell's
  `month-input.test` calls with a mount of its own.
- **Moving between two menus.** A statement opens one menu from one trigger. Menubar's
  hand-off between neighbouring menus and its submenu exceptions, its row in a right-to-left
  document, its typeahead, the pointer rule and its phone form are held by `menubarLaw`
  (`packages/conformance/src/menubar.ts`), which every shell's `menubar.test` calls with a
  mount of its own.
- **The reading direction.** No statement names the document's direction. `directionLaw`
  (`packages/conformance/src/direction.ts`), which every shell's `direction.test` calls with its
  adapter and galleries, renders each states fixture entry in a right-to-left document. No
  element may say `dir="ltr"` there, and Tabs must start at the right edge, move to the next tab
  on the arrow that points left, and turn when the document does. Each shell's `direction.test`
  also mounts Tabs and Rating in an element that says `dir="rtl"` on a left-to-right page, where
  the arrow that points left must move to the next item.
- **When an announcement is made.** `announces` checks the channel in the state, and with a
  message the words the region holds then, not whether a screen reader is told when they change.
- **A substrate's announcement outside the member.** A region the substrate keeps elsewhere
  (React Aria's page-wide announcer) is not the member's.
- **Props an entry hides.** `name … from <prop>` needs the member's element in the entry's tree.
  An entry that renders the member inside a component of its own cannot take a probe value.
