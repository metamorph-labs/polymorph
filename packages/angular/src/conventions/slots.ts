import {
  Directive,
  HostAttributeToken,
  inject,
  input,
  TemplateRef,
  untracked,
  ViewContainerRef,
  type DoCheck,
  type EmbeddedViewRef,
  type OnDestroy,
  type OnInit,
} from '@angular/core'

import { SLOT_HOST, type MemberContext } from './member'

/**
 * A node inside a value or a render prop: an `ng-template` the member renders
 * with its arguments as the template's context, the first as `$implicit`.
 * `EmptyStateProps.action` is a `NodeTemplate`, and a DataTable column's
 * `cell` is a `NodeTemplate<[Row]>`, written `<ng-template #cell let-row>`.
 *
 * A scoped slot's template takes the slot's props as its one argument, and
 * reads each of them by name as well (`bindSlot`): DataTable's `rowDetail` is
 * a `NodeTemplate<[DataTableRowDetail<Row>]>`, written
 * `<ng-template #detail let-row="row" let-close="close">`.
 */
export type NodeTemplate<Args extends readonly unknown[] = []> = TemplateRef<TemplateContext<Args>>

/** The context a `NodeTemplate` is rendered with. */
export interface TemplateContext<Args extends readonly unknown[]> {
  $implicit: Args[0]
  args: Args
}

/** A template bound to its arguments (`column.cell(row)`), which `Render` draws. */
export interface BoundTemplate {
  readonly template: TemplateRef<unknown>
  readonly args: readonly unknown[]
  /** A scoped slot's props, which the template also reads by name. */
  readonly named?: Readonly<Record<string, unknown>>
}

/** What a member renders from a value: a template, bare or bound to its arguments. */
export type Content = TemplateRef<unknown> | BoundTemplate

/** Binds a template to its arguments, or passes nothing through. */
export function bindTemplate<Args extends readonly unknown[]>(
  template: NodeTemplate<Args>,
  ...args: Args
): BoundTemplate
export function bindTemplate<Args extends readonly unknown[]>(
  template: NodeTemplate<Args> | undefined,
  ...args: Args
): BoundTemplate | undefined
export function bindTemplate<Args extends readonly unknown[]>(
  template: NodeTemplate<Args> | undefined,
  ...args: Args
): BoundTemplate | undefined {
  return template === undefined ? undefined : { template: template as TemplateRef<unknown>, args }
}

/**
 * Binds a scoped slot's template to the slot's props. The props are the
 * template's one argument, and each is a variable of the template by its own
 * name, which is how Angular reads a named value: `let-row="row"`.
 */
