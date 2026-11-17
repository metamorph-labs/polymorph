// AttachmentChip (`design/components/attachment-chip.md`): a file attached to
// a prompt, as a chip: in the composer, where it can still be removed, and in
// a sent message, where it cannot. The app owns the upload: the chip draws
// `status` and `message` as given and asks for removal through `onRemove`.
//
// One line at least `control.height.sm` tall: the mark (the `sm` glyph in
// `text.muted`; Spinner while uploading; `error` in `danger.text` on a
// failure), the name (`text.sm`), the size (`text.xs`, muted, binary
// multiples in the reader's locale, as FileUpload's rows read it) or, on a
// failure, the app's message in `danger.text`, then the remove control,
// Button `ghost/neutral/sm` icon-only `close`. The surface is `bg.surface`
// inside a `border.subtle` hairline (`danger.border` on a failure) at
// `radius.control`, padded `space-1` and `space-3`, `space-2` before the
// control. A long name is shortened in the middle, as the platform shortens a
// file's name, so its extension stays in view; the control stays reachable.
// The chip is as wide as its content, up to the width it is offered. With
// `href` the name is a link to the file, which opens through the environment's
// `openURL`, as Link does; it is drawn without Link's hit-target height, so a
// chip with a link is as tall as one without, and the name and the size are
// read as one element, which a reader activates to open the file.

import PolymorphTokens
import SwiftUI

public struct PMAttachmentChip: PMAttachmentChipRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMAttachmentChipProps

  public init(props: PMAttachmentChipProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let status = props.status ?? .done
    let shape = RoundedRectangle(cornerRadius: theme.radius.control)
    let motion = theme.defaultMotion

    HStack(spacing: space.s2) {
      mark(status)
      details(status)
      if let onRemove = props.onRemove {
        let side = theme.defaultDensity.controlHeight.sm
        PMButton(
          props: PMButtonProps(
            icon: .close, iconOnly: true,
            label: props.removeLabel ?? PMStrings.attachmentRemove(name: props.name), onClick: onRemove,
            size: .sm, appearance: .ghostNeutral)
        )
        // Its hit area reaches past the chip; the chip lays it out at its
        // drawn size, so a removable chip is as tall as a sent one.
        .pmHitTarget(drawn: CGSize(width: side, height: side))
      }
    }
    .padding(.vertical, space.s1)
    .padding(.leading, space.s3)
    .padding(.trailing, props.onRemove == nil ? space.s3 : space.s2)
    .frame(minHeight: theme.defaultDensity.controlHeight.sm)
    .fixedSize(horizontal: false, vertical: true)
    .background(colors.bgSurface.color, in: shape)
    .overlay {
      shape.strokeBorder(
        (status == .error ? colors.dangerBorder : colors.borderSubtle).color, lineWidth: 1)
    }
    .animation(motion.easing.standard.animation(duration: motion.duration.control), value: status)
    .accessibilityElement(children: .contain)
    .pmMember("AttachmentChip", ["status": status.rawValue])
  }

  /// The leading mark: the file's glyph, the spinner while it uploads, the
  /// `error` glyph when it failed. The spinner is the one part spoken on its
  /// own: it announces the upload once, named with the file.
  @ViewBuilder
  private func mark(_ status: PMAttachmentStatus) -> some View {
    switch status {
    case .uploading:
      PMSpinner(
        props: PMSpinnerProps(
          label: props.uploadingLabel ?? PMStrings.attachmentUploading(name: props.name), size: .sm)
      )
      .foregroundStyle(theme.colors.textMuted.color)
    case .error:
      PMIconView(.error, size: .sm)
        .foregroundStyle(theme.colors.dangerText.color)
    case .done:
      PMIconView(props.icon ?? .document, size: .sm)
        .foregroundStyle(theme.colors.textMuted.color)
    }
  }

  /// The name, then the size or the app's message, read as one element. With
  /// an `href` that is a URL the name is a link to the file, Link's external
  /// form: accent text with the softened underline and the `open-external`
  /// glyph; the size stays text beside it.
  private func details(_ status: PMAttachmentStatus) -> some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let url = props.href.flatMap(URL.init(string:))
    return HStack(alignment: .firstTextBaseline, spacing: space.s2) {
      if let url {
        Link(destination: url) {
          HStack(spacing: space.s1) {
            name.underline(true, color: colors.accentUnderline.color)
            PMIconView(.openExternal, size: .sm)
          }
          .foregroundStyle(colors.accentText.color)
          // The link's hit area reaches past the chip; the chip keeps its height.
          .pmHitRegion()
        }
        .buttonStyle(.plain)
      } else {
        name.foregroundStyle(
          (status == .uploading ? colors.textSecondary : colors.textPrimary).color)
      }
      if status == .error {
        if let message = props.message {
          Text(message)
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(colors.dangerText.color)
            .lineLimit(1)
            .layoutPriority(1)
        }
      } else if let size = props.size {
        Text(PMByteCount.format(size))
          .pmTextStyle(theme.text.xs)
          .foregroundStyle(colors.textMuted.color)
          .lineLimit(1)
          .fixedSize()
      }
    }
    .accessibilityElement(children: .combine)
  }

  /// The file's name at `text.sm`, on one line, shortened in the middle.
  private var name: some View {
    Text(props.name)
      .pmTextStyle(theme.text.sm)
      .lineLimit(1)
      .truncationMode(.middle)
  }
}

/// AttachmentChip's states, from the spec's States table.
public struct AttachmentChipStates: PMStates {
  public let member = "AttachmentChip"

  public init() {}

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "removable — in the composer, with the name and the size", expect: ["status": "done"]
      ) {
        PMAttachmentChip(
          props: PMAttachmentChipProps(name: "retry-policy.pdf", onRemove: {}, size: 184_320))
      },
      PMStateEntry("sent — in a message, nothing to remove", expect: ["status": "done"]) {
        PMAttachmentChip(props: PMAttachmentChipProps(name: "retry-policy.pdf", size: 184_320))
      },
      PMStateEntry("openable — the name is a link to the file", expect: ["status": "done"]) {
        PMAttachmentChip(
          props: PMAttachmentChipProps(
            href: "https://files.example.org/retry-policy.pdf", name: "retry-policy.pdf",
            size: 184_320))
      },
      PMStateEntry("uploading — the spinner takes the mark", expect: ["status": "uploading"]) {
        PMAttachmentChip(
          props: PMAttachmentChipProps(name: "screenshot.png", onRemove: {}, status: .uploading))
      },
      PMStateEntry("error — the app’s words, in the danger ink", expect: ["status": "error"]) {
        PMAttachmentChip(
          props: PMAttachmentChipProps(
            message: "Too large for this plan", name: "archive.zip", onRemove: {},
            status: .error))
      },
      PMStateEntry(
        "a long name — shortened, the control still reachable", expect: ["status": "done"]
      ) {
        PMAttachmentChip(
          props: PMAttachmentChipProps(
            icon: .table,
            name: "quarterly-webhook-delivery-report-with-every-retry-and-its-outcome-2026.csv",
            onRemove: {}, size: 2_457_600))
      },
    ]
  }
}
