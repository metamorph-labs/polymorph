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
