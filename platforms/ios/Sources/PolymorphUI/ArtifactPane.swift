// ArtifactPane (`design/components/artifact-pane.md`): one artifact a turn
// produced, too big for the thread (a file, a page, a table, a preview), in a
// pane beside it. A Card for one artifact: Card's surface exactly (the page
// panel's), filling the box it is given, a header over a `border.subtle`
// hairline, and a body that is the pane's one scroll region. Not a Dialog,
// because nothing is modal, and not Tabs, because the views are readings of
// one thing. ConversationPage decides where the pane sits.
//
// The header is one wrapping row, `space-2` between rows and `space-3`
// between items, inset `space-3` and `space-4`: the mark (the kind's `sm`
// glyph in `text.muted`, `artifact` with no kind, the `sm` Spinner while the
// artifact is still written), the heading (the title in `text.md` at the
// `text.xl` weight and face, Heading level 4's cell, on one line, then `meta` in
// `text.xs`, muted), the switch between readings when there are two or more,
// the app's actions, and the close Button (`ghost/neutral/sm`, icon-only
// `close`, named by `closeLabel`) when `onClose` is set. The heading grows
// from a basis of twice `space-10`, so in a narrow pane the controls wrap
// under the title rather than the title being cut short beside them. The
// close stays at the end of the first row, at the pane's corner, where iOS
// puts a pane's close; on the web it wraps last. Buttons keep their hit
// targets, so on a phone the actions usually take the second row.
//
// The switch is SegmentedControl at `sm`, named by `viewsLabel`, as on the
// web: the views are readings of one thing, not the peer sections Tabs hold.
// The pane holds the chosen reading and hands it to the switch, as Tabs'
// panels follow their strip. Switching readings re-renders the body and
// nothing else moves.
//
// The body shows the chosen reading's content, or `children` when `views` is
// absent or empty, padded `space-4`. It scrolls only while the content is
// taller than the pane: then it is a container named by the title, as the
// web's body is a group named by the title once it overflows. The pane is one
// container named by its title, which is a heading. While streaming, the
// Spinner announces `streamingLabel` once, "{title}: still being written" by
// default, the web's status and `aria-busy`. `view` with `onViewChange` is the controlled pair; without it
// the pane keeps its own, from `defaultView` or the first view.
//
// At the glass depth the web draws the surface material; this pane wears
// Card's opaque surface at every depth, as Card does here.

import PolymorphTokens
import SwiftUI

