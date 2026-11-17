import { cond, describeMember, el, identity, lit } from '../dsl'

/** RFC 6238's own example secret: a fixture, not a credential. */
const ENROLMENT = 'otpauth://totp/Relay:rowan@relay.test?secret=JBSWY3DPEHPK3PXP&issuer=Relay'

/**
 * QRCode (`design/components/qr-code.md`): a string drawn as a scannable QR
 * Code symbol, in the browser, so an enrolment secret never reaches an image
 * server. The symbol is the engine's encoder (`qrSymbol`, `qrPath`), which the
 * React member draws too, so both draw the same modules with the same quiet
 * zone. Always dark on light: the root scopes itself to the pairing's light
 * derivation, and the recipe paints the theme's own text-on-surface pair. A
 * value with no symbol (empty, or past version 40) renders nothing, with a
 * development warning.
 */
export default describeMember({
  member: 'QRCode',
  dir: 'structure',
  recipe: 'structure/qr-code',
  types: {
    QRCodeSize: "NonNullable<QRCodeProps['size']>",
    QRCodeErrorCorrection: "NonNullable<QRCodeProps['errorCorrection']>",
  },
  defaults: { size: lit('md'), errorCorrection: lit('M') },
  derived: {
    symbol: 'qrSymbol(value, errorCorrection)',
    extent: 'symbol === null ? 0 : symbol.size + QR_QUIET_ZONE * 2',
    ink: "symbol === null ? '' : qrPath(symbol, QR_QUIET_ZONE)",
  },
  effects: [
    {
      watch: '[symbol, errorCorrection]',
      run: 'devWarning(symbol === null, `QRCode: \\`value\\` (${value.length} characters) does not fit a QR symbol at correction level ${errorCorrection}. Nothing was rendered.`)',
    },
    {
      watch: 'value',
      run: "devWarning(value === '', 'QRCode: `value` is empty. Nothing was rendered.')",
    },
  ],
  template: cond("symbol !== null && value !== ''", [
    el(
      'svg',
      {
        part: 'symbol',
        class: ['symbol'],
        attrs: {
          viewBox: '`0 0 ${extent} ${extent}`',
          role: lit('img'),
          'aria-label': 'label',
          // Modules are pixels, not curves: an anti-aliased module edge can fail a scan.
          'shape-rendering': lit('crispEdges'),
          'data-size': 'size',
          'data-mode': lit('light'),
          ...identity('QRCode'),
        },
      },
      [
        el('rect', {
          part: 'paper',
          class: ['paper'],
          attrs: { width: 'extent', height: 'extent' },
        }),
        el('path', { part: 'ink', class: ['ink'], attrs: { d: 'ink' } }),
      ],
    ),
  ]),
  states: [
    {
      name: 'an authenticator enrolment',
      props: { value: ENROLMENT, label: 'Authenticator setup code' },
      expect: { 'data-size': 'md', 'data-mode': 'light' },
    },
    {
      name: 'small',
      props: { value: 'https://relay.test/t/4821', label: 'Ticket 4821', size: 'sm' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'large',
      props: { value: ENROLMENT, label: 'Authenticator setup code', size: 'lg' },
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'high correction — the same string, a denser symbol',
      props: { value: ENROLMENT, label: 'Authenticator setup code', errorCorrection: 'H' },
    },
    {
      name: 'an empty value — nothing at all, because there is nothing to scan',
      props: { value: '', label: 'Nothing' },
      rendersNothing: true,
    },
  ],
})
