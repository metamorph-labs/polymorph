import XCTest

@testable import PolymorphUI

/// Treemap's layout and words, held to the engine's cases
/// (`packages/engine/src/charts/treemap.test.ts`): rectangles that tile the box
/// with areas proportional to their values, the order, the gaps, which labels
/// fit, what an item with no value does, the readout and the selection, so the
/// same items tile the same plot on iOS as on the web. The words are estimated
/// at the engine's type size (12) and line (18), with the web's 4-point plate
/// padding across.
@MainActor
final class TreemapTilingTests: XCTestCase {
  private static let storage = [
    PMTreemapItem(key: "video", label: "Video", value: 420),
    PMTreemapItem(key: "images", label: "Images", value: 260),
    PMTreemapItem(key: "backups", label: "Backups", value: 180),
    PMTreemapItem(key: "logs", label: "Logs", value: 90),
    PMTreemapItem(key: "other", label: "Other", value: 50),
  ]

  private static let teams = [
    PMTreemapItem(
      key: "support", label: "Support", value: 300,
      children: [
        PMTreemapItem(key: "email", label: "Email", value: 180),
        PMTreemapItem(key: "chat", label: "Chat", value: 120),
      ]),
    PMTreemapItem(
      key: "sales", label: "Sales", value: 200,
      children: [
        PMTreemapItem(key: "demos", label: "Demos", value: 150),
        PMTreemapItem(key: "calls", label: "Calls", value: 50),
      ]),
    PMTreemapItem(key: "legal", label: "Legal", value: 100),
  ]

  private static let metrics = PMTreemapTiling.Metrics(size: 12, line: 18, padding: 4)

  private func tiling(_ items: [PMTreemapItem]? = nil) -> PMTreemapTiling {
    PMTreemapTiling(
      items: items ?? Self.storage, format: nil,
      text: PMChartText(locale: Locale(identifier: "en_US"), messages: PMSpecDefault.chartMessages))
  }

  private func tiles(_ tiling: PMTreemapTiling, width: CGFloat = 600, height: CGFloat = 300)
    -> [PMTreemapTiling.Tile]
  {
    tiling.tiles(width: width, height: height, metrics: Self.metrics)
  }

  private func area(_ rect: CGRect) -> CGFloat { rect.size.width * rect.size.height }

  /// The rectangles cover the box: no overlap, inside it, and their areas sum to its area.
  private func assertTiling(_ rects: [CGRect], _ box: CGRect, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertEqual(rects.map(area).reduce(0, +), area(box), accuracy: 1e-6, file: file, line: line)
    for rect in rects {
      XCTAssertGreaterThanOrEqual(rect.origin.x, box.origin.x - 1e-6, file: file, line: line)
      XCTAssertGreaterThanOrEqual(rect.origin.y, box.origin.y - 1e-6, file: file, line: line)
      XCTAssertLessThanOrEqual(rect.origin.x + rect.size.width, box.maxX + 1e-6, file: file, line: line)
      XCTAssertLessThanOrEqual(rect.origin.y + rect.size.height, box.maxY + 1e-6, file: file, line: line)
    }
    for a in rects.indices {
      for b in rects.indices where b > a {
        let across = min(rects[a].maxX, rects[b].maxX) - max(rects[a].minX, rects[b].minX)
        let down = min(rects[a].maxY, rects[b].maxY) - max(rects[a].minY, rects[b].minY)
        XCTAssertFalse(across > 1e-6 && down > 1e-6, "\(a) and \(b)", file: file, line: line)
      }
    }
  }

  // MARK: The layout

  func testTilesTheBoxEachAreaProportionalToItsValue() {
    let values: [Double] = [6, 6, 4, 3, 2, 2, 1]
    let box = CGRect(x: 0, y: 0, width: 600, height: 400)
    let rects = PMSquarify.tiles(values, in: box)
    assertTiling(rects, box)
    let unit = area(box) / CGFloat(values.reduce(0, +))
    for (index, rect) in rects.enumerated() {
      XCTAssertEqual(area(rect), CGFloat(values[index]) * unit, accuracy: 1e-6)
    }
  }

  func testLaysThePapersExampleOutAsThePaperDoes() {
    // Bruls, Huizing and van Wijk's worked example: 6 6 4 3 2 2 1 in a 6 × 4 box.
    let rects = PMSquarify.tiles([6, 6, 4, 3, 2, 2, 1], in: CGRect(x: 0, y: 0, width: 6, height: 4))
    XCTAssertEqual(rects[0], CGRect(x: 0, y: 0, width: 3, height: 2))
    XCTAssertEqual(rects[1], CGRect(x: 0, y: 2, width: 3, height: 2))
  }

  func testGivesTheSameRectanglesForTheSameValuesAndBox() {
    let box = CGRect(x: 0, y: 0, width: 333, height: 211)
    XCTAssertEqual(PMSquarify.tiles([9, 7, 7, 3, 1], in: box), PMSquarify.tiles([9, 7, 7, 3, 1], in: box))
  }

