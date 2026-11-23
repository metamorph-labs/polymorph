import ts from 'typescript'

import { ICON_ROLES } from '@polymorph/engine'

import { CHART_HELPERS } from './chart-frame'
import { DATE_FIELD_HELPERS } from './date-field'

/**
 * A prop's type as the registry prints it, read back as TypeScript and
 * rewritten for a framework that is not React.
 *
 * The registry prints each prop's type from the React vocabulary's checker,
 * expanded: an `IconRole` prop is a union of every role, a `boolean` is
 * `false | true`, an event prop names React's synthetic event types. This
 * module parses the printed text and writes it back in the shared vocabulary
 * of types: the roles union is `IconRole`, the space steps are `SpaceStep`,
 * `false | true` is `boolean`, a React event is the DOM event it wraps and a
 * React ref is the framework's own. What is left are the names the member
 * declares (`TabDescriptor`) and the foundation's (`LayoutPatch`).
 */

const ROLES = new Set<string>(ICON_ROLES)
const STEPS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

/** React's synthetic events, by the DOM event each wraps. */
const EVENTS: Readonly<Record<string, string>> = {
  MouseEvent: 'MouseEvent',
  PointerEvent: 'PointerEvent',
  KeyboardEvent: 'KeyboardEvent',
  FocusEvent: 'FocusEvent',
  ChangeEvent: 'Event',
  FormEvent: 'Event',
  SyntheticEvent: 'Event',
  CompositionEvent: 'CompositionEvent',
  ClipboardEvent: 'ClipboardEvent',
  DragEvent: 'DragEvent',
  UIEvent: 'UIEvent',
}

/** React's handler aliases, by the DOM event their one parameter is. */
const HANDLERS: Readonly<Record<string, string>> = {
  ReactEventHandler: 'Event',
  CompositionEventHandler: 'CompositionEvent',
  MouseEventHandler: 'MouseEvent',
  KeyboardEventHandler: 'KeyboardEvent',
  FocusEventHandler: 'FocusEvent',
  ChangeEventHandler: 'Event',
  PointerEventHandler: 'PointerEvent',
}

/** Names that are the language's or the DOM's, and need no declaration. */
const AMBIENT = new Set([
  'Array',
  'ReadonlyArray',
  'ReadonlySet',
  'Set',
  'Record',
  'Readonly',
  'Partial',
  'Promise',
  'Date',
  'File',
  'FileList',
  'Event',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLButtonElement',
  'HTMLDivElement',
  'HTMLAnchorElement',
  'HTMLFormElement',
  'Ref',
  'VNode',
  ...Object.values(EVENTS),
])

/** The foundation's types (`@polymorph/vue`), which a member imports instead of declaring. */
export const FOUNDATION_TYPES = new Set([
  'IconRole',
  'LayoutPatch',
  // The lawful grid's, which a member's appearance type is written over (`ButtonAppearance`).
  'LawfulVariants',
  'SpaceStep',
  'ControlSize',
  // DurationInput's units, the engine's duration arithmetic's.
  'DurationUnit',
  'FileRejection',
  'MarkdownBlock',
  'MarkdownInline',
  // The date and time values the engine re-exports from `@internationalized/date`.
  'Time',
  'CalendarDateTime',
  // The toast store's: an action, the engine's, and a record, each foundation's own.
  'ToastAction',
  'ToastRecord',
  // The chart grammar, from the engine's chart entry, and the types one chart's props name.
  'ChartAnnotation',
  'ChartBaseline',
  'ChartMessages',
  'ChartSeries',
  'ChartTooltipConfig',
  'ChartXAxis',
  'ChartYAxis',
  'ValueFormat',
  'DonutCenter',
  'DonutSegment',
  'FunnelStage',
  'HeatmapValue',
  'HeatmapYAxis',
  'HistogramXAxis',
  'RadarAxis',
  'ScatterBubble',
  'TreemapItem',
  // The rich-text document and its editor, from the engine's two rich-text entries.
  'RichTextDocument',
  'RichTextEntity',
  'RichTextFormat',
  'RichTextRange',
  'RichTextEditor',
  'RichTextEditorEvent',
  'RichTextEditorState',
  'RichTextSuggestionKey',
  // What RichTextContent draws for a document (`richTextDrawing`).
  'RichTextDrawnBlock',
  'RichTextDrawnInline',
])

/**
 * The engine's helpers an expression may call: the framework-free conventions
 * every foundation re-exports from `@polymorph/engine`, which the React members
 * import too. Each renderer adds its foundation's own helpers and imports all of
 * them from its foundation. A foundation may wrap one for its framework: Solid's
 * `anchorProps` names the focus handlers the way Solid spells them.
 */
