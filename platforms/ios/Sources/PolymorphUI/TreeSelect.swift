// TreeSelect (`design/components/tree-select.md`): one node of a hierarchy,
// picked in a field. The field is Select's trigger (`PMSelectTriggerStyle`):
// Input's container with the chosen node's label, or the muted placeholder, on
// one line cut at its end, and the `expand` chevron, which turns half a turn
// while the panel is open. A tap opens the panel: a sheet on iPhone and a
// popover at the field on iPad (`presentation: .popover` keeps the popover on
// iPhone too). The panel is Tree (`PMTree`), with its items, its loading and
// its rows unchanged, `inset.list` inside the presentation's surface. Anchored,
// it is at least the trigger's width, and at most `PMRecipe.treeSelectPanelWidth`
// `space-10` steps unless the trigger is wider; it scrolls past the room the
// presentation has.
//
// Opening shows the chosen node: the branches above it open, reported through
// `onExpandedChange`, and the panel scrolls to its row. A press on a node's row
// chooses it, closes the panel and reports its id. A press on the chosen
// node's row closes the panel and reports nothing, as in Select. A press on a
// chevron opens or closes its branch and leaves the panel open. The member
// holds the open branches while the panel is closed, so a reader finds them as
// they left them. `emptyOption` is the first top-level item, with an id made
// for the instance: choosing it reports `nil`, and the trigger shows its label
// as a value, never as a placeholder. While the chosen node is not in `items`,
// the trigger shows `valueLabel`.
//
// The trigger is a button named by `ariaLabel` or its FormField's label, its
// value the label it shows, and its hint "Invalid" first while invalid. When
// the panel opens, VoiceOver starts where the sheet or the popover puts it, as
// in every presentation, and not on the chosen node. `name`, `id`,
// `ariaRequired` and the `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMTreeSelect: PMTreeSelectRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @State private var ownValue: String?
  @State private var ownExpanded: Set<String>
  @State private var presented: Bool
  @State private var triggerWidth: CGFloat = 0
  /// The empty choice's item id, made for this instance, so no id of the
  /// app's is the same. It is `nil` on the way out and back on the way in.
  @State private var emptyId = UUID().uuidString
  private let props: PMTreeSelectProps
  /// Draws the open panel under the trigger instead of presenting it, as the
  /// states fixture does: the harness renders no presentation.
  private var inPlace = false

  public init(props: PMTreeSelectProps) {
    self.props = props
    let opens = (props.defaultOpen ?? false) && !(props.disabled ?? false)
    let start = props.defaultExpanded ?? []
    _ownValue = State(initialValue: props.defaultValue)
    _ownExpanded = State(
      initialValue: opens
        ? Self.revealed(props.items, start, props.value ?? props.defaultValue) : start)
    _presented = State(initialValue: opens)
  }

  init(props: PMTreeSelectProps, inPlace: Bool) {
    self.init(props: props)
    self.inPlace = inPlace
  }

  public var body: some View {
    let size = props.size ?? .md
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let open = presented && !disabled
    let shown = shownLabel
    let attributes = Self.attributes(
      size: size, open: open, placeholder: placeholderShown, invalid: invalid, disabled: disabled)

    let trigger = Button {
      setOpen(true)
    } label: {
      PMTreeSelectValue(
        text: shown ?? props.placeholder ?? "", size: size, open: open, disabled: disabled)
    }
    .buttonStyle(
      PMSelectTriggerStyle(
        controlSize: size, invalid: invalid, placeholder: placeholderShown, held: open)
    )
    .disabled(disabled)
    .accessibilityLabel(Text(name ?? shown ?? ""))
    .accessibilityValue(Text(shown ?? props.placeholder ?? ""))
    .pmFieldHint(invalid: invalid, field?.hint)
    .pmFocusWhenNamed()
    .onGeometryChange(for: CGFloat.self) {
      $0.size.width
    } action: {
      triggerWidth = $0
    }

    Group {
      if inPlace {
        VStack(alignment: .leading, spacing: theme.defaultDensity.space.s1) {
          trigger
          if open { panel(framed: true) }
        }
        .accessibilityElement(children: .contain)
      } else {
        trigger
          .modifier(
            PMAnchoredPresentation(
              isPresented: Binding(get: { open }, set: setOpen),
              compact: props.presentation == .popover ? .popover : .sheet,
              anchor: .point(.bottomLeading), edge: .top
            ) {
              panel(framed: false)
            })
      }
    }
    .pmMember("TreeSelect", attributes)
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The panel: Tree with the member's data, the empty choice first when
  /// there is one.
  private func panel(framed: Bool) -> some View {
    PMTreeSelectPanel(
      tree: PMTreeProps(
        expanded: branches, hasMore: props.hasMore, items: items, label: props.label,
        loading: props.loading, messages: props.messages,
        onChange: { picked in choose(picked == emptyId ? nil : picked) },
        onExpandedChange: changeExpanded, onLoadMore: props.onLoadMore,
        value: .some(chosen ?? (props.emptyOption == nil ? nil : emptyId))),
      shown: chosen ?? (props.emptyOption == nil ? nil : emptyId), triggerWidth: triggerWidth,
      framed: framed
    ) {
      setOpen(false)
    }
  }

  /// The chosen node: the controlled `value` when given (`nil` inside it is
  /// none, or the empty choice), otherwise the member's own.
  private var chosen: String? {
    props.value ?? ownValue
  }

  /// The open branches: the controlled `expanded` when given, otherwise the member's own.
  private var branches: Set<String> {
    props.expanded ?? ownExpanded
  }

  /// The tree's items: the empty choice first, when there is one.
  private var items: [PMTreeItem] {
    guard let empty = props.emptyOption else { return props.items }
    return [PMTreeItem(id: emptyId, label: empty)] + props.items
  }

  /// Whether the trigger shows the placeholder: no node is chosen and no empty choice is offered.
  private var placeholderShown: Bool {
    chosen == nil && props.emptyOption == nil
  }

  /// What the trigger shows as a value: the chosen node's label, `valueLabel`
  /// while the node's level is not in `items`, or the empty choice's label;
  /// `nil` while the placeholder shows.
  private var shownLabel: String? {
    guard let chosen else { return props.emptyOption }
    return Self.find(props.items, chosen)?.node.label ?? props.valueLabel
  }

  private var name: String? {
    props.ariaLabel ?? field?.label
  }

  /// The member's own set follows every change, whoever holds the set, as Tree's does.
  private func changeExpanded(_ next: Set<String>) {
    ownExpanded = next
    props.onExpandedChange?(next)
  }

  /// Opening shows the chosen node: the branches above it open as the panel does.
  private func setOpen(_ next: Bool) {
    if next && !presented {
      let shown = Self.revealed(props.items, branches, chosen)
      if shown != branches { changeExpanded(shown) }
    }
    presented = next
  }

  private func choose(_ reported: String?) {
    ownValue = reported
    props.onChange?(reported)
    setOpen(false)
  }

  /// The node with `id`, and the ids of the branches above it from the top
  /// level down; `nil` when no level the app has passed holds it. A node's
  /// branches are in `items` whenever the node is, because each level is
  /// nested in the branch above it.
  static func find(_ items: [PMTreeItem], _ id: String) -> (node: PMTreeItem, above: [String])? {
    for item in items {
      if item.id == id { return (item, []) }
      if let under = item.children.flatMap({ find($0, id) }) {
        return (under.node, [item.id] + under.above)
      }
    }
    return nil
  }

  /// The open branches with every branch above the chosen node added, so the
  /// node is drawn when the panel opens.
  static func revealed(_ items: [PMTreeItem], _ open: Set<String>, _ chosen: String?)
    -> Set<String>
  {
    guard let chosen, let found = find(items, chosen) else { return open }
    return open.union(found.above)
  }

  static func attributes(
    size: PMControlSize, open: Bool, placeholder: Bool, invalid: Bool, disabled: Bool
  ) -> [String: String] {
    var attributes = ["size": size.rawValue, "state": open ? "open" : "closed"]
    if placeholder { attributes["placeholder"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    return attributes
  }
}

/// The trigger's content: the value or the placeholder on one line, cut at its
/// end, and the `expand` chevron, turned half a turn while the panel is open.
private struct PMTreeSelectValue: View {
  @Environment(\.pmTheme) private var theme
  let text: String
  let size: PMControlSize
  let open: Bool
  let disabled: Bool

  var body: some View {
    HStack(spacing: PMControlMetrics(size, theme).gap) {
      Text(text)
        .lineLimit(1)
        .truncationMode(.tail)
        .frame(maxWidth: .infinity, alignment: .leading)
      PMTurningChevron(
        role: .expand, open: open, turn: .degrees(180), size: size,
        color: disabled ? \.textDisabled : \.textMuted)
    }
  }
}

/// The panel: Tree `inset.list` inside, any press on a row closing it, and
/// scrolled to the chosen node's row as it appears. Anchored, it is at least
/// the trigger's width and at most the recipe's measure unless the trigger is
/// wider; in a sheet, as wide as the sheet. In place, it draws the overlay
/// surface itself.
private struct PMTreeSelectPanel: View {
  @Environment(\.pmTheme) private var theme
  @PMCompactWidth private var compact
  let tree: PMTreeProps
  let shown: String?
  let triggerWidth: CGFloat
  let framed: Bool
  let close: @MainActor () -> Void

  var body: some View {
    let density = theme.defaultDensity
    let widest = max(triggerWidth, density.space.s10 * PMRecipe.treeSelectPanelWidth)
    let anchored = framed || !compact
    ScrollViewReader { proxy in
      PMTree(props: tree)
        .environment(\.pmTreePick) { _ in close() }
        .padding(density.inset.list)
        .onAppear {
          if let shown, !framed { proxy.scrollTo(shown, anchor: .center) }
        }
    }
    .frame(
      minWidth: anchored ? triggerWidth : nil, maxWidth: anchored ? widest : .infinity,
      alignment: .leading
    )
    .modifier(PMSurfaceFrame(visible: framed))
  }
}

/// TreeSelect's states, from the spec's States table. The open rows draw the
/// trigger and, under it, the panel the presentation shows, because the
/// harness renders no presentation.
public struct TreeSelectStates: PMStates {
  public let member = "TreeSelect"

  public init() {}

  private static let label = "Organization units"
  private static let field = "Parent unit"
  private static let placeholder = "Choose a unit"

  /// Three levels of units: a branch the app has loaded, a branch it has not,
  /// and a leaf.
  private static func units(
    platformLoading: Bool = false, engineeringHasMore: Bool = false,
    applicationsDisabled: Bool = false, designDisabled: Bool = false
  ) -> [PMTreeItem] {
    [
      PMTreeItem(
        id: "engineering", label: "Engineering",
        children: [
          PMTreeItem(
            id: "platform", label: "Platform",
            children: platformLoading
              ? nil
              : [
                PMTreeItem(id: "runtime", label: "Runtime"),
                PMTreeItem(id: "storage", label: "Storage"),
              ],
            hasChildren: true, loading: platformLoading),
          PMTreeItem(id: "applications", label: "Applications", disabled: applicationsDisabled),
        ], hasMore: engineeringHasMore),
      PMTreeItem(
        id: "design", label: "Design",
        children: [PMTreeItem(id: "research", label: "Research")], disabled: designDisabled),
      PMTreeItem(id: "sales", label: "Sales"),
    ]
  }

  private static let long = [
    PMTreeItem(
      id: "programme",
      label: "Customer support operations for Europe, the Middle East and Africa")
  ]

  private func select(_ props: PMTreeSelectProps) -> PMTreeSelect {
    PMTreeSelect(props: props)
  }

  private func open(_ props: PMTreeSelectProps) -> PMTreeSelect {
    PMTreeSelect(props: props, inPlace: true)
  }

  public var entries: [PMStateEntry] {
    let sizes = PMControlSize.allCases.map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue, "value": "Sales"]) {
        select(
          PMTreeSelectProps(
            ariaLabel: Self.field, defaultValue: "sales", items: Self.units(), label: Self.label,
            size: size))
      }
    }
    return [
      PMStateEntry(
        "empty, with a placeholder",
        expect: [
          "state": "closed", "placeholder": "true", "label": Self.field,
          "value": Self.placeholder,
        ]
      ) {
        select(
          PMTreeSelectProps(
            ariaLabel: Self.field, items: Self.units(), label: Self.label,
            placeholder: Self.placeholder))
      },
      PMStateEntry("a value", expect: ["placeholder": "", "value": "Engineering"]) {
        select(
          PMTreeSelectProps(
            ariaLabel: Self.field, defaultValue: "engineering", items: Self.units(),
            label: Self.label))
      },
      PMStateEntry("a value deep in the hierarchy", expect: ["value": "Storage"]) {
        select(
          PMTreeSelectProps(
            ariaLabel: Self.field, defaultValue: "storage", items: Self.units(),
            label: Self.label))
      },
      PMStateEntry(
        "open on a value deep in the hierarchy",
        expect: [
          "state": "open",
          "contains":
            "Tree[part=row item=engineering expanded=true],Tree[part=row item=platform expanded=true],Tree[part=row item=storage selected=true]",
        ]
      ) {
        open(
          PMTreeSelectProps(
            ariaLabel: Self.field, defaultOpen: true, defaultValue: "storage",
            items: Self.units(), label: Self.label))
      },
      PMStateEntry(
        "open, a level loading",
        expect: ["state": "open", "contains": "Tree[part=row item=platform busy=true],Spinner"]
      ) {
        open(
          PMTreeSelectProps(
            ariaLabel: Self.field, defaultExpanded: ["engineering", "platform"], defaultOpen: true,
            items: Self.units(platformLoading: true), label: Self.label,
            placeholder: Self.placeholder))
      },
      PMStateEntry(
        "open, a level with more to load",
        expect: ["state": "open", "contains": "Tree[part=more level=1],Tree[part=more level=0]"]
      ) {
        open(
          PMTreeSelectProps(
            ariaLabel: Self.field, defaultExpanded: ["engineering"], defaultOpen: true,
            hasMore: true, items: Self.units(engineeringHasMore: true), label: Self.label,
            placeholder: Self.placeholder))
      },
      PMStateEntry(
        "open, disabled nodes",
        expect: [
          "state": "open",
          "contains":
            "Tree[part=row item=design disabled=true expanded=false],Tree[part=row item=applications disabled=true]",
        ]
      ) {
        open(
          PMTreeSelectProps(
            ariaLabel: Self.field, defaultExpanded: ["engineering", "design"], defaultOpen: true,
            items: Self.units(applicationsDisabled: true, designDisabled: true),
            label: Self.label, placeholder: Self.placeholder))
      },
      PMStateEntry(
        "a value whose level is not loaded", expect: ["placeholder": "", "value": "Billing"]
      ) {
        select(
          PMTreeSelectProps(
            ariaLabel: Self.field, defaultValue: "billing", items: Self.units(),
            label: Self.label, valueLabel: "Billing"))
      },
      PMStateEntry(
        "the empty choice, chosen", expect: ["placeholder": "", "value": "Top level"]
      ) {
        select(
          PMTreeSelectProps(
            ariaLabel: Self.field, emptyOption: "Top level", items: Self.units(),
            label: Self.label, value: .some(nil)))
      },
      PMStateEntry(
        "open on the empty choice",
        expect: ["state": "open", "contains": "Tree[part=row level=0 selected=true]"]
      ) {
        open(
          PMTreeSelectProps(
            ariaLabel: Self.field, defaultOpen: true, emptyOption: "Top level",
            items: Self.units(), label: Self.label))
      },
    ] + sizes + [
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        select(
          PMTreeSelectProps(
            ariaLabel: Self.field, invalid: true, items: Self.units(), label: Self.label,
            placeholder: Self.placeholder))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        select(
          PMTreeSelectProps(
            ariaLabel: Self.field, defaultValue: "sales", disabled: true, items: Self.units(),
            label: Self.label))
      },
      PMStateEntry(
        "long labels at a narrow width — the value cut",
        expect: ["value": "Customer support operations for Europe, the Middle East and Africa"]
      ) {
        select(
          PMTreeSelectProps(
            ariaLabel: Self.field, defaultValue: "programme", items: Self.long,
            label: Self.label))
      },
      PMStateEntry(
        "the move-target form",
        expect: ["part": "form", "contains": "FormField,TreeSelect[placeholder=],Button"]
      ) {
        TreeSelectForm(items: Self.units())
      },
    ]
  }
}

/// The move-target form: a FormField with a TreeSelect, beside the Button that
/// moves the unit. The fixture's own frame carries the member, so the field
/// inside is found as the TreeSelect it holds.
private struct TreeSelectForm: View {
  let items: [PMTreeItem]

  var body: some View {
    PMInline(
      props: PMInlineProps(
        align: .end,
        children: PMContent(
          Group {
            PMFormField(
              props: PMFormFieldProps(
                children: PMContent(
                  PMTreeSelect(
                    props: PMTreeSelectProps(
                      emptyOption: "Top level", items: items, label: "Organization units",
                      value: .some(nil)))),
                label: "Move under"))
            PMButton(props: PMButtonProps(label: "Move"))
          }), gap: .s3)
    )
    .accessibilityElement(children: .contain)
    .pmMember("TreeSelect", ["part": "form"])
  }
}
