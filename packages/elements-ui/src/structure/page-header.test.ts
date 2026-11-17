import { pageTitleLaw, type PageTitleMember } from '@polymorph/conformance/page-title'
import { assign, create } from '@polymorph/elements'

import { mountNodes } from '../mount'
import '../archetypes/Dashboard'
import '../archetypes/DetailPage'
import '../controls/Button'
import '../controls/InlineEdit'
import './PageHeader'

const TAGS: Record<PageTitleMember, string> = {
  PageHeader: 'poly-page-header',
  DetailPage: 'poly-detail-page',
  Dashboard: 'poly-dashboard',
}

/**
 * A page title edited in place, on PageHeader, DetailPage and Dashboard, as
 * elements (`design/components/page-header.md`, A title edited in place), as
 * `@polymorph/conformance/page-title` states it for every web shell. The page
 * is made as a page's script makes one: the InlineEdit is a child in the
 * `title-edit` slot, the Button one in the `actions` slot, and the body a
 * paragraph. The law's `onEditingChange` sets `editing` on the InlineEdit
 * while its change event is dispatched, so the element keeps the value the
 * law holds.
 */
pageTitleLaw({
  shell: 'Elements',
  async mount({ member, edit, props, onCommit, onEditingChange }) {
    const field = edit
      ? create('poly-inline-edit', {
          slot: 'title-edit',
          label: 'Project name',
          value: props.title,
          size: 'lg',
          editing: props.editing,
          pending: props.pending,
          error: props.error,
          onCommit,
          onEditingChange,
        })
      : undefined
    const children: unknown[] = [
      ...(field === undefined ? [] : [field]),
      create('poly-button', {
        slot: 'actions',
        variant: 'outline',
        tone: 'neutral',
        label: 'Export',
      }),
    ]
    if (member === 'DetailPage') children.push(create('p', {}, ['The page’s body.']))
    if (member === 'Dashboard')
      children.push(create('p', { slot: 'primary' }, ['The page’s body.']))
    const own =
      member === 'DetailPage'
        ? { backLabel: 'Back', onBack: () => {}, title: props.title }
        : { title: props.title }
    const page = create(TAGS[member], own, children)
    await mountNodes(page)
    return {
      set(next) {
        for (const [name, value] of Object.entries(next)) {
          if (name === 'title') {
            assign(page, 'title', value)
            if (field !== undefined) assign(field, 'value', value)
          } else if (field !== undefined) {
            assign(field, name, value)
          }
        }
      },
    }
  },
})
