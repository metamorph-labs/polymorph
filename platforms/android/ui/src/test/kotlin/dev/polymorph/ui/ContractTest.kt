package dev.polymorph.ui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The generated contracts as Kotlin values: the catalogue, the lawful grid,
 * the icon roles' vectors, and the fixtures the member files declare.
 */
class ContractTest {
    @Test
    fun theCatalogueNamesEveryMemberOnceWithItsAndroidStatus() {
        val names = PMCatalogue.members.map { it.name }
        assertEquals(names.size, names.toSet().size, "a member is listed twice")
        val dialog = PMCatalogue.members.first { it.name == "Dialog" }
        assertEquals(PMPlatformStatus.Adapted, dialog.status)
        assertNotNull(dialog.rendersAs)
        val chart = PMCatalogue.members.first { it.name == "BarChart" }
        assertEquals(PMPlatformStatus.Absent, chart.status)
        assertEquals("Table", chart.substitute)
    }

    @Test
    fun theLawfulGridHoldsOnlyItsCells() {
        assertEquals(PMButtonAppearance.entries.toList(), PMButtonAppearance.lawful)
        assertEquals(PMButtonAppearance.OutlineNeutral, PMButtonAppearance.of(PMButtonVariant.Outline, PMButtonTone.Neutral))
        assertNull(PMButtonAppearance.of(PMButtonVariant.Solid, PMButtonTone.Neutral))
        for (cell in PMButtonAppearance.lawful) {
            assertEquals("${cell.variant.value}/${cell.tone.value}", cell.value)
        }
    }

    @Test
    fun everyIconRoleHasAVector() {
        for (role in PMIconRole.entries) {
            val vector = role.vector
            assertTrue(vector.defaultWidth.value > 0f, "${role.value} (${role.symbolName}) has no glyph")
        }
    }

    @Test
    fun everyMemberWithARenderingHasAFixture() {
        val fixtures = PMFixtures.all.map { it.member }
        assertEquals(fixtures.size, fixtures.toSet().size, "two fixtures name one member")
        assertTrue("Badge" in PMRenderings.names)
        assertEquals(PMRenderings.names.sorted(), fixtures.sorted(), "a rendering without a fixture, or a fixture without a rendering")
        assertTrue(PMUnsupported.props.isNotEmpty())
    }
}
