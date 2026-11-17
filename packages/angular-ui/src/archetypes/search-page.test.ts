import { Component, signal } from '@angular/core'

import { searchPageLaw, type SearchPageState } from '@polymorph/conformance/search-page'

import { Input } from '../controls/Input'
import { mountComponent } from '../mount'
import { SearchPage } from './SearchPage'

/**
 * What a SearchPage does around its query, in the Angular shell
 * (`design/archetypes/search-page.md`, Behaviour and A11y), as
 * `@polymorph/conformance/search-page` states it for every web shell.
 */

/** What the two hosts share: the props the law sets, and the handler it passes. */
class Host {
  readonly state = signal<SearchPageState>({ empty: false, pending: false })
  readonly nothing = { title: 'No results' }
  submitted: () => void = () => {}
}

/** The page without `submit`, so its landmark is no form. */
@Component({
  selector: 'test-search-page',
  imports: [Input, SearchPage],
  template: `<pm-search-page
    title="Search"
    searchLabel="Workspace"
    [emptyState]="nothing"
    [empty]="state().empty"
    [pending]="state().pending"
    ><ng-container ngProjectAs="[slot=search]"><pm-input aria-label="Query" /></ng-container>
    <p>Results</p></pm-search-page
  >`,
})
class Searching extends Host {}

/** The page with `submit` handled, so its landmark is a form. */
@Component({
  selector: 'test-submitting-search-page',
  imports: [Input, SearchPage],
  template: `<pm-search-page
    title="Search"
    searchLabel="Workspace"
    [emptyState]="nothing"
    [empty]="state().empty"
    [pending]="state().pending"
    (submit)="submitted()"
    ><ng-container ngProjectAs="[slot=search]"><pm-input aria-label="Query" /></ng-container>
    <p>Results</p></pm-search-page
  >`,
})
class Submitting extends Host {}

searchPageLaw({
  shell: 'Angular',
  async mount({ onSubmit }) {
    const { ref } = await mountComponent(onSubmit === undefined ? Searching : Submitting)
    const host = ref.instance as Host
    if (onSubmit !== undefined) host.submitted = onSubmit
    return {
      set(next) {
        host.state.update((was) => ({ ...was, ...next }))
      },
    }
  },
})
