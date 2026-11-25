// The parts several controls share: the field family's container (Input,
// Textarea, Select's trigger), the embedded adornment button (Input's clear),
// the tap that opens a field from anywhere in its hit area and the box it
// publishes, a text field's text kept to its `maxLength`, the keyboard a text
// field's type asks for, the label row of a row-labelled control and its name
// when it has one (Checkbox, Switch), the spinning `loading` glyph (Button,
// Spinner), a sortable header's glyph and value (Table, DataTable), a file's
// size as text (FileUpload, AttachmentChip), the pasteboard a copy control
// writes to (CodeBlock, CopyButton), the disclosure's trigger and region
// (Accordion, Collapsible), and a field's error row (FormField, InlineEdit).

import PolymorphTokens
import SwiftUI

#if canImport(UIKit)
  import UIKit
#elseif canImport(AppKit)
  import AppKit
#endif

/// The field family's container (Input, Textarea, Select's trigger): the
/// surface, the border, the seat and the focus ring, in every state of
/// Input's recipe. Disabled wins over invalid, as it comes last in the
/// recipe; an invalid border stays under the pointer; `held` keeps the hover
/// border, as a pressed Select trigger does.
struct PMFieldBox: ViewModifier {
  @Environment(\.pmTheme) private var theme
  @State private var hovering = false
  let invalid: Bool
  let disabled: Bool
  let readOnly: Bool
  let focused: Bool
  var held = false

  func body(content: Content) -> some View {
    let colors = theme.colors
    let motion = theme.defaultMotion
    let shape = RoundedRectangle(cornerRadius: theme.radius.control)
    let border =
      disabled
      ? colors.borderSubtle
      : invalid
        ? colors.dangerBorder
        : (hovering || held) && !readOnly ? colors.borderStrong : colors.borderField

    content
      .background {
        shape
          .fill((disabled ? colors.bgSubtle : colors.bgSurface).color)
          // The seat says the field is ready, so a disabled field has none.
          .pmShadow(disabled ? PMShadow(layers: []) : theme.shadows.seat)
      }
      .overlay { shape.strokeBorder(border.color, lineWidth: 1) }
      .pmFocusRing(focused && !disabled, cornerRadius: theme.radius.control, stateBorder: invalid)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control),
        value: [hovering, held, invalid, disabled]
      )
      .onHover { hovering = $0 }
  }
}

/// The embedded-adornment convention (input.md, the clear button's recipe): a
/// square as tall as the control, muted at rest, primary on a `bg.subtle` wash
/// of its own `radius.sm` under the pointer and while pressed, with press
/// feedback. Its hit area reaches the hit target without growing the field.
/// A pair of embedded buttons (NumberInput's steppers) is narrower than the
/// field is tall: `width` sets it, and the height stays `side`.
struct PMEmbeddedButtonStyle: ButtonStyle {
  let side: CGFloat
  var width: CGFloat? = nil

  func makeBody(configuration: Configuration) -> some View {
    PMEmbeddedButton(side: side, width: width ?? side, pressed: configuration.isPressed) {
      configuration.label
    }
  }
}

private struct PMEmbeddedButton<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @State private var hovering = false
  let side: CGFloat
  let width: CGFloat
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let colors = theme.colors
    // A disabled button (a stepper at its rail) takes no hover fill and no press.
    let active = enabled && (hovering || pressed)
    label()
      .foregroundStyle(
        (!enabled ? colors.textDisabled : active ? colors.textPrimary : colors.textMuted).color
      )
      .frame(width: width, height: side)
      .background(
        (active ? colors.bgSubtle.color : .clear),
        in: RoundedRectangle(cornerRadius: theme.radius.sm)
      )
      .pmPressFeedback(active && pressed)
      .onHover { hovering = $0 }
      .pmHitTarget(drawn: CGSize(width: width, height: side))
  }
}

/// A tap in a field's hit area that its own buttons do not take: it opens
/// what the field opens (a text field's focus, a choosing field's panel), as a
/// press on the web's field does. The buttons in the field keep their own
/// taps, because a child's gesture comes first. The whole of the view's frame
/// takes the tap, and the frame is published as the field's box
/// (`PMTapBoxKey`) in every state, disabled and read-only included.
///
/// The exclusive tap acts only while `enabled`, and is not attached
/// otherwise: a field that holds a system control (a filled date, a filled
/// time) leaves its taps to the control, and a disabled field takes none. The
/// simultaneous tap is for a field whose text view places its caret where the
/// tap lands (Textarea, PromptInput): the text view keeps the tap and the
/// field is focused too. It takes no tap from the views in it, so it stays
/// attached and does nothing while not `enabled`.
private struct PMOpensOnTap: ViewModifier {
  let enabled: Bool
  let simultaneous: Bool
  let action: @MainActor () -> Void

