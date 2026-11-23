// RichTextContent (`design/components/rich-text-content.md`): a stored
// rich-text document, such as a comment or an issue's description, drawn with
// the vocabulary's members under the screen's theme. The app hands the document
// over as the JSON it stored (`PMJSONValue`), as the web member takes any JSON,
// and this file reads it and decides which member draws each node, as the web's
// RichTextContent does over the engine's reader:
//
// - a paragraph is Text's recipe at `size` in `text.primary`: one Text whose
//   runs carry the marks, as Markdown draws a paragraph;
// - a heading is Heading: the document's level 1 at `headingLevel`, each deeper
//   level one more, at most 4. Heading's children are a string, so its content
//   is its text (an entity its label, a break a space), and a heading with no
//   text draws nothing;
// - a list and a quote are drawn as Markdown draws them: items `space-2` apart
//   behind a marker column `space-6` wide, numbered from the list's `start`, a
//   bullet that changes with depth; a quote's blocks `space-3` apart behind the
//   quote rule;
// - a code block is CodeBlock, copyable unless it holds no text, named by its
//   language;
// - a block of a type this version does not know is a paragraph of the text
//   found in it, and nothing when it holds none.
//
// Inside a paragraph, runs carry the inline members' recipes, because a view
// cannot flow inside wrapped text (Markdown's runs): bold, italic and strike
// are the type's own; inline code is Code's face and wash; neighbouring runs
// with one link target are one run in Link's inline recipe, carrying the
// marks they all share, and a target with a scheme ends in Link's
// `open-external` glyph. A link opens through the environment's `openURL`;
// given `onNavigate`, a link that is not external calls it with its target in
// place of opening it, as Link does. A hard break is a line break. The entity
// token is its label in `accent.text` on the `accent.subtle` wash. A run has no
// corner radius or padding, so the wash is square and a narrow no-break space
// stands for the padding on either side, as on Markdown's code spans and
// citation marks.
//
// `entity` draws an entity as the app's view. A Swift closure returns a view
// for every entity, so it cannot leave a kind to the token by returning
// nothing, as the web's returns `undefined`: it returns
// `PMRichTextContent.entityToken(_:)` for such a kind, the token as a view.
// SwiftUI's Text cannot hold a view, so a paragraph with an entity the app
// draws is laid out as a flow of its words, its links and those views, which
// wraps between them. VoiceOver reads each stretch of text between two of them
// as one, each link as a link and each view as the app made it.
//
// Annotations, the anchors an app keeps something against such as a comment
// thread, are drawn on the runs they mark, nested per paragraph as the editor
// nests them (the innermost starts last, then ends first, then goes by id):
// the innermost's `warning.subtle` wash, `warning.subtle-active` for
// `activeAnnotation`, and a rule under the words in `warning.border`, a run's
// underline. A run has no outline, so the active one's frame is not drawn: the
// stronger wash marks it. An annotated entity token keeps its own wash, edged on
// either side with the annotation's. A link inside an annotation keeps its own
// line on the wash. `annotations` names the ones drawn, every one when it is
// absent. A heading that holds a drawn annotation is drawn here, in Heading's
// step, traits and level, because Heading's string cannot carry a highlight.
//
// With `onAnnotationSelect`, a highlight's runs link to their innermost
// annotation, because a link is the one part of a Text a tap reaches, and the
// paragraph's open-URL action calls the handler with its id. A link inside an
// annotation keeps its own target, so a tap on it follows the link, and a view
// the app draws takes its own taps. VoiceOver offers each annotation as an
// action of the text that holds it, named by its words, and lists its runs
// among the text's links. Without the handler a highlight takes no tap and
// offers no action. `selectionActions` and `messages` are not drawn: a SwiftUI
// Text with selection on copies its whole text and reports no selected range
// (`packages/native/src/undrawn.ts`).
//
// The reader below is the engine's (`packages/engine/src/rich-text/`), ported
// for what drawing needs, and the functions it mirrors are named where they
// are: `parseRichText`'s walk (`read.ts`), `richTextHref` with the Markdown
// parser's `cleanHref` (`href.ts`, `markdown/parse.ts`), `richTextNodeText`,
// which an unknown node is drawn as, and `isRichTextEmpty` (`text.ts`). It does
// not write the normal form: it merges no runs and orders no keys, because what
// is drawn does not depend on either.
//
// The root is a container of its blocks. An empty document (no entity, and no
// text but whitespace) draws nothing and exposes nothing, and its identifier
// carries `empty`, the web's `data-empty`.

import PolymorphTokens
import SwiftUI

public struct PMRichTextContent: PMRichTextContentRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMRichTextContentProps

  public init(props: PMRichTextContentProps) {
    self.props = props
  }

  public var body: some View {
    let size = props.size ?? .md
    let blocks = PMRichTextReader.read(props.value)
    let empty = PMRichTextReader.isEmpty(blocks)
    let marking = PMRichTextMarking(
      shown: props.annotations.map(Set.init), active: props.activeAnnotation,
      onSelect: props.onAnnotationSelect)
    let context = PMRichTextContext(
      step: size == .sm ? theme.text.sm : theme.text.md,
      top: (props.headingLevel ?? .headingLevel2).rawValue, entity: props.entity,
      onNavigate: props.onNavigate, marking: marking, listDepth: 0)

    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s4) {
      if !empty {
        PMRichTextBlocks(blocks: blocks, context: context)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    // The empty document draws nothing, so it is read as nothing.
    .accessibilityHidden(empty)
    .pmMember("RichTextContent", attributes(size: size, empty: empty))
  }

  /// The web's `data-size` and `data-empty`.
  private func attributes(size: PMRichTextContentSize, empty: Bool) -> [String: String] {
    var found = ["size": size.rawValue]
    if empty { found["empty"] = "true" }
    return found
  }

  /// The entity token as a view, for an app's `entity` to return for a kind it
  /// leaves to the member: the label in `accent.text` on the `accent.subtle`
  /// wash at `radius.sm`, `space-1` in on either side, in the type of the text
  /// around it. It is text with no role, read as its label.
  public static func entityToken(_ entity: PMRichTextEntity) -> PMContent {
    PMContent(PMRichTextToken(label: entity.label))
  }
}

// MARK: - The reader

/// A block as this file draws it.
enum PMRichTextBlock {
  case paragraph([PMRichTextInline])
  /// `level` is the document's own, 1 to 3.
  case heading(level: Int, [PMRichTextInline])
  /// Each item is its blocks; `start` is the first item's number.
  case list(ordered: Bool, start: Int, items: [[PMRichTextBlock]])
  case quote([PMRichTextBlock])
  case code(language: String?, text: String)
  /// A block of a type this version does not know: the readable text found in
  /// it, and whether an entity stands inside it, which makes it content.
  case found(String, holdsEntity: Bool)
}

/// An inline as this file draws it.
enum PMRichTextInline {
  case text(String, PMRichTextMarks)
  case lineBreak
  case entity(PMRichTextEntity)
  /// An inline of a type this version does not know, as `found` is for a block.
  case found(String, holdsEntity: Bool)
}

/// The marks a run is drawn with. A mark of a type this version does not know
/// draws nothing, so it is not kept.
struct PMRichTextMarks: Equatable {
  var bold = false
  var italic = false
  var strike = false
  var code = false
  /// The target of the run's link, cleaned, once `richTextHref` has passed it.
  var link: String?
  /// The ids of the annotations on the run, one per id, in id order.
  var annotations: [String] = []
}

/// The engine's tolerant reader, for drawing. Every function takes any JSON
/// and never fails: what it cannot read it skips, repairs or draws as text,
/// as `parseRichText` does.
enum PMRichTextReader {
  /// `RICH_TEXT_MAX_DEPTH`: how many quotes and lists deep a block may stand
  /// before it is flattened to paragraphs of its text.
  static let maxDepth = 8
  /// `NODE_TEXT_MAX_DEPTH`: how deep the walk for an unknown node's text reads.
  static let textDepth = 128

  private static let blockTypes: Set<String> = [
    "paragraph", "heading", "list", "blockquote", "codeBlock",
  ]
  /// Every type this version knows (`NODE_TYPES`): an unknown node's text
  /// walk reads one of these by its fields.
  private static let nodeTypes = blockTypes.union(["text", "break", "entity", "listItem"])
  /// The arrays an unknown node's text is found in, in the order they are read.
  private static let childKeys = ["content", "items", "blocks"]
  private static let schemes: Set<String> = ["http", "https", "mailto", "tel"]
  private static let format = "polymorph-rich-text/"

