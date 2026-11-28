import PolymorphTokens
import SwiftUI
import XCTest

@testable import PolymorphUI

/// The input members' arithmetic, held to the engine's own cases: MonthInput's
/// month (`packages/engine/src/dates/segments.test.ts`, "a month and its
/// draft"), DurationInput's counts (`duration.test.ts`) and PhoneInput's model
/// (`phone.test.ts`).
@MainActor
final class InputLogicTests: XCTestCase {
  // MARK: MonthInput

  func testAMonthReadsYearDashMonth() {
    XCTAssertEqual(PMDates.month("2026-07"), PMMonth(year: 2026, month: 7))
    XCTAssertEqual(PMDates.month("0999-12"), PMMonth(year: 999, month: 12))
    for text in ["2026-13", "2026-7", "2026-07-01", "26-07", "", "2026-00", "0000-01", nil] {
      XCTAssertNil(PMDates.month(text), "\(text ?? "nil")")
    }
  }

  func testAMonthWritesAFourDigitYear() {
    XCTAssertEqual(PMDates.text(PMMonth(year: 2026, month: 7)), "2026-07")
    XCTAssertEqual(PMDates.text(PMMonth(year: 202, month: 7)), "0202-07")
  }

  func testAMonthIsHeldInsideItsBounds() {
    let (min, max) = ("2026-03", "2027-02")
    XCTAssertTrue(PMDates.monthOutOfBounds(PMMonth(year: 2026, month: 2), min: min, max: max))
    XCTAssertFalse(PMDates.monthOutOfBounds(PMMonth(year: 2026, month: 3), min: min, max: max))
    XCTAssertFalse(PMDates.monthOutOfBounds(PMMonth(year: 2027, month: 2), min: min, max: max))
    XCTAssertTrue(PMDates.monthOutOfBounds(PMMonth(year: 2027, month: 3), min: min, max: max))
    XCTAssertFalse(PMDates.monthOutOfBounds(nil, min: min, max: max))
    XCTAssertFalse(PMDates.monthOutOfBounds(PMMonth(year: 2020, month: 1), min: "soon", max: nil))
  }

  /// The month and the year in the locale's order (`ja-JP` writes the year
  /// first), as the engine orders the segments.
  func testTheWheelsFollowTheLocalesOrder() {
    XCTAssertFalse(PMDates.yearFirst(Locale(identifier: "en-US")))
    XCTAssertTrue(PMDates.yearFirst(Locale(identifier: "ja-JP")))
  }

  /// The wheels offer only the months between the bounds, and a year turned
  /// to one where the chosen month is out of bounds takes the nearest month in.
  func testTheWheelsOfferOnlyTheMonthsInsideTheBounds() {
    var chosen = PMMonth(year: 2026, month: 8)
    let wheels = PMMonthWheels(
      label: "Billing month", selection: Binding { chosen } set: { chosen = $0 },
      low: PMMonth(year: 2026, month: 3), high: PMMonth(year: 2027, month: 2),
      locale: Locale(identifier: "en-US"), calendar: PMDates.calendar(Locale(identifier: "en-US")))
    XCTAssertEqual(wheels.years, 2026...2027)
    XCTAssertEqual(wheels.months(in: 2026), 3...12)
    XCTAssertEqual(wheels.months(in: 2027), 1...2)
    XCTAssertEqual(wheels.held(year: 2027, month: 8), PMMonth(year: 2027, month: 2))
    XCTAssertEqual(wheels.held(year: 2026, month: 1), PMMonth(year: 2026, month: 3))
  }

  // MARK: DurationInput

  private let dhm = PMDurationOptions()
  private let hm = PMDurationOptions(units: [.hours, .minutes])
  private let minutes = PMDurationOptions(units: [.minutes])
  /// An inactivity lifetime: 15 minutes to 7 days.
  private let inactivity = PMDurationOptions(min: 900, max: 604_800)

  func testAFieldShowsItsUnitsLargestFirstEachOnce() {
    XCTAssertEqual(PMDurations.units(nil), [.days, .hours, .minutes])
    XCTAssertEqual(PMDurations.units([]), [.days, .hours, .minutes])
    XCTAssertEqual(PMDurations.units([.seconds, .minutes, .seconds]), [.minutes, .seconds])
  }

