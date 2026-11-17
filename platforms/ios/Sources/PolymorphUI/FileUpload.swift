// FileUpload (`design/components/file-upload.md`): a dropzone and the list of
// files with their upload states. The dropzone is one button, the system's
// only dashed border, `border.strong` around `bg.subtle` at `radius.lg`,
// `space-6` inside: the `upload` glyph (`lg`, muted), the title in `text.sm`
// and the hint in `text.xs` `text.muted`, centred. A tap opens the system's
// file importer; files dropped on it, on iPad, arrive the same way, each
// copied out of the drop first (`PMFileDrop`), because the system takes back
// a dropped file once the drop is received. Under the
// pointer it is `bg.surface` with an `accent.bg` border; while a drop hovers
// it is the accent wash with the focus glow; disabled it is dimmed and takes
// nothing; invalid draws its border in `danger.border`.
//
// Every file passes one gate, whichever way it came (`PMFileGate`): `accept`
// (extensions, media types and wildcards), then `maxSize`, then `multiple`,
// which keeps the first file that passes. The files that pass go to
// `onFilesAdd`; the refused ones go to `onReject` with why, and the app turns
// each into an error row in its own words, so no file is dropped in silence.
//
// The rows are the app's `files`, `space-2` apart under the zone: the
// `document` glyph, the name in `text.sm` with its size in `text.xs` `text.muted`
// (`messages.formatSize`, binary units by default), and by status a Progress
// with the percentage while uploading, the `success` glyph in `success.text`
// when done, or the app's message in `danger.text`, a `danger.border` row and
// a retry button (when `onRetry` is set) on an error; every row ends with its
// remove button. A row that finishes or fails is announced
// (`messages.announcement`). `name` and the `aria-*by` ids have no SwiftUI
// counterpart.

import PolymorphTokens
import SwiftUI

