import XCTest

@testable import PolymorphUI

/// FunnelChart's figures, held to the engine's cases
/// (`packages/engine/src/charts/funnel-chart.test.ts`): each bar's length
/// against its value, the shares and the step rates, what a zero or a rising
/// stage does, which text fits, the readout's words and the selection, so the
/// same stages draw the same funnel on iOS as on the web. The words are
/// estimated at the engine's type size (12) and line (18), and the bars are
/// capped at its 24.
@MainActor
final class FunnelFiguresTests: XCTestCase {
  private static let signup = [
    PMFunnelStage(key: "visited", label: "Visited", value: 12_400),
    PMFunnelStage(key: "signed", label: "Signed up", value: 7688),
    PMFunnelStage(key: "activated", label: "Activated", value: 3460),
    PMFunnelStage(key: "paid", label: "Paid", value: 1488),
  ]

  private func funnel(_ stages: [PMFunnelStage]? = nil, format: PMValueFormat? = nil) -> PMFunnel {
    PMFunnel(
      stages: stages ?? Self.signup, format: format,
      text: PMChartText(locale: Locale(identifier: "en_US"), messages: PMSpecDefault.chartMessages))
  }

  private func layout(_ figures: PMFunnel, width: CGFloat = 600, height: CGFloat = 224)
    -> PMFunnel.Layout?
  {
    figures.layout(width: width, height: height, size: 12, line: 18, cap: 24)
  }

  private func stages(_ values: [Double]) -> [PMFunnelStage] {
    values.enumerated().map { index, value in
      PMFunnelStage(key: "s\(index)", label: "S\(index + 1)", value: value)
    }
  }

  func testDrawsOneBarPerStageFromTheLabelColumnItsLengthItsValueAgainstTheLargest() throws {
    let plot = try XCTUnwrap(layout(funnel()))
    XCTAssertEqual(plot.lengths.count, 4)
    let longest = try XCTUnwrap(plot.lengths.first)
    XCTAssertEqual(longest, plot.run, accuracy: 1e-9)
    for (index, stage) in Self.signup.enumerated() {
      XCTAssertEqual(plot.lengths[index] / longest, stage.value / 12_400, accuracy: 1e-9)
      XCTAssertEqual(plot.end(index), plot.start + plot.lengths[index], accuracy: 1e-9)
    }
  }

  func testStacksTheStagesTopToBottomOneRowEach() throws {
    let plot = try XCTUnwrap(layout(funnel()))
    XCTAssertEqual(plot.positions, [28, 84, 140, 196])
    XCTAssertEqual(plot.row, 56)
    XCTAssertEqual(plot.stage(at: 0), 0)
    XCTAssertEqual(plot.stage(at: 57), 1)
    XCTAssertEqual(plot.stage(at: 224), 3)
  }

  func testStatesEachShareOfTheFirstStageAndEachStepFromTheStageBefore() throws {
    let figures = funnel()
    XCTAssertEqual(figures.shares, [1, 7688 / 12_400, 3460 / 12_400, 1488 / 12_400])
    XCTAssertEqual(figures.rates, [nil, 7688 / 12_400, 3460 / 7688, 1488 / 3460])
    XCTAssertEqual(
      (0..<4).map(figures.amount), ["12,400 · 100%", "7,688 · 62%", "3,460 · 27.9%", "1,488 · 12%"])
    XCTAssertEqual(
      (0..<4).map(figures.step), [nil, "62% continued", "45% continued", "43% continued"])
    let plot = try XCTUnwrap(layout(figures))
    XCTAssertTrue(plot.stepsShown)
    XCTAssertTrue(plot.valuesShown)
    XCTAssertEqual(plot.kept, [0, 1, 2, 3])
    // With a step line, a bar takes the row less one line, up to the cap.
    XCTAssertEqual(plot.thickness, 24)
  }

