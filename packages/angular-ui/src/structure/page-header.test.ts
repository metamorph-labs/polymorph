import { Component, signal } from '@angular/core'

import {
  pageTitleLaw,
  type PageTitleLawMount,
  type PageTitleLawProps,
} from '@polymorph/conformance/page-title'

import { Dashboard } from '../archetypes/Dashboard'
import { DetailPage } from '../archetypes/DetailPage'
import { Button } from '../controls/Button'
import { InlineEdit } from '../controls/InlineEdit'
import { mountComponent } from '../mount'
import { PageHeader } from './PageHeader'

/**
 * A page title edited in place, on PageHeader, DetailPage and Dashboard, in
 * the Angular shell (`design/components/page-header.md`, A title edited in
 * place), as `@polymorph/conformance/page-title` states it for every web
 * shell.
 */

const RENAME = `<pm-inline-edit
  slot="titleEdit"
  label="Project name"
  size="lg"
  [value]="held().title"
  [editing]="held().editing"
  [pending]="held().pending"
  [error]="held().error"
  (commit)="law.onCommit($event)"
  (editingChange)="law.onEditingChange($event)"
/>`

const EXPORT = `<pm-button slot="actions" variant="outline" tone="neutral" label="Export" />`

const BODY = `<p>The page’s body.</p>`

/** The application around the page: it holds the props the law sets and the handlers it passes. */
@Component({
  selector: 'test-page-title',
  imports: [Button, Dashboard, DetailPage, InlineEdit, PageHeader],
  template: `@if (law(); as law) {
    @switch (law.member) {
      @case ('DetailPage') {
        @if (law.edit) {
          <pm-detail-page backLabel="Back" [title]="held().title">
            ${RENAME} ${EXPORT} ${BODY}
          </pm-detail-page>
        } @else {
          <pm-detail-page backLabel="Back" [title]="held().title">
            ${EXPORT} ${BODY}
          </pm-detail-page>
        }
      }
      @case ('Dashboard') {
        @if (law.edit) {
          <pm-dashboard [title]="held().title">
            ${RENAME} ${EXPORT}
            <ng-container ngProjectAs="[slot=primary]">${BODY}</ng-container>
          </pm-dashboard>
        } @else {
          <pm-dashboard [title]="held().title">
            ${EXPORT}
            <ng-container ngProjectAs="[slot=primary]">${BODY}</ng-container>
          </pm-dashboard>
        }
      }
      @default {
        @if (law.edit) {
          <pm-page-header [title]="held().title">${RENAME} ${EXPORT}</pm-page-header>
        } @else {
          <pm-page-header [title]="held().title">${EXPORT}</pm-page-header>
        }
      }
    }
  }`,
})
class Held {
  /** What the law mounts the page with. The page is drawn once it is set. */
  readonly law = signal<PageTitleLawMount | undefined>(undefined)
  readonly held = signal<PageTitleLawProps>({
    title: '',
    editing: false,
    pending: false,
    error: undefined,
  })
}

pageTitleLaw({
  shell: 'Angular',
  async mount(options) {
    const { ref } = await mountComponent(Held)
    const host = ref.instance as Held
    host.held.set(options.props)
    host.law.set(options)
    return {
      set(next) {
        host.held.update((was) => ({ ...was, ...next }))
      },
    }
  },
})
