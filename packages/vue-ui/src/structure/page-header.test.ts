import { h, nextTick, reactive, type VNode } from 'vue'

import { pageTitleLaw, type PageTitleLawProps } from '@polymorph/conformance/page-title'

import Dashboard from '../archetypes/Dashboard.vue'
import DetailPage from '../archetypes/DetailPage.vue'
import Button from '../controls/Button.vue'
import InlineEdit from '../controls/InlineEdit.vue'
import { mount } from '../mount'
import PageHeader from './PageHeader.vue'

/**
 * A page title edited in place, on PageHeader, DetailPage and Dashboard, in
 * the Vue shell (`design/components/page-header.md`, A title edited in
 * place), as `@polymorph/conformance/page-title` states it for every web
 * shell.
 */
pageTitleLaw({
  shell: 'Vue',
  async mount({ member, edit, props, onCommit, onEditingChange }) {
    const held = reactive<PageTitleLawProps>({ ...props })
    const slots = () => {
      const named: Record<string, () => VNode> = {
        actions: () => h(Button, { variant: 'outline', tone: 'neutral', label: 'Export' }),
      }
      if (edit) {
        named.titleEdit = () =>
          h(InlineEdit, {
            label: 'Project name',
            value: held.title,
            size: 'lg',
            editing: held.editing,
            pending: held.pending,
            error: held.error,
            onCommit,
            onEditingChange,
          })
      }
      return named
    }
    await mount(() => {
      if (member === 'DetailPage') {
        return h(
          DetailPage,
          { backLabel: 'Back', onBack: () => {}, title: held.title },
          { ...slots(), default: () => h('p', 'The page’s body.') },
        )
      }
      if (member === 'Dashboard') {
        return h(
          Dashboard,
          { title: held.title },
          { ...slots(), primary: () => h('p', 'The page’s body.') },
        )
      }
      return h(PageHeader, { title: held.title }, slots())
    })
    return {
      set(next) {
        Object.assign(held, next)
        return nextTick()
      },
    }
  },
})
