// CodeBlock (`design/components/code-block.md`): code shown whole, in the mono
// face at `text.sm` on the subtle wash, inside a `border.subtle` hairline at
// `radius.md`. Whitespace is content, so the code is never wrapped: a block
// whose longest line is wider than its column scrolls sideways in itself, and
// the screen never does. A block that fits draws no scroll view, as the web's
// block is a tab stop only while it overflows; the overflowing form is a
// labelled container, the web's named `region`. The code is selectable, the
// platform's own way to take part of it.
//
// `copyable` adds the corner control: Button `ghost/neutral/sm`, icon-only
// `copy`, named by `copyLabel`, placed as Dialog's close is, with its drawn box
// `space-4` from the corner. The block reserves its width at the trailing end,
// so the longest line scrolls clear of the control rather than under it. A
// press puts the code on the pasteboard, swaps the glyph to `confirm` for
// 2000ms (the fade at the control duration) and announces "Copied" politely.
// Syntax highlighting is a non-goal, as on the web.

import PolymorphTokens
import SwiftUI

public struct PMCodeBlock: PMCodeBlockRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmPageScrolls) private var scrolls
  @State private var copied = false
  /// Counts the presses, so a second press restarts the confirmation's time.
  @State private var presses = 0
  private let props: PMCodeBlockProps

  public init(props: PMCodeBlockProps) {
    self.props = props
  }

  public var body: some View {
    // The first form whose code fits the column's width; else the one that scrolls.
    ViewThatFits(in: .horizontal) {
      chrome(overflowing: false) { code }
      chrome(overflowing: true) {
        if scrolls {
          ScrollView(.horizontal) { code }
        } else {
          // The rendering harness draws no scroll view's content: the
          // overflowing block shows its start, clipped at the column's edge.
          PMScrollAtRest { code }.clipped()
        }
      }
    }
    .task(id: presses) {
      guard presses > 0 else { return }
      try? await Task.sleep(for: .milliseconds(Int(PMSpecDefault.copyFeedbackMs)))
      if !Task.isCancelled { copied = false }
    }
  }

  /// The code as written, at its own width, inside the block's padding and the
  /// copy control's reserve.
  private var code: some View {
    let space = theme.defaultDensity.space
    let reserve = props.copyable == true ? space.s4 + theme.defaultDensity.controlHeight.sm : 0
    return Text(props.children)
      .pmTextStyle(theme.text.sm.set(in: theme.fonts.mono))
      .foregroundStyle(theme.colors.textPrimary.color)
      .fixedSize()
      .textSelection(.enabled)
      .padding(space.s4)
      .padding(.trailing, reserve)
  }

  /// The block's surface, its copy control and its identity around `content`.
  private func chrome(
    overflowing: Bool, @ViewBuilder content: () -> some View
  ) -> some View {
    let density = theme.defaultDensity
    let shape = RoundedRectangle(cornerRadius: theme.radius.md)
    let copyable = props.copyable ?? false
    // The control's drawn box sits `space-4` from the corner; its hit area
    // reaches past it, as Dialog's close does.
    let inset = max(0, density.space.s4 - (density.hitTarget - density.controlHeight.sm) / 2)

    var attributes: [String: String] = [:]
    if overflowing { attributes["overflowing"] = "true" }
    if copyable { attributes["copyable"] = "true" }
    if copied { attributes["state"] = "copied" }

    return content()
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(theme.colors.bgSubtle.color, in: shape)
      .clipShape(shape)
      .overlay { shape.strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
      .overlay(alignment: .topTrailing) {
        if copyable {
          PMButton(
            props: PMButtonProps(
              icon: copied ? .confirm : .copy, iconOnly: true,
              label: props.copyLabel ?? PMStrings.copy, onClick: copy, size: .sm,
              appearance: .ghostNeutral)
          )
          .id(copied)
          .transition(.opacity)
          .animation(
            theme.defaultMotion.easing.standard.animation(
              duration: theme.defaultMotion.duration.control),
            value: copied
          )
          .padding(inset)
        }
      }
      .accessibilityElement(children: .contain)
      // The overflowing block is a region a reader moves through, and a region
      // is always named.
      .modifier(PMOptionalLabel(label: overflowing ? props.label ?? PMStrings.codeBlock : nil))
      .pmMember("CodeBlock", attributes)
  }

  private func copy() {
    PMClipboard.copy(props.children)
    copied = true
    presses += 1
    // The web's polite live region: the outcome, once.
    AccessibilityNotification.Announcement(PMStrings.copied).post()
  }
}

/// CodeBlock's states, from the spec's States table: a command that fits, a
/// line wider than the column, and the copy control. A wide block's scroll view
/// is turned off, as a page's is, because the harness draws no scroll view's
/// content: it shows the line's start, clipped.
public struct CodeBlockStates: PMStates {
  public let member = "CodeBlock"

  public init() {}

  private static let wide =
    "polymorph add button dialog drawer command popover menu tabs tooltip toast alert card "
    + "accordion badge avatar separator kbd spinner progress stepper skeleton table data-table"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("command") {
        PMCodeBlock(props: PMCodeBlockProps(children: "pnpm install\npnpm dev\npnpm proof"))
      },
      PMStateEntry(
        "wide line — scrolls in itself, never the screen",
        expect: ["overflowing": "true", "label": "Code block"]
      ) {
        PMCodeBlock(props: PMCodeBlockProps(children: Self.wide))
      },
      PMStateEntry("copyable — the corner control, named Copy", expect: ["copyable": "true"]) {
        PMCodeBlock(props: PMCodeBlockProps(children: "pnpm add @polymorph/react-ui", copyable: true))
      },
      PMStateEntry(
        "copyable and wide — the line scrolls clear of the control",
        expect: ["copyable": "true", "overflowing": "true", "label": "Install"]
      ) {
        PMCodeBlock(
          props: PMCodeBlockProps(children: Self.wide, copyable: true, label: "Install"))
      },
    ]
  }
}
