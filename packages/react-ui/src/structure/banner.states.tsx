'use client'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Banner } from './Banner'

/** States fixture, from `design/components/banner.md`'s States table. */

const noop = () => {}

export const states: ComponentStates = {
  component: 'Banner',

  entries: [
    {
      name: 'neutral — a fact about the session, with the way out',
      render: () => (
        <Banner action={<Button variant="ghost" tone="neutral" size="sm" label="Stop viewing" />}>
          You are viewing Northwind Traders as a member of support.
        </Banner>
      ),
      expect: { 'data-tone': 'neutral', role: 'status' },
    },
    {
      name: 'info',
      render: () => (
        <Banner tone="info">
          This page shows the snapshot taken at 09:00. Live data is back at 10:00.
        </Banner>
      ),
      expect: { 'data-tone': 'info', role: 'status' },
    },
    {
      name: 'warning — with an action',
      render: () => (
        <Banner
          tone="warning"
          action={<Button variant="soft" tone="accent" size="sm" label="Upgrade plan" />}
        >
          Your trial ends in 3 days.
        </Banner>
      ),
      expect: { 'data-tone': 'warning', role: 'status' },
    },
    {
      name: 'danger',
      render: () => (
        <Banner tone="danger">
          Payments are unavailable. Orders are saved and charged when the service returns.
        </Banner>
      ),
      expect: { 'data-tone': 'danger', role: 'alert' },
    },
    {
      name: 'dismissible — a reminder the reader may hide',
      render: () => (
        <Banner tone="info" onDismiss={noop}>
          Scheduled maintenance on Sunday from 02:00 to 04:00 UTC.
        </Banner>
      ),
      expect: { 'data-tone': 'info' },
    },
    {
      name: 'a long message — it wraps, and the action moves under it',
      render: () => (
        <Banner
          tone="warning"
          action={<Button variant="ghost" tone="neutral" size="sm" label="Status page" />}
          onDismiss={noop}
        >
          Replies sent by email are delayed by about twenty minutes while the mail queue catches up.
          Replies sent from this page arrive at once. Nothing is lost, and the queue is expected to
          clear within the hour.
        </Banner>
      ),
      expect: { 'data-tone': 'warning' },
    },
  ],

  /*
   * Every state is a prop's. The tone selectors are listed because a fixture
   * that renders a tone does not prove the stylesheet keys on it.
   */
  requiredSelectors: ['[data-tone="danger"]'],
}
