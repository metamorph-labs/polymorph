import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, useState } from 'react'

import { Button, Card, Inline, Stack, ThirdParty } from '@polymorph/react-ui'

/**
 * A rich-text editor another library draws, hosted by the route in `docs/rules.md`.
 *
 * Tiptap draws the text a person edits and ships no stylesheet. What it renders takes its
 * appearance from attributes the application hands it, so this is the route's other half: the
 * theme reaches the editor through CSS. Each `style` below reads `--pm-*` custom properties,
 * which the boundary inherits, so the text follows the pairing, the mode and the density with no
 * code that watches them.
 *
 * The surface around the editor is a `<Card>`, and the toolbar is `<Button>`s that call the
 * editor's commands. The boundary holds only the element Tiptap draws into.
 */

/** A block of body text: the `md` type step in the primary colour. */
const BODY =
  'margin: 0; font-family: var(--pm-text-md-family); font-size: var(--pm-text-md-size); ' +
  'line-height: var(--pm-text-md-line-height); color: var(--pm-text-primary)'

/** A heading inside a note: the `lg` type step. */
const HEADING =
  'margin: 0; font-family: var(--pm-text-lg-family); font-size: var(--pm-text-lg-size); ' +
  'line-height: var(--pm-text-lg-line-height); font-weight: var(--pm-text-lg-weight); ' +
  'color: var(--pm-text-primary)'

/** A list keeps the body's type and takes its indent from the space scale. */
const LIST = `${BODY}; padding-inline-start: var(--pm-space-6)`

/** The editable surface: a column of blocks a space step apart, with room to click into. */
const SURFACE =
  'display: flex; flex-direction: column; gap: var(--pm-space-3); ' +
  'min-block-size: var(--pm-space-10); outline-offset: var(--pm-space-2); ' +
  'caret-color: var(--pm-accent-bg)'

export const NOTE =
  '<h2>Handover</h2>' +
  '<p>Eastfield is <strong>closed</strong> until the lift is repaired.</p>' +
  '<ul><li>Route its parcels to Riverside.</li><li>Tell the evening shift.</li></ul>'

type Mark = 'bold' | 'italic' | 'bulletList'

const MARKS: { mark: Mark; label: string }[] = [
  { mark: 'bold', label: 'Bold' },
  { mark: 'italic', label: 'Italic' },
  { mark: 'bulletList', label: 'List' },
]

export function NoteEditor({ label = 'Shift note' }: { label?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const [active, setActive] = useState<readonly Mark[]>([])

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const editor = new Editor({
      element: host,
      content: NOTE,
      extensions: [
        StarterKit.configure({
          paragraph: { HTMLAttributes: { style: BODY } },
          heading: { levels: [2], HTMLAttributes: { style: HEADING } },
          bulletList: { HTMLAttributes: { style: LIST } },
          orderedList: { HTMLAttributes: { style: LIST } },
        }),
      ],
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': label,
          style: SURFACE,
        },
      },
      // The toolbar shows which marks hold at the caret.
      onTransaction: ({ editor: current }) => {
        setActive(MARKS.map(({ mark }) => mark).filter((mark) => current.isActive(mark)))
      },
    })
    editorRef.current = editor
    return () => {
      editor.destroy()
      editorRef.current = null
    }
  }, [label])

  const toggle = (mark: Mark) => {
    const chain = editorRef.current?.chain().focus()
    if (mark === 'bold') chain?.toggleBold().run()
    if (mark === 'italic') chain?.toggleItalic().run()
    if (mark === 'bulletList') chain?.toggleBulletList().run()
  }

  return (
    <Card>
      <Stack gap={3}>
        <Inline gap={2}>
          {MARKS.map(({ mark, label: name }) => (
            <Button
              key={mark}
              variant="ghost"
              size="sm"
              label={name}
              pressed={active.includes(mark)}
              onClick={() => toggle(mark)}
            />
          ))}
        </Inline>
        <ThirdParty library="@tiptap/core" reason="Shift note: no member edits formatted text.">
          <div ref={hostRef} />
        </ThirdParty>
      </Stack>
    </Card>
  )
}
