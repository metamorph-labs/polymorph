// Avatar (`design/components/avatar.md`): a round mark for a person or a
// workspace: the picture, else the initials, else the `user` glyph. Round at
// every geometry, as Switch's thumb is: both depict round things, and the
// geometry axis governs surfaces. `space.6`, `space.7` or `space.8` across
// (`sm`, `md`, `lg`), the initials at `text.xs`, `text.sm` or `text.lg`.
//
// The picture is the app's image loader's (`PMRemoteImage`, through
// `LocalPMImageLoader`): it fades in over the initials already drawn, inside a
// `border.subtle` hairline, so a slow picture never leaves a gap, and a URL that
// fails, or an app with no loader, leaves the initials.
//
// The initials take one of five status families, picked by a hash of the name
// (FNV-1a over its UTF-16 units, as the web's `avatarTone`), so two people get
// two colours, the same on every screen and the same as on the web, without a
// hue outside the role table the contrast law checks. The glyph means there is
// no name (unassigned), a different fact from a missing picture.
//
// Beside a visible name the avatar is hidden from accessibility, which would
// hear the name twice; standing alone it is an image named by `label`.
// Initials are never read: they are a picture of a name, not the name.
//
// The web's `Avatar.Group` has no contract on Android (the registry publishes
// no part for it), so it is not drawn here.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.toUpperCase
import dev.polymorph.tokens.PMColors
import dev.polymorph.tokens.PMDynamicColor

object PMAvatar : PMAvatarRendering {
    @Composable
    override fun Render(props: PMAvatarProps) {
        val theme = PM.theme
        val size = props.size ?: PMControlSize.Md
        val space = theme.defaultDensity.spacing
        val diameter = when (size) {
            PMControlSize.Sm -> space.s6
            PMControlSize.Md -> space.s7
            PMControlSize.Lg -> space.s8
        }
        val step = when (size) {
            PMControlSize.Sm -> theme.text.xs
            PMControlSize.Md -> theme.text.sm
            PMControlSize.Lg -> theme.text.lg
        }
        val initials = initials(props.name)
        val tone = if (initials.isEmpty()) null else tone(props.name)
        val (fill, text) = recipe(tone, theme.colors)
        val shape = theme.rounded(theme.radius.pill)
        val attributes = buildMap {
            put("size", size.value)
            put("fallback", if (initials.isEmpty()) "icon" else "initials")
            tone?.let { put("tone", it.value) }
        }
        val label = props.label

        Box(
            Modifier
                .pmMember("Avatar", attributes)
                .then(
                    if (label != null) {
                        Modifier.clearAndSetSemantics {
                            contentDescription = label
                            role = Role.Image
                        }
                    } else {
                        // Nothing under it is read either: the initials are a picture of the name.
                        Modifier.clearAndSetSemantics { hideFromAccessibility() }
                    },
                )
                .size(diameter)
                .clip(shape)
                .background(fill.color),
            contentAlignment = Alignment.Center,
        ) {
            if (initials.isEmpty()) {
                PMIconView(PMIconRole.User, size, tint = text.color)
            } else {
                Text(
                    text = initials,
                    style = step.textStyle,
                    color = text.color,
                    maxLines = 1,
                    softWrap = false,
                )
            }
            props.src?.let { PMRemoteImage(it, Modifier.matchParentSize(), frame = shape) }
        }
    }

    /**
     * Two letters, upper-cased: the first and last words' initials, or a
     * single word's first two. A middle name is not a third initial.
     */
    fun initials(name: String): String {
        val words = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        val first = words.firstOrNull() ?: return ""
        val letters = if (words.size == 1) first.take(2) else "${first.take(1)}${words.last().take(1)}"
        return letters.toUpperCase(LocaleList.current)
    }

    /** The five families a name can map to, in the web's order. */
    enum class Tone(val value: String) { Accent("accent"), Info("info"), Success("success"), Warning("warning"), Danger("danger") }

    /**
     * FNV-1a over the name's UTF-16 units, as the web's `avatarTone` computes
     * it, so a name has the same family on every platform.
     */
    fun tone(name: String): Tone {
        var hash = FNV_OFFSET
        for (unit in name) {
            hash = (hash xor unit.code.toUInt()) * FNV_PRIME
        }
        return Tone.entries[(hash % Tone.entries.size.toUInt()).toInt()]
    }

    /** FNV-1a's 32-bit offset basis and prime: the hash's own constants. */
    private const val FNV_OFFSET: UInt = 2166136261u
    private const val FNV_PRIME: UInt = 16777619u

    /** The fill and the text colour: a family's `subtle` and `text`, or the glyph's subtle fill and muted glyph. */
    private fun recipe(tone: Tone?, c: PMColors): Pair<PMDynamicColor, PMDynamicColor> = when (tone) {
        null -> c.bgSubtle to c.textMuted
        Tone.Accent -> c.accentSubtle to c.accentText
        Tone.Info -> c.infoSubtle to c.infoText
        Tone.Success -> c.successSubtle to c.successText
        Tone.Warning -> c.warningSubtle to c.warningText
        Tone.Danger -> c.dangerSubtle to c.dangerText
    }
}

/**
 * Avatar's states, from the spec: initials, a single word, the glyph, a
 * picture (its initials show until the app's loader draws it, and the harness
 * has none), the three sizes, and the standalone mark with `label`. The
 * avatars beside a name are hidden from accessibility, which `hidden` tells
 * the harness.
 */
object AvatarStates : PMStates {
    override val member = "Avatar"

    private const val ada = "Ada Lovelace"
    private const val single = "Grace"
    private const val photo = "https://example.com/avatars/ada.png"
    private const val standalone = "Ada Lovelace, assignee"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("initials", expect = mapOf("fallback" to "initials", "hidden" to "true")) { PMAvatar(name = ada) },
            PMStateEntry("single word", expect = mapOf("fallback" to "initials", "hidden" to "true")) { PMAvatar(name = single) },
            PMStateEntry("icon — no name", expect = mapOf("fallback" to "icon", "hidden" to "true")) { PMAvatar(name = "") },
            PMStateEntry("image — the initials until it loads", expect = mapOf("hidden" to "true")) {
                PMAvatar(name = ada, src = photo)
            },
        ) + PMControlSize.entries.map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value, "hidden" to "true")) {
                PMAvatar(name = ada, size = size)
            }
        } + listOf(
            PMStateEntry("every size, beside a name", expect = mapOf("size" to "sm", "hidden" to "true")) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    for (size in PMControlSize.entries) PMAvatar(name = ada, size = size)
                    Text(ada, style = PM.theme.text.sm.textStyle)
                }
            },
            PMStateEntry(
                "standalone",
                expect = mapOf("fallback" to "initials", "size" to "lg", "label" to standalone),
            ) { PMAvatar(label = standalone, name = ada, size = PMControlSize.Lg) },
        )
}
