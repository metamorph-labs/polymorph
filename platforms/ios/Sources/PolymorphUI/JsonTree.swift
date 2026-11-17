// JsonTree (`design/components/json-tree.md`): one JSON value, browsable. An
// object or an array is a branch that opens and closes; everything else is a
// leaf, its value coloured by kind. JSON is code, so the whole tree is in the
// mono face at `text.sm`. The kind colours come from the text and accent
// roles, never the status family: a string in `text.secondary`, quoted; a
// number in `accent.text`; a boolean or `null` in `text.muted`, italic. A key
// is `text.primary` with its colon in `text.muted`.
//
// A branch is a toggle row: the `next` chevron, the key, and the summary
// (`{…} 3 keys`, `[…] 12 items`) in `text.muted`. The chevron turns a quarter
// turn while open, on the control tokens; a press washes the row in
// `bg.subtle` at `radius.sm`. The row takes the hit target's height, so two
// branches one above the other are each a target of their own; a leaf keeps
// the recipe's `space-1` above and below its line. Children appear at once,
// in every temperament, because a large subtree cannot animate in smoothly;
// they are indented `space-5` behind a `border.subtle` guide `space-2` in from
// the toggle column. An empty object or array is a leaf, `{}` or `[]`: a
// toggle that opens onto nothing is not drawn.
//
// Depth is the only setting: `defaultDepth` levels open at first (1 by
// default, `0` all closed, `.infinity` all open); after that each branch keeps
// its own state, because what a reader opens is not app state. The tree is a
// container named by `label`; each toggle is a button named by its key and
// summary ("assignee, 2 keys") whose value says whether it is open, as the
// web's `aria-expanded` is announced; each leaf is one element, its key and
// value read together. It is not CodeBlock (nothing to copy) and not an
// editor (nothing changes).

import PolymorphTokens
import SwiftUI

public struct PMJsonTree: PMJsonTreeRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMJsonTreeProps

  public init(props: PMJsonTreeProps) {
    self.props = props
  }

  public var body: some View {
    JsonTreeEntry(name: nil, value: props.data, depth: 0, defaultDepth: props.defaultDepth ?? 1)
      .pmTextStyle(theme.text.sm.set(in: theme.fonts.mono))
      .foregroundStyle(theme.colors.textPrimary.color)
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text(props.label))
      .pmMember("JsonTree")
  }
}

/// One value at one place in the tree: a branch for an object or an array
/// with something in it, a leaf for anything else.
private struct JsonTreeEntry: View {
  let name: String?
  let value: PMJSONValue
  let depth: Int
  let defaultDepth: Double

  var body: some View {
    switch value {
    case .object(let members) where !members.isEmpty:
      JsonTreeBranch(
        name: name, entries: members.map { ($0.key, $0.value) }, array: false, depth: depth,
        defaultDepth: defaultDepth)
    case .array(let elements) where !elements.isEmpty:
      JsonTreeBranch(
        name: name, entries: elements.enumerated().map { (String($0.offset), $0.element) },
        array: true, depth: depth, defaultDepth: defaultDepth)
    default:
      JsonTreeLeaf(name: name, value: value)
    }
  }
}

/// An object or array with entries: its toggle row, and its entries one level
/// in while it is open.
private struct JsonTreeBranch: View {
  @Environment(\.pmTheme) private var theme
  @State private var open: Bool
  let name: String?
  let entries: [(String, PMJSONValue)]
  let array: Bool
  let depth: Int
  let defaultDepth: Double

  init(
    name: String?, entries: [(String, PMJSONValue)], array: Bool, depth: Int, defaultDepth: Double
  ) {
    self.name = name
    self.entries = entries
    self.array = array
    self.depth = depth
    self.defaultDepth = defaultDepth
    _open = State(initialValue: Double(depth) < defaultDepth)
  }

  var body: some View {
    let space = theme.defaultDensity.space
    let count =
      PMStrings.jsonCount(entries.count, array: array)
    let summary = "\(array ? JsonSpelling.collapsedArray : JsonSpelling.collapsedObject) \(count)"

    VStack(alignment: .leading, spacing: 0) {
      Button {
        // No animation: the children appear at once; only the chevron turns.
        open.toggle()
      } label: {
        HStack(spacing: space.s2) {
          PMTurningChevron(role: .next, open: open, turn: .degrees(90))
          if let name {
            JsonTreeKey(name: name)
          }
          Text(summary)
            .foregroundStyle(theme.colors.textMuted.color)
        }
        .padding(.horizontal, space.s1)
      }
      .buttonStyle(PMWashRowStyle(wash: theme.colors.bgSubtle, cornerRadius: theme.radius.sm))
      .accessibilityLabel(Text(name.map { "\($0), \(count)" } ?? count))
      .accessibilityValue(Text(PMStrings.disclosure(open: open)))

      if open {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
            JsonTreeEntry(
              name: entry.0, value: entry.1, depth: depth + 1, defaultDepth: defaultDepth)
          }
        }
        .padding(.leading, space.s5)
        .overlay(alignment: .leading) { PMRule(theme.colors.borderSubtle, axis: .vertical) }
        .padding(.leading, space.s2)
      }
    }
  }
}

/// A value with nothing to open: its key, then its value in its kind's colour.
/// The value wraps beside the key, so a long string keeps its key in view.
private struct JsonTreeLeaf: View {
  @Environment(\.pmTheme) private var theme
  let name: String?
  let value: PMJSONValue