  // MARK: The document (`readDocument`)

  /// The document's blocks, or none for a value that is not a document. A
  /// string is read as the JSON it holds. A document of a later format is
  /// read as far as this version can.
  static func read(_ input: PMJSONValue) -> [PMRichTextBlock] {
    var value = input
    if case .string(let text) = input {
      guard let parsed = try? JSONDecoder().decode(PMJSONValue.self, from: Data(text.utf8))
      else { return [] }
      value = parsed
    }
    guard let format = value.field("format")?.string, isFormat(format),
      let blocks = value.field("blocks")?.array
    else { return [] }
    return readBlocks(blocks, depth: 0)
  }

  /// `polymorph-rich-text/` and a whole number from 1 (`richTextFormatVersion`).
  private static func isFormat(_ value: String) -> Bool {
    guard value.hasPrefix(format) else { return false }
    let number = value.unicodeScalars.dropFirst(format.unicodeScalars.count)
    guard let first = number.first, first != "0" else { return false }
    return number.allSatisfy { ("0"..."9").contains($0) }
  }

  // MARK: Blocks (`readBlocks`, `readBlock`, `readItems`, `flatten`)

  /// `depth` is the number of quotes and lists around the blocks.
  private static func readBlocks(_ nodes: [PMJSONValue], depth: Int) -> [PMRichTextBlock] {
    var out: [PMRichTextBlock] = []
    for node in nodes { readBlock(node, depth: depth, into: &out) }
    return out
  }

  private static func readBlock(
    _ node: PMJSONValue, depth: Int, into out: inout [PMRichTextBlock]
  ) {
    guard let type = node.nodeType else { return }
    switch type {
    case "paragraph":
      out.append(.paragraph(readContent(node)))
    case "heading":
      // Level 1 to 3; a deeper whole level is 3; anything else is a paragraph.
      let content = readContent(node)
      if case .number(let level)? = node.field("level"), isWhole(level), level >= 1 {
        out.append(.heading(level: Int(min(level, 3)), content))
      } else {
        out.append(.paragraph(content))
      }
    case "codeBlock":
      let language = node.field("language")?.string
      out.append(
        .code(
          language: language?.isEmpty == false ? language : nil,
          text: node.field("text")?.string ?? ""))
    case "list":
      guard depth < maxDepth else { return flatten(node, into: &out) }
      // Numbered only when `ordered` is true; a first number that is not a
      // whole number from 0 is 1.
      let ordered = node.field("ordered") == .bool(true)
      var start = 1
      if ordered, case .number(let first)? = node.field("start"), isWhole(first), first >= 0 {
        start = Int(first)
      }
      guard let items = node.field("items")?.array else { return }
      let read = readItems(items, depth: depth + 1)
      // A list with no items is no block.
      if !read.isEmpty { out.append(.list(ordered: ordered, start: start, items: read)) }
    case "blockquote":
      guard depth < maxDepth else { return flatten(node, into: &out) }
      guard let content = node.field("content")?.array else { return }
      let blocks = readBlocks(content, depth: depth + 1)
      // A quote with no blocks is no block.
      if !blocks.isEmpty { out.append(.quote(blocks)) }
    default:
      out.append(found(node))
    }
  }

  /// A list's items. A node that is not a list item is read as an item's one
  /// block, so every item drawn is one.
  private static func readItems(_ nodes: [PMJSONValue], depth: Int) -> [[PMRichTextBlock]] {
    var items: [[PMRichTextBlock]] = []
    for node in nodes {
      guard let type = node.nodeType else { continue }
      if type == "listItem" {
        items.append(node.field("content")?.array.map { readBlocks($0, depth: depth) } ?? [])
      } else {
        var content: [PMRichTextBlock] = []
        readBlock(node, depth: depth, into: &content)
        items.append(content)
      }
    }
    return items
  }

  /// A quote or a list that stands too deep, as paragraphs of its text: each
  /// paragraph and heading a paragraph of its inlines, each code block a
  /// paragraph of its lines, and an unknown node its found text. The walk keeps
  /// its own stack, so a document nested thousands deep is read without
  /// recursion.
  private static func flatten(_ container: PMJSONValue, into out: inout [PMRichTextBlock]) {
    var stack = [container]
    while let node = stack.popLast() {
      guard let type = node.nodeType else { continue }
      switch type {
      case "list", "blockquote", "listItem":
        let children = node.field(type == "list" ? "items" : "content")?.array ?? []
        stack.append(contentsOf: children.reversed())
      case "paragraph", "heading":
        out.append(.paragraph(readContent(node)))
      case "codeBlock":
        out.append(.paragraph(lines(node.field("text")?.string ?? "")))
      default:
        out.append(found(node))
      }
    }
  }

  /// A paragraph of lines, each after the first on a hard break (`paragraphOfLines`).
  private static func lines(_ text: String) -> [PMRichTextInline] {
    let unified = text.replacingOccurrences(of: "\r\n", with: "\n")
      .replacingOccurrences(of: "\r", with: "\n")
    var content: [PMRichTextInline] = []
    for (index, line) in unified.split(separator: "\n", omittingEmptySubsequences: false)
      .enumerated()
    {
      if index > 0 { content.append(.lineBreak) }
      if !line.isEmpty { content.append(.text(String(line), PMRichTextMarks())) }
    }
    return content
  }

  private static func found(_ node: PMJSONValue) -> PMRichTextBlock {
    .found(nodeText(node), holdsEntity: holdsEntity(node))
  }

  // MARK: Inlines and marks (`readInlines`, `readMarks`)

  private static func readContent(_ node: PMJSONValue) -> [PMRichTextInline] {
    guard let content = node.field("content")?.array else { return [] }
    var out: [PMRichTextInline] = []
    for inline in content {
      guard let type = inline.nodeType else { continue }
      switch type {
      case "text":
        // A text node with no text, or an empty one, is no node.
        guard let text = inline.field("text")?.string, !text.isEmpty else { continue }
        out.append(.text(text, readMarks(inline.field("marks"))))
      case "entity":
        // An entity needs a kind, an id and a label; with a label alone it is
        // that label as text, and with none it is left out.
        let label = word(inline.field("label"))
        if let kind = word(inline.field("kind")), let id = word(inline.field("id")),
          let label
        {
          let marks = readEntityMarks(inline.field("marks"))
          out.append(
            .entity(
              PMRichTextEntity(kind: kind, id: id, label: label, marks: marks.isEmpty ? nil : marks)
            ))
        } else if let label {
          out.append(.text(label, PMRichTextMarks()))
        }
      case "break":
        out.append(.lineBreak)
      default:
        out.append(.found(nodeText(inline), holdsEntity: holdsEntity(inline)))
      }
    }
    return out
  }

  /// A run's marks. The first link whose target passes `href(_:)` is kept, and
  /// a link that fails loses its mark while its text is drawn. An annotation
  /// with no id, or an empty one, loses its mark; one per id is kept.
  private static func readMarks(_ value: PMJSONValue?) -> PMRichTextMarks {
    var marks = PMRichTextMarks()
    var annotations = Set<String>()
    for mark in value?.array ?? [] {
      switch mark.nodeType {
      case "link"?:
        if marks.link == nil, let raw = mark.field("href")?.string { marks.link = href(raw) }
      case "bold"?: marks.bold = true
      case "italic"?: marks.italic = true
      case "strike"?: marks.strike = true
      case "code"?: marks.code = true
      case "annotation"?: if let id = word(mark.field("id")) { annotations.insert(id) }
      default: break
      }
    }
    marks.annotations = annotations.sorted(by: inCodeUnits)
    return marks
  }

  /// An entity's marks, as the app's `entity` is handed them: the marks of a
  /// type this version does not know, kept as they are, then the annotations,
  /// one per id, in id order. A format means nothing on an entity, so one is
  /// dropped, and an annotation with no id is too.
  private static func readEntityMarks(_ value: PMJSONValue?) -> [PMJSONValue] {
    var unknown: [PMJSONValue] = []
    var annotations = Set<String>()
    for mark in value?.array ?? [] {
      guard let type = mark.nodeType else { continue }
      switch type {
      case "annotation": if let id = word(mark.field("id")) { annotations.insert(id) }
      case "link", "bold", "italic", "strike", "code": continue
      default: if !unknown.contains(mark) { unknown.append(mark) }
      }
    }
    return unknown
      + annotations.sorted(by: inCodeUnits).map {
        .object([PMJSONMember("type", "annotation"), PMJSONMember("id", .string($0))])
      }
  }

