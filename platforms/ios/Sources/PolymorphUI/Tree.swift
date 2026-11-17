// Tree (`design/components/tree.md`): a hierarchy of items of one kind, opened
// level by level, with one item picked. Each branch is a SwiftUI
// `DisclosureGroup` whose expansion is the tree's open set, drawn by the
// tree's own disclosure style: the branch's row, then, while it is open, the
// level under it. `OutlineGroup` holds its own expansion, which the
// controlled `expanded` set cannot reach, so the groups are nested here. A
// level appears and leaves at once, because a level of a hundred rows cannot
// animate in smoothly; only the chevron turns.
//
// A row spans the tree's width at every level, so its fill is one band, and
// only its content is indented: `space.5` for each level above it. It is the
// toggle column, as wide as the small control height, then the text column
// (the label in `text.sm` `text.primary`, the description under it in
// `text.xs` `text.secondary`, `space.2` above and below, both wrapping, so a
// label never widens the tree), `space.3` before the row's end. A branch's
// toggle holds the `next` chevron in `text.muted`, which turns a quarter turn
// while the branch is open and is mirrored while it is closed right to left;
// a leaf's is empty, so the labels of a level align. A row is at least the hit
// target tall.
//
// Opening and selecting are separate acts, as on the web. The chevron is a
// button of its own over the row, its hit region the target wide, and it opens
// or closes the branch. The rest of the row, its indent included, is the
// button that selects the item. VoiceOver reads the chevron as the item's
// label with its state, expanded or collapsed, and the row as the label, with
// the description as its hint and the selected trait on the selected item. A
// press or a pointer washes the row in `bg.subtle`, over the control duration;
// the selected row is the selected surface, and its hover step while pressed,
// and its text keeps its colours. A disabled item is drawn in `text.disabled`,
// takes no press and is never selected, and a disabled branch is drawn closed.
//
// The tree holds the open set unless `expanded` is given, starting from
// `defaultExpanded`, and `onExpandedChange` is called with the next set in
// both cases. It holds the selection unless `value` is given, from
// `defaultValue`, and selecting the selected item again calls nothing. An open
// branch that is `loading` draws one busy row under its items: the Spinner in
// the toggle's place, which announces `messages.loading` once, beside the same
// words hidden from VoiceOver. `hasMore` draws a last row in `accent.text`
// that asks for more, `onLoadMore` with the branch's id or `nil` for the top
// level; while its level loads, that row is the busy row. The tree's two
// strings are `messages`, with the spec's English defaults.
//
// The tree is one container named by `label`, whose buttons VoiceOver finds
// one by one. iOS has no tree role, no busy state and no roving tab stop for a
// view, so the tree's roles, its busy levels and its keyboard model are
// `PLATFORM_GAPS` (`packages/native/src/pending.ts`): with keyboard navigation
// on, each row and each chevron is a stop, and the system's own keys move
// between them.

import PolymorphTokens
import SwiftUI

public struct PMTree: PMTreeRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmTreePick) private var pick
  @State private var ownExpanded: Set<String>
  @State private var ownValue: String?
  private let props: PMTreeProps

  public init(props: PMTreeProps) {
    self.props = props
    _ownExpanded = State(initialValue: props.defaultExpanded ?? [])
    _ownValue = State(initialValue: props.defaultValue)
  }

  public var body: some View {
    let loading = props.loading ?? false
    let shared = PMTreeShared(
      open: open, selected: selected, messages: props.messages ?? PMStrings.treeMessages,
      toggle: toggle, select: select, more: { props.onLoadMore?($0) })

    VStack(alignment: .leading, spacing: 0) {
      PMTreeLevel(
        items: props.items, level: 0, parent: nil, loading: loading,
        hasMore: props.hasMore ?? false, shared: shared)
    }
    .pmTextStyle(theme.text.sm)
    .foregroundStyle(theme.colors.textPrimary.color)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.label))
    .pmMember("Tree", loading ? ["busy": "true"] : [:])
  }

  /// The open branches: the controlled `expanded` when given, otherwise the tree's own.
  private var open: Set<String> {
    props.expanded ?? ownExpanded
  }

  /// The selected item: the controlled `value` when given (`nil` inside it
  /// selects nothing), otherwise the tree's own.
  private var selected: String? {
    props.value ?? ownValue
  }

  /// Opens or closes a branch. The tree's own set follows every change,
  /// whoever holds the set, so it is current if the app stops passing `expanded`.
  private func toggle(_ id: String) {
    let next = Self.toggled(open, id)
    ownExpanded = next
    props.onExpandedChange?(next)
  }

  /// Selects an item. A reader cannot clear the selection, so selecting the
  /// selected item again reports nothing; TreeSelect still hears the press.
  private func select(_ id: String) {
    pick?(id)
    guard id != selected else { return }
    ownValue = id
    props.onChange?(id)
  }

  /// The set with `id` added when it is absent, and taken out when it is there.
  static func toggled(_ open: Set<String>, _ id: String) -> Set<String> {
    var next = open
    if next.contains(id) { next.remove(id) } else { next.insert(id) }
    return next
  }
}

