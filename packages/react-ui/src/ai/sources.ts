/**
 * A source that supports a sentence. Three members share this shape:
 * `Citation` marks one inline, `SourceList` lists them under a reply, and
 * `Markdown` resolves a `[n]` in the model's prose to the nth source.
 *
 * `href` is required because a source the reader cannot open is an assertion,
 * not a citation. The other fields are what the app already knows about the
 * fetched page: its title, its host, and the passage that answered. The app
 * formats them and nothing here derives them (Timeline's rule for time applies
 * to a domain too).
 */
export interface CitationSource {
  /** The page's own title, or the app's name for it. */
  title: string
  /** The link target, required because a source nobody can open is not a source. */
  href: string
  /** The host, already shortened by the app, such as `example.org` and not a URL. */
  domain?: string
  /** The passage that answered, as the preview's body. */
  snippet?: string
}