  func testWritesEveryStageIntoTheTwinWithAnEmptyCellWhereThereIsNoStep() {
    let figures = funnel()
    XCTAssertEqual(
      figures.twinRows,
      [
        ["Visited", "12,400", "100%", ""],
        ["Signed up", "7,688", "62%", "62%"],
        ["Activated", "3,460", "27.9%", "45%"],
        ["Paid", "1,488", "12%", "43%"],
      ])
    XCTAssertEqual(
      PMSpecDefault.chartMessages.funnelSummary(PMFunnelSummaryFacts(label: "Signup funnel", stages: 4)),
      "Signup funnel, 4 stages. The same data is available as a table.")
  }

  func testHasNoPlotForNoStagesOrNoRoom() {
    XCTAssertNil(layout(funnel([])))
    XCTAssertEqual(funnel([]).twinRows, [])
    XCTAssertNil(layout(funnel(), width: 0))
  }

  func testDrawsOneStageAtFullLengthWithItsWholeShareAndNoStep() throws {
    let figures = funnel(Array(Self.signup.prefix(1)))
    let plot = try XCTUnwrap(layout(figures))
    XCTAssertEqual(plot.lengths, [plot.run])
    XCTAssertFalse(plot.stepsShown)
    XCTAssertEqual(figures.shares, [1])
    XCTAssertEqual(
      PMSpecDefault.chartMessages.funnelSummary(PMFunnelSummaryFacts(label: "Signup funnel", stages: 1)),
      "Signup funnel, 1 stage. The same data is available as a table.")
  }

  func testGivesNoShareAndNoStepAfterAFirstStageOfZero() throws {
    let figures = funnel([
      PMFunnelStage(key: "a", label: "A", value: 0), PMFunnelStage(key: "b", label: "B", value: 0),
    ])
    XCTAssertEqual(figures.shares, [nil, nil])
    XCTAssertEqual(figures.rates, [nil, nil])
    XCTAssertEqual(try XCTUnwrap(layout(figures)).lengths, [0, 0])
    XCTAssertEqual(figures.twinRows, [["A", "0", "", ""], ["B", "0", "", ""]])
    XCTAssertFalse((0..<2).map(figures.amount).joined().contains("NaN"))
  }

  func testDrawsNoBarForAStageOfZeroInTheMiddleAndNoStepOutOfIt() throws {
    let figures = funnel(stages([100, 0, 0]))
    XCTAssertEqual(try XCTUnwrap(layout(figures)).lengths.map { $0 == 0 }, [false, true, true])
    XCTAssertEqual(figures.shares, [1, 0, 0])
    XCTAssertEqual(figures.rates, [nil, 0, nil])
    XCTAssertEqual((0..<3).compactMap(figures.step), ["0% continued"])
  }

  func testDrawsEqualStagesAtEqualLengthsEachStepAtTheWhole() throws {
    let figures = funnel(stages([50, 50]))
    let plot = try XCTUnwrap(layout(figures))
    XCTAssertEqual(plot.end(0), plot.end(1))
    XCTAssertEqual(figures.rates, [nil, 1])
  }

  func testDrawsAStageThatRisesAsGivenAgainstTheLargest() throws {
    let figures = funnel([
      PMFunnelStage(key: "a", label: "Trial", value: 100),
      PMFunnelStage(key: "b", label: "Paid", value: 150),
    ])
    let plot = try XCTUnwrap(layout(figures))
    XCTAssertGreaterThan(plot.lengths[1], plot.lengths[0])
    XCTAssertEqual(plot.lengths[0] / plot.lengths[1], 100 / 150, accuracy: 1e-9)
    XCTAssertEqual(figures.shares, [1, 1.5])
  }

  func testKeepsANegativeStageOffThePlotAndInTheTwin() throws {
    let figures = funnel([
      PMFunnelStage(key: "a", label: "A", value: 40), PMFunnelStage(key: "b", label: "B", value: -5),
    ])
    XCTAssertEqual(try XCTUnwrap(layout(figures)).lengths[1], 0)
    XCTAssertNil(figures.shares[1])
    XCTAssertEqual(figures.twinRows[1], ["B", "-5", "", ""])
  }

