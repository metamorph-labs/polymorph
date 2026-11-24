import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { FileUpload, type FileUploadItem, type FileUploadProps } from './FileUpload'
import styles from '@polymorph/recipes/controls/file-upload.module.css'
import { FormField } from './FormField'
import { tokenColor } from './token-probe'

/**
 * FileUpload. The main claim under test is that **the app owns the network**. Every path either
 * renders what it was given or requests an action. The gate is tested most thoroughly, because it
 * is the one place the component decides something itself. A file the field's rules refuse never
 * reaches `onFilesAdd`, and it is never silently dropped either. It comes back through `onReject`
 * with a reason, so the app can write the row.
 *
 * Every rule is tested through both the picker and a drop, because the rules must not depend on
 * whether the user clicked or dragged.
 */

beforeAll(installTestTheme)

const noop = () => undefined

function mount(node: React.ReactElement): HTMLElement {
  return render(node).container.firstElementChild as HTMLElement
}

const zone = () => screen.getByRole('button', { name: /attachments|drop files/i })
const partOf = (root: HTMLElement, part: string) =>
  root.querySelector(`.${part.split(' ').join('.')}`) as HTMLElement

const file = (name: string, bytes = 8, type = 'text/plain') =>
  new File([new Uint8Array(bytes)], name, { type })

/**
 * The picker path: real files on the real input, and the change event it fires.
 *
 * When a person uses the browser, the native input filters by `accept` and `multiple` before this
 * point. Assigning `files` directly lets the test check what the *component* does with them, which
 * is the same question the drop path asks.
 */
function choose(root: HTMLElement, files: File[]): void {
  const picker = root.querySelector('input[type="file"]') as HTMLInputElement
  const data = new DataTransfer()
  for (const item of files) data.items.add(item)
  picker.files = data.files
  act(() => {
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/**
 * A real drag event carrying real files, to exercise the drag-and-drop path.
 *
 * Wrapped in `act`, because React treats `dragover` as a *continuous* event and schedules its
 * state update at a lower priority than a click's. Without the flush, the assertion would read the
 * frame before the zone's state changed.
 */
function drag(type: 'dragover' | 'dragleave' | 'drop', node: HTMLElement, files: File[] = []) {
  const data = new DataTransfer()
  for (const item of files) data.items.add(item)
  act(() => {
    node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }))
  })
}

const UPLOADING: FileUploadItem = {
  id: 'a',
  name: 'quarterly-report.pdf',
  size: 2_411_724,
  status: 'uploading',
  progress: 40,
}
const DONE: FileUploadItem = { id: 'b', name: 'logo-mark.svg', size: 14_208, status: 'done' }
const FAILED: FileUploadItem = {
  id: 'c',
  name: 'customer-export.csv',
  status: 'error',
  message: 'Larger than the 50 MB limit',
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<FileUploadProps>(true)
  })
})

describe('the zone is a real button', () => {
  it('opens the picker from a click, and from the keyboard', async () => {
    const opened = vi.spyOn(HTMLInputElement.prototype, 'click')
    mount(<FileUpload onFilesAdd={noop} onReject={noop} onRemove={noop} aria-label="Attachments" />)

    await userEvent.click(zone())
    expect(opened).toHaveBeenCalled()

    opened.mockClear()
    zone().focus()
    await userEvent.keyboard('{Enter}')
    expect(opened).toHaveBeenCalled()
    opened.mockRestore()
  })

  it('keeps the input itself out of the tab order and the accessibility tree', () => {
    const root = mount(
      <FileUpload onFilesAdd={noop} onReject={noop} onRemove={noop} aria-label="Attachments" />,
    )
    const picker = root.querySelector('input[type="file"]') as HTMLInputElement
    expect(getComputedStyle(picker).display).toBe('none')
    expect(picker.tabIndex).toBe(-1)
  })

  it('carries `name` on the picker, for a native form post', () => {
    const root = mount(
      <FileUpload
        name="attachments"
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    expect((root.querySelector('input[type="file"]') as HTMLInputElement).name).toBe('attachments')
  })

  it('passes on the files the picker chose', () => {
    const onFilesAdd = vi.fn()
    const root = mount(
      <FileUpload
        onFilesAdd={onFilesAdd}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    const picker = root.querySelector('input[type="file"]') as HTMLInputElement

    const data = new DataTransfer()
    data.items.add(file('notes.txt'))
    picker.files = data.files
    picker.dispatchEvent(new Event('change', { bubbles: true }))

    expect(onFilesAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'notes.txt' })])
    // Cleared, so choosing the same file twice in a row is still a change.
    expect(picker.value).toBe('')
  })
})

