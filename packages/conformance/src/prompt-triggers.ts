import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for PromptInput's mentions and commands
 * (`design/components/prompt-input.md`, Mentions and commands), which every
 * web shell's PromptInput test calls with a mount of its own, and the React
 * member's test too. A contract statement starts from a fixture entry and
 * changes no prop (`docs/conformance.md`), so the law types into the field
 * and changes the triggers itself, as the application around the composer
 * would when it loads options for a query.
 *
 * The law types from the keyboard, because the list follows the caret, and
 * the caret moves with real input. It waits for each reading, because a shell
 * commits a change a moment after the event. It dispatches the composition
 * events itself, because no test harness drives an input method.
 */

/** An option as the law passes it, in the shape of the member's `PromptTriggerOption`. */
export interface PromptLawOption {
  id: string
  label: string
  description?: string
  insert?: string
}

/** A trigger as the law passes it, in the shape of the member's `PromptTrigger`. */
export interface PromptLawTrigger {
  char: string
  label: string
  options: PromptLawOption[]
  at?: 'word' | 'start'
  filter?: 'contains' | 'startsWith' | false
  loading?: boolean
  onQueryChange?: (query: string) => void
  onSelect?: (option: PromptLawOption) => void
}

/** The member's messages, every key given. */
export interface PromptLawMessages {
  send: string
  stop: string
  attach: string
  remove: (name: string) => string
  uploading: (name: string) => string
  suggestions: (count: number) => string
  loadingSuggestions: string
  noSuggestions: string
}

/** What the law sets on the composer after it mounts. */
export interface PromptLawProps {
  /** `undefined` draws a composer without triggers. */
  triggers: PromptLawTrigger[] | undefined
  /** The prompt, while the application holds it. `undefined` hands it to the composer. */
  value: string | undefined
}

export interface PromptLawMount {
  /** The props the composer mounts with. */
  readonly props: PromptLawProps
  readonly defaultValue: string | undefined
  readonly messages: PromptLawMessages | undefined
  readonly onChange: (value: string) => void
  readonly onSubmit: (value: string) => void
}

export interface MountedPrompt {
  /** Sets props on the composer, as its parent's state would. */
  set(next: Partial<PromptLawProps>): void | Promise<void>
}

export interface PromptTriggersLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts a PromptInput labelled `Message` with the props and handlers given. */
  mount(options: PromptLawMount): Promise<MountedPrompt>
  /**
   * Mounts the same PromptInput, uncontrolled, inside an open, dismissible
   * Dialog titled `Compose`, whose `onOpenChange` is `options.onOpenChange`,
   * and keeps the Dialog open until it reports `false`.
   */
  mountInDialog(options: PromptLawDialogMount): Promise<void>
}

export interface PromptLawDialogMount {
  readonly triggers: PromptLawTrigger[]
  readonly onOpenChange: (open: boolean) => void
}

const PEOPLE: PromptLawOption[] = [
  { id: 'ada', label: 'Ada Lovelace', description: 'Engineering' },
  { id: 'grace', label: 'Grace Hopper' },
  { id: 'alan', label: 'Alan Turing' },
  { id: 'elodie', label: 'Élodie Martin' },
]

const COMMANDS: PromptLawOption[] = [
  { id: 'summarize', label: 'summarize' },
  { id: 'clear', label: 'clear', insert: '' },
  { id: 'cite', label: 'cite', insert: '/cite sources' },
]

const LABELS = [...PEOPLE, ...COMMANDS].map((option) => option.label)

const FRENCH: PromptLawMessages = {
  send: 'Envoyer',
  stop: 'Arrêter',
  attach: 'Joindre',
  remove: (name) => `Retirer ${name}`,
  uploading: (name) => `${name} : envoi`,
  suggestions: (count) => `${count} propositions`,
  loadingSuggestions: 'Chargement des propositions…',
  noSuggestions: 'Aucun résultat',
}

