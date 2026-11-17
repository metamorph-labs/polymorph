// ContextMenu (`design/components/context-menu.md`), adapted on iOS: Menu's
// command list opened by a long press on a surface, as a sheet of actions on
// iPhone and a popover at the surface on iPad. The surface is the child,
// drawn as it is, and keeps its own taps: the long press is recognised
// alongside them, with the system's timing. The panel is Menu's, row for row
// (`PMMenuPanel`): the same entries, the same recipe, a submenu flattened, a
// command closing it and a checkbox entry leaving it open.
//
// A context menu is never the only path to a command: the screen pairs it
// with a visible Menu given the same entries, as Relay's ticket rows pair the
// row with its overflow button, so a person who never long-presses, and
// VoiceOver, which reaches the visible Menu, has every command.
//
// There is no `open`: the menu opens from the gesture, and `onOpenChange`
// reports it opening and closing. `presentation: .popover` keeps the popover
// on iPhone too. The harness draws no presentation, so the states fixture
// draws the surface, and the pairing's open Menu beside it.

import PolymorphTokens
import SwiftUI

public struct PMContextMenu: PMContextMenuRendering {
  @State private var open = false
  private let props: PMContextMenuProps

  public init(props: PMContextMenuProps) {
    self.props = props
  }

  public var body: some View {
    props.children
      .simultaneousGesture(LongPressGesture().onEnded { _ in setOpen(true) })
      .modifier(
        PMAnchoredPresentation(
          isPresented: Binding(get: { open }, set: setOpen),
          compact: props.presentation == .popover ? .popover : .sheet, edge: .top
        ) {
          PMMenuPanel(entries: props.entries) { setOpen(false) }
        }
      )
      .accessibilityElement(children: .contain)
      .pmMember("ContextMenu", ["state": open ? "open" : "closed"])
  }

  private func setOpen(_ next: Bool) {
    guard next != open else { return }
    open = next
    props.onOpenChange?(next)
  }
}

/// ContextMenu's states, from the spec's States table: a surface given the
/// whole entry mix, and the pairing, a ticket row whose overflow Menu, given
/// the same entries, is drawn open.
public struct ContextMenuStates: PMStates {
  public let member = "ContextMenu"

  public init() {}

  private static let mix: [PMMenuEntry] = [
    .label(PMMenuLabelEntry(label: "Ticket")),
    .item(PMMenuItemEntry(label: "Assign to me", icon: .user, onSelect: {})),
    .item(PMMenuItemEntry(label: "Snooze", icon: .time, kbd: "S", onSelect: {})),
    .item(PMMenuItemEntry(label: "Merge", disabled: true, onSelect: {})),
    .checkbox(PMMenuCheckboxEntry(label: "Watching", checked: true, onCheckedChange: { _ in })),
    .separator,
    .item(PMMenuItemEntry(label: "Archive", icon: .archive, tone: .danger, onSelect: {})),
  ]

  private static let pairing: [PMMenuEntry] = [
    .item(PMMenuItemEntry(label: "Assign to me", onSelect: {})),
    .item(PMMenuItemEntry(label: "Snooze", onSelect: {})),
    .separator,
    .item(PMMenuItemEntry(label: "Archive", onSelect: {})),
  ]

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("closed — the surface alone", expect: ["state": "closed"]) {
        PMContextMenu(
          props: PMContextMenuProps(
            children: PMContent(ContextMenuSurface(subject: "Refund for a duplicate charge")),
            entries: Self.mix))
      },
      PMStateEntry(
        "the pairing — the row and its open overflow Menu",
        expect: ["state": "closed", "contains": "Menu[part=panel]"]
      ) {
        PMContextMenu(
          props: PMContextMenuProps(
            children: PMContent(
              ContextMenuRow(subject: "Cannot sign in on mobile", entries: Self.pairing)),
            entries: Self.pairing))
      },
    ]
  }
}

/// A Card with a ticket's subject: the surface a long press opens the menu on.
private struct ContextMenuSurface: View {
  @Environment(\.pmTheme) private var theme
  let subject: String

  var body: some View {
    PMCard(props: PMCardProps(children: PMContent(Text(subject).pmTextStyle(theme.text.md))))
  }
}

/// A ticket row with its trailing overflow Menu, its panel drawn open under
/// it, both given one list of entries.
private struct ContextMenuRow: View {
  @Environment(\.pmTheme) private var theme
  let subject: String
  let entries: [PMMenuEntry]

  var body: some View {
    VStack(alignment: .trailing, spacing: theme.defaultDensity.space.s1) {
      row
      PMMenuPanel(entries: entries, framed: true, close: {})
        .fixedSize()
    }
  }

  private var row: some View {
    HStack(alignment: .top, spacing: theme.defaultDensity.space.s3) {
      Text(subject)
        .pmTextStyle(theme.text.md)
        .foregroundStyle(theme.colors.textPrimary.color)
        .frame(maxWidth: .infinity, alignment: .leading)
      PMMenu(
        props: PMMenuProps(
          align: .end, items: entries,
          trigger: PMContent(
            PMButton(
              props: PMButtonProps(
                icon: .overflow, iconOnly: true, label: "Ticket actions",
                appearance: .ghostNeutral)))))
    }
    .padding(theme.defaultDensity.space.s3)
    .overlay(alignment: .bottom) { PMRule(theme.colors.borderSubtle) }
  }
}
