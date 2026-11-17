// PromptInput (`design/components/prompt-input.md`): the chat composer, where
// a prompt is written, files are attached, and the prompt is sent or the reply
// stopped. A Textarea with one job: the page's only field, which always grows
// with its content, and a toolbar no form has.
//
// Input's split, one level up: the frame draws the surface, border, seat and
// ring, and the field inside it is transparent, so the chips, the field and the
// toolbar sit inside one edge and the ring goes round the whole composer. The
// frame is a column `space-2` apart inside `space-3`, `bg.surface` inside a
// `border.field` hairline at `radius.surface` with the seat; under the pointer
// the border is `border.strong`; while the field has focus it is
// `border.focus.solid` with the focus ring and the focus glow; while files
// are dragged over it, FileUpload's zone (`accent.subtle`, `accent.bg`, the
// focus glow); disabled, `bg.subtle` inside `border.subtle` with no seat. A
// composer is disabled by `disabled` or by a container that disables it, as
// ConversationPage does while its thread loads. The colours change over the
// control duration (`stateFeedback`).
//
// The field is a vertical-axis `TextField` at `text.md` in `text.primary`,
// padded `space-1` by `space-2`, named by `label` (a composer has no visible
// label), its placeholder in `text.muted`. It grows from one line to
// `maxRows` lines, then scrolls: Textarea's autosize, always on. A hardware
// keyboard's Return sends and Shift-Return starts a line; while a reply
// streams, or while the composer is empty, Return does nothing. The system
// keyboard's Return starts a line, as it does in every iOS composer, and the
// send control sends. A sent prompt clears the field unless `value` is
// controlled, which the app clears itself.
//
// The toolbar is a row `space-2` apart: the attach control when `onAttach` is
// set (Button `ghost/neutral/sm`, icon-only `attach`, named by
// `messages.attach`), the app's `leading` slot, and at the trailing end the
// app's `trailing` slot and the one primary control: send (`solid/accent/sm`,
// icon-only `send`, disabled while the composer is empty or disabled), which is
// stop (`outline/neutral/sm`, icon-only `stop`, calling `onStop`) exactly while
// `streaming`. The swap is a re-render, never a crossfade, because a control
// about to be pressed must not be halfway between faces. When the row is too
// narrow for both ends, the trailing end takes a line of its own, still at
// the trailing edge. The toolbar's own controls keep their drawn size in the
// row; their hit areas reach the hit target into the frame's padding. The
// chips are AttachmentChips in a wrapping row `space-2` apart, named by
// `messages.remove` and `messages.uploading`; they come and go by re-render.
// The hint is one line under the frame, `text.xs` in `text.muted`, inset
// `space-3`.
//
// Files arrive two ways here, each through FileUpload's gate (`accept`,
// `maxSize`, `multiple`), exactly as the web's `gateFiles` applies it, with the
// files that pass going to `onAttach` and the refused, with their reasons, to
// `onReject`: the attach control opens the system's file importer, which
// shows the `accept` types as `UTType`s; and a drop on the frame. A dropped
// file is copied into the temporary directory first, because the system takes
// back the dropped one when the drop ends. The importer's files are
// security-scoped: the composer reads each one's size and type inside an
// access it opens and closes, and the app opens its own access when it reads
// the file. A paste of files is not taken: on iOS SwiftUI offers no paste
// handler on a text field (`onPasteCommand` and `pasteDestination` are macOS
// only), and `PasteButton` is a system-drawn control the toolbar's anatomy has
// no place for; pasted text keeps its default behaviour.
//
// Not honoured: `id` and `name`, which name nothing in SwiftUI. SwiftUI does
// not say whether an input method is composing, so the Return handler cannot
// leave a Return that commits a candidate to the input method, as the web's
// `isComposing` check does. `triggers` draws no suggestion list, because the
// text field reports no caret position on iOS 17, so an `@` or a `/` stays
// text in the prompt (`packages/native/src/undrawn.ts`).

import PolymorphTokens
import SwiftUI

