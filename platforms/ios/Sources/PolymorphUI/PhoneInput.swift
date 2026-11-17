// PhoneInput (`design/components/phone-input.md`): a telephone number as one
// E.164 string, entered as a country and a national number. It is a row of
// two members, `space.2` apart, as on the web: Combobox for the country, the
// sheet or popover of the regions whose search field filters them by name or
// by calling code, and Input for the number, a text field with the phone
// keyboard and the telephone number content type, so the system offers the
// person's number. The country starts at the recipe's width
// (`PMRecipe.phoneCountryWidth` × `space.10`) and gives up the row's
// shortfall, and the number takes the rest. Each option is the calling code,
// a left-to-right isolate, then the region's name in `locale` from
// Foundation (`+44 United Kingdom`); without `countries` every region is
// offered, sorted by name in the locale, and a value whose country the list
// lacks puts that country first.
//
// The model is the engine's, in `PolymorphUI+Phones.swift`, with the calling
// codes generated from the engine's table (`Generated/Phones.swift`). Typing
// keeps digits only, or a `+` and digits for a number written with its calling
// code, up to the E.164 limit. The number is committed when the field loses
// focus (Return ends editing), when a country is chosen, and at once when a
// number written with a calling code the table holds arrives whole, pasted or
// filled by the system: a trunk zero is dropped where the country dials one,
// and a shared calling code keeps the country the field shows when it dials
// it. `onChange` reports only a value that differs from the one the field
// holds, and the empty string while the national number has no digits.
// `defaultCountry`, else the first of `countries`, else the United States, is
// the country before the value names one. `readOnly` shows the country as a
// read-only Input, Combobox having no read-only state, and the number as
// selectable text. `value` with `onChange` is the controlled pair.
//
// The country is named by `messages.country` and then the field's name ("Country
// calling code, Phone"), so two phone fields name their country controls apart;
// the number is named by `ariaLabel` or its FormField's label. A FormField's
// description, error and `invalid` reach both controls through the field
// context. `name`, `id`, `ariaRequired` and the `aria-*by` ids have no SwiftUI
// counterpart.

import PolymorphTokens
import SwiftUI

