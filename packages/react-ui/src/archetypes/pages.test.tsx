import { render, screen } from '@testing-library/react'
import { page as browser, userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { detailPageAsideLaw } from '@polymorph/conformance/detail-page-aside'
import { reactAdapter } from '../conformance/react'
import { Button } from '../controls/Button'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { Link } from '../controls/Link'
import { Switch } from '../controls/Switch'
import { tokenLength } from '../controls/token-probe'
import { Stack } from '../layout/Stack'
import { Tabs } from '../overlays/Tabs'
import { Card } from '../structure/Card'
import { Heading } from '../structure/Heading'
import { Hero } from '../structure/Hero'
import { PageHeader } from '../structure/PageHeader'
import { SettingsRow } from '../structure/SettingsRow'
import { fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { AppShell } from './AppShell'
import { AuthPage, type AuthPageProps } from './AuthPage'
import { ConversationPage, type ConversationPageProps } from './ConversationPage'
import { Dashboard, type DashboardProps } from './Dashboard'
import { DetailPage, type DetailPageProps } from './DetailPage'
import { FormPage, type FormPageProps } from './FormPage'
import { SettingsPage, type SettingsPageProps } from './SettingsPage'

/**
 * The page archetypes.
 *
 * An archetype is mostly a spacing declaration (four `--pm-page-*` values and a
 * column), so these tests cover the parts that are not CSS. They check the page
 * outline, the behaviour each archetype provides for the caller, and that the
 * tokens are declared on the root, where a change can reach them.
 */

beforeAll(installTestTheme)

function readVar(node: Element, name: string): string {
  return getComputedStyle(node).getPropertyValue(name).trim()
}

describe('the closed surfaces', () => {
  it('leave no way to style any of them from a call site', () => {
    assertGoverned<SettingsPageProps>(true)
    assertGoverned<FormPageProps>(true)
    assertGoverned<DetailPageProps>(true)
    assertGoverned<AuthPageProps>(true)
    assertGoverned<DashboardProps>(true)
    assertGoverned<ConversationPageProps>(true)
  })
})

/**
 * The churn test, per archetype. Each declares its own instance of the page
 * scope on its own root, so changing a page's proportions is an edit to one
 * stylesheet and no screen needs to change.
 */
describe('every page archetype declares its own scope on its own root', () => {
  const PAGES = [
    {
      name: 'SettingsPage',
      render: () => (
        <SettingsPage title="Settings">
          <SettingsRow.Group title="Appearance">
            <SettingsRow label="Reduce motion" control={<Switch />} />
          </SettingsRow.Group>
        </SettingsPage>
      ),
    },
    {
      name: 'FormPage',
      render: () => (
        <FormPage title="New ticket" actions={<Button label="Create" />}>
          <Card>body</Card>
        </FormPage>
      ),
    },
    {
      name: 'DetailPage',
      render: () => (
        <DetailPage backLabel="Back" onBack={() => {}} title="T-2041">
          <Card>body</Card>
        </DetailPage>
      ),
    },
    {
      name: 'Dashboard',
      render: () => (
        <Dashboard title="Overview" primary={<Dashboard.Panel>body</Dashboard.Panel>} />
      ),
    },
    {
      name: 'ConversationPage',
      render: () => (
        <ConversationPage title="Chat" thread={<p>thread</p>} composer={<p>composer</p>} />
      ),
    },
  ]

  for (const page of PAGES) {
    it(`${page.name} declares the page tokens, and nothing above it does`, () => {
      const { container } = render(page.render())
      const root = container.firstElementChild as HTMLElement

      for (const token of ['--pm-page-padding-x', '--pm-page-max-width', '--pm-content-gutter']) {
        expect(readVar(root, token), `${page.name} ${token}`).not.toBe('')
        // Pattern-scoped: they do not exist outside this page.
        expect(readVar(document.documentElement, token), token).toBe('')
      }
    })
  }

  it('gives each page the width its own content needs', () => {
    // Not one shared number. A settings column and a dashboard have different
    // shapes, and the archetype records that difference.
    const widthOf = (node: HTMLElement) => {
      const probe = document.createElement('div')
      probe.style.inlineSize = 'var(--pm-page-max-width)'
      node.append(probe)
      const value = Number.parseFloat(getComputedStyle(probe).inlineSize)
      probe.remove()
      return value
    }

    const { container: form } = render(
      <FormPage title="x" actions={<Button label="y" />}>
        <Card>body</Card>
      </FormPage>,
    )
    const { container: dashboard } = render(
      <Dashboard title="x" primary={<Dashboard.Panel>body</Dashboard.Panel>} />,
    )

    expect(widthOf(form.firstElementChild as HTMLElement)).toBeLessThan(
      widthOf(dashboard.firstElementChild as HTMLElement),
    )
  })
})

describe('SettingsPage', () => {
  it('has no actions slot, because settings apply instantly', () => {
    // A screen that needs a save bar should be a FormPage, and an `actions` prop
    // here would let one page mix both patterns.
    // @ts-expect-error — there is no slot for a save bar.
    const bad: SettingsPageProps = { title: 'Settings', children: null, actions: null }
    expect(bad.title).toBe('Settings')
  })

  it('gives the page one h1 and the groups the h2s beneath it', () => {
    render(
      <SettingsPage title="Settings">
        <SettingsRow.Group title="Appearance">
          <SettingsRow label="Reduce motion" control={<Switch />} />
        </SettingsRow.Group>
        <SettingsRow.Group title="Notifications">
          <SettingsRow label="Daily digest" control={<Switch />} />
        </SettingsRow.Group>
      </SettingsPage>,
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2)
  })
})

describe('FormPage', () => {
  it('is a real form when it is given a submit, so Enter works from a field', async () => {
    const onSubmit = vi.fn()
    render(
      <FormPage
        title="New ticket"
        actions={<Button label="Create" type="submit" />}
        onSubmit={onSubmit}
      >
        <Card>
          <FormField label="Subject">
            <Input />
          </FormField>
        </Card>
      </FormPage>,
    )

    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('moves focus to the first invalid field', async () => {
    /*
     * The spec defines this archetype behaviour so every form has it. Without
     * it, a failed submit reports errors and leaves the reader scrolling to find
     * the first one.
     */
    const onSubmit = vi.fn()
    render(
      <FormPage
        title="New ticket"
        actions={<Button label="Create" type="submit" />}
        onSubmit={onSubmit}
      >
        <Card>
          <FormField label="Subject">
            <Input />
          </FormField>
          <FormField label="Requester" error="Who reported this?">
            <Input />
          </FormField>
        </Card>
      </FormPage>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: /Requester/ }))
  })

  it('keeps the actions row inside the form', () => {
    // Outside the form, the submit button would be a separate click handler,
    // not the form's own submit.
    const { container } = render(
      <FormPage title="x" actions={<Button label="Create" type="submit" />} onSubmit={() => {}}>
        <Card>body</Card>
      </FormPage>,
    )
    const form = container.querySelector('form') as HTMLElement
    expect(form.contains(screen.getByRole('button', { name: 'Create' }))).toBe(true)
  })
})

describe('DetailPage', () => {
  function page(props: Partial<DetailPageProps> = {}) {
    const { container } = render(
      <DetailPage backLabel="Back to inbox" onBack={() => {}} title="T-2041" {...props}>
        <Card>body</Card>
      </DetailPage>,
    )
    return container.firstElementChild as HTMLElement
  }

  it('cannot be written without a back action', () => {
    // A detail page is always reached from somewhere, and an optional back
    // control would be forgotten.
    // @ts-expect-error — `onBack` is required.
    const bad: DetailPageProps = { backLabel: 'Back', title: 'x', children: null }
    expect(bad.title).toBe('x')
  })

  it('puts the back button before the title, in the DOM as well as on screen', () => {
    const root = page()
    const back = screen.getByRole('button', { name: 'Back to inbox' })
    const title = screen.getByRole('heading', { level: 1 })
    expect(root.firstElementChild?.contains(back)).toBe(true)
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('goes back when asked', async () => {
    const onBack = vi.fn()
    page({ onBack })
    await userEvent.click(screen.getByRole('button', { name: 'Back to inbox' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('adds the aside column only when there is an aside', () => {
    expect(page().querySelector('[data-aside]')).toBeNull()
    expect(page({ aside: <Card>meta</Card> }).querySelector('[data-aside]')).not.toBeNull()
  })

  it('lets the tabs be the body instead of sitting above it', () => {
    /*
     * Tabs or children, not both. A Tabs renders its own panels, so a page that
     * rendered both would show the tab content and then the children below.
     */
    const { container } = render(
      <DetailPage
        backLabel="Back"
        onBack={() => {}}
        title="T-2041"
        tabs={
          <Tabs tabs={[{ value: 'a', label: 'Conversation' }]}>
            <Tabs.Content value="a">
              <p>The conversation.</p>
            </Tabs.Content>
          </Tabs>
        }
      />,
    )
    expect(screen.getByRole('tab', { name: 'Conversation' })).toBeTruthy()
    // No empty body grid left behind it.
    expect(container.querySelectorAll('[data-aside]')).toHaveLength(0)
  })

  /**
   * The header in a phone-width region. The actions never shrink, so a header that keeps them
   * beside the title leaves the title what is left: at 375px that is narrower than its first
   * word, and the title is drawn over the actions.
   */
  describe('the header in a narrow region', () => {
    const TITLE = 'Webhook retries stop after the first 5xx'

    function header(width: number, actions: DetailPageProps['actions']) {
      const host = fixedWidthHost(width)
      render(
        <DetailPage
          backLabel="Back"
          onBack={() => {}}
          title={TITLE}
          meta={<span>opened 4 minutes ago</span>}
          actions={actions}
        >
          <Card>body</Card>
        </DetailPage>,
        { container: host },
      )
      const title = screen.getByRole('heading', { level: 1, name: TITLE })
      const identity = title.parentElement as HTMLElement
      return { host, title, identity, row: identity.parentElement as HTMLElement }
    }

    const TWO = (
      <>
        <Button variant="outline" tone="neutral" label="Snooze" />
        <Button label="Reply" />
      </>
    )

    it('moves the actions under the title, which keeps the width of the page', () => {
      const { host, title, identity, row } = header(375, TWO)
      const actions = screen.getByRole('button', { name: 'Reply' }).parentElement as HTMLElement

      expect(actions.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        identity.getBoundingClientRect().bottom,
      )
      expect(actions.getBoundingClientRect().left).toBe(identity.getBoundingClientRect().left)
      expect(identity.getBoundingClientRect().width).toBe(row.getBoundingClientRect().width)
      // No word of the title is wider than its box.
      expect(title.scrollWidth).toBe(title.clientWidth)
      host.remove()
    })

    it('keeps the actions beside a title that has room, at the end of the row', () => {
      const { host, identity, row } = header(1000, TWO)
      const actions = screen.getByRole('button', { name: 'Reply' }).parentElement as HTMLElement

      expect(actions.getBoundingClientRect().top).toBe(identity.getBoundingClientRect().top)
      expect(actions.getBoundingClientRect().right).toBe(row.getBoundingClientRect().right)
      host.remove()
    })

    it('wraps a row of actions wider than the page instead of crossing its edge', () => {
      const { host, row } = header(
        320,
        <>
          <Button variant="outline" tone="neutral" label="Snooze until Monday" />
          <Button variant="outline" tone="neutral" label="Assign to me" />
          <Button label="Reply to customer" />
        </>,
      )
      const last = screen.getByRole('button', { name: 'Reply to customer' })

      expect(last.getBoundingClientRect().right).toBeLessThanOrEqual(
        row.getBoundingClientRect().right,
      )
      expect(host.scrollWidth).toBe(host.clientWidth)
      host.remove()
    })
  })

  /**
   * The aside that stays in view, inside the frame it is built for. The law
   * below holds it when the document scrolls; here AppShell's content region
   * scrolls, and the aside's height comes from that region through `100cqb`,
   * which needs the region to be a size container. The recipe is every
   * shell's, so React holds the frame for all of them.
   */
  describe('the aside that stays in view, in an AppShell', () => {
    const SECTIONS = ['Overview', 'Install', 'Configure', 'Deploy', 'Troubleshoot', 'Undo']

    async function framed(height: number) {
      await browser.viewport(1280, height)
      render(
        <AppShell sidebar={<Button variant="ghost" tone="neutral" label="Runbooks" />}>
          <DetailPage
            backLabel="Back"
            onBack={() => {}}
            title="Rotate the signing keys"
            stickyAside
            aside={SECTIONS.map((label) => (
              <Card key={label}>{label}</Card>
            ))}
          >
            <Stack gap={6}>
              {SECTIONS.map((label) => (
                <Stack gap={3} key={label}>
                  <Heading>{label}</Heading>
                  <Card>
                    <Stack gap={3}>
                      {SECTIONS.map((line) => (
                        <p key={line}>{`${label}: ${line}.`}</p>
                      ))}
                    </Stack>
                  </Card>
                </Stack>
              ))}
            </Stack>
          </DetailPage>
        </AppShell>,
      )
      const region = screen.getByRole('main')
      const root = region.querySelector('[data-member="detail-page"]') as HTMLElement
      const body = root.querySelector('[data-sticky-aside]') as HTMLElement
      const [main, aside] = [...body.children] as HTMLElement[]
      return {
        region,
        main: main as HTMLElement,
        aside: aside as HTMLElement,
        inset: Number.parseFloat(getComputedStyle(root).paddingTop),
      }
    }

    it('stops the page’s inset below the top of the content region, under the topbar', async () => {
      const { region, main, aside, inset } = await framed(800)
      const top = region.getBoundingClientRect().top
      const before = main.getBoundingClientRect().top
      region.scrollTop = 500
      await vi.waitFor(() => expect(main.getBoundingClientRect().top).toBeCloseTo(before - 500, 0))
      await vi.waitFor(() => expect(aside.getBoundingClientRect().top).toBeCloseTo(top + inset, 0))
      expect(aside.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        region.getBoundingClientRect().bottom,
      )
      await browser.viewport(1280, 800)
    })

    it('is never taller than the content region, which is shorter than the window', async () => {
      const { region, main, aside, inset } = await framed(480)
      expect(getComputedStyle(region).containerType).toBe('size')
      const before = main.getBoundingClientRect().top
      region.scrollTop = 400
      await vi.waitFor(() => expect(main.getBoundingClientRect().top).toBeCloseTo(before - 400, 0))
      // The region is the window less the topbar, so a cap from the window would cross its end.
      expect(region.clientHeight).toBeLessThan(window.innerHeight)
      expect(aside.getBoundingClientRect().height).toBeCloseTo(region.clientHeight - inset * 2, 0)
      expect(aside.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        region.getBoundingClientRect().bottom - inset + 1,
      )
      expect(aside.scrollHeight).toBeGreaterThan(aside.clientHeight)
      await browser.viewport(1280, 800)
    })
  })
})

detailPageAsideLaw({ shell: 'React', adapter: reactAdapter })

describe('AuthPage', () => {
  it('renders its own landmark, because there is no shell to provide one', () => {
    render(
      <AuthPage title="Sign in">
        <FormField label="Email">
          <Input type="email" />
        </FormField>
      </AuthPage>,
    )
    expect(screen.getByRole('main')).toBeTruthy()
  })

  it('makes the card’s title the page’s h1', () => {
    render(
      <AuthPage title="Sign in" description="Use your work address.">
        <FormField label="Email">
          <Input type="email" />
        </FormField>
      </AuthPage>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy()
  })

  it('stretches the submit, the only place a Button stretches', () => {
    // The card sets the width, and a content-width submit under full-width
    // fields looks detached. The archetype's layout stretches it, not Button's API.
    render(
      <AuthPage title="Sign in">
        <FormField label="Email">
          <Input type="email" />
        </FormField>
        <Button label="Sign in" type="submit" />
      </AuthPage>,
    )
    const submit = screen.getByRole('button', { name: 'Sign in' })
    const card = submit.parentElement as HTMLElement
    // The card wrapper has its own inset, and the submit fills the content box,
    // so the card sets the width.
    const cardStyle = getComputedStyle(card)
    const content =
      card.getBoundingClientRect().width -
      Number.parseFloat(cardStyle.paddingInlineStart) -
      Number.parseFloat(cardStyle.paddingInlineEnd)
    expect(submit.getBoundingClientRect().width).toBeCloseTo(content, 0)
  })

  /**
   * The login card's structure (the common login-card composition).
   *
   * There are three checks. The first is the edge: the heading is start-aligned,
   * on the same edge as the labels below it.
   */
  it('starts the heading on the fields’ edge, not the card’s centre', () => {
    render(
      <AuthPage title="Sign in to Relay" description="Enter the address your team invited.">
        <FormField label="Email">
          <Input type="email" />
        </FormField>
      </AuthPage>,
    )
    const title = screen.getByRole('heading', { level: 1, name: 'Sign in to Relay' })
    expect(getComputedStyle(title).textAlign).toBe('start')

    // The check is about an edge, so it is measured instead of read from a
    // property. A centred title moves with its length and a start-aligned one
    // does not.
    const label = screen.getByText('Email')
    expect(title.getBoundingClientRect().left).toBeCloseTo(label.getBoundingClientRect().left, 0)
  })

  it('stretches the secondary action too, because the pair is one decision', () => {
    render(
      <AuthPage title="Sign in">
        <FormField label="Email">
          <Input type="email" />
        </FormField>
        <Stack gap={3}>
          <Button label="Sign in" type="submit" />
          <Button variant="outline" tone="neutral" label="Email me a sign-in link" />
        </Stack>
      </AuthPage>,
    )
    const submit = screen.getByRole('button', { name: 'Sign in' })
    const secondary = screen.getByRole('button', { name: 'Email me a sign-in link' })

    expect(secondary.getBoundingClientRect().width).toBeCloseTo(
      submit.getBoundingClientRect().width,
      0,
    )
    // They are a pair, closer together than the card's gap between fields. The
    // Stack holds them, and the card holds the Stack.
    const stack = submit.parentElement as HTMLElement
    const card = stack.parentElement as HTMLElement
    const gap = secondary.getBoundingClientRect().top - submit.getBoundingClientRect().bottom
    expect(gap).toBeCloseTo(Number.parseFloat(getComputedStyle(stack).rowGap), 0)
    expect(gap).toBeLessThan(Number.parseFloat(getComputedStyle(card).rowGap))
  })

  it('ends the card with its own line, inside the card and not under it', () => {
    const { container } = render(
      <AuthPage
        title="Sign in"
        cardFooter={
          <>
            {'Don’t have an account? '}
            <Link href="#signup">Sign up</Link>
          </>
        }
        footer={<Link href="#help">Support</Link>}
      >
        <FormField label="Email">
          <Input type="email" />
        </FormField>
        <Button label="Sign in" type="submit" />
      </AuthPage>,
    )

    const signUp = screen.getByRole('link', { name: 'Sign up' })
    const support = screen.getByRole('link', { name: 'Support' })
    // The Card is the surface the submit sits on. The sign-up line is on it, and
    // the page-level footer line is not.
    const card = (screen.getByRole('button', { name: 'Sign in' }).parentElement as HTMLElement)
      .parentElement as HTMLElement
    expect(card.contains(signUp)).toBe(true)
    expect(card.contains(support)).toBe(false)
    expect(container.firstElementChild?.contains(support)).toBe(true)

    // Centred, unlike the heading.
    expect(getComputedStyle(signUp.parentElement as HTMLElement).textAlign).toBe('center')
  })
})

describe('Dashboard', () => {
  it('sizes the stat row to the number of stats', () => {
    // Two stats in a four-column grid would leave two empty columns.
    const { container } = render(
      <Dashboard
        title="Overview"
        stats={[
          { label: 'A', value: '1' },
          { label: 'B', value: '2' },
        ]}
        primary={<Dashboard.Panel>body</Dashboard.Panel>}
      />,
    )
    const stats = container.querySelector('[data-count]') as HTMLElement
    expect(stats.dataset['count']).toBe('2')
    expect(getComputedStyle(stats).gridTemplateColumns.split(' ')).toHaveLength(2)
  })

  it('weights the body only when there is a second column', () => {
    const { container: withSecondary } = render(
      <Dashboard
        title="Overview"
        primary={<Dashboard.Panel>a</Dashboard.Panel>}
        secondary={<Dashboard.Panel>b</Dashboard.Panel>}
      />,
    )
    expect(withSecondary.querySelector('[data-secondary]')).not.toBeNull()

    const { container: alone } = render(
      <Dashboard title="Overview" primary={<Dashboard.Panel>a</Dashboard.Panel>} />,
    )
    expect(alone.querySelector('[data-secondary]')).toBeNull()
  })

  it('gives a titled panel a real heading with the section-heading recipe', () => {
    render(
      <Dashboard
        title="Overview"
        primary={<Dashboard.Panel title="Recent tickets">body</Dashboard.Panel>}
      />,
    )
    const heading = screen.getByRole('heading', { level: 2, name: 'Recent tickets' })
    expect(getComputedStyle(heading).textTransform).toBe('uppercase')
  })

  it('draws a panel’s title as Card’s title, so the section-heading recipe is written once', () => {
    render(
      <>
        <Dashboard.Panel title="Recent tickets">body</Dashboard.Panel>
        <Card title="Billing">body</Card>
      </>,
    )
    const panel = screen.getByRole('heading', { level: 2, name: 'Recent tickets' })
    const card = screen.getByRole('heading', { level: 2, name: 'Billing' })
    expect(panel.className).toBe(card.className)
  })

  it('leaves an untitled panel unlabelled rather than inventing a name', () => {
    render(<Dashboard title="Overview" primary={<Dashboard.Panel>body</Dashboard.Panel>} />)
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)
  })
})

/**
 * The archetype grids follow the Grid rule (`docs/layout.md`).
 *
 * The page declares itself a container, and its content box is exactly the
 * space its regions have, because the inset is subtracted before the query is
 * answered. So a stat row queries the page, gets the width it actually
 * occupies, and steps down as a `Grid` does: full count, then `ceil(N/2)`,
 * then one. It is written in the archetype, not reused, because this row's
 * gutter is the page's own token and `Grid`'s gap is a space step. The rule is
 * shared, but the mechanism cannot be.
 *
 * The window is 1280 in every case here. Only the host changes.
 */
describe('the archetype grids follow the Grid rule', () => {
  function statsIn(width: number, count: number) {
    const host = fixedWidthHost(width)
    render(
      <Dashboard
        title="Overview"
        stats={Array.from({ length: count }, (_, index) => ({
          label: `Stat ${index + 1}`,
          value: String(index + 1),
        }))}
        primary={<Dashboard.Panel>body</Dashboard.Panel>}
      />,
      { container: host },
    )
    const stats = host.querySelector('[data-count]') as HTMLElement
    return { host, tracks: getComputedStyle(stats).gridTemplateColumns.split(' ').length }
  }

  it('gives the stat row its full count where the page has room', () => {
    const { host, tracks } = statsIn(1200, 4)
    expect(tracks).toBe(4)
    host.remove()
  })

  it('halves it, rounded up, in the middle band', () => {
    for (const [count, expected] of [
      [2, 1],
      [3, 2],
      [4, 2],
    ] as const) {
      const { host, tracks } = statsIn(700, count)
      expect(tracks, `${count} stats`).toBe(expected)
      host.remove()
    }
  })

  it('falls to one column below 28rem', () => {
    const { host, tracks } = statsIn(400, 4)
    expect(tracks).toBe(1)
    host.remove()
  })

  it('stacks the dashboard’s second column below 44rem', () => {
    // Weighted or not, there are two columns, and a 2fr/1fr split on a phone
    // puts a narrow column beside a narrower one.
    const narrow = fixedWidthHost(700)
    render(
      <Dashboard
        title="Overview"
        primary={<Dashboard.Panel>a</Dashboard.Panel>}
        secondary={<Dashboard.Panel>b</Dashboard.Panel>}
      />,
      { container: narrow },
    )
    const body = narrow.querySelector('[data-secondary]') as HTMLElement
    expect(getComputedStyle(body).gridTemplateColumns.split(' ')).toHaveLength(1)

    const wide = fixedWidthHost(1200)
    render(
      <Dashboard
        title="Overview"
        primary={<Dashboard.Panel>a</Dashboard.Panel>}
        secondary={<Dashboard.Panel>b</Dashboard.Panel>}
      />,
      { container: wide },
    )
    const wideBody = wide.querySelector('[data-secondary]') as HTMLElement
    expect(getComputedStyle(wideBody).gridTemplateColumns.split(' ')).toHaveLength(2)

    narrow.remove()
    wide.remove()
  })

  it('moves the detail page’s aside below the main column under 44rem', () => {
    // The aside's width is a token, so on a narrow page it would otherwise leave
    // the main column, the page's actual subject, only a sliver.
    const host = fixedWidthHost(700)
    render(
      <DetailPage backLabel="Back" onBack={() => {}} title="T-2041" aside={<Card>meta</Card>}>
        <Card>body</Card>
      </DetailPage>,
      { container: host },
    )
    const body = host.querySelector('[data-aside]') as HTMLElement
    expect(getComputedStyle(body).gridTemplateColumns.split(' ')).toHaveLength(1)
    // Still present and still second: composition degrades, content does not.
    expect(screen.getByText('meta')).toBeTruthy()
    host.remove()
  })

  it('keeps the page’s gutter between them once they are stacked', () => {
    /*
     * A grid that declares only `column-gap` has no gap once it stacks. Main and
     * aside sit 0px apart, and the supporting column reads as a continuation of
     * the article above it. The gap is measured between the two boxes, not read
     * from the property, because the property is what fails: a `column-gap`
     * that resolves correctly but applies to an axis that no longer exists.
     */
    const host = fixedWidthHost(700)
    render(
      <DetailPage backLabel="Back" onBack={() => {}} title="T-2041" aside={<Card>meta</Card>}>
        <Card>body</Card>
      </DetailPage>,
      { container: host },
    )
    const body = host.querySelector('[data-aside]') as HTMLElement
    const [main, aside] = [...body.children] as HTMLElement[]
    const gap =
      (aside as HTMLElement).getBoundingClientRect().top -
      (main as HTMLElement).getBoundingClientRect().bottom

    // The page's own `--pm-content-gutter`, which already separates every other
    // region on this page.
    expect(gap).toBeCloseTo(
      Number.parseFloat(getComputedStyle(body).rowGap),
      // Subpixel layout, so the test checks the token, not the third decimal.
      1,
    )
    expect(getComputedStyle(body).rowGap).toBe(tokenLength('--pm-space-6'))
    expect(gap).toBeGreaterThan(0)
    host.remove()
  })
})

/**
 * The one-h1 law, which covers two components (`design/components/hero.md`).
 *
 * A page composes exactly one of PageHeader or Hero: PageHeader for a working
 * screen, Hero for an opening one. The archetypes above each check the
 * PageHeader case. This block checks the Hero case and the failure, by
 * rendering both openers into one tree and counting the headings a reader
 * gets.
 *
 * The source-level checks (which components may render an `<h1>`, and which
 * pages in the repo compose two openers) are in
 * `packages/rules/src/repo-laws.test.ts`, where a test can read files.
 */
describe('the one-h1 law covers PageHeader and Hero', () => {
  const h1s = () => screen.queryAllByRole('heading', { level: 1 })

  it('gives a working screen its one h1 through PageHeader', () => {
    render(
      <SettingsPage title="Settings">
        <SettingsRow label="Reduce motion" control={<Switch />} />
      </SettingsPage>,
    )
    expect(h1s()).toHaveLength(1)
  })

  it('gives an opening screen its one h1 through Hero', () => {
    render(<Hero title="One vocabulary. Any number of faces." lede="A decision system." />)
    expect(h1s()).toHaveLength(1)
  })

  it('gives the reader two h1s when a page composes both, which is the violation', () => {
    // The case the repo law fails on, rendered here so the effect is visible. A
    // Hero stacked on a PageHeader gives two page titles, and a screen reader's
    // heading list shows both.
    render(
      <>
        <PageHeader title="Overview" />
        <Hero title="One vocabulary. Any number of faces." />
      </>,
    )
    expect(h1s()).toHaveLength(2)
  })
})
