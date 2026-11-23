/**
 * The contract fields a native rendering does not draw, each with the reason.
 *
 * A member keeps its props on every platform, so a prop that means nothing on
 * a phone is still a field of the member's contract there. An app can pass it,
 * and nothing shows. Each such field is listed here once. The law of drawn
 * props (`drawn.ts`, run by `laws.test.ts` and `kotlin-laws.test.ts`) fails on
 * a field no entry names that a rendering never reads, or reads only to write
 * it into its identifier. It also fails on an entry that names a field a
 * rendering reads for anything else. The identifier (`pmMember`'s attributes)
 * is what the tests and the audits read: no person sees or hears it, so a prop
 * recorded there and nowhere else is listed here.
 */
export interface UndrawnProps {
  /**
   * The fields, as the contract names them. A field of the member's own props
   * is its name (`ariaLabelledby`). A field of any other struct of the
   * contract is the struct's name without `PM`, a dot, and the field
   * (`CitationSource.snippet`).
   */
  props: readonly string[]
  /** Why the renderings listed do not draw them. */
  reason: string
  /**
   * The members whose SwiftUI rendering draws none of the props it has of
   * these: it never reads them, or reads them only for its identifier.
   */
  ios?: readonly string[]
  /** The same for the members' Compose renderings. */
  android?: readonly string[]
}

/** The members with a form control's document wiring, on both platforms. */
const NAMED_CONTROLS = [
  'Checkbox',
  'CheckboxGroup',
  'ColorInput',
  'Combobox',
  'DatePicker',
  'DateRangePicker',
  'DurationInput',
  'Input',
  'MonthInput',
  'MultiSelect',
  'NumberInput',
  'OTPInput',
  'PasswordInput',
  'PhoneInput',
  'PromptInput',
  'RadioGroup',
  'Rating',
  'SearchInput',
  'Select',
  'Switch',
  'TagInput',
  'Textarea',
  'TimeInput',
  'TreeSelect',
] as const

/** The members that take the ids of the elements that label or describe them, on both platforms. */
const RELATED_BY_ID = [
  'Button',
  'Calendar',
  'Checkbox',
  'CheckboxGroup',
  'ColorInput',
  'Combobox',
  'DatePicker',
  'DateRangePicker',
  'DurationInput',
  'FileUpload',
  'InlineEdit',
  'Input',
  'MonthInput',
  'MultiSelect',
  'NumberInput',
  'OTPInput',
  'PasswordInput',
  'PhoneInput',
  'ProviderButton',
  'RadioGroup',
  'Rating',
  'SearchInput',
  'Select',
  'Slider',
  'Switch',
  'TagInput',
  'Textarea',
  'TimeInput',
  'TreeSelect',
] as const

/** The controls that say they are required only through their FormField, on both platforms. */
const REQUIRED_BY_FIELD = [
  'CheckboxGroup',
  'ColorInput',
  'Combobox',
  'DatePicker',
  'DateRangePicker',
  'DurationInput',
  'FileUpload',
  'Input',
  'MonthInput',
  'MultiSelect',
  'NumberInput',
  'OTPInput',
  'PasswordInput',
  'PhoneInput',
  'RadioGroup',
  'Select',
  'Slider',
  'TagInput',
  'Textarea',
  'TimeInput',
  'TreeSelect',
] as const

/** The layout and scope members that take the web's element name, on both platforms. */
const ELEMENT_BY_NAME = ['Card', 'DensityScope', 'Grid', 'Inline', 'Stack', 'ToneScope'] as const

