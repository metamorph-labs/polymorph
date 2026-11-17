// The parts the choosing fields share: the field that opens a list (Combobox,
// DatePicker's kin), Select's trigger (Select, TreeSelect), the wrapping row
// of chips and a text entry (TagInput, MultiSelect), the chip, the option row
// and the option list a sheet or a popover shows (Combobox, MultiSelect), and
// Rating's model.

import PolymorphTokens
import SwiftUI

/// Select's trigger as a button style, which TreeSelect's trigger wears too:
/// Input's container in every state, the value in primary text and the
/// placeholder muted. A pressed trigger keeps the hover border, as the web's
/// open state does, and so does one whose panel is open (`held`).
struct PMSelectTriggerStyle: ButtonStyle {
  let controlSize: PMControlSize
  let invalid: Bool
  let placeholder: Bool
  var held = false

  func makeBody(configuration: Configuration) -> some View {
    PMSelectTrigger(style: self, pressed: configuration.isPressed) { configuration.label }
  }
}

private struct PMSelectTrigger<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  let style: PMSelectTriggerStyle
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let metrics = PMControlMetrics(style.controlSize, theme)
    let colors = theme.colors
    label()
      .pmTextStyle(metrics.text)
      .foregroundStyle(
        (!enabled ? colors.textDisabled : style.placeholder ? colors.textMuted : colors.textPrimary)
          .color
      )
      .padding(.horizontal, metrics.padding)
      .frame(maxWidth: .infinity, minHeight: metrics.height)
      .modifier(
        PMFieldBox(
          invalid: style.invalid, disabled: !enabled, readOnly: false, focused: false,
          held: pressed || style.held)
      )
      .pmHitTarget()
  }
}

/// A row that wraps, as a flex row with `flex-wrap` does: children in reading
/// order, `spacing` apart, onto as many lines as they need, `lineSpacing`
/// apart, each line's children centred on it. The last child takes the rest
/// of its line, at least `lastMinWidth` wide, moving to a line of its own when
/// less is left: the text entry after a field's chips.
struct PMFlowLayout: Layout {
  let spacing: CGFloat
  let lineSpacing: CGFloat
  var lastMinWidth: CGFloat = 0

  private struct Line {
    var items: [(index: Int, size: CGSize)] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func lines(_ width: CGFloat, _ subviews: Subviews) -> [Line] {
    var lines = [Line()]
    for (index, subview) in subviews.enumerated() {
      let last = index == subviews.count - 1
      // Each child at its ideal width, no wider than the line.
      var size = subview.sizeThatFits(.unspecified)
      if last { size.width = max(lastMinWidth, size.width) }
      size.width = min(size.width, width)
      let gap = lines[lines.count - 1].items.isEmpty ? 0 : spacing
      if lines[lines.count - 1].width + gap + size.width > width, !lines[lines.count - 1].items.isEmpty {
        lines.append(Line())
      }
      let start = lines[lines.count - 1].items.isEmpty ? 0 : spacing
      lines[lines.count - 1].items.append((index, size))
      lines[lines.count - 1].width += start + size.width
      lines[lines.count - 1].height = max(lines[lines.count - 1].height, size.height)
    }
    return lines
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? .infinity
    let found = lines(width, subviews)
    let height =
      found.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(0, found.count - 1))
    let widest = found.map(\.width).max() ?? 0
    return CGSize(width: width.isFinite ? width : widest, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var y = bounds.minY
    for line in lines(bounds.width, subviews) {
      var x = bounds.minX
      for item in line.items {
        let last = item.index == subviews.count - 1
        // The text entry takes the rest of its line.
        let width = last ? max(item.size.width, bounds.maxX - x) : item.size.width
        subviews[item.index].place(
          at: CGPoint(x: x, y: y + line.height / 2), anchor: .leading,
          proposal: ProposedViewSize(width: width, height: item.size.height))
        x += width + spacing
      }
      y += line.height + lineSpacing
    }
  }
}

/// A chip (`tag-input.md`): the value's label in `text.sm` `text.primary`,
/// cut with an ellipsis past `PMRecipe.chipLabelMeasure` `space-10` steps, and
/// its remove button, the `close` glyph `sm` in `text.muted` and `danger.text`
/// under the pointer, on a `bg.subtle` pill in a `border.subtle` hairline, the
/// small control height less `space-2` tall, `space-2` across. `flashing`
/// draws the hairline `accent.bg` (a duplicate is pointed at); `focused`,
/// `border.focus`. With no `onRemove`, a disabled field's chip, there is no
/// remove button.
struct PMChip: View {
  @Environment(\.pmTheme) private var theme
  let label: String
  var removeLabel: String? = nil
  var flashing = false
  var onRemove: (@MainActor () -> Void)? = nil