public struct PMArtifactPane: PMArtifactPaneRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmPageScrolls) private var scrolls
  @State private var mirror: String?
  private let props: PMArtifactPaneProps

  public init(props: PMArtifactPaneProps) {
    self.props = props
    _mirror = State(initialValue: props.defaultView ?? props.views?.first?.id)
  }

  public var body: some View {
    let current = props.view ?? mirror
    let views = props.views ?? []
    let shown = views.isEmpty ? nil : views.first { $0.id == current } ?? views.first
    let streaming = props.streaming ?? false

    // The first form whose content fits the pane's height; else the one that scrolls.
    ViewThatFits(in: .vertical) {
      pane(shown: shown, views: views, current: current, streaming: streaming, overflowing: false)
      pane(shown: shown, views: views, current: current, streaming: streaming, overflowing: true)
    }
  }

  /// The surface, the header, the hairline and the body, and the pane's identity.
  private func pane(
    shown: PMArtifactView?, views: [PMArtifactView], current: String?, streaming: Bool,
    overflowing: Bool
  ) -> some View {
    var attributes: [String: String] = [:]
    if let kind = props.kind { attributes["kind"] = kind.rawValue }
    if streaming {
      attributes["state"] = "streaming"
      attributes["busy"] = "true"
    }
    if let shown { attributes["view"] = shown.id }
    if overflowing { attributes["overflowing"] = "true" }

    return PMPagePanel {
      VStack(alignment: .leading, spacing: 0) {
        header(views: views, current: shown?.id ?? current, streaming: streaming)
        PMRule(theme.colors.borderSubtle)
        content(shown)
          .modifier(ArtifactPaneScroll(overflowing: overflowing, scrolls: scrolls))
          .accessibilityElement(children: .contain)
          // The overflowing body is a group a reader moves through, named by the title.
          .modifier(PMOptionalLabel(label: overflowing ? props.title : nil))
      }
      .frame(maxHeight: .infinity, alignment: .top)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.title))
    .pmMember("ArtifactPane", attributes)
  }

  /// The shown reading, or the children, inside the content's padding.
  private func content(_ shown: PMArtifactView?) -> some View {
    (shown?.content ?? props.children ?? PMContent(EmptyView()))
      .padding(theme.defaultDensity.space.s4)
      .frame(maxWidth: .infinity, alignment: .topLeading)
  }

  private func header(views: [PMArtifactView], current: String?, streaming: Bool) -> some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    return ArtifactHeaderLayout(columnGap: space.s3, rowGap: space.s2, basis: space.s10 * PMRecipe.artifactHeadingBasis) {
      Group {
        if streaming {
          PMSpinner(
            props: PMSpinnerProps(
              label: props.streamingLabel ?? PMStrings.artifactStreaming(title: props.title),
              size: .sm))
        } else {
          PMIconView(mark, size: .sm)
        }
      }
      .foregroundStyle(colors.textMuted.color)

      VStack(alignment: .leading, spacing: 0) {
        Text(props.title)
          .pmTextStyle(theme.text.md.heading(like: theme.text.xl))
          .foregroundStyle(colors.textPrimary.color)
          .lineLimit(1)
          .truncationMode(.tail)
          .accessibilityAddTraits(.isHeader)
          .accessibilityHeading(.h2)
        if let meta = props.meta {
          Text(meta)
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(colors.textMuted.color)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .layoutValue(key: ArtifactHeaderRole.self, value: .heading)

      if views.count > 1 {
        PMSegmentedControl(
          props: PMSegmentedControlProps(
            label: props.viewsLabel ?? PMStrings.artifactViews, onChange: select,
            options: views.map { PMSegmentedControlOption(value: $0.id, label: $0.label) },
            size: .sm, value: current))
      }

      if let actions = props.actions {
        HStack(spacing: space.s1) { actions }
      }

      if let onClose = props.onClose {
        PMButton(
          props: PMButtonProps(
            icon: .close, iconOnly: true, label: props.closeLabel ?? PMStrings.close,
            onClick: onClose, size: .sm, appearance: .ghostNeutral)
        )
        .layoutValue(key: ArtifactHeaderRole.self, value: .close)
      }
    }
    .padding(.vertical, space.s3)
    .padding(.horizontal, space.s4)
  }

  /// The kind's glyph: the icon role for that kind of object.
  private var mark: PMIconRole {
    switch props.kind {
    case .code: .terminal
    case .document: .document
    case .data: .table
    case .preview: .browser
    case nil: .artifact
    }
  }

  private func select(_ id: String) {
    guard id != (props.view ?? mirror) else { return }
    mirror = id
    props.onViewChange?(id)
  }
}

/// The body's scroll: a scroll view while the content overflows, which keeps
/// its bounce for content that is taller than the pane; the content as it is
/// otherwise. Where scroll views are turned off (the rendering harness), the
/// overflowing content shows its start, clipped at the pane's edge.
private struct ArtifactPaneScroll: ViewModifier {
  let overflowing: Bool
  let scrolls: Bool

  func body(content: Content) -> some View {
    if !overflowing {
      content.frame(maxHeight: .infinity, alignment: .top)
    } else if scrolls {
      ScrollView(.vertical) { content }
        .scrollBounceBehavior(.basedOnSize)
    } else {
      // The height offered, with the content's start drawn in it at the
      // content's own height: a frame alone would grow to the content.
      Color.clear
        .overlay(alignment: .top) { content.fixedSize(horizontal: false, vertical: true) }
        .clipped()
    }
  }
}

/// What a header item is to the layout: the heading grows from its basis,
/// the close keeps the first row's trailing end, any other item is a control.
private enum ArtifactHeaderRole: LayoutValueKey {
  case control, heading, close
  static let defaultValue = ArtifactHeaderRole.control
}

