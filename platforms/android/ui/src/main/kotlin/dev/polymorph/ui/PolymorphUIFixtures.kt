// What several members' states fixtures share: a frame that lays out a layout
// meant for a wider screen (a tablet's grid or table) at the harness's canvas
// width, and sample content.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

/**
 * A fixture frame: `content` laid out at `width` and drawn scaled down into the
 * width it is offered, with the height the scale gives. A Grid's ceiling and a
 * table's columns need a tablet's width, wider than the harness's canvas.
 */
@Composable
fun PMFixtureWidth(width: Dp, content: @Composable () -> Unit) {
    Layout(content) { measurables, constraints ->
        val laid = width.roundToPx()
        val placeables = measurables.map { it.measure(Constraints(minWidth = laid, maxWidth = laid)) }
        val scale = if (constraints.hasBoundedWidth && constraints.maxWidth < laid) {
            constraints.maxWidth.toFloat() / laid
        } else {
            1f
        }
        val height = placeables.sumOf { it.height }
        layout((laid * scale).roundToInt(), (height * scale).roundToInt()) {
            var y = 0
            for (placeable in placeables) {
                placeable.placeWithLayer(0, (y * scale).roundToInt()) {
                    scaleX = scale
                    scaleY = scale
                    transformOrigin = TransformOrigin(0f, 0f)
                }
                y += placeable.height
            }
        }
    }
}

/**
 * A fixture frame for an overlay that opens from its content (a Select's menu):
 * the content, then room for `rows` rows of a hit target's height below it,
 * because the harness sizes its canvas to the content and an overlay is drawn
 * in a window of its own over it.
 */
@Composable
fun PMFixtureRoom(rows: Int, content: @Composable () -> Unit) {
    Column {
        content()
        Spacer(Modifier.height(PM.theme.defaultDensity.hitTarget.dp * rows))
    }
}

/**
 * A fixture frame on a phone-tall canvas: `content` given the whole height the
 * harness offers, so a window that fills the screen (a full-screen dialog)
 * draws at a phone's size.
 */
@Composable
fun PMFixturePhone(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize()) { content() }
}

/** Sample content the states fixtures share. */
object PMSamples {
    const val body = "Replies reach the customer by email and stay in the ticket."
    const val note = "Only admins can change billing."
    val statuses = listOf("Open", "Waiting", "Closed", "Merged", "Spam", "Archived")
    val chips = listOf("Open", "Urgent", "Billing", "Waiting", "Refund", "Escalated", "Mobile", "Invoice", "Account")
}
