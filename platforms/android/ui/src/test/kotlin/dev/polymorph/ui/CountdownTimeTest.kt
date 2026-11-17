package dev.polymorph.ui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant

/**
 * Countdown's time (`PMCountdownTime`), held to the engine's own cases
 * (`packages/engine/src/conventions/countdown.test.ts`): the moment, the whole
 * seconds left, the digits, the words and the marks. The engine's locale cases
 * are not here, because the Compose member writes Western digits and
 * `PMStrings`' words.
 */
class CountdownTimeTest {
    private val now = Instant.parse("2026-08-07T12:00:00Z")

    @Test
    fun theMomentReadsAnInstantWithItsOffset() {
        val five = now + 300.seconds
        assertEquals(five, PMCountdownTime.moment("2026-08-07T12:05:00Z"))
        assertEquals(five, PMCountdownTime.moment("2026-08-07T14:05:00+02:00"))
        assertEquals(five, PMCountdownTime.moment("2026-08-07T12:05:00"), "without an offset, UTC")
    }

    @Test
    fun aCalendarDateOrAValueThatIsNotAMomentNamesNone() {
        assertNull(PMCountdownTime.moment("2026-08-07"))
        assertNull(PMCountdownTime.moment("not-a-moment"))
        assertNull(PMCountdownTime.moment(""))
    }

    @Test
    fun theTimeLeftIsWholeSecondsRoundedUpAndNeverBelowZero() {
        assertEquals(299L, PMCountdownTime.left(now + 299.seconds, now))
        assertEquals(299L, PMCountdownTime.left(now + 298_001.milliseconds, now))
        assertEquals(1L, PMCountdownTime.left(now + 1.milliseconds, now))
        assertEquals(0L, PMCountdownTime.left(now, now))
        assertEquals(0L, PMCountdownTime.left(now - 5.seconds, now))
    }

    @Test
    fun theDigitsAreMinutesAndSecondsUnderAnHourAndHoursFromAnHour() {
        assertEquals("4:59", PMCountdownTime.clock(299))
        assertEquals("1:05", PMCountdownTime.clock(65))
        assertEquals("0:09", PMCountdownTime.clock(9))
        assertEquals("0:00", PMCountdownTime.clock(0))
        assertEquals("1:00:00", PMCountdownTime.clock(3600))
        assertEquals("1:02:05", PMCountdownTime.clock(3725))
        assertEquals("10:00:59", PMCountdownTime.clock(36_059))
        assertEquals("1000:00:00", PMCountdownTime.clock(1000L * 3600))
        assertEquals("0:00", PMCountdownTime.clock(-3))
    }

    @Test
    fun theWordsSayEachUnitThatIsNotZero() {
        val strings = PMStrings()
        assertEquals("4 minutes, 59 seconds", PMCountdownTime.spoken(299, strings))
        assertEquals("1 minute", PMCountdownTime.spoken(60, strings))
        assertEquals("1 hour, 2 minutes, 5 seconds", PMCountdownTime.spoken(3725, strings))
        assertEquals("1 second", PMCountdownTime.spoken(1, strings))
        assertEquals("0 seconds", PMCountdownTime.spoken(0, strings))
    }

    @Test
    fun aChangeMarksOneMinuteAndTenSecondsButNotTheEnd() {
        assertTrue(PMCountdownTime.marked(61, 60))
        assertTrue(PMCountdownTime.marked(11, 10))
        assertTrue(PMCountdownTime.marked(65, 55), "a mark the clock passed between readings")
        assertFalse(PMCountdownTime.marked(60, 59), "a count that starts on a mark")
        assertFalse(PMCountdownTime.marked(30, 29))
        assertFalse(PMCountdownTime.marked(1, 0), "the end is not a mark")
    }
}
