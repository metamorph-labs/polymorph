// Drawer (`design/components/drawer.md`), adapted on iOS: Dialog's modal
// panel pinned to an edge, as a sheet from the bottom on iPhone and a side
// panel on iPad. It has no trigger: the screen opens it with `open`, or
// `defaultOpen`, and hears it close through `onOpenChange`.
//
// The panel is Dialog's anatomy at Drawer's insets: the header (`space-5`
// around, `space-3` under), with the title in `text.xl`, the description in
// `text.sm` `text.secondary` and the close button, Button's ghost/neutral/sm
// icon-only `close` named by `closeLabel` (default "Close"); the body, the one
// part that scrolls, `space-5` across; and the footer's actions at the
// trailing end, `space-3` apart, `space-3` above and `space-5` around.
//
// On iPhone every side is the platform's sheet from the bottom: a bottom
// drawer as tall as its content, up to the share of the screen `size` gives
// it, a half, two thirds or four fifths, past which the body scrolls; and a
// start or end drawer full height, as a side panel's full block size is. On
// iPad a start or end drawer is the side panel: Dialog's scrim over the
// screen and the panel pinned to its edge, four, five or six
// `space-10` steps wide by `size`, `radius.lg` on its free corners and a
// `border.subtle` hairline on its inner edge, sliding in from fully off the
// edge over the overlay duration on the enter easing and out on the exit
// easing, and fading in place under Reduce Motion. A bottom drawer on iPad is
// the sheet. `dismissible: false` removes the close button, the swipe that
// dismisses a sheet, the scrim's tap, VoiceOver's escape gesture and a
// hardware Escape together, so the footer must answer.
//
// Not honoured: `initialFocus`, as on Dialog, because the footer is a view
// the drawer cannot reach into; VoiceOver starts on the title. The harness
// draws no presentation, so the states fixture draws the panel in place.

import PolymorphTokens
import SwiftUI

public struct PMDrawer: PMDrawerRendering {
  @Environment(\.pmTheme) private var theme
  @PMCompactWidth private var compact
  @State private var presented: Bool
  @State private var laidOut: CGFloat = 0
  @State private var overflow: CGFloat = 0
  private let props: PMDrawerProps

  public init(props: PMDrawerProps) {
    self.props = props
    _presented = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let open = props.open ?? presented
    let dismissible = props.dismissible ?? true
    let binding = Binding(get: { open }, set: setOpen)

    Color.clear
      .frame(width: 0, height: 0)
      .sheet(isPresented: sheeted ? binding : .constant(false)) {
        // The panel fills the sheet; its height plus what its body holds past
        // its viewport is the height the content asks for.
        PMDrawerPanel(props: props, overflow: .scrolls) { setOpen(false) }
          .onGeometryChange(for: CGFloat.self) {
            $0.size.height
          } action: {
            laidOut = $0
          }
          .onPreferenceChange(PMPanelOverflowKey.self) { overflow = $0 }
          .presentationDetents([detent])
          .presentationDragIndicator(dismissible ? .visible : .hidden)
          .presentationBackground(theme.colors.bgOverlay.color)
          .presentationCornerRadius(theme.radius.lg)
          .interactiveDismissDisabled(!dismissible)
      }
      #if os(iOS)
        .fullScreenCover(isPresented: sheeted ? .constant(false) : binding) {
          PMDrawerSideSheet(props: props) { setOpen(false) }
            .presentationBackground(.clear)
        }
        // The side panel slides itself in; the cover's own rise is not drawn.
        .transaction { $0.disablesAnimations = !sheeted }
      #endif
      .environment(\.pmSheetContentHeight, max(0, laidOut + overflow))
      .environment(\.pmSheetShare, DrawerStates.bottomFraction(props.size ?? .md))
      .pmMember("Drawer", DrawerStates.attributes(open: open, props: props))
      .accessibilityHidden(!open)
  }