  func testKeepsRectanglesNearSquareInANarrowTallBoxAndAWideShortOne() {
    for box in [CGRect(x: 0, y: 0, width: 60, height: 600), CGRect(x: 0, y: 0, width: 900, height: 60)] {
      let rects = PMSquarify.tiles([5, 4, 3, 2, 1], in: box)
      assertTiling(rects, box)
      for rect in rects {
        XCTAssertLessThan(max(rect.width / rect.height, rect.height / rect.width), 6)
      }
    }
  }

  func testReturnsNothingForNoValuesAndEmptyRectanglesForAnEmptyBox() {
    XCTAssertEqual(PMSquarify.tiles([], in: CGRect(x: 0, y: 0, width: 10, height: 10)), [])
    XCTAssertEqual(
      PMSquarify.tiles([1, 2], in: CGRect(x: 0, y: 0, width: 0, height: 10)), [.zero, .zero])
  }

  // MARK: The model

  func testTilesThePlotOneTilePerItemLargestFirstEachAreaItsShare() throws {
    let model = tiling()
    let placed = tiles(model)
    XCTAssertEqual(model.leaves.map(\.key), ["video", "images", "backups", "logs", "other"])
    let box = CGRect(x: 0, y: 0, width: 600, height: 300)
    assertTiling(placed.map(\.rect), box)
    for tile in placed {
      XCTAssertEqual(
        Double(area(tile.rect) / area(box)), model.leaves[tile.index].value / model.total,
        accuracy: 1e-6)
    }
    // The largest sits at the start.
    XCTAssertEqual(placed.first?.rect.origin, .zero)
  }

  func testPaintsAOneLevelTreemapInOneColour() {
    XCTAssertFalse(tiling().grouped)
    XCTAssertEqual(Set(tiling().leaves.map(\.top)).count, 5)
  }

  func testSeparatesTilesByATwoPointGapAndGroupsByFour() throws {
    for tile in tiles(tiling()) {
      XCTAssertEqual(tile.paint.width, tile.rect.width - 2, accuracy: 1e-6)
      XCTAssertEqual(tile.paint.height, tile.rect.height - 2, accuracy: 1e-6)
    }
    let grouped = tiles(tiling(Self.teams))
    let email = grouped[0]
    let chat = grouped[1]
    // Two items of one group: 2 points apart where they meet, 2 points in from the group's edges.
    XCTAssertEqual(email.paint.minX, email.rect.minX + 2, accuracy: 1e-6)
    let meeting =
      abs(email.rect.maxX - chat.rect.minX) < 0.01
      ? chat.paint.minX - email.paint.maxX : chat.paint.minY - email.paint.maxY
    XCTAssertEqual(meeting, 2, accuracy: 1e-6)
  }

  func testDrawsTwoLevelsGroupsInDeclarationOrderItemsInsideTheirGroup() {
    let model = tiling(Self.teams)
    XCTAssertTrue(model.grouped)
    XCTAssertEqual(
      model.leaves.map(\.id), ["support/email", "support/chat", "sales/demos", "sales/calls", "legal"])
    XCTAssertEqual(model.leaves.map(\.top), [0, 0, 1, 1, 2])
    assertTiling(tiles(model).map(\.rect), CGRect(x: 0, y: 0, width: 600, height: 300))
    XCTAssertEqual(
      model.twinRows,
      [
        ["Support", "Email", "180", "30%"],
        ["Support", "Chat", "120", "20%"],
        ["Sales", "Demos", "150", "25%"],
        ["Sales", "Calls", "50", "8.3%"],
        ["Legal", "Legal", "100", "16.7%"],
      ])
    XCTAssertEqual(
      PMSpecDefault.chartMessages.treemapSummary(model.facts(label: "Storage")),
      "Storage, 5 items in 3 groups. The same data is available as a table.")
  }

  func testSumsItemsBelowTheSecondLevelIntoTheirAncestorThere() {
    let model = tiling([
      PMTreemapItem(
        key: "eng", label: "Engineering", value: 60,
        children: [
          PMTreemapItem(
            key: "platform", label: "Platform", value: 0,
            children: [
              PMTreemapItem(key: "db", label: "Databases", value: 25),
              PMTreemapItem(key: "net", label: "Network", value: 15),
            ]),
          PMTreemapItem(key: "apps", label: "Apps", value: 20),
        ])
    ])
    XCTAssertEqual(model.leaves.map(\.label), ["Platform", "Apps"])
    XCTAssertEqual(model.leaves.map(\.value), [40, 20])
    XCTAssertEqual(model.twinRows.first, ["Engineering", "Platform", "40", "66.7%"])
  }

  func testDrawsAGroupAsTheSumOfItsChildren() {
    let model = tiling([
      PMTreemapItem(
        key: "g", label: "Group", value: 999,
        children: [PMTreemapItem(key: "a", label: "A", value: 10)]),
      PMTreemapItem(key: "b", label: "B", value: 10),
    ])
    XCTAssertEqual(model.total, 20)
  }

