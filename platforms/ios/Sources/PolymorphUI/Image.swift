// Image (`design/components/image.md`): a read-only picture, such as a
// photograph, a brand mark, artwork or a preview. It is not Avatar, a round
// identity mark, not ImageEditor, which crops, and not Icon, which draws a role.
//
// SwiftUI's `AsyncImage` loads the picture, as Avatar's does. `width` and
// `height` are the picture's size in points and `aspectRatio` a frame's ratio.
// With either, the member holds the box before the picture arrives: the given
// width at most and never wider than the room offered, at the ratio. With
// neither, it reserves nothing and then draws the picture at its own size, or
// at the width offered when that is less. `fit` shows all of the picture in
// the box or fills the box and crops; the picture is never stretched.
//
// While the picture loads the box is the `bg.subtle` fill, still, as the
// platform's own image views draw a still placeholder. When it cannot load,
// or `src` is empty or no URL, the box is the same fill with the `error` glyph
// in `text.muted`; with no box given, that fallback is `space.8` square.
//
// A picture with an `alt` is one image named by it, in every state, so the
// name is the same before and after a failure. An empty `alt` declares the
// picture decorative and hides it from assistive technology.
//
// Not honoured, because the platform has no counterpart: `loading` (a view
// loads its picture when it appears, which a lazy stack already delays),
// `crossOrigin` (a request from an app has no origin to cross) and
// `referrerPolicy` (the request carries no referrer).

import PolymorphTokens
import SwiftUI

public struct PMImage: PMImageRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmImageFitsHeight) private var fitsHeight
  private let props: PMImageProps

  public init(props: PMImageProps) {
    self.props = props
  }

  public var body: some View {
    if let url = props.src.isEmpty ? nil : URL(string: props.src) {
      AsyncImage(url: url) { phase in
        switch phase {
        case .success(let picture): framed(.loaded, picture)
        case .failure: framed(.failed, nil)
        default: framed(.loading, nil)
        }
      }
    } else {
      // Nothing to request, so nothing is tried: the fallback from the start.
      framed(.failed, nil)
    }
  }

  /// Where the request stands. A loaded picture is the rest state and names
  /// no state on the root, as on the web.
  private enum Outcome: String {
    case loading, loaded, failed
  }

  /// `width` and `height`, when both are given and above zero. One alone gives
  /// no ratio and is ignored.
  private var natural: CGSize? {
    guard let width = props.width, let height = props.height, width > 0, height > 0 else {
      return nil
    }
    return CGSize(width: width, height: height)
  }

  /// The box's ratio: `aspectRatio`, else that of `width` and `height`, else none.
  private var ratio: CGFloat? {
    if let ratio = props.aspectRatio, ratio > 0 { return ratio }
    return natural.map { $0.width / $0.height }
  }

  private func attributes(_ outcome: Outcome) -> [String: String] {
    var attributes = ["fit": (props.fit ?? .contain).rawValue]
    if outcome != .loaded { attributes["state"] = outcome.rawValue }
    if ratio != nil { attributes["sized"] = "true" }
    return attributes
  }

  /// The member in one state, named or hidden by its `alt`.
  @ViewBuilder
  private func framed(_ outcome: Outcome, _ picture: Image?) -> some View {
    let box = Group {
      if let ratio {
        // The clear box holds the size; what the state draws fills it, and a
        // picture that covers is cut at its edges.
        Color.clear
          .aspectRatio(ratio, contentMode: .fit)
          .frame(maxWidth: natural?.width)
          .overlay { filling(outcome, picture) }
          .clipped()
      } else {
        unsized(outcome, picture)
      }
    }
    if props.alt.isEmpty {
      box
        .accessibilityHidden(true)
        .pmMember("Image", attributes(outcome))
    } else {
      box
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(props.alt))
        .accessibilityAddTraits(.isImage)
        .pmMember("Image", attributes(outcome))
    }
  }

  /// What fills a held box: the placeholder, the picture or the fallback.
  @ViewBuilder
  private func filling(_ outcome: Outcome, _ picture: Image?) -> some View {
    if let picture {
      picture
        .resizable()
        .aspectRatio(contentMode: props.fit == .cover ? .fill : .fit)
    } else if outcome == .failed {
      fallback
    } else {
      theme.colors.bgSubtle.color
    }
  }

  /// With no box given: nothing while the picture loads, the picture at its
  /// own size once it has, and a fallback with a size of its own.
  @ViewBuilder
  private func unsized(_ outcome: Outcome, _ picture: Image?) -> some View {
    let space = theme.defaultDensity.space
    if let picture {
      PMImageNaturalSize(fitsHeight: fitsHeight) {
        picture.resizable().aspectRatio(contentMode: .fit)
      }
    } else if outcome == .failed {
      fallback.frame(width: space.s8, height: space.s8)
    } else {
      Color.clear.frame(width: 0, height: 0)
    }
  }

  private var fallback: some View {
    ZStack {
      theme.colors.bgSubtle.color
      PMIconView(.error)
    }
    .foregroundStyle(theme.colors.textMuted.color)
  }
}

