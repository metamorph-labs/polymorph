/**
 * The segmented date and time field, described once for the members that
 * draw one: TimeInput, DatePicker, DateRangePicker and MonthInput.
 *
 * The React members render React Aria's segments (`date-segments.tsx`). A
 * described member, and the React MonthInput, which React Aria cannot draw
 * without a day, render the engine's segment model
 * (`@polymorph/engine`'s `fieldSegments`, `stepSegment`, `typeIntoSegment`,
 * `eraseSegment`) over a draft it holds, so every framework's field orders,
 * steps and fills its segments the same way. The builders here return the
 * nodes and the derived values a field needs; a member's description holds
 * them, as a chart holds the chart frame's (`chart-frame.ts`).
 */

import { cond, each, el, flag, lit, run, text, when, type Expr, type Node } from './dsl'

/**
 * The engine's date field functions an expression may call. A renderer
 * imports each from its foundation, which re-exports the engine.
 */
export const DATE_FIELD_HELPERS: readonly string[] = [
  // The values an agent sets, read from their ISO 8601 text.
  'agentDate',
  'agentDateRange',
  'agentDateTime',
  'agentMonth',
  'agentTime',
  'calendarDateOf',
  'dateFieldDraft',
  'dateFieldValue',
  'dateOutOfBounds',
  'fieldSegments',
  'eraseSegment',
  'monthDraft',
  'monthFieldValue',
  'monthOutOfBounds',
  'segmentValueText',
  'stepSegment',
  'timeDraft',
  'timeFieldValue',
  'typeIntoSegment',
]

/**
 * A calendar day's name, as React Aria writes it: the date, with `Today`,
 * `selected` and the first or last day that can be chosen said in words. The
 * words are English, which React Aria localizes, so a calendar in another
 * language names a day by its date alone rather than in two languages; the
 * cell's `aria-selected` and the day's `aria-current` say the same there. A
 * `derived` helper, which reads `english`, `minValue` and `maxValue` from the
 * member's scope: Calendar's grid and DateRangePicker's range grid hold it.
 */
export const DAY_NAME: Expr = `(date: zag.DateValue, text: string, today: boolean, selected: boolean) => {
      if (!english) return text
      const said = today ? (selected ? \`Today, \${text} selected\` : \`Today, \${text}\`) : selected ? \`\${text} selected\` : text
      if (minValue !== undefined && date.compare(minValue) === 0) return \`\${said}, First available date\`
      if (maxValue !== undefined && date.compare(maxValue) === 0) return \`\${said}, Last available date\`
      return said
    }`

/**
 * The locale a field or a calendar reads: the caller's `locale`, else `en-US`
 * until the member mounts and the browser's language after, which
 * `browserLanguage` holds. A server render has no browser, so its markup is in
 * `en-US`; a hydrated member's first render must be the server's, and the
 * browser's language arrives after mount, as React Aria's default locale does.
 */
export const LANGUAGE: Expr = "locale ?? browserLanguage ?? 'en-US'"

/** The browser's language, which `readBrowserLanguage` sets once the member mounts. */
export const BROWSER_LANGUAGE: Readonly<Record<string, Expr>> = {
  browserLanguage: 'undefined as string | undefined',
}

/**
 * The effect that reads the browser's language once the member has mounted.
 * `rebuild` makes the draft again for it, for a field whose draft follows the
 * locale's clock (a 12-hour draft holds a day period); the reader cannot have
 * typed before mount, so the draft is still the supplied value's.
 */
export const readBrowserLanguage = (rebuild?: Expr): { run: Expr } => ({
  run:
    rebuild === undefined
      ? 'browserLanguage = globalThis.navigator?.language'
      : `(browserLanguage = globalThis.navigator?.language), locale === undefined && (${rebuild})`,
})

