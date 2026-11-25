# PhoneInput

A field for a telephone number: a country, which gives the calling code, and the national
number. The application holds one value, the number as an E.164 string (`+442079460958`), and
the member reads that string into the two parts and builds it from them. Use it wherever a
person enters a phone number to be called or sent a code, such as a sign-in factor or a
contact's number.

It has no substrate of its own. It is a Combobox for the country and an Input for the national
number, in one group, with the engine's phone model between them. The model is
`packages/engine/src/conventions/phone.ts`, which every framework's PhoneInput calls, so the
calling codes, the paste rule and the limit are decided once.

PhoneInput checks the form of a number and nothing else. It is not a formatter: it groups no
digits, because a grouping is a per-country pattern, and the patterns of some 240 regions are a
library the member does not ship. It does not say whether a number exists or is long enough for
its country; the application checks that, on its server or with its own library, and passes
the outcome through FormField's `error`. It draws no flag, because an emoji flag is text that a
screen reader reads out beside the name it repeats, and that Windows draws as two letters. It is not Input with
`type="tel"`, which keeps whatever text was typed and knows no country: use that for a number
the application stores as the reader wrote it.

## Anatomy

```
[root — role="group", the field's name]
  [country — Combobox: the calling code and the region's name; the list's trigger]  (a read-only Input when readOnly)
  [number — Input type="tel", the national number]
  [hidden input — the E.164 value, with `name`]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` / `defaultValue` / `onChange(value)` | `string` | — | an E.164 string, `+` and up to fifteen digits, or the empty string while the national number has no digits. `onChange` reports **commits, never drafts**, as NumberInput does: when the reader leaves the number or presses Enter in it (not the Enter that confirms an input method's candidate), chooses a country, or pastes a number written with its calling code. It reports only a value that differs from the one the field holds |
| `defaultCountry` | `string` | first of `countries`, else `US` | ISO 3166-1 alpha-2. The country shown before the reader chooses one, while the value names none. Once the value names a country, the value decides |
| `countries` | `string[]` | every region | the regions offered, in this order. Omitted, every region in the table, sorted by name in `locale`. A code the table lacks is dropped |
| `locale` | `string` | the page's | the language of the country names (`Intl.DisplayNames`) and of their order |
| `messages` | `PhoneInputMessages` | English | every word the member writes itself. Partial: an omitted string keeps its English default |
| `size` / `disabled` / `readOnly` / `invalid` | — | — | Input's, passed to both controls |
| `name` | `string` | — | serializes the E.164 value in one hidden input, the committed value and never the draft |
| `id` | `string` | — | on the number's `<input>`, so an ErrorSummary link or a fragment reaches a control that takes focus |

```ts
interface PhoneInputMessages {
  country?: string // the country control's name; default "Country calling code"
  showCountries?: string // the list button's name; default "Show countries"
  countriesShown?: (count: number) => string // announced while the list is open; default "{count} countries"
  noCountry?: string // the list's one row when nothing matches; default "No matching country"
}
```

There is no `label`, `description`, `error` or `required`. A field's label and messages are
FormField's, and FormField wraps this member as it wraps TimeInput and DatePicker: it names
the group, describes it and marks it required and invalid. A PhoneInput without a visible
label takes `aria-label`.

Attributes: root `data-size`, `data-invalid?`, `data-disabled?`, `data-readonly?`. The two
controls carry their own members' attributes. The rest state carries none.

## The number

- **Digits only.** The national field keeps digits. A typed space, dash, dot or bracket is
  dropped as it is typed, so the field shows what the value will hold. A text that starts with
  `+` keeps its `+`: the reader is writing the number with its calling code, and the commit
  splits it by the paste rule below.
- **The trunk zero.** In a region that dials a zero before a national number, one leading zero
  is dropped at the commit, so "020 7946 0958" in the United Kingdom is `+442079460958`. The
  engine's table lists those regions. A region it does not list keeps a typed zero, so Italy's
  numbers, which keep their zero after the calling code, are never cut.
- **The limit.** E.164 allows fifteen digits, the calling code's included. The national field
  holds no more than the calling code leaves, and one more for a trunk zero. A country chosen
  later with a longer calling code drops the digits past the limit at the commit.
- **What the application owns.** Whether the number exists, whether it is the right length for
  its country, whether it takes texts, and what the reader is told when it is wrong.

## The paste rule

A paste into the number replaces the field when the pasted text starts with `+` and its digits
start with a calling code the table holds, ignoring spaces, dashes, dots and brackets:
`+44 20 7946 0958`, `+44 (0)20 7946 0958` and `+442079460958` all set the country and the
national number, and the paste commits. Any other paste puts its digits where the caret is, so
`(415) 555-0132` arrives as `4155550132`.

A calling code that several regions share (`+1` is the United States, Canada and twenty-three
more; `+44` is the United Kingdom, Guernsey, the Isle of Man and Jersey; `+7` is Russia and
Kazakhstan) keeps the country the field has when that country dials it. Otherwise it takes the
first of `countries` that dials it, and otherwise the code's main region, the first the table
lists: the United States for `+1`, the United Kingdom for `+44`, Russia for `+7`. A number with a
calling code the table lacks stays in the field as it was typed, and the value stays empty.

## What is drawn

- **An E.164 value** is read by the paste rule, preferring the country the field shows.
- **The empty value** draws the country the reader last chose, or `defaultCountry`, and an
  empty number.
- **A value whose country `countries` lacks** draws that country, listed first, for as long as
  the value names it. The value is the application's data, so it is drawn as it is.
- **A value that is not E.164** (`4155550132`, `+44 20 7946 0958`) is the application's
  mistake, and a development warning names it. The member still draws it: an international
  number is split, and anything else is put in the national field as digits, under the current
  country. The reader's next commit reports it as E.164.
- **A controlled value the application does not change** returns to the field at the commit, as
  NumberInput's does.

## The country list

Each option is the calling code, then the region's name in `locale`, from
`Intl.DisplayNames`: `+44 United Kingdom`. The code comes first because it is the part of the
number, and it stays visible when a narrow field cuts the name. The code is a left-to-right
isolate in the option's text, so it reads `+44` in a right-to-left page. Typing filters the
list by name or by code, with Combobox's own `contains` filter. The country is never empty: a
reader who deletes its text and leaves gets the chosen country back, as Combobox restores its
label.

## The form

`name` writes the committed E.164 value into one hidden input, as TimeInput, ColorInput and
NumberInput serialize theirs. The number carries `autocomplete="tel-national"`, the HTML
token for a number without its country code, so a browser fills it with the national number.
The country carries no token. The HTML token for that part, `tel-country-code`, fills a code
such as `+44` into a text field, and the country control is a list choice whose text is the
filter: the browser's text would filter the list and then be discarded when the reader leaves,
and Combobox writes `autocomplete="off"` on its text for that reason. A number the browser
fills with its calling code (`+44…`) is split by the commit like a typed one.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | `display: flex` · gap `--pm-space-2`, ColorInput's gap between a field's two parts · `align-items: center` · as wide as it is given |
| country | Combobox's recipe verbatim in every state (`combobox.md`), at the field's `size` · basis `calc(var(--pm-space-10) * 3)`, the width ColorInput's picker takes · gives up the row's shortfall, so a narrow field cuts the region's name after its calling code |
| number | Input's recipe verbatim in every state (`input.md`), at the field's `size` · takes the rest of the row, and never less than `calc(var(--pm-text-entry-size) * 7)` plus the size's padding-x on each side: room for a national number's digits at the phone floor's size, the largest the field's text takes |
| list | Combobox's panel and sheet, verbatim |

Invalid, disabled and read-only reach both controls, so both frames show the state together.
The phone floor (conventions §13) applies through both members, which each apply it.

**On iOS and Android**: the number's floor is seven of the field's own type size and its padding,
because a native field has no zoom floor and the themes carry no text-entry size. A native text
field reports no paste, so a number written with a calling code the table holds that arrives whole,
pasted or filled by the system, commits at once, and so does one the reader finishes typing when
the number loses focus. On iOS the number's content type is the telephone number, the platform
having none for a national number, and Return ends editing, which commits. On Android the number's
autofill type is the national phone number, and the region names and their order are the
platform's locale's and its collator's.

## Direction

The number is `type="tel"`, and every engine's UA stylesheet sets `direction: ltr` on it (the
HTML Standard's rendering rules), so the digits read left to right in a right-to-left page with
no `dir` attribute. The row itself mirrors: the country is at the inline start. The country's
calling code is an isolate in its text, and the name reads in the page's direction.

## FormField integration

As TimeInput and DatePicker: the label names the group (`role="group"` +
`aria-labelledby`), and the description and error go through `aria-describedby` on the group
and on both controls, because VoiceOver on iOS does not announce a group's name or description
when focus enters one of its controls. `invalid` from context marks both controls. `required`
reaches the number as `aria-required`; the country always holds a value.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| empty | `defaultCountry="GB"` | the United Kingdom, an empty number |
| with value | `defaultValue="+442079460958"` | `+44 United Kingdom`, `2079460958` |
| shared code | `defaultValue="+14165550132"` + `defaultCountry="CA"` | Canada keeps `+1` |
| countries | `countries={['GB', 'IE', 'FR']}` | three options, in that order |
| value outside the list | `countries={['GB', 'IE']}` + `defaultValue="+14155550132"` | the United States, listed first |
| locale | `locale="de-DE"` + value | the names in German |
| sizes | sm / md / lg | `data-size` |
| invalid | `invalid` | `data-invalid`; both controls `aria-invalid` |
| disabled | `disabled` | `data-disabled` |
| readOnly | `readOnly` + value | `data-readonly`; the country is a read-only Input |
| in a form | `name` + value | the hidden input carries the value |

`requiredSelectors`: none. The recipe lays out the two members and styles no state itself;
every state is drawn by Combobox's and Input's recipes, which list their own.

## Motion

None of its own. The country list opens and closes on Combobox's `combobox.popup` binding and
its sheet, and the frames take Input's and Combobox's state feedback. The digits never animate.

## Icons

None of its own: Combobox's `expand` and `confirm`.

## A11y

One group, named by FormField's label. The country is a combobox named by `messages.country`
followed by the field's label (`aria-labelledby` naming itself and the label, as React Aria
names a date segment), so a form with two phone fields names their two country controls apart.
The number is a textbox named by the field's label. Tab moves from the country to the number.
Combobox's keys work on the country: ArrowDown opens the list, the arrows move through it
without moving DOM focus, Enter chooses, and Escape closes and restores the chosen country.
The list's count is announced through Combobox's live region in `messages.countriesShown`.

