// Markdown (`design/components/markdown.md`): Markdown, usually a model's
// reply, drawn with the vocabulary's members under the screen's theme. Foundation
// parses it (`AttributedString(markdown:)`, the full syntax), and this file
// decides which member draws each block, as the web's Markdown does over the
// engine's parser:
//
// - a paragraph is Text's recipe at `size` in `text.primary`;
// - a heading is Heading, relative: the reply's shallowest is level 2, each
//   deeper one a level more, at most 4, so a reply never competes with the
//   page's title; its text is plain, because Heading's children are a string;
// - a fence is CodeBlock, `copyable` only once the fence has closed, so a
//   reader cannot copy half a command;
// - a quote is a column of blocks `space-3` apart behind the quote rule that
//   ReasoningDisclosure shares (`pmQuoteRule`);
// - a list is a column of items `space-2` apart, `space-6` in, with its markers
//   in `text.secondary` at the item's step (`1.`, or a bullet that changes
//   with depth, as a browser draws them), nested as written; an item's own
//   blocks are `space-2` apart;
// - a pipe table is Table, a column `numeric` where its delimiter ends in `:`;
// - `---`, `***` and `___` are Separator. A line of dashes under a paragraph is
//   a rule here too, never a heading: `===` is the only underline read as one;
// - an image is a block in place: the picture at its own width or the
//   column's, whichever is less, at `radius.md`, named by the model's alt text
//   (an empty alt makes it decorative); while it cannot load, its alt text.
//
// Inside a paragraph or a cell, runs carry the inline members' recipes, because
// a view cannot flow inside wrapped text: a code span is Code's face and wash
// (mono `text.sm` on `bg.subtle`), a link is Link's inline recipe (`accent.text`
// with the `accent.underline` line) and opens through the environment's
// `openURL`, and `[n]` is Citation's mark (`text.xs` `accent.text` on
// `accent.subtle`, set at the top of the line) linking to the nth of `sources`
// when there is one, and text otherwise. A run has no corner radius, padding
// or pointer state, so the washes are square, a narrow no-break space stands
// for the padding on either side, and a link does not change under the
// pointer; strong, emphasis and strikethrough are the type's own.
//
// It is safe and tolerant by construction, as on the web: raw HTML is its own
// text, a link whose target is not `http`, `https`, `mailto` or relative is its
// text, an open fence is a code block of what has arrived, an unclosed `**` is
// two asterisks, and an unfinished link is its characters. The source is parsed
// again on every render. While `streaming`, the caret (`PMCaretText`) follows
// the last character of the last paragraph, or stands alone on a line after a
// last block that holds no prose; before anything has arrived, Skeleton's bar
// stands at the step's line box.
//
// What Foundation's parser reads that the web's does not: a block indented
// four spaces is a code block (the web reads a paragraph); `[label][ref]` with
// its `[ref]: url` definition is a link, so a `[n]` the reply defines that way
// is a link to that address rather than a Citation; a bare `www.` address or an
// email address is a link; `~one~` is struck through; every HTML entity is
// decoded (the web decodes the common five and numeric ones). An external
// link (an absolute or protocol-relative address) ends in Link's
// `open-external` glyph, a run of the paragraph's text (`Text.pmIcon`), so it
// wraps with the label. What it cannot draw: an image inside a table cell or a
// heading, which draws its alt text; and a mark's own spoken name, because a
// run has no accessible name: VoiceOver reads the mark's number and lists it
// among the paragraph's links, which open the source.
//
// Headings carry their level; each paragraph is one element whose links
// VoiceOver lists; while streaming, the paragraph with the caret carries
// `updatesFrequently`, the nearest iOS has to the web's `aria-busy`, and the
// root carries `busy`. ChatThread announces the reply, as the web's does.

import PolymorphTokens
import SwiftUI

