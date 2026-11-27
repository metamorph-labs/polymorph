// Stat (`design/components/stat.md`): one key number with its label and the way
// it is moving. Content, not a surface: a Dashboard puts each in a Card. The
// value is formatted by the app; it snaps to a new value, because a counting
// animation would be decoration.
//
// Two ways to say the number moved, never both on one stat: `delta` carries
// sentiment (the success or the danger tone, from `positive`, which defaults to
// the direction being up, because down can be good news), and `trend` is the
// neutral outline Badge on the label row that says only which way. The footer's
// two lines differ by colour, not weight, and its trailing glyph is the trend's
// direction, so the chip and the line agree.
//
// The stat is one element: its label, value and delta read as one statement.
// The delta is spoken with its direction and its sentiment, because neither the
// arrow nor the colour is read aloud. `deltaLabel` gives the sentence in the
// app's words, and the string catalog's "up 12% — positive" stands in for it.
//
// `spark` draws a small Sparkline at the value row's end, the path beside the
// number, sitting on the value's baseline; the row's two ends hold the two, so
// the number comes first and the spark never squashes. `sparkLabel` names it
// from the stat's label, "Revenue, recent trend" by default, and it reads as
// part of the one statement.
//
// `loading` says the number has not arrived. The label row stays, and the value
// and each part the caller passes that states the number (the trend chip, the
// spark, the delta or the description, the footer) is a Skeleton of that part's
// size, so the stat keeps its height when the number arrives. The value's
// Skeleton is named by `loadingLabel`, "Loading" by default, and the rest are
// hidden, so the stat reads as its label and "Loading": no value, delta, chip
// label or spark name is drawn or read for a number that has not arrived.

import PolymorphTokens
import SwiftUI

