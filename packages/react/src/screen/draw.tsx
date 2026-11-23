'use client'

import {
  Component,
  createContext,
  createElement,
  Fragment,
  memo,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react'

import { surfaceOf, VOCABULARY } from '@polymorph/screen/vocabulary'
import {
  materialize,
  type Materials,
  type Screen,
  type ScreenFault,
  type ScreenNode,
} from '@polymorph/screen/walk'

import { componentFor, type MemberComponent, type ScreenMembers } from './members'

/**
 * The React drawing of a screen the walk resolved (`@polymorph/screen/walk`).
 *
 * The walk decides everything a document may do. This module turns each node
 * into React: the host's component for it, with the props and children the
 * walk resolved. Three things here are React's own:
 *
 *  - **Each node keeps its element.** A node is drawn by a component keyed by
 *    its path and memoized on the node, and the walk keeps a node's object
 *    while nothing it draws changes. A longer streamed document, new data or a
 *    reader's choice redraws only the nodes it reached, and no element is
 *    mounted again, so a field keeps its text and its focus.
 *  - **Each node is drawn inside its own boundary.** A member that throws is
 *    reported with `screen.fail` and drawn as nothing, or as the fault where
 *    the host asks. The boundary tries again when the node changes.
 *  - **A node is the element a member reads.** A member that reads the element
 *    it is given (FormField reads its control's kind and clones it with an id)
 *    gets it as itself, from a component that carries the member's
 *    `controlKind` and passes every prop the clone adds on to the member.
 */

/**
 * Why a node, or a value where something is drawn, is drawn as a fault:
 *
 *  - `unknown`: the vocabulary has no component of that name.
 *  - `refused`: the vocabulary has it, and the host does not allow it, or React
 *    does not draw it.
 *  - `missing`: the members the screen is drawn with have no component for it.
 *  - `threw`: the member threw while it rendered.
 *  - `value`: a structured object where something is drawn, which is data.
 */
export type FaultCause = 'unknown' | 'refused' | 'missing' | 'threw' | 'value'

/** How a screen is drawn, beside the screen itself. */
export interface DrawOptions {
  /** The components to draw with (`ScreenMembers`). */
  members: ScreenMembers
  /**
   * What a node that cannot be drawn shows: nothing (`hidden`, the default),
   * or the fault in its place (`inline`), drawn by `renderFault`. Every fault
   * reaches the screen's `onFault` either way.
   */
  faults?: 'hidden' | 'inline'
  /** Draws a fault in place, when `faults` is `inline`. Its words as text when absent. */
  renderFault?: (fault: ScreenFault, cause: FaultCause) => ReactNode
  /**
   * Draws a binding where something is drawn (a child), given the binding's
   * path and its value. The value itself when absent. A design tool draws the
   * binding's name here.
   */
  renderBinding?: (path: string, value: unknown) => ReactNode
  /**
   * Wraps the drawing of every node, a fault drawn in place among them. A
   * design tool draws its selection around each element here.
   */
  decorate?: (drawn: ReactNode, node: ScreenNode) => ReactNode
}

export interface ScreenDrawingProps extends DrawOptions {
  /** The screen to draw: one `useScreen` keeps, or one made with `createScreen`. */
  screen: Screen
}

/** What every node of one drawing reads. It changes only when an option does, or the stream ends. */
interface Drawing {
  screen: Screen
  members: ScreenMembers
  /** Whether more of the document is to come (`screen.streaming`). */
  streaming: boolean
  /** Draws a fault in place, or `null` when faults are hidden. */
  fault: ((fault: ScreenFault, cause: FaultCause) => ReactNode) | null
  binding: ((path: string, value: unknown) => ReactNode) | undefined
  decorate: ((drawn: ReactNode, node: ScreenNode) => ReactNode) | undefined
}

const DrawingContext = createContext<Drawing | null>(null)

function useDrawing(): Drawing {
  const drawing = useContext(DrawingContext)
  if (drawing === null) throw new Error('A screen node is drawn only inside a ScreenDrawing.')
  return drawing
}

/** A fault in place when the host names no way to draw one: its words, as text. */
function faultText(fault: ScreenFault): ReactNode {
  return (
    <span data-screen-fault="">
      {fault.component === undefined ? fault.message : `${fault.component}: ${fault.message}`}
    </span>
  )
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** The props every node component takes: its node, and whatever a member that clones it adds. */
interface NodeProps {
  screenNode: ScreenNode
  [given: string]: unknown
}

/* -------------------------------------------------------------------------- */
/* A node's props and children                                                */
/* -------------------------------------------------------------------------- */

/**
 * The materials a node's values are drawn with. A binding or a fault drawn in
 * a list is keyed by its place among them, since it has no path of its own,
 * so a list that holds one beside a node needs no other key.
 */
function materialsFor(drawing: Drawing, at: string): Materials<ReactElement> {
  let count = 0
  const keyed = (drawn: ReactNode): ReactNode => {
    count += 1
    return <Fragment key={`${at}#${count}`}>{drawn}</Fragment>
  }
  const { binding, fault } = drawing
  return {
    node: (node) => elementFor(node, drawing),
    ...(binding === undefined
      ? {}
      : { binding: (path: string, value: unknown) => keyed(binding(path, value)) }),
    fault: (found) => (fault === null ? null : keyed(fault(found, 'value'))),
  }
}

/**
 * Whether a component's children are passed as a list, however many there
 * are. A member whose children are nodes (`ReactNode`) takes a list, so the
 * place its children are drawn in stays one list as a streamed document adds
 * a second child, and React keeps the first child's element. Drawn as itself,
 * then in a list beside a second, it would be mounted again.
 *
 * A member whose children are one element (FormField's control) or text
 * (Heading) reads them, so it is given a single child as itself, as JSX gives
 * it: FormField clones its control, and Heading reads its words.
 */
const LISTED = new Map<string, boolean>()

function listsChildren(component: string): boolean {
  let listed = LISTED.get(component)
  if (listed === undefined) {
    const type = surfaceOf(VOCABULARY, component)?.props.find(
      (prop) => prop.name === 'children',
    )?.type
    listed = type === undefined || /\bReactNode\b/.test(type)
    LISTED.set(component, listed)
  }
  return listed
}

/** Each component's required props, other than its children, by name. */
const REQUIRED = new Map<string, readonly string[]>()

/**
 * Whether a node waits for a required prop the document has not written yet.
 * While a document streams, such a node is not drawn: a member drawn without a
 * prop it requires (a Select with no options) would throw, or show a half of
 * itself, on each step until the prop arrives. It is drawn, once, when the
 * prop has arrived. A callback the walk stubs and a prop bound to the host's
 * data count as arrived. Once the document is whole every node is drawn, and a
 * member that throws then is a fault.
 */
function waits(node: ScreenNode): boolean {
  let required = REQUIRED.get(node.component)
  if (required === undefined) {
    required = (surfaceOf(VOCABULARY, node.component)?.props ?? [])
      .filter((prop) => !prop.optional && prop.name !== 'children')
      .map((prop) => prop.name)
    REQUIRED.set(node.component, required)
  }
  // A document still being written may hold anything where an element's props go.
  const written: unknown = node.element.props
  const wrote = (name: string) =>
    typeof written === 'object' &&
    written !== null &&
    Object.prototype.hasOwnProperty.call(written, name)
  return required.some((name) => !(name in node.props) && !wrote(name))
}

/** What a member is given: each prop the walk resolved, and its children. */
function memberProps(node: ScreenNode, drawing: Drawing): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const [name, drawn] of Object.entries(node.props)) {
    props[name] = materialize(drawn, materialsFor(drawing, `${node.path}.props.${name}`))
  }
  if (node.children.length > 0) {
    const materials = materialsFor(drawing, `${node.path}.children`)
    const children = node.children.map((child) => materialize(child, materials))
    props['children'] =
      children.length === 1 && !listsChildren(node.component) ? children[0] : children
  }
  return props
}

