// The foundation every PolymorphUI member is built on. Written by hand;
// `Generated/` is written by `pnpm native:contracts` at the repository root and
// never edited by hand.
//
// A member is one file, `<Member>.swift`, declaring `PM<Member>`, a view that
// conforms to the generated `PM<Member>Rendering` (it is built from the
// generated `PM<Member>Props`), and `<Member>States`, its states fixture. The
// laws in `packages/native/src/laws.test.ts` hold every member file to that
// shape, to theme tokens for every value, to no literal user-facing text, and
// to a short list of imports. This file is exempt from the token and literal
// laws: it is where the platform meets the tokens, and where the defaults a
// spec names are looked up. The drawing helpers several members share are in
// the foundation's further files, `PolymorphUI+<Topic>.swift`, which every
// law but conformance holds.

import PolymorphTokens
import SwiftUI

// MARK: - Content

/// A renderable child: what the web types as `ReactNode` or an element.
public typealias PMContent = AnyView

// MARK: - Sizes

/// The size scale every sized control shares, `ControlSize` on the web. A
/// control never computes its height: it reads the step from the theme.
public enum PMControlSize: String, CaseIterable, Sendable {
  case sm, md, lg
}

extension PMSpace {
  /// The length of a step of the space scale.
  subscript(_ step: PMSpaceStep) -> CGFloat {
    self[step.rawValue]
  }
}

extension PMSizeSteps {
  /// The step for a control size.
  public subscript(_ size: PMControlSize) -> CGFloat {
    switch size {
    case .sm: sm
    case .md: md
    case .lg: lg
    }
  }
}

// MARK: - Theme

private struct PMThemeKey: EnvironmentKey {
  /// The default pairing, the web's (`design/defaults.json`), until the app installs one.
  static let defaultValue: PMTheme = .default
}

extension EnvironmentValues {
  /// The pairing every member reads its tokens from.
  public var pmTheme: PMTheme {
    get { self[PMThemeKey.self] }
    set { self[PMThemeKey.self] = newValue }
  }
}

extension View {
  /// Renders the subtree under `theme`.
  public func pmTheme(_ theme: PMTheme) -> some View {
    environment(\.pmTheme, theme)
  }
}

// MARK: - Identity

/// A member's name on its root, as the web's `data-member`: the accessibility
/// identifier `member:<Name>`, followed by the attributes the rendering
/// exposes as ` key=value`, sorted by key, as the web's `data-*` attributes.
/// A value's spaces and percent signs are percent-encoded (`%20`, `%25`),
/// because some values are the app's own (a tab's `value`, a row's id) and a
/// space would split the pair. An identifier is never spoken; UI tests and the
/// rendering harness read it.
public struct PMMember: ViewModifier {
  public let name: String
  public let attributes: [String: String]

  public init(_ name: String, attributes: [String: String] = [:]) {
    self.name = name
    self.attributes = attributes
  }

  /// `member:Badge tone=neutral variant=soft`.
  public var identifier: String {
    let pairs = attributes.sorted { $0.key < $1.key }.map {
      "\($0.key)=\(Self.encode($0.value))"
    }
    return (["member:\(name)"] + pairs).joined(separator: " ")
  }

  /// The member and attributes an identifier carries, or `nil` when it is not a member's.
  public static func parse(_ identifier: String) -> (name: String, attributes: [String: String])? {
    var words = identifier.split(separator: " ").map(String.init)
    guard let first = words.first, first.hasPrefix("member:") else { return nil }
    words.removeFirst()
    var attributes: [String: String] = [:]
    for word in words {
      guard let equals = word.firstIndex(of: "=") else { return nil }
      let value = String(word[word.index(after: equals)...])
      attributes[String(word[..<equals])] = value.removingPercentEncoding ?? value
    }
    return (String(first.dropFirst("member:".count)), attributes)
  }

  /// A value with its percent signs and spaces encoded, the percent signs
  /// first, so `parse` reads back exactly what was written.
  static func encode(_ value: String) -> String {
    value.replacingOccurrences(of: "%", with: "%25").replacingOccurrences(of: " ", with: "%20")
  }

  public func body(content: Content) -> some View {
    content.accessibilityIdentifier(identifier)
  }
}

extension View {
  /// Marks the view as the root of the member `name`, exposing `attributes`.
  public func pmMember(_ name: String, _ attributes: [String: String] = [:]) -> some View {
    modifier(PMMember(name, attributes: attributes))
  }
}

// MARK: - States

/// One state a member promises: its name, its rendering, and what the rendering
/// exposes. `expect` maps an attribute the root's member identifier carries
/// (`variant`, `tone`) to its value; an empty value promises the attribute is
/// absent, as the web's `null` does. Five keys mean something else:
///
/// - `label` and `value` are the root's accessibility label and value.
/// - `hidden` set to `"true"` marks a decorative state (a plain Separator, an
///   unlabelled Skeleton): the entry exposes nothing to accessibility at all,
///   and the harness holds it to that instead of looking for its root.
/// - `contains` lists members, comma-separated (`"Alert,Input"`), each of which
///   must be the member of some element inside the root: a page archetype's
///   state draws the affordance the screen contract names. A member may name
///   attributes its element must carry too, `Menu[part=panel]`, so an open
///   state proves its panel rather than the trigger the closed state has, and
///   one it must not carry with an empty value (`disabled=`).
/// - `renders` set to `"nothing"`, with `hidden`, marks a state whose rule is
///   to draw nothing at all (a Sparkline of fewer than two points), the web's
///   `rendersNothing`: its render must match the empty canvas.
public struct PMStateEntry {
  public let name: String
  public let render: () -> AnyView
  public let expect: [String: String]

  public init<Content: View>(
    _ name: String,
    expect: [String: String] = [:],
    @ViewBuilder render: @escaping () -> Content
  ) {
    self.name = name
    self.expect = expect
    self.render = { AnyView(render()) }
  }
}

/// A member's states fixture: every state it promises. The rendering harness
/// (`Tests/PolymorphUITests`) renders each entry under two pairings and checks
/// that its root carries the member's identifier and what `expect` says.
public protocol PMStates {
  /// The member's name, as the registry spells it.
  var member: String { get }
  var entries: [PMStateEntry] { get }
}

/// Every states fixture the member files declare. `Generated/Fixtures.swift`
/// lists them.
public enum PMFixtures {}

// MARK: - The catalogue

/// How a member renders on iOS, from the platform map (`design/platforms/ios.json`).
public enum PMPlatformStatus: String, CaseIterable, Sendable {
  /// In its own form, from the platform's own primitives.
  case native
  /// Rendered another way; `rendersAs` says how.
  case adapted
  /// Not rendered; `substitute` names what to use instead.
  case absent
}

public struct PMCatalogueEntry: Sendable, Hashable {
  public let name: String
  public let status: PMPlatformStatus
  public let rendersAs: String?
  public let substitute: String?

  public init(
    name: String, status: PMPlatformStatus, rendersAs: String? = nil, substitute: String? = nil
  ) {
    self.name = name
    self.status = status
    self.rendersAs = rendersAs
    self.substitute = substitute
  }
}

/// The vocabulary on iOS. `Generated/Catalogue.swift` lists the members.
public enum PMCatalogue {}

