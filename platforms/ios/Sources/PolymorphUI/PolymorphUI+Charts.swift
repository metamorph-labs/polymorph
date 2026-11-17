// The chart members' shared parts (`docs/charts.md`): the rows and their
// cells, the colours a series takes from the pairing's chart roles, the
// formatting every printed value goes through, the scale arithmetic Swift
// Charts does not do the web's way, the frame with its three states, the
// legend, the readout, the table twin, the axes, the annotations, the reading
// position a person walks, and the polar geometry RadarChart draws with.
//
// Swift Charts draws the marks, the axes and their gridlines, and lays out the
// plot. What it computes differently from the web's engine is ported here from
// `packages/engine/src/charts/`, so a chart on iOS shows the same numbers as on
// the web: the series' slots (`series.ts`), the stacks (`stackSegments`), the
// nice'd domains and their ticks (d3's `ticks` and `nice`), the histogram's
// bins (`binSample`), the heatmap's quantisation (`binOf`, `signedBinOf`), the
// funnel's shares, steps and fitting (`funnel-chart.ts`, with `thinLabels` and
// `estimateTextWidth`), the treemap's squarified tiling, gaps, targets and
// plates (`treemap.ts`) and the sentences (`format.ts`, `messages.ts`).

import Charts
import PolymorphTokens
import SwiftUI

// MARK: - Rows

/// A chart row's cell, written as a literal: `["channel": "Email", "tickets": 214]`.
extension PMChartValue: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral,
  ExpressibleByFloatLiteral
{
  public init(stringLiteral value: String) { self = .text(value) }
  public init(integerLiteral value: Int) { self = .number(Double(value)) }
  public init(floatLiteral value: Double) { self = .number(value) }
}

extension PMChartValue {
  /// The cell as a measure; `nil` for text and for a value that is not finite.
  var measure: Double? {
    if case .number(let value) = self, value.isFinite { return value }
    return nil
  }

  /// The cell as written: text as it is, a number in the shortest form that
  /// reads it back, as JavaScript's `String(n)` does.
  var written: String {
    switch self {
    case .text(let text): text
    case .number(let value):
      value.rounded() == value && abs(value) < 1e15 ? String(Int(value)) : String(value)
    }
  }
}

/// A chart row, the web's `ChartDatum`: each field a cell, `nil` a gap.
typealias PMChartRow = [String: PMChartValue?]

extension Dictionary where Key == String, Value == PMChartValue? {
  /// The cell at `key`; `nil` when the row has no such field or it is a gap.
  func pmCell(_ key: String) -> PMChartValue? { self[key] ?? nil }

  /// The measure at `key`; `nil` for a gap, which is never a zero.
  func pmMeasure(_ key: String) -> Double? { pmCell(key)?.measure }
}

// MARK: - Measures

/// The chart recipes' and the chart engine's numbers, which no pairing varies:
/// the web writes them as literals, so they are `PMRecipe`'s, read from there.
enum PMChartMetrics {
  /// A line's stroke, a band's edge and a polygon's (`line-chart.md`): 2px.
  static let stroke = PMRecipe.chartStroke
  /// A hairline: a gridline, the zero rule, an annotation (`bar-chart.md`).
  static let hairline = PMRecipe.chartHairline
  /// The surface gap between touching marks, never a stroke: 2px.
  static let gap = PMRecipe.chartGap
  /// A marker's radius, `MARKER_RADIUS`: an 8px dot.
  static let marker = PMRecipe.chartMarker
  static var markerDiameter: CGFloat { marker * 2 }
  /// Sparkline's end dot's radius (`sparkline.md`): a 6-point dot on the current value.
  static let endDot = PMRecipe.chartEndDot
  /// The surface ring around a marker, and its width while it is read.
  static let ring = PMRecipe.chartRing
  static let ringActive = PMRecipe.chartRingActive
  /// The data end's rounding, `BAR_END_RADIUS`.
  static let barEnd = PMRecipe.chartBarEnd
  /// The least hit area of a mark, `HIT_TARGET_MIN`, and a bubble's largest diameter.
  static let hitMinimum = PMRecipe.chartHitMinimum
  /// The dash of a reference line (`bar-chart.md`): 4 on, 4 off.
  static let dash: [CGFloat] = [PMRecipe.chartDash, PMRecipe.chartDash]
  /// A wash under a line or a band, in the series' paint.
  static let wash = PMRecipe.chartWash
  /// An annotation band's wash in `chart.other`.
  static let bandWash = PMRecipe.chartBandWash
  /// The opacity a mark eases to while another is read.
  static let lift = PMRecipe.chartLift
  /// The opacity of the previous frame while it refetches.
  static let refetch = PMRecipe.chartRefetch
  /// The share of a band a bar group may take; the rest, the engine's inner
  /// padding, stays empty.
  static var bandFill: CGFloat { 1 - PMRecipe.chartBandPadding }

  /// The frame's height (`chart-frame.module.css`): `PMRecipe.chartHeight…`
  /// `space-10` steps and one `space-8`, `space-7` or `space-8` more, which
  /// density scales.
  static func height(_ size: PMControlSize, _ space: PMSpace) -> CGFloat {
    switch size {
    case .sm: space.s10 * PMRecipe.chartHeightSm + space.s8
    case .md: space.s10 * PMRecipe.chartHeightMd + space.s7
    case .lg: space.s10 * PMRecipe.chartHeightLg + space.s8
    }
  }
}

// MARK: - Paint

/// A series as the chart paints it: the engine's `ResolvedSeries`.
struct PMChartPaint: Identifiable {
  let key: String
  let label: String
  var paint: PMDynamicColor
  let slot: PMChartSlot?
  let tone: PMSeriesTone?
  let icon: PMIconRole?
  /// Past the eighth seat, drawn in `chart.other`.
  let folded: Bool

  var id: String { key }
}

/// The pairing's chart roles, by the names the grammar uses.
enum PMChartPalette {
  static func slot(_ slot: PMChartSlot, _ chart: PMChart) -> PMDynamicColor {
    switch slot {
    case .slot1: chart.chart1
    case .slot2: chart.chart2
    case .slot3: chart.chart3
    case .slot4: chart.chart4
    case .slot5: chart.chart5
    case .slot6: chart.chart6
    case .slot7: chart.chart7
    case .slot8: chart.chart8
    }
  }

  /// A status-toned series takes the status family's solid fill.
  static func tone(_ tone: PMSeriesTone, _ colors: PMColors) -> PMDynamicColor {
    switch tone {
    case .success: colors.successSolid
    case .danger: colors.dangerSolid
    case .warning: colors.warningSolid
    case .info: colors.infoSolid
    }
  }

  /// A sequential step, 1 (nearest the surface) to 7.
  static func sequential(_ step: Int, _ chart: PMChart) -> PMDynamicColor {
    switch min(7, max(1, step)) {
    case 1: chart.seq1
    case 2: chart.seq2
    case 3: chart.seq3
    case 4: chart.seq4
    case 5: chart.seq5
    case 6: chart.seq6
    default: chart.seq7
    }
  }

  /// A diverging arm, `signedBinOf`'s signed step: `-3…-1` below zero, `0`
  /// for exactly zero (the mid), `1…3` above.
  static func diverging(_ arm: Int, _ chart: PMChart) -> PMDynamicColor {
    switch max(-3, min(3, arm)) {
    case -3: chart.neg3
    case -2: chart.neg2
    case -1: chart.neg1
    case 1: chart.pos1
    case 2: chart.pos2
    case 3: chart.pos3
    default: chart.mid
    }
  }

  /// The engine's `resolveSeries`: an explicit slot is honoured and reserves
  /// its seat, the rest take the free seats in declaration order, a tone wins
  /// over a slot, and a series past the eighth seat folds to `chart.other`.
  /// Colour follows the series, so hiding one never repaints another.
  static func series(_ series: [PMChartSeries], _ theme: PMTheme) -> [PMChartPaint] {
    var taken = Set(series.compactMap { $0.tone == nil ? $0.slot : nil })
    var next = PMChartSlot.allCases.makeIterator()
    func free() -> PMChartSlot? {
      while let slot = next.next() {
        if !taken.contains(slot) {
          taken.insert(slot)
          return slot
        }
      }
      return nil
    }
    return series.map { entry in
      if let tone = entry.tone {
        return PMChartPaint(
          key: entry.key, label: entry.label, paint: Self.tone(tone, theme.colors), slot: nil,
          tone: tone, icon: entry.icon, folded: false)
      }
      guard let slot = entry.slot ?? free() else {
        return PMChartPaint(
          key: entry.key, label: entry.label, paint: theme.chart.other, slot: nil, tone: nil,
          icon: entry.icon, folded: true)
      }
      return PMChartPaint(
        key: entry.key, label: entry.label, paint: Self.slot(slot, theme.chart), slot: slot,
        tone: nil, icon: entry.icon, folded: false)
    }
  }

  /// The engine's `emphasised`: one series keeps its paint and the rest take
  /// `chart.other`; a status-toned series keeps its colour, because reserved
  /// meaning is never greyed out.
  static func emphasised(_ series: [PMChartPaint], _ emphasis: String?, _ chart: PMChart)
    -> [PMChartPaint]
  {
    guard let emphasis else { return series }
    return series.map { entry in
      var entry = entry
      if entry.key != emphasis && entry.tone == nil { entry.paint = chart.other }
      return entry
    }
  }

  /// The engine's `divergingArms`: each series of a Likert stack takes an arm
  /// by its side of zero (from its first signed value) and its rank on that
  /// side in declaration order, clamped at arm 3. `nil` for a series with no
  /// signed value.
  static func arms(_ rows: [PMChartRow], _ keys: [String]) -> [Int?] {
    var positives = 0
    var negatives = 0
    return keys.map { key in
      guard let first = rows.lazy.compactMap({ $0.pmMeasure(key) }).first(where: { $0 != 0 })
      else { return nil }
      if first > 0 {
        positives += 1
        return min(3, positives)
      }
      negatives += 1
      return -min(3, negatives)
    }
  }
}

// MARK: - Text

/// Every string a chart prints, through one formatter, so the axis, the
/// readout, the spoken reading and the twin agree (the engine's `format.ts`).
/// Numbers and dates are the locale's; the quarter, which no formatter
/// writes, is the catalog's. The catalog's sentences are main-actor closures,
/// as every closure a member is handed is.
@MainActor
struct PMChartText {
  let locale: Locale
  let messages: PMChartMessages

