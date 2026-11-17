package dev.polymorph.ui

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * `PolymorphUIClock.kt` held to the engine's cases for `clockTime` and
 * `spokenDuration` (`packages/engine/src/conventions/audio.test.ts` and
 * `time-text.test.ts`): the clock AudioPlayer and RecordButton write and the
 * lengths AudioPlayer says, in the English this module speaks when the app
 * provides no words. The engine's cases in other numerals and languages are
 * the app's words on Android, and have no counterpart here.
 */
class ClockTextTest {
    private val strings = PMStrings()
    private val english = { count: Long, unit: PMDurationUnit -> PMDurationCounts.english(strings, count, unit, true) }

    @Test
    fun theClockWritesMinutesAndTwoDigitSeconds() {
        assertEquals("0:00", PMClock.digits(0.0))
        assertEquals("0:05", PMClock.digits(5.0))
        assertEquals("0:09", PMClock.digits(9.0))
        assertEquals("1:05", PMClock.digits(65.0))
        assertEquals("10:00", PMClock.digits(600.0))
    }

    @Test
    fun theClockPutsTheHoursInFrontFromAnHourOn() {
        assertEquals("59:59", PMClock.digits(3599.0))
        assertEquals("1:00:00", PMClock.digits(3600.0))
        assertEquals("1:02:05", PMClock.digits(3725.0))
        assertEquals("25:01:01", PMClock.digits(90_061.0))
        assertEquals("1000:00:00", PMClock.digits(1000.0 * 3600))
    }

    @Test
    fun theClockDropsTheFractionAndReadsNoLengthAsNoTime() {
        assertEquals("0:12", PMClock.digits(12.9))
        assertEquals("0:00", PMClock.digits(Double.NaN))
        assertEquals("0:00", PMClock.digits(Double.POSITIVE_INFINITY))
        assertEquals("0:00", PMClock.digits(-4.0))
    }

    @Test
    fun theWordsSayEachUnitThatIsNotZero() {
        assertEquals("1 second", PMClock.words(1.0, english))
        assertEquals("5 seconds", PMClock.words(5.0, english))
        assertEquals("1 minute", PMClock.words(60.0, english))
        assertEquals("1 minute, 5 seconds", PMClock.words(65.0, english))
        assertEquals("1 hour, 2 minutes, 5 seconds", PMClock.words(3725.0, english))
        assertEquals("25 hours, 1 minute, 1 second", PMClock.words(90_061.0, english))
    }

    @Test
    fun theWordsSayNoLengthAsZeroSeconds() {
        assertEquals("0 seconds", PMClock.words(0.0, english))
        assertEquals("0 seconds", PMClock.words(0.4, english))
    }
}
