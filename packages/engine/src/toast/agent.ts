import type { ToastFunction, ToastStoreRecord, ToastTone } from './store'

/**
 * What an agent reads from the notices a Toast viewport shows, and how it
 * answers one, for every renderer's viewport (`design/components/toast.md`,
 * Agent). A notice is a record of the foundation's toast store, so the
 * viewport's handle reads the store, and an answer goes through the store's
 * own `toast.dismiss` after the notice's own action, as the card's close and
 * action controls do, so the application's handlers run as for a person.
 */

/** One notice on screen, as the viewport's `notices` choices list it: its id in the store and its title. */
export interface ToastNoticeChoice {
  readonly id: string
  readonly label: string
}

/** What one notice on screen says, as the viewport's `details` list holds it. */
export interface ToastNoticeDetail {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly tone: ToastTone
  /** The action's label, for a notice with an action. */
  readonly action?: string
  /** False for a notice that holds its owner's only recovery and cannot be dismissed. */
  readonly dismissible: boolean
}

/** The notices on screen, oldest first: every record that is not leaving. */
function showing<Content>(
  records: readonly ToastStoreRecord<Content>[],
): ToastStoreRecord<Content>[] {
  return records.filter((record) => record.closing !== true)
}

/** The notices on screen as choices: each one's id in the store, labelled by its title. */
export function toastNotices<Content>(
  records: readonly ToastStoreRecord<Content>[],
): ToastNoticeChoice[] {
  return showing(records).map((record) => ({ id: record.id, label: record.title }))
}

/** What each notice on screen says: its title, description, tone and action's label, and whether it can be dismissed. */
export function toastDetails<Content>(
  records: readonly ToastStoreRecord<Content>[],
): ToastNoticeDetail[] {
  return showing(records).map((record) => ({
    id: record.id,
    title: record.title,
    ...(record.description === undefined ? {} : { description: record.description }),
    tone: record.tone,
    ...(record.action === undefined ? {} : { action: record.action.label }),
    dismissible: record.dismissible !== false,
  }))
}

function noticeOf<Content>(
  records: readonly ToastStoreRecord<Content>[],
  id: string,
): ToastStoreRecord<Content> {
  const record = showing(records).find((each) => each.id === id)
  if (record === undefined) throw new Error(`No notice on screen has the id "${id}".`)
  return record
}

/**
 * Dismisses a notice as its close control does, through the store's
 * `toast.dismiss`, so its `onDismiss` runs. Refuses a notice that cannot be
 * dismissed, which draws no close control.
 */
export function dismissToastNotice<Content>(
  toast: ToastFunction<Content>,
  records: readonly ToastStoreRecord<Content>[],
  id: string,
): void {
  const record = noticeOf(records, id)
  if (record.dismissible === false) {
    throw new Error(
      `The notice "${record.title}" cannot be dismissed: it holds its owner's recovery.`,
    )
  }
  toast.dismiss(id)
}

/**
 * Runs a notice's action as its action control does: the action's `onClick`,
 * then the store's `toast.dismiss`. Refuses a notice with no action.
 */
export function actOnToastNotice<Content>(
  toast: ToastFunction<Content>,
  records: readonly ToastStoreRecord<Content>[],
  id: string,
): void {
  const record = noticeOf(records, id)
  if (record.action === undefined) throw new Error(`The notice "${record.title}" has no action.`)
  record.action.onClick()
  toast.dismiss(id)
}