  func body(content: Content) -> some View {
    let area = content.contentShape(.rect).pmTapBox()
    if simultaneous {
      area.simultaneousGesture(TapGesture().onEnded { if enabled { action() } })
    } else if enabled {
      area.onTapGesture { action() }
    } else {
      area
    }
  }
}

/// The boxes that take a text entry's tap: the bounds of each view
/// `pmOpensOnTap` takes a tap in, all of which is hit-testable. The simulator
/// audit reads them with the entry hosted and holds a hosted text field or
/// text view to the smallest box that contains it, because the member's box,
/// not the editable line UIKit publishes as the element, is where a person
/// taps. A preference adds no view and no accessibility element, and draws
/// nothing.
struct PMTapBoxKey: PreferenceKey {
  static let defaultValue: [Anchor<CGRect>] = []

  static func reduce(value: inout [Anchor<CGRect>], nextValue: () -> [Anchor<CGRect>]) {
    value.append(contentsOf: nextValue())
  }
}

extension View {
  /// Runs `action` on a tap in the view's hit area outside its buttons, while
  /// `enabled`, and publishes the area as the field's box. Apply it after
  /// `pmHitTarget()`, so the area is the hit target. `simultaneous` lets the
  /// text view in the view take the tap as well.
  func pmOpensOnTap(
    _ enabled: Bool, simultaneous: Bool = false, _ action: @escaping @MainActor () -> Void
  ) -> some View {
    modifier(PMOpensOnTap(enabled: enabled, simultaneous: simultaneous, action: action))
  }

  /// Publishes the view's bounds as a box that takes a tap (`PMTapBoxKey`).
  fileprivate func pmTapBox() -> some View {
    anchorPreference(key: PMTapBoxKey.self, value: .bounds) { [$0] }
  }
}

/// A text field's shown text, kept to `maxLength` and reported (Input,
/// Textarea). The field binds to `shown`, the member's own state, rather than
/// to a binding whose setter cuts: at the limit the cut text equals the stored
/// text, so nothing would change and the field would keep the characters past
/// the limit. Here a change past the limit is written back cut, and `report`
/// gets each new text once: not the write-back, and not a controlled `value`
/// the app set, which `shown` follows.
private struct PMLimitedText: ViewModifier {
  @Binding var shown: String
  let value: String?
  let committed: String
  let maxLength: Double?
  let report: @MainActor (String) -> Void

  func body(content: Content) -> some View {
    content
      .onChange(of: shown) { old, next in
        let kept = cut(next)
        if kept != next { shown = kept }
        guard kept != cut(old), kept != committed else { return }
        report(kept)
      }
      .onChange(of: value) { _, value in
        if let value, value != shown { shown = value }
      }
  }

  private func cut(_ text: String) -> String {
    maxLength.map { String(text.prefix(Int(Swift.max(0, $0)))) } ?? text
  }
}

extension View {
  /// Keeps `shown` to `maxLength`, follows the controlled `value`, and reports
  /// each new text that is not `committed` already.
  func pmLimitedText(
    _ shown: Binding<String>, value: String?, committed: String, maxLength: Double?,
    report: @escaping @MainActor (String) -> Void
  ) -> some View {
    modifier(
      PMLimitedText(
        shown: shown, value: value, committed: committed, maxLength: maxLength, report: report))
  }
}

/// The keyboard, capitalisation, correction and content type a field's `type`
/// and `autoComplete` ask for. A literal field's text is taken as typed,
/// neither capitalised nor corrected: every type but text and search, and an
/// `exact` Input of any type. The keyboard, capitalisation and content
/// type are iOS's alone, because a Mac keyboard has no layouts to choose;
/// correction is turned off on both, because a Mac corrects spelling as it is
/// typed too.
struct PMTextEntry: ViewModifier {
  let type: PMInputType
  let autoComplete: String?
  var literal = false

  func body(content: Content) -> some View {
    let literal = self.literal || (type != .text && type != .search)
    #if os(iOS)
      content
        .keyboardType(keyboard)
        .textInputAutocapitalization(literal ? .never : nil)
        .autocorrectionDisabled(literal)
        .textContentType(contentType)
        .submitLabel(type == .search ? .search : .return)
    #else
      content.autocorrectionDisabled(literal)
    #endif
  }

  #if os(iOS)
    private var keyboard: UIKeyboardType {
      switch type {
      case .email: .emailAddress
      case .url: .URL
      case .tel: .phonePad
      case .number: .decimalPad
      case .search: .webSearch
      case .text, .password: .default
      }
    }

