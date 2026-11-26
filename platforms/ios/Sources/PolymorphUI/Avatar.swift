// Avatar (`design/components/avatar.md`): a round mark for a person or a
// workspace: the image, else the initials, else the `user` glyph. Round at every
// geometry, as Switch's thumb is: both depict round things, and the geometry
// axis governs surfaces. The image fades in over the initials already drawn, so
// a slow image never leaves a gap; a URL that fails leaves the initials.
//
// The initials take one of five status families, picked by a hash of the name,
// so two people get two colours, the same on every screen and the same as on
// the web, without a hue outside the role table the contrast law checks. The
// glyph means there is no name (unassigned), a different fact from a missing
// picture.
//
// Beside a visible name the avatar is hidden from assistive technology, which
// would hear the name twice; standing alone it is an image named by `label`.
// Initials are never read: they are a picture of a name, not the name.
//
// The web's `Avatar.Group` has no contract on iOS (the registry publishes no
// part for it), so it is not drawn here.

import PolymorphTokens
import SwiftUI

public struct PMAvatar: PMAvatarRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMAvatarProps

  public init(props: PMAvatarProps) {
    self.props = props
  }

  public var body: some View {
    let size = props.size ?? .md
    let space = theme.defaultDensity.space
    let diameter: CGFloat =
      switch size {
      case .sm: space.s6
      case .md: space.s7
      case .lg: space.s8
      }
    let step: PMTextStyle =
      switch size {
      case .sm: theme.text.xs
      case .md: theme.text.sm
      // Initials keep the body face at every size: `text.lg` is a heading step.
      case .lg: theme.text.lg.set(in: theme.fonts.body)
      }
    let initials = Self.initials(of: props.name)
    let tone = initials.isEmpty ? nil : Self.tone(of: props.name)
    let recipe = AvatarRecipe(tone: tone, colors: theme.colors)
    let motion = theme.defaultMotion
    let fade = motion.easing.enter.animation(duration: motion.duration.control)
    let attributes = [
      "size": size.rawValue, "fallback": initials.isEmpty ? "icon" : "initials",
      "tone": tone?.rawValue ?? "none",
    ]

    let mark = ZStack {
      Circle().fill(recipe.fill.color)
      if initials.isEmpty {
        PMIconView(.user, size: size)
      } else {
        Text(initials)
          .pmTextStyle(step)
          .lineLimit(1)
      }
      if let src = props.src, let url = URL(string: src) {
        AsyncImage(url: url, transaction: Transaction(animation: fade)) { phase in
          if let image = phase.image {
            image
              .resizable()
              .scaledToFill()
              .transition(.opacity)
              .overlay { Circle().strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
          }
        }
      }
    }
    .foregroundStyle(recipe.text.color)
    .frame(width: diameter, height: diameter)
    .clipShape(.circle)

    if let label = props.label {
      mark
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(.isImage)
        .pmMember("Avatar", attributes)
    } else {
      mark
        .accessibilityHidden(true)
        .pmMember("Avatar", attributes)
    }
  }

  /// Two letters, upper-cased: the first and last words' initials, or a single
  /// word's first two. A middle name is not a third initial.
  static func initials(of name: String) -> String {
    let words = name.split(whereSeparator: \.isWhitespace)
    guard let first = words.first, let last = words.last else { return "" }
    if words.count == 1 { return String(first.prefix(2)).uppercased() }
    return "\(first.prefix(1))\(last.prefix(1))".uppercased()
  }

  /// The five families a name can map to, in the web's order.
  enum Tone: String, CaseIterable {
    case accent, info, success, warning, danger
  }

  /// FNV-1a over the name's UTF-16 code units, as the web's `avatarTone`
  /// computes it, so a name has the same family on every platform.
  static func tone(of name: String) -> Tone {
    var hash: UInt32 = 2_166_136_261
    for unit in name.utf16 {
      hash ^= UInt32(unit)
      hash = hash &* 16_777_619
    }
    return Tone.allCases[Int(hash % UInt32(Tone.allCases.count))]
  }
}

/// The fill and the text colour: a family's `subtle` and `text`, or the glyph
/// fallback's subtle background and muted glyph.
private struct AvatarRecipe {
  let fill: PMDynamicColor
  let text: PMDynamicColor

  init(tone: PMAvatar.Tone?, colors c: PMColors) {
    switch tone {
    case nil: (fill, text) = (c.bgSubtle, c.textMuted)
    case .accent: (fill, text) = (c.accentSubtle, c.accentText)
    case .info: (fill, text) = (c.infoSubtle, c.infoText)
    case .success: (fill, text) = (c.successSubtle, c.successText)
    case .warning: (fill, text) = (c.warningSubtle, c.warningText)
    case .danger: (fill, text) = (c.dangerSubtle, c.dangerText)
    }
  }
}

/// Avatar's states, from the spec: initials, a single word, the glyph, the
/// three sizes, an image (its initials show while it loads, or when it cannot),
/// and the standalone mark with `label`. The avatars beside a name are hidden
/// from accessibility, which `hidden` tells the harness.
public struct AvatarStates: PMStates {
  public let member = "Avatar"

  public init() {}

  private static let ada = "Ada Lovelace"
  private static let single = "Grace"
  private static let photo = "https://example.com/avatars/ada.png"
  private static let standalone = "Ada Lovelace, assignee"

  public var entries: [PMStateEntry] {
    let sizes = PMControlSize.allCases.map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["hidden": "true"]) {
        PMAvatar(props: PMAvatarProps(name: Self.ada, size: size))
      }
    }
    return [
      PMStateEntry("initials", expect: ["hidden": "true"]) {
        PMAvatar(props: PMAvatarProps(name: Self.ada))
      },
      PMStateEntry("single word", expect: ["hidden": "true"]) {
        PMAvatar(props: PMAvatarProps(name: Self.single))
      },
      PMStateEntry("icon", expect: ["hidden": "true"]) {
        PMAvatar(props: PMAvatarProps(name: ""))
      },
      PMStateEntry("image", expect: ["hidden": "true"]) {
        PMAvatar(props: PMAvatarProps(name: Self.ada, src: Self.photo))
      },
    ] + sizes + [
      PMStateEntry(
        "standalone", expect: ["fallback": "initials", "size": "lg", "label": Self.standalone]
      ) {
        PMAvatar(props: PMAvatarProps(label: Self.standalone, name: Self.ada, size: .lg))
      }
    ]
  }
}
