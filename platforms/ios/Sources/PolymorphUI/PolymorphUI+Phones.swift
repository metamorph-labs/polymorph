// PhoneInput's model (`design/components/phone-input.md`), the engine's
// `packages/engine/src/conventions/phone.ts` in Swift: an E.164 string read
// into a country and a national number and built from them, the rules for
// what the national field holds, the paste rule and the country list. The
// calling codes are the engine's table, generated into `Phones.swift`, and the
// regions' names are Foundation's (`Locale.localizedString(forRegionCode:)`),
// the platform's counterpart of `Intl.DisplayNames`. `InputLogicTests` holds
// it to the engine's cases.

import Foundation

/// The calling codes and the rules between a country and a national number.
enum PMPhones {
  /// E.164 allows fifteen digits in all, the calling code's included.
  static let maxDigits = 15

  /// Each region's calling code, by its upper-case code.
  private static let codeOf: [String: String] = {
    var map: [String: String] = [:]
    for (code, regions) in codes {
      for region in regions { map[region] = code }
    }
    return map
  }()

  /// Each calling code's regions, its main region first.
  private static let regionsOf: [String: [String]] = Dictionary(
    uniqueKeysWithValues: codes.map { ($0.code, $0.regions) })

  /// Every region, in the table's order.
  static let all: [String] = codes.flatMap(\.regions)

  /// The calling code a region dials, digits only (`44` for `GB`), or `nil`
  /// for a region the table lacks (`phoneCallingCode`).
  static func callingCode(_ country: String) -> String? {
    codeOf[country.uppercased()]
  }

  /// The regions offered: every region, or the regions of `only` the table
  /// holds, upper-cased, once each, in the order given (`phoneCountries`).
  static func countries(_ only: [String]? = nil) -> [String] {
    guard let only else { return all }
    var kept: [String] = []
    for region in only.map({ $0.uppercased() }) where codeOf[region] != nil && !kept.contains(region) {
      kept.append(region)
    }
    return kept
  }

  /// The country shown before the reader chooses one: `defaultCountry`, else
  /// the first of `countries`, else the table's first region, the United
  /// States (`phoneDefaultCountry`).
  static func defaultCountry(_ named: String?, _ countries: [String]?) -> String {
    self.countries((named.map { [$0] } ?? []) + (countries ?? [])).first ?? all.first ?? ""
  }

  /// Whether `value` is E.164: `+`, a digit that is not zero, then one to
  /// fourteen more (`isPhoneValue`).
  static func isValue(_ value: String) -> Bool {
    guard value.first == "+" else { return false }
    let digits = value.dropFirst()
    return (2...maxDigits).contains(digits.count) && digits.first != "0"
      && digits.allSatisfy(isDigit)
  }

  private static func isDigit(_ character: Character) -> Bool {
    character.isASCII && character.isNumber
  }

  private static func digits(_ text: some StringProtocol) -> String {
    String(text.filter(isDigit))
  }

  /// How many national digits fit under `country` before the E.164 limit.
  private static func room(_ country: String) -> Int {
    maxDigits - (callingCode(country)?.count ?? 0)
  }

  private static func dialsTrunkZero(_ country: String) -> Bool {
    trunkZero.contains(country.uppercased())
  }

  /// A national number as the value holds it: the digits, one leading zero
  /// dropped where the country dials a trunk zero, and no more digits than the
  /// limit leaves (`phoneNational`).
  static func national(_ country: String, _ text: String) -> String {
    let all = digits(text)
    let bare = all.hasPrefix("0") && dialsTrunkZero(country) ? String(all.dropFirst()) : all
    return String(bare.prefix(room(country)))
  }

  /// What the national field holds after the reader types: digits only, or a
  /// `+` and digits for a number written with its calling code, at most the
  /// limit, with one more for a trunk zero (`phoneDraft`).
  static func draft(_ text: String, _ country: String) -> String {
    let trimmed = text.drop { $0.isWhitespace }
    let all = digits(trimmed)
    if trimmed.hasPrefix("+") { return "+" + all.prefix(maxDigits) }
    let zero = all.hasPrefix("0") && dialsTrunkZero(country)
    return String(all.prefix(room(country) + (zero ? 1 : 0)))
  }

  /// The E.164 string for a country and a national number, or the empty
  /// string with no national digits or a region the table lacks (`phoneValue`).
  static func value(_ country: String, _ national: String) -> String {
    guard let calling = callingCode(country) else { return "" }
    let number = self.national(country, national)
    return number.isEmpty ? "" : "+\(calling)\(number)"
  }

