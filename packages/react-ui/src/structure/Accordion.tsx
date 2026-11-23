'use client'

import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { useRef, useState, type ReactNode } from 'react'

import { Icon, memberAttr, useAgentMember, useDirection } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/accordion.module.css'
import { useKeptRegion } from './kept-region'

/**
 * Disclosure list (`design/components/accordion.md`).
 *
 * `@radix-ui/react-accordion` supplies the behaviour. It emits `data-state` and
 * `data-disabled` on the parts, so no translation layer is needed, and publishes
 * the measured height as `--radix-accordion-content-height`.
 *
 * Two decisions from the spec:
 *
 *  - **Items are data**, so call sites cannot invent their own headers. An
 *    accordion that needs arbitrary headers is a different design. Flag it
 *    rather than adding a children API to this member.
 *  - **The header is a real heading** (`<h3>`, or `<h4>` deeper in a
 *    document), so heading navigation reads the list as an outline.
 *
 * The type of `value` follows `type`, so a `multiple` accordion given one string
 * is a type error rather than a Radix runtime warning.
 *
 * The member holds the open items itself, seeded from `defaultValue`, and Radix
 * is always controlled with the caller's `value` or that state. So an agent's
 * expand or collapse reaches the list through the same setter a press does,
 * whether or not the caller controls the value.
 *
 * With `keepMounted`, a closed item's content stays in the document, hidden
 * (`kept-region.ts`), so a page's server markup carries every answer.
 */

export interface AccordionItem {
  value: string
  label: string
  content: ReactNode
  disabled?: boolean
}

export type AccordionHeadingLevel = 3 | 4

interface AccordionCommon {
  items: AccordionItem[]
  headingLevel?: AccordionHeadingLevel
  /**
   * Keeps a closed item's content in the document and `hidden`, so a page's
   * server markup carries it and its state survives a close. Without it the
   * React member leaves closed content out. The generated members keep it in
   * every case.
   */
  keepMounted?: boolean
}

interface SingleAccordionProps extends AccordionCommon {
  type?: 'single'
  /** The open item may be closed again, leaving the list shut. */
  collapsible?: boolean
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

interface MultipleAccordionProps extends AccordionCommon {
  type: 'multiple'
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
}

export type AccordionProps = SingleAccordionProps | MultipleAccordionProps

/** One item's region, which holds its own presence when it is kept in the document. */
function AccordionRegion({
  open,
  keepMounted,
  children,
}: {
  open: boolean
  keepMounted: boolean
  children: ReactNode
}) {
  const region = useRef<HTMLDivElement>(null)
  const hidden = useKeptRegion(region, open, keepMounted)
  return (
    // The inner wrapper holds the padding, because the content box animates
    // its height and padding on that box would animate too, and the text
    // would slide against the rule.
    <AccordionPrimitive.Content
      ref={region}
      className={styles.content}
      data-accordion-part="region"
      forceMount={keepMounted || undefined}
      // Spread conditionally rather than passed as `undefined`. Radix writes its
      // own `hidden` before spreading ours, and an explicit `hidden: undefined`
      // would remove the hiding the default path relies on.
      {...(hidden === undefined ? {} : { hidden })}
    >
      <div className={styles.inner}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

export function Accordion(props: AccordionProps) {
  // The document's direction, which Radix would otherwise take to be left-to-right.
  const dir = useDirection()
  const { items, headingLevel = 3, keepMounted = false } = props
  const multiple = props.type === 'multiple'
  const collapsible = multiple || (props.collapsible ?? true)

  const [held, setHeld] = useState<string | string[]>(props.defaultValue ?? [])
  const current = props.value ?? held
  // The open items as a list in both types; a single accordion's empty string is none.
  const open = Array.isArray(current) ? current : current === '' ? [] : [current]

  /** Sets the open items, as a press does: the held list, then the caller's handler. */
  function commit(next: string[]) {
    setHeld(next)
    if (props.type === 'multiple') props.onValueChange?.(next)
    else props.onValueChange?.(next[0] ?? '')
  }

  // The spec's `agent` fence. An item's id is its `value`. A single accordion's expand replaces
  // the open item, and one that is not collapsible refuses to close its open item, as Radix
  // refuses a press on it.
  const rootRef = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'Accordion',
    element: () => rootRef.current,
    state: () => ({
      value: open,
      items: items.map((item) => ({
        id: item.value,
        label: item.label,
        ...(item.disabled === true ? { disabled: true } : {}),
      })),
    }),
    actions: {
      expand: {
        argument: 'id',
        run: (id) => {
          if (open.includes(id)) return
          commit(multiple ? [...open, id] : [id])
        },
      },
      collapse: {
        argument: 'id',
        run: (id) => {
          if (!open.includes(id)) return
          if (!collapsible) {
            throw new Error('This accordion keeps one item open; expand another item instead.')
          }
          commit(open.filter((value) => value !== id))
        },
      },
    },
  })

  // A real heading element rather than `role` and `aria-level`, because
  // heading-navigation shortcuts find a real `<h3>`.
  const Heading = headingLevel === 4 ? 'h4' : 'h3'

  const rows = items.map((item) => (
    <AccordionPrimitive.Item
      key={item.value}
      value={item.value}
      disabled={item.disabled}
      className={styles.item}
    >
      <AccordionPrimitive.Header asChild>
        <Heading className={styles.header}>
          {/* `data-accordion-part` marks the trigger and the region, so the
              conformance runner locates them at any heading level. */}
          <AccordionPrimitive.Trigger className={styles.trigger} data-accordion-part="trigger">
            <span className={styles.label}>{item.label}</span>
            {/* Decorative. `aria-expanded` announces the open state, so a named
                glyph would announce it twice. */}
            <span className={styles.chevron}>
              <Icon name="down" />
            </span>
          </AccordionPrimitive.Trigger>
        </Heading>
      </AccordionPrimitive.Header>

      <AccordionRegion open={open.includes(item.value)} keepMounted={keepMounted}>
        {item.content}
      </AccordionRegion>
    </AccordionPrimitive.Item>
  ))

  // Two branches, not one spread: Radix also types its root as a union on
  // `type`, and bridging them would need an unchecked cast.
  return props.type === 'multiple' ? (
    <AccordionPrimitive.Root
      ref={rootRef}
      type="multiple"
      dir={dir}
      className={styles.root}
      value={open}
      onValueChange={commit}
      {...memberAttr('Accordion')}
    >
      {rows}
    </AccordionPrimitive.Root>
  ) : (
    <AccordionPrimitive.Root
      ref={rootRef}
      type="single"
      dir={dir}
      className={styles.root}
      collapsible={collapsible}
      value={open[0] ?? ''}
      onValueChange={(value) => commit(value === '' ? [] : [value])}
      {...memberAttr('Accordion')}
    >
      {rows}
    </AccordionPrimitive.Root>
  )
}