public struct PMPromptInput: PMPromptInputRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @FocusState private var focused: Bool
  @State private var draft: String
  @State private var hovering = false
  @State private var dragover = false
  @State private var picking = false
  private let props: PMPromptInputProps

  public init(props: PMPromptInputProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? "")
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let disabled = self.disabled
    let attachable = props.onAttach != nil && !disabled

    VStack(alignment: .leading, spacing: space.s2) {
      frame(disabled: disabled, attachable: attachable)
      if let hint = props.hint {
        Text(hint)
          .pmTextStyle(theme.text.xs)
          .foregroundStyle(theme.colors.textMuted.color)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.horizontal, space.s3)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .fileImporter(
      isPresented: $picking, allowedContentTypes: PMFileGate.types(accepting: props.accept),
      allowsMultipleSelection: props.multiple ?? true
    ) { result in
      guard case .success(let urls) = result else { return }
      add(urls.map(PMFileGate.file(at:)))
    }
    .onAppear { if props.autoFocus == true, !disabled { focused = true } }
    .accessibilityElement(children: .contain)
    .pmMember("PromptInput", attributes(disabled: disabled))
  }

  // MARK: The frame

  private func frame(disabled: Bool, attachable: Bool) -> some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let motion = theme.defaultMotion
    let shape = RoundedRectangle(cornerRadius: theme.radius.surface)
    let attachments = props.attachments ?? []
    let fill = disabled ? colors.bgSubtle : dragover ? colors.accentSubtle : colors.bgSurface
    let shadow =
      disabled ? PMShadow(layers: []) : dragover || focused ? theme.glow.focus : theme.shadows.seat

    return VStack(alignment: .leading, spacing: space.s2) {
      if !attachments.isEmpty {
        PMInlineLayout(gap: space.s2, align: .center, justify: .start, wrap: true) {
          ForEach(attachments, id: \.id) { attachment in
            chip(attachment, disabled: disabled)
          }
        }
      }
      field(disabled: disabled)
      toolbar(disabled: disabled)
    }
    .padding(space.s3)
    .background {
      shape.fill(fill.color)
        .pmShadow(shadow)
    }
    .overlay { shape.strokeBorder(border(disabled: disabled).color, lineWidth: 1) }
    .pmFocusRing(focused && !disabled, cornerRadius: theme.radius.surface)
    .animation(
      motion.easing.standard.animation(duration: motion.duration.control),
      value: [hovering, focused, dragover, disabled]
    )
    .onHover { hovering = $0 }
    .modifier(PMFileDrop(enabled: attachable, targeted: $dragover, receive: add))
  }

  /// The frame's border, in the recipe's order: disabled, then a drag, then
  /// the pointer, then focus.
  private func border(disabled: Bool) -> PMDynamicColor {
    let colors = theme.colors
    if disabled { return colors.borderSubtle }
    if dragover { return colors.accentBg }
    if hovering { return colors.borderStrong }
    if focused { return colors.borderFocusSolid }
    return colors.borderField
  }

  private func chip(_ attachment: PMPromptAttachment, disabled: Bool) -> some View {
    let messages = props.messages ?? PMStrings.promptInputMessages
    // A disabled composer's chips cannot be removed.
    var onRemove: (@MainActor () -> Void)?
    if let remove = props.onRemoveAttachment, !disabled {
      let id = attachment.id
      onRemove = { remove(id) }
    }
    return PMAttachmentChip(
      props: PMAttachmentChipProps(
        message: attachment.message, name: attachment.name, onRemove: onRemove,
        removeLabel: messages.remove(attachment.name), size: attachment.size,
        status: attachment.status, uploadingLabel: messages.uploading(attachment.name)))
  }

  // MARK: The field

  private func field(disabled: Bool) -> some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let prompt =
      props.placeholder.map { Text($0).foregroundStyle(colors.textMuted.color) }
      ?? Text(verbatim: "")
    return TextField(props.label, text: text, prompt: prompt, axis: .vertical)
      .textFieldStyle(.plain)
      .lineLimit(1...(props.maxRows ?? .maxRows8).rawValue)
      .pmTextStyle(theme.text.md)
      .foregroundStyle((disabled ? colors.textDisabled : colors.textPrimary).color)
      .tint(colors.accentText.color)
      .focused($focused)
      .disabled(disabled)
      .pmEntryName(props.label)
      .onKeyPress(.return, phases: .down) { press in
        if press.modifiers.contains(.shift) { return .ignored }
        submit()
        return .handled
      }
      .padding(.vertical, space.s1)
      .padding(.horizontal, space.s2)
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(.rect)
      // A tap in the field's padding focuses it, as a click on the web's field does.
      .simultaneousGesture(TapGesture().onEnded { if !disabled { focused = true } })
  }

  /// The controlled `value` when given, otherwise the composer's own draft.
  private var text: Binding<String> {
    Binding {
      props.value ?? draft
    } set: { next in
      draft = next
      props.onChange?(next)
    }
  }

  /// `disabled`, or a container that disables the composer, as ConversationPage
  /// does while its thread loads: the web's disabled `fieldset` around it.
  private var disabled: Bool {
    props.disabled == true || !enabled
  }

  /// Whitespace is empty; a chip is content.
  private var empty: Bool {
    text.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && (props.attachments ?? []).isEmpty
  }

  private func submit() {
    guard !disabled, props.streaming != true, !empty else { return }
    props.onSubmit(text.wrappedValue)
    if props.value == nil { draft = "" }
  }

  // MARK: The toolbar

  private func toolbar(disabled: Bool) -> some View {
    let space = theme.defaultDensity.space
    let messages = props.messages ?? PMStrings.promptInputMessages
    let side = theme.defaultDensity.controlHeight.sm
    let drawn = CGSize(width: side, height: side)

    return PMToolbarRow(gap: space.s2) {
      if props.onAttach != nil {
        PMButton(
          props: PMButtonProps(
            disabled: disabled, icon: .attach, iconOnly: true, label: messages.attach,
            onClick: { picking = true }, size: .sm, appearance: .ghostNeutral)
        )
        .pmHitTarget(drawn: drawn)
      }
      if let leading = props.leading {
        leading
      }
      // The trailing end, always last: the row places it at the trailing edge.
      HStack(spacing: space.s2) {
        if let trailing = props.trailing {
          trailing
        }
        Group {
          if props.streaming == true {
            PMButton(
              props: PMButtonProps(
                icon: .stop, iconOnly: true, label: messages.stop, onClick: props.onStop,
                size: .sm, appearance: .outlineNeutral))
          } else {
            PMButton(
              props: PMButtonProps(
                disabled: disabled || empty, icon: .send, iconOnly: true, label: messages.send,
                onClick: submit, size: .sm, appearance: .solidAccent))
          }
        }
        .pmHitTarget(drawn: drawn)
      }
    }
  }

  // MARK: Files

  /// FileUpload's gate over every way a file arrives.
  private func add(_ files: [PMFile]) {
    guard props.onAttach != nil, !disabled, !files.isEmpty else { return }
    let gated = PMFileGate.gate(
      files, accept: props.accept, multiple: props.multiple ?? true, maxSize: props.maxSize)
    if !gated.accepted.isEmpty { props.onAttach?(gated.accepted) }
    if !gated.rejected.isEmpty { props.onReject?(gated.rejected) }
  }

  /// The web's `data-state` (`streaming`, else `dragover`), `data-disabled`,
  /// `data-empty` (no text and no chips) and `data-max-rows`.
  private func attributes(disabled: Bool) -> [String: String] {
    var attributes = ["max-rows": String((props.maxRows ?? .maxRows8).rawValue)]
    if props.streaming == true {
      attributes["state"] = "streaming"
    } else if dragover {
      attributes["state"] = "dragover"
    }
    if disabled { attributes["disabled"] = "true" }
    if empty { attributes["empty"] = "true" }
    return attributes
  }
}

