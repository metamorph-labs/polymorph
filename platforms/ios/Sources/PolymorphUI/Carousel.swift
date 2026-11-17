// Carousel (`design/components/carousel.md`): peer slides shown one at a time,
// moved through by the reader. Never on a timer: there is no autoplay. The
// viewport is SwiftUI's own paging scroll view (`scrollTargetBehavior(.paging)`
// over slides each as wide as the viewport), so a swipe, its momentum and the
// snap to a slide are the system's; the viewport is clipped to `radius.md` and
// has no scroll bar, because the controls show the position. Under it, `space.3`
// below and `space.3` apart, centred: the previous Button, the dot rail and the
// next Button, the Buttons `ghost`/`neutral`/`sm` icon-only and named by
// `previousLabel` and `nextLabel`.
//
// Swipes, the Buttons and the dots move one position, `index` when the app
// controls it and the carousel's own otherwise (from `defaultIndex`), and
// `onIndexChange` reports it whichever moved it. The Buttons and the dots
// scroll over the surface duration on the standard easing, and at once at the
// `none` temperament and under Reduce Motion; a swipe is the reader's own
// scroll. Without `loop` the Buttons are disabled at the ends; with it they
// wrap.
//
// A dot is `space.2` round in `border.default`, `border.strong` under the
// pointer, and the current one a `space.4` lozenge in `accent.bg`. The rail is
// the platform's page control: one adjustable element named by `label` whose
// value is the current slide's label, so VoiceOver's swipe up and down move
// the position. The web's dots are one button each, each with a hit area
// grown to `space-6`; a dot here answers a tap across its own cell of the
// rail, at least `space-6` wide, as the spec's hit area is, and as tall as the
// hit target, so the dots are spaced by their cells rather than `space-2`
// apart: dots each reaching the hit target across would overlap.
//
// iOS has no role description, so the role words (`roleDescriptions`, or the
// APG's "carousel" and "slide") are the last clause of the names VoiceOver
// reads: the carousel is "Product tour, carousel" and a slide
// "Compose, slide". Slides off screen stay in the scroll view and in the
// accessibility tree, as the web keeps them in the DOM.
//
// `ImageRenderer` draws no scroll view's content, so the harness turns the
// scroll view off (`\.pmPageScrolls`) and the viewport shows the current
// slide alone: the PNGs show which slide is current and the controls'
// states, not the paging itself.

import PolymorphTokens
import SwiftUI

public struct PMCarousel: PMCarouselRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.pmPageScrolls) private var scrolls
  @State private var mirror: Int
  /// The slide the scroll view is at. It starts empty and is set when the
  /// scroll view appears: a scroll position set before the first layout is
  /// not scrolled to.
  @State private var scrolled: String?
  private let props: PMCarouselProps

  public init(props: PMCarouselProps) {
    self.props = props
    let first = Self.clamp(Int(props.index ?? props.defaultIndex ?? 0), props.slides.count)
    _mirror = State(initialValue: first)
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let roles = props.roleDescriptions ?? PMStrings.carouselRoleDescriptions

    if !props.slides.isEmpty {
      VStack(spacing: space.s3) {
        viewport(roles)
          .clipShape(RoundedRectangle(cornerRadius: theme.radius.md))
        HStack(spacing: space.s3) {
          PMButton(
            props: PMButtonProps(
              disabled: !loop && index == 0, icon: .previous, iconOnly: true,
              label: props.previousLabel, onClick: { step(-1) }, size: .sm,
              appearance: .ghostNeutral))
          rail
          PMButton(
            props: PMButtonProps(
              disabled: !loop && index == props.slides.count - 1, icon: .next, iconOnly: true,
              label: props.nextLabel, onClick: { step(1) }, size: .sm,
              appearance: .ghostNeutral))
        }
      }
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text("\(props.label), \(roles.carousel)"))
      .pmMember("Carousel")
      .onChange(of: index) { _, now in scroll(to: now) }
      .onChange(of: scrolled) { _, id in read(id) }
    }
  }

  /// The current slide: the app's `index` when it controls it, the carousel's own otherwise.
  private var index: Int {
    Self.clamp(props.index.map(Int.init) ?? mirror, props.slides.count)
  }

  private var loop: Bool { props.loop ?? false }

  /// The paging scroll view, or the current slide alone when it is turned off.
  @ViewBuilder
  private func viewport(_ roles: PMCarouselRoleDescriptions) -> some View {
    if scrolls {
      ScrollView(.horizontal) {
        HStack(alignment: .top, spacing: 0) {
          ForEach(props.slides, id: \.id) { slide in
            self.slide(slide, roles).containerRelativeFrame(.horizontal)
          }
        }
        .scrollTargetLayout()
      }
      .scrollTargetBehavior(.paging)
      .scrollPosition(id: $scrolled)
      .scrollIndicators(.hidden)
      .onAppear { scrolled = props.slides[index].id }
    } else {
      slide(props.slides[index], roles)
        .frame(maxWidth: .infinity)
    }
  }

  /// One slide, named by its label and the slide role.
  private func slide(_ slide: PMCarouselSlide, _ roles: PMCarouselRoleDescriptions) -> some View {
    slide.content
      .frame(maxWidth: .infinity, alignment: .topLeading)
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text("\(slide.label), \(roles.slide)"))
  }

  /// The dots: the platform's page control, one adjustable element.
  private var rail: some View {
    let count = props.slides.count
    return HStack(spacing: 0) {
      ForEach(0..<count, id: \.self) { at in
        CarouselDot(current: at == index) { travel(to: at) }
      }
    }
    // As tall as the hit target, and at least as wide, whatever the count.
    .frame(minWidth: theme.defaultDensity.hitTarget)
    .frame(height: theme.defaultDensity.hitTarget)
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(props.label))
    .accessibilityValue(Text(props.slides[index].label))
    .accessibilityAdjustableAction { direction in
      switch direction {
      case .increment: step(1)
      case .decrement: step(-1)
      @unknown default: break
      }
    }
  }

  /// The next or the previous slide, wrapping with `loop` and stopping at the
  /// ends without it.
  private func step(_ by: Int) {
    let count = props.slides.count
    let next = index + by
    if loop {
      travel(to: (next + count) % count)
    } else if (0..<count).contains(next) {
      travel(to: next)
    }
  }

  /// Moves the position and reports it. The viewport scrolls when the index
  /// changes, so a controlled carousel moves when the app moves its `index`.
  private func travel(to next: Int) {
    guard next != index else { return }
    mirror = next
    props.onIndexChange?(Double(next))
  }

  /// Scrolls the viewport to a slide over the surface duration, or at once at
  /// the `none` temperament and under Reduce Motion. A viewport already there,
  /// as after a swipe, does not move.
  private func scroll(to at: Int) {
    guard props.slides.indices.contains(at), scrolled != props.slides[at].id else { return }
    let motion = theme.defaultMotion
    let duration = motion.duration.surface
    if !reduceMotion, duration > 0 {
      withAnimation(motion.easing.standard.animation(duration: duration)) {
        scrolled = props.slides[at].id
      }
    } else {
      scrolled = props.slides[at].id
    }
  }

  /// A swipe settled on a slide: the position follows it and is reported.
  private func read(_ id: String?) {
    guard let id, let at = props.slides.firstIndex(where: { $0.id == id }), at != index else {
      return
    }
    mirror = at
    props.onIndexChange?(Double(at))
  }

  private static func clamp(_ value: Int, _ count: Int) -> Int {
    min(max(count - 1, 0), max(0, value))
  }
}

