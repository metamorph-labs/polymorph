// Tabs (`design/components/tabs.md`): peer views of one subject, one shown at
// a time. One variant, underline: a row of triggers over a full-width
// `border.subtle` rule, and one accent rule, twice the hairline, under the
// active trigger, which slides between triggers on the `default` spring and
// jumps under Reduce Motion. A trigger is its icon (`sm`, muted), its label in
// `text.sm` and its count as a Badge, soft neutral, soft accent while its tab
// is active; the label is `text.secondary` at rest, `text.primary` under the
// pointer and while active, and `text.disabled` on a disabled tab. Vertical is
// the same strip on its side: a column of triggers beside the content, the
// rule down its start edge.
//
// A row wider than the width it is given scrolls sideways in a scroll view of
// that width, with the scroll indicator hidden, so the screen never scrolls
// sideways. The full-width rule stays put and the accent rule moves with its
// trigger. The scroll view brings the active trigger into view when it
// appears and when the value changes: at once the first time, and over the
// surface duration after that, unless the temperament is `none` or Reduce
// Motion is on. A row that fits draws no scroll view. A vertical strip grows
// with its tabs and the page scrolls.
// `ImageRenderer` draws no scroll view's content, so with scroll views off
// (`\.pmPageScrolls`) a wide row shows its start, clipped at the strip's edge.
//
// The panels are the children, one `PMTabs.Content` per tab, the web's
// `Tabs.Content`, built from its generated props (`PMTabsContentProps`: its
// tab's `value` and its content), as a screen spec emits it. A panel appears
// with a fade on the surface class, because tabs are peers and a slide would
// give them an order. By default only the active panel is in the tree; with
// `keepMounted` every panel stays in it, and an inactive one takes no space
// and is hidden from touches and from assistive technology, so a form
// mid-edit keeps its state.
//
// Each trigger is a button with the selected trait while its tab is active,
// inside a strip with the tab bar trait, the web's `tablist`: VoiceOver reads
// each trigger as a tab and its place among them. `value` with `onChange` is
// the controlled pair; without it the strip keeps its own value, from
// `defaultValue` or the first tab.
//
// With a hardware keyboard, while a trigger has focus, the arrow keys along
// the strip select the next or previous enabled tab, wrapping, and focus
// follows the selection, as the web's automatic activation does: Left and
// Right in a row, swapped right to left, and Up and Down in a column. Home and
// End select the first and the last enabled tab. Only one trigger takes focus,
// so the strip is one stop in the keyboard's order, as the web's roving focus
// makes it: the active one, or the first enabled one while the active tab is
// disabled or `value` names no tab. Whether a button takes focus at all is the
// system's keyboard navigation setting (`packages/native/src/pending.ts`,
// `PLATFORM_GAPS`).

import PolymorphTokens
import SwiftUI