  func testSecondsSplitAcrossTheUnitsTheLargestTakingTheRest() {
    XCTAssertEqual(PMDurations.draft(604_800, dhm), [.days: 7, .hours: 0, .minutes: 0])
    XCTAssertEqual(PMDurations.draft(129_600, hm), [.hours: 36, .minutes: 0])
    XCTAssertEqual(PMDurations.draft(5_400, hm), [.hours: 1, .minutes: 30])
    XCTAssertEqual(PMDurations.draft(nil, dhm), [:])
    XCTAssertEqual(PMDurations.draft(.nan, dhm), [:])
  }

  func testAValueTheUnitsCannotWriteRoundsHalfUp() {
    XCTAssertEqual(PMDurations.draft(90, minutes), [.minutes: 2])
    XCTAssertEqual(PMDurations.draft(89, minutes), [.minutes: 1])
    // The rounding carries: 59 minutes and 45 seconds is an hour at minute grain.
    XCTAssertEqual(PMDurations.draft(3_585, hm), [.hours: 1, .minutes: 0])
  }

  func testADraftSumsBackToSecondsAnEmptyCountAsZero() {
    XCTAssertEqual(PMDurations.total([.days: 7, .hours: 0, .minutes: 0], dhm), 604_800)
    XCTAssertEqual(PMDurations.total([.minutes: 45], dhm), 2_700)
    XCTAssertNil(PMDurations.total([:], dhm))
    XCTAssertEqual(PMDurations.total([.seconds: 30, .minutes: 1], minutes), 60)
  }

  func testAValueIsHeldInsideTheBoundsMovedToWholeCounts() {
    XCTAssertEqual(PMDurations.clamp(300, inactivity), 900)
    XCTAssertEqual(PMDurations.clamp(700_000, inactivity), 604_800)
    XCTAssertEqual(PMDurations.clamp(3_600, inactivity), 3_600)
    XCTAssertEqual(PMDurations.clamp(-60, dhm), 0)
    XCTAssertNil(PMDurations.clamp(nil, inactivity))
    let moved = PMDurations.bounds(PMDurationOptions(units: [.minutes], min: 90, max: 330))
    XCTAssertEqual(moved.min, 120)
    XCTAssertEqual(moved.max, 300)
    let kept = PMDurations.bounds(PMDurationOptions(units: [.minutes], min: 70, max: 100))
    XCTAssertEqual(kept.min, 70)
    XCTAssertEqual(kept.max, 100)
  }

  func testACountStaysUnderTheNextUnitAndTheLargestUnderMax() {
    XCTAssertEqual(PMDurations.range(.minutes, hm), 0...59)
    XCTAssertEqual(PMDurations.range(.hours, dhm), 0...23)
    XCTAssertEqual(PMDurations.range(.minutes, PMDurationOptions(units: [.days, .minutes])), 0...1_439)
    XCTAssertEqual(PMDurations.range(.days, inactivity), 0...7)
    XCTAssertFalse(PMDurations.bounded(.days, dhm))
    XCTAssertTrue(PMDurations.bounded(.days, inactivity))
    XCTAssertTrue(PMDurations.bounded(.hours, dhm))
  }

  func testAStepCarriesStopsAtTheBoundsAndCountsEmptyAsZero() {
    XCTAssertEqual(
      PMDurations.step([.days: 7, .hours: 0, .minutes: 0], .hours, by: 1, dhm),
      [.days: 7, .hours: 1, .minutes: 0])
    XCTAssertEqual(PMDurations.step([.hours: 0, .minutes: 59], .minutes, by: 1, hm), [.hours: 1, .minutes: 0])
    XCTAssertEqual(PMDurations.step([.hours: 1, .minutes: 0], .minutes, by: -1, hm), [.hours: 0, .minutes: 59])
    XCTAssertEqual(
      PMDurations.step([.days: 7, .hours: 0, .minutes: 0], .days, by: 1, inactivity),
      [.days: 7, .hours: 0, .minutes: 0])
    XCTAssertEqual(
      PMDurations.step([.days: 0, .hours: 0, .minutes: 15], .minutes, by: -1, inactivity),
      [.days: 0, .hours: 0, .minutes: 15])
    XCTAssertEqual(PMDurations.step([.hours: 0, .minutes: 30], .hours, by: -1, hm), [.hours: 0, .minutes: 0])
    XCTAssertEqual(PMDurations.step([:], .minutes, by: 1, hm), [.hours: 0, .minutes: 1])
    XCTAssertEqual(PMDurations.step([:], .minutes, by: -1, inactivity), [.days: 0, .hours: 0, .minutes: 15])
    XCTAssertEqual(PMDurations.step(PMDurations.draft(90, minutes), .minutes, by: 1, minutes), [.minutes: 3])
  }