  var body: some View {
    let density = theme.defaultDensity
    let space = density.space
    let colors = theme.colors
    let height = density.controlHeight.sm - space.s2
    let widest = space.s10 * PMRecipe.chipLabelMeasure
    HStack(spacing: space.s1) {
      Text(label)
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(colors.textPrimary.color)
        .lineLimit(1)
        .truncationMode(.tail)
        .frame(maxWidth: widest, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
      if let onRemove {
        Button(action: onRemove) {
          PMIconView(.close, size: .sm)
        }
        .buttonStyle(PMChipRemoveStyle(side: height))
        .accessibilityLabel(Text(removeLabel ?? PMStrings.tagInputRemove(tag: label)))
      }
    }
    .padding(.horizontal, space.s2)
    .frame(height: height)
    .background(colors.bgSubtle.color, in: Capsule())
    .overlay {
      Capsule().strokeBorder((flashing ? colors.accentBg : colors.borderSubtle).color, lineWidth: 1)
    }
    .accessibilityElement(children: .contain)
  }
}

/// A chip's remove button: muted at rest, `danger.text` under the pointer and
/// while pressed, its hit area the hit target around the drawn glyph.
private struct PMChipRemoveStyle: ButtonStyle {
  let side: CGFloat

  func makeBody(configuration: Configuration) -> some View {
    PMChipRemove(side: side, pressed: configuration.isPressed) { configuration.label }
  }
}

private struct PMChipRemove<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @State private var hovering = false
  let side: CGFloat
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let glyph = theme.icon.size.sm
    label()
      .foregroundStyle(
        (hovering || pressed ? theme.colors.dangerText : theme.colors.textMuted).color)
      .frame(width: glyph, height: side)
      .pmPressFeedback(pressed)
      .onHover { hovering = $0 }
      .pmHitTarget(drawn: CGSize(width: glyph, height: side))
  }
}

/// One option in a list (`select.md`'s item recipe, with Combobox's second
/// line): what it shows and what state it is in.
struct PMOptionItem {
  let value: String
  let label: String
  var description: String? = nil
  var disabled = false
  var checked = false
}

/// What an option row's check column holds.
enum PMOptionMark {
  /// The `confirm` glyph in `accent.text` while chosen, nothing while not.
  case check(Bool)
  /// The `add` glyph in `text.muted`: MultiSelect's offer to add typed text.
  case mint
}

/// An option row: the check column (the `sm` glyph's width and a `space-2`
/// gap), the label in `text.sm` `text.primary` and the description under it
/// in `text.xs` `text.muted`; pressed or under the pointer, the
/// `accent.subtle` wash with `accent.text`, which is the transient position,
/// never the choice; disabled, `text.disabled` and no wash. A row is as tall
/// as the hit target on a touch screen, the small control height at least,
/// `space-3` across, `radius.sm`.
struct PMOptionRow: View {
  /// A row's least height: the small control height, and at least the hit
  /// target, because the whole row takes the touch. A Skeleton row while the
  /// list loads takes the same, so arriving rows do not move the list.
  static func height(_ density: PMDensity) -> CGFloat {
    max(density.controlHeight.sm, density.hitTarget)
  }