    /// The HTML `autocomplete` token as a text content type, or the one the
    /// field's type implies; `off` asks for none.
    private var contentType: UITextContentType? {
      switch autoComplete {
      case "off": return nil
      case "username": return .username
      case "current-password": return .password
      case "new-password": return .newPassword
      case "one-time-code": return .oneTimeCode
      case "email": return .emailAddress
      case "name": return .name
      case "given-name": return .givenName
      case "family-name": return .familyName
      case "tel": return .telephoneNumber
      case "url": return .URL
      case "organization": return .organizationName
      case "street-address": return .fullStreetAddress
      case "postal-code": return .postalCode
      case "address-level2": return .addressCity
      case "country-name": return .countryName
      default: break
      }
      switch type {
      case .email: return .emailAddress
      case .url: return .URL
      case .tel: return .telephoneNumber
      case .password: return .password
      case .text, .search, .number: return nil
      }
    }
  #endif
}

/// A row-labelled control's label (Checkbox, Switch): `text.sm`, with the
/// required marker after it, which is not spoken: the control's name is the
/// label alone.
struct PMRowLabel: View {
  @Environment(\.pmTheme) private var theme
  let label: String
  let required: Bool

  var body: some View {
    if required {
      Text(label) + Text(" *").foregroundStyle(theme.colors.dangerText.color)
    } else {
      Text(label)
    }
  }
}

/// Names a text field for assistive technology, when it has a name. SwiftUI
/// speaks a field's title as its name on iOS and publishes none on macOS, so
/// every text entry names itself the same way on both, and the identity
/// tests hold every text field to a name.
extension View {
  func pmEntryName(_ name: String?) -> some View {
    modifier(PMOptionalLabel(label: name.flatMap { $0.isEmpty ? nil : $0 }))
  }
}

/// Names the view `label` when there is one.
struct PMOptionalLabel: ViewModifier {
  let label: String?

  func body(content: Content) -> some View {
    if let label {
      content.accessibilityLabel(Text(label))
    } else {
      content
    }
  }
}

/// The `loading` glyph turning once per the temperament's ambient spin period.
/// It stands still under Reduce Motion and at the `none` temperament, whose
/// period is 0; a still glyph under its name still says "loading" (motion.md
/// §7). The angle is read from the clock, so the glyph keeps no state and an
/// interrupted render resumes where the turn is.
struct PMSpinGlyph: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let controlSize: PMControlSize

  var body: some View {
    let period = theme.defaultMotion.ambient.spin
    let still = reduceMotion || period <= 0
    TimelineView(.animation(paused: still)) { context in
      PMIconView(.loading, size: controlSize)
        .rotationEffect(still ? .zero : angle(at: context.date, period: period))
    }
  }

  private func angle(at date: Date, period: TimeInterval) -> Angle {
    let turn = date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
    return .degrees(turn * 360)
  }
}

/// A sort direction's glyph and its spoken name, shared by DataTable's and
/// Table's sortable headers.
enum PMSort {
  /// `sort` while the column is not sorted, `sort-asc` or `sort-desc` when it is.
  static func glyph(_ direction: PMSortDirection?) -> PMIconRole {
    switch direction {
    case nil: .sort
    case .asc: .sortAsc
    case .desc: .sortDesc
    }
  }

  /// The direction as the header's accessibility value, the web's `aria-sort`.
  static func spoken(_ direction: PMSortDirection) -> String {
    PMStrings.sorted(direction)
  }
}

/// A size in bytes as text: binary multiples, as the web's `formatBytes`
/// (`packages/engine/src/conventions/files.ts`) counts them, in the reader's
/// locale. FileUpload's rows and AttachmentChip read sizes through it, so a
/// file's size reads the same in both.
enum PMByteCount {
  static func format(_ bytes: Double) -> String {
    let formatter = ByteCountFormatter()
    formatter.countStyle = .binary
    formatter.allowsNonnumericFormatting = false
    return formatter.string(fromByteCount: Int64(max(0, bytes)))
  }
}

/// The general pasteboard: what a copy control writes to.
enum PMClipboard {
  @MainActor
  static func copy(_ text: String) {
    #if canImport(UIKit)
      UIPasteboard.general.string = text
    #elseif canImport(AppKit)
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(text, forType: .string)
    #endif
  }
}

