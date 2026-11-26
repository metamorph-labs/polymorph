package dev.polymorph.tokens

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class PMThemesTest {
    private val hitTargetFloor = 48f
    private val heightFloor = 24f

    @Test
    fun everyPairingIsNamedByItsSystemAndPalette() {
        assertTrue(PMThemes.catalogue.isNotEmpty())
        for (theme in PMThemes.catalogue) {
            val pairing = theme.pairing
            assertEquals("${pairing.system}/${pairing.palette}", pairing.name)
            assertSame(theme, PMThemes.named(pairing.system, pairing.palette))
        }
        assertNull(PMThemes.named("no-such-system", "no-such-palette"))
    }

    /**
     * Android's 48dp is a touch target, not a height: the hit target is at the
     * floor at every density, and control heights stay the density's, so
     * compact and comfortable still differ.
     */
    @Test
    fun theHitTargetClearsTheAndroidFloorAndHeightsStayTheDensitys() {
        for (theme in PMThemes.catalogue) {
            assertEquals(heightFloor, theme.floor.controlHeight)
            assertEquals(hitTargetFloor, theme.floor.hitTarget)
            assertTrue(theme.floor.raised.all { it.token == "hitTarget" }, theme.pairing.name)
            for (density in listOf(theme.density.compact, theme.density.standard, theme.density.comfortable)) {
                val heights = listOf(density.controlHeight.sm, density.controlHeight.md, density.controlHeight.lg)
                assertTrue(heights.all { it >= heightFloor }, theme.pairing.name)
                assertTrue(density.hitTarget >= hitTargetFloor, theme.pairing.name)
                assertEquals(11, density.space.size)
            }
            assertTrue(
                theme.density.compact.controlHeight.md < theme.density.comfortable.controlHeight.md,
                theme.pairing.name,
            )
        }
    }

    /**
     * The heading steps name the heading slot and carry its family, and the
     * steps under them the body slot. `PMFonts` built without a heading slot
     * has the body slot as it, as a system without one does.
     */
    @Test
    fun theHeadingStepsDrawInTheHeadingSlot() {
        for (theme in PMThemes.catalogue) {
            val text = theme.text
            for (step in listOf(text.lg, text.xl, text.text2xl, text.text3xl)) {
                assertEquals("heading", step.slot, theme.pairing.name)
                assertEquals(theme.fonts.heading.family, step.family, theme.pairing.name)
            }
            for (step in listOf(text.xs, text.sm, text.md)) {
                assertEquals("body", step.slot, theme.pairing.name)
            }
            val fonts = theme.fonts
            val withoutHeading = PMFonts(body = fonts.body, display = fonts.display, mono = fonts.mono)
            assertEquals(fonts.body, withoutHeading.heading)
        }
    }

    @Test
    fun theDefaultsAreTheOnesTheAxesSelect() {
        for (theme in PMThemes.catalogue) {
            val densities = mapOf(
                "compact" to theme.density.compact,
                "standard" to theme.density.standard,
                "comfortable" to theme.density.comfortable,
            )
            val motions = mapOf(
                "none" to theme.motion.none,
                "subtle" to theme.motion.subtle,
                "standard" to theme.motion.standard,
                "expressive" to theme.motion.expressive,
            )
            assertSame(densities.getValue(theme.pairing.axes.density), theme.defaultDensity)
            assertSame(motions.getValue(theme.pairing.axes.motionTemperament), theme.defaultMotion)
        }
    }

    /** The mode an app passes to draw the pairing as the web does where nothing sets one. */
    @Test
    fun thePreferredModeIsThePairings() {
        val modes = PMThemes.catalogue.map { it.pairing.defaultMode to it.preferredDark }.toSet()
        assertTrue(modes.isNotEmpty())
        for ((mode, dark) in modes) {
            assertEquals(mapOf("dark" to true, "light" to false, "system" to null).getValue(mode), dark, mode)
        }
        val darkFirst = PMThemes.catalogue.first { it.pairing.defaultMode == "dark" }
        assertEquals(true, darkFirst.preferredDark, darkFirst.pairing.name)
        assertEquals(false, PMThemes.plain_neutral.preferredDark)
    }

    @Test
    fun everyThemeListsThePageTextureAsUnsupported() {
        for (theme in PMThemes.catalogue) {
            assertTrue("texture.page" in theme.unsupported, theme.pairing.name)
            assertTrue(theme.pairing.defaultMode in setOf("light", "dark", "system"))
        }
    }

    @Test
    fun aColourPacksItsChannelsAndAlpha() {
        val color = PMRgba(r = 0x12, g = 0xab, b = 0x0f, a = 0.5f)
        assertEquals(0x8012ab0fL, color.argb)
        assertEquals("#12ab0f", color.hex)
        assertEquals(0xff000000L, PMRgba(0, 0, 0, 1f).argb)
        val pair = PMDynamicColor(light = color, dark = PMRgba(0, 0, 0, 1f))
        assertSame(color, pair.resolve(isDark = false))
        assertSame(color, pair.inverse.resolve(isDark = true))
    }
}
