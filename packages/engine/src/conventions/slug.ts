/**
 * `FormField` -> `form-field`. The gallery route's spelling of a member name,
 * and the value `memberAttr` writes into `data-member`.
 */
export function gallerySlug(component: string): string {
  return component
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

/**
 * A string as part of an element's id: a letter, a digit and a hyphen stay,
 * and every other character is written as `_`, its code point in hex and `_`,
 * so two different strings give two different parts and the id holds no
 * white space. RichTextInput keys each suggestion's id by the option's own id
 * this way, so `aria-activedescendant` changes when a filter puts another
 * option first.
 */
export function idPart(text: string): string {
  return Array.from(text, (character) =>
    /[A-Za-z0-9-]/.test(character) ? character : `_${character.codePointAt(0)?.toString(16)}_`,
  ).join('')
}