const root = () =>
  document.querySelector<HTMLElement>('[data-member="prompt-input"]') as HTMLElement

const field = () => root().querySelector('textarea') as HTMLTextAreaElement

const panel = () => root().querySelector<HTMLElement>('[data-prompt-part="suggestions"]')

const list = () => panel()?.querySelector<HTMLElement>('[role="listbox"]') ?? null

const options = () => [...(list()?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]

/** The label each option shows, read from its text, which holds its description too. */
const shown = () =>
  options().map((option) => LABELS.find((label) => option.textContent?.includes(label)))

/** The option `aria-activedescendant` names. */
function active(): HTMLElement | null {
  const id = field().getAttribute('aria-activedescendant')
  return id ? document.getElementById(id) : null
}

const status = () => root().querySelector<HTMLElement>('[role="status"]')

/** The panel's rows hidden from assistive technology: the loading rows and the empty row. */
const hiddenRows = () => [...(panel()?.querySelectorAll<HTMLElement>('[aria-hidden="true"]') ?? [])]

/** Two frames, in which a shell that commits after an event has committed. */
const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

const type = (text: string) => userEvent.keyboard(text)

const key = (name: string) => userEvent.keyboard(`{${name}}`)

/** The textarea's value, written as an input method writes it, past the framework's tracking. */
function compose(element: HTMLTextAreaElement, text: string, composing: boolean) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(element, text)
  element.setSelectionRange(text.length, text.length)
  element.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      isComposing: composing,
      inputType: composing ? 'insertCompositionText' : 'insertText',
      data: text.slice(-1),
    }),
  )
}

