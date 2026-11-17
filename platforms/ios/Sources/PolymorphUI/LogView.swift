// LogView (`design/components/log-view.md`): lines of output that arrive over
// time, held at the newest line while the reader is there. ChatThread's frame
// around CodeBlock's surface: the member fills the box it is given and scrolls
// inside it, on the mono face at `text.sm` in `text.primary` on `bg.subtle`,
// inside a `border.subtle` hairline at `radius.md`, the lines `space.2` from
// its top and bottom. The lines are a lazy stack, so a line that arrives lays
// out itself and the ones on screen. In a container with no height of its own
// the log grows with its lines.
//
// A line is a marker cell `space.6` wide, its time, and its text, each
// `space.3` in from the cell before it. A level is never colour alone: its icon
// sits in the marker cell, centred on the first line, and its word is read
// before the line. `info` is the muted icon on the log's own surface;
// `warning` and `error` wash the cell, `{tone}.text` on `{tone}.subtle`, as
// tall as the line, and the wash stops at the cell. The time and the source are
// `text.muted`, the source one space before the text. Whitespace is content. A
// long line wraps inside its row (`wrap`, the default) or, unwrapped, keeps to
// one row and the log scrolls sideways too. While `streaming`, a row after the
// last line holds StreamingText's steady caret where the next line will start.
//
// Follow is ChatThread's rule (`PMFollow`): while the reader is within `space.5`
// of the end, a line that arrives moves the log to its new end, at once.
// Scrolling sideways does not stop it. Once the reader has scrolled up, nothing
// moves until they press the jump control: Button `outline/neutral/sm` with the
// `down` glyph, named by `messages.jumpToLatest`, on a raised backing
// (`bg.raised`, `radius.control`, `shadow.raised`), centred `space.4` above the
// bottom edge. It exists only while the reader is detached, so it is out of the
// tree, the accessibility tree included, while it would do nothing. The log
// starts at its end.
//
// Accessibility: the root is a container named by `label`, the web's `log`,
// and updates frequently while streaming, its `aria-busy`; with no lines yet it
// is one element so named, because UIKit publishes no empty container. It announces
// nothing, as the web's `aria-live="off"` says. Each line is one element read
// as its level's word, its time, its source and its text; the markers and the
// caret are hidden. The web makes the region a tab stop while it overflows;
// here VoiceOver scrolls it with its own gesture and a hardware keyboard with
// the system's, so it takes no focus of its own.
//
// The rendering harness draws no scroll view's content, so with scrolling off
// (`pmPageScrolls`) the lines are drawn whole, and in a box they show what a
// log at rest at its end shows, the newest lines, clipped at the top. The
// detached state is the reader's own and no prop reaches it, so no fixture
// draws the jump control.

import PolymorphTokens
import SwiftUI

