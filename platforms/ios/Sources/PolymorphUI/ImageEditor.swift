// ImageEditor (`design/components/image-editor.md`): frames one image in a
// fixed crop by panning, zooming and quarter turns, and hands the app the
// framed result as image data.
//
// The platform's photo-editing idioms: the empty state's browse control opens
// the system photo picker (`PhotosPicker`), and an image dragged onto it
// (iPadOS, macOS) loads as a drop; on the stage one finger pans and a pinch
// zooms, as in Photos' crop, with the zoom slider beside the commands. A
// hardware keyboard pans with the arrows (one space step, four with Shift)
// and zooms with plus and minus.
//
// The law of the frame (`image-editor.geometry.ts`, ported): zoom is a
// multiple of cover, the smallest scale at which the turned image covers the
// crop, from 1 to `maxZoom` (clamped to 2–8), so the crop never shows past the
// image; the centre is clamped after every pan, zoom and turn; a turn is a
// quarter turn clockwise, which swaps the image's width and height; the
// mirror negates the image's own x before the turn. The export re-projects
// the crop from the natural image, never from the screen, onto a canvas whose
// longest edge is `exportSize`, through ImageIO, in `exportType`.
//
// Motion: panning, pinching and sliding follow the hand and never animate;
// rotate, flip and reset are commands and animate over the control duration
// on the standard easing, or apply at once under Reduce Motion. The mask
// (`circle`, `rounded`) and the rule-of-thirds grid, shown while panning,
// are paint only, hidden from assistive technology.
//
// Gaps, by the platform: `onConfirm` returns nothing a native closure can
// wait for, so the confirm button has no busy state; ImageIO on iOS 17 writes
// no WebP, so `image/webp` exports PNG where the system has no WebP encoder;
// paste is not offered, because iOS has no paste scoped to a focused control;
// `id` names no element.

import ImageIO
import PhotosUI
import PolymorphTokens
import SwiftUI
import UniformTypeIdentifiers