  var body: some View {
    let space = theme.defaultDensity.space
    let spelling = JsonSpelling(value, colors: theme.colors)
    HStack(alignment: .firstTextBaseline, spacing: 0) {
      if let name {
        JsonTreeKey(name: name)
          .padding(.leading, space.s1)
          .padding(.trailing, space.s2)
          .layoutPriority(1)
      }
      Text(spelling.text)
        .foregroundStyle(spelling.color.color)
        .italic(spelling.italic)
        .padding(.horizontal, space.s1)
        .fixedSize(horizontal: false, vertical: true)
    }
    // The recipe's 2px row padding, `space-1` at every density.
    .padding(.vertical, space.s1)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }
}

/// A key and its colon.
private struct JsonTreeKey: View {
  @Environment(\.pmTheme) private var theme
  let name: String

  var body: some View {
    Text(name).foregroundStyle(theme.colors.textPrimary.color)
      + Text(JsonSpelling.colon).foregroundStyle(theme.colors.textMuted.color)
  }
}

/// A leaf's value as JSON writes it, and how its kind is drawn: a string quoted
/// and escaped as `JSON.stringify` writes it, a number as JavaScript prints
/// it, `true`, `false` and `null` as JSON's own words. They are code, not text
/// to translate, as a CodeBlock's lines are.
private struct JsonSpelling {
  static let null = "null"
  static let colon = ":"
  static let emptyObject = "{}"
  static let emptyArray = "[]"
  static let collapsedObject = "{…}"
  static let collapsedArray = "[…]"

  let text: String
  let color: PMDynamicColor
  let italic: Bool

  init(_ value: PMJSONValue, colors: PMColors) {
    switch value {
    case .string(let string):
      (text, color, italic) = (Self.quoted(string), colors.textSecondary, false)
    case .number(let number):
      (text, color, italic) = (Self.number(number), colors.accentText, false)
    case .bool(let bool):
      (text, color, italic) = (String(bool), colors.textMuted, true)
    case .null:
      (text, color, italic) = (Self.null, colors.textMuted, true)
    // Only an empty container reaches a leaf; it draws as the summary does.
    case .object:
      (text, color, italic) = (Self.emptyObject, colors.textMuted, false)
    case .array:
      (text, color, italic) = (Self.emptyArray, colors.textMuted, false)
    }
  }

  /// A whole number without a fraction, as JavaScript prints `2`; any other
  /// number in its shortest form that reads back the same, as `41.5`.
  static func number(_ value: Double) -> String {
    if value.isFinite, value == value.rounded(), abs(value) < 1e15 {
      return String(Int64(value))
    }
    return String(value)
  }

  /// The string in double quotes, with the quote, the backslash and the
  /// control characters escaped, as `JSON.stringify` writes it.
  static func quoted(_ string: String) -> String {
    var out = "\""
    for scalar in string.unicodeScalars {
      switch scalar {
      case "\"": out += "\\\""
      case "\\": out += "\\\\"
      case "\n": out += "\\n"
      case "\r": out += "\\r"
      case "\t": out += "\\t"
      case "\u{8}": out += "\\b"
      case "\u{C}": out += "\\f"
      case _ where scalar.value < 32: out += String(format: "\\u%04x", scalar.value)
      default: out.unicodeScalars.append(scalar)
      }
    }
    return out + "\""
  }
}

/// JsonTree's states, from the spec's States table: a payload with its first
/// level open, all closed, all open, one leaf of every kind, the empty
/// containers, and a value that is not a container at all.
public struct JsonTreeStates: PMStates {
  public let member = "JsonTree"

  public init() {}

  static let payload: PMJSONValue = [
    "id": "tkt_5417",
    "title": "Sync fails on large workspaces",
    "priority": 2,
    "resolved": false,
    "assignee": ["name": "Ada Okonkwo", "team": "Platform"],
    "labels": ["sync", "performance"],
    "closedAt": .null,
  ]

  private static let everyKind: PMJSONValue = [
    "string": "a string", "number": 41.5, "boolean": true, "nothing": .null,
  ]

  private static let empty: PMJSONValue = ["empty": [:], "none": []]

  private static let body = "Response body"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("a payload — the first level open", expect: ["label": Self.body]) {
        PMJsonTree(props: PMJsonTreeProps(data: Self.payload, label: Self.body))
      },
      PMStateEntry("closed fist — depth 0", expect: ["label": Self.body]) {
        PMJsonTree(props: PMJsonTreeProps(data: Self.payload, defaultDepth: 0, label: Self.body))
      },
      PMStateEntry("wide open — every level", expect: ["label": Self.body]) {
        PMJsonTree(
          props: PMJsonTreeProps(data: Self.payload, defaultDepth: .infinity, label: Self.body))
      },
      PMStateEntry("every kind", expect: ["label": "Every kind"]) {
        PMJsonTree(
          props: PMJsonTreeProps(
            data: Self.everyKind, defaultDepth: .infinity, label: "Every kind"))
      },
      PMStateEntry(
        "empty containers — leaves, no toggle", expect: ["label": "Empty containers"]
      ) {
        PMJsonTree(
          props: PMJsonTreeProps(
            data: Self.empty, defaultDepth: .infinity, label: "Empty containers"))
      },
      PMStateEntry("primitive root", expect: ["label": "A number alone"]) {
        PMJsonTree(props: PMJsonTreeProps(data: 42, label: "A number alone"))
      },
    ]
  }
}
