import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import type { Place } from '../types/database'

// Default Leaflet marker icons need explicit paths under bundlers.
const defaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = defaultIcon

interface Props {
  places: Place[]
  focusPlaceId?: string | null
  onSelect?: (placeId: string) => void
}

function FitBounds({ places, focusPlaceId }: Props) {
  const map = useMap()

  useEffect(() => {
    if (focusPlaceId) {
      const p = places.find((x) => x.id === focusPlaceId)
      if (p && p.lat != null && p.lng != null) {
        map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 14), { duration: 0.5 })
        return
      }
    }
    const points = places
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => [p.lat as number, p.lng as number] as [number, number])
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 13)
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
    }
  }, [places, focusPlaceId, map])

  return null
}

export function TripMap({ places, focusPlaceId, onSelect }: Props) {
  const center = useMemo<[number, number]>(() => {
    const first = places.find((p) => p.lat != null && p.lng != null)
    if (first && first.lat != null && first.lng != null) return [first.lat, first.lng]
    return [20, 0]
  }, [places])

  return (
    <MapContainer center={center} zoom={2} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds places={places} focusPlaceId={focusPlaceId} />
      {places
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => (
          <Marker
            key={p.id}
            position={[p.lat as number, p.lng as number]}
            eventHandlers={{ click: () => onSelect?.(p.id) }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{p.name}</div>
                {p.address && <div className="text-slate-500">{p.address}</div>}
                {p.category && <div className="text-xs text-slate-400">{p.category}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  )
}
