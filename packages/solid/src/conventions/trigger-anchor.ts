import { anchorProps as engineAnchorProps } from '@polymorph/engine'

/**
 * The anchor's own props, as the engine's `anchorProps` makes them, with the
 * focus handlers named the way Solid spells them. Zag's Solid normalizer writes
 * a machine's focus handlers as `onFocusIn` and `onFocusOut`, and a getter
 * that writes `onFocus` or `onBlur` is moved to them, because the control's
 * focus reaches the anchor as `focusin` and `focusout`.
 */
export const anchorProps = (props: object): Record<string, unknown> =>
  engineAnchorProps(props, { focusIn: 'onFocusIn', focusOut: 'onFocusOut' })
