package dev.polymorph.ui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * QRCode's encoder draws the web's symbols module for module
 * (`packages/engine/src/qr/encode.ts`), so it is held to the web's own golden
 * tests (`packages/engine/src/qr/encode.test.ts`), ported here: the same
 * payloads, the same FNV-1a digest over the modules, and the same `mask:digest`
 * per version and correction level, which pin matrices an independent
 * reference encoder matches. A symbol one module wrong in a correction block
 * still looks right and does not scan, so checking by eye proves nothing; a
 * change to the tables, the interleave, the zigzag or the format bits fails a
 * named cell. The capacity and growth cases are the web's too.
 */
class QRCodeEncoderTest {
    /** The web's `digest`: FNV-1a over the modules, row by row, as eight hexadecimal digits. */
    private fun digest(symbol: PMQREncoder.Symbol): String {
        var hash = FNV_OFFSET.toInt()
        for (row in symbol.modules) {
            for (module in row) {
                hash = hash xor (if (module) 1 else 0)
                hash *= FNV_PRIME
            }
        }
        return (hash.toLong() and UNSIGNED).toString(HEX).padStart(DIGITS, '0')
    }

    /** The web's `payloadFor`: a version filled nearly to capacity, exercising padding, block splitting and interleave. */
    private fun payloadFor(version: Int, level: PMQRCodeErrorCorrection): String {
        val length = maxOf(1, PMQREncoder.byteCapacity(version, level) - version % 3)
        return buildString { for (i in 0 until length) append((FIRST + (i * 7 + version) % SPREAD).toChar()) }
    }

    private fun level(letter: Char) = PMQRCodeErrorCorrection.entries.first { it.value == letter.toString() }

    @Test
    fun drawsTheWebsGoldenSymbols() {
        for ((cell, expected) in GOLDEN) {
            val version = cell.dropLast(1).toInt()
            val level = level(cell.last())
            val symbol = assertNotNull(PMQREncoder.symbol(payloadFor(version, level), level, minVersion = version), cell)
            assertEquals(version, symbol.version, "$cell: version")
            assertEquals(version * 4 + 17, symbol.size, "$cell: size")
            assertEquals(expected, "${symbol.mask}:${digest(symbol)}", "$cell: mask and modules")
        }
    }

    @Test
    fun drawsTheSymbolAPersonCanCheckByEye() {
        val symbol = assertNotNull(PMQREncoder.symbol("polymorph", PMQRCodeErrorCorrection.M))
        assertEquals(1, symbol.version)
        assertEquals(1, symbol.mask)
        assertEquals(POLYMORPH, symbol.modules.map { row -> row.joinToString("") { if (it) "#" else "." } })
    }

    @Test
    fun matchesTheStandardsByteCapacityAtTheCorners() {
        val at = { version: Int -> "LMQH".map { PMQREncoder.byteCapacity(version, level(it)) } }
        assertEquals(listOf(17, 14, 11, 7), at(1))
        assertEquals(listOf(230, 180, 130, 98), at(9))
        // Version 10 spends a second byte on the count field.
        assertEquals(listOf(271, 213, 151, 119), at(10))
        assertEquals(listOf(2953, 2331, 1663, 1273), at(40))
    }

    @Test
    fun growsTheVersionToFitAndNoFurther() {
        val m = PMQRCodeErrorCorrection.M
        assertEquals(1, PMQREncoder.symbol("x".repeat(14), m)?.version)
        assertEquals(2, PMQREncoder.symbol("x".repeat(15), m)?.version)
        // Seven characters, fourteen bytes of UTF-8: the last payload version 1 at M holds.
        assertEquals(1, PMQREncoder.symbol("é".repeat(7), m)?.version)
        assertEquals(2, PMQREncoder.symbol("é".repeat(8), m)?.version)
    }

    @Test
    fun refusesWhatNoSymbolHolds() {
        assertNull(PMQREncoder.symbol("x".repeat(2954), PMQRCodeErrorCorrection.L))
        assertEquals(40, PMQREncoder.symbol("x".repeat(2953), PMQRCodeErrorCorrection.L)?.version)
    }

    private companion object {
        const val FNV_OFFSET = 0x811c9dc5L
        const val FNV_PRIME = 0x01000193
        const val UNSIGNED = 0xffffffffL
        const val HEX = 16
        const val DIGITS = 8

        /** The payload's characters: printable ASCII from `!`, ninety of them. */
        const val FIRST = 33
        const val SPREAD = 90

        /** The web's `GOLDEN`: `mask:digest` per version and level. */
        val GOLDEN = linkedMapOf(
            // 1: no alignment pattern; 2: the first one; 6: the last version without version information.
            "1L" to "4:cdd18f0f", "1M" to "4:f5a934f3", "1Q" to "2:88395e25", "1H" to "6:791876bb",
            "2L" to "3:6088b4a5", "2M" to "4:ded86431", "2Q" to "0:b284a9e3", "2H" to "2:01694b61",
            "6L" to "7:e746007f", "6M" to "3:0ed7342b", "6Q" to "5:93fff376", "6H" to "6:57c17697",
            // 7: version information appears; 10: the count field widens to sixteen bits.
            "7L" to "3:a27b4a83", "7M" to "6:c3bb2daf", "7Q" to "3:453b55fb", "7H" to "2:b0c38a31",
            "10L" to "3:ca88fecd", "10M" to "2:d0fb1681", "10Q" to "3:f6c34f29", "10H" to "6:421ed7b5",
            // 14, 21, 27: long and short blocks mixed; 32: the one irregular alignment step; 40: the ceiling.
            "14L" to "2:7dce3a7b", "14M" to "2:5f46efe5", "14Q" to "3:bf9a20ff", "14H" to "6:d8bec7e3",
            "21L" to "2:543c9d39", "21M" to "2:236ffe61", "21Q" to "6:0d88b27b", "21H" to "4:259caed3",
            "27L" to "4:d45f8b2d", "27M" to "2:c7847ecd", "27Q" to "5:985338c0", "27H" to "3:769cae71",
            "32L" to "2:3d6cb78c", "32M" to "4:2e456a4c", "32Q" to "4:be81be98", "32H" to "1:dc08dc78",
            "40L" to "2:bf1aa0c9", "40M" to "2:18912c27", "40Q" to "5:3decf70b", "40H" to "5:cc7d5707",
        )

        /** The web's whole symbol for "polymorph" at M, dark modules as `#`. */
        val POLYMORPH = listOf(
            "#######.###.#.#######",
            "#.....#..##.#.#.....#",
            "#.###.#.#..##.#.###.#",
            "#.###.#...#.#.#.###.#",
            "#.###.#..####.#.###.#",
            "#.....#.#####.#.....#",
            "#######.#.#.#.#######",
            ".........##.#........",
            "#.#...##.#.....#..#.#",
            "...#.....###...####.#",
            "#.######.######.#...#",
            ".#..#...#.##.#..##...",
            ".#.#####.#.###.###.##",
            "........#.....#######",
            "#######.##...##.###.#",
            "#.....#...#.#..###.#.",
            "#.###.#..#...##....#.",
            "#.###.#...##.##.#.#..",
            "#.###.#.#..###..#.###",
            "#.....#..#.#.###.#...",
            "#######.#######..#..#",
        )
    }
}