private struct PMTreePickKey: EnvironmentKey {
  static let defaultValue: (@MainActor (String) -> Void)? = nil
}

extension EnvironmentValues {
  /// What a press on a row runs besides selecting it: TreeSelect closes its
  /// popup, the chosen node's row included, which Tree reports nothing for.
  var pmTreePick: (@MainActor (String) -> Void)? {
    get { self[PMTreePickKey.self] }
    set { self[PMTreePickKey.self] = newValue }
  }
}

/// What every level of one tree draws with.
private struct PMTreeShared {
  let open: Set<String>
  let selected: String?
  let messages: PMTreeMessages
  let toggle: @MainActor (String) -> Void
  let select: @MainActor (String) -> Void
  let more: @MainActor (String?) -> Void
}

/// The rows of one level: its items, then one row that says the level is
/// loading or asks for more of it. While a level that has more is loading,
/// the row that asks is the busy row, in the same place.
private struct PMTreeLevel: View {
  let items: [PMTreeItem]
  let level: Int
  let parent: String?
  let loading: Bool
  let hasMore: Bool
  let shared: PMTreeShared

  var body: some View {
    ForEach(items, id: \.id) { item in
      PMTreeNode(item: item, level: level, shared: shared)
    }
    if hasMore && loading {
      PMTreeBusyRow(
        level: level, words: shared.messages.loading,
        attributes: ["part": "more", "busy": "true", "level": String(level)])
    } else if hasMore {
      PMTreeMoreRow(level: level, words: shared.messages.loadMore) { shared.more(parent) }
    } else if loading {
      PMTreeBusyRow(
        level: level, words: shared.messages.loading,
        attributes: ["part": "busy", "level": String(level)])
    }
  }
}

/// One item: a leaf's row, or a branch's disclosure group of its chevron over
/// its row and, while it is open, the level under it.
private struct PMTreeNode: View {
  @Environment(\.pmTheme) private var theme
  let item: PMTreeItem
  let level: Int
  let shared: PMTreeShared

  var body: some View {
    let children = item.children ?? []
    let branch = !children.isEmpty || item.hasChildren == true
    let disabled = item.disabled == true
    // A disabled branch is drawn closed, whatever the open set holds.
    let open = branch && !disabled && shared.open.contains(item.id)
    let row = PMTreeRow(
      item: item, level: level, branch: branch, open: open,
      selected: !disabled && shared.selected == item.id, disabled: disabled, shared: shared)
    if branch {
      DisclosureGroup(
        isExpanded: Binding {
          open
        } set: { next in
          if next != open { shared.toggle(item.id) }
        }
      ) {
        PMTreeLevel(
          items: children, level: level + 1, parent: item.id, loading: item.loading == true,
          hasMore: item.hasMore == true, shared: shared)
      } label: {
        PMTreeChevron(label: item.label, open: open, disabled: disabled) {
          shared.toggle(item.id)
        }
      }
      .disclosureGroupStyle(
        PMTreeBranchStyle(row: row, indent: theme.defaultDensity.space.s5 * CGFloat(level)))
    } else {
      row
    }
  }
}

