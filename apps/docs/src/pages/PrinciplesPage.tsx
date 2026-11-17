import { Badge, Card, Heading, Inline, PageHeader, Stack, Table, Text } from '@polymorph/react-ui'

import { REGISTRY } from '../registry'

/**
 * The governance page: the exception ladder and the laws, read from the
 * registry. The prose introductions are hand-written and explain the reasoning.
 * The tables hold the facts.
 */
export function PrinciplesPage() {
  return (
    <Stack gap={7} p={7}>
      <PageHeader
        title="Principles"
        description="Exceptions are not forbidden; undeclared exceptions are. Drift is invisible deviation — so every deviation here is declared, bounded, inventoried, and priced."
      />

      <Stack gap={4}>
        <Stack gap={1}>
          <Heading>The exception ladder</Heading>
          <Text size="sm" tone="secondary">
            Always use the highest rung that works. Rungs one and two are ordinary vocabulary use.
            Rungs three and four are declared and inventoried. Rung five is the exit: a recurring
            exception must be promoted into the vocabulary or deleted. The ladder&rsquo;s health is
            measured by exception age and time to promotion, not by count alone.
          </Text>
        </Stack>
        <Stack gap={3}>
          {REGISTRY.exceptions.ladder.map((rung) => (
            <Card key={rung.rung}>
              <Inline gap={3} align="center">
                <Badge variant="solid" tone="accent">
                  {String(rung.rung)}
                </Badge>
                <Stack gap={1}>
                  <Text>
                    <strong>{rung.name}</strong> — {rung.summary}
                  </Text>
                  {rung.declaredAs ? (
                    <Text size="sm" tone="secondary">{`Declared as: ${rung.declaredAs}`}</Text>
                  ) : null}
                </Stack>
              </Inline>
            </Card>
          ))}
        </Stack>
      </Stack>

      <Stack gap={4}>
        <Stack gap={1}>
          <Heading>The laws</Heading>
          <Text size="sm" tone="secondary">
            Red rules and law tests run on every change and leave nothing to judgment. Violations
            return machine-actionable errors, so people and agents get the same feedback.
          </Text>
        </Stack>
        <Table>
          <Table.Head>
            <Table.Row>
              <Table.Header>Law</Table.Header>
              <Table.Header>Applies to</Table.Header>
              <Table.Header>What it holds</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {/* One law can exist in two engines (scoped-token-owners is both an
                ESLint and a stylelint rule), so the row key is the name and
                language pair, not the name alone. */}
            {REGISTRY.laws.map((law) => (
              <Table.Row key={`${law.name}-${law.language}`}>
                <Table.Cell>
                  <Badge variant="outline" tone="accent">
                    {law.name}
                  </Badge>
                </Table.Cell>
                <Table.Cell>{law.applies}</Table.Cell>
                <Table.Cell>{law.summary}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Stack>
    </Stack>
  )
}