  /// The ids of the annotations an entity's marks hold, in their order.
  static func annotations(of entity: PMRichTextEntity) -> [String] {
    (entity.marks ?? []).compactMap { mark in
      mark.nodeType == "annotation" ? word(mark.field("id")) : nil
    }
  }

  /// JavaScript's order of strings, by UTF-16 code unit, which the model sorts ids by.
  static func inCodeUnits(_ a: String, _ b: String) -> Bool {
    a.utf16.lexicographicallyPrecedes(b.utf16)
  }

  // MARK: Link targets (`richTextHref`, `cleanHref`)

  /// The target a link may point at, cleaned, or `nil`: control characters
  /// removed and the ends trimmed, as a browser reads a target; then `http`,
  /// `https`, `mailto`, `tel`, or a path inside the app (`/x` but not `//x` or
  /// `/\x`, `#x`, `?x`, `./x`, `../x`). Any other scheme, and any other text,
  /// is refused.
  static func href(_ raw: String) -> String? {
    let kept = raw.unicodeScalars.filter { !("\u{0}"..."\u{1F}").contains($0) && $0 != "\u{7F}" }
    let cleaned = trimmed(String(String.UnicodeScalarView(kept)))
    guard !cleaned.isEmpty else { return nil }
    if let scheme = scheme(cleaned) {
      return schemes.contains(scheme.lowercased()) ? cleaned : nil
    }
    let start = Array(cleaned.unicodeScalars.prefix(3))
    let at = { (index: Int) -> Unicode.Scalar? in index < start.count ? start[index] : nil }
    switch at(0) {
    case "/": return at(1) == "/" || at(1) == "\\" ? nil : cleaned
    case "#", "?": return cleaned
    case ".": return at(1) == "/" || (at(1) == "." && at(2) == "/") ? cleaned : nil
    default: return nil
    }
  }

  /// The scheme a target starts with, as RFC 3986 spells one (`[a-z][a-z0-9+.-]*:`
  /// in ASCII, either case), or `nil`.
  static func scheme(_ target: String) -> String? {
    let scalars = Array(target.unicodeScalars)
    let letter = { (scalar: Unicode.Scalar) in
      ("a"..."z").contains(scalar) || ("A"..."Z").contains(scalar)
    }
    guard let first = scalars.first, letter(first) else { return nil }
    var end = 1
    while end < scalars.count,
      letter(scalars[end]) || ("0"..."9").contains(scalars[end])
        || ["+", ".", "-"].contains(scalars[end])
    {
      end += 1
    }
    guard end < scalars.count, scalars[end] == ":" else { return nil }
    return String(String.UnicodeScalarView(scalars[0..<end]))
  }

  /// Whether a target leaves the app: it has a scheme, as the web member marks
  /// a Link `external`.
  static func external(_ target: String) -> Bool { scheme(target) != nil }

  // MARK: Readable text (`richTextNodeText`)

  /// The readable text of any node, known or not, its blocks separated by a
  /// line break. A known node gives its own text: a text node its text, an
  /// entity its label, a break a line break, a code block its text, a
  /// paragraph, heading, list, list item or quote the text of what it holds.
  /// Any other node gives its `text` when that is a string, otherwise its
  /// `label`, otherwise the text of the nodes in its `content`, `items` and
  /// `blocks`, a line break between a block and its neighbours.
  static func nodeText(_ node: PMJSONValue, depth: Int = 0) -> String {
    guard case .object = node, depth < textDepth else { return "" }
    if let type = node.nodeType, nodeTypes.contains(type) {
      return knownText(node, type: type, depth: depth + 1)
    }
    return foundText(node, depth: depth + 1)
  }

  private static func knownText(_ node: PMJSONValue, type: String, depth: Int) -> String {
    switch type {
    case "text", "codeBlock": return node.field("text")?.string ?? ""
    case "entity": return node.field("label")?.string ?? ""
    case "break": return "\n"
    case "paragraph", "heading":
      return (node.field("content")?.array ?? []).map { nodeText($0, depth: depth) }.joined()
    case "list":
      return (node.field("items")?.array ?? []).map { nodeText($0, depth: depth) }
        .joined(separator: "\n")
    default:
      // A list item and a quote: their blocks. A known block with no text
      // still stands for a line; an unknown one with none adds nothing.
      return (node.field("content")?.array ?? []).compactMap { block -> String? in
        let piece = nodeText(block, depth: depth)
        return piece.isEmpty && !isKnownBlock(block) ? nil : piece
      }.joined(separator: "\n")
    }
  }

  private static func foundText(_ node: PMJSONValue, depth: Int) -> String {
    if let text = node.field("text")?.string { return text }
    if let label = node.field("label")?.string { return label }
    var out = ""
    var first = true
    var previousBlock = false
    for key in childKeys {
      for child in node.field(key)?.array ?? [] {
        let piece = nodeText(child, depth: depth)
        if piece.isEmpty { continue }
        let block = isBlockLike(child)
        if !first && (block || previousBlock) { out += "\n" }
        out += piece
        previousBlock = block
        first = false
      }
    }
    return out
  }

  private static func isKnownBlock(_ node: PMJSONValue) -> Bool {
    guard let type = node.nodeType else { return false }
    return blockTypes.contains(type) || type == "listItem"
  }

  /// A known block or list item, or a node that holds children.
  private static func isBlockLike(_ node: PMJSONValue) -> Bool {
    guard node.nodeType != nil else { return false }
    return isKnownBlock(node) || childKeys.contains { node.field($0)?.array != nil }
  }

  // MARK: Emptiness (`isRichTextEmpty`, `richTextEntities`)

  /// Whether the document holds nothing to read: no entity, and no text but
  /// whitespace. An empty heading, list item, quote, code block or break is
  /// not content.
  static func isEmpty(_ blocks: [PMRichTextBlock]) -> Bool {
    !blocks.contains(where: holdsContent)
  }

  private static func holdsContent(_ block: PMRichTextBlock) -> Bool {
    switch block {
    case .paragraph(let inlines), .heading(_, let inlines): inlines.contains(where: holdsContent)
    case .list(_, _, let items): items.contains { $0.contains(where: holdsContent) }
    case .quote(let blocks): blocks.contains(where: holdsContent)
    case .code(_, let text): !isBlank(text)
    case .found(let text, let entity): entity || !isBlank(text)
    }
  }

  private static func holdsContent(_ inline: PMRichTextInline) -> Bool {
    switch inline {
    case .text(let text, _): !isBlank(text)
    case .lineBreak: false
    case .entity: true
    case .found(let text, let entity): entity || !isBlank(text)
    }
  }

  /// Whether an entity a reader sees stands in an unknown node: the node is
  /// one, with a kind, an id and a label, or holds one in its children and
  /// has no `text` or `label` of its own, which would be its whole text.
  static func holdsEntity(_ node: PMJSONValue, depth: Int = 0) -> Bool {
    guard case .object = node, depth < textDepth else { return false }
    if node.nodeType == "entity" {
      return word(node.field("kind")) != nil && word(node.field("id")) != nil
        && word(node.field("label")) != nil
    }
    if node.field("text")?.string != nil || node.field("label")?.string != nil { return false }
    return childKeys.contains { key in
      (node.field(key)?.array ?? []).contains { holdsEntity($0, depth: depth + 1) }
    }
  }

  // MARK: Text

  /// Whether a string is only what JavaScript's `trim` removes.
  static func isBlank(_ text: String) -> Bool {
    text.unicodeScalars.allSatisfy(isSpace)
  }

  /// The string without what JavaScript's `trim` removes at either end.
  static func trimmed(_ text: String) -> String {
    let scalars = text.unicodeScalars
    guard let first = scalars.firstIndex(where: { !isSpace($0) }),
      let last = scalars.lastIndex(where: { !isSpace($0) })
    else { return "" }
    return String(String.UnicodeScalarView(scalars[first...last]))
  }

