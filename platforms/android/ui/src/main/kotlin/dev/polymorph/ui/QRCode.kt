// QRCode (`design/components/qr-code.md`): a string drawn as a QR Code symbol
// for a camera to read, such as an authenticator's `otpauth://` URI, a pairing
// link or a ticket. It is drawn on the device from `value`, so a secret never
// reaches an image server. Not an image (an app shows a symbol rendered
// elsewhere itself), not a chart, not a scanner.
//
// The symbol is the web's: the same encoder (`packages/engine/src/qr/encode.ts`),
// written here in Kotlin, because Compose has none. Byte mode, the value's
// UTF-8 bytes, at `errorCorrection` (`M` by default), in the smallest version
// of 1 to 40 that holds them, the mask chosen by the standard's penalty
// search, so a symbol here matches the web's module for module. It draws the
// dark modules as horizontal runs, each module a whole number of pixels and
// the runs not anti-aliased, the web's `crispEdges`, because a blurred module
// edge is the one rendering choice that can make a scan fail.
//
// The symbol is square: `space.10` + `space.8`, twice `space.10`, or twice
// `space.10` + `space.9` (`sm`, `md`, `lg`, the recipe's multiples in
// `PMRecipe`), so a roomier density gets a larger symbol, and no wider than the width it is offered, because a clipped finder
// pattern does not scan. The paper is `bg.surface` and the ink `text.primary`,
// both in the pairing's light mode whatever the screen's (the web's
// `data-mode="light"`): scanners read dark modules on a light field, and in
// dark mode the symbol is a light card on a dark page. The quiet zone is four
// modules on every side, painted as paper, part of the symbol (ISO/IEC 18004
// §6.4.10). The corners are `radius.sm`. Nothing moves.
//
// One image node named by `label`, what the symbol is for, never its contents.
// An empty `value`, or one longer than the largest symbol holds, draws nothing:
// a truncated symbol scans as a different string.

package dev.polymorph.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

object PMQRCode : PMQRCodeRendering {
    @Composable
    override fun Render(props: PMQRCodeProps) {
        val theme = PM.theme
        val size = props.size ?: PMControlSize.Md
        val level = props.errorCorrection ?: PMQRCodeErrorCorrection.M
        val symbol = remember(props.value, level) { if (props.value.isEmpty()) null else PMQREncoder.symbol(props.value, level) }
            ?: return
        val space = theme.defaultDensity.spacing
        val side = when (size) {
            PMControlSize.Sm -> space.s10 * PMRecipe.qrSizeSm + space.s8
            PMControlSize.Md -> space.s10 * PMRecipe.qrSizeMd
            PMControlSize.Lg -> space.s10 * PMRecipe.qrSizeLg + space.s9
        }
        // Light mode whatever the screen's: dark modules on a light field.
        val paper = theme.colors.bgSurface.light.color
        val ink = theme.colors.textPrimary.light.color
        val label = props.label

        Canvas(
            Modifier
                .pmMember("QRCode", mapOf("size" to size.value, "mode" to "light"))
                .clearAndSetSemantics {
                    contentDescription = label
                    role = Role.Image
                }
                .widthIn(max = side)
                .aspectRatio(1f)
                .clip(theme.rounded(theme.radius.sm)),
        ) {
            val extent = symbol.size + PMQREncoder.QUIET_ZONE * 2
            val box = min(this.size.width, this.size.height)
            // A module is a whole number of pixels, so every edge lands on one;
            // the paper takes up what the rounding leaves, around the symbol.
            val whole = floor(box / extent)
            val module = if (whole > 0f) whole else box / extent
            val inset = floor((box - module * extent) / 2)
            val origin = inset + module * PMQREncoder.QUIET_ZONE
            drawRect(paper)
            for (y in 0 until symbol.size) {
                var start = -1
                for (x in 0..symbol.size) {
                    val dark = x < symbol.size && symbol.modules[y][x]
                    if (dark && start < 0) start = x
                    if (!dark && start >= 0) {
                        drawRect(
                            color = ink,
                            topLeft = Offset(origin + start * module, origin + y * module),
                            size = Size((x - start) * module, module),
                        )
                        start = -1
                    }
                }
            }
        }
    }
}