public struct PMTabs: PMTabsRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.layoutDirection) private var direction
  @Environment(\.pmPageScrolls) private var scrolls
  @Namespace private var indicator
  @FocusState private var focusedTab: String?
  @State private var draft: String?
  private let props: PMTabsProps

  public init(props: PMTabsProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? props.tabs.first?.value)
  }

  public var body: some View {
    let current = props.value ?? draft
    let vertical = props.orientation == .vertical
    let space = theme.defaultDensity.space

    let layout =
      vertical
      ? AnyLayout(HStackLayout(alignment: .top, spacing: space.s6))
      : AnyLayout(VStackLayout(alignment: .leading, spacing: space.s5))
    layout {
      strip(current: current, vertical: vertical)
      VStack(alignment: .leading, spacing: 0) {
        props.children
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .environment(\.pmTabsPanel, PMTabsPanel(current: current, keepMounted: props.keepMounted ?? false))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .pmMember(
      "Tabs",
      [
        "orientation": (props.orientation ?? .horizontal).rawValue,
        "active": current ?? "",
      ])
  }

  /// The triggers over the rule, with the active one's accent rule on it.
  @ViewBuilder
  private func strip(current: String?, vertical: Bool) -> some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    // The active tab's rule is a thicker piece of the list's: twice the hairline.
    let thickness = PMRule.thickness * 2
    let rover = Self.rover(current: current, tabs: props.tabs)
    let triggers = ForEach(props.tabs, id: \.value) { tab in
      let active = tab.value == current
      Button {
        select(tab.value)
      } label: {
        PMTabsTriggerLabel(tab: tab, active: active)
      }
      .buttonStyle(PMTabsTriggerStyle(active: active, vertical: vertical))
      .disabled(tab.disabled ?? false)
      // One trigger is the strip's one stop; the arrows reach the rest.
      .focusable(tab.value == rover, interactions: .activate)
      .focused($focusedTab, equals: tab.value)
      .overlay(alignment: vertical ? .leading : .bottom) {
        if active {
          Rectangle()
            .fill(colors.accentBg.color)
            .frame(width: vertical ? thickness : nil, height: vertical ? nil : thickness)
            .matchedGeometryEffect(id: "indicator", in: indicator)
            .accessibilityHidden(true)
        }
      }
      .accessibilityAddTraits(active ? .isSelected : [])
    }
    Group {
      if vertical {
        VStack(alignment: .leading, spacing: space.s1) { triggers }
          .fixedSize(horizontal: true, vertical: false)
          .background(alignment: .leading) { PMRule(colors.borderSubtle, axis: .vertical) }
      } else {
        let row = HStack(spacing: space.s5) { triggers }
        // The row itself where the strip has room for it; else the row in a
        // scroll view. The rule is the strip's, so it spans the width either way.
        ViewThatFits(in: .horizontal) {
          row
          scrolling(row, to: current)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .bottom) { PMRule(colors.borderSubtle) }
      }
    }
    .animation(reduceMotion ? nil : theme.defaultMotion.spring.base.animation, value: current)
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(.isTabBar)
    .onKeyPress(keys: [.leftArrow, .rightArrow, .upArrow, .downArrow, .home, .end]) { press in
      guard
        let next = Self.target(
          from: focusedTab ?? rover, key: press.key, tabs: props.tabs, vertical: vertical,
          rightToLeft: direction == .rightToLeft)
      else { return .ignored }
      select(next)
      // Focus moves once the target is the active trigger, which takes focus.
      Task { @MainActor in focusedTab = next }
      return .handled
    }
  }

  /// A row wider than the strip, in a scroll view of the strip's width that
  /// keeps the active trigger in view; with scroll views off, the row's start.
  @ViewBuilder
  private func scrolling(_ row: some View, to current: String?) -> some View {
    if scrolls {
      ScrollViewReader { proxy in
        ScrollView(.horizontal) { row }
          .scrollIndicators(.hidden)
          // Where the strip opens is layout, so the first placement is at once.
          .onAppear { reveal(current, in: proxy, animated: false) }
          .onChange(of: current) { _, next in reveal(next, in: proxy, animated: true) }
      }
    } else {
      PMScrollAtRest { row }.clipped()
    }
  }

  /// Scrolls the row the least distance that brings a tab's trigger wholly
  /// into view: over the surface duration when `animated`, and at once at the
  /// `none` temperament and under Reduce Motion, as Carousel's travel does.
  private func reveal(_ value: String?, in proxy: ScrollViewProxy, animated: Bool) {
    guard let value else { return }
    let motion = theme.defaultMotion
    let duration = motion.duration.surface
    if animated, !reduceMotion, duration > 0 {
      withAnimation(motion.easing.standard.animation(duration: duration)) {
        proxy.scrollTo(value)
      }
    } else {
      proxy.scrollTo(value)
    }
  }

  private func select(_ value: String) {
    guard value != (props.value ?? draft) else { return }
    draft = value
    props.onChange?(value)
  }

  /// The trigger that takes focus: the active tab's when it is enabled, else
  /// the first enabled tab's, so the strip stays reachable while the active
  /// tab is disabled or `current` names no tab.
  static func rover(current: String?, tabs: [PMTabDescriptor]) -> String? {
    tabs.first { $0.value == current && $0.disabled != true }?.value
      ?? tabs.first { $0.disabled != true }?.value
  }

  /// The tab a key moves to from `from`: along the strip's axis, the next or
  /// previous enabled tab, wrapping past either end (Left and Right swapped
  /// right to left, and Up and Down in a vertical strip), or for Home and End
  /// the first or the last enabled tab. `nil` for a key the strip does not
  /// take, or when no tab is enabled.
  static func target(
    from: String?, key: KeyEquivalent, tabs: [PMTabDescriptor], vertical: Bool,
    rightToLeft: Bool
  ) -> String? {
    let enabled = tabs.filter { $0.disabled != true }.map(\.value)
    guard let first = enabled.first, let last = enabled.last else { return nil }
    let step: Int
    switch key {
    case .home: return first
    case .end: return last
    case .upArrow where vertical: step = -1
    case .downArrow where vertical: step = 1
    case .leftArrow where !vertical: step = rightToLeft ? 1 : -1
    case .rightArrow where !vertical: step = rightToLeft ? -1 : 1
    default: return nil
    }
    let values = tabs.map(\.value)
    guard let start = from.flatMap({ values.firstIndex(of: $0) }) else { return first }
    var index = start
    for _ in values.indices {
      index = (index + step + values.count) % values.count
      if tabs[index].disabled != true { return values[index] }
    }
    return nil
  }

  /// One panel, shown while its tab is active: the web's `Tabs.Content`.
  public struct Content: View {
    @Environment(\.pmTheme) private var theme
    @Environment(\.pmTabsPanel) private var panel
    private let value: String
    private let children: PMContent

    public init(props: PMTabsContentProps) {
      value = props.value
      children = props.children
    }

    public var body: some View {
      let active = panel.current == value
      let motion = theme.defaultMotion
      Group {
        if panel.keepMounted {
          PMCollapse(progress: active ? 1 : 0) { children }
            .clipped()
            .accessibilityHidden(!active)
            .allowsHitTesting(active)
        } else if active {
          children.transition(.opacity)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .animation(motion.easing.enter.animation(duration: motion.duration.surface), value: active)
    }
  }
}

/// What the strip tells its panels: which tab is active, and whether an
/// inactive panel stays in the tree.
struct PMTabsPanel {
  var current: String?
  var keepMounted = false
}

private struct PMTabsPanelKey: EnvironmentKey {
  static let defaultValue = PMTabsPanel()
}

extension EnvironmentValues {
  fileprivate var pmTabsPanel: PMTabsPanel {
    get { self[PMTabsPanelKey.self] }
    set { self[PMTabsPanelKey.self] = newValue }
  }
}

/// A trigger's label: the icon, the label and the count Badge.
private struct PMTabsTriggerLabel: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  let tab: PMTabDescriptor
  let active: Bool

  var body: some View {
    HStack(spacing: theme.defaultDensity.space.s2) {
      if let icon = tab.icon {
        PMIconView(icon, size: .sm)
          .foregroundStyle((enabled ? theme.colors.textMuted : theme.colors.textDisabled).color)
      }
      Text(tab.label)
        .lineLimit(1)
        .fixedSize()
      if let count = tab.count {
        PMBadge(
          props: PMBadgeProps(
            children: Int(count).formatted(), tone: active ? .accent : .neutral, variant: .soft))
      }
    }
  }
}

/// A trigger: `text.sm`, `space-3` above and below (`space-2` and `space-4`
/// across in a vertical strip), colour only for hover and the active tab.
private struct PMTabsTriggerStyle: ButtonStyle {
  let active: Bool
  let vertical: Bool

  func makeBody(configuration: Configuration) -> some View {
    PMTabsTrigger(active: active, vertical: vertical, pressed: configuration.isPressed) {
      configuration.label
    }
  }
}

private struct PMTabsTrigger<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @State private var hovering = false
  let active: Bool
  let vertical: Bool
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let motion = theme.defaultMotion
    let color =
      !enabled
      ? colors.textDisabled : active || hovering || pressed ? colors.textPrimary : colors.textSecondary
    label()
      .pmTextStyle(theme.text.sm)
      .foregroundStyle(color.color)
      .padding(.vertical, vertical ? space.s2 : space.s3)
      .padding(.horizontal, vertical ? space.s4 : 0)
      .frame(maxWidth: vertical ? .infinity : nil, alignment: .leading)
      .contentShape(.rect)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control),
        value: [hovering, pressed])
      .onHover { hovering = $0 }
      .pmHitTarget()
  }
}

