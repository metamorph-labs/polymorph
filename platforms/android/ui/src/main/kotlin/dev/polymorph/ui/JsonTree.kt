// JsonTree (`design/components/json-tree.md`): one JSON value, browsable. An
// object or an array is a branch that opens and closes; everything else is a
// leaf, its value coloured by kind. JSON is code, so the whole tree is in the
// mono face at `text.sm`. The kind colours come from the text and accent
// roles, never the status family: a string in `text.secondary`, quoted; a
// number in `accent.text`; a boolean or `null` in `text.muted`, italic. A key
// is `text.primary` with its colon in `text.muted`.
//
// A branch is a toggle row (`PMWashRow`): the `next` chevron, the key, and the
// summary (`{…} 3 keys`, `[…] 12 items`) in `text.muted`. The chevron turns a
// quarter turn while open, on the control tokens; a press washes the row in
// `bg.subtle` at `radius.sm`. The row takes the hit target's height, so two
// branches one above the other are each a target of their own; a leaf keeps
// `space.1` above and below its line. Children appear at once, in every
// temperament, because a large subtree cannot animate in smoothly; they are
// indented `space.5` behind a `border.subtle` guide `space.2` in from the
// toggle column. An empty object or array is a leaf, `{}` or `[]`: a toggle
// that opens onto nothing is not drawn.
//
// Depth is the only setting: `defaultDepth` levels open at first (1 by
// default, `0` all closed, `Double.POSITIVE_INFINITY` all open); after that
// each branch keeps its own state, because what a reader opens is not app
// state. The tree is named by `label`; each toggle is a button named by its
// key and summary ("assignee, 2 keys") whose state says whether it is
// expanded, with the platform's expand and collapse actions; each leaf is one
// node, its key and value read together. It is not CodeBlock (nothing to
// copy) and not an editor (nothing changes).

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMColors
import dev.polymorph.tokens.PMDynamicColor
import kotlin.math.abs

object PMJsonTree : PMJsonTreeRendering {
    @Composable
    override fun Render(props: PMJsonTreeProps) {
        val theme = PM.theme
        CompositionLocalProvider(
            LocalTextStyle provides theme.text.sm.mono(theme).textStyle,
            LocalContentColor provides theme.colors.textPrimary.color,
        ) {
            Column(
                Modifier
                    .pmMember("JsonTree")
                    .semantics {
                        contentDescription = props.label
                        isTraversalGroup = true
                    }
                    .fillMaxWidth(),
            ) {
                Entry(name = null, value = props.data, depth = 0, defaultDepth = props.defaultDepth ?: 1.0)
            }
        }
    }

    /** One value at one place in the tree: a branch for an object or an array with entries, a leaf for anything else. */
    @Composable
    private fun Entry(name: String?, value: PMJSONValue, depth: Int, defaultDepth: Double) {
        when {
            value is PMJSONValue.Object && value.members.isNotEmpty() ->
                Branch(name, value.members.map { it.key to it.value }, array = false, depth, defaultDepth)
            value is PMJSONValue.Array && value.items.isNotEmpty() ->
                Branch(name, value.items.mapIndexed { index, item -> index.toString() to item }, array = true, depth, defaultDepth)
            else -> Leaf(name, value)
        }
    }

    /** An object or array with entries: its toggle row, and its entries one level in while it is open. */
    @Composable
    private fun Branch(name: String?, entries: List<Pair<String, PMJSONValue>>, array: Boolean, depth: Int, defaultDepth: Double) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val strings = PMSpecDefault.strings
        var open by remember { mutableStateOf(depth < defaultDepth) }
        val total = entries.size.toDouble()
        val count = when {
            array && entries.size == 1 -> strings.jsonItem(total)
            array -> strings.jsonItems(total)
            entries.size == 1 -> strings.jsonKey(total)
            else -> strings.jsonKeys(total)
        }
        val summary = "${if (array) COLLAPSED_ARRAY else COLLAPSED_OBJECT} $count"
        val guide = theme.colors.borderSubtle.color