/// A branch's disclosure: its row, with the group's label, the chevron, over
/// the row's toggle column, then the level under it while it is open, with no
/// transition. The label alone is the disclosure, so the platform gives the
/// chevron the disclosure's role and state, and the row stays the button that
/// selects.
private struct PMTreeBranchStyle: DisclosureGroupStyle {
  let row: PMTreeRow
  let indent: CGFloat

  func makeBody(configuration: Configuration) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      row.overlay(alignment: .leading) {
        configuration.label.padding(.leading, indent)
      }
      if configuration.isExpanded {
        configuration.content
      }
    }
  }
}

/// A branch's chevron: the `next` glyph, a quarter turn while the branch is
/// open, in a toggle column as wide as the small control height and as tall as
/// the row, its hit region the target wide. It is the button that opens and
/// closes the branch, named by the item's label, its value the branch's state.
private struct PMTreeChevron: View {
  @Environment(\.pmTheme) private var theme
  let label: String
  let open: Bool
  let disabled: Bool
  let toggle: @MainActor () -> Void

  var body: some View {
    let width = theme.defaultDensity.controlHeight.sm
    Button(action: toggle) {
      PMTurningChevron(
        role: .next, open: open, turn: .degrees(90),
        color: disabled ? \.textDisabled : \.textMuted
      )
      // Mirrored while it points along the line, so a closed branch points to
      // the end of a right-to-left line; open, it points down in both.
      .flipsForRightToLeftLayoutDirection(true)
      .frame(width: width)
      .frame(maxHeight: .infinity)
      .pmHitRegion(width: width)
    }
    .buttonStyle(PMTreeChevronPress())
    .disabled(disabled)
    .accessibilityLabel(Text(label))
    .accessibilityValue(Text(PMStrings.disclosure(open: open)))
  }
}

/// An item's row: the button that selects it, across the row's width, its
/// indent and toggle column included, and the row's fill.
private struct PMTreeRow: View {
  @Environment(\.pmTheme) private var theme
  @State private var pressed = false
  @State private var hovering = false
  let item: PMTreeItem
  let level: Int
  let branch: Bool
  let open: Bool
  let selected: Bool
  let disabled: Bool
  let shared: PMTreeShared

  var body: some View {
    let density = theme.defaultDensity
    let colors = theme.colors
    let motion = theme.defaultMotion
    let active = !disabled && (pressed || hovering)
    let fill =
      selected
      ? (active ? colors.selectionSurfaceHover : colors.selectionSurface).color
      : (active ? colors.bgSubtle.color : .clear)
    let indent = density.space.s5 * CGFloat(level)
    let toggle = density.controlHeight.sm

    Button {
      shared.select(item.id)
    } label: {
      VStack(alignment: .leading, spacing: 0) {
        Text(item.label)
          .foregroundStyle((disabled ? colors.textDisabled : colors.textPrimary).color)
        if let description = item.description {
          Text(description)
            .pmTextStyle(theme.text.xs)
            .foregroundStyle((disabled ? colors.textDisabled : colors.textSecondary).color)
        }
      }
      .multilineTextAlignment(.leading)
      .fixedSize(horizontal: false, vertical: true)
      .padding(.vertical, density.space.s2)
      .modifier(PMTreeRowBox(indent: indent, toggle: toggle))
    }
    .buttonStyle(PMTreeRowPress(pressed: $pressed))
    .disabled(disabled)
    .accessibilityLabel(Text(item.label))
    .pmAccessibilityHint(item.description)
    .accessibilityAddTraits(selected ? .isSelected : [])
    .pmMember("Tree", attributes)
    // A scroll view around the tree scrolls to a row by its item's id: TreeSelect's panel.
    .id(item.id)
    .background(fill, in: RoundedRectangle(cornerRadius: theme.radius.sm))
    .animation(motion.easing.standard.animation(duration: motion.duration.control), value: active)
    .onHover { hovering = $0 }
  }