  /// A sheet from the bottom: every drawer on iPhone, and a bottom one on iPad.
  private var sheeted: Bool {
    #if os(iOS)
      compact || props.side == .bottom
    #else
      true
    #endif
  }

  /// A bottom drawer as tall as its content, up to its size's share of the
  /// screen; a side drawer's full height.
  private var detent: PresentationDetent {
    props.side == .bottom ? .custom(PMContentSheetDetent.self) : .large
  }

  private func setOpen(_ open: Bool) {
    presented = open
    props.onOpenChange?(open)
  }
}

/// The side panel on iPad: the scrim, and the panel pinned to its edge,
/// sliding in on appearing and out before it closes.
private struct PMDrawerSideSheet: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.layoutDirection) private var direction
  @State private var shown = false
  let props: PMDrawerProps
  let close: @MainActor () -> Void

  var body: some View {
    let side = props.side ?? .end
    let leading = side == .start
    let width = DrawerStates.width(props.size ?? .md, theme)
    GeometryReader { proxy in
      ZStack(alignment: leading ? .leading : .trailing) {
        theme.colors.bgScrim.color
          .opacity(shown ? 1 : 0)
          .ignoresSafeArea()
          .onTapGesture { if props.dismissible ?? true { dismiss() } }
          .accessibilityHidden(true)
        PMDrawerPanel(props: props, overflow: .scrolls, edge: leading ? .leading : .trailing) {
          dismiss()
        }
        .frame(width: min(width, proxy.size.width))
        .frame(maxHeight: .infinity)
        .offset(x: travel(leading: leading, width: width))
        .opacity(reduceMotion && !shown ? 0 : 1)
      }
      // The cover is not a sheet, so it answers VoiceOver's escape gesture
      // and a hardware Escape itself, as the scrim's tap does.
      .accessibilityAction(.escape) { if props.dismissible ?? true { dismiss() } }
      .onKeyPress(.escape) {
        guard props.dismissible ?? true else { return .ignored }
        dismiss()
        return .handled
      }
    }
    .onAppear {
      let motion = theme.defaultMotion
      withAnimation(motion.easing.enter.animation(duration: motion.duration.overlay)) {
        shown = true
      }
    }
  }

  /// Fully off the edge while hidden, whatever the temperament: the distance
  /// is the panel's geometry, not a travel the temperament scales. Under
  /// Reduce Motion the panel fades in place instead.
  private func travel(leading: Bool, width: CGFloat) -> CGFloat {
    guard !shown, !reduceMotion else { return 0 }
    return leading ? -width : width
  }

  private func dismiss() {
    let motion = theme.defaultMotion
    withAnimation(motion.easing.exit.animation(duration: motion.duration.overlayExit)) {
      shown = false
    } completion: {
      close()
    }
  }
}

/// The drawer's panel: the header with the close button, the body and the
/// footer, on the overlay surface. `edge` is the screen edge a side panel is
/// pinned to: its corners there are square, and its hairline is on the other
/// edge. With no edge the panel is drawn on its own surface, as the states
/// fixture draws it, or bare, inside a sheet that draws its own.
struct PMDrawerPanel: View {
  @Environment(\.pmTheme) private var theme
  let props: PMDrawerProps
  /// What the body does with more than the panel has room for: it scrolls
  /// between the fixed header and footer in a presentation; the fixture's
  /// renderer draws no scroll view, so there it grows, or is cut where it
  /// would scroll.
  var overflow: PMDialogOverflow = .grows
  var edge: HorizontalEdge? = nil
  var framed = false
  let close: @MainActor () -> Void

