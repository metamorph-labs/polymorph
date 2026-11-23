import Foundation
import XCTest

@testable import PolymorphUI

/// RichTextContent's reader, held to the engine's cases (`packages/engine/rich-text.test.ts`,
/// `rich-text-href.test.ts`, `rich-text-text.test.ts`): what a document of this version, a node
/// of a later one, an unsafe link, a document nested too deep and a malformed node draw as, and
/// when a document is empty, so the same JSON draws the same nodes on iOS as on the web.
final class RichTextReaderTests: XCTestCase {
  /// The JSON text as the value an app hands over.
  private func json(_ text: String) -> PMJSONValue {
    (try? JSONDecoder().decode(PMJSONValue.self, from: Data(text.utf8))) ?? .null
  }

  /// A document of these blocks, written as JSON.
  private func document(_ blocks: String, format: String = "polymorph-rich-text/1") -> PMJSONValue {
    json(#"{"format":"\#(format)","blocks":[\#(blocks)]}"#)
  }

  private func read(_ blocks: String) -> String {
    spell(PMRichTextReader.read(document(blocks)))
  }

  /// The blocks as one line: `p(…)` a paragraph, `h1(…)` a heading, `ul[…]` and
  /// `ol3[…]` a list from its first number, `li(…)` an item, `q[…]` a quote,
  /// `code:ts(…)` a code block, `found(…)` an unknown block (`found!` when an
  /// entity stands in it). Inside a line, a run's marks are in braces before its
  /// text (`{b i s c →href}`), `⏎` is a hard break, `@{kind:id:label}` an
  /// entity and `?{…}` an unknown inline.
  private func spell(_ blocks: [PMRichTextBlock]) -> String {
    blocks.map(spell).joined(separator: " ")
  }

  private func spell(_ block: PMRichTextBlock) -> String {
    switch block {
    case .paragraph(let inlines): "p(\(spell(inlines)))"
    case .heading(let level, let inlines): "h\(level)(\(spell(inlines)))"
    case .list(let ordered, let start, let items):
      (ordered ? "ol\(start)" : "ul") + "[" + items.map { "li(\(spell($0)))" }.joined(separator: " ")
        + "]"
    case .quote(let blocks): "q[\(spell(blocks))]"
    case .code(let language, let text): "code:\(language ?? "")(\(text))"
    case .found(let text, let entity): (entity ? "found!" : "found") + "(\(text))"
    }
  }

  private func spell(_ inlines: [PMRichTextInline]) -> String {
    inlines.map { inline in
      switch inline {
      case .text(let text, let marks):
        let flags =
          [marks.bold ? "b" : nil, marks.italic ? "i" : nil, marks.strike ? "s" : nil,
           marks.code ? "c" : nil, marks.link.map { "→\($0)" }].compactMap { $0 }
          + marks.annotations.map { "#\($0)" }
        return flags.isEmpty ? text : "{\(flags.joined(separator: " "))}\(text)"
      case .lineBreak: return "⏎"
      case .entity(let entity):
        let ids = PMRichTextReader.annotations(of: entity).map { "#\($0)" }.joined()
        return "@{\(entity.kind):\(entity.id):\(entity.label)\(ids)}"
      case .found(let text, _): return "?{\(text)}"
      }
    }.joined()
  }

  private static let paragraphA = #"{"type":"paragraph","content":[{"type":"text","text":"a"}]}"#

  // MARK: What this version writes

  func testADocumentThisVersionWroteReadsAsWritten() {
    XCTAssertEqual(
      read(
        #"""
        {"type":"heading","level":1,"content":[{"type":"text","text":"Title"}]},
        {"type":"paragraph","content":[
          {"type":"text","text":"plain "},
          {"type":"text","text":"strong","marks":[{"type":"bold"},{"type":"italic"}]},
          {"type":"break"},
          {"type":"text","text":"key","marks":[{"type":"code"}]},
          {"type":"entity","kind":"user","id":"u_ada","label":"@Ada"},
          {"type":"text","text":"guide","marks":[{"type":"link","href":"https://example.org/x"}]}
        ]},
        {"type":"list","ordered":true,"start":3,"items":[
          {"type":"listItem","content":[
            {"type":"paragraph","content":[{"type":"text","text":"one"}]},
            {"type":"list","ordered":false,"items":[
              {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"nested"}]}]}
            ]}
          ]}
        ]},
        {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"quoted"}]}]},
        {"type":"codeBlock","language":"ts","text":"let a = 1"}
        """#),
      "h1(Title) p(plain {b i}strong⏎{c}key@{user:u_ada:@Ada}{→https://example.org/x}guide) "
        + "ol3[li(p(one) ul[li(p(nested))])] q[p(quoted)] code:ts(let a = 1)")
  }

  func testAValueThatIsNotADocumentIsTheEmptyDocument() {
    for value: PMJSONValue in [
      .null, .bool(true), .number(1), .array([]), json("{}"),
      json(#"{"format":"markdown","blocks":[]}"#),
      json(#"{"format":"polymorph-rich-text/0","blocks":[]}"#),
      json(#"{"format":"polymorph-rich-text/01","blocks":[]}"#),
      json(#"{"format":"polymorph-rich-text/1"}"#),
      json(#"{"format":"polymorph-rich-text/1","blocks":{}}"#),
      .string("not JSON"),
    ] {
      let blocks = PMRichTextReader.read(value)
      XCTAssertTrue(blocks.isEmpty, "\(value)")
      XCTAssertTrue(PMRichTextReader.isEmpty(blocks), "\(value)")
    }
  }

  func testAStringIsReadAsTheJSONItHolds() {
    let stored = #"{"format":"polymorph-rich-text/1","blocks":[\#(Self.paragraphA)]}"#
    XCTAssertEqual(spell(PMRichTextReader.read(.string(stored))), "p(a)")
  }

  func testADocumentOfALaterFormatIsReadAsFarAsThisVersionCan() {
    XCTAssertEqual(
      spell(PMRichTextReader.read(document(Self.paragraphA, format: "polymorph-rich-text/2"))),
      "p(a)")
  }

  // MARK: What this version does not know

  func testAnUnknownBlockIsTheTextFoundInIt() {
    XCTAssertEqual(
      read(
        #"""
        {"type":"callout","tone":"warning","content":[{"type":"text","text":"Deliveries pause."}]},
        {"type":"x","text":"own","label":"not this"},
        {"type":"x","label":"label","content":[{"type":"text","text":"not this"}]},
        {"type":"x","blocks":[{"type":"text","text":"3"}],"items":[{"type":"text","text":"2"}],"content":[{"type":"text","text":"1"}]},
        {"type":"x","content":"a"},
        {"type":"x"}
        """#),
      "found(Deliveries pause.) found(own) found(label) found(123) found() found()")
  }

  func testTheBlocksFoundInAnUnknownNodeAreALineApart() {
    let table = json(
      #"""
      {"type":"table","rows":"not read","blocks":[
        {"type":"row","content":[
          {"type":"cell","content":[{"type":"paragraph","content":[{"type":"text","text":"a"}]}]},
          {"type":"cell","content":[{"type":"paragraph","content":[{"type":"text","text":"b"}]}]}
        ]},
        {"type":"row","content":[{"type":"cell","content":[
          {"type":"paragraph","content":[{"type":"text","text":"c"},{"type":"break"},{"type":"text","text":"d"}]}
        ]}]}
      ]}
      """#)
    XCTAssertEqual(PMRichTextReader.nodeText(table), "a\nb\nc\nd")
    XCTAssertEqual(
      PMRichTextReader.nodeText(
        json(
          #"{"type":"x","content":[{"type":"text","text":"a"},{"type":"y","label":"b"},{"type":"codeBlock","text":"c"}]}"#
        )), "ab\nc")
    for value: PMJSONValue in [.null, .string("text"), .number(42), json(#"[{"type":"text","text":"a"}]"#)] {
      XCTAssertEqual(PMRichTextReader.nodeText(value), "")
    }
  }

  func testTheWalkForAnUnknownNodesTextStopsAtDepth() {
    var deep = json(#"{"type":"text","text":"bottom"}"#)
    for _ in 0..<PMRichTextReader.textDepth { deep = .object([PMJSONMember("type", "x"), PMJSONMember("content", .array([deep]))]) }
    XCTAssertEqual(PMRichTextReader.nodeText(deep), "")
  }

  func testAnUnknownInlineIsItsTextInTheLine() {
    XCTAssertEqual(
      read(
        #"""
        {"type":"paragraph","content":[
          {"type":"text","text":"on "},
          {"type":"date","value":"2026-12-04","label":"Friday"},
          {"type":"paragraph","content":[{"type":"text","text":"inside"}]}
        ]}
        """#),
      "p(on ?{Friday}?{inside})")
  }

  func testAnUnknownMarkDrawsNothingAndItsTextKeepsItsOtherMarks() {
    XCTAssertEqual(
      read(
        #"{"type":"paragraph","content":[{"type":"text","text":"a","marks":[{"type":"highlight","colour":"yellow"},{"type":"bold"},"bold",{"href":"/x"}]}]}"#
      ),
      "p({b}a)")
  }

  // MARK: Links

  func testALinkTargetPassesOnlyTheAllowedSchemesAndPathsInsideTheApp() {
    let passed: [(String, String)] = [
      ("https://example.org/x", "https://example.org/x"), ("HTTP://EXAMPLE.ORG", "HTTP://EXAMPLE.ORG"),
      ("mailto:ada@example.org", "mailto:ada@example.org"), ("tel:+441234", "tel:+441234"),
      ("/people/ada", "/people/ada"), ("/", "/"), ("#notes", "#notes"), ("?page=2", "?page=2"),
      ("./a", "./a"), ("../a", "../a"), ("  https://example.org  ", "https://example.org"),
      ("https://exa\tmple.org", "https://example.org"), ("\u{1} /x", "/x"),
    ]
    for (raw, kept) in passed { XCTAssertEqual(PMRichTextReader.href(raw), kept, raw) }

    for raw in [
      "javascript:alert(1)", "JAVASCRIPT:alert(1)", "java\tscript:alert(1)", "\u{1} javascript:x",
      "data:text/html,x", "vbscript:x", "ftp://example.org", "//evil.example", "/\\evil.example",
      "example.com/x", "ada@example.org", "x", ".../a", ".a", "", "   ", "\u{7F}",
    ] {
      XCTAssertNil(PMRichTextReader.href(raw), raw)
    }
  }

  func testALinkThatMayNotBeFollowedIsItsText() {
    XCTAssertEqual(
      read(
        #"""
        {"type":"paragraph","content":[
          {"type":"text","text":"bad","marks":[{"type":"link","href":"javascript:alert(1)"},{"type":"italic"}]},
          {"type":"text","text":"none","marks":[{"type":"link"}]},
          {"type":"text","text":"second","marks":[{"type":"link","href":"javascript:x"},{"type":"link","href":"/kept"},{"type":"link","href":"/not"}]}
        ]}
        """#),
      "p({i}badnone{→/kept}second)")
  }

  func testNeighbouringRunsWithOneTargetAreOneLinkWithTheMarksTheyShare() {
    let blocks = PMRichTextReader.read(
      document(
        #"""
        {"type":"paragraph","content":[
          {"type":"text","text":"the ","marks":[{"type":"link","href":"/a"},{"type":"bold"},{"type":"italic"}]},
          {"type":"text","text":"guide","marks":[{"type":"link","href":"/a"},{"type":"bold"},{"type":"code"}]},
          {"type":"text","text":" and "},
          {"type":"text","text":"more","marks":[{"type":"link","href":"https://example.org"}]},
          {"type":"break"}
        ]}
        """#))
    guard case .paragraph(let inlines)? = blocks.first else { return XCTFail("no paragraph") }
    let pieces = PMRichTextPiece.pieces(inlines).map { piece -> String in
      switch piece {
      case .link(let text, let href, let marks, _):
        let flags = (marks.bold ? " b" : "") + (marks.italic ? " i" : "") + (marks.code ? " c" : "")
        return "link(\(text)→\(href)\(flags))"
      case .run(let text, _, _): return text
      case .lineBreak: return "⏎"
      case .entity: return "@"
      }
    }
    // The paragraph's last break starts no line.
    XCTAssertEqual(pieces, ["link(the guide→/a b)", " and ", "link(more→https://example.org)"])
    XCTAssertEqual(
      PMRichTextPiece.routes(PMRichTextPiece.pieces(inlines)), [URL(string: "/a")!: "/a"],
      "only a target without a scheme is the app's router's")
  }

  // MARK: Depth

  func testBlocksNestedTooDeepAreFlattenedToParagraphsOfTheirText() {
    var inner =
      #"""
      {"type":"heading","level":1,"content":[{"type":"text","text":"deep"}]},
      {"type":"codeBlock","text":"a\n\nb"},
      {"type":"list","ordered":false,"items":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"item"}]}]}]},
      {"type":"callout","text":"later"}
      """#
    for _ in 0..<(PMRichTextReader.maxDepth + 2) {
      inner = #"{"type":"blockquote","content":[\#(inner)]}"#
    }
    let quotes = String(repeating: "q[", count: PMRichTextReader.maxDepth)
    let closes = String(repeating: "]", count: PMRichTextReader.maxDepth)
    XCTAssertEqual(read(inner), quotes + "p(deep) p(a⏎⏎b) p(item) found(later)" + closes)
  }

  // MARK: Malformed nodes

  func testAMalformedKnownNodeIsRepairedOrLeftOut() {
    XCTAssertEqual(
      read(
        #"""
        {"type":"heading","level":5,"content":[{"type":"text","text":"five"}]},
        {"type":"heading","level":"1","content":[{"type":"text","text":"text level"}]},
        {"type":"heading","level":0,"content":[{"type":"text","text":"zero"}]},
        {"type":"heading","level":2.5,"content":[{"type":"text","text":"half"}]},
        {"type":"paragraph"},
        {"type":"list","ordered":false},
        {"type":"list","ordered":false,"items":[]},
        {"type":"list","ordered":"yes","items":[{"type":"paragraph","content":[{"type":"text","text":"bare"}]},"not a node"]},
        {"type":"list","ordered":true,"start":-1,"items":[{"type":"listItem"}]},
        {"type":"list","ordered":true,"start":2.5,"items":[{"type":"listItem","content":[]}]},
        {"type":"list","ordered":false,"start":4,"items":[{"type":"listItem","content":[]}]},
        {"type":"blockquote"},
        {"type":"blockquote","content":[]},
        {"type":"codeBlock","language":"","text":7},
        {"type":"codeBlock","language":3,"text":"x"},
        "a string", 42, null, {"no":"type"},
        {"type":"paragraph","content":[
          {"type":"text"}, {"type":"text","text":""}, {"type":"text","text":"a","marks":"bold"},
          {"type":"entity","label":"@label only"}, {"type":"entity","kind":"user","id":"u"},
          {"type":"entity","kind":"","id":"u","label":"@empty kind"}, "loose", {"type":7}
        ]}
        """#),
      "h3(five) p(text level) p(zero) p(half) p() ul[li(p(bare))] ol1[li()] ol1[li()] ul[li()] "
        + "code:() code:(x) p(a@label only@empty kind)")
  }

  // MARK: Emptiness

  func testADocumentWithNoTextButWhitespaceIsEmpty() {
    for blocks in [
      "",
      #"{"type":"paragraph","content":[{"type":"text","text":"   "},{"type":"break"}]},{"type":"paragraph","content":[]}"#,
      #"{"type":"paragraph","content":[{"type":"text","text":" ﻿ 　\t"}]}"#,
      #"""
      {"type":"heading","level":1,"content":[]},
      {"type":"list","ordered":false,"items":[{"type":"listItem","content":[{"type":"paragraph","content":[]}]}]},
      {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"break"}]}]},
      {"type":"codeBlock","text":""},
      {"type":"codeBlock","text":"  \n"},
      {"type":"callout","content":[]}
      """#,
    ] {
      XCTAssertTrue(PMRichTextReader.isEmpty(PMRichTextReader.read(document(blocks))), blocks)
    }
  }

  func testAnEntityOrAnyTextIsContent() {
    for blocks in [
      #"{"type":"paragraph","content":[{"type":"entity","kind":"user","id":"u","label":"@Ada"}]}"#,
      ##"{"type":"callout","content":[{"type":"paragraph","content":[{"type":"entity","kind":"issue","id":"i","label":"#1"}]}]}"##,
      #"{"type":"paragraph","content":[{"type":"text","text":"."}]}"#,
      #"{"type":"codeBlock","text":"x"}"#,
      #"{"type":"callout","text":"x"}"#,
      #"{"type":"paragraph","content":[{"type":"chip","content":[{"type":"entity","kind":"user","id":"u","label":"@Ada"}]}]}"#,
    ] {
      XCTAssertFalse(PMRichTextReader.isEmpty(PMRichTextReader.read(document(blocks))), blocks)
    }
    // An entity inside a node whose own text is its whole text is not one a reader sees.
    XCTAssertTrue(
      PMRichTextReader.isEmpty(
        PMRichTextReader.read(
          document(
            #"{"type":"callout","text":" ","content":[{"type":"entity","kind":"user","id":"u","label":"@Ada"}]}"#
          ))))
  }

  // MARK: Annotations

  func testAnAnnotationIsKeptOncePerIdInCodeUnitOrderAndOneWithNoIdIsDropped() {
    XCTAssertEqual(
      read(
        #"""
        {"type":"paragraph","content":[{"type":"text","text":"a","marks":[
          {"type":"annotation","id":"b"},{"type":"annotation","id":"a"},{"type":"annotation","id":"a"},
          {"type":"annotation"},{"type":"annotation","id":""},{"type":"annotation","id":3},
          {"type":"bold"},{"type":"annotation","id":"～"},{"type":"annotation","id":"😀"}
        ]}]}
        """#),
      // JavaScript orders by UTF-16 code unit, so the surrogate pair of 😀 sorts before ～.
      "p({b #a #b #😀 #～}a)")
  }

  func testAnEntityKeepsItsAnnotationsAndUnknownMarksAndDropsItsFormats() throws {
    let blocks = PMRichTextReader.read(
      document(
        #"""
        {"type":"paragraph","content":[
          {"type":"entity","kind":"user","id":"u","label":"@Ada","marks":[
            {"type":"bold"},{"type":"annotation","id":"t2"},{"type":"highlight","colour":"x"},
            {"type":"annotation","id":"t1"},{"type":"annotation"},{"type":"link","href":"/x"}
          ]},
          {"type":"entity","label":"@label only","marks":[{"type":"annotation","id":"t3"}]}
        ]}
        """#))
    XCTAssertEqual(spell(blocks), "p(@{user:u:@Ada#t1#t2}@label only)")
    guard case .paragraph(let inlines)? = blocks.first, case .entity(let entity)? = inlines.first
    else { return XCTFail("no entity") }
    let marks = try XCTUnwrap(entity.marks)
    XCTAssertEqual(marks.count, 3)
    // The decoder lists an object's keys in no fixed order, so the unknown mark
    // is compared by its members.
    guard case .object(let unknown)? = marks.first else { return XCTFail("no unknown mark") }
    XCTAssertEqual(
      Set(unknown.map { "\($0.key)=\($0.value)" }),
      ["type=\(PMJSONValue.string("highlight"))", "colour=\(PMJSONValue.string("x"))"])
    XCTAssertEqual(
      Array(marks.dropFirst()),
      [
        .object([PMJSONMember("type", "annotation"), PMJSONMember("id", "t1")]),
        .object([PMJSONMember("type", "annotation"), PMJSONMember("id", "t2")]),
      ])
  }

  /// The drawn annotations of each piece, innermost first.
  private func nested(_ value: PMJSONValue, drawn: Set<String>? = nil) -> [String] {
    guard case .paragraph(let inlines)? = PMRichTextReader.read(value).first else { return [] }
    return PMRichTextPiece.pieces(inlines, drawn: { drawn?.contains($0) ?? true }).map { piece in
      switch piece {
      case .run(let text, _, let ids), .link(let text, _, _, let ids):
        return "\(text)\(ids.map { "#\($0)" }.joined())"
      case .entity(let entity, let ids): return "\(entity.label)\(ids.map { "#\($0)" }.joined())"
      case .lineBreak: return "⏎"
      }
    }
  }

  func testOverlappingAnnotationsNestAsTheEditorNestsThem() {
    // The inner thread starts later, so it is innermost where both stand.
    XCTAssertEqual(
      nested(RichTextContentStates.overlapping),
      [
        "Each retry waits ", "twice #thread-1", "as long#thread-2#thread-1",
        " as the last one#thread-1", ", up to five times.",
      ])
    // Of two that start together, the one that ends first is innermost; of two
    // that cover the same stretch, the first by id. A break ends no stretch.
    XCTAssertEqual(
      nested(
        document(
          #"""
          {"type":"paragraph","content":[
            {"type":"text","text":"a","marks":[{"type":"annotation","id":"long"},{"type":"annotation","id":"short"},{"type":"annotation","id":"y"},{"type":"annotation","id":"x"}]},
            {"type":"break"},
            {"type":"text","text":"b","marks":[{"type":"annotation","id":"long"},{"type":"annotation","id":"y"},{"type":"annotation","id":"x"}]}
          ]}
          """#)),
      ["a#short#long#x#y", "⏎", "b#long#x#y"])
    // Only the drawn ones are drawn.
    XCTAssertEqual(
      nested(RichTextContentStates.overlapping, drawn: ["thread-1"])[2], "as long#thread-1")
  }

  func testAnAnnotationOnAnyRunOfALinkIsOnTheWholeLink() {
    XCTAssertEqual(
      nested(
        document(
          #"""
          {"type":"paragraph","content":[
            {"type":"text","text":"the ","marks":[{"type":"link","href":"/a"}]},
            {"type":"text","text":"guide","marks":[{"type":"link","href":"/a"},{"type":"annotation","id":"t"}]}
          ]}
          """#)),
      ["the guide#t"])
  }

  func testEachAnnotationIsOfferedByItsFirstFragmentWhereItIsInnermost() {
    let actions = { (value: PMJSONValue, appDraws: Bool) -> [String] in
      guard case .paragraph(let inlines)? = PMRichTextReader.read(value).first else { return [] }
      return PMRichTextPiece.actions(PMRichTextPiece.pieces(inlines), appDrawsEntities: appDraws)
        .map { "\($0.id)=\($0.words)" }
    }
    XCTAssertEqual(
      actions(RichTextContentStates.annotated, false),
      ["thread-1=doubles the wait", "thread-2=up to five times"])
    XCTAssertEqual(
      actions(RichTextContentStates.overlapping, false), ["thread-1=twice", "thread-2=as long"])
    XCTAssertEqual(
      actions(RichTextContentStates.annotatedEntity, false), ["thread-3=@Ada Lovelace"])
    // An entity the app draws is its own control, so the words after it name the thread.
    XCTAssertEqual(
      actions(RichTextContentStates.annotatedEntity, true), ["thread-3=to review the fix"])
    // One only on a link, or only on white space, is offered nowhere.
    XCTAssertEqual(
      actions(
        document(
          #"""
          {"type":"paragraph","content":[
            {"type":"text","text":"the guide","marks":[{"type":"link","href":"/a"},{"type":"annotation","id":"on-link"}]},
            {"type":"text","text":"  ","marks":[{"type":"annotation","id":"blank"}]}
          ]}
          """#), false),
      [])
  }

  func testAHeadingDrawsItsWordsWithoutEmphasisOrLinkAndKeepsItsAnnotations() throws {
    guard
      case .heading(_, let inlines)? = PMRichTextReader.read(
        document(
          #"""
          {"type":"heading","level":1,"content":[
            {"type":"text","text":"a","marks":[{"type":"bold"},{"type":"link","href":"/x"},{"type":"annotation","id":"t"}]},
            {"type":"break"},
            {"type":"text","text":"b","marks":[{"type":"code"},{"type":"italic"}]}
          ]}
          """#)
      ).first
    else { return XCTFail("no heading") }
    XCTAssertEqual(
      spell([.paragraph(PMRichTextPiece.headingInlines(inlines))]), "p({#t}a {c}b)")
    let marking = { (shown: Set<String>?) in
      PMRichTextMarking(shown: shown, active: nil, onSelect: nil)
    }
    XCTAssertTrue(PMRichTextPiece.holdsDrawnAnnotation(inlines, marking: marking(nil)))
    XCTAssertFalse(PMRichTextPiece.holdsDrawnAnnotation(inlines, marking: marking(["other"])))
  }

  func testAHighlightsLinkNamesItsAnnotationAndNoOtherLink() throws {
    for id in ["thread-1", "a b", "thread/1?x#y", "ü", "//x"] {
      XCTAssertEqual(PMRichTextMarking.id(try XCTUnwrap(PMRichTextMarking.url(id))), id)
    }
    XCTAssertNil(PMRichTextMarking.id(try XCTUnwrap(URL(string: "/x-polymorph-annotation/a"))))
    XCTAssertNil(PMRichTextMarking.id(try XCTUnwrap(URL(string: "https://example.org/a"))))
  }

  // MARK: Words

  func testAFlowedRunBreaksBetweenWordsAndKeepsEachWordsSpaces() {
    XCTAssertEqual(
      PMRichTextPiece.words("  can you  review"), ["  ", "can ", "you  ", "review"])
    XCTAssertEqual(PMRichTextPiece.words("one"), ["one"])
    XCTAssertEqual(PMRichTextPiece.words(""), [])
  }
}