/// The toolbar: its children in a row from the leading edge, the last one (the
/// trailing end) at the trailing edge. When the row is too narrow for all of
/// them, the leading children wrap and the trailing end takes the last line
/// to itself, still at the trailing edge: the web's wrapping row whose end is
/// pushed by an automatic margin.
private struct PMToolbarRow: Layout {
  let gap: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
    let lines = self.lines(subviews, width: width)
    let height = lines.map { line in line.map { subviews[$0].sizeThatFits(.unspecified).height }.max() ?? 0 }
    let widest = lines.map { self.width(of: $0, subviews) }.max() ?? 0
    return CGSize(
      width: width ?? widest,
      height: height.reduce(0, +) + gap * CGFloat(max(0, lines.count - 1)))
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    guard let last = subviews.indices.last else { return }
    var y = bounds.minY
    for line in lines(subviews, width: bounds.width) {
      let sizes = line.map { subviews[$0].sizeThatFits(.unspecified) }
      let height = sizes.map(\.height).max() ?? 0
      var x = bounds.minX
      for (index, size) in zip(line, sizes) {
        if index == last { x = bounds.maxX - size.width }
        subviews[index].place(
          at: CGPoint(x: x, y: y + (height - size.height) / 2), anchor: .topLeading,
          proposal: ProposedViewSize(size))
        x += size.width + gap
      }
      y += height + gap
    }
  }

  /// The children's indices in lines: one line when everything fits;
  /// otherwise the leading children wrapped at `width`, and the trailing end
  /// on a line of its own.
  private func lines(_ subviews: Subviews, width: CGFloat?) -> [[Int]] {
    let all = Array(subviews.indices)
    guard let width, let last = all.last, self.width(of: all, subviews) > width else {
      return all.isEmpty ? [] : [all]
    }
    var lines: [[Int]] = []
    var line: [Int] = []
    for index in all.dropLast() {
      if !line.isEmpty, self.width(of: line + [index], subviews) > width {
        lines.append(line)
        line = []
      }
      line.append(index)
    }
    if !line.isEmpty { lines.append(line) }
    lines.append([last])
    return lines
  }

  private func width(of line: [Int], _ subviews: Subviews) -> CGFloat {
    line.map { subviews[$0].sizeThatFits(.unspecified).width }.reduce(0, +)
      + gap * CGFloat(max(0, line.count - 1))
  }
}

