package dev.polymorph.ui

import androidx.compose.ui.input.key.Key
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The members' pure logic, which needs no composition: what each computes from its inputs. */
class MemberLogicTest {
    /** JsonTree prints a number as JavaScript's `String(n)` does. */
    @Test
    fun aJsonNumberReadsAsJavaScriptPrintsIt() {
        val cases = mapOf(
            2.0 to "2",
            -41.5 to "-41.5",
            0.0 to "0",
            0.0001 to "0.0001",
            0.000001 to "0.000001",
            1e-7 to "1e-7",
            1.5e-7 to "1.5e-7",
            12345678.5 to "12345678.5",
            1e15 to "1000000000000000",
            1e20 to "100000000000000000000",
            1e21 to "1e+21",
            1.23e22 to "1.23e+22",
            0.1 + 0.2 to "0.30000000000000004",
            Double.NaN to "NaN",
            Double.POSITIVE_INFINITY to "Infinity",
            Double.NEGATIVE_INFINITY to "-Infinity",
        )
        for ((value, written) in cases) assertEquals(written, PMJsonTree.number(value), "$value")
    }

    private fun june(day: Int) = PMCalendarDate(year = 2026.0, month = 6.0, day = day.toDouble())

    /** A range spans no unavailable day, its ends included; without a policy only the bounds matter. */
    @Test
    fun aRangeAcrossAnUnavailableDayIsRefused() {
        val tenth = { date: PMCalendarDate -> date.day == 10.0 }
        assertFalse(PMDates.spanAvailable(june(8), june(12), null, null, tenth))
        assertFalse(PMDates.spanAvailable(june(10), june(12), null, null, tenth))
        assertTrue(PMDates.spanAvailable(june(11), june(14), null, null, tenth))
        assertTrue(PMDates.spanAvailable(june(1), june(30), null, null, null))
        assertFalse(PMDates.spanAvailable(june(1), june(30), null, june(20), null))
    }

    /** A member's identifier encodes a value's spaces and percent signs as the Swift identifier does, and reads back exactly. */
    @Test
    fun anIdentifierEncodesSpacesAndPercentSigns() {
        val member = PMMember("Tabs", mapOf("active" to "100% refunds", "orientation" to "horizontal"))
        assertEquals("member:Tabs active=100%25%20refunds orientation=horizontal", member.identifier)
        assertEquals(member, PMMember.parse(member.identifier))
        assertEquals("%20", PMMember.parse("member:Probe raw=%2520")?.attributes?.get("raw"))
    }

    /** Tabs: the arrows of the strip's axis move to the next or previous enabled tab, wrapping; Home and End to the ends. */
    @Test
    fun theTabAKeySelects() {
        val tabs = listOf(
            PMTabDescriptor(value = "a", label = "A"),
            PMTabDescriptor(value = "b", label = "B", disabled = true),
            PMTabDescriptor(value = "c", label = "C"),
        )
        assertEquals("c", PMTabs.target(tabs, "a", Key.DirectionRight, vertical = false, rtl = false))
        assertEquals("a", PMTabs.target(tabs, "c", Key.DirectionRight, vertical = false, rtl = false))
        assertEquals("c", PMTabs.target(tabs, "a", Key.DirectionLeft, vertical = false, rtl = true))
        assertEquals("c", PMTabs.target(tabs, "a", Key.DirectionDown, vertical = true, rtl = false))
        assertNull(PMTabs.target(tabs, "a", Key.DirectionDown, vertical = false, rtl = false))
        assertEquals("a", PMTabs.target(tabs, "c", Key.MoveHome, vertical = false, rtl = false))
        assertEquals("c", PMTabs.target(tabs, "a", Key.MoveEnd, vertical = false, rtl = false))
    }

    /**
     * SectionNav: `current` marks the item whose page it names, as the web's
     * own cases state it: a trailing slash, a query and a hash are not part of
     * the page; a `current` written with its origin matches; an item written
     * with an origin matches only the same origin; an exact `href` comes
     * first; a hash is compared as written; the first of two items with one
     * `href` is marked; and nothing is marked without a match.
     */
    @Test
    fun sectionNavMarksTheItemWhosePageCurrentNames() {
        val index = { items: List<PMSectionNavItem>, current: String? -> PMSectionNav.currentIndex(items, current) }
        val hashes = listOf("#users", "#groups", "#roles", "#sessions").map { PMSectionNavItem(it, it) }
        val pages = listOf(
            PMSectionNavItem("Users", "/identity/users"),
            PMSectionNavItem("Groups", "/identity/groups/"),
            PMSectionNavItem("Roles", "/identity/roles"),
        )
        assertEquals(2, index(hashes, "#roles"))
        assertEquals(0, index(pages, "/identity/users/"))
        assertEquals(0, index(pages, "/identity/users?page=2#top"))
        assertEquals(1, index(pages, "/identity/groups"), "the slash may be on the item instead")
        assertNull(index(pages, "/identity/users/42"), "a page below an item's own is not matched")
        assertEquals(0, index(pages, "https://app.example.com/identity/users?page=2#top"))
        assertEquals(0, index(listOf(PMSectionNavItem("Home", "/")) + pages, "HTTPS://App.Example.com"))
        val sites = listOf(
            PMSectionNavItem("Docs", "https://docs.example.com/identity/users"),
            PMSectionNavItem("Users", "https://app.example.com/identity/users/"),
        )
        assertEquals(1, index(sites, "https://app.example.com/identity/users"))
        assertNull(index(sites, "/identity/users"), "no origin to compare an item's origin with")
        val ranges = listOf(PMSectionNavItem("This week", "/reports?range=week"), PMSectionNavItem("This month", "/reports?range=month"))
        assertEquals(1, index(ranges, "/reports?range=month"))
        assertEquals(0, index(ranges, "/reports/"))
        assertEquals(0, index(listOf(PMSectionNavItem("Overview", "/identity"), PMSectionNavItem("Summary", "/identity")), "/identity"))
        assertNull(index(hashes, null))
        assertNull(index(hashes, "#elsewhere"))
    }

    /**
     * TreeSelect finds the chosen node and the branches above it, from the top
     * level down, and opens them as its panel opens; a node no level holds,
     * and no node, open nothing.
     */
    @Test
    fun treeSelectOpensTheBranchesAboveTheChosenNode() {
        val items = listOf(
            PMTreeItem(
                id = "engineering",
                label = "Engineering",
                children = listOf(PMTreeItem(id = "platform", label = "Platform", children = listOf(PMTreeItem(id = "storage", label = "Storage")))),
            ),
            PMTreeItem(id = "sales", label = "Sales"),
        )
        assertEquals("Storage" to listOf("engineering", "platform"), PMTreeSelect.find(items, "storage")?.let { it.first.label to it.second })
        assertEquals(emptyList(), PMTreeSelect.find(items, "sales")?.second)
        assertNull(PMTreeSelect.find(items, "billing"), "a node whose level is not loaded")
        assertEquals(setOf("design", "engineering", "platform"), PMTreeSelect.revealed(items, setOf("design"), "storage"))
        assertEquals(setOf("design"), PMTreeSelect.revealed(items, setOf("design"), "billing"))
        assertEquals(setOf("design"), PMTreeSelect.revealed(items, setOf("design"), null))
        assertEquals(setOf("engineering"), PMTree.toggled(emptySet(), "engineering"))
        assertEquals(emptySet(), PMTree.toggled(setOf("engineering"), "engineering"))
    }
}
