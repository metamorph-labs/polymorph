'use client'

import { useMemo } from 'react'

import {
  DATA_ATTRS,
  memberAttr,
  QR_QUIET_ZONE,
  type QrErrorCorrection,
  qrPath,
  qrSymbol,
  useDevWarning,
} from '@polymorph/react'
import styles from '@polymorph/recipes/structure/qr-code.module.css'

/**
 * A string drawn as a scannable QR Code symbol (`design/components/qr-code.md`).
 * For an authenticator's `otpauth://` URI, a pairing link or a ticket. Drawn in
 * the browser from `value`, so an enrolment secret never reaches an image
 * server or a third party.
 *
 * *Not* an image (a symbol rendered elsewhere is an app-owned `<img>`) and not a
 * chart (no scale, axis or datum). It shares the chart tier's one licence: its
 * marks are computed geometry, so it draws its own SVG
 * (`packages/rules/src/containment.ts`).
 *
 * Always dark on light, because scanners read dark modules on a light field and
 * support for inverted symbols varies. The root scopes itself to the pairing's
 * **light** derivation and uses `text.primary` on `bg.surface`, the theme's own
 * law-checked pair, with no colours of its own.
 */

export type QRCodeSize = 'sm' | 'md' | 'lg'

export type QRCodeErrorCorrection = QrErrorCorrection

export interface QRCodeProps {
  /** The content, encoded as UTF-8; always controlled, as the symbol is a pure function of it. */
  value: string
  /**
   * The accessible name: what the symbol is *for* ("Authenticator setup code"),
   * never its contents. Required, because the symbol is noise to a reader who
   * cannot scan it.
   */
  label: string
  size?: QRCodeSize
  /**
   * Damage tolerance: `L` 7%, `M` 15%, `Q` 25%, `H` 30%. More correction means a
   * denser symbol, the worse trade on a screen: displays do not get scuffed, and
   * dense symbols scan worse at arm's length. `M` is the screen default.
   */
  errorCorrection?: QRCodeErrorCorrection
}

export function QRCode({ value, label, size = 'md', errorCorrection = 'M' }: QRCodeProps) {
  // The engine's encoder, which every framework's QRCode draws: `null` past version 40, where a
  // payload has no valid symbol and a truncated one would scan as a different string.
  const symbol = useMemo(() => qrSymbol(value, errorCorrection), [value, errorCorrection])

  useDevWarning(
    symbol === null,
    `QRCode: \`value\` (${value.length} characters) does not fit a QR symbol at correction ` +
      `level ${errorCorrection}. Nothing was rendered.`,
  )
  useDevWarning(value === '', 'QRCode: `value` is empty. Nothing was rendered.')

  // Same rule as RelativeTime: with no valid rendering, render nothing, rather
  // than a placeholder that looks like a symbol and scans as nothing.
  if (symbol === null || value === '') return null

  const extent = symbol.size + QR_QUIET_ZONE * 2

  return (
    <svg
      className={styles.symbol}
      viewBox={`0 0 ${extent} ${extent}`}
      role="img"
      aria-label={label}
      // Modules are pixels, not curves. Anti-aliasing a module edge can make a
      // scan fail.
      shapeRendering="crispEdges"
      data-size={size}
      {...{ [DATA_ATTRS.mode]: 'light' }}
      {...memberAttr('QRCode')}
    >
      <rect className={styles.paper} width={extent} height={extent} />
      <path className={styles.ink} d={qrPath(symbol, QR_QUIET_ZONE)} />
    </svg>
  )
}
