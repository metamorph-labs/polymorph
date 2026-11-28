import { artifactPaneLaw } from '@polymorph/conformance/artifact-pane'

import { mountElement } from '../mount'
import './ArtifactPane'

/**
 * What an ArtifactPane says while its artifact is being written, by default
 * and in a host's words from `streamingLabel`, as
 * `@polymorph/conformance/artifact-pane` states it for every shell. The
 * element is made with the law's props, as a page's script makes one.
 */
artifactPaneLaw({
  shell: 'Elements',
  mount: (props) => mountElement('poly-artifact-pane', props),
})
