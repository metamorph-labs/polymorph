import type { RegistryComponent, RegistryProp } from '@polymorph/registry'
import type { SpecElement, SpecValue } from '@polymorph/spec/schema'
import {
  Button,
  FormField,
  Inline,
  Input,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
} from '@polymorph/react-ui'

import { REGISTRY } from '../registry'
import { setProp, type Address } from './model'
import { controlFor } from './palette'
import { propsOf } from './render'
import { apply } from './store'

/**
 * The inspector: the selected member's props, as controls derived from the registry's type
 * strings. Unions offer their members, icon props offer the role list, and Button's grid allows
 * only lawful cells.
 *
 * As in the studio, an absent key means the default. An untouched prop shows the member's default
 * and writes nothing. Setting it writes to the document, and Reset removes the key. Required props
 * have no Reset, because a document missing one has a fault, and the law panel next to this card
 * reports it.
 */

interface EditorProps {
  spec: Parameters<typeof setProp>[0]
  address: Address
  element: SpecElement
  component: RegistryComponent
}

/**
 * Writes one prop.
 *
 * `tag` marks a continuous edit (one field, one prop, one node). The store merges consecutive
 * writes with the same tag into one history entry. Without this, undo would remove a label one
 * letter at a time, and the hundred-entry cap would fill with the letters of one word. Discrete
 * choices (a select, a switch, a reset) pass no tag, so each is its own undo step.
 */
const write = (props: EditorProps, name: string, value: SpecValue | undefined, tag?: string) =>
  apply(setProp(props.spec, props.address, name, value), undefined, tag)

/** The edit location, used as the store's merge key. */
const siteOf = (props: EditorProps, name: string) => `${props.address}:${name}`

function UnionControl({
  editor,
  prop,
  options,
  icon,
}: EditorProps extends never
  ? never
  : {
      editor: EditorProps
      prop: RegistryProp
      options: (string | number | boolean | null)[]
      icon: boolean
    }) {
  const current = editor.element.props?.[prop.name]
  const set = current !== undefined

  // Button's grid (the only one in the registry): variant × tone must be a lawful cell.
  const grid = editor.component.grid
  let offered = options
  if (grid !== null && grid !== undefined) {
    if (prop.name === 'variant') offered = Object.keys(grid)
    if (prop.name === 'tone') {
      const variant = (editor.element.props?.['variant'] as string | undefined) ?? 'solid'
      offered = grid[variant] ?? options
    }
  }
  if (icon) offered = REGISTRY.icons.roles.map((role) => role.name)

  const encoded = offered.map((option) => ({
    value: JSON.stringify(option),
    label: String(option),
  }))
  return (
    <Select
      options={[{ value: '"__default__"', label: 'component default' }, ...encoded]}
      value={set ? JSON.stringify(current) : '"__default__"'}
      onChange={(value) => {
        if (value === null) return
        const decoded = JSON.parse(value) as SpecValue
        write(editor, prop.name, decoded === '__default__' ? undefined : decoded)
      }}
    />
  )
}