  func testACommitHoldsTheBoundsAndKeepsAValueTheCountsDrawAsIs() {
    let held = PMDurations.commit([.minutes: 5], reported: nil, inactivity)
    XCTAssertEqual(held.draft, [.days: 0, .hours: 0, .minutes: 15])
    XCTAssertEqual(held.value, 900)
    XCTAssertTrue(held.changed)
    let erased = PMDurations.commit([:], reported: 3_600, hm)
    XCTAssertEqual(erased.draft, [:])
    XCTAssertNil(erased.value)
    XCTAssertTrue(erased.changed)
    let kept = PMDurations.commit(PMDurations.draft(90, minutes), reported: 90, minutes)
    XCTAssertEqual(kept.draft, [.minutes: 2])
    XCTAssertEqual(kept.value, 90)
    XCTAssertFalse(kept.changed)
    // Erasing a zero leaves the same seconds.
    XCTAssertFalse(PMDurations.commit([.hours: 1], reported: 3_600, hm).changed)
  }

  /// Each count is written with its unit's short word after it, and said with
  /// its long word, in the locale it is given.
  func testACountTakesItsLocalesWords() {
    let english = Locale(identifier: "en-US")
    XCTAssertEqual(
      [PMDurations.short(7, .days, english), PMDurations.short(0, .hours, english),
       PMDurations.short(15, .minutes, english)],
      [
        PMDurationWords(digits: "7", word: "days", wordFirst: false),
        PMDurationWords(digits: "0", word: "hr", wordFirst: false),
        PMDurationWords(digits: "15", word: "min", wordFirst: false),
      ])
    XCTAssertEqual(PMDurations.spoken(1, .days, english), "1 day")
    XCTAssertEqual(PMDurations.spoken(2, .hours, english), "2 hours")
    XCTAssertEqual(PMDurations.spoken(15, .minutes, english), "15 minutes")
    XCTAssertEqual(PMDurations.name(.minutes, english), "minute")
    let german = Locale(identifier: "de-DE")
    XCTAssertEqual(PMDurations.short(1, .hours, german).word, "Std.")
    XCTAssertEqual(PMDurations.short(30, .minutes, german).word, "Min.")
    XCTAssertEqual(PMDurations.spoken(1, .hours, german), "1 Stunde")
    XCTAssertEqual(PMDurations.spoken(30, .minutes, german), "30 Minuten")
  }

  /// A wheel offers its unit below the next larger unit, the largest as many
  /// as `max` holds, or three digits of it without one.
  func testAWheelOffersWhatItsCountHolds() {
    let wheels = PMDurationWheels(
      label: "Inactivity lifetime", units: [.days, .hours, .minutes], draft: [.days: 7],
      options: inactivity, locale: Locale(identifier: "en-US"), set: { _, _ in })
    XCTAssertEqual(wheels.counts(.days), 0...7)
    XCTAssertEqual(wheels.counts(.minutes), 0...59)
    let open = PMDurationWheels(
      label: "Lifetime", units: [.hours, .minutes], draft: [.hours: 1_200, .minutes: 0], options: hm,
      locale: Locale(identifier: "en-US"), set: { _, _ in })
    XCTAssertEqual(open.counts(.hours), 0...1_200)
  }

  // MARK: PhoneInput (`packages/engine/src/conventions/phone.test.ts`)

  func testTheTableGivesEachRegionItsCallingCodeOnce() {
    XCTAssertEqual(PMPhones.callingCode("GB"), "44")
    XCTAssertEqual(PMPhones.callingCode("us"), "1")
    XCTAssertEqual(PMPhones.callingCode("KZ"), "7")
    XCTAssertEqual(PMPhones.callingCode("AX"), "358")
    XCTAssertEqual(PMPhones.callingCode("XK"), "383")
    XCTAssertNil(PMPhones.callingCode("ZZ"))
    XCTAssertNil(PMPhones.callingCode("AQ"))
    XCTAssertEqual(Set(PMPhones.all).count, PMPhones.all.count)
    XCTAssertGreaterThan(PMPhones.all.count, 240)
    XCTAssertEqual(PMPhones.countries(["de", "GB", "ZZ", "DE"]), ["DE", "GB"])
    let codes = Set(PMPhones.all.compactMap(PMPhones.callingCode))
    for code in codes {
      XCTAssertTrue(codes.filter { $0 != code && $0.hasPrefix(code) }.isEmpty, "+\(code)")
    }
  }