/**
 * The QR Code symbol, as data: ISO/IEC 18004 Model 2, byte mode, versions 1 to
 * 40, the four correction levels. The web's encoder
 * (`packages/engine/src/qr/encode.ts`) step for step, so both platforms draw
 * the same modules; `QRCodeEncoderTest` holds this one to the web's matrices.
 * The standard's constants are written in decimal.
 */
object PMQREncoder {
    /** ISO/IEC 18004 §6.4.10: four clear modules on every side. */
    const val QUIET_ZONE = 4

    /** A symbol: its version, its size in modules (without the quiet zone), its mask, and `modules[y][x]`, true where dark. */
    class Symbol(val version: Int, val size: Int, val mask: Int, val modules: List<BooleanArray>)

    private const val MIN_VERSION = 1
    private const val MAX_VERSION = 40

    private val ECC_CODEWORDS_PER_BLOCK = mapOf(
        PMQRCodeErrorCorrection.L to intArrayOf(-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30),
        PMQRCodeErrorCorrection.M to intArrayOf(-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28),
        PMQRCodeErrorCorrection.Q to intArrayOf(-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30),
        PMQRCodeErrorCorrection.H to intArrayOf(-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30),
    )

    private val ERROR_CORRECTION_BLOCKS = mapOf(
        PMQRCodeErrorCorrection.L to intArrayOf(-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25),
        PMQRCodeErrorCorrection.M to intArrayOf(-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49),
        PMQRCodeErrorCorrection.Q to intArrayOf(-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68),
        PMQRCodeErrorCorrection.H to intArrayOf(-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81),
    )

    /** The format information's two-bit indicator, in the standard's order. */
    private fun formatBits(level: PMQRCodeErrorCorrection): Int = when (level) {
        PMQRCodeErrorCorrection.L -> 1
        PMQRCodeErrorCorrection.M -> 0
        PMQRCodeErrorCorrection.Q -> 3
        PMQRCodeErrorCorrection.H -> 2
    }

    /** GF(2^8)'s reducing polynomial, x^8 + x^4 + x^3 + x^2 + 1 (hexadecimal 11D). */
    private const val FIELD = 285

    /** The format information's BCH generator (hexadecimal 537) and mask (hexadecimal 5412). */
    private const val FORMAT_GENERATOR = 1335
    private const val FORMAT_MASK = 21522

    /** The version information's BCH generator (hexadecimal 1F25). */
    private const val VERSION_GENERATOR = 7973

    /** The two pad bytes, alternating (hexadecimal EC and 11). */
    private const val PAD_FIRST = 236
    private const val PAD_SECOND = 17

    private const val BYTE = 255

    /**
     * The symbol for `value` at `level`, or null when no symbol holds it: the
     * smallest version from `minVersion` up that holds the value, as the web's
     * `encodeQr` takes `minVersion`, and the mask the penalty search chooses
     * unless `mask` names one.
     */
    fun symbol(value: String, level: PMQRCodeErrorCorrection, mask: Int? = null, minVersion: Int = MIN_VERSION): Symbol? {
        val payload = value.encodeToByteArray()
        var version = minVersion.coerceIn(MIN_VERSION, MAX_VERSION)
        while (payload.size > byteCapacity(version, level)) {
            version += 1
            if (version > MAX_VERSION) return null
        }
        val grid = Grid(version * 4 + 17)
        drawFunctionPatterns(grid, version, level)
        drawCodewords(grid, interleave(dataBytes(payload, version, level), version, level))
        var chosen = mask ?: -1
        if (chosen !in 0..7) {
            var best = Int.MAX_VALUE
            for (candidate in 0 until 8) {
                applyMask(grid, candidate)
                drawFormat(grid, level, candidate)
                val score = penalty(grid)
                if (score < best) {
                    best = score
                    chosen = candidate
                }
                applyMask(grid, candidate)
            }
        }
        applyMask(grid, chosen)
        drawFormat(grid, level, chosen)
        return Symbol(version, grid.size, chosen, grid.dark.toList())
    }

    private fun rawDataModules(version: Int): Int {
        var result = (16 * version + 128) * version + 64
        if (version >= 2) {
            val alignments = version / 7 + 2
            result -= (25 * alignments - 10) * alignments - 55
            if (version >= 7) result -= 36
        }
        return result
    }