function PropRow({ editor, prop }: { editor: EditorProps; prop: RegistryProp }) {
  const control = controlFor(prop)
  if (control === null || control.kind === 'slot') return null

  const current = editor.element.props?.[prop.name]
  const set = current !== undefined
  const label = set ? prop.name : `${prop.name} (default)`
  const resettable = set && prop.optional

  const body = (() => {
    switch (control.kind) {
      case 'union':
        return (
          <UnionControl editor={editor} prop={prop} options={control.options} icon={control.icon} />
        )
      case 'boolean':
        return (
          <Switch
            checked={current === true}
            label={current === true ? 'on' : 'off'}
            onCheckedChange={(next) => write(editor, prop.name, next)}
          />
        )
      case 'number':
        return (
          <NumberInput
            value={typeof current === 'number' ? current : 0}
            // An emptied field reports `null`, and `null` is a value. Writing it to a required
            // number would produce "wants `number`, got null", with no Reset next to it. An
            // emptied field means the key is absent, and the law panel can explain that fault.
            onChange={(value) =>
              write(editor, prop.name, value ?? undefined, siteOf(editor, prop.name))
            }
          />
        )
      case 'numbers':
        return (
          <Input
            value={Array.isArray(current) ? current.join(', ') : ''}
            placeholder="3, 5, 4, 8"
            onChange={(value) =>
              write(
                editor,
                prop.name,
                value
                  .split(',')
                  // `Number('')` is `0`. Without this filter, the trailing comma of a partly
                  // typed "3," would add a second data point and the chart would jump while
                  // typing, and an emptied field would write `[0]` instead of `[]`. An empty
                  // segment means the user is still typing, not a number.
                  .map((part) => part.trim())
                  .filter((part) => part !== '')
                  .map(Number)
                  .filter((part) => !Number.isNaN(part)),
                siteOf(editor, prop.name),
              )
            }
          />
        )
      case 'string':
        return (
          <Input
            value={typeof current === 'string' ? current : ''}
            onChange={(value) => write(editor, prop.name, value, siteOf(editor, prop.name))}
          />
        )
    }
  })()

  const reset = resettable ? (
    <Button
      size="sm"
      variant="ghost"
      tone="neutral"
      iconOnly
      icon="clear"
      label={`Reset ${prop.name} to the component default`}
      onClick={() => write(editor, prop.name, undefined)}
    />
  ) : null

  /*
   * The control must be FormField's only child. The field labels its control by cloning an id onto
   * the single element it receives, and an `Inline` there would drop every prop that is not a
   * spacing prop. The label's `htmlFor` would then point at an id no element has, and every row in
   * this panel would be an unlabelled control.
   *
   * So Reset goes in the label row (`labelEnd`), where secondary actions belong. A Switch has its
   * own row label and FormField renders no label row for it, so its Reset button stays next to
   * the field.
   */
  const rowLabelled = control.kind === 'boolean'
  const field = (
    <FormField
      label={label}
      description={prop.doc !== '' ? prop.doc : undefined}
      labelEnd={rowLabelled ? undefined : reset}
    >
      {body}
    </FormField>
  )

  return rowLabelled && reset !== null ? (
    <Inline gap={2} align="center">
      {field}
      {reset}
    </Inline>
  ) : (
    field
  )
}

export function Inspector({
  spec,
  address,
  element,
}: {
  spec: Parameters<typeof setProp>[0]
  address: Address
  element: SpecElement
}) {
  const component = REGISTRY.components.find(
    (candidate) => candidate.name === element.component.split('.')[0],
  )
  if (component === undefined) return null

  /*
   * The part's own props, not the owner's.
   *
   * `SettingsRow.Group` is not `SettingsRow`. Resolving a part to its owner would offer `label`,
   * `description` and `control`, which belong to the row, and hide `title`, the Group's only
   * editable prop. A `label` typed there would be written to the Group. The law panel would
   * report "`SettingsRow.Group` has no prop `label`" and Save would stay disabled. `propsOf` uses
   * the validator's rule, so the panel offers exactly the props the document may hold.
   */
  const surface = propsOf(element.component)
  const editor: EditorProps = { spec, address, element, component }
  const editable = surface.filter(
    (prop) =>
      prop.name !== 'children' && controlFor(prop) !== null && controlFor(prop)?.kind !== 'slot',
  )
  const slots = surface.filter(
    (prop) => controlFor(prop)?.kind === 'slot' && prop.name !== 'children',
  )

  if (editable.length === 0 && slots.length === 0) return null

  return (
    <Stack gap={3}>
      {editable.map((prop) => (
        <PropRow key={prop.name} editor={editor} prop={prop} />
      ))}
      {slots.length > 0 ? (
        <Text size="sm" tone="secondary">
          {`Slots — edit in the layers tree: ${slots.map((prop) => prop.name).join(', ')}.`}
        </Text>
      ) : null}
    </Stack>
  )
}