export const UNDRAWN: readonly UndrawnProps[] = [
  {
    props: ['id'],
    reason:
      'The web element’s id, which a label, an ARIA relation or a script points at. A SwiftUI ' +
      'view and a Compose node have no id another view refers to. A FormField names and ' +
      'describes its control through the field context (`\\.pmField`, `LocalPMField`). ' +
      'SwiftUI’s FormField reads its own `id` into that context and its identifier, and ' +
      'Compose’s does not.',
    ios: [...NAMED_CONTROLS, 'ImageEditor'],
    android: [...NAMED_CONTROLS, 'FormField', 'ImageEditor'],
  },
  {
    props: ['id'],
    reason:
      'The web heading’s id, which a fragment link (`#id`) and a TableOfContents item name. A ' +
      'native screen has no address with a fragment: a TableOfContents link opens `#id` through ' +
      'the app’s open-URL action or URI handler, and the app finds the section in its own ' +
      'scroll view, so the heading draws nothing from its id.',
    ios: ['Heading'],
    android: ['Heading'],
  },
  {
    props: ['name', 'startName', 'endName'],
    reason:
      'The name a web form submits the control’s value under. A native screen submits no ' +
      'form: the app holds each value and sends it itself (`design/native/screen-contract.md`).',
    ios: [...NAMED_CONTROLS, 'FileUpload'],
    android: [...NAMED_CONTROLS, 'FileUpload'],
  },
  {
    props: ['value'],
    reason:
      'The value a web form submits for a checked box or switch. A native screen submits no ' +
      'form, and the app reads the state from `checked`.',
    ios: ['Checkbox', 'Switch'],
    android: ['Checkbox', 'Switch'],
  },
  {
    props: ['ariaControls', 'ariaDescribedby', 'ariaLabelledby'],
    reason:
      'Each holds the ids of other elements: what the control controls, and what labels and ' +
      'describes it. No native view has an id to point at. A control is named by `ariaLabel` ' +
      'or its FormField’s label, and described by its FormField, through the field context.',
    ios: RELATED_BY_ID,
    android: RELATED_BY_ID,
  },
  {
    props: ['ariaRequired'],
    reason:
      'iOS has no accessibility trait, and Compose no semantics property, that says a control ' +
      'is required. A FormField draws the required marker beside its label. Checkbox and ' +
      'Switch draw the marker in their own row label, so they read the prop. CheckboxGroup and ' +
      'RadioGroup have no label of their own to draw it in, and record the prop in their ' +
      'identifier.',
    ios: REQUIRED_BY_FIELD,
    android: REQUIRED_BY_FIELD,
  },
  {
    props: ['as'],
    reason:
      'It chooses the web’s element: a section, an article, a list, a navigation region or a ' +
      'form. A SwiftUI view and a Compose node have no element name, and no rendering listed ' +
      'draws a landmark, a list or a form from it. Each records the value in its identifier.',
    ios: ELEMENT_BY_NAME,
    android: ELEMENT_BY_NAME,
  },
  {
    props: ['stickyHeader'],
    reason:
      'SwiftUI pins only a section header of a lazy stack, and Compose only a sticky header of ' +
      'a lazy list, each inside its own scroll container. Table and DataTable are plain stacks ' +
      'in the screen’s scroll container, which they do not own, so the header row scrolls away ' +
      'with the rows. Each records the value in its identifier.',
    ios: ['DataTable', 'Table'],
    android: ['DataTable', 'Table'],
  },
  {
    props: ['stickyAside'],
    reason:
      'SwiftUI pins only a section header of a lazy stack, and Compose only a sticky header of ' +
      'a lazy list. DetailPage draws its aside beside the main column inside the page’s one ' +
      'scroll container (`PMPageRegions`), where a column has neither, so the aside scrolls ' +
      'with the page.',
    ios: ['DetailPage'],
    android: ['DetailPage'],
  },
  {
    props: ['titleEdit'],
    reason:
      'It holds an InlineEdit of the page’s title. Beside the heading, the heading would have to ' +
      'hide while the InlineEdit’s field is open, and neither rendering reads that state from ' +
      'the view the app passes. Each rendering draws the title as its heading, and an app ' +
      'renames the page’s subject from one of its actions.',
    ios: ['Dashboard', 'DetailPage', 'PageHeader'],
    android: ['Dashboard', 'DetailPage', 'PageHeader'],
  },
  {
    props: ['locale'],
    reason:
      'It names the locale whose digits and decimal sign the member writes its numbers in. ' +
      'Compose’s common code has no locale-aware number formatter, and the member module ' +
      'reaches no platform formatter, so the numbers are Western digits with a point before ' +
      'the fraction. An app that writes them otherwise passes `messages`, whose functions ' +
      'receive the value. Countdown’s words for the time left are `PMStrings`’ English, which ' +
      'an app translates through `LocalPMStrings`.',
    android: ['Countdown', 'Rating'],
  },
  {
    props: ['resize'],
    reason:
      'It chooses whether the web’s field has a resize handle. iOS and Android draw none: a ' +
      'field is as tall as its rows or its content. Each rendering records the value in its ' +
      'identifier.',
    ios: ['Textarea'],
    android: ['Textarea'],
  },
  {
    props: ['reason'],
    reason:
      'The reason is for a reviewer reading the inventory, not for a person using the screen. ' +
      'The web carries it on the wrapper’s attribute; a native identifier’s values hold no ' +
      'spaces, and a reason is a sentence.',
    ios: ['Bespoke'],
    android: ['Bespoke'],
  },
  {
    props: ['navigation'],
    reason:
      'It lays the web’s rail along the top row of a wide window. Each platform draws its own ' +
      'frame instead: a stack with the rail in a drawer on a phone, and the rail beside the ' +
      'content on a tablet. Neither has a bar of first-level destinations for one view the ' +
      'app composes: iPadOS’s tab bar is a `TabView`, which needs each destination’s label and ' +
      'view.',
    ios: ['AppShell'],
    android: ['AppShell'],
  },
  {
    props: ['defaultOpen'],
    reason:
      'The system’s menu and colour picker open only from a person’s tap, so nothing can open ' +
      'them when the member first draws.',
    ios: ['ColorInput', 'Select'],
  },
  {
    props: ['presentation'],
    reason:
      'It chooses between the web’s anchored panel and its sheet on a narrow viewport. Each ' +
      'rendering listed has the one form its platform gives it at each width: the system’s menu ' +
      'picker, an action sheet, Material’s dropdown menu, date dialog or bottom sheet, and a ' +
      'popover that is a sheet on a phone and anchored on a tablet.',
    ios: ['ConfirmDialog', 'Popover', 'Select'],
    android: ['Combobox', 'ConfirmDialog', 'DatePicker', 'DateRangePicker', 'Popover', 'Select'],
  },
  {
    props: ['alert'],
    reason:
      'A sheet and a dialog window are already modal to assistive technology, which is what ' +
      '`alertdialog` adds on the web.',
    ios: ['Dialog'],
    android: ['Dialog'],
  },
  {
    props: ['initialFocus'],
    reason:
      'The footer is content the overlay cannot reach into to focus one of its controls. ' +
      'VoiceOver and TalkBack start on the title, as on every sheet and dialog window.',
    ios: ['Dialog', 'Drawer'],
    android: ['Dialog', 'Drawer'],
  },
  {
    props: ['crossOrigin', 'loading', 'referrerPolicy'],
    reason:
      'They steer a browser’s fetch. A request from an app has no origin to cross and carries ' +
      'no referrer, and the view or the app’s loader decides when a picture loads.',
    ios: ['Image'],
    android: ['Image'],
  },
  {
    props: ['min', 'max', 'step'],
    reason:
      'They set the range and the step of the web’s number field. A native text field does ' +
      'not step. NumberInput is the numeric member.',
    ios: ['Input'],
    android: ['Input'],
  },
  {
    props: ['grid', 'multiselectable'],
    reason:
      'They set the web’s keyboard grid model and `aria-multiselectable`. SwiftUI and Compose ' +
      'move focus between the rows’ own controls, so there is no grid to configure.',
    ios: ['Table'],
    android: ['Table'],
  },
  {
    props: ['CitationSource.domain', 'CitationSource.snippet'],
    reason:
      'They fill the hover preview. Touch has no hover, so the platform maps adapt Citation to ' +
      'its mark as a link, and both are on the page the link opens.',
    ios: ['Citation'],
    android: ['Citation'],
  },
  {
    props: ['headingLevel'],
    reason:
      'Android’s headings have no level. An Accordion’s triggers and a Card’s title are ' +
      'headings, and TalkBack moves between them. Card records the level in its identifier.',
    android: ['Accordion', 'Card'],
  },
  {
    props: ['streaming'],
    reason:
      'It sets the web log’s `aria-busy`. Compose has no semantics property that says a ' +
      'region is busy, so the thread records it in its identifier. SwiftUI marks the thread ' +
      'as updating frequently, so it reads the prop.',
    android: ['ChatThread'],
  },
  {
    props: ['closeLabel'],
    reason:
      'It names the close button of the web’s typed confirmation. The bottom sheet draws ' +
      'none, because cancel is its close.',
    android: ['ConfirmDialog'],
  },
  {
    props: ['spark', 'sparkLabel'],
    reason:
      'The Android platform map adapts Stat to draw without its spark, because Sparkline is ' +
      'absent there. The trend chip carries the direction.',
    android: ['Stat'],
  },
  {
    props: [
      'DatePickerMessages.previousMonth',
      'DatePickerMessages.nextMonth',
      'DateRangePickerMessages.previousMonth',
      'DateRangePickerMessages.nextMonth',
    ],
    reason:
      'Material’s date picker names its own month buttons, and its range picker scrolls its ' +
      'months and has none.',
    android: ['DatePicker', 'DateRangePicker'],
  },
  {
    props: ['MultiSelectMessages.showOptions'],
    reason:
      'It names the chevron’s button. In Compose the chevron is drawn only: a press anywhere ' +
      'on the field opens the list, so no control takes the name.',
    android: ['MultiSelect'],
  },
  {
    props: [
      'triggers',
      'PromptInputMessages.suggestions',
      'PromptInputMessages.loadingSuggestions',
      'PromptInputMessages.noSuggestions',
      'PromptTrigger.char',
      'PromptTrigger.onQueryChange',
    ],
    reason:
      'The suggestion list a trigger opens. SwiftUI’s text field reports no caret position on ' +
      'iOS 17, which the package supports, so the composer cannot tell which token the caret ' +
      'is in, and neither platform’s text field draws a list under a token. The Compose ' +
      'rendering draws what the SwiftUI one draws, so a composer behaves alike on both phones. ' +
      'The `@` or `/` a reader types stays text in the prompt, which the app reads when it is ' +
      'sent, and an app names a person or a command from a Select or a Menu in `leading`.',
    ios: ['PromptInput'],
    android: ['PromptInput'],
  },
  {
    props: ['PromptTriggerOption.insert'],
    reason:
      'The text a pick writes, which no native rendering draws, for the reason the entry above ' +
      'gives. iOS is not listed because a SwiftUI foundation file reads a field of that name, a ' +
      'set’s `insert`, which the law counts as a read.',
    android: ['PromptInput'],
  },
  {
    props: ['CarouselSlide.id'],
    reason:
      'The web keys each slide’s element by it. Compose’s pager keys its pages by their ' +
      'position.',
    android: ['Carousel'],
  },
  {
    props: ['TourStep.side'],
    reason:
      'The side of its target a step’s panel opens on. `Tour.Target` has no contract on either ' +
      'platform, because the registry publishes no part for it, so no view of a native screen ' +
      'carries a target’s name. Every step is drawn as the spec draws a step whose target is not ' +
      'on the page, in a sheet that points at nothing, with no side to open on.',
    ios: ['Tour'],
    android: ['Tour'],
  },
  {
    props: ['TourStep.target'],
    reason:
      'The name of the `Tour.Target` a step points at, which no native view carries, for the ' +
      'reason the entry above gives. Android is not listed because a Compose foundation file ' +
      'reads a field of that name, a Markdown link’s `target`, which the law counts as a read.',
    ios: ['Tour'],
  },
  {
    props: [
      'selectionActions',
      'messages',
      'RichTextContentMessages.selectionBar',
      'RichTextContentMessages.selectionBarReady',
    ],
    reason:
      'The selection bar: the app’s controls for the words a reader selected, given the ' +
      'selection’s range, and the bar’s name and announcement. A SwiftUI `Text` with selection on ' +
      'copies its whole text through the system’s menu and reports no selected range, so there is ' +
      'no selection to hand the controls and no bar to draw them in.',
    ios: ['RichTextContent'],
  },
  {
    props: ['lines'],
    reason:
      'Compose’s `Text` takes its line limit and its overflow as arguments, and no composition ' +
      'local carries either, so a member cannot set them on the text an app passes. An app that ' +
      'cuts a paragraph passes `maxLines` and `TextOverflow.Ellipsis` to its own `Text`.',
    android: ['Text'],
  },
  {
    props: [
      'selectionActions',
      'messages',
      'RichTextContentMessages.selectionBar',
      'RichTextContentMessages.selectionBarReady',
      'RichTextContentSelection.range',
    ],
    reason:
      'The selection bar, and the words it is named and announced by. The Compose rendering’s ' +
      'text is not selectable, as Markdown’s is not, and Compose’s selection gives its content ' +
      'the selected words without their place in the text: the selection with its offsets is ' +
      'internal to Compose. The toolbar a selection opens is the platform’s own. A bar of the ' +
      'app’s controls at the selection would replace the platform’s selection handling, so an ' +
      'app anchors a comment from a control of its own.',
    android: ['RichTextContent'],
  },
]
