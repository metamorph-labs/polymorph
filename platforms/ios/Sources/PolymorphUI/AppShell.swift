// AppShell (`design/archetypes/app-shell.md`): the application's frame around
// its router, never a screen. On iOS it is the platform's own container:
//
// - **A compact width class** (iPhone): a `NavigationStack` around the content,
//   its bar carrying the topbar's slots and a `menu` button that opens the
//   rail as a sheet: below the web's drawer breakpoint the rail is a drawer
//   over the content, and on a phone it never collapses, so every item keeps
//   its visible label (the platform map's note). The sheet closes when the
//   page changes (`transitionKey`).
// - **A regular width class** (iPad, and macOS): a `NavigationSplitView`, the
//   rail in the sidebar column at the shell's rail width on the rail's
//   surface, the content in a `NavigationStack` in the detail column.
//   `collapsed`, controlled or not, hides and shows the sidebar column, and
//   the system's own sidebar button reports through `onCollapsedChange`.
//
// The sidebar's navigation is the app's content (`sidebar`), so the shell
// cannot turn it into tabs: a `TabView` needs each destination's label and
// view, which an opaque slot does not give. For the same reason `navigation`,
// which lays the web's rail along the top of a wide window, draws nothing
// here: both containers are drawn whatever it says (`undrawn.ts`). The
// content region carries the app background; `contentLayout: .page` puts the
// children in a bounded, centred reading column. `dock` floats over the
// content's foot and the content leaves room for it. `pending` draws the
// page-transitions convention's ribbon along the top and a new
// `transitionKey` its arrival, which fades the content in without replacing
// it: the parts every page shares (`PMPageRibbon`, `PMPageArrival`).
//
// `banner` is a row of its own above either container, as wide as the frame.
// The navigation bar, the sidebar column and the content start under it, so
// the frame is shorter by the banner's height and nothing scrolls under it,
// which a safe-area inset would allow. The row is inside the top safe area,
// and a background the app gives its view reaches the screen's top edge, as a
// SwiftUI background does. The drawer's sheet opens over the row. The slot
// draws the view the app passes, and its region carries the shell's identity
// with `part=banner`.
//
// `messages` is the opaque `PMUnsupportedAppShellMessages` (an inline object
// type the contract cannot write), so the menu button's name is the spec's
// English default, looked up in the app's string catalog.

import PolymorphTokens
import SwiftUI