public struct PMFileUpload: PMFileUploadRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @State private var importing = false
  @State private var targeted = false
  private let props: PMFileUploadProps

  public init(props: PMFileUploadProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let files = props.files ?? []

    VStack(alignment: .leading, spacing: space.s3) {
      Button {
        importing = true
      } label: {
        PMDropzoneLabel(title: props.title ?? PMStrings.fileUploadTitle, hint: props.hint)
      }
      .buttonStyle(PMDropzoneStyle(targeted: targeted, invalid: invalid))
      .disabled(disabled)
      .accessibilityLabel(Text(props.ariaLabel ?? field?.label ?? props.title ?? PMStrings.fileUploadTitle))
      .pmFieldHint(invalid: invalid, [props.hint, field?.hint].compactMap { $0 }.joined(separator: ", "))
      .fileImporter(
        isPresented: $importing, allowedContentTypes: PMFileGate.types(accepting: props.accept),
        allowsMultipleSelection: props.multiple ?? true
      ) { result in
        if case .success(let urls) = result { receive(urls.map(PMFileGate.file(at:))) }
      }
      .modifier(PMFileDrop(enabled: !disabled, targeted: $targeted, receive: receive))
      if !files.isEmpty {
        VStack(alignment: .leading, spacing: space.s2) {
          ForEach(files, id: \.id) { file in
            PMFileRow(file: file, messages: props.messages, onRemove: props.onRemove, onRetry: props.onRetry)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .onChange(of: files.map { "\($0.id)/\($0.status.rawValue)" }) { before, after in
      announce(files, before: before, after: after)
    }
    .accessibilityElement(children: .contain)
    .pmFocusWhenNamed()
    .pmMember(
      "FileUpload",
      attributes(disabled: disabled, invalid: invalid))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// Every arriving file through the gate: the passed ones added, the refused ones reported.
  private func receive(_ files: [PMFile]) {
    let gated = PMFileGate.gate(
      files, accept: props.accept, multiple: props.multiple ?? true, maxSize: props.maxSize)
    if !gated.accepted.isEmpty { props.onFilesAdd(gated.accepted) }
    if !gated.rejected.isEmpty { props.onReject(gated.rejected) }
  }

  /// Announces each row that has just finished or failed.
  private func announce(_ files: [PMFileUploadItem], before: [String], after: [String]) {
    for file in files where file.status != .uploading {
      let key = "\(file.id)/\(file.status.rawValue)"
      guard after.contains(key), !before.contains(key) else { continue }
      let text = props.messages?.announcement(file) ?? PMStrings.fileUploadAnnouncement(file)
      AccessibilityNotification.Announcement(text).post()
    }
  }

  private func attributes(disabled: Bool, invalid: Bool) -> [String: String] {
    var attributes = [
      "state": targeted ? "dragover" : "idle", "files": String((props.files ?? []).count),
    ]
    if disabled { attributes["disabled"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    return attributes
  }
}

/// The dropzone's lines.
private struct PMDropzoneLabel: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  let title: String
  let hint: String?

  var body: some View {
    let colors = theme.colors
    VStack(spacing: theme.defaultDensity.space.s2) {
      PMIconView(.upload, size: .lg)
      Text(title)
        .pmTextStyle(theme.text.sm)
        .foregroundStyle((enabled ? colors.textPrimary : colors.textDisabled).color)
      if let hint {
        Text(hint)
          .pmTextStyle(theme.text.xs)
          .foregroundStyle((enabled ? colors.textMuted : colors.textDisabled).color)
      }
    }
    .multilineTextAlignment(.center)
    .frame(maxWidth: .infinity)
  }
}

/// The dropzone's surface by state.
private struct PMDropzoneStyle: ButtonStyle {
  let targeted: Bool
  let invalid: Bool

  func makeBody(configuration: Configuration) -> some View {
    PMDropzone(targeted: targeted, invalid: invalid, pressed: configuration.isPressed) {
      configuration.label
    }
  }
}

private struct PMDropzone<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @State private var hovering = false
  let targeted: Bool
  let invalid: Bool
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let colors = theme.colors
    let motion = theme.defaultMotion
    let shape = RoundedRectangle(cornerRadius: theme.radius.lg)
    let active = enabled && (hovering || pressed)
    let fill =
      !enabled ? colors.bgSubtle : targeted ? colors.accentSubtle : active ? colors.bgSurface : colors.bgSubtle
    let border =
      !enabled
      ? colors.borderSubtle
      : invalid ? colors.dangerBorder : targeted || active ? colors.accentBg : colors.borderStrong
    // The dash: two hairlines long, two apart, the web's `dashed` hairline.
    let dash = PMRule.thickness * 2
    label()
      .foregroundStyle(
        (!enabled ? colors.textDisabled : targeted ? colors.accentText : colors.textMuted).color
      )
      .padding(theme.defaultDensity.space.s6)
      .frame(maxWidth: .infinity)
      .background {
        shape.fill(fill.color).pmShadow(targeted ? theme.glow.focus : PMShadow(layers: []))
      }
      .overlay {
        shape.strokeBorder(
          border.color, style: StrokeStyle(lineWidth: PMRule.thickness, dash: [dash, dash]))
      }
      .contentShape(shape)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control),
        value: [active, targeted])
      .onHover { hovering = $0 }
  }
}

/// One file's row.
private struct PMFileRow: View {
  @Environment(\.pmTheme) private var theme
  let file: PMFileUploadItem
  let messages: PMFileUploadMessages?
  let onRemove: @MainActor (String) -> Void
  let onRetry: (@MainActor (String) -> Void)?

  var body: some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let shape = RoundedRectangle(cornerRadius: theme.radius.md)
    let failed = file.status == .error

    HStack(spacing: space.s3) {
      PMIconView(.document, size: .md)
        .foregroundStyle(colors.textMuted.color)
      VStack(alignment: .leading, spacing: space.s1) {
        Text(file.name)
          .pmTextStyle(theme.text.sm)
          .foregroundStyle(colors.textPrimary.color)
          .lineLimit(1)
          .truncationMode(.middle)
        if failed, let message = file.message {
          Text(message)
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(colors.dangerText.color)
        } else if let size = file.size {
          Text(messages?.formatSize(size) ?? PMByteCount.format(size))
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(colors.textMuted.color)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      switch file.status {
      case .uploading:
        let progress = min(100, max(0, file.progress ?? 0))
        PMProgress(
          props: PMProgressProps(
            label: messages?.progress(file.name) ?? PMStrings.fileUploadProgress(name: file.name),
            value: progress)
        )
        .frame(width: space.s10)
        Text((progress / 100).formatted(.percent.precision(.fractionLength(0))))
          .pmTextStyle(theme.text.xs)
          .pmTabularFigures(true)
          .foregroundStyle(colors.textMuted.color)
          .accessibilityHidden(true)
      case .done:
        PMIconView(.success, size: .md)
          .foregroundStyle(colors.successText.color)
      case .error:
        if let onRetry {
          PMButton(
            props: PMButtonProps(
              icon: .refresh, iconOnly: true, label: messages?.retry ?? PMStrings.fileUploadRetry,
              onClick: { onRetry(file.id) }, size: .sm, appearance: .ghostNeutral))
        }
      }
      PMButton(
        props: PMButtonProps(
          icon: .close, iconOnly: true,
          label: messages?.remove(file.name) ?? PMStrings.fileUploadRemove(name: file.name),
          onClick: { onRemove(file.id) }, size: .sm, appearance: .ghostNeutral))
    }
    .padding(.vertical, space.s2)
    .padding(.horizontal, space.s3)
    .overlay { shape.strokeBorder((failed ? colors.dangerBorder : colors.borderSubtle).color, lineWidth: 1) }
    .accessibilityElement(children: .contain)
  }
}

/// FileUpload's states, from the spec's States table. A drop is only ever
/// hovering while a person drags, so the dragover row is drawn by its state.
public struct FileUploadStates: PMStates {
  public let member = "FileUpload"

  public init() {}

  private static let hint = "PDF or PNG, up to 10 MB"

  private static func upload(_ files: [PMFileUploadItem], retry: Bool = false, disabled: Bool = false, invalid: Bool = false)
    -> PMFileUpload
  {
    var props = PMFileUploadProps(
      accept: ".pdf,image/png", disabled: disabled, files: files, hint: hint, invalid: invalid,
      maxSize: 10_485_760, onFilesAdd: { _ in }, onReject: { _ in }, onRemove: { _ in })
    if retry { props.onRetry = { _ in } }
    return PMFileUpload(props: props)
  }

  private static let mixed = [
    PMFileUploadItem(id: "1", name: "invoice-march.pdf", size: 482_304, status: .uploading, progress: 40),
    PMFileUploadItem(id: "2", name: "receipt.png", size: 1_258_291, status: .done),
    PMFileUploadItem(
      id: "3", name: "statement-2025-full-year.pdf", size: 24_117_248, status: .error,
      message: "Over the 10 MB limit"),
  ]

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("idle", expect: ["state": "idle", "files": "0"]) {
        Self.upload([])
      },
      PMStateEntry("uploading — one row at 40%", expect: ["files": "1"]) {
        Self.upload([Self.mixed[0]])
      },
      PMStateEntry("mixed list", expect: ["files": "3"]) {
        Self.upload(Self.mixed)
      },
      PMStateEntry("error with retry", expect: ["files": "1"]) {
        Self.upload([Self.mixed[2]], retry: true)
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        Self.upload([], disabled: true)
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        Self.upload([], invalid: true)
      },
    ]
  }
}