/// A prop whose TypeScript type the contract mapping cannot express yet.
public struct PMUnsupportedProp: Sendable, Hashable {
  public let member: String
  public let prop: String
  public let typescript: String
  public let reason: String

  public init(member: String, prop: String, typescript: String, reason: String) {
    self.member = member
    self.prop = prop
    self.typescript = typescript
    self.reason = reason
  }
}

/// The contracts' gaps. `Generated/Unsupported.swift` lists them.
public enum PMUnsupported {}

// MARK: - Load status

/// What a page archetype draws in its body: the data is loading, it is ready,
/// there is none, or loading it failed (`design/native/screen-contract.md`,
/// "The four load states"). Every archetype but `AppShell` takes it as
/// `loadStatus`, a prop the native contract adds: on the web each archetype
/// takes its states as props of its own (`ListPage`'s `empty`, `AuthPage`'s
/// `pending`), which the status sets here. Each archetype switches on it
/// exhaustively, so no screen can ship without all four.
public enum PMLoadStatus: Hashable, Sendable {
  case loading
  case ready
  case empty
  case failed(message: String)
}

// MARK: - JSON values

/// Any JSON value: what the web types as `unknown` where a member shows data
/// it does not interpret, JsonTree's `data` and ToolCall's `input`. An object
/// keeps its keys in the order it is given them, as a JavaScript object keeps
/// its insertion order, so a member shows them as the app wrote them. A
/// literal builds one: `["id": 42, "tags": ["a", "b"], "draft": false]`.
public enum PMJSONValue: Hashable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([PMJSONValue])
  case object([PMJSONMember])
}

/// One key of a JSON object and its value.
public struct PMJSONMember: Hashable, Sendable {
  public let key: String
  public let value: PMJSONValue

  public init(_ key: String, _ value: PMJSONValue) {
    self.key = key
    self.value = value
  }
}

extension PMJSONValue: ExpressibleByBooleanLiteral, ExpressibleByIntegerLiteral,
  ExpressibleByFloatLiteral, ExpressibleByStringLiteral, ExpressibleByArrayLiteral,
  ExpressibleByDictionaryLiteral
{
  public typealias ArrayLiteralElement = PMJSONValue
  public typealias Key = String
  public typealias Value = PMJSONValue

  public init(booleanLiteral value: Bool) { self = .bool(value) }
  public init(integerLiteral value: Int) { self = .number(Double(value)) }
  public init(floatLiteral value: Double) { self = .number(value) }
  public init(stringLiteral value: String) { self = .string(value) }
  public init(arrayLiteral elements: PMJSONValue...) { self = .array(elements) }

  /// The keys in the order the literal writes them.
  public init(dictionaryLiteral elements: (String, PMJSONValue)...) {
    self = .object(elements.map { PMJSONMember($0.0, $0.1) })
  }
}

extension PMJSONValue: Codable {
  /// An object's key, as the coders name one.
  private struct MemberKey: CodingKey {
    let stringValue: String
    var intValue: Int? { nil }
    init(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
  }

  /// Decodes any JSON value. An object's keys come in the order the decoder
  /// lists them, which JSON itself does not fix.
  public init(from decoder: any Decoder) throws {
    if let object = try? decoder.container(keyedBy: MemberKey.self) {
      self = .object(
        try object.allKeys.map { key in
          PMJSONMember(key.stringValue, try object.decode(PMJSONValue.self, forKey: key))
        })
    } else if var array = try? decoder.unkeyedContainer() {
      var elements: [PMJSONValue] = []
      while !array.isAtEnd { elements.append(try array.decode(PMJSONValue.self)) }
      self = .array(elements)
    } else {
      let single = try decoder.singleValueContainer()
      if single.decodeNil() {
        self = .null
      } else if let value = try? single.decode(Bool.self) {
        self = .bool(value)
      } else if let value = try? single.decode(Double.self) {
        self = .number(value)
      } else {
        self = .string(try single.decode(String.self))
      }
    }
  }

  public func encode(to encoder: any Encoder) throws {
    switch self {
    case .null:
      var single = encoder.singleValueContainer()
      try single.encodeNil()
    case .bool(let value):
      var single = encoder.singleValueContainer()
      try single.encode(value)
    case .number(let value):
      var single = encoder.singleValueContainer()
      try single.encode(value)
    case .string(let value):
      var single = encoder.singleValueContainer()
      try single.encode(value)
    case .array(let elements):
      var array = encoder.unkeyedContainer()
      for element in elements { try array.encode(element) }
    case .object(let members):
      var object = encoder.container(keyedBy: MemberKey.self)
      for member in members { try object.encode(member.value, forKey: MemberKey(stringValue: member.key)) }
    }
  }
}

// MARK: - Files

/// A file a person chose, dropped or pasted: the web's `File`, as FileUpload
/// and PromptInput hand it to the app. It names the file on disk and carries
/// what the file gate reads (`design/components/file-upload.md`): its name,
/// its size in bytes and its media type. The app reads the contents from `url`.
public struct PMFile: Hashable, Sendable {
  public let url: URL
  /// The file's name with its extension, as the web's `File.name`.
  public let name: String
  /// The size in bytes.
  public let size: Double
  /// The media type, such as `application/pdf`; empty when it is unknown, as a
  /// browser leaves a dropped file's `type`.
  public let type: String

  public init(url: URL, name: String? = nil, size: Double, type: String = "") {
    self.url = url
    self.name = name ?? url.lastPathComponent
    self.size = size
    self.type = type
  }
}

// MARK: - Icons

/// The icon gateway: a role drawn as its SF Symbol (`systemName`, generated
/// from each role's `ios` in `design/icons.json`), in a square box at the
/// theme's icon size for `size`. An icon is decorative, because the text beside
/// it carries the meaning, so it is hidden from accessibility. Members draw
/// icons only through this view; the laws refuse `Image(systemName:)` in a
/// member.
///
/// The icon sizes are boxes of lucide's 24-unit grid, whose glyphs keep 2
/// units clear on every side. An SF Symbol fills the frame it is fitted to, so
/// it is fitted to the same 20-unit live area inside the box: the box keeps
/// the token's size in the layout, and the glyph draws as large as the web's.
///
/// It is `PMIconView`, not `PMIcon`, because `PMIcon` is the vocabulary member
/// `Icon`, a view built from `PMIconProps` like every other member.
public struct PMIconView: View {
  @Environment(\.pmTheme) private var theme
  public let role: PMIconRole
  public let size: PMControlSize

  public init(_ role: PMIconRole, size: PMControlSize = .md) {
    self.role = role
    self.size = size
  }

  public var body: some View {
    let box = theme.icon.size[size]
    Image(systemName: role.systemName)
      .resizable()
      .scaledToFit()
      .padding(box * PMGeometry.iconClearance)
      .frame(width: box, height: box)
      .accessibilityHidden(true)
  }
}

extension Text {
  /// An icon role as a run of text: its SF Symbol in the font of the text
  /// around it, so it flows with the words and wraps with them, which a view
  /// (`PMIconView`) cannot do inside a paragraph. It is decorative, as every
  /// icon is: the run says nothing to assistive technology.
  static func pmIcon(_ role: PMIconRole) -> Text {
    Text(Image(systemName: role.systemName)).accessibilityLabel(Text(verbatim: ""))
  }
}

// MARK: - Hit target

/// The hit area of a pressable part: a frame of at least the density's
/// `hitTarget` (44 points on iOS) around the drawn control, all of it hit-testable.
/// The control keeps its own drawn size inside the frame, so densities still
/// differ on a phone, as `docs/native.md` describes.
private struct PMHitTarget: ViewModifier {
  @Environment(\.pmTheme) private var theme
  let alignment: Alignment

