import Foundation
import XCTest

@testable import PolymorphUI

/// Rating's model (`PMRatingModel`), held to the engine's own cases
/// (`packages/engine/src/conventions/rating.test.ts`): the rounding, the
/// fills, the words, a press and a step.
@MainActor
final class RatingModelTests: XCTestCase {
  private let english = Locale(identifier: "en")

  private func model(
    _ value: Double?, label: String = "Rating", readOnly: Bool = false, max: Double? = nil,
    locale: Locale? = nil, messages: PMRatingMessages? = nil
  ) -> PMRatingModel {
    PMRatingModel(
      value: value, label: label, max: max, readOnly: readOnly, locale: locale ?? english,
      messages: messages)
  }

  func testTheMostIsFiveWhenNotToldAndAWholeNumberFromTwoToTen() {
    XCTAssertEqual(PMRatingModel.count(nil), 5)
    XCTAssertEqual(PMRatingModel.count(.nan), 5)
    XCTAssertEqual(PMRatingModel.count(10), 10)
    XCTAssertEqual(PMRatingModel.count(7.4), 7)
    XCTAssertEqual(PMRatingModel.count(1), 2)
    XCTAssertEqual(PMRatingModel.count(40), 10)
  }

  func testAControlHoldsAWholeMarkAndNothingForNoValueZeroOrLess() {
    XCTAssertEqual(model(3).value, 3)
    XCTAssertEqual(model(3.6).value, 4)
    XCTAssertEqual(model(9).value, 5)
    XCTAssertNil(model(0).value)
    XCTAssertNil(model(-2).value)
    XCTAssertNil(model(nil).value)
  }

  func testAControlFillsEachMarkUpToTheOneItHoldsAndNoMarkInPart() {
    XCTAssertEqual(model(3).marks.map(\.fill), [.full, .full, .full, .none, .none])
    XCTAssertEqual(model(nil).marks.map(\.fill), [.none, .none, .none, .none, .none])
    XCTAssertEqual(model(4.4).marks.map(\.fill), [.full, .full, .full, .full, .none])
  }

  func testEachMarkIsNamedByTheValueItSetsInThePluralTheCountTakes() {
    XCTAssertEqual(
      model(nil).marks.map(\.name), ["1 star", "2 stars", "3 stars", "4 stars", "5 stars"])
  }

  func testAShownRatingHoldsAFractionToOneDecimalPlaceInsideZeroAndItsMost() {
    XCTAssertEqual(model(4.34, readOnly: true).value, 4.3)
    XCTAssertEqual(model(7, readOnly: true).value, 5)
    XCTAssertEqual(model(-1, readOnly: true).value, 0)
  }

  func testAShownRatingFillsTheMarkTheFractionLandsInByItsShare() throws {
    let marks = model(4.3, readOnly: true).marks
    XCTAssertEqual(marks.map(\.fill), [.full, .full, .full, .full, .part])
    XCTAssertEqual(try XCTUnwrap(marks.last).share, 0.3, accuracy: 0.0001)
    XCTAssertEqual(marks[3].share, 1)
  }

  func testAShownRatingSaysTheLabelTheValueAndTheMostInOneSentence() {
    XCTAssertEqual(
      model(4.34, label: "Average rating", readOnly: true).sentence, "Average rating: 4.3 out of 5")
    XCTAssertEqual(model(nil, readOnly: true).sentence, "Rating: 0 out of 5")
  }

  func testTheNumeralsAreWrittenInTheLocalesDigitsAndDecimalSign() {
    let shown = model(4.3, label: "Note", readOnly: true, locale: Locale(identifier: "de"))
    XCTAssertEqual(shown.sentence, "Note: 4,3 out of 5")
    let arabic = model(2, locale: Locale(identifier: "ar-EG"))
    XCTAssertEqual(arabic.marks[1].name, "٢ stars")
  }

  func testTheWordsComeFromTheMessagesWithTheNumbersAlreadyWritten() {
    let german = PMRatingMessages(
      mark: { value, numeral in "\(numeral) \(value == 1 ? "Stern" : "Sterne")" },
      shown: { label, value, max in "\(label): \(value) von \(max)" })
    let shown = model(
      3.5, label: "Bewertung", readOnly: true, max: 4, locale: Locale(identifier: "de"),
      messages: german)
    XCTAssertEqual(shown.sentence, "Bewertung: 3,5 von 4")
    XCTAssertEqual(shown.marks.map(\.name), ["1 Stern", "2 Sterne", "3 Sterne", "4 Sterne"])
  }

  func testAPressChoosesTheMarkAndClearsTheMarkTheRatingHeld() {
    XCTAssertEqual(PMRatingModel.press(3, holding: nil, required: false), 3)
    XCTAssertEqual(PMRatingModel.press(3, holding: 2, required: false), 3)
    XCTAssertNil(PMRatingModel.press(3, holding: 3, required: false))
    XCTAssertEqual(PMRatingModel.press(3, holding: 3, required: true), 3, "a required rating keeps its mark")
  }

  func testAStepMovesByOneAndStopsAtEitherEnd() {
    XCTAssertEqual(PMRatingModel.step(from: 2, forward: true, max: 5), 3)
    XCTAssertEqual(PMRatingModel.step(from: 2, forward: false, max: 5), 1)
    XCTAssertEqual(PMRatingModel.step(from: 5, forward: true, max: 5), 5)
    XCTAssertEqual(PMRatingModel.step(from: 1, forward: false, max: 5), 1)
  }
}