/// The disclosure grammar Accordion and Collapsible share (`accordion.md`,
/// `collapsible.md`): a trigger of the label and the `down` chevron, and the
/// region it opens. One disclosure looks the same in both members, so the
/// recipe differs only in the sizes each spec names.
struct PMDisclosureRecipe {
  /// The trigger's least height: `control-height-lg` in Accordion,
  /// `control-height-sm` in Collapsible.
  let minHeight: CGFloat
  /// The trigger's vertical padding.
  let paddingY: CGFloat
  /// The gap between the label and the chevron.
  let gap: CGFloat
  let text: PMTextStyle
  /// The label's colour at rest: `text.primary` in Accordion, `text.secondary`
  /// in Collapsible.
  let rest: PMDynamicColor
  let chevron: PMControlSize
  /// The trigger takes the row's width with the chevron at its end
  /// (Accordion), or fits its label (Collapsible).
  let fills: Bool
}

/// The disclosure trigger as a `ButtonStyle`: colour only, no wash, so hover
/// turns the label `accent.text` and the chevron `text.secondary`; disabled
/// draws both `text.disabled`; open turns the chevron half a turn over the
/// control duration on the standard easing, at once under Reduce Motion.
struct PMDisclosureTriggerStyle: ButtonStyle {
  let recipe: PMDisclosureRecipe
  let open: Bool

  func makeBody(configuration: Configuration) -> some View {
    PMDisclosureTrigger(recipe: recipe, open: open, pressed: configuration.isPressed) {
      configuration.label
    }
  }
}

private struct PMDisclosureTrigger<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @State private var hovering = false
  let recipe: PMDisclosureRecipe
  let open: Bool
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let colors = theme.colors
    let motion = theme.defaultMotion
    let active = enabled && (hovering || pressed)
    HStack(spacing: recipe.gap) {
      label()
        .pmTextStyle(recipe.text)
        .foregroundStyle((!enabled ? colors.textDisabled : active ? colors.accentText : recipe.rest).color)
        .multilineTextAlignment(.leading)
        .frame(maxWidth: recipe.fills ? .infinity : nil, alignment: .leading)
      PMTurningChevron(
        role: .down, open: open, turn: .degrees(180), size: recipe.chevron,
        color: !enabled ? \.textDisabled : active ? \.textSecondary : \.textMuted)
    }
    .padding(.vertical, recipe.paddingY)
    .frame(minHeight: recipe.minHeight)
    .frame(maxWidth: recipe.fills ? .infinity : nil, alignment: .leading)
    .contentShape(.rect)
    .animation(motion.easing.standard.animation(duration: motion.duration.control), value: active)
    .onHover { hovering = $0 }
    .pmHitTarget()
  }
}

/// The region a disclosure opens: `collapse` in persistent mode on the
/// surface class (`design/motion/motion.md`). Its height follows the content
/// over the surface duration; the content fades in over the second half once
/// there is room, and out over the first half before the space closes. Under
/// Reduce Motion the height changes at once and the content still fades. A
/// closed region keeps its content laid out at no height, hidden from
/// assistive technology and from touches, so nothing in it can be reached.
struct PMDisclosureRegion<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let open: Bool
  @ViewBuilder let content: () -> Content

  var body: some View {
    let motion = theme.defaultMotion
    let duration = motion.duration.surface
    let easing = motion.easing.standard
    let half = duration / 2
    PMCollapse(progress: open ? 1 : 0) {
      content()
        .opacity(open ? 1 : 0)
        .animation(
          open ? easing.animation(duration: half).delay(half) : easing.animation(duration: half),
          value: open)
    }
    .clipped()
    .animation(reduceMotion ? nil : easing.animation(duration: duration), value: open)
    .modifier(PMClosedRegion(closed: !open))
  }
}

/// A closed region: hidden from assistive technology and from touches. An
/// open one is left alone, because `accessibilityHidden(false)` would still
/// add an element of its own.
private struct PMClosedRegion: ViewModifier {
  let closed: Bool

  func body(content: Content) -> some View {
    if closed {
      content.accessibilityHidden(true).allowsHitTesting(false)
    } else {
      content
    }
  }
}

// MARK: - Field error

/// FormField's error (`form-field.md`), which InlineEdit draws under its field
/// too: `text.xs` in danger text after the `error` glyph, which sits in a seat
/// one line tall so it stays beside the first line. The control says the
/// message as its hint, so the row is not spoken.
struct PMFieldErrorRow: View {
  @Environment(\.pmTheme) private var theme
  let text: String

  var body: some View {
    let step = theme.text.xs
    HStack(alignment: .top, spacing: theme.defaultDensity.space.s2) {
      PMIconView(.error, size: .sm)
        .frame(height: step.lineBox)
      Text(text)
        .pmTextStyle(step)
        .fixedSize(horizontal: false, vertical: true)
    }
    .foregroundStyle(theme.colors.dangerText.color)
    .accessibilityHidden(true)
  }
}
