// Lightbox (`design/components/lightbox.md`): a picture opened large over the
// screen, fitted inside it with nothing cropped, on the scrim, with previous
// and next when there are several.
//
// The trigger stays where the screen puts it; the lightbox puts its opening
// action in the environment (`pmTriggerAction`), as Dialog does. Opening
// presents a full-screen cover, the platform's modal surface over the whole
// screen, without the cover's rise: the scrim (`bg.scrim`) and the panel fade
// in over the overlay duration on the enter easing and out on the exit
// easing, and appear and leave in place under Reduce Motion and at the `none`
// temperament. An empty list opens nothing. `open` with `onOpenChange` is the
// controlled form; `defaultOpen` opens it on its own.
//
// Each picture is Image, fitted inside the panel less `space.4` on each side
// and the safe area, and never drawn past its own size (`pmImageFitsHeight`).
// The pictures are a paging scroll view, one picture a page, so a swipe moves
// to the next picture as it does in Photos. A pinch zooms the picture shown up
// to four times its fitted size, a drag pans it while it is zoomed and the
// pages stop paging, a double tap returns it, and a move to another picture
// returns it too. The controls float over the picture, each on a backing
// (`bg.overlay`, a `border.subtle` hairline, `radius.control`, the transient
// shadow) around Button's ghost/neutral/sm icon-only: close at the top
// trailing corner, previous and next at the leading and trailing edges, and
// the position ("2 of 3", `text.sm` with tabular figures) centred at the foot.
// In a right-to-left layout previous sits at the trailing edge and its arrow
// is mirrored, as next's is. One picture draws no previous, next or position.
//
// `index` with `onIndexChange` is the controlled position; `defaultIndex` sets
// where an uncontrolled lightbox starts, and the position is kept when it
// closes. Previous on the first picture and next on the last are disabled.
// The arrow keys of a hardware keyboard move one picture by the layout's
// direction, a key with a modifier is left alone, and Escape closes. So do
// the close Button, a tap on the scrim beside the picture and VoiceOver's
// escape gesture; a tap on the picture or a control does not. The panel is
// named by `label`. VoiceOver starts on the close Button and returns to the
// trigger when the cover closes, as UIKit returns it. The new position is
// announced when the picture changes, and not on opening.
//
// Where the platform's own photo viewer differs from the web, it decides: a
// swipe moves between pictures, and a pinch zooms the picture in the panel,
// because an app's window does not zoom as a browser's does. A travel Button
// disabled at an end keeps VoiceOver's focus, as every dimmed button does,
// where the web moves focus to the other one. The glass depth draws the
// backings on the overlay fill, as Dialog's sheet draws its panel.

import PolymorphTokens
import SwiftUI

public struct PMLightbox: PMLightboxRendering {
  @State private var presented: Bool
  @State private var mirror: Int
  private let props: PMLightboxProps

  public init(props: PMLightboxProps) {
    self.props = props
    _presented = State(initialValue: props.defaultOpen ?? false)
    _mirror = State(initialValue: Self.clamp(props.defaultIndex ?? 0, props.images.count))
  }

  public var body: some View {
    let open = isOpen
    let binding = Binding(get: { open }, set: setOpen)

    PMOverlayTrigger(trigger: props.trigger) { setOpen(true) }
      .background {
        Color.clear
          .frame(width: 0, height: 0)
          #if os(iOS)
            .fullScreenCover(isPresented: binding) {
              PMLightboxCover(props: props, index: index, travel: travel) { setOpen(false) }
                .presentationBackground(.clear)
            }
            // The panel fades itself in; the cover's own rise is not drawn.
            .transaction { $0.disablesAnimations = true }
          #else
            .sheet(isPresented: binding) {
              PMLightboxCover(props: props, index: index, travel: travel) { setOpen(false) }
            }
          #endif
      }
      .pmMember("Lightbox", ["state": open ? "open" : "closed"])
  }

  /// Open while the app or the lightbox holds it open, and never for an empty list.
  private var isOpen: Bool {
    (props.open ?? presented) && !props.images.isEmpty
  }

  /// The picture shown: the app's `index` when it controls it, the lightbox's own otherwise.
  private var index: Int {
    Self.clamp(props.index ?? Double(mirror), props.images.count)
  }

  /// Moves to a picture and reports it. A move past an end, or to the picture
  /// shown, does nothing.
  private func travel(_ to: Int) {
    guard props.images.indices.contains(to), to != index else { return }
    mirror = to
    props.onIndexChange?(Double(to))
  }