  @Environment(\.pmTheme) private var theme
  let label: String
  var description: String? = nil
  let mark: PMOptionMark
  var disabled = false
  let action: @MainActor () -> Void

  var body: some View {
    Button(action: action) {
      HStack(alignment: .firstTextBaseline, spacing: theme.defaultDensity.space.s2) {
        Group {
          switch mark {
          case .check(let on):
            PMIconView(.confirm, size: .sm)
              .foregroundStyle(theme.colors.accentText.color)
              .opacity(on ? 1 : 0)
          case .mint:
            PMIconView(.add, size: .sm)
              .foregroundStyle(theme.colors.textMuted.color)
          }
        }
        .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] }
        VStack(alignment: .leading, spacing: theme.defaultDensity.space.s1) {
          Text(label)
          if let description {
            Text(description)
              .pmTextStyle(theme.text.xs)
              .foregroundStyle(
                (disabled ? theme.colors.textDisabled : theme.colors.textMuted).color)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .buttonStyle(PMOptionRowStyle())
    .disabled(disabled)
    .accessibilityLabel(Text(label))
    .pmAccessibilityHint(description)
    .accessibilityAddTraits(isChecked ? .isSelected : [])
  }

  private var isChecked: Bool {
    if case .check(true) = mark { return true }
    return false
  }
}

/// An option row's recipe, and Menu's row's (`select.md`, `menu.md`):
/// `text.sm` in `text.primary` (`danger.text` for a danger command), `space-3`
/// across and `space-2` above and below, `radius.sm`; pressed or under the
/// pointer, the `accent.subtle` wash with `accent.text` (`danger.subtle` with
/// `danger.text`); disabled, `text.disabled` and no wash. On a touch screen
/// the row is as tall as the hit target, the platform's row height, and the
/// wash fills it; the recipe's small control height is its least. An icon in
/// the row reads `pmRowInherits` to take the row's text colour.
struct PMOptionRowStyle: ButtonStyle {
  var danger = false

  func makeBody(configuration: Configuration) -> some View {
    PMOptionRowChrome(danger: danger, pressed: configuration.isPressed) { configuration.label }
  }
}

private struct PMOptionRowChrome<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @State private var hovering = false
  let danger: Bool
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let colors = theme.colors
    let density = theme.defaultDensity
    let highlighted = enabled && (pressed || hovering)
    let text =
      !enabled
      ? colors.textDisabled
      : danger ? colors.dangerText : highlighted ? colors.accentText : colors.textPrimary
    let wash: PMDynamicColor? =
      highlighted ? (danger ? colors.dangerSubtle : colors.accentSubtle) : nil
    label()
      .pmTextStyle(theme.text.sm)
      .foregroundStyle(text.color)
      .environment(\.pmRowInherits, highlighted || danger || !enabled)
      .padding(.horizontal, density.space.s3)
      .padding(.vertical, density.space.s2)
      .frame(maxWidth: .infinity, minHeight: PMOptionRow.height(density))
      .background(wash?.color ?? .clear, in: RoundedRectangle(cornerRadius: theme.radius.sm))
      .contentShape(.rect)
      .onHover { hovering = $0 }
  }
}

private struct PMRowInheritsKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  /// Whether an icon in a row takes the row's text colour: while the row is
  /// highlighted, a danger command, or disabled. At rest it is `text.muted`.
  var pmRowInherits: Bool {
    get { self[PMRowInheritsKey.self] }
    set { self[PMRowInheritsKey.self] = newValue }
  }
}