  func body(content: Content) -> some View {
    let target = theme.defaultDensity.hitTarget
    content
      .frame(minWidth: target, minHeight: target, alignment: alignment)
      .contentShape(.rect)
  }
}

/// The hit region of a part drawn smaller than `hitTarget` that keeps its
/// drawn size in the layout, as the web's `--pm-hit-target` reaches past a
/// control's box without moving its neighbours: Input's clear button, a
/// choosing field's opening button inside its box, a slider's thumb, a link
/// in a line. The layout keeps the part's drawn size: the size `width` and
/// `height` give, or the part's own where it is larger, as wrapped text at
/// the largest text sizes is, and the part's own on an axis they leave out.
/// The part's hit area, and its element, the area VoiceOver's touch
/// exploration finds, is that size grown to at least the target on each
/// axis, centred on it, past the edges the layout keeps. One layout pass
/// measures the part, so nothing moves once it is drawn. In a button it goes
/// in the label or the style: a frame outside a Button does not reach its
/// element, and the automatic style keeps the drawn frame.
private struct PMHitRegion: ViewModifier {
  @Environment(\.pmTheme) private var theme
  let width: CGFloat?
  let height: CGFloat?

  func body(content: Content) -> some View {
    PMHitRegionLayout(target: theme.defaultDensity.hitTarget, width: width, height: height) {
      content
      // Under the part, so a control the part hosts (a colour well) keeps
      // the touches on it.
      Color.clear.contentShape(.rect).zIndex(-1)
    }
  }
}

/// `PMHitRegion`'s layout: the part first, laid out at its drawn size, and
/// its hit area second, the drawn size grown to the target, both centred on
/// the bounds the layout reports, which are the drawn size. The part alone is
/// measured, so the hit area takes no room.
private struct PMHitRegionLayout: Layout {
  let target: CGFloat
  let width: CGFloat?
  let height: CGFloat?

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let part = subviews.first else { return .zero }
    let natural = part.sizeThatFits(proposal)
    return CGSize(
      width: max(width ?? 0, natural.width), height: max(height ?? 0, natural.height))
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let centre = CGPoint(x: bounds.midX, y: bounds.midY)
    subviews.first?.place(at: centre, anchor: .center, proposal: ProposedViewSize(bounds.size))
    guard subviews.count > 1 else { return }
    subviews[1].place(
      at: centre, anchor: .center,
      proposal: ProposedViewSize(
        width: max(bounds.width, target), height: max(bounds.height, target)))
  }
}

/// The hit area of a part that keeps its drawn size in the layout: the
/// part's own rectangle grown to at least `hitTarget` on each axis, past its
/// edges, so its neighbours stay where the recipe puts them.
private struct PMOutsetHitArea: Shape {
  let target: CGFloat

  func path(in rect: CGRect) -> Path {
    let dx = max(0, (target - rect.width) / 2)
    let dy = max(0, (target - rect.height) / 2)
    return Path(rect.insetBy(dx: -dx, dy: -dy))
  }
}

private struct PMOutsetHitTarget: ViewModifier {
  @Environment(\.pmTheme) private var theme

  func body(content: Content) -> some View {
    content.contentShape(PMOutsetHitArea(target: theme.defaultDensity.hitTarget))
  }
}

extension View {
  /// Extends the view's hit area to the theme's `hitTarget`; the drawn part
  /// stays its own size, centred in it, or placed at `alignment` (a growing
  /// field's first line at the top, so it stays where it is as lines are
  /// added).
  func pmHitTarget(alignment: Alignment = .center) -> some View {
    modifier(PMHitTarget(alignment: alignment))
  }

  /// Extends the view's hit area to the theme's `hitTarget` past its edges
  /// without taking room in the layout, for a small part set among others at
  /// the recipe's spacing (Citation's marks). Where two such areas overlap,
  /// the part drawn later takes the touch.
  func pmHitTargetOutset() -> some View {
    modifier(PMOutsetHitTarget())
  }

  /// Extends the hit area and the element of a part drawn at `drawn` inside
  /// another control to the theme's `hitTarget`, and lays it out at `drawn`
  /// (`PMHitRegion`).
  func pmHitTarget(drawn: CGSize) -> some View {
    modifier(PMHitRegion(width: drawn.width, height: drawn.height))
  }

  /// Extends the hit area and the element of a part to the theme's
  /// `hitTarget` past its edges, and lays it out at its drawn size: `width`
  /// and `height` where the recipe gives them, measured where it does not
  /// (`PMHitRegion`).
  func pmHitRegion(width: CGFloat? = nil, height: CGFloat? = nil) -> some View {
    modifier(PMHitRegion(width: width, height: height))
  }
}

// MARK: - Focus ring

/// The focus mark of conventions §4: an outline of `focus.width` in
/// `border.focusSolid`, at `focus.offset` from the part's own shape. The
/// derived offset is minus the width, so the line lies inside the part's edge
/// and covers its border; a system's offset of 0 or more draws it outside.
/// While it lies inside, as on the web, a part with a solid fill passes
/// `onFill`, the colour the label laws hold on that fill, and the line takes
/// it; a part whose border carries state (an invalid field) passes
/// `stateBorder`, and the line moves in past that hairline, so both show. The
/// outline is the accessibility surface; the web's decorative glow is not
/// drawn. A part that takes keyboard or text focus draws it while focused; a
/// button leaves focus to the system's own focus effect.
private struct PMFocusRing: ViewModifier {
  @Environment(\.pmTheme) private var theme
  let visible: Bool
  let cornerRadius: CGFloat
  let onFill: Color?
  let stateBorder: Bool

  func body(content: Content) -> some View {
    let inside = theme.focus.offset < 0
    // The hairline every border here is drawn at.
    let offset = inside && stateBorder ? theme.focus.offset - 1 : theme.focus.offset
    let outset = offset + theme.focus.width
    let solid = theme.colors.borderFocusSolid.color
    content.overlay {
      if visible {
        RoundedRectangle(cornerRadius: cornerRadius)
          .inset(by: -outset)
          .strokeBorder(inside ? (onFill ?? solid) : solid, lineWidth: theme.focus.width)
          .allowsHitTesting(false)
      }
    }
  }
}

extension View {
  /// Draws the focus mark on the view's edge while `visible`, following a
  /// corner radius of `cornerRadius`: in `onFill` on a solid fill, and inside
  /// the border where `stateBorder` says it carries state.
  func pmFocusRing(
    _ visible: Bool,
    cornerRadius: CGFloat,
    onFill: Color? = nil,
    stateBorder: Bool = false
  ) -> some View {
    modifier(
      PMFocusRing(
        visible: visible,
        cornerRadius: cornerRadius,
        onFill: onFill,
        stateBorder: stateBorder
      )
    )
  }
}

// MARK: - Press feedback

