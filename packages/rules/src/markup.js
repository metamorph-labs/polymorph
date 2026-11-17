/**
 * The tags of a template's text, read one at a time.
 *
 * Two readers have only a template's text: the inventory, which reads a Vue,
 * Svelte or Angular file without its parser, and the lint rules when an Angular
 * module reads the template its component names. Both ask the same questions,
 * which attribute a tag writes and which component a Vue tag names, so both
 * read them here. A search for `library="…"` in a tag's text also finds
 * `data-library="…"` and the same words inside another attribute's value. This
 * reads each attribute's name and value in turn, so a value is never read as
 * an attribute.
 *
 * It is plain JS because the inventory is, and node runs that directly.
 */

/**
 * @typedef {{ name: string, value: string | null, braced: boolean }} MarkupAttribute
 * One attribute as written: `name`, `name="value"`, `name='value'`,
 * `name=value` or Svelte's `name={value}` (`braced`). `value` is `null` for a
 * bare name. The name keeps its binding marks: `:patch`, `[patch]`, `on:click`.
 *
 * @typedef {{ name: string, close: boolean, selfClosing: boolean, attributes: MarkupAttribute[], start: number, end: number }} MarkupTag
 * A start tag or an end tag (`close`), with where it starts and ends in the text.
 */

const SPACE = /\s/

/** The index of the brace that closes the one at `open`, or `-1`. Quoted braces are text. */
function closingBrace(text, open) {
  let depth = 0
  for (let at = open; at < text.length; at += 1) {
    const char = text[at]
    if (char === '"' || char === "'" || char === '`') {
      const close = text.indexOf(char, at + 1)
      if (close === -1) return -1
      at = close
    } else if (char === '{') depth += 1
    else if (char === '}' && --depth === 0) return at
  }
  return -1
}

/**
 * Every tag in `markup`, in order. A comment's contents are skipped, so a tag
 * written in one is not a tag. A `<` that does not open a tag name (`a < b`)
 * is text, and a tag the text ends inside is dropped.
 *
 * @param {string} markup
 * @returns {MarkupTag[]}
 */
export function markupTags(markup) {
  /** @type {MarkupTag[]} */
  const tags = []
  const head = /<(\/?)([A-Za-z][\w.:-]*)(?=[\s/>])/y
  let at = 0
  while (at < markup.length) {
    const start = markup.indexOf('<', at)
    if (start === -1) break
    if (markup.startsWith('<!--', start)) {
      const close = markup.indexOf('-->', start + 4)
      at = close === -1 ? markup.length : close + 3
      continue
    }
    head.lastIndex = start
    const opened = head.exec(markup)
    if (opened === null) {
      at = start + 1
      continue
    }
    at = head.lastIndex
    /** @type {MarkupAttribute[]} */
    const attributes = []
    let selfClosing = false
    let end = -1
    while (at < markup.length) {
      if (SPACE.test(markup[at])) {
        at += 1
      } else if (markup[at] === '>') {
        end = at + 1
        break
      } else if (markup.startsWith('/>', at)) {
        selfClosing = true
        end = at + 2
        break
      } else if (markup[at] === '{') {
        // Svelte's `{...rest}` and `{name}`: an attribute with no name of its own.
        const close = closingBrace(markup, at)
        if (close === -1) break
        attributes.push({ name: markup.slice(at, close + 1), value: null, braced: true })
        at = close + 1
      } else {
        let stop = at
        while (
          stop < markup.length &&
          !SPACE.test(markup[stop]) &&
          markup[stop] !== '=' &&
          markup[stop] !== '>' &&
          !markup.startsWith('/>', stop)
        ) {
          stop += 1
        }
        // A stray `/` or `=` names nothing.
        if (stop === at) {
          at += 1
          continue
        }
        const name = markup.slice(at, stop)
        at = stop
        let next = at
        while (next < markup.length && SPACE.test(markup[next])) next += 1
        if (markup[next] !== '=') {
          attributes.push({ name, value: null, braced: false })
          continue
        }
        next += 1
        while (next < markup.length && SPACE.test(markup[next])) next += 1
        const quote = markup[next]
        if (quote === '"' || quote === "'") {
          const close = markup.indexOf(quote, next + 1)
          if (close === -1) break
          attributes.push({ name, value: markup.slice(next + 1, close), braced: false })
          at = close + 1
        } else if (quote === '{') {
          const close = closingBrace(markup, next)
          if (close === -1) break
          attributes.push({ name, value: markup.slice(next + 1, close), braced: true })
          at = close + 1
        } else {
          let close = next
          while (close < markup.length && !SPACE.test(markup[close]) && markup[close] !== '>') {
            close += 1
          }
          attributes.push({ name, value: markup.slice(next, close), braced: false })
          at = close
        }
      }
    }
    if (end === -1) break
    tags.push({
      name: opened[2],
      close: opened[1] === '/',
      selfClosing,
      attributes,
      start,
      end,
    })
    at = end
  }
  return tags
}

