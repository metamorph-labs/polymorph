'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useFilter } from 'react-aria'

import {
  agentFill,
  dataAttrs,
  type FileRejection,
  fitTextarea,
  gateFiles,
  Icon,
  type IconRole,
  memberAttr,
  promptPick,
  promptToken,
  useAgentMember,
} from '@polymorph/react'

import { Button } from '../controls/Button'
import { Skeleton } from '../structure/Skeleton'
import { AttachmentChip, type AttachmentStatus } from './AttachmentChip'
import styles from '@polymorph/recipes/ai/prompt-input.module.css'

/**
 * The chat composer, where a prompt is written and sent
 * (`design/components/prompt-input.md`). It holds the prompt, its
 * attachments, and one control that sends the prompt or stops the reply.
 *
 * PromptInput is a Textarea with a specific job. A Textarea is a form field,
 * named by a FormField and submitted with the rest of the form. A composer is
 * the page's only field. It grows with the text, Enter sends it, and it has a
 * row of controls no form has: attach, the app's own slots (a model picker, a
 * tools menu), and send, which becomes stop while a reply is arriving. It is
 * not FileUpload. Files come in through the attach control, a drop or a
 * paste, and appear as chips in the frame, but the app owns the list and the
 * upload (FileUpload's rule, applied in full). `gateFiles` is FileUpload's
 * gate, from the engine, applied to every input path.
 *
 * Send and stop are deliberately one button. The control a reader uses to
 * start the model is the one they use to stop it, in the same place, so a
 * reply that is going wrong can be stopped where it was started.
 *
 * A trigger (`@`, `/`) opens a list of the app's suggestions above the
 * composer. The prompt stays plain text: a pick writes text in place of the
 * typed token and tells the app which option it was. Focus never leaves the
 * textarea, and `aria-activedescendant` names the active option, as in
 * Combobox. The token rule is the engine's `promptToken`.
 */

export interface PromptAttachment {
  id: string
  name: string
  size?: number
  status?: AttachmentStatus
  /** The app's text for a failure, which the composer never writes itself. */
  message?: string
}

export interface PromptInputMessages {
  send: string
  stop: string
  attach: string
  remove: (name: string) => string
  /** The status announced while a chip's file uploads. */
  uploading: (name: string) => string
  /** The status announced while the suggestion list is open. Default: `{count} suggestions`. */
  suggestions?: (count: number) => string
  /** The status while a trigger's options load. Default: `Loading suggestions…`. */
  loadingSuggestions?: string
  /** The list's one row, and the status, when no option matches. Default: `No results`. */
  noSuggestions?: string
}

export type PromptInputMaxRows = 4 | 6 | 8 | 12

/** One suggestion: a person, a command, a file. */
export interface PromptTriggerOption {
  /** The app's id, handed back in the pick. */
  id: string
  label: string
  /** A second line under the label. */
  description?: string
  icon?: IconRole
  /**
   * The text a pick writes in place of the typed token. Default: the
   * trigger's character and the label. An empty string writes nothing and
   * removes the token, for a pick the app acts on itself.
   */
  insert?: string
}

/**
 * A character that opens a list of suggestions. The member filters the
 * options by the text typed after the character, unless `filter` is `false`.
 */
export interface PromptTrigger {
  /** The one character that opens the list: `@`, `/`. */
  char: string
  /** The list's accessible name: `People`, `Commands`. */
  label: string
  options: PromptTriggerOption[]
  /**
   * Where the character opens the list: at the start of any word, after
   * whitespace or at the start of the prompt (`word`), or only as the
   * prompt's first character (`start`), where a command belongs.
   */
  at?: 'word' | 'start'
  /** Combobox's filter. `false` means the app filters, and its options are shown as given. */
  filter?: 'contains' | 'startsWith' | false
  /** The app is loading options: skeleton rows under the options. */
  loading?: boolean
  /** Called with the typed query when the list opens and each time the query changes. */
  onQueryChange?: (query: string) => void
  /** Called with the option a pick wrote, after the text has changed. */
  onSelect?: (option: PromptTriggerOption) => void
}

/**
 * The attachment handlers come as a pair or not at all. An `onAttach` without
 * an `onReject` would let the gate reject a file with no feedback
 * (FileUpload's reasoning), so `onAttach` requires `onReject`.
 */