/// The `press-feedback` micro-pattern (`design/motion/motion.md` §5): down,
/// the temperament's `pressScale` over half the control duration on the
/// standard easing; up, the `snappy` spring back. Reduce Motion and the
/// `none` temperament (whose scale is 1) leave the colour states to carry it.
private struct PMPressFeedback: ViewModifier {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let pressed: Bool

  func body(content: Content) -> some View {
    let motion = theme.defaultMotion
    let scale = pressed && !reduceMotion ? motion.pressScale : 1
    content
      .scaleEffect(scale)
      .animation(
        pressed
          ? motion.easing.standard.animation(duration: motion.duration.control / 2)
          : motion.spring.snappy.animation,
        value: pressed)
  }
}

extension View {
  /// Scales the view as a pressed control while `pressed`.
  func pmPressFeedback(_ pressed: Bool) -> some View {
    modifier(PMPressFeedback(pressed: pressed))
  }
}

// MARK: - Spec defaults

/// The defaults a spec names that are values rather than text: a toast's
/// lifetime, how long a copy control confirms, ColorInput's starting colour,
/// how many crumbs Breadcrumbs shows, ImageEditor's export size and
/// SplitPane's starting share. A member uses one only when its prop is absent. The text defaults
/// are `PMStrings`, generated into `Generated/Strings.swift` from
/// `packages/native/src/strings.ts`, which holds each to the spec that names
/// it, and looked up in the app's main bundle, so an app translates them in
/// its own string catalog. The literal law refuses a `String(localized:)` in a
/// member, so every default a member speaks is one a spec names. The chart
/// tier's catalog and ImageEditor's messages are below, looked up with
/// `String(localized:)`.
enum PMSpecDefault {
  /// Toast's `durationMs` (`toast.md`): how long a toast stays, in milliseconds.
  static let toastDurationMs: Double = 5000

  /// How long a copy control shows its confirmation, in milliseconds
  /// (`code-block.md`, `copy-button.md`): long enough to be seen after the
  /// press, short enough not to look stuck.
  static let copyFeedbackMs: Double = 2000

  /// ColorInput's `defaultValue` (`color-input.md`): a mid grey, the value a
  /// colour field holds before anything is chosen.
  static let colorValue = "#888888"

  /// Breadcrumbs' `maxItems` (`breadcrumbs.md`): how many crumbs show before
  /// the trail collapses.
  static let breadcrumbsMaxItems: Double = 4

  /// ImageEditor's `exportSize` (`image-editor.md`): the exported image's
  /// longest edge, in pixels.
  static let imageEditorExportSize: Double = 512

  /// SplitPane's `defaultRatio` (`split-pane.md`): the two panes even.
  static let splitPaneRatio: Double = 0.5

  /// Badge's `max` (`badge.md`): the largest count drawn as it is, so a count
  /// keeps to two places.
  static let badgeMax: Double = 99
}

/// The defaults a member speaks that choose among, or join, the generated
/// ones: a state word by the state, a count by whether it reached its
/// maximum, a record whose function picks between two texts.
extension PMStrings {
  /// A sorted column's direction, its header's value: the web's `aria-sort`
  /// (`table.md`).
  static func sorted(_ direction: PMSortDirection) -> String {
    switch direction {
    case .asc: ascending
    case .desc: descending
    }
  }

  /// A Stat delta's spoken text (`stat.md`, A11y): the direction, the value and
  /// the sentiment, "up 12% — positive", which the arrow and the colour show.
  static func delta(_ delta: PMStatDelta, positive: Bool) -> String {
    Self.delta(
      direction: delta.direction == .up ? up : down, value: delta.value,
      sentiment: positive ? Self.positive : negative)
  }

  /// A disclosure's state, its trigger's value: the web's `aria-expanded`,
  /// which iOS has no trait for (`accordion.md`, `collapsible.md`).
  static func disclosure(open: Bool) -> String {
    open ? expanded : collapsed
  }

  /// FilterBar's `messages` (`filter-bar.md`): the count says the total when
  /// there is one.
  static var filterBarMessages: PMFilterBarMessages {
    PMFilterBarMessages(
      clear: clearFilters,
      resultCount: { count in
        count.total.map { resultsOf(shown: count.shown, total: $0) } ?? results(shown: count.shown)
      })
  }

  /// TagInput's count (`tag-input.md`), which states the maximum once it is reached.
  static func tagInputCount(_ count: Int, max: Double?) -> String {
    if let max, Double(count) >= max { return tagInputMaximum(max: max) }
    return tagInputAdded(count: Double(count))
  }

  /// MultiSelect's `messages.selected` (`multi-select.md`), which states the
  /// maximum once it is reached.
  static func multiSelectCount(_ count: Double, max: Double?) -> String {
    if let max, count >= max { return multiSelectMaximum(max: max) }
    return multiSelectSelected(count: count)
  }

  /// What FileUpload announces when a row finishes: uploaded, or failed with
  /// the app's message when it has one (`file-upload.md`).
  static func fileUploadAnnouncement(_ file: PMFileUploadItem) -> String {
    switch file.status {
    case .done: fileUploadDone(name: file.name)
    case .error:
      file.message.map { fileUploadFailedWith(name: file.name, message: $0) }
        ?? fileUploadFailed(name: file.name)
    case .uploading: ""
    }
  }

  /// The count in a collapsed JSON object's or array's summary
  /// (`json-tree.md`): "1 key", "3 keys", "1 item", "12 items".
  static func jsonCount(_ count: Int, array: Bool) -> String {
    let value = Double(count)
    return switch (array, count == 1) {
    case (true, true): jsonItem(count: value)
    case (true, false): jsonItems(count: value)
    case (false, true): jsonKey(count: value)
    case (false, false): jsonKeys(count: value)
    }
  }

  /// Stepper's `spoken` (`stepper.md`): a step's position and state, said after
  /// its label, "step 2 of 4, current".
  static func spokenStep(_ step: PMStepperSpokenStep) -> String {
    let state =
      switch step.state {
      case .completed: stepCompleted
      case .active: stepCurrent
      case .upcoming: stepUpcoming
      case .error: stepError
      }
    return stepperSpoken(position: step.position, count: step.count, state: state)
  }

  /// One status's words in ToolCall's `messages.status` (`tool-call.md`): what
  /// the status glyph says, announced with the tool's name.
  static func toolCallStatus(_ status: PMToolCallStatus) -> String {
    switch status {
    case .pending: toolPending
    case .running: toolRunning
    case .done: toolDone
    case .error: toolFailed
    case .denied: toolDenied
    case .approval: toolAwaitingApproval
    }
  }

  /// Combobox's `messages` (`combobox.md`) as the member reads them: each the
  /// app's where it gives one, the spec's default otherwise. The contract's
  /// record leaves every field optional, the defaults' record included, which
  /// the generator fills whole.
  static func combobox(_ messages: PMComboboxMessages?) -> (
    showOptions: String, clear: String, loadingOptions: String,
    options: @MainActor (Double) -> String
  ) {
    let defaults = comboboxMessages
    return (
      messages?.showOptions ?? defaults.showOptions ?? multiSelectShowOptions,
      messages?.clear ?? defaults.clear ?? clear,
      messages?.loadingOptions ?? defaults.loadingOptions ?? multiSelectLoading,
      messages?.options ?? defaults.options ?? { multiSelectOptions(count: $0) }
    )
  }