public struct PMPhoneInput: PMPhoneInputRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @Environment(\.locale) private var environmentLocale
  /// The committed value while the app does not hold it.
  @State private var kept: String
  /// The country the reader last chose: the empty value's country, and the
  /// one a shared calling code keeps.
  @State private var chosen: String
  /// The national text being edited, until it commits.
  @State private var draft: String?
  private let props: PMPhoneInputProps

  public init(props: PMPhoneInputProps) {
    self.props = props
    let kept = props.defaultValue ?? ""
    _kept = State(initialValue: kept)
    _chosen = State(
      initialValue: PMPhones.read(
        props.value ?? kept,
        country: PMPhones.defaultCountry(props.defaultCountry, props.countries),
        countries: props.countries
      ).country)
  }

  public var body: some View {
    let size = props.size ?? .md
    let disabled = props.disabled ?? false
    let readOnly = props.readOnly ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let drawn = PMPhones.read(current, country: chosen, countries: props.countries)
    let country = drawn.country
    let national = draft ?? drawn.national
    let options = PMPhones.options(locale: locale, countries: props.countries, include: country)
    let space = theme.defaultDensity.space
    let metrics = PMControlMetrics(size, theme)

    PMPhoneRow(
      gap: space.s2, country: space.s10 * PMRecipe.phoneCountryWidth,
      number: metrics.text.size * PMRecipe.phoneNumberEms + metrics.padding + metrics.padding
    ) {
      countryControl(
        country: country, national: national, options: options, size: size, disabled: disabled,
        readOnly: readOnly, invalid: invalid
      )
      PMInput(
        props: PMInputProps(
          ariaLabel: props.ariaLabel, autoComplete: "tel-national", disabled: disabled,
          invalid: invalid,
          onBlur: { commitDraft(country: country) },
          onChange: { type($0, country: country, national: national) },
          readOnly: readOnly, size: size, type: .tel, value: national))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .pmMember(
      "PhoneInput",
      attributes(
        size, country: country, invalid: invalid, disabled: disabled, readOnly: readOnly,
        options: options))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The country: Combobox, or while read-only a read-only Input showing it.
  @ViewBuilder
  private func countryControl(
    country: String, national: String, options: [PMPhoneOption], size: PMControlSize,
    disabled: Bool, readOnly: Bool, invalid: Bool
  ) -> some View {
    let label = options.first { $0.region == country }?.label ?? ""
    if readOnly {
      PMInput(
        props: PMInputProps(
          ariaLabel: countryName, disabled: disabled, invalid: invalid, readOnly: true, size: size,
          value: label))
    } else {
      PMCombobox(
        props: PMComboboxProps(
          ariaLabel: countryName, disabled: disabled,
          emptyMessage: props.messages?.noCountry ?? PMStrings.phoneInputNoCountry,
          invalid: invalid,
          messages: PMComboboxMessages(
            showOptions: props.messages?.showCountries ?? PMStrings.phoneInputShowCountries,
            options: props.messages?.countriesShown
              ?? { PMStrings.phoneInputCountriesShown(count: $0) }),
          onChange: { next in
            if let next { commit(next, national) }
          },
          options: options.map { PMComboboxOption(value: $0.region, label: $0.label) },
          size: size, value: .some(country)))
    }
  }

  /// The value the field holds: the controlled `value` when given, otherwise
  /// its own.
  private var current: String {
    props.value ?? kept
  }

  private var locale: Locale {
    props.locale.map(Locale.init(identifier:)) ?? environmentLocale
  }

  /// The country control's name: its own word, then the field's.
  private var countryName: String {
    let own = props.messages?.country ?? PMStrings.phoneInputCountry
    guard let name = props.ariaLabel ?? field?.label, !name.isEmpty else { return own }
    return "\(own), \(name)"
  }

  /// Text typed, pasted or filled into the number. A number written with a
  /// calling code the table holds that arrives whole commits at once, as a
  /// paste does on the web; anything else is kept as `PMPhones.draft` keeps it.
  private func type(_ text: String, country: String, national: String) {
    let whole = text.count - national.count > 1
    if whole, text.drop(while: \.isWhitespace).hasPrefix("+"),
      !PMPhones.commit(country, text, countries: props.countries).value.isEmpty
    {
      commit(country, text)
      return
    }
    draft = PMPhones.draft(text, country)
  }

  private func commitDraft(country: String) {
    if let draft { commit(country, draft) }
  }

  /// The reader's commit: the country and the national text become the value.
  private func commit(_ country: String, _ text: String) {
    let result = PMPhones.commit(country, text, countries: props.countries)
    chosen = result.country
    // A number whose calling code the table lacks reports nothing and stays as typed.
    draft = result.value.isEmpty && !result.national.isEmpty ? result.national : nil
    guard result.value != current else { return }
    kept = result.value
    props.onChange?(result.value)
  }

  private func attributes(
    _ size: PMControlSize, country: String, invalid: Bool, disabled: Bool, readOnly: Bool,
    options: [PMPhoneOption]
  ) -> [String: String] {
    var attributes = ["size": size.rawValue, "country": country]
    if !current.isEmpty { attributes["number"] = current }
    if props.countries != nil {
      attributes["options"] = options.map(\.region).joined(separator: ",")
    }
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if readOnly { attributes["readonly"] = "true" }
    return attributes
  }
}

/// The row of the country and the number (`phone-input.module.css`): the
/// country at its width unless the row is short of room, when it gives up the
/// shortfall down to nothing, and the number the rest, never less than its
/// floor. Both are as tall as the taller.
private struct PMPhoneRow: Layout {
  let gap: CGFloat
  /// The width the country starts at.
  let country: CGFloat
  /// The narrowest the number is.
  let number: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? (country + gap + number)
    let widths = split(width)
    let height: CGFloat = zip(subviews, [widths.country, widths.number]).map {
      $0.sizeThatFits(ProposedViewSize(width: $1, height: proposal.height)).height
    }.max() ?? 0
    return CGSize(width: width, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let widths = split(bounds.width)
    var x = bounds.minX
    for (subview, width) in zip(subviews, [widths.country, widths.number]) {
      subview.place(
        at: CGPoint(x: x, y: bounds.minY), anchor: .topLeading,
        proposal: ProposedViewSize(width: width, height: bounds.height))
      x += width + gap
    }
  }

  private func split(_ width: CGFloat) -> (country: CGFloat, number: CGFloat) {
    let shown = max(0, min(country, width - gap - number))
    return (shown, max(0, width - gap - shown))
  }
}

/// PhoneInput's states, from the spec's States table. The numbers are in the
/// ranges their regulators keep for fiction: Ofcom's 020 7946 0xxx in London,
/// and 555-01xx across the North American plan. The locale is pinned, so the
/// country names do not follow the machine drawing them.
public struct PhoneInputStates: PMStates {
  public let member = "PhoneInput"

  public init() {}

  private static let london = "+442079460958"
  private static let sanFrancisco = "+14155550132"
  private static let toronto = "+14165550132"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "empty — the country before the reader chooses one",
        expect: ["size": "md", "country": "GB", "number": ""]
      ) {
        PMPhoneInput(props: PMPhoneInputProps(ariaLabel: "Phone", defaultCountry: "GB", locale: "en-GB"))
      },
      PMStateEntry("with value", expect: ["country": "GB", "number": Self.london]) {
        PMPhoneInput(props: PMPhoneInputProps(ariaLabel: "Phone", defaultValue: Self.london, locale: "en-GB"))
      },
      PMStateEntry("shared code — Canada keeps +1", expect: ["country": "CA", "number": Self.toronto]) {
        PMPhoneInput(
          props: PMPhoneInputProps(
            ariaLabel: "Phone", defaultCountry: "CA", defaultValue: Self.toronto, locale: "en-CA"))
      },
      PMStateEntry(
        "countries — three regions, in the order given", expect: ["country": "IE", "options": "GB,IE,FR"]
      ) {
        PMPhoneInput(
          props: PMPhoneInputProps(
            ariaLabel: "Phone", countries: ["GB", "IE", "FR"], defaultCountry: "IE", locale: "en-GB"))
      },
      PMStateEntry(
        "value outside the list — its country is listed first",
        expect: ["country": "US", "options": "US,GB,IE"]
      ) {
        PMPhoneInput(
          props: PMPhoneInputProps(
            ariaLabel: "Phone", countries: ["GB", "IE"], defaultValue: Self.sanFrancisco,
            locale: "en-GB"))
      },
      PMStateEntry("locale — the names in German", expect: ["country": "GB"]) {
        PMPhoneInput(props: PMPhoneInputProps(ariaLabel: "Telefon", defaultValue: Self.london, locale: "de-DE"))
      },
      PMStateEntry("sizes side by side", expect: ["size": "sm"]) {
        PhoneInputSizes(value: Self.london)
      },
      PMStateEntry("size sm", expect: ["size": "sm"]) {
        PMPhoneInput(
          props: PMPhoneInputProps(ariaLabel: "Phone", defaultValue: Self.london, locale: "en-GB", size: .sm))
      },
      PMStateEntry("size lg", expect: ["size": "lg"]) {
        PMPhoneInput(
          props: PMPhoneInputProps(ariaLabel: "Phone", defaultValue: Self.london, locale: "en-GB", size: .lg))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMPhoneInput(
          props: PMPhoneInputProps(ariaLabel: "Phone", defaultValue: Self.london, invalid: true, locale: "en-GB"))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMPhoneInput(
          props: PMPhoneInputProps(ariaLabel: "Phone", defaultValue: Self.london, disabled: true, locale: "en-GB"))
      },
      PMStateEntry("readOnly — the country as read-only text", expect: ["readonly": "true"]) {
        PMPhoneInput(
          props: PMPhoneInputProps(ariaLabel: "Phone", defaultValue: Self.london, locale: "en-GB", readOnly: true))
      },
      PMStateEntry("in a form — the hidden input carries the value", expect: ["number": Self.london]) {
        PMPhoneInput(
          props: PMPhoneInputProps(ariaLabel: "Phone", defaultValue: Self.london, locale: "en-GB", name: "phone"))
      },
    ]
  }
}

/// The three sizes, stacked a field's gap apart: two controls side by side
/// leave no room for a second field beside them on a phone.
private struct PhoneInputSizes: View {
  @Environment(\.pmTheme) private var theme
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s3) {
      ForEach(PMControlSize.allCases, id: \.self) { size in
        PMPhoneInput(
          props: PMPhoneInputProps(
            ariaLabel: "Phone (\(size.rawValue))", defaultValue: value, locale: "en-GB", size: size))
      }
    }
  }
}
