// The overlay parts several overlays share: the trigger, which opens the
// overlay through the environment (Dialog, ConfirmDialog, Menu, Popover), the
// overlay surface drawn in place, the anchored panel's surface (Menu,
// Popover), Menu's rows (Menu, SplitButton), and the presentation that is a
// popover on iPad and a sheet on iPhone, sized to its content.

import PolymorphTokens
import SwiftUI

/// An overlay's trigger, with the overlay's opening action in the
/// environment for the Button inside it; with no trigger, an empty view to
/// present from.
struct PMOverlayTrigger: View {
  let trigger: PMContent?
  let open: @MainActor () -> Void

  var body: some View {
    if let trigger {
      trigger
        .environment(\.pmTriggerAction, open)
        .accessibilityElement(children: .contain)
    } else {
      Color.clear.frame(width: 0, height: 0)
    }
  }
}

/// The overlay surface drawn in place: `bg.overlay`, a `border.subtle`
/// hairline, `radius.surface` and the transient shadow.
struct PMSurfaceFrame: ViewModifier {
  @Environment(\.pmTheme) private var theme
  let visible: Bool

  func body(content: Content) -> some View {
    if visible {
      let shape = RoundedRectangle(cornerRadius: theme.radius.surface)
      content
        .background { shape.fill(theme.colors.bgOverlay.color).pmShadow(theme.shadows.transient) }
        .overlay { shape.strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
    } else {
      content
    }
  }
}

/// The anchored panel's surface (`select.md`'s content panel, which Menu and
/// Popover cite): `bg.overlay`, a `border.subtle` hairline, `radius.lg` and the
/// overlay shadow. Drawn in place, as a popover's content and in a fixture; a
/// sheet draws its own surface.
struct PMPanelFrame: ViewModifier {
  @Environment(\.pmTheme) private var theme
  let visible: Bool

  func body(content: Content) -> some View {
    if visible {
      let shape = RoundedRectangle(cornerRadius: theme.radius.lg)
      content
        .background { shape.fill(theme.colors.bgOverlay.color).pmShadow(theme.shadows.overlay) }
        .overlay { shape.strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
    } else {
      content
    }
  }
}

/// How an anchored overlay presents on a compact width (an iPhone): as a sheet
/// from the bottom, or kept as a popover.
enum PMCompactForm {
  case sheet
  case popover
}

/// Presents `panel` while `isPresented`: a popover anchored to the view on a
/// regular width (an iPad), at `anchor` and pointing from `edge`, and on a
/// compact width a sheet, or the popover kept (`compact`). The sheet is the
/// platform's, on `bg.overlay` with the surface radius, as tall as the panel's
/// content up to the sheet recipe's share of the room (`PMContentSheetDetent`);
/// the popover's arrow and the room it finds are the system's. Either way the
/// panel scrolls past what it is given: the presentation scrolls the whole
/// panel (`scrolls`), or a panel that keeps a part of itself in place, an
/// option list's search field, scrolls the rest itself (`PMPanelScroll`).
///
/// The height the panel asks for is the height it is laid out at plus what
/// its scrolling parts hold past their viewports (`PMPanelOverflowKey`), so
/// the panel is never drawn twice to be measured and a lazy list in it builds
/// only the rows on screen.
struct PMAnchoredPresentation<Panel: View>: ViewModifier {
  @Environment(\.pmTheme) private var theme
  @State private var laidOut: CGFloat = 0
  @State private var overflow: CGFloat = 0
  @Binding var isPresented: Bool
  let compact: PMCompactForm
  var anchor: PopoverAttachmentAnchor = .rect(.bounds)
  let edge: Edge
  /// Whether the presentation scrolls the whole panel; `false` for a panel
  /// that scrolls a part of itself.
  var scrolls = true
  @ViewBuilder let panel: () -> Panel

  func body(content: Content) -> some View {
    let wanted = max(0, laidOut + overflow)
    content
      .popover(isPresented: $isPresented, attachmentAnchor: anchor, arrowEdge: edge) {
        Group {
          if scrolls {
            PMPanelScroll { panel() }
          } else {
            panel()
          }
        }
        // A popover takes its content's ideal height; a sheet's detent sets it.
        .frame(idealHeight: wanted > 0 ? wanted : nil)
        .onGeometryChange(for: CGFloat.self) {
          $0.size.height
        } action: {
          laidOut = $0
        }
        .onPreferenceChange(PMPanelOverflowKey.self) { overflow = $0 }
        .presentationCompactAdaptation(compact == .popover ? .popover : .sheet)
        .presentationDetents([.custom(PMContentSheetDetent.self)])
        .presentationDragIndicator(.visible)
        .presentationBackground(theme.colors.bgOverlay.color)
        .presentationCornerRadius(theme.radius.surface)
      }
      .environment(\.pmSheetContentHeight, wanted)
  }
}

/// How far a panel's scrolling parts hold their content past their viewports:
/// each part's content height less its own, summed. It is negative while a
/// viewport is taller than what it holds, so the laid-out height plus it is
/// the height the panel's content asks for, at any height it is laid out at.
struct PMPanelOverflowKey: PreferenceKey {
  static let defaultValue: CGFloat = 0

  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value += nextValue()
  }
}

/// A presented panel's part that scrolls: its content in a vertical scroll
/// view that bounces only when the content overflows it, reporting how far
/// the content reaches past it (`PMPanelOverflowKey`). A list of many rows
/// puts them in a `LazyVStack` inside, so a row is built, and its `onAppear`
/// runs, only as it scrolls into view. The harness draws no scroll view's
/// content, so the states fixtures draw a panel in place without one.
struct PMPanelScroll<Content: View>: View {
  @State private var contentHeight: CGFloat = 0
  @State private var viewportHeight: CGFloat = 0
  @ViewBuilder let content: () -> Content