  /// ToolCall's `messages` (`tool-call.md`): the two section headings and the
  /// six statuses' words.
  static var toolCallMessages: PMToolCallMessages {
    PMToolCallMessages(
      input: toolInput, output: toolOutput,
      status: Dictionary(
        uniqueKeysWithValues: PMToolCallStatus.allCases.map { ($0, toolCallStatus($0)) }))
  }
}

// MARK: - Data colours

/// A colour that is data, not theme: the value a ColorInput holds, as the
/// web's lowercase hex (`#rrggbb`, `#rrggbbaa` with alpha). The colour model
/// decides it, not the pairing, so it is read here, where the platform meets
/// the values, and nowhere in a member.
enum PMHexColor {
  /// The colour a hex names: three, six or eight digits, with or without `#`;
  /// `nil` when it names none.
  static func color(_ hex: String) -> Color? {
    channels(hex).map {
      Color(.sRGB, red: $0.red, green: $0.green, blue: $0.blue, opacity: $0.alpha)
    }
  }

  /// The lowercase hex of a colour, with its alpha when `alpha` is set.
  static func hex(_ color: Color, alpha: Bool) -> String {
    let resolved = color.resolve(in: EnvironmentValues())
    let byte = { (value: Float) in Int((min(1, max(0, value)) * 255).rounded()) }
    var parts = [resolved.red, resolved.green, resolved.blue].map(byte)
    if alpha { parts.append(byte(resolved.opacity)) }
    return "#" + parts.map { String(format: "%02x", $0) }.joined()
  }

  /// The hex written the way the value is stored: lowercase, `#` first, six
  /// digits, or eight with `alpha`; `nil` when the text names no colour.
  static func normalized(_ hex: String, alpha: Bool) -> String? {
    guard let parts = channels(hex) else { return nil }
    let byte = { (value: Double) in Int((value * 255).rounded()) }
    var bytes = [parts.red, parts.green, parts.blue].map(byte)
    if alpha { bytes.append(byte(parts.alpha)) }
    return "#" + bytes.map { String(format: "%02x", $0) }.joined()
  }

  private static func channels(_ hex: String) -> (red: Double, green: Double, blue: Double, alpha: Double)? {
    var digits = hex.trimmingCharacters(in: .whitespaces).lowercased()
    if digits.hasPrefix("#") { digits.removeFirst() }
    guard digits.allSatisfy(\.isHexDigit) else { return nil }
    if digits.count == 3 { digits = digits.map { "\($0)\($0)" }.joined() }
    guard digits.count == 6 || digits.count == 8, let number = UInt64(digits, radix: 16) else {
      return nil
    }
    let value = digits.count == 6 ? number << 8 | 0xff : number
    let channel = { (shift: UInt64) in Double((value >> shift) & 0xff) / 255 }
    return (channel(24), channel(16), channel(8), channel(0))
  }
}

// MARK: - Brand marks

/// A provider's mark (`design/components/icon.md`, brand marks): not an icon
/// role, because its geometry and colours are the provider's, fixed by its
/// brand terms. The drawings are generated into `Generated/Brands.swift` from
/// the engine's `BRAND_DRAWINGS` (`packages/engine/src/icon/brands.ts`), path
/// for path with the providers' published colours; GitHub's terms make its mark
/// one colour, so it takes the text colour. A mark fills the box of an icon at
/// `size`, inside the same clear margin, and is decorative beside the label
/// that names the provider. Disabled, it is desaturated and half transparent
/// as a whole, never repainted in a theme colour.
struct PMBrandMark: View {
  @Environment(\.pmTheme) private var theme
  let provider: PMProviderButtonProvider
  let size: PMControlSize
  var disabled = false

  var body: some View {
    let box = theme.icon.size[size]
    let drawing = Self.drawing(provider)
    ZStack {
      ForEach(Array(drawing.paths.enumerated()), id: \.offset) { _, path in
        let shape = PMSVGShape(d: path.d, viewBox: drawing.viewBox)
        if let fill = path.fill.flatMap(PMHexColor.color) {
          shape.fill(fill)
        } else {
          shape.fill(.foreground)
        }
      }
    }
    .aspectRatio(drawing.viewBox.width / drawing.viewBox.height, contentMode: .fit)
    .padding(box * PMGeometry.iconClearance)
    .frame(width: box, height: box)
    .grayscale(disabled ? 1 : 0)
    .opacity(disabled ? PMRecipe.brandMarkDisabledOpacity : 1)
    .accessibilityHidden(true)
  }
}

/// A brand mark's drawing: its `viewBox`, from the origin, and its paths.
struct PMBrandDrawing {
  let viewBox: CGSize
  let paths: [PMBrandPath]
}

/// One path of a brand mark: its SVG `d`, and its fill as the provider's hex
/// code, or `nil` for the text colour.
struct PMBrandPath {
  let d: String
  let fill: String?
}

/// An SVG path's `d`, drawn into the rect it is given at the scale of its
/// `viewBox`: the moves, lines, cubic and quadratic curves and circular arcs
/// the brand drawings use, absolute and relative.
struct PMSVGShape: Shape {
  let d: String
  let viewBox: CGSize