export const ENGINE_HELPERS: readonly string[] = [
  // Focus and key handling a machine leaves to its renderer, and the overlay's trigger anchor.
  'syncTriggerAnchor',
  'anchorProps',
  'roveRadio',
  'followHighlight',
  'returnFocus',
  'revealInline',
  // A scroll region held at its end while content arrives (ChatThread, LogView).
  'followEnd',
  'jumpToEnd',
  // The section of a page the reader is in (TableOfContents).
  'watchSections',
  'jumpToSection',
  // Where focus goes when a MasterDetailPage changes what it draws.
  'masterDetailFocus',
  'masterDetailHolds',
  // Menubar's keyboard model: the bar's keys and tab stop, the hand-off and the phone form.
  'roveMenubar',
  'menubarStop',
  'menubarNeighbour',
  'menubarEdge',
  'menubarEntries',
  // The agent registry, which a description's agent block registers with, and the two DOM
  // helpers its actions write through.
  'agentMember',
  'agentFill',
  'agentPress',
  // What an agent chooses among in a menu, and how a choice runs.
  'menuChoices',
  'chooseMenuEntry',
  'menubarChoices',
  'chooseMenubarEntry',
  // What an agent goes to in AppShell's rail, read from the rail in the document, and how.
  'railDestinations',
  'currentRailDestination',
  'goToRailDestination',
  // What an agent picks in a List, read from the list in the document, and how.
  'listItems',
  'currentListItem',
  'chooseListItem',
  // What an agent opens and closes in a JsonTree, read from its toggles in the document, and how.
  'jsonTreeBranches',
  'jsonTreeExpanded',
  'setJsonTreeBranch',
  // What an agent reads from a Table's sortable headers, and how it asks for a sort.
  'tableSortColumns',
  'tableSort',
  'pressTableSort',
  // What an agent picks among a chart's marks, read through its reading, and how.
  'chartMarks',
  'chooseChartMark',
  'chartPosition',
  'readChartPosition',
  // What an agent hides and shows in a chart's legend, read from its keys in the document, and how.
  'chartSeries',
  'chartHiddenSeries',
  'toggleChartSeries',
  // What an agent reads of a chart's brush, and how it builds a range with the brush's own keys.
  'chartRange',
  'brushChartRange',
  // The rest of the engine's conventions.
  'devWarning',
  'spacingAttrs',
  'fitTextarea',
  'modalFocusTarget',
  'avatarTone',
  'initialsOf',
  'paginationWindow',
  'PAGINATION_ELLIPSIS',
  'TOOLTIP_DELAY_MS',
  'TOOLTIP_SKIP_DELAY_MS',
  'formatBytes',
  'gateFiles',
  'promptToken',
  'promptPick',
  'relativeTimePhrase',
  'clockTime',
  'spokenDuration',
  'pauseOtherPlayers',
  // DurationInput's arithmetic, and the seconds an agent sets.
  'agentDuration',
  'commitDuration',
  'durationDraft',
  'durationKey',
  'durationSegments',
  'typeIntoDuration',
  'countdownMoment',
  'countdownLeft',
  'countdownClock',
  'countdownSpoken',
  'followCountdown',
  // Rating's model, its clear rule and its keys.
  'ratingModel',
  'ratingPress',
  'roveRating',
  'diffLines',
  'diffRuns',
  'highlightRuns',
  'tourTarget',
  'tourTargetRect',
  'revealTourTarget',
  'tourPlacement',
  'tourViewport',
  'qrSymbol',
  'qrPath',
  'QR_QUIET_ZONE',
  'sparklineGeometry',
  'COLOR_INPUT_REST',
  // PhoneInput's model.
  'commitPhone',
  'isPhoneValue',
  'phoneCountries',
  'phoneCountryOptions',
  'phoneDefaultCountry',
  'phoneDraft',
  'readPhone',
  'parseMarkdown',
  'inlineText',
  'markdownHeadingLevel',
  'markdownShallowestHeading',
  'markdownEndsInProse',
  'TOAST_TONE_ICON',
  // What an agent reads from the notices a Toast viewport shows, and how it answers one.
  'toastNotices',
  'toastDetails',
  'dismissToastNotice',
  'actOnToastNotice',
  // The theme runtime's: ModeSwitch applies the reader's choice.
  'setMode',
  // RichTextInput's: the document, the editor it mounts, a toolbar's roving tab stop and keys,
  // the places of the selection bar and of the suggestion list, focus entering and leaving the
  // field, a press on its label and a form's reset.
  'createRichTextEditor',
  'emptyRichText',
  'isRichTextEmpty',
  'isRichTextNewer',
  'RICH_TEXT_FORMATS',
  'richTextFromText',
  'richTextHref',
  'richTextLength',
  'richTextPlainText',
  'serializeRichText',
  'toolbarStop',
  'syncToolbarStop',
  'toolbarKeydown',
  'toolbarFocusIn',
  'toolbarFocusOut',
  'toolbarPress',
  'enterToolbar',
  'holdToolbarEscape',
  'toolbarLosesFocus',
  'placeSelectionBar',
  'followSelectionBar',
  'placeTokenList',
  'idPart',
  'focusOnLabelPress',
  'followFieldFocus',
  'followFormReset',
  // RichTextContent's: the drawing of a document, a reader's selection in it, and a press or a
  // key on a highlight.
  'richTextDrawing',
  'richTextPositionAttrs',
  'richTextAnnotations',
  'mapRichTextSelection',
  'richTextSelectionBox',
  'richTextPressedAnnotation',
  'richTextKeyedAnnotation',
  'RICH_TEXT_STOP',
  // The chart engine's, which the chart frame's builders name (`chart-frame.ts`).
  ...CHART_HELPERS,
  // The segmented field's, which the date field's builders name (`date-field.ts`).
  ...DATE_FIELD_HELPERS,
]