/// The list Combobox and MultiSelect present (`combobox.md`): a search field
/// at its top, which takes focus, then the options in Select's row recipe;
/// while `loading`, three Skeleton rows at the option height after them, so
/// arriving results do not move the list; with no option and nothing loading,
/// one line of `emptyMessage` in `text.sm` `text.muted`, centred. The rows are
/// `space-2` inside the panel. Presented, the search field stays and the rows
/// scroll under it in a lazy stack (`PMPanelScroll`), so `onLoadMore` is asked
/// for the next page when the last row scrolls into view, at most once per
/// length of the list. A change of what is shown is announced through one
/// voice: the loading status; when loading ends, the count or `emptyMessage`;
/// and `emptyMessage` when the query leaves nothing to show. The list is its
/// member's `part=list`, with how many options it shows and whether it is
/// loading, and each option row its `part=option` with its `value`, `checked`
/// while chosen; the offer to add the typed text is `part=offer`.
struct PMOptionList: View {
  @Environment(\.pmTheme) private var theme
  @State private var asked: Int?
  /// The member that presents the list, whose parts the list and its rows are.
  let member: String
  @Binding var query: String
  let searchLabel: String
  let options: [PMOptionItem]
  var mint: String? = nil
  let loading: Bool
  let emptyMessage: String
  let loadingMessage: String
  let countMessage: (Double) -> String
  var onLoadMore: (@MainActor () -> Void)? = nil
  let onSelect: @MainActor (String) -> Void
  var onMint: (@MainActor () -> Void)? = nil
  var onSubmit: (@MainActor () -> Void)? = nil
  /// Draws the anchored panel's surface and every row in place, as the states
  /// fixture does.
  var framed = false

  var body: some View {
    let space = theme.defaultDensity.space
    VStack(alignment: .leading, spacing: space.s2) {
      PMInput(
        props: PMInputProps(
          ariaLabel: searchLabel, autoFocus: !framed, clearable: true, icon: .search,
          onChange: { query = $0 }, placeholder: PMStrings.search, type: .search,
          value: query))
      .onSubmit { onSubmit?() }
      if framed {
        VStack(alignment: .leading, spacing: 0) { rows }
      } else {
        PMPanelScroll {
          LazyVStack(alignment: .leading, spacing: 0) { rows }
        }
      }
    }
    .padding(space.s2)
    .modifier(PMPanelFrame(visible: framed))
    .accessibilityElement(children: .contain)
    .pmMember(
      member,
      ["part": "list", "options": String(options.count)].merging(
        loading ? ["loading": "true"] : [:], uniquingKeysWith: { a, _ in a })
    )
    .onChange(of: loading) { _, now in
      if now {
        announce(loadingMessage)
      } else {
        announce(empty ? emptyMessage : countMessage(Double(options.count)))
      }
    }
    .onChange(of: empty) { _, now in
      if now && !loading { announce(emptyMessage) }
    }
  }

  @ViewBuilder
  private var rows: some View {
    let space = theme.defaultDensity.space
    ForEach(Array(options.enumerated()), id: \.element.value) { index, option in
      PMOptionRow(
        label: option.label, description: option.description, mark: .check(option.checked),
        disabled: option.disabled
      ) { onSelect(option.value) }
      .pmMember(
        member,
        ["part": "option", "value": option.value].merging(
          option.checked ? ["checked": "true"] : [:], uniquingKeysWith: { a, _ in a })
      )
      .onAppear { if index == options.count - 1 { askForMore() } }
    }
    if let mint, let onMint {
      PMOptionRow(label: mint, mark: .mint, action: onMint)
        .pmMember(member, ["part": "offer"])
    }
    if loading {
      ForEach(0..<3, id: \.self) { _ in
        PMSkeleton(props: PMSkeletonProps(textStep: .sm))
          .padding(.horizontal, space.s3)
          .frame(minHeight: PMOptionRow.height(theme.defaultDensity))
      }
    } else if empty {
      Text(emptyMessage)
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(theme.colors.textMuted.color)
        .frame(maxWidth: .infinity, minHeight: theme.defaultDensity.controlHeight.sm)
        .multilineTextAlignment(.center)
    }
  }

  /// Nothing to show: no option and no offer to add the typed text.
  private var empty: Bool {
    options.isEmpty && mint == nil
  }

