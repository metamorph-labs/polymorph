/** A miniature `@polymorph/react-ui` — just enough public surface to diff against specs. */

export type WidgetTone = 'neutral' | 'danger'

export interface WidgetProps {
  label: string
  tone?: WidgetTone
  /** Ships, and `widget.md` names no such prop. */
  size?: 'sm' | 'md'
  children?: unknown
}

export interface PanelRegion {
  key: string
  span?: number
}

export interface PanelProps {
  title: string
  regions: PanelRegion[]
  /** Ships, and `panel.md`'s fence names no such prop. */
  dense?: boolean
}

export interface WidgetItemProps {
  label: string
  /** Ships, and the `Widget.Item` section names no such prop. */
  selected?: boolean
}

function WidgetRoot(props: WidgetProps): WidgetProps {
  return props
}

function Item(props: WidgetItemProps): WidgetItemProps {
  return props
}

/**
 * A compound member, as `Table` is: its part is a property of its export.
 * `type` stands for a wrapper's own callable (`React.memo` gives one), which is
 * not a part because it is not named as a component is.
 */
export const Widget = Object.assign(WidgetRoot, { Item, type: WidgetRoot })

/** No spec file at all — the audit must say so rather than skip it. */
export interface GhostProps {
  hidden?: boolean
}
