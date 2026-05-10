import { useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ItineraryItem, Place, TripDay } from '../types/database'

interface Props {
  day: TripDay
  items: ItineraryItem[]
  places: Map<string, Place>
  canEdit: boolean
  onReorder: (newOrder: ItineraryItem[]) => void
  onAddItem: (placeId: string | null, title: string) => void
  onRemoveItem: (itemId: string) => void
  onFocusPlace: (placeId: string) => void
}

export function ItineraryDay({
  day,
  items,
  places,
  canEdit,
  onReorder,
  onAddItem,
  onRemoveItem,
  onFocusPlace,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = items.findIndex((i) => i.id === active.id)
    const newIdx = items.findIndex((i) => i.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onReorder(arrayMove(items, oldIdx, newIdx))
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Day {day.day_index + 1}</h3>
          {day.date && (
            <p className="text-xs text-slate-500">
              {new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {items.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                place={item.place_id ? places.get(item.place_id) : undefined}
                canEdit={canEdit}
                onRemove={() => onRemoveItem(item.id)}
                onFocus={() => item.place_id && onFocusPlace(item.place_id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {items.length === 0 && (
        <p className="py-4 text-sm text-slate-400">Nothing planned yet.</p>
      )}

      {canEdit && (
        <div className="mt-3">
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!title.trim()) return
                onAddItem(null, title.trim())
                setTitle('')
                setAdding(false)
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Activity (e.g. Sunset at Belém Tower)"
                className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  setTitle('')
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="text-sm text-indigo-600 hover:underline"
            >
              + Add activity
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SortableItem({
  item,
  place,
  canEdit,
  onRemove,
  onFocus,
}: {
  item: ItineraryItem
  place: Place | undefined
  canEdit: boolean
  onRemove: () => void
  onFocus: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  const label = place?.name ?? item.title ?? 'Untitled'

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
    >
      {canEdit && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-slate-400 hover:text-slate-600"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          ⋮⋮
        </button>
      )}
      <button
        type="button"
        onClick={onFocus}
        className="flex-1 text-left"
        disabled={!place}
      >
        <div className="text-sm font-medium text-slate-900">{label}</div>
        {place?.address && <div className="text-xs text-slate-500">{place.address}</div>}
        {item.notes && <div className="mt-0.5 text-xs text-slate-500">{item.notes}</div>}
      </button>
      {canEdit && (
        <button
          onClick={onRemove}
          className="text-xs text-slate-400 hover:text-red-600"
          aria-label="Remove"
        >
          ✕
        </button>
      )}
    </li>
  )
}