  private func askForMore() {
    guard !loading, let onLoadMore, asked != options.count else { return }
    asked = options.count
    onLoadMore()
  }

  private func announce(_ text: String) {
    AccessibilityNotification.Announcement(text).post()
  }
}

extension PMOptionItem {
  /// Whether `label` holds `query` by `filter`, in the person's locale,
  /// ignoring case and accents: `contains` (the default), `startsWith`, or
  /// `off`, when the app has filtered and every option is shown.
  static func matches(_ label: String, _ query: String, _ filter: PMComboboxFilter?) -> Bool {
    let query = query.trimmingCharacters(in: .whitespaces)
    guard !query.isEmpty else { return true }
    switch filter ?? .contains {
    case .contains: return label.localizedStandardContains(query)
    case .startsWith:
      return label.range(
        of: query, options: [.caseInsensitive, .diacriticInsensitive, .anchored],
        locale: .current) != nil
    case .off: return true
    }
  }
}

/// A field that opens a list or a picker (Combobox): Input's container at its
/// size, showing `text` (muted while it is the placeholder), the clear button
/// when there is a `clearLabel`, and the `expand` chevron, turned half a turn
/// while `open`, or the spinning `loading` glyph while `loading`. The text and
/// the chevron are one button that opens; the clear button is its own. A tap
/// anywhere else in the field's hit area opens it too. The opening button is
/// named `name` with the value `value` and the hint `hint`, "Invalid" first
/// while invalid; the clear button is Combobox's `part=clear`.
struct PMChoiceField: View {
  @Environment(\.pmTheme) private var theme
  let text: String
  let placeholder: Bool
  let size: PMControlSize
  let invalid: Bool
  let disabled: Bool
  let open: Bool
  var loading = false
  let name: String
  let value: String
  var hint: String? = nil
  var clearLabel: String? = nil
  let chevronLabel: String
  let onOpen: @MainActor () -> Void
  var onClear: @MainActor () -> Void = {}

  var body: some View {
    let metrics = PMControlMetrics(size, theme)
    let colors = theme.colors
    HStack(spacing: metrics.gap) {
      Button(action: onOpen) {
        Text(text)
          .lineLimit(1)
          .truncationMode(.tail)
          .foregroundStyle(
            (disabled ? colors.textDisabled : placeholder ? colors.textMuted : colors.textPrimary)
              .color
          )
          .frame(maxWidth: .infinity, minHeight: metrics.height, alignment: .leading)
          // The field's hit target is the button's: the box stays its height.
          .pmHitRegion(height: metrics.height)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(name))
      .accessibilityValue(Text(value))
      .pmFieldHint(invalid: invalid, hint)
      if let clearLabel {
        Button(action: onClear) {
          PMIconView(.clear, size: size)
        }
        .buttonStyle(PMEmbeddedButtonStyle(side: metrics.height))
        .accessibilityLabel(Text(clearLabel))
        .pmMember("Combobox", ["part": "clear"])
      }
      Button(action: onOpen) {
        Group {
          if loading {
            PMSpinGlyph(controlSize: size)
          } else {
            PMTurningChevron(
              role: .expand, open: open, turn: .degrees(180), size: size, color: nil)
          }
        }
      }
      .buttonStyle(PMEmbeddedButtonStyle(side: metrics.height))
      .accessibilityLabel(Text(chevronLabel))
    }
    .pmTextStyle(metrics.text)
    .padding(.leading, metrics.padding)
    .frame(maxWidth: .infinity, minHeight: metrics.height)
    .modifier(
      PMFieldBox(invalid: invalid, disabled: disabled, readOnly: false, focused: false, held: open))
    .disabled(disabled)
    .pmHitTarget()
    .pmOpensOnTap(!disabled, onOpen)
    .accessibilityElement(children: .contain)
  }
}

// MARK: - Rating

