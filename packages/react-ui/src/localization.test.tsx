import { CalendarDate } from '@internationalized/date'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import { AppShell } from './archetypes/AppShell'
import { Calendar } from './controls/Calendar'
import { DatePicker } from './controls/DatePicker'
import { DateRangePicker } from './controls/DateRangePicker'
import { Input } from './controls/Input'
import { SearchInput } from './controls/SearchInput'
import { TagInput } from './controls/TagInput'
import { Command } from './overlays/Command'
import { Drawer } from './overlays/Drawer'
import { Alert } from './structure/Alert'
import { Breadcrumbs } from './structure/Breadcrumbs'
import { Carousel } from './structure/Carousel'
import { CodeBlock } from './structure/CodeBlock'
import { DataTable } from './structure/DataTable'
import { FilterBar } from './structure/FilterBar'
import { Stat } from './structure/Stat'
import { Stepper } from './structure/Stepper'

/**
 * Tests the localization seam at runtime.
 *
 * `packages/rules/src/localization.test.ts` checks that no sentence is hard-coded
 * at a JSX site, which is a claim about source text. This file checks the other
 * half: that the prop for each sentence reaches the rendered name, and that the
 * generic English default still applies when a host passes nothing. It is one
 * file rather than a test per member, because it tests one claim: a French host
 * hears no English from the vocabulary anywhere.
 */

beforeAll(installTestTheme)
afterEach(cleanup)

const noop = () => {}
const EMPTY = { title: 'Rien' }

interface Row {
  id: string
  name: string
}
const ROWS: Row[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Bêta' },
]
const COLUMNS = [{ key: 'name', header: 'Nom' }]