public struct PMImageEditor: PMImageEditorRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var chosen: CGImage?
  @State private var loadedSource: String?
  @State private var center: CGPoint?
  /// The stage's laid-out size: the crop the clamps and the export are of.
  @State private var viewport: CGSize = .zero
  @State private var zoom: Double = 1
  @State private var turns = 0
  @State private var mirrored = false
  @State private var panStart: CGPoint?
  @State private var pinchStart: Double?
  @State private var picking = false
  @State private var picked: PhotosPickerItem?
  @State private var dropping = false
  @State private var failed = false
  @FocusState private var stageFocused: Bool
  private let props: PMImageEditorProps

  public init(props: PMImageEditorProps) {
    self.props = props
  }

  private var say: ImageEditorWords { ImageEditorWords(props.messages) }

  /// The image being framed: one the person chose here, or `src`'s.
  private var image: CGImage? {
    chosen ?? props.src.flatMap { ImageEditorSource.image($0) }
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    Group {
      if let image {
        VStack(alignment: .leading, spacing: space.s4) {
          stage(image)
          tools
          actions(image)
        }
      } else {
        doorway
      }
    }
    .disabled(props.disabled == true)
    .task(id: props.src) { await load(props.src) }
    .onChange(of: picked) { _, item in
      guard let item else { return }
      Task { await choose(item) }
    }
    .pmLiveAnnouncement(failed ? say.loadError : nil, assertive: true)
    .accessibilityElement(children: .contain)
    .pmMember("ImageEditor", attributes)
  }

  private var attributes: [String: String] {
    var found: [String: String] = [:]
    if image == nil { found["empty"] = "true" }
    if dropping { found["dragover"] = "true" }
    if props.disabled == true { found["disabled"] = "true" }
    if let mask = props.mask, mask != .none { found["mask"] = mask.rawValue }
    if mirrored { found["mirrored"] = "true" }
    if panStart != nil { found["panning"] = "true" }
    return found
  }

  // MARK: The doorway

  /// The empty state (FileUpload's dropzone grammar): a dashed `border.strong`
  /// edge on `bg.subtle`, the upload glyph, the title and the hint, and the
  /// browse control that opens the photo picker; a drag over it takes the
  /// accent's edge and wash.
  private var doorway: some View {
    let space = theme.defaultDensity.space
    let shape = RoundedRectangle(cornerRadius: theme.radius.lg)
    return VStack(spacing: space.s3) {
      PMIconView(.upload, size: .lg)
        .foregroundStyle(theme.colors.textMuted.color)
      Text(say.title)
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(theme.colors.textPrimary.color)
      Text(say.hint)
        .pmTextStyle(theme.text.xs)
        .foregroundStyle(theme.colors.textMuted.color)
      PMButton(
        props: PMButtonProps(
          disabled: props.disabled, label: say.browse, onClick: { picking = true },
          appearance: .outlineNeutral))
    }
    .multilineTextAlignment(.center)
    .frame(maxWidth: .infinity)
    .padding(space.s7)
    .background(
      dropping ? theme.colors.accentSubtle.color : theme.colors.bgSubtle.color, in: shape)
    .overlay {
      shape.strokeBorder(
        dropping ? theme.colors.accentBg.color : theme.colors.borderStrong.color,
        style: StrokeStyle(lineWidth: PMChartMetrics.hairline, dash: PMChartMetrics.dash))
    }
    .photosPicker(isPresented: $picking, selection: $picked, matching: .images)
    .dropDestination(for: Data.self) { items, _ in
      guard let data = items.first else { return false }
      use(data)
      return true
    } isTargeted: { dropping = $0 }
  }

  // MARK: The stage

  private func stage(_ image: CGImage) -> some View {
    let ratio = max(0.1, props.aspectRatio ?? 1)
    return GeometryReader { geometry in
      let viewport = geometry.size
      let frame = ImageEditorFrame(
        image: CGSize(width: image.width, height: image.height), viewport: viewport,
        turns: turns, zoom: zoom)
      let at = frame.clamp(center ?? frame.centre)
      ZStack {
        Image(decorative: image, scale: 1)
          .resizable()
          .frame(width: frame.natural.width * frame.scale, height: frame.natural.height * frame.scale)
          .scaleEffect(x: mirrored ? -1 : 1, y: 1)
          .rotationEffect(.degrees(Double(turns) * 90))
          .position(at)
        if props.grid == true, panStart != nil {
          ImageEditorThirds(color: theme.colors.borderDefault)
        }
        if let mask = props.mask, mask != .none {
          ImageEditorMask(mask: mask, scrim: theme.colors.bgScrim, radius: theme.radius.lg)
        }
      }
      .frame(width: viewport.width, height: viewport.height)
      .contentShape(.rect)
      .gesture(pan(frame), including: props.disabled == true ? .none : .all)
      .simultaneousGesture(pinch(frame), including: props.disabled == true ? .none : .all)
      .onAppear { self.viewport = viewport }
      .onChange(of: viewport) { _, size in self.viewport = size }
    }
    .aspectRatio(ratio, contentMode: .fit)
    .frame(maxWidth: .infinity)
    .background(theme.colors.bgSubtle.color)
    .clipShape(RoundedRectangle(cornerRadius: theme.radius.md))
    .focusable(props.disabled != true)
    .focused($stageFocused)
    .focusEffectDisabled()
    .pmFocusRing(stageFocused, cornerRadius: theme.radius.md)
    .onKeyPress(phases: .down) { press in keyed(press, image: image) }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(say.stage))
    .accessibilityValue(Text(say.alt))
    .accessibilityAddTraits(.isImage)
  }

  private func pan(_ frame: ImageEditorFrame) -> some Gesture {
    DragGesture(minimumDistance: 0)
      .onChanged { drag in
        // The hand moves the image: no animation.
        let start = panStart ?? frame.clamp(center ?? frame.centre)
        if panStart == nil { panStart = start }
        center = frame.clamp(
          CGPoint(x: start.x + drag.translation.width, y: start.y + drag.translation.height))
      }
      .onEnded { _ in panStart = nil }
  }

  private func pinch(_ frame: ImageEditorFrame) -> some Gesture {
    MagnifyGesture()
      .onChanged { value in
        let start = pinchStart ?? zoom
        if pinchStart == nil { pinchStart = start }
        zoom = min(roof, max(1, start * value.magnification))
        reclamp()
      }
      .onEnded { _ in pinchStart = nil }
  }

  /// The arrows pan by one space step, four with Shift; plus and minus zoom
  /// by the slider's step.
  private func keyed(_ press: KeyPress, image: CGImage) -> KeyPress.Result {
    let step = theme.defaultDensity.space.s2 * (press.modifiers.contains(.shift) ? 4 : 1)
    let move: CGSize? =
      switch press.key {
      case .leftArrow: CGSize(width: -step, height: 0)
      case .rightArrow: CGSize(width: step, height: 0)
      case .upArrow: CGSize(width: 0, height: -step)
      case .downArrow: CGSize(width: 0, height: step)
      default: nil
      }
    if let move {
      let frame = self.frame(image)
      let at = frame.clamp(center ?? frame.centre)
      center = frame.clamp(CGPoint(x: at.x + move.width, y: at.y + move.height))
      return .handled
    }
    switch press.characters {
    case "+", "=": setZoom(zoom + PMRecipe.imageEditorZoomStep)
    case "-", "_": setZoom(zoom - PMRecipe.imageEditorZoomStep)
    default: return .ignored
    }
    return .handled
  }

  /// The frame of the image in the stage as it is now laid out.
  private func frame(_ image: CGImage) -> ImageEditorFrame {
    ImageEditorFrame(
      image: CGSize(width: image.width, height: image.height), viewport: viewport, turns: turns,
      zoom: zoom)
  }

  /// The maximum zoom, the prop clamped to 2–8.
  private var roof: Double { min(8, max(2, props.maxZoom ?? 4)) }

  private func setZoom(_ value: Double) {
    zoom = min(roof, max(1, value))
    reclamp()
  }

  /// The centre clamped again after a zoom or a turn, so no edge enters the crop.
  private func reclamp() {
    guard let image, let center else { return }
    self.center = frame(image).clamp(center)
  }

  // MARK: The commands

  private var tools: some View {
    let space = theme.defaultDensity.space
    return HStack(spacing: space.s4) {
      command(.rotate, say.rotate) {
        turns = (turns + 1) % 4
        reclamp()
      }
      if props.flip == true {
        command(.flip, say.flip) { mirrored.toggle() }
      }
      if props.reset == true {
        command(.undo, say.reset) {
          zoom = 1
          turns = 0
          mirrored = false
          center = nil
        }
      }
      PMSlider(
        props: PMSliderProps(
          ariaLabel: say.zoom, disabled: props.disabled,
          formatValue: { ($0 / 100).formatted(.percent.precision(.fractionLength(0))) },
          max: roof * 100, min: 100,
          onChange: { value in
            if case .single(let percent) = value { setZoom(percent / 100) }
          },
          showValue: true, step: PMRecipe.imageEditorZoomStep * 100,
          value: .single((zoom * 100).rounded())))
      .frame(maxWidth: .infinity)
    }
  }

  /// A command button, icon-only and ghost; its change animates.
  private func command(_ icon: PMIconRole, _ label: String, _ change: @escaping () -> Void)
    -> some View
  {
    let motion = theme.defaultMotion
    return PMButton(
      props: PMButtonProps(
        disabled: props.disabled, icon: icon, iconOnly: true, label: label,
        onClick: {
          withAnimation(
            reduceMotion ? nil : motion.easing.standard.animation(duration: motion.duration.control)
          ) { change() }
        },
        appearance: .ghostNeutral))
  }

  private func actions(_ image: CGImage) -> some View {
    HStack(spacing: theme.defaultDensity.space.s3) {
      Spacer(minLength: 0)
      if let onCancel = props.onCancel {
        PMButton(
          props: PMButtonProps(
            disabled: props.disabled, label: say.cancel, onClick: onCancel,
            appearance: .ghostNeutral))
      }
      PMButton(
        props: PMButtonProps(
          disabled: props.disabled, label: say.confirm,
          onClick: { confirm(image) }, appearance: .solidAccent))
    }
  }

  // MARK: Loading and export

  private func load(_ source: String?) async {
    guard let source, ImageEditorSource.image(source) == nil else { return }
    let image = await ImageEditorSource.fetch(source)
    if image == nil { failed = true }
    loadedSource = source
  }

  private func choose(_ item: PhotosPickerItem) async {
    guard let data = try? await item.loadTransferable(type: Data.self) else {
      failed = true
      return
    }
    use(data)
  }

  /// Bytes the person chose: framed when they decode as an image; otherwise
  /// the chooser stays, and the failure is announced.
  private func use(_ data: Data) {
    guard let decoded = ImageEditorSource.decode(data) else {
      failed = true
      return
    }
    failed = false
    chosen = decoded
    zoom = 1
    turns = 0
    mirrored = false
    center = nil
    stageFocused = true
  }

  /// The framed crop, re-projected from the natural image at `exportSize`.
  private func confirm(_ image: CGImage) {
    let frame = self.frame(image)
    guard
      let data = ImageEditorExport.render(
        image, frame: frame, center: frame.clamp(center ?? frame.centre), mirrored: mirrored,
        size: props.exportSize ?? PMSpecDefault.imageEditorExportSize,
        type: props.exportType ?? .imagePng)
    else { return }
    props.onConfirm(data)
  }
}