  /// A number by a `ValueFormat`: `decimal` to three fraction digits, `compact`
  /// to one, `percent` (of a ratio) to none, `currency` the currency's own,
  /// unless `maximumFractionDigits` says otherwise.
  func number(_ value: Double, _ format: PMValueFormat?) -> String {
    Self.number(value, format, locale)
  }

  /// `number(_:_:)` off the main actor, for the audio graph's descriptions.
  nonisolated static func number(_ value: Double, _ format: PMValueFormat?, _ locale: Locale)
    -> String
  {
    guard value.isFinite else { return "" }
    let digits = format?.maximumFractionDigits.map { max(0, Int($0)) }
    switch format?.style {
    case .compact:
      return value.formatted(
        .number.locale(locale).notation(.compactName).precision(.fractionLength(0...(digits ?? 1))))
    case .percent:
      return value.formatted(
        .percent.locale(locale).precision(.fractionLength(0...(digits ?? 0))))
    case .currency:
      let currency = FloatingPointFormatStyle<Double>.Currency(
        code: format?.currency ?? PMChartText.defaultCurrency, locale: locale)
      return digits.map { value.formatted(currency.precision(.fractionLength($0))) }
        ?? value.formatted(currency)
    default:
      return value.formatted(.number.locale(locale).precision(.fractionLength(0...(digits ?? 3))))
    }
  }

  /// The currency a `currency` format without one names, as the web defaults it.
  nonisolated static let defaultCurrency = "USD"

  /// A cell as printed: a number by `format`; text as written, or as a date
  /// when the format's style is `date`. A gap is empty.
  func value(_ value: PMChartValue?, _ format: PMValueFormat?) -> String {
    switch value {
    case .none: return ""
    case .number(let number): return self.number(number, format)
    case .text(let text):
      guard format?.style == .date, let date = PMChartTime.parse(text) else { return text }
      return self.date(date, format?.granularity ?? .day)
    }
  }

  /// A date at a granularity; a quarter in the catalog's notation.
  func date(_ date: Date, _ granularity: PMDateGranularity) -> String {
    switch granularity {
    case .day, .week: date.formatted(.dateTime.month(.abbreviated).day().locale(locale))
    case .month: date.formatted(.dateTime.month(.abbreviated).locale(locale))
    case .year: date.formatted(.dateTime.year().locale(locale))
    case .quarter:
      messages.quarter(Double(Calendar(identifier: .gregorian).component(.month, from: date) - 1) / 3 + 1)
    }
  }

  /// The summary the plot speaks at rest: the catalog's sentence, then the
  /// activation hint when the chart has an `onSelect` (`spokenSummary`).
  func spoken(_ summary: String, selectable: Bool) -> String {
    selectable ? "\(summary) \(messages.activationHint)" : summary
  }
}

/// ISO-8601 values on a `time` axis.
enum PMChartTime {
  /// An ISO string as an instant. A date-only string is a calendar date, read
  /// at local midnight, never at UTC midnight, which would put every label a
  /// day early west of Greenwich; a timestamp keeps its offset.
  static func parse(_ text: String) -> Date? {
    let parts = text.split(separator: "-")
    if text.count == 10, parts.count == 3, let year = Int(parts[0]), let month = Int(parts[1]),
      let day = Int(parts[2])
    {
      return Calendar(identifier: .gregorian).date(
        from: DateComponents(year: year, month: month, day: day))
    }
    let precise = ISO8601DateFormatter()
    precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return precise.date(from: text) ?? ISO8601DateFormatter().date(from: text)
  }

  /// The granularity a tick step implies (`granularityFor`): each threshold
  /// sits below its unit's length, so a 28-day step is a month.
  static func granularity(step: TimeInterval) -> PMDateGranularity {
    let days = step / 86_400
    if days >= 300 { return .year }
    if days >= 80 { return .quarter }
    if days >= 27 { return .month }
    if days >= 6 { return .week }
    return .day
  }
}

// MARK: - Scales

/// d3's tick arithmetic (`d3-array`'s `ticks`, `tickIncrement` and `nice`),
/// which the engine's scales are built on: Swift Charts picks its own ticks,
/// so a domain and its gridlines are computed here and handed to it, and a
/// chart shows the web's ticks.
enum PMChartScale {
  private static let e10 = 50.0.squareRoot()
  private static let e5 = 10.0.squareRoot()
  private static let e2 = 2.0.squareRoot()

  private static func spec(_ start: Double, _ stop: Double, _ count: Double) -> (Double, Double, Double) {
    let step = (stop - start) / max(0, count)
    let power = (log10(step)).rounded(.down)
    let error = step / pow(10, power)
    let factor: Double = error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1
    var i1: Double
    var i2: Double
    var increment: Double
    if power < 0 {
      increment = pow(10, -power) / factor
      i1 = (start * increment).rounded()
      i2 = (stop * increment).rounded()
      if i1 / increment < start { i1 += 1 }
      if i2 / increment > stop { i2 -= 1 }
      increment = -increment
    } else {
      increment = pow(10, power) * factor
      i1 = (start / increment).rounded()
      i2 = (stop / increment).rounded()
      if i1 * increment < start { i1 += 1 }
      if i2 * increment > stop { i2 -= 1 }
    }
    if i2 < i1 && 0.5 <= count && count < 2 { return spec(start, stop, count * 2) }
    return (i1, i2, increment)
  }

  /// The step between ticks; negative for a step under one, as d3 writes it.
  static func increment(_ start: Double, _ stop: Double, _ count: Double) -> Double {
    spec(start, stop, count).2
  }

  /// About `count` clean values from `start` to `stop`.
  static func ticks(_ start: Double, _ stop: Double, _ count: Double) -> [Double] {
    guard count > 0, start.isFinite, stop.isFinite else { return [] }
    if start == stop { return [start] }
    let (low, high) = start < stop ? (start, stop) : (stop, start)
    let (i1, i2, increment) = spec(low, high, count)
    guard i2 >= i1, increment.isFinite else { return [] }
    let values = stride(from: i1, through: i2, by: 1).map {
      increment < 0 ? $0 / -increment : $0 * increment
    }
    return start < stop ? values : values.reversed()
  }

  /// The domain widened to clean ends, as a linear scale's `nice()`.
  static func nice(_ start: Double, _ stop: Double, _ count: Double) -> (Double, Double) {
    var start = start
    var stop = stop
    var previous: Double?
    for _ in 0..<16 {
      let step = increment(start, stop, count)
      if step == previous || step == 0 || !step.isFinite { break }
      if step > 0 {
        start = (start / step).rounded(.down) * step
        stop = (stop / step).rounded(.up) * step
      } else {
        start = (start * step).rounded(.up) / step
        stop = (stop * step).rounded(.down) / step
      }
      previous = step
    }
    return (start, stop)
  }

  /// A value axis's domain and ticks (the engine's `valueDomain` with
  /// `continuousScale`): the values' extent, anchored at zero when `zero`,
  /// nice'd to about `count` ticks. A flat or empty extent widens so a single
  /// value still has a position.
  static func value(_ values: [Double], zero: Bool, count: Double) -> PMChartDomain {
    var low = values.min() ?? 0
    var high = values.max() ?? 1
    if zero {
      low = min(0, low)
      high = max(0, high)
    }
    if low == high {
      if low == 0 { high = 1 } else if zero { low = min(0, low); high = max(0, high) } else {
        low -= abs(low) / 2
        high += abs(high) / 2
      }
    }
    let (start, stop) = nice(low, high, count)
    return PMChartDomain(lower: start, upper: stop, ticks: ticks(start, stop, count))
  }

  /// The engine's `binSample` (`d3-array`'s `bin`): Sturges' count (⌈log₂ n⌉ + 1)
  /// or `target`, thresholds on clean steps over the nice'd extent, every bin
  /// half-open but the last, which is closed, so the maximum falls in it.
  static func bins(_ sample: [Double], target: Double?) -> [(from: Double, to: Double, count: Int)] {
    let values = sample.filter(\.isFinite)
    guard let minimum = values.min(), let maximum = values.max() else { return [] }
    let count =
      target.map { max(1, $0.rounded(.down)) }
      ?? max(1, (log(Double(values.count)) / log(2)).rounded(.up) + 1)
    var (x0, x1) = nice(minimum, maximum, count)
    var thresholds = ticks(x0, x1, count)
    if let last = thresholds.last, last >= x1 {
      if maximum >= x1 {
        let step = increment(x0, x1, count)
        if step.isFinite && step > 0 {
          x1 = ((x1 / step).rounded(.down) + 1) * step
        } else if step.isFinite && step < 0 {
          x1 = ((x1 * -step).rounded(.up) + 1) / -step
        }
      } else {
        thresholds.removeLast()
      }
    }
    thresholds = thresholds.filter { $0 > x0 && $0 <= x1 }
    let edges = [x0] + thresholds + [x1]
    var counts = Array(repeating: 0, count: edges.count - 1)
    for value in values where value >= x0 && value <= x1 {
      let index = thresholds.filter { $0 <= value }.count
      counts[min(counts.count - 1, index)] += 1
    }
    return counts.indices.map { (edges[$0], edges[$0 + 1], counts[$0]) }
  }

  /// The heatmap's sequential step (`binOf`): equal-width bins over the extent,
  /// 0 to `count - 1`; a flat extent puts every value in the top bin.
  static func bin(_ value: Double, _ low: Double, _ high: Double, count: Int) -> Int {
    guard count > 1 else { return 0 }
    guard high > low else { return count - 1 }
    return min(count - 1, max(0, Int(((value - low) / (high - low) * Double(count)).rounded(.down))))
  }

  /// The diverging arm of a signed value (`signedBinOf`): three equal bins per
  /// side of a symmetric range, `0` for exactly zero, arm 1 for a value near it.
  static func signedBin(_ value: Double, amplitude: Double, arms: Int = 3) -> Int {
    guard value != 0, amplitude > 0, arms >= 1 else { return 0 }
    let share = min(1, abs(value) / amplitude)
    let step = min(arms, Int((share * Double(arms)).rounded(.down)) + 1)
    return value > 0 ? step : -step
  }
}

/// A value axis: its nice'd domain and the ticks its gridlines sit at.
struct PMChartDomain {
  let lower: Double
  let upper: Double
  let ticks: [Double]

