import Foundation
import XCTest

@testable import PolymorphUI

/// `PolymorphUI+Clock.swift` held to the engine's cases for `clockTime` and
/// `spokenDuration` (`packages/engine/src/conventions/audio.test.ts` and
/// `time-text.test.ts`): the clock AudioPlayer and RecordButton write and the
/// lengths AudioPlayer says.
final class ClockTextTests: XCTestCase {
  private let english = Locale(identifier: "en_US")

  func testTheClockWritesMinutesAndTwoDigitSeconds() {
    XCTAssertEqual(PMClock.digits(0, english), "0:00")
    XCTAssertEqual(PMClock.digits(5, english), "0:05")
    XCTAssertEqual(PMClock.digits(9, english), "0:09")
    XCTAssertEqual(PMClock.digits(65, english), "1:05")
    XCTAssertEqual(PMClock.digits(600, english), "10:00")
  }

  func testTheClockPutsTheHoursInFrontFromAnHourOn() {
    XCTAssertEqual(PMClock.digits(3599, english), "59:59")
    XCTAssertEqual(PMClock.digits(3600, english), "1:00:00")
    XCTAssertEqual(PMClock.digits(3725, english), "1:02:05")
    XCTAssertEqual(PMClock.digits(90_061, english), "25:01:01")
    XCTAssertEqual(PMClock.digits(1000 * 3600, english), "1000:00:00")
  }

  func testTheClockDropsTheFractionAndReadsNoLengthAsNoTime() {
    XCTAssertEqual(PMClock.digits(12.9, english), "0:12")
    XCTAssertEqual(PMClock.digits(.nan, english), "0:00")
    XCTAssertEqual(PMClock.digits(.infinity, english), "0:00")
    XCTAssertEqual(PMClock.digits(-4, english), "0:00")
  }

  func testTheClockWritesTheLocalesNumeralsAroundAColon() {
    XCTAssertEqual(PMClock.digits(65, Locale(identifier: "ar_EG")), "١:٠٥")
    XCTAssertEqual(PMClock.digits(3725, Locale(identifier: "hi_IN@numbers=deva")), "१:०२:०५")
  }

  func testTheWordsSayEachUnitThatIsNotZero() {
    XCTAssertEqual(PMClock.words(1, english), "1 second")
    XCTAssertEqual(PMClock.words(5, english), "5 seconds")
    XCTAssertEqual(PMClock.words(60, english), "1 minute")
    XCTAssertEqual(PMClock.words(65, english), "1 minute, 5 seconds")
    XCTAssertEqual(PMClock.words(3725, english), "1 hour, 2 minutes, 5 seconds")
    XCTAssertEqual(PMClock.words(90_061, english), "25 hours, 1 minute, 1 second")
  }

  func testTheWordsSayNoLengthAsZeroSeconds() {
    XCTAssertEqual(PMClock.words(0, english), "0 seconds")
    XCTAssertEqual(PMClock.words(0.4, english), "0 seconds")
  }

  func testTheWordsAreTheLocales() {
    let german = PMClock.words(65, Locale(identifier: "de_DE"))
    XCTAssertTrue(german.contains("Minute"), german)
    XCTAssertTrue(german.contains("Sekunden"), german)
  }
}