  var body: some View {
    ScrollView {
      content()
        .onGeometryChange(for: CGFloat.self) {
          $0.size.height
        } action: {
          contentHeight = $0
        }
    }
    .scrollBounceBehavior(.basedOnSize)
    .onGeometryChange(for: CGFloat.self) {
      $0.size.height
    } action: {
      viewportHeight = $0
    }
    .preference(key: PMPanelOverflowKey.self, value: contentHeight - viewportHeight)
  }
}

/// A content-high sheet's detent: the height of the content it presents,
/// which the presenter measures and puts in the environment
/// (`pmSheetContentHeight`), and no more than its share of the room a sheet
/// has (`pmSheetShare`: the sheet recipe's `PMRecipe.sheetHeight`, the web's
/// `66vh`, unless the presenter names another, as a bottom Drawer's size
/// does). Before the content is measured it is the cap.
struct PMContentSheetDetent: CustomPresentationDetent {
  static func height(in context: Context) -> CGFloat? {
    let cap = context.maxDetentValue * context.pmSheetShare
    let content = context.pmSheetContentHeight
    return content > 0 ? min(content, cap) : cap
  }
}

private struct PMSheetContentHeightKey: EnvironmentKey {
  static let defaultValue: CGFloat = 0
}

private struct PMSheetShareKey: EnvironmentKey {
  static let defaultValue: CGFloat = PMRecipe.sheetHeight
}

extension EnvironmentValues {
  /// The height of the content a content-high sheet presents, which its
  /// detent reads (`PMContentSheetDetent`); 0 until it is measured.
  var pmSheetContentHeight: CGFloat {
    get { self[PMSheetContentHeightKey.self] }
    set { self[PMSheetContentHeightKey.self] = newValue }
  }

  /// The most of the room a sheet has that a content-high sheet takes, as a
  /// fraction: the sheet recipe's unless the presenter names another.
  var pmSheetShare: CGFloat {
    get { self[PMSheetShareKey.self] }
    set { self[PMSheetShareKey.self] = newValue }
  }
}

/// A sheet `width` wide where the platform lets a sheet take a width: from
/// iOS 18 and macOS 15, on a regular width, fitted to the content across. On a
/// compact width a sheet spans the screen whatever it asks.
struct PMSheetWidth: ViewModifier {
  let width: CGFloat

  func body(content: Content) -> some View {
    if #available(iOS 18, macOS 15, *) {
      content
        .frame(idealWidth: width)
        .presentationSizing(.form.fitted(horizontal: true, vertical: false))
    } else {
      content
    }
  }
}

/// One row of Menu's grammar, with a submenu flattened into a label and its
/// items: a submenu is a named group of commands, which a list can already
/// say, and a cascade from a sheet or a touch popover is not offered
/// (`menu.md`, "Submenu arms flatten in the sheet"). A disabled submenu is its
/// label alone.
enum PMMenuRow {
  case item(PMMenuItemEntry)
  case checkbox(PMMenuCheckboxEntry)
  case separator
  case label(String)

  static func rows(_ entries: [PMMenuEntry]) -> [PMMenuRow] {
    entries.flatMap { entry -> [PMMenuRow] in
      switch entry {
      case .item(let item): [.item(item)]
      case .checkbox(let checkbox): [.checkbox(checkbox)]
      case .separator: [.separator]
      case .label(let label): [.label(label.label)]
      case .submenu(let submenu):
        [.label(submenu.label)] + (submenu.disabled == true ? [] : submenu.items.map(row))
      }
    }
  }

  private static func row(_ leaf: PMMenuLeafEntry) -> PMMenuRow {
    switch leaf {
    case .item(let item): .item(item)
    case .checkbox(let checkbox): .checkbox(checkbox)
    case .separator: .separator
    case .label(let label): .label(label.label)
    }
  }
}

/// Menu's panel (`menu.md`): its rows a `space-2` inside the surface and at
/// least `PMRecipe.menuMinWidth` `space-10` steps wide. A command runs its
/// `onSelect` and closes the menu; a checkbox entry toggles and leaves it
/// open, because a filter list is ticked several entries at a time. The rows
/// arrive with the `menu.items` cascade: each fades in on the enter easing
/// over the control duration, a stagger step after the one above it, up to
/// the stagger's cap; Reduce Motion and the `none` temperament show them at
/// once. Its root is Menu's panel (`part=panel`) wherever it is drawn: Menu,
/// ContextMenu and SplitButton show Menu's rows. A command row is Menu's
/// `part=item`, with `tone=danger` for a danger command, and a checkbox row
/// `part=checkbox` with its `checked`.
struct PMMenuPanel: View {
  @Environment(\.pmTheme) private var theme
  let entries: [PMMenuEntry]
  /// Draws the anchored panel's surface, as a popover's content and a fixture do.
  var framed = false
  let close: @MainActor () -> Void