export function bindSlot<Props extends object>(
  template: NodeTemplate<[Props]>,
  props: Props,
): BoundTemplate
export function bindSlot<Props extends object>(
  template: NodeTemplate<[Props]> | undefined,
  props: Props,
): BoundTemplate | undefined
export function bindSlot<Props extends object>(
  template: NodeTemplate<[Props]> | undefined,
  props: Props,
): BoundTemplate | undefined {
  return template === undefined
    ? undefined
    : {
        template: template as TemplateRef<unknown>,
        args: [props],
        named: props as Readonly<Record<string, unknown>>,
      }
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3

/** Whether a node a template drew holds something to see: an element, or text that is not empty. */
function draws(node: unknown): boolean {
  // Read by its node type, not `instanceof Node`: a server render's document has no global `Node`.
  if (typeof node !== 'object' || node === null || !('nodeType' in node)) return false
  if (node.nodeType === ELEMENT_NODE) return true
  return node.nodeType === TEXT_NODE && (node as Text).data !== ''
}

/**
 * Whether a scoped slot's template draws anything for its props: a React
 * render prop that returns `undefined` draws nothing, and the member draws its
 * own content in its place (RichTextContent's entity token where the app's
 * `entity` draws nothing for a kind). A template cannot be read without
 * drawing it, so a view of it is made with the props, its bindings are
 * written, its root nodes are read, and it is destroyed; it is never inserted
 * in the document. It is made untracked, so a signal it writes is not written
 * in the computed value that asks.
 */
export function slotDraws<Props extends object>(
  template: NodeTemplate<[Props]> | undefined,
  props: Props,
): boolean {
  if (template === undefined) return false
  return untracked(() => {
    const view = (template as TemplateRef<TemplateContext<readonly unknown[]>>).createEmbeddedView({
      ...(props as Readonly<Record<string, unknown>>),
      $implicit: props,
      args: [props],
    })
    view.detectChanges()
    const drawn = view.rootNodes.some(draws)
    view.destroy()
    return drawn
  })
}

/** Whether a value is a template, bare or bound, rather than text. */
export function isTemplate(value: unknown): value is NodeTemplate<never> | BoundTemplate {
  return (
    value instanceof TemplateRef ||
    (value !== null &&
      typeof value === 'object' &&
      (value as Partial<BoundTemplate>).template instanceof TemplateRef)
  )
}

/**
 * Records the template a slot's content is rendered from:
 * `<ng-template pmSlot="footer" [pmSlotOf]="$"><ng-content select="[slot=footer]" /></ng-template>`.
 * A generated member declares one per slot it renders or reads, at the top of
 * its template, and names itself (`$`, its context), because a directive in
 * its view cannot find it reliably by injection: Angular shows a component's
 * view providers to content written inside a block as well.
 */
@Directive({ selector: 'ng-template[pmSlot]' })
export class SlotTemplate implements OnInit {
  readonly pmSlotOf = input.required<MemberContext<object>>()
  private readonly name = inject(new HostAttributeToken('pmSlot'))
  private readonly template = inject(TemplateRef)

  ngOnInit(): void {
    ;(this.pmSlotOf() as unknown as MemberContext).register(this.name, this.template)
  }
}

/**
 * Renders a slot's content where the anatomy puts it:
 * `<ng-container [pmSlotOutlet]="'footer'" [pmSlotOf]="$" />`. Inside another
 * member's content (`pmSlotInto`), it forwards the slot's members into that
 * member's slot, so the props that slot hands reach them. `pmSlotTake` renders
 * only the first so many elements (Avatar.Group's `max`).
 */
@Directive({ selector: '[pmSlotOutlet]' })
export class SlotOutlet implements OnInit, DoCheck, OnDestroy {
  readonly pmSlotOutlet = input.required<string>()
  readonly pmSlotOf = input.required<MemberContext<object>>()
  readonly pmSlotTake = input<number | undefined>(undefined)

  private readonly into = inject(SLOT_HOST, { optional: true })
  private readonly intoName = inject(new HostAttributeToken('pmSlotInto'), { optional: true })
  private readonly container = inject(ViewContainerRef)
  private view: EmbeddedViewRef<unknown> | undefined
  private undo: (() => void) | undefined
  private taken: number | undefined

  private get own(): MemberContext {
    return this.pmSlotOf() as unknown as MemberContext
  }

  ngOnInit(): void {
    const name = this.pmSlotOutlet()
    this.render()
    if (this.intoName !== null && this.into !== null && this.into !== this.own)
      this.undo = this.own.forward(name, this.into, this.intoName)
    this.own.moved()
  }

  ngDoCheck(): void {
    const take = this.pmSlotTake()
    if (take === this.taken) return
    if (this.taken !== undefined && (take === undefined || take > this.taken)) this.render()
    this.taken = take
    if (take === undefined || this.view === undefined) return
    const elements = (this.view.rootNodes as Node[]).filter(
      (node): node is Element => node.nodeType === Node.ELEMENT_NODE,
    )
    for (const element of elements.slice(Math.max(0, take))) element.remove()
  }

  ngOnDestroy(): void {
    this.undo?.()
    this.own.moved()
  }

  private render(): void {
    this.container.clear()
    const template = this.own.template(this.pmSlotOutlet())
    this.view = template === undefined ? undefined : this.container.createEmbeddedView(template)
  }
}

/**
 * Draws a template a member was handed inside a value, or bound to arguments:
 * `<ng-container [pmRender]="content" />`. A template whose arguments change
 * keeps its view and takes the new context.
 */
@Directive({ selector: '[pmRender]' })
export class Render implements DoCheck, OnDestroy {
  readonly pmRender = input<Content | null | undefined | false | string>()

  private readonly container = inject(ViewContainerRef)
  private view: EmbeddedViewRef<TemplateContext<readonly unknown[]>> | undefined
  private template: TemplateRef<unknown> | undefined

  ngDoCheck(): void {
    const value = this.pmRender()
    const bound = isTemplate(value)
      ? value instanceof TemplateRef
        ? { template: value as TemplateRef<unknown>, args: [] as readonly unknown[] }
        : (value as BoundTemplate)
      : undefined
    if (bound?.template !== this.template) {
      this.container.clear()
      this.view = undefined
      this.template = bound?.template
      if (bound !== undefined) {
        this.view = this.container.createEmbeddedView(
          bound.template as TemplateRef<TemplateContext<readonly unknown[]>>,
          { ...bound.named, $implicit: bound.args[0], args: bound.args },
        )
      }
      return
    }
    if (this.view !== undefined && bound !== undefined) {
      const context = this.view.context
      if (
        context.args.length !== bound.args.length ||
        context.args.some((arg, at) => !Object.is(arg, bound.args[at]))
      ) {
        // The named values first, so a slot prop cannot replace the context's own two fields.
        Object.assign(context, bound.named)
        context.$implicit = bound.args[0]
        context.args = bound.args
      }
    }
  }

  ngOnDestroy(): void {
    this.container.clear()
  }
}

/**
 * Renders its content at the end of the document body, as React's portal
 * does: `<ng-template pmPortal>…</ng-template>`. The content stays in the
 * member's view, so its bindings, its injector and its change detection are
 * the member's; only its nodes move. They are removed with the view.
 */
@Directive({ selector: '[pmPortal]' })
export class Portal {
  constructor() {
    const view = inject(ViewContainerRef).createEmbeddedView(inject(TemplateRef))
    if (typeof document !== 'undefined')
      for (const node of view.rootNodes as Node[]) document.body.append(node)
    view.onDestroy(() => {
      for (const node of view.rootNodes as ChildNode[]) node.remove()
    })
  }
}