  private func setOpen(_ open: Bool) {
    guard !open || !props.images.isEmpty else { return }
    presented = open
    props.onOpenChange?(open)
  }

  /// The index clamped to the list, as Carousel's is.
  static func clamp(_ value: Double, _ count: Int) -> Int {
    min(max(count - 1, 0), max(0, Int(value)))
  }
}

/// The cover's content: the panel, fading in on appearing and out before it
/// closes.
private struct PMLightboxCover: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var shown = false
  let props: PMLightboxProps
  let index: Int
  let travel: @MainActor (Int) -> Void
  let close: @MainActor () -> Void

  var body: some View {
    PMLightboxPanel(props: props, index: index, travel: travel, close: dismiss)
      .opacity(shown ? 1 : 0)
      .onAppear {
        let motion = theme.defaultMotion
        if reduceMotion || motion.duration.overlay <= 0 {
          shown = true
        } else {
          withAnimation(motion.easing.enter.animation(duration: motion.duration.overlay)) {
            shown = true
          }
        }
      }
  }

  private func dismiss() {
    let motion = theme.defaultMotion
    guard !reduceMotion, motion.duration.overlayExit > 0 else {
      close()
      return
    }
    withAnimation(motion.easing.exit.animation(duration: motion.duration.overlayExit)) {
      shown = false
    } completion: {
      close()
    }
  }
}