// MARK: - The frame

/// The law of the frame (`image-editor.geometry.ts`): cover, the clamps and
/// the turned size, for one image in one viewport.
struct ImageEditorFrame {
  let natural: CGSize
  let viewport: CGSize
  let turns: Int
  let zoom: Double

  init(image: CGSize, viewport: CGSize, turns: Int, zoom: Double) {
    self.natural = image
    self.viewport = viewport
    self.turns = turns
    self.zoom = zoom
  }

  /// The image's size after its quarter turns: odd turns swap the sides.
  var turned: CGSize {
    turns % 2 == 0 ? natural : CGSize(width: natural.height, height: natural.width)
  }

  /// The smallest scale at which the turned image covers the viewport: zoom 1.
  var cover: CGFloat {
    guard turned.width > 0, turned.height > 0, viewport.width > 0, viewport.height > 0 else {
      return 1
    }
    return max(viewport.width / turned.width, viewport.height / turned.height)
  }

  var scale: CGFloat { cover * CGFloat(zoom) }

  var centre: CGPoint { CGPoint(x: viewport.width / 2, y: viewport.height / 2) }

  /// The centre clamped so no image edge enters the crop.
  func clamp(_ point: CGPoint) -> CGPoint {
    let shown = CGSize(width: turned.width * scale, height: turned.height * scale)
    func clamp(_ value: CGFloat, _ view: CGFloat, _ span: CGFloat) -> CGFloat {
      let value = value.isFinite ? value : view / 2
      return min(span / 2, max(view - span / 2, value))
    }
    return CGPoint(
      x: clamp(point.x, viewport.width, shown.width),
      y: clamp(point.y, viewport.height, shown.height))
  }
}