  /// ECMAScript's white space and line terminators: tab, line tabulation, form
  /// feed, the byte order mark, every space separator, line feed, carriage
  /// return and the two Unicode separators.
  private static func isSpace(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar {
    case "\t", "\n", "\u{0B}", "\u{0C}", "\r", "\u{FEFF}", "\u{2028}", "\u{2029}": true
    default: scalar.properties.generalCategory == .spaceSeparator
    }
  }

  /// A number with no fraction, as large as JavaScript counts exactly
  /// (`Number.isSafeInteger`).
  private static func isWhole(_ number: Double) -> Bool {
    number.rounded() == number && abs(number) <= 9_007_199_254_740_991
  }

  /// A string that is not empty, or `nil`.
  private static func word(_ value: PMJSONValue?) -> String? {
    guard let text = value?.string, !text.isEmpty else { return nil }
    return text
  }
}

extension PMJSONValue {
  /// The object's field `key`, or `nil`: the last of that name, as
  /// `JSON.parse` keeps.
  fileprivate func field(_ key: String) -> PMJSONValue? {
    guard case .object(let members) = self else { return nil }
    return members.last { $0.key == key }?.value
  }

  /// A node's `type`, when it is an object with a string type (`typeOf`).
  fileprivate var nodeType: String? { field("type")?.string }

  fileprivate var string: String? {
    if case .string(let value) = self { value } else { nil }
  }

  fileprivate var array: [PMJSONValue]? {
    if case .array(let value) = self { value } else { nil }
  }
}

// MARK: - Drawing

/// Which annotations are drawn and how: the ids `annotations` names, every one
/// when it is absent, the active one, and the app's handler for a press,
/// without which a highlight takes no press.
struct PMRichTextMarking {
  let shown: Set<String>?
  let active: String?
  let onSelect: (@MainActor (String) -> Void)?

  func drawn(_ id: String) -> Bool { shown?.contains(id) ?? true }

  /// The scheme of the link a pressable annotation's runs carry. A run of a
  /// Text takes a tap only as a link, so a highlight is one, and the
  /// paragraph's open-URL action takes it as a press on the annotation.
  static let scheme = "x-polymorph-annotation"

  /// The link a run of the annotation `id` carries, its id percent-encoded.
  static func url(_ id: String) -> URL? {
    var components = URLComponents()
    components.scheme = scheme
    components.percentEncodedPath = id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
    return components.url
  }

  /// The annotation a link of `url(_:)` names, or `nil` for any other link.
  static func id(_ url: URL) -> String? {
    guard url.scheme == scheme else { return nil }
    return URLComponents(url: url, resolvingAgainstBaseURL: false)?.path
  }
}

/// What every block's drawing reads: the body step, the page level of the
/// document's level 1, the app's entity and router, the annotations, and how
/// deep in lists the block is.
private struct PMRichTextContext {
  let step: PMTextStyle
  let top: Int
  let entity: (@MainActor (PMRichTextEntity) -> PMContent)?
  let onNavigate: (@MainActor (String) -> Void)?
  let marking: PMRichTextMarking
  let listDepth: Int

  func nested() -> PMRichTextContext {
    PMRichTextContext(
      step: step, top: top, entity: entity, onNavigate: onNavigate, marking: marking,
      listDepth: listDepth + 1)
  }

  /// The page level a document heading is drawn at: level 1 at `top`, each
  /// deeper level one more, never past 4.
  func level(_ level: Int) -> PMHeadingLevel {
    let drawn = top + max(0, level - 1)
    return drawn >= 4 ? .level4 : drawn == 3 ? .level3 : .level2
  }
}

private struct PMRichTextBlocks: View {
  let blocks: [PMRichTextBlock]
  let context: PMRichTextContext

  var body: some View {
    ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
      PMRichTextBlockView(block: block, context: context)
    }
  }
}

private struct PMRichTextBlockView: View {
  @Environment(\.pmTheme) private var theme
  let block: PMRichTextBlock
  let context: PMRichTextContext

  var body: some View {
    switch block {
    case .paragraph(let inlines):
      if !inlines.isEmpty {
        PMRichTextParagraph(inlines: inlines, step: context.step, context: context)
      }
    case .heading(let level, let inlines):
      // A heading names the section under it, so one with no name is not drawn.
      let text = headingText(inlines)
      let drawn = context.level(level)
      if PMRichTextReader.isBlank(text) {
        EmptyView()
      } else if PMRichTextPiece.holdsDrawnAnnotation(inlines, marking: context.marking) {
        // Heading's children are a string, which cannot carry a highlight, so
        // a heading that holds one is drawn here in Heading's step and traits.
        PMRichTextParagraph(
          inlines: PMRichTextPiece.headingInlines(inlines),
          step: PMHeading.style(drawn, in: theme), heading: drawn, context: context)
      } else {
        PMHeading(props: PMHeadingProps(children: text, level: drawn))
      }
    case .list(let ordered, let start, let items):
      PMRichTextList(ordered: ordered, start: start, items: items, context: context)
    case .quote(let blocks):
      VStack(alignment: .leading, spacing: theme.defaultDensity.space.s3) {
        PMRichTextBlocks(blocks: blocks, context: context)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .pmQuoteRule()
    case .code(let language, let text):
      // A stored block is never partial, so it is copyable unless it holds
      // nothing to copy; the language is the writer's name for what it holds.
      PMCodeBlock(props: PMCodeBlockProps(children: text, copyable: !text.isEmpty, label: language))
    case .found(let text, let holdsEntity):
      if !text.isEmpty {
        PMRichTextParagraph(
          inlines: [.found(text, holdsEntity: holdsEntity)], step: context.step, context: context)
      }
    }
  }

  /// A heading's content as one string: an entity reads as its label, a break
  /// as a space, and a link and inline code as their text.
  private func headingText(_ inlines: [PMRichTextInline]) -> String {
    inlines.map { inline in
      switch inline {
      case .text(let text, _), .found(let text, _): text
      case .lineBreak: " "
      case .entity(let entity): entity.label
      }
    }.joined()
  }
}

/// A list: its items `space-2` apart, each its marker in a `space-6` column and
/// its blocks `space-2` apart, as Markdown draws one. A numbered list counts
/// from `start`; a bulleted one draws a disc, then a circle, then a square as
/// it nests. A bullet is punctuation, hidden from assistive technology; a
/// number is read, because the order is content.
private struct PMRichTextList: View {
  @Environment(\.pmTheme) private var theme
  let ordered: Bool
  let start: Int
  let items: [[PMRichTextBlock]]
  let context: PMRichTextContext