describe('dropping', () => {
  it('sets dragover on the zone and the root while a file is over it', () => {
    const root = mount(
      <FileUpload onFilesAdd={noop} onReject={noop} onRemove={noop} aria-label="Attachments" />,
    )
    expect(zone().dataset['state']).toBe('idle')

    drag('dragover', zone(), [file('notes.txt')])
    expect(zone().dataset['state']).toBe('dragover')
    expect(root.dataset['state']).toBe('dragover')

    drag('dragleave', zone())
    expect(zone().dataset['state']).toBe('idle')
  })

  it('passes on the dropped files and returns to idle', () => {
    const onFilesAdd = vi.fn()
    mount(
      <FileUpload
        onFilesAdd={onFilesAdd}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )

    drag('dragover', zone(), [file('notes.txt')])
    drag('drop', zone(), [file('notes.txt'), file('logo.svg')])

    expect(onFilesAdd).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'notes.txt' }),
      expect.objectContaining({ name: 'logo.svg' }),
    ])
    expect(zone().dataset['state']).toBe('idle')
  })

  it('accepts nothing while disabled', () => {
    const onFilesAdd = vi.fn()
    mount(
      <FileUpload
        disabled
        onFilesAdd={onFilesAdd}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    drag('dragover', zone(), [file('notes.txt')])
    drag('drop', zone(), [file('notes.txt')])

    expect(onFilesAdd).not.toHaveBeenCalled()
    expect(zone().dataset['state']).toBe('idle')
  })
})

/**
 * The field's rules, which apply the same way whichever path the file takes. The picker enforces
 * `accept` and `multiple` natively and a drop enforces nothing, so every rule is tested twice.
 */
