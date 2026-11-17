// What several members' states fixtures share: sample records for the page
// archetypes, the sizes the fixtures draw at, and a frame that draws a layout
// meant for a wider screen (an iPad's table) at the harness's canvas width on
// macOS and at its own width on iOS.

import PolymorphTokens
import SwiftUI

/// Sample content the page archetypes' fixtures share.
enum PMPageSamples {
  struct Ticket {
    let id: String
    let subject: String
    let status: String
  }

  static let tickets = [
    Ticket(id: "t1", subject: "Refund for a duplicate charge", status: "Open"),
    Ticket(id: "t2", subject: "Cannot sign in on mobile", status: "Waiting"),
    Ticket(id: "t3", subject: "Invoice address is wrong", status: "Closed"),
  ]

  static let failure = "The tickets could not be loaded. Check your connection."

  static func table() -> PMContent {
    AnyView(
      PMDataTable(
        props: PMDataTableProps(
          columns: [
            PMDataTableColumn(key: "subject", header: "Subject", value: { $0.subject }),
            PMDataTableColumn(key: "status", header: "Status", value: { $0.status }),
          ],
          data: tickets, emptyState: PMEmptyStateProps(title: "No tickets yet"),
          getRowId: { $0.id }, label: "Tickets"))
      .environment(\.pmDataTableLayout, .list))
  }
}

/// The windows a fixture lays a wide form out in before it scales it to the
/// harness's canvas: sizes of the devices the form is for, which are neither
/// the theme's nor a recipe's.
enum PMFixtureWindow {
  /// The harness's canvas width, in points (`Tests/PolymorphUITests/Harness.swift`).
  static let canvas: CGFloat = 360
  /// A narrow iPad window, beside another app's: the first width a table and
  /// a split are drawn at.
  static let narrowIPad: CGFloat = 600
  /// An iPad window wide enough for a page's two regions side by side.
  static let twoRegionIPad: CGFloat = 840
  /// A landscape iPad.
  static let landscapeIPad: CGFloat = 1024
  /// A landscape 11-inch iPad Pro.
  static let landscapeIPadPro: CGFloat = 1194
}

/// The boxes a fixture gives a member that fills the region it is put in, or
/// a panel cut short to show what it does past its room, in multiples of
/// `space.10` as the web fixtures' harnesses write them, so they scale with
/// density.
enum PMFixtureSpan {
  /// The region a filling member fills: ArtifactPane, ChatThread, SplitPane.
  static let region: CGFloat = 4
  /// The region a page that fills it is given: MasterDetailPage's.
  static let page: CGFloat = 6
  /// A sample box: a ScrollArea's side, a SplitPane's pane.
  static let sample: CGFloat = 2
  /// LogView's box, and the side of its narrow one.
  static let log: CGFloat = 3
  /// A Dialog panel shorter than its body.
  static let cappedDialog: CGFloat = 4
  /// A Drawer panel shorter than its body.
  static let cappedDrawer: CGFloat = 5
  /// ImageEditor's test card, four by three.
  static let card: CGFloat = 10
  /// Lightbox's panel drawn in place: a phone's screen, below its bars.
  static let lightbox: CGFloat = 7
  /// A side Drawer's share of its own width on the canvas, which is narrower
  /// than the iPad the panel is for.
  static let sideDrawerShare: CGFloat = 0.75
}

/// A fixture frame: the content laid out at `width` and drawn at the width it is
/// offered, scaled down, with the height the scale gives. The table form is
/// for an iPad's width, wider than the harness's canvas.
struct PMFixtureWidth: Layout {
  let width: CGFloat

  private func scale(_ proposal: ProposedViewSize) -> CGFloat {
    guard let offered = proposal.width, offered.isFinite, offered < width else { return 1 }
    return offered / width
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let height =
      subviews.first?.sizeThatFits(ProposedViewSize(width: width, height: nil)).height ?? 0
    let factor = scale(proposal)
    return CGSize(width: width * factor, height: height * factor)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    subviews.first?.place(
      at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: width, height: nil))
  }
}

/// A fixture frame on iOS: the content laid out at `width`, wider than the
/// canvas, in a horizontal scroll view where the members draw theirs, and
/// drawn whole from the leading edge where they are at rest. It takes the
/// width it is offered, so the content past it is what a narrower window
/// scrolls to.
private struct PMFixtureOverflow<Content: View>: View {
  @Environment(\.pmPageScrolls) private var scrolls
  let width: CGFloat
  @ViewBuilder let content: () -> Content

  var body: some View {
    if scrolls {
      ScrollView(.horizontal) { content().frame(width: width) }
    } else {
      PMFixtureOverflowLayout(width: width) { content().frame(width: width) }
    }
  }
}

/// The offered width, as tall as the content is at `width`, with the content
/// placed at `width` from the leading edge.
private struct PMFixtureOverflowLayout: Layout {
  let width: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let height =
      subviews.first?.sizeThatFits(ProposedViewSize(width: width, height: nil)).height ?? 0
    return CGSize(width: proposal.width.map { min($0, width) } ?? width, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    subviews.first?.place(
      at: bounds.origin, anchor: .topLeading,
      proposal: ProposedViewSize(width: width, height: bounds.height))
  }
}

extension View {
  /// Lays the view out at `width`, one of `PMFixtureWindow`'s. The renders
  /// (macOS) scale it to the harness's canvas, so a PNG shows the wide form
  /// whole. On iOS it keeps its own size, as the device the form is for draws
  /// it, so the simulator audit measures its hit regions as a person meets
  /// them; the part past the canvas is in a horizontal scroll view.
  @ViewBuilder
  func pmFixtureWidth(_ width: CGFloat) -> some View {
    #if os(iOS)
      PMFixtureOverflow(width: width) { self }
    #else
      PMFixtureWidth(width: width) {
        frame(width: width).scaleEffect(PMFixtureWindow.canvas / width, anchor: .topLeading)
      }
    #endif
  }
}