  func path(in rect: CGRect) -> Path {
    var path = Path()
    var reader = Reader(d)
    var current = CGPoint.zero
    var start = CGPoint.zero
    var control: CGPoint?
    var command: Character = "M"
    while let next = reader.command(after: command) {
      command = next
      let relative = command.isLowercase
      let origin = relative ? current : .zero
      func point() -> CGPoint? {
        guard let x = reader.number(), let y = reader.number() else { return nil }
        return CGPoint(x: origin.x + x, y: origin.y + y)
      }
      switch command.lowercased() {
      case "m":
        guard let to = point() else { return path }
        path.move(to: to)
        current = to
        start = to
        control = nil
        command = relative ? "l" : "L"
      case "l":
        guard let to = point() else { return path }
        path.addLine(to: to)
        current = to
        control = nil
      case "h":
        guard let x = reader.number() else { return path }
        current = CGPoint(x: origin.x + x, y: current.y)
        path.addLine(to: current)
        control = nil
      case "v":
        guard let y = reader.number() else { return path }
        current = CGPoint(x: current.x, y: (relative ? current.y : 0) + y)
        path.addLine(to: current)
        control = nil
      case "c":
        guard let c1 = point(), let c2 = point(), let to = point() else { return path }
        path.addCurve(to: to, control1: c1, control2: c2)
        current = to
        control = c2
      case "s":
        guard let c2 = point(), let to = point() else { return path }
        let c1 = control.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) } ?? current
        path.addCurve(to: to, control1: c1, control2: c2)
        current = to
        control = c2
      case "q":
        guard let c = point(), let to = point() else { return path }
        path.addQuadCurve(to: to, control: c)
        current = to
        control = c
      case "a":
        guard let rx = reader.number(), let ry = reader.number(), reader.number() != nil,
          let large = reader.flag(), let sweep = reader.flag(), let to = point()
        else { return path }
        Self.arc(&path, from: current, to: to, radius: (rx + ry) / 2, large: large, sweep: sweep)
        current = to
        control = nil
      case "z":
        path.closeSubpath()
        current = start
        control = nil
      default:
        return path
      }
    }
    let scale = min(rect.width / viewBox.width, rect.height / viewBox.height)
    return path.applying(
      CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: scale, y: scale))
  }

  /// A circular arc from `from` to `to`, as SVG's arc command draws it.
  private static func arc(
    _ path: inout Path, from: CGPoint, to: CGPoint, radius: CGFloat, large: Bool, sweep: Bool
  ) {
    let chord = hypot(to.x - from.x, to.y - from.y)
    guard chord > 0 else { return }
    let r = max(radius, chord / 2)
    let middle = CGPoint(x: (from.x + to.x) / 2, y: (from.y + to.y) / 2)
    let offset = sqrt(max(0, r * r - chord * chord / 4))
    let normal = CGPoint(x: -(to.y - from.y) / chord, y: (to.x - from.x) / chord)
    let side: CGFloat = large == sweep ? -1 : 1
    let center = CGPoint(x: middle.x + side * offset * normal.x, y: middle.y + side * offset * normal.y)
    let start = Angle(radians: atan2(from.y - center.y, from.x - center.x))
    let end = Angle(radians: atan2(to.y - center.y, to.x - center.x))
    path.addArc(center: center, radius: r, startAngle: start, endAngle: end, clockwise: !sweep)
  }

  /// Reads a path's commands, numbers and arc flags, in SVG's compact grammar:
  /// `.5.5` is two numbers, `-.15-3` two more, and an arc's flags are one digit each.
  private struct Reader {
    private let characters: [Character]
    private var index = 0

    init(_ text: String) {
      characters = Array(text)
    }

    private mutating func skip() {
      while index < characters.count, characters[index] == " " || characters[index] == "," {
        index += 1
      }
    }

    /// The next command letter, or `previous` again when numbers follow it.
    mutating func command(after previous: Character) -> Character? {
      skip()
      guard index < characters.count else { return nil }
      let next = characters[index]
      if next.isLetter {
        index += 1
        return next
      }
      return previous
    }

    mutating func flag() -> Bool? {
      skip()
      guard index < characters.count, characters[index] == "0" || characters[index] == "1" else {
        return nil
      }
      defer { index += 1 }
      return characters[index] == "1"
    }

    mutating func number() -> CGFloat? {
      skip()
      var text = ""
      var dot = false
      while index < characters.count {
        let character = characters[index]
        if character == "-" || character == "+" {
          guard text.isEmpty else { break }
        } else if character == "." {
          guard !dot else { break }
          dot = true
        } else if !character.isNumber {
          break
        }
        text.append(character)
        index += 1
      }
      return Double(text).map { CGFloat($0) }
    }
  }
}

// MARK: - Overlay triggers

private struct PMTriggerActionKey: EnvironmentKey {
  static let defaultValue: (@MainActor () -> Void)? = nil
}

extension EnvironmentValues {
  /// What an overlay's trigger does besides its own action: open the overlay.
  /// The web clones the trigger element to add an `onClick`; a SwiftUI view
  /// cannot be cloned, so Dialog and ConfirmDialog set this around their
  /// `trigger`, and Button runs it after its own `onClick`.
  var pmTriggerAction: (@MainActor () -> Void)? {
    get { self[PMTriggerActionKey.self] }
    set { self[PMTriggerActionKey.self] = newValue }
  }
}

// MARK: - Submitting

private struct PMSubmitActionKey: EnvironmentKey {
  static let defaultValue: (@MainActor () -> Void)? = nil
}

extension EnvironmentValues {
  /// What a `submit` Button does besides its own action: submit the form it
  /// is in. On the web the actions row is inside the `<form>`, and a submit
  /// button's click submits it; a SwiftUI button belongs to no form, so
  /// FormPage sets this around its `actions`, and Button runs it after its own
  /// `onClick` when its `type` is `submit`.
  var pmSubmitAction: (@MainActor () -> Void)? {
    get { self[PMSubmitActionKey.self] }
    set { self[PMSubmitActionKey.self] = newValue }
  }
}

// MARK: - Fields

/// What FormField hands the control it governs, as the web injects `id`,
/// `aria-describedby`, `aria-required` and `invalid` into its child: the
/// label that names the control, the hint that describes it (the error, or
/// the description when there is none), whether the field is required, and
/// whether it is invalid. A control that FormField can govern reads it from
/// `\.pmField` and names itself with it.
struct PMFieldContext {
  let label: String
  let hint: String?
  let required: Bool
  let invalid: Bool
  /// The field's `id`, which an ErrorSummary link names (`PMFieldFocusRequest`).
  var id: String? = nil
}

private struct PMFieldKey: EnvironmentKey {
  static let defaultValue: PMFieldContext? = nil
}

extension EnvironmentValues {
  /// The field the view is the control of, or `nil` outside a FormField.
  var pmField: PMFieldContext? {
    get { self[PMFieldKey.self] }
    set { self[PMFieldKey.self] = newValue }
  }
}

/// A request to move focus to the control of the field whose `id` it names:
/// what FormPage makes of an ErrorSummary link to `#<id>`, as the web's
/// fragment link focuses the control with that id. Each request is a new
/// value, so a second link to the same field moves focus again.
struct PMFieldFocusRequest: Equatable {
  let id: String
  let serial: Int

  /// The field id a link names: `#subject` names `subject`; a link with a
  /// scheme, a host or a path names none.
  static func fieldId(of url: URL) -> String? {
    guard url.scheme == nil, url.host == nil, url.path.isEmpty,
      let fragment = url.fragment, !fragment.isEmpty
    else { return nil }
    return fragment.removingPercentEncoding ?? fragment
  }
}

private struct PMFieldFocusRequestKey: EnvironmentKey {
  static let defaultValue: PMFieldFocusRequest? = nil
}

extension EnvironmentValues {
  /// The latest request for focus by field id, or `nil` outside a FormPage.
  var pmFieldFocusRequest: PMFieldFocusRequest? {
    get { self[PMFieldFocusRequestKey.self] }
    set { self[PMFieldFocusRequestKey.self] = newValue }
  }
}

/// A governed control's side of a focus request: when one names its field, a
/// control that takes text takes keyboard focus through `focused`, which
/// VoiceOver follows, and any other control takes VoiceOver's focus. Only the
/// named control carries the accessibility focus binding: `ImageRenderer`
/// draws nothing of a view that carries one, and the states fixtures and the
/// example's renders are drawn with it.
private struct PMNamedFocus: ViewModifier {
  @Environment(\.pmField) private var field
  @Environment(\.pmFieldFocusRequest) private var request
  @AccessibilityFocusState private var spoken: Bool
  let focused: FocusState<Bool>.Binding?

  func body(content: Content) -> some View {
    if let focused {
      content.onChange(of: request) { _, request in
        if names(request) { focused.wrappedValue = true }
      }
    } else {
      Group {
        if names(request) {
          content.accessibilityFocused($spoken)
        } else {
          content
        }
      }
      .onChange(of: request) { _, request in
        if names(request) { spoken = true }
      }
    }
  }

  /// Whether `request` names this control's field.
  private func names(_ request: PMFieldFocusRequest?) -> Bool {
    guard let request, let id = field?.id else { return false }
    return request.id == id
  }
}

extension View {
  /// Takes focus when an ErrorSummary link names the field this control
  /// belongs to (`PMFieldFocusRequest`): VoiceOver's focus always, and
  /// keyboard focus through `focused` for a control that takes text.
  func pmFocusWhenNamed(_ focused: FocusState<Bool>.Binding? = nil) -> some View {
    modifier(PMNamedFocus(focused: focused))
  }
}

