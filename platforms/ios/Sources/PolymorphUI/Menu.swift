// Menu (`design/components/menu.md`), adapted on iOS: a list of commands
// behind a trigger, as a sheet of actions on iPhone and a pull-down popover on
// iPad. The trigger stays where the screen puts it, usually Button's icon-only
// `overflow`; the menu puts its opening action in the environment
// (`pmTriggerAction`), and the Button runs it after its own action, as the web
// clones the trigger. The panel is Menu's rows (`PMMenuPanel`), drawn from the
// recipe on the overlay surface, in both forms: a command with its icon, its
// label and its shortcut hint (a Kbd), a danger command kept quiet in
// `danger.text`, a disabled one dimmed, a checkbox entry with Select's check
// column, a separator, a group label, and a submenu flattened into its label
// and its items, because neither a sheet nor a touch popover cascades. A
// command closes the menu; a checkbox entry leaves it open. The sheet is as
// tall as the rows up to two thirds of the window, and the rows scroll past
// what either form has room for.
//
// `presentation: .auto` is the sheet on iPhone; `.popover` keeps the anchored
// popover there too. `align` places the popover's anchor at the trigger's
// leading or trailing bottom corner on iPad. `open` with `onOpenChange` is the
// controlled pair; `defaultOpen` opens it on its own. The harness draws no
// presentation, so the states fixture draws the open panel in place.

import PolymorphTokens
import SwiftUI

public struct PMMenu: PMMenuRendering {
  @State private var presented: Bool
  private let props: PMMenuProps

  public init(props: PMMenuProps) {
    self.props = props
    _presented = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let open = props.open ?? presented
    let align = props.align ?? .start

    PMOverlayTrigger(trigger: props.trigger) { setOpen(true) }
      .modifier(
        PMAnchoredPresentation(
          isPresented: Binding(get: { open }, set: setOpen),
          compact: props.presentation == .popover ? .popover : .sheet,
          anchor: .point(align == .end ? .bottomTrailing : .bottomLeading), edge: .top
        ) {
          PMMenuPanel(entries: props.items) { setOpen(false) }
        }
      )
      .pmMember("Menu", MenuStates.attributes(open: open, align: align))
  }

  private func setOpen(_ open: Bool) {
    presented = open
    props.onOpenChange?(open)
  }
}

/// Menu's states, from the spec's States table: the closed trigger, and the
/// open panel drawn in place under it, because the harness renders no
/// presentation.
public struct MenuStates: PMStates {
  public let member = "Menu"

  public init() {}

  static func attributes(open: Bool, align: PMMenuAlign) -> [String: String] {
    ["state": open ? "open" : "closed", "align": align.rawValue]
  }

  private static let trigger = PMContent(
    PMButton(
      props: PMButtonProps(
        icon: .overflow, iconOnly: true, label: "Ticket actions", appearance: .ghostNeutral)))

  private static let commands: [PMMenuEntry] = [
    .label(PMMenuLabelEntry(label: "Ticket")),
    .item(PMMenuItemEntry(label: "Assign to me", icon: .user, onSelect: {})),
    .item(PMMenuItemEntry(label: "Snooze", icon: .time, kbd: "S", onSelect: {})),
    .item(PMMenuItemEntry(label: "Merge", icon: .connect, disabled: true, onSelect: {})),
    .separator,
    .item(PMMenuItemEntry(label: "Archive", icon: .archive, tone: .danger, onSelect: {})),
  ]

  private static let filters: [PMMenuEntry] = [
    .label(PMMenuLabelEntry(label: "Show")),
    .checkbox(PMMenuCheckboxEntry(label: "Open", checked: true, onCheckedChange: { _ in })),
    .checkbox(PMMenuCheckboxEntry(label: "Waiting", checked: false, onCheckedChange: { _ in })),
    .checkbox(PMMenuCheckboxEntry(label: "Closed", checked: true, onCheckedChange: { _ in })),
  ]

  private static let nested: [PMMenuEntry] = [
    .item(PMMenuItemEntry(label: "Reply", icon: .comment, onSelect: {})),
    .submenu(
      PMMenuSubmenuEntry(
        label: "Move to",
        items: [
          .item(PMMenuItemEntry(label: "Billing", onSelect: {})),
          .item(PMMenuItemEntry(label: "Onboarding", onSelect: {})),
        ])),
    .submenu(
      PMMenuSubmenuEntry(
        label: "Escalate", disabled: true,
        items: [.item(PMMenuItemEntry(label: "Tier two", onSelect: {}))])),
  ]

  private static func open(_ entries: [PMMenuEntry], align: PMMenuAlign = .start) -> some View {
    PMMenuOpen(trigger: trigger, entries: entries, align: align)
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("closed", expect: ["state": "closed", "align": "start"]) {
        PMMenu(props: PMMenuProps(items: Self.commands, trigger: Self.trigger))
      },
      PMStateEntry(
        "open — icons, a hint, danger, disabled, separator and label",
        expect: ["state": "open", "align": "start", "contains": "Menu[part=panel]"]
      ) {
        Self.open(Self.commands)
      },
      PMStateEntry("align end", expect: ["state": "open", "align": "end"]) {
        Self.open(Self.commands, align: .end)
      },
      PMStateEntry(
        "checkbox entries, checked and unchecked",
        expect: [
          "state": "open",
          "contains": "Menu[part=checkbox checked=true],Menu[part=checkbox checked=false]",
        ]
      ) {
        Self.open(Self.filters)
      },
      PMStateEntry("a submenu, flattened; a disabled one, its label", expect: ["state": "open"]) {
        Self.open(Self.nested)
      },
    ]
  }
}

/// The open menu as the fixture draws it: the trigger, and the panel on its
/// surface under it, at the trigger's leading or trailing edge.
private struct PMMenuOpen: View {
  @Environment(\.pmTheme) private var theme
  let trigger: PMContent
  let entries: [PMMenuEntry]
  let align: PMMenuAlign

  var body: some View {
    let edge: HorizontalAlignment = align == .end ? .trailing : .leading
    VStack(alignment: edge, spacing: theme.defaultDensity.space.s1) {
      trigger
      PMMenuPanel(entries: entries, framed: true, close: {})
        .fixedSize()
    }
    .frame(maxWidth: .infinity, alignment: Alignment(horizontal: edge, vertical: .top))
    .accessibilityElement(children: .contain)
    .pmMember("Menu", MenuStates.attributes(open: true, align: align))
  }
}
