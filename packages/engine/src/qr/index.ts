/**
 * `@polymorph/engine/qr`: the QR Code encoder (`design/components/qr-code.md`).
 *
 * A subpath, not a root export, because the encoder's tables are a few
 * kilobytes that only QRCode needs: an application that imports the root for
 * its theme or conventions does not load them. The foundations re-export it,
 * so a member reaches it through its framework's foundation.
 */
export { encodeQr, QR_QUIET_ZONE, QrCapacityError, qrPath, qrSymbol } from './encode'
export type { QrEncodeOptions, QrErrorCorrection, QrSymbol } from './encode'
