import { createElement, type SVGProps } from 'react'

import {
  AppWindow,
  Archive,
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpNarrowWide,
  ArrowUpRight,
  Ban,
  Bell,
  Binoculars,
  Blocks,
  Bold,
  Brain,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleQuestionMark,
  ClipboardCopy,
  Clock,
  Cloud,
  Code,
  Copy,
  Cpu,
  Download,
  Droplet,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FlipHorizontal2,
  Folder,
  Funnel,
  GitCompare,
  Globe,
  GripVertical,
  Heading,
  House,
  Inbox,
  Info,
  Italic,
  KeyRound,
  Laptop,
  Link,
  List,
  ListOrdered,
  LoaderCircle,
  Lock,
  LockOpen,
  Mail,
  Menu,
  MessageSquare,
  Mic,
  Minus,
  Monitor,
  Moon,
  MousePointerClick,
  PanelRight,
  Paperclip,
  Pause,
  Pencil,
  Pin,
  Play,
  Plug,
  Plus,
  Quote,
  Redo2,
  RotateCw,
  ScanFace,
  ScrollText,
  Search,
  SendHorizontal,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Square,
  SquareCode,
  SquareTerminal,
  Star,
  Strikethrough,
  Sun,
  Sunrise,
  Table,
  Tag,
  TextQuote,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  Truck,
  Undo2,
  Upload,
  User,
  Users,
  X,
  type IconNode,
} from 'lucide'

import type { IconRole } from '@polymorph/engine'

/** One glyph: the SVG elements that draw it, each as a tag and its attributes. */
export type Glyph = IconNode

/**
 * The role -> glyph assignment. **The only file in the repository allowed to
 * import an icon set** (`lucide`). The `polymorph/no-external-icons` rule
 * enforces this, with this path as its only `allowIn` entry.
 *
 * A glyph is only its drawing. lucide's data package exports each icon as the
 * list of SVG elements that draw it, and `Icon` renders the `<svg>` around them.
 * No icon library runs in the application.
 *
 * Because the set is confined to this file, remapping one role or replacing
 * lucide with another icon family is an edit here and changes no call site.
 *
 * The imports are named, not taken from lucide's `icons` record, so the
 * 6000-export library stays tree-shakable. `map.test.ts` checks every entry
 * against `design/icons.json` by comparing it with lucide's export of that name,
 * so a role pointing at the wrong glyph fails the suite.
 */