public struct PMLogView: PMLogViewRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmPageScrolls) private var scrolls
  /// The reader has scrolled up out of the follow: the web's `data-state="detached"`.
  @State private var detached = false
  @State private var follow = PMFollow("log-view")
  /// The viewport's width, which an unwrapped log's lines are at least as wide as.
  @State private var width: CGFloat = 0
  private let props: PMLogViewProps

  public init(props: PMLogViewProps) {
    self.props = props
  }

  public var body: some View {
    let streaming = props.streaming ?? false
    let wrap = props.wrap ?? true
    let messages = props.messages ?? PMStrings.logViewMessages
    let shape = RoundedRectangle(cornerRadius: theme.radius.md)

    ScrollViewReader { proxy in
      region(proxy, wrap: wrap, streaming: streaming, messages: messages)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(theme.colors.bgSubtle.color, in: shape)
        .clipShape(shape)
        .overlay { shape.strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
        .overlay(alignment: .bottom) {
          if detached {
            PMButton(
              props: PMButtonProps(
                icon: .down, label: messages.jumpToLatest, onClick: { jump(proxy) }, size: .sm,
                appearance: .outlineNeutral)
            )
            .background(
              theme.colors.bgRaised.color, in: RoundedRectangle(cornerRadius: theme.radius.control)
            )
            .pmShadow(theme.shadows.raised)
            .padding(.bottom, theme.defaultDensity.space.s4)
          }
        }
    }
    // A log with no lines is one element of its own, because UIKit publishes
    // no container that holds nothing a reader can reach.
    .accessibilityElement(children: props.lines.isEmpty ? .ignore : .contain)
    .accessibilityLabel(Text(props.label))
    .accessibilityAddTraits(streaming ? .updatesFrequently : [])
    .pmMember("LogView", attributes(streaming: streaming, wrap: wrap))
  }

  /// The lines in their scroll region, or at rest where scrolling is off.
  @ViewBuilder
  private func region(
    _ proxy: ScrollViewProxy, wrap: Bool, streaming: Bool, messages: PMLogViewMessages
  ) -> some View {
    if scrolls {
      ScrollView(wrap ? .vertical : [.vertical, .horizontal]) {
        VStack(spacing: 0) {
          LazyVStack(alignment: .leading, spacing: 0) {
            lines(wrap: wrap, streaming: streaming, messages: messages)
          }
          .padding(.vertical, theme.defaultDensity.space.s2)
          .frame(minWidth: wrap ? nil : width, alignment: .leading)
          // The end the log follows and the jump control returns to.
          Color.clear.frame(height: 0).id(follow.end)
        }
        .onGeometryChange(for: PMFollowExtent.self) { geometry in
          PMFollowExtent(
            height: geometry.size.height,
            bottom: geometry.frame(in: .named(follow.space)).maxY)
        } action: { extent in
          settle(extent, proxy)
        }
      }
      .coordinateSpace(.named(follow.space))
      .onGeometryChange(for: CGSize.self) { $0.size } action: { size in
        width = size.width
        follow.viewport = size.height
        if let extent = follow.extent { settle(extent, proxy) }
      }
      .modifier(PMFollowScrollPhases(follow: follow))
      .modifier(PMFollowStartsAtEnd())
    } else {
      // What the log shows at rest at its end: the lines from the top of a box
      // that holds them all; in a box too short for them, the newest, the
      // oldest clipped at the top.
      let column = VStack(alignment: .leading, spacing: 0) {
        lines(wrap: wrap, streaming: streaming, messages: messages)
      }
      .padding(.vertical, theme.defaultDensity.space.s2)
      .fixedSize(horizontal: !wrap, vertical: false)
      // Zero minimum widths, so an unwrapped log's box is the one offered, its
      // lines drawn from their start, and not as wide as its longest line.
      ViewThatFits(in: .vertical) {
        column
          .frame(minWidth: 0, maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        column
          .fixedSize(horizontal: !wrap, vertical: true)
          .frame(
            minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity,
            alignment: .bottomLeading
          )
          .clipped()
      }
    }
  }

  /// Every line, oldest first, and the caret's row while more are coming.
  @ViewBuilder
  private func lines(wrap: Bool, streaming: Bool, messages: PMLogViewMessages) -> some View {
    ForEach(props.lines, id: \.id) { line in
      PMLogLineRow(line: line, wrap: wrap, messages: messages)
    }
    if streaming { PMLogCaretRow() }
  }

  /// One observation of the lines: follow them to the new end, or decide
  /// whether the reader is still at it.
  private func settle(_ extent: PMFollowExtent, _ proxy: ScrollViewProxy) {
    if follow.observe(extent, slack: theme.defaultDensity.space.s5) { follow.toEnd(proxy) }
    if detached == follow.following { detached = !follow.following }
  }

  /// The jump control: back to the end, following again.
  private func jump(_ proxy: ScrollViewProxy) {
    follow.following = true
    detached = false
    follow.toEnd(proxy)
  }

  /// The web's `data-state="detached"` while the reader is out of the follow,
  /// `data-streaming` with the log's `aria-busy` while more lines are coming,
  /// and `data-wrap` while long lines wrap.
  private func attributes(streaming: Bool, wrap: Bool) -> [String: String] {
    var attributes: [String: String] = [:]
    if detached { attributes["state"] = "detached" }
    if streaming {
      attributes["streaming"] = "true"
      attributes["busy"] = "true"
    }
    if wrap { attributes["wrap"] = "true" }
    return attributes
  }
}

/// One line: its level's marker, its time, its source and its text, read as
/// one element in that order with the level's word first.
private struct PMLogLineRow: View {
  @Environment(\.pmTheme) private var theme
  let line: PMLogLine
  let wrap: Bool
  let messages: PMLogViewMessages

  var body: some View {
    let colors = theme.colors
    let space = theme.defaultDensity.space
    let step = theme.text.sm.set(in: theme.fonts.mono)
    let (icon, ink, wash, word): (PMIconRole?, PMDynamicColor, PMDynamicColor?, String?) =
      switch line.level {
      case .info: (.info, colors.textMuted, nil, messages.info)
      case .warning: (.warning, colors.warningText, colors.warningSubtle, messages.warning)
      case .error: (.error, colors.dangerText, colors.dangerSubtle, messages.error)
      case nil: (nil, colors.textMuted, nil, nil)
      }
    let spoken = [word, line.time, line.source, line.text].compactMap { $0 }
      .filter { !$0.isEmpty }.joined(separator: " ")

    HStack(alignment: .top, spacing: 0) {
      // One line tall at least, and as tall as the line, so the wash marks all
      // of a wrapped line; the icon is centred on the first.
      PMLogLineBox(step: step)
        .overlay {
          if let icon { PMIconView(icon, size: .sm).foregroundStyle(ink.color) }
        }
        .frame(width: space.s6)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(wash?.color ?? .clear)
      if let time = line.time {
        Text(verbatim: time)
          .pmTextStyle(step)
          .foregroundStyle(colors.textMuted.color)
          .fixedSize()
          .padding(.leading, space.s3)
      }
      text(step)
        .pmTextStyle(step)
        .foregroundStyle(colors.textPrimary.color)
        .fixedSize(horizontal: !wrap, vertical: true)
        .padding(.horizontal, space.s3)
        .frame(maxWidth: wrap ? .infinity : nil, alignment: .leading)
    }
    .fixedSize(horizontal: false, vertical: true)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: spoken))
    .accessibilityAddTraits(.isStaticText)
    .accessibilityHidden(spoken.isEmpty)
  }

  /// The source, muted and a space before the text, then the text.
  private func text(_ step: PMTextStyle) -> Text {
    guard let source = line.source else { return Text(verbatim: line.text) }
    return Text(verbatim: source).foregroundStyle(theme.colors.textMuted.color)
      + Text(verbatim: " ") + Text(verbatim: line.text)
  }
}

