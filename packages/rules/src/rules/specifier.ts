/**
 * A bare module specifier names a package. Anything starting with `.`, `/` or
 * `#` names a file in this repository.
 *
 * The containment rules apply only to packages. Without this check, the icon
 * rule's name heuristic would fire on `./icon/Icon`, which is the vocabulary's
 * own component and the import the rule recommends.
 */
export function isBareSpecifier(source: string): boolean {
  return !source.startsWith('.') && !source.startsWith('/') && !source.startsWith('#')
}

/**
 * The module path without a bundler's `?query`. A `#` is left alone, because
 * `#styles/row.css` is a package import, not a fragment.
 */
export const pathOf = (source: string): string => source.replace(/\?.*$/s, '')

/**
 * Whether a specifier names a stylesheet, by its extension. The path is tested
 * without its `?query`, so `./a.css?inline` is a stylesheet and
 * `./worker.js?name=a.css` is not.
 */
export function isStylesheet(source: string): boolean {
  return /\.(css|scss|sass|less|styl)$/i.test(pathOf(source))
}