/// The panel: the scrim, the pictures and the controls over them. The cover
/// presents it over the screen; the states fixture draws it in place.
struct PMLightboxPanel: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmPageScrolls) private var scrolls
  @Environment(\.layoutDirection) private var direction
  @FocusState private var keys: Bool
  /// The page the scroll view is at. It is set when the panel appears: a
  /// scroll position set before the first layout is not scrolled to.
  @State private var scrolled: Int?
  @State private var zoom: CGFloat = 1
  @State private var pinchStart: CGFloat?
  @State private var pan: CGSize = .zero
  @State private var panStart: CGSize?
  let props: PMLightboxProps
  let index: Int
  let travel: @MainActor (Int) -> Void
  let close: @MainActor () -> Void

  var body: some View {
    let space = theme.defaultDensity.space
    let messages = props.messages ?? PMStrings.lightboxMessages

    ZStack {
      // A tap beside the picture lands on the scrim and closes.
      theme.colors.bgScrim.color
        .ignoresSafeArea()
        .contentShape(.rect)
        .onTapGesture(perform: close)
        .accessibilityHidden(true)
      if props.images.indices.contains(index) {
        stage(space)
      }
      controls(messages, space)
        .padding(space.s4)
    }
    .environment(\.pmImageFitsHeight, true)
    .focusable()
    .focused($keys)
    .focusEffectDisabled()
    .onKeyPress(phases: .down) { press in keyed(press) }
    .onAppear {
      scrolled = index
      keys = true
    }
    .onChange(of: index) { _, now in moved(to: now, messages) }
    .onChange(of: scrolled) { _, page in
      // A swipe settled on a picture: the position follows it and is reported.
      if let page, page != index { travel(page) }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.label))
    .accessibilityAddTraits(.isModal)
    .accessibilityAction(.escape) { close() }
    .pmMember("Lightbox", ["state": "open"])
  }

  private var several: Bool { props.images.count > 1 }

  /// The pictures: one a page of a paging scroll view, or the current one
  /// alone where the scroll views are drawn at rest.
  @ViewBuilder
  private func stage(_ space: PMSpace) -> some View {
    if scrolls {
      ScrollView(.horizontal) {
        HStack(spacing: 0) {
          ForEach(props.images.indices, id: \.self) { at in
            page(at, space).containerRelativeFrame([.horizontal, .vertical])
          }
        }
        .scrollTargetLayout()
      }
      .scrollTargetBehavior(.paging)
      .scrollPosition(id: $scrolled)
      .scrollIndicators(.hidden)
      .scrollDisabled(zoom > 1 || !several)
    } else {
      page(index, space)
    }
  }

  /// One picture, centred and fitted inside the page less `space.4` on each
  /// side, over a backing that takes the taps beside it and closes. The
  /// picture shown zooms, pans and returns on a double tap.
  private func page(_ at: Int, _ space: PMSpace) -> some View {
    let image = props.images[at]
    let current = at == index
    return PMImage(props: PMImageProps(alt: image.alt, src: image.src))
      .scaleEffect(current ? zoom : 1)
      .offset(current ? pan : .zero)
      .gesture(pinch, including: current ? .all : .subviews)
      .gesture(drag, including: current && zoom > 1 ? .all : .subviews)
      .onTapGesture(count: 2) { if current { unzoom() } }
      .padding(space.s4)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background {
        Color.clear
          .contentShape(.rect)
          .onTapGesture(perform: close)
          .accessibilityHidden(true)
      }
      .id(at)
  }

  /// Close at the top trailing corner; previous and next at the edges,
  /// centred between it and the position at the foot.
  private func controls(_ messages: PMLightboxMessages, _ space: PMSpace) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: 0) {
        Spacer(minLength: 0)
        PMButton(
          props: PMButtonProps(
            icon: .close, iconOnly: true, label: messages.close, onClick: close, size: .sm,
            appearance: .ghostNeutral)
        )
        .modifier(PMLightboxBacking())
        // VoiceOver starts here, as the web's focus does.
        .accessibilitySortPriority(1)
      }
      Spacer(minLength: 0)
      if several {
        HStack(spacing: 0) {
          travelButton(.previous, messages.previous, to: index - 1)
          Spacer(minLength: 0)
          travelButton(.next, messages.next, to: index + 1)
        }
        Spacer(minLength: 0)
        Text(messages.position(Double(index + 1), Double(props.images.count)))
          .pmTextStyle(theme.text.sm)
          .pmTabularFigures(true)
          .foregroundStyle(theme.colors.textPrimary.color)
          .padding(.vertical, space.s1)
          .padding(.horizontal, space.s3)
          .modifier(PMLightboxBacking())
      }
    }
  }

  /// Previous or next, disabled where there is no picture to move to. The
  /// icon set has no directional pairs, so the arrow is mirrored right to left.
  private func travelButton(_ icon: PMIconRole, _ label: String, to: Int) -> some View {
    PMButton(
      props: PMButtonProps(
        disabled: !props.images.indices.contains(to), icon: icon, iconOnly: true, label: label,
        onClick: { travel(to) }, size: .sm, appearance: .ghostNeutral)
    )
    .modifier(PMLightboxBacking())
    .flipsForRightToLeftLayoutDirection(true)
  }

  private var pinch: some Gesture {
    MagnifyGesture()
      .onChanged { value in
        let start = pinchStart ?? zoom
        if pinchStart == nil { pinchStart = start }
        // Four times the fitted size at most, ImageEditor's default reach.
        zoom = min(4, max(1, start * value.magnification))
      }
      .onEnded { _ in
        pinchStart = nil
        if zoom <= 1 { pan = .zero }
      }
  }

  private var drag: some Gesture {
    DragGesture()
      .onChanged { drag in
        // The hand moves the picture: no animation.
        let start = panStart ?? pan
        if panStart == nil { panStart = start }
        pan = CGSize(
          width: start.width + drag.translation.width,
          height: start.height + drag.translation.height)
      }
      .onEnded { _ in panStart = nil }
  }

  /// The picture back at its fitted size, over the control duration.
  private func unzoom() {
    let motion = theme.defaultMotion
    withAnimation(motion.easing.standard.animation(duration: motion.duration.control)) {
      zoom = 1
      pan = .zero
    }
  }

  /// The arrows move one picture by the layout's direction, and Escape
  /// closes. A key with a modifier is the system's or the reader's own.
  private func keyed(_ press: KeyPress) -> KeyPress.Result {
    guard press.modifiers.isDisjoint(with: [.shift, .control, .option, .command]) else {
      return .ignored
    }
    switch press.key {
    case .escape:
      close()
      return .handled
    case .leftArrow, .rightArrow:
      guard several else { return .ignored }
      let forward = (press.key == .rightArrow) == (direction == .leftToRight)
      travel(forward ? index + 1 : index - 1)
      return .handled
    default:
      return .ignored
    }
  }

  /// A new picture starts at its fitted size, the scroll view follows a move
  /// the Buttons or the keys made, in one frame, and the position is said.
  private func moved(to now: Int, _ messages: PMLightboxMessages) {
    zoom = 1
    pan = .zero
    if scrolled != now { scrolled = now }
    AccessibilityNotification.Announcement(
      messages.position(Double(now + 1), Double(props.images.count))
    ).post()
  }
}