        Column(Modifier.fillMaxWidth()) {
            PMWashRow(
                wash = theme.colors.bgSubtle,
                cornerRadius = theme.radius.sm.dp,
                // No animation: the children appear at once; only the chevron turns.
                onClick = { open = !open },
                semantics = {
                    contentDescription = name?.let { "$it, $count" } ?: count
                    pmDisclosure(open, strings) { open = !open }
                },
            ) {
                Row(
                    Modifier.padding(horizontal = space.s1),
                    horizontalArrangement = Arrangement.spacedBy(space.s2),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PMTurningChevron(PMIconRole.Next, open, PMTurn.QUARTER)
                    name?.let { Key(it) }
                    Text(summary, color = theme.colors.textMuted.color)
                }
            }
            if (open) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(start = space.s2)
                        .drawBehind {
                            // The guide runs down the start edge, the right one in a right-to-left layout.
                            val line = PMGeometry.hairline.toPx()
                            val x = if (layoutDirection == LayoutDirection.Rtl) size.width - line else 0f
                            drawRect(guide, topLeft = Offset(x, 0f), size = Size(line, size.height))
                        }
                        .padding(start = space.s5),
                ) {
                    for ((key, item) in entries) Entry(key, item, depth + 1, defaultDepth)
                }
            }
        }
    }

    /** A value with nothing to open: its key, then its value in its kind's colour, wrapping beside the key. */
    @Composable
    private fun Leaf(name: String?, value: PMJSONValue) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val spelling = spelling(value, theme.colors)
        Row(
            Modifier
                .fillMaxWidth()
                .padding(vertical = space.s1)
                .semantics(mergeDescendants = true) {},
        ) {
            name?.let { Key(it, Modifier.padding(start = space.s1, end = space.s2)) }
            Text(
                text = spelling.first,
                color = spelling.second.color,
                fontStyle = if (spelling.third) FontStyle.Italic else FontStyle.Normal,
                modifier = Modifier.padding(horizontal = space.s1),
            )
        }
    }

    /** A key and its colon, the colon muted. */
    @Composable
    private fun Key(name: String, modifier: Modifier = Modifier) {
        val colors = PM.theme.colors
        val muted = colors.textMuted.color
        Text(
            text = buildAnnotatedString {
                append(name)
                withStyle(SpanStyle(color = muted)) { append(COLON) }
            },
            color = colors.textPrimary.color,
            modifier = modifier,
        )
    }

    /**
     * A leaf's value as JSON writes it, its colour and whether it is italic:
     * a string quoted and escaped as `JSON.stringify` writes it, a number as
     * JavaScript prints it, `true`, `false` and `null` as JSON's own words.
     * They are code, not text to translate, as a CodeBlock's lines are.
     */
    private fun spelling(value: PMJSONValue, c: PMColors): Triple<String, PMDynamicColor, Boolean> = when (value) {
        is PMJSONValue.Text -> Triple(quoted(value.value), c.textSecondary, false)
        is PMJSONValue.Number -> Triple(number(value.value), c.accentText, false)
        is PMJSONValue.Bool -> Triple(value.value.toString(), c.textMuted, true)
        PMJSONValue.Null -> Triple(NULL, c.textMuted, true)
        // Only an empty container reaches a leaf; it draws as the summary does.
        is PMJSONValue.Object -> Triple(EMPTY_OBJECT, c.textMuted, false)
        is PMJSONValue.Array -> Triple(EMPTY_ARRAY, c.textMuted, false)
    }

    /**
     * A number as JavaScript prints it (`Number.prototype.toString`), from the
     * shortest digits that name it and where its decimal point falls: in
     * positional form while the point is at most 21 places after the first
     * digit and at most 6 before it (`2`, `0.0001`, `12345678.5`,
     * `1000000000000000`), and otherwise as one digit before the point, `e`, a
     * sign and the exponent (`1e-7`, `1.5e+21`).
     */
    fun number(value: Double): String {
        if (value.isNaN()) return NAN
        if (value.isInfinite()) return if (value > 0) INFINITY else MINUS + INFINITY
        if (value == 0.0) return ZERO
        val (digits, point) = decimal(abs(value))
        val count = digits.length
        val body = when (point) {
            in count..MOST_POINT -> digits + ZERO.repeat(point - count)
            in 1..MOST_POINT -> digits.substring(0, point) + DOT + digits.substring(point)
            in LEAST_POINT..0 -> ZERO + DOT + ZERO.repeat(-point) + digits
            else -> {
                val exponent = point - 1
                val mantissa = if (count == 1) digits else digits.substring(0, 1) + DOT + digits.substring(1)
                mantissa + EXPONENT + (if (exponent < 0) MINUS else PLUS) + abs(exponent)
            }
        }
        return (if (value < 0) MINUS else "") + body
    }

    /**
     * The shortest digits that name a positive finite `value`, with no zero at
     * either end, and where the decimal point falls among them: the value is
     * 0.d₁d₂… × 10^point. Read from Kotlin's shortest form, `41.5` or `1.0E-5`.
     */
    private fun decimal(value: Double): Pair<String, Int> {
        val text = value.toString()
        val e = text.indexOfFirst { it == 'E' || it == 'e' }
        val mantissa = if (e < 0) text else text.substring(0, e)
        val exponent = if (e < 0) 0 else text.substring(e + 1).toInt()
        val dot = mantissa.indexOf('.')
        val whole = if (dot < 0) mantissa else mantissa.substring(0, dot)
        val all = whole + (if (dot < 0) "" else mantissa.substring(dot + 1))
        val leading = all.indexOfFirst { it != '0' }
        return all.substring(leading).trimEnd('0') to whole.length - leading + exponent
    }

    /** The string in double quotes, with the quote, the backslash and the control characters escaped. */
    fun quoted(string: String): String = buildString {
        append(QUOTE)
        for (char in string) {
            when {
                char == '"' -> append(ESCAPED_QUOTE)
                char == '\\' -> append(ESCAPED_BACKSLASH)
                char == '\n' -> append(ESCAPED_NEWLINE)
                char == '\r' -> append(ESCAPED_RETURN)
                char == '\t' -> append(ESCAPED_TAB)
                char.code < CONTROL -> append(ESCAPED_UNICODE).append(char.code.toString(HEX).padStart(UNICODE_DIGITS, '0'))
                else -> append(char)
            }
        }
        append(QUOTE)
    }

    private const val NULL = "null"
    private const val NAN = "NaN"
    private const val COLON = ":"
    private const val EMPTY_OBJECT = "{}"
    private const val EMPTY_ARRAY = "[]"
    private const val COLLAPSED_OBJECT = "{…}"
    private const val COLLAPSED_ARRAY = "[…]"
    private const val QUOTE = "\""
    private const val ESCAPED_QUOTE = "\\\""
    private const val ESCAPED_BACKSLASH = "\\\\"
    private const val ESCAPED_NEWLINE = "\\n"
    private const val ESCAPED_RETURN = "\\r"
    private const val ESCAPED_TAB = "\\t"
    private const val ESCAPED_UNICODE = "\\u"

    /** The parts of a number as JavaScript prints it. */
    private const val INFINITY = "Infinity"
    private const val ZERO = "0"
    private const val DOT = "."
    private const val EXPONENT = "e"
    private const val PLUS = "+"
    private const val MINUS = "-"

    /** The decimal point's places after the first digit, at most, and before it, at least, in positional form. */
    private const val MOST_POINT = 21
    private const val LEAST_POINT = -5

    /** Characters below this are control characters, escaped as `\uXXXX` with four hexadecimal digits. */
    private const val CONTROL = 32
    private const val HEX = 16
    private const val UNICODE_DIGITS = 4
}