    private fun dataCodewords(version: Int, level: PMQRCodeErrorCorrection): Int =
        rawDataModules(version) / 8 - ECC_CODEWORDS_PER_BLOCK.getValue(level)[version] * ERROR_CORRECTION_BLOCKS.getValue(level)[version]

    private fun countBits(version: Int): Int = if (version <= 9) 8 else 16

    /** How many payload bytes a version holds, after the mode indicator and the count field. */
    fun byteCapacity(version: Int, level: PMQRCodeErrorCorrection): Int =
        (dataCodewords(version, level) * 8 - 4 - countBits(version)) / 8

    private fun multiply(x: Int, y: Int): Int {
        var z = 0
        for (i in 7 downTo 0) {
            z = (z shl 1) xor ((z ushr 7) * FIELD)
            z = z xor (((y ushr i) and 1) * x)
        }
        return z and BYTE
    }

    private fun divisor(degree: Int): IntArray {
        val result = IntArray(degree)
        result[degree - 1] = 1
        var root = 1
        for (i in 0 until degree) {
            for (j in 0 until degree) {
                result[j] = multiply(result[j], root)
                if (j + 1 < degree) result[j] = result[j] xor result[j + 1]
            }
            root = multiply(root, 2)
        }
        return result
    }

    private fun remainder(data: List<Int>, generator: IntArray): List<Int> {
        val result = ArrayDeque(List(generator.size) { 0 })
        for (byte in data) {
            val factor = byte xor result.removeFirst()
            result.addLast(0)
            for (index in generator.indices) result[index] = result[index] xor multiply(generator[index], factor)
        }
        return result.toList()
    }

    private fun dataBytes(payload: ByteArray, version: Int, level: PMQRCodeErrorCorrection): List<Int> {
        val capacityBits = dataCodewords(version, level) * 8
        val bits = mutableListOf<Int>()
        fun append(value: Int, length: Int) {
            for (i in length - 1 downTo 0) bits += (value ushr i) and 1
        }
        append(4, 4)
        append(payload.size, countBits(version))
        for (byte in payload) append(byte.toInt() and BYTE, 8)
        // The terminator is up to four zeros, fewer when the symbol is already full.
        append(0, min(4, capacityBits - bits.size))
        append(0, (8 - bits.size % 8) % 8)
        var pad = PAD_FIRST
        while (bits.size < capacityBits) {
            append(pad, 8)
            pad = if (pad == PAD_FIRST) PAD_SECOND else PAD_FIRST
        }
        return bits.chunked(8).map { chunk -> chunk.fold(0) { byte, bit -> (byte shl 1) or bit } }
    }

    /** Splits into blocks, corrects each, and interleaves: data first, then correction. */
    private fun interleave(data: List<Int>, version: Int, level: PMQRCodeErrorCorrection): List<Int> {
        val blockCount = ERROR_CORRECTION_BLOCKS.getValue(level)[version]
        val eccLength = ECC_CODEWORDS_PER_BLOCK.getValue(level)[version]
        val rawCodewords = rawDataModules(version) / 8
        val shortBlocks = blockCount - rawCodewords % blockCount
        val shortLength = rawCodewords / blockCount - eccLength
        val generator = divisor(eccLength)
        val blocks = mutableListOf<Pair<List<Int>, List<Int>>>()
        var offset = 0
        for (i in 0 until blockCount) {
            val length = shortLength + if (i < shortBlocks) 0 else 1
            val slice = data.subList(offset, offset + length)
            offset += length
            blocks += slice to remainder(slice, generator)
        }
        val result = mutableListOf<Int>()
        for (i in 0..shortLength) for ((block, _) in blocks) if (i < block.size) result += block[i]
        for (i in 0 until eccLength) for ((_, ecc) in blocks) result += ecc[i]
        return result
    }

    private fun alignmentPositions(version: Int): List<Int> {
        if (version == 1) return emptyList()
        val count = version / 7 + 2
        val step = if (version == 32) 26 else ((version * 4 + 4 + count * 2 - 3) / (count * 2 - 2)) * 2
        val result = mutableListOf(6)
        var position = version * 4 + 10
        while (result.size < count) {
            result.add(1, position)
            position -= step
        }
        return result
    }