/// Tabs' states, from the spec's States table.
public struct TabsStates: PMStates {
  public let member = "Tabs"

  public init() {}

  private static let two = [
    PMTabDescriptor(value: "activity", label: "Activity"),
    PMTabDescriptor(value: "details", label: "Details"),
  ]

  private static let three = [
    PMTabDescriptor(value: "open", label: "Open", icon: .inbox, count: 12),
    PMTabDescriptor(value: "waiting", label: "Waiting", icon: .time, count: 3),
    PMTabDescriptor(value: "closed", label: "Closed", icon: .confirm),
  ]

  private static let settings = [
    PMTabDescriptor(value: "profile", label: "Profile"),
    PMTabDescriptor(value: "notifications", label: "Notifications"),
    PMTabDescriptor(value: "billing", label: "Billing"),
  ]

  private static let many = [
    PMTabDescriptor(value: "overview", label: "Overview"),
    PMTabDescriptor(value: "activity", label: "Activity", count: 12),
    PMTabDescriptor(value: "members", label: "Members"),
    PMTabDescriptor(value: "billing", label: "Billing"),
    PMTabDescriptor(value: "integrations", label: "Integrations"),
    PMTabDescriptor(value: "audit", label: "Audit log"),
    PMTabDescriptor(value: "settings", label: "Settings"),
  ]