/* -------------------------------------------------------------------------- */
/* The boundary around each node                                              */
/* -------------------------------------------------------------------------- */

interface BoundaryProps {
  node: ScreenNode
  drawing: Drawing
  children: ReactNode
}

interface BoundaryState {
  /** The node the state is about. A new node is a new attempt. */
  node: ScreenNode
  /** What the member threw, or `null`. */
  failed: string | null
  /** Whether the document was still streaming at the last render. */
  streaming: boolean
}

/**
 * One node that throws draws as nothing, or as its fault, and the rest of the
 * screen is drawn.
 *
 * A member may throw while a document streams because a prop it needs has not
 * arrived. That is no fault, as a missing prop is none while the document
 * streams, so it is not reported and nothing is drawn in its place. The node
 * changes when the prop arrives, which is a new attempt, and a node that threw
 * while the document streamed is tried again once it is whole.
 */
class NodeBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = {
    node: this.props.node,
    failed: null,
    streaming: this.props.drawing.streaming,
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState,
  ): Partial<BoundaryState> | null {
    const { streaming } = props.drawing
    const again =
      props.node !== state.node || (state.failed !== null && state.streaming && !streaming)
    if (again) return { node: props.node, failed: null, streaming }
    return state.streaming === streaming ? null : { streaming }
  }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { failed: messageOf(error) }
  }

  override componentDidCatch(error: unknown) {
    const { node, drawing } = this.props
    if (drawing.streaming) return
    drawing.screen.fail({ path: node.path, component: node.component, message: messageOf(error) })
  }

  override render(): ReactNode {
    const { node, drawing, children } = this.props
    if (this.state.failed === null) return children
    if (drawing.fault === null || drawing.streaming) return null
    return drawing.fault(
      { path: node.path, component: node.component, message: this.state.failed },
      'threw',
    )
  }
}

/* -------------------------------------------------------------------------- */
/* The component of each node                                                 */
/* -------------------------------------------------------------------------- */