```contract
role root group
role country combobox
role number textbox
attr number aria-invalid=true when invalid
attr country aria-invalid=true when invalid
key ArrowDown opens on trigger
```

What the contract grammar cannot state, typing, the commit, the paste rule, the shared calling
codes, the controlled value, the limit and the number's autofill token, is held by `phoneInputLaw`
(`packages/conformance/src/phone-input.ts`), which every shell's PhoneInput test calls with a
mount of its own.

## Agent

A person sees one phone field, so an agent sees one member: PhoneInput registers its group and
withholds the Combobox and the Input it draws. An agent reads the E.164 value, the country the
field shows, and whether the field is disabled, invalid or read-only. It sets a number and clears
it.

`set` commits a number as a person's commit does, through the engine's phone model. A text that
starts with `+` is read by the paste rule, so `+44 20 7946 0958` sets the United Kingdom and the
national number. Any other text is the national number under the country the field shows, and its
digits are kept. `onChange` reports the E.164 value whether or not the caller controls it, and
only when it differs from the value the field holds. `set` refuses a text it cannot read as a
number, such as one with no digits or a calling code the table lacks. `clear` empties the
national number, which commits the empty string, and keeps the country. A read-only field takes
no typing, so it refuses both actions. Each refusal fails the step. A disabled field lists no
action.

```agent
state value text
state country id
state disabled boolean as root data-disabled
state invalid boolean as root data-invalid
state readonly boolean as root data-readonly
action set text sets value calls onChange
action clear sets value calls onChange
withholds contents
```