/// The export (`exportGeometry`): the crop re-projected from the natural
/// image onto a canvas whose longest edge is `size`, then encoded.
enum ImageEditorExport {
  static func render(
    _ image: CGImage, frame: ImageEditorFrame, center: CGPoint, mirrored: Bool, size: Double,
    type: PMImageEditorExportType
  ) -> Data? {
    let aspect = frame.viewport.width / frame.viewport.height
    let width = max(1, Int((aspect >= 1 ? size : size * aspect).rounded()))
    let height = max(1, Int((aspect >= 1 ? size / aspect : size).rounded()))
    let factor = CGFloat(width) / frame.viewport.width
    let scale = frame.scale * factor
    guard let space = CGColorSpace(name: CGColorSpace.sRGB),
      let context = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return nil }
    // Top-left origin, y down, as the stage lays the image out.
    context.translateBy(x: 0, y: CGFloat(height))
    context.scaleBy(x: 1, y: -1)
    context.translateBy(x: center.x * factor, y: center.y * factor)
    context.rotate(by: CGFloat(frame.turns) * .pi / 2)
    // The mirror is image-local: x is negated before the turn, as on the stage.
    context.scaleBy(x: mirrored ? -scale : scale, y: scale)
    // A bitmap draws upright in a y-up space, so the image's own y is flipped back.
    context.scaleBy(x: 1, y: -1)
    let natural = frame.natural
    context.draw(
      image,
      in: CGRect(x: -natural.width / 2, y: -natural.height / 2, width: natural.width, height: natural.height))
    guard let framed = context.makeImage() else { return nil }
    return encode(framed, type)
  }

  /// The image in `type`, or PNG where the system has no encoder for it.
  static func encode(_ image: CGImage, _ type: PMImageEditorExportType) -> Data? {
    let wanted = UTType(mimeType: type.rawValue) ?? .png
    let writable = (CGImageDestinationCopyTypeIdentifiers() as? [String]) ?? []
    let format = writable.contains(wanted.identifier) ? wanted : .png
    let data = NSMutableData()
    guard
      let destination = CGImageDestinationCreateWithData(
        data, format.identifier as CFString, 1, nil)
    else { return nil }
    CGImageDestinationAddImage(destination, image, nil)
    return CGImageDestinationFinalize(destination) ? data as Data : nil
  }
}