/**
 * The lowercase, hyphen-free tags Vue's compiler reads as native elements and
 * never resolves to a component: its HTML, SVG and MathML tag lists
 * (`@vue/shared`), less the names with a hyphen or a capital, which a
 * lowercase hyphen-free tag never is.
 */
const NATIVE_TAGS = new Set(
  (
    'a,abbr,address,animate,annotation,area,article,aside,audio,b,base,bdi,bdo,blockquote,' +
    'body,br,button,canvas,caption,circle,cite,code,col,colgroup,data,datalist,dd,defs,del,' +
    'desc,details,dfn,dialog,discard,div,dl,dt,ellipse,em,embed,fieldset,figcaption,figure,' +
    'filter,footer,form,g,h1,h2,h3,h4,h5,h6,hatch,hatchpath,head,header,hgroup,hr,html,i,' +
    'iframe,image,img,input,ins,kbd,label,legend,li,line,link,maction,main,maligngroup,' +
    'malignmark,map,mark,marker,mask,math,menclose,menu,merror,mesh,meshgradient,meshpatch,' +
    'meshrow,meta,metadata,meter,mfenced,mfrac,mfraction,mglyph,mi,mlabeledtr,mlongdiv,' +
    'mmultiscripts,mn,mo,mover,mpadded,mpath,mphantom,mprescripts,mroot,mrow,ms,mscarries,' +
    'mscarry,msgroup,msline,mspace,msqrt,msrow,mstack,mstyle,msub,msubsup,msup,mtable,mtd,' +
    'mtext,mtr,munder,munderover,nav,none,noscript,object,ol,optgroup,option,output,p,param,' +
    'path,pattern,picture,polygon,polyline,pre,progress,q,rect,rp,rt,ruby,s,samp,script,' +
    'section,select,semantics,set,small,solidcolor,source,span,stop,strong,style,sub,summary,' +
    'sup,svg,switch,symbol,table,tbody,td,template,text,textarea,tfoot,th,thead,time,title,tr,' +
    'track,tspan,u,ul,unknown,use,var,video,view,wbr'
  ).split(','),
)

/**
 * The name a Vue template's tag is resolved by, as Vue's compiler resolves it
 * against a `<script setup>`'s imports. A name with a hyphen is read in
 * PascalCase: `<data-table>` is `DataTable`. A lowercase name without one that
 * is not a native element is read capitalised when the script imports that
 * name: `<card>` is the `Card` it imports. Any other name is as written:
 * `<button>` is the HTML element even where `Button` is imported, and
 * `<Button>` is the member.
 *
 * The lint rules and the inventory both read a tag here, so a zone or a
 * boundary one of them finds is one the other finds.
 *
 * @param {string} raw the tag as written
 * @param {ReadonlySet<string>} imports the names the file's script imports
 * @returns {string}
 */
export function vueTagName(raw, imports) {
  if (raw.includes('-')) {
    return raw
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
  }
  if (/^[a-z][a-z0-9]*$/.test(raw) && !NATIVE_TAGS.has(raw)) {
    const capitalised = raw.charAt(0).toUpperCase() + raw.slice(1)
    if (imports.has(capitalised)) return capitalised
  }
  return raw
}

/**
 * The text a tag writes out for the attribute `name`, or `null` when it has
 * none or binds it: `name="text"` is its text, and `:name`, `[name]`,
 * `name={…}` and a value with an interpolation in it (`{{ … }}`, `{…}`) are
 * computed. A lint rule reads the same attribute from its parser's tree the
 * same way, so the two agree on what a tag names.
 *
 * @param {MarkupTag} tag
 * @param {string} name
 * @param {'vue' | 'svelte' | 'angular'} syntax
 * @returns {string | null}
 */
export function writtenAttribute(tag, name, syntax) {
  const attribute = tag.attributes.find((candidate) => candidate.name === name)
  if (attribute === undefined || attribute.braced || attribute.value === null) return null
  // Svelte interpolates `{…}` in a quoted value, and Angular `{{ … }}`. Vue interpolates neither.
  const interpolated =
    syntax === 'svelte'
      ? attribute.value.includes('{')
      : syntax === 'angular' && attribute.value.includes('{{')
  return interpolated ? null : attribute.value
}