  func testTheListNamesEachRegionAfterItsCodeAndSortsByName() {
    let english = Locale(identifier: "en-US")
    XCTAssertEqual(
      PMPhones.options(locale: english, countries: ["GB", "DE"]).map(\.label),
      ["\u{2066}+44\u{2069} United Kingdom", "\u{2066}+49\u{2069} Germany"])
    XCTAssertEqual(
      PMPhones.options(locale: Locale(identifier: "de-DE"), countries: ["DE"]).first?.label,
      "\u{2066}+49\u{2069} Deutschland")
    let names = PMPhones.options(locale: english).map(\.name)
    XCTAssertEqual(names, names.sorted { $0.compare($1, locale: english) == .orderedAscending })
    XCTAssertEqual(names.count, PMPhones.all.count)
    XCTAssertEqual(
      PMPhones.options(locale: english, countries: ["GB"], include: "us").map(\.region), ["US", "GB"])
    XCTAssertEqual(
      PMPhones.options(locale: english, countries: ["GB"], include: "GB").map(\.region), ["GB"])
  }

  /// What a list says of its count when the app passes no words: the singular
  /// for one (`combobox.md`, `multi-select.md`, `phone-input.md`,
  /// `prompt-input.md`), as the members read the string catalog.
  func testACountSaysOneInTheSingular() {
    let options = PMStrings.combobox(nil).options
    XCTAssertEqual(options(1), "1 option")
    XCTAssertEqual(options(3), "3 options")
    XCTAssertEqual(PMStrings.multiSelectOptions(count: 1), "1 option")
    XCTAssertEqual(PMStrings.multiSelectOptions(count: 0), "0 options")
    XCTAssertEqual(PMStrings.phoneInputCountriesShown(count: 1), "1 country")
    XCTAssertEqual(PMStrings.phoneInputCountriesShown(count: 2), "2 countries")
    XCTAssertEqual(PMStrings.promptInputMessages.suggestions?(1), "1 suggestion")
    XCTAssertEqual(PMStrings.promptInputMessages.suggestions?(4), "4 suggestions")
  }

  func testTheDefaultCountry() {
    XCTAssertEqual(PMPhones.defaultCountry("gb", nil), "GB")
    XCTAssertEqual(PMPhones.defaultCountry(nil, ["FR", "DE"]), "FR")
    XCTAssertEqual(PMPhones.defaultCountry("ZZ", ["ZZ", "DE"]), "DE")
    XCTAssertEqual(PMPhones.defaultCountry(nil, nil), "US")
  }

  func testTheNationalNumberKeepsDigitsDropsATrunkZeroAndStopsAtTheLimit() {
    XCTAssertEqual(PMPhones.draft("(415) 555-0132", "US"), "4155550132")
    XCTAssertEqual(PMPhones.draft("20 7946 0958", "GB"), "2079460958")
    XCTAssertEqual(PMPhones.draft("abc", "GB"), "")
    XCTAssertEqual(PMPhones.draft("+44 20", "US"), "+4420")
    XCTAssertEqual(PMPhones.draft("  +1", "US"), "+1")
    XCTAssertEqual(PMPhones.draft("1+44", "US"), "144")
    XCTAssertEqual(PMPhones.national("GB", "020 7946 0958"), "2079460958")
    XCTAssertEqual(PMPhones.national("DE", "030 1234567"), "301234567")
    XCTAssertEqual(PMPhones.national("AU", "0412 345 678"), "412345678")
    XCTAssertEqual(PMPhones.national("IT", "06 6982 1234"), "0669821234")
    XCTAssertEqual(PMPhones.national("US", "0415"), "0415")
    XCTAssertEqual(PMPhones.national("GB", "00"), "0")
    let many = String(repeating: "9", count: 20)
    XCTAssertEqual(PMPhones.draft(many, "GB").count, PMPhones.maxDigits - 2)
    XCTAssertEqual(PMPhones.draft(many, "US").count, PMPhones.maxDigits - 1)
    XCTAssertEqual(PMPhones.draft(many, "AX").count, PMPhones.maxDigits - 3)
    XCTAssertEqual(PMPhones.draft("0" + many, "GB").count, PMPhones.maxDigits - 1)
    XCTAssertEqual(PMPhones.draft("+" + many, "GB"), "+" + String(repeating: "9", count: PMPhones.maxDigits))
    XCTAssertEqual(PMPhones.value("GB", many).dropFirst().count, PMPhones.maxDigits)
  }

