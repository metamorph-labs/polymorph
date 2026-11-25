'use client'

import * as TabsPrimitive from '@radix-ui/react-tabs'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  Icon,
  memberAttr,
  useAgentMember,
  useDirection,
  revealInline,
  type IconRole,
} from '@polymorph/react'
import { MotionIndicator } from '@polymorph/react/motion'
import { Badge } from '../structure/Badge'
import styles from '@polymorph/recipes/overlays/tabs.module.css'

/**
 * Tabs' root and its panel, which need a browser: Radix's tabs, the measured
 * indicator and the strip's scrolling. `Tabs.tsx` is the member: it attaches the
 * panel to the root in a module a server can evaluate.
 */

export interface TabDescriptor {
  value: string
  label: string
  icon?: IconRole
  count?: number
  disabled?: boolean
}

export type TabsOrientation = 'horizontal' | 'vertical'

export interface TabsProps {
  tabs: TabDescriptor[]
  /**
   * Vertical is the same component on its side, with the rule down the start
   * edge instead of along the bottom. Use it when labels are long enough that a
   * horizontal strip would wrap, because wrapped tabs no longer read as peers.
   */
  orientation?: TabsOrientation
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  /**
   * Keeps inactive panels mounted and `hidden` (Radix `forceMount`), so a form
   * being edited or an embedded player survives a tab switch. The default
   * unmounts them, so the common case does not pay to mount everything.
   */
  keepMounted?: boolean
  /** One `Tabs.Content` per tab. */
  children: ReactNode
}

export interface TabsContentProps {
  /** The value of the tab this panel belongs to. */
  value: string
  children: ReactNode
}

/**
 * What a panel needs that Radix does not provide: whether the strip keeps its
 * panels, and which one is current. `forceMount` disables Radix's hiding as
 * well as its unmounting, so a kept-mounted panel must hide itself from the
 * layout and the accessibility tree while staying mounted. `hidden` does both.
 */
const KeepMountedContext = createContext<{ keepMounted: boolean; current: string | undefined }>({
  keepMounted: false,
  current: undefined,
})

export function TabsContent({ value, children }: TabsContentProps) {
  const { keepMounted, current } = useContext(KeepMountedContext)

  return (
    <TabsPrimitive.Content
      className={styles.content}
      data-tabs-part="tabpanel"
      value={value}
      forceMount={keepMounted || undefined}
      // Spread conditionally rather than passed as `undefined`. Radix writes its
      // own `hidden` before spreading ours, and an explicit `hidden: undefined`
      // would remove the hiding the default path relies on.
      {...(keepMounted ? { hidden: value !== current } : {})}
    >
      {children}
    </TabsPrimitive.Content>
  )
}