describe('the gate', () => {
  function gated(props: Partial<FileUploadProps>) {
    const onFilesAdd = vi.fn()
    const onReject = vi.fn()
    const root = mount(
      <FileUpload
        onFilesAdd={onFilesAdd}
        onReject={onReject}
        onRemove={noop}
        aria-label="Attachments"
        {...props}
      />,
    )
    return { root, onFilesAdd, onReject }
  }

  it('refuses an oversized dropped file and reports which one and why', () => {
    const { onFilesAdd, onReject } = gated({ maxSize: 1024 })
    drag('drop', zone(), [file('notes.txt'), file('huge.bin', 4096)])

    // The file under the limit still arrives, because a refusal is per file, not per gesture.
    expect(onFilesAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'notes.txt' })])
    expect(onReject).toHaveBeenCalledWith([
      { file: expect.objectContaining({ name: 'huge.bin' }), reason: 'size' },
    ])
  })

  it('refuses the same file through the picker, because the rule belongs to the field', () => {
    const { root, onFilesAdd, onReject } = gated({ maxSize: 1024 })
    choose(root, [file('huge.bin', 4096)])

    expect(onFilesAdd).not.toHaveBeenCalled()
    expect(onReject).toHaveBeenCalledWith([
      { file: expect.objectContaining({ name: 'huge.bin' }), reason: 'size' },
    ])
  })

  it('keeps one file when only one is allowed, and refuses the rest by count', () => {
    // The hidden input enforces `multiple={false}`, but a drop of two files would bypass it and
    // pass both to the app.
    const { onFilesAdd, onReject } = gated({ multiple: false })
    drag('drop', zone(), [file('first.txt'), file('second.txt')])

    expect(onFilesAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'first.txt' })])
    expect(onReject).toHaveBeenCalledWith([
      { file: expect.objectContaining({ name: 'second.txt' }), reason: 'count' },
    ])
  })

  it('applies `accept` to a drop, in both forms the picker accepts', () => {
    const { onFilesAdd, onReject } = gated({ accept: 'application/pdf,.csv' })
    drag('drop', zone(), [
      file('notes.txt'),
      file('report.pdf', 8, 'application/pdf'),
      // Dropped files often have no type. Only the extension form can match them.
      file('rows.csv', 8, ''),
    ])

    expect(onFilesAdd).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'report.pdf' }),
      expect.objectContaining({ name: 'rows.csv' }),
    ])
    expect(onReject).toHaveBeenCalledWith([
      { file: expect.objectContaining({ name: 'notes.txt' }), reason: 'type' },
    ])
  })

  it('matches a type wildcard the way the native picker does', () => {
    const { root, onFilesAdd, onReject } = gated({ accept: 'image/*' })
    choose(root, [file('logo.svg', 8, 'image/svg+xml'), file('notes.txt')])

    expect(onFilesAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'logo.svg' })])
    expect(onReject).toHaveBeenCalledWith([
      { file: expect.objectContaining({ name: 'notes.txt' }), reason: 'type' },
    ])
  })

  it('refuses nothing when a field sets no rules', () => {
    const { onFilesAdd, onReject } = gated({})
    drag('drop', zone(), [file('notes.txt', 4096), file('logo.svg')])

    expect(onFilesAdd).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'notes.txt' }),
      expect.objectContaining({ name: 'logo.svg' }),
    ])
    expect(onReject).not.toHaveBeenCalled()
  })

  it('never refuses a file without reporting it', () => {
    /*
     * A field with a `maxSize` and no `onReject` would enforce its limit and lose the file, with
     * no row, no message and no event. That breaks the spec's main guarantee that a rejection is
     * "a *visible row*, never a silent drop".
     *
     * `onReject` is required, so that field cannot exist. This test checks the remaining claim:
     * every refusal reaches the app, and it arrives *alongside* the files that passed, not instead
     * of them.
     */
    const onFilesAdd = vi.fn()
    const onReject = vi.fn()
    mount(
      <FileUpload
        maxSize={16}
        onFilesAdd={onFilesAdd}
        onReject={onReject}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    drag('drop', zone(), [file('huge.bin', 4096), file('notes.txt', 8)])

    expect(onFilesAdd).toHaveBeenCalledWith([expect.objectContaining({ name: 'notes.txt' })])
    expect(onReject).toHaveBeenCalledWith([
      { file: expect.objectContaining({ name: 'huge.bin' }), reason: 'size' },
    ])
  })

  it('requires `onReject` in the type', () => {
    // The requirement, asserted where readers will find it: the vocabulary offers no FileUpload
    // without `onReject`. `@ts-expect-error` fails the typecheck gate as soon as the prop becomes
    // optional, which is the only way to test a type-level rule.
    const props: Omit<FileUploadProps, 'onReject'> = { onFilesAdd: noop, onRemove: noop }
    // @ts-expect-error — `onReject` is required (file-upload.md).
    const element = <FileUpload {...props} aria-label="Attachments" />
    expect(element).toBeTruthy()
  })
})

