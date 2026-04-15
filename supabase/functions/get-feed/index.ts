// TwinFrequency — Feed Queue Edge Function
// Supabase Edge Function: GET /functions/v1/get-feed
// Returns a ranked list of profiles for the current user's feed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ═══════════════════════════════════════════════════════════
// ORIGIN → GROUP MAPPING
// ═══════════════════════════════════════════════════════════
const ORIGIN_GROUP: Record<string, number> = {
  Siriusian: 1, Pleiadian: 1, Lemurian: 1, Cassiopeian: 1, Procyonian: 1, Lyran: 1,
  Arcturian: 2, Orion: 2, Vegan: 2, "Zeta Reticulan": 2, "Epsilon Eridan": 2, Atlantean: 2,
  Andromedan: 3, Polarisian: 3, Nibiruan: 3, Egyptian: 3, Titanian: 3, "Blue Avian": 3,
  "Tau Cetian": 4, Aldebaran: 4, Centaurian: 4, Herculean: 4, Anunnaki: 4, Hyperborean: 4,
}

// ═══════════════════════════════════════════════════════════
// CONNECTION TYPE ALGORITHM — SERVER-SIDE ONLY
// Full 10-type matrix. Never exposed to client in raw form.
// ═══════════════════════════════════════════════════════════
function getConnectionType(origin1: string, origin2: string): string {
  if (!origin1 || !origin2 || origin1 === "Unknown" || origin2 === "Unknown") return "Unknown"

  // Identical origin — rarest, most powerful resonance
  if (origin1 === origin2) return "Frequency Twins"

  const g1 = ORIGIN_GROUP[origin1]
  const g2 = ORIGIN_GROUP[origin2]
  if (!g1 || !g2) return "Unknown"

  const diff = Math.abs(g1 - g2)

  // Same group, different origin
  if (diff === 0) return "Eternal Reflection"

  // Adjacent groups
  if (diff === 1) {
    const lower = Math.min(g1, g2)
    if (lower === 1) return "Twin Stars"       // heart ↔ mind
    if (lower === 2) return "Cosmic Flow"      // mind ↔ energy
    if (lower === 3) return "Star Alchemy"     // energy ↔ matter
  }

  // Two groups apart
  if (diff === 2) {
    const lower = Math.min(g1, g2)
    if (lower === 1) return "Mirror Portals"   // heart ↔ energy
    if (lower === 2) return "Celestial Mentor" // mind ↔ matter
  }

  // Maximum polarity — groups 1 & 4
  if (diff === 3) {
    const hash = (origin1.charCodeAt(0) + origin2.charCodeAt(0)) % 3
    if (hash === 0) return "Karmic Bonds"
    if (hash === 1) return "Shadow Contracts"
    return "Black Holes"
  }

  return "Unknown"
}

// ═══════════════════════════════════════════════════════════
// COMPATIBILITY SCORE (0–100)
// Higher = more compatible = shown first in feed
// ═══════════════════════════════════════════════════════════
function getCompatibilityScore(myOrigin: string, theirOrigin: string): number {
  const type = getConnectionType(myOrigin, theirOrigin)
  // Score is used for feed ranking only — not exposed to users
  const scores: Record<string, number> = {
    "Frequency Twins": 100,
    "Eternal Reflection": 95,
    "Twin Stars": 85,
    "Star Alchemy": 80,
    "Cosmic Flow": 75,
    "Mirror Portals": 65,
    "Celestial Mentor": 60,
    "Karmic Bonds": 50,
    "Shadow Contracts": 35,
    "Black Holes": 20,
    "Unknown": 40,
  }
  return scores[type] ?? 50
}

