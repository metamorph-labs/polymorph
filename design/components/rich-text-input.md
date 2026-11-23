# RichTextInput

DECIDE: what a RichTextInput is, in two or three sentences — and what it is *not*, next
to the component a reader will confuse it with. Say which substrate it rests on,
or that it rests on none.

## Anatomy

```
[root]
  [part]*
```

## API

```ts
interface RichTextInputProps {
  label: string // DECIDE: the real surface, one line of intent per prop
}
```

<!-- The API section is machine-read (packages/rules/src/spec-api.ts): every prop
     the code ships must be a prop this section declares, and the reverse, in a
     law that goes red on drift. Two grammars are accepted — this fenced `ts`
     block naming the props type, or a markdown table whose header has a literal
     `Prop` column. Prefer the fence: a table's other columns read like prose
     to a human and like props to the parser. A fence that names the type wins
     over a table if a spec carries both. -->

Attributes: DECIDE — the `data-*` this component surfaces, and the rest state
that carries none. The "Attribute contract" section of
`design/components/README.md` is the shared one.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | DECIDE: the exact `--pm-*` tokens, part by part |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| default | DECIDE | DECIDE |

`requiredSelectors`: DECIDE — the states a prop cannot reach (hover, focus,
active, and what a substrate sets itself), or none, said out loud.

## Motion

DECIDE: what moves, on which state change, and which motion token times it — or
that nothing moves, which is also a decision worth writing down.

## Icons

DECIDE: which `IconRole`s, and whether they are decorative or named.

## A11y

DECIDE: the roles and the reading order, the accessible name, what is hidden from
the accessibility tree and why nothing is lost with it.

## Agent

DECIDE: what an agent reads off a RichTextInput and does with it, and why anything is
withheld, then the `agent` fence that restates it (`docs/agents.md`). A member an
agent has nothing to read or do with keeps the section, with the reason and no
fence. A control or an overlay must decide; another member may delete the section.
