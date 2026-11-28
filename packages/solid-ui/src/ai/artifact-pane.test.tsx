import { artifactPaneLaw } from '@polymorph/conformance/artifact-pane'

import { mount } from '../mount'
import ArtifactPane from './ArtifactPane'

/**
 * What an ArtifactPane says while its artifact is being written in the Solid
 * shell, by default and in a host's words from `streamingLabel`, as
 * `@polymorph/conformance/artifact-pane` states it for every web shell.
 */
artifactPaneLaw({
  shell: 'Solid',
  mount: (props) => mount(() => <ArtifactPane {...props} />),
})