/// Rating's model (`rating.md`), the engine's `ratingModel`, `ratingPress` and
/// the steps of `ratingStep` a native rating takes: how many marks there are,
/// what the rating holds, what each mark draws and is named, and the shown
/// rating's sentence. A control holds a whole mark from 1 to its most, or
/// nothing; a shown rating holds any value from 0 to its most, to one decimal
/// place, so the picture and the sentence agree.
@MainActor
struct PMRatingModel {
  /// How much of a mark is drawn filled.
  enum Fill: String {
    case full, part, none
  }

  /// One mark: the value choosing it sets, its fill, the filled share of a
  /// part-filled mark (0 to 1), and its name.
  struct Mark {
    let value: Int
    let fill: Fill
    let share: Double
    let name: String
  }

  /// The number of marks: a whole number from 2 to 10.
  let max: Int
  /// What the rating holds after rounding.
  let value: Double?
  let marks: [Mark]
  /// The shown rating's accessible name, one sentence.
  let sentence: String

  /// The marks a rating has when it is not told.
  static let defaultMax = 5
  /// One mark is a toggle, which is a pressed Button.
  static let fewest = 2
  /// Past ten, a reader counts marks instead of reading them.
  static let most = 10
  /// A shown rating's places: tenths.
  static let tenths = 10

  init(
    value: Double?, label: String, max: Double?, readOnly: Bool, locale: Locale,
    messages: PMRatingMessages?
  ) {
    let count = Self.count(max)
    let held = Self.held(value, max: count, readOnly: readOnly)
    let whole = { (number: Int) in number.formatted(.number.locale(locale)) }
    let mark: @MainActor (Double, String) -> String =
      messages?.mark ?? { (value: Double, numeral: String) in
        value == 1 ? PMStrings.ratingStar(numeral: numeral) : PMStrings.ratingStars(numeral: numeral)
      }
    let shown: @MainActor (String, String, String) -> String =
      messages?.shown ?? { PMStrings.ratingShown(label: $0, value: $1, max: $2) }
    self.max = count
    self.value = held
    marks = (1...count).map { at in
      // The share of this mark the value covers: 1 at or under it, 0 past it.
      let covered = Swift.min(1, Swift.max(0, (held ?? 0) - Double(at - 1)))
      let fill: Fill = covered >= 1 ? .full : covered <= 0 ? .none : .part
      return Mark(value: at, fill: fill, share: covered, name: mark(Double(at), whole(at)))
    }
    sentence = shown(
      label, (held ?? 0).formatted(.number.precision(.fractionLength(0...1)).locale(locale)),
      whole(count))
  }

  /// The number of marks for a given `max`: whole, from 2 to 10, and 5 when it is not a number.
  static func count(_ max: Double?) -> Int {
    guard let max, max.isFinite else { return defaultMax }
    return Swift.min(most, Swift.max(fewest, Int(max.rounded())))
  }

  /// What a rating holds, rounded as its form needs: a whole mark in a
  /// control, nothing for no value, 0 or less; tenths inside 0 and its most
  /// when shown.
  static func held(_ value: Double?, max: Int, readOnly: Bool) -> Double? {
    guard let value, value.isFinite else { return nil }
    let places = Double(tenths)
    if readOnly { return Swift.min(Double(max), Swift.max(0, (value * places).rounded() / places)) }
    let whole = Swift.min(Double(max), value.rounded())
    return whole < 1 ? nil : whole
  }

  /// What a press on a mark leaves the rating holding: that mark, or nothing
  /// when it held that mark already. A required rating keeps the mark.
  static func press(_ mark: Int, holding: Int?, required: Bool) -> Int? {
    if mark != holding { return mark }
    return required ? mark : nil
  }

  /// The mark one step from `from`, forward or back, stopping at either end:
  /// one step past the top would set the lowest score.
  static func step(from: Int, forward: Bool, max: Int) -> Int {
    Swift.min(max, Swift.max(1, from + (forward ? 1 : -1)))
  }
}