public struct PMStat: PMStatRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMStatProps

  public init(props: PMStatProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let numeric = props.numeric ?? true
    let loading = props.loading ?? false
    let positive = props.delta.map { $0.positive ?? ($0.direction == .up) }

    VStack(alignment: .leading, spacing: space.s2) {
      HStack(spacing: space.s3) {
        Text(props.label)
          .textCase(.uppercase)
          .pmTextStyle(theme.text.xs)
          .foregroundStyle(colors.textSecondary.color)
          .accessibilityLabel(Text(props.label))
        Spacer(minLength: 0)
        if props.icon != nil || props.trend != nil {
          // The end never shrinks, so the number, not the trend label, sets the width.
          HStack(spacing: space.s2) {
            if let icon = props.icon {
              PMIconView(icon, size: .md).foregroundStyle(colors.textMuted.color)
            }
            if let trend = props.trend {
              if loading {
                // The chip's box, Badge's padding around a Skeleton of its line,
                // so the label row keeps the chip's height.
                PMSkeleton(props: PMSkeletonProps(textStep: .xs, width: .width7))
                  .padding(.vertical, space.s1)
                  .padding(.horizontal, space.s3)
              } else {
                PMBadge(
                  props: PMBadgeProps(
                    children: trend.label, icon: Self.glyph(trend.direction), variant: .outline))
              }
            }
          }
          .fixedSize()
        }
      }

      HStack(alignment: .firstTextBaseline, spacing: space.s3) {
        if loading {
          // The value's line box, and the one placeholder VoiceOver reads.
          PMSkeleton(
            props: PMSkeletonProps(
              label: props.loadingLabel ?? PMStrings.loading, textStep: .textStep3xl,
              width: .width10))
        } else {
          Text(props.value)
            .pmTextStyle(theme.text.text3xl)
            .foregroundStyle(colors.textPrimary.color)
            .pmTabularFigures(numeric && theme.numeric.tabular)
        }
        if let spark = props.spark {
          Spacer(minLength: 0)
          if loading {
            // Shorter than the value's line box, so the row keeps its height.
            PMSkeleton(props: PMSkeletonProps(shape: .rect, size: .s6, width: .width9))
              .alignmentGuide(.firstTextBaseline) { $0[.bottom] }
          } else {
            PMSparkline(
              props: PMSparklineProps(
                data: spark,
                label: props.sparkLabel?(props.label) ?? PMSpecDefault.sparkLabel(props.label)))
            .fixedSize()
            .alignmentGuide(.firstTextBaseline) { $0[.bottom] }
          }
        }
      }

      if props.delta != nil, loading {
        // No direction, value or sentiment for a number that has not arrived.
        PMSkeleton(props: PMSkeletonProps(textStep: .sm, width: .width9))
      } else if props.description != nil, loading {
        PMSkeleton(props: PMSkeletonProps(textStep: .xs, width: .width10))
      } else if let delta = props.delta, let positive {
        HStack(spacing: space.s1) {
          PMIconView(Self.glyph(delta.direction), size: .sm)
          Text(delta.value)
        }
        .pmTextStyle(theme.text.sm)
        .foregroundStyle((positive ? colors.successText : colors.dangerText).color)
        .accessibilityElement(children: .ignore)
        // "up 12% — positive", or the app's words from `deltaLabel`: the arrow
        // and the colour say what assistive technology would not hear.
        .accessibilityLabel(Text(spoken(delta, positive: positive)))
      } else if let description = props.description {
        Text(description)
          .pmTextStyle(theme.text.xs)
          .foregroundStyle(colors.textMuted.color)
      }

      if props.footer != nil, loading {
        // The footer's two lines; its words come with the number.
        VStack(alignment: .leading, spacing: space.s2) {
          PMSkeleton(props: PMSkeletonProps(textStep: .sm))
          PMSkeleton(props: PMSkeletonProps(textStep: .sm, width: .width10))
        }
        .padding(.top, space.s5)
      } else if let footer = props.footer {
        VStack(alignment: .leading, spacing: space.s2) {
          HStack(spacing: space.s3) {
            Text(footer.primary)
              .foregroundStyle(colors.textPrimary.color)
            if let trend = props.trend {
              PMIconView(Self.glyph(trend.direction), size: .sm)
                .foregroundStyle(colors.textPrimary.color)
            }
          }
          Text(footer.secondary)
            .foregroundStyle(colors.textMuted.color)
        }
        .pmTextStyle(theme.text.sm)
        // Further from the number than the rows above (the stack's gap and
        // this): the footer comments on the statement the label, value and
        // delta make.
        .padding(.top, space.s5)
      }
    }
    .multilineTextAlignment(.leading)
    .fixedSize(horizontal: false, vertical: true)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
    .pmMember("Stat", attributes(positive: positive, loading: loading))
  }

  /// The delta's spoken sentence: the app's, from `deltaLabel`, or the string
  /// catalog's.
  private func spoken(_ delta: PMStatDelta, positive: Bool) -> String {
    let facts = PMStatDeltaFacts(value: delta.value, direction: delta.direction, positive: positive)
    return props.deltaLabel?(facts) ?? PMStrings.delta(delta, positive: positive)
  }

  private func attributes(positive: Bool?, loading: Bool) -> [String: String] {
    var found: [String: String] = [:]
    if loading { found["loading"] = "true" }
    if let delta = props.delta { found["direction"] = delta.direction.rawValue }
    if let positive { found["positive"] = String(positive) }
    if let trend = props.trend { found["trend"] = trend.direction.rawValue }
    if props.footer != nil { found["footer"] = "true" }
    if props.spark != nil { found["spark"] = "true" }
    return found
  }

  static func glyph(_ direction: PMDeltaDirection) -> PMIconRole {
    switch direction {
    case .up: .up
    case .down: .down
    }
  }
}

/// Stat's states, from the spec's list of entries.
public struct StatStates: PMStates {
  public let member = "Stat"

  public init() {}

  private static let open = "Open tickets"
  private static let response = "First response"
  private static let plan = "Plan"
  private static let revenue = "Revenue"

  private func stat(
    _ label: String = Self.open, _ value: String = "128", icon: PMIconRole? = nil,
    delta: PMStatDelta? = nil, description: String? = nil, footer: PMStatFooter? = nil,
    loading: Bool? = nil, numeric: Bool? = nil, spark: [Double]? = nil,
    trend: PMStatTrend? = nil
  ) -> PMStat {
    PMStat(
      props: PMStatProps(
        delta: delta, description: description, footer: footer, icon: icon, label: label,
        loading: loading, numeric: numeric, spark: spark, trend: trend, value: value))
  }

