import {
  cond,
  describeMember,
  each,
  el,
  emit,
  flag,
  identity,
  js,
  lit,
  member,
  run,
  text,
  when,
} from '../dsl'

const noop = js('() => undefined')

const UPLOADING = {
  id: 'a',
  name: 'quarterly-report.pdf',
  size: 2_411_724,
  status: 'uploading',
  progress: 40,
}
const DONE = { id: 'b', name: 'logo-mark.svg', size: 14_208, status: 'done' }
const FAILED = {
  id: 'c',
  name: 'customer-export.csv',
  size: 91_226_112,
  status: 'error',
  message: 'Larger than the 50 MB limit',
}

/** The handlers every entry passes: the app owns the list and what happens to it. */
const HANDLERS = { onFilesAdd: noop, onReject: noop, onRemove: noop, 'aria-label': 'Attachments' }

/** A row's small icon-only Button. */
const control = { variant: lit('ghost'), tone: lit('neutral'), size: lit('sm'), iconOnly: 'true' }

/**
 * FileUpload (`design/components/file-upload.md`): a dropzone and a file list
 * with upload states. The app owns the network: the member renders the files
 * and statuses it is given and asks for every action, and never writes a
 * failure's text. The zone is a real button, and a drop is an enhancement on
 * it; `accept`, `multiple` and `maxSize` are the engine's `gateFiles`, applied
 * to the picker and a drop alike, and a refused file comes back through
 * `reject` with its reason. A removed row stays where it was while it plays
 * its exit.
 */