public struct PMMarkdown: PMMarkdownRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMMarkdownProps

  public init(props: PMMarkdownProps) {
    self.props = props
  }

  public var body: some View {
    let size = props.size ?? .md
    let streaming = props.streaming ?? false
    let pending = streaming && props.children.allSatisfy(\.isWhitespace)
    let document = PMMarkdownDocument(source: props.children)
    let context = PMMarkdownContext(
      step: size == .sm ? theme.text.sm : theme.text.md, sources: props.sources ?? [],
      shallowest: document.shallowest, listDepth: 0)

    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s4) {
      if pending {
        PMSkeleton(
          props: PMSkeletonProps(shape: .text, textStep: size == .sm ? .sm : .md, width: .width9))
      } else {
        PMMarkdownBlocks(
          blocks: document.blocks, context: context,
          caret: streaming && PMMarkdownBlock.endsInProse(document.blocks))
        if streaming && !PMMarkdownBlock.endsInProse(document.blocks) {
          PMMarkdownParagraph(text: AttributedString(), context: context, caret: true)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    // Pending, the reply is the decorative bar alone, so it exposes nothing,
    // as StreamingText's pending bar does.
    .accessibilityHidden(pending)
    .pmMember("Markdown", attributes(size: size, streaming: streaming, pending: pending))
  }

  /// The web's `data-size`, `data-state`, `data-pending` and `aria-busy`.
  private func attributes(size: PMMarkdownSize, streaming: Bool, pending: Bool) -> [String: String]
  {
    var found = ["size": size.rawValue]
    if streaming {
      found["state"] = "streaming"
      found["busy"] = "true"
    }
    if pending { found["pending"] = "true" }
    return found
  }
}

// MARK: - The document

/// One block of the reply, as this file draws it.
private indirect enum PMMarkdownBlock {
  case paragraph(AttributedString)
  case image(url: URL?, alt: String)
  case heading(depth: Int, text: String)
  case code(String, closed: Bool)
  case quote([PMMarkdownBlock])
  case list(ordered: Bool, items: [PMMarkdownItem])
  case table(numeric: [Bool], header: [AttributedString], rows: [[AttributedString]])
  case rule

  /// Whether the caret goes inside the last paragraph: the last block is
  /// prose, or a quote or a list whose last block is.
  static func endsInProse(_ blocks: [PMMarkdownBlock]) -> Bool {
    switch blocks.last {
    case .paragraph?: true
    case .quote(let inner)?: endsInProse(inner)
    case .list(_, let items)?: endsInProse(items.last?.blocks ?? [])
    default: false
    }
  }
}

private struct PMMarkdownItem {
  let ordinal: Int
  let blocks: [PMMarkdownBlock]
}

/// The reply parsed into blocks, with its shallowest heading depth.
private struct PMMarkdownDocument {
  let blocks: [PMMarkdownBlock]
  let shallowest: Int

  init(source: String) {
    let prepared = Self.prepare(source)
    let options = AttributedString.MarkdownParsingOptions(
      allowsExtendedAttributes: false, interpretedSyntax: .full,
      failurePolicy: .returnPartiallyParsedIfPossible)
    let parsed =
      (try? AttributedString(markdown: prepared, options: options)) ?? AttributedString(prepared)

    // The runs into a tree of their blocks: each run's intent lists its blocks
    // from the innermost out, each with an identity, in document order.
    let root = PMMarkdownNode(kind: nil, identity: 0)
    var loose = 0
    var lastCode: Int?
    for run in parsed.runs {
      var node = root
      let path = (run.presentationIntent?.components ?? []).reversed()
      if path.isEmpty {
        // A raw HTML block has no block intent: it is a paragraph of its text.
        if let last = root.children.last, last.identity < 0 {
          node = last
        } else {
          loose -= 1
          node = PMMarkdownNode(kind: .paragraph, identity: loose)
          root.children.append(node)
        }
      }
      for component in path {
        if let last = node.children.last, last.identity == component.identity {
          node = last
        } else {
          let child = PMMarkdownNode(kind: component.kind, identity: component.identity)
          node.children.append(child)
          node = child
        }
        if case .codeBlock = component.kind { lastCode = component.identity }
      }
      node.text.append(parsed[run.range])
    }

    let open = Self.endsInOpenFence(prepared) ? lastCode : nil
    blocks = root.children.flatMap { Self.blocks($0, openCode: open) }
    shallowest = Self.shallowest(blocks) ?? 1
  }

  private static func blocks(_ node: PMMarkdownNode, openCode: Int?) -> [PMMarkdownBlock] {
    let inner = { node.children.flatMap { blocks($0, openCode: openCode) } }
    switch node.kind {
    case .paragraph?: return paragraphs(node.text)
    case .header(let level)?:
      return [.heading(depth: level, text: plain(node.text))]
    case .codeBlock?:
      var code = String(node.text.characters)
      if code.hasSuffix("\n") { code.removeLast() }
      return [.code(code, closed: node.identity != openCode)]
    case .thematicBreak?: return [.rule]
    case .blockQuote?: return [.quote(inner())]
    case .orderedList?, .unorderedList?:
      let ordered = node.kind == .orderedList
      let items = node.children.enumerated().map { position, item in
        var ordinal = position + 1
        if case .listItem(let number) = item.kind { ordinal = number }
        return PMMarkdownItem(
          ordinal: ordinal, blocks: item.children.flatMap { blocks($0, openCode: openCode) })
      }
      return [.list(ordered: ordered, items: items)]
    case .table(let columns)?:
      let numeric = columns.map { $0.alignment == .right }
      let cells = { (row: PMMarkdownNode) in
        (0..<columns.count).map { column in
          row.children.indices.contains(column) ? row.children[column].text : AttributedString()
        }
      }
      let header = node.children.first { $0.kind == .tableHeaderRow }.map(cells) ?? []
      let rows = node.children.filter { $0.kind != .tableHeaderRow }.map(cells)
      return [.table(numeric: numeric, header: header, rows: rows)]
    default:
      // A list item or a cell outside its list or table, or a kind a later
      // parser adds: its blocks, or its text as a paragraph.
      return node.children.isEmpty ? paragraphs(node.text) : inner()
    }
  }

  /// A paragraph's text, split where an image stands: the web draws an image
  /// as a block, so the text either side of it is a paragraph of its own.
  private static func paragraphs(_ text: AttributedString) -> [PMMarkdownBlock] {
    var found: [PMMarkdownBlock] = []
    var current = AttributedString()
    let flush = {
      let trimmed = trim(current)
      if !trimmed.characters.isEmpty { found.append(.paragraph(trimmed)) }
      current = AttributedString()
    }
    for run in text.runs {
      if let source = run.imageURL {
        flush()
        found.append(
          .image(url: PMMarkdownLink.safe(source), alt: plain(AttributedString(text[run.range]))))
      } else {
        current.append(text[run.range])
      }
    }
    flush()
    return found
  }

  /// The text without the whitespace at either end.
  private static func trim(_ text: AttributedString) -> AttributedString {
    let characters = text.characters
    guard let first = characters.firstIndex(where: { !$0.isWhitespace }),
      let last = characters.lastIndex(where: { !$0.isWhitespace })
    else { return AttributedString() }
    return AttributedString(text[first...last])
  }

  private static func plain(_ text: AttributedString) -> String {
    String(trim(text).characters)
  }

  private static func shallowest(_ blocks: [PMMarkdownBlock]) -> Int? {
    blocks.compactMap { block -> Int? in
      switch block {
      case .heading(let depth, _): depth
      case .quote(let inner): shallowest(inner)
      case .list(_, let items): items.compactMap { shallowest($0.blocks) }.min()
      default: nil
      }
    }.min()
  }

  /// The source with a blank line before every line of dashes that follows a
  /// paragraph line outside a fence, so the dashes are a rule and not a setext
  /// heading's underline. Models mean a rule by them.
  private static func prepare(_ source: String) -> String {
    var lines: [Substring] = []
    var fence = PMMarkdownFence()
    for line in source.replacingOccurrences(of: "\r\n", with: "\n").split(
      separator: "\n", omittingEmptySubsequences: false)
    {
      let inFence = fence.read(line)
      if !inFence, isDashRule(line), let previous = lines.last,
        !previous.allSatisfy(\.isWhitespace)
      {
        lines.append("")
      }
      lines.append(line)
    }
    return lines.joined(separator: "\n")
  }

  /// `---`, `- - -`: three or more dashes and nothing else, indented at most three spaces.
  private static func isDashRule(_ line: Substring) -> Bool {
    let indent = line.prefix { $0 == " " }.count
    let dashes = line.filter { $0 == "-" }.count
    return indent <= 3 && dashes >= 3 && line.allSatisfy { $0 == "-" || $0 == " " || $0 == "\t" }
  }

  /// Whether the source ends inside a fence that has not closed.
  private static func endsInOpenFence(_ source: String) -> Bool {
    var fence = PMMarkdownFence()
    for line in source.split(separator: "\n", omittingEmptySubsequences: false) {
      _ = fence.read(line)
    }
    return fence.open != nil
  }
}

/// Which fence a run of lines is inside: a line of three or more backticks or
/// tildes opens one, after any indent and quote markers, and a line of at
/// least as many of the same character, and nothing else, closes it.
private struct PMMarkdownFence {
  private(set) var open: (marker: Character, length: Int)?

  /// Reads one line; whether it is inside a fence or is one's opening or closing line.
  mutating func read(_ line: Substring) -> Bool {
    let body = line.drop { $0 == " " || $0 == "\t" || $0 == ">" }
    let inside = open != nil
    guard let marker = body.first, marker == "`" || marker == "~" else { return inside }
    let length = body.prefix { $0 == marker }.count
    guard length >= 3 else { return inside }
    let rest = body.dropFirst(length)
    if let current = open {
      if marker == current.marker, length >= current.length, rest.allSatisfy(\.isWhitespace) {
        open = nil
      }
      return true
    }
    if marker == "~" || !rest.contains("`") {
      open = (marker, length)
      return true
    }
    return false
  }
}

/// A block of the tree the runs build, before it becomes a `PMMarkdownBlock`.
private final class PMMarkdownNode {
  let kind: PresentationIntent.Kind?
  let identity: Int
  var children: [PMMarkdownNode] = []
  var text = AttributedString()

  init(kind: PresentationIntent.Kind?, identity: Int) {
    self.kind = kind
    self.identity = identity
  }
}

/// The link targets the web allows (`safeHref`): `http`, `https`, `mailto`, or
/// no scheme at all (a relative or protocol-relative path).
private enum PMMarkdownLink {
  static func safe(_ url: URL) -> URL? {
    guard let scheme = url.scheme?.lowercased() else { return url }
    return ["http", "https", "mailto"].contains(scheme) ? url : nil
  }

  /// Whether a safe link points to another origin, as the web's Markdown
  /// marks it `external`: an absolute address, or a protocol-relative one.
  static func external(_ url: URL) -> Bool {
    guard let scheme = url.scheme?.lowercased() else { return url.host != nil }
    return ["http", "https", "mailto"].contains(scheme)
  }
}

// MARK: - Drawing

/// What every block's drawing reads: the body step, the sources, the
/// shallowest heading and how deep in lists the block is.
private struct PMMarkdownContext {
  let step: PMTextStyle
  let sources: [PMCitationSource]
  let shallowest: Int
  let listDepth: Int

  func nested() -> PMMarkdownContext {
    PMMarkdownContext(
      step: step, sources: sources, shallowest: shallowest, listDepth: listDepth + 1)
  }
}

/// A column of blocks; the caret, when `caret`, goes in the last.
private struct PMMarkdownBlocks: View {
  let blocks: [PMMarkdownBlock]
  let context: PMMarkdownContext
  let caret: Bool

  var body: some View {
    ForEach(Array(blocks.enumerated()), id: \.offset) { index, block in
      PMMarkdownBlockView(
        block: block, context: context, caret: caret && index == blocks.count - 1)
    }
  }
}

private struct PMMarkdownBlockView: View {
  @Environment(\.pmTheme) private var theme
  let block: PMMarkdownBlock
  let context: PMMarkdownContext
  let caret: Bool

  var body: some View {
    let space = theme.defaultDensity.space
    switch block {
    case .paragraph(let text):
      PMMarkdownParagraph(text: text, context: context, caret: caret)
    case .image(let url, let alt):
      PMMarkdownImage(url: url, alt: alt, step: context.step)
    case .heading(let depth, let text):
      PMHeading(props: PMHeadingProps(children: text, level: level(depth)))
    case .code(let code, let closed):
      PMCodeBlock(props: PMCodeBlockProps(children: code, copyable: closed))
    case .quote(let inner):
      VStack(alignment: .leading, spacing: space.s3) {
        PMMarkdownBlocks(blocks: inner, context: context, caret: caret)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .pmQuoteRule()
    case .list(let ordered, let items):
      PMMarkdownList(ordered: ordered, items: items, context: context, caret: caret)
    case .table(let numeric, let header, let rows):
      PMMarkdownTable(numeric: numeric, header: header, rows: rows, context: context)
    case .rule:
      PMSeparator(props: PMSeparatorProps())
    }
  }

  /// The shallowest heading is level 2; each deeper one a level more, at most 4.
  private func level(_ depth: Int) -> PMHeadingLevel {
    let level = 2 + depth - context.shallowest
    return level >= 4 ? .level4 : level == 3 ? .level3 : .level2
  }
}

/// A paragraph: Text's recipe at the body step, its runs styled as their
/// members, with the caret after it when it is the last.
private struct PMMarkdownParagraph: View {
  @Environment(\.pmTheme) private var theme
  private var scale = PMTextScale()
  let text: AttributedString
  let context: PMMarkdownContext
  let caret: Bool

  init(text: AttributedString, context: PMMarkdownContext, caret: Bool) {
    self.text = text
    self.context = context
    self.caret = caret
  }

  var body: some View {
    let runs = PMMarkdownRuns(theme: theme, scale: scale.factor, step: context.step)
    PMCaretText(
      content: runs.text(text, sources: context.sources), step: context.step,
      showing: caret
    )
    .pmTextStyle(context.step)
    .foregroundStyle(theme.colors.textPrimary.color)
    .tint(theme.colors.accentText.color)
    .multilineTextAlignment(.leading)
    .fixedSize(horizontal: false, vertical: true)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityAddTraits(caret ? .updatesFrequently : [])
  }
}

/// The inline members' recipes, as attributes of a paragraph's runs.
private struct PMMarkdownRuns {
  let theme: PMTheme
  let scale: CGFloat
  /// The step of the text around the runs, which a citation mark is set at the top of.
  let step: PMTextStyle

  /// The narrow no-break space that stands for a wash's inline padding.
  private static let pad = "\u{202F}"

  /// The runs as one Text, Link's `open-external` glyph after each external
  /// link (`link.md`), a narrow space from its label, in the link's colour.
  func text(_ text: AttributedString, sources: [PMCitationSource]) -> Text {
    let parts = segments(text, sources: sources)
    var joined = Text(parts.first ?? AttributedString())
    for part in parts.dropFirst() {
      joined =
        joined + Text(verbatim: Self.pad)
        + Text.pmIcon(.openExternal).foregroundStyle(theme.colors.accentText.color) + Text(part)
    }
    return joined
  }

  /// The styled runs, split after each external link, where its glyph goes.
  private func segments(_ text: AttributedString, sources: [PMCitationSource]) -> [AttributedString] {
    let colors = theme.colors
    let runs = Array(text.runs)
    var parts: [AttributedString] = []
    var styled = AttributedString()
    for (index, run) in runs.enumerated() {
      var piece = AttributedString(text[run.range])
      let isCode = run.inlinePresentationIntent?.contains(.code) ?? false
      if piece.imageURL != nil { piece.imageURL = nil }

      if let link = run.link {
        if PMMarkdownLink.safe(link) == nil {
          piece.link = nil
        } else {
          // Link's inline recipe; emphasis in a link's label is dropped, as
          // Link's children are a string.
          piece.inlinePresentationIntent = nil
          piece.swiftUI.foregroundColor = colors.accentText.color
          piece.swiftUI.underlineStyle = Text.LineStyle(
            pattern: .solid, color: colors.accentUnderline.color)
        }
        styled.append(piece)
        let ends = index == runs.count - 1 || runs[index + 1].link != link
        if ends, PMMarkdownLink.external(link) {
          parts.append(styled)
          styled = AttributedString()
        }
      } else if isCode {
        // Code's face and wash, padded at the span's two ends.
        var intent = run.inlinePresentationIntent ?? []
        intent.remove(.code)
        piece.inlinePresentationIntent = intent.isEmpty ? nil : intent
        let opens =
          index == 0 || !(runs[index - 1].inlinePresentationIntent?.contains(.code) ?? false)
        let closes =
          index == runs.count - 1
          || !(runs[index + 1].inlinePresentationIntent?.contains(.code) ?? false)
        if opens { styled.append(code(AttributedString(Self.pad))) }
        styled.append(code(piece))
        if closes { styled.append(code(AttributedString(Self.pad))) }
      } else {
        let following =
          runs.indices.contains(index + 1) ? text[runs[index + 1].range].characters.first : nil
        styled.append(citations(in: piece, following: following, sources: sources))
      }
    }
    parts.append(styled)
    return parts
  }

  private func code(_ piece: AttributedString) -> AttributedString {
    var piece = piece
    piece.swiftUI.font = theme.text.sm.set(in: theme.fonts.mono).runFont(scale: scale)
    piece.swiftUI.foregroundColor = theme.colors.textPrimary.color
    piece.swiftUI.backgroundColor = theme.colors.bgSubtle.color
    return piece
  }

  /// `piece` with each `[n]` that names one of `sources`, and is not a link's
  /// label, as Citation's mark; any other `[n]` stays text.
  private func citations(
    in piece: AttributedString, following: Character?, sources: [PMCitationSource]
  ) -> AttributedString {
    guard !sources.isEmpty else { return piece }
    let characters = Array(piece.characters)
    let at = { (offset: Int) in piece.characters.index(piece.startIndex, offsetBy: offset) }
    var result = AttributedString()
    var copied = 0
    var scan = 0
    while scan < characters.count {
      guard characters[scan] == "[" else {
        scan += 1
        continue
      }
      var close = scan + 1
      while close < characters.count, close - scan <= 3, characters[close].isASCII,
        characters[close].isNumber
      {
        close += 1
      }
      let after = close + 1 < characters.count ? characters[close + 1] : following
      guard close < characters.count, characters[close] == "]", after != "(",
        let number = Int(String(characters[(scan + 1)..<close])),
        (1...sources.count).contains(number)
      else {
        scan += 1
        continue
      }
      result.append(piece[at(copied)..<at(scan)])
      result.append(mark(number, source: sources[number - 1]))
      copied = close + 1
      scan = close + 1
    }
    result.append(piece[at(copied)..<piece.endIndex])
    return result
  }

  /// Citation's mark as a run: the number on the accent wash, set at the top
  /// of the line, linking to the source when its `href` is a URL.
  private func mark(_ number: Int, source: PMCitationSource) -> AttributedString {
    let xs = theme.text.xs
    var mark = AttributedString(Self.pad + String(number) + Self.pad)
    mark.swiftUI.font = xs.runFont(scale: scale)
    mark.swiftUI.foregroundColor = theme.colors.accentText.color
    mark.swiftUI.backgroundColor = theme.colors.accentSubtle.color
    mark.swiftUI.baselineOffset =
      PMFontMetrics.ascender(step, size: step.size * scale)
      - PMFontMetrics.ascender(xs, size: xs.size * scale)
    if let url = URL(string: source.href) { mark.link = url }
    return mark
  }
}

/// A list: its items `space-2` apart, each its marker in a `space-6` column
/// and its blocks `space-2` apart. An ordered list numbers its items as the
/// source does; an unordered one draws a disc, then a circle, then a square as
/// it nests. A bullet is punctuation, hidden from assistive technology; a
/// number is read, because the order is content.
private struct PMMarkdownList: View {
  @Environment(\.pmTheme) private var theme
  let ordered: Bool
  let items: [PMMarkdownItem]
  let context: PMMarkdownContext
  let caret: Bool

  var body: some View {
    let space = theme.defaultDensity.space
    VStack(alignment: .leading, spacing: space.s2) {
      ForEach(Array(items.enumerated()), id: \.offset) { index, item in
        HStack(alignment: .firstTextBaseline, spacing: space.s2) {
          Text(verbatim: marker(item.ordinal))
            .pmTextStyle(context.step)
            .foregroundStyle(theme.colors.textSecondary.color)
            .fixedSize()
            .frame(width: space.s6 - space.s2, alignment: .trailing)
            .accessibilityHidden(!ordered)
          VStack(alignment: .leading, spacing: space.s2) {
            PMMarkdownBlocks(
              blocks: item.blocks, context: context.nested(),
              caret: caret && index == items.count - 1)
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

/// A pipe table as Table: a header row and body rows, each cell its runs
/// styled as a paragraph's, numeric where the column's delimiter ends in `:`.
private struct PMMarkdownTable: View {
  @Environment(\.pmTheme) private var theme
  private var scale = PMTextScale()
  let numeric: [Bool]
  let header: [AttributedString]
  let rows: [[AttributedString]]
  let context: PMMarkdownContext

  init(
    numeric: [Bool], header: [AttributedString], rows: [[AttributedString]],
    context: PMMarkdownContext
  ) {
    self.numeric = numeric
    self.header = header
    self.rows = rows
    self.context = context
  }

  var body: some View {
    let runs = PMMarkdownRuns(theme: theme, scale: scale.factor, step: theme.text.sm)
    let cell = { (text: AttributedString) in
      AnyView(runs.text(text, sources: context.sources).tint(theme.colors.accentText.color))
    }
    PMTable(
      props: PMTableProps(
        children: AnyView(
          Group {
            PMTable.Row(
              props: PMTableRowProps(
                children: AnyView(
                  ForEach(Array(header.enumerated()), id: \.offset) { column, text in
                    PMTable.Header(
                      props: PMTableHeaderProps(
                        children: cell(text), numeric: numeric[column]))
                  })))
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
              PMTable.Row(
                props: PMTableRowProps(
                  children: AnyView(
                    ForEach(Array(row.enumerated()), id: \.offset) { column, text in
                      PMTable.Cell(
                        props: PMTableCellProps(children: cell(text), numeric: numeric[column]))
                    })))
            }
          })))
  }
}

/// An image in place: the picture at its own width or the column's, whichever
/// is less, at `radius.md`, named by the alt text, or decorative when the alt
/// is empty. Nothing is drawn while it loads, as a browser draws an image with
/// no size of its own; when it cannot load, its alt text, as a browser does.
private struct PMMarkdownImage: View {
  @Environment(\.pmTheme) private var theme
  let url: URL?
  let alt: String
  let step: PMTextStyle

  var body: some View {
    AsyncImage(url: url) { phase in
      switch phase {
      case .success(let image):
        PMNaturalWidth {
          image.resizable().aspectRatio(contentMode: .fit)
        }
        .clipShape(RoundedRectangle(cornerRadius: theme.radius.md))
        .modifier(PMImageName(alt: alt))
      case .failure:
        Text(alt)
          .pmTextStyle(step)
          .foregroundStyle(theme.colors.textSecondary.color)
      default:
        EmptyView()
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// The image's name: its alt text, or hidden when the alt is empty.
private struct PMImageName: ViewModifier {
  let alt: String

  func body(content: Content) -> some View {
    if alt.isEmpty {
      content.accessibilityHidden(true)
    } else {
      content
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(alt))
        .accessibilityAddTraits(.isImage)
    }
  }
}

/// Its content at its ideal width, or the width offered when that is less, at
/// the height its aspect gives: the web's `max-inline-size: 100%` with
/// `block-size: auto`.
private struct PMNaturalWidth: Layout {
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let content = subviews.first else { return .zero }
    let ideal = content.sizeThatFits(.unspecified)
    guard ideal.width > 0 else { return .zero }
    let width = proposal.width.map { min($0, ideal.width) } ?? ideal.width
    return CGSize(width: width, height: ideal.height * width / ideal.width)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    subviews.first?.place(
      at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
  }
}

// MARK: - States

/// Markdown's states, from the spec's States table.
public struct MarkdownStates: PMStates {
  public let member = "Markdown"

  public init() {}

  static let prose = """
    The retry schedule is **exponential** with a cap at five attempts. The first retry fires \
    after two seconds and each one after that *doubles* the wait, so the fifth lands about a \
    minute after the first.

    Every attempt carries the original `Idempotency-Key` header — see \
    [the delivery guide](https://docs.example.org/webhooks/retries) for the exact timings.
    """

  static let structure = """
    ## What changed

    1. Retries now carry the original idempotency key.
    2. The backoff cap moved from three attempts to five.
       - The first retry still fires after two seconds.
       - Each later one doubles the wait.
    3. A `429` from the receiver is retried; a `410` is not.

    ### Why it matters

    A duplicate delivery is refused rather than applied twice, which is what the ~~old~~ \
    previous behaviour could not promise.
    """

  static let fence = """
    Add the header to every request:

    ```ts
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body,
    })
    ```

    The key is honoured for 24 hours.
    """

  static let table = """
    | Attempt | Wait | Cumulative |
    | --- | ---: | ---: |
    | 1 | 2s | 2s |
    | 2 | 4s | 6s |
    | 3 | 8s | 14s |
    | 4 | 16s | 30s |
    | 5 | 32s | 62s |
    """

  static let quote = """
    > Deliveries are retried with exponential backoff, up to five attempts, with the original \
    idempotency key on every attempt.

    ---

    That line is the whole contract.
    """

  static let cited = """
    Retries carry the original idempotency key, so a duplicate delivery is refused rather than \
    applied twice [1]. The key is honoured for a day after the first request that carried it [2].
    """

  static let openFence = "Here is the **fix\n\n```ts\nconst key = request.headers.get('Idemp"

  private static func markdown(
    _ source: String, size: PMMarkdownSize? = nil, sources: [PMCitationSource]? = nil,
    streaming: Bool? = nil
  ) -> PMMarkdown {
    PMMarkdown(
      props: PMMarkdownProps(children: source, size: size, sources: sources, streaming: streaming))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "prose — paragraphs with emphasis, inline code and a link", expect: ["size": "md"]
      ) {
        Self.markdown(Self.prose)
      },
      PMStateEntry(
        "structure — headings and a nested list", expect: ["size": "md", "contains": "Heading"]
      ) {
        Self.markdown(Self.structure)
      },
      PMStateEntry(
        "a fence — CodeBlock, copyable once closed", expect: ["contains": "CodeBlock,Button"]
      ) {
        // The fence's longest line overflows the column; at rest CodeBlock
        // shows the lines' start.
        Self.markdown(Self.fence)
      },
      PMStateEntry(
        "a table — Table, numeric columns right-aligned", expect: ["contains": "Table"]
      ) {
        Self.markdown(Self.table)
      },
      PMStateEntry("a quote and a rule", expect: ["size": "md"]) {
        Self.markdown(Self.quote)
      },
      PMStateEntry(
        "citations — [n] becomes a Citation when the reply has sources", expect: ["size": "md"]
      ) {
        Self.markdown(Self.cited, sources: SourceListStates.sources)
      },
      PMStateEntry("sm — the secondary step, for reasoning and asides", expect: ["size": "sm"]) {
        Self.markdown(Self.prose, size: .sm)
      },
      PMStateEntry(
        "streaming — an open fence and an unclosed emphasis, drawn as they are",
        expect: ["state": "streaming", "busy": "true", "contains": "CodeBlock"]
      ) {
        Self.markdown(Self.openFence, streaming: true)
      },
      PMStateEntry(
        "streaming prose — the caret at the end of the last paragraph",
        expect: ["state": "streaming"]
      ) {
        Self.markdown(String(Self.prose.prefix(90)), streaming: true)
      },
      // The pending bar is decorative, as StreamingText's is: the entry
      // exposes nothing to assistive technology. The root's identifier still
      // carries `pending=true`, the web's `data-pending`, but an entry that
      // exposes nothing has no element to read it from, so the entry promises
      // only that it is hidden.
      PMStateEntry("pending — nothing has landed", expect: ["hidden": "true"]) {
        Self.markdown("", streaming: true)
      },
    ]
  }
}