public struct PMAppShell: PMAppShellRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmShellLayout) private var forced
  #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
  #endif
  @State private var drawer = false
  @State private var localCollapsed: Bool?
  private let props: PMAppShellProps

  public init(props: PMAppShellProps) {
    self.props = props
  }

  /// The stack on a compact width class, the split view otherwise.
  private var layout: PMShellLayout {
    if let forced { return forced }
    #if os(iOS)
      return sizeClass == .compact ? .stack : .split
    #else
      return .split
    #endif
  }

  private var collapsed: Bool {
    props.collapsed ?? localCollapsed ?? props.defaultCollapsed ?? false
  }

  public var body: some View {
    VStack(spacing: 0) {
      if let banner = props.banner {
        banner
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityElement(children: .contain)
          .pmMember("AppShell", ["part": "banner"])
      }
      switch layout {
      case .stack: stack
      case .split: split
      }
    }
    .background(theme.colors.bgApp.color)
  }

  private var attributes: [String: String] {
    var found = ["layout": layout.rawValue, "content": (props.contentLayout ?? .full).rawValue]
    if collapsed && layout == .split { found["collapsed"] = "true" }
    if props.pending == true { found["pending"] = "true" }
    return found
  }

  // MARK: The two containers

  private var stack: some View {
    NavigationStack {
      content
        .toolbar { bar(menu: true) }
        .modifier(PMShellBarSurface())
    }
    .sheet(isPresented: $drawer) {
      rail
        .presentationDragIndicator(.visible)
    }
    .onChange(of: props.transitionKey) { _, _ in drawer = false }
  }

  private var split: some View {
    NavigationSplitView(columnVisibility: visibility) {
      rail
        .navigationSplitViewColumnWidth(railWidth)
    } detail: {
      NavigationStack {
        content
          .toolbar { bar(menu: false) }
          .modifier(PMShellBarSurface())
      }
    }
  }

  /// The sidebar column's visibility, from `collapsed`; a change the system
  /// makes (its sidebar button) is reported and, uncontrolled, kept.
  private var visibility: Binding<NavigationSplitViewVisibility> {
    Binding(
      get: { collapsed ? .detailOnly : .all },
      set: { next in
        let hidden = next == .detailOnly
        guard hidden != collapsed else { return }
        if props.collapsed == nil { localCollapsed = hidden }
        props.onCollapsedChange?(hidden)
      })
  }

  /// The shell's rail width: two of the largest space step and one `space.7`,
  /// the web's `--pm-shell-sidebar-width`.
  private var railWidth: CGFloat {
    let space = theme.defaultDensity.space
    return space.s10 + space.s10 + space.s7
  }

  // MARK: The regions

  /// The rail: the brand, the app's navigation, and its footer, on the rail's
  /// surface.
  private var rail: some View {
    let space = theme.defaultDensity.space
    return VStack(alignment: .leading, spacing: space.s2) {
      if let brand = props.brand {
        brand
          .padding(.horizontal, space.s3)
          .frame(minHeight: space.s7 + space.s6, alignment: .leading)
      }
      ScrollView {
        VStack(alignment: .leading, spacing: space.s2) {
          props.sidebar
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      if let footer = props.sidebarFooter {
        footer
      }
    }
    .padding(space.s4)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(theme.shell.railBg.color)
    .accessibilityElement(children: .contain)
  }

  /// The content region: the children (in a reading column for `.page`), the
  /// pending ribbon, the dock, and the arrival fade.
  private var content: some View {
    let space = theme.defaultDensity.space
    return PMPageArrival(transitionKey: props.transitionKey) {
      if props.contentLayout == .page {
        PMShellReadingColumn { props.children }
      } else {
        props.children
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(theme.colors.bgApp.color)
    .overlay(alignment: .top) {
      if props.pending == true {
        PMPageRibbon()
      }
    }
    .safeAreaInset(edge: .bottom) {
      if let dock = props.dock {
        dock
          .padding(.horizontal, space.s6)
          .padding(.bottom, space.s5)
      }
    }
    // The member's identity is on the content region, the web's `<main>`:
    // the navigation containers host their content apart from the views
    // around them, so an identifier outside them would reach no element.
    .accessibilityElement(children: .contain)
    .pmMember("AppShell", attributes)
  }

  /// The bar's slots: the menu button that opens the drawer (compact only),
  /// then the topbar's leading and trailing content.
  @ToolbarContentBuilder
  private func bar(menu: Bool) -> some ToolbarContent {
    if menu {
      ToolbarItem(placement: Self.leading) {
        // The label's hit target widens the bar button to it; the bar keeps
        // the button's height its own, whatever frame the label is given.
        Button {
          drawer = true
        } label: {
          PMIconView(.menu, size: .md).pmHitTarget()
        }
        .accessibilityLabel(Text(PMStrings.openNavigation))
      }
    }
    if let leading = props.topbar?.leading {
      ToolbarItem(placement: Self.leading) { leading }
    }
    if let trailing = props.topbar?.trailing {
      ToolbarItem(placement: Self.trailing) { trailing }
    }
  }

  #if os(iOS)
    private static let leading: ToolbarItemPlacement = .topBarLeading
    private static let trailing: ToolbarItemPlacement = .topBarTrailing
  #else
    private static let leading: ToolbarItemPlacement = .navigation
    private static let trailing: ToolbarItemPlacement = .primaryAction
  #endif
}

/// The navigation bar on the topbar's surface, where the platform lets a bar
/// take a colour.
private struct PMShellBarSurface: ViewModifier {
  @Environment(\.pmTheme) private var theme

  func body(content: Content) -> some View {
    #if os(iOS)
      content
        .toolbarBackground(theme.shell.topbarBg.color, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
    #else
      content
    #endif
  }
}

/// `contentLayout: .page`: the children in a centred column no wider than the
/// recipe's reading measure (`PMRecipe.appShellReadingMeasure` steps of
/// `space.10`), inset `space.8`, one step less below 40rem.
private struct PMShellReadingColumn<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmPageScrolls) private var scrolls
  @ViewBuilder let content: () -> Content

  var body: some View {
    let space = theme.defaultDensity.space
    let column = PMPageColumn(
      wide: (space.s8, space.s8), narrow: (space.s6, space.s6),
      maxWidth: space.s10 * PMRecipe.appShellReadingMeasure
    ) {
      VStack(alignment: .leading, spacing: 0) { content() }
    }
    if scrolls {
      ScrollView { column }
    } else {
      column
    }
  }
}

/// Which container an AppShell draws. A fixture can fix it with
/// `\.pmShellLayout`; otherwise the width class decides.
enum PMShellLayout: String {
  case stack, split
}

private struct PMShellLayoutKey: EnvironmentKey {
  static let defaultValue: PMShellLayout? = nil
}

extension EnvironmentValues {
  /// The AppShell container to draw regardless of the width class, or `nil` to follow it.
  var pmShellLayout: PMShellLayout? {
    get { self[PMShellLayoutKey.self] }
    set { self[PMShellLayoutKey.self] = newValue }
  }
}

/// AppShell's states. The harness renders with `ImageRenderer`, which draws a
/// `NavigationStack`'s content but neither a split view nor a sheet, so every
/// entry draws the compact container; the regular one is compiled and
/// type-checked, not drawn here.
public struct AppShellStates: PMStates {
  public let member = "AppShell"

  public init() {}

  private static let pages = ["Inbox", "Customers", "Reports"]
  private static let title = "Inbox"
  private static let body = "Every ticket waiting for a reply."
  private static let notice = "Your trial ends in 3 days."
  private static let upgrade = "Upgrade plan"

  /// The notice in the `banner` slot: a warning Banner with the way out.
  private static var banner: PMContent {
    AnyView(
      PMBanner(
        props: PMBannerProps(
          action: AnyView(
            PMButton(props: PMButtonProps(label: Self.upgrade, size: .sm, appearance: .softAccent))),
          children: AnyView(Text(Self.notice)), tone: .warning)))
  }

  private func shell(
    banner: PMContent? = nil, pending: Bool? = nil, layout: PMAppShellContentLayout? = nil,
    dock: PMContent? = nil
  ) -> some View {
    PMAppShell(
      props: PMAppShellProps(
        banner: banner,
        children: AnyView(
          PMStack(
            props: PMStackProps(
              children: AnyView(
                Group {
                  PMHeading(props: PMHeadingProps(children: Self.title))
                  PMText(props: PMTextProps(children: AnyView(Text(Self.body)), tone: .secondary))
                }),
              gap: .s2, p: layout == .page ? nil : .s6))),
        contentLayout: layout, dock: dock, pending: pending,
        sidebar: AnyView(
          ForEach(Self.pages, id: \.self) { page in
            PMText(props: PMTextProps(children: AnyView(Text(page))))
          }),
        topbar: PMAppShellTopbar(
          trailing: AnyView(PMAvatar(props: PMAvatarProps(name: "Ada Lovelace", size: .sm))))
      )
    )
    .environment(\.pmShellLayout, .stack)
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("full content", expect: ["layout": "stack", "content": "full"]) { shell() },
      PMStateEntry("page content", expect: ["content": "page"]) { shell(layout: .page) },
      PMStateEntry("pending", expect: ["pending": "true"]) { shell(pending: true) },
      PMStateEntry("with a dock") {
        shell(
          dock: AnyView(PMButton(props: PMButtonProps(icon: .send, label: "Ask a question"))))
      },
      // The banner's region is the first element the shell exposes, so the
      // entry's root is that part. SwiftUI folds the Banner's own container
      // into the region, so the Banner's action is what the entry finds in it.
      PMStateEntry(
        "with a banner — a notice across the frame, above the rail and the topbar",
        expect: ["part": "banner", "contains": "Button"]
      ) {
        shell(banner: Self.banner)
      },
    ]
  }
}
