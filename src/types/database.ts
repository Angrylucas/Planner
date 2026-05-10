export type Role = 'owner' | 'editor' | 'viewer'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface Trip {
  id: string
  owner_id: string
  title: string
  description: string | null
  destination: string | null
  start_date: string | null
  end_date: string | null
  cover_image_url: string | null
  share_token: string | null
  share_enabled: boolean
  created_at: string
  updated_at: string
}

export interface TripMember {
  trip_id: string
  user_id: string
  role: Role
  created_at: string
}

export interface TripInvite {
  id: string
  trip_id: string
  email: string
  role: Role
  token: string
  invited_by: string
  accepted_at: string | null
  expires_at: string | null
  created_at: string
}

export interface TripDay {
  id: string
  trip_id: string
  day_index: number
  date: string | null
  notes: string | null
  created_at: string
}

export interface Place {
  id: string
  trip_id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  category: string | null
  notes: string | null
  url: string | null
  rating: number | null
  cost: number | null
  created_by: string
  created_at: string
}

export interface ItineraryItem {
  id: string
  trip_id: string
  day_id: string
  place_id: string | null
  position: number
  start_time: string | null
  end_time: string | null
  title: string | null
  notes: string | null
  created_at: string
}

export type TripWithRole = Trip & { role: Role }
