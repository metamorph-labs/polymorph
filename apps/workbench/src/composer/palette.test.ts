/**
 * @vitest-environment jsdom
 *
 * The palette's laws. Two checks:
 *
 *  - **The census.** Insertability is computed, and this pins the counts so any change to palette
 *    membership shows up as a test diff to review.
 *  - **Inserts start valid.** For every insertable member, the insert template placed in an empty
 *    Stack validates with no faults. This runs over the whole palette, not a sample.
 *
 * It uses jsdom because the palette calls `resolveComponent`. The component map imports the
 * vocabulary, whose module scope expects a DOM.
 */

import { validateSpec } from '@polymorph/spec/validate'
import type { ScreenSpec } from '@polymorph/spec/schema'
import { describe, expect, it } from 'vitest'

import { REGISTRY } from '../registry'
import { acceptsChildren, CODE_WIRED, controlFor, INSERTABLE, templateFor } from './palette'

describe('the census', () => {
  it('assigns every catalogue member to exactly one side', () => {
    expect(INSERTABLE.length + CODE_WIRED.length).toBe(REGISTRY.components.length)
  })

  it('pins the exact insertable and code-wired counts', () => {
    /*
     * Exact numbers, not a minimum. A minimum would let a member drop out of the palette without
     * a failure, for example through a new required callback or a prop whose printed type no
     * longer parses.
     *
     * Whoever changes these numbers states why in the change. A new required callback removes a
     * member from the palette, and a new control kind adds several. Both are real decisions to
     * review.
     *
     * Some members, and which side of the rule they fall on:
     *
     *  - SplitPane and ColorInput are insertable. Every required prop is a slot or a string.
     *  - ProviderButton (`provider`, `label`) and QRCode (`value`, `label`) are insertable. Their
     *    required props are a closed union and strings, which a document can express.
     *  - AvatarButton (`name`, `label`) is insertable. Its required props are strings.
     *  - Image (`src`, `alt`) is insertable. Its required props are strings.
     *  - JsonTree (`data`) and Carousel (`slides`) are code-wired. Their purpose is a payload a
     *    document cannot express.
     *  - ImageEditor is code-wired. `onConfirm` is a required callback that receives a Blob. The
     *    framed file is the member's only output, and a document cannot receive it.
     *  - CursorPagination is code-wired. `onPrevious` and `onNext` are required callbacks, and a
     *    pager without them does nothing.
     *  - SectionNav (`items`) is code-wired, as Breadcrumbs is. Its links are a payload a document
     *    cannot express.
     *  - List (`label`) is insertable. Its required prop is a string and its items are a slot.
     *  - Banner is insertable. Every prop is optional and its message is a slot.
     *  - Diff is insertable. Every prop is optional, and its two sides are strings.
     *  - Tree (`items`) is code-wired. Its hierarchy is a payload a document cannot express.
     *  - PhoneInput is insertable. Every prop is optional, and its value is a string.
     *  - ModeSwitch (`label`) is insertable. Its required prop is a string.
     *  - Highlight (`text`) is insertable. Its required prop is a string.
     *  - LogView (`lines`) is code-wired. Its lines are a payload that arrives at run time.
     *  - AudioPlayer (`src`, `label`) is insertable. Its required props are strings, and its
     *    handlers are optional.
     *  - RecordButton (`label`, `stopLabel`) is insertable. Its required props are strings, and
     *    `onStart` and `onStop` are optional, as Button's `onClick` is.
     *  - DurationInput is insertable. Every prop is optional, and its value is a number.
     *  - CommentThread (`label`) is insertable. Its required prop is a string and its comments are
     *    a slot.
     *  - Meter (`label`, `value`) is insertable. Its required props are a string and a number.
     *  - Countdown (`until`, `label`) is insertable. Its required props are strings.
     *  - MonthInput is insertable. Every prop is optional, and its month is a string.
     *  - Lightbox (`images`) is code-wired. Its pictures are a payload a document cannot express.
     *  - TreeSelect (`items`) is code-wired, as Tree is.
     *  - Rating (`label`) is insertable. Its required prop is a string.
     *  - InlineEdit is code-wired. `onCommit` is a required callback, and a field whose save
     *    reaches nothing loses what the reader typed.
     *  - TableOfContents (`items`) is code-wired. Its sections are a payload a document cannot
     *    express.
     *  - Tour (`steps`) is code-wired. Its steps are a payload a document cannot express.
     *  - Menubar (`menus`) is code-wired. Its menus are a payload of commands a document cannot
     *    express.
     *  - FunnelChart (`stages`) and Treemap (`items`) are code-wired, as every chart is. Their
     *    data is a payload a document cannot express.
     *  - MasterDetailPage is code-wired, as DetailPage is. `onBack` is a required callback, and
     *    on a phone a detail without it has no way back to the list.
     *  - SearchPage (`emptyState`) is code-wired, as ListPage is. Its empty state is a props
     *    object a document cannot express.
     *  - The conversation tier splits nine and five. ChatThread, ChatMessage, StreamingText,
     *    Markdown, AttachmentChip, ToolCall, ReasoningDisclosure, ArtifactPane and the
     *    ConversationPage archetype are insertable. Their required props are strings, closed
     *    unions and slots. PromptInput (`onSubmit`) and ApprovalCard (`onApprove`, `onDeny`) are
     *    code-wired by required callbacks, because without them the input sends nothing and the
     *    approval reaches no one. Citation (`source`), SourceList (`sources`) and Plan (`steps`)
     *    are code-wired by a payload a document cannot express.
     *  - RichTextContent (`value`) is code-wired. Its value is the rich-text JSON an app stored, a
     *    payload a document cannot express.
     */
    expect(INSERTABLE.length).toBe(85)
    expect(CODE_WIRED.length).toBe(56)
    expect(new Set(INSERTABLE.map((entry) => entry.component.name)).size).toBe(INSERTABLE.length)
  })

  it('excludes the expected members, each with its reason', () => {
    const reasons = new Map(CODE_WIRED.map((entry) => [entry.component.name, entry.codeWired]))
    expect(reasons.get('Toast')).toContain('no drawable component')
    expect(reasons.get('ConfirmDialog')).toContain('handler')
    expect(reasons.get('DataTable')).toBeDefined()
    expect(reasons.get('BarChart')).toBeDefined()
    // And the everyday members are in, not out.
    const names = new Set(INSERTABLE.map((entry) => entry.component.name))
    for (const expected of ['Stack', 'Inline', 'Grid', 'Card', 'Button', 'Badge', 'Heading']) {
      expect(names.has(expected), expected).toBe(true)
    }
  })

  it('reads the layout primitives as the insert-inside targets', () => {
    for (const name of ['Stack', 'Inline', 'Grid', 'Card']) {
      expect(acceptsChildren(name), name).toBe(true)
    }
    expect(acceptsChildren('Input')).toBe(false)
  })

  it('parses numeric step unions, so the space scale is offered', () => {
    const gap = REGISTRY.components
      .find((component) => component.name === 'Stack')
      ?.props.find((prop) => prop.name === 'gap')
    const control = gap === undefined ? null : controlFor(gap)
    expect(control?.kind).toBe('union')
    if (control?.kind === 'union') {
      expect(control.options).toContain(0)
      expect(control.options).toContain(10)
    }
  })
})

describe('every insert template validates', () => {
  for (const entry of INSERTABLE) {
    it(entry.component.name, () => {
      const spec: ScreenSpec = {
        spec: 'polymorph-screen/1',
        name: 'Probe',
        purpose: 'The born-lawful law.',
        inputs: [],
        root: { component: 'Stack', props: { gap: 4 }, children: [templateFor(entry.component)] },
      }
      expect(validateSpec(REGISTRY, spec).faults).toEqual([])
    })
  }
})