export function TabsRoot({
  tabs,
  value,
  defaultValue,
  onChange,
  orientation = 'horizontal',
  keepMounted = false,
  children,
}: TabsProps) {
  // The direction of the place the member is in, which Radix would otherwise take to be
  // left-to-right.
  const root = useRef<HTMLDivElement>(null)
  const dir = useDirection(root)
  const [list, setList] = useState<HTMLElement | null>(null)
  const [rule, setRule] = useState<{ x: number; y: number; width: number; height: number }>()

  /*
   * Held here, controlled when the caller passes `value`, and Radix is always
   * controlled by it. An agent's choice goes through `commit`, which Radix's
   * uncontrolled value would not take from outside, so `onChange` reports it
   * as it reports a person's in either form. The same value lets the count
   * Badge change tone with its tab at render time. The alternative is styling
   * the Badge from this stylesheet, which would target one component's class
   * names from another's stylesheet.
   */
  const [chosen, setChosen] = useState(defaultValue ?? tabs[0]?.value)
  const current = value ?? chosen
  const commit = (next: string) => {
    setChosen(next)
    onChange?.(next)
  }

  // An agent reads the current tab and the tabs it can choose, and chooses one by its value. The
  // list names the strip: the bridge reads a name from its tabs' labels.
  useAgentMember({
    member: 'Tabs',
    element: () => list,
    state: () => ({
      value: current ?? null,
      tabs: tabs.map((tab) => ({
        id: tab.value,
        label: tab.label,
        ...(tab.disabled === true ? { disabled: true } : {}),
      })),
    }),
    actions: {
      choose: {
        argument: 'id',
        run: (id) => {
          if (id !== current) commit(id)
        },
      },
    },
  })

  /**
   * Measured from the DOM rather than tracked in state, because a tab's width
   * depends on rendered text. It changes with the type scale, the density, the
   * preset and the label, and this component is told none of those.
   */
  const measure = useCallback(() => {
    if (!list) return
    const active = list.querySelector('[data-state="active"]')
    if (!(active instanceof HTMLElement)) return
    // The rule moves along the strip's axis, so one measurement shape serves
    // both orientations and the indicator needs no orientation of its own.
    if (orientation === 'vertical') {
      setRule({ x: 0, y: active.offsetTop, width: 0, height: active.offsetHeight })
      return
    }
    // The indicator rests at the list's inline-start edge and is moved by a
    // transform, which is physical. Right to left that edge is the right one,
    // so the offset is the distance back from it. Both are offsets inside the
    // list, so they hold wherever the list is scrolled.
    const rtl = getComputedStyle(list).direction === 'rtl'
    setRule({
      x: rtl ? active.offsetLeft + active.offsetWidth - list.clientWidth : active.offsetLeft,
      y: 0,
      width: active.offsetWidth,
      height: 0,
    })
  }, [list, orientation])

  /**
   * Brings the current tab inside a strip that scrolls. `revealInline` moves
   * only the list, never the page, and does nothing in a list with nothing to
   * scroll, which a vertical strip always is.
   */
  const reveal = useCallback(
    (instant: boolean) => revealInline(list, list?.querySelector('[data-state="active"]'), instant),
    [list],
  )

  useEffect(() => {
    if (!list) return

    /*
     * The first measurement also comes from the observer, not from a call here:
     * `ResizeObserver` fires once when observation starts, so subscribing does
     * the initial read. Two other things move the rule without a selection
     * change: the list resizing on a density change, and the labels reflowing
     * inside it. The observer catches both.
     *
     * The same first callback places the current tab, and so does a later
     * change of the list's own box: a strip laid out after a time hidden, or a
     * container that changed width. Both are layout, so neither is animated. A
     * trigger's resize does not place it, because a count that grows a digit
     * would take the strip from wherever the reader had scrolled it.
     */
    const observer = new ResizeObserver((entries) => {
      measure()
      if (entries.some((entry) => entry.target === list)) reveal(true)
    })
    observer.observe(list)
    for (const trigger of list.children) observer.observe(trigger)
    return () => observer.disconnect()
  }, [list, measure, reveal])

  /*
   * A new value moves the rule and the strip, whether a press chose it or the
   * caller's `value` did. The effect runs after Radix has moved `data-state`,
   * which both read. This move is travel, so it may be smooth: `revealInline`
   * decides from the motion tokens and the reader's reduced-motion setting.
   * The ref holds the value last placed, so the effect skips its mount run,
   * which the observer above has, and a run that only a new list caused.
   */
  const placed = useRef(current)
  useEffect(() => {
    if (placed.current === current) return
    placed.current = current
    measure()
    reveal(false)
  }, [current, measure, reveal])

  return (
    <TabsPrimitive.Root
      ref={root}
      dir={dir}
      className={styles.root}
      orientation={orientation}
      // A tab strip with nothing selected shows no panel, so the first tab is
      // the fallback rather than an empty state (`chosen` starts there).
      value={current}
      onValueChange={commit}
      {...memberAttr('Tabs')}
    >
      {/* `data-tabs-part` marks the list, each tab and each panel, so the
          conformance runner locates them without reading Radix's nesting. */}
      <TabsPrimitive.List className={styles.list} ref={setList} data-tabs-part="list">
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            className={styles.trigger}
            data-tabs-part="tab"
            value={tab.value}
            disabled={tab.disabled}
          >
            {tab.icon === undefined ? null : (
              <span className={styles.glyph}>
                <Icon name={tab.icon} size="sm" />
              </span>
            )}
            <span>{tab.label}</span>
            {tab.count === undefined ? null : (
              // Neutral until the tab is active, then accent. The count belongs
              // to the tab, so it changes tone with it.
              <span className={styles.count}>
                <Badge tone={tab.value === current ? 'accent' : 'neutral'}>
                  {String(tab.count)}
                </Badge>
              </span>
            )}
          </TabsPrimitive.Trigger>
        ))}

        {rule === undefined ? null : (
          <MotionIndicator
            binding="tabs.indicator"
            className={styles.indicator}
            x={rule.x}
            y={rule.y}
            width={orientation === 'vertical' ? undefined : rule.width}
            height={orientation === 'vertical' ? rule.height : undefined}
          />
        )}
      </TabsPrimitive.List>

      <KeepMountedContext.Provider value={{ keepMounted, current }}>
        {children}
      </KeepMountedContext.Provider>
    </TabsPrimitive.Root>
  )
}