/// The header's wrapping row (the web's `flex-wrap`): items in order, each at
/// its ideal width, the heading at `basis`, a new row when the next item does
/// not fit. The heading then grows into its row's free width, and every item
/// is centred on its row's height. The close is placed at the first row's
/// trailing end, its width kept free there.
private struct ArtifactHeaderLayout: Layout {
  let columnGap: CGFloat
  let rowGap: CGFloat
  let basis: CGFloat

  private struct Row {
    var items: [(index: Int, width: CGFloat)] = []
    var limit: CGFloat
    var height: CGFloat = 0
  }

  private func rows(_ width: CGFloat?, _ subviews: Subviews) -> [Row] {
    let bounded = width ?? .infinity
    let close = subviews.indices.first { subviews[$0][ArtifactHeaderRole.self] == .close }
    let reserve = close.map { subviews[$0].sizeThatFits(.unspecified).width + columnGap } ?? 0
    var rows = [Row(limit: max(0, bounded - reserve))]
    var used: CGFloat = 0

    for index in subviews.indices where index != close {
      let subview = subviews[index]
      let heading = subview[ArtifactHeaderRole.self] == .heading
      let ideal = subview.sizeThatFits(.unspecified).width
      let item = heading && width != nil ? basis : ideal
      let last = rows.count - 1
      let needed = rows[last].items.isEmpty ? item : used + columnGap + item
      if needed > rows[last].limit, !rows[last].items.isEmpty {
        rows.append(Row(items: [(index, item)], limit: bounded))
        used = item
      } else {
        rows[last].items.append((index, item))
        used = needed
      }
    }

    // The heading grows into its row's free width; nothing is wider than its row.
    for row in rows.indices {
      let taken =
        rows[row].items.map(\.width).reduce(0, +)
        + columnGap * CGFloat(max(0, rows[row].items.count - 1))
      let free = rows[row].limit - taken
      for item in rows[row].items.indices {
        var width = rows[row].items[item].width
        if subviews[rows[row].items[item].index][ArtifactHeaderRole.self] == .heading,
          free.isFinite
        {
          width = max(0, width + free)
        }
        rows[row].items[item].width = min(width, rows[row].limit)
      }
      rows[row].height = rows[row].items.map {
        subviews[$0.index].sizeThatFits(ProposedViewSize(width: $0.width, height: nil)).height
      }.max() ?? 0
    }
    if let close {
      rows[0].height = max(rows[0].height, subviews[close].sizeThatFits(.unspecified).height)
    }
    return rows
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let laid = rows(proposal.width, subviews)
    let height =
      laid.map(\.height).reduce(0, +) + rowGap * CGFloat(max(0, laid.count - 1))
    let width =
      proposal.width
      ?? subviews.map { $0.sizeThatFits(.unspecified).width }.reduce(0, +)
      + columnGap * CGFloat(max(0, subviews.count - 1))
    return CGSize(width: width, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let laid = rows(bounds.width, subviews)
    var y = bounds.minY
    for row in laid {
      var x = bounds.minX
      for item in row.items {
        subviews[item.index].place(
          at: CGPoint(x: x, y: y + row.height / 2), anchor: .leading,
          proposal: ProposedViewSize(width: item.width, height: nil))
        x += item.width + columnGap
      }
      y += row.height + rowGap
    }
    if let close = subviews.indices.first(where: {
      subviews[$0][ArtifactHeaderRole.self] == .close
    }), let first = laid.first {
      subviews[close].place(
        at: CGPoint(x: bounds.maxX, y: bounds.minY + first.height / 2), anchor: .trailing,
        proposal: .unspecified)
    }
  }
}

/// ArtifactPane's states, from the spec's States table. Each pane fills a box
/// of `space-10` × 4, the web's harness, because a pane with no box is a header
/// over an empty body; the body's scroll view is turned off, as a page's is,
/// because the harness draws no scroll view's content. The preview reading is
/// a heading and paragraphs where the web's is a Markdown, which has no
/// SwiftUI rendering yet.
public struct ArtifactPaneStates: PMStates {
  public let member = "ArtifactPane"

  public init() {}

  private static let code = """
    export async function deliver(event: WebhookEvent) {
      return retry(() => post(event), {
        attempts: 5,
        firstDelayMs: 2_000,
        idempotencyKey: event.id,
      })
    }
    """