  var range: ClosedRange<Double> { lower...max(upper, lower) }

  /// Whether the zero rule falls inside the plot.
  var holdsZero: Bool { lower <= 0 && upper >= 0 }
}

// MARK: - Stacks

/// One segment of a stack: its bounds in value space, and whether its source
/// value is present. A gap adds nothing to the total and draws nothing.
struct PMChartSegment {
  let from: Double
  let to: Double
  let present: Bool
}

/// The engine's `stackSegments`, over d3's offsets: `stacked` sums upward from
/// zero in declaration order, `percent` normalises each row to one
/// (`stackOffsetExpand`), and `diverging` stacks each sign outward from zero
/// (`stackOffsetDiverging`, the Likert form). Per series, per row.
enum PMChartStack {
  enum Mode { case stacked, percent, diverging }

  static func segments(_ rows: [PMChartRow], _ keys: [String], _ mode: Mode) -> [[PMChartSegment]] {
    var layers = Array(repeating: [PMChartSegment](), count: keys.count)
    for row in rows {
      let values = keys.map { row.pmMeasure($0) ?? 0 }
      let total = values.reduce(0, +)
      var positive = 0.0
      var negative = 0.0
      for (index, key) in keys.enumerated() {
        let present = row.pmMeasure(key) != nil
        var value = values[index]
        if mode == .percent { value = total == 0 ? 0 : value / total }
        let segment: PMChartSegment
        switch mode {
        case .stacked, .percent:
          segment = PMChartSegment(from: positive, to: positive + value, present: present)
          positive += value
        case .diverging:
          if value > 0 {
            segment = PMChartSegment(from: positive, to: positive + value, present: present)
            positive += value
          } else if value < 0 {
            segment = PMChartSegment(from: negative + value, to: negative, present: present)
            negative += value
          } else {
            segment = PMChartSegment(from: 0, to: 0, present: present)
          }
        }
        layers[index].append(segment)
      }
    }
    return layers
  }

  /// Whether the series hold values on both sides of zero (`hasMixedSigns`).
  static func mixedSigns(_ rows: [PMChartRow], _ keys: [String]) -> Bool {
    let values = rows.flatMap { row in keys.compactMap { row.pmMeasure($0) } }
    return values.contains { $0 > 0 } && values.contains { $0 < 0 }
  }
}

// MARK: - The x axis

/// What a cartesian member's x axis holds, read from its rows by its scale.
enum PMChartAxisKind {
  case band
  case time
  case linear
}

extension PMChartXAxis {
  /// The scale the axis takes: the prop's, or `fallback`, the member's default.
  func kind(_ fallback: PMChartAxisKind = .band) -> PMChartAxisKind {
    switch scale {
    case .band: .band
    case .time: .time
    case .linear: .linear
    case .none: fallback
    }
  }
}

/// The bands of an x axis, in first-seen order: the rows render in the order
/// given, and the chart never reorders.
enum PMChartBands {
  static func of(_ rows: [PMChartRow], _ key: String) -> [String] {
    var seen = Set<String>()
    return rows.compactMap { row in
      let band = row.pmCell(key)?.written ?? ""
      return seen.insert(band).inserted ? band : nil
    }
  }
}

// MARK: - Continuous x

extension PMChartXAxis {
  /// The scale the axis takes when the prop names none (`inferScale`): `time`
  /// when every value is an ISO date, `band` otherwise.
  func kind(inferredFrom rows: [PMChartRow]) -> PMChartAxisKind {
    if let scale { return kind(scale == .time ? .time : scale == .linear ? .linear : .band) }
    let texts = rows.compactMap { row -> String? in
      if case .text(let text) = row.pmCell(key) { return text }
      return nil
    }
    return !texts.isEmpty && texts.allSatisfy({ PMChartTime.parse($0) != nil }) ? .time : .band
  }
}

/// A cartesian member's x values, read once from its rows by the axis's
/// scale: each row's band, date or number, its printed label, and its
/// x-domain value, which the brush sorts by and the sync registry broadcasts.
@MainActor
struct PMChartXValues {
  let kind: PMChartAxisKind
  let bands: [String]
  let dates: [Date?]
  let numbers: [Double?]
  /// Each row's x as the readout, the spoken reading and the twin print it.
  let labels: [String]
  /// Seconds since 1970 on a time axis, the value on a linear one, the row's
  /// index on a band.
  let domainValues: [Double?]
  /// The date granularity of the labels on a time axis.
  let granularity: PMDateGranularity

  init(rows: [PMChartRow], x: PMChartXAxis, kind: PMChartAxisKind, text: PMChartText) {
    let cells = rows.map { $0.pmCell(x.key) }
    self.kind = kind
    bands = cells.map { $0?.written ?? "" }
    dates = cells.map { cell in
      if case .text(let value) = cell { return PMChartTime.parse(value) }
      return nil
    }
    numbers = cells.map { $0?.measure }
    let found = dates.compactMap { $0 }
    let span = (found.max() ?? .distantPast).timeIntervalSince(found.min() ?? .distantPast)
    let step = found.count > 1 ? span / Double(found.count - 1) : 86_400
    granularity = x.format?.granularity ?? PMChartTime.granularity(step: step)
    switch kind {
    case .band:
      labels = cells.map { text.value($0, x.format) }
      domainValues = rows.indices.map { Double($0) }
    case .time:
      let granularity = granularity
      labels = zip(cells, dates).map { cell, date in
        date.map { text.date($0, granularity) } ?? text.value(cell, x.format)
      }
      domainValues = dates.map { $0?.timeIntervalSince1970 }
    case .linear:
      labels = cells.map { text.value($0, x.format) }
      domainValues = numbers
    }
  }

  /// The row whose x-domain value is nearest `value` (`syncIndexOf`).
  func nearest(_ value: Double) -> Int? {
    domainValues.indices
      .compactMap { index in domainValues[index].map { (index, abs($0 - value)) } }
      .min { $0.1 < $1.1 }?.0
  }

  /// The two rows a brush spans, sorted by their x-domain values, as the web
  /// reports them (`brushValues`): the rows' own ISO strings on a time axis,
  /// their numbers on a linear one.
  func range(_ anchor: Int, _ edge: Int, rows: [PMChartRow], key: String) -> PMChartBrushRange? {
    let sorted = [anchor, edge].sorted { (domainValues[$0] ?? 0) < (domainValues[$1] ?? 0) }
    let (low, high) = (sorted[0], sorted[1])
    switch kind {
    case .time:
      return .time((rows[low].pmCell(key)?.written ?? "", rows[high].pmCell(key)?.written ?? ""))
    case .linear:
      return .linear((numbers[low] ?? 0, numbers[high] ?? 0))
    case .band:
      return nil
    }
  }
}

/// The registry `syncId` links sibling charts through (`sync.ts`): no
/// provider, one reading per group, which is the x-domain value, never a row
/// index, so a daily and a weekly chart share a reading. Each chart maps it to
/// its own nearest row; Escape clears the whole group.
@MainActor
@Observable
final class PMChartSync {
  static let shared = PMChartSync()
  private var values: [String: Double] = [:]

  func value(_ group: String) -> Double? { values[group] }

  func publish(_ group: String, _ value: Double?) { values[group] = value }
}

/// The brush (`brush.ts`): the row it started from and the row it reaches
/// while Shift and an arrow extend it.
struct PMChartBrush: Equatable {
  var anchor: Int
  var edge: Int
}

// MARK: - Reading

/// Where a reader is: a position along the chart's walk, and the series at
/// it. `onSeries` is set once the reader walks the series at a position, so
/// what they hear leads with that series' mark.
struct PMChartReading: Equatable {
  var index: Int
  var series: Int = 0
  var onSeries = false
}

/// A key a reader presses on the plot, or the adjustment VoiceOver makes.
enum PMChartKey {
  case next, previous, up, down
  /// Shift with an arrow: extend the brush.
  case extendNext, extendPrevious
  case activate, escape
}

/// The plot as one focus stop (`docs/charts.md`, reading position): one
/// element named by the chart's label, whose value is the reading where the
/// reader is, and the summary sentence when they are nowhere. Arrow keys and
/// VoiceOver's adjustments walk it, Return or Space and VoiceOver's activation
/// call `onSelect` at it, Escape clears it. Each member decides what a key does
/// (`handle`); a plot without positions takes no keys.
struct PMChartPlotSurface: ViewModifier {
  let label: String
  let spoken: String
  let selectable: Bool
  let interactive: Bool
  let descriptor: PMChartDescriptor?
  let handle: (PMChartKey) -> Void

  func body(content: Content) -> some View {
    PMChartPlotFocus(interactive: interactive, handle: handle) {
      content.modifier(PMChartAudioGraph(descriptor: descriptor))
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(label))
    .accessibilityValue(Text(spoken))
    .accessibilityAddTraits(.isImage)
    .modifier(PMChartAdjustable(interactive: interactive, selectable: selectable, handle: handle))
  }
}

/// The plot's keyboard focus, its ring and its keys. It is a view, not a
/// modifier, because SwiftUI reads a `FocusState` only in a view's body.
private struct PMChartPlotFocus<Plot: View>: View {
  @Environment(\.pmTheme) private var theme
  @FocusState private var focused: Bool
  let interactive: Bool
  let handle: (PMChartKey) -> Void
  @ViewBuilder let plot: () -> Plot

  var body: some View {
    plot()
      .focusable(interactive)
      .focused($focused)
      .focusEffectDisabled()
      .pmFocusRing(focused, cornerRadius: theme.radius.md)
      .onKeyPress(phases: .down) { press in
        guard interactive, let key = key(press) else { return .ignored }
        handle(key)
        return .handled
      }
  }

  private func key(_ press: KeyPress) -> PMChartKey? {
    let shift = press.modifiers.contains(.shift)
    switch press.key {
    case .rightArrow: return shift ? .extendNext : .next
    case .leftArrow: return shift ? .extendPrevious : .previous
    case .upArrow: return .up
    case .downArrow: return .down
    case .escape: return .escape
    case .return, .space: return .activate
    default: return nil
    }
  }
}

/// VoiceOver's half of the reading: a swipe up or down walks it, a double tap
/// activates it when the chart has an `onSelect`, and the escape gesture
/// clears it.
private struct PMChartAdjustable: ViewModifier {
  let interactive: Bool
  let selectable: Bool
  let handle: (PMChartKey) -> Void

