// TableOfContents (`design/components/table-of-contents.md`): the links to
// the sections of one long page, with the section the reader went to marked.
// It is not SectionNav, whose items are pages, and not Tree, which a reader
// opens level by level.
//
// A column `space.2` apart: the overline (`label`, `text.xs`, uppercase,
// `text.muted`, `space.3` in), then the links `space.1` apart. A level-2 item
// sits in a sublist under the item before it, `space.1` below it and
// `space.4` in from the leading edge, its links `space.1` apart; a level-2
// item with nothing before it is drawn at the first level. A link is a SwiftUI
// `Link` across the column: its label in `text.sm`, `text.secondary`, `space.2`
// by `space.3` inside a shape of `radius.md` at least the small control height
// tall, wrapping onto further lines. Under the pointer and while pressed, a
// link other than the marked one is `text.primary` on `bg.subtle`, over the
// control duration, and a press scales it as a pressed control. The marked
// link is `selection.text` on `selection.bg`, SectionNav's selection. Each
// link takes the hit target's height in the layout (`pmHitTarget`), so
// neighbouring links' touch areas do not overlap.
//
// A link opens `#id` through the environment's `openURL`, which is how an app
// scrolls its page to the section: its `OpenURLAction` finds the section's
// view and moves its scroll view there. When the app accepts the URL, the link
// is marked at once and `onCurrentChange` is called with its id, the web's
// click rule; when the app discards it, as for a section the page does not
// hold, nothing is marked. Of two items with one id, the first is marked.
//
// The current section does not follow the reader's scroll (`PLATFORM_GAPS` in
// `packages/native/src/pending.ts`): the sections are the app's views in the
// app's scroll view, which a SwiftUI view outside them cannot measure. Until
// the reader goes to a section through the list, no link is marked; after,
// the mark stays on that section until they go to another.
//
// The column is one container named by `label`, the web's navigation
// landmark, whose links VoiceOver finds one by one; the overline reads as its
// words. The marked link has the selected trait, the web's
// `aria-current="location"`. Nothing moves between links: the mark does not
// slide.

import PolymorphTokens
import SwiftUI

public struct PMTableOfContents: PMTableOfContentsRendering {
  @Environment(\.pmTheme) private var theme
  @State private var marked: String?
  private let props: PMTableOfContentsProps

  public init(props: PMTableOfContentsProps) {
    self.props = props
  }

  /// A list with `marked` already gone to, as the states fixture draws it.
  init(props: PMTableOfContentsProps, marked: String?) {
    self.props = props
    _marked = State(initialValue: marked)
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let at = marked.flatMap { id in props.items.firstIndex { $0.id == id } }

    VStack(alignment: .leading, spacing: space.s2) {
      Text(props.label)
        .textCase(.uppercase)
        .pmTextStyle(theme.text.xs)
        .foregroundStyle(theme.colors.textMuted.color)
        .padding(.horizontal, space.s3)
        .accessibilityLabel(Text(props.label))
      VStack(alignment: .leading, spacing: space.s1) {
        ForEach(Self.groups(props.items), id: \.at) { group in
          VStack(alignment: .leading, spacing: 0) {
            link(group.at, current: group.at == at)
            if !group.children.isEmpty {
              VStack(alignment: .leading, spacing: space.s1) {
                ForEach(group.children, id: \.self) { child in
                  link(child, current: child == at)
                }
              }
              .padding(.top, space.s1)
              .padding(.leading, space.s4)
            }
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.label))
    .pmMember("TableOfContents", at.map { ["current": props.items[$0].id] } ?? [:])
  }

  private func link(_ index: Int, current: Bool) -> some View {
    TableOfContentsLink(item: props.items[index], current: current, onArrive: arrive)
  }

  /// The reader went to the section `id` through the list: it is marked, and
  /// the app is told when the mark changes.
  private func arrive(_ id: String) {
    guard marked != id else { return }
    marked = id
    props.onCurrentChange?(id)
  }

  /// The items as the list draws them, by index: each section with the
  /// subsections after it. A subsection with no section before it is drawn as
  /// a section.
  static func groups(_ items: [PMTableOfContentsItem]) -> [TableOfContentsGroup] {
    var groups: [TableOfContentsGroup] = []
    for (index, item) in items.enumerated() {
      if item.level == .level2, !groups.isEmpty {
        groups[groups.count - 1].children.append(index)
      } else {
        groups.append(TableOfContentsGroup(at: index))
      }
    }
    return groups
  }
}

/// A first-level item and the subsections drawn under it, by their indices in
/// `items`. Keyed by position, because two items may share an id.
struct TableOfContentsGroup: Equatable {
  let at: Int
  var children: [Int] = []
}

/// One link, to its section's fragment, or its label alone when the id makes
/// no URL.
private struct TableOfContentsLink: View {
  @Environment(\.openURL) private var openURL
  let item: PMTableOfContentsItem
  let current: Bool
  let onArrive: @MainActor (String) -> Void

  var body: some View {
    if let url = Self.fragment(item.id) {
      Link(destination: url) { label }
        .buttonStyle(TableOfContentsLinkStyle(current: current))
        // The app's action opens the fragment; the link is marked when it accepts it.
        .environment(
          \.openURL,
          OpenURLAction { url in
            let id = item.id
            openURL(url) { accepted in
              if accepted { onArrive(id) }
            }
            return .handled
          }
        )
        .accessibilityAddTraits(current ? .isSelected : [])
    } else {
      TableOfContentsLinkChrome(current: current, pressed: false) { label }
    }
  }

  private var label: some View {
    Text(item.label)
      .multilineTextAlignment(.leading)
      .fixedSize(horizontal: false, vertical: true)
  }

  /// The fragment that names the section, `#id`.
  static func fragment(_ id: String) -> URL? {
    id.addingPercentEncoding(withAllowedCharacters: .urlFragmentAllowed).flatMap {
      URL(string: "#\($0)")
    }
  }
}

private struct TableOfContentsLinkStyle: ButtonStyle {
  let current: Bool

  func makeBody(configuration: Configuration) -> some View {
    TableOfContentsLinkChrome(current: current, pressed: configuration.isPressed) {
      configuration.label
    }
  }
}

/// A link's shape: the selection on the marked link, and the subtle wash with
/// the primary text under the pointer and while pressed on the others.
private struct TableOfContentsLinkChrome<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @State private var hovering = false
  let current: Bool
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let density = theme.defaultDensity
    let colors = theme.colors
    let motion = theme.defaultMotion
    let active = !current && (hovering || pressed)
    let text = current ? colors.selectionText : active ? colors.textPrimary : colors.textSecondary
    let fill = current ? colors.selectionBg.color : active ? colors.bgSubtle.color : .clear

    label()
      .pmTextStyle(theme.text.sm)
      .foregroundStyle(text.color)
      .padding(.vertical, density.space.s2)
      .padding(.horizontal, density.space.s3)
      .frame(maxWidth: .infinity, minHeight: density.controlHeight.sm, alignment: .leading)
      .background(fill, in: RoundedRectangle(cornerRadius: theme.radius.md))
      .pmPressFeedback(pressed)
      .animation(motion.easing.standard.animation(duration: motion.duration.control), value: active)
      .onHover { hovering = $0 }
      .pmHitTarget()
  }
}