export interface PrintedType {
  /** The type, rewritten. */
  text: string
  /** Names it references that are neither ambient nor written out. */
  names: string[]
}

function parseType(printed: string): { node: ts.TypeNode; source: ts.SourceFile } {
  const source = ts.createSourceFile(
    'printed.ts',
    `type __T = ${printed}`,
    ts.ScriptTarget.ESNext,
    true,
  )
  const alias = source.statements[0]
  if (alias === undefined || !ts.isTypeAliasDeclaration(alias)) {
    throw new Error(`shells: cannot read the printed type ${printed}`)
  }
  return { node: alias.type, source }
}

const literalText = (node: ts.TypeNode): string | null =>
  ts.isLiteralTypeNode(node)
    ? ts.isStringLiteral(node.literal)
      ? `"${node.literal.text}"`
      : ts.isNumericLiteral(node.literal)
        ? node.literal.text
        : node.literal.kind === ts.SyntaxKind.TrueKeyword
          ? 'true'
          : node.literal.kind === ts.SyntaxKind.FalseKeyword
            ? 'false'
            : null
    : null

/**
 * The printed type, rewritten. `undefined` leaves every union, because an
 * optional prop says it once.
 */
export function rewriteType(printed: string): PrintedType {
  const { node, source } = parseType(printed)
  const names = new Set<string>()

  const write = (type: ts.TypeNode): string => {
    if (ts.isUnionTypeNode(type)) {
      const members = type.types.filter((member) => member.kind !== ts.SyntaxKind.UndefinedKeyword)
      const literals = members.map(literalText)
      const out: string[] = []
      const strings = members.filter((_, at) => {
        const literal = literals[at]
        return literal?.startsWith('"') === true && ROLES.has(literal.slice(1, -1))
      })
      const isRoles = strings.length === ROLES.size
      const numbers = new Set(literals.filter((text) => text !== null && /^\d+$/.test(text)))
      const isSteps = STEPS.every((step) => numbers.has(step)) && numbers.size === STEPS.length
      let wroteBoolean = false
      let wroteRoles = false
      let wroteSteps = false
      members.forEach((member, at) => {
        const literal = literals[at] ?? null
        if (literal === 'true' || literal === 'false') {
          const other = literal === 'true' ? 'false' : 'true'
          if (literals.includes(other)) {
            if (!wroteBoolean) out.push('boolean')
            wroteBoolean = true
            return
          }
        }
        if (isRoles && literal !== null && strings.includes(member)) {
          if (!wroteRoles) {
            out.push('IconRole')
            names.add('IconRole')
          }
          wroteRoles = true
          return
        }
        if (isSteps && literal !== null && numbers.has(literal)) {
          if (!wroteSteps) {
            out.push('SpaceStep')
            names.add('SpaceStep')
          }
          wroteSteps = true
          return
        }
        out.push(write(member))
      })
      return out.length === 0 ? 'undefined' : out.join(' | ')
    }
    if (ts.isLiteralTypeNode(type)) {
      const literal = literalText(type)
      return literal ?? type.getText(source)
    }
    if (ts.isParenthesizedTypeNode(type)) return `(${write(type.type)})`
    if (ts.isArrayTypeNode(type)) {
      const element = write(type.elementType)
      return /[|&]/.test(element) && !element.startsWith('(') ? `(${element})[]` : `${element}[]`
    }
    if (ts.isTypeOperatorNode(type)) {
      return `${ts.tokenToString(type.operator)} ${write(type.type)}`
    }
    if (ts.isTupleTypeNode(type))
      return `[${type.elements.map((member) => write(member as ts.TypeNode)).join(', ')}]`
    if (ts.isNamedTupleMember(type)) return `${type.name.text}: ${write(type.type)}`
    if (ts.isFunctionTypeNode(type)) {
      const parameters = type.parameters.map(
        (parameter) =>
          `${parameter.name.getText(source)}${parameter.questionToken ? '?' : ''}: ${
            parameter.type ? write(parameter.type) : 'unknown'
          }`,
      )
      return `(${parameters.join(', ')}) => ${write(type.type)}`
    }
    if (ts.isTypeLiteralNode(type)) {
      const members = type.members.map((member) => {
        if (ts.isPropertySignature(member) && member.type) {
          return `${member.name.getText(source)}${member.questionToken ? '?' : ''}: ${write(member.type)}`
        }
        return member.getText(source)
      })
      return `{ ${members.join('; ')} }`
    }
    if (ts.isTypeReferenceNode(type)) {
      const name = type.typeName.getText(source)
      const args = type.typeArguments ?? []
      if (name in EVENTS) return EVENTS[name] as string
      if (name in HANDLERS) return `(event: ${HANDLERS[name]}) => void`
      if (name === 'Ref') {
        names.add('Ref')
        return `Ref<${args.map(write).join(', ')} | null>`
      }
      if (!AMBIENT.has(name)) names.add(name)
      return args.length === 0 ? name : `${name}<${args.map(write).join(', ')}>`
    }
    switch (type.kind) {
      case ts.SyntaxKind.StringKeyword:
        return 'string'
      case ts.SyntaxKind.NumberKeyword:
        return 'number'
      case ts.SyntaxKind.BooleanKeyword:
        return 'boolean'
      case ts.SyntaxKind.VoidKeyword:
        return 'void'
      case ts.SyntaxKind.UnknownKeyword:
        return 'unknown'
      case ts.SyntaxKind.AnyKeyword:
        return 'any'
      case ts.SyntaxKind.NullKeyword:
        return 'null'
      case ts.SyntaxKind.UndefinedKeyword:
        return 'undefined'
      case ts.SyntaxKind.NeverKeyword:
        return 'never'
    }
    return type.getText(source)
  }

  return { text: write(node), names: [...names].sort() }
}