    private class Grid(val size: Int) {
        val dark = Array(size) { BooleanArray(size) }

        /** Finder, timing, alignment, format and version modules: never masked, never data. */
        val reserved = Array(size) { BooleanArray(size) }

        fun function(x: Int, y: Int, isDark: Boolean) {
            dark[y][x] = isDark
            reserved[y][x] = true
        }
    }

    private fun drawFinder(grid: Grid, centreX: Int, centreY: Int) {
        for (dy in -4..4) {
            for (dx in -4..4) {
                val x = centreX + dx
                val y = centreY + dy
                if (x < 0 || x >= grid.size || y < 0 || y >= grid.size) continue
                // Chebyshev rings: dark core, light ring, dark ring, light separator.
                val ring = max(abs(dx), abs(dy))
                grid.function(x, y, ring != 2 && ring != 4)
            }
        }
    }

    private fun drawAlignment(grid: Grid, centreX: Int, centreY: Int) {
        for (dy in -2..2) {
            for (dx in -2..2) grid.function(centreX + dx, centreY + dy, max(abs(dx), abs(dy)) != 1)
        }
    }

    private fun drawFormat(grid: Grid, level: PMQRCodeErrorCorrection, mask: Int) {
        val data = (formatBits(level) shl 3) or mask
        var rem = data
        for (i in 0 until 10) rem = (rem shl 1) xor ((rem ushr 9) * FORMAT_GENERATOR)
        val bits = ((data shl 10) or rem) xor FORMAT_MASK
        fun bit(index: Int) = ((bits ushr index) and 1) != 0
        val size = grid.size
        for (i in 0..5) grid.function(8, i, bit(i))
        grid.function(8, 7, bit(6))
        grid.function(8, 8, bit(7))
        grid.function(7, 8, bit(8))
        for (i in 9 until 15) grid.function(14 - i, 8, bit(i))
        for (i in 0 until 8) grid.function(size - 1 - i, 8, bit(i))
        for (i in 8 until 15) grid.function(8, size - 15 + i, bit(i))
        // The one module that is dark in every symbol.
        grid.function(8, size - 8, true)
    }

    private fun drawVersion(grid: Grid, version: Int) {
        if (version < 7) return
        var rem = version
        for (i in 0 until 12) rem = (rem shl 1) xor ((rem ushr 11) * VERSION_GENERATOR)
        val bits = (version shl 12) or rem
        for (i in 0 until 18) {
            val isDark = ((bits ushr i) and 1) != 0
            val a = grid.size - 11 + i % 3
            val b = i / 3
            grid.function(a, b, isDark)
            grid.function(b, a, isDark)
        }
    }

    private fun drawFunctionPatterns(grid: Grid, version: Int, level: PMQRCodeErrorCorrection) {
        val size = grid.size
        for (i in 0 until size) {
            grid.function(6, i, i % 2 == 0)
            grid.function(i, 6, i % 2 == 0)
        }
        drawFinder(grid, 3, 3)
        drawFinder(grid, size - 4, 3)
        drawFinder(grid, 3, size - 4)
        val positions = alignmentPositions(version)
        val last = positions.size - 1
        positions.forEachIndexed { i, x ->
            positions.forEachIndexed { j, y ->
                // The three corners that already hold a finder take no alignment pattern.
                val onFinder = (i == 0 && j == 0) || (i == 0 && j == last) || (i == last && j == 0)
                if (!onFinder) drawAlignment(grid, x, y)
            }
        }
        // Reserved now with a placeholder mask, so the zigzag walks around them.
        drawFormat(grid, level, 0)
        drawVersion(grid, version)
    }

    private fun drawCodewords(grid: Grid, codewords: List<Int>) {
        val size = grid.size
        var index = 0
        var right = size - 1
        while (right >= 1) {
            // The vertical timing column is skipped whole.
            if (right == 6) right = 5
            for (vertical in 0 until size) {
                for (j in 0 until 2) {
                    val x = right - j
                    val upward = ((right + 1) and 2) == 0
                    val y = if (upward) size - 1 - vertical else vertical
                    if (grid.reserved[y][x] || index >= codewords.size * 8) continue
                    grid.dark[y][x] = ((codewords[index ushr 3] ushr (7 - (index and 7))) and 1) != 0
                    index += 1
                }
            }
            right -= 2
        }
    }