  private static func panels(_ tabs: [PMTabDescriptor]) -> PMContent {
    PMContent(
      ForEach(tabs, id: \.value) { tab in
        PMTabs.Content(
          props: PMTabsContentProps(
            children: PMContent(TabsPanelCopy(tab: tab.label)), value: tab.value))
      })
  }

  public var entries: [PMStateEntry] {
    let disabled = [
      Self.two[0], Self.two[1],
      PMTabDescriptor(value: "audit", label: "Audit log", disabled: true),
    ]
    return [
      PMStateEntry("two tabs, default", expect: ["orientation": "horizontal", "active": "activity"]) {
        PMTabs(props: PMTabsProps(children: Self.panels(Self.two), tabs: Self.two))
      },
      PMStateEntry("three tabs, icon and count", expect: ["active": "open"]) {
        PMTabs(props: PMTabsProps(children: Self.panels(Self.three), tabs: Self.three))
      },
      PMStateEntry("second active", expect: ["active": "waiting"]) {
        PMTabs(
          props: PMTabsProps(
            children: Self.panels(Self.three), defaultValue: "waiting", tabs: Self.three))
      },
      PMStateEntry("disabled tab", expect: ["active": "activity"]) {
        PMTabs(props: PMTabsProps(children: Self.panels(disabled), tabs: disabled))
      },
      PMStateEntry("keepMounted — the inactive panels kept, hidden", expect: ["active": "details"])
      {
        PMTabs(
          props: PMTabsProps(
            children: Self.panels(Self.two), defaultValue: "details", keepMounted: true,
            tabs: Self.two))
      },
      PMStateEntry("vertical", expect: ["orientation": "vertical", "active": "profile"]) {
        PMTabs(
          props: PMTabsProps(
            children: Self.panels(Self.settings), orientation: .vertical, tabs: Self.settings))
      },
      PMStateEntry(
        "vertical, second active", expect: ["orientation": "vertical", "active": "notifications"]
      ) {
        PMTabs(
          props: PMTabsProps(
            children: Self.panels(Self.settings), defaultValue: "notifications",
            orientation: .vertical, tabs: Self.settings))
      },
      // The row is wider than the canvas, and the active tab is past its end edge.
      PMStateEntry(
        "wider than its container — the strip scrolls and opens on the current tab",
        expect: ["orientation": "horizontal", "active": "integrations"]
      ) {
        PMTabs(
          props: PMTabsProps(
            children: Self.panels(Self.many), defaultValue: "integrations", tabs: Self.many))
      },
    ]
  }
}

/// A panel's body for the fixture: a line naming its tab.
private struct TabsPanelCopy: View {
  @Environment(\.pmTheme) private var theme
  let tab: String

  var body: some View {
    Text(tab)
      .pmTextStyle(theme.text.md)
      .foregroundStyle(theme.colors.textPrimary.color)
  }
}