  private static let notes = """
    ## What changed

    1. Retries now carry the original idempotency key.
    2. The backoff cap moved from three attempts to five.
    3. A `429` from the receiver is retried; a `410` is not.
    """

  private static func block(_ text: String) -> PMContent {
    PMContent(PMCodeBlock(props: PMCodeBlockProps(children: text)))
  }

  private static let heading = "What changed"
  private static let lead =
    "Retries now carry the original idempotency key, and the backoff cap moved from three "
    + "attempts to five."
  private static let detail = "A 429 from the receiver is retried; a 410 is not."

  private static func preview() -> PMContent {
    PMContent(
      PMStack(
        props: PMStackProps(
          children: PMContent(
            Group {
              PMHeading(props: PMHeadingProps(children: heading, level: .level3))
              PMText(props: PMTextProps(children: PMContent(Text(lead))))
              PMText(props: PMTextProps(children: PMContent(Text(detail)), tone: .secondary))
            }),
          gap: .s3)))
  }

  private static func actions() -> PMContent {
    PMContent(
      Group {
        PMButton(
          props: PMButtonProps(
            icon: .copy, iconOnly: true, label: "Copy", size: .sm, appearance: .ghostNeutral))
        PMButton(
          props: PMButtonProps(
            icon: .download, iconOnly: true, label: "Download", size: .sm,
            appearance: .ghostNeutral))
      })
  }

  private static let readings = [
    PMArtifactView(id: "preview", label: "Preview", content: preview()),
    PMArtifactView(id: "source", label: "Source", content: block(notes)),
  ]

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "code — one reading, the app’s controls, close",
        expect: ["kind": "code", "label": "deliver.ts"]
      ) {
        ArtifactPaneBox {
          PMArtifactPane(
            props: PMArtifactPaneProps(
              actions: Self.actions(), children: Self.block(Self.code), kind: .code,
              meta: "TypeScript · 9 lines", onClose: {}, title: "deliver.ts"))
        }
      },
      PMStateEntry(
        "two readings — the switch between preview and source",
        expect: ["kind": "document", "view": "preview", "label": "Release notes"]
      ) {
        ArtifactPaneBox {
          PMArtifactPane(
            props: PMArtifactPaneProps(
              actions: Self.actions(), kind: .document, meta: "Markdown · 3 sections",
              onClose: {}, title: "Release notes", views: Self.readings))
        }
      },
      PMStateEntry(
        "two readings, the second shown", expect: ["kind": "document", "view": "source"]
      ) {
        ArtifactPaneBox {
          PMArtifactPane(
            props: PMArtifactPaneProps(
              defaultView: "source", kind: .document, meta: "Markdown · 3 sections",
              title: "Release notes", views: Self.readings))
        }
      },
      PMStateEntry(
        "streaming — still being written",
        expect: ["kind": "code", "state": "streaming", "busy": "true"]
      ) {
        ArtifactPaneBox {
          PMArtifactPane(
            props: PMArtifactPaneProps(
              children: Self.block(String(Self.code.prefix(120))), kind: .code, streaming: true,
              title: "deliver.ts"))
        }
      },
      PMStateEntry(
        "a long artifact — the body scrolls inside the pane",
        expect: ["kind": "code", "overflowing": "true"]
      ) {
        ArtifactPaneBox {
          PMArtifactPane(
            props: PMArtifactPaneProps(
              children: Self.block([Self.code, Self.code, Self.code, Self.code].joined(
                separator: "\n\n")),
              kind: .code, meta: "TypeScript · 44 lines", onClose: {}, title: "deliver.ts"))
        }
      },
      PMStateEntry("no kind — the tier’s own mark", expect: ["label": "Untitled artifact"]) {
        ArtifactPaneBox {
          PMArtifactPane(
            props: PMArtifactPaneProps(children: Self.preview(), title: "Untitled artifact"))
        }
      },
    ]
  }
}

/// The spec's harness: a box `space-10` × 4 tall for the pane to fill, with
/// scroll views turned off.
private struct ArtifactPaneBox<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @ViewBuilder let content: () -> Content

  var body: some View {
    let height = theme.defaultDensity.space.s10 * PMFixtureSpan.region
    content()
      .frame(height: height)
  }
}
