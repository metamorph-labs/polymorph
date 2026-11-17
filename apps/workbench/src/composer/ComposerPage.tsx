import type { RegistryComponent } from '@polymorph/registry'
import { isElement, type ScreenSpec, type SpecElement } from '@polymorph/spec/schema'
import { validateSpec } from '@polymorph/spec/validate'
import {
  Alert,
  Badge,
  Button,
  Card,
  Command,
  ConfirmDialog,
  FormField,
  Grid,
  Heading,
  Inline,
  Input,
  Menu,
  PageHeader,
  Select,
  Stack,
  Text,
  type CommandItem,
} from '@polymorph/react-ui'
import { useMemo, useState, type ReactNode } from 'react'

import { REGISTRY } from '../registry'
import {
  elementAt,
  insertChild,
  moveChild,
  parentOf,
  removeAt,
  updateAt,
  wrapIn,
  type Address,
} from './model'
import { Inspector } from './Inspector'
import { acceptsChildren, CODE_WIRED, INSERTABLE, templateFor } from './palette'
import { requestScreenSave, slugOf } from './protocol'
import { renderSpec } from './render'
import {
  apply,
  isScreenDocument,
  redoComposition,
  replaceComposition,
  select,
  startingSpec,
  undoComposition,
  useComposer,
} from './store'

/**
 * The composer builds screens from the vocabulary as a `polymorph-screen/1` document. It renders
 * live under the pairing the toolbar (or an ambient draft) has applied.
 *
 * It has three panes. The layers pane shows the document as a tree, and selection happens there.
 * The canvas is a preview, not a click target, because catching clicks on it would need a raw
 * interactive element, which the red rules forbid. The canvas renders the real vocabulary through
 * `render.tsx`. The selection pane shows the node, its operations, and the law panel with
 * `validateSpec`'s messages.
 *
 * This is application code and the red rules apply: no stylesheet, no style prop, one page
 * opener. The tree rows are ghost Buttons. That is enough for a workbench tool, and a real Tree
 * member can be added to the vocabulary when a product needs one.
 */

/**
 * The screens on disk, both shipped and saved. Both live in `design/screens/`. They are found at
 * build time like the theme catalogue, and the dev server watches the directory, so a screen
 * saved in this session appears in the list after a page reload.
 */