/** One parameter of an event, rewritten. */
export interface EventParameter {
  name: string
  type: string
}

/**
 * An event prop's parameters: the parameters of the function type it holds,
 * rewritten. A prop whose type is a union of function types (`Accordion`'s
 * `onValueChange`, single or multiple) has one parameter list, each position a
 * union of the alternatives.
 */
export function eventParameters(printed: string): {
  parameters: EventParameter[]
  names: string[]
} {
  const { node, source } = parseType(printed)
  const functions: ts.FunctionTypeNode[] = []
  const handlers: string[] = []
  const visit = (type: ts.TypeNode) => {
    if (ts.isUnionTypeNode(type)) type.types.forEach(visit)
    else if (ts.isParenthesizedTypeNode(type)) visit(type.type)
    else if (ts.isFunctionTypeNode(type)) functions.push(type)
    else if (ts.isTypeReferenceNode(type) && type.typeName.getText(source) in HANDLERS) {
      handlers.push(HANDLERS[type.typeName.getText(source)] as string)
    }
  }
  visit(node)
  if (handlers.length > 0)
    return { parameters: [{ name: 'event', type: handlers[0] as string }], names: [] }

  const names = new Set<string>()
  const width = Math.max(0, ...functions.map((fn) => fn.parameters.length))
  const parameters: EventParameter[] = []
  for (let at = 0; at < width; at += 1) {
    const types: string[] = []
    let name = `arg${at}`
    for (const fn of functions) {
      const parameter = fn.parameters[at]
      if (parameter === undefined) continue
      name = parameter.name.getText(source)
      const rewritten = rewriteType(parameter.type ? parameter.type.getText(source) : 'unknown')
      rewritten.names.forEach((entry) => names.add(entry))
      if (!types.includes(rewritten.text)) types.push(rewritten.text)
    }
    parameters.push({ name, type: types.join(' | ') })
  }
  return { parameters, names: [...names].sort() }
}

/** The parameter of a render prop, rewritten: the scoped slot's props. */
export function renderParameter(printed: string): PrintedType | null {
  const { node, source } = parseType(printed)
  let found: ts.FunctionTypeNode | undefined
  const visit = (type: ts.TypeNode) => {
    if (ts.isUnionTypeNode(type)) type.types.forEach(visit)
    else if (ts.isParenthesizedTypeNode(type)) visit(type.type)
    else if (ts.isFunctionTypeNode(type)) found ??= type
  }
  visit(node)
  const parameter = found?.parameters[0]
  if (parameter?.type === undefined) return null
  return rewriteType(parameter.type.getText(source))
}
