/**
 * The Svelte compiler's options for the vocabulary, read by `svelte-check`,
 * by the browser project in `vitest.config.ts` and by the build.
 *
 * The members are generated to the React members' DOM contract, which the axe
 * law and the conformance law check in the rendered document
 * (`src/laws.test.ts`, `src/conformance.test.ts`). The compiler's
 * accessibility hints read the markup instead, and some of them report
 * elements whose role the markup does not show or whose contract is React's.
 * Those are not reported, each for the reason beside it. Every other hint
 * fails `svelte-check`.
 */
const NOT_REPORTED = new Set([
  // A machine's props spread onto the element give it its role, which the hint does not read:
  // Select's trigger `<button>` is a `combobox`, MultiSelect's `<li>` an `option`. FileUpload's
  // drop zone carries its field's `aria-required` and `aria-invalid`, as the React member's does.
  'a11y_role_supports_aria_props_implicit',
  // CheckboxGroup marks its `group` invalid, as the React member does.
  'a11y_role_supports_aria_props',
  // A tab stop on an element whose role is spread from a machine (Calendar's days) or written
  // only while it applies (a region that scrolls: CodeBlock, ScrollArea, Table, ChatThread's log,
  // ArtifactPane, Carousel, a chart's plot), on SplitPane's focusable separator, and on a toast
  // card, which takes focus for its keyboard dismissal.
  'a11y_no_noninteractive_tabindex',
  // The keys of those focusable elements: SplitPane's separator, a toast card and a chart's plot.
  'a11y_no_noninteractive_element_interactions',
  // A pointer handler on an element whose keyboard path is another element's: Input's, TagInput's
  // and MultiSelect's frames focus the field inside, ColorInput reads Enter from its Input,
  // PromptInput's drop zone has an attach button, Stepper's step acts only while it renders as a
  // button, DataTable's selection cell keeps a click from selecting the row, and a chart's marks
  // are read by the keys on its plot.
  'a11y_no_static_element_interactions',
  // DataTable's selection cell, whose Checkbox takes the keys.
  'a11y_click_events_have_key_events',
  // A toolbar's keys on the toolbar, whose tab stop is one of its controls and not the toolbar,
  // as WAI-ARIA's toolbar pattern has it: RichTextInput's fixed toolbar and its selection bar.
  'a11y_interactive_supports_focus',
])

export default {
  compilerOptions: {
    warningFilter: (warning) => !NOT_REPORTED.has(warning.code),
  },
}