/// Images by their `src`: a `data:` URL decodes at once, so a framed image
/// shows on the first render; any other URL loads in the background. Each is
/// decoded once and kept.
@MainActor
enum ImageEditorSource {
  private static var decoded: [String: CGImage] = [:]

  static func image(_ source: String) -> CGImage? {
    if let image = decoded[source] { return image }
    guard source.hasPrefix("data:"), let comma = source.firstIndex(of: ","),
      let data = Data(base64Encoded: String(source[source.index(after: comma)...])),
      let image = decode(data)
    else { return nil }
    decoded[source] = image
    return image
  }

  static func fetch(_ source: String) async -> CGImage? {
    guard let url = URL(string: source),
      let (data, _) = try? await URLSession.shared.data(from: url), let image = decode(data)
    else { return nil }
    decoded[source] = image
    return image
  }

  /// Bytes as an image, upright by its own orientation; `nil` when they are not one.
  nonisolated static func decode(_ data: Data) -> CGImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    else { return nil }
    let width = properties[kCGImagePropertyPixelWidth] as? Int ?? 0
    let height = properties[kCGImagePropertyPixelHeight] as? Int ?? 0
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: max(width, height, 1),
    ]
    return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
  }
}

// MARK: - Paint

/// The rule-of-thirds lines, while panning: hairlines in `border.default` at 60%.
private struct ImageEditorThirds: View {
  let color: PMDynamicColor

