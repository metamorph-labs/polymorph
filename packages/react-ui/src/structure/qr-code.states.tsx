import { type ComponentStates } from '@polymorph/react'
import { QRCode } from './QRCode'

/** States fixture, from `design/components/qr-code.md`'s States table. */

/** RFC 6238's own example secret — a fixture, not a credential. */
const ENROLMENT = 'otpauth://totp/Relay:rowan@relay.test?secret=JBSWY3DPEHPK3PXP&issuer=Relay'

export const states: ComponentStates = {
  component: 'QRCode',

  entries: [
    {
      name: 'an authenticator enrolment',
      render: () => <QRCode value={ENROLMENT} label="Authenticator setup code" />,
      expect: { 'data-size': 'md', 'data-mode': 'light' },
    },
    {
      name: 'small',
      render: () => <QRCode value="https://relay.test/t/4821" label="Ticket 4821" size="sm" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'large',
      render: () => <QRCode value={ENROLMENT} label="Authenticator setup code" size="lg" />,
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'high correction — the same string, a denser symbol',
      render: () => (
        <QRCode value={ENROLMENT} label="Authenticator setup code" errorCorrection="H" />
      ),
    },
    {
      name: 'an empty value — nothing at all, because there is nothing to scan',
      render: () => <QRCode value="" label="Nothing" />,
      rendersNothing: true,
    },
  ],

  // Every state is a prop: a symbol has no hover, no focus and no substrate.
  requiredSelectors: [],
}