  func body(content: Content) -> some View {
    if interactive {
      content
        .accessibilityAdjustableAction { direction in
          switch direction {
          case .increment: handle(.next)
          case .decrement: handle(.previous)
          @unknown default: break
          }
        }
        .accessibilityAction(.escape) { handle(.escape) }
        .modifier(PMChartActivation(selectable: selectable, handle: handle))
    } else {
      content
    }
  }
}

/// The audio graph, when the chart has data to play.
private struct PMChartAudioGraph: ViewModifier {
  let descriptor: PMChartDescriptor?

  func body(content: Content) -> some View {
    if let descriptor {
      content.accessibilityChartDescriptor(descriptor)
    } else {
      content
    }
  }
}

private struct PMChartActivation: ViewModifier {
  let selectable: Bool
  let handle: (PMChartKey) -> Void

  func body(content: Content) -> some View {
    if selectable {
      content.accessibilityAction { handle(.activate) }
    } else {
      content
    }
  }
}

extension View {
  /// Makes the view the chart's plot: one focus stop the reader walks.
  func pmChartPlot(
    label: String, spoken: String, selectable: Bool, interactive: Bool,
    descriptor: PMChartDescriptor? = nil, handle: @escaping (PMChartKey) -> Void
  ) -> some View {
    modifier(
      PMChartPlotSurface(
        label: label, spoken: spoken, selectable: selectable, interactive: interactive,
        descriptor: descriptor, handle: handle))
  }
}

extension View {
  /// Makes the view a chart's plot whose marks are accessibility elements of
  /// their own, as Swift Charts exposes each mark: VoiceOver finds them one by
  /// one, and the audio graph is the container's. The keyboard has the one
  /// focus stop `pmChartPlot` gives, which the arrows walk.
  func pmChartMarks(
    label: String, interactive: Bool, descriptor: PMChartDescriptor? = nil,
    handle: @escaping (PMChartKey) -> Void
  ) -> some View {
    PMChartPlotFocus(interactive: interactive, handle: handle) {
      modifier(PMChartAudioGraph(descriptor: descriptor))
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(label))
  }
}

extension PMChartReading {
  /// The walk along one axis of `count` positions, wrapping at neither end:
  /// the first press lands on the first position.
  static func step(_ reading: PMChartReading?, by delta: Int, count: Int) -> PMChartReading? {
    guard count > 0 else { return nil }
    guard let reading else { return PMChartReading(index: delta < 0 ? count - 1 : 0) }
    return PMChartReading(
      index: min(count - 1, max(0, reading.index + delta)), series: reading.series)
  }

  /// The walk across `count` series at the same position.
  static func walkSeries(_ reading: PMChartReading?, by delta: Int, count: Int) -> PMChartReading? {
    guard count > 1, let reading else { return reading }
    return PMChartReading(
      index: reading.index, series: min(count - 1, max(0, reading.series + delta)),
      onSeries: true)
  }
}

// MARK: - The audio graph

/// The chart as an audio graph (`AXChartDescriptorRepresentable`), which
/// VoiceOver plays as tones and reads point by point: the series' values over
/// the chart's axes, each printed as the twin prints it.
struct PMChartDescriptor: AXChartDescriptorRepresentable {
  struct Series {
    let name: String
    /// A line or an area is continuous; bars and points are not.
    let continuous: Bool
    /// Each point's band (for a band axis) or position, and its value.
    let points: [(band: String?, x: Double, y: Double)]
  }

  let title: String
  let summary: String
  let xTitle: String
  /// The bands in order, for a band axis; `nil` on a continuous one.
  let bands: [String]?
  let xRange: ClosedRange<Double>
  let xFormat: PMValueFormat?
  let yTitle: String
  let yRange: ClosedRange<Double>
  let yFormat: PMValueFormat?
  let locale: Locale
  let series: [Series]

  func makeChartDescriptor() -> AXChartDescriptor {
    let (locale, xFormat, yFormat) = (locale, xFormat, yFormat)
    let xAxis: any AXDataAxisDescriptor =
      bands.map { AXCategoricalDataAxisDescriptor(title: xTitle, categoryOrder: $0) }
      ?? AXNumericDataAxisDescriptor(title: xTitle, range: xRange, gridlinePositions: []) {
        PMChartText.number($0, xFormat, locale)
      }
    let yAxis = AXNumericDataAxisDescriptor(title: yTitle, range: yRange, gridlinePositions: []) {
      PMChartText.number($0, yFormat, locale)
    }
    return AXChartDescriptor(
      title: title, summary: summary, xAxis: xAxis, yAxis: yAxis, additionalAxes: [],
      series: series.map { entry in
        AXDataSeriesDescriptor(
          name: entry.name, isContinuous: entry.continuous,
          dataPoints: entry.points.map { point in
            point.band.map { AXDataPoint(x: $0, y: point.y) } ?? AXDataPoint(x: point.x, y: point.y)
          })
      })
  }
}

// MARK: - The frame

/// What the frame shows (the engine's `chartState`): the marks, the previous
/// frame dimmed or a quiet skeleton while loading, or the member's sentence
/// when there is no data. Loading wins over empty.
enum PMChartState: String {
  case ready, loading, empty

  init(empty: Bool, loading: Bool?) {
    self = loading == true ? .loading : empty ? .empty : .ready
  }
}

/// The frame every chart member but Sparkline draws (`chart-frame.module.css`):
/// chromeless, because a Card or a Dashboard panel is the surface; the plot
/// region at the size's height, which includes the x axis, so a chart never
/// scrolls; the legend below it; the twin's toggle at the end. The root
/// carries the member's identity and contains the plot, the legend's keys and
/// the twin.
struct PMChartFrame<Plot: View, Legend: View>: View {
  @Environment(\.pmTheme) private var theme
  let member: String
  let label: String
  let size: PMControlSize
  let state: PMChartState
  let attributes: [String: String]
  /// The sentence an empty plot shows.
  let empty: String
  let twin: PMChartTwinModel
  let messages: PMChartMessages
  @ViewBuilder let plot: () -> Plot
  @ViewBuilder let legend: () -> Legend

  var body: some View {
    let space = theme.defaultDensity.space
    VStack(alignment: .leading, spacing: space.s4) {
      ZStack {
        switch state {
        case .empty:
          Text(empty)
            .pmTextStyle(theme.text.sm)
            .foregroundStyle(theme.colors.textMuted.color)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityHidden(true)
        case .loading, .ready:
          plot()
            .opacity(state == .loading ? PMChartMetrics.refetch : 1)
            .animation(
              theme.defaultMotion.easing.enter.animation(
                duration: theme.defaultMotion.duration.surface),
              value: state)
        }
      }
      .frame(maxWidth: .infinity)
      .frame(height: PMChartMetrics.height(size, space))
      legend()
      PMChartTwin(label: label, model: twin, messages: messages)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(label))
    .pmMember(member, frameAttributes)
  }

  private var frameAttributes: [String: String] {
    var found = attributes
    found["size"] = size.rawValue
    if state != .ready { found["state"] = state.rawValue }
    return found
  }
}

/// The quiet first load: a skeleton the plot's size, as the frame holds the
/// layout until the marks arrive.
struct PMChartSkeleton: View {
  var body: some View {
    PMSkeleton(props: PMSkeletonProps(shape: .rect, width: .full))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// MARK: - The legend

/// The legend (`chart-legend.module.css`), derived, never a prop: two or more
/// series get one, below the plot. Each key matches the mark: a square for a
/// fill, a short line for a stroke. With `onToggle`, each key is a button that
/// hides and shows its series, selected while the series shows (the web's
/// `aria-pressed`); a hidden key is hollow, a ring in `chart.other` with its
/// label muted, so its state is shown by shape, not colour alone.
struct PMChartLegend: View {
  @Environment(\.pmTheme) private var theme
  enum Shape { case rect, line }

  let series: [PMChartPaint]
  let shape: Shape
  /// The series drawn as lines in a plot of fills (BarChart's `lines`): their keys are lines.
  var lineKeys: Set<String> = []
  var hidden: Set<String> = []
  var onToggle: ((String) -> Void)?

  var body: some View {
    let space = theme.defaultDensity.space
    // A key that is a button is a hit target tall, which already parts its
    // line from the next by more than the legend's `space-3`.
    PMFlowLayout(spacing: space.s5, lineSpacing: onToggle == nil ? space.s3 : space.s0) {
      ForEach(series) { entry in
        let shown = !hidden.contains(entry.key)
        if let onToggle {
          Button {
            onToggle(entry.key)
          } label: {
            key(entry, shown: shown).pmHitTarget()
          }
          .buttonStyle(.plain)
          .fixedSize()
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(entry.label))
          .accessibilityAddTraits(shown ? [.isButton, .isSelected] : .isButton)
          .pmMember("ChartLegend", ["part": "key", "pressed": String(shown)])
        } else {
          key(entry, shown: true).fixedSize()
        }
      }
    }
  }

  private func key(_ entry: PMChartPaint, shown: Bool) -> some View {
    let space = theme.defaultDensity.space
    return HStack(spacing: space.s2) {
      Group {
        switch lineKeys.contains(entry.key) ? .line : shape {
        case .rect:
          RoundedRectangle(cornerRadius: theme.radius.sm)
            .fill(shown ? entry.paint.color : .clear)
            .overlay {
              if !shown {
                RoundedRectangle(cornerRadius: theme.radius.sm)
                  .strokeBorder(theme.chart.other.color, lineWidth: PMChartMetrics.hairline)
              }
            }
            .frame(width: space.s3, height: space.s3)
        case .line:
          Capsule()
            .fill(shown ? entry.paint.color : .clear)
            .overlay {
              if !shown {
                Capsule().strokeBorder(theme.chart.other.color, lineWidth: PMChartMetrics.hairline)
              }
            }
            .frame(width: space.s4, height: PMChartMetrics.stroke)
        }
      }
      .accessibilityHidden(true)
      if let icon = entry.icon {
        PMIconView(icon, size: .sm).foregroundStyle(theme.colors.textMuted.color)
      }
      Text(entry.label)
        .foregroundStyle(shown ? theme.colors.textSecondary.color : theme.colors.textMuted.color)
    }
    .pmTextStyle(theme.text.sm)
  }
}

// MARK: - The readout

/// One row of the readout: the series' key, its value and its label.
struct PMChartReadoutRow: Identifiable {
  let key: String
  let label: String
  let value: String
  let paint: PMDynamicColor