/// What a governed control reports up to its FormField: whether it carries
/// its label in its own row (Checkbox, Switch), so the field draws no label
/// row above it, and whether it is disabled, so the field dims its label and
/// messages. The web reads both from the child element; SwiftUI cannot read
/// into a child view, so the child reports them.
struct PMFieldControl: Equatable {
  var rowLabelled = false
  var disabled = false
}

struct PMFieldControlKey: PreferenceKey {
  static let defaultValue = PMFieldControl()

  static func reduce(value: inout PMFieldControl, nextValue: () -> PMFieldControl) {
    let next = nextValue()
    value.rowLabelled = value.rowLabelled || next.rowLabelled
    value.disabled = value.disabled || next.disabled
  }
}

/// Sets the accessibility hint, empty when there is none; FormField's
/// description or error is the hint of the control it governs.
private struct PMOptionalHint: ViewModifier {
  let hint: String?

  /// Always the one modifier, with an empty hint for none, which VoiceOver
  /// does not speak. A branch would give the control another identity when its
  /// hint comes or goes, so a text field would lose focus when its error
  /// appears while the person types.
  func body(content: Content) -> some View {
    content.accessibilityHint(Text(hint ?? ""))
  }
}

extension View {
  /// The accessibility hint `hint`, which is empty when it is `nil` or empty,
  /// and VoiceOver speaks no empty hint.
  func pmAccessibilityHint(_ hint: String?) -> some View {
    modifier(PMOptionalHint(hint: hint))
  }

  /// A field control's hint: "Invalid" while `invalid`, as the web's
  /// `aria-invalid` is announced, then `hint`, its FormField's description or
  /// error.
  func pmFieldHint(invalid: Bool, _ hint: String?) -> some View {
    pmAccessibilityHint(
      [invalid ? PMStrings.invalid : nil, hint].compactMap { $0 }.filter { !$0.isEmpty }
        .joined(separator: ", "))
  }
}

// MARK: - Control sizes

/// One row of conventions §2's size table, which every sized control follows:
/// the density's height, the horizontal padding, the type step, and the gap
/// between an icon and the text. The icon itself is `PMIconView` at the same
/// size.
struct PMControlMetrics {
  let height: CGFloat
  let padding: CGFloat
  let gap: CGFloat
  let text: PMTextStyle

  init(_ size: PMControlSize, _ theme: PMTheme) {
    let density = theme.defaultDensity
    let space = density.space
    height = density.controlHeight[size]
    switch size {
    case .sm: (padding, gap, text) = (space.s4, space.s2, theme.text.xs)
    case .md: (padding, gap, text) = (space.s5, space.s3, theme.text.sm)
    case .lg: (padding, gap, text) = (space.s6, space.s3, theme.text.md)
    }
  }
}

// MARK: - Geometry

/// Lengths that are geometry rather than design decisions, so no theme holds
/// them.
enum PMGeometry {
  /// A rem in points (`platforms/ios/README.md`, "Names and units"): the unit
  /// the specs write breakpoints in. A breakpoint is geometry, not theme: one
  /// that moved with density would change a layout for a person who only
  /// asked for denser controls.
  static let rem: CGFloat = 16

  /// Half a point: how far a measured length may pass another before it
  /// counts as longer, because layout rounds a box up to the pixel grid. A
  /// scroll region whose content is within it of the viewport draws no rail.
  static let layoutTolerance: CGFloat = 0.5

  /// The clear margin of lucide's grid, as a fraction of an icon's box: 2
  /// units of 24. An SF Symbol and a brand mark sit inside it, as a lucide
  /// glyph does on the web.
  static let iconClearance: CGFloat = 2 / 24

  /// The recipes' `1px` border, one point at every display scale.
  static let hairline: CGFloat = 1
}

// MARK: - Rules

/// A hairline rule in `color`: the recipes' `1px` border, one point thick at
/// every display scale, as every border here is `lineWidth: 1`. SwiftUI's
/// `Divider` is one device pixel, a third of the recipe's line on a 3× phone.
/// Horizontal, it takes the width it is offered; vertical, the height.
struct PMRule: View {
  /// The rule's thickness, which a part that overlaps two rules lifts by.
  static let thickness = PMGeometry.hairline

  let color: PMDynamicColor
  var axis: Axis = .horizontal

  init(_ color: PMDynamicColor, axis: Axis = .horizontal) {
    self.color = color
    self.axis = axis
  }

  var body: some View {
    Rectangle()
      .fill(color.color)
      .frame(
        width: axis == .vertical ? Self.thickness : nil,
        height: axis == .horizontal ? Self.thickness : nil)
      .accessibilityHidden(true)
  }
}

// MARK: - Shadows

extension View {
  /// A shadow's inset layers, which `pmShadow` leaves out: each is the shape
  /// less itself moved by the layer's offset, filled with the layer's colour,
  /// inside the shape. Every pairing writes its inset layers with no blur and
  /// no spread (the lit fill's top light), which this draws exactly.
  func pmInsetShadow<S: Shape>(_ shadow: PMShadow, in shape: S) -> some View {
    overlay {
      ForEach(Array(shadow.layers.enumerated()), id: \.offset) { _, layer in
        if layer.inset {
          shape.subtracting(shape.offset(x: layer.x, y: layer.y))
            .fill(layer.color.color)
            .clipShape(shape)
            .allowsHitTesting(false)
        }
      }
    }
  }
}

// MARK: - Figures

private struct PMTabularFigures: ViewModifier {
  let on: Bool

  func body(content: Content) -> some View {
    if on { content.monospacedDigit() } else { content }
  }
}

extension View {
  /// Tabular figures while `on`, so a column of numbers lines up, in the
  /// theme's own font: a numeric Stat, a numeric table column.
  func pmTabularFigures(_ on: Bool) -> some View {
    modifier(PMTabularFigures(on: on))
  }
}

// MARK: - Faces

extension PMTextStyle {
  /// This step's size, tracking and line height in another font slot, upright:
  /// a step in the mono face (`theme.text.sm.set(in: theme.fonts.mono)`) for
  /// code, a key, a JSON value.
  func set(in font: PMFont) -> PMTextStyle {
    PMTextStyle(
      size: size, lineHeight: lineHeight, wght: wght, tracking: tracking, family: font.family,
      fallback: font.fallback, italic: false, opsz: nil)
  }
}

// MARK: - Spec defaults: charts

extension PMSpecDefault {
  /// The sentence every chart summary ends with: the twin holds the data
  /// (`docs/charts.md`, accessibility).
  private static var chartTwin: String {
    String(
      localized: "The same data is available as a table.",
      comment: "Ends a chart's summary: its data is also a table.")
  }

  private static func chartPoints(_ count: Int) -> String {
    count == 1
      ? String(localized: "1 point", comment: "How many rows a chart draws: one.")
      : String(localized: "\(count) points", comment: "How many rows a chart draws.")
  }

  private static func chartItems(_ count: Int) -> String {
    count == 1
      ? String(localized: "1 item", comment: "How many items a treemap has: one.")
      : String(localized: "\(count) items", comment: "How many items a treemap has.")
  }

