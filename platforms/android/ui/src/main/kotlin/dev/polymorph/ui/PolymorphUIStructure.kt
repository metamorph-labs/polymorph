// The parts several structure members share: the round mark of a step or an
// event (Stepper's indicator, Timeline's icon mark), Link's grammar for a run
// of text (Link, Markdown), and the text link of a trail or a list
// (Breadcrumbs' crumbs, ErrorSummary's links).

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor
import dev.polymorph.tokens.PMTextStyle

/* Marks -------------------------------------------------------------------- */

/**
 * A round mark `space.6` across, `radius.pill`: a fill, a hairline border and
 * its content (a number or a glyph) in `foreground`. `lit` adds the lit
 * object's seat shadow and inset top light, as a completed Stepper step has; a
 * flat pairing's shadows are empty, so it draws none there. A transparent
 * hairline stands where the recipe has no border, so every mark is one size.
 * The mark is decorative: the step's or the event's words carry what it shows.
 */
@Composable
fun PMMarkDisc(
    fill: PMDynamicColor?,
    border: PMDynamicColor?,
    foreground: PMDynamicColor,
    modifier: Modifier = Modifier,
    lit: Boolean = false,
    content: @Composable () -> Unit,
) {
    val theme = PM.theme
    val shape = theme.rounded(theme.radius.pill)
    Box(
        modifier
            .semantics { hideFromAccessibility() }
            .size(theme.defaultDensity.spacing.s6)
            .then(if (lit) Modifier.pmShadow(theme.shadows.seat, shape) else Modifier)
            .background(fill?.color ?: Color.Transparent, shape)
            .then(if (lit) Modifier.pmInsetShadow(theme.shadows.insetTop, shape) else Modifier)
            .border(PMGeometry.hairline, border?.color ?: Color.Transparent, shape),
        contentAlignment = Alignment.Center,
    ) {
        CompositionLocalProvider(LocalContentColor provides foreground.color) { content() }
    }
}

/* Text links --------------------------------------------------------------- */

/**
 * Link's grammar for a run of text (`link.md`), which every link drawn as text
 * wears (Link's text variants, `PMTextLink`, Markdown's links): `color` at
 * rest, underlined when `underlined`, and `activeColor`, underlined, under the
 * pointer, while pressed and while focused. A run carries it in a
 * `LinkAnnotation`, so TalkBack announces the run as a link and lists it with
 * the screen's links, and a keyboard reaches it. Compose draws one underline
 * thickness, so the web's thicker hover line is its colour alone.
 */
fun pmLinkStyles(color: Color, activeColor: Color, underlined: Boolean): TextLinkStyles {
    val active = SpanStyle(color = activeColor, textDecoration = TextDecoration.Underline)
    return TextLinkStyles(
        style = SpanStyle(color = color, textDecoration = if (underlined) TextDecoration.Underline else null),
        focusedStyle = active,
        hoveredStyle = active,
        pressedStyle = active,
    )
}

/**
 * A link drawn as text, Link's grammar (`pmLinkStyles`) in another colour:
 * `color` at rest and `activeColor` under the pointer, while pressed and while
 * focused, the rest colour moving to it over the control duration; underlined
 * at rest when `underlined`, and always while active. Breadcrumbs' crumbs are
 * `text.secondary` and underline when active; ErrorSummary's links are
 * `danger.text` and always underlined.
 *
 * The text is one run in a `LinkAnnotation` whose press is `onClick`, as
 * Link's is: TalkBack announces it as a link and activates it, and a keyboard
 * reaches it and draws the focus ring around it. The link reserves the hit
 * target around its text (`pmHitTarget`) as far as the width it is offered
 * allows. The label is at most `maxWidth` wide, ending in an ellipsis past
 * it, on one line when `singleLine`.
 */
@Composable
fun PMTextLink(
    text: String,
    step: PMTextStyle,
    color: PMDynamicColor,
    activeColor: PMDynamicColor,
    underlined: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    maxWidth: Dp = Dp.Unspecified,
    singleLine: Boolean = false,
) {
    val theme = PM.theme
    val motion = theme.defaultMotion
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    var focused by remember { mutableStateOf(false) }
    val press by rememberUpdatedState(onClick)
    val rest by animateColorAsState(
        (if (hovered || focused) activeColor else color).color,
        motion.easing.standard.tween(motion.duration.control),
        label = "link",
    )
    val styles = pmLinkStyles(rest, activeColor.color, underlined)
    val run = buildAnnotatedString {
        withLink(LinkAnnotation.Clickable(text, styles) { press() }) { append(text) }
    }
    Box(
        modifier
            // One node for accessibility, the run with its link, which
            // TalkBack announces as a link and activates here.
            .clearAndSetSemantics {
                this.text = run
                onClick {
                    press()
                    true
                }
            }
            .pmHitTarget()
            .hoverable(interaction)
            // The run takes focus; its parent hears it, and draws the mark
            // around the text box with a gap.
            .onFocusChanged { focused = it.hasFocus }
            .pmFocusRing(focused, theme.radius.sm.dp, around = true),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            text = run,
            style = step.textStyle,
            color = rest,
            maxLines = if (singleLine) 1 else Int.MAX_VALUE,
            softWrap = !singleLine,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = maxWidth),
        )
    }
}