  var body: some View {
    GeometryReader { geometry in
      let size = geometry.size
      Path { path in
        for third in [size.width / 3, size.width * 2 / 3] {
          path.move(to: CGPoint(x: third, y: 0))
          path.addLine(to: CGPoint(x: third, y: size.height))
        }
        for third in [size.height / 3, size.height * 2 / 3] {
          path.move(to: CGPoint(x: 0, y: third))
          path.addLine(to: CGPoint(x: size.width, y: third))
        }
      }
      .stroke(color.color.opacity(0.6), lineWidth: PMChartMetrics.hairline)
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

/// The preview mask: the system's scrim around a clear window, a circle or a
/// rounded rectangle. The exported rectangle is unchanged.
private struct ImageEditorMask: View {
  let mask: PMImageEditorMask
  let scrim: PMDynamicColor
  let radius: CGFloat

  var body: some View {
    GeometryReader { geometry in
      let rect = CGRect(origin: .zero, size: geometry.size)
      Path { path in
        path.addRect(rect)
        switch mask {
        case .circle:
          let side = min(rect.width, rect.height)
          path.addEllipse(
            in: CGRect(x: rect.midX - side / 2, y: rect.midY - side / 2, width: side, height: side))
        case .rounded:
          path.addRoundedRect(in: rect, cornerSize: CGSize(width: radius, height: radius))
        case .none:
          break
        }
      }
      .fill(scrim.color, style: FillStyle(eoFill: true))
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

/// The member's words: each message the app passed, or the spec's default.
private struct ImageEditorWords {
  let title, hint, browse, rotate, flip, reset, zoom, cancel, confirm, alt, stage, loadError: String

  init(_ messages: PMImageEditorMessages?) {
    let defaults = PMSpecDefault.imageEditorMessages
    title = messages?.title ?? defaults.title ?? ""
    hint = messages?.hint ?? defaults.hint ?? ""
    browse = messages?.browse ?? defaults.browse ?? ""
    rotate = messages?.rotate ?? defaults.rotate ?? ""
    flip = messages?.flip ?? defaults.flip ?? ""
    reset = messages?.reset ?? defaults.reset ?? ""
    zoom = messages?.zoom ?? defaults.zoom ?? ""
    cancel = messages?.cancel ?? defaults.cancel ?? ""
    confirm = messages?.confirm ?? defaults.confirm ?? ""
    alt = messages?.alt ?? defaults.alt ?? ""
    stage = messages?.stage ?? defaults.stage ?? ""
    loadError = messages?.loadError ?? defaults.loadError ?? ""
  }
}

// MARK: - States

/// ImageEditor's states, from the spec's States table. The drag-over state is
/// the one a fixture cannot draw, because a drag cannot be synthesised.
public struct ImageEditorStates: PMStates {
  public let member = "ImageEditor"

  public init() {}

  /// A test card, drawn from the pairing's chart roles in four quadrants
  /// around a disc, as a PNG `data:` URL, so pan, zoom and the mask show and
  /// nothing is fetched.
  @MainActor
  static func testCard() -> String {
    let chart = PMTheme.default.chart
    // A 4 by 3 card, `PMFixtureSpan.card` `space-10` steps across.
    let width = PMTheme.default.defaultDensity.space.s10 * PMFixtureSpan.card
    let height = width * 3 / 4
    let card = ZStack {
      VStack(spacing: 0) {
        HStack(spacing: 0) {
          Rectangle().fill(chart.chart3.color)
          Rectangle().fill(chart.chart7.color)
        }
        HStack(spacing: 0) {
          Rectangle().fill(chart.chart8.color)
          Rectangle().fill(chart.chart6.color)
        }
      }
      Circle().fill(chart.chart4.color).scaleEffect(0.3)
    }
    .frame(width: width, height: height)
    .environment(\.colorScheme, .light)
    let renderer = ImageRenderer(content: card)
    guard let image = renderer.cgImage,
      let data = ImageEditorExport.encode(image, .imagePng)
    else { return "" }
    return "data:image/png;base64,\(data.base64EncodedString())"
  }

  /// The test card, made when an entry renders, which the harness does on the main actor.
  private static var card: String { MainActor.assumeIsolated { testCard() } }

  public var entries: [PMStateEntry] {
    let editor = { (props: PMImageEditorProps) in PMImageEditor(props: props) }
    return [
      PMStateEntry("empty — the doorway", expect: ["empty": "true"]) {
        editor(PMImageEditorProps(onCancel: {}, onConfirm: { _ in }))
      },
      PMStateEntry("loaded") {
        editor(PMImageEditorProps(onCancel: {}, onConfirm: { _ in }, src: Self.card))
      },
      PMStateEntry("circle mask", expect: ["mask": "circle"]) {
        editor(PMImageEditorProps(mask: .circle, onCancel: {}, onConfirm: { _ in }, src: Self.card))
      },
      PMStateEntry("rounded mask", expect: ["mask": "rounded"]) {
        editor(PMImageEditorProps(mask: .rounded, onCancel: {}, onConfirm: { _ in }, src: Self.card))
      },
      PMStateEntry("every control offered") {
        editor(
          PMImageEditorProps(
            flip: true, grid: true, maxZoom: 8, onCancel: {}, onConfirm: { _ in }, reset: true,
            src: Self.card))
      },
      PMStateEntry("wide crop") {
        editor(PMImageEditorProps(aspectRatio: 16.0 / 9, onCancel: {}, onConfirm: { _ in }, src: Self.card))
      },
      PMStateEntry("no cancel") {
        editor(PMImageEditorProps(onConfirm: { _ in }, src: Self.card))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        editor(PMImageEditorProps(disabled: true, onCancel: {}, onConfirm: { _ in }, src: Self.card))
      },
      PMStateEntry("two shapes side by side") {
        // Each stage tracks its column; the row is the fixture's, not a member.
        HStack(alignment: .top, spacing: PMTheme.default.defaultDensity.space.s4) {
          editor(PMImageEditorProps(mask: .circle, onConfirm: { _ in }, src: Self.card))
          editor(PMImageEditorProps(aspectRatio: 16.0 / 9, onConfirm: { _ in }, src: Self.card))
        }
      },
    ]
  }
}