/** A segmented field a member holds: its draft, its options and what it does with a new draft. */
export interface SegmentField {
  /** The `state` value that holds the draft (`draft`, `startDraft`). */
  draft: string
  /** The `derived` value that holds the field's options (`DateFieldOptions`). */
  options: string
  /** The `derived` function the field calls with each new draft, which stores it and reports it. */
  commit: string
  /** The `derived` value that holds the segments (`fieldSegments` over the draft). */
  segments: string
  /** The `derived` value that holds the keyboard handler, which the builder writes. */
  keys: string
  /** The `derived` value that holds the text-input handler, which the builder writes. */
  input: string
  /** Whether the reader may edit the segments; a read-only or disabled field moves focus and edits nothing. */
  editable: Expr
  /** Whether the field is read-only, for `aria-readonly`, when the member has the prop. */
  readOnly?: Expr
  /** Whether the field's value is invalid, for each segment's `aria-invalid`. */
  invalid: Expr
  /** A statement Alt+ArrowDown runs in a segment (DatePicker opens its calendar), or none. */
  open?: Expr
}

/** The type of one of a field's segments, written so a description's function can name it. */
const SEGMENT = 'ReturnType<typeof fieldSegments>[number]'

/**
 * The values every segmented field reads, once per member: a segment's name
 * for assistive software, and the move between segments. The segments a
 * reader moves among are every segment of the member's group, so ArrowRight
 * at the end of a range's start moves into its end.
 */
export const SEGMENT_SHARED: Readonly<Record<string, Expr>> = {
  // The segment's part, as the locale names it ("hour", "AM/PM"): its name inside the field's.
  segmentName: `(type: string): string => { try { return new Intl.DisplayNames(language, { type: 'dateTimeField' }).of(type) ?? type } catch { return type } }`,
  // Focus moves to the segment `step` places away in the field's group, staying put at either end.
  moveSegment: `(from: EventTarget | null, step: number): void => { if (!(from instanceof HTMLElement)) return; const all = [...(from.closest('[role="group"]')?.querySelectorAll<HTMLElement>('[data-segment]') ?? [])]; all[all.indexOf(from) + step]?.focus() }`,
}

/**
 * A field's keyboard and text handlers, as `derived` functions over its
 * draft. ArrowLeft and ArrowRight move between segments (reversed in a
 * right-to-left document). ArrowUp and ArrowDown step the segment, wrapping
 * at its ends. A digit, or a day period's first letter, types into it and
 * moves on once nothing more could fit. Backspace and Delete erase its last
 * digit, and in an empty segment move back. A read-only or disabled field
 * moves focus and edits nothing. `typed` is what the reader has typed into the
 * focused segment since it took focus, which the member holds.
 */
export function segmentHandlers(field: SegmentField): Record<string, Expr> {
  const step = `(event.key === 'ArrowRight') === (getComputedStyle(event.currentTarget as HTMLElement).direction !== 'rtl') ? 1 : -1`
  const type = `(key: string): void => { const next = typeIntoSegment(${field.draft}, segment.type, typed, key, ${field.options}); typed = next.typed; ${field.commit}(next.draft); if (next.advance) moveSegment(event.currentTarget, 1) }`
  return {
    [field.keys]: [
      `(event: KeyboardEvent, segment: ${SEGMENT}): void => {`,
      "if (segment.type === 'literal') return;",
      ...(field.open === undefined
        ? []
        : [
            `if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); ${field.open}; return }`,
          ]),
      `if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); typed = ''; moveSegment(event.currentTarget, ${step}); return }`,
      "if (event.ctrlKey || event.metaKey || event.key === 'Tab') return;",
      `const editable = ${field.editable};`,
      `if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); typed = ''; if (editable) ${field.commit}(stepSegment(${field.draft}, segment.type, event.key === 'ArrowUp' ? 1 : -1, ${field.options})); return }`,
      `if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); typed = ''; if (!editable) return; if (${field.draft}[segment.type] === undefined) moveSegment(event.currentTarget, -1); else ${field.commit}(eraseSegment(${field.draft}, segment.type, ${field.options})); return }`,
      `if (event.key.length !== 1) return;`,
      'event.preventDefault();',
      `if (editable) (${type})(event.key)`,
      '}',
    ].join(' '),
    // Text that arrives without a key a keyboard names (a phone's keyboard): each character, typed.
    [field.input]: [
      `(event: Event, segment: ${SEGMENT}): void => {`,
      'event.preventDefault();',
      `if (segment.type === 'literal' || !(${field.editable})) return;`,
      `const data = (event as InputEvent).data ?? '';`,
      `for (const key of data) { const next = typeIntoSegment(${field.draft}, segment.type, typed, key, ${field.options}); typed = next.typed; ${field.commit}(next.draft); if (next.advance) { moveSegment(event.currentTarget, 1); break } }`,
      '}',
    ].join(' '),
  }
}

