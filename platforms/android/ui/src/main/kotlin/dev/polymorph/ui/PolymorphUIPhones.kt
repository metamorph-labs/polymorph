// PhoneInput's model (`design/components/phone-input.md`), the engine's
// `packages/engine/src/conventions/phone.ts` in Kotlin: an E.164 string read
// into a country and a national number and built from them, the rules for
// what the national field holds, the paste rule and the country list. The
// calling codes are the engine's table, generated into `Phones.kt`.
// `InputLogicTest` holds it to the engine's cases.
//
// The regions' names are the platform's, the counterpart of the web's
// `Intl.DisplayNames`: Compose's platform locale (`Locale.platformLocale`),
// which is the platform's own locale class on both of the module's targets,
// names a region in a language. The list is ordered by the platform's
// collator for the language, as `Intl.Collator` orders the web's
// (`java.text.Collator`, which the containment law admits in this file alone).

package dev.polymorph.ui

import androidx.compose.ui.text.intl.Locale
import java.text.Collator

/** The calling codes and the rules between a country and a national number. */
object PMPhones {
    /** E.164 allows fifteen digits in all, the calling code's included. */
    const val MAX_DIGITS = 15

    private val codeOf: Map<String, String> by lazy {
        PMPhoneCodes.flatMap { (code, regions) -> regions.map { it to code } }.toMap()
    }

    private val regionsOf: Map<String, List<String>> by lazy { PMPhoneCodes.toMap() }

    /** Every region, in the table's order. */
    val all: List<String> by lazy { PMPhoneCodes.flatMap { it.second } }

    /** The calling code a region dials, digits only (`44` for `GB`), or null for a region the table lacks (`phoneCallingCode`). */
    fun callingCode(country: String): String? = codeOf[country.uppercase()]

    /** The regions offered: every region, or the regions of `only` the table holds, upper-cased, once each, in the order given (`phoneCountries`). */
    fun listed(only: List<String>? = null): List<String> {
        if (only == null) return all
        return only.map { it.uppercase() }.filter { it in codeOf }.distinct()
    }

    /** The country shown before the reader chooses one: `defaultCountry`, else the first of `countries`, else the United States (`phoneDefaultCountry`). */
    fun defaultCountry(named: String?, countries: List<String>?): String =
        listed(listOfNotNull(named) + countries.orEmpty()).firstOrNull() ?: all.first()

    /** Whether `value` is E.164: `+`, a digit that is not zero, then one to fourteen more (`isPhoneValue`). */
    fun isValue(value: String): Boolean {
        if (!value.startsWith(PLUS)) return false
        val digits = value.drop(1)
        return digits.length in 2..MAX_DIGITS && digits.first() != '0' && digits.all { it in '0'..'9' }
    }

    private fun digits(text: CharSequence): String = text.filter { it in '0'..'9' }.toString()

    /** How many national digits fit under `country` before the E.164 limit. */
    private fun room(country: String): Int = MAX_DIGITS - (callingCode(country)?.length ?: 0)

    private fun dialsTrunkZero(country: String): Boolean = country.uppercase() in PMPhoneTrunkZero

    /** A national number as the value holds it: its digits, one leading zero dropped where the country dials a trunk zero, and no more than the limit leaves (`phoneNational`). */
    fun nationalOf(country: String, text: String): String {
        val found = digits(text)
        val bare = if (found.startsWith('0') && dialsTrunkZero(country)) found.drop(1) else found
        return bare.take(room(country))
    }

    /** What the national field holds after the reader types: digits only, or a `+` and digits for a number written with its calling code, at most the limit, with one more for a trunk zero (`phoneDraft`). */
    fun draft(text: String, country: String): String {
        val trimmed = text.trimStart()
        val found = digits(trimmed)
        if (trimmed.startsWith(PLUS)) return PLUS + found.take(MAX_DIGITS)
        val zero = found.startsWith('0') && dialsTrunkZero(country)
        return found.take(room(country) + if (zero) 1 else 0)
    }