type AttachmentProps =
  | {
      /** Receives files that passed the gate (from the attach button, a drop or a paste) and shows the attach button. */
      onAttach: (files: File[]) => void
      /** Receives the files the gate rejected with their reasons, which the app reports in its own words. */
      onReject: (rejections: FileRejection[]) => void
      /** The native `accept` syntax (`.pdf`, `image/*`), also applied to drops and pastes. */
      accept?: string
      /** When `false`, only one file is accepted at a time and the rest are rejected as `count`. */
      multiple?: boolean
      /** The maximum file size in bytes, above which a file never reaches `onAttach`. */
      maxSize?: number
    }
  | {
      onAttach?: undefined
      onReject?: undefined
      accept?: undefined
      multiple?: undefined
      maxSize?: undefined
    }

export type PromptInputProps = AttachmentProps & {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  /** Called on Enter or the send button, and required because a composer that cannot send is a Textarea. */
  onSubmit: (value: string) => void
  /** The stop button's handler while `streaming`. */
  onStop?: () => void
  /** Whether a reply is arriving, which turns send into stop and makes Enter do nothing. */
  streaming?: boolean
  disabled?: boolean
  placeholder?: string
  /** The field's accessible name, needed because a composer has no visible label. */
  label: string
  /** How tall the field may grow before it scrolls, in lines. */
  maxRows?: PromptInputMaxRows
  /** The chips in the frame, always controlled by the app. */
  attachments?: PromptAttachment[]
  onRemoveAttachment?: (id: string) => void
  /** The characters that open a list of suggestions: `@` for people, `/` for commands. */
  triggers?: PromptTrigger[]
  /** The toolbar's start slot for `sm` vocabulary controls, such as a model Select or a tools Menu. */
  leading?: ReactNode
  /** The toolbar's end, before the send control. */
  trailing?: ReactNode
  /** One line under the frame with the app's own note about what happens next. */
  hint?: string
  /** All of the controls' text (generic English defaults), which localized hosts replace. */
  messages?: PromptInputMessages
  /** Native passthrough, for a screen that has already moved the reader here. */
  autoFocus?: boolean
  id?: string
  name?: string
}

const DEFAULT_MESSAGES = {
  send: 'Send',
  stop: 'Stop',
  attach: 'Attach',
  remove: (name: string) => `Remove ${name}`,
  uploading: (name: string) => `${name}: uploading`,
  suggestions: (count: number) => `${count} suggestions`,
  loadingSuggestions: 'Loading suggestions…',
  noSuggestions: 'No results',
} satisfies Required<PromptInputMessages>

/** Three rows at option height, Combobox's loading rows. */
const SKELETON_ROWS = [0, 1, 2]

const NO_TRIGGERS: PromptTrigger[] = []

