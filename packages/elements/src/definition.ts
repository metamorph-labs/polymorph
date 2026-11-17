/**
 * What an element is, as `pnpm shells` writes it for each member and part
 * (`packages/elements-ui/src/definitions.ts`): its tag, the member it renders,
 * how each attribute reads into a prop, the events it dispatches, the slots
 * its children fill, and which of its parts its member renders in its place.
 *
 * A definition is data. The foundation's `define` turns one and a Solid
 * member into a custom element.
 */

/** The prefix of every tag and every event the elements write. */
export const PREFIX = 'poly-'

/**
 * How an attribute's text reads into a prop:
 *
 *  - `string`, `number`, `boolean`: the text, a number, or presence (`"false"` is false);
 *  - `json`: data, parsed from JSON (arrays, objects, named data types);
 *  - `set`: a set, read from a JSON array of its members (`["a","b"]`);
 *  - `{ union }`: a union, read as the literal it names, and otherwise by its
 *    open members: `boolean` (presence, `"false"`), `json` (text that opens
 *    an array or an object), `number`, then `string`;
 *  - `{ temporal }`: an ISO 8601 date or time, read as the engine's value:
 *    `time` reads `09:30` as a `Time`; `date` reads `2026-07-15` as a
 *    `CalendarDate` and `2026-07-15T09:30` as a `CalendarDateTime`; `range`
 *    reads `2026-07-01/2026-07-15` as a range of two dates;
 *  - `property`: no attribute; a function or a ref, set from script.
 */
export type Codec =
  | 'string'
  | 'number'
  | 'boolean'
  | 'json'
  | 'set'
  | 'property'
  | { readonly temporal: 'time' | 'date' | 'range' }
  | {
      readonly union: readonly (string | number)[]
      readonly string?: true
      readonly number?: true
      readonly boolean?: true
      readonly json?: true
    }

/** An event a member emits, as the element dispatches it. */
export interface ElementEvent {
  /** The event's type: `poly-` and the event's kebab name (`poly-open-change`). */
  readonly type: string
  /**
   * The member reads whether its caller handles the event (`listening`), so
   * the element hands it the handler only while a listener is added or the
   * `listens` attribute names the event. Any other event is always handed.
   */
  readonly listened?: true
}

/**
 * A callback a JSON value's objects require (`onSelect` on a Menu's items),
 * which the element completes on each object that has none: the completed
 * callback dispatches `type` on the element, with the object and its index
 * in its list as `detail` (`{ item, index }`), and `value` when the member
 * passes the callback a value (a checkbox entry's `checked`).
 */
export interface ElementCallback {
  /** The fields the objects are reached through, dotted; `''` is the value itself or its items. */
  readonly at: string
  /** The callback's name on each object: `onSelect`. */
  readonly name: string
  /** The event it dispatches: `poly-select`. */
  readonly type: string
  /**
   * The values the object's literal fields hold for its type to require the
   * callback, `null` for a field left out: a Menu's item takes `onSelect`
   * where `kind` is `'item'` or absent, and a checkbox entry does not.
   */
  readonly where?: readonly { readonly field: string; readonly is: readonly (string | null)[] }[]
}

/** One element: a member or a public part of one. */
export interface ElementDefinition {
  /** The tag: `poly-button`, `poly-tabs-content`. */
  readonly tag: string
  /** The member or part it renders, by its component's name: `Button`, `TabsContent`. */
  readonly member: string
  /** Each value prop, by its React name, with the codec its attribute reads through. */
  readonly props: Readonly<Record<string, Codec>>
  /** Each event prop, by its React name (`onOpenChange`), with the event it dispatches. */
  readonly events: Readonly<Record<string, ElementEvent>>
  /** The node props its children fill, by their React names: `children` and the named slots. */
  readonly slots: readonly string[]
  /**
   * The node fields of an object prop, by the prop's React name: children
   * whose `slot` names the prop and the field (`slot="topbar.leading"`) fill
   * the field of the object the prop reads.
   */
  readonly fields?: Readonly<Record<string, readonly string[]>>
  /** The callbacks the element completes in a JSON prop's objects, by the prop's React name. */
  readonly callbacks?: Readonly<Record<string, readonly ElementCallback[]>>
  /**
   * The controlled props, each with the event that reports its change
   * (`open` with `onOpenChange`). After the change event, unless a listener
   * cancels it, the element sets the prop to the value the event carries.
   */
  readonly controlled?: Readonly<Record<string, string>>
  /**
   * A part whose rendering takes its element's place: a table's section, row
   * or cell, a list's item. Its member renders the part's root where the
   * element was, and the element stays the part's controller.
   */
  readonly structural?: true
  /** A public part's member, by its tag: the element it renders inside (`poly-table`). */
  readonly within?: string
  /** The slots the member renders only inside a portal, which stay hidden before the element is defined. */
  readonly overlays?: readonly string[]
}

/** A kebab-case prop name as its camel-case property: `aria-label` is `ariaLabel`. */
export type PropertyName<Name extends string> = Name extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<PropertyName<Tail>>}`
  : Name

/** The properties of a member's element: each prop named, by its property name, with its type. */
export type ElementProperties<Props, Names extends keyof Props & string> = {
  [Name in Names as PropertyName<Name>]: Props[Name]
}

/** A name in kebab case: `iconOnly` is `icon-only`, `QRCode` is `qr-code`. */
export const kebab = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()

/** A kebab-case name in camel case: `aria-label` is `ariaLabel`. */
export const camel = (name: string): string =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

/** The tag of a member or part, by its component's name: `TabsContent` is `poly-tabs-content`. */
export const tagOf = (component: string): string => `${PREFIX}${kebab(component)}`

/** The attribute a prop reads from: its kebab name, and an `aria-*` or `data-*` name as it is. */
export const attributeOf = (prop: string): string =>
  /^(aria|data)-/.test(prop) ? prop : kebab(prop)

/** The property a prop is set through: its camel name (`ariaLabel`, `iconOnly`). */
export const propertyOf = (prop: string): string => camel(prop)

/** The event type an event prop dispatches: `onOpenChange` is `poly-open-change`. */
export const eventOf = (prop: string): string => `${PREFIX}${kebab(prop.slice(2))}`

/** The slot attribute a node prop is written with: `secondaryAction` is `secondary-action`. */
export const slotOf = (prop: string): string => (prop === 'children' ? '' : kebab(prop))
