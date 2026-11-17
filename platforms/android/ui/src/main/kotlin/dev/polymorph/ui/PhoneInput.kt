// PhoneInput (`design/components/phone-input.md`): a telephone number as one
// E.164 string, entered as a country and a national number. It is a row of
// two members, `space.2` apart, as on the web: Combobox for the country, its
// list a bottom sheet on a phone and a dropdown above, which filters the
// regions by name or by calling code as the person types, and Input for the
// number, a text field with the phone keyboard and the national phone number
// autofill type. The country is the recipe's width
// (`PMRecipe.phoneCountryWidth` × `space.10`) and the number takes the rest.
// Each option is the calling code, a left-to-right isolate, then the region's
// name in `locale`, the platform's (`PMPhones.options`): `+44 United
// Kingdom`. Without `countries` every region is offered, sorted by name in the
// locale; a value whose country the list lacks puts that country first.
//
// The model is the engine's, in `PolymorphUIPhones.kt`, with the calling codes
// generated from the engine's table (`Phones.kt`). Typing keeps digits only,
// or a `+` and digits for a number written with its calling code, up to the
// E.164 limit. The number is committed when it loses focus, when a country is
// chosen, and at once when a number written with a calling code the table
// holds arrives whole, pasted or filled by autofill: a trunk zero is dropped
// where the country dials one, and a shared calling code keeps the country the
// field shows when it dials it. `onChange` reports only a value that differs
// from the one the field holds, and the empty string while the national
// number has no digits. `defaultCountry`, else the first of `countries`, else
// the United States, is the country before the value names one. `readOnly`
// shows the country as a read-only Input, Combobox having no read-only state,
// and keeps the number focusable and selectable. `value` with `onChange` is
// the controlled pair.
//
// The country is named by `messages.country` and then the field's name
// ("Country calling code, Phone"), so two phone fields name their country
// controls apart; the number is named by `ariaLabel` or its FormField's label.
// A FormField's error and `invalid` reach both controls through the field
// context. `name`, `id`, `ariaRequired` and the `aria-*by` ids have no Compose
// counterpart.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp

object PMPhoneInput : PMPhoneInputRendering {
    @Composable
    override fun Render(props: PMPhoneInputProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val size = props.size ?: PMControlSize.Md
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val readOnly = props.readOnly ?: false
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)

        // The committed value while the app does not hold it.
        var kept by remember { mutableStateOf(props.defaultValue ?: "") }
        val current = props.value ?: kept
        // The country the reader last chose: the empty value's country, and
        // the one a shared calling code keeps.
        var chosen by remember {
            mutableStateOf(PMPhones.read(current, PMPhones.defaultCountry(props.defaultCountry, props.countries), props.countries).country)
        }
        // The national text being edited, until it commits.
        var draft by remember { mutableStateOf<String?>(null) }
        val drawn = PMPhones.read(current, chosen, props.countries)
        val country = drawn.country
        val national = draft ?: drawn.national
        val options = remember(props.locale, props.countries, country) {
            PMPhones.options(props.locale, props.countries, include = country)
        }

        val commit: (String, String) -> Unit = { next, text ->
            val result = PMPhones.commit(next, text, props.countries)
            chosen = result.country
            // A number whose calling code the table lacks reports nothing and stays as typed.
            draft = if (result.value.isEmpty() && result.national.isNotEmpty()) result.national else null
            if (result.value != current) {
                kept = result.value
                props.onChange?.invoke(result.value)
            }
        }
        // Text typed, pasted or filled into the number. A number written with a
        // calling code the table holds that arrives whole commits at once, as a
        // paste does on the web; anything else is kept as `PMPhones.draft` keeps it.
        val type: (String) -> Unit = { text ->
            val whole = text.length - national.length > 1
            if (whole && text.trimStart().startsWith(PLUS) && PMPhones.commit(country, text, props.countries).value.isNotEmpty()) {
                commit(country, text)
            } else {
                draft = PMPhones.draft(text, country)
            }
        }

        val label = props.ariaLabel ?: field?.label
        val own = props.messages?.country ?: strings.phoneInputCountry
        val countryName = if (label.isNullOrEmpty()) own else "$own$NAME_SEPARATOR$label"
        val countryLabel = options.firstOrNull { it.region == country }?.label.orEmpty()

        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val attributes = buildMap {
            put("size", size.value)
            put("country", country)
            if (current.isNotEmpty()) put("number", current)
            if (props.countries != null) put("options", options.joinToString(LIST) { it.region })
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
            if (readOnly) put("readonly", "true")
        }

