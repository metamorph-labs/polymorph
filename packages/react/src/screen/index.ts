/**
 * `@polymorph/react/screen`: a screen a model writes, drawn in React at run
 * time.
 *
 * An agent inside a product writes a `polymorph-screen/1` document, and the
 * host draws it at once with its own members, in its own theme, as the
 * document streams in. What the person does with it reaches the host as data:
 * `{ name, args, values }` for each action. Everything a document may do is
 * decided by the run-time core every renderer shares (`@polymorph/screen`);
 * this entry turns what the core resolves into React.
 *
 * It is a subpath of its own, so an application that imports the foundation's
 * root loads none of it. The foundation knows no member: the host passes the
 * components it draws with (`import * as members from '@polymorph/react-ui'`).
 *
 *  - `ScreenView`: draws a document, or a model's answer as text while it
 *    streams.
 *  - `useScreen` and `ScreenDrawing`: the two halves of `ScreenView`, for a host
 *    that reads the screen's values or draws it in a place of its own.
 *  - `componentFor`: the component a name resolves to among the host's members.
 */

export { ScreenDrawing } from './draw'
export type { DrawOptions, FaultCause, ScreenDrawingProps } from './draw'

export { componentFor } from './members'
export type { MemberComponent, ScreenMembers } from './members'

export { ScreenView, useScreen } from './view'
export type { ScreenSource, ScreenViewProps } from './view'

export { parsePartial } from '@polymorph/screen/partial'
export type { PartialDocument } from '@polymorph/screen/partial'
export type { Drawn, Screen, ScreenAction, ScreenFault, ScreenNode } from '@polymorph/screen/walk'
