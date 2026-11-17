import {
  arr,
  bool,
  defs,
  num,
  obj,
  rec,
  ref,
  str,
  union,
  type Shape,
} from '@polymorph/registry/shape'

/**
 * A brief's requirements (`eval/requirements/<brief>.json`), described once.
 *
 * A brief says what a screen has to do, in words a model reads. Its
 * requirements say the same things as checks the harness runs against the
 * document the model hands back (`eval/requirements.mjs`). The model is never
 * shown them: a requirement names members, and a brief may not.
 *
 * A check is a statement about the document's elements. It reads which members
 * the document composes, which props they are given and what is inside them.
 * It never reads the words a person would see, except as one of several ways
 * to meet a requirement, because a screen may bind its words to an input.
 */

/**
 * What a prop has to be.
 *
 * - `given`: present, and not literally `false`, `null` or an empty string.
 * - `dynamic`: present and not a fixed value. It is bound to an input or, in a
 *   TSX module, computed, or it is a list, an object or an element that holds
 *   such a value. A value that changes with the data has to be one.
 * - `{ "is": … }`: literally this value.
 * - `{ "matches": … }`: fixed words this pattern matches, ignoring case.
 * - `{ "items": … }`: a list of at least `min` items, each of which passes
 *   the tests on its fields. A prop bound or computed whole passes, because
 *   its items are the container's and cannot be read.
 *
 * The prop `children` is also what a document writes inside the element.
 */
const VALUE = union([
  str({ enum: ['given', 'dynamic'] }),
  obj({ is: union([str(), num(), bool()]) }),
  obj({ matches: str({ description: 'A regular expression, matched without case.' }) }),
  obj({
    items: obj(
      {
        min: num({ integer: true }),
        fields: rec(ref('Value'), { description: 'Every field named here has to hold.' }),
        anyField: rec(ref('Value'), { description: 'At least one field named here has to hold.' }),
      },
      { optional: ['min', 'fields', 'anyField'] },
    ),
  }),
])

const PATTERN = obj(
  {
    component: union([str(), arr(str())], {
      description: 'The member or compound part, or a list of them: any one matches.',
    }),
    kind: str({
      description:
        'A named list of members from `eval/requirements/kinds.json`, in place of `component`.',
    }),
    props: rec(ref('Value'), { description: 'Every prop named here has to hold.' }),
    anyProp: rec(ref('Value'), { description: 'At least one prop named here has to hold.' }),
    has: ref('Pattern'),
  },
  {
    optional: ['component', 'kind', 'props', 'anyProp', 'has'],
    description:
      'One element of the document. `has` is an element inside it, in its children or in a prop.',
  },
)

const CHECK = union([
  obj({ element: ref('Pattern') }, { description: 'At least one element matches.' }),
  obj(
    {
      count: union([ref('Pattern'), arr(ref('Pattern'))]),
      min: num({ integer: true }),
    },
    { description: 'At least `min` elements match the pattern, or any pattern of the list.' },
  ),
  obj({ any: arr(ref('Check')) }, { description: 'At least one of these checks holds.' }),
  obj({ all: arr(ref('Check')) }, { description: 'Every one of these checks holds.' }),
])

export const REQUIREMENTS_SHAPE: Shape = defs(
  { Value: VALUE, Pattern: PATTERN, Check: CHECK },
  obj({
    requirements: arr(
      obj({
        id: str({
          pattern: '^[a-z][a-z0-9]*(-[a-z0-9]+)*$',
          description: 'Names the requirement in a record. Unique within the brief.',
        }),
        says: str({
          description:
            'What the brief asks for, as one sentence a reader of the report can act on. It ' +
            'names no member, as the brief names none.',
        }),
        check: ref('Check'),
      }),
    ),
  }),
  { description: 'What a brief requires of the screen, as checks on the document handed back.' },
)

/** `eval/requirements/kinds.json`: each name is a list of members that can do one job. */
export const KINDS_SHAPE: Shape = rec(arr(str()), {
  description: 'A kind, such as `choice`, and the members a pattern of that kind matches.',
})