  var body: some View {
    let space = theme.defaultDensity.space
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(PMMenuRow.rows(entries).enumerated()), id: \.offset) { index, row in
        PMMenuRowView(row: row, index: index, close: close)
      }
    }
    .padding(space.s2)
    .frame(minWidth: space.s10 * PMRecipe.menuMinWidth, alignment: .leading)
    .modifier(PMPanelFrame(visible: framed))
    .accessibilityElement(children: .contain)
    .pmMember("Menu", ["part": "panel"])
  }
}

private struct PMMenuRowView: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var shown = false
  let row: PMMenuRow
  let index: Int
  let close: @MainActor () -> Void

  var body: some View {
    let space = theme.defaultDensity.space
    let motion = theme.defaultMotion
    let delay = min(Double(min(index, 12)) * motion.stagger.step, motion.stagger.max)
    content(space)
      .opacity(shown || reduceMotion ? 1 : 0)
      .onAppear {
        withAnimation(motion.easing.enter.animation(duration: motion.duration.control).delay(delay)) {
          shown = true
        }
      }
  }

  @ViewBuilder
  private func content(_ space: PMSpace) -> some View {
    switch row {
    case .item(let item):
      Button {
        item.onSelect()
        close()
      } label: {
        PMMenuRowLabel(label: item.label, icon: item.icon, kbd: item.kbd, check: nil)
      }
      .buttonStyle(PMOptionRowStyle(danger: item.tone == .danger))
      .disabled(item.disabled ?? false)
      .accessibilityLabel(Text(item.label))
      .pmMember(
        "Menu", item.tone == .danger ? ["part": "item", "tone": "danger"] : ["part": "item"])
    case .checkbox(let checkbox):
      Button {
        checkbox.onCheckedChange(!checkbox.checked)
      } label: {
        PMMenuRowLabel(label: checkbox.label, icon: nil, kbd: nil, check: checkbox.checked)
      }
      .buttonStyle(PMOptionRowStyle())
      .disabled(checkbox.disabled ?? false)
      .accessibilityLabel(Text(checkbox.label))
      .accessibilityAddTraits(checkbox.checked ? [.isToggle, .isSelected] : .isToggle)
      .pmMember("Menu", ["part": "checkbox", "checked": checkbox.checked ? "true" : "false"])
    case .separator:
      PMRule(theme.colors.borderSubtle)
        .padding(.vertical, space.s2)
    case .label(let label):
      Text(label)
        .textCase(.uppercase)
        .pmTextStyle(theme.text.xs)
        .foregroundStyle(theme.colors.textMuted.color)
        .padding(.vertical, space.s2)
        .padding(.horizontal, space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(.isHeader)
    }
  }
}

/// A row's anatomy: the check column (a checkbox entry's), the icon, the
/// label, and the shortcut hint at the trailing end. The row's recipe is the
/// option row's (`PMOptionRowStyle`), a danger command's in `danger.text` on
/// the `danger.subtle` wash. The icon is `text.muted` at rest and takes the
/// row's text colour while the row is highlighted, danger or disabled
/// (`pmRowInherits`).
private struct PMMenuRowLabel: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmRowInherits) private var inherits
  let label: String
  let icon: PMIconRole?
  let kbd: String?
  /// A checkbox entry's state; `nil` for a command, which has no check column.
  let check: Bool?

  var body: some View {
    let space = theme.defaultDensity.space
    // The check column is Select's: the glyph's width and a `space-2` gap.
    HStack(spacing: check == nil ? space.s3 : space.s2) {
      if let check {
        PMIconView(.confirm, size: .sm)
          .foregroundStyle(theme.colors.accentText.color)
          .opacity(check ? 1 : 0)
      } else if let icon {
        PMIconView(icon, size: .sm)
          .modifier(PMMenuIconColor(muted: !inherits))
      }
      Text(label)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
      if let kbd {
        PMKbd(props: PMKbdProps(children: kbd))
          .accessibilityHidden(true)
      }
    }
  }
}

private struct PMMenuIconColor: ViewModifier {
  @Environment(\.pmTheme) private var theme
  let muted: Bool

  func body(content: Content) -> some View {
    if muted {
      content.foregroundStyle(theme.colors.textMuted.color)
    } else {
      content
    }
  }
}

/// Whether the screen is compact in width, an iPhone's: the platform's
/// horizontal size class. A Mac is never compact. An overlay reads it to
/// choose between its phone and its iPad form.
@propertyWrapper
struct PMCompactWidth: DynamicProperty {
  #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
  #endif

  init() {}

  var wrappedValue: Bool {
    #if os(iOS)
      sizeClass == .compact
    #else
      false
    #endif
  }
}
