import { h } from 'vue'

import { artifactPaneLaw } from '@polymorph/conformance/artifact-pane'

import { mount } from '../mount'
import ArtifactPane from './ArtifactPane.vue'

/**
 * What an ArtifactPane says while its artifact is being written in the Vue
 * shell, by default and in a host's words from `streamingLabel`, as
 * `@polymorph/conformance/artifact-pane` states it for every web shell.
 */
artifactPaneLaw({
  shell: 'Vue',
  mount: (props) => mount(() => h(ArtifactPane, props)),
})
