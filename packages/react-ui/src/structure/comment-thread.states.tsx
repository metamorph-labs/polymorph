import { type ComponentStates } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/comment-thread.module.css'
import { AttachmentChip } from '../ai/AttachmentChip'
import { Button } from '../controls/Button'
import { Link } from '../controls/Link'
import { Textarea } from '../controls/Textarea'
import { FormField } from '../controls/FormField'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Avatar } from './Avatar'
import { Badge } from './Badge'
import { CommentThread } from './CommentThread'
import { RelativeTime } from './RelativeTime'
import { Text } from './Text'

/** States fixture, from `design/components/comment-thread.md`'s States table. */

/** The app's controls for a comment. They take no handler here, as nothing is listening. */
const ACTIONS = (
  <>
    <Button variant="ghost" tone="neutral" size="sm" label="Reply" />
    <Button variant="ghost" tone="neutral" size="sm" label="Edit" />
  </>
)

/** An address with no break opportunity, and a service account's name with none. */
const LONG_ADDRESS =
  'https://status.example.com/incidents/2026-11-14-eu-west-1-webhook-delivery-retried-with-a-duplicated-promo-code'
const LONG_AUTHOR = 'svc-webhook-delivery-eu-west-1-production-retry-worker'

export const states: ComponentStates = {
  component: 'CommentThread',

  entries: [
    {
      name: 'a thread with replies',
      render: () => (
        <CommentThread label="Comments">
          <CommentThread.Comment
            author="Ada Okafor"
            avatar={<Avatar name="Ada Okafor" />}
            time={<RelativeTime value="2026-11-14T09:40:00Z" mode="absolute" />}
            actions={ACTIONS}
            replies={
              <>
                <CommentThread.Comment
                  author="Bao Tran"
                  avatar={<Avatar name="Bao Tran" />}
                  time="09:52"
                  actions={ACTIONS}
                >
                  <Text>It retries on any 5xx. The second attempt sent the cached payload.</Text>
                </CommentThread.Comment>
                <CommentThread.Comment
                  author="Ada Okafor"
                  avatar={<Avatar name="Ada Okafor" />}
                  time="10:05"
                  actions={ACTIONS}
                >
                  <Text>So the code was applied twice. I will open a fix.</Text>
                </CommentThread.Comment>
              </>
            }
          >
            <Text>
              The webhook retried twice with the same promo code. Is the retry idempotent?
            </Text>
          </CommentThread.Comment>
          <CommentThread.Comment
            author="Carmen Ruiz"
            avatar={<Avatar name="Carmen Ruiz" />}
            time="11:20"
            actions={ACTIONS}
          >
            <Text>The customer confirmed that the second charge was refunded.</Text>
          </CommentThread.Comment>
        </CommentThread>
      ),
      expect: { 'aria-label': 'Comments' },
    },
    {
      name: 'an internal note',
      render: () => (
        <CommentThread label="Ticket messages">
          <CommentThread.Comment
            author="Bao Tran"
            avatar={<Avatar name="Bao Tran" />}
            time="Yesterday"
            meta={<Badge tone="warning">Internal note</Badge>}
          >
            <Text>The customer is on the legacy plan. Do not offer the annual discount.</Text>
          </CommentThread.Comment>
        </CommentThread>
      ),
    },
    {
      name: 'an edited comment',
      render: () => (
        <CommentThread label="Comments">
          <CommentThread.Comment
            author="Carmen Ruiz"
            avatar={<Avatar name="Carmen Ruiz" />}
            time="2 Nov"
            edited
            actions={ACTIONS}
          >
            <Text>The export finished. The archive is kept for thirty days.</Text>
          </CommentThread.Comment>
        </CommentThread>
      ),
    },
    {
      name: 'a resolved thread',
      render: () => (
        <CommentThread label="Comments">
          <CommentThread.Comment
            author="Ada Okafor"
            avatar={<Avatar name="Ada Okafor" />}
            time="Monday"
            meta={<Badge tone="success">Resolved</Badge>}
            replies={
              <CommentThread.Comment
                author="Bao Tran"
                avatar={<Avatar name="Bao Tran" />}
                time="Monday"
              >
                <Text>Renamed in the latest version.</Text>
              </CommentThread.Comment>
            }
          >
            <Text>This heading should say “Delivery”, not “Shipping”.</Text>
          </CommentThread.Comment>
        </CommentThread>
      ),
    },
    {
      name: 'attachments and a mention',
      render: () => (
        <CommentThread label="Comments">
          <CommentThread.Comment
            author="Ada Okafor"
            avatar={<Avatar name="Ada Okafor" />}
            time="09:40"
            actions={ACTIONS}
          >
            <Text>
              <Link href="#people/bao">@Bao Tran</Link> here is the delivery log and the policy we
              agreed on.
            </Text>
            <Inline gap={2} wrap>
              <AttachmentChip name="delivery.log" size={48_210} />
              <AttachmentChip name="retry-policy.pdf" size={184_320} />
            </Inline>
          </CommentThread.Comment>
        </CommentThread>
      ),
    },
    {
      name: 'a reply to a reply — drawn at the second level',
      render: () => (
        <CommentThread label="Comments">
          <CommentThread.Comment
            author="Ada Okafor"
            avatar={<Avatar name="Ada Okafor" />}
            time="09:40"
            replies={
              <CommentThread.Comment
                author="Bao Tran"
                avatar={<Avatar name="Bao Tran" />}
                time="09:52"
                replies={
                  <CommentThread.Comment
                    author="Carmen Ruiz"
                    avatar={<Avatar name="Carmen Ruiz" />}
                    time="10:01"
                  >
                    <Text>Agreed. The policy allows five attempts.</Text>
                  </CommentThread.Comment>
                }
              >
                <Text>We should cap the retries at five.</Text>
              </CommentThread.Comment>
            }
          >
            <Text>How many times may a delivery be retried?</Text>
          </CommentThread.Comment>
        </CommentThread>
      ),
    },
    {
      name: 'long unbroken text at phone width',
      render: () => (
        <div className={styles.harnessPhone}>
          <CommentThread label="Comments">
            <CommentThread.Comment
              author={LONG_AUTHOR}
              avatar={<Avatar name={LONG_AUTHOR} />}
              time="09:40"
              meta={<Badge tone="warning">Internal note</Badge>}
              actions={ACTIONS}
            >
              <Text>{LONG_ADDRESS}</Text>
            </CommentThread.Comment>
          </CommentThread>
        </div>
      ),
    },
    {
      name: 'followed by a composer',
      render: () => (
        <Stack gap={4}>
          <CommentThread label="Comments">
            <CommentThread.Comment
              author="Ada Okafor"
              avatar={<Avatar name="Ada Okafor" />}
              time="09:40"
            >
              <Text>Can someone check the retry schedule?</Text>
            </CommentThread.Comment>
          </CommentThread>
          <FormField label="Reply">
            <Textarea rows={3} />
          </FormField>
          <Inline justify="end">
            <Button variant="solid" tone="accent" label="Comment" />
          </Inline>
        </Stack>
      ),
    },
  ],

  /*
   * None. Nothing in a comment is hovered, focused or pressed: its controls
   * are the app's members, which carry their own states. Every rule the
   * stylesheet writes is reached by an entry above.
   */
  requiredSelectors: [],
}