  func testCapsTheLabelColumnAtTwoFifthsOfThePlotForAVeryLongLabel() throws {
    let long = "Completed the identity verification step on the second attempt"
    let plot = try XCTUnwrap(
      layout(funnel([PMFunnelStage(key: "a", label: long, value: 10)] + Self.signup.dropFirst())))
    XCTAssertEqual(plot.labelWidth, 600 * 0.4, accuracy: 1e-9)
    XCTAssertEqual(plot.kept.first, 0)
  }

  func testFitsTwelveStagesAtPhoneWidthEveryLabelNoStepLinesValuesWhileTheyFit() throws {
    let figures = funnel(
      (0..<12).map { PMFunnelStage(key: "s\($0)", label: "Stage \($0 + 1)", value: Double(1000 - $0 * 80)) })
    let plot = try XCTUnwrap(layout(figures, width: 303, height: 224))
    XCTAssertEqual(plot.lengths.count, 12)
    XCTAssertEqual(plot.kept.count, 12)
    // A row is shorter than a line and a bar, so the steps go to the readout and the twin.
    XCTAssertFalse(plot.stepsShown)
    XCTAssertTrue(plot.valuesShown)
    for index in 0..<12 {
      let x = plot.end(index) + 8
      XCTAssertLessThanOrEqual(x + CGFloat(figures.amount(index).utf16.count) * 7.2, 303 + 0.001)
    }
  }

  func testDropsWholeLabelsAtAnEvenStrideWhenTheRowsAreShorterThanALine() throws {
    let plot = try XCTUnwrap(
      layout(funnel(stages((0..<12).map { Double(100 - $0) })), width: 400, height: 144))
    XCTAssertLessThan(plot.kept.count, 12)
    XCTAssertEqual(plot.kept.first, 0)
    XCTAssertEqual(plot.kept.last, 11)
  }

  func testLeavesTheValuesToTheReadoutOnAPlotTooNarrowForThemAndABar() throws {
    let plot = try XCTUnwrap(layout(funnel(), width: 150))
    XCTAssertFalse(plot.valuesShown)
    XCTAssertTrue(plot.lengths.allSatisfy { $0 > 0 })
  }

  func testSaysTheValueTheShareAndTheStep() {
    let figures = funnel()
    XCTAssertEqual(figures.announcement(2), "Activated: 3,460, 27.9%, 45% continued")
    XCTAssertEqual(figures.step(2), "45% continued")
    XCTAssertEqual(figures.amount(2), "3,460 · 27.9%")
  }

  func testSaysNoStepForTheFirstStageAndNoShareAfterAZero() {
    XCTAssertEqual(funnel().announcement(0), "Visited: 12,400, 100%")
    let zero = funnel([PMFunnelStage(key: "a", label: "A", value: 0)] + Self.signup[1...1])
    XCTAssertEqual(zero.announcement(1), "Signed up: 7,688")
  }

  func testReportsTheStageReadAndNothingForAValueThatIsNotANumber() throws {
    let selection = try XCTUnwrap(funnel().selection(1))
    XCTAssertEqual(selection.index, 1)
    XCTAssertEqual(selection.key, "signed")
    XCTAssertEqual(selection.label, "Signed up")
    XCTAssertEqual(selection.value, 7688)
    XCTAssertNil(funnel().selection(4))
    XCTAssertNil(funnel([PMFunnelStage(key: "a", label: "A", value: .nan)]).selection(0))
  }

  func testThinsLabelsAsTheEngineDoes() {
    XCTAssertEqual(PMChartThinning.kept(12, capacity: 5), [0, 3, 6, 11])
    XCTAssertEqual(PMChartThinning.kept(5, capacity: 1), [0])
    XCTAssertEqual(PMChartThinning.kept(0, capacity: 4), [])
    XCTAssertEqual(PMChartThinning.capacity(144, each: 18), 8)
    XCTAssertEqual(PMChartThinning.capacity(10, each: 18), 1)
  }
}