  var body: some View {
    let density = theme.defaultDensity
    let space = density.space
    let dismissible = props.dismissible ?? true

    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: space.s3) {
        VStack(alignment: .leading, spacing: space.s2) {
          Text(props.title)
            .pmTextStyle(theme.text.xl)
            .foregroundStyle(theme.colors.textPrimary.color)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
          if let description = props.description {
            Text(description)
              .pmTextStyle(theme.text.sm)
              .foregroundStyle(theme.colors.textSecondary.color)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if dismissible {
          PMButton(
            props: PMButtonProps(
              icon: .close, iconOnly: true, label: props.closeLabel ?? PMStrings.close,
              onClick: close, size: .sm, appearance: .ghostNeutral))
        }
      }
      .padding([.top, .horizontal], space.s5)
      .padding(.bottom, space.s3)
      if let children = props.children {
        let content = children.frame(maxWidth: .infinity, alignment: .leading)
        Group {
          switch overflow {
          case .scrolls:
            PMPanelScroll { content }
          case .grows:
            content
          case .clips:
            PMClippedBody { content }
          }
        }
        .padding(.horizontal, space.s5)
      }
      if let footer = props.footer {
        HStack(spacing: space.s3) {
          Spacer(minLength: 0)
          footer
        }
        .padding(.top, space.s3)
        .padding([.bottom, .horizontal], space.s5)
      }
    }
    .frame(
      maxWidth: .infinity, maxHeight: overflow == .grows ? nil : .infinity, alignment: .topLeading)
    .background { surface }
    .accessibilityElement(children: .contain)
    // Named by its title, as the web's `aria-labelledby` names the panel.
    .accessibilityLabel(Text(props.title))
    .accessibilityAddTraits(.isModal)
    .pmMember("Drawer", DrawerStates.attributes(open: true, props: props))
  }

  /// The overlay surface, its radius on the free corners and its hairline on
  /// the inner edge, with the overlay shadow; none inside a sheet.
  @ViewBuilder
  private var surface: some View {
    let radius = theme.radius.lg
    if let edge {
      let shape = UnevenRoundedRectangle(
        topLeadingRadius: edge == .leading ? 0 : radius,
        bottomLeadingRadius: edge == .leading ? 0 : radius,
        bottomTrailingRadius: edge == .trailing ? 0 : radius,
        topTrailingRadius: edge == .trailing ? 0 : radius)
      shape.fill(theme.colors.bgOverlay.color)
        .pmShadow(theme.shadows.overlay)
        .overlay(alignment: edge == .leading ? .trailing : .leading) {
          PMRule(theme.colors.borderSubtle, axis: .vertical)
        }
        .ignoresSafeArea()
    } else if framed {
      let shape = UnevenRoundedRectangle(
        topLeadingRadius: radius, bottomLeadingRadius: 0, bottomTrailingRadius: 0,
        topTrailingRadius: radius)
      shape.fill(theme.colors.bgOverlay.color)
        .pmShadow(theme.shadows.overlay)
        .overlay(alignment: .top) { PMRule(theme.colors.borderSubtle) }
    }
  }
}

/// Drawer's states, from the spec's States table. The harness renders no
/// presentation, so each open state is the panel drawn in place: a side
/// panel pinned to its edge at its width, and a bottom sheet across the
/// canvas. A closed drawer draws nothing in place, so it has no entry.
public struct DrawerStates: PMStates {
  public let member = "Drawer"

  public init() {}

  /// A bottom drawer's share of the screen's height by size, the recipe's
  /// `max-block-size` (`PMRecipe.drawerHeight…`).
  static func bottomFraction(_ size: PMControlSize) -> CGFloat {
    switch size {
    case .sm: PMRecipe.drawerHeightSm
    case .md: PMRecipe.drawerHeightMd
    case .lg: PMRecipe.drawerHeightLg
    }
  }

  /// A side drawer's width by size, in `space-10` steps (`PMRecipe.drawerWidth…`).
  static func width(_ size: PMControlSize, _ theme: PMTheme) -> CGFloat {
    let step = theme.defaultDensity.space.s10
    switch size {
    case .sm: return step * PMRecipe.drawerWidthSm
    case .md: return step * PMRecipe.drawerWidthMd
    case .lg: return step * PMRecipe.drawerWidthLg
    }
  }

  static func attributes(open: Bool, props: PMDrawerProps) -> [String: String] {
    [
      "state": open ? "open" : "closed", "side": (props.side ?? .end).rawValue,
      "size": (props.size ?? .md).rawValue,
    ]
  }

