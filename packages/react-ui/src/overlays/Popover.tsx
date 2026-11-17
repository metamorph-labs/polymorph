'use client'

import * as PopoverPrimitive from '@radix-ui/react-popover'
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/overlays/popover.module.css'
import { SheetSurface, usePhoneViewport } from './sheet'
import { TriggerAnchor } from './trigger-anchor'

/**
 * An anchored, non-modal surface for rich content
 * (`design/components/popover.md`).
 *
 * The boundary with its three siblings matters, because the wrong choice still
 * works but is slightly wrong. A text-only hint is a Tooltip, a list of
 * commands is a Menu, and anything the user must finish is a Dialog. A Popover
 * is for content the user can leave.
 *
 * `label` is required, because a panel of controls with no name has no
 * landmark, and this component must never produce one.
 *
 * **Presentation:** this member's contract is non-modal, and a sheet would
 * silently break that, so `'auto'` never becomes a sheet at any width.
 * `'sheet'` is the app's opt-in for form-like popovers. Below `30rem` the
 * surface **is modal**: the sheet presentation's scrim, focus containment,
 * Escape and scrim-press to dismiss, and an explicit `role="dialog"`. That
 * change of contract is real, so the app records the choice in the prop, once,
 * where the content is known. The vocabulary never makes it on the app's
 * behalf. Above `30rem`, `'sheet'` changes nothing.
 */

export type PopoverSide = 'top' | 'right' | 'bottom' | 'left'
export type PopoverAlign = 'start' | 'center' | 'end'

export interface PopoverProps {
  trigger: ReactNode
  /** The panel's accessible name; required on purpose. */
  label: string
  side?: PopoverSide
  align?: PopoverAlign
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
  /**
   * `'auto'` stays anchored at every width, because Popover is non-modal by
   * contract and a default must not change that on phones only. `'sheet'` is
   * the app's opt-in: unchanged above `30rem`, and a modal bottom sheet below
   * it (the sheet presentation, `design/components/README.md`), as the spec
   * states.
   */
  presentation?: 'auto' | 'sheet'
}

/**
 * Where a member that draws this Popover as one of its own parts reads the
 * panel: ColorInput's agent handle withholds the panel and stands for the
 * Popover, which then registers nothing. Only the Popover directly inside
 * reads it; it is not passed further.
 */
const LentPanel = createContext<((panel: HTMLElement | null) => void) | null>(null)

export function PopoverPanelMember({
  panel,
  children,
}: {
  /** Called with the panel when it mounts, and with `null` when it unmounts. */
  panel: (panel: HTMLElement | null) => void
  children: ReactNode
}) {
  return <LentPanel value={panel}>{children}</LentPanel>
}

export function Popover({
  trigger,
  label,
  side = 'bottom',
  align = 'start',
  open,
  defaultOpen,
  onOpenChange,
  children,
  presentation = 'auto',
}: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false)
  const current = open ?? uncontrolled

  const triggerId = useId()
  const panelId = useId()

  const setOpen = (next: boolean) => {
    setUncontrolled(next)
    onOpenChange?.(next)
  }

  /**
   * The sheet presentation's width threshold, used only with `'sheet'`;
   * `'auto'` never checks it.
   */
  const phone = usePhoneViewport()
  const sheeting = presentation === 'sheet' && phone

  // An agent closes the popover as a person's dismissal does, through `setOpen`, so
  // `onOpenChange` reports it in either form. The named panel names the popover: Radix's content
  // anchored, and the sheet's panel around this member's own element below the threshold. A
  // closed popover has none, and an agent opens one by pressing its trigger. A Popover whose panel
  // another member reads is that member's part (ColorInput's picker), and the member registers in
  // its place, so this one registers nothing.
  const panelRef = useRef<HTMLDivElement | null>(null)
  const lentPanel = useContext(LentPanel)
  const attachPanel = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node
      lentPanel?.(node)
    },
    [lentPanel],
  )
  useAgentMember(
    {
      member: 'Popover',
      element: () => panelRef.current?.closest('[role="dialog"]') ?? panelRef.current,
      state: () => ({ open: current }),
      actions: { close: () => current && setOpen(false) },
    },
    { unless: lentPanel !== null },
  )

  if (sheeting) {
    return (
      <>
        {/*
         * The trigger behaves the same. TriggerAnchor works as on the anchored
         * lane: ARIA goes on the governed control inside, and focus returns
         * there on close. This component sets the attributes itself, because
         * there is no Radix root to set them.
         */}
        <TriggerAnchor
          open={current}
          id={triggerId}
          aria-haspopup="dialog"
          aria-expanded={current}
          aria-controls={current ? panelId : undefined}
          onClick={() => setOpen(!current)}
        >
          {trigger}
        </TriggerAnchor>

        {/* Modal below the threshold, as the spec states: scrim, containment,
            Escape and scrim-press to dismiss. The panel declares itself a named
            dialog instead of being modal without saying so. */}
        <SheetSurface
          open={current}
          onDismiss={() => setOpen(false)}
          role="dialog"
          aria-modal
          aria-label={label}
        >
          {/* The sheet's panel belongs to `sheet.tsx` and is shared by every
              member that uses a sheet. So the identity goes on the one element
              inside it that this member owns, which also uses its classes. */}
          <div
            ref={attachPanel}
            id={panelId}
            className={styles.sheetBody}
            {...memberAttr('Popover')}
          >
            {/* The holder is this Popover's alone, so no Popover inside reads it. */}
            <LentPanel value={null}>{children}</LentPanel>
          </div>
        </SheetSurface>
      </>
    )
  }

  return (
    <PopoverPrimitive.Root open={current} onOpenChange={setOpen}>
      {/* Not the governed control directly; see `trigger-anchor.tsx`. */}
      <PopoverPrimitive.Trigger asChild>
        <TriggerAnchor open={current}>{trigger}</TriggerAnchor>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        {/*
         * `sideOffset: 4`, where menus and selects use 2. A menu grows out of the
         * control that opened it, so 2px is a seam. A popover is a small surface
         * with its own content, set slightly off its trigger, and the extra two
         * pixels show that. No arrow, as in Tooltip.
         */}
        <PopoverPrimitive.Content
          ref={attachPanel}
          className={styles.panel}
          side={side}
          align={align}
          sideOffset={4}
          aria-label={label}
          {...memberAttr('Popover')}
        >
          <LentPanel value={null}>{children}</LentPanel>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
