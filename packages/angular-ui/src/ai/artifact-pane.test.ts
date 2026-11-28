import { artifactPaneLaw } from '@polymorph/conformance/artifact-pane'

import { mountComponent } from '../mount'
import { ArtifactPane } from './ArtifactPane'

/**
 * What an ArtifactPane says while its artifact is being written in the Angular
 * shell, by default and in a host's words from `streamingLabel`, as
 * `@polymorph/conformance/artifact-pane` states it for every web shell.
 */
artifactPaneLaw({
  shell: 'Angular',
  // A prop the law leaves out is an input the test does not set.
  mount: (props) => mountComponent(ArtifactPane, { ...props }),
})
