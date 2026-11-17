// Popover (`design/components/popover.md`), adapted on iOS: a panel of rich
// content opened from a trigger, as a sheet on iPhone and anchored to the
// trigger on iPad. The trigger stays where the screen puts it and opens the
// panel through the environment (`pmTriggerAction`), as Dialog's does. The
// panel is the children `space-5` inside the overlay surface, at most
// `PMRecipe.popoverWidth` `space-10` steps wide when anchored; the sheet
// takes the width of the screen and is as tall as its content up to the
// sheet's cap, and the content scrolls past what either form has room for.
//
// `side` is the side of the trigger the panel opens on, so the popover's
// arrow points from the opposite edge, and `align` places its anchor at the
// start, the centre or the end of that side. iPhone's popover is a sheet in
// both presentations, the platform map's form, so `presentation: .sheet`
// changes nothing there; on iPad both are anchored. `label` names the panel
// for assistive technology. `open` with `onOpenChange` is the controlled pair;
// `defaultOpen` opens it on its own. The harness draws no presentation, so
// the states fixture draws the open panel in place beside its trigger.

import PolymorphTokens
import SwiftUI

public struct PMPopover: PMPopoverRendering {
  @State private var presented: Bool
  private let props: PMPopoverProps

  public init(props: PMPopoverProps) {
    self.props = props
    _presented = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let open = props.open ?? presented
    let side = props.side ?? .bottom
    let align = props.align ?? .start

    PMOverlayTrigger(trigger: props.trigger) { setOpen(true) }
      .modifier(
        PMAnchoredPresentation(
          isPresented: Binding(get: { open }, set: setOpen), compact: .sheet,
          anchor: .point(PopoverStates.anchor(side, align)), edge: PopoverStates.edge(side)
        ) {
          PMPopoverPanel(label: props.label, children: props.children)
        }
      )
      .pmMember("Popover", PopoverStates.attributes(open: open, side: side, align: align))
  }

  private func setOpen(_ open: Bool) {
    presented = open
    props.onOpenChange?(open)
  }
}

/// The panel: the children `space-5` inside, named by `label`. Anchored, it
/// is at most `PMRecipe.popoverWidth` `space-10` steps wide; in a sheet, as
/// wide as the sheet.
struct PMPopoverPanel: View {
  @Environment(\.pmTheme) private var theme
  @PMCompactWidth private var compact
  let label: String
  let children: PMContent
  var framed = false

  var body: some View {
    let space = theme.defaultDensity.space
    let widest = space.s10 * PMRecipe.popoverWidth
    children
      .padding(space.s5)
      .frame(maxWidth: compact && !framed ? .infinity : widest, alignment: .leading)
      .fixedSize(horizontal: framed, vertical: false)
      .modifier(PMPanelFrame(visible: framed))
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text(label))
  }
}

/// Popover's states, from the spec's States table: the closed trigger, and
/// the open panel drawn in place on each side of its trigger.
public struct PopoverStates: PMStates {
  public let member = "Popover"

  public init() {}

  /// The edge the popover's arrow points from: the side opposite the panel's.
  static func edge(_ side: PMPopoverSide) -> Edge {
    switch side {
    case .bottom: .top
    case .top: .bottom
    case .right: .leading
    case .left: .trailing
    }
  }

  /// Where on the trigger the popover is anchored: the middle of `side`,
  /// moved to its start or end by `align`.
  static func anchor(_ side: PMPopoverSide, _ align: PMPopoverAlign) -> UnitPoint {
    switch (side, align) {
    case (.bottom, .start): .bottomLeading
    case (.bottom, .center): .bottom
    case (.bottom, .end): .bottomTrailing
    case (.top, .start): .topLeading
    case (.top, .center): .top
    case (.top, .end): .topTrailing
    case (.right, .start): .topTrailing
    case (.right, .center): .trailing
    case (.right, .end): .bottomTrailing
    case (.left, .start): .topLeading
    case (.left, .center): .leading
    case (.left, .end): .bottomLeading
    }
  }

  static func attributes(open: Bool, side: PMPopoverSide, align: PMPopoverAlign) -> [String: String]
  {
    ["state": open ? "open" : "closed", "side": side.rawValue, "align": align.rawValue]
  }

  private static let trigger = PMContent(
    PMButton(
      props: PMButtonProps(
        icon: .filter, label: "Filters", appearance: .outlineNeutral)))

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("closed", expect: ["state": "closed", "side": "bottom"]) {
        PMPopover(
          props: PMPopoverProps(
            children: PMContent(PopoverForm()), label: "Filters", trigger: Self.trigger))
      },
      PMStateEntry(
        "open — a field and a button", expect: ["state": "open", "side": "bottom", "label": "Filters"]
      ) {
        PopoverOpen(side: .bottom, trigger: Self.trigger)
      },
      PMStateEntry("side top", expect: ["state": "open", "side": "top"]) {
        PopoverOpen(side: .top, trigger: Self.trigger)
      },
      PMStateEntry("side right", expect: ["state": "open", "side": "right"]) {
        PopoverOpen(side: .right, trigger: Self.trigger)
      },
    ]
  }
}

/// The open popover as the fixture draws it: the panel on the trigger's
/// `side`, a `space-1` from it.
private struct PopoverOpen: View {
  @Environment(\.pmTheme) private var theme
  let side: PMPopoverSide
  let trigger: PMContent
  var label = "Filters"

  var body: some View {
    let gap = theme.defaultDensity.space.s1
    let panel = PMPopoverPanel(label: label, children: PMContent(PopoverForm()), framed: true)
    Group {
      switch side {
      case .bottom: VStack(alignment: .leading, spacing: gap) { trigger; panel }
      case .top: VStack(alignment: .leading, spacing: gap) { panel; trigger }
      case .right: HStack(alignment: .top, spacing: gap) { trigger; panel }
      case .left: HStack(alignment: .top, spacing: gap) { panel; trigger }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(label))
    .pmMember("Popover", PopoverStates.attributes(open: true, side: side, align: .start))
  }
}

/// A small form: a field and its action.
private struct PopoverForm: View {
  var body: some View {
    PMStack(
      props: PMStackProps(
        children: PMContent(
          Group {
            PMFormField(
              props: PMFormFieldProps(
                children: PMContent(PMInput(props: PMInputProps(placeholder: "Any requester"))),
                label: "Requester"))
            PMButton(props: PMButtonProps(label: "Apply"))
          }), gap: .s4))
  }
}