// ═══════════════════════════════════════════════════════════
// DAILY LIMIT
// ═══════════════════════════════════════════════════════════
const DAILY_SWIPE_LIMIT = 30

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return new Response("Unauthorized", { status: 401 })

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return new Response("Unauthorized", { status: 401 })

    // Get my profile
    const { data: me } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (!me) return new Response("Profile not found", { status: 404 })

    // Check daily limit
    const today = new Date().toISOString().split("T")[0]
    if (me.last_swipe_date === today && me.daily_swipes_count >= DAILY_SWIPE_LIMIT) {
      return new Response(
        JSON.stringify({ profiles: [], daily_limit_reached: true }),
        { headers: { "Content-Type": "application/json" } }
      )
    }

    // Get liked profile IDs (permanent exclusion)
    const { data: likedRows } = await supabase
      .from("likes")
      .select("to_user")
      .eq("from_user", user.id)

    const swipedIds = new Set((likedRows || []).map((r: any) => r.to_user))
    swipedIds.add(user.id) // exclude self

    // Get pass swipes newer than 7 days (older passes expire — person reappears)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: passRows } = await supabase
      .from("swipes")
      .select("target_id")
      .eq("actor_id", user.id)
      .eq("action", "pass")
      .gte("created_at", sevenDaysAgo)

    for (const r of passRows || []) {
      swipedIds.add(r.target_id)
    }

    // Get blocked users (both directions)
    const { data: blockRows } = await supabase
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`)

    const blockedIds = new Set<string>()
    for (const b of blockRows || []) {
      blockedIds.add(b.blocker_id === user.id ? b.blocked_id : b.blocker_id)
    }

    // Fetch real candidate profiles
    let query = supabase
      .from("profiles")
      .select("id, name, age, gender, photo_url, origin, location_name, last_active_at")
      .gte("age", me.pref_age_min ?? 18)
      .lte("age", me.pref_age_max ?? 80)

    // Gender filter — search_gender: 'women' | 'men' | 'everyone' (null = everyone)
    if (me.search_gender && me.search_gender !== 'everyone') {
      // Map UI value to actual gender values stored in profiles
      const genderMap: Record<string, string[]> = {
        'women': ['female', 'woman', 'Female', 'Woman'],
        'men':   ['male',   'man',   'Male',   'Man'],
      }
      const allowed = genderMap[me.search_gender]
      if (allowed) query = query.in('gender', allowed)
    }

    const { data: realCandidates } = await query

    // Also fetch test profiles (demo accounts for feed population)
    const { data: testCandidates } = await supabase
      .from("test_profiles")
      .select("id, name, age, gender, photo_url, origin, location, created_at")

    // Apply gender filter to test profiles too
    const genderFilterValues: Record<string, string[]> = {
      'women': ['female', 'woman', 'Female', 'Woman'],
      'men':   ['male',   'man',   'Male',   'Man'],
    }
    const allowedGenders = (me.search_gender && me.search_gender !== 'everyone')
      ? genderFilterValues[me.search_gender]
      : null

    const filteredTestCandidates = allowedGenders
      ? (testCandidates || []).filter((p: any) => allowedGenders.includes(p.gender))
      : (testCandidates || [])

    // Normalize test profiles to match real profile shape
    const normalizedTest = filteredTestCandidates.map((p: any) => ({
      ...p,
      location_name: p.location || null,
      last_active_at: p.created_at,
      onboarding_completed: true,
      is_test: true,
    }))

    const candidates = [...(realCandidates || []), ...normalizedTest]

    // Filter out swiped & blocked
    const eligible = candidates.filter(
      (p: any) => !swipedIds.has(p.id) && !blockedIds.has(p.id)
    )

    // Score & sort
    const scored = eligible.map((p: any) => {
      let score = getCompatibilityScore(me.origin, p.origin)

      // Boost recently active profiles
      const hoursSinceActive = (Date.now() - new Date(p.last_active_at).getTime()) / 3600000
      if (hoursSinceActive < 24) score += 10
      if (hoursSinceActive < 1) score += 5

      // Origin filter preference
      if (me.pref_origins && me.pref_origins.length > 0) {
        if (!me.pref_origins.includes(p.origin)) score -= 20
      }

      return {
        ...p,
        connection_type: getConnectionType(me.origin, p.origin),
        compatibility_score: score,
      }
    })

    // Weighted shuffle: add random jitter proportional to score
    // so high-compatibility profiles appear more often but not always first
    const PAGE_SIZE = 15
    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '0', 10)

    const shuffled = scored
      .map((p: any) => ({ ...p, _sort: p.compatibility_score + Math.random() * 40 }))
      .sort((a: any, b: any) => b._sort - a._sort)
      .map(({ _sort, ...p }: any) => p)

    const start = page * PAGE_SIZE
    const feed = shuffled.slice(start, start + PAGE_SIZE)
    const hasMore = start + PAGE_SIZE < shuffled.length

    return new Response(
      JSON.stringify({
        profiles: feed,
        daily_limit_reached: false,
        remaining_swipes: DAILY_SWIPE_LIMIT - (me.daily_swipes_count ?? 0),
        has_more: hasMore,
        page,
        total: shuffled.length,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    )
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 })
  }
})
