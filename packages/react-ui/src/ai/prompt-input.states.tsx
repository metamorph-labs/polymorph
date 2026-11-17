'use client'

import { type ComponentStates } from '@polymorph/react'
import { RecordButton } from '../controls/RecordButton'
import { Select } from '../controls/Select'
import { PromptInput, type PromptAttachment, type PromptTrigger } from './PromptInput'

/** States fixture, from `design/components/prompt-input.md`'s States table. */

const noop = () => {}

const MODELS = [
  { value: 'fast', label: 'Fast' },
  { value: 'thorough', label: 'Thorough' },
]

export const ATTACHMENTS: PromptAttachment[] = [
  { id: 'a', name: 'retry-policy.pdf', size: 184_320 },
  { id: 'b', name: 'screenshot.png', size: 48_210, status: 'uploading' },
]

export const TRIGGERS: PromptTrigger[] = [
  {
    char: '@',
    label: 'People',
    options: [
      { id: 'ada', label: 'Ada Lovelace', description: 'Engineering' },
      { id: 'grace', label: 'Grace Hopper', description: 'Compilers' },
      { id: 'alan', label: 'Alan Turing', description: 'Research' },
    ],
  },
  {
    char: '/',
    label: 'Commands',
    at: 'start',
    options: [
      { id: 'summarize', label: 'summarize', icon: 'document' },
      { id: 'search', label: 'search', icon: 'search' },
    ],
  },
]

export const states: ComponentStates = {
  component: 'PromptInput',

  entries: [
    {
      name: 'empty — one line, send waits for words',
      render: () => <PromptInput label="Message" placeholder="Ask anything…" onSubmit={noop} />,
      expect: { 'data-empty': '', 'data-state': null },
    },
    {
      name: 'with a prompt — send is live',
      render: () => (
        <PromptInput
          label="Message"
          defaultValue="Why did the webhook retry twice with the same promo code?"
          onSubmit={noop}
        />
      ),
      expect: { 'data-empty': null },
    },
    {
      name: 'grown — several lines, up to the ceiling',
      render: () => (
        <PromptInput
          label="Message"
          maxRows={4}
          defaultValue={
            'Line one of a longer prompt.\nLine two, with more context.\nLine three.\nLine four.\nLine five scrolls inside the field.'
          }
          onSubmit={noop}
        />
      ),
      expect: { 'data-max-rows': '4' },
    },
    {
      name: 'attachable — the attach control, and two chips in the frame',
      render: () => (
        <PromptInput
          label="Message"
          placeholder="Ask about these files…"
          attachments={ATTACHMENTS}
          onAttach={noop}
          onReject={noop}
          onRemoveAttachment={noop}
          onSubmit={noop}
        />
      ),
    },
    {
      name: 'the app’s slots — a model picker leading, a hint beneath',
      render: () => (
        <PromptInput
          label="Message"
          placeholder="Ask anything…"
          leading={<Select size="sm" options={MODELS} defaultValue="fast" aria-label="Model" />}
          hint="Enter to send · Shift+Enter for a new line"
          onSubmit={noop}
        />
      ),
    },
    {
      // Focused on mount, because the list opens while the caret is in a token.
      name: 'suggesting — the people an @ lists, above the composer',
      render: () => (
        <PromptInput
          label="Message"
          defaultValue="Ask @"
          autoFocus
          triggers={TRIGGERS}
          onSubmit={noop}
        />
      ),
    },
    {
      name: 'streaming — send has become stop',
      render: () => <PromptInput label="Message" streaming onStop={noop} onSubmit={noop} />,
      expect: { 'data-state': 'streaming' },
    },
    {
      name: 'disabled',
      render: () => (
        <PromptInput
          label="Message"
          disabled
          defaultValue="A prompt nobody can send"
          onSubmit={noop}
        />
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: 'voice input — a RecordButton in the trailing slot',
      render: () => (
        <PromptInput
          label="Message"
          placeholder="Ask anything…"
          trailing={
            <RecordButton size="sm" label="Record a voice message" stopLabel="Stop recording" />
          }
          onSubmit={noop}
        />
      ),
    },
    {
      name: 'recording a voice message — the time and the level beside send',
      render: () => (
        <PromptInput
          label="Message"
          placeholder="Ask anything…"
          trailing={
            <RecordButton
              size="sm"
              label="Record a voice message"
              stopLabel="Stop recording"
              recording
              elapsed={9}
              level={0.4}
            />
          }
          onSubmit={noop}
        />
      ),
    },
  ],

  /*
   * The frame's hover and the ring on keyboard focus come from the pointer and
   * the keyboard. `dragover` is a pointer carrying a file. The buttons' own
   * states belong to Button.
   */
  requiredSelectors: [':hover', ':focus-visible', '[data-state="dragover"]', '[data-disabled]'],
}
