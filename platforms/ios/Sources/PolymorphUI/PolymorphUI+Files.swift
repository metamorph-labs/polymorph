// The file gate FileUpload and PromptInput share, and the drop both take
// files through. It names the types the system's file importer offers, and
// the type a drop is read as, as `UTType`s, so this foundation file imports
// UniformTypeIdentifiers.

import Foundation
import SwiftUI
import UniformTypeIdentifiers

/// FileUpload's gate (`file-upload.md`, `packages/engine/src/conventions/files.ts`):
/// which chosen files a field accepts, decided once for every way a file
/// arrives, and the `accept` grammar as the system's file importer reads it.
enum PMFileGate {
  /// Splits the files into those that pass and those refused, with why, in
  /// the web's order: a file is refused for what it is (`type`, then `size`)
  /// before it is refused for arriving second (`count`), and a single-file
  /// field keeps the first that passes.
  static func gate(
    _ files: [PMFile], accept: String?, multiple: Bool, maxSize: Double?
  ) -> (accepted: [PMFile], rejected: [PMFileRejection]) {
    var accepted: [PMFile] = []
    var rejected: [PMFileRejection] = []
    for file in files {
      if let accept, !accept.isEmpty, !matches(accept, file) {
        rejected.append(PMFileRejection(file: file, reason: .type))
      } else if let maxSize, file.size > maxSize {
        rejected.append(PMFileRejection(file: file, reason: .size))
      } else if !multiple, accepted.count == 1 {
        rejected.append(PMFileRejection(file: file, reason: .count))
      } else {
        accepted.append(file)
      }
    }
    return (accepted, rejected)
  }

  /// `accept` as the native picker reads it: extensions (`.pdf`), exact media
  /// types (`application/pdf`) and wildcards (`image/*`). A file whose media
  /// type is unknown matches an extension only.
  static func matches(_ accept: String, _ file: PMFile) -> Bool {
    let type = file.type.lowercased()
    let name = file.name.lowercased()
    return tokens(accept).contains { token in
      if token == "*" || token == "*/*" { return true }
      if token.hasPrefix(".") { return name.hasSuffix(token) }
      if token.hasSuffix("/*") { return type.hasPrefix(String(token.dropLast())) }
      return type == token
    }
  }

  /// The types the importer offers for `accept`: every file when there is no
  /// `accept`, or when a token has no type the system can name, so the
  /// importer never hides a file the gate would take; the gate refuses the rest.
  static func types(accepting accept: String?) -> [UTType] {
    let tokens = accept.map(tokens) ?? []
    var types: [UTType] = []
    for token in tokens {
      if token == "*" || token == "*/*" { return [.item] }
      let type: UTType? =
        if token.hasPrefix(".") {
          UTType(filenameExtension: String(token.dropFirst()))
        } else if token.hasSuffix("/*") {
          family(String(token.dropLast(2)))
        } else {
          UTType(mimeType: token)
        }
      guard let type else { return [.item] }
      types.append(type)
    }
    return types.isEmpty ? [.item] : types
  }

  /// A file as the gate reads it: its name, its size in bytes, and its media
  /// type, empty when the system cannot name one, as a browser leaves a
  /// dropped file's `type`.
  static func file(at url: URL) -> PMFile {
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .nameKey])
    let type = values?.contentType ?? UTType(filenameExtension: url.pathExtension)
    return PMFile(
      url: url, name: values?.name ?? url.lastPathComponent, size: Double(values?.fileSize ?? 0),
      type: type?.preferredMIMEType ?? "")
  }

  private static func tokens(_ accept: String) -> [String] {
    accept.split(separator: ",")
      .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
      .filter { !$0.isEmpty }
  }

  /// A media-type family as the system's type it conforms to.
  private static func family(_ name: String) -> UTType? {
    switch name {
    case "image": .image
    case "video": .movie
    case "audio": .audio
    case "text": .text
    case "font": .font
    default: nil
    }
  }
}

/// A drop of files on a view while it takes files (FileUpload's dropzone,
/// PromptInput's frame); nothing otherwise, so a view that takes none never
/// lights up under a drag. Each file is copied out of the drop
/// (`PMDroppedFile`) before the gate reads it.
struct PMFileDrop: ViewModifier {
  let enabled: Bool
  @Binding var targeted: Bool
  let receive: ([PMFile]) -> Void

  func body(content: Content) -> some View {
    if enabled {
      content.dropDestination(for: PMDroppedFile.self) { items, _ in
        targeted = false
        receive(items.map(\.file))
        return !items.isEmpty
      } isTargeted: { targeted = $0 }
    } else {
      content
    }
  }
}

/// A dropped file, copied out of the drop into a directory of its own in the
/// temporary directory, under its own name: the system removes the file it
/// hands over once the drop is received.
struct PMDroppedFile: Transferable {
  let file: PMFile

  static var transferRepresentation: some TransferRepresentation {
    FileRepresentation(importedContentType: .item) { received in
      let folder = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      let copy = folder.appendingPathComponent(received.file.lastPathComponent)
      try FileManager.default.copyItem(at: received.file, to: copy)
      return PMDroppedFile(file: PMFileGate.file(at: copy))
    }
  }
}