        val metrics = PMControlMetrics(size, theme)
        val floor = with(LocalDensity.current) { metrics.text.textStyle.fontSize.toDp() } * PMRecipe.phoneNumberEms + metrics.padding + metrics.padding
        PhoneRow(
            gap = space.s2,
            country = space.s10 * PMRecipe.phoneCountryWidth,
            number = floor,
            modifier = Modifier.fillMaxWidth().pmMember("PhoneInput", attributes),
        ) {
            Box {
                if (readOnly) {
                    PMInput(
                        ariaLabel = countryName,
                        disabled = disabled,
                        invalid = invalid,
                        readOnly = true,
                        size = size,
                        value = countryLabel,
                    )
                } else {
                    PMCombobox(
                        ariaLabel = countryName,
                        disabled = disabled,
                        emptyMessage = props.messages?.noCountry ?: strings.phoneInputNoCountry,
                        invalid = invalid,
                        messages = PMComboboxMessages(
                            showOptions = props.messages?.showCountries ?: strings.phoneInputShowCountries,
                            options = props.messages?.countriesShown ?: strings.phoneInputCountriesShown,
                        ),
                        onChange = { next -> if (next != null) commit(next, national) },
                        options = options.map { PMComboboxOption(value = it.region, label = it.label) },
                        size = size,
                        value = PMSome(country),
                    )
                }
            }
            Box {
                PMInput(
                    ariaLabel = props.ariaLabel,
                    autoComplete = TEL_NATIONAL,
                    disabled = disabled,
                    invalid = invalid,
                    onBlur = { draft?.let { commit(country, it) } },
                    onChange = type,
                    readOnly = readOnly,
                    size = size,
                    type = PMInputType.Tel,
                    value = national,
                )
            }
        }
    }

    /**
     * The row of the country and the number (`phone-input.module.css`): the
     * country at `country` wide unless the row is short of room, when it gives
     * up the shortfall down to nothing, and the number the rest, never less
     * than `number`. Both are as tall as the taller, and the row is laid out
     * from the layout's start edge.
     */
    @Composable
    private fun PhoneRow(gap: Dp, country: Dp, number: Dp, modifier: Modifier, content: @Composable () -> Unit) {
        Layout(content = content, modifier = modifier) { measurables, constraints ->
            val width = constraints.maxWidth
            val spacing = gap.roundToPx()
            val shown = (width - spacing - number.roundToPx()).coerceIn(0, country.roundToPx())
            val widths = listOf(shown, (width - spacing - shown).coerceAtLeast(0))
            val tallest = measurables.zip(widths).maxOfOrNull { (it, w) -> it.maxIntrinsicHeight(w) } ?: 0
            val height = tallest.coerceIn(constraints.minHeight, constraints.maxHeight)
            val placeables = measurables.zip(widths).map { (it, w) -> it.measure(Constraints.fixed(w, height)) }
            layout(width, height) {
                var x = 0
                placeables.forEach {
                    it.placeRelative(x, 0)
                    x += it.width + spacing
                }
            }
        }
    }

    private const val PLUS = "+"
    private const val LIST = ","
    private const val NAME_SEPARATOR = ", "

    /** The HTML autocomplete token for a number without its country code. */
    private const val TEL_NATIONAL = "tel-national"
}

/**
 * PhoneInput's states, from the spec's States table. The numbers are in the
 * ranges their regulators keep for fiction: Ofcom's 020 7946 0xxx in London,
 * and 555-01xx across the North American plan. The locale is pinned, so the
 * country names do not follow the machine drawing them.
 */
object PhoneInputStates : PMStates {
    override val member = "PhoneInput"

    private const val phone = "Phone"
    private const val london = "+442079460958"
    private const val sanFrancisco = "+14155550132"
    private const val toronto = "+14165550132"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("empty — the country before the reader chooses one", expect = mapOf("size" to "md", "country" to "GB", "number" to "")) {
                PMPhoneInput(ariaLabel = phone, defaultCountry = "GB", locale = "en-GB")
            },
            PMStateEntry("with value", expect = mapOf("country" to "GB", "number" to london)) {
                PMPhoneInput(ariaLabel = phone, defaultValue = london, locale = "en-GB")
            },
            PMStateEntry("shared code — Canada keeps +1", expect = mapOf("country" to "CA", "number" to toronto)) {
                PMPhoneInput(ariaLabel = phone, defaultCountry = "CA", defaultValue = toronto, locale = "en-CA")
            },
            PMStateEntry("countries — three regions, in the order given", expect = mapOf("country" to "IE", "options" to "GB,IE,FR")) {
                PMPhoneInput(ariaLabel = phone, countries = listOf("GB", "IE", "FR"), defaultCountry = "IE", locale = "en-GB")
            },
            PMStateEntry("value outside the list — its country is listed first", expect = mapOf("country" to "US", "options" to "US,GB,IE")) {
                PMPhoneInput(ariaLabel = phone, countries = listOf("GB", "IE"), defaultValue = sanFrancisco, locale = "en-GB")
            },
            PMStateEntry("locale — the names in German", expect = mapOf("country" to "GB")) {
                PMPhoneInput(ariaLabel = "Telefon", defaultValue = london, locale = "de-DE")
            },
            PMStateEntry("sizes side by side", expect = mapOf("size" to "sm")) {
                Column(verticalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3)) {
                    for (size in PMControlSize.entries) {
                        PMPhoneInput(ariaLabel = "Phone (${size.value})", defaultValue = london, locale = "en-GB", size = size)
                    }
                }
            },
            PMStateEntry("size sm", expect = mapOf("size" to "sm")) {
                PMPhoneInput(ariaLabel = phone, defaultValue = london, locale = "en-GB", size = PMControlSize.Sm)
            },
            PMStateEntry("size lg", expect = mapOf("size" to "lg")) {
                PMPhoneInput(ariaLabel = phone, defaultValue = london, locale = "en-GB", size = PMControlSize.Lg)
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMPhoneInput(ariaLabel = phone, defaultValue = london, invalid = true, locale = "en-GB")
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMPhoneInput(ariaLabel = phone, defaultValue = london, disabled = true, locale = "en-GB")
            },
            PMStateEntry("readOnly — the country as read-only text", expect = mapOf("readonly" to "true")) {
                PMPhoneInput(ariaLabel = phone, defaultValue = london, locale = "en-GB", readOnly = true)
            },
            PMStateEntry("in a form — the hidden input carries the value", expect = mapOf("number" to london)) {
                PMPhoneInput(ariaLabel = phone, defaultValue = london, locale = "en-GB", name = "phone")
            },
        )
}
