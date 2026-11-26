import { composeOutputContract, composeRuntimeCard } from '@polymorph/registry/runtime-card'
import { SPEC_ID } from '@polymorph/spec/schema'

import type { MemberOptions, ScreenVocabulary } from './members'
import { VOCABULARY } from './vocabulary'

/**
 * The run-time card: what a host puts in a model's system prompt so the
 * model writes a screen the host can draw, in one call, with no tool.
 *
 * It has three parts. The opening says what the model is doing. The members
 * section lists the members the host allows, with their props. The output
 * contract says what the answer is: one `polymorph-screen/1` document, and
 * what the host does with each part of it at run time. The registry composes
 * all three (`composeRuntimeCard` in `packages/registry/src/runtime-card.ts`),
 * here from the vocabulary table the host installed, so a host builds its
 * prompt from the version it runs and the card never names a member the host
 * cannot draw. The MCP tool `get_system_card` composes the same text from the
 * registry, which `polymorph card --runtime` prints.
 */

export interface CardOptions extends MemberOptions {
  /** The vocabulary to describe. The generated table when absent. */
  vocabulary?: ScreenVocabulary
}

/** The output contract, for the members a host allows and its address policy. */
export function outputContract(options: CardOptions = {}): string {
  const { vocabulary = VOCABULARY, ...rest } = options
  return composeOutputContract(vocabulary, { ...rest, spec: SPEC_ID })
}

/**
 * The run-time card for the members a host allows: the opening, the members
 * section and the output contract. Its default is every member the
 * framework draws but those that host another library's code. With
 * `addresses: 'refused'`, it lists no prop that takes an address and no member
 * that cannot be drawn without one.
 */
export function runtimeCard(options: CardOptions = {}): string {
  const { vocabulary = VOCABULARY, ...rest } = options
  return composeRuntimeCard(vocabulary, { ...rest, spec: SPEC_ID })
}