/**
 * What a segment says to assistive software as its value: its text, or the
 * member's word for an empty segment, `say.empty`, which every member that
 * draws a segment row holds.
 */
const VALUE_TEXT = 'segment.placeholder ? say.empty : segment.text'

/**
 * A field's segments, in the locale's order, each a spinbutton, with the
 * locale's separators between them as hidden text, drawn with the member's
 * recipe's `segments`, `segment` and `separator`. `key` tells a member's two
 * fields apart (a range's `start` and `end`), and `half` names the field
 * inside the member's group, before each segment's part. `valueText` is what
 * a segment says as its value, when the member words it itself (MonthInput's
 * `segmentValueText`).
 */
export function segmentRow(
  field: SegmentField,
  options: {
    key: string
    half?: Expr
    attrs?: Readonly<Record<string, Expr>>
    valueText?: Expr
  },
): Node {
  const part = 'segmentName(segment.type)'
  return el('div', { part: 'segments', class: ['segments'], attrs: options.attrs ?? {} }, [
    each(
      field.segments,
      'segment',
      `\`${options.key}-\${segment.type}-\${at}\``,
      [
        cond(
          "segment.type === 'literal'",
          [
            el(
              'span',
              { part: 'separator', class: ['separator'], attrs: { 'aria-hidden': lit('true') } },
              [text('segment.text')],
            ),
          ],
          [
            el(
              'div',
              {
                part: 'segment',
                class: ['segment'],
                attrs: {
                  role: lit('spinbutton'),
                  id: `\`\${uid}-${options.key}-\${segment.type}\``,
                  // The segment's part ("hour"), read after the field's name where one is referenced.
                  'aria-label':
                    options.half === undefined ? part : `\`\${${options.half}}, \${${part}}\``,
                  'aria-labelledby': when(
                    'ariaLabelledby',
                    `\`\${ariaLabelledby} \${uid}-${options.key}-\${segment.type}\``,
                  ),
                  'aria-describedby': 'ariaDescribedby',
                  'aria-valuenow': 'segment.placeholder ? undefined : segment.value',
                  'aria-valuemin': 'segment.min',
                  'aria-valuemax': 'segment.max',
                  'aria-valuetext': options.valueText ?? VALUE_TEXT,
                  'aria-required': when('ariaRequired', lit('true')),
                  ...(field.readOnly === undefined
                    ? {}
                    : { 'aria-readonly': when(field.readOnly, lit('true')) }),
                  'aria-disabled': when('disabled', lit('true')),
                  'aria-invalid': when(field.invalid, lit('true')),
                  // Editable text, so a phone shows its keyboard; the handlers write every change.
                  contenteditable: `(${field.editable}) ? 'true' : undefined`,
                  inputmode: "segment.type === 'dayPeriod' ? undefined : 'numeric'",
                  spellcheck: lit('false'),
                  tabindex: "disabled ? undefined : '0'",
                  'data-segment': 'segment.type',
                  'data-placeholder': flag('segment.placeholder'),
                  'data-disabled': flag('disabled'),
                },
                on: {
                  focus: run("typed = ''"),
                  keydown: run(`${field.keys}($event, segment)`),
                  beforeinput: run(`${field.input}($event, segment)`),
                },
              },
              [text('segment.text')],
            ),
          ],
        ),
      ],
      'at',
    ),
  ])
}
