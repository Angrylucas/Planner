import { useEffect, useState } from 'react'

export interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  type?: string
  class?: string
  address?: Record<string, string>
}

interface Props {
  onSelect: (r: NominatimResult) => void
  placeholder?: string
  bias?: { lat: number; lng: number } | null
}

export function PlaceSearch({ onSelect, placeholder = 'Search a place…', bias }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 3) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          q: term,
          format: 'json',
          addressdetails: '1',
          limit: '7',
        })
        if (bias) {
          // Bias results toward a region (~1 deg ≈ 100 km).
          params.set(
            'viewbox',
            `${bias.lng - 1},${bias.lat + 1},${bias.lng + 1},${bias.lat - 1}`,
          )
          params.set('bounded', '0')
        }
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          signal: ctrl.signal,
          headers: { Accept: 'application/json' },
        })
        const data = (await res.json()) as NominatimResult[]
        setResults(data)
      } catch {
        // ignore aborts and network blips
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
  }, [q, bias])

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      {open && (q.trim().length >= 3) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-sm text-slate-500">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500">No matches</div>
          )}
          {results.map((r) => (
            <button
              key={r.place_id}
              type="button"
              onClick={() => {
                onSelect(r)
                setQ('')
                setResults([])
                setOpen(false)
              }}
              className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50"
              title={r.display_name}
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
