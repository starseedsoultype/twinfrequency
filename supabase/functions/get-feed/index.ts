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
  Andromedan: 3, Polarisian: 3, Nibiruan: 3, Egyptian: 3, Titan: 3, "Blue Avian": 3,
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

    // Get already-swiped profile IDs (table is 'likes', columns: from_user, to_user)
    const { data: swipedRows } = await supabase
      .from("likes")
      .select("to_user")
      .eq("from_user", user.id)

    const swipedIds = new Set((swipedRows || []).map((r: any) => r.to_user))
    swipedIds.add(user.id) // exclude self

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
      .eq("onboarding_completed", true)
      .gte("age", me.pref_age_min ?? 18)
      .lte("age", me.pref_age_max ?? 80)

    // Gender filter
    if (me.pref_gender && me.pref_gender.length > 0 && me.pref_gender.length < 4) {
      query = query.in("gender", me.pref_gender)
    }

    const { data: realCandidates } = await query

    // Also fetch test profiles (demo accounts for feed population)
    const { data: testCandidates } = await supabase
      .from("test_profiles")
      .select("id, name, age, gender, photo_url, origin, location, created_at")

    // Normalize test profiles to match real profile shape
    const normalizedTest = (testCandidates || []).map((p: any) => ({
      ...p,
      location_name: p.location || null,
      last_active_at: p.created_at,
      onboarding_completed: true,
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

    // Sort by score desc, then shuffle within same-score groups for variety
    scored.sort((a: any, b: any) => {
      if (b.compatibility_score !== a.compatibility_score) {
        return b.compatibility_score - a.compatibility_score
      }
      return Math.random() - 0.5
    })

    // Return top 30
    const feed = scored.slice(0, DAILY_SWIPE_LIMIT)

    return new Response(
      JSON.stringify({
        profiles: feed,
        daily_limit_reached: false,
        remaining_swipes: DAILY_SWIPE_LIMIT - (me.daily_swipes_count ?? 0),
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