describe('a host’s language reaches every name the vocabulary would otherwise default', () => {
  it('Alert — the dismiss control', () => {
    render(
      <Alert onDismiss={noop} dismissLabel="Fermer l’alerte">
        Service dégradé
      </Alert>,
    )
    expect(screen.getByRole('button', { name: 'Fermer l’alerte' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('Breadcrumbs — the landmark and the overflow control', () => {
    const items = ['Accueil', 'Clients', 'Acme', 'Projets', 'Atlas', 'Réglages'].map((label) => ({
      label,
      href: '#',
    }))
    render(<Breadcrumbs items={items} label="Fil d’Ariane" overflowLabel="Afficher le chemin" />)
    expect(screen.getByRole('navigation', { name: 'Fil d’Ariane' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Afficher le chemin' })).toBeTruthy()
  })

  it('Drawer — the close control, as in Dialog', () => {
    render(<Drawer open title="Détails" closeLabel="Fermer" />)
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('TagInput — a chip’s remove control, with the tag as data, the count and a removal', () => {
    render(
      <TagInput
        aria-label="Étiquettes"
        defaultValue={['urgent']}
        max={1}
        removeLabel={(tag) => `Retirer ${tag}`}
        countLabel={({ count, max, atMax }) =>
          atMax ? `${max} étiquette au maximum` : `${count} étiquettes`
        }
        removedLabel={(tag, count) => `${tag} retirée, il en reste ${count}`}
      />,
    )
    expect(screen.getByRole('textbox', { description: '1 étiquette au maximum' })).toBeTruthy()
    expect(screen.queryByText(/added/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retirer urgent' }))
    expect(screen.getByText('urgent retirée, il en reste 0')).toBeTruthy()
    expect(screen.queryByText(/removed|remain/)).toBeNull()
  })

  it('Stepper — the spoken position and state, as one sentence', () => {
    const { container } = render(
      <Stepper
        steps={[{ label: 'Compte' }, { label: 'Profil' }, { label: 'Fin' }]}
        activeIndex={1}
        spoken={({ position, count, state }) =>
          `étape ${position} sur ${count}, ${state === 'active' ? 'en cours' : state === 'completed' ? 'terminée' : 'à venir'}`
        }
      />,
    )
    expect(container.textContent).toContain('étape 2 sur 3, en cours')
    expect(container.textContent).toContain('étape 1 sur 3, terminée')
    expect(container.textContent).not.toContain('step 2 of 3')
  })

  it('Input and SearchInput — the clear control', () => {
    render(<Input aria-label="Nom" defaultValue="x" clearable clearLabel="Effacer" />)
    expect(screen.getByRole('button', { name: 'Effacer' })).toBeTruthy()
    cleanup()

    render(
      <SearchInput aria-label="Rechercher" defaultValue="x" clearLabel="Effacer la recherche" />,
    )
    expect(screen.getByRole('button', { name: 'Effacer la recherche' })).toBeTruthy()
  })

  it('DataTable — the bulk count and both checkbox names', () => {
    render(
      <DataTable<Row>
        label="Clients"
        columns={COLUMNS}
        data={ROWS}
        getRowId={(row) => row.id}
        selection={new Set(['a', 'b'])}
        onSelectionChange={noop}
        emptyState={EMPTY}
        messages={{
          selected: (count) => `${count} sélectionnés`,
          selectAll: 'Tout sélectionner',
          selectRow: 'Sélectionner la ligne',
        }}
      />,
    )
    expect(screen.getByText('2 sélectionnés')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Tout sélectionner' })).toBeTruthy()
    expect(screen.getAllByRole('checkbox', { name: 'Sélectionner la ligne' })).toHaveLength(2)
    expect(screen.queryByText('2 selected')).toBeNull()
  })

  it('FilterBar — the clear control and the count, with or without a total', () => {
    const messages = {
      clear: 'Effacer les filtres',
      resultCount: ({ shown, total }: { shown: number; total?: number }) =>
        total === undefined ? `${shown} résultats` : `${shown} résultats sur ${total}`,
    }
    const { rerender } = render(
      <FilterBar
        isFiltered
        onClear={noop}
        resultCount={{ shown: 3, total: 9 }}
        messages={messages}
      />,
    )
    expect(screen.getByRole('button', { name: 'Effacer les filtres' })).toBeTruthy()
    expect(screen.getByText('3 résultats sur 9')).toBeTruthy()

    // A cursor-paged list holds a window, not a full count: no total, and none invented.
    rerender(<FilterBar isFiltered onClear={noop} resultCount={{ shown: 3 }} messages={messages} />)
    expect(screen.getByText('3 résultats')).toBeTruthy()
  })

  it('Calendar, DatePicker and DateRangePicker — the names Intl cannot supply', () => {
    render(
      <Calendar
        aria-label="Date"
        defaultValue={new CalendarDate(2026, 3, 14)}
        messages={{ previousMonth: 'Mois précédent', nextMonth: 'Mois suivant' }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Mois précédent' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeTruthy()
    cleanup()

    const dates = {
      previousMonth: 'Mois précédent',
      nextMonth: 'Mois suivant',
      showCalendar: 'Afficher le calendrier',
      clear: 'Effacer',
    }
    render(
      <DatePicker aria-label="Échéance" messages={{ ...dates, chooseDate: 'Choisir une date' }} />,
    )
    expect(screen.getByRole('button', { name: 'Afficher le calendrier' })).toBeTruthy()
    cleanup()

    render(
      <DateRangePicker
        aria-label="Période"
        messages={{ ...dates, chooseRange: 'Choisir une période' }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Afficher le calendrier' })).toBeTruthy()
  })

  it('AppShell — the skip link, the first thing a keyboard reader meets', () => {
    render(
      <AppShell
        sidebar={<AppShell.NavItem icon="inbox" label="Boîte" current />}
        messages={{
          primaryNavigation: 'Principale',
          expandSidebar: 'Déplier',
          collapseSidebar: 'Replier',
          closeNavigation: 'Fermer la navigation',
          openNavigation: 'Ouvrir la navigation',
          skipToContent: 'Aller au contenu',
        }}
      >
        <p>Contenu</p>
      </AppShell>,
    )
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Skip to content' })).toBeNull()
  })

  it('Command — the dialog’s name, the key cap and the status region’s words', async () => {
    const spoken = ({ loading, count }: { loading: boolean; count: number }) =>
      loading ? 'Chargement…' : `${count} commande${count === 1 ? '' : 's'}`
    const { rerender } = render(
      <Command
        open
        onOpenChange={noop}
        items={[{ id: 'a', label: 'Nouveau ticket', onSelect: noop }]}
        label="Palette de commandes"
        escapeHint="échap"
        placeholder="Saisir une commande…"
        spoken={spoken}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Palette de commandes' })).toBeTruthy()
    expect(screen.getByText('échap')).toBeTruthy()
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('1 commande'))
    rerender(
      <Command
        open
        onOpenChange={noop}
        items={[]}
        loading
        label="Palette de commandes"
        placeholder="Saisir une commande…"
        spoken={spoken}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe('Chargement…')
  })

  it('CodeBlock — the copy control’s name and its confirmation', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    })
    try {
      const { container } = render(
        <CodeBlock copyable copyLabel="Copier" copiedLabel="Copié">
          pnpm install
        </CodeBlock>,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Copier' }))
      const region = container.querySelector('[aria-live="polite"]')
      await vi.waitFor(() => expect(region?.textContent).toBe('Copié'))
    } finally {
      if (original === undefined) Reflect.deleteProperty(navigator, 'clipboard')
      else Object.defineProperty(navigator, 'clipboard', original)
    }
  })

  it('Stat and Carousel — a derived name, a spoken delta, a loading name and a spoken role', () => {
    render(
      <Stat
        label="Refus"
        value="12"
        spark={[1, 3, 2, 5]}
        sparkLabel={(label) => `${label}, tendance récente`}
      />,
    )
    expect(screen.getByRole('img', { name: 'Refus, tendance récente' })).toBeTruthy()
    cleanup()

    const { container } = render(
      <Stat
        label="Refus"
        value="12"
        delta={{ value: '3', direction: 'down', positive: true }}
        deltaLabel={({ value, positive }) =>
          `en baisse de ${value}, ${positive ? 'bon' : 'mauvais'}`
        }
      />,
    )
    expect(container.textContent).toContain('en baisse de 3, bon')
    expect(container.textContent).not.toContain('positive')
    cleanup()

    render(<Stat label="Refus" value="" loading loadingLabel="Chargement" />)
    expect(screen.getByRole('status', { name: 'Chargement' })).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull()
    cleanup()

    render(
      <Carousel
        label="Visite"
        previousLabel="Précédent"
        nextLabel="Suivant"
        roleDescriptions={{ carousel: 'carrousel', slide: 'diapositive' }}
        slides={[
          { id: 'a', label: 'Un', content: <p>Un</p> },
          { id: 'b', label: 'Deux', content: <p>Deux</p> },
        ]}
      />,
    )
    expect(document.querySelector('[aria-roledescription="carrousel"]')).toBeTruthy()
    expect(document.querySelectorAll('[aria-roledescription="diapositive"]')).toHaveLength(2)
  })
})

describe('and a host that passes nothing still hears the generic English', () => {
  it('keeps every default', () => {
    render(
      <>
        <Alert onDismiss={noop}>Degraded</Alert>
        <Input aria-label="Name" defaultValue="x" clearable />
        <FilterBar isFiltered onClear={noop} resultCount={{ shown: 3, total: 9 }} />
        <Stat label="Resolved" value="342" delta={{ value: '12%', direction: 'up' }} />
        <TagInput aria-label="Labels" defaultValue={['urgent', 'billing']} />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy()
    expect(screen.getByText('3 of 9 results')).toBeTruthy()
    expect(screen.getByText('up 12% — positive')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Labels', description: '2 added' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove urgent' }))
    expect(screen.getByText('urgent removed, 1 remain')).toBeTruthy()
  })
})
