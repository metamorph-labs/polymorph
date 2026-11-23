import { cond, describeMember, el, flag, identity, lit, member, run, when } from '../dsl'

/** A picture as a data URI, so no fixture entry waits on the network. */
const svg = (markup: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(markup)

const HARBOUR = svg(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">' +
    '<rect width="320" height="200" fill="#2f4a6b"/>' +
    '<circle cx="236" cy="72" r="28" fill="#f2c879"/>' +
    '<path d="M0 200V140L80 96l70 54 64-40 106 58v32z" fill="#1c2f47"/>' +
    '</svg>',
)

const MARK = svg(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="14" fill="#2f4a6b"/>' +
    '<path d="M22 46V18h12a9 9 0 0 1 0 18H22m12 0 10 10" fill="none" stroke="#fff" stroke-width="5"/>' +
    '</svg>',
)

/** The harbour again at twice the pixels, the file a dense screen asks for. */
const HARBOUR_DENSE = svg(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 320 200">' +
    '<rect width="320" height="200" fill="#2f4a6b"/>' +
    '<circle cx="236" cy="72" r="28" fill="#f2c879"/>' +
    '<path d="M0 200V140L80 96l70 54 64-40 106 58v32z" fill="#1c2f47"/>' +
    '</svg>',
)

const HARBOUR_ALT = 'A harbour at dusk'

/** Both given and above zero: the picture's own pixel size, which gives a width and a ratio. */
const BOXED = 'width !== undefined && height !== undefined && width > 0 && height > 0'

const LONE_SIDE = '(width === undefined) !== (height === undefined)'

/**
 * Image (`design/components/image.md`): a read-only picture, such as a
 * photograph, a brand mark, artwork or a preview. It is not Avatar, a round
 * identity mark, not ImageEditor, which crops, and not Icon, which draws a
 * role.
 *
 * The frame holds the box: it takes the ratio and the width from the props, as
 * data, and the placeholder, the picture and the fallback fill it. The picture
 * is drawn over the placeholder as it decodes and is never hidden until a
 * script hears `load`. When it fails, its element is removed, so the browser's
 * broken-image glyph is never drawn, and the fallback keeps its name.
 *
 * `request` is what the element is asked to fetch: the `src`, and the set it may
 * pick from instead. `loaded` and `failed` each hold the request they are about,
 * so a new `src` or a new set starts as loading. An empty `src` is failed
 * without a request. A failure is about one request: when the request moves on
 * it is forgotten, so coming back to the same URL asks for it again.
 */
export default describeMember({
  member: 'Image',
  dir: 'structure',
  recipe: 'structure/image',
  defaults: { fit: lit('contain'), loading: lit('lazy') },
  state: { loaded: "''", failed: "''" },
  derived: {
    request: "srcSet === undefined ? src : src + ' ' + srcSet",
    status:
      "src === '' || failed === request ? 'failed' : loaded === request ? 'loaded' : 'loading'",
    // Written out where a width is divided, so each framework's compiler sees both are numbers.
    ratio: `aspectRatio !== undefined && aspectRatio > 0 && Number.isFinite(aspectRatio) ? aspectRatio : ${BOXED} ? width / height : undefined`,
    sized: 'ratio !== undefined',
    decorative: "alt === ''",
    // A picture can settle before its listeners exist: the browser kept it, or the markup came
    // from a server. `complete` with a natural width is a decoded picture. `complete` without
    // one is a broken picture or one with no size of its own, and nothing on the element tells
    // them apart, so the request is made again and its event is heard this time.
    // The ref is typed as an element; the cast says which one it is.
    settle:
      "() => { if (failed !== request) failed = ''; const element = image as HTMLImageElement | null | undefined; if (element == null || !element.complete) return; if (element.naturalWidth > 0) loaded = request; else element.src = src }",
  },
  effects: [
    { watch: 'request', run: 'settle()' },
    {
      watch: LONE_SIDE,
      run: `devWarning(${LONE_SIDE}, 'Image: \`width\` and \`height\` are given together. One alone gives no ratio and is ignored.')`,
    },
  ],
  template: el(
    'span',
    {
      part: 'frame',
      class: ['frame'],
      attrs: {
        'data-state': "status === 'loaded' ? undefined : status",
        'data-fit': 'fit',
        'data-sized': flag('sized'),
        ...identity('Image'),
      },
      // Data, not a decision: the ratio and the pixel width are the picture's own.
      geometry: {
        'aspect-ratio': 'ratio',
        'inline-size': `${BOXED} ? \`\${width}px\` : undefined`,
      },
    },
    [
      cond("status === 'loading'", [
        el('span', {
          part: 'placeholder',
          class: ['placeholder'],
          attrs: { 'aria-hidden': lit('true') },
        }),
      ]),
      cond(
        "status === 'failed'",
        [
          el(
            'span',
            {
              part: 'fallback',
              class: ['fallback'],
              attrs: {
                'data-image-part': lit('fallback'),
                role: when('!decorative', lit('img')),
                'aria-label': when('!decorative', 'alt'),
                'aria-hidden': when('decorative', 'true'),
              },
            },
            [member('Icon', { name: lit('error') })],
          ),
        ],
        [
          // Everything that steers the fetch comes before `src`: the browser reads it when
          // the request starts. `sizes` comes before `srcset`, which is read with it.
          el('img', {
            part: 'image',
            class: ['image'],
            ref: 'image',
            attrs: {
              loading: 'loading',
              fetchpriority: 'fetchPriority',
              crossorigin: 'crossOrigin',
              referrerpolicy: 'referrerPolicy',
              sizes: 'sizes',
              srcset: 'srcSet',
              src: 'src',
              alt: 'alt',
            },
            on: { load: run('loaded = request'), error: run('failed = request') },
          }),
        ],
      ),
    ],
  ),
  states: [
    {
      name: 'a picture at its own size — the box is held before it arrives',
      props: { src: HARBOUR, alt: HARBOUR_ALT, width: 320, height: 200 },
      expect: { 'data-fit': 'contain', 'data-sized': '' },
    },
    {
      name: 'a brand mark — small, named and fetched at once',
      props: { src: MARK, alt: 'Relay', width: 32, height: 32, loading: 'eager' },
      expect: { 'data-sized': '' },
    },
    {
      name: 'a set of files — the browser picks one for the screen',
      props: {
        src: HARBOUR,
        srcSet: `${HARBOUR} 1x, ${HARBOUR_DENSE} 2x`,
        alt: HARBOUR_ALT,
        width: 320,
        height: 200,
      },
      expect: { 'data-sized': '' },
    },
    {
      name: 'the first view’s picture — fetched at once, ahead of the page’s others',
      props: {
        src: HARBOUR,
        srcSet: `${HARBOUR} 320w, ${HARBOUR_DENSE} 640w`,
        sizes: '320px',
        alt: HARBOUR_ALT,
        width: 320,
        height: 200,
        loading: 'eager',
        fetchPriority: 'high',
      },
      expect: { 'data-sized': '' },
    },
    {
      name: 'decorative — an empty alt hides it from assistive technology',
      props: { src: HARBOUR, alt: '', width: 320, height: 200 },
    },
    {
      name: 'contained — the whole picture inside a frame of another ratio',
      props: { src: HARBOUR, alt: HARBOUR_ALT, width: 240, height: 150, aspectRatio: 1 },
      expect: { 'data-fit': 'contain' },
    },
    {
      name: 'cover — the same frame filled, the picture cropped',
      props: {
        src: HARBOUR,
        alt: HARBOUR_ALT,
        width: 240,
        height: 150,
        aspectRatio: 1,
        fit: 'cover',
      },
      expect: { 'data-fit': 'cover' },
    },
    {
      name: 'frames that take their container — three in a grid',
      many: {
        within: { member: 'Grid', props: { columns: 3, gap: 4 } },
        each: [1, 2, 3].map(() => ({
          props: { src: HARBOUR, alt: HARBOUR_ALT, aspectRatio: 1.5, fit: 'cover' },
        })),
      },
    },
    {
      name: 'no size given — nothing is reserved, then the picture at its natural size',
      props: { src: HARBOUR, alt: HARBOUR_ALT },
      expect: { 'data-sized': null },
    },
    {
      name: 'failed — a meaningful image keeps its name on the fallback',
      props: { src: '', alt: HARBOUR_ALT, width: 320, height: 200 },
      expect: { 'data-state': 'failed', 'data-sized': '' },
    },
    {
      name: 'failed — a decorative image stays hidden',
      props: { src: '', alt: '', width: 320, height: 200 },
      expect: { 'data-state': 'failed' },
    },
    {
      name: 'failed with no size given — the fallback has a size of its own',
      props: { src: '', alt: HARBOUR_ALT },
      expect: { 'data-state': 'failed', 'data-sized': null },
    },
  ],
})