  private static func chartGroups(_ count: Int) -> String {
    count == 1
      ? String(localized: "1 group", comment: "How many groups a treemap has: one.")
      : String(localized: "\(count) groups", comment: "How many groups a treemap has.")
  }

  private static func chartStages(_ count: Int) -> String {
    count == 1
      ? String(localized: "1 stage", comment: "How many stages a funnel chart has: one.")
      : String(localized: "\(count) stages", comment: "How many stages a funnel chart has.")
  }

  private static func chartSegments(_ count: Int) -> String {
    count == 1
      ? String(localized: "1 segment", comment: "How many segments a donut chart has: one.")
      : String(localized: "\(count) segments", comment: "How many segments a donut chart has.")
  }

  /// The chart tier's `messages` (`docs/charts.md`; the engine's
  /// `charts/messages.ts`): the English every chart speaks when the app passes
  /// no catalog. The series' names are listed in the locale's own list style.
  static var chartMessages: PMChartMessages {
    PMChartMessages(
      summary: { facts in
        let points = chartPoints(Int(facts.points))
        guard !facts.series.isEmpty else {
          return String(
            localized: "\(facts.label), \(points). \(chartTwin)",
            comment: "A chart's summary: its name and how many rows it draws.")
        }
        let names = facts.series.formatted(.list(type: .and))
        return String(
          localized: "\(facts.label) showing \(names), \(points). \(chartTwin)",
          comment: "A chart's summary: its name, its series and how many rows it draws.")
      },
      donutSummary: { facts in
        String(
          localized: "\(facts.label), \(chartSegments(Int(facts.segments))). \(chartTwin)",
          comment: "A donut chart's summary: its name and how many segments it has.")
      },
      heatmapSummary: { facts in
        guard let grid = facts.grid else {
          return String(
            localized: "\(facts.label). \(chartTwin)", comment: "A heatmap's summary with no data.")
        }
        return String(
          localized:
            "\(facts.label), \(Int(grid.rows)) rows by \(Int(grid.columns)) columns. \(chartTwin)",
          comment: "A heatmap's summary: its name and the grid's shape.")
      },
      radarSummary: { facts in
        String(
          localized:
            "\(facts.label), \(Int(facts.axes)) axes by \(Int(facts.series)) series, one shared scale from zero to \(facts.max). \(chartTwin)",
          comment: "A radar chart's summary: its name, its shape and the top of its scale.")
      },
      funnelSummary: { facts in
        String(
          localized: "\(facts.label), \(chartStages(Int(facts.stages))). \(chartTwin)",
          comment: "A funnel chart's summary: its name and how many stages it has.")
      },
      treemapSummary: { facts in
        let items = chartItems(Int(facts.items))
        let shape =
          facts.groups == 0
          ? items
          : String(
            localized: "\(items) in \(chartGroups(Int(facts.groups)))",
            comment: "A treemap's items and the groups they are in.")
        let absent = Int(facts.absent)
        let missing =
          absent == 0
          ? ""
          : absent == 1
            ? String(
              localized: " 1 has no positive value and is not drawn.",
              comment: "A treemap's one item that takes no area.")
            : String(
              localized: " \(absent) have no positive value and are not drawn.",
              comment: "How many of a treemap's items take no area.")
        return String(
          localized: "\(facts.label), \(shape).\(missing) \(chartTwin)",
          comment: "A treemap's summary: its name, its items and groups, and what is not drawn.")
      },
      activationHint: String(
        localized: "Enter or Space selects the current reading.",
        comment: "Said after a chart's summary when the chart can be activated."),
      empty: String(localized: "No data yet", comment: "An empty chart."),
      noData: String(localized: "No data", comment: "A gap in a chart's data."),
      showTable: { label in
        String(
          localized: "Show the data table for \(label)",
          comment: "The button that shows a chart's data as a table.")
      },
      hideTable: { label in
        String(
          localized: "Hide the data table for \(label)",
          comment: "The button that hides a chart's data table.")
      },
      tableLabel: { label in
        String(localized: "\(label) — data", comment: "The name of a chart's data table.")
      },
      segmentColumn: String(localized: "Segment", comment: "A donut chart's table: the segment."),
      valueColumn: String(localized: "Value", comment: "A chart's table: the value."),
      shareColumn: String(localized: "Share", comment: "A donut chart's table: the share."),
      rangeColumn: String(localized: "Range", comment: "A histogram's table: a bin's range."),
      countColumn: String(localized: "Count", comment: "A histogram's table: a bin's count."),
      stageColumn: String(localized: "Stage", comment: "A funnel chart's table: the stage."),
      continuedColumn: String(
        localized: "Continued",
        comment: "A funnel chart's table: the share of the stage before that reached this one."),
      continued: { rate in
        String(
          localized: "\(rate) continued",
          comment: "A funnel chart's step: the share of one stage that reached the next.")
      },
      groupColumn: String(localized: "Group", comment: "A treemap's table: the group."),
      itemColumn: String(localized: "Item", comment: "A treemap's table: the item."),
      quarter: { quarter in
        String(localized: "Q\(Int(quarter))", comment: "A quarter on a date axis, 1 to 4.")
      })
  }

  /// LineChart's and AreaChart's catalog (`line-chart.md`, `area-chart.md`): a
  /// trend covers a span of time, so the empty sentence names the range.
  static var chartRangeMessages: PMChartMessages {
    var messages = chartMessages
    messages.empty = String(
      localized: "No data in this range", comment: "An empty chart of a trend over time.")
    return messages
  }

  /// Stat's `sparkLabel` (`stat.md`): the sparkline's name, from the stat's label.
  static func sparkLabel(_ label: String) -> String {
    String(localized: "\(label), recent trend", comment: "The name of a stat's trend line.")
  }

  /// Heatmap's catalog (`heatmap.md`): an empty grid is no activity over its span.
  static var chartGridMessages: PMChartMessages {
    var messages = chartMessages
    messages.empty = String(
      localized: "No activity in this range", comment: "An empty heatmap.")
    return messages
  }
}

// MARK: - Spec defaults: the image editor

extension PMSpecDefault {
  /// ImageEditor's `messages` (`image-editor.md`), each the web's default.
  static var imageEditorMessages: PMImageEditorMessages {
    PMImageEditorMessages(
      title: String(localized: "Add an image", comment: "An empty image editor's title."),
      hint: String(localized: "Drop, paste, or browse", comment: "How to give the image editor an image."),
      browse: String(localized: "Browse files", comment: "The button that chooses an image to frame."),
      rotate: String(localized: "Rotate 90 degrees", comment: "Turns the framed image a quarter turn."),
      flip: String(localized: "Flip horizontally", comment: "Mirrors the framed image."),
      reset: String(localized: "Reset framing", comment: "Returns the framed image to its start."),
      zoom: String(localized: "Zoom", comment: "The slider that zooms the framed image."),
      cancel: String(localized: "Cancel", comment: "Leaves the image editor without saving."),
      confirm: String(localized: "Save", comment: "Saves the framed image."),
      alt: String(localized: "Image being framed", comment: "The name of the image in the editor."),
      stage: String(
        localized: "Image position. Arrow keys pan, plus and minus zoom.",
        comment: "The name of the surface that pans and zooms the framed image."),
      loadError: String(
        localized: "That image couldn't be read. Choose another file.",
        comment: "Announced when the chosen file is not an image."))
  }
}