  var id: String { key }
}

/// How the readout is drawn (`ChartTooltipConfig`): on with dots by default;
/// `.off` removes the visual layer only, so the spoken reading and the twin stay.
struct PMChartTooltipStyle {
  let visible: Bool
  let indicator: PMTooltipIndicator
  let hideLabel: Bool

  init(_ tooltip: PMChartTooltip?) {
    switch tooltip {
    case .off:
      (visible, indicator, hideLabel) = (false, .dot, false)
    case .config(let config):
      (visible, indicator, hideLabel) = (true, config.indicator ?? .dot, config.hideLabel ?? false)
    case .none:
      (visible, indicator, hideLabel) = (true, .dot, false)
    }
  }
}

/// The readout at the reading position (`chart-tooltip.module.css`): inside
/// the plot, not an overlay, and hidden from assistive technology, because the
/// plot's value says the same. The header names the position; each row leads
/// with the value in `text.primary`, then the series in `text.secondary`.
struct PMChartReadout: View {
  @Environment(\.pmTheme) private var theme
  let header: String?
  let rows: [PMChartReadoutRow]
  let style: PMChartTooltipStyle

  var body: some View {
    let space = theme.defaultDensity.space
    let shape = RoundedRectangle(cornerRadius: theme.radius.md)
    VStack(alignment: .leading, spacing: space.s2) {
      if let header, !style.hideLabel {
        Text(header)
          .pmTextStyle(theme.text.xs)
          .foregroundStyle(theme.colors.textSecondary.color)
      }
      VStack(alignment: .leading, spacing: space.s1) {
        ForEach(rows) { row in
          HStack(alignment: .firstTextBaseline, spacing: space.s2) {
            Group {
              switch style.indicator {
              case .dot:
                Circle().fill(row.paint.color).frame(width: space.s2, height: space.s2)
              case .line:
                Rectangle().fill(row.paint.color)
                  .frame(width: space.s3, height: PMChartMetrics.stroke)
              }
            }
            .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] }
            Text(row.value)
              .foregroundStyle(theme.colors.textPrimary.color)
              .pmTabularFigures(theme.numeric.tabular)
            Text(row.label)
              .foregroundStyle(theme.colors.textSecondary.color)
          }
          .pmTextStyle(theme.text.sm)
        }
      }
    }
    .fixedSize()
    .padding(space.s3)
    .background(theme.colors.bgOverlay.color, in: shape)
    .overlay { shape.strokeBorder(theme.colors.borderDefault.color, lineWidth: PMChartMetrics.hairline) }
    .pmShadow(theme.shadows.transient)
    .accessibilityHidden(true)
  }
}

/// Places a readout beside a point, opening toward the point's leading or
/// trailing side and centred on it vertically, then kept inside the space it
/// is offered, so a readout by a mark near an edge slides in rather than
/// leaving the chart.
struct PMChartAnchor: Layout {
  let point: CGPoint
  let opensLeading: Bool

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    proposal.replacingUnspecifiedDimensions()
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    guard let view = subviews.first else { return }
    let size = view.sizeThatFits(.unspecified)
    let x = bounds.minX + (opensLeading ? point.x - size.width : point.x)
    let y = bounds.minY + point.y - size.height / 2
    view.place(
      at: CGPoint(
        x: min(max(bounds.minX, x), max(bounds.minX, bounds.maxX - size.width)),
        y: min(max(bounds.minY, y), max(bounds.minY, bounds.maxY - size.height))),
      anchor: .topLeading, proposal: ProposedViewSize(size))
  }
}

/// What a reader hears at a position (`announcement`, `seriesAnnouncement`):
/// a sentence, not the readout's layout.
enum PMChartSpoken {
  static func reading(_ header: String, _ rows: [PMChartReadoutRow]) -> String {
    guard !rows.isEmpty else { return "" }
    let values = rows.map { "\($0.label) \($0.value)" }.joined(separator: ", ")
    return header.isEmpty ? values : "\(header): \(values)"
  }

  /// One mark, first, and its band last, for a reader walking the series.
  static func mark(_ header: String, _ row: PMChartReadoutRow) -> String {
    let lead = "\(row.label): \(row.value)"
    return header.isEmpty ? lead : "\(lead) — \(header)"
  }
}

// MARK: - The twin

/// The twin's columns and rows, every cell formatted as the readout prints it.
struct PMChartTwinModel {
  struct Column {
    let label: String
    var numeric = false
  }

  let columns: [Column]
  let rows: [[String]]
}

/// The table twin (`chart-twin.module.css`): mandatory anatomy, the relief
/// channel the palette laws rely on. A ghost icon-only button at the frame's
/// end shows and hides a real `Table` of every value, so nothing is reachable
/// only by touch. The chart owns whether it is open, because that is the
/// reader's choice. An absent value shows an em dash, never a blank.
struct PMChartTwin: View {
  @Environment(\.pmTheme) private var theme
  @State private var open = false
  let label: String
  let model: PMChartTwinModel
  let messages: PMChartMessages

