import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'

import { useThemeValues } from '@polymorph/react'
import { Button, Inline, SegmentedControl, Stack, Text, ThirdParty } from '@polymorph/react-ui'

/**
 * A map another library draws, hosted by the route in `docs/rules.md`.
 *
 * Leaflet takes a marker's colours, stroke and radius as options in JavaScript, so it cannot
 * read a custom property. `useThemeValues` gives it the theme's resolved values, and the effect
 * that draws the markers runs again whenever they change: with the pairing, the mode, the
 * density and the contrast preference.
 *
 * Three things here are the route's rules, and each is checked by a red rule:
 *
 *  - **The boundary names the library.** `leaflet/dist/leaflet.css` is importable in this file
 *    because the `<ThirdParty>` below names `leaflet`, and `pnpm inventory` lists it.
 *  - **No colour is written.** Every colour is a role read from the theme, or a `var(--pm-…)`
 *    in the `style` that sizes the map. The height and the border's width are raw lengths, which
 *    the boundary lifts.
 *  - **The controls are members.** Leaflet's own zoom buttons are turned off, because they are
 *    drawn in the library's fixed colours. The buttons and the depot picker are vocabulary, and
 *    they call the map's API.
 */

export interface Depot {
  id: string
  name: string
  at: [latitude: number, longitude: number]
  open: boolean
}

export const DEPOTS: readonly Depot[] = [
  { id: 'north', name: 'Northgate', at: [51.545, -0.142], open: true },
  { id: 'river', name: 'Riverside', at: [51.507, -0.096], open: true },
  { id: 'east', name: 'Eastfield', at: [51.521, -0.035], open: false },
  { id: 'south', name: 'Southmere', at: [51.468, -0.105], open: true },
]

const CENTRE: [number, number] = [51.508, -0.09]

export function DepotMap() {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [selected, setSelected] = useState<string>(DEPOTS[0]?.id ?? '')
  // Read where the map is drawn, so a scope around it is seen.
  const theme = useThemeValues(hostRef)

  // The map is made once. Its vector layers are drawn by the effect below.
  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const map = L.map(host, {
      center: CENTRE,
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
      // The wheel scrolls the page the map is on. The buttons zoom.
      scrollWheelZoom: false,
      // The markers are SVG paths, so a test and a reader's tools can find them.
      renderer: L.svg(),
    })
    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)
    // Leaflet measures its element once. The element can be laid out after the map is made, and
    // it changes width with the page, so the map is told each time, and it frames the depots the
    // first time it has a size.
    let framed = false
    const sized = new ResizeObserver(() => {
      map.invalidateSize()
      if (framed || host.clientWidth === 0) return
      framed = true
      map.fitBounds(L.latLngBounds(DEPOTS.map((depot) => depot.at)).pad(0.2), { animate: false })
    })
    sized.observe(host)
    return () => {
      sized.disconnect()
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  // The markers are drawn from the theme's values, and drawn again when they change.
  useEffect(() => {
    const layer = layerRef.current
    if (layer === null) return
    layer.clearLayers()
    L.polyline(
      DEPOTS.map((depot) => depot.at),
      { color: theme.color('border.strong'), weight: 2, interactive: false },
    ).addTo(layer)
    for (const depot of DEPOTS) {
      const chosen = depot.id === selected
      L.circleMarker(depot.at, {
        radius: theme.space(chosen ? 4 : 3),
        weight: 2,
        color: theme.color('bg.surface'),
        fillColor: theme.color(chosen ? 'accent.bg' : depot.open ? 'success.solid' : 'text.muted'),
        fillOpacity: 1,
      })
        .on('click', () => setSelected(depot.id))
        .addTo(layer)
    }
  }, [theme, selected])

  const depot = DEPOTS.find((candidate) => candidate.id === selected)

  return (
    <Stack gap={3}>
      <Inline gap={3} justify="between" align="center" wrap>
        <SegmentedControl
          label="Depot"
          value={selected}
          onChange={setSelected}
          options={DEPOTS.map(({ id, name }) => ({ value: id, label: name }))}
        />
        <Inline gap={2}>
          <Button
            variant="outline"
            icon="remove"
            iconOnly
            label="Zoom out"
            onClick={() => mapRef.current?.zoomOut()}
          />
          <Button
            variant="outline"
            icon="add"
            iconOnly
            label="Zoom in"
            onClick={() => mapRef.current?.zoomIn()}
          />
        </Inline>
      </Inline>
      <ThirdParty library="leaflet" reason="Depot map: no member pans and zooms over places.">
        <div
          ref={hostRef}
          role="application"
          aria-label="Map of the depots"
          style={{
            height: '320px',
            background: 'var(--pm-bg-subtle)',
            border: '1px solid var(--pm-border-subtle)',
            borderRadius: 'var(--pm-radius-surface)',
          }}
        />
      </ThirdParty>
      <Text tone="secondary" size="sm">
        {depot ? `${depot.name} is ${depot.open ? 'open' : 'closed'}.` : ''}
      </Text>
    </Stack>
  )
}
