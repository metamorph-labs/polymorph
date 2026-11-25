/**
 * The usage rules a screen is held to, stated once for the two places that
 * check them: the red rules that read application code
 * (`one-main-button`, `danger-last`, `trailing-icon`) and the validation a
 * screen spec gets (`@polymorph/spec/validate`), which a screen drawn at run
 * time also gets. Each reads the same members, the same defaults and the same
 * ordering here, so a screen written by hand and one a model writes are told
 * the same thing.
 *
 * The roles a trailing icon may take are not here. They are owned beside the
 * roles themselves, as `trailing` on each such role in `design/icons.json`. The rule reads that
 * file, and the validator reads the list from the vocabulary it is given.
 *
 * This module imports nothing, so a page can load it: the validator runs in a
 * browser (`packages/spec/src/browser-surface.test.ts`).
 */

/**
 * A prop as a call site writes it: its text, `undefined` when it is left out,
 * and `null` when it is computed, so its value cannot be read from the code.
 * A rule that meets a computed value says nothing about it.
 */
export type Written = string | undefined | null

/** The member the usage rules are about. */
export const BUTTON = 'Button'

/**
 * The variant and the tone of a main Button. Both are Button's defaults
 * (`design/components/button.md`), so a Button that writes neither prop is a
 * main one.
 */
export const MAIN_VARIANT = 'solid'
export const MAIN_TONE = 'accent'

/** The tone of a destructive Button. */
export const DANGER_TONE = 'danger'

/**
 * Whether a Button is a main one, from its written `variant` and `tone`:
 * `null` when a computed prop leaves the answer open.
 */
export function isMainButton(variant: Written, tone: Written): boolean | null {
  const writtenVariant = variant === undefined ? MAIN_VARIANT : variant
  const writtenTone = tone === undefined ? MAIN_TONE : tone
  if (writtenVariant !== null && writtenVariant !== MAIN_VARIANT) return false
  if (writtenTone !== null && writtenTone !== MAIN_TONE) return false
  return writtenVariant === null || writtenTone === null ? null : true
}

/** Whether a Button is destructive, from its written `tone`: `null` when the tone is computed. */
export function isDangerButton(tone: Written): boolean | null {
  return tone === null ? null : tone === DANGER_TONE
}

/** What a member that holds actions is: a dialog, or a section of a page. */
export interface ActionScope {
  readonly kind: 'dialog' | 'section'
  /**
   * The props whose content is drawn outside the scope. A dialog's or a
   * popover's `trigger` stays on the page, so a Button there is counted in the
   * scope around the dialog.
   */
  readonly outside: readonly string[]
}

/**
 * The members that each hold one set of actions, by name. A main Button leads
 * one of these, and a nested one is counted apart: a Card inside a Dialog is a
 * scope of its own.
 *
 * The dialogs are the overlays that hold a task in a slot the caller fills:
 * Dialog and Drawer, with their `footer`, and Popover, whose spec gives it an
 * action row (`design/components/popover.md`). ConfirmDialog takes no
 * children: it draws its own two Buttons, and only its trigger is the
 * caller's. The sections are the two members the vocabulary calls a group of
 * a page's content: a Card, and a Dashboard's panel (`docs/concepts.md`). A
 * page itself is not a scope: its header's actions and its archetype's own
 * slots are the page's, and the rule says nothing about them.
 */
export const ACTION_SCOPES: Readonly<Record<string, ActionScope>> = {
  Dialog: { kind: 'dialog', outside: ['trigger'] },
  Drawer: { kind: 'dialog', outside: [] },
  Popover: { kind: 'dialog', outside: ['trigger'] },
  Card: { kind: 'section', outside: [] },
  'Dashboard.Panel': { kind: 'section', outside: [] },
}

/**
 * The scope a member name opens, read the same in every syntax: a part is
 * matched with its dot or without it, as `Dashboard.Panel`, `DashboardPanel`
 * (an Angular selector's reading) or both.
 */
export function actionScope(member: string): { name: string; scope: ActionScope } | null {
  const plain = member.replace('.', '')
  for (const [name, scope] of Object.entries(ACTION_SCOPES)) {
    if (name.replace('.', '') === plain) return { name, scope }
  }
  return null
}

/**
 * Where a Button sits among the conditionals between it and its scope: each
 * conditional, by any value that identifies it, with the branch the Button is
 * in. Two Buttons in different branches of one conditional never render
 * together.
 */
export type Branches = readonly (readonly [conditional: unknown, branch: number])[]

/** Whether two Buttons are alternatives: different branches of one conditional. */
export function areAlternatives(a: Branches, b: Branches): boolean {
  return a.some(([conditional, branch]) =>
    b.some(([other, otherBranch]) => conditional === other && branch !== otherBranch),
  )
}

/**
 * The main Buttons of one scope that are one too many, by their index in
 * document order: each one that can render beside a main Button before it.
 * The first is kept, so the report is on the second.
 */
export function extraMainButtons(buttons: readonly Branches[]): number[] {
  const extra: number[] = []
  buttons.forEach((branches, index) => {
    if (buttons.slice(0, index).some((earlier) => !areAlternatives(earlier, branches))) {
      extra.push(index)
    }
  })
  return extra
}

/**
 * The rule for a destructive Button, in the words every place that states it
 * uses (the rule's docs, the system card, `button.md`, `form-page.md`).
 */
export const DANGER_ORDER =
  'Within one group of Buttons placed together, a danger Button comes last. A destructive ' +
  'action in a group of its own, apart from the group that holds the main Button, may come first.'

/**
 * The member that divides one element's content into two groups of Buttons.
 * Content is grouped by what holds it: the Buttons one element holds side by
 * side, in its content or in one prop, are one group, and a Button that an
 * `Inline` or another member wraps apart from them is a group of its own. A
 * `Separator` between Buttons of one element also starts a new group, because
 * it draws the line between them.
 */
export const GROUP_DIVIDER = 'Separator'

/** One element's content, divided into its groups at each `GROUP_DIVIDER`. */
export function groupsOf<T>(items: readonly T[], isDivider: (item: T) => boolean): T[][] {
  const groups: T[][] = [[]]
  for (const item of items) {
    if (isDivider(item)) groups.push([])
    else groups[groups.length - 1]?.push(item)
  }
  return groups.filter((group) => group.length > 0)
}

/**
 * One place in a group of sibling Buttons: the tone each Button that can stand
 * there writes. A place holds more than one where a conditional picks between
 * Buttons.
 */
export type RowPlace = readonly Written[]

/**
 * The places in one group whose Button is destructive while a Button that is
 * surely not destructive comes after it in the same group. A computed tone is neither, so the
 * rule says nothing about it.
 */
export function dangerBeforeOthers(row: readonly RowPlace[]): number[] {
  const found: number[] = []
  row.forEach((place, index) => {
    if (!place.some((tone) => isDangerButton(tone) === true)) return
    const after = row.slice(index + 1)
    if (after.some((later) => later.some((tone) => isDangerButton(tone) === false))) {
      found.push(index)
    }
  })
  return found
}

/** Whether a role may be a Button's trailing icon, by the list `design/icons.json` owns. */
export function isTrailingRole(role: string, trailing: readonly string[]): boolean {
  return trailing.includes(role)
}