  var body: some View {
    let name = messages.tableLabel(label)
    VStack(alignment: .trailing, spacing: theme.defaultDensity.space.s3) {
      PMButton(
        props: PMButtonProps(
          icon: .table, iconOnly: true,
          label: open ? messages.hideTable(label) : messages.showTable(label),
          onClick: { open.toggle() }, size: .sm, appearance: .ghostNeutral))
      if open {
        PMTable(
          props: PMTableProps(
            caption: name,
            children: AnyView(
              Group {
                PMTable.Row(
                  props: PMTableRowProps(
                    children: AnyView(
                      ForEach(Array(model.columns.enumerated()), id: \.offset) { _, column in
                        PMTable.Header(
                          props: PMTableHeaderProps(
                            children: AnyView(Text(column.label)), numeric: column.numeric))
                      })))
                ForEach(Array(model.rows.enumerated()), id: \.offset) { _, row in
                  PMTable.Row(
                    props: PMTableRowProps(
                      children: AnyView(
                        ForEach(Array(row.enumerated()), id: \.offset) { at, cell in
                          PMTable.Cell(
                            props: PMTableCellProps(
                              children: AnyView(Text(cell.isEmpty ? "—" : cell)),
                              numeric: model.columns.indices.contains(at)
                                && model.columns[at].numeric))
                        })))
                }
              }),
            label: name))
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .frame(maxWidth: .infinity, alignment: .trailing)
  }
}

extension PMChartTwinModel {
  /// A series chart's twin (`twinColumns`, `twinRows`): the x column, then one
  /// per series, every series whether shown or hidden, because the twin never
  /// hides data.
  @MainActor
  static func series(
    x: PMChartXAxis, categories: [String], rows: [PMChartRow], series: [PMChartPaint],
    format: PMValueFormat?, text: PMChartText
  ) -> PMChartTwinModel {
    PMChartTwinModel(
      columns: [Column(label: x.label ?? columnName(x.key))]
        + series.map { Column(label: $0.label, numeric: true) },
      rows: rows.enumerated().map { index, row in
        [categories.indices.contains(index) ? categories[index] : ""]
          + series.map { entry in row.pmMeasure(entry.key).map { text.number($0, format) } ?? "" }
      })
  }

  /// A field name as a heading when the axis has no label (`columnName`):
  /// `firstResponse` is `First response`. The fix is a label on the axis.
  static func columnName(_ key: String) -> String {
    var spaced = ""
    var previous: Character?
    for character in key {
      if character == "_" || character == "-" {
        spaced.append(" ")
      } else {
        if character.isUppercase, let previous, previous.isLowercase || previous.isNumber {
          spaced.append(" ")
        }
        spaced.append(character)
      }
      previous = character
    }
    let lowered = spaced.lowercased()
    return lowered.prefix(1).uppercased() + lowered.dropFirst()
  }
}

// MARK: - Axes

/// A tick's text (`chart-axis.module.css`): `text.xs`, `text.muted`, tabular
/// figures, so a column of figures lines up.
struct PMChartTick: View {
  @Environment(\.pmTheme) private var theme
  let text: String

  init(_ text: String) {
    self.text = text
  }

  var body: some View {
    Text(text)
      .pmTextStyle(theme.text.xs)
      .foregroundStyle(theme.colors.textMuted.color)
      .pmTabularFigures(theme.numeric.tabular)
      .lineLimit(1)
      .fixedSize()
  }
}

enum PMChartAxes {
  /// The value axis: a hairline gridline in `chart.grid` at each tick, and the
  /// tick's figure, at the plot's leading edge when the values run up it, as
  /// the web's y column does. The axis draws no line; the zero rule is a mark.
  static func value(
    _ domain: PMChartDomain, _ grid: PMDynamicColor, vertical: Bool = true,
    label: @escaping (Double) -> String
  ) -> some AxisContent {
    AxisMarks(position: vertical ? .leading : .bottom, values: domain.ticks) { value in
      AxisGridLine(stroke: StrokeStyle(lineWidth: PMChartMetrics.hairline))
        .foregroundStyle(grid.color)
      AxisValueLabel {
        if let number = value.as(Double.self) { PMChartTick(label(number)) }
      }
    }
  }

  /// A band axis: each band's label, centred on it, never rotated; labels
  /// that would collide are thinned, as the web's `thinLabels` does.
  ///
  /// On a vertical band axis (a horizontal BarChart's names, a heatmap's rows)
  /// the labels sit in the leading gutter when `gutter` is set; otherwise Swift
  /// Charts may set each above its band inside the plot when the names are
  /// long, which keeps a long name whole on a phone's width.
  static func band(
    _ bands: [String], vertical: Bool = true, gutter: Bool = false,
    label: @escaping (String) -> String
  ) -> some AxisContent {
    AxisMarks(
      preset: gutter ? .aligned : .automatic, position: vertical ? .bottom : .leading, values: bands
    ) { value in
      AxisValueLabel(collisionResolution: .greedy, orientation: .horizontal) {
        if let band = value.as(String.self) { PMChartTick(label(band)) }
      }
    }
  }

  /// A continuous x axis, by its own ticks and no gridlines: x is not a value
  /// axis. Each label is centred under its tick, as the web's are.
  static func continuous(_ ticks: [Double], label: @escaping (Double) -> String) -> some AxisContent {
    AxisMarks(values: ticks) { value in
      AxisValueLabel(anchor: .top, collisionResolution: .greedy, orientation: .horizontal) {
        if let number = value.as(Double.self) { PMChartTick(label(number)) }
      }
    }
  }

  /// A time axis: about `count` dates, each at the granularity its step implies.
  static func time(_ count: Int, label: @escaping (Date) -> String) -> some AxisContent {
    AxisMarks(values: .automatic(desiredCount: count)) { value in
      AxisValueLabel(anchor: .top, collisionResolution: .greedy, orientation: .horizontal) {
        if let date = value.as(Date.self) { PMChartTick(label(date)) }
      }
    }
  }

  /// The value gridlines on both axes of a scatter, whose two axes are both value axes.
  static func both(
    _ ticks: [Double], _ grid: PMDynamicColor, vertical: Bool, label: @escaping (Double) -> String
  ) -> some AxisContent {
    AxisMarks(position: vertical ? .leading : .bottom, values: ticks) { value in
      AxisGridLine(stroke: StrokeStyle(lineWidth: PMChartMetrics.hairline))
        .foregroundStyle(grid.color)
      AxisValueLabel(
        anchor: vertical ? nil : .top, collisionResolution: .greedy, orientation: .horizontal
      ) {
        if let number = value.as(Double.self) { PMChartTick(label(number)) }
      }
    }
  }
}

// MARK: - Marks the members share

/// A marker (`line-chart.md`): an 8pt dot in the series' paint inside a 2pt
/// ring of `bg.surface`, so it stays legible where lines cross; the ring
/// thickens while the marker is read.
struct PMChartMarker: View {
  @Environment(\.pmTheme) private var theme
  let paint: PMDynamicColor
  var diameter: CGFloat = PMChartMetrics.markerDiameter
  var active = false

  var body: some View {
    let ring = active ? PMChartMetrics.ringActive : PMChartMetrics.ring
    Circle()
      .fill(paint.color)
      .frame(width: diameter, height: diameter)
      .padding(ring)
      .background(Circle().fill(theme.colors.bgSurface.color))
  }
}

/// The annotation layer (`chart-annotations.module.css`): a line is a dashed
/// hairline in `chart.axis` with its label in `text.xs` `text.muted` at the
/// plot's end; a band is washed in `chart.other` at 0.08 between hairline
/// edges; a point is a marker in `chart.axis` with its label. An annotation
/// never moves the centre of the diverging colours.
struct PMChartAnnotationLayer {
  let annotations: [PMChartAnnotation]
  let theme: PMTheme
  /// The axis the values are on: `y` for a vertical value axis, `x` for a horizontal one.
  var horizontalValues = false

  @ChartContentBuilder
  func wash() -> some ChartContent {
    ForEach(Array(annotations.enumerated()), id: \.offset) { _, annotation in
      if case .band(let band) = annotation {
        if horizontalValues {
          RectangleMark(xStart: .value(band.label ?? "", band.from), xEnd: .value(band.label ?? "", band.to))
            .foregroundStyle(theme.chart.other.color.opacity(PMChartMetrics.bandWash))
        } else {
          RectangleMark(yStart: .value(band.label ?? "", band.from), yEnd: .value(band.label ?? "", band.to))
            .foregroundStyle(theme.chart.other.color.opacity(PMChartMetrics.bandWash))
        }
      }
    }
  }

  @ChartContentBuilder
  func ink() -> some ChartContent {
    ForEach(Array(annotations.enumerated()), id: \.offset) { _, annotation in
      if case .line(let line) = annotation {
        rule(line.value, label: line.label, dashed: true)
      } else if case .band(let band) = annotation {
        rule(band.from, label: nil, dashed: false)
        rule(band.to, label: band.label, dashed: false)
      }
    }
  }

  /// The point annotations, each at its place: `x` maps the annotation's x
  /// through the member's own axis, and a point it cannot place is not drawn.
  @ChartContentBuilder
  func points<X: Plottable>(_ x: @escaping (PMChartValue) -> X?) -> some ChartContent {
    ForEach(Array(annotations.enumerated()), id: \.offset) { _, annotation in
      if case .point(let point) = annotation, let at = x(point.x) {
        PointMark(x: .value(point.label, at), y: .value(point.label, point.y))
          .symbol {
            PMChartMarker(paint: theme.chart.axis)
          }
          .annotation(position: .top, alignment: .center) {
            PMChartAnnotationLabel(text: point.label)
          }
      }
    }
  }

  @ChartContentBuilder
  private func rule(_ value: Double, label: String?, dashed: Bool) -> some ChartContent {
    let style = StrokeStyle(
      lineWidth: PMChartMetrics.hairline, dash: dashed ? PMChartMetrics.dash : [])
    if horizontalValues {
      RuleMark(x: .value(label ?? "", value))
        .lineStyle(style)
        .foregroundStyle(theme.chart.axis.color)
        .annotation(position: .top, alignment: .trailing) {
          if let label { PMChartAnnotationLabel(text: label) }
        }
    } else {
      RuleMark(y: .value(label ?? "", value))
        .lineStyle(style)
        .foregroundStyle(theme.chart.axis.color)
        .annotation(position: .top, alignment: .trailing) {
          if let label { PMChartAnnotationLabel(text: label) }
        }
    }
  }
}

/// An annotation's or a baseline's label: `text.xs`, `text.muted`.
struct PMChartAnnotationLabel: View {
  @Environment(\.pmTheme) private var theme
  let text: String

  var body: some View {
    Text(text)
      .pmTextStyle(theme.text.xs)
      .foregroundStyle(theme.colors.textMuted.color)
      .lineLimit(1)
      .fixedSize()
  }
}

extension PMChartBaseline {
  /// `baseline` is shorthand for a line annotation, and its first consumer.
  var annotation: PMChartAnnotation { .line(PMChartLineAnnotation(value: value, label: label)) }
}

// MARK: - Text that fits

extension PMChartMetrics {
  /// A run of text's width, estimated as the engine estimates it
  /// (`estimateTextWidth`): a tabular figure's advance for every UTF-16 unit,
  /// as JavaScript counts a string. A word is over-estimated, which drops a
  /// label rather than overlap two.
  static func estimate(_ text: String, size: CGFloat) -> CGFloat {
    CGFloat(text.utf16.count) * size * PMRecipe.chartTextAdvance
  }
}

/// The engine's `labelCapacity` and `thinLabels`: how many labels fit along a
/// length, and which are kept when fewer fit than there are. Labels are never
/// shrunk and never overlap, so whole labels drop at an even stride, the first
/// and the last always kept.
enum PMChartThinning {
  /// How many labels `each` long, `gap` apart, fit along `length`; at least one.
  static func capacity(_ length: CGFloat, each: CGFloat, gap: CGFloat = 0) -> Int {
    let step = each + gap
    guard step > 0, length.isFinite else { return 1 }
    return max(1, Int((length / step).rounded(.down)))
  }

  /// The positions kept of `count`, when `capacity` fit.
  static func kept(_ count: Int, capacity: Int) -> [Int] {
    guard count > 0 else { return [] }
    guard capacity > 1 else { return [0] }
    let stride = max(1, Int((Double(count) / Double(capacity)).rounded(.up)))
    var kept = (0..<count).filter { $0 % stride == 0 }
    // The last keeps its label even off the stride, in the place of the one before it.
    let last = count - 1
    if last % stride != 0 {
      if kept.count > 1 { kept.removeLast() }
      kept.append(last)
    }
    return kept
  }
}

// MARK: - The funnel

/// FunnelChart's figures (the engine's `funnel-chart.ts`): each stage's share
/// of the first stage, the share of the stage before that reached it, the words
/// the plot, the readout and the twin print, and what the plot has room for at
/// a measured size. A share or a step is `nil` where it would divide by zero or
/// a value is not a count, so nothing prints `NaN`. The stages are taken as
/// given: a stage that rises is drawn at its own length against the largest.
@MainActor
struct PMFunnel {
  /// The plot at a measured size (`FunnelPlot`), in points from its leading
  /// edge and its top.
  struct Layout {
    let width: CGFloat
    let height: CGFloat
    /// Each row's height: the plot's, shared by the stages.
    let row: CGFloat
    /// Each stage's row centre.
    let positions: [CGFloat]
    /// The label column's width, which a longer label ends in an ellipsis at.
    let labelWidth: CGFloat
    /// Where every bar starts: past the label column and its gap.
    let start: CGFloat
    /// How far the largest stage's bar runs.
    let run: CGFloat
    let thickness: CGFloat
    /// Each stage's bar length; zero for a stage that draws none.
    let lengths: [CGFloat]
    /// The stages whose label, and value when values are shown, the plot draws.
    let kept: [Int]
    let valuesShown: Bool
    let stepsShown: Bool

    /// A stage's bar end.
    func end(_ index: Int) -> CGFloat { start + (lengths.indices.contains(index) ? lengths[index] : 0) }

    /// The stage whose row holds a point `y` down the plot.
    func stage(at y: CGFloat) -> Int? {
      guard row > 0, !positions.isEmpty else { return nil }
      return min(positions.count - 1, max(0, Int((y / row).rounded(.down))))
    }
  }

  /// A share and a step: a percentage of a count, to one decimal place.
  static let share = PMValueFormat(style: .percent, maximumFractionDigits: 1)

  let stages: [PMFunnelStage]
  let format: PMValueFormat?
  let text: PMChartText
  /// Each stage's share of the first stage.
  let shares: [Double?]
  /// The share of the stage before that reached each stage; `nil` for the first.
  let rates: [Double?]

  init(stages: [PMFunnelStage], format: PMValueFormat?, text: PMChartText) {
    let first = stages.first?.value ?? 0
    self.stages = stages
    self.format = format
    self.text = text
    self.shares = stages.map { Self.ratio($0.value, first) }
    self.rates = stages.indices.map { $0 == 0 ? nil : Self.ratio(stages[$0].value, stages[$0 - 1].value) }
  }

  /// Whether a value is a count a bar can draw: finite, zero or more.
  static func counts(_ value: Double) -> Bool { value.isFinite && value >= 0 }

  /// `part` over `whole`, or `nil` when there is no ratio to state.
  static func ratio(_ part: Double, _ whole: Double) -> Double? {
    counts(part) && counts(whole) && whole > 0 ? part / whole : nil
  }

  /// The largest count, which the longest bar stands for.
  var largest: Double { max(0, stages.map(\.value).filter(Self.counts).max() ?? 0) }

  /// A stage's value as printed; empty for a value that is not a number.
  func value(_ index: Int) -> String { text.number(stages[index].value, format) }

  /// A stage's value and its share as one line, "1,180 · 95.2%"; an em dash
  /// stands for a value that is not a number.
  func amount(_ index: Int) -> String {
    let printed = value(index)
    let shown = printed.isEmpty ? "—" : printed
    guard let share = shares[index] else { return shown }
    return "\(shown) · \(text.number(share, Self.share))"
  }

  /// The step into a stage in the catalog's words ("62% continued"); `nil`
  /// for the first stage and after a stage of zero.
  func step(_ index: Int) -> String? {
    rates[index].map { text.messages.continued(text.number($0, Self.share)) }
  }

  /// What a reader hears at a stage: its label and value, its share and its step.
  func announcement(_ index: Int) -> String {
    let printed = value(index)
    var parts = ["\(stages[index].label): \(printed.isEmpty ? "—" : printed)"]
    if let share = shares[index] { parts.append(text.number(share, Self.share)) }
    if let step = step(index) { parts.append(step) }
    return parts.joined(separator: ", ")
  }

  /// What `onSelect` reports at a stage; `nil` for a value that is not a number.
  func selection(_ index: Int) -> PMFunnelSelection? {
    guard stages.indices.contains(index), stages[index].value.isFinite else { return nil }
    let stage = stages[index]
    return PMFunnelSelection(index: Double(index), key: stage.key, label: stage.label, value: stage.value)
  }

  /// The twin's rows: stage, value, share and step, a cell empty where there is none.
  var twinRows: [[String]] {
    stages.indices.map { index in
      [
        stages[index].label, value(index),
        shares[index].map { text.number($0, Self.share) } ?? "",
        rates[index].map { text.number($0, Self.share) } ?? "",
      ]
    }
  }

  /// The plot at `width` × `height`, its words estimated at the type `size`
  /// and laid in lines `line` tall, its bars at most `cap` thick (`funnelChartModel`).
  ///
  /// Every row is one line or more, so a label and its value are drawn whole or
  /// not at all; when the rows are shorter than a line, whole labels drop at an
  /// even stride. The bars run from the label column to where the longest value
  /// still fits after the longest bar; a plot too narrow for both leaves the
  /// values to the readout and the twin. The step rates take a line between two
  /// bars, so they are drawn only when every row has room for a line and the
  /// thinnest bar, and all of them or none are.
  func layout(width: CGFloat, height: CGFloat, size: CGFloat, line: CGFloat, cap: CGFloat) -> Layout? {
    guard width > 0 else { return nil }
    let widest = stages.map { PMChartMetrics.estimate($0.label, size: size) }.max() ?? 0
    let labelWidth = min(width * PMRecipe.funnelLabelShare, max(0, widest))
    let start = labelWidth > 0 ? labelWidth + PMRecipe.funnelTextGap : 0
    return layout(
      region: width - start, height: height, start: start, labelWidth: labelWidth, size: size,
      line: line, cap: cap)
  }

  /// The plot whose bars' region, past the label column, is `region` wide:
  /// the rest of `layout(width:…)`, for a plot whose label column is laid out
  /// by its words' own widths rather than their estimate. `start` and
  /// `labelWidth` place the region in the plot, zero when the caller places it.
  func layout(
    region: CGFloat, height: CGFloat, start: CGFloat = 0, labelWidth: CGFloat = 0, size: CGFloat,
    line: CGFloat, cap: CGFloat
  ) -> Layout? {
    guard height > 0, !stages.isEmpty else { return nil }
    let count = stages.count
    let row = height / CGFloat(count)
    let positions = (0..<count).map { row * (CGFloat($0) + 0.5) }
    let kept = PMChartThinning.kept(count, capacity: PMChartThinning.capacity(height, each: line))
    let width = start + region
    let amountWidth = max(
      0, stages.indices.map { PMChartMetrics.estimate(amount($0), size: size) }.max() ?? 0)
    let withValues = region - PMRecipe.funnelTextGap - amountWidth
    let valuesShown = withValues >= PMRecipe.funnelMinRun
    let run = max(0, valuesShown ? withValues : region)
    let largest = largest
    let lengths = stages.map { stage -> CGFloat in
      largest > 0 && Self.counts(stage.value) ? CGFloat(stage.value / largest) * run : 0
    }
    let stepWidth = stages.indices.map { PMChartMetrics.estimate(step($0) ?? "", size: size) }.max() ?? 0
    let stepsShown =
      count > 1 && row - line >= PMRecipe.funnelMinBar && max(0, stepWidth) <= region
    let thickness = min(
      cap,
      max(PMGeometry.hairline, stepsShown ? row - line : row * (1 - PMRecipe.funnelRowSpacing)))
    return Layout(
      width: width, height: height, row: row, positions: positions, labelWidth: labelWidth,
      start: start, run: run, thickness: thickness, lengths: lengths, kept: kept,
      valuesShown: valuesShown, stepsShown: stepsShown)
  }
}

// MARK: - The treemap

/// The squarified treemap layout (`squarify`; Bruls, Huizing and van Wijk):
/// one rectangle per value, each with an area proportional to its value, that
/// together tile `box` with no gap and no overlap. The values are laid out in
/// the order given, largest first, each above zero. A row of rectangles runs
/// along the box's shorter side and grows while the next value keeps its worst
/// aspect ratio from rising; the last rectangle of a row and the last row take
/// what remains, so rounding leaves no sliver uncovered. The same values and
/// box always give the same rectangles.
enum PMSquarify {
  static func tiles(_ values: [Double], in box: CGRect) -> [CGRect] {
    guard !values.isEmpty else { return [] }
    let total = values.reduce(0, +)
    let size = box.size
    guard total > 0, size.width > 0, size.height > 0 else {
      return values.map { _ in CGRect(origin: box.origin, size: .zero) }
    }
    let scale = Double(size.width * size.height) / total
    let areas = values.map { $0 * scale }
    var tiles: [CGRect] = []
    var x = Double(box.origin.x)
    var y = Double(box.origin.y)
    var width = Double(size.width)
    var height = Double(size.height)
    var start = 0
    while start < areas.count {
      let side = min(width, height)
      var end = start + 1
      while end < areas.count, worst(areas, start, end + 1, side) <= worst(areas, start, end, side) {
        end += 1
      }
      let row = areas[start..<end].reduce(0, +)
      let last = end == areas.count
      if width >= height {
        // A column at the left, across the box's height.
        let thickness = last ? width : row / height
        var at = y
        for index in start..<end {
          let length = index == end - 1 ? y + height - at : areas[index] / thickness
          tiles.append(CGRect(x: x, y: at, width: thickness, height: length))
          at += length
        }
        x += thickness
        width -= thickness
      } else {
        // A row at the top, across the box's width.
        let thickness = last ? height : row / width
        var at = x
        for index in start..<end {
          let length = index == end - 1 ? x + width - at : areas[index] / thickness
          tiles.append(CGRect(x: at, y: y, width: length, height: thickness))
          at += length
        }
        y += thickness
        height -= thickness
      }
      start = end
    }
    return tiles
  }

  /// The worst aspect ratio of the areas from `from` up to `to`, laid along a
  /// side `side` long: the measure the layout keeps as low as it can.
  private static func worst(_ areas: [Double], _ from: Int, _ to: Int, _ side: Double) -> Double {
    var sum = 0.0
    for index in from..<to { sum += areas[index] }
    let side2 = side * side
    let sum2 = sum * sum
    return max((side2 * areas[from]) / sum2, sum2 / (side2 * areas[to - 1]))
  }
}

/// Treemap's tiling and words (the engine's `treemap.ts`): which items take
/// area and in what order, each tile's rectangle, its painted inset and its
/// pointer target, the plates that fit, the readout's words, the selection and
/// the twin. Two levels are drawn: an item with children is a group whose
/// children tile its rectangle, an item deeper than two levels is summed into
/// its ancestor at the second, and an item at the top level is a group of one.
/// An item with no positive value takes no area; the twin lists it and the
/// summary counts it.
@MainActor
struct PMTreemapTiling {
  /// An item that takes area, in reading order: by group, largest first, then
  /// by item, largest first (`TreemapLeaf`).
  struct Leaf {
    /// Unique in the chart: the item's key, after its group's for an item in a group.
    let id: String
    let key: String
    let label: String
    /// The value drawn: the item's own, or its children's sum.
    let value: Double
    /// The group's label, for an item in a group.
    let group: String?
    /// The position of the top-level item it belongs to, whose colour it takes.
    let top: Int
  }

  /// A label drawn on its tile: the item's label over its value, on a plate
  /// of the surface, its top leading corner at `x`, `y` and its room `width`.
  struct Plate: Equatable {
    let label: String
    let value: String
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
  }

  /// One item's rectangle (`TreemapTile`).
  struct Tile {
    let index: Int
    /// The layout's rectangle; the tiles cover the plot with no overlap.
    let rect: CGRect
    /// The painted rectangle: the layout's less the gap, never under the least paint.
    let paint: CGRect
    /// The pointer target: the layout's rectangle grown to the least hit area, inside the plot.
    let hit: CGRect
    let plate: Plate?
  }

  /// How the words are estimated and the parts measured.
  struct Metrics {
    /// The type size the widths are estimated at.
    let size: CGFloat
    /// One line of a plate.
    let line: CGFloat
    /// A plate's padding across.
    let padding: CGFloat
  }

  /// A share of the whole, to one decimal place.
  static let share = PMValueFormat(style: .percent, maximumFractionDigits: 1)

  let items: [PMTreemapItem]
  let format: PMValueFormat?
  let text: PMChartText
  /// Whether any top-level item has children: then colour names the group.
  let grouped: Bool
  let leaves: [Leaf]
  /// The total of the values that take area, which every share divides by.
  let total: Double
  /// The top-level items that take area, largest first.
  private let order: [Int]

  init(items: [PMTreemapItem], format: PMValueFormat?, text: PMChartText) {
    self.items = items
    self.format = format
    self.text = text
    grouped = items.contains(where: Self.hasChildren)
    let order = Self.largestFirst(items.map(Self.drawn)).filter { Self.drawn(items[$0]) > 0 }
    var leaves: [Leaf] = []
    for index in order {
      let top = items[index]
      guard let children = top.children, !children.isEmpty else {
        leaves.append(
          Leaf(
            id: top.key, key: top.key, label: top.label, value: Self.drawn(top), group: nil,
            top: index))
        continue
      }
      for at in Self.largestFirst(children.map(Self.drawn)) where Self.drawn(children[at]) > 0 {
        let child = children[at]
        leaves.append(
          Leaf(
            id: "\(top.key)/\(child.key)", key: child.key, label: child.label,
            value: Self.drawn(child), group: top.label, top: index))
      }
    }
    self.order = order
    self.leaves = leaves
    self.total = leaves.reduce(0) { $0 + $1.value }
  }

  /// Whether a value takes area: a finite number above zero.
  static func takesArea(_ value: Double) -> Bool { value.isFinite && value > 0 }

  static func hasChildren(_ item: PMTreemapItem) -> Bool { !(item.children ?? []).isEmpty }

  /// The value an item draws: its own for a leaf, its children's sum at any
  /// depth for an item with children; nothing for a value that takes no area.
  static func drawn(_ item: PMTreemapItem) -> Double {
    guard let children = item.children, !children.isEmpty else {
      return takesArea(item.value) ? item.value : 0
    }
    return children.reduce(0) { $0 + drawn($1) }
  }

  /// The positions of `values` from largest to smallest; equal values keep their order.
  static func largestFirst(_ values: [Double]) -> [Int] {
    values.indices.sorted { values[$0] > values[$1] || (values[$0] == values[$1] && $0 < $1) }
  }

  /// An item's value as printed: the sum it draws for an item with children.
  func value(_ item: PMTreemapItem) -> String {
    text.number(Self.hasChildren(item) ? Self.drawn(item) : item.value, format)
  }

  /// A value's share of the whole as printed; empty for one that takes no area.
  func shareText(_ value: Double) -> String {
    total > 0 && Self.takesArea(value) ? text.number(value / total, Self.share) : ""
  }

  /// The twin's rows, every item in the order given: group, item, value and
  /// share with groups; item, value and share with one level.
  var twinRows: [[String]] {
    items.flatMap { item -> [[String]] in
      if grouped, let children = item.children, !children.isEmpty {
        return children.map { [item.label, $0.label, value($0), shareText(Self.drawn($0))] }
      }
      return [(grouped ? [item.label] : []) + [item.label, value(item), shareText(Self.drawn(item))]]
    }
  }

  /// The facts the summary sentence states: the items listed, the groups and
  /// the items that take no area.
  func facts(label: String) -> PMTreemapSummaryFacts {
    let listed = twinRows.count
    return PMTreemapSummaryFacts(
      label: label, items: Double(listed), groups: grouped ? Double(items.count) : 0,
      absent: Double(listed - leaves.count))
  }

  /// A leaf's value and its share, "180 · 28.3%".
  func amount(_ index: Int) -> String {
    let leaf = leaves[index]
    return "\(text.number(leaf.value, format)) · \(text.number(total > 0 ? leaf.value / total : 0, Self.share))"
  }

  /// A leaf's value and its share as a reader hears them, "180, 28.3%".
  func spoken(_ index: Int) -> String {
    let leaf = leaves[index]
    let share = text.number(total > 0 ? leaf.value / total : 0, Self.share)
    return "\(text.number(leaf.value, format)), \(share)"
  }

  /// What a reader hears at a tile: the group, the item, its value and its share.
  func announcement(_ index: Int) -> String {
    let leaf = leaves[index]
    return "\(leaf.group.map { "\($0), " } ?? "")\(leaf.label): \(spoken(index))"
  }

  /// What `onSelect` reports at a tile: the item, the value it draws and its share.
  func selection(_ index: Int) -> PMDonutSelection? {
    guard leaves.indices.contains(index) else { return nil }
    let leaf = leaves[index]
    return PMDonutSelection(
      key: leaf.key, label: leaf.label, value: leaf.value, share: total > 0 ? leaf.value / total : 0)
  }

  /// The tiles at `width` × `height`, in reading order: the groups laid out by
  /// their sums, then each group's items inside its rectangle, so every item's
  /// area is its share of the whole.
  func tiles(width: CGFloat, height: CGFloat, metrics: Metrics) -> [Tile] {
    guard width > 0, height > 0 else { return [] }
    let whole = CGRect(x: 0, y: 0, width: width, height: height)
    let groups = PMSquarify.tiles(order.map { Self.drawn(items[$0]) }, in: whole)
    var tiles: [Tile] = []
    for (at, index) in order.enumerated() {
      let top = items[index]
      let rect = groups[at]
      let placed: [(rect: CGRect, group: CGRect?)]
      if let children = top.children, !children.isEmpty {
        let kept = Self.largestFirst(children.map(Self.drawn)).filter {
          Self.drawn(children[$0]) > 0
        }
        placed = PMSquarify.tiles(kept.map { Self.drawn(children[$0]) }, in: rect).map { ($0, rect) }
      } else {
        placed = [(rect, nil)]
      }
      for (tile, group) in placed {
        let leaf = leaves[tiles.count]
        let paint = Self.inset(tile, group: grouped ? (group ?? tile) : nil)
        tiles.append(
          Tile(
            index: tiles.count, rect: tile, paint: paint,
            hit: Self.hitArea(tile, width: width, height: height),
            plate: Self.plate(
              paint, label: leaf.label, value: text.number(leaf.value, format), metrics: metrics)))
      }
    }
    return tiles
  }

  /// A rectangle less its gap: each side in by half the gap between items,
  /// or, with groups, a side on its group's edge by half the gap between
  /// groups. A tile the gap would erase keeps the least paint, centred.
  static func inset(_ rect: CGRect, group: CGRect?) -> CGRect {
    // An edge within a hundredth of a point of its group's is on it, as the engine reads it.
    let near = { (a: CGFloat, b: CGFloat) in abs(a - b) < 0.01 }
    let half = { (edge: Bool) in (group != nil && edge ? PMRecipe.treemapGroupGap : PMChartMetrics.gap) / 2 }
    let origin = rect.origin
    let size = rect.size
    let left = half(group.map { near(origin.x, $0.origin.x) } ?? false)
    let top = half(group.map { near(origin.y, $0.origin.y) } ?? false)
    let right = half(
      group.map { near(origin.x + size.width, $0.origin.x + $0.size.width) } ?? false)
    let bottom = half(
      group.map { near(origin.y + size.height, $0.origin.y + $0.size.height) } ?? false)
    func fit(_ start: CGFloat, _ length: CGFloat, _ before: CGFloat, _ after: CGFloat)
      -> (at: CGFloat, size: CGFloat)
    {
      let inner = length - before - after
      if inner >= PMRecipe.treemapMinPaint { return (start + before, inner) }
      return (start + (length - PMRecipe.treemapMinPaint) / 2, PMRecipe.treemapMinPaint)
    }
    let across = fit(origin.x, size.width, left, right)
    let down = fit(origin.y, size.height, top, bottom)
    return CGRect(x: across.at, y: down.at, width: across.size, height: down.size)
  }

  /// The rectangle grown to the least hit area each way, kept inside the plot.
  static func hitArea(_ rect: CGRect, width: CGFloat, height: CGFloat) -> CGRect {
    func grow(_ start: CGFloat, _ length: CGFloat, _ limit: CGFloat) -> (at: CGFloat, size: CGFloat) {
      let grown = min(limit, max(length, PMChartMetrics.hitMinimum))
      return (min(limit - grown, max(0, start - (grown - length) / 2)), grown)
    }
    let across = grow(rect.origin.x, rect.size.width, width)
    let down = grow(rect.origin.y, rect.size.height, height)
    return CGRect(x: across.at, y: down.at, width: across.size, height: down.size)
  }

  /// The plate for a painted tile, or `nil` when the label and the value do
  /// not both fit inside it by their estimated widths and two lines.
  static func plate(_ paint: CGRect, label: String, value: String, metrics: Metrics) -> Plate? {
    let inset = PMRecipe.treemapPlateInset
    let room = paint.size.width - inset - inset
    let needs =
      max(
        PMChartMetrics.estimate(label, size: metrics.size),
        PMChartMetrics.estimate(value, size: metrics.size)) + metrics.padding + metrics.padding
    let tall = metrics.line + metrics.line + PMRecipe.treemapPlatePadding + PMRecipe.treemapPlatePadding
    guard room >= needs, paint.size.height - inset - inset >= tall else { return nil }
    return Plate(
      label: label, value: value, x: paint.origin.x + inset, y: paint.origin.y + inset, width: room)
  }
}

// MARK: - Polar geometry

/// The engine's `polar.ts`: angles run clockwise from 12 o'clock, and a point
/// at angle θ and radius r lies at `(sin θ · r, −cos θ · r)` from the centre,
/// the frame the donut's ring uses too.
enum PMPolar {
  /// The bearing of axis `index` of `count`, in radians.
  static func angle(_ index: Int, of count: Int) -> Double {
    count <= 0 ? 0 : Double.pi * 2 * Double(index) / Double(count)
  }

  static func point(_ angle: Double, _ radius: CGFloat, around center: CGPoint) -> CGPoint {
    CGPoint(
      x: center.x + CGFloat(sin(angle)) * radius, y: center.y - CGFloat(cos(angle)) * radius)
  }

  /// A ring through the spokes, a polygon, never a circle: the scale exists
  /// only on the spokes (`ringPath`).
  static func ring(_ count: Int, _ radius: CGFloat, around center: CGPoint) -> Path {
    var path = Path()
    guard count > 0, radius > 0 else { return path }
    for index in 0..<count {
      let at = point(angle(index, of: count), radius, around: center)
      if index == 0 { path.move(to: at) } else { path.addLine(to: at) }
    }
    path.closeSubpath()
    return path
  }

  /// A series' profile (`profilePath`): its vertices joined spoke to spoke
  /// with straight lines. A gap breaks the polygon at that vertex; the closing
  /// edge is drawn only when both its ends exist.
  static func profile(_ points: [CGPoint?]) -> Path {
    var path = Path()
    guard points.count >= 2 else { return path }
    if points.allSatisfy({ $0 != nil }) {
      for (index, point) in points.enumerated() {
        guard let point else { continue }
        if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
      }
      path.closeSubpath()
      return path
    }
    var drawing = false
    for point in points + [points[0]] {
      guard let point else {
        drawing = false
        continue
      }
      if drawing { path.addLine(to: point) } else { path.move(to: point) }
      drawing = true
    }
    return path
  }
}
