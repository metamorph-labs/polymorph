import XCTest

@testable import PolymorphUI

/// A series chart's summary sentence in the default catalog, held to the
/// engine's English (`packages/engine/src/charts/charts.test.ts`): the measure
/// the values are in (`y.label`) is said once, after the series and the rows,
/// and a scatter chart's two measures are said together, the vertical one
/// first. A chart that names no measure says what it said before.
@MainActor
final class ChartSummaryTests: XCTestCase {
  private let say = PMSpecDefault.chartMessages

  func testSaysTheMeasureOnceAfterTheSeriesAndTheRows() {
    XCTAssertEqual(
      say.summary(
        PMChartSummaryFacts(
          label: "Tickets by weekday", series: ["Opened", "Resolved"], points: 5,
          measure: "Tickets")),
      "Tickets by weekday showing Opened and Resolved, 5 points. Values: Tickets. "
        + "The same data is available as a table.")
  }

  func testSaysAScatterChartsTwoMeasuresTheVerticalOneFirst() {
    XCTAssertEqual(
      say.summary(
        PMChartSummaryFacts(
          label: "Speed and satisfaction", series: ["Agents"], points: 24,
          measure: "Satisfaction", xMeasure: "Handle time (min)")),
      "Speed and satisfaction showing Agents, 24 points. "
        + "Values: Satisfaction against Handle time (min). The same data is available as a table.")
    XCTAssertEqual(
      say.summary(
        PMChartSummaryFacts(
          label: "Speed", series: ["Agents"], points: 24, xMeasure: "Handle time")),
      "Speed showing Agents, 24 points. Values against Handle time. "
        + "The same data is available as a table.")
  }

  func testSaysNoMeasureWhenTheChartNamesNone() {
    XCTAssertEqual(
      say.summary(PMChartSummaryFacts(label: "Tickets", series: ["Opened"], points: 1)),
      "Tickets showing Opened, 1 point. The same data is available as a table.")
    XCTAssertEqual(
      say.summary(PMChartSummaryFacts(label: "Latency", series: [], points: 200)),
      "Latency, 200 points. The same data is available as a table.")
  }
}