/** A node's drawing, wrapped by the host's `decorate`. Nothing drawn is not wrapped. */
function decorated(drawn: ReactNode, node: ScreenNode, drawing: Drawing): ReactNode {
  if (drawn === null || drawn === undefined || drawing.decorate === undefined) return drawn
  return drawing.decorate(drawn, node)
}

/** The component that draws one member's nodes, made once for each member. */
const NODE_COMPONENTS = new WeakMap<object, ComponentType<NodeProps>>()

/** React's mark on a component `lazy` made. */
const LAZY = Symbol.for('react.lazy')

const isLazy = (Member: MemberComponent): boolean =>
  typeof Member === 'object' && (Member as { $$typeof?: unknown }).$$typeof === LAZY

function nodeComponentFor(Member: MemberComponent): ComponentType<NodeProps> {
  const known = NODE_COMPONENTS.get(Member)
  if (known !== undefined) return known
  const lazy = isLazy(Member)

  function DrawnMember({ screenNode: node, ...given }: NodeProps): ReactNode {
    const drawing = useDrawing()
    const props = useMemo(() => memberProps(node, drawing), [node, drawing])
    if (drawing.streaming && waits(node)) return null
    // What a member that clones this element adds (an id, a ref, `aria-describedby`) reaches the
    // member over what the document gave, as a clone of the member's own element would.
    const member = <Member {...props} {...given} />
    return decorated(
      <NodeBoundary node={node} drawing={drawing}>
        {/* A lazy member suspends only its own node while it loads, so nothing drawn before it
            is hidden again. */}
        {lazy ? <Suspense fallback={null}>{member}</Suspense> : member}
      </NodeBoundary>,
      node,
      drawing,
    )
  }

  const name = (Member as { displayName?: string }).displayName ?? Member.name
  DrawnMember.displayName = `Screen(${name === '' ? 'member' : name})`
  const drawn = memo(DrawnMember)
  // FormField reads its control's kind from the element's type, so the node's type says it.
  const kind = (Member as { controlKind?: unknown }).controlKind
  if (kind !== undefined) Object.assign(drawn, { controlKind: kind })
  NODE_COMPONENTS.set(Member, drawn)
  return drawn
}

/** A node the walk could not resolve: a name the vocabulary lacks, or a member the host does not allow. */
const FaultNode = memo(function FaultNode({ screenNode: node }: NodeProps): ReactNode {
  const drawing = useDrawing()
  if (drawing.fault === null || node.fault === null) return null
  return decorated(
    drawing.fault(node.fault, node.member === null ? 'unknown' : 'refused'),
    node,
    drawing,
  )
})

/** A node whose member the host's components lack. It is reported, as a member that throws is. */
const MissingNode = memo(function MissingNode({ screenNode: node }: NodeProps): ReactNode {
  const drawing = useDrawing()
  const fault = useMemo<ScreenFault>(
    () => ({
      path: node.path,
      component: node.component,
      message: `\`${node.component}\` has no component among the members this screen is drawn with`,
    }),
    [node],
  )
  const { screen } = drawing
  useEffect(() => {
    screen.fail(fault)
  }, [screen, fault])
  if (drawing.fault === null) return null
  return decorated(drawing.fault(fault, 'missing'), node, drawing)
})

/** The element that draws a node, keyed by its path. */
function elementFor(node: ScreenNode, drawing: Drawing): ReactElement {
  let type: ComponentType<NodeProps>
  if (node.fault !== null) type = FaultNode
  else {
    const Member = componentFor(drawing.members, node.component)
    type = Member === null ? MissingNode : nodeComponentFor(Member)
  }
  return createElement(type, { key: node.path, screenNode: node })
}

/* -------------------------------------------------------------------------- */
/* The drawing                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Draws a screen: its root node and everything inside it, redrawn when the
 * screen changes. The screen is made and kept elsewhere: by `useScreen`, or by
 * `createScreen` for a page that draws one document once. `ScreenView` does
 * both.
 *
 * Pass `members`, `renderFault`, `renderBinding` and `decorate` as values that
 * keep their identity between renders: a new one redraws every node.
 */
export function ScreenDrawing({
  screen,
  members,
  faults = 'hidden',
  renderFault,
  renderBinding,
  decorate,
}: ScreenDrawingProps): ReactNode {
  const root = useSyncExternalStore(
    screen.subscribe,
    () => screen.root,
    () => screen.root,
  )
  const streaming = useSyncExternalStore(
    screen.subscribe,
    () => screen.streaming,
    () => screen.streaming,
  )
  const drawing = useMemo<Drawing>(
    () => ({
      screen,
      members,
      streaming,
      fault: faults === 'inline' ? (renderFault ?? faultText) : null,
      binding: renderBinding,
      decorate,
    }),
    [screen, members, streaming, faults, renderFault, renderBinding, decorate],
  )
  if (root === null) return null
  return <DrawingContext value={drawing}>{elementFor(root, drawing)}</DrawingContext>
}