  private var attributes: [String: String] {
    var found = ["part": "row", "item": item.id, "level": String(level)]
    if branch { found["expanded"] = String(open) }
    if selected { found["selected"] = "true" }
    if disabled { found["disabled"] = "true" }
    if open && item.loading == true { found["busy"] = "true" }
    return found
  }
}

/// A row's box around its text: the indent and the toggle column before it,
/// `space.3` after it, across the tree's width and at least the hit target
/// tall, all of it the button's.
private struct PMTreeRowBox: ViewModifier {
  @Environment(\.pmTheme) private var theme
  let indent: CGFloat
  let toggle: CGFloat

  func body(content: Content) -> some View {
    let density = theme.defaultDensity
    content
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.leading, indent + toggle)
      .padding(.trailing, density.space.s3)
      .frame(
        maxWidth: .infinity, minHeight: max(density.controlHeight.sm, density.hitTarget),
        alignment: .leading
      )
      .contentShape(.rect)
  }
}

/// A row's press, reported to the row, which washes its whole width.
private struct PMTreeRowPress: ButtonStyle {
  @Binding var pressed: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .onChange(of: configuration.isPressed) { _, now in pressed = now }
  }
}

/// The chevron's button draws only the chevron: its turn is its feedback.
private struct PMTreeChevronPress: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
  }
}

/// The row that asks for more of a level: `messages.loadMore` in
/// `accent.text`, the colour of a link, where a level's labels start.
private struct PMTreeMoreRow: View {
  @Environment(\.pmTheme) private var theme
  @State private var pressed = false
  @State private var hovering = false
  let level: Int
  let words: String
  let ask: @MainActor () -> Void

  var body: some View {
    let density = theme.defaultDensity
    let motion = theme.defaultMotion
    let active = pressed || hovering

    Button(action: ask) {
      Text(words)
        .foregroundStyle(theme.colors.accentText.color)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, density.space.s2)
        .modifier(
          PMTreeRowBox(
            indent: density.space.s5 * CGFloat(level), toggle: density.controlHeight.sm))
    }
    .buttonStyle(PMTreeRowPress(pressed: $pressed))
    .accessibilityLabel(Text(words))
    .pmMember("Tree", ["part": "more", "level": String(level)])
    .background(
      active ? theme.colors.bgSubtle.color : .clear,
      in: RoundedRectangle(cornerRadius: theme.radius.sm)
    )
    .animation(motion.easing.standard.animation(duration: motion.duration.control), value: active)
    .onHover { hovering = $0 }
  }
}

/// The row that says a level is loading: the Spinner `sm` in the toggle's
/// place, in `text.muted`, which says `words` once, and the same words beside
/// it in `text.xs` `text.secondary`, hidden from VoiceOver. It is no action.
private struct PMTreeBusyRow: View {
  @Environment(\.pmTheme) private var theme
  let level: Int
  let words: String
  let attributes: [String: String]

  var body: some View {
    let density = theme.defaultDensity
    HStack(spacing: 0) {
      PMSpinner(props: PMSpinnerProps(label: words, size: .sm))
        .foregroundStyle(theme.colors.textMuted.color)
        .frame(width: density.controlHeight.sm)
      Text(words)
        .pmTextStyle(theme.text.xs)
        .foregroundStyle(theme.colors.textSecondary.color)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, density.space.s2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(true)
    }
    .padding(.leading, density.space.s5 * CGFloat(level))
    .padding(.trailing, density.space.s3)
    .frame(maxWidth: .infinity, minHeight: density.controlHeight.sm, alignment: .leading)
    .accessibilityElement(children: .contain)
    .pmMember("Tree", attributes)
  }
}

/// Tree's states, from the spec's States table: three top-level units, the
/// first a branch open onto three, in each state the table names.
public struct TreeStates: PMStates {
  public let member = "Tree"

  public init() {}

  private static let label = "Organization units"

