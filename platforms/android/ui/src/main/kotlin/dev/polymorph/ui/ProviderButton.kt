// ProviderButton (`design/components/provider-button.md`): a Button preset for
// signing in with an identity provider. It is Button's outline/neutral cell by
// reference (`PMButtonFrame`), at every size and in every state, with the
// provider's mark in the icon slot (`PMBrandMark`, the foundation's: Google's
// four-colour "G", Microsoft's four squares, GitHub's mark in the text
// colour) and the label after it, on one line, cut with an ellipsis. The cell
// is fixed, because a mark is legible and within its provider's terms only on
// a neutral surface. It takes the width it is offered, so in a column it is
// the column's width, as the web's stretches.
//
// `label` is the whole sentence the app's catalogue writes ("Continue with
// Google"), never assembled here. While `loading` the spinning glyph takes
// the mark's place, the label stays, and a press does nothing; the button
// reports "Loading" as its state description. Disabled, the button is
// Button's disabled cell and the mark is desaturated and half transparent. A
// `submit` button submits the form it is in (`LocalPMSubmitAction`), as
// Button's does. `ariaDescribedby` names an element id, which Compose has
// none of.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow

object PMProviderButton : PMProviderButtonRendering {
    @Composable
    override fun Render(props: PMProviderButtonProps) {
        val size = props.size ?: PMControlSize.Md
        val loading = props.loading ?: false
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val submit = LocalPMSubmitAction.current
        val metrics = PMControlMetrics(size, PM.theme)
        val attributes = buildMap {
            put("variant", "outline")
            put("tone", "neutral")
            put("size", size.value)
            put("provider", props.provider.value)
            if (loading) put("state", "loading")
            if (disabled) put("disabled", "true")
        }

        PMButtonFrame(
            appearance = PMButtonAppearance.OutlineNeutral,
            size = size,
            name = props.label,
            onClick = {
                props.onClick?.invoke()
                if (props.type == PMProviderButtonType.Submit) submit?.invoke()
            },
            modifier = Modifier.pmMember("ProviderButton", attributes).fillMaxWidth(),
            disabled = disabled,
            loading = loading,
            value = if (loading) PMSpecDefault.strings.loading else null,
        ) { text ->
            if (loading) {
                PMSpinGlyph(size, text)
            } else {
                PMBrandMark(props.provider, size, disabled = disabled, tint = text)
            }
            Text(
                text = props.label,
                style = metrics.text.textStyle,
                color = text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** ProviderButton's states, from the spec's States table. */
object ProviderButtonStates : PMStates {
    override val member = "ProviderButton"

    private const val google = "Continue with Google"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "google",
                expect = mapOf("provider" to "google", "variant" to "outline", "tone" to "neutral", "size" to "md", "label" to google),
            ) { PMProviderButton(label = google, provider = PMProviderButtonProvider.Google) },
            PMStateEntry("microsoft", expect = mapOf("provider" to "microsoft")) {
                PMProviderButton(label = "Continue with Microsoft", provider = PMProviderButtonProvider.Microsoft)
            },
            PMStateEntry("github — the mark in the text colour", expect = mapOf("provider" to "github")) {
                PMProviderButton(label = "Continue with GitHub", provider = PMProviderButtonProvider.Github)
            },
        ) + listOf(PMControlSize.Sm, PMControlSize.Lg).map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value)) {
                PMProviderButton(label = google, provider = PMProviderButtonProvider.Google, size = size)
            }
        } + listOf(
            PMStateEntry("loading", expect = mapOf("state" to "loading", "value" to "Loading")) {
                PMProviderButton(label = google, loading = true, provider = PMProviderButtonProvider.Google)
            },
            PMStateEntry("disabled — the mark desaturated", expect = mapOf("disabled" to "true")) {
                PMProviderButton(disabled = true, label = google, provider = PMProviderButtonProvider.Google)
            },
            PMStateEntry("a chooser — each the column's width", expect = mapOf("provider" to "google")) {
                Column(verticalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3)) {
                    PMProviderButton(label = google, provider = PMProviderButtonProvider.Google)
                    PMProviderButton(label = "Continue with Microsoft", provider = PMProviderButtonProvider.Microsoft)
                    PMProviderButton(label = "Continue with GitHub", provider = PMProviderButtonProvider.Github)
                }
            },
            PMStateEntry("localized — a German sentence", expect = mapOf("provider" to "google", "label" to "Mit Google fortfahren")) {
                PMProviderButton(label = "Mit Google fortfahren", provider = PMProviderButtonProvider.Google)
            },
        )
}