const SCREEN_MODULES = import.meta.glob('../../../../design/screens/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

const OPENABLE = Object.entries(SCREEN_MODULES)
  .map(([path, document]) => ({ file: path.split('/').pop() ?? path, document }))
  // The tag alone is not enough. A malformed file in the directory (hand-edited, half-written, or
  // in an older shape) would be offered, loaded and persisted, and the next reload would crash
  // again. This is the same check the store applies to a stored draft.
  .filter((entry): entry is { file: string; document: ScreenSpec } =>
    isScreenDocument(entry.document),
  )
  .sort((a, b) => a.file.localeCompare(b.file))

/** Each section must be one contiguous run, otherwise the collection has duplicate keys. */
const TIER_ORDER = ['layout', 'structure', 'controls', 'overlays', 'charts', 'archetypes', 'icon']

const TIER_LABEL: Record<string, string> = {
  layout: 'Layout — the lawful divs',
  structure: 'Structure',
  controls: 'Controls',
  overlays: 'Overlays',
  charts: 'Charts',
  archetypes: 'Archetypes',
  icon: 'Icons',
}

/** Long enough for the browser to have read the blob the click passed it. */
const REVOKE_AFTER_MS = 1000

/** A single string child is inline-editable text. Anything more is composition. */
function soleText(element: SpecElement): string | null {
  const children = element.children ?? []
  return children.length === 1 && typeof children[0] === 'string' ? children[0] : null
}

function rowLabel(element: SpecElement, slot?: string): string {
  const text = soleText(element)
  const named = text === null ? element.component : `${element.component} — “${clip(text)}”`
  // An element-valued prop is a named slot, and the name goes on the row it names.
  // `control: Switch` is one tree item, not a label row plus an item, because a tree may only
  // contain items.
  return slot === undefined ? named : `${slot}: ${named}`
}

const clip = (text: string) => (text.length > 18 ? `${text.slice(0, 18)}…` : text)

const step = (depth: number) => Math.min(depth, 10) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

/**
 * The layers, as an accessible tree.
 *
 * Ghost Buttons with a left padding step and `aria-current="page"` on the selected one would be
 * announced as a flat list of buttons with a "current page". That is wrong in two ways: no row is
 * a page, and a screen reader cannot hear depth. So the semantics are on the rows' wrappers, not
 * on the Button. A governed member exposes only the props it intends (`label`, `current`,
 * `pressed`), and `role` is not one of them. That suits a control and leaves the structure to the
 * surrounding composition. This uses the flat `aria-level` tree pattern, where depth is stated
 * rather than drawn.
 */
function TreeRows({
  element,
  address,
  depth,
  selection,
  slot,
}: {
  element: SpecElement
  address: Address
  depth: number
  selection: Address
  /** The prop name that holds this node, when it is an element-valued slot. */
  slot?: string
}): ReactNode {
  const rows: ReactNode[] = [
    <div key={address} role="treeitem" aria-level={depth + 1} aria-selected={selection === address}>
      <Inline px={step(depth)} gap={2}>
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          label={rowLabel(element, slot)}
          onClick={() => select(address)}
        />
      </Inline>
    </div>,
  ]

  for (const [name, value] of Object.entries(element.props ?? {})) {
    if (!isElement(value)) continue
    rows.push(
      <TreeRows
        key={`${address}.props.${name}`}
        element={value}
        address={`${address}.props.${name}`}
        depth={depth + 1}
        selection={selection}
        slot={name}
      />,
    )
  }

  ;(element.children ?? []).forEach((child, index) => {
    if (!isElement(child)) return
    rows.push(
      <TreeRows
        key={`${address}.children[${index}]`}
        element={child}
        address={`${address}.children[${index}]`}
        depth={depth + 1}
        selection={selection}
      />,
    )
  })

  return <>{rows}</>
}

export function ComposerPage() {
  const { history, selection } = useComposer()
  const spec = history.present
  const [inserting, setInserting] = useState(false)
  const [pendingStart, setPendingStart] = useState<ScreenSpec | null>(null)
  // The note describes one document, so it is stored with that document. Any edit produces a new
  // document, and the note stays with the old one. Stored separately, it would stay on screen too
  // long, for example "Saved settings.json" after ten more edits, when it is no longer true.
  const [saveNote, setSaveNote] = useState<{ about: ScreenSpec; text: string } | null>(null)
  const [confirmingOverwrite, setConfirmingOverwrite] = useState<string[] | null>(null)

  const validation = useMemo(() => validateSpec(REGISTRY, spec), [spec])
  const canvas = useMemo(() => renderSpec(spec), [spec])
  const selected = elementAt(spec, selection)
  const selectedMeta = REGISTRY.components.find(
    (component) => component.name === selected?.component.split('.')[0],
  )
  const location = parentOf(selection)
  const text = selected === null ? null : soleText(selected)

  const insertItems = useMemo<CommandItem[]>(
    () =>
      [...INSERTABLE]
        .sort(
          (a, b) =>
            TIER_ORDER.indexOf(a.component.tier) - TIER_ORDER.indexOf(b.component.tier) ||
            a.component.name.localeCompare(b.component.name),
        )
        .map(({ component }) => ({
          id: component.name,
          label: component.name,
          group: TIER_LABEL[component.tier] ?? component.tier,
          keywords: component.purpose.toLowerCase().split(/\W+/).filter(Boolean).slice(0, 8),
          onSelect: () => {
            setInserting(false)
            insertMember(component)
          },
        })),
    // INSERTABLE is a module constant. The closure only needs the current selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, selection],
  )

  function insertMember(component: RegistryComponent): void {
    const template = templateFor(component)
    const target = elementAt(spec, selection)
    if (target !== null && acceptsChildren(target.component)) {
      const at = (target.children ?? []).length
      apply(insertChild(spec, selection, template), `${selection}.children[${at}]`)
      return
    }
    const home = parentOf(selection)
    if (home !== null && home.step.kind === 'child') {
      const at = (home.step.key as number) + 1
      apply(insertChild(spec, home.parent, template, at), `${home.parent}.children[${at}]`)
      return
    }
    const at = (spec.root.children ?? []).length
    apply(insertChild(spec, '$', template), `$.children[${at}]`)
  }

  function archetypeStart(name: string): ScreenSpec {
    const component = REGISTRY.components.find((candidate) => candidate.name === name)
    const seed = component === undefined ? startingSpec().root : templateFor(component)
    return {
      ...startingSpec(),
      name: `${name}Screen`,
      purpose: `A ${name} screen, composed in the workbench.`,
      root: seed,
    }
  }

  function setDocumentField(field: 'name' | 'purpose', value: string): void {
    // Typing a name is one edit, not one per letter. The tag (`$:<field>`) identifies the field.
    apply({ ...spec, [field]: value }, undefined, `$:${field}`)
  }

  async function send(overwrite: boolean): Promise<void> {
    const saved = spec
    const result = await requestScreenSave(saved, overwrite)
    if (result.existing !== undefined && result.existing.length > 0) {
      setConfirmingOverwrite(result.existing)
      return
    }
    setSaveNote({
      about: saved,
      text: result.ok
        ? `Saved ${result.written?.join(', ')} — reload to find it in the Open list.`
        : (result.error ?? 'the save was refused and said nothing'),
    })
  }

  function downloadSpec(): void {
    const url = URL.createObjectURL(
      new Blob([`${JSON.stringify(spec, null, 2)}\n`], { type: 'application/json' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    // The same file name that Save writes and the emit command uses, so the document has one
    // file name everywhere.
    anchor.download = `${slugOf(spec.name)}.json`
    anchor.click()
    // Revoked in a later task. The click starts a download that the browser finishes
    // asynchronously, and revoking in the same task can cancel the fetch of the blob.
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
  }

  return (
    <Stack gap={6} p={7}>
      <PageHeader
        title="Composer"
        description="A screen, assembled from the vocabulary — saved as the same document an agent writes and the emitter compiles. It renders under whatever the toolbar wears; bring your draft."
        actions={
          <>
            <Button
              variant="solid"
              tone="accent"
              icon="confirm"
              label="Save to design/"
              disabled={validation.faults.length > 0}
              onClick={() => void send(false)}
            />
            <Button
              variant="outline"
              tone="neutral"
              icon="previous"
              label="Undo"
              disabled={history.past.length === 0}
              onClick={undoComposition}
            />
            <Button
              variant="outline"
              tone="neutral"
              icon="next"
              label="Redo"
              disabled={history.future.length === 0}
              onClick={redoComposition}
            />
            <Menu
              trigger={<Button variant="ghost" tone="neutral" icon="refresh" label="Start from…" />}
              items={[
                {
                  label: 'A blank Stack',
                  icon: 'add',
                  onSelect: () => setPendingStart(startingSpec()),
                },
                { kind: 'separator' },
                ...INSERTABLE.filter((entry) => entry.component.tier === 'archetypes').map(
                  (entry) => ({
                    label: `${entry.component.name} skeleton`,
                    onSelect: () => setPendingStart(archetypeStart(entry.component.name)),
                  }),
                ),
              ]}
            />
          </>
        }
      />

      <Grid columns={3} gap={5}>
        <Stack gap={4}>
          <Card>
            <Stack gap={3}>
              <Heading>Layers</Heading>
              <Text size="sm" tone="secondary">
                The document, as a tree. Select a layer to edit it; slots hang under their prop
                names.
              </Text>
              {/* The only raw element on the page, and it has no behaviour. `role="tree"` is
                  structure that vocabulary members do not expose, and a Tree member can be
                  added when a product needs one. Every control inside it is still a member. */}
              <div role="tree" aria-label="Layers">
                <TreeRows element={spec.root} address="$" depth={0} selection={selection} />
              </div>
              <Inline gap={2} wrap>
                <Button
                  variant="outline"
                  tone="accent"
                  icon="add"
                  label="Insert member"
                  onClick={() => setInserting(true)}
                />
              </Inline>
              <Text size="sm" tone="secondary">
                {`${INSERTABLE.length} members compose with the mouse; ${CODE_WIRED.length} more are code-wired — valid in a spec, inserted by an agent or a developer.`}
              </Text>
            </Stack>
          </Card>

          <Card>
            <Stack gap={3}>
              <Heading level={3}>This document</Heading>
              <FormField
                label="Component name"
                description="PascalCase — the component the emitter writes."
              >
                <Input value={spec.name} onChange={(value) => setDocumentField('name', value)} />
              </FormField>
              <FormField
                label="Purpose"
                description="One sentence; the emitted file's doc comment."
              >
                <Input
                  value={spec.purpose}
                  onChange={(value) => setDocumentField('purpose', value)}
                />
              </FormField>
              <FormField
                label="Open"
                description="A screen from design/screens/ — shipped or saved. Opening replaces this composition, and asks first."
              >
                <Select
                  options={[
                    { value: '', label: 'choose a screen…' },
                    ...OPENABLE.map((entry) => ({ value: entry.file, label: entry.file })),
                  ]}
                  value=""
                  onChange={(value: string | null) => {
                    // Uses the same confirmation as "Start from…". Open is the more destructive
                    // of the two: it replaces the composition, clears the history and persists,
                    // and nothing can undo it.
                    const found = OPENABLE.find((entry) => entry.file === value)
                    if (found) setPendingStart(found.document)
                  }}
                />
              </FormField>
              <Inline gap={2} wrap>
                <Button
                  variant="outline"
                  tone="neutral"
                  icon="download"
                  label="Download spec"
                  onClick={downloadSpec}
                />
                <Button
                  variant="ghost"
                  tone="neutral"
                  icon="copy"
                  label="Copy emit command"
                  // Uses `slugOf`, not a separate kebab-case function. A separate one could turn
                  // `APIScreen` into `apiscreen` while the endpoint writes `api-screen.json`, so
                  // the copied command would name a file that was never written.
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      `pnpm emit design/screens/${slugOf(spec.name)}.json`,
                    )
                  }
                />
              </Inline>
              {saveNote === null || saveNote.about !== spec ? null : (
                <Text size="sm" tone="secondary">
                  {saveNote.text}
                </Text>
              )}
            </Stack>
          </Card>
        </Stack>

        <Card>
          <Stack gap={3}>
            <Heading>Canvas</Heading>
            <Text size="sm" tone="secondary">
              The real vocabulary, live. Selection lives in the layers — the canvas never eats a
              click.
            </Text>
            {canvas}
          </Stack>
        </Card>

        <Stack gap={4}>
          {validation.faults.length === 0 ? (
            <Alert tone="success" title="Lawful">
              The document validates against the registry — every member exists, every prop is real,
              every value is one its type can hold.
            </Alert>
          ) : (
            <Alert tone="danger" title="The laws have notes">
              <Stack as="ul" gap={2}>
                {validation.faults.map((fault) => (
                  <li key={`${fault.path}:${fault.message}`}>
                    {fault.path}: {fault.message}
                  </li>
                ))}
              </Stack>
            </Alert>
          )}

          <Card>
            <Stack gap={3}>
              <Inline gap={2} wrap>
                <Heading level={3}>{selected?.component ?? 'Nothing selected'}</Heading>
                {selectedMeta ? <Badge tone="neutral">{selectedMeta.tier}</Badge> : null}
              </Inline>
              {selectedMeta ? (
                <Text size="sm" tone="secondary">
                  {selectedMeta.purpose}
                </Text>
              ) : null}

              {text !== null ? (
                <FormField label="Text" description="This layer is a line of text — edit it here.">
                  <Input
                    value={text}
                    onChange={(value) =>
                      apply(
                        updateAt(spec, selection, (element) => ({
                          ...element,
                          children: [value],
                        })),
                        undefined,
                        `${selection}:children`,
                      )
                    }
                  />
                </FormField>
              ) : null}

              <Inline gap={2} wrap>
                <Button
                  size="sm"
                  variant="outline"
                  tone="neutral"
                  icon="up"
                  label="Move up"
                  disabled={location === null || location.step.kind !== 'child'}
                  onClick={() => {
                    const moved = moveChild(spec, selection, -1)
                    if (moved !== spec && location !== null) {
                      apply(
                        moved,
                        `${location.parent}.children[${(location.step.key as number) - 1}]`,
                      )
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  tone="neutral"
                  icon="down"
                  label="Move down"
                  disabled={location === null || location.step.kind !== 'child'}
                  onClick={() => {
                    const moved = moveChild(spec, selection, 1)
                    if (moved !== spec && location !== null) {
                      apply(
                        moved,
                        `${location.parent}.children[${(location.step.key as number) + 1}]`,
                      )
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  tone="neutral"
                  icon="expand"
                  label="Wrap in Stack"
                  onClick={() => apply(wrapIn(spec, selection, 'Stack'))}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  tone="danger"
                  icon="remove"
                  label="Remove"
                  disabled={selection === '$'}
                  onClick={() => {
                    const home = parentOf(selection)
                    apply(removeAt(spec, selection), home?.parent ?? '$')
                  }}
                />
              </Inline>
              {selected !== null ? (
                <Inspector spec={spec} address={selection} element={selected} />
              ) : null}
            </Stack>
          </Card>
        </Stack>
      </Grid>

      <Command
        open={inserting}
        onOpenChange={setInserting}
        items={insertItems}
        placeholder="Insert a member — search by name or purpose…"
        emptyMessage="No insertable member matches. Code-wired members are inserted by agents or developers."
      />

      <ConfirmDialog
        open={confirmingOverwrite !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmingOverwrite(null)
        }}
        title="Amend a screen that already exists?"
        description={`This overwrites ${(confirmingOverwrite ?? []).join(' and ')}.`}
        confirmLabel="Overwrite"
        onConfirm={() => {
          setConfirmingOverwrite(null)
          void send(true)
        }}
      />

      {/* One confirmation for both replacements. Opening a screen and starting from a skeleton
          are the same irreversible action, so both ask first. */}
      <ConfirmDialog
        open={pendingStart !== null}
        onOpenChange={(open) => {
          if (!open) setPendingStart(null)
        }}
        title="Replace this composition?"
        description="This composition and its history are replaced by the one you chose, and there is no undo across the swap. Saved files are not touched."
        confirmLabel="Replace"
        onConfirm={() => {
          if (pendingStart !== null) replaceComposition(pendingStart)
          setPendingStart(null)
        }}
      />
    </Stack>
  )
}
