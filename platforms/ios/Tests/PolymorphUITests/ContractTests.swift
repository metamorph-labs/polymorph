import PolymorphUI
import XCTest

#if canImport(AppKit)
  import AppKit
#elseif canImport(UIKit)
  import UIKit
#endif

/// The generated contracts and the foundation, checked as values.
final class ContractTests: XCTestCase {
  func testEveryFixtureIsForADistinctMemberThatRendersOnIOS() {
    let members = PMFixtures.all.map(\.member)
    XCTAssertFalse(members.isEmpty, "no states fixture is registered in Generated/Fixtures.swift")
    XCTAssertEqual(Set(members).count, members.count, "two fixtures claim one member")
    for member in members {
      let entry = PMCatalogue.members.first { $0.name == member }
      XCTAssertNotNil(entry, "\(member) is not in the catalogue")
      XCTAssertNotEqual(entry?.status, .absent, "\(member) is absent on iOS but has a fixture")
    }
  }

  func testTheCatalogueListsEveryMemberOnceInNameOrder() {
    let names = PMCatalogue.members.map(\.name)
    XCTAssertEqual(names, names.sorted())
    XCTAssertEqual(Set(names).count, names.count)
    for entry in PMCatalogue.members {
      // A native member may say how it renders too (a chart is Swift Charts).
      if entry.status == .adapted { XCTAssertNotNil(entry.rendersAs, entry.name) }
      XCTAssertEqual(entry.status == .absent, entry.substitute != nil, entry.name)
    }
  }

  func testALawfulGridAdmitsOnlyItsCells() {
    XCTAssertEqual(PMButtonAppearance.lawful, PMButtonAppearance.allCases)
    XCTAssertEqual(PMButtonAppearance.lawful.count, 10)
    XCTAssertNil(PMButtonAppearance(variant: .solid, tone: .neutral))
    XCTAssertNil(PMButtonAppearance(variant: .soft, tone: .neutral))
    XCTAssertEqual(PMButtonAppearance(variant: .ghost, tone: .neutral), .ghostNeutral)
    for cell in PMButtonAppearance.lawful {
      XCTAssertEqual(PMButtonAppearance(variant: cell.variant, tone: cell.tone), cell)
    }
  }

  func testTheMemberIdentifierRoundTrips() {
    let member = PMMember("Badge", attributes: ["variant": "soft", "tone": "neutral"])
    XCTAssertEqual(member.identifier, "member:Badge tone=neutral variant=soft")
    let parsed = PMMember.parse(member.identifier)
    XCTAssertEqual(parsed?.name, "Badge")
    XCTAssertEqual(parsed?.attributes, ["variant": "soft", "tone": "neutral"])
    XCTAssertEqual(PMMember.parse("member:Badge")?.attributes, [:])
    XCTAssertNil(PMMember.parse("badge"))
  }

  /// Every role's `systemName`, generated from its `ios` in `design/icons.json`,
  /// names an SF Symbol this system has.
  func testEveryIconRoleHasASymbolThatExists() {
    for role in PMIconRole.allCases {
      #if canImport(AppKit)
        let image = NSImage(systemSymbolName: role.systemName, accessibilityDescription: nil)
      #elseif canImport(UIKit)
        let image = UIImage(systemName: role.systemName)
      #endif
      XCTAssertNotNil(image, "\(role.rawValue): no SF Symbol named \(role.systemName)")
    }
  }

  func testTheUnsupportedListNamesOnlyMembersWithContracts() {
    for entry in PMUnsupported.props {
      let member = PMCatalogue.members.first { $0.name == entry.member }
      XCTAssertNotNil(member, "\(entry.member).\(entry.prop)")
      XCTAssertNotEqual(member?.status, .absent, "\(entry.member).\(entry.prop)")
      XCTAssertFalse(entry.typescript.isEmpty)
      XCTAssertFalse(entry.reason.isEmpty)
    }
  }
}
