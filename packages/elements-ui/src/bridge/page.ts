/**
 * A page's script for the bridge's parsing tests: it defines FormField, Input
 * and Checkbox in the document that loads it, and records each element's
 * render and dispose with the document's state at the time. The tests load it
 * into a document of their own (`parsing.test.ts`).
 */
import '@polymorph/recipes/base.css'
import '@polymorph/elements/host.css'

import { PolyElement, type InstanceEvent } from '@polymorph/elements'
import { installTestTheme } from '@polymorph/engine/testing'

import '../controls/Checkbox'
import '../controls/FormField'
import '../controls/Input'

/** What the page records, which a test reads from its window. */
export interface PageRecord {
  events: { element: string; event: InstanceEvent; readyState: DocumentReadyState }[]
}

installTestTheme()
const record: PageRecord = { events: [] }
PolyElement.observe((element, event) => {
  record.events.push({
    element: element.localName,
    event,
    readyState: document.readyState,
  })
})
;(window as unknown as { polymorphPage: PageRecord }).polymorphPage = record
