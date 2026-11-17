import { createSignal } from 'solid-js'

import { pageTitleLaw } from '@polymorph/conformance/page-title'

import Dashboard from '../archetypes/Dashboard'
import DetailPage from '../archetypes/DetailPage'
import Button from '../controls/Button'
import InlineEdit from '../controls/InlineEdit'
import { mount } from '../mount'
import PageHeader from './PageHeader'

/**
 * A page title edited in place, on PageHeader, DetailPage and Dashboard, in
 * the Solid shell (`design/components/page-header.md`, A title edited in
 * place), as `@polymorph/conformance/page-title` states it for every web
 * shell. The InlineEdit is written in each page's prop, so it is made where
 * the page reads its slot, as an application's JSX makes it.
 */
pageTitleLaw({
  shell: 'Solid',
  async mount({ member, edit, props, onCommit, onEditingChange }) {
    const [held, setHeld] = createSignal(props)
    await mount(() => {
      if (member === 'DetailPage') {
        return (
          <DetailPage
            backLabel="Back"
            onBack={() => {}}
            title={held().title}
            titleEdit={
              edit ? (
                <InlineEdit
                  label="Project name"
                  value={held().title}
                  size="lg"
                  editing={held().editing}
                  pending={held().pending}
                  error={held().error}
                  onCommit={onCommit}
                  onEditingChange={onEditingChange}
                />
              ) : undefined
            }
            actions={<Button variant="outline" tone="neutral" label="Export" />}
          >
            <p>The page’s body.</p>
          </DetailPage>
        )
      }
      if (member === 'Dashboard') {
        return (
          <Dashboard
            title={held().title}
            titleEdit={
              edit ? (
                <InlineEdit
                  label="Project name"
                  value={held().title}
                  size="lg"
                  editing={held().editing}
                  pending={held().pending}
                  error={held().error}
                  onCommit={onCommit}
                  onEditingChange={onEditingChange}
                />
              ) : undefined
            }
            actions={<Button variant="outline" tone="neutral" label="Export" />}
            primary={<p>The page’s body.</p>}
          />
        )
      }
      return (
        <PageHeader
          title={held().title}
          titleEdit={
            edit ? (
              <InlineEdit
                label="Project name"
                value={held().title}
                size="lg"
                editing={held().editing}
                pending={held().pending}
                error={held().error}
                onCommit={onCommit}
                onEditingChange={onEditingChange}
              />
            ) : undefined
          }
          actions={<Button variant="outline" tone="neutral" label="Export" />}
        />
      )
    })
    return {
      set(next) {
        setHeld((was) => ({ ...was, ...next }))
      },
    }
  },
})
