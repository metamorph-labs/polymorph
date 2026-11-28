import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { describe, expect, it } from 'vitest'

import { FOUNDATION, isFoundation, nativeMembers, SOURCES } from './contracts'
import { readSwiftSources, readSwiftTree } from './disk'
import { undrawnViolations } from './drawn'
import {
  conformanceViolations,
  containmentViolations,
  FOUNDATION_CONSTANTS,
  literalStringViolations,
  MEMBER_IMPORTS,
  memberOfFile,
  shadowViolations,
  staticNumberViolations,
  tokenViolations,
  type SwiftFile,
} from './laws'
import { SHAPE_ALIASES, SHAPES, UNIONS } from './mapping'
import { PENDING, PLATFORM_GAPS } from './pending'
import { branches, isKeyword, parseType, type TsMember, type TsType } from './typescript-type'
import { UNDRAWN, type UndrawnProps } from './undrawn'

/**
 * The laws over the SwiftUI members in `platforms/ios/Sources/PolymorphUI`,
 * `Generated/` left out. They read files only: the rendering harness (`swift
 * test`) and the simulator audit are the gate's later steps
 * (`docs/verification.md`, "The iOS gate").
 *
 * The pending list is pinned here. It holds every member the iOS platform map
 * marks native or adapted that has no rendering. `pnpm new:member` adds a new
 * member to it and raises this number; implementing a member means removing it
 * from `pending.ts` and lowering this number in the same change.
 */
const PENDING_COUNT = 0

const ROOT = resolve(import.meta.dirname, '../../..')
const registry = buildRegistry(ROOT)
const members = nativeMembers(registry)
const tierOf = new Map(members.map((member) => [member.name, member.tier]))

const files: SwiftFile[] = Object.entries(readSwiftSources(ROOT)).map(([path, source]) => ({
  path,
  source,
}))
/** Every file the token and literal laws read: all but the foundation, where the platform meets the tokens. */
const drawingFiles = files.filter((file) => file.path !== FOUNDATION)
/** The member files: all but the foundation and its further files, `PolymorphUI+<Topic>.swift`. */
const memberFiles = files.filter((file) => !isFoundation(file.path))
/** The foundation file of the chart members' shared parts, the one foundation file that imports Charts. */
const CHART_FOUNDATION = 'PolymorphUI+Charts.swift'

describe(`the iOS members (${SOURCES})`, () => {
  it('finds the foundation and at least one member, so a pass is not vacuous', () => {
    expect(files.map((file) => file.path)).toContain(FOUNDATION)
    expect(memberFiles.length).toBeGreaterThan(0)
  })

  it('token-only: every value in a member and a foundation part comes from the theme', () => {
    expect(drawingFiles.flatMap((file) => tokenViolations(file))).toEqual([])
  })

  it('no hand-typed measures: a member file initialises no measure with a number', () => {
    expect(memberFiles.flatMap((file) => staticNumberViolations(file))).toEqual([])
  })

  it('no hand-typed measures: a foundation file does so only in its geometry, its spec defaults and its fixtures', () => {
    const foundation = files.filter((file) => isFoundation(file.path))
    expect(foundation.length).toBeGreaterThan(1)
    expect(
      foundation.flatMap((file) => staticNumberViolations(file, undefined, FOUNDATION_CONSTANTS)),
    ).toEqual([])
  })

  it('no literal strings: text a person reads comes from props', () => {
    expect(drawingFiles.flatMap((file) => literalStringViolations(file))).toEqual([])
  })

  it('containment: SwiftUI, Foundation and PolymorphTokens; Charts in charts; icons through PMIconView', () => {
    expect(
      files.flatMap((file) =>
        containmentViolations(file, {
          // The chart members' shared parts (axes, legend, readout, annotations)
          // are Swift Charts content, so their foundation file draws with it too.
          chart: tierOf.get(memberOfFile(file.path)) === 'charts' || file.path === CHART_FOUNDATION,
          foundation: file.path === FOUNDATION,
          imports: MEMBER_IMPORTS[memberOfFile(file.path)],
        }),
      ),
    ).toEqual([])
  })

  it('conformance: every native or adapted member has a conforming file or is pending', () => {
    expect(
      conformanceViolations({
        files: memberFiles,
        members: members.map((member) => member.name),
        pending: PENDING,
      }),
    ).toEqual([])
  })

  it('no shadowing: no PolymorphUI type takes the name of a PolymorphTokens type', () => {
    const tree = (dir: string) =>
      Object.entries(readSwiftTree(ROOT, dir)).map(([path, source]) => ({
        path: `${dir}/${path}`,
        source,
      }))
    const tokens = tree('platforms/ios/Sources/PolymorphTokens')
    expect(tokens.length).toBeGreaterThan(0)
    expect(shadowViolations(tree(SOURCES), tokens)).toEqual([])
  })

  it('every platform gap is a rendered member’s, says what and why, and is named in its file', () => {
    expect(PLATFORM_GAPS.length).toBeGreaterThan(0)
    for (const gap of PLATFORM_GAPS) {
      const file = memberFiles.find((candidate) => memberOfFile(candidate.path) === gap.member)
      expect(file, `${gap.member} has no member file`).toBeDefined()
      expect(gap.behaviour.trim(), gap.member).not.toBe('')
      expect(gap.reason.trim(), gap.member).not.toBe('')
      expect(file?.source, `${gap.member}.swift names PLATFORM_GAPS in its header`).toContain(
        'PLATFORM_GAPS',
      )
    }
  })

  it(`the pending list has its pinned length: ${PENDING_COUNT} members to go`, () => {
    expect(
      PENDING.length,
      'implemented a member? remove it from pending.ts and lower PENDING_COUNT here',
    ).toBe(PENDING_COUNT)
  })

  it('drawn props: a rendering reads every field of its contract, or undrawn.ts says why not', () => {
    expect(
      undrawnViolations({
        language: 'swift',
        platform: 'ios',
        contract: readFileSync(resolve(ROOT, CONTRACT), 'utf8'),
        files,
        isFoundation,
        memberOf: memberOfFile,
        members: members.map((member) => member.name),
        declared: UNDRAWN,
      }),
    ).toEqual([])
  })
})

