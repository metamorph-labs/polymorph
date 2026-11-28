import { artifactPaneLaw } from '@polymorph/conformance/artifact-pane'

import { render } from '../mount'
import ArtifactPane from './ArtifactPane.svelte'

/**
 * What an ArtifactPane says while its artifact is being written in the Svelte
 * shell, by default and in a host's words from `streamingLabel`, as
 * `@polymorph/conformance/artifact-pane` states it for every web shell.
 */
artifactPaneLaw({
  shell: 'Svelte',
  mount: (props) => render(ArtifactPane, props),
})