/// A box one line of `step` tall and no wider than a space: what keeps a
/// marker cell and the caret's row a line tall at any text size.
private struct PMLogLineBox: View {
  let step: PMTextStyle

  var body: some View {
    Text(verbatim: " ").pmTextStyle(step).hidden().accessibilityHidden(true)
  }
}

/// Where the next line will appear while more are coming: a row one line tall
/// with StreamingText's steady caret at the text's start, `PMGeometry.proseStroke`
/// wide and the step's size tall, in `accent.bg`. Hidden from accessibility,
/// which reads the root's busy trait instead.
private struct PMLogCaretRow: View {
  @Environment(\.pmTheme) private var theme
  private var scale = PMTextScale()

  var body: some View {
    let step = theme.text.sm.set(in: theme.fonts.mono)
    let space = theme.defaultDensity.space
    PMLogLineBox(step: step)
      .frame(maxWidth: .infinity, alignment: .leading)
      .overlay(alignment: .leading) {
        RoundedRectangle(cornerRadius: PMGeometry.caretRadius)
          .fill(theme.colors.accentBg.color)
          .frame(width: PMGeometry.proseStroke, height: step.size * scale.factor)
          .padding(.leading, space.s6 + space.s3)
      }
      .accessibilityHidden(true)
  }
}

/// LogView's states, from the spec's States table. The log fills its box: the
/// entries about scrolling render in a box three `space.10`s tall, as the web
/// fixture's harness is, and the others grow to their lines.
public struct LogViewStates: PMStates {
  public let member = "LogView"

  public init() {}

  /// A build's output: plain lines, a warning and two errors, as a bundler writes them.
  static let build: [PMLogLine] = [
    PMLogLine(id: "b1", text: "> relay@2.4.0 build"),
    PMLogLine(id: "b2", text: "> vite build"),
    PMLogLine(id: "b3", text: "vite v6.3.5 building for production..."),
    PMLogLine(id: "b4", text: "1284 modules transformed."),
    PMLogLine(
      id: "b5", text: "src/legacy/chart.ts (14:3): 'Chart' is defined but never used.",
      level: .warning),
    PMLogLine(id: "b6", text: "dist/index.html                 0.48 kB  gzip:   0.31 kB"),
    PMLogLine(id: "b7", text: "dist/assets/index-4f2a9c.css   38.12 kB  gzip:   7.90 kB"),
    PMLogLine(
      id: "b8",
      text: "src/inbox/InboxPage.tsx (88:17): Property 'assignee' does not exist on type 'Ticket'.",
      level: .error),
    PMLogLine(id: "b9", text: "Build failed in 4.21s.", level: .error),
  ]