describe('the list', () => {
  it('renders one row per file, each with its status', () => {
    mount(
      <FileUpload
        files={[UPLOADING, DONE, FAILED]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    expect(screen.getAllByRole('listitem').map((row) => row.dataset['status'])).toEqual([
      'uploading',
      'done',
      'error',
    ])
  })

  it('shows progress with an accessible name, and the percentage beside it', () => {
    mount(
      <FileUpload
        files={[UPLOADING]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    const bar = screen.getByRole('progressbar', { name: 'quarterly-report.pdf upload progress' })
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect(screen.getByText('40%')).toBeTruthy()
  })

  it('renders the size the app gave it, formatted, and never guesses one', () => {
    mount(
      <FileUpload
        files={[DONE]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    expect(screen.getByText('13.9 KB')).toBeTruthy()

    // A file with no size gets no meta line rather than a guess.
    mount(
      <FileUpload
        files={[FAILED]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    expect(screen.queryByText('0 B')).toBeNull()
  })

  it('shows the app’s failure text and never writes its own', () => {
    mount(
      <FileUpload
        files={[{ id: 'd', name: 'broken.csv', status: 'error' }]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    const row = screen.getByRole('listitem')
    expect(row.dataset['status']).toBe('error')
    expect(row.textContent).toContain('broken.csv')
    expect(row.textContent).not.toMatch(/failed|error|invalid/i)
  })

  it('offers retry only where the app can handle one', async () => {
    const onRetry = vi.fn()
    mount(
      <FileUpload
        files={[FAILED]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()

    mount(
      <FileUpload
        files={[FAILED]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        onRetry={onRetry}
        aria-label="Attachments"
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledWith('c')
  })

  it('keeps a remove button on every status, because cancelling is the same request', async () => {
    const onRemove = vi.fn()
    mount(
      <FileUpload
        files={[UPLOADING, DONE, FAILED]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={onRemove}
        aria-label="Attachments"
      />,
    )
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: 'Remove quarterly-report.pdf' }))
    expect(onRemove).toHaveBeenCalledWith('a')
  })

  it('moves focus to the next row’s remove control once the app removes a file, else the previous one, else the zone', async () => {
    // The app removes each file a moment after the request, as one that asks a server first.
    function Held() {
      const [files, setFiles] = useState<FileUploadItem[]>([
        { id: 'a', name: 'a.txt', status: 'done' },
        { id: 'b', name: 'b.txt', status: 'done' },
        { id: 'c', name: 'c.txt', status: 'done' },
      ])
      return (
        <FileUpload
          aria-label="Attachments"
          files={files}
          onFilesAdd={noop}
          onReject={noop}
          onRemove={(id) =>
            setTimeout(() => setFiles((was) => was.filter((one) => one.id !== id)), 40)
          }
        />
      )
    }
    render(<Held />)
    const remove = (name: string) => screen.getByRole('button', { name: `Remove ${name}` })
    remove('b.txt').focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(remove('c.txt')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(remove('a.txt')))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(document.activeElement).toBe(zone()))
  })

  it('renders no list at all when there are no files', () => {
    const root = mount(
      <FileUpload onFilesAdd={noop} onReject={noop} onRemove={noop} aria-label="Attachments" />,
    )
    expect(root.querySelector('ul')).toBeNull()
  })
})

describe('announcements', () => {
  it('announces what finished and what failed, once, in a polite region', () => {
    const view = render(
      <FileUpload
        files={[{ ...UPLOADING }]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    const live = view.container.querySelector('[aria-live="polite"]') as HTMLElement
    // Nothing has changed yet, and the initial list is not an event.
    expect(live.textContent).toBe('')

    view.rerender(
      <FileUpload
        files={[{ ...UPLOADING, status: 'done' }]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    expect(live.textContent).toBe('quarterly-report.pdf uploaded')

    view.rerender(
      <FileUpload
        files={[{ ...UPLOADING, status: 'error', message: 'Connection lost' }]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    expect(live.textContent).toBe('quarterly-report.pdf failed: Connection lost')
  })
})

describe('inside FormField', () => {
  it('takes its name from the field label, by association', () => {
    render(
      <FormField label="Attachments" description="PDF or PNG">
        <FileUpload onFilesAdd={noop} onReject={noop} onRemove={noop} />
      </FormField>,
    )
    const button = screen.getByRole('button', { name: 'Attachments' })
    const describedBy = button.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toBe('PDF or PNG')
  })

  it('takes invalid from the field', () => {
    render(
      <FormField label="Attachments" error="At least one file">
        <FileUpload onFilesAdd={noop} onReject={noop} onRemove={noop} />
      </FormField>,
    )
    expect(screen.getByRole('button', { name: 'Attachments' }).getAttribute('aria-invalid')).toBe(
      'true',
    )
  })
})

describe('recipe', () => {
  it('draws the only dashed border in the system ("not yet content")', () => {
    mount(<FileUpload onFilesAdd={noop} onReject={noop} onRemove={noop} aria-label="Attachments" />)
    const painted = getComputedStyle(zone())
    expect(painted.borderTopStyle).toBe('dashed')
    expect(painted.borderTopColor).toBe(tokenColor('--pm-border-strong'))
    expect(painted.backgroundColor).toBe(tokenColor('--pm-bg-subtle'))
  })

  it('highlights during a drag and uses the focus halo', async () => {
    mount(<FileUpload onFilesAdd={noop} onReject={noop} onRemove={noop} aria-label="Attachments" />)
    drag('dragover', zone(), [file('notes.txt')])

    // The zone composes `stateFeedback`, so the colours *transition*. The assertion checks the
    // final values, not the frame they were sampled in.
    await vi.waitFor(() => {
      const painted = getComputedStyle(zone())
      expect(painted.backgroundColor).toBe(tokenColor('--pm-accent-subtle'))
      expect(painted.borderTopColor).toBe(tokenColor('--pm-accent-bg'))
    })
    // `glow.focus` is decorative and derives `none` in a theme without ornament. Pastel has
    // ornament `minimal`, so here it is a halo.
    expect(getComputedStyle(zone()).boxShadow).not.toBe('none')
  })

  it('shows the failure on the row', () => {
    const root = mount(
      <FileUpload
        files={[FAILED]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    const row = partOf(root, styles.row as string)
    expect(getComputedStyle(row).borderTopColor).toBe(tokenColor('--pm-danger-border'))
    expect(getComputedStyle(partOf(root, styles.message as string)).color).toBe(
      tokenColor('--pm-danger-text'),
    )
  })

  it('mutes the zone when disabled and shows a not-allowed cursor', () => {
    mount(
      <FileUpload
        disabled
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    const painted = getComputedStyle(zone())
    expect(painted.color).toBe(tokenColor('--pm-text-disabled'))
    expect(painted.borderTopColor).toBe(tokenColor('--pm-border-subtle'))
    expect(painted.cursor).toBe('not-allowed')
  })

  it('keeps a long name on one line rather than pushing the controls off it', () => {
    const root = mount(
      <FileUpload
        files={[{ id: 'e', name: `${'very-long-file-name-'.repeat(12)}.pdf`, status: 'done' }]}
        onFilesAdd={noop}
        onReject={noop}
        onRemove={noop}
        aria-label="Attachments"
      />,
    )
    const name = partOf(root, styles.name as string)
    expect(getComputedStyle(name).textOverflow).toBe('ellipsis')
    expect(name.getBoundingClientRect().width).toBeLessThan(
      partOf(root, styles.row as string).getBoundingClientRect().width,
    )
  })
})

/**
 * An agent reads the files and asks the application to remove or retry one, as the spec's
 * `agent` fence declares (`design/components/file-upload.md`, Agent). The rows' Buttons are the
 * member's own parts, so only the FileUpload is listed.
 */
describe('an agent', () => {
  const ROWS: FileUploadItem[] = [
    { id: 'a', name: 'quarterly-report.pdf', status: 'uploading', progress: 40 },
    { id: 'c', name: 'customer-export.csv', status: 'error', message: 'Too large' },
  ]

  it('reads the files, removes one and retries a failed one, through the application', async () => {
    const bridge = createAgentBridge()
    try {
      const onRemove = vi.fn()
      const onRetry = vi.fn()
      render(
        <FileUpload
          files={ROWS}
          onFilesAdd={noop}
          onReject={noop}
          onRemove={onRemove}
          onRetry={onRetry}
          aria-label="Attachments"
        />,
      )
      const { members } = bridge.snapshot()
      expect(members).toHaveLength(1)
      expect(members[0]).toMatchObject({
        member: 'FileUpload',
        name: 'Attachments',
        state: {
          files: ROWS,
          rows: [
            { id: 'a', label: 'quarterly-report.pdf' },
            { id: 'c', label: 'customer-export.csv' },
          ],
        },
      })
      const id = members[0]?.id
      // A query by a file's name finds the member and the file.
      expect(bridge.query({ name: 'customer-export' })).toEqual([
        expect.objectContaining({ id, option: { id: 'c', label: 'customer-export.csv' } }),
      ])

      const removed = await bridge.act([{ id, action: 'remove', value: 'a' }])
      expect(removed.results[0]).toMatchObject({ ok: true })
      expect(onRemove).toHaveBeenCalledWith('a')
      const retried = await bridge.act([{ id, action: 'retry', value: 'c' }])
      expect(retried.results[0]).toMatchObject({ ok: true })
      expect(onRetry).toHaveBeenCalledWith('c')

      // A file that has not failed is not retried.
      const refused = await bridge.act([{ id, action: 'retry', value: 'a' }])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
      expect(onRetry).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses a retry where the field offers none', async () => {
    const bridge = createAgentBridge()
    try {
      render(
        <FileUpload
          files={ROWS}
          onFilesAdd={noop}
          onReject={noop}
          onRemove={noop}
          aria-label="Attachments"
        />,
      )
      const [member] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: member?.id, action: 'retry', value: 'c' }])
      expect(results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('no retry') },
      })
    } finally {
      bridge.dispose()
    }
  })
})
