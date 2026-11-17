import Foundation
import XCTest

@testable import PolymorphUI

/// Countdown's time (`PMCountdownTime`), held to the engine's own cases
/// (`packages/engine/src/conventions/countdown.test.ts`): the moment, the
/// whole seconds left, the digits, the words and the marks.
final class CountdownTimeTests: XCTestCase {
  private let utc = TimeZone(identifier: "UTC")!
  private let english = Locale(identifier: "en-US")
  private var now: Date {
    DateComponents(
      calendar: Calendar(identifier: .gregorian), timeZone: utc, year: 2026, month: 8, day: 7,
      hour: 12
    ).date!
  }

  func testTheMomentReadsAnInstantWithItsOffset() {
    let five = now.addingTimeInterval(300)
    XCTAssertEqual(PMCountdownTime.moment("2026-08-07T12:05:00Z", timeZone: utc), five)
    XCTAssertEqual(PMCountdownTime.moment("2026-08-07T14:05:00+02:00", timeZone: utc), five)
  }

  func testAnInstantWithoutAnOffsetIsReadInTheReadersTimeZone() {
    let berlin = TimeZone(identifier: "Europe/Berlin")!
    XCTAssertEqual(
      PMCountdownTime.moment("2026-08-07T14:05:00", timeZone: berlin), now.addingTimeInterval(300))
  }

  func testACalendarDateOrAValueThatIsNotAMomentNamesNone() {
    XCTAssertNil(PMCountdownTime.moment("2026-08-07", timeZone: utc))
    XCTAssertNil(PMCountdownTime.moment("not-a-moment", timeZone: utc))
    XCTAssertNil(PMCountdownTime.moment("", timeZone: utc))
  }

  func testTheTimeLeftIsWholeSecondsRoundedUpAndNeverBelowZero() {
    XCTAssertEqual(PMCountdownTime.left(now.addingTimeInterval(299), now: now), 299)
    XCTAssertEqual(PMCountdownTime.left(now.addingTimeInterval(298.001), now: now), 299)
    XCTAssertEqual(PMCountdownTime.left(now.addingTimeInterval(0.001), now: now), 1)
    XCTAssertEqual(PMCountdownTime.left(now, now: now), 0)
    XCTAssertEqual(PMCountdownTime.left(now.addingTimeInterval(-5), now: now), 0)
  }

  func testTheDigitsAreMinutesAndSecondsUnderAnHourAndHoursFromAnHour() {
    let clock = { PMCountdownTime.clock($0, locale: self.english) }
    XCTAssertEqual(clock(299), "4:59")
    XCTAssertEqual(clock(65), "1:05")
    XCTAssertEqual(clock(9), "0:09")
    XCTAssertEqual(clock(0), "0:00")
    XCTAssertEqual(clock(3600), "1:00:00")
    XCTAssertEqual(clock(3725), "1:02:05")
    XCTAssertEqual(clock(36_059), "10:00:59")
    XCTAssertEqual(clock(1000 * 3600), "1000:00:00")
    XCTAssertEqual(clock(-3), "0:00")
  }

  func testTheDigitsAreTheLocalesNumerals() {
    XCTAssertEqual(PMCountdownTime.clock(299, locale: Locale(identifier: "ar-EG")), "٤:٥٩")
    XCTAssertEqual(
      PMCountdownTime.clock(3725, locale: Locale(identifier: "hi-IN@numbers=deva")), "१:०२:०५")
  }

  func testTheWordsSayEachUnitThatIsNotZero() {
    let spoken = { PMCountdownTime.spoken($0, locale: self.english) }
    XCTAssertEqual(spoken(299), "4 minutes, 59 seconds")
    XCTAssertEqual(spoken(60), "1 minute")
    XCTAssertEqual(spoken(3725), "1 hour, 2 minutes, 5 seconds")
    XCTAssertEqual(spoken(1), "1 second")
    XCTAssertEqual(spoken(0), "0 seconds")
  }

  func testTheWordsAreTheLocalesOwn() {
    let spoken = PMCountdownTime.spoken(299, locale: Locale(identifier: "de"))
    XCTAssertTrue(spoken.hasPrefix("4 Minuten"), spoken)
    XCTAssertTrue(spoken.hasSuffix("59 Sekunden"), spoken)
  }

  func testAChangeMarksOneMinuteAndTenSecondsButNotTheEnd() {
    XCTAssertTrue(PMCountdownTime.marked(from: 61, to: 60))
    XCTAssertTrue(PMCountdownTime.marked(from: 11, to: 10))
    XCTAssertTrue(PMCountdownTime.marked(from: 65, to: 55), "a mark the clock passed between readings")
    XCTAssertFalse(PMCountdownTime.marked(from: 60, to: 59), "a count that starts on a mark")
    XCTAssertFalse(PMCountdownTime.marked(from: 30, to: 29))
    XCTAssertFalse(PMCountdownTime.marked(from: 1, to: 0), "the end is not a mark")
  }
}