    private fun masked(mask: Int, x: Int, y: Int): Boolean = when (mask) {
        0 -> (x + y) % 2 == 0
        1 -> y % 2 == 0
        2 -> x % 3 == 0
        3 -> (x + y) % 3 == 0
        4 -> (x / 3 + y / 2) % 2 == 0
        5 -> (x * y) % 2 + (x * y) % 3 == 0
        6 -> ((x * y) % 2 + (x * y) % 3) % 2 == 0
        else -> ((x + y) % 2 + (x * y) % 3) % 2 == 0
    }

    /** XOR, so applying the same mask twice removes it. */
    private fun applyMask(grid: Grid, mask: Int) {
        for (y in 0 until grid.size) {
            for (x in 0 until grid.size) {
                if (!grid.reserved[y][x] && masked(mask, x, y)) grid.dark[y][x] = !grid.dark[y][x]
            }
        }
    }

    /** 1:1:3:1:1 with four light modules on one side: what a scanner mistakes for a finder. */
    private val FINDER_LIKE = listOf(
        booleanArrayOf(true, false, true, true, true, false, true, false, false, false, false),
        booleanArrayOf(false, false, false, false, true, false, true, true, true, false, true),
    )

    /** The standard's four penalty rules; the mask with the lowest total wins. */
    private fun penalty(grid: Grid): Int {
        val size = grid.size
        val dark = grid.dark
        var result = 0
        fun line(at: (Int) -> Boolean) {
            // Rule 1: runs of five or more in one colour.
            var run = 1
            for (i in 1..size) {
                if (i < size && at(i) == at(i - 1)) {
                    run += 1
                } else {
                    if (run >= 5) result += 3 + (run - 5)
                    run = 1
                }
            }
            // Rule 3: finder-like sequences.
            var i = 0
            while (i + 11 <= size) {
                for (pattern in FINDER_LIKE) {
                    if (pattern.indices.all { offset -> at(i + offset) == pattern[offset] }) result += 40
                }
                i += 1
            }
        }
        for (y in 0 until size) line { x -> dark[y][x] }
        for (x in 0 until size) line { y -> dark[y][x] }
        // Rule 2: 2×2 blocks of one colour.
        for (y in 0 until size - 1) {
            for (x in 0 until size - 1) {
                val colour = dark[y][x]
                if (colour == dark[y][x + 1] && colour == dark[y + 1][x] && colour == dark[y + 1][x + 1]) result += 3
            }
        }
        // Rule 4: how far the dark share strays from half, in steps of five percent.
        var darkCount = 0
        for (row in dark) for (module in row) if (module) darkCount += 1
        val total = size * size
        result += ((abs(darkCount * 20 - total * 10) + total - 1) / total - 1) * 10
        return result
    }
}

/**
 * QRCode's states, from the spec's States table: an authenticator enrolment at
 * each size, and the same string at high correction, a denser symbol in the
 * same box. An empty value draws nothing, so it has no entry: the harness holds
 * every entry to drawing.
 */
object QRCodeStates : PMStates {
    override val member = "QRCode"

    /** RFC 6238's own example secret: a fixture, not a credential. */
    private const val enrolment = "otpauth://totp/Relay:rowan@relay.test?secret=JBSWY3DPEHPK3PXP&issuer=Relay"
    private const val setup = "Authenticator setup code"
    private const val ticket = "Ticket 4821"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("an authenticator enrolment", expect = mapOf("size" to "md", "mode" to "light", "label" to setup)) {
                PMQRCode(label = setup, value = enrolment)
            },
            PMStateEntry("small", expect = mapOf("size" to "sm", "label" to ticket)) {
                PMQRCode(label = ticket, size = PMControlSize.Sm, value = "https://relay.test/t/4821")
            },
            PMStateEntry("large", expect = mapOf("size" to "lg", "label" to setup)) {
                PMQRCode(label = setup, size = PMControlSize.Lg, value = enrolment)
            },
            PMStateEntry("high correction — the same string, a denser symbol", expect = mapOf("size" to "md")) {
                PMQRCode(errorCorrection = PMQRCodeErrorCorrection.H, label = setup, value = enrolment)
            },
        )
}