export function PromptInput(props: PromptInputProps) {
  const {
    value,
    defaultValue,
    onChange,
    onSubmit,
    onStop,
    streaming = false,
    disabled = false,
    placeholder,
    label,
    maxRows = 8,
    attachments = [],
    onRemoveAttachment,
    triggers = NO_TRIGGERS,
    leading,
    trailing,
    hint,
    messages = DEFAULT_MESSAGES,
    autoFocus = false,
    id,
    name,
    onAttach,
    onReject,
    accept,
    multiple = true,
    maxSize,
  } = props

  const root = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? '')
  const text = value ?? uncontrolled
  const [dragover, setDragover] = useState(false)

  const empty = text.trim() === '' && attachments.length === 0
  const attachable = onAttach !== undefined && !disabled

  /* The suggestion list -------------------------------------------------- */

  const uid = useId()
  const listId = `${uid}-suggestions`
  const optionId = (index: number) => `${uid}-suggestion-${index}`

  /**
   * The caret, while the field has focus and no range is selected. It is
   * read after each input, key, press and focus, and not while an input
   * method composes, so a composition opens nothing until it ends.
   */
  const [caret, setCaret] = useState<number | null>(null)
  const composing = useRef(false)
  /** The start of the token Escape closed the list on, which stays closed while the caret is in it. */
  const [dismissed, setDismissed] = useState<number | null>(null)
  /** The active option, by its index in the list for one query. */
  const [highlight, setHighlight] = useState<{ key: string; index: number }>({ key: '', index: 0 })
  /** Which side of the composer the list opens on: toward the larger space in the viewport. */
  const [side, setSide] = useState<'top' | 'bottom'>('top')
  /** Where the caret goes once a pick's text is in the field. */
  const placeCaret = useRef<number | null>(null)

  const { contains, startsWith } = useFilter({ sensitivity: 'base' })

  const token = disabled ? null : promptToken(text, caret, triggers)
  const trigger = token === null ? undefined : triggers[token.trigger]
  const open = token !== null && trigger !== undefined && token.start !== dismissed
  const query = token?.query ?? ''
  const shown =
    !open || trigger === undefined
      ? []
      : trigger.filter === false
        ? trigger.options
        : trigger.options.filter((option) =>
            (trigger.filter === 'startsWith' ? startsWith : contains)(option.label, query),
          )
  const loading = open && trigger?.loading === true
  /** The list for one trigger and one query: the active option starts at the first again. */
  const listKey = open ? `${token.trigger}:${token.start}:${query}` : ''
  const active =
    shown.length === 0
      ? -1
      : highlight.key === listKey
        ? Math.min(highlight.index, shown.length - 1)
        : 0

  const say = {
    suggestions: messages.suggestions ?? DEFAULT_MESSAGES.suggestions,
    loadingSuggestions: messages.loadingSuggestions ?? DEFAULT_MESSAGES.loadingSuggestions,
    noSuggestions: messages.noSuggestions ?? DEFAULT_MESSAGES.noSuggestions,
  }
  /** One live region, as Combobox's: a region that mounts with its words announces nothing. */
  const announcement = !open
    ? ''
    : loading
      ? say.loadingSuggestions
      : shown.length === 0
        ? say.noSuggestions
        : say.suggestions(shown.length)

  /**
   * The list the app last heard of, by trigger, token and query. The app
   * hears the query when the list opens and at each change while it is open,
   * from the event that changed it, as an input's own change is reported.
   */
  const reported = useRef<string | null>(null)

  /**
   * Reads the caret from the field, and tells the app a new query. A closed
   * token is forgotten once the caret is out of it. A field that does not
   * hold the composer's text yet is read at its next event, because the
   * caret in it belongs to the text before.
   */
  function track(element: HTMLTextAreaElement, nextText = text) {
    if (composing.current || element.value !== nextText) return
    const focused = element.ownerDocument.activeElement === element
    const next =
      focused && element.selectionStart === element.selectionEnd ? element.selectionStart : null
    const found = disabled ? null : promptToken(nextText, next, triggers)
    const closed = found !== null && found.start === dismissed ? dismissed : null
    setCaret(next)
    setDismissed(closed)
    const key =
      found === null || closed !== null ? null : `${found.trigger}:${found.start}:${found.query}`
    if (key === reported.current) return
    reported.current = key
    if (found !== null && key !== null) triggers[found.trigger]?.onQueryChange?.(found.query)
  }

  /**
   * The first Escape is the list's while it is open. A dialog's layer, Radix's
   * as Zag's, hears Escape on the document in the capture phase, before the
   * field does, and closes unless the key's default is prevented. So the
   * composer prevents it on the window, which the event reaches first, and the
   * field's own handler then closes the list. Combobox keeps its first Escape
   * the same way through its popover's layer.
   */
  useEffect(() => {
    const element = field.current
    const view = element?.ownerDocument.defaultView
    if (!open || element === null || view === null || view === undefined) return
    const hold = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && event.target === element && !event.isComposing) {
        event.preventDefault()
      }
    }
    view.addEventListener('keydown', hold, true)
    return () => view.removeEventListener('keydown', hold, true)
  }, [open])

  /** The side, measured when the list opens. */
  const openKey = open ? `${token.trigger}:${token.start}` : null
  useLayoutEffect(() => {
    if (openKey === null || root.current === null) return
    const box = root.current.getBoundingClientRect()
    setSide(box.top >= window.innerHeight - box.bottom ? 'top' : 'bottom')
  }, [openKey])

  useLayoutEffect(() => {
    const at = placeCaret.current
    if (at === null || field.current === null) return
    placeCaret.current = null
    field.current.setSelectionRange(at, at)
  })

  /**
   * A composer focused on mount has its caret at the end of the prompt, where
   * the reader goes on writing, as every generated shell's has. React fills a
   * textarea's first value as its text content, which leaves the caret at the
   * start; the shells set the value, which moves it to the end.
   */
  const mounted = useRef(false)
  useLayoutEffect(() => {
    if (mounted.current) return
    mounted.current = true
    const element = field.current
    if (!autoFocus || element === null || element.ownerDocument.activeElement !== element) return
    element.setSelectionRange(element.value.length, element.value.length)
    track(element)
  })

  function pick(index: number) {
    const option = shown[index]
    if (option === undefined || token === null || trigger === undefined || caret === null) return
    const next = promptPick(text, token, caret, option.insert ?? `${trigger.char}${option.label}`)
    setText(next.text)
    placeCaret.current = next.caret
    setCaret(next.caret)
    setDismissed(null)
    reported.current = null
    trigger.onSelect?.(option)
  }

  /** The list's keys while it is open. Returns whether the key was the list's. */
  function listKeys(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || token === null) return false
    const move = (index: number) => setHighlight({ key: listKey, index })
    switch (event.key) {
      case 'ArrowDown':
        if (shown.length === 0) return false
        event.preventDefault()
        move(Math.min(active + 1, shown.length - 1))
        return true
      case 'ArrowUp':
        if (shown.length === 0) return false
        event.preventDefault()
        move(Math.max(active - 1, 0))
        return true
      // Enter picks the active option. While the options load it does nothing, because they
      // are about to arrive. When nothing matches it sends, as with the list closed: the empty
      // row has said that nothing will be picked.
      case 'Enter':
        if (event.shiftKey || (active === -1 && !loading)) return false
        event.preventDefault()
        if (active !== -1) pick(active)
        return true
      case 'Tab':
        if (event.shiftKey || active === -1) return false
        event.preventDefault()
        pick(active)
        return true
      // Escape closes the list and keeps the text. A dialog around the composer stays open,
      // because the window listener below has prevented the key's default.
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        setDismissed(token.start)
        reported.current = null
        return true
      default:
        return false
    }
  }

  /* The field ----------------------------------------------------------- */

  /**
   * Textarea's autosize, always on. The field is one line tall until the
   * prompt needs two, so it is never a four-line box holding one word. The CSS
   * `max-block-size` keyed on `maxRows` sets the limit, and past it the field
   * scrolls.
   */
  const fit = useCallback(() => {
    if (field.current) fitTextarea(field.current)
  }, [])

  useLayoutEffect(fit, [fit, text])

  function setText(next: string) {
    setUncontrolled(next)
    onChange?.(next)
  }

  function submit() {
    if (disabled || streaming || empty) return
    onSubmit(text)
    // A sent prompt clears the field, in uncontrolled mode only. A controlled
    // value belongs to the app, which decides whether to clear or keep it.
    if (value === undefined) setUncontrolled('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // During IME composition every key belongs to the input method: Enter
    // commits the candidate, because sending would post half a word.
    if (event.nativeEvent.isComposing) return
    if (listKeys(event)) return
    // Enter sends and Shift+Enter inserts a new line.
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    submit()
  }

  /** FileUpload's gate, applied to every input path: the picker, a drop and a paste. */
  function add(list: FileList | File[] | null) {
    if (!attachable || list === null || list.length === 0) return
    const { accepted, rejected } = gateFiles(Array.from(list), { accept, multiple, maxSize })
    if (accepted.length > 0) onAttach?.(accepted)
    if (rejected.length > 0) onReject?.(rejected)
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files)
    if (!attachable || files.length === 0) return
    // Only a paste of files is intercepted. Pasted text keeps the default behaviour.
    event.preventDefault()
    add(files)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!attachable) return
    event.preventDefault()
    setDragover(false)
    add(event.dataTransfer.files)
  }

  const suggesting = triggers.length > 0

  /*
   * An agent writes the prompt through the field, as typing does (`agentFill`), so `onChange` is
   * called in either form, and sends and stops as the one control's two faces do. The composer's
   * own parts are withheld: the chips, the attach control and the send or stop control. The
   * toolbar also holds the app's `leading` and `trailing` controls, which stay an agent's, so the
   * parts are given one by one: the attach control is the toolbar's first element while there is
   * one, and the send or stop control is the end's last, after `trailing`.
   */
  const chips = useRef<HTMLDivElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  const end = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'PromptInput',
    element: () => field.current,
    state: () => ({
      value: text,
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        label: attachment.name,
        ...(onRemoveAttachment === undefined || disabled ? { disabled: true } : {}),
      })),
      streaming,
      disabled,
    }),
    actions: {
      fill: { argument: 'text', run: (next) => agentFill(field.current, next) },
      clear: () => agentFill(field.current, ''),
      submit: () => {
        if (streaming) throw new Error('A reply is arriving; stop it before sending a prompt.')
        if (empty) throw new Error('The prompt is empty, and an empty prompt is not sent.')
        submit()
      },
      stop: () => {
        if (!streaming) throw new Error('No reply is arriving, so there is nothing to stop.')
        onStop?.()
      },
      remove: { argument: 'id', run: (attachment) => onRemoveAttachment?.(attachment) },
    },
    withholds: () => [
      chips.current,
      onAttach === undefined ? null : toolbar.current?.firstElementChild,
      end.current?.lastElementChild,
    ],
  })

  return (
    <div
      ref={root}
      className={styles.root}
      {...dataAttrs({
        state: streaming ? 'streaming' : dragover ? 'dragover' : undefined,
        disabled,
      })}
      data-empty={empty ? '' : undefined}
      data-max-rows={String(maxRows)}
      {...memberAttr('PromptInput')}
    >
      <div
        className={styles.frame}
        onDragOver={(event) => {
          if (!attachable) return
          event.preventDefault()
          setDragover(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragover(false)
        }}
        onDrop={handleDrop}
      >
        {attachments.length === 0 ? null : (
          <div ref={chips} className={styles.attachments}>
            {attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id}
                name={attachment.name}
                size={attachment.size}
                status={attachment.status}
                message={attachment.message}
                removeLabel={messages.remove(attachment.name)}
                uploadingLabel={messages.uploading(attachment.name)}
                onRemove={
                  onRemoveAttachment === undefined || disabled
                    ? undefined
                    : () => onRemoveAttachment(attachment.id)
                }
              />
            ))}
          </div>
        )}

        <textarea
          ref={field}
          id={id}
          name={name}
          className={styles.field}
          rows={1}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={label}
          // The ARIA combobox pattern, on a textbox: it says it offers a list, which list
          // is open and which option is active. `aria-expanded` is not a textbox's.
          aria-autocomplete={suggesting ? 'list' : undefined}
          aria-haspopup={suggesting ? 'listbox' : undefined}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active !== -1 ? optionId(active) : undefined}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            setText(event.target.value)
            if (!(event.nativeEvent as InputEvent).isComposing) {
              track(event.target, event.target.value)
            }
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => track(event.currentTarget)}
          onPointerUp={(event) => track(event.currentTarget)}
          onFocus={(event) => track(event.currentTarget)}
          onBlur={() => {
            setCaret(null)
            reported.current = null
          }}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={(event) => {
            composing.current = false
            track(event.currentTarget)
          }}
          onPaste={handlePaste}
        />

        <div ref={toolbar} className={styles.toolbar}>
          {onAttach === undefined ? null : (
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              iconOnly
              icon="attach"
              label={messages.attach}
              disabled={disabled}
              onClick={() => picker.current?.click()}
            />
          )}
          {leading}

          <div ref={end} className={styles.end}>
            {trailing}
            {/* One button with two states. Stop is the quieter outline, because
                stopping is never dangerous and the reader is already at the control. */}
            {streaming ? (
              <Button
                variant="outline"
                tone="neutral"
                size="sm"
                iconOnly
                icon="stop"
                label={messages.stop}
                onClick={onStop}
              />
            ) : (
              <Button
                variant="solid"
                tone="accent"
                size="sm"
                iconOnly
                icon="send"
                label={messages.send}
                disabled={disabled || empty}
                onClick={submit}
              />
            )}
          </div>
        </div>

        {/* The file picker, opened by the attach button. It is FileUpload's
            hidden input, used for the same reasons as in FileUpload. */}
        {onAttach === undefined ? null : (
          <input
            ref={picker}
            type="file"
            className={styles.picker}
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            tabIndex={-1}
            onChange={(event) => {
              add(event.target.files)
              event.target.value = ''
            }}
          />
        )}
      </div>

      {hint === undefined ? null : <p className={styles.hint}>{hint}</p>}

      {/* The suggestions, on the side of the composer with more room. A press
          on them keeps focus in the field, as the caret's place is the token. */}
      {!open ? null : (
        <div
          className={styles.suggestions}
          data-side={side}
          data-prompt-part="suggestions"
          onMouseDown={(event) => event.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-label={trigger.label} className={styles.listbox}>
            {shown.map((option, index) => (
              <li
                key={option.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                className={styles.option}
                data-highlighted={index === active ? '' : undefined}
                onPointerMove={() => {
                  if (index !== active) setHighlight({ key: listKey, index })
                }}
                onClick={() => pick(index)}
              >
                {option.icon === undefined ? null : (
                  <span className={styles.glyph}>
                    <Icon name={option.icon} size="sm" />
                  </span>
                )}
                <span className={styles.text}>
                  <span className={styles.label}>{option.label}</span>
                  {option.description === undefined ? null : (
                    <span className={styles.description}>{option.description}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {loading ? (
            <div className={styles.rows} aria-hidden="true">
              {SKELETON_ROWS.map((row) => (
                <div key={row} className={styles.row}>
                  <Skeleton textStep="sm" />
                </div>
              ))}
            </div>
          ) : null}

          {/* Heard once, through the status region, so the visible row is hidden from it. */}
          {!loading && shown.length === 0 ? (
            <div className={styles.empty} aria-hidden="true">
              {say.noSuggestions}
            </div>
          ) : null}
        </div>
      )}

      {suggesting ? (
        <div role="status" aria-live="polite" className={styles.status}>
          {announcement}
        </div>
      ) : null}
    </div>
  )
}