    /** The E.164 string for a country and a national number, or the empty string with no national digits or a region the table lacks (`phoneValue`). */
    fun value(country: String, national: String): String {
        val calling = callingCode(country) ?: return ""
        val number = nationalOf(country, national)
        return if (number.isEmpty()) "" else "$PLUS$calling$number"
    }

    /**
     * The paste rule: a number written with its calling code read into a
     * country and a national number. A shared code keeps `country` when it
     * dials it, else takes the first of `countries` that does, else its main
     * region. Null without a `+`, or with no calling code the table holds
     * (`splitPhone`).
     */
    fun split(text: String, country: String? = null, countries: List<String>? = null): PMPhoneParts? {
        val trimmed = text.trim()
        if (!trimmed.startsWith(PLUS)) return null
        val found = digits(trimmed)
        for (length in 1..CODE_DIGITS) {
            if (found.length < length) break
            val sharing = regionsOf[found.take(length)] ?: continue
            val chosen = country?.uppercase()
            val preferred = listed(countries.orEmpty()).firstOrNull { it in sharing }
            val region = chosen?.takeIf { it in sharing } ?: preferred ?: sharing.first()
            return PMPhoneParts(region, nationalOf(region, found.drop(length)))
        }
        return null
    }

    /** What the field draws for a value: an E.164 string by the paste rule, the empty string as `country` with no number, and anything else in the national field (`readPhone`). */
    fun read(value: String, country: String, countries: List<String>? = null): PMPhoneParts {
        if (value.isEmpty()) return PMPhoneParts(country, "")
        return split(value, country, countries) ?: PMPhoneParts(country, draft(value, country))
    }

    /**
     * What a commit makes of the field: a national text that starts with `+`
     * split by the paste rule, kept as typed with no value when its code is
     * not in the table, and any other text the national number under
     * `country` (`commitPhone`).
     */
    fun commit(country: String, national: String, countries: List<String>? = null): PMPhoneCommit {
        if (national.trimStart().startsWith(PLUS)) {
            val parts = split(national, country, countries) ?: return PMPhoneCommit(country, draft(national, country), "")
            return PMPhoneCommit(parts.country, parts.national, value(parts.country, parts.national))
        }
        val number = nationalOf(country, national)
        return PMPhoneCommit(country, number, value(country, number))
    }

    /**
     * The country list: each region's calling code and its name in `locale`
     * (a BCP 47 tag; the app's when null); the regions `countries` names in its
     * order, or every region sorted by name in the locale; and `include` first
     * when the list lacks it, for a value the app holds (`phoneCountryOptions`).
     */
    fun options(locale: String?, countries: List<String>? = null, include: String? = null): List<PMPhoneOption> {
        val regions = listed(countries).toMutableList()
        val first = include?.uppercase()
        if (first != null && first in codeOf && first !in regions) regions.add(0, first)
        val language = (locale?.let { Locale(it) } ?: Locale.current).platformLocale
        val options = regions.map { region ->
            val name = Locale("$UNDETERMINED$region").platformLocale.getDisplayCountry(language).ifEmpty { region }
            PMPhoneOption(region, name, callingCode(region).orEmpty())
        }
        if (countries != null) return options
        val collator = Collator.getInstance(language)
        return options.sortedWith { a, b -> collator.compare(a.name, b.name) }
    }

    private const val PLUS = "+"
    private const val CODE_DIGITS = 3

    /** A language tag that names a region alone. */
    private const val UNDETERMINED = "und-"
}

/** A country and the national number the field shows under it. */
data class PMPhoneParts(val country: String, val national: String)

/** What a commit leaves in the field, and the E.164 value it reports. */
data class PMPhoneCommit(val country: String, val national: String, val value: String)

/** One region of the country list: its code, its name and its calling code, digits only. */
data class PMPhoneOption(val region: String, val name: String, val code: String) {
    /** `+44 United Kingdom`, the code a left-to-right isolate, so it reads `+44` in a right-to-left layout. */
    val label: String get() = "$LTR_ISOLATE+$code$POP_ISOLATE $name"

    private companion object {
        const val LTR_ISOLATE = "⁦"
        const val POP_ISOLATE = "⁩"
    }
}
