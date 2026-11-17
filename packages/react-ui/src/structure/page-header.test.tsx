import { render } from '@testing-library/react'
import { useState, type ReactElement } from 'react'

import {
  pageTitleLaw,
  type PageTitleLawMount,
  type PageTitleLawProps,
} from '@polymorph/conformance/page-title'
import { Dashboard } from '../archetypes/Dashboard'
import { DetailPage } from '../archetypes/DetailPage'
import { Button } from '../controls/Button'
import { InlineEdit } from '../controls/InlineEdit'
import { PageHeader } from './PageHeader'

/**
 * A page title edited in place, on PageHeader, DetailPage and Dashboard
 * (`design/components/page-header.md`, A title edited in place), as
 * `@polymorph/conformance/page-title` states it for every web shell. The page
 * is mounted in a component that holds its props, as the application around
 * it does.
 */

const noop = () => {}

function page(
  { member, edit, onCommit, onEditingChange }: PageTitleLawMount,
  held: PageTitleLawProps,
): ReactElement {
  const titleEdit = edit ? (
    <InlineEdit
      label="Project name"
      value={held.title}
      size="lg"
      editing={held.editing}
      pending={held.pending}
      error={held.error}
      onCommit={onCommit}
      onEditingChange={onEditingChange}
    />
  ) : undefined
  const actions = <Button variant="outline" tone="neutral" label="Export" />
  if (member === 'DetailPage') {
    return (
      <DetailPage
        backLabel="Back"
        onBack={noop}
        title={held.title}
        titleEdit={titleEdit}
        actions={actions}
      >
        <p>The page’s body.</p>
      </DetailPage>
    )
  }
  if (member === 'Dashboard') {
    return (
      <Dashboard
        title={held.title}
        titleEdit={titleEdit}
        actions={actions}
        primary={<p>The page’s body.</p>}
      />
    )
  }
  return <PageHeader title={held.title} titleEdit={titleEdit} actions={actions} />
}

pageTitleLaw({
  shell: 'React',
  mount(options) {
    let change: (next: Partial<PageTitleLawProps>) => void = () => {}
    function Held() {
      const [held, setHeld] = useState(options.props)
      change = (next) => setHeld((was) => ({ ...was, ...next }))
      return page(options, held)
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
})
