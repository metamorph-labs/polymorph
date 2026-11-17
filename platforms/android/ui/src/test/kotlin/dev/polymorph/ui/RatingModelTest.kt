package dev.polymorph.ui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Rating's model (`PMRatingModel`), held to the engine's own cases
 * (`packages/engine/src/conventions/rating.test.ts`): the rounding, the fills,
 * the words, a press and a step. The engine's locale cases are not here,
 * because the Compose member writes Western digits in every locale.
 */
class RatingModelTest {
    private fun model(
        value: Double?,
        label: String = "Rating",
        readOnly: Boolean = false,
        max: Double? = null,
        messages: PMRatingMessages? = null,
    ) = PMRatingModel(value, label, max, readOnly, messages, PMStrings())

    @Test
    fun theMostIsFiveWhenNotToldAndAWholeNumberFromTwoToTen() {
        assertEquals(5, PMRatingModel.count(null))
        assertEquals(5, PMRatingModel.count(Double.NaN))
        assertEquals(10, PMRatingModel.count(10.0))
        assertEquals(7, PMRatingModel.count(7.4))
        assertEquals(2, PMRatingModel.count(1.0))
        assertEquals(10, PMRatingModel.count(40.0))
    }

    @Test
    fun aControlHoldsAWholeMarkAndNothingForNoValueZeroOrLess() {
        assertEquals(3.0, model(3.0).value)
        assertEquals(4.0, model(3.6).value)
        assertEquals(5.0, model(9.0).value)
        assertNull(model(0.0).value)
        assertNull(model(-2.0).value)
        assertNull(model(null).value)
    }

    @Test
    fun aControlFillsEachMarkUpToTheOneItHoldsAndNoMarkInPart() {
        val full = PMRatingModel.Fill.Full
        val none = PMRatingModel.Fill.None
        assertEquals(listOf(full, full, full, none, none), model(3.0).marks.map { it.fill })
        assertEquals(listOf(none, none, none, none, none), model(null).marks.map { it.fill })
        assertEquals(listOf(full, full, full, full, none), model(4.4).marks.map { it.fill })
    }

    @Test
    fun eachMarkIsNamedByTheValueItSetsInThePluralTheCountTakes() {
        assertEquals(listOf("1 star", "2 stars", "3 stars", "4 stars", "5 stars"), model(null).marks.map { it.name })
    }

    @Test
    fun aShownRatingHoldsAFractionToOneDecimalPlaceInsideZeroAndItsMost() {
        assertEquals(4.3, model(4.34, readOnly = true).value)
        assertEquals(5.0, model(7.0, readOnly = true).value)
        assertEquals(0.0, model(-1.0, readOnly = true).value)
    }

    @Test
    fun aShownRatingFillsTheMarkTheFractionLandsInByItsShare() {
        val marks = model(4.3, readOnly = true).marks
        val full = PMRatingModel.Fill.Full
        assertEquals(listOf(full, full, full, full, PMRatingModel.Fill.Part), marks.map { it.fill })
        assertEquals(0.3f, marks[4].share, 0.0001f)
        assertEquals(1f, marks[3].share)
    }

    @Test
    fun aShownRatingSaysTheLabelTheValueAndTheMostInOneSentence() {
        assertEquals("Average rating: 4.3 out of 5", model(4.34, label = "Average rating", readOnly = true).sentence)
        assertEquals("Rating: 0 out of 5", model(null, readOnly = true).sentence)
    }

    @Test
    fun theWordsComeFromTheMessagesWithTheNumbersAlreadyWritten() {
        val german = PMRatingMessages(
            mark = { value, numeral -> "$numeral ${if (value == 1.0) "Stern" else "Sterne"}" },
            shown = { label, value, max -> "$label: $value von $max" },
        )
        val shown = model(3.5, label = "Bewertung", readOnly = true, max = 4.0, messages = german)
        assertEquals("Bewertung: 3.5 von 4", shown.sentence)
        assertEquals(listOf("1 Stern", "2 Sterne", "3 Sterne", "4 Sterne"), shown.marks.map { it.name })
    }

    @Test
    fun aPressChoosesTheMarkAndClearsTheMarkTheRatingHeld() {
        assertEquals(3, PMRatingModel.press(3, null, required = false))
        assertEquals(3, PMRatingModel.press(3, 2, required = false))
        assertNull(PMRatingModel.press(3, 3, required = false))
        assertEquals(3, PMRatingModel.press(3, 3, required = true), "a required rating keeps its mark")
    }

    @Test
    fun aStepMovesByOneAndStopsAtEitherEnd() {
        assertEquals(3, PMRatingModel.step(2, forward = true, max = 5))
        assertEquals(1, PMRatingModel.step(2, forward = false, max = 5))
        assertEquals(5, PMRatingModel.step(5, forward = true, max = 5))
        assertEquals(1, PMRatingModel.step(1, forward = false, max = 5))
    }
}
