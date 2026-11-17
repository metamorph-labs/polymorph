package dev.polymorph.ui

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The input members' arithmetic, held to the engine's own cases: MonthInput's
 * month (`packages/engine/src/dates/segments.test.ts`, "a month and its
 * draft"), DurationInput's counts (`duration.test.ts`) and PhoneInput's model
 * (`phone.test.ts`).
 */
class InputLogicTest {
    /** A month reads `YYYY-MM`, and any other text as no month. */
    @Test
    fun aMonthReadsYearDashMonth() {
        assertEquals(PMMonth(2026, 7), PMDates.month("2026-07"))
        assertEquals(PMMonth(999, 12), PMDates.month("0999-12"))
        for (text in listOf("2026-13", "2026-7", "2026-07-01", "26-07", "", "2026-00", "0000-01", null)) {
            assertNull(PMDates.month(text), "$text")
        }
    }

    /** A month writes `YYYY-MM` with a four-digit year. */
    @Test
    fun aMonthWritesAFourDigitYear() {
        assertEquals("2026-07", PMDates.monthText(PMMonth(2026, 7)))
        assertEquals("0202-07", PMDates.monthText(PMMonth(202, 7)))
    }

    /** A month is held inside its bounds, and a bound that is not a month bounds nothing. */
    @Test
    fun aMonthIsHeldInsideItsBounds() {
        val min = "2026-03"
        val max = "2027-02"
        assertTrue(PMDates.monthOutOfBounds(PMMonth(2026, 2), min, max))
        assertFalse(PMDates.monthOutOfBounds(PMMonth(2026, 3), min, max))
        assertFalse(PMDates.monthOutOfBounds(PMMonth(2027, 2), min, max))
        assertTrue(PMDates.monthOutOfBounds(PMMonth(2027, 3), min, max))
        assertFalse(PMDates.monthOutOfBounds(null, min, max))
        assertFalse(PMDates.monthOutOfBounds(PMMonth(2020, 1), "soon", null))
    }

    // DurationInput (`packages/engine/src/conventions/duration.test.ts`).

    private val days = PMDurationUnit.Days
    private val hours = PMDurationUnit.Hours
    private val minutes = PMDurationUnit.Minutes
    private val seconds = PMDurationUnit.Seconds
    private val dhm = PMDurationOptions()
    private val hm = PMDurationOptions(units = listOf(hours, minutes))
    private val hms = PMDurationOptions(units = listOf(hours, minutes, seconds))
    private val onlyMinutes = PMDurationOptions(units = listOf(minutes))

    /** An inactivity lifetime: 15 minutes to 7 days. */
    private val inactivity = PMDurationOptions(min = 900.0, max = 604_800.0)

    @Test
    fun aFieldShowsItsUnitsLargestFirstEachOnce() {
        assertEquals(listOf(days, hours, minutes), PMDurationCounts.units(null))
        assertEquals(listOf(days, hours, minutes), PMDurationCounts.units(emptyList()))
        assertEquals(listOf(minutes, seconds), PMDurationCounts.units(listOf(seconds, minutes, seconds)))
    }

    @Test
    fun secondsSplitAcrossTheUnitsAndRoundHalfUp() {
        assertEquals(mapOf(days to 7L, hours to 0L, minutes to 0L), PMDurationCounts.draft(604_800.0, dhm))
        assertEquals(mapOf(hours to 36L, minutes to 0L), PMDurationCounts.draft(129_600.0, hm))
        assertEquals(mapOf(hours to 1L, minutes to 30L), PMDurationCounts.draft(5_400.0, hm))
        assertEquals(emptyMap(), PMDurationCounts.draft(null, dhm))
        assertEquals(emptyMap(), PMDurationCounts.draft(Double.NaN, dhm))
        assertEquals(mapOf(minutes to 2L), PMDurationCounts.draft(90.0, onlyMinutes))
        assertEquals(mapOf(minutes to 1L), PMDurationCounts.draft(89.0, onlyMinutes))
        assertEquals(mapOf(hours to 1L, minutes to 0L), PMDurationCounts.draft(3_585.0, hm))
    }

    @Test
    fun aDraftSumsBackToSecondsAnEmptyCountAsZero() {
        assertEquals(604_800.0, PMDurationCounts.total(mapOf(days to 7L, hours to 0L, minutes to 0L), dhm))
        assertEquals(2_700.0, PMDurationCounts.total(mapOf(minutes to 45L), dhm))
        assertNull(PMDurationCounts.total(emptyMap(), dhm))
        assertEquals(60.0, PMDurationCounts.total(mapOf(seconds to 30L, minutes to 1L), onlyMinutes))
    }

    @Test
    fun aValueIsHeldInsideTheBoundsMovedToWholeCounts() {
        assertEquals(900.0, PMDurationCounts.clamp(300.0, inactivity))
        assertEquals(604_800.0, PMDurationCounts.clamp(700_000.0, inactivity))
        assertEquals(3_600.0, PMDurationCounts.clamp(3_600.0, inactivity))
        assertEquals(0.0, PMDurationCounts.clamp(-60.0, dhm))
        assertNull(PMDurationCounts.clamp(null, inactivity))
        assertEquals(120.0 to 300.0, PMDurationCounts.bounds(PMDurationOptions(units = listOf(minutes), min = 90.0, max = 330.0)))
        assertEquals(70.0 to 100.0, PMDurationCounts.bounds(PMDurationOptions(units = listOf(minutes), min = 70.0, max = 100.0)))
    }

    @Test
    fun aCountStaysUnderTheNextUnitAndTheLargestUnderMax() {
        assertEquals(59L, PMDurationCounts.most(minutes, hm))
        assertEquals(23L, PMDurationCounts.most(hours, dhm))
        assertEquals(1_439L, PMDurationCounts.most(minutes, PMDurationOptions(units = listOf(days, minutes))))
        assertEquals(7L, PMDurationCounts.most(days, inactivity))
    }

    @Test
    fun aStepCarriesStopsAtTheBoundsAndCountsEmptyAsZero() {
        assertEquals(mapOf(days to 7L, hours to 1L, minutes to 0L), PMDurationCounts.step(mapOf(days to 7L, hours to 0L, minutes to 0L), hours, 1, dhm))
        assertEquals(mapOf(hours to 1L, minutes to 0L), PMDurationCounts.step(mapOf(hours to 0L, minutes to 59L), minutes, 1, hm))
        assertEquals(mapOf(hours to 0L, minutes to 59L), PMDurationCounts.step(mapOf(hours to 1L, minutes to 0L), minutes, -1, hm))
        assertEquals(mapOf(days to 7L, hours to 0L, minutes to 0L), PMDurationCounts.step(mapOf(days to 7L, hours to 0L, minutes to 0L), days, 1, inactivity))
        assertEquals(mapOf(days to 0L, hours to 0L, minutes to 15L), PMDurationCounts.step(mapOf(days to 0L, hours to 0L, minutes to 15L), minutes, -1, inactivity))
        assertEquals(mapOf(hours to 0L, minutes to 0L), PMDurationCounts.step(mapOf(hours to 0L, minutes to 30L), hours, -1, hm))
        assertEquals(mapOf(hours to 0L, minutes to 1L), PMDurationCounts.step(emptyMap(), minutes, 1, hm))
        assertEquals(mapOf(days to 0L, hours to 0L, minutes to 15L), PMDurationCounts.step(emptyMap(), minutes, -1, inactivity))
        assertEquals(mapOf(minutes to 3L), PMDurationCounts.step(PMDurationCounts.draft(90.0, onlyMinutes), minutes, 1, onlyMinutes))
    }

    /** A digit as the text field reports it: appended at the caret. */
    private fun type(old: String, digit: Char, most: Long) =
        PMDurationCounts.typed(old, TextFieldValue("$old$digit", TextRange(old.length + 1)), most)

    @Test
    fun typedDigitsExtendWhileTheyFitAndRefuseWhatNoCountHolds() {
        // Extends while it fits, and is full once no digit could follow.
        assertEquals("4" to false, type("", '4', PMDurationCounts.most(minutes, hm)))
        assertEquals("45" to true, type("4", '5', PMDurationCounts.most(minutes, hm)))
        // 90 is refused in the minutes under hours: the 9 fills them.
        assertEquals("9" to true, type("", '9', PMDurationCounts.most(minutes, hms)))
        // A digit that would not fit after the typed ones starts the count again.
        assertEquals("5" to true, type("3", '5', PMDurationCounts.most(hours, dhm)))
        // A digit no count reaches is refused.
        assertEquals("2" to false, type("2", '8', PMDurationCounts.most(days, inactivity)))
        // The largest unit passes the next unit's size.
        assertEquals("36", type("3", '6', PMDurationCounts.most(hours, hm)).first)
        // A leading zero waits.
        assertEquals("0" to false, type("", '0', PMDurationCounts.most(minutes, hm)))
    }

    @Test
    fun aCommitHoldsTheBoundsAndKeepsAValueTheCountsDrawAsIs() {
        assertEquals(
            PMDurationCommit(mapOf(days to 0L, hours to 0L, minutes to 15L), 900.0, changed = true),
            PMDurationCounts.commit(mapOf(minutes to 5L), null, inactivity),
        )
        assertEquals(PMDurationCommit(emptyMap(), null, changed = true), PMDurationCounts.commit(emptyMap(), 3_600.0, hm))
        assertEquals(
            PMDurationCommit(mapOf(minutes to 2L), 90.0, changed = false),
            PMDurationCounts.commit(PMDurationCounts.draft(90.0, onlyMinutes), 90.0, onlyMinutes),
        )
        assertFalse(PMDurationCounts.commit(mapOf(hours to 1L), 3_600.0, hm).changed)
    }

    /** The English words, and a count's text split into its digits and its word. */
    @Test
    fun theEnglishWordsSplitIntoDigitsAndAWord() {
        val strings = PMStrings()
        assertEquals("7 days", PMDurationCounts.english(strings, 7, days, long = false))
        assertEquals("1 day", PMDurationCounts.english(strings, 1, days, long = false))
        assertEquals("0 hr", PMDurationCounts.english(strings, 0, hours, long = false))
        assertEquals("15 minutes", PMDurationCounts.english(strings, 15, minutes, long = true))
        assertEquals("1 second", PMDurationCounts.english(strings, 1, seconds, long = true))
        assertEquals(PMDurationParts("15", "min", wordFirst = false), PMDurationCounts.parts("15 min"))
        assertEquals(PMDurationParts("3", "Std.", wordFirst = false), PMDurationCounts.parts("3 Std."))
        assertEquals(PMDurationParts("5", "约", wordFirst = true), PMDurationCounts.parts("约 5"))
    }

    // PhoneInput (`packages/engine/src/conventions/phone.test.ts`).

    @Test
    fun theTableGivesEachRegionItsCallingCodeOnce() {
        assertEquals("44", PMPhones.callingCode("GB"))
        assertEquals("1", PMPhones.callingCode("us"))
        assertEquals("7", PMPhones.callingCode("KZ"))
        assertEquals("358", PMPhones.callingCode("AX"))
        assertEquals("383", PMPhones.callingCode("XK"))
        assertNull(PMPhones.callingCode("ZZ"))
        assertNull(PMPhones.callingCode("AQ"))
        assertEquals(PMPhones.all.size, PMPhones.all.toSet().size)
        assertTrue(PMPhones.all.size > 240)
        assertEquals(listOf("DE", "GB"), PMPhones.listed(listOf("de", "GB", "ZZ", "DE")))
        val codes = PMPhones.all.mapNotNull { PMPhones.callingCode(it) }.toSet()
        for (code in codes) assertTrue(codes.none { it != code && it.startsWith(code) }, "+$code")
    }

    @Test
    fun theListNamesEachRegionAfterItsCodeAndSortsByName() {
        assertEquals(
            listOf("⁦+44⁩ United Kingdom", "⁦+49⁩ Germany"),
            PMPhones.options("en-US", listOf("GB", "DE")).map { it.label },
        )
        assertEquals("⁦+49⁩ Deutschland", PMPhones.options("de-DE", listOf("DE")).first().label)
        val names = PMPhones.options("en-US").map { it.name }
        assertEquals(PMPhones.all.size, names.size)
        assertEquals("Åland Islands", names[1])
        assertEquals(listOf("US", "GB"), PMPhones.options("en-US", listOf("GB"), include = "us").map { it.region })
        assertEquals(listOf("GB"), PMPhones.options("en-US", listOf("GB"), include = "GB").map { it.region })
    }

    @Test
    fun theDefaultCountry() {
        assertEquals("GB", PMPhones.defaultCountry("gb", null))
        assertEquals("FR", PMPhones.defaultCountry(null, listOf("FR", "DE")))
        assertEquals("DE", PMPhones.defaultCountry("ZZ", listOf("ZZ", "DE")))
        assertEquals("US", PMPhones.defaultCountry(null, null))
    }

    @Test
    fun theNationalNumberKeepsDigitsDropsATrunkZeroAndStopsAtTheLimit() {
        assertEquals("4155550132", PMPhones.draft("(415) 555-0132", "US"))
        assertEquals("2079460958", PMPhones.draft("20 7946 0958", "GB"))
        assertEquals("", PMPhones.draft("abc", "GB"))
        assertEquals("+4420", PMPhones.draft("+44 20", "US"))
        assertEquals("+1", PMPhones.draft("  +1", "US"))
        assertEquals("144", PMPhones.draft("1+44", "US"))
        assertEquals("2079460958", PMPhones.nationalOf("GB", "020 7946 0958"))
        assertEquals("301234567", PMPhones.nationalOf("DE", "030 1234567"))
        assertEquals("412345678", PMPhones.nationalOf("AU", "0412 345 678"))
        assertEquals("0669821234", PMPhones.nationalOf("IT", "06 6982 1234"))
        assertEquals("0415", PMPhones.nationalOf("US", "0415"))
        assertEquals("0", PMPhones.nationalOf("GB", "00"))
        val many = "9".repeat(20)
        assertEquals(PMPhones.MAX_DIGITS - 2, PMPhones.draft(many, "GB").length)
        assertEquals(PMPhones.MAX_DIGITS - 1, PMPhones.draft(many, "US").length)
        assertEquals(PMPhones.MAX_DIGITS - 3, PMPhones.draft(many, "AX").length)
        assertEquals(PMPhones.MAX_DIGITS - 1, PMPhones.draft("0$many", "GB").length)
        assertEquals("+${"9".repeat(PMPhones.MAX_DIGITS)}", PMPhones.draft("+$many", "GB"))
        assertEquals(PMPhones.MAX_DIGITS, PMPhones.value("GB", many).drop(1).length)
    }

    @Test
    fun theValueIsPlusTheCodeAndTheNationalNumber() {
        assertEquals("+442079460958", PMPhones.value("GB", "020 7946 0958"))
        assertEquals("+14155550132", PMPhones.value("US", "(415) 555-0132"))
        assertEquals("+442079460958", PMPhones.value("gb", "2079460958"))
        assertEquals("", PMPhones.value("GB", ""))
        assertEquals("", PMPhones.value("GB", "0"))
        assertEquals("", PMPhones.value("ZZ", "2079460958"))
        assertTrue(PMPhones.isValue("+442079460958"))
        assertTrue(PMPhones.isValue("+1${"2".repeat(14)}"))
        assertFalse(PMPhones.isValue("+1${"2".repeat(15)}"))
        assertFalse(PMPhones.isValue("+44 20 7946 0958"))
        assertFalse(PMPhones.isValue("4155550132"))
        assertFalse(PMPhones.isValue("+0123"))
        assertFalse(PMPhones.isValue(""))
    }

    @Test
    fun thePasteRule() {
        assertEquals(PMPhoneParts("GB", "2079460958"), PMPhones.split("+44 20 7946 0958"))
        assertEquals(PMPhoneParts("US", "4155550132"), PMPhones.split("+1 (415) 555-0132"))
        assertEquals(PMPhoneParts("DE", "301234567"), PMPhones.split("+49-30-1234567"))
        assertEquals(PMPhoneParts("FI", "401234567"), PMPhones.split("+358 40 1234567"))
        assertEquals(PMPhoneParts("GB", "2079460958"), PMPhones.split("+44 (0)20 7946 0958"))
        for (text in listOf("(415) 555-0132", "020 7946 0958", "+999 123", "+")) assertNull(PMPhones.split(text), text)
        assertEquals("CA", PMPhones.split("+1 604 555 0123", "CA")?.country)
        assertEquals("JE", PMPhones.split("+44 1534 123456", "je")?.country)
        assertEquals("KZ", PMPhones.split("+7 727 123 4567", "KZ")?.country)
        assertEquals("US", PMPhones.split("+1 604 555 0123", "GB")?.country)
        assertEquals("GB", PMPhones.split("+44 20 7946 0958", "US")?.country)
        assertEquals("RU", PMPhones.split("+7 495 123 4567", "DE")?.country)
        assertEquals(PMPhoneParts("IT", "0669821234"), PMPhones.split("+39 06 6982 1234"))
        assertEquals("CA", PMPhones.split("+1 604 555 0123", "GB", listOf("GB", "CA", "US"))?.country)
        assertEquals(PMPhones.MAX_DIGITS - 2, PMPhones.split("+44${"9".repeat(20)}")?.national?.length)
    }

    @Test
    fun readingAValueAndACommit() {
        assertEquals(PMPhoneParts("GB", "2079460958"), PMPhones.read("+442079460958", "US"))
        assertEquals(PMPhoneParts("CA", "4165550132"), PMPhones.read("+14165550132", "CA"))
        assertEquals(PMPhoneParts("DE", ""), PMPhones.read("", "DE"))
        assertEquals(PMPhoneParts("US", "4155550132"), PMPhones.read("4155550132", "US"))
        assertEquals(PMPhoneParts("US", "+999123"), PMPhones.read("+999123", "US"))
        assertEquals(PMPhoneCommit("GB", "2079460958", "+442079460958"), PMPhones.commit("GB", "020 7946 0958"))
        assertEquals(PMPhoneCommit("GB", "", ""), PMPhones.commit("GB", ""))
        assertEquals(PMPhoneCommit("GB", "2079460958", "+442079460958"), PMPhones.commit("US", "+4420 7946 0958"))
        assertEquals("CA", PMPhones.commit("CA", "+16045550123", listOf("US", "CA")).country)
        assertEquals(PMPhoneCommit("US", "+999123", ""), PMPhones.commit("US", "+999 123"))
    }
}