  /// A service's logs: every line has a time, a level and the service that wrote it.
  static let services: [PMLogLine] = [
    PMLogLine(
      id: "s1", text: "GET / 200 96ms cache=edge", level: .info, time: "14:24:01.118",
      source: "svc-web"),
    PMLogLine(
      id: "s2", text: "slow query 1840ms: SELECT id, status FROM orders WHERE status = $1",
      level: .warning, time: "14:24:03.402", source: "svc-api"),
    PMLogLine(
      id: "s3", text: "job billing.settle done in 412ms attempts=1", level: .info,
      time: "14:24:05.733", source: "svc-worker"),
    PMLogLine(
      id: "s4", text: "pg: connection reset by peer (pool=replica attempt=1)", level: .error,
      time: "14:24:08.019", source: "svc-api"),
    PMLogLine(
      id: "s5", text: "GET /api/session 200 12ms", level: .info, time: "14:24:09.250",
      source: "svc-web"),
  ]

  /// Forty lines of a deploy, more than the box holds, so the log scrolls and follows.
  static let deploy: [PMLogLine] = (1...40).map { step in
    let offset = String(repeating: "0", count: max(0, 3 - String((step - 1) * 3).count))
      + String((step - 1) * 3)
    return PMLogLine(
      id: "d\(step)", text: "step \(step) of 40: uploaded packages/relay/dist/chunk-\(step).js",
      time: "+\(offset)s")
  }

  /// Lines with no break in them and a table whose columns line up, wider than any box.
  static let wide: [PMLogLine] = [
    PMLogLine(id: "w1", text: "PID   USER     %CPU  %MEM  COMMAND"),
    PMLogLine(id: "w2", text: "4120  relay    12.4   3.1  node dist/server.js --port 8080 --workers 4"),
    PMLogLine(id: "w3", text: "4188  relay     0.3   0.4  node dist/worker.js --queue jobs-prod"),
    PMLogLine(
      id: "w4", text: "signing_key=whsec_" + String(repeating: "JBSWY3DPEHPK3PXP", count: 8),
      level: .warning),
  ]

  private static func log(
    _ label: String, _ lines: [PMLogLine], streaming: Bool? = nil, wrap: Bool? = nil
  ) -> PMLogView {
    PMLogView(props: PMLogViewProps(label: label, lines: lines, streaming: streaming, wrap: wrap))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "build output — plain lines, a warning and two errors",
        expect: ["wrap": "true", "state": "", "streaming": "", "label": "Build output"]
      ) {
        Self.log("Build output", Self.build)
      },
      PMStateEntry(
        "service logs — a time, a level and a source on every line",
        expect: ["label": "Service logs"]
      ) {
        Self.log("Service logs", Self.services)
      },
      PMStateEntry(
        "streaming — more lines coming, a caret after the last",
        expect: ["streaming": "true", "busy": "true"]
      ) {
        Self.log("Build output", Array(Self.build.prefix(4)), streaming: true)
      },
      PMStateEntry(
        "waiting — streaming with no lines yet",
        expect: ["streaming": "true", "label": "Build output"]
      ) {
        Self.log("Build output", [], streaming: true)
      },
      PMStateEntry(
        "in a box — the log scrolls inside itself, held at the newest line",
        expect: ["label": "Deploy log"]
      ) {
        LogViewBox { Self.log("Deploy log", Self.deploy) }
      },
      PMStateEntry(
        "unwrapped — long lines scroll the log sideways", expect: ["wrap": "", "label": "Process list"]
      ) {
        LogViewBox { Self.log("Process list", Self.wide, wrap: false) }
      },
      PMStateEntry(
        "narrow — long lines wrap in a phone’s column", expect: ["wrap": "true", "label": "Process list"]
      ) {
        LogViewBox(narrow: true) { Self.log("Process list", Self.wide) }
      },
    ]
  }
}

/// A box three `space.10`s tall for the log to fill, the web fixture's harness;
/// narrow, as wide as it is tall, a phone's column.
private struct LogViewBox<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  var narrow = false
  @ViewBuilder let content: () -> Content

  var body: some View {
    let side = theme.defaultDensity.space.s10 * PMFixtureSpan.log
    content()
      .frame(width: narrow ? side : nil, height: side)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}