/// A control's backing: the overlay surface behind a Button or the position,
/// so the control keeps its contrast over any picture.
private struct PMLightboxBacking: ViewModifier {
  @Environment(\.pmTheme) private var theme

  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: theme.radius.control)
    content
      .background { shape.fill(theme.colors.bgOverlay.color).pmShadow(theme.shadows.transient) }
      .overlay { shape.strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
  }
}

/// Lightbox's states, from the spec's States table. The harness renders no
/// presentation, so an open entry draws the panel in place, at a phone
/// screen's height, holding its own position; the closed entry is the trigger.
/// `ImageRenderer` draws no picture `AsyncImage` loads, so the renders show the
/// panel and its controls with each picture still arriving, and the failed
/// picture's fallback. The pictures are data URLs, GIFs of one colour whose
/// canvas is the size the entry names, so no entry waits on the network.
public struct LightboxStates: PMStates {
  public let member = "Lightbox"

  public init() {}

  /// A one-colour GIF of the size its name gives, as a data URL.
  private static func gif(_ base64: String) -> String {
    "data:image/gif;base64," + base64
  }

  private static let tail = "AP///wAAACwAAAAAAQABAAACAkQBADs="

  private static let preview = PMLightboxImage(
    src: gif("R0lGODlhwANYAoAA" + tail),  // 960 by 600
    alt: "The checkout page with an error banner over the payment form")

  private static let set = [
    PMLightboxImage(src: gif("R0lGODlhsAQgA4AA" + tail), alt: "A harbour at dusk"),  // 1200 by 800
    PMLightboxImage(src: gif("R0lGODlhIAPoA4AA" + tail), alt: "A pine ridge in the morning"),  // 800 by 1000
    PMLightboxImage(src: gif("R0lGODlhsASEA4AA" + tail), alt: "Red cliffs over a dry river"),  // 1200 by 900
  ]

  private static let wide = PMLightboxImage(
    src: gif("R0lGODlhYAmEA4AA" + tail),  // 2400 by 900
    alt: "A panorama of the harbour from the north wall")

  private static let tall = PMLightboxImage(
    src: gif("R0lGODlhWAJABoAA" + tail),  // 600 by 1600
    alt: "The settings screen on a phone, scrolled to the bottom")

  private static let failed = PMLightboxImage(
    src: "", alt: "The preview of the uploaded receipt")

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "one picture — no previous, next or position",
        expect: ["state": "open", "label": "Attachment preview", "contains": "Button"]
      ) {
        LightboxInPlace(label: "Attachment preview", images: [Self.preview])
      },
      PMStateEntry(
        "open — the second of three pictures",
        expect: ["state": "open", "label": "Photographs", "contains": "Button"]
      ) {
        LightboxInPlace(label: "Photographs", images: Self.set, start: 1)
      },
      PMStateEntry("several pictures", expect: ["state": "closed", "contains": "Button"]) {
        PMLightbox(
          props: PMLightboxProps(
            images: Self.set, label: "Photographs",
            trigger: PMContent(
              PMButton(
                props: PMButtonProps(label: "View the photographs", appearance: .outlineNeutral)))))
      },
      PMStateEntry("a wide picture — fitted by its width", expect: ["state": "open"]) {
        LightboxInPlace(label: "Panorama", images: [Self.wide])
      },
      PMStateEntry("a tall picture — fitted by its height", expect: ["state": "open"]) {
        LightboxInPlace(label: "Phone screenshot", images: [Self.tall])
      },
      PMStateEntry(
        "a picture that fails — Image’s fallback",
        expect: ["state": "open", "contains": "Image[state=failed]"]
      ) {
        LightboxInPlace(label: "Attachment preview", images: [Self.failed])
      },
    ]
  }
}

/// An open lightbox's panel drawn in place at a phone screen's height,
/// holding its own position, as the cover's does.
struct LightboxInPlace: View {
  @Environment(\.pmTheme) private var theme
  @State private var index: Int
  let label: String
  let images: [PMLightboxImage]

  init(label: String, images: [PMLightboxImage], start: Int = 0) {
    self.label = label
    self.images = images
    _index = State(initialValue: start)
  }

  var body: some View {
    PMLightboxPanel(
      props: PMLightboxProps(images: images, label: label), index: index,
      travel: { index = $0 }, close: {}
    )
    .frame(height: theme.defaultDensity.space.s10 * PMFixtureSpan.lightbox)
  }
}