/// PromptInput's states, from the spec's States table. `ImageRenderer` draws
/// no AppKit text field, so the field shows as the platform's placeholder box
/// in every render; the frame, the chips, the toolbar and the hint are drawn.
public struct PromptInputStates: PMStates {
  public let member = "PromptInput"

  public init() {}

  private static let label = "Message"
  private static let ask = "Ask anything…"
  private static let prompt = "Why did the webhook retry twice with the same promo code?"
  private static let grown = [
    "Line one of a longer prompt.", "Line two, with more context.", "Line three.", "Line four.",
    "Line five scrolls inside the field.",
  ].joined(separator: "\n")
  private static let attachments = [
    PMPromptAttachment(id: "a", name: "retry-policy.pdf", size: 184_320),
    PMPromptAttachment(id: "b", name: "screenshot.png", size: 48_210, status: .uploading),
  ]
  private static let models: [PMSelectOptionEntry] = [
    .option(PMSelectOption(value: "fast", label: "Fast")),
    .option(PMSelectOption(value: "thorough", label: "Thorough")),
  ]

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "empty — one line, send waits for words", expect: ["empty": "true", "max-rows": "8"]
      ) {
        PMPromptInput(props: PMPromptInputProps(label: Self.label, onSubmit: { _ in }, placeholder: Self.ask))
      },
      PMStateEntry("with a prompt — send is live", expect: ["max-rows": "8"]) {
        PMPromptInput(
          props: PMPromptInputProps(defaultValue: Self.prompt, label: Self.label, onSubmit: { _ in }))
      },
      PMStateEntry(
        "grown — several lines, up to the ceiling", expect: ["max-rows": "4"]
      ) {
        PMPromptInput(
          props: PMPromptInputProps(
            defaultValue: Self.grown, label: Self.label, maxRows: .maxRows4, onSubmit: { _ in }))
      },
      PMStateEntry("attachable — the attach control, and two chips in the frame") {
        PMPromptInput(
          props: PMPromptInputProps(
            attachments: Self.attachments, label: Self.label, onAttach: { _ in },
            onReject: { _ in }, onRemoveAttachment: { _ in }, onSubmit: { _ in },
            placeholder: "Ask about these files…"))
      },
      PMStateEntry("the app’s slots — a model picker leading, a hint beneath") {
        PMPromptInput(
          props: PMPromptInputProps(
            hint: "Return to send · Shift-Return for a new line", label: Self.label,
            leading: AnyView(
              PMSelect(
                props: PMSelectProps(
                  ariaLabel: "Model", defaultValue: "fast", options: Self.models, size: .sm))),
            onSubmit: { _ in }, placeholder: Self.ask))
      },
      PMStateEntry("streaming — send has become stop", expect: ["state": "streaming"]) {
        PMPromptInput(
          props: PMPromptInputProps(
            label: Self.label, onStop: {}, onSubmit: { _ in }, streaming: true))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMPromptInput(
          props: PMPromptInputProps(
            defaultValue: "A prompt nobody can send", disabled: true, label: Self.label,
            onSubmit: { _ in }))
      },
    ]
  }
}
