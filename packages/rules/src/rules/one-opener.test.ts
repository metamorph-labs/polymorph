import { oneOpener } from './one-opener'
import { APP_FILE, jsxRuleTester } from './rule-tester'

jsxRuleTester().run('one-opener', oneOpener, {
  valid: [
    // One opener is allowed: either one, in as many branches as the file has,
    // as long as the page always uses the same opener.
    { filename: APP_FILE, code: `export const A = () => <PageHeader title="Inbox" />` },
    { filename: APP_FILE, code: `export const A = () => <Hero title="Polymorph" lede={lede} />` },
    {
      filename: APP_FILE,
      code: `export const A = () => (ok ? <PageHeader title="Inbox" /> : <PageHeader title="No" />)`,
    },
    // Naming an opener is not rendering it. The rule reads JSX, not identifiers.
    {
      filename: APP_FILE,
      code: `import { Hero, PageHeader } from '@polymorph/react-ui'
             export const A = () => <PageHeader title="Inbox" />`,
    },
    { filename: APP_FILE, code: `const opener = collapsed ? Hero : PageHeader` },
  ],

  invalid: [
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Stack>
                 <PageHeader title="Inbox" />
                 <Hero title="Welcome" />
               </Stack>
             )`,
      errors: [
        {
          message:
            "Unexpected <Hero> beside <PageHeader>: each renders the page's <h1>. Keep " +
            '`<PageHeader>` on a working screen or `<Hero>` on an opening page (rung 1).',
        },
      ],
    },
    // In either order, the report is on the second one, which can be deleted
    // without losing the page's opener.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Stack>
                 <Hero title="Welcome" />
                 <PageHeader title="Inbox" />
               </Stack>
             )`,
      errors: [{ messageId: 'bothOpeners' }],
    },
    // A page archetype renders the page's <h1> from its own title, so the
    // report names it as the opener to keep, wherever it is in the module.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <>
                 <Hero title="Welcome" />
                 <PageHeader title="Inbox" />
                 <ListPage title="Inbox" emptyState={empty} />
               </>
             )`,
      errors: [
        {
          message:
            "Unexpected <PageHeader> beside <Hero>: each renders the page's <h1>. <ListPage> " +
            'renders its PageHeader from `<ListPage title="…">`: keep that and drop both here (rung 1).',
        },
      ],
    },
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <AuthPage title="Sign in">
                 <Hero title="Welcome" />
                 <PageHeader title="Sign in" />
               </AuthPage>
             )`,
      errors: [
        {
          message:
            "Unexpected <PageHeader> beside <Hero>: each renders the page's <h1>. <AuthPage> " +
            'renders its card\'s title from `<AuthPage title="…">`: keep that and drop both here ' +
            '(rung 1).',
        },
      ],
    },
    // Two openers in mutually exclusive branches are still two openers, because
    // a page that can open either way has two identities. One error, not one per pair.
    {
      filename: APP_FILE,
      code: `export const A = () => (empty ? <Hero title="Start" /> : <PageHeader title="Inbox" />)`,
      errors: 1,
    },
    // Separate components in one module, with a page of JSX between them. A
    // file-scoped rule can see this case, which is why the rule exists.
    {
      filename: APP_FILE,
      code: `export const Opening = () => <Hero title="Welcome" />
             export const Working = () => <PageHeader title="Inbox" />`,
      errors: 1,
    },
    // Rung 4 suspends the vocabulary rules but not an accessibility law, so a
    // declared zone does not allow a second h1.
    {
      filename: APP_FILE,
      code: `export const A = () => (
               <Bespoke reason="launch page">
                 <Hero title="Welcome" />
                 <PageHeader title="Inbox" />
               </Bespoke>
             )`,
      errors: 1,
    },
    // The openers are configurable. A consumer whose display tier has a third
    // opener names it here.
    {
      filename: APP_FILE,
      options: [{ openers: ['Hero', 'Splash'] }],
      code: `export const A = () => (
               <div>
                 <Splash title="Welcome" />
                 <Hero title="Welcome" />
               </div>
             )`,
      errors: [{ messageId: 'bothOpeners' }],
    },
  ],
})
