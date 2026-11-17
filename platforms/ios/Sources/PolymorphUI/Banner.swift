// Banner (`design/components/banner.md`): the notice that belongs to the
// application frame and stays until its cause ends. A row across the frame on
// its tone's wash, `space.2` and `space.4` inside, with a hairline in the
// tone's border at its foot and no radius, because it runs edge to edge:
// `neutral` is `bg.subtle` with `border.default`, and a tone is
// `{tone}.subtle` with `{tone}.border`, the pairing Alert uses. The row holds
// the tone glyph (`info`, `warning`, `error`) in `{tone}.text`, none on
// `neutral`; then the message and the action, which wrap as a pair; then the
// dismiss button, Button `ghost`/`neutral`/`sm` icon-only `close`, named by
// `dismissLabel` ("Dismiss"), when `onDismiss` is set.
//
// The message is `text.sm` in `text.primary`. The glyph, the message's first
// line, the action and the dismiss button share the centre of the row's first
// line. The recipe's line is the small control height. A small control here
// takes the hit target's height in the layout (`pmHitTarget`), so the line of
// a Banner with an action or a dismiss button is the hit target tall, and the
// line of one without is the small control height. The message is padded
// above so its first line is centred on that line, and below as the recipe
// pads it, half of what a text line leaves of the small control height. The
// message takes the free width beside the action while it
// keeps at least the recipe's basis, twice `space.10`
// (`PMRecipe.bannerMessageBasis`); a narrower frame moves the action under the
// message, where it starts where the message starts. The dismiss button stays
// at the end of the first line.
//
// No motion: the frame does not animate, so the Banner appears and leaves at
// once. A press on the dismiss button calls `onDismiss`; the app removes the
// Banner, and focus moves nowhere. The reading order is the message, the
// action, then the dismiss button. The glyph is decorative, and the root's
// identifier carries `tone`.
//
// iOS has no status or alert role for a view and no live region, and an
// announcement is a string while the message is the app's view, so a Banner
// is not announced when it appears (`PLATFORM_GAPS` in
// `packages/native/src/pending.ts`). VoiceOver reads it where it is, first in
// the frame.

import PolymorphTokens
import SwiftUI

public struct PMBanner: PMBannerRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMBannerProps

  public init(props: PMBannerProps) {
    self.props = props
  }

  public var body: some View {
    let tone = props.tone ?? .neutral
    let recipe = BannerRecipe(tone: tone, colors: theme.colors)
    let density = theme.defaultDensity
    let space = density.space
    let step = theme.text.sm
    let controls = props.action != nil || props.onDismiss != nil
    let line = controls ? max(density.controlHeight.sm, density.hitTarget) : density.controlHeight.sm
    let above = max(0, (line - step.lineBox) / 2)
    let below = max(0, (density.controlHeight.sm - step.lineBox) / 2)

    HStack(alignment: .top, spacing: space.s3) {
      if let glyph = recipe.glyph {
        PMIconView(glyph, size: .md)
          .foregroundStyle(recipe.text.color)
          .frame(height: line)
      }

      BannerContent(
        columnGap: space.s3, rowGap: space.s2, basis: space.s10 * PMRecipe.bannerMessageBasis
      ) {
        props.children
          .pmTextStyle(step)
          .foregroundStyle(theme.colors.textPrimary.color)
          .multilineTextAlignment(.leading)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, above)
          .padding(.bottom, below)
          .frame(maxWidth: .infinity, alignment: .leading)
        if let action = props.action {
          action
            .fixedSize()
            .frame(minHeight: line)
        }
      }

      if let onDismiss = props.onDismiss {
        PMButton(
          props: PMButtonProps(
            icon: .close, iconOnly: true, label: props.dismissLabel ?? PMStrings.dismiss,
            onClick: onDismiss, size: .sm, appearance: .ghostNeutral))
      }
    }
    .padding(.vertical, space.s2)
    .padding(.horizontal, space.s4)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(recipe.wash.color)
    .overlay(alignment: .bottom) { PMRule(recipe.rule) }
    .accessibilityElement(children: .contain)
    .pmMember("Banner", ["tone": tone.rawValue])
  }
}

/// The tone's wash, its rule and its glyph: `{tone}.text` on `{tone}.subtle`,
/// the pairing the contrast law checks, and no glyph on `neutral`, which
/// states a fact.
private struct BannerRecipe {
  let wash: PMDynamicColor
  let rule: PMDynamicColor
  let text: PMDynamicColor
  let glyph: PMIconRole?

  init(tone: PMBannerTone, colors c: PMColors) {
    switch tone {
    case .neutral: (wash, rule, text, glyph) = (c.bgSubtle, c.borderDefault, c.textPrimary, nil)
    case .info: (wash, rule, text, glyph) = (c.infoSubtle, c.infoBorder, c.infoText, .info)
    case .warning:
      (wash, rule, text, glyph) = (c.warningSubtle, c.warningBorder, c.warningText, .warning)
    case .danger: (wash, rule, text, glyph) = (c.dangerSubtle, c.dangerBorder, c.dangerText, .error)
    }
  }
}