  private static let title = "Ticket details"
  private static let about = "Everything the customer has told us so far."

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("open end", expect: ["state": "open", "side": "end", "label": Self.title]) {
        DrawerOpen(props: PMDrawerProps(description: Self.about, side: .end, title: Self.title))
      },
      PMStateEntry("open start", expect: ["state": "open", "side": "start"]) {
        DrawerOpen(props: PMDrawerProps(description: Self.about, side: .start, title: Self.title))
      },
      PMStateEntry("open bottom", expect: ["state": "open", "side": "bottom"]) {
        DrawerOpen(props: PMDrawerProps(description: Self.about, side: .bottom, title: Self.title))
      },
      PMStateEntry("size sm", expect: ["state": "open", "size": "sm"]) {
        DrawerOpen(props: PMDrawerProps(size: .sm, title: Self.title))
      },
      PMStateEntry("size lg", expect: ["state": "open", "size": "lg"]) {
        DrawerOpen(props: PMDrawerProps(size: .lg, title: Self.title))
      },
      PMStateEntry("with footer", expect: ["state": "open"]) {
        DrawerOpen(
          props: PMDrawerProps(
            description: Self.about, footer: PMContent(DrawerFooter()), title: Self.title))
      },
      PMStateEntry("forced choice — no close button", expect: ["state": "open"]) {
        DrawerOpen(
          props: PMDrawerProps(
            dismissible: false, footer: PMContent(DrawerFooter()), title: "Choose a queue"))
      },
      PMStateEntry("scrolling body — the header and the footer stay", expect: ["state": "open"])
      {
        DrawerOpen(
          props: PMDrawerProps(
            children: PMContent(DrawerBody(paragraphs: 6)), footer: PMContent(DrawerFooter()),
            title: Self.title),
          capped: true)
      },
    ]
  }
}

/// An open drawer as the fixture draws it: a side panel at its width against
/// its edge, or a bottom sheet across the canvas, a body when none is given.
private struct DrawerOpen: View {
  @Environment(\.pmTheme) private var theme
  let props: PMDrawerProps
  var capped = false

  var body: some View {
    let side = props.side ?? .end
    let filled = PMDrawerProps(
      children: props.children ?? PMContent(DrawerBody(paragraphs: 1)),
      closeLabel: props.closeLabel, description: props.description,
      dismissible: props.dismissible, footer: props.footer, side: props.side, size: props.size,
      title: props.title)
    let panel = PMDrawerPanel(
      props: filled, overflow: capped ? .clips : .grows,
      edge: side == .bottom ? nil : side == .start ? .leading : .trailing,
      framed: side == .bottom, close: {})
    Group {
      if side == .bottom {
        panel
      } else {
        panel.frame(
          maxWidth: DrawerStates.width(props.size ?? .md, theme) * PMFixtureSpan.sideDrawerShare)
      }
    }
    .frame(
      height: capped ? theme.defaultDensity.space.s10 * PMFixtureSpan.cappedDrawer : nil,
      alignment: .top)
    .frame(maxWidth: .infinity, alignment: side == .start ? .leading : .trailing)
  }
}

/// Body copy for the fixture's panels.
private struct DrawerBody: View {
  @Environment(\.pmTheme) private var theme
  let paragraphs: Int

  private static let text =
    "The customer was charged twice for the March invoice and asked for the second charge to "
    + "be refunded to the same card."

  var body: some View {
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s3) {
      ForEach(0..<paragraphs, id: \.self) { _ in Text(Self.text) }
    }
    .pmTextStyle(theme.text.md)
    .foregroundStyle(theme.colors.textPrimary.color)
  }
}

/// A dismiss action and a primary one, the primary trailing.
private struct DrawerFooter: View {
  var body: some View {
    Group {
      PMButton(props: PMButtonProps(label: "Cancel", appearance: .outlineNeutral))
      PMButton(props: PMButtonProps(label: "Save"))
    }
  }
}