  var body: some View {
    let space = theme.defaultDensity.space
    VStack(alignment: .leading, spacing: space.s2) {
      ForEach(Array(items.enumerated()), id: \.offset) { index, blocks in
        HStack(alignment: .firstTextBaseline, spacing: space.s2) {
          Text(verbatim: marker(start + index))
            .pmTextStyle(context.step)
            .foregroundStyle(theme.colors.textSecondary.color)
            .fixedSize()
            .frame(width: space.s6 - space.s2, alignment: .trailing)
            .accessibilityHidden(!ordered)
          VStack(alignment: .leading, spacing: space.s2) {
            PMRichTextBlocks(blocks: blocks, context: context.nested())
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
  }

  private func marker(_ ordinal: Int) -> String {
    guard !ordered else { return String(ordinal) + "." }
    switch context.listDepth {
    case 0: return "\u{2022}"
    case 1: return "\u{25E6}"
    default: return "\u{25AA}"
    }
  }
}

/// A paragraph's inlines as they are drawn: neighbouring runs with one link
/// target are one link, carrying the marks every one of them has. Each piece
/// carries its drawn annotations, innermost first.
enum PMRichTextPiece {
  case run(String, PMRichTextMarks, annotations: [String])
  case link(String, href: String, marks: PMRichTextMarks, annotations: [String])
  case lineBreak
  case entity(PMRichTextEntity, annotations: [String])

  static func pieces(
    _ inlines: [PMRichTextInline], drawn: @escaping (String) -> Bool = { _ in true }
  ) -> [PMRichTextPiece] {
    let order = nesting(inlines, drawn: drawn)
    var found: [PMRichTextPiece] = []
    var index = 0
    while index < inlines.count {
      switch inlines[index] {
      case .text(let text, let marks):
        guard let href = marks.link else {
          found.append(.run(text, marks, annotations: order([index])))
          break
        }
        // The link's runs, and the emphasis every one of them has. An
        // annotation on any run is drawn on the whole link, which is one
        // name, as the web draws it around the Link.
        var joined = ""
        var shared = PMRichTextMarks(bold: true, italic: true, strike: true)
        var indexes: [Int] = []
        var end = index
        while end < inlines.count, case .text(let run, let own) = inlines[end], own.link == href {
          joined += run
          shared.bold = shared.bold && own.bold
          shared.italic = shared.italic && own.italic
          shared.strike = shared.strike && own.strike
          indexes.append(end)
          end += 1
        }
        found.append(.link(joined, href: href, marks: shared, annotations: order(indexes)))
        index = end
        continue
      case .lineBreak:
        found.append(.lineBreak)
      case .entity(let entity):
        found.append(.entity(entity, annotations: order([index])))
      case .found(let text, _):
        if !text.isEmpty { found.append(.run(text, PMRichTextMarks(), annotations: [])) }
      }
      index += 1
    }
    // A break that ends a paragraph starts no line, as a browser draws a `<br>`
    // at the end of a block.
    if case .lineBreak? = found.last { found.removeLast() }
    return found
  }

  /// The ids of the annotations a text or an entity carries.
  private static func annotations(_ inline: PMRichTextInline) -> [String]? {
    switch inline {
    case .text(_, let marks): marks.annotations
    case .entity(let entity): PMRichTextReader.annotations(of: entity)
    default: nil
    }
  }

  /// The drawn annotations of a line's inlines, innermost first, nested as the
  /// editor nests them (`nesting` in the web member). An annotation's stretch
  /// is a run of consecutive texts and entities that carry it; a break or an
  /// inline of a later version neither ends a stretch nor belongs to one.
  /// Where annotations overlap, the innermost is the one whose stretch starts
  /// last, then the one that ends first, then by id. The result reads the
  /// inlines at `indexes`, each annotation ordered by its stretch at the first
  /// of them that carries it.
  static func nesting(
    _ inlines: [PMRichTextInline], drawn: @escaping (String) -> Bool
  ) -> ([Int]) -> [String] {
    var stretches: [String: [ClosedRange<Int>]] = [:]
    var open: [String: Int] = [:]
    for (index, inline) in inlines.enumerated() {
      guard let ids = annotations(inline) else { continue }
      for id in Array(open.keys) where !ids.contains(id) { open[id] = nil }
      for id in ids {
        if let at = open[id], let first = stretches[id]?[at].lowerBound {
          stretches[id]?[at] = first...index
        } else {
          stretches[id, default: []].append(index...index)
          open[id] = (stretches[id]?.count ?? 1) - 1
        }
      }
    }
    return { indexes in
      var keys: [String: ClosedRange<Int>] = [:]
      var ids: [String] = []
      for index in indexes {
        for id in annotations(inlines[index]) ?? [] where keys[id] == nil && drawn(id) {
          guard let stretch = stretches[id]?.first(where: { $0.contains(index) }) else { continue }
          keys[id] = stretch
          ids.append(id)
        }
      }
      return ids.sorted { a, b in
        guard let x = keys[a], let y = keys[b] else { return false }
        if x.lowerBound != y.lowerBound { return x.lowerBound > y.lowerBound }
        if x.upperBound != y.upperBound { return x.upperBound < y.upperBound }
        return PMRichTextReader.inCodeUnits(a, b)
      }
    }
  }

  /// Whether a heading's inlines carry an annotation that is drawn.
  static func holdsDrawnAnnotation(_ inlines: [PMRichTextInline], marking: PMRichTextMarking)
    -> Bool
  {
    inlines.contains { (annotations($0) ?? []).contains(where: marking.drawn) }
  }

  /// A heading's inlines as a heading draws them: its words without emphasis
  /// and a link's text without the link, inline code as Code's face, and a
  /// break as a space, as Heading's string reads them.
  static func headingInlines(_ inlines: [PMRichTextInline]) -> [PMRichTextInline] {
    inlines.map { inline in
      switch inline {
      case .text(let text, let marks):
        .text(text, PMRichTextMarks(code: marks.code, annotations: marks.annotations))
      case .lineBreak: .text(" ", PMRichTextMarks())
      default: inline
      }
    }
  }

  /// Each link `onNavigate` takes, one without a scheme, by its URL.
  static func routes(_ pieces: [PMRichTextPiece]) -> [URL: String] {
    var routes: [URL: String] = [:]
    for case .link(_, let href, _, _) in pieces where !PMRichTextReader.external(href) {
      if let url = URL(string: href) { routes[url] = href }
    }
    return routes
  }

  /// The annotations VoiceOver offers as actions, in reading order, each named
  /// by its first fragment where it is the innermost, as the web names an
  /// annotation's stop: a run's words or a token's label, not white space
  /// alone. A link and an entity the app draws are controls of their own, so
  /// they name no annotation, and an annotation with no other fragment has no
  /// action, as on the web it has no stop.
  static func actions(_ pieces: [PMRichTextPiece], appDrawsEntities: Bool) -> [PMRichTextAction] {
    var found: [PMRichTextAction] = []
    for piece in pieces {
      let fragment: (String, String)?
      switch piece {
      case .run(let text, _, let ids): fragment = ids.first.map { ($0, text) }
      case .entity(let entity, let ids):
        fragment = appDrawsEntities ? nil : ids.first.map { ($0, entity.label) }
      default: fragment = nil
      }
      guard case let (id, text)? = fragment, !found.contains(where: { $0.id == id }) else {
        continue
      }
      let words = PMRichTextReader.trimmed(text)
      if !words.isEmpty { found.append(PMRichTextAction(id: id, words: words)) }
    }
    return found
  }

  var isEntity: Bool {
    if case .entity = self { true } else { false }
  }

  /// A run's text as the pieces a line may break between when a paragraph is
  /// a flow: each word with the spaces after it, and the spaces before the
  /// first word on their own.
  static func words(_ text: String) -> [String] {
    var words: [String] = []
    var current = ""
    var inSpace = false
    for character in text {
      let space = character.isWhitespace
      if !space && inSpace && !current.isEmpty {
        words.append(current)
        current = ""
      }
      current.append(character)
      inSpace = space
    }
    if !current.isEmpty { words.append(current) }
    return words
  }
}

/// An annotation VoiceOver offers on the text that holds it.
struct PMRichTextAction: Equatable {
  let id: String
  let words: String
}

/// The inline members' recipes as runs of one Text.
private struct PMRichTextRuns {
  let theme: PMTheme
  let scale: CGFloat
  let marking: PMRichTextMarking

  /// The narrow no-break space that stands for a wash's inline padding.
  static let pad = "\u{202F}"
  /// A zero-width space: a line's height with nothing drawn on it.
  static let strut = "\u{200B}"

  func text(_ pieces: [PMRichTextPiece]) -> Text {
    pieces.reduce(Text(verbatim: "")) { $0 + text($1) }
  }

  func text(_ piece: PMRichTextPiece) -> Text {
    switch piece {
    case .run(let text, let marks, let ids): Text(run(text, marks, annotations: ids))
    case .link(let text, let href, let marks, let ids):
      link(text, href: href, marks: marks, annotations: ids)
    case .lineBreak: Text(verbatim: "\n")
    case .entity(let entity, let ids): Text(token(entity.label, annotations: ids))
    }
  }

  /// A run: bold, italic and strike as the type's own, inline code in Code's
  /// face and wash, padded at its two ends, and its innermost annotation's
  /// highlight on the words, inside the code's wash.
  func run(_ text: String, _ marks: PMRichTextMarks, annotations ids: [String]) -> AttributedString
  {
    var words = AttributedString(text)
    var intent = InlinePresentationIntent()
    if marks.bold { intent.insert(.stronglyEmphasized) }
    if marks.italic { intent.insert(.emphasized) }
    if marks.strike { intent.insert(.strikethrough) }
    if !intent.isEmpty { words.inlinePresentationIntent = intent }
    if marks.code { code(&words) }
    highlight(&words, ids)
    guard marks.code else { return words }
    var edge = AttributedString(Self.pad)
    code(&edge)
    return edge + words + edge
  }

  private func code(_ piece: inout AttributedString) {
    piece.swiftUI.font = theme.text.sm.set(in: theme.fonts.mono).runFont(scale: scale)
    piece.swiftUI.foregroundColor = theme.colors.textPrimary.color
    piece.swiftUI.backgroundColor = theme.colors.bgSubtle.color
  }

  /// A drawn annotation on a run (the recipe's `annotation`): the innermost's
  /// `warning.subtle` wash, or `warning.subtle-active` for the active one, and
  /// a rule under the words in `warning.border`, a run's underline. A run has
  /// no outline, so the active annotation's frame is not drawn: the stronger
  /// wash marks it. With `onAnnotationSelect` the run links to the innermost
  /// annotation in the text's own colour, because a link is the one part of a
  /// Text that takes a tap.
  private func highlight(
    _ piece: inout AttributedString, _ ids: [String], wash: Bool = true, rule: Bool = true,
    press: Bool = true
  ) {
    guard let innermost = ids.first else { return }
    let colors = theme.colors
    if wash {
      piece.swiftUI.backgroundColor =
        (innermost == marking.active ? colors.warningSubtleActive : colors.warningSubtle).color
    }
    if rule {
      piece.swiftUI.underlineStyle = Text.LineStyle(
        pattern: .solid, color: colors.warningBorder.color)
    }
    if press, marking.onSelect != nil, let url = PMRichTextMarking.url(innermost) {
      piece.link = url
      if piece.swiftUI.foregroundColor == nil {
        piece.swiftUI.foregroundColor = colors.textPrimary.color
      }
    }
  }

  /// Link's inline recipe: `accent.text` with the `accent.underline` line, and
  /// the `open-external` glyph a narrow space after a target with a scheme. A
  /// target that is not a URL draws its text alone, as Link does. An
  /// annotation on a link is its wash; the link keeps its own line, and a tap
  /// on it is the link's.
  private func link(
    _ text: String, href: String, marks: PMRichTextMarks, annotations ids: [String]
  ) -> Text {
    var piece = run(text, marks, annotations: [])
    guard let url = URL(string: href) else {
      highlight(&piece, ids)
      return Text(piece)
    }
    highlight(&piece, ids, rule: false, press: false)
    piece.link = url
    piece.swiftUI.foregroundColor = theme.colors.accentText.color
    piece.swiftUI.underlineStyle = Text.LineStyle(
      pattern: .solid, color: theme.colors.accentUnderline.color)
    guard PMRichTextReader.external(href) else { return Text(piece) }
    return Text(piece) + Text(verbatim: Self.pad)
      + Text.pmIcon(.openExternal).foregroundStyle(theme.colors.accentText.color)
  }

  /// The entity token as a run. An annotated token keeps its own wash and is
  /// edged on either side with the annotation's, the rule under the whole, as
  /// the recipe rings an annotated entity.
  private func token(_ label: String, annotations ids: [String]) -> AttributedString {
    var words = AttributedString(label)
    words.swiftUI.foregroundColor = theme.colors.accentText.color
    words.swiftUI.backgroundColor = theme.colors.accentSubtle.color
    var edge = AttributedString(Self.pad)
    if ids.isEmpty {
      edge.swiftUI.backgroundColor = theme.colors.accentSubtle.color
    } else {
      highlight(&edge, ids)
      highlight(&words, ids, wash: false)
    }
    return edge + words + edge
  }
}

/// A paragraph, or a heading that holds a highlight: Text's recipe at `step`,
/// one Text of its runs, or the flow when it holds an entity the app draws.
/// A heading carries Heading's traits and level.
private struct PMRichTextParagraph: View {
  @Environment(\.pmTheme) private var theme
  private var scale = PMTextScale()
  let pieces: [PMRichTextPiece]
  let step: PMTextStyle
  let heading: PMHeadingLevel?
  let context: PMRichTextContext

  init(
    inlines: [PMRichTextInline], step: PMTextStyle, heading: PMHeadingLevel? = nil,
    context: PMRichTextContext
  ) {
    self.pieces = PMRichTextPiece.pieces(inlines, drawn: context.marking.drawn)
    self.step = step
    self.heading = heading
    self.context = context
  }

  var body: some View {
    let runs = PMRichTextRuns(theme: theme, scale: scale.factor, marking: context.marking)
    let flows = context.entity != nil && pieces.contains(where: \.isEntity)
    Group {
      if let entity = context.entity, flows {
        PMRichTextFlowParagraph(
          pieces: pieces, runs: runs, step: step, entity: entity, marking: context.marking)
      } else {
        runs.text(pieces).pmTextStyle(step)
          .pmAnnotationActions(
            PMRichTextPiece.actions(pieces, appDrawsEntities: false), onSelect: context.marking.onSelect)
      }
    }
    .foregroundStyle(theme.colors.textPrimary.color)
    .tint(theme.colors.accentText.color)
    .multilineTextAlignment(.leading)
    .fixedSize(horizontal: false, vertical: true)
    .frame(maxWidth: .infinity, alignment: .leading)
    .modifier(PMRichTextHeadingTraits(level: heading))
    .modifier(
      PMRichTextRoutes(
        routes: PMRichTextPiece.routes(pieces), onNavigate: context.onNavigate,
        onAnnotationSelect: context.marking.onSelect))
  }
}

/// Heading's traits on a heading the member draws itself.
private struct PMRichTextHeadingTraits: ViewModifier {
  let level: PMHeadingLevel?

  func body(content: Content) -> some View {
    if let level {
      content.accessibilityAddTraits(.isHeader).accessibilityHeading(PMHeading.heading(level))
    } else {
      content
    }
  }
}

extension View {
  /// The annotations a text holds, as VoiceOver's actions on it: each named
  /// by its words, and each calls `onSelect` with its id, as a tap on it does.
  /// Without `onSelect` a highlight takes no press, so there are none.
  fileprivate func pmAnnotationActions(
    _ actions: [PMRichTextAction], onSelect: (@MainActor (String) -> Void)?
  ) -> some View {
    accessibilityActions {
      if let onSelect {
        ForEach(actions, id: \.id) { action in
          Button {
            onSelect(action.id)
          } label: {
            Text(verbatim: action.words)
          }
        }
      }
    }
  }
}

/// The routing seam, Link's (`link.md` §Routing) for every link of a
/// paragraph: with `onNavigate`, a link without a scheme calls it with its
/// target in place of the environment's `openURL`, and every other link opens
/// as the environment around says. A tap on a highlight, which is a link to
/// its annotation, calls `onAnnotationSelect`.
struct PMRichTextRoutes: ViewModifier {
  @Environment(\.openURL) private var openURL
  let routes: [URL: String]
  let onNavigate: (@MainActor (String) -> Void)?
  let onAnnotationSelect: (@MainActor (String) -> Void)?

  func body(content: Content) -> some View {
    if (onNavigate != nil && !routes.isEmpty) || onAnnotationSelect != nil {
      content.environment(
        \.openURL,
        OpenURLAction { url in
          Self.open(
            url, routes: routes, onNavigate: onNavigate, onAnnotationSelect: onAnnotationSelect,
            otherwise: openURL)
        })
    } else {
      content
    }
  }

  /// Opens a link of the paragraph: a highlight's goes to `onAnnotationSelect`
  /// with its annotation's id, a target `routes` holds to `onNavigate`, and
  /// any other to the action around the paragraph.
  @MainActor
  static func open(
    _ url: URL, routes: [URL: String], onNavigate: (@MainActor (String) -> Void)?,
    onAnnotationSelect: (@MainActor (String) -> Void)?, otherwise: OpenURLAction
  ) -> OpenURLAction.Result {
    if let id = PMRichTextMarking.id(url) {
      onAnnotationSelect?(id)
    } else if let onNavigate, let href = routes[url] {
      onNavigate(href)
    } else {
      otherwise(url)
    }
    return .handled
  }
}

/// A paragraph that holds a view the app draws for an entity. SwiftUI's Text
/// cannot hold a view, so the paragraph is a flow of its words, its links and
/// those views, at the body step, wrapping between them. Each stretch of text
/// between two of them is read as one: its first word carries the stretch's
/// text and its annotations' actions, and the others are hidden. A link is one
/// piece, read as a link, and inline code is one piece, because its spaces are
/// content. A view the app draws inside an annotation sits on its wash, and a
/// tap on it is its own.
private struct PMRichTextFlowParagraph: View {
  let pieces: [PMRichTextPiece]
  let runs: PMRichTextRuns
  let step: PMTextStyle
  let entity: @MainActor (PMRichTextEntity) -> PMContent
  let marking: PMRichTextMarking

  /// One piece of the flow: whether it ends its line, and whether it is a
  /// view the app draws, which may reach past the line.
  private struct Item {
    let view: AnyView
    var ends = false
    var overhangs = false
  }

  var body: some View {
    PMRichTextFlow {
      ForEach(Array(items().enumerated()), id: \.offset) { _, item in
        item.view.layoutValue(key: PMRichTextBreak.self, value: item.ends)
          .layoutValue(key: PMRichTextOverhang.self, value: item.overhangs)
      }
    }
    .accessibilityElement(children: .contain)
  }

  @MainActor
  private func items() -> [Item] {
    var items: [Item] = []
    var stretch: [PMRichTextPiece] = []

    func close() {
      let spoken = stretch.map { piece -> String in
        switch piece {
        case .run(let text, _, _): text
        case .lineBreak: "\n"
        default: ""
        }
      }.joined()
      let actions = PMRichTextPiece.actions(stretch, appDrawsEntities: true)
      var labelled = PMRichTextReader.isBlank(spoken)
      for piece in stretch {
        switch piece {
        case .run(let text, let marks, let ids):
          for word in marks.code ? [text] : PMRichTextPiece.words(text) {
            let drawn = Text(runs.run(word, marks, annotations: ids)).pmTextStyle(step)
            if labelled {
              items.append(Item(view: AnyView(drawn.accessibilityHidden(true))))
            } else {
              let named = drawn.accessibilityLabel(Text(verbatim: spoken))
                .pmAnnotationActions(actions, onSelect: marking.onSelect)
              items.append(Item(view: AnyView(named)))
              labelled = true
            }
          }
        default:
          // A hard break: a line's height with nothing on it, which ends its line.
          let strut = Text(verbatim: PMRichTextRuns.strut).pmTextStyle(step)
          items.append(Item(view: AnyView(strut.accessibilityHidden(true)), ends: true))
        }
      }
      stretch = []
    }

    for piece in pieces {
      switch piece {
      case .run, .lineBreak:
        stretch.append(piece)
      case .link:
        close()
        items.append(Item(view: AnyView(runs.text(piece).pmTextStyle(step))))
      case .entity(let found, let ids):
        close()
        let drawn = entity(found).pmTextStyle(step)
          .background(washes(ids))
        items.append(Item(view: AnyView(drawn), overhangs: true))
      }
    }
    close()
    return items
  }

  /// The wash of a view's innermost drawn annotation, or none.
  private func washes(_ ids: [String]) -> Color {
    guard let innermost = ids.first else { return .clear }
    let colors = runs.theme.colors
    return (innermost == marking.active ? colors.warningSubtleActive : colors.warningSubtle).color
  }
}

/// Marks the piece that ends its line: a hard break.
private struct PMRichTextBreak: LayoutValueKey {
  static let defaultValue = false
}

/// Marks a view the app draws, whose box may be taller than the line's text:
/// a Link's hit area reaches the hit target, as it reaches past the line in a
/// paragraph on the web.
private struct PMRichTextOverhang: LayoutValueKey {
  static let defaultValue = false
}

/// Lays its children out as lines of text are: in reading order, each at its
/// own width and no wider than the line, on as many lines as they need, each
/// line as tall as its text reaches above and below one shared baseline. A
/// child `PMRichTextOverhang` marks sits on the baseline and sets the line's
/// height only on a line with no text, so its hit area reaches past the line
/// rather than pushing the lines apart. A child `PMRichTextBreak` marks ends
/// its line.
private struct PMRichTextFlow: Layout {
  private struct Item {
    let index: Int
    let size: CGSize
    let baseline: CGFloat
  }

  private struct Line {
    var items: [Item] = []
    var width: CGFloat = 0
    /// How far the text reaches above and below the baseline, and the views
    /// that may overhang it.
    var text: (ascent: CGFloat, descent: CGFloat)?
    var views: (ascent: CGFloat, descent: CGFloat) = (0, 0)

    var ascent: CGFloat { text?.ascent ?? views.ascent }
    var descent: CGFloat { text?.descent ?? views.descent }
  }

  private func lines(_ width: CGFloat, _ subviews: Subviews) -> [Line] {
    var lines = [Line()]
    for (index, subview) in subviews.enumerated() {
      var size = subview.sizeThatFits(.unspecified)
      // A word wider than the line wraps inside it.
      if size.width > width {
        size = subview.sizeThatFits(ProposedViewSize(width: width, height: nil))
      }
      var line = lines.removeLast()
      if !line.items.isEmpty, line.width + size.width > width {
        lines.append(line)
        line = Line()
      }
      let baseline = subview.dimensions(in: ProposedViewSize(size))[
        VerticalAlignment.firstTextBaseline]
      line.items.append(Item(index: index, size: size, baseline: baseline))
      line.width += size.width
      let below = size.height - baseline
      if subview[PMRichTextOverhang.self] {
        line.views = (max(line.views.ascent, baseline), max(line.views.descent, below))
      } else {
        line.text = (max(line.text?.ascent ?? 0, baseline), max(line.text?.descent ?? 0, below))
      }
      lines.append(line)
      if subview[PMRichTextBreak.self] { lines.append(Line()) }
    }
    return lines.filter { !$0.items.isEmpty }
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? .infinity
    let found = lines(width, subviews)
    let height = found.reduce(0) { $0 + $1.ascent + $1.descent }
    return CGSize(width: width.isFinite ? width : found.map(\.width).max() ?? 0, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var y = bounds.minY
    for line in lines(bounds.width, subviews) {
      var x = bounds.minX
      for item in line.items {
        subviews[item.index].place(
          at: CGPoint(x: x, y: y + line.ascent - item.baseline), anchor: .topLeading,
          proposal: ProposedViewSize(item.size))
        x += item.size.width
      }
      y += line.ascent + line.descent
    }
  }
}

/// The entity token as a view (`PMRichTextContent.entityToken(_:)`).
private struct PMRichTextToken: View {
  @Environment(\.pmTheme) private var theme
  let label: String

  var body: some View {
    Text(label)
      .foregroundStyle(theme.colors.accentText.color)
      .padding(.horizontal, theme.defaultDensity.space.s1)
      .background(
        theme.colors.accentSubtle.color, in: RoundedRectangle(cornerRadius: theme.radius.sm))
  }
}

// MARK: - States

/// RichTextContent's states, from the spec's States table: the web fixture's
/// documents, entry for entry.
public struct RichTextContentStates: PMStates {
  public let member = "RichTextContent"

  public init() {}

  // MARK: Documents

  private static func document(_ blocks: PMJSONValue...) -> PMJSONValue {
    .object([
      PMJSONMember("format", "polymorph-rich-text/1"), PMJSONMember("blocks", .array(blocks)),
    ])
  }

  private static func node(_ type: String, _ fields: PMJSONMember...) -> PMJSONValue {
    .object([PMJSONMember("type", .string(type))] + fields)
  }

  private static func paragraph(_ content: PMJSONValue...) -> PMJSONValue {
    node("paragraph", PMJSONMember("content", .array(content)))
  }

  /// A text node with the marks named, each a mark of that type.
  private static func run(_ text: String, _ marks: String...) -> PMJSONValue {
    let text = PMJSONMember("text", .string(text))
    guard !marks.isEmpty else { return node("text", text) }
    return node("text", text, PMJSONMember("marks", .array(marks.map { node($0) })))
  }

  private static func linked(_ text: String, _ href: String) -> PMJSONValue {
    node(
      "text", PMJSONMember("text", .string(text)),
      PMJSONMember("marks", .array([node("link", PMJSONMember("href", .string(href)))])))
  }

  private static func heading(_ level: Int, _ text: String) -> PMJSONValue {
    node(
      "heading", PMJSONMember("level", .number(Double(level))),
      PMJSONMember("content", .array([run(text)])))
  }

  private static func list(ordered: Bool, start: Int? = nil, _ items: PMJSONValue...) -> PMJSONValue
  {
    var fields = [PMJSONMember("ordered", .bool(ordered))]
    if let start { fields.append(PMJSONMember("start", .number(Double(start)))) }
    fields.append(PMJSONMember("items", .array(items)))
    return .object([PMJSONMember("type", "list")] + fields)
  }

  private static func item(_ blocks: PMJSONValue...) -> PMJSONValue {
    node("listItem", PMJSONMember("content", .array(blocks)))
  }

  private static func entity(_ kind: String, _ id: String, _ label: String) -> PMJSONValue {
    node(
      "entity", PMJSONMember("kind", .string(kind)), PMJSONMember("id", .string(id)),
      PMJSONMember("label", .string(label)))
  }

  static let prose = document(
    paragraph(
      run("Retries are now "), run("exponential", "bold"),
      run(", capped at five attempts, and each one "), run("doubles", "italic"),
      run(" the wait. The "), run("three-attempt", "strike"), run(" cap is gone.")),
    paragraph(
      run("Every attempt carries the original "), run("Idempotency-Key", "code"),
      run(" header."), node("break"), run("The timings are in "),
      linked("the delivery guide", "https://docs.example.org/webhooks/retries"), run(".")))

  static let structure = document(
    heading(1, "Webhook retries"),
    paragraph(run("A failed delivery is retried on a schedule.")),
    heading(2, "What changed"),
    list(
      ordered: false,
      item(paragraph(run("Retries carry the original idempotency key."))),
      item(
        paragraph(run("The backoff cap moved to five attempts.")),
        list(
          ordered: false,
          item(paragraph(run("The first retry fires after two seconds."))),
          item(paragraph(run("Each later one doubles the wait.")))))),
    heading(3, "Rollout"),
    paragraph(run("Steps 1 and 2 shipped last week.")),
    list(
      ordered: true, start: 3,
      item(paragraph(run("Turn the schedule on for internal endpoints."))),
      item(paragraph(run("Watch the duplicate rate for a day.")))))

  static let quote = document(
    node(
      "blockquote",
      PMJSONMember(
        "content",
        .array([
          paragraph(run("Deliveries are retried up to five times.")),
          paragraph(run("Every attempt carries the original key.")),
        ]))),
    paragraph(run("That is the whole contract, and the tests hold it.")))

  static let code = document(
    paragraph(run("Add the header to every request:")),
    node(
      "codeBlock", PMJSONMember("language", "ts"),
      PMJSONMember(
        "text",
        .string(
          "const response = await fetch(url, {\n  method: 'POST',\n"
            + "  headers: { 'Idempotency-Key': key },\n  body,\n})"))),
    paragraph(run("The key is honoured for 24 hours.")))

  /// An issue as an entity, labelled with its number as a person types it.
  private static func issue(_ number: Int) -> PMJSONValue {
    entity("issue", "i_\(number)", "#\(number)")
  }

  static let entities = document(
    paragraph(
      entity("user", "u_ada", "@Ada Lovelace"), run(" can you review the fix for "), issue(142),
      run(" before Friday?")))

  /// Two nodes of types this version does not know, as a later version may
  /// write them: a block holding text, and an inline with a label.
  static let later = document(
    node(
      "callout", PMJSONMember("tone", "warning"),
      PMJSONMember("content", .array([run("Deliveries pause while the migration runs.")]))),
    paragraph(
      run("The migration starts on "),
      node("date", PMJSONMember("value", "2026-12-04"), PMJSONMember("label", "Friday 4 December")),
      run(".")))

  static let empty = document()

  /// An annotation mark: a comment thread's anchor.
  private static func thread(_ id: String) -> PMJSONValue {
    node("annotation", PMJSONMember("id", .string(id)))
  }

  /// A text node with these marks.
  private static func marked(_ text: String, _ marks: PMJSONValue...) -> PMJSONValue {
    node("text", PMJSONMember("text", .string(text)), PMJSONMember("marks", .array(marks)))
  }

  /// Two comment threads on one paragraph, as the field's fixture has them.
  static let annotated = document(
    paragraph(
      run("The retry policy "), marked("doubles the wait", thread("thread-1")),
      run(" after each failure, "), marked("up to five times", thread("thread-2")), run(".")))

  /// A thread on a phrase, and a second thread on words inside it, which nests
  /// inside the first.
  static let overlapping = document(
    paragraph(
      run("Each retry waits "), marked("twice ", thread("thread-1")),
      marked("as long", node("bold"), thread("thread-1"), thread("thread-2")),
      marked(" as the last one", thread("thread-1")), run(", up to five times.")))

  /// A mention inside a thread: the entity carries the annotation as the text
  /// around it does.
  static let annotatedEntity = document(
    paragraph(
      run("Ask "),
      node(
        "entity", PMJSONMember("kind", "user"), PMJSONMember("id", "u_ada"),
        PMJSONMember("label", "@Ada Lovelace"), PMJSONMember("marks", .array([thread("thread-3")]))),
      marked(" to review the fix", thread("thread-3")), run(" before Friday.")))

  /// A thread on a heading's words, which the member draws in Heading's step.
  static let annotatedHeading = document(
    node(
      "heading", PMJSONMember("level", 1),
      PMJSONMember("content", .array([run("Webhook "), marked("retries", thread("thread-4"))]))),
    paragraph(run("A failed delivery is retried on a schedule.")))

  private static func content(
    _ value: PMJSONValue, size: PMRichTextContentSize? = nil, annotations: [String]? = nil,
    activeAnnotation: String? = nil, onAnnotationSelect: (@MainActor (String) -> Void)? = nil,
    entity: (@MainActor (PMRichTextEntity) -> PMContent)? = nil
  ) -> PMRichTextContent {
    PMRichTextContent(
      props: PMRichTextContentProps(
        activeAnnotation: activeAnnotation, annotations: annotations, entity: entity,
        onAnnotationSelect: onAnnotationSelect, size: size, value: value))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "prose — every mark, a hard break and a link", expect: ["size": "md", "empty": ""]
      ) {
        Self.content(Self.prose)
      },
      PMStateEntry(
        "structure — headings at three levels, a nested list and a list from 3",
        expect: ["contains": "Heading[level=2],Heading[level=3],Heading[level=4]"]
      ) {
        Self.content(Self.structure)
      },
      PMStateEntry("a quote", expect: ["size": "md"]) {
        Self.content(Self.quote)
      },
      PMStateEntry(
        "a code block — CodeBlock, copyable, named by its language",
        expect: ["contains": "CodeBlock,Button"]
      ) {
        Self.content(Self.code)
      },
      PMStateEntry("entities — the entity token", expect: ["size": "md"]) {
        Self.content(Self.entities)
      },
      // A Swift closure returns a view for every entity, so the issue is left
      // to the token by returning it.
      PMStateEntry(
        "entities drawn by the app — a person as a Link, an issue left to the token",
        expect: ["contains": "Link"]
      ) {
        Self.content(Self.entities) { entity in
          entity.kind == "user"
            ? PMContent(
              PMLink(props: PMLinkProps(children: entity.label, href: "/people/\(entity.id)")))
            : PMRichTextContent.entityToken(entity)
        }
      },
      PMStateEntry(
        "sm — the secondary step, for a note beside its subject", expect: ["size": "sm"]
      ) {
        Self.content(Self.prose, size: .sm)
      },
      PMStateEntry(
        "a later version — an unknown block and inline, drawn as their text",
        expect: ["empty": ""]
      ) {
        Self.content(Self.later)
      },
      // The empty document draws nothing, so the entry exposes nothing. The
      // root's identifier still carries `empty=true`, the web's `data-empty`,
      // but an entry that exposes nothing has no element to read it from.
      PMStateEntry(
        "empty — the root and nothing in it", expect: ["hidden": "true", "renders": "nothing"]
      ) {
        Self.content(Self.empty)
      },
      PMStateEntry("annotated — two comment threads, one active", expect: ["size": "md"]) {
        Self.content(
          Self.annotated, annotations: ["thread-1", "thread-2"], activeAnnotation: "thread-2",
          onAnnotationSelect: { _ in })
      },
      PMStateEntry(
        "overlapping annotations — a thread inside another, nested as the editor nests them",
        expect: ["size": "md"]
      ) {
        Self.content(Self.overlapping, activeAnnotation: "thread-2", onAnnotationSelect: { _ in })
      },
      PMStateEntry(
        "an annotated entity — a mention inside a thread, ringed with its wash",
        expect: ["size": "md"]
      ) {
        Self.content(Self.annotatedEntity)
      },
      PMStateEntry(
        "an annotated heading — a thread on a heading’s words, drawn as Heading draws it",
        expect: ["size": "md"]
      ) {
        Self.content(Self.annotatedHeading, onAnnotationSelect: { _ in })
      },
      // The web's selection bar entry has no counterpart: `selectionActions`
      // is not drawn on iOS (`packages/native/src/undrawn.ts`).
    ]
  }
}