/// The message and the action as a pair that wraps. The action keeps its own
/// width; the message takes the rest of the line while that is at least
/// `basis`, and otherwise the whole width, with the action under it, `rowGap`
/// below, at the message's start.
private struct BannerContent: Layout {
  let columnGap: CGFloat
  let rowGap: CGFloat
  let basis: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? idealWidth(subviews)
    let frames = place(subviews, width: width)
    return CGSize(width: width, height: frames.map(\.maxY).max() ?? 0)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    for (subview, frame) in zip(subviews, place(subviews, width: bounds.width)) {
      subview.place(
        at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
        anchor: .topLeading, proposal: ProposedViewSize(frame.size))
    }
  }

  /// Both parts on one line at their ideal widths.
  private func idealWidth(_ subviews: Subviews) -> CGFloat {
    let widths = subviews.map { $0.sizeThatFits(.unspecified).width }
    return widths.reduce(0, +) + columnGap * CGFloat(max(0, widths.count - 1))
  }

  /// Each part's frame, from the pair's top leading corner.
  private func place(_ subviews: Subviews, width: CGFloat) -> [CGRect] {
    guard let message = subviews.first else { return [] }
    let tall = { (subview: LayoutSubview, width: CGFloat) in
      subview.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
    }
    guard subviews.count > 1, let action = subviews.last else {
      return [CGRect(x: 0, y: 0, width: width, height: tall(message, width))]
    }
    let own = action.sizeThatFits(.unspecified)
    let actionWidth = min(own.width, width)
    if width - columnGap - actionWidth >= basis {
      let room = width - columnGap - actionWidth
      return [
        CGRect(x: 0, y: 0, width: room, height: tall(message, room)),
        CGRect(x: room + columnGap, y: 0, width: actionWidth, height: own.height),
      ]
    }
    let above = tall(message, width)
    return [
      CGRect(x: 0, y: 0, width: width, height: above),
      CGRect(x: 0, y: above + rowGap, width: actionWidth, height: own.height),
    ]
  }
}

/// Banner's states, from the spec's States table: each tone, an action, the
/// dismiss button, and a long message whose action moves under it.
public struct BannerStates: PMStates {
  public let member = "Banner"

  public init() {}

  private static let session = "You are viewing Northwind Traders as a member of support."
  private static let stop = "Stop viewing"
  private static let snapshot =
    "This page shows the snapshot taken at 09:00. Live data is back at 10:00."
  private static let trial = "Your trial ends in 3 days."
  private static let upgrade = "Upgrade plan"
  private static let outage =
    "Payments are unavailable. Orders are saved and charged when the service returns."
  private static let maintenance = "Scheduled maintenance on Sunday from 02:00 to 04:00 UTC."
  private static let delay =
    "Replies sent by email are delayed by about twenty minutes while the mail queue catches up. "
    + "Replies sent from this page arrive at once. Nothing is lost, and the queue is expected to "
    + "clear within the hour."
  private static let status = "Status page"

  private func copy(_ text: String) -> PMContent {
    AnyView(Text(text))
  }

  private func button(_ label: String, _ appearance: PMButtonAppearance) -> PMContent {
    AnyView(PMButton(props: PMButtonProps(label: label, size: .sm, appearance: appearance)))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "neutral — a fact about the session, with the way out",
        expect: ["tone": "neutral", "contains": "Button"]
      ) {
        PMBanner(
          props: PMBannerProps(
            action: button(Self.stop, .ghostNeutral), children: copy(Self.session)))
      },
      PMStateEntry("info", expect: ["tone": "info"]) {
        PMBanner(props: PMBannerProps(children: copy(Self.snapshot), tone: .info))
      },
      PMStateEntry("warning — with an action", expect: ["tone": "warning", "contains": "Button"]) {
        PMBanner(
          props: PMBannerProps(
            action: button(Self.upgrade, .softAccent), children: copy(Self.trial),
            tone: .warning))
      },
      PMStateEntry("danger", expect: ["tone": "danger"]) {
        PMBanner(props: PMBannerProps(children: copy(Self.outage), tone: .danger))
      },
      PMStateEntry(
        "dismissible — a reminder the reader may hide",
        expect: ["tone": "info", "contains": "Button"]
      ) {
        PMBanner(
          props: PMBannerProps(children: copy(Self.maintenance), onDismiss: {}, tone: .info))
      },
      PMStateEntry(
        "a long message — it wraps, and the action moves under it", expect: ["tone": "warning"]
      ) {
        PMBanner(
          props: PMBannerProps(
            action: button(Self.status, .ghostNeutral), children: copy(Self.delay),
            onDismiss: {}, tone: .warning))
      },
    ]
  }
}