describe('the laws detect faults', () => {
  /**
   * A law is trusted once it has been seen to fail. Each sample below breaks
   * one law the way a member written without the system would, and its lawful
   * twin passes.
   */
  const file = (source: string): SwiftFile => ({ path: 'Sample.swift', source })

  it('token-only refuses raw colours, system colours and fonts, and numbers in lengths', () => {
    const faults = tokenViolations(
      file(`
        Text(props.label)
          .foregroundStyle(Color(red: 0.2, green: 0.3, blue: 0.4))
          .background(Color.blue)
          .tint(.red)
          .overlay(UIColor(white: 1, alpha: 1) as Any)
          .font(.system(size: 13))
          .font(.headline)
          .padding(12)
          .frame(width: 44, height: theme.radius.control)
          .clipShape(.rect(cornerRadius: 8))
        HStack(spacing: 4) {}
        let hex = 0xFF00AA
        let css = "#ff00aa"
      `),
    )
    expect(faults).toHaveLength(13)
    expect(faults.join('\n')).toMatch(/Color\(red:/)
    expect(faults.join('\n')).toMatch(/the number 44/)
    expect(faults.join('\n')).toMatch(/the number 4 in `spacing:`/)

    expect(
      tokenViolations(
        file(`
          // A comment may name Color.red, 0xFF and .padding(12).
          HStack(spacing: space.s1) { Text(props.label) }
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(recipe.text.color)
            .padding(.horizontal, space.s3)
            .padding(0)
            .background(recipe.fill?.color ?? .clear, in: .rect(cornerRadius: theme.radius.detail))
            .overlay { shape.strokeBorder(theme.colors.borderDefault.color, lineWidth: 1) }
        `),
      ),
    ).toEqual([])
  })

  it('token-only reads a label’s expression to its end, and no further', () => {
    // A stored property's type is the whole expression: the law stops at the
    // line's end and at the body's brace, not at the next comma in the type.
    expect(
      tokenViolations(
        file(`
          struct Glyph: View {
            let size: PMControlSize
            let rows = 5
            var body: some View { Text("\\(rows)").frame(width: theme.icon.size[size]) }
          }
          func metrics(size: PMControlSize) -> CGFloat { size == .sm ? 4 : 8 }
        `),
      ),
    ).toEqual([])
    // A wrapped expression is still read, and a literal default is a length.
    const faults = tokenViolations(
      file(`
        HStack(spacing: dense
          ? 4 : theme.defaultDensity.space.s2) {}
        let size: CGFloat = 12
      `),
    )
    expect(faults.join('\n')).toMatch(/the number 4 in `spacing:`/)
    expect(faults.join('\n')).toMatch(/the number 12 in `size:`/)
    expect(faults).toHaveLength(2)
  })

  it('token-only refuses a number multiplying a theme length, on either side', () => {
    const faults = tokenViolations(
      file(`
        let widest = space.s10 * 4
        let line = metrics.height - 2 * space.s1
        let tall = theme.defaultDensity.controlHeight.sm * 1.5
        let side = theme.icon.size[size] * 2
        HStack {}.frame(maxWidth: space.s10 * 3)
      `),
    )
    expect(faults.join('\n')).toMatch(/the number 4 multiplies a theme length/)
    expect(faults.join('\n')).toMatch(/the number 1\.5 multiplies a theme length/)
    expect(faults.join('\n')).toMatch(/the number 3 in `\.frame\(…\)`/)
    expect(faults).toHaveLength(5)

    expect(
      tokenViolations(
        file(`
          let widest = space.s10 * PMRecipe.popoverWidth
          let line = metrics.height - space.s1 - space.s1
          let dash = PMRule.thickness * 2
          let half = width / 2
          let gap = space.s6 * PMRecipe.authIllustratedGap - space.s2
        `),
      ),
    ).toEqual([])
  })

  it('no hand-typed measures refuses a static measure a number initialises', () => {
    const faults = staticNumberViolations(
      file(`
        struct Page {
          static let narrow: CGFloat = 11
          private static let ratio = 0.58
          static var floor: Double = 320
          static let breakpoint: CGFloat = 48 * PMGeometry.rem
        }
      `),
    )
    expect(faults).toHaveLength(4)
    expect(faults[0]).toMatch(/`static let narrow` is initialised with 11/)

    // A type the caller exempts is passed by name, and only that type: a
    // constant in a type nested in it, or beside it, is still read.
    const nested = file(`
      enum PMGeometry {
        static let rem: CGFloat = 16
      }
      extension PMGeometry {
        static let hairline: CGFloat = 1
        struct Inner { static let wash = 0.1 }
      }
      enum PMChartMetrics {
        static let wash = 0.1
        static let lift = PMRecipe.chartLift
      }
    `)
    expect(staticNumberViolations(nested, undefined, ['PMGeometry'])).toEqual([
      expect.stringMatching(/Sample\.swift:7: `static let wash` is initialised with 0\.1/),
      expect.stringMatching(/Sample\.swift:10: `static let wash` is initialised with 0\.1/),
    ])
    expect(staticNumberViolations(nested)).toHaveLength(4)

    expect(
      staticNumberViolations(
        file(`
          struct Page {
            static let measure = PMRecipe.listPageMeasure
            static let width: CGFloat = PMRecipe.toastWidth
            static let fewest = 2
            static let none: CGFloat = 0
            static var diameter: CGFloat { marker * 2 }
            static let name = "Badge"
          }
        `),
      ),
    ).toEqual([])
  })

  it('no literal strings refuses text a person reads written into the member', () => {
    const faults = literalStringViolations(
      file(`
        Text("Save")
        Text(verbatim: "Saved")
        Button("Cancel") {}
        Label("Inbox", systemImage: "tray")
        content.accessibilityLabel("Close").navigationTitle("Settings").help("More")
        Text("Items: \\(props.count)")
        let retry = String(localized: "Try again", comment: "Loads the page again.")
        let title = LocalizedStringResource("Inbox")
        TextField("Search", text: $query)
        SecureField("Password", text: $secret)
        Picker("Size", selection: $size) {}
        DatePicker("Due", selection: $due)
        ColorPicker("Accent", selection: $accent)
        AccessibilityNotification.Announcement("Saved").post()
        content.accessibilityAction(named: "Archive") {}
      `),
    )
    expect(faults).toHaveLength(17)
    expect(faults.join('\n')).toMatch(
      /the literal "Saved" in `AccessibilityNotification\.Announcement\(…\)`/,
    )
    expect(faults.join('\n')).toMatch(/the literal "Archive" in `\.accessibilityAction\(named:…\)`/)
    expect(faults.join('\n')).toMatch(/the literal "Try again" in `String\(localized:…\)`/)

    expect(
      literalStringViolations(
        file(`
          Text(props.label)
          Text(verbatim: props.code)
          Text("\\(props.count)")
          Text("\\(props.done) / \\(props.total)")
          Text("·")
          content.accessibilityLabel(Text(props.label))
          PMBadgeProps(children: "Active")
          content.accessibilityLabel(Text(props.closeLabel ?? PMSpecDefault.close))
          TextField(props.label, text: $query)
          DatePicker(name ?? "", selection: $due)
          AccessibilityNotification.Announcement(props.message).post()
          content.accessibilityAction(named: Text(props.label)) {}
        `),
      ),
    ).toEqual([])
  })

  it('containment refuses foreign imports, unguarded platform imports, Charts outside charts and raw icons', () => {
    const source = `
      import SwiftUI
      import Combine
      import UIKit
      import Charts
      #if canImport(AppKit)
        import AppKit
      #endif
      let glyph = Image(systemName: "star")
    `
    expect(containmentViolations(file(source), { chart: false, foundation: false })).toHaveLength(4)
    expect(containmentViolations(file(source), { chart: true, foundation: true })).toHaveLength(2)

    // A module MEMBER_IMPORTS names is lawful in its member and nowhere else.
    const qr = file('import CoreImage.CIFilterBuiltins\nimport SwiftUI\n')
    expect(containmentViolations(qr, { chart: false, foundation: false })).toHaveLength(1)
    expect(
      containmentViolations(qr, {
        chart: false,
        foundation: false,
        imports: MEMBER_IMPORTS.QRCode,
      }),
    ).toEqual([])

    expect(
      containmentViolations(
        file(`
          import Foundation
          import PolymorphTokens
          import SwiftUI
          #if canImport(UIKit)
            import UIKit
          #elseif canImport(AppKit)
            import AppKit
          #endif
          let glyph = PMIconView(.time, size: .sm)
        `),
        { chart: false, foundation: false },
      ),
    ).toEqual([])
  })

  it('no shadowing refuses a PolymorphUI type named like a PolymorphTokens type', () => {
    expect(
      shadowViolations(
        [file('public struct PMIconScale: View {}\npublic enum PMLoadStatus {}')],
        [{ path: 'PMTheme.swift', source: 'public struct PMIconScale: Sendable {}' }],
      ),
    ).toEqual([
      'Sample.swift:1: declares PMIconScale, which PolymorphTokens declares at PMTheme.swift:1 — an app importing both could not name either',
    ])
  })

  it('conformance refuses a file without its rendering or fixture, a stranger, and a stale pending list', () => {
    const lawful = `
      public struct PMBadge: PMBadgeRendering { }
      public struct BadgeStates: PMStates { public let member = "Badge" }
    `
    const faults = conformanceViolations({
      files: [
        { path: 'Badge.swift', source: 'public struct Badge: View {}' },
        { path: 'Avatar.swift', source: lawful },
        { path: 'Gadget.swift', source: lawful },
      ],
      members: ['Avatar', 'Badge', 'Card'],
      pending: ['Avatar', 'Avatar', 'Ghost'],
    })
    expect(faults).toEqual([
      'Badge.swift: declares no `PMBadge` conforming to `PMBadgeRendering`',
      'Badge.swift: declares no `BadgeStates` conforming to `PMStates`',
      'Avatar.swift: declares no `PMAvatar` conforming to `PMAvatarRendering`',
      'Avatar.swift: declares no `AvatarStates` conforming to `PMStates`',
      'Gadget.swift: Gadget is not a member the iOS platform map marks native or adapted — a file here is one member, named for it, or a foundation file, `PolymorphUI+<Topic>.swift`',
      'pending.ts: Avatar has a rendering — remove it from the list and lower the pinned count',
      'pending.ts: Avatar is listed twice',
      'pending.ts: Avatar has a rendering — remove it from the list and lower the pinned count',
      'pending.ts: Ghost is not a member the iOS platform map marks native or adapted',
      'Card renders on iOS but has no member file and is not in pending.ts',
    ])

    expect(
      conformanceViolations({
        files: [{ path: 'Badge.swift', source: lawful }],
        members: ['Badge', 'Card'],
        pending: ['Card'],
      }),
    ).toEqual([])
  })

  it('drawn props refuses a field no rendering reads, a prop handed to a member that drops it, and a stale entry', () => {
    const contract = [
      'public struct PMBadgeProps {',
      '  public var children: String',
      '  public var id: String?',
      '  public var messages: PMBadgeMessages?',
      '  public var onDismiss: PMUnsupportedBadgeOnDismiss?',
      '  public var onSelect: (@MainActor (PMBadgeSelection) -> Void)?',
      '  public var tone: PMBadgeTone?',
      '}',
      'public struct PMBadgeMessages {',
      '  public var countLabel: String?',
      '  public var dismissLabel: String?',
      '}',
      'public struct PMBadgeSelection {',
      '  public var value: String',
      '}',
      'public struct PMChipProps {',
      '  public var id: String?',
      '  public var label: String',
      '}',
    ].join('\n')
    // Badge reads `children` in its body and `onSelect` in an extension, names
    // `tone` in a comment and in its fixture only, and builds the selection it
    // reports. Chip hands `label` to Badge's `children`, which Badge reads, and
    // `id` to Badge's `id`, which Badge drops.
    const badge = `
      public struct PMBadge: PMBadgeRendering {
        private let props: PMBadgeProps
        public var body: some View {
          // The tone would be props.tone.
          Text("\\(props.children)")
            .accessibilityLabel(Text(props.messages?.dismissLabel ?? ""))
        }
      }
      extension PMBadge {
        func select() { props.onSelect?(PMBadgeSelection(value: "one")) }
      }
      public struct BadgeStates: PMStates {
        private let props: PMBadgeProps
        var toned: some View { Text(verbatim: "\\(props.tone)") }
      }
    `
    const chip = `
      public struct PMChip: PMChipRendering {
        private let props: PMChipProps
        public var body: some View {
          PMBadge(props: PMBadgeProps(children: props.label, id: props.id))
        }
      }
    `
    const check = (declared: readonly UndrawnProps[]) =>
      undrawnViolations({
        language: 'swift',
        platform: 'ios',
        contract,
        files: [
          { path: 'Badge.swift', source: badge },
          { path: 'Chip.swift', source: chip },
        ],
        isFoundation: () => false,
        memberOf: memberOfFile,
        members: ['Badge', 'Chip', 'Ghost'],
        declared,
      })
    const undeclared = (name: string) =>
      `${name}: the contract carries it and the rendering on ios never reads it — draw it, or declare it in undrawn.ts with the reason`

    expect(check([])).toEqual([
      undeclared('Badge.id'),
      undeclared('Badge.tone'),
      undeclared('Badge.BadgeMessages.countLabel'),
      undeclared('Chip.id'),
    ])
    expect(
      check([
        { props: ['id', 'tone'], reason: 'The web’s wiring.', ios: ['Badge', 'Chip'] },
        { props: ['BadgeMessages.countLabel'], reason: 'No count is drawn.', ios: ['Badge'] },
      ]),
    ).toEqual([])

    // An entry for the other platform declares nothing here.
    expect(
      check([{ props: ['id', 'tone'], reason: 'The web’s wiring.', android: ['Badge'] }]),
    ).toHaveLength(4)

    expect(
      check([
        { props: ['id', 'children'], reason: ' ', ios: ['Badge', 'Ghost'] },
        { props: ['tone', 'BadgeMessages.countLabel', 'label'], reason: 'r', ios: ['Badge'] },
        { props: ['id'], reason: 'r', ios: ['Chip', 'Badge'] },
        { props: ['tone'], reason: 'r', ios: ['Chip'] },
        { props: ['tone'], reason: 'r' },
      ]),
    ).toEqual([
      'undrawn.ts (id, children): the entry has no reason',
      'undrawn.ts (id, children): Badge.children is read by its rendering on ios — remove it from the entry',
      'undrawn.ts (id, children): Ghost has no rendering on ios',
      'undrawn.ts (tone, BadgeMessages.countLabel, label): no member the entry lists on ios has `label`',
      'undrawn.ts (id): Badge.id is declared twice on ios',
      'undrawn.ts (tone): Chip has none of the entry’s props on ios',
      'undrawn.ts (tone): no member the entry lists on ios has `tone`',
      'undrawn.ts (tone): the entry names no member on either platform',
    ])
  })

  it('drawn props takes no prop written only into the identifier for a drawn one', () => {
    const contract = [
      'public struct PMBadgeProps {',
      '  public var children: String',
      '  public var count: Int?',
      '  public var mark: PMBadgeMark?',
      '  public var pinned: Bool?',
      '  public var size: PMBadgeSize?',
      '  public var sticky: Bool?',
      '  public var tone: PMBadgeTone?',
      '  public var wide: Bool?',
      '}',
      'public struct PMBadgeMark {',
      '  public var glyph: String',
      '  public var shade: String?',
      '}',
    ].join('\n')
    // `children` and `mark.glyph` are drawn. `size` is written into the
    // identifier and also sets the font, so it is drawn. The rest reach the
    // identifier only: `sticky` in the function the call names, `pinned` in
    // the computed property it names, `count` in the dictionary it names,
    // `wide` under an `if` that only writes to that dictionary, and `tone` and
    // `mark.shade` in the call's own arguments.
    const badge = `
      public struct PMBadge: PMBadgeRendering {
        private let props: PMBadgeProps
        public var body: some View {
          Text(props.children + (props.mark?.glyph ?? ""))
            .font(props.size == .sm ? .caption : .body)
            .pmMember("Badge", attributes(size: props.size))
        }
        private func attributes(size: PMBadgeSize?) -> [String: String] {
          var found = ["size": size?.rawValue ?? "md"]
          if props.sticky == true { found["sticky"] = "true" }
          return found
        }
      }
      private struct PMBadgeDot: View {
        let props: PMBadgeProps
        private var identity: [String: String] {
          props.pinned == true ? ["pinned": "true"] : [:]
        }
        var body: some View {
          var marks = ["count": String(props.count ?? 0)]
          if props.wide == true {
            marks["wide"] = "true"
          }
          return Circle()
            .pmMember(
              "Badge",
              ["tone": props.tone?.rawValue ?? "neutral", "shade": props.mark?.shade ?? ""])
            .pmMember("Badge", identity)
            .pmMember("Badge", marks)
        }
      }
    `
    const check = (declared: readonly UndrawnProps[]) =>
      undrawnViolations({
        language: 'swift',
        platform: 'ios',
        contract,
        files: [{ path: 'Badge.swift', source: badge }],
        isFoundation: () => false,
        memberOf: memberOfFile,
        members: ['Badge'],
        declared,
      })
    const recorded = (name: string) =>
      `${name}: the rendering on ios writes it into its identifier and draws nothing from it — draw it, or declare it in undrawn.ts with the reason`

    expect(check([])).toEqual([
      recorded('Badge.count'),
      recorded('Badge.pinned'),
      recorded('Badge.sticky'),
      recorded('Badge.tone'),
      recorded('Badge.wide'),
      recorded('Badge.BadgeMark.shade'),
    ])
    // An entry declares a prop the identifier records, and still not one that is drawn.
    const entry = (props: string[]): UndrawnProps => ({ props, reason: 'r', ios: ['Badge'] })
    expect(
      check([entry(['count', 'pinned', 'sticky', 'tone', 'wide', 'BadgeMark.shade'])]),
    ).toEqual([])
    expect(
      check([entry(['count', 'pinned', 'sticky', 'tone', 'wide', 'BadgeMark.shade', 'size'])]),
    ).toEqual([
      'undrawn.ts (count, pinned, sticky, tone, wide, BadgeMark.shade, size): Badge.size is read by its rendering on ios — remove it from the entry',
    ])
  })

  it('drawn props follows a local to the identifier, and to a drawing', () => {
    const contract = [
      'public struct PMBadgeProps {',
      '  public var children: String',
      '  public var pinned: Bool?',
      '  public var sticky: Bool?',
      '  public var wide: Bool?',
      '}',
    ].join('\n')
    // Each prop is read into a local. `pinned` goes on to the identifier only.
    // So does `sticky`: the `sticky:` of `PMBadgeEdge` is an argument's label,
    // not a use of the local. `wide` also sets the frame, so it is drawn.
    const badge = `
      public struct PMBadge: PMBadgeRendering {
        private let props: PMBadgeProps
        public var body: some View {
          let pinned = props.pinned ?? false
          let sticky = props.sticky ?? false
          let wide = props.wide ?? false
          Text(props.children)
            .frame(maxWidth: wide ? .infinity : nil)
            .modifier(PMBadgeEdge(sticky: false))
            .pmMember("Badge", attributes(pinned: pinned, sticky: sticky, wide: wide))
        }
        private func attributes(pinned: Bool, sticky: Bool, wide: Bool) -> [String: String] {
          var found: [String: String] = [:]
          if pinned { found["pinned"] = "true" }
          if sticky { found["sticky"] = "true" }
          if wide { found["wide"] = "true" }
          return found
        }
      }
    `
    const recorded = (name: string) =>
      `${name}: the rendering on ios writes it into its identifier and draws nothing from it — draw it, or declare it in undrawn.ts with the reason`

    expect(
      undrawnViolations({
        language: 'swift',
        platform: 'ios',
        contract,
        files: [{ path: 'Badge.swift', source: badge }],
        isFoundation: () => false,
        memberOf: memberOfFile,
        members: ['Badge'],
        declared: [],
      }),
    ).toEqual([recorded('Badge.pinned'), recorded('Badge.sticky')])
  })

  it('drawn props reads a shape’s field only from a value of that shape', () => {
    const contract = [
      'public struct PMRangeFieldProps {',
      '  public var items: [PMRangeFieldItem]',
      '  public var messages: PMRangeFieldMessages?',
      '  public var value: PMRangeFieldRange?',
      '}',
      'public struct PMRangeFieldMessages {',
      '  public var start: String?',
      '  public var end: String?',
      '  public var clear: String?',
      '  public var empty: String?',
      '}',
      'public struct PMRangeFieldRange {',
      '  public var start: String',
      '  public var end: String',
      '}',
      'public struct PMRangeFieldItem {',
      '  public var label: String',
      '  public var hint: String?',
      '}',
    ].join('\n')
    // The member reads its range's `start` and `end`, which are not its
    // messages' `start` and `end`, and neither is the `end` of a foundation
    // type of its own. It reads `clear` through a local, each item's `label`
    // through a key path and `hint` through a closure's parameter, and hands
    // its messages to a foundation function that reads `empty`.
    const member = `
      public struct PMRangeField: PMRangeFieldRendering {
        private let props: PMRangeFieldProps
        public var body: some View {
          let messages = props.messages ?? PMStrings.rangeField
          HStack {
            Text(props.value?.start ?? "")
            Text(props.value?.end ?? "")
            Button(messages.clear ?? "") {}
            Text(pmEmptyWord(props.messages))
            ForEach(props.items, id: \\.label) { item in Text(item.hint ?? "") }
          }
        }
      }
    `
    const foundation = `
      func pmEmptyWord(_ messages: PMRangeFieldMessages?) -> String { messages?.empty ?? "" }
      struct PMLegendEdge { let end: String }
      func pmEdge(_ edge: PMLegendEdge) -> String { edge.end }
    `
    const check = (declared: readonly UndrawnProps[]) =>
      undrawnViolations({
        language: 'swift',
        platform: 'ios',
        contract,
        files: [
          { path: 'RangeField.swift', source: member },
          { path: 'PolymorphUI+Sample.swift', source: foundation },
        ],
        isFoundation: (path) => path.startsWith('PolymorphUI'),
        memberOf: memberOfFile,
        members: ['RangeField'],
        declared,
      })
    const undeclared = (name: string) =>
      `${name}: the contract carries it and the rendering on ios never reads it — draw it, or declare it in undrawn.ts with the reason`

    expect(check([])).toEqual([
      undeclared('RangeField.RangeFieldMessages.start'),
      undeclared('RangeField.RangeFieldMessages.end'),
    ])
    const entry = (props: string[]): UndrawnProps => ({ props, reason: 'r', ios: ['RangeField'] })
    expect(check([entry(['RangeFieldMessages.start', 'RangeFieldMessages.end'])])).toEqual([])
    expect(
      check([
        entry(['RangeFieldMessages.start', 'RangeFieldMessages.end', 'RangeFieldMessages.empty']),
      ]),
    ).toEqual([
      'undrawn.ts (RangeFieldMessages.start, RangeFieldMessages.end, RangeFieldMessages.empty): RangeField.RangeFieldMessages.empty is read by its rendering on ios — remove it from the entry',
    ])
  })
})

/**
 * Events keep their web names and payloads (`design/native/screen-contract.md`,
 * "Members' events"). Every prop the registry types as a function, on every
 * member the iOS platform map renders, is a field of the same name in the
 * generated contract, `PM<Member>Props` (`PM<Member><Part>Props` for a part's
 * prop), and the field's closure is the one the contract's type table gives:
 * `string` is `String`, `number` `Double`, `boolean` `Bool`, `T[]` `[T]`,
 * `T | null` `T?`, a vocabulary type `PM` + its name, a member's type parameter
 * itself, `void` (or a promise of it) as a result `Void`, every closure
 * `@MainActor`, and a DOM event parameter left out. The equivalents the
 * generator documents join the table: `ReadonlySet<T>` is `Set<T>`,
 * `Readonly<T>` is `T`, `Blob` is `Data`, a `ReactNode` is `PMContent`,
 * `[A, B]` is `(A, B)`, a name in `SHAPE_ALIASES` is its shape's, an object the
 * web writes inline is the shape in `SHAPES` that names its fields (`Pass.inlineShape`),
 * branches a union in `UNIONS` names are that union's enum, and the closures a
 * member's mode chooses between, alike but for a parameter whose branches are
 * a union `UNIONS` names, are one closure of that union's enum (`mapping.ts`,
 * `Pass.alike`).
 *
 * A member listed in `pending.ts` has no rendering yet, and its contract may
 * still hold an event it cannot express (`PMUnsupported…`); a member with a
 * rendering may not. A mismatch names the member, the prop, and both types.
 */
const CONTRACT = 'platforms/ios/Sources/PolymorphUI/Generated/Contracts.swift'

/** Every props struct in a generated contract: struct → field → its Swift type. */
function contractFields(source: string): Map<string, Map<string, string>> {
  const structs = new Map<string, Map<string, string>>()
  let current: Map<string, string> | null = null
  for (const line of source.split('\n')) {
    const open = /^public struct (PM\w+Props)(?:<[^>]*>)? \{$/.exec(line)
    if (open !== null) {
      current = new Map()
      structs.set(open[1] as string, current)
    } else if (line === '}') {
      current = null
    } else {
      const field = /^ {2}public var `?(\w+)`?: (.+)$/.exec(line)
      if (field !== null && current !== null) current.set(field[1] as string, field[2] as string)
    }
  }
  return structs
}

const DOM_EVENTS = new Set([
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'ChangeEvent',
  'FormEvent',
  'FocusEvent',
  'PointerEvent',
])
const CONTENT = new Set(['ReactNode', 'ReactElement', 'JSX.Element'])

const solidOf = (type: TsType) =>
  branches(type).filter((part) => !isKeyword(part, 'undefined') && !isKeyword(part, 'null'))

/** A function type alone, or with `null` or `undefined`: an event prop. */
/**
 * One of React's handler aliases, `ReactEventHandler<T>` and its kin: a
 * function of one DOM event, named rather than written out.
 */
const isHandlerAlias = (part: TsType) =>
  part.kind === 'reference' && /^(?:React\.)?[A-Z]\w*EventHandler$/.test(part.name)

const isEvent = (type: TsType) => {
  const solid = solidOf(type)
  return solid.length > 0 && solid.every((part) => part.kind === 'function' || isHandlerAlias(part))
}

/** `aria-label` → `ariaLabel`, as the contract names a field. */
const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

/**
 * A type by the contract's type table, or `null` when the table does not map
 * it (a union of unlike types, a literal, an object type).
 */
function bySwiftTable(
  type: TsType,
  parameters: ReadonlySet<string>,
  position: 'value' | 'result' = 'value',
): string | null {
  const solid = solidOf(type)
  if (position === 'result' && solid.length > 0) {
    const settles = solid.every(
      (part) =>
        isKeyword(part, 'void') ||
        (part.kind === 'reference' &&
          part.name === 'Promise' &&
          part.args.length === 1 &&
          isKeyword(part.args[0] as TsType, 'void')),
    )
    if (settles) return 'Void'
  }
  if (type.kind === 'union') {
    if (
      solid.length === 2 &&
      solid.every((part) => part.kind === 'literal' && typeof part.value === 'boolean')
    )
      return solid.length < type.types.length ? 'Bool?' : 'Bool'
    const inner =
      solid.length === 1
        ? bySwiftTable(solid[0] as TsType, parameters, position)
        : alikeBySwiftTable(solid, parameters, position)
    if (inner === null) return null
    if (solid.length === type.types.length) return inner
    return inner.startsWith('@MainActor') ? `(${inner})?` : `${inner}?`
  }
  switch (type.kind) {
    case 'keyword':
      return { string: 'String', number: 'Double', boolean: 'Bool' }[type.name] ?? null
    case 'array': {
      const element = bySwiftTable(type.element, parameters)
      return element === null ? null : `[${element}]`
    }
    case 'tuple': {
      const elements = type.elements.map((element) => bySwiftTable(element, parameters))
      return elements.includes(null) ? null : `(${elements.join(', ')})`
    }
    case 'reference': {
      if (CONTENT.has(type.name.replace(/^React\./, ''))) return 'PMContent'
      if (parameters.has(type.name) && type.args.length === 0) return type.name
      if (type.name === 'Blob' && type.args.length === 0) return 'Data'
      const args = type.args.map((arg) => bySwiftTable(arg, parameters))
      if (args.includes(null)) return null
      if (type.name === 'Readonly' && args.length === 1) return args[0] as string
      if (type.name === 'Record' && args.length === 2) return `[${args.join(': ')}]`
      if (['ReadonlySet', 'Set'].includes(type.name)) return `Set<${args.join(', ')}>`
      const name = `PM${(SHAPE_ALIASES[type.name] ?? type.name).replace(/\./g, '')}`
      return args.length === 0 ? name : `${name}<${args.join(', ')}>`
    }
    case 'function': {
      const params = type.params
        .filter((param) => {
          const event = solidOf(param.type)
          return !(
            event.length > 0 &&
            event.every(
              (part) =>
                part.kind === 'reference' && DOM_EVENTS.has(part.name.replace(/^React\./, '')),
            )
          )
        })
        .map((param) => {
          const mapped = bySwiftTable(param.type, parameters)
          return mapped === null || !param.optional ? mapped : `${mapped}?`
        })
      const result = bySwiftTable(type.returns, parameters, 'result')
      if (params.includes(null) || result === null) return null
      return `@MainActor (${params.join(', ')}) -> ${result.startsWith('@MainActor') ? `(${result})` : result}`
    }
    case 'object': {
      const shape = inlineShapeOf(type.members)
      return shape === undefined ? null : `PM${shape}`
    }
    default:
      return null
  }
}

/**
 * The shape in `SHAPES` that names an object the web writes inline: one with a
 * `native` reason whose fields are the object's members, each with the same
 * name, optionality and type, the union's discriminant aside.
 */
function inlineShapeOf(members: readonly TsMember[]): string | undefined {
  const solid = (type: TsType) =>
    JSON.stringify(branches(type).filter((part) => !isKeyword(part, 'undefined')))
  return Object.entries(SHAPES).find(([, shape]) => {
    if (shape.native === undefined) return false
    const own = members.filter(
      (member) => member.name !== shape.discriminant || member.type.kind !== 'literal',
    )
    if (shape.discriminant !== undefined && own.length === members.length) return false
    return (
      own.length === shape.fields.length &&
      shape.fields.every((field, index) => {
        const member = own[index] as TsMember
        return (
          member.name === field.name &&
          member.optional === (field.optional ?? false) &&
          solid(member.type) === solid(parseType(field.type))
        )
      })
    )
  })?.[0]
}

/**
 * Branches the table holds as one: the same type, or closures alike but for
 * parameters whose types the table maps to the cases of a union `UNIONS`
 * names, which take that union. `null` for any other union.
 */
function alikeBySwiftTable(
  solid: readonly TsType[],
  parameters: ReadonlySet<string>,
  position: 'value' | 'result',
): string | null {
  const named = unionOf(solid.map((part) => bySwiftTable(part, parameters)))
  if (named !== undefined) return named
  const mapped = solid.map((part) => bySwiftTable(part, parameters, position))
  if (mapped.includes(null)) return null
  if (new Set(mapped).size === 1) return mapped[0] as string
  const closures = mapped.map((text) => /^@MainActor \((.*)\) -> (.+)$/.exec(text as string))
  if (closures.includes(null)) return null
  const lists = closures.map((closure) => splitTop(closure?.[1] ?? ''))
  const results = new Set(closures.map((closure) => closure?.[2]))
  const arity = (lists[0] as string[]).length
  if (results.size !== 1 || lists.some((list) => list.length !== arity)) return null
  const params: string[] = []
  for (let index = 0; index < arity; index += 1) {
    const at = new Set(lists.map((list) => list[index] as string))
    if (at.size === 1) {
      params.push([...at][0] as string)
      continue
    }
    const union = unionOf([...at])
    if (union === undefined) return null
    params.push(union)
  }
  return `@MainActor (${params.join(', ')}) -> ${[...results][0]}`
}

/**
 * The union in `UNIONS` whose cases map, by the table, to exactly `mapped`:
 * `PM` + its name, or `undefined`. A literal case (`false`) maps to itself.
 */
function unionOf(mapped: readonly (string | null)[]): string | undefined {
  const wanted = new Set(mapped)
  if (wanted.has(null) || wanted.size < 2) return undefined
  const union = Object.entries(UNIONS).find(([, entry]) => {
    const cases = entry.cases.map((item) => {
      const type = parseType(item.type)
      return type.kind === 'literal' ? JSON.stringify(type.value) : bySwiftTable(type, new Set())
    })
    return cases.length === wanted.size && cases.every((text) => text !== null && wanted.has(text))
  })
  return union === undefined ? undefined : `PM${union[0]}`
}

/** A closure's parameter list split at its top-level commas. */
function splitTop(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if ('([<'.includes(char)) depth += 1
    if (')]>'.includes(char)) depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  return current.trim() === '' ? parts : [...parts, current.trim()]
}

/** The names a member uses as a type argument and alone, which its Swift props are generic over. */
function typeParameters(types: TsType[]): Set<string> {
  const argument = new Set<string>()
  const alone = new Set<string>()
  const visit = (type: TsType, asArgument: boolean): void => {
    if (type.kind === 'reference') {
      ;(asArgument ? argument : alone).add(type.name)
      type.args.forEach((arg) => visit(arg, true))
    } else if (type.kind === 'array') visit(type.element, asArgument)
    else if (type.kind === 'union') type.types.forEach((part) => visit(part, asArgument))
    else if (type.kind === 'function') {
      type.params.forEach((param) => visit(param.type, asArgument))
      visit(type.returns, asArgument)
    }
  }
  types.forEach((type) => visit(type, false))
  return new Set([...argument].filter((name) => alone.has(name) && !CONTENT.has(name)))
}

/** Every event of every member the iOS map renders whose contract field breaks the table. */
function eventViolations(
  registry: Registry,
  contract: string,
  pending: readonly string[],
): string[] {
  const structs = contractFields(contract)
  const members = [...registry.components, ...registry.exceptions.primitives].filter(
    (member) => member.platforms.ios.status !== 'absent',
  )
  const faults: string[] = []
  for (const member of members) {
    const parsed = member.props.flatMap((prop) => {
      try {
        return [{ prop, type: parseType(prop.type) }]
      } catch {
        return []
      }
    })
    const parameters = typeParameters(parsed.map(({ type }) => type))
    for (const { prop, type } of parsed) {
      if (!isEvent(type)) continue
      const dot = prop.name.lastIndexOf('.')
      const part = dot === -1 ? '' : prop.name.slice(0, dot).replace(/\./g, '')
      const field = camel(dot === -1 ? prop.name : prop.name.slice(dot + 1))
      const struct = `PM${member.name}${part}Props`
      const written = structs.get(struct)?.get(field)
      const where = `${member.name}.${prop.name}`
      if (written === undefined) {
        faults.push(`${where}: \`${struct}\` has no field \`${field}\``)
        continue
      }
      const nullable = branches(type).some((branch) => isKeyword(branch, 'null'))
      const omittable =
        prop.optional || branches(type).some((branch) => isKeyword(branch, 'undefined'))
      const solid = solidOf(type)
      // A handler alias carries only a DOM event, which a native member has no
      // counterpart to, so the contract leaves it unsupported (`Unsupported.swift`).
      if (solid.every(isHandlerAlias)) {
        if (!written.startsWith('PMUnsupported')) {
          faults.push(
            `${where}: \`${written}\` in the contract, where a handler alias is unsupported`,
          )
        }
        continue
      }
      const closure = bySwiftTable(
        solid.length === 1 ? (solid[0] as TsType) : { kind: 'union', types: solid },
        parameters,
      )
      if (closure === null || written.startsWith('PMUnsupported')) {
        if (pending.includes(member.name)) continue
        faults.push(`${where}: \`${written}\` in the contract, where the table maps no closure`)
        continue
      }
      // A closure is parenthesised once to be optional; each further level is a `?`.
      const levels = (nullable ? 1 : 0) + (omittable ? 1 : 0)
      const wanted = levels === 0 ? closure : `(${closure})${'?'.repeat(levels)}`
      if (written !== wanted) {
        faults.push(`${where}: \`${written}\` in the contract, and the table gives \`${wanted}\``)
      }
    }
  }
  return faults
}

describe('events keep their web names and payloads', () => {
  const contract = readFileSync(resolve(ROOT, CONTRACT), 'utf8')

  it('every event is the contract field of its name, with the closure the table gives', () => {
    expect(eventViolations(registry, contract, PENDING)).toEqual([])
  })

  it('reads every event the registry types, so a pass is not vacuous', () => {
    const events = [...registry.components, ...registry.exceptions.primitives].flatMap((member) =>
      member.platforms.ios.status === 'absent'
        ? []
        : member.props.filter((prop) => {
            try {
              return isEvent(parseType(prop.type))
            } catch {
              return false
            }
          }),
    )
    expect(events.length).toBeGreaterThan(50)
    expect(contract).toContain('public var onClick: (@MainActor () -> Void)?')
  })

  it('names the prop when a field is renamed, retyped, missing or unsupported', () => {
    const sample = (fields: string) =>
      eventViolations(
        {
          ...registry,
          components: registry.components.filter((member) =>
            ['Button', 'Select', 'DataTable'].includes(member.name),
          ),
          exceptions: { ...registry.exceptions, primitives: [] },
        },
        [
          'public struct PMButtonProps {',
          fields,
          '}',
          'public struct PMSelectProps {',
          '  public var onChange: (@MainActor (String?) -> Void)?',
          '}',
          'public struct PMDataTableProps<Row> {',
          '  public var getRowId: @MainActor (Row) -> String',
          '  public var getRowLabel: (@MainActor (Row) -> String)?',
          '  public var getRowName: (@MainActor (Row) -> String)?',
          '  public var isRowExpandable: (@MainActor (Row) -> Bool)?',
          '  public var onExpandedChange: (@MainActor (Set<String>) -> Void)?',
          '  public var onRowClick: (@MainActor (Row) -> Void)?',
          '  public var onSelectionChange: (@MainActor (Set<String>) -> Void)?',
          '  public var onSortChange: (@MainActor (PMDataTableSort) -> Void)?',
          '  public var rowDetail: (@MainActor (PMDataTableRowDetail<Row>) -> PMContent)?',
          '}',
        ].join('\n'),
        [],
      )
    expect(sample('  public var onClick: (@MainActor () -> Void)?')).toEqual([])
    expect(sample('  public var onPress: (@MainActor () -> Void)?')).toEqual([
      'Button.onClick: `PMButtonProps` has no field `onClick`',
    ])
    expect(sample('  public var onClick: (@MainActor (String) -> Void)?')).toEqual([
      'Button.onClick: `(@MainActor (String) -> Void)?` in the contract, and the table gives `(@MainActor () -> Void)?`',
    ])
    expect(sample('  public var onClick: PMUnsupportedButtonOnClick?')).toEqual([
      'Button.onClick: `PMUnsupportedButtonOnClick?` in the contract, where the table maps no closure',
    ])
  })
})