/// TableOfContents's states, from the spec's States table: a page of
/// sections before and after the reader goes to one, two levels, a long label
/// and a section the page lacks. The list draws without its page on a phone,
/// so the web's entry at a phone's width is the first one.
public struct TableOfContentsStates: PMStates {
  public let member = "TableOfContents"

  public init() {}

  private static let label = "On this page"

  private static let sections = [
    PMTableOfContentsItem(id: "overview", label: "Overview"),
    PMTableOfContentsItem(id: "install", label: "Install"),
    PMTableOfContentsItem(id: "configure", label: "Configure"),
    PMTableOfContentsItem(id: "deploy", label: "Deploy"),
    PMTableOfContentsItem(id: "troubleshoot", label: "Troubleshoot"),
  ]

  private static let levels = [
    sections[0], sections[1],
    PMTableOfContentsItem(id: "npm", label: "With npm", level: .level2),
    PMTableOfContentsItem(id: "pnpm", label: "With pnpm", level: .level2),
    sections[2],
    PMTableOfContentsItem(id: "environment", label: "Environment", level: .level2),
    sections[3],
  ]

  private static let long = [
    sections[0],
    PMTableOfContentsItem(
      id: "approvals",
      label: "Delegated administration approvals awaiting a second reviewer in every region"),
    sections[3],
  ]

  private static let missing =
    Array(sections.prefix(2)) + [PMTableOfContentsItem(id: "release-notes", label: "Release notes")]
    + Array(sections.dropFirst(2))

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "a page of sections — none marked before the reader goes to one",
        expect: ["label": Self.label, "current": ""]
      ) {
        PMTableOfContents(props: PMTableOfContentsProps(items: Self.sections, label: Self.label))
      },
      PMStateEntry(
        "a section reached through the list — marked", expect: ["current": "configure"]
      ) {
        PMTableOfContents(
          props: PMTableOfContentsProps(items: Self.sections, label: Self.label),
          marked: "configure")
      },
      PMStateEntry(
        "two levels — subsections one step in, under their section", expect: ["current": "pnpm"]
      ) {
        PMTableOfContents(
          props: PMTableOfContentsProps(items: Self.levels, label: Self.label), marked: "pnpm")
      },
      PMStateEntry(
        "a long label — it wraps, so the column does not widen", expect: ["current": "approvals"]
      ) {
        PMTableOfContents(
          props: PMTableOfContentsProps(items: Self.long, label: Self.label), marked: "approvals")
      },
      PMStateEntry("a missing section — still a link", expect: ["current": ""]) {
        PMTableOfContents(props: PMTableOfContentsProps(items: Self.missing, label: Self.label))
      },
    ]
  }
}