export default describeMember({
  member: 'FileUpload',
  dir: 'controls',
  recipe: 'controls/file-upload',
  types: {
    FileUploadStatus: "'uploading' | 'done' | 'error'",
    FileUploadItem:
      '{ id: string; name: string; size?: number; status: FileUploadStatus; progress?: number; message?: string }',
  },
  defaults: {
    files: '() => []',
    multiple: 'true',
    title: lit('Drop files or click to browse'),
    disabled: 'false',
    invalid: 'false',
    // A finished file is announced with the app's words for a failure, never the member's.
    messages:
      "() => ({ retry: 'Retry', remove: (name: string) => `Remove ${name}`, progress: (name: string) => `${name} upload progress`, announcement: (file: FileUploadItem) => file.status === 'done' ? `${file.name} uploaded` : file.status === 'error' ? (file.message === undefined ? `${file.name} failed` : `${file.name} failed: ${file.message}`) : '', formatSize: formatBytes })",
  },
  statics: { controlKind: lit('group') },
  state: { dragover: 'false' },
  derived: {
    zoneState: "dragover ? 'dragover' : 'idle'",
    // The picker and a drop both end here, so the same three rules apply to both. No handler
    // receives an empty list: "some files arrived" and "none did" are different events.
    add: "(list: FileList | null | undefined) => !disabled && list != null && list.length > 0 && ((gate) => (gate.accepted.length > 0 && emit('filesAdd', gate.accepted), gate.rejected.length > 0 && emit('reject', gate.rejected)))(gateFiles(Array.from(list), { accept, multiple, maxSize }))",
  },
  listPresence: { rows: { of: 'files', key: '(file: FileUploadItem) => file.id' } },
  // The spec's `agent` fence. An agent reads the files the application lists, and removes or
  // retries one by its id, as the row's Buttons ask the application. It adds no file: a file is
  // on a person's disk. The rows' Buttons are the member's own parts, so it withholds them.
  agent: {
    on: 'zone',
    state: {
      files: 'files.map((file) => ({ ...file }))',
      rows: 'files.map((file) => ({ id: file.id, label: file.name }))',
      disabled: 'disabled',
      invalid: 'invalid',
    },
    actions: {
      remove: { argument: 'id', run: "emit('remove', value)" },
      retry: {
        argument: 'id',
        run: `(() => {
          if (listening.retry !== true) throw new Error('The field offers no retry.')
          if (files.find((file) => file.id === value)?.status !== 'error') throw new Error('Only a failed upload is retried.')
          emit('retry', value)
        })()`,
      },
    },
    withholds: 'root',
  },
  template: el(
    'div',
    {
      part: 'root',
      class: ['root'],
      // The region an agent's handle withholds.
      ref: 'root',
      // Mirrored from the zone, so the root reports the field's state.
      attrs: {
        'data-state': 'zoneState',
        'data-disabled': flag('disabled'),
        'data-invalid': flag('invalid'),
        ...identity('FileUpload'),
      },
    },
    [
      el(
        'button',
        {
          part: 'dropzone',
          class: ['zone'],
          // The control an agent's handle names.
          ref: 'zone',
          attrs: {
            type: lit('button'),
            disabled: 'disabled',
            'data-state': 'zoneState',
            'data-disabled': flag('disabled'),
            'data-invalid': flag('invalid'),
            'aria-label': 'ariaLabel',
            'aria-labelledby': 'ariaLabelledby',
            'aria-describedby': 'ariaDescribedby',
            'aria-required': 'ariaRequired',
            'aria-invalid': when('invalid', 'true'),
          },
          on: {
            click: run('picker?.click()'),
            // Without the default prevented, the browser opens the file instead of dropping it.
            dragover: run('($event.preventDefault(), !disabled && (dragover = true))'),
            // A move between the zone's own children is not a leave.
            dragleave: run(
              '(dragover = false)',
              '!($event.currentTarget as HTMLElement).contains($event.relatedTarget as Node | null)',
            ),
            drop: run(
              '($event.preventDefault(), (dragover = false), add($event.dataTransfer?.files))',
            ),
          },
        },
        [
          member('Icon', { name: lit('upload'), size: lit('lg') }),
          el('span', { part: 'title', class: ['title'] }, [text('title')]),
          cond('hint !== undefined', [
            el('span', { part: 'hint', class: ['hint'] }, [text('hint')]),
          ]),
        ],
      ),
      // The picker the zone opens: out of the tab order and the accessibility tree, where the
      // button stands for it, and still posting its files with a form.
      el('input', {
        part: 'picker',
        ref: 'picker',
        class: ['picker'],
        attrs: {
          type: lit('file'),
          accept: 'accept',
          multiple: 'multiple',
          name: 'name',
          disabled: 'disabled',
          tabindex: lit('-1'),
        },
        on: {
          // Cleared, so choosing the same file twice in a row is still a change.
          change: run(
            "(add(($event.target as HTMLInputElement).files), (($event.target as HTMLInputElement).value = ''))",
          ),
        },
      }),
      cond('files.length > 0', [
        el('ul', { part: 'list', class: ['list'] }, [
          each('rows', 'row', 'row.key', [
            member(
              'FileUploadRow',
              {
                file: 'row.item',
                open: 'row.open',
                size: 'row.item.size === undefined ? undefined : messages.formatSize(row.item.size)',
                retryable: 'listening.retry === true',
                retryLabel: 'messages.retry',
                removeLabel: 'messages.remove(row.item.name)',
                progressLabel: 'messages.progress(row.item.name)',
              },
              {
                on: {
                  retry: emit('retry', { args: ['row.item.id'] }),
                  remove: emit('remove', { args: ['row.item.id'] }),
                  done: run('row.done()'),
                },
              },
            ),
          ]),
        ]),
      ]),
      // One polite region, one node per file: a finished file is announced once, and a list
      // that arrives finished announces nothing, because nothing in it changed.
      el('span', { part: 'reader', class: ['reader'], attrs: { 'aria-live': lit('polite') } }, [
        each('files', 'file', 'file.id', [el('span', {}, [text('messages.announcement(file)')])]),
      ]),
    ],
  ),
  parts: [
    {
      name: 'Row',
      public: false,
      purpose: 'one file, with its status and its controls, playing its exit when it leaves',
      props: {
        file: { type: 'FileUploadItem' },
        open: {
          type: 'boolean',
          doc: 'False once the file has left the list, while the row plays its exit.',
        },
        size: { type: 'string', optional: true, doc: 'The size, formatted by the messages.' },
        retryable: { type: 'boolean', doc: 'The app handles a retry, so a failed row offers one.' },
        retryLabel: { type: 'string' },
        removeLabel: { type: 'string' },
        progressLabel: { type: 'string' },
        onRetry: { type: '() => void', optional: true },
        onRemove: { type: '() => void', optional: true },
        onDone: {
          type: '() => void',
          optional: true,
          doc: 'The exit has played, and the member can drop the row.',
        },
      },
      presence: { present: { open: 'open', ref: 'row', binding: 'fileupload.row' } },
      effects: [{ watch: 'present', mount: false, run: "present || emit('done')" }],
      template: el(
        'li',
        { part: 'row', ref: 'row', class: ['row'], attrs: { 'data-status': 'file.status' } },
        [
          el('span', { part: 'rowIcon', class: ['rowIcon'] }, [
            member('Icon', { name: lit('document') }),
          ]),
          el('span', { part: 'details', class: ['details'] }, [
            el('span', { part: 'name', class: ['name'] }, [text('file.name')]),
            cond('size !== undefined', [
              el('span', { part: 'meta', class: ['meta'] }, [text('size')]),
            ]),
            cond("file.status === 'error' && file.message !== undefined", [
              el('span', { part: 'message', class: ['message'] }, [text('file.message')]),
            ]),
          ]),
          cond("file.status === 'uploading'", [
            el('span', { part: 'trailing', class: ['trailing'] }, [
              el('span', { part: 'progress', class: ['progress'] }, [
                member('Progress', { value: 'file.progress ?? 0', label: 'progressLabel' }),
              ]),
              el('span', { part: 'percent', class: ['percent'] }, [
                text('`${Math.round(file.progress ?? 0)}%`'),
              ]),
            ]),
          ]),
          // Decorative: the status is in `data-status`, and the region has announced it.
          cond("file.status === 'done'", [
            el('span', { part: 'done', class: ['done'] }, [
              member('Icon', { name: lit('success') }),
            ]),
          ]),
          cond("file.status === 'error' && retryable", [
            member(
              'Button',
              { ...control, icon: lit('refresh'), label: 'retryLabel' },
              { on: { click: emit('retry') } },
            ),
          ]),
          // Every status: cancelling an upload and removing a finished file are one request.
          member(
            'Button',
            { ...control, icon: lit('close'), label: 'removeLabel' },
            { on: { click: emit('remove') } },
          ),
        ],
      ),
    },
  ],
  states: [
    {
      name: 'idle',
      props: { ...HANDLERS, hint: 'PDF, PNG or SVG · up to 50 MB' },
      expect: { 'data-state': 'idle' },
    },
    { name: 'uploading', props: { ...HANDLERS, files: [UPLOADING] } },
    {
      name: 'mixed list — one of each status',
      props: { ...HANDLERS, files: [UPLOADING, DONE, FAILED] },
    },
    { name: 'error with retry', props: { ...HANDLERS, files: [FAILED], onRetry: noop } },
    { name: 'invalid', props: { ...HANDLERS, invalid: true }, expect: { 'data-invalid': '' } },
    {
      name: 'disabled',
      props: { ...HANDLERS, disabled: true, files: [DONE] },
      expect: { 'data-disabled': '' },
    },
  ],
})
