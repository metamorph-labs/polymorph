import { type ComponentStates } from '@polymorph/react'
import { Stack } from '../layout/Stack'
import { Table } from '../structure/Table'
import { FormField } from './FormField'
import { Rating, type RatingMessages } from './Rating'

/**
 * States fixture, from `design/components/rating.md`'s States table.
 *
 * A right-to-left page is not an entry, because the direction is the document's and no prop
 * sets it. The direction law renders every entry in a right-to-left document, and the rating
 * law checks the row, the part fill and the arrows there.
 */

/** German words, with the numerals the member writes in German. */
const GERMAN: RatingMessages = {
  mark: (value, numeral) => `${numeral} ${value === 1 ? 'Stern' : 'Sterne'}`,
  shown: (label, value, max) => `${label}: ${value} von ${max}`,
}

/** A model and its average score, for the table's rows. */
const MODELS = [
  { name: 'Router v2', score: 4.6 },
  { name: 'Router v1', score: 3.2 },
]

export const states: ComponentStates = {
  component: 'Rating',

  entries: [
    {
      name: 'nothing chosen yet',
      render: () => <Rating label="Rate this answer" />,
      expect: { role: 'radiogroup', 'data-size': 'md' },
    },
    {
      name: 'three of five',
      render: () => <Rating label="Rate this answer" defaultValue={3} />,
    },
    {
      name: 'each value — one to five',
      render: () => (
        <Stack gap={3}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Rating key={value} label={`Answer ${value}`} defaultValue={value} />
          ))}
        </Stack>
      ),
    },
    {
      name: 'read-only — an average of 4.3',
      render: () => <Rating label="Average rating" value={4.3} readOnly />,
      expect: { role: 'img', 'data-readonly': '' },
    },
    {
      name: 'disabled',
      render: () => <Rating label="Rate this answer" defaultValue={2} disabled />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'sizes — sm, md and lg',
      render: () => (
        <Stack gap={3}>
          <Rating label="Small" defaultValue={4} size="sm" />
          <Rating label="Medium" defaultValue={4} size="md" />
          <Rating label="Large" defaultValue={4} size="lg" />
        </Stack>
      ),
    },
    {
      name: 'ten marks — the most a rating takes',
      render: () => (
        <Rating label="How likely are you to recommend us?" max={10} defaultValue={7} />
      ),
    },
    {
      name: 'in a FormField, required and in error',
      render: () => (
        <FormField
          label="How was this answer?"
          error="Choose a rating to send your feedback."
          required
        >
          <Rating label="Answer rating" name="rating" />
        </FormField>
      ),
    },
    {
      name: 'in a Table cell — read-only and small',
      render: () => (
        <Table label="Model ratings">
          <Table.Head>
            <Table.Row>
              <Table.Header>Model</Table.Header>
              <Table.Header>Rating</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {MODELS.map((model) => (
              <Table.Row key={model.name}>
                <Table.Cell>{model.name}</Table.Cell>
                <Table.Cell>
                  <Rating label="Rating" value={model.score} readOnly size="sm" />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ),
    },
    {
      name: 'messages — the words in German',
      render: () => <Rating label="Bewertung" defaultValue={4} locale="de" messages={GERMAN} />,
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-disabled]',
    '[data-invalid]',
    '[data-readonly]',
    '[data-fill="none"]',
  ],
}