/// One dot: `space.2` round, the current one a `space.4` lozenge in the
/// accent, in a cell at least `space.6` wide, the spec's hit area; a tap
/// anywhere in its cell moves to its slide.
private struct CarouselDot: View {
  @Environment(\.pmTheme) private var theme
  @State private var hovering = false
  let current: Bool
  let select: @MainActor () -> Void

  var body: some View {
    let space = theme.defaultDensity.space
    let motion = theme.defaultMotion
    let colors = theme.colors
    let fill = current ? colors.accentBg : hovering ? colors.borderStrong : colors.borderDefault
    // Half the gap each side at least, so every point of the rail belongs to
    // one dot, and the cell at least the spec's hit area.
    let half = space.s2 / 2
    RoundedRectangle(cornerRadius: theme.radius.pill)
      .fill(fill.color)
      .frame(width: current ? space.s4 : space.s2, height: space.s2)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control),
        value: [current, hovering])
      .padding(.horizontal, half)
      .frame(minWidth: space.s6, maxHeight: .infinity)
      .contentShape(.rect)
      .onTapGesture(perform: select)
      .onHover { hovering = $0 }
  }
}

/// Carousel's states, from the spec's States table. The scroll view is turned
/// off, because `ImageRenderer` draws none of its content: each entry draws its
/// current slide and the controls. The empty Carousel draws nothing, so it has
/// no entry: the harness holds every entry to drawing.
public struct CarouselStates: PMStates {
  public let member = "Carousel"

  public init() {}

  private static let label = "Product tour"
  private static let name = "Product tour, carousel"
  private static let previous = "Previous step"
  private static let next = "Next step"

  private static let tour: [(id: String, label: String, title: String, body: String)] = [
    ("compose", "Compose", "Compose a request", "Pick a method, paste a URL, add headers."),
    ("send", "Send", "Send and inspect", "Every response keeps its timing and its headers."),
    ("share", "Share", "Share the run", "A link reproduces the request for anyone on the team."),
  ]

  private static var slides: [PMCarouselSlide] {
    tour.map { slide in
      PMCarouselSlide(
        id: slide.id, label: slide.label,
        content: AnyView(
          PMCard(
            props: PMCardProps(
              children: AnyView(
                PMStack(
                  props: PMStackProps(
                    children: AnyView(
                      Group {
                        PMHeading(props: PMHeadingProps(children: slide.title, level: .level3))
                        PMText(props: PMTextProps(children: AnyView(Text(slide.body))))
                      }),
                    gap: .s2)))))))
    }
  }

  private func carousel(
    defaultIndex: Double? = nil, index: Double? = nil, loop: Bool? = nil,
    roles: PMCarouselRoleDescriptions? = nil, label: String = CarouselStates.label
  ) -> some View {
    PMCarousel(
      props: PMCarouselProps(
        defaultIndex: defaultIndex, index: index, label: label, loop: loop,
        nextLabel: Self.next, previousLabel: Self.previous, roleDescriptions: roles,
        slides: Self.slides)
    )
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("a tour", expect: ["label": Self.name]) {
        carousel()
      },
      PMStateEntry("second slide", expect: ["label": Self.name]) {
        carousel(defaultIndex: 1)
      },
      PMStateEntry("looping — the ends join") {
        carousel(loop: true)
      },
      PMStateEntry("at the end — next disabled without loop") {
        carousel(defaultIndex: 2)
      },
      PMStateEntry("controlled — the app owns the position") {
        carousel(index: 2)
      },
      PMStateEntry("localized role words", expect: ["label": "Visite guidée, diaporama"]) {
        carousel(
          roles: PMCarouselRoleDescriptions(carousel: "diaporama", slide: "diapositive"),
          label: "Visite guidée")
      },
    ]
  }
}