export function promptTriggersLaw({ shell, mount, mountInDialog }: PromptTriggersLaw): void {
  describe(`${shell} PromptInput — mentions and commands`, () => {
    beforeAll(installTestTheme)

    let spacer: HTMLElement | null = null

    afterEach(async () => {
      spacer?.remove()
      spacer = null
      await page.viewport(1280, 800)
    })

    /**
     * The composer with an `@` for people and a `/` for commands, the spies
     * in their handlers, and the application's `set`. `controlled` holds the
     * prompt in the application, which takes each change the composer reports.
     */
    async function composer({
      people = {},
      commands = {},
      triggers,
      defaultValue,
      controlled = false,
      messages,
    }: {
      people?: Partial<PromptLawTrigger>
      commands?: Partial<PromptLawTrigger>
      triggers?: PromptLawTrigger[] | null
      defaultValue?: string
      controlled?: boolean
      messages?: PromptLawMessages
    } = {}) {
      const onSelect = vi.fn<(option: PromptLawOption) => void>()
      const onQueryChange = vi.fn<(query: string) => void>()
      const onChange = vi.fn<(value: string) => void>()
      const onSubmit = vi.fn<(value: string) => void>()
      const given =
        triggers === null
          ? undefined
          : (triggers ?? [
              { char: '@', label: 'People', options: PEOPLE, onSelect, onQueryChange, ...people },
              {
                char: '/',
                label: 'Commands',
                at: 'start',
                options: COMMANDS,
                onSelect,
                ...commands,
              },
            ])
      // The composer cannot report before it is mounted, so the handler reads the mount when it runs.
      const mounted: { prompt?: MountedPrompt } = {}
      mounted.prompt = await mount({
        props: { triggers: given, value: controlled ? (defaultValue ?? '') : undefined },
        defaultValue: controlled ? undefined : defaultValue,
        messages,
        onChange: (next) => {
          onChange(next)
          if (controlled) void mounted.prompt?.set({ value: next })
        },
        onSubmit,
      })
      await vi.waitFor(() => expect(field()).not.toBeNull())
      field().focus()
      await vi.waitFor(() => expect(document.activeElement).toBe(field()))
      return {
        set: mounted.prompt.set.bind(mounted.prompt),
        onSelect,
        onQueryChange,
        onChange,
        onSubmit,
      }
    }

    /* ---------------------------------------------------------------------- */
    /* Where a list opens                                                     */
    /* ---------------------------------------------------------------------- */

    it('opens on @ at the start and after whitespace, named by the trigger, its first option active', async () => {
      await composer()
      await type('@')
      await vi.waitFor(() => expect(list()).not.toBeNull())
      expect(list()?.getAttribute('aria-label')).toBe('People')
      expect(shown()).toEqual(['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Élodie Martin'])
      expect(field().getAttribute('aria-controls')).toBe(list()?.id)
      expect(active()).toBe(options()[0])
      expect(active()?.getAttribute('aria-selected')).toBe('true')
      expect(options()[1]?.getAttribute('aria-selected')).toBe('false')
      expect(active()?.hasAttribute('data-highlighted')).toBe(true)
      expect(document.activeElement).toBe(field())
      await vi.waitFor(() => expect(status()?.textContent).toContain('4 suggestions'))

      // A space closes the list, and an @ after it opens it again.
      await type(' ')
      await vi.waitFor(() => expect(list()).toBeNull())
      expect(field().hasAttribute('aria-controls')).toBe(false)
      expect(field().hasAttribute('aria-activedescendant')).toBe(false)
      await type('and{Shift>}{Enter}{/Shift}@')
      await vi.waitFor(() => expect(list()).not.toBeNull())
    })

    it('says it offers a list whether or not one is open', async () => {
      await composer()
      expect(field().getAttribute('aria-autocomplete')).toBe('list')
      expect(field().getAttribute('aria-haspopup')).toBe('listbox')
      expect(status()?.textContent?.trim()).toBe('')
    })

    it('opens nothing for an @ inside a word, or for a command after the start', async () => {
      await composer()
      await type('ada@')
      await frames()
      expect(list()).toBeNull()
      await type(' then /')
      await frames()
      expect(list()).toBeNull()
    })

    it('opens a command’s list only as the prompt’s first character', async () => {
      await composer()
      await type('/')
      await vi.waitFor(() => expect(list()?.getAttribute('aria-label')).toBe('Commands'))
      expect(shown()).toEqual(['summarize', 'clear', 'cite'])
    })

    it('leaves a composer without triggers as it was', async () => {
      const { onSubmit } = await composer({ triggers: null })
      expect(field().hasAttribute('aria-autocomplete')).toBe(false)
      expect(field().hasAttribute('aria-haspopup')).toBe(false)
      expect(status()).toBeNull()
      await type('@')
      await frames()
      expect(panel()).toBeNull()
      await key('Enter')
      await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('@'))
    })

    /* ---------------------------------------------------------------------- */
    /* Filtering                                                              */
    /* ---------------------------------------------------------------------- */

    it('filters by the query, ignoring case and accents', async () => {
      await composer()
      await type('@LOVE')
      await vi.waitFor(() => expect(shown()).toEqual(['Ada Lovelace']))
      await key('Backspace')
      await key('Backspace')
      await key('Backspace')
      await key('Backspace')
      await type('elo')
      await vi.waitFor(() => expect(shown()).toEqual(['Élodie Martin']))
      await vi.waitFor(() => expect(status()?.textContent).toContain('1 suggestions'))
    })

    it('filters by the start of the label under `startsWith`, and not at all under `false`', async () => {
      const { set } = await composer({ people: { filter: 'startsWith' } })
      await type('@a')
      await vi.waitFor(() => expect(shown()).toEqual(['Ada Lovelace', 'Alan Turing']))

      await set({
        triggers: [{ char: '@', label: 'People', options: PEOPLE.slice(0, 2), filter: false }],
      })
      await type('zz')
      await vi.waitFor(() => expect(shown()).toEqual(['Ada Lovelace', 'Grace Hopper']))
    })

    it('says in its messages that nothing matches', async () => {
      await composer({ messages: FRENCH })
      await type('Ask @zz')
      await vi.waitFor(() => expect(status()?.textContent).toContain('Aucun résultat'))
      expect(options()).toEqual([])
      expect(field().hasAttribute('aria-activedescendant')).toBe(false)
      expect(hiddenRows().map((row) => row.textContent?.trim())).toEqual(['Aucun résultat'])

      await key('Backspace')
      await key('Backspace')
      await vi.waitFor(() => expect(status()?.textContent).toContain('4 propositions'))
    })

    it('sends on Enter when nothing matches, as with the list closed, and Shift+Enter breaks the line', async () => {
      const { onSubmit, onSelect } = await composer()
      await type('Mail me @home')
      await vi.waitFor(() => expect(status()?.textContent).toContain('No results'))

      await type('{Shift>}{Enter}{/Shift}')
      await vi.waitFor(() => expect(field().value).toBe('Mail me @home\n'))
      expect(onSubmit).not.toHaveBeenCalled()

      await type('@zz')
      await vi.waitFor(() => expect(status()?.textContent).toContain('No results'))
      await key('Enter')
      await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Mail me @home\n@zz'))
      expect(onSubmit).toHaveBeenCalledTimes(1)
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('sends nothing on Enter while the options load', async () => {
      const { onSubmit, onSelect } = await composer({
        triggers: [{ char: '@', label: 'People', options: [], filter: false, loading: true }],
      })
      await type('Ask @ad')
      await vi.waitFor(() => expect(status()?.textContent).toContain('Loading suggestions'))
      await key('Enter')
      await frames()
      expect(onSubmit).not.toHaveBeenCalled()
      expect(onSelect).not.toHaveBeenCalled()
      expect(field().value).toBe('Ask @ad')
    })

    it('asks the app for each query, and shows its loading rows until the options arrive', async () => {
      const onQueryChange = vi.fn<(query: string) => void>()
      const remote = (loading: boolean, options: PromptLawOption[]): PromptLawTrigger[] => [
        { char: '@', label: 'People', options, filter: false, loading, onQueryChange },
      ]
      const { set } = await composer({ triggers: remote(true, []) })
      await type('@')
      await vi.waitFor(() => expect(onQueryChange).toHaveBeenLastCalledWith(''))
      await vi.waitFor(() => expect(status()?.textContent).toContain('Loading suggestions'))
      // Three skeleton rows, and no empty row while the options load.
      expect(hiddenRows().length).toBeGreaterThan(0)
      expect(hiddenRows().some((row) => row.textContent?.includes('No results'))).toBe(false)

      await type('gr')
      await vi.waitFor(() => expect(onQueryChange).toHaveBeenLastCalledWith('gr'))
      expect(onQueryChange.mock.calls.map(([query]) => query)).toEqual(['', 'g', 'gr'])

      await set({ triggers: remote(false, [PEOPLE[1] as PromptLawOption]) })
      await vi.waitFor(() => expect(shown()).toEqual(['Grace Hopper']))
      expect(hiddenRows()).toEqual([])
      await vi.waitFor(() => expect(status()?.textContent).toContain('1 suggestions'))
      // The same query again asks nothing.
      expect(onQueryChange).toHaveBeenCalledTimes(3)
    })

    /* ---------------------------------------------------------------------- */
    /* The keys                                                               */
    /* ---------------------------------------------------------------------- */

    it('moves the active option with ArrowDown and ArrowUp, stops at each end, and keeps focus in the field', async () => {
      await composer()
      await type('@')
      await vi.waitFor(() => expect(active()).toBe(options()[0]))
      for (const index of [1, 2, 3, 3]) {
        await key('ArrowDown')
        await vi.waitFor(() => expect(active()).toBe(options()[index]))
      }
      expect(options()[3]?.getAttribute('aria-selected')).toBe('true')
      for (const index of [2, 1, 0, 0]) {
        await key('ArrowUp')
        await vi.waitFor(() => expect(active()).toBe(options()[index]))
      }
      expect(document.activeElement).toBe(field())
      // The caret did not move: the list took the keys.
      expect(field().selectionStart).toBe(1)
    })

    it('picks with Enter: the label after the character and a space, reported, and nothing sent', async () => {
      const { onSelect, onSubmit, onChange } = await composer()
      await type('Ask @gr')
      await vi.waitFor(() => expect(shown()).toEqual(['Grace Hopper']))
      await key('Enter')

      await vi.waitFor(() => expect(field().value).toBe('Ask @Grace Hopper '))
      expect(onSelect).toHaveBeenCalledTimes(1)
      expect(onSelect).toHaveBeenCalledWith(PEOPLE[1])
      expect(onChange).toHaveBeenLastCalledWith('Ask @Grace Hopper ')
      expect(onSubmit).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(field().selectionStart).toBe('Ask @Grace Hopper '.length))
      expect(list()).toBeNull()

      // The list is closed, so Enter sends.
      await key('Enter')
      await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Ask @Grace Hopper '))
    })

    it('picks with Tab, and with a press, and keeps focus in the field', async () => {
      const { onSelect } = await composer()
      await type('@')
      await vi.waitFor(() => expect(list()).not.toBeNull())
      await key('ArrowDown')
      await key('Tab')
      await vi.waitFor(() => expect(field().value).toBe('@Grace Hopper '))
      expect(document.activeElement).toBe(field())

      await type('and @al')
      await vi.waitFor(() => expect(shown()).toEqual(['Alan Turing']))
      await userEvent.click(options()[0] as HTMLElement)
      await vi.waitFor(() => expect(field().value).toBe('@Grace Hopper and @Alan Turing '))
      expect(document.activeElement).toBe(field())
      expect(onSelect.mock.calls.map(([option]) => option.id)).toEqual(['grace', 'alan'])
    })

    it('writes an option’s own text in place of the label', async () => {
      const { onSelect } = await composer()
      await type('/ci')
      await vi.waitFor(() => expect(shown()).toEqual(['cite']))
      await key('Enter')
      await vi.waitFor(() => expect(field().value).toBe('/cite sources '))
      expect(onSelect).toHaveBeenCalledWith(COMMANDS[2])
    })

    it('removes the token for an option that writes nothing, and reports the pick', async () => {
      const { onSelect } = await composer()
      await type('/cl')
      await vi.waitFor(() => expect(shown()).toEqual(['clear']))
      await key('Enter')
      await vi.waitFor(() => expect(onSelect).toHaveBeenLastCalledWith(COMMANDS[1]))
      expect(field().value).toBe('')
      expect(list()).toBeNull()
    })

    it('keeps the text after the caret, and puts the caret after the space that follows the pick', async () => {
      await composer({ defaultValue: 'Ask  about retries' })
      field().setSelectionRange(4, 4)
      await type('@gr')
      await vi.waitFor(() => expect(shown()).toEqual(['Grace Hopper']))
      await key('Enter')
      await vi.waitFor(() => expect(field().value).toBe('Ask @Grace Hopper about retries'))
      await vi.waitFor(() => expect(field().selectionStart).toBe('Ask @Grace Hopper '.length))
    })

    it('closes on Escape and keeps the text; the token stays closed, and the next one opens', async () => {
      const { onSubmit, onSelect } = await composer()
      await type('@gr')
      await vi.waitFor(() => expect(list()).not.toBeNull())
      await key('Escape')
      await vi.waitFor(() => expect(list()).toBeNull())
      expect(field().value).toBe('@gr')
      expect(document.activeElement).toBe(field())

      await type('a')
      await frames()
      expect(list()).toBeNull()
      await type(' @')
      await vi.waitFor(() => expect(list()).not.toBeNull())

      await key('Escape')
      await vi.waitFor(() => expect(list()).toBeNull())
      // The list is closed, so Enter sends the text as it is.
      await key('Enter')
      await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('@gra @'))
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('closes when focus leaves, and opens again when the caret returns to the token', async () => {
      await composer()
      await type('@gr')
      await vi.waitFor(() => expect(list()).not.toBeNull())
      field().blur()
      await vi.waitFor(() => expect(list()).toBeNull())
      // Where a scripted focus puts the caret is the engine's, so End puts it in the token.
      field().focus()
      await key('End')
      await vi.waitFor(() => expect(shown()).toEqual(['Grace Hopper']))
    })

    it('opens nothing during an input method’s composition, until it ends', async () => {
      await composer()
      await type('Ask ')
      const element = field()
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
      compose(element, 'Ask @', true)
      await frames()
      expect(list()).toBeNull()
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '@' }))
      await vi.waitFor(() => expect(list()).not.toBeNull())

      // While a composition runs, an arrow is the input method's.
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
      element.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          bubbles: true,
          cancelable: true,
          isComposing: true,
        }),
      )
      await frames()
      expect(active()).toBe(options()[0])
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))
    })

    it('picks in a controlled composer, through the value the app holds', async () => {
      const { onChange, onSelect } = await composer({ controlled: true })
      await type('Ask @al')
      await vi.waitFor(() => expect(shown()).toEqual(['Alan Turing']))
      await key('Enter')
      await vi.waitFor(() => expect(field().value).toBe('Ask @Alan Turing '))
      expect(onChange).toHaveBeenLastCalledWith('Ask @Alan Turing ')
      expect(onSelect).toHaveBeenCalledWith(PEOPLE[2])
      await vi.waitFor(() => expect(field().selectionStart).toBe('Ask @Alan Turing '.length))
    })

    it('closes the list on the first Escape inside a dialog, and the dialog on the second', async () => {
      const onOpenChange = vi.fn<(open: boolean) => void>()
      await mountInDialog({
        triggers: [{ char: '@', label: 'People', options: PEOPLE }],
        onOpenChange,
      })
      const dialog = () => document.querySelector('[role="dialog"]')
      await vi.waitFor(() => expect(dialog()?.contains(field())).toBe(true))
      field().focus()
      await vi.waitFor(() => expect(document.activeElement).toBe(field()))
      await type('@')
      await vi.waitFor(() => expect(list()).not.toBeNull())

      await key('Escape')
      await vi.waitFor(() => expect(list()).toBeNull())
      await frames()
      expect(onOpenChange).not.toHaveBeenCalled()
      expect(dialog()).not.toBeNull()
      expect(field().value).toBe('@')

      await key('Escape')
      await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })

    /* ---------------------------------------------------------------------- */
    /* Where the list is drawn                                                */
    /* ---------------------------------------------------------------------- */

    it('opens toward the larger space: below a composer at the top of the viewport', async () => {
      await composer()
      await type('@')
      await vi.waitFor(() => expect(panel()?.getAttribute('data-side')).toBe('bottom'))
      const box = root().getBoundingClientRect()
      expect(panel()?.getBoundingClientRect().top).toBeGreaterThanOrEqual(box.bottom)
    })

    it('opens toward the larger space: above a composer low in the viewport', async () => {
      spacer = document.createElement('div')
      spacer.style.blockSize = '640px'
      document.body.prepend(spacer)
      await composer()
      await type('@')
      await vi.waitFor(() => expect(panel()?.getAttribute('data-side')).toBe('top'))
      const box = root().getBoundingClientRect()
      expect(panel()?.getBoundingClientRect().bottom).toBeLessThanOrEqual(box.top)
    })

    it('stays anchored at the composer’s width on a phone, not drawn as a sheet', async () => {
      await page.viewport(420, 800)
      await composer()
      await type('@')
      await vi.waitFor(() => expect(panel()).not.toBeNull())
      const width = root().getBoundingClientRect().width
      expect(Math.abs((panel()?.getBoundingClientRect().width ?? 0) - width)).toBeLessThan(1)
      expect(panel()?.hasAttribute('data-presentation')).toBe(false)
      expect(root().contains(panel())).toBe(true)
    })
  })
}