  /// Three top-level units: a loaded branch, a branch the app has not loaded,
  /// and a leaf with a description.
  private static func units(
    engineeringHasMore: Bool = false, engineeringLoading: Bool = false,
    designLoading: Bool = false, designDisabled: Bool = false
  ) -> [PMTreeItem] {
    [
      PMTreeItem(
        id: "engineering", label: "Engineering",
        children: [
          PMTreeItem(id: "platform", label: "Platform", hasChildren: true),
          PMTreeItem(id: "applications", label: "Applications"),
          PMTreeItem(id: "data", label: "Data"),
        ], loading: engineeringLoading, hasMore: engineeringHasMore),
      PMTreeItem(
        id: "design", label: "Design", hasChildren: true, loading: designLoading,
        disabled: designDisabled),
      PMTreeItem(id: "sales", label: "Sales", description: "Three regions"),
    ]
  }

  private static let deep = [
    PMTreeItem(
      id: "company", label: "Northwind",
      children: [
        PMTreeItem(
          id: "engineering", label: "Engineering",
          children: [
            PMTreeItem(
              id: "platform", label: "Platform",
              children: [
                PMTreeItem(id: "runtime", label: "Runtime"),
                PMTreeItem(id: "storage", label: "Storage"),
              ]),
            PMTreeItem(id: "applications", label: "Applications"),
          ]),
        PMTreeItem(id: "sales", label: "Sales"),
      ])
  ]

  private static let long = [
    PMTreeItem(
      id: "programme",
      label: "Customer support operations for Europe, the Middle East and Africa",
      children: [
        PMTreeItem(
          id: "archive", label: "ticket-export-eu-west-1-production-customer-support-archive",
          description: "Holds the exports of the last twelve months, one unit for each region")
      ])
  ]

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "a small tree — one branch open",
        expect: ["label": Self.label, "contains": "Tree[part=row item=engineering expanded=true]"]
      ) {
        PMTree(props: PMTreeProps(defaultExpanded: ["engineering"], items: Self.units(), label: Self.label))
      },
      PMStateEntry(
        "nothing open", expect: ["contains": "Tree[part=row item=engineering expanded=false]"]
      ) {
        PMTree(props: PMTreeProps(items: Self.units(), label: Self.label))
      },
      PMStateEntry(
        "a selected item", expect: ["contains": "Tree[part=row item=applications selected=true]"]
      ) {
        PMTree(
          props: PMTreeProps(
            defaultExpanded: ["engineering"], defaultValue: "applications", items: Self.units(),
            label: Self.label))
      },
      PMStateEntry(
        "a branch that is loading",
        expect: ["contains": "Tree[part=row item=design busy=true],Tree[part=busy level=1],Spinner"]
      ) {
        PMTree(
          props: PMTreeProps(
            defaultExpanded: ["design"], items: Self.units(designLoading: true), label: Self.label))
      },
      PMStateEntry(
        "a level with more to load",
        expect: ["contains": "Tree[part=more level=1],Tree[part=more level=0]"]
      ) {
        PMTree(
          props: PMTreeProps(
            defaultExpanded: ["engineering"], hasMore: true,
            items: Self.units(engineeringHasMore: true), label: Self.label))
      },
      PMStateEntry(
        "more of a level loading — the row that asks is busy",
        expect: ["contains": "Tree[part=more level=1 busy=true],Spinner"]
      ) {
        PMTree(
          props: PMTreeProps(
            defaultExpanded: ["engineering"],
            items: Self.units(engineeringHasMore: true, engineeringLoading: true),
            label: Self.label))
      },
      PMStateEntry(
        "a disabled item",
        expect: ["contains": "Tree[part=row item=design disabled=true selected= expanded=false]"]
      ) {
        PMTree(
          props: PMTreeProps(
            defaultExpanded: ["engineering", "design"], items: Self.units(designDisabled: true),
            label: Self.label))
      },
      PMStateEntry(
        "a deep tree — four levels", expect: ["contains": "Tree[part=row item=runtime level=3]"]
      ) {
        PMTree(
          props: PMTreeProps(
            defaultExpanded: ["company", "engineering", "platform"], items: Self.deep,
            label: Self.label))
      },
      PMStateEntry("long labels at a narrow width", expect: ["label": Self.label]) {
        PMTree(props: PMTreeProps(defaultExpanded: ["programme"], items: Self.long, label: Self.label))
      },
    ]
  }
}
