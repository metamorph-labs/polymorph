import type { RegistryComponent } from '@polymorph/registry'
import { Code, Collapsible, CodeBlock, Inline, Kbd, Stack, Table, Text } from '@polymorph/react-ui'
import type { ReactNode } from 'react'

/**
 * A member's behaviour contract (the statements of its spec's `contract`
 * fence) read out in words: a table of what each key does, then what a screen
 * reader hears and where focus goes. The statements as the spec writes them
 * follow, collapsed, because they are the lines the conformance law runs.
 *
 * Every sentence is built from a statement's fields. A statement's `when`
 * names the fixture entry the law starts from, not a condition a reader sets,
 * so it is said only where the claim differs between entries (an attribute, an
 * announcement).
 */

type Statement = RegistryComponent['behaviour'][number]
type KeyStatement = Extract<Statement, { kind: 'key' }>

/** A part's name in a sentence: `close-button` reads as "close button". */
function partName(part: string): string {
  return part.replace(/-/g, ' ')
}

function article(word: string): string {
  return /^[aeiou]/.test(word) ? 'an' : 'a'
}

/** What the key does, as the second column of the keyboard table says it. */
function keyEffect(statement: KeyStatement): string {
  const part = statement.on === undefined || statement.on === 'root' ? null : partName(statement.on)
  const item = part ?? 'item'
  switch (statement.effect) {
    case 'opens':
      return 'Opens it'
    case 'closes':
      return 'Closes it'
    case 'activates':
      return part === null ? 'Activates it' : `Activates the ${part}`
    case 'moves-focus-next':
      return `Moves focus to the next ${item}`
    case 'moves-focus-previous':
      return `Moves focus to the previous ${item}`
    case 'moves-focus-first':
      return `Moves focus to the first ${item}`
    case 'moves-focus-last':
      return `Moves focus to the last ${item}`
    case 'selects':
      return `Selects the focused ${item}`
    case 'clears':
      return 'Clears it'
    case 'commits':
      return part === null ? 'Commits the value' : `Chooses the focused ${part}`
    case 'increments':
      return 'Steps the value up'
    case 'decrements':
      return 'Steps the value down'
    case 'nothing':
      return 'Does nothing here'
  }
}

/** `Shift+F10` as two keycaps. `Space` is the space bar's name in the contract. */
function keycaps(key: string): ReactNode {
  return (
    <Inline gap={1} align="center">
      {key.split('+').map((part) => (
        <Kbd key={part}>{part}</Kbd>
      ))}
    </Inline>
  )
}

/** One sentence about what a reader hears, or where focus goes, or `null` for a key. */
function describe(statement: Statement): ReactNode {
  const subject = (part: string) => (part === 'root' ? 'It' : `Its ${partName(part)}`)
  switch (statement.kind) {
    case 'role':
      return (
        <>
          {`${subject(statement.part)} reads as ${article(statement.role)} `}
          <Code>{statement.role}</Code>
        </>
      )
    case 'name':
      return statement.from === 'children' ? (
        `${subject(statement.part)} takes its name from its content`
      ) : (
        <>
          {`${subject(statement.part)} takes its name from `}
          <Code>{statement.from}</Code>
        </>
      )
    case 'focus':
      if (statement.moment === 'on-open') {
        return `Opening it moves focus to the ${partName(statement.part)}`
      }
      return statement.target === 'trigger'
        ? 'Closing it puts focus back on the trigger'
        : 'Closing it puts focus back where it was'
    case 'dismiss':
      return {
        outside: 'A click outside closes it',
        escape: 'Escape closes it',
        both: 'Escape or a click outside closes it',
        none: 'Only its own controls close it',
      }[statement.by]
    case 'click':
      return statement.on === 'root'
        ? 'A click activates it'
        : `A click on the ${partName(statement.on)} activates it`
    case 'announces': {
      const channel =
        statement.channel === 'busy'
          ? 'it tells screen readers it’s busy'
          : statement.channel === 'live:polite'
            ? 'it announces changes when the reader pauses'
            : 'it announces changes straight away'
      return (
        <>
          {`In the “${statement.state}” example, ${channel}`}
          {statement.says === undefined ? null : `, saying “${statement.says}”`}
        </>
      )
    }
    case 'attr':
      return (
        <>
          {`In the “${statement.state}” example, ${subject(statement.part).toLowerCase()} has `}
          <Code>
            {statement.value === null
              ? statement.attribute
              : `${statement.attribute}="${statement.value}"`}
          </Code>
        </>
      )
    case 'key':
      return null
  }
}

export function Contract({ component }: { component: RegistryComponent }) {
  // One row per key, effect and part. The same claim can be stated from
  // several fixture entries, and the reader needs it once.
  const keys = new Map<string, KeyStatement>()
  const sentences = new Map<string, ReactNode>()
  for (const statement of component.behaviour) {
    if (statement.kind === 'key') {
      const id = `${statement.key} ${statement.effect} ${statement.on ?? ''}`
      if (!keys.has(id)) keys.set(id, statement)
      continue
    }
    // Role, name, focus and dismissal claims read the same in every entry.
    const id =
      statement.kind === 'attr' || statement.kind === 'announces'
        ? statement.text
        : statement.text.replace(/ when .*$/, '')
    if (!sentences.has(id)) sentences.set(id, describe(statement))
  }

  return (
    <Stack gap={6}>
      {keys.size === 0 ? null : (
        <Table caption={`${component.name} keyboard`}>
          <Table.Head>
            <Table.Row>
              <Table.Header>Key</Table.Header>
              <Table.Header>What it does</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {[...keys].map(([id, statement]) => (
              <Table.Row key={id}>
                <Table.Cell>{keycaps(statement.key)}</Table.Cell>
                <Table.Cell>{keyEffect(statement)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      {sentences.size === 0 ? null : (
        <Stack gap={2}>
          {[...sentences].map(([id, sentence]) => (
            <Text key={id} size="sm">
              {sentence}
            </Text>
          ))}
        </Stack>
      )}
      <Collapsible label="Show the contract as the spec writes it">
        <CodeBlock label={`${component.name} behaviour contract`}>
          {component.behaviour.map((statement) => statement.text).join('\n')}
        </CodeBlock>
      </Collapsible>
    </Stack>
  )
}