/// Its content at its ideal width, or the width offered when that is less, at
/// the height its ratio gives: the web's `max-inline-size: 100%` with
/// `block-size: auto`. With `fitsHeight` it is no taller than the height
/// offered either, its width shrinking with it: Lightbox's bound on both axes.
private struct PMImageNaturalSize: Layout {
  var fitsHeight = false

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let content = subviews.first else { return .zero }
    let ideal = content.sizeThatFits(.unspecified)
    guard ideal.width > 0, ideal.height > 0 else { return .zero }
    var width = proposal.width.map { min($0, ideal.width) } ?? ideal.width
    if fitsHeight, let height = proposal.height, ideal.height * width / ideal.width > height {
      width = height * ideal.width / ideal.height
    }
    return CGSize(width: width, height: ideal.height * width / ideal.width)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    subviews.first?.place(
      at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
  }
}

private struct PMImageFitsHeightKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  /// Whether a picture with no size given is fitted inside the height offered
  /// as well as the width, as Lightbox fits each picture inside the window
  /// (the web's `max-block-size` on Lightbox's picture). Off, it is as tall as
  /// its width gives.
  var pmImageFitsHeight: Bool {
    get { self[PMImageFitsHeightKey.self] }
    set { self[PMImageFitsHeightKey.self] = newValue }
  }
}

/// Image's states, from the spec's States table. A picture's state when the
/// harness reads it depends on how far its request has come, so only the
/// entries with an empty `src`, which are failed from the start, promise one.
/// The spec's entry with no size given is not here: it draws nothing until its
/// picture arrives, and the harness renders an entry once. The decorative
/// entries are hidden from accessibility, which `hidden` tells the harness.
public struct ImageStates: PMStates {
  public let member = "Image"

  public init() {}

  private static let alt = "A harbour at dusk"

  /// A 160 by 100 picture as a data URL, so no entry waits on the network.
  private static let picture =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAAAsklEQVR42u3RQQ0AAAjEsHOE"
    + "D6zg/48NQppMwZrq0eNiAWABFmABFmABFmDAAizAAizAAizAgAVYgAVYgAVYgAUYsAALsAALsAALMGABFmABFmABFmDA"
    + "AizAAizAAizAAgxYgAVYgAVYgAUYsAALsAALsAALMGAXAAuwAAuwAAuwAAMWYAEWYAEWYAEGLMACLMACLMACLMCABViA"
    + "BViABViAAQuwAAuwAAuwAAMWYAHWvRZDr606XF3XhAAAAABJRU5ErkJggg=="

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "a picture at its own size", expect: ["fit": "contain", "sized": "true", "label": Self.alt]
      ) {
        PMImage(props: PMImageProps(alt: Self.alt, height: 100, src: Self.picture, width: 160))
      },
      PMStateEntry("decorative", expect: ["hidden": "true"]) {
        PMImage(props: PMImageProps(alt: "", height: 100, src: Self.picture, width: 160))
      },
      PMStateEntry("contained", expect: ["fit": "contain", "sized": "true"]) {
        PMImage(
          props: PMImageProps(
            alt: Self.alt, aspectRatio: 1, height: 100, src: Self.picture, width: 160))
      },
      PMStateEntry("cover", expect: ["fit": "cover", "sized": "true"]) {
        PMImage(
          props: PMImageProps(
            alt: Self.alt, aspectRatio: 1, fit: .cover, height: 100, src: Self.picture, width: 160))
      },
      PMStateEntry("a frame that takes its container", expect: ["sized": "true"]) {
        PMImage(props: PMImageProps(alt: Self.alt, aspectRatio: 2, src: Self.picture))
      },
      PMStateEntry(
        "failed — a meaningful image",
        expect: ["state": "failed", "sized": "true", "label": Self.alt]
      ) {
        PMImage(props: PMImageProps(alt: Self.alt, height: 100, src: "", width: 160))
      },
      PMStateEntry("failed — a decorative image", expect: ["hidden": "true"]) {
        PMImage(props: PMImageProps(alt: "", height: 100, src: "", width: 160))
      },
      PMStateEntry(
        "failed with no size given", expect: ["state": "failed", "sized": "", "label": Self.alt]
      ) {
        PMImage(props: PMImageProps(alt: Self.alt, src: ""))
      },
    ]
  }
}