  func testLeavesOutZeroNegativeAndMissingValuesListsThemAndCountsThem() {
    let model = tiling([
      PMTreemapItem(key: "a", label: "A", value: 40),
      PMTreemapItem(key: "zero", label: "Zero", value: 0),
      PMTreemapItem(key: "minus", label: "Minus", value: -5),
      PMTreemapItem(key: "nan", label: "Unknown", value: .nan),
    ])
    XCTAssertEqual(model.leaves.map(\.key), ["a"])
    XCTAssertEqual(tiles(model).count, 1)
    XCTAssertEqual(
      model.twinRows, [["A", "40", "100%"], ["Zero", "0", ""], ["Minus", "-5", ""], ["Unknown", "", ""]])
    XCTAssertEqual(
      PMSpecDefault.chartMessages.treemapSummary(model.facts(label: "Storage")),
      "Storage, 4 items. 3 have no positive value and are not drawn. The same data is available as a table.")
  }

  func testDrawsNothingWhenEveryValueIsZeroAndSaysSo() {
    let model = tiling([
      PMTreemapItem(key: "a", label: "A", value: 0), PMTreemapItem(key: "b", label: "B", value: 0),
    ])
    XCTAssertTrue(tiles(model).isEmpty)
    XCTAssertTrue(model.leaves.isEmpty)
    XCTAssertTrue(
      PMSpecDefault.chartMessages.treemapSummary(model.facts(label: "Storage"))
        .contains("2 have no positive value and are not drawn."))
  }

  func testHasNoTilesBeforeThePlotIsMeasured() {
    XCTAssertTrue(tiles(tiling(), width: 0, height: 0).isEmpty)
  }

  func testFillsThePlotWithOneItem() throws {
    let tile = try XCTUnwrap(tiles(tiling(Array(Self.storage.prefix(1)))).first)
    XCTAssertEqual(tile.rect, CGRect(x: 0, y: 0, width: 600, height: 300))
    XCTAssertEqual(tile.plate?.label, "Video")
  }

  func testKeepsEveryTinyItemAPointAcrossBesideOneHugeOneEachWithAHitTarget() {
    let items =
      [PMTreemapItem(key: "huge", label: "Huge", value: 100_000)]
      + (0..<30).map { PMTreemapItem(key: "t\($0)", label: "Tiny \($0)", value: 1) }
    let placed = tiles(tiling(items))
    XCTAssertEqual(placed.count, 31)
    assertTiling(placed.map(\.rect), CGRect(x: 0, y: 0, width: 600, height: 300))
    for tile in placed {
      XCTAssertGreaterThanOrEqual(tile.paint.width, 1 - 1e-9)
      XCTAssertGreaterThanOrEqual(tile.paint.height, 1 - 1e-9)
      XCTAssertGreaterThanOrEqual(tile.hit.width, 24)
      XCTAssertGreaterThanOrEqual(tile.hit.height, 24)
    }
    XCTAssertTrue(placed.dropFirst().allSatisfy { $0.plate == nil })
  }

  func testLabelsATileOnlyWhenItsLabelAndItsValueBothFit() throws {
    let model = tiling([
      PMTreemapItem(key: "big", label: "Video", value: 900),
      PMTreemapItem(key: "long", label: "Archived exports from the previous storage provider", value: 100),
    ])
    let placed = tiles(model, width: 400, height: 240)
    let big = placed[0]
    XCTAssertEqual(
      big.plate,
      PMTreemapTiling.Plate(
        label: "Video", value: "900", x: big.paint.minX + 4, y: big.paint.minY + 4,
        width: big.paint.width - 8))
    XCTAssertNil(placed[1].plate)
  }

  func testLaysOutAtPhoneWidth() {
    assertTiling(
      tiles(tiling(Self.teams), width: 311, height: 224).map(\.rect),
      CGRect(x: 0, y: 0, width: 311, height: 224))
  }

  // MARK: The readout and the selection

  func testSaysTheGroupTheItemItsValueAndItsShare() {
    let model = tiling(Self.teams)
    XCTAssertEqual(model.announcement(2), "Sales, Demos: 150, 25%")
    XCTAssertEqual(model.leaves[2].group, "Sales")
    XCTAssertEqual(model.amount(2), "150 · 25%")
  }

  func testNamesNoGroupForAnItemAtTheTopLevel() {
    XCTAssertEqual(tiling().announcement(0), "Video: 420, 42%")
    XCTAssertNil(tiling().leaves[0].group)
  }

  func testReportsTheItemReadWithItsShareAndNothingPastTheEnd() throws {
    let selection = try XCTUnwrap(tiling().selection(1))
    XCTAssertEqual(selection.key, "images")
    XCTAssertEqual(selection.label, "Images")
    XCTAssertEqual(selection.value, 260)
    XCTAssertEqual(selection.share, 0.26, accuracy: 1e-12)
    XCTAssertNil(tiling().selection(5))
  }
}