  func testTheValueIsPlusTheCodeAndTheNationalNumber() {
    XCTAssertEqual(PMPhones.value("GB", "020 7946 0958"), "+442079460958")
    XCTAssertEqual(PMPhones.value("US", "(415) 555-0132"), "+14155550132")
    XCTAssertEqual(PMPhones.value("gb", "2079460958"), "+442079460958")
    XCTAssertEqual(PMPhones.value("GB", ""), "")
    XCTAssertEqual(PMPhones.value("GB", "0"), "")
    XCTAssertEqual(PMPhones.value("ZZ", "2079460958"), "")
    XCTAssertTrue(PMPhones.isValue("+442079460958"))
    XCTAssertTrue(PMPhones.isValue("+1" + String(repeating: "2", count: 14)))
    XCTAssertFalse(PMPhones.isValue("+1" + String(repeating: "2", count: 15)))
    XCTAssertFalse(PMPhones.isValue("+44 20 7946 0958"))
    XCTAssertFalse(PMPhones.isValue("4155550132"))
    XCTAssertFalse(PMPhones.isValue("+0123"))
    XCTAssertFalse(PMPhones.isValue(""))
  }

  func testThePasteRule() {
    XCTAssertEqual(PMPhones.split("+44 20 7946 0958"), PMPhoneParts(country: "GB", national: "2079460958"))
    XCTAssertEqual(PMPhones.split("+1 (415) 555-0132"), PMPhoneParts(country: "US", national: "4155550132"))
    XCTAssertEqual(PMPhones.split("+49-30-1234567"), PMPhoneParts(country: "DE", national: "301234567"))
    XCTAssertEqual(PMPhones.split("+358 40 1234567"), PMPhoneParts(country: "FI", national: "401234567"))
    XCTAssertEqual(PMPhones.split("+44 (0)20 7946 0958"), PMPhoneParts(country: "GB", national: "2079460958"))
    for text in ["(415) 555-0132", "020 7946 0958", "+999 123", "+"] {
      XCTAssertNil(PMPhones.split(text), text)
    }
    XCTAssertEqual(PMPhones.split("+1 604 555 0123", country: "CA")?.country, "CA")
    XCTAssertEqual(PMPhones.split("+44 1534 123456", country: "je")?.country, "JE")
    XCTAssertEqual(PMPhones.split("+7 727 123 4567", country: "KZ")?.country, "KZ")
    XCTAssertEqual(PMPhones.split("+1 604 555 0123", country: "GB")?.country, "US")
    XCTAssertEqual(PMPhones.split("+44 20 7946 0958", country: "US")?.country, "GB")
    XCTAssertEqual(PMPhones.split("+7 495 123 4567", country: "DE")?.country, "RU")
    XCTAssertEqual(PMPhones.split("+39 06 6982 1234"), PMPhoneParts(country: "IT", national: "0669821234"))
    XCTAssertEqual(
      PMPhones.split("+1 604 555 0123", country: "GB", countries: ["GB", "CA", "US"])?.country, "CA")
    XCTAssertEqual(
      PMPhones.split("+44" + String(repeating: "9", count: 20))?.national.count, PMPhones.maxDigits - 2)
  }

  func testReadingAValueAndACommit() {
    XCTAssertEqual(PMPhones.read("+442079460958", country: "US"), PMPhoneParts(country: "GB", national: "2079460958"))
    XCTAssertEqual(PMPhones.read("+14165550132", country: "CA"), PMPhoneParts(country: "CA", national: "4165550132"))
    XCTAssertEqual(PMPhones.read("", country: "DE"), PMPhoneParts(country: "DE", national: ""))
    XCTAssertEqual(PMPhones.read("4155550132", country: "US"), PMPhoneParts(country: "US", national: "4155550132"))
    XCTAssertEqual(PMPhones.read("+999123", country: "US"), PMPhoneParts(country: "US", national: "+999123"))
    XCTAssertEqual(
      PMPhones.commit("GB", "020 7946 0958"),
      PMPhoneCommit(country: "GB", national: "2079460958", value: "+442079460958"))
    XCTAssertEqual(PMPhones.commit("GB", ""), PMPhoneCommit(country: "GB", national: "", value: ""))
    XCTAssertEqual(
      PMPhones.commit("US", "+4420 7946 0958"),
      PMPhoneCommit(country: "GB", national: "2079460958", value: "+442079460958"))
    XCTAssertEqual(PMPhones.commit("CA", "+16045550123", countries: ["US", "CA"]).country, "CA")
    XCTAssertEqual(
      PMPhones.commit("US", "+999 123"), PMPhoneCommit(country: "US", national: "+999123", value: ""))
  }
}