/**
 * JsonTree's states, from the spec's States table: a payload with its first
 * level open, all closed, all open, one leaf of every kind, the empty
 * containers, and a value that is not a container at all.
 */
object JsonTreeStates : PMStates {
    override val member = "JsonTree"

    private const val body = "Response body"

    val payload = PMJSONValue.of(
        linkedMapOf(
            "id" to "tkt_5417",
            "title" to "Sync fails on large workspaces",
            "priority" to 2,
            "resolved" to false,
            "assignee" to linkedMapOf("name" to "Ada Okonkwo", "team" to "Platform"),
            "labels" to listOf("sync", "performance"),
            "closedAt" to null,
        ),
    )

    private val everyKind = PMJSONValue.of(
        linkedMapOf("string" to "a string", "number" to 41.5, "boolean" to true, "nothing" to null),
    )

    private val empty = PMJSONValue.of(linkedMapOf("empty" to emptyMap<String, Any>(), "none" to emptyList<Any>()))

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("a payload — the first level open", expect = mapOf("label" to body)) {
                PMJsonTree(data = payload, label = body)
            },
            PMStateEntry("closed fist — depth 0", expect = mapOf("label" to body)) {
                PMJsonTree(data = payload, defaultDepth = 0.0, label = body)
            },
            PMStateEntry("wide open — every level", expect = mapOf("label" to body)) {
                PMJsonTree(data = payload, defaultDepth = Double.POSITIVE_INFINITY, label = body)
            },
            PMStateEntry("every kind", expect = mapOf("label" to "Every kind")) {
                PMJsonTree(data = everyKind, defaultDepth = Double.POSITIVE_INFINITY, label = "Every kind")
            },
            PMStateEntry("empty containers — leaves, no toggle", expect = mapOf("label" to "Empty containers")) {
                PMJsonTree(data = empty, defaultDepth = Double.POSITIVE_INFINITY, label = "Empty containers")
            },
            PMStateEntry("primitive root", expect = mapOf("label" to "A number alone")) {
                PMJsonTree(data = PMJSONValue.Number(42.0), label = "A number alone")
            },
        )
}
