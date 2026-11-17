import { Bespoke, Button, Stack, toast } from '@polymorph/react-ui'

/**
 * The rung-4 exception, Relay's only one.
 *
 * A "what's new" promo with a custom illustration (two overlapping discs and a rule) that the
 * vocabulary has no member for and should not add one for. There is no Shape primitive, no
 * gradient panel and no decorative-blob component. Adding any of them for one promo is what the
 * exception ladder exists to prevent: a vocabulary that adds a member every time a screen wants
 * something.
 *
 * So this is declared instead. Three points:
 *
 *  - **`style` is allowed in this file and forbidden in every other file under `apps/`.**
 *    `polymorph/no-raw-styles` applies to application code and exempts a `<Bespoke>` zone in the
 *    rule itself, not through a disable comment. That makes it a declared exception rather than a
 *    leak, and `pnpm inventory` lists it.
 *  - **Every value is still a token.** Leaving the vocabulary does not mean leaving the theme.
 *    Switch to `terminal`, or to dark mode, and the illustration re-themes with the rest of the
 *    product. That is the limit of what rung 4 allows.
 *  - **The heading and the button are still vocabulary.** A zone covers only what has no member.
 *    It does not allow rebuilding the page inside it.
 */
export function WhatsNew() {
  return (
    <Bespoke reason="Promo illustration: overlapping discs the vocabulary has no shape primitive for.">
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: 'var(--pm-space-4)',
          background: 'var(--pm-accent-subtle)',
          border: '1px solid var(--pm-border-subtle)',
          borderRadius: 'var(--pm-radius-lg)',
        }}
      >
        {/* The illustration. It is decorative, so it is hidden from screen readers. Announcing
            "two discs" would be worse than saying nothing. */}
        <div aria-hidden="true">
          <div
            style={{
              position: 'absolute',
              insetBlockStart: 'calc(var(--pm-space-6) * -1)',
              insetInlineEnd: 'calc(var(--pm-space-6) * -1)',
              inlineSize: 'var(--pm-space-10)',
              blockSize: 'var(--pm-space-10)',
              background: 'var(--pm-accent-bg)',
              borderRadius: '9999px',
              opacity: 0.18,
            }}
          />
          <div
            style={{
              position: 'absolute',
              insetBlockStart: 'calc(var(--pm-space-4) * -1)',
              insetInlineEnd: 'var(--pm-space-5)',
              inlineSize: 'var(--pm-space-8)',
              blockSize: 'var(--pm-space-8)',
              background: 'var(--pm-info-solid)',
              borderRadius: '9999px',
              opacity: 0.14,
            }}
          />
        </div>

        <Stack gap={2} align="start">
          <strong
            style={{
              font: 'var(--pm-text-sm-weight) var(--pm-text-sm-size) var(--pm-text-sm-family)',
              color: 'var(--pm-accent-text)',
            }}
          >
            New: saved views
          </strong>
          <span
            style={{
              font: 'var(--pm-text-xs-weight) var(--pm-text-xs-size) var(--pm-text-xs-family)',
              lineHeight: 'var(--pm-text-xs-line-height)',
              color: 'var(--pm-text-secondary)',
            }}
          >
            Pin a filter combination to the rail and come back to it.
          </span>

          <Button
            variant="ghost"
            tone="accent"
            size="sm"
            label="See what changed"
            onClick={() =>
              toast.info('Saved views', {
                description: 'Filter the inbox, then pin the combination from the filter bar.',
              })
            }
          />
        </Stack>
      </div>
    </Bespoke>
  )
}