  private static let falling: [Double] = [42, 40, 41, 38, 35, 36, 33, 31, 32, 29, 27, 26]
  private static let rising: [Double] = [180, 195, 190, 210, 220, 216, 240, 251, 248, 262, 270, 284]

  public var entries: [PMStateEntry] {
    let footer = PMStatFooter(
      primary: "Trending up this month", secondary: "Visitors for the last six months")
    let fewer = PMStatFooter(primary: "Fewer escalations", secondary: "Compared with last quarter")
    return [
      PMStateEntry("plain") { stat() },
      PMStateEntry("with icon") { stat(icon: .inbox) },
      PMStateEntry("delta up positive", expect: ["direction": "up", "positive": "true"]) {
        stat(Self.revenue, "$48,200", delta: PMStatDelta(value: "12%", direction: .up))
      },
      PMStateEntry("delta down positive", expect: ["direction": "down", "positive": "true"]) {
        stat(delta: PMStatDelta(value: "8", direction: .down, positive: true))
      },
      PMStateEntry("delta down negative", expect: ["direction": "down", "positive": "false"]) {
        stat(Self.revenue, "$41,900", delta: PMStatDelta(value: "4%", direction: .down))
      },
      PMStateEntry("delta up negative", expect: ["direction": "up", "positive": "false"]) {
        stat("Escalations", "17", delta: PMStatDelta(value: "4", direction: .up, positive: false))
      },
      PMStateEntry("description") { stat(description: "vs last week") },
      PMStateEntry("non-numeric") { stat(Self.plan, "Business", numeric: false) },
      PMStateEntry("trend up with a footer", expect: ["trend": "up", "footer": "true"]) {
        stat(
          Self.revenue, "$48,200", footer: footer,
          trend: PMStatTrend(direction: .up, label: "+12.5%"))
      },
      PMStateEntry("trend down with a footer", expect: ["trend": "down", "footer": "true"]) {
        stat(footer: fewer, trend: PMStatTrend(direction: .down, label: "-20%"))
      },
      PMStateEntry("footer without a trend", expect: ["footer": "true"]) { stat(footer: fewer) },
      PMStateEntry("trend without a footer", expect: ["trend": "up"]) {
        stat(Self.response, "2h 14m", trend: PMStatTrend(direction: .up, label: "4 fewer"))
      },
      PMStateEntry(
        "spark down beside a down-positive delta",
        expect: ["direction": "down", "positive": "true", "spark": "true"]
      ) {
        stat(
          Self.response, "26m", delta: PMStatDelta(value: "16m", direction: .down, positive: true),
          spark: Self.falling)
      },
      PMStateEntry("spark with the trend chip", expect: ["trend": "up", "spark": "true"]) {
        stat(
          Self.revenue, "$48,200", spark: Self.rising,
          trend: PMStatTrend(direction: .up, label: "+12.5%"))
      },
      PMStateEntry("spark alone", expect: ["spark": "true"]) { stat(spark: Self.rising) },
      PMStateEntry(
        "loading", expect: ["loading": "true", "label": "\(Self.response), \(PMStrings.loading)"]
      ) {
        stat(Self.response, "", icon: .time, loading: true)
      },
      PMStateEntry(
        "loading with a delta",
        expect: ["loading": "true", "label": "\(Self.revenue), \(PMStrings.loading)"]
      ) {
        stat(
          Self.revenue, "$48,200", delta: PMStatDelta(value: "12%", direction: .up), loading: true)
      },
      PMStateEntry(
        "loading with a trend, a spark and a footer",
        expect: ["loading": "true", "trend": "up", "footer": "true", "spark": "true"]
      ) {
        stat(
          Self.revenue, "$48,200", footer: footer, loading: true, spark: Self.rising,
          trend: PMStatTrend(direction: .up, label: "+12.5%"))
      },
    ]
  }
}