  /// The paste rule: a number written with its calling code read into a
  /// country and a national number. A shared code keeps `country` when it
  /// dials it, else takes the first of `countries` that does, else its main
  /// region. `nil` without a `+`, or with no calling code the table holds
  /// (`splitPhone`).
  static func split(
    _ text: String, country: String? = nil, countries: [String]? = nil
  ) -> PMPhoneParts? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.hasPrefix("+") else { return nil }
    let all = digits(trimmed)
    for length in 1...3 where all.count >= length {
      let calling = String(all.prefix(length))
      guard let sharing = regionsOf[calling] else { continue }
      let chosen = country?.uppercased()
      let listed = self.countries(countries ?? []).first { sharing.contains($0) }
      let region = chosen.flatMap { sharing.contains($0) ? $0 : nil } ?? listed ?? sharing[0]
      return PMPhoneParts(country: region, national: national(region, String(all.dropFirst(length))))
    }
    return nil
  }

  /// What the field draws for a value: an E.164 string by the paste rule, the
  /// empty string as `country` with no number, and anything else in the
  /// national field under `country` (`readPhone`).
  static func read(_ value: String, country: String, countries: [String]? = nil) -> PMPhoneParts {
    if value.isEmpty { return PMPhoneParts(country: country, national: "") }
    return split(value, country: country, countries: countries)
      ?? PMPhoneParts(country: country, national: draft(value, country))
  }

  /// What a commit makes of the field: a national text that starts with `+`
  /// split by the paste rule, kept as typed with no value when its code is not
  /// in the table, and any other text the national number under `country`
  /// (`commitPhone`).
  static func commit(
    _ country: String, _ national: String, countries: [String]? = nil
  ) -> PMPhoneCommit {
    if national.drop(while: { $0.isWhitespace }).hasPrefix("+") {
      guard let parts = split(national, country: country, countries: countries) else {
        return PMPhoneCommit(country: country, national: draft(national, country), value: "")
      }
      return PMPhoneCommit(
        country: parts.country, national: parts.national,
        value: value(parts.country, parts.national))
    }
    let number = self.national(country, national)
    return PMPhoneCommit(country: country, national: number, value: value(country, number))
  }

  /// The country list: each region's calling code, a left-to-right isolate,
  /// then its name in `locale`; the regions `countries` names in its order, or
  /// every region sorted by name; and `include` first when the list lacks it,
  /// for a value the app holds (`phoneCountryOptions`). A list is made once per
  /// language, regions and first region, because naming and sorting every
  /// region takes longer than a view's body may.
  @MainActor
  static func options(
    locale: Locale, countries: [String]? = nil, include: String? = nil
  ) -> [PMPhoneOption] {
    let key = [locale.identifier, countries?.joined(separator: ",") ?? "", include ?? ""]
      .joined(separator: "|")
    if let made = madeOptions[key] { return made }
    let made = makeOptions(locale: locale, countries: countries, include: include)
    madeOptions[key] = made
    return made
  }

  /// The lists `options` has made, by language, regions and first region.
  @MainActor private static var madeOptions: [String: [PMPhoneOption]] = [:]

  private static func makeOptions(
    locale: Locale, countries: [String]?, include: String?
  ) -> [PMPhoneOption] {
    var regions = self.countries(countries)
    if let include = include?.uppercased(), codeOf[include] != nil, !regions.contains(include) {
      regions.insert(include, at: 0)
    }
    var options = regions.map { region in
      PMPhoneOption(
        region: region, name: locale.localizedString(forRegionCode: region) ?? region,
        code: callingCode(region) ?? "")
    }
    if countries == nil {
      options.sort { $0.name.compare($1.name, locale: locale) == .orderedAscending }
    }
    return options
  }
}

/// A country and the national number the field shows under it.
struct PMPhoneParts: Equatable {
  let country: String
  /// Digits, or a `+` and digits while the field holds a number it could not split.
  let national: String
}

/// What a commit leaves in the field, and the E.164 value it reports.
struct PMPhoneCommit: Equatable {
  let country: String
  let national: String
  let value: String
}

/// One region of the country list.
struct PMPhoneOption: Equatable {
  let region: String
  let name: String
  /// The calling code, digits only.
  let code: String

  /// `+44 United Kingdom`, the code a left-to-right isolate so it reads `+44`
  /// in a right-to-left page.
  var label: String {
    "\u{2066}+\(code)\u{2069} \(name)"
  }
}