export const ICON_MAP: Record<IconRole, Glyph> = {
  // action
  add: Plus,
  remove: Minus,
  delete: Trash2,
  edit: Pencil,
  duplicate: Copy,
  copy: ClipboardCopy,
  search: Search,
  filter: Funnel,
  sort: ArrowUpDown,
  'sort-asc': ArrowUpNarrowWide,
  'sort-desc': ArrowDownWideNarrow,
  refresh: RotateCw,
  // `rotate` (turn the object itself) shares refresh's glyph for now. The
  // meanings are separate, so the glyphs can diverge later.
  rotate: RotateCw,
  flip: FlipHorizontal2,
  download: Download,
  upload: Upload,
  share: Share2,
  'open-external': ExternalLink,
  settings: Settings,
  overflow: Ellipsis,
  link: Link,
  // Agent runtime actions: run a tool, pause a run, undo a commit, connect a
  // source.
  run: Play,
  pause: Pause,
  undo: Undo2,
  connect: Plug,
  // An action the agent takes in a browser window the person is watching.
  click: MousePointerClick,
  // Conversation actions: send a prompt, stop a generation, attach a file, and
  // rate an answer helpful or unhelpful. `stop` is a plain square, not a circled
  // one, because the glyph sits inside a Button that already draws a frame.
  send: SendHorizontal,
  stop: Square,
  attach: Paperclip,
  // Start a recording of the reader's voice, which the application makes (RecordButton).
  record: Mic,
  helpful: ThumbsUp,
  unhelpful: ThumbsDown,
  // Rich-text editing (RichTextInput's toolbar): redo, the undo it pairs with, and the formats
  // a document holds. `quote` formats a block as a quotation; `cite` is the source a sentence
  // relies on, so the two are separate roles with separate glyphs.
  redo: Redo2,
  bold: Bold,
  italic: Italic,
  strikethrough: Strikethrough,
  code: Code,
  heading: Heading,
  'list-bulleted': List,
  'list-numbered': ListOrdered,
  quote: TextQuote,
  'code-block': SquareCode,

  // navigation
  back: ArrowLeft,
  forward: ArrowRight,
  up: ArrowUp,
  down: ArrowDown,
  previous: ChevronLeft,
  next: ChevronRight,
  expand: ChevronDown,
  collapse: ChevronUp,
  home: House,
  menu: Menu,
  close: X,

  // status
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
  help: CircleQuestionMark,
  loading: LoaderCircle,
  locked: Lock,
  unlocked: LockOpen,
  visible: Eye,
  hidden: EyeOff,
  favorite: Star,
  pinned: Pin,
  notification: Bell,
  // An egress log's three states: data left, a request was refused, or nothing
  // left because it ran locally.
  egress: ArrowUpRight,
  denied: Ban,
  local: Cpu,
  // Watch mode: the browser driver's default, in which every step is visible.
  watch: Binoculars,
  // The kernel filling a saved sign-in after the person confirms. It never
  // means the agent typing a password it read.
  signin: ScanFace,

  // object
  user: User,
  team: Users,
  calendar: Calendar,
  time: Clock,
  document: FileText,
  table: Table,
  folder: Folder,
  tag: Tag,
  inbox: Inbox,
  archive: Archive,
  comment: MessageSquare,
  // Personal runtime objects: sources, places code runs, what it holds and
  // what it produces. `droplet` is the only brand-shaped role, and it follows
  // the same process as every other role (icons.md rule 6).
  mail: Mail,
  device: Laptop,
  model: Sparkles,
  terminal: SquareTerminal,
  key: KeyRound,
  network: Globe,
  cloud: Cloud,
  tool: Blocks,
  ledger: ScrollText,
  droplet: Droplet,
  briefing: Sunrise,
  kernel: ShieldCheck,
  diff: GitCompare,
  browser: AppWindow,
  delivery: Truck,
  // Conversation objects: the model's reasoning, the source a sentence cites,
  // and the artifact a turn produced beside the thread.
  reasoning: Brain,
  cite: Quote,
  artifact: PanelRight,

  // form
  confirm: Check,
  // `remove` and `indeterminate` share `minus` for now but are separate roles.
  // Either can change glyph without touching a call site (icons.md).
  indeterminate: Minus,
  // `close` and `clear` share `x` in the same way: dismissing a surface is not
  // emptying a value.
  clear: X,
  drag: GripVertical,
  'mode-light': Sun,
  'mode-dark': Moon,
  'mode-system': Monitor,
  // One mark of a Rating. `favorite` and `rating` share `star` but are separate roles: marking a
  // thing to keep is not scoring it.
  rating: Star,
}

/**
 * Renders a role's glyph: the `<svg>` around its elements. It lives here because
 * this is the only file that may import the set. `Icon` names a role and this
 * draws it. lucide's presentation attributes are the fallback, and the CSS
 * module's tokens override width, height and stroke width.
 */
export function GlyphSvg({
  glyph,
  ...props
}: { glyph: IconRole } & Omit<SVGProps<SVGSVGElement>, 'children'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable={false}
      {...props}
    >
      {ICON_MAP[glyph].map(([tag, attributes], index) =>
        createElement(tag, { key: index, ...svgProps(attributes) }),
      )}
    </svg>
  )
}

/** SVG attribute names as React takes them: `stroke-width` becomes `strokeWidth`. */
function svgProps(
  attributes: Record<string, string | number | undefined>,
): Record<string, string | number> {
  const props: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue
    props[name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value
  }
  return props
}
