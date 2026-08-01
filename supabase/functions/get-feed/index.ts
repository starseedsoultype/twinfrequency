// TwinFrequency — Feed Queue Edge Function
// Supabase Edge Function: GET /functions/v1/get-feed
// Returns a ranked list of profiles for the current user's feed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── CANONICAL CONNECTION MATRIX ──────────────────────────────
// Generated 2026-07-18 from starseed_relations_v2.csv. Single source of truth.
// Do not edit by hand — regenerate from the CSV.
const CANON_VERDICT_NAMES = ["Cosmic Flow", "Twin Stars", "Mirror Portals", "Celestial Mentor", "Karmic Bonds", "Shadow Contracts", "Black Holes", "Star Alchemy", "Eternal Reflection", "Frequency Twins"];
const CANON_PAIRS: Record<string, number[]> = {"Aldebaran|Aldebaran":[8,0,0,0],"Aldebaran|Andromedan":[9,5,5,1],"Aldebaran|Anunnaki":[7,95,95,0],"Aldebaran|Arcturian":[3,50,50,0],"Aldebaran|Atlantean":[7,95,95,0],"Aldebaran|Blue Avian":[3,50,50,0],"Aldebaran|Cassiopeian":[4,60,60,0],"Aldebaran|Centaurian":[2,35,35,0],"Aldebaran|Egyptian":[0,25,25,0],"Aldebaran|Epsilon Eridan":[2,35,35,0],"Aldebaran|Herculean":[5,70,70,0],"Aldebaran|Hyperborean":[1,15,15,0],"Aldebaran|Lemurian":[3,50,50,0],"Aldebaran|Lyran":[7,95,95,0],"Aldebaran|Nibiruan":[7,95,95,0],"Aldebaran|Orion":[2,35,35,0],"Aldebaran|Pleiadian":[7,95,95,0],"Aldebaran|Polarisian":[7,95,95,0],"Aldebaran|Procyonian":[3,50,50,0],"Aldebaran|Siriusian":[6,80,80,0],"Aldebaran|Tau Cetian":[7,95,95,0],"Aldebaran|Titanian":[3,50,50,0],"Aldebaran|Vegan":[7,95,95,0],"Aldebaran|Zeta Reticulan":[3,50,50,0],"Andromedan|Andromedan":[8,0,0,0],"Andromedan|Anunnaki":[7,95,95,0],"Andromedan|Arcturian":[3,50,50,0],"Andromedan|Atlantean":[7,95,95,0],"Andromedan|Blue Avian":[2,35,35,0],"Andromedan|Cassiopeian":[3,50,50,0],"Andromedan|Centaurian":[3,50,50,0],"Andromedan|Egyptian":[1,15,15,0],"Andromedan|Epsilon Eridan":[6,80,80,0],"Andromedan|Herculean":[3,50,50,0],"Andromedan|Hyperborean":[0,25,25,0],"Andromedan|Lemurian":[2,35,35,0],"Andromedan|Lyran":[7,95,95,0],"Andromedan|Nibiruan":[7,95,95,0],"Andromedan|Orion":[3,50,50,0],"Andromedan|Pleiadian":[7,95,95,0],"Andromedan|Polarisian":[7,95,95,0],"Andromedan|Procyonian":[3,50,50,0],"Andromedan|Siriusian":[2,35,35,0],"Andromedan|Tau Cetian":[7,95,95,0],"Andromedan|Titanian":[5,70,70,0],"Andromedan|Vegan":[7,95,95,0],"Andromedan|Zeta Reticulan":[4,60,60,0],"Anunnaki|Anunnaki":[8,0,0,0],"Anunnaki|Arcturian":[4,60,60,0],"Anunnaki|Atlantean":[6,80,80,0],"Anunnaki|Blue Avian":[3,50,50,0],"Anunnaki|Cassiopeian":[3,50,50,0],"Anunnaki|Centaurian":[1,15,15,0],"Anunnaki|Egyptian":[3,50,50,0],"Anunnaki|Epsilon Eridan":[7,95,95,0],"Anunnaki|Herculean":[2,35,35,0],"Anunnaki|Hyperborean":[5,70,70,0],"Anunnaki|Lemurian":[0,25,25,0],"Anunnaki|Lyran":[9,5,5,1],"Anunnaki|Nibiruan":[2,35,35,0],"Anunnaki|Orion":[3,50,50,0],"Anunnaki|Pleiadian":[7,95,95,0],"Anunnaki|Polarisian":[7,95,95,0],"Anunnaki|Procyonian":[3,50,50,0],"Anunnaki|Siriusian":[7,95,95,0],"Anunnaki|Tau Cetian":[7,95,95,0],"Anunnaki|Titanian":[2,35,35,0],"Anunnaki|Vegan":[7,95,95,0],"Anunnaki|Zeta Reticulan":[3,50,50,0],"Arcturian|Arcturian":[8,0,0,0],"Arcturian|Atlantean":[5,70,70,0],"Arcturian|Blue Avian":[7,95,95,0],"Arcturian|Cassiopeian":[7,95,95,0],"Arcturian|Centaurian":[7,95,95,0],"Arcturian|Egyptian":[2,35,35,0],"Arcturian|Epsilon Eridan":[1,15,15,0],"Arcturian|Herculean":[7,95,95,0],"Arcturian|Hyperborean":[6,80,80,0],"Arcturian|Lemurian":[7,95,95,0],"Arcturian|Lyran":[3,50,50,0],"Arcturian|Nibiruan":[3,50,50,0],"Arcturian|Orion":[7,95,95,0],"Arcturian|Pleiadian":[3,50,50,0],"Arcturian|Polarisian":[2,35,35,0],"Arcturian|Procyonian":[9,5,5,1],"Arcturian|Siriusian":[0,25,25,0],"Arcturian|Tau Cetian":[3,50,50,0],"Arcturian|Titanian":[7,95,95,0],"Arcturian|Vegan":[2,35,35,0],"Arcturian|Zeta Reticulan":[7,95,95,0],"Atlantean|Atlantean":[8,0,0,0],"Atlantean|Blue Avian":[0,25,25,0],"Atlantean|Cassiopeian":[2,35,35,0],"Atlantean|Centaurian":[3,50,50,0],"Atlantean|Egyptian":[3,50,50,0],"Atlantean|Epsilon Eridan":[7,95,95,0],"Atlantean|Herculean":[3,50,50,0],"Atlantean|Hyperborean":[4,60,60,0],"Atlantean|Lemurian":[3,50,50,0],"Atlantean|Lyran":[2,35,35,0],"Atlantean|Nibiruan":[9,5,5,1],"Atlantean|Orion":[1,15,15,0],"Atlantean|Pleiadian":[7,95,95,0],"Atlantean|Polarisian":[7,95,95,0],"Atlantean|Procyonian":[3,50,50,0],"Atlantean|Siriusian":[7,95,95,0],"Atlantean|Tau Cetian":[7,95,95,0],"Atlantean|Titanian":[3,50,50,0],"Atlantean|Vegan":[7,95,95,0],"Atlantean|Zeta Reticulan":[2,35,35,0],"Blue Avian|Blue Avian":[8,0,0,0],"Blue Avian|Cassiopeian":[7,95,95,0],"Blue Avian|Centaurian":[6,80,80,0],"Blue Avian|Egyptian":[7,95,95,0],"Blue Avian|Epsilon Eridan":[3,50,50,0],"Blue Avian|Herculean":[7,95,95,0],"Blue Avian|Hyperborean":[7,95,95,0],"Blue Avian|Lemurian":[2,35,35,0],"Blue Avian|Lyran":[3,50,50,0],"Blue Avian|Nibiruan":[1,15,15,0],"Blue Avian|Orion":[9,5,5,1],"Blue Avian|Pleiadian":[3,50,50,0],"Blue Avian|Polarisian":[5,70,70,0],"Blue Avian|Procyonian":[7,95,95,0],"Blue Avian|Siriusian":[2,35,35,0],"Blue Avian|Tau Cetian":[4,60,60,0],"Blue Avian|Titanian":[7,95,95,0],"Blue Avian|Vegan":[3,50,50,0],"Blue Avian|Zeta Reticulan":[7,95,95,0],"Cassiopeian|Cassiopeian":[8,0,0,0],"Cassiopeian|Centaurian":[7,95,95,0],"Cassiopeian|Egyptian":[7,95,95,0],"Cassiopeian|Epsilon Eridan":[3,50,50,0],"Cassiopeian|Herculean":[6,80,80,0],"Cassiopeian|Hyperborean":[7,95,95,0],"Cassiopeian|Lemurian":[7,95,95,0],"Cassiopeian|Lyran":[2,35,35,0],"Cassiopeian|Nibiruan":[3,50,50,0],"Cassiopeian|Orion":[7,95,95,0],"Cassiopeian|Pleiadian":[1,15,15,0],"Cassiopeian|Polarisian":[0,25,25,0],"Cassiopeian|Procyonian":[7,95,95,0],"Cassiopeian|Siriusian":[5,70,70,0],"Cassiopeian|Tau Cetian":[3,50,50,0],"Cassiopeian|Titanian":[9,5,5,1],"Cassiopeian|Vegan":[3,50,50,0],"Cassiopeian|Zeta Reticulan":[2,35,35,0],"Centaurian|Centaurian":[8,0,0,0],"Centaurian|Egyptian":[7,95,95,0],"Centaurian|Epsilon Eridan":[2,35,35,0],"Centaurian|Herculean":[7,95,95,0],"Centaurian|Hyperborean":[7,95,95,0],"Centaurian|Lemurian":[9,5,5,1],"Centaurian|Lyran":[0,25,25,0],"Centaurian|Nibiruan":[3,50,50,0],"Centaurian|Orion":[2,35,35,0],"Centaurian|Pleiadian":[3,50,50,0],"Centaurian|Polarisian":[4,60,60,0],"Centaurian|Procyonian":[7,95,95,0],"Centaurian|Siriusian":[3,50,50,0],"Centaurian|Tau Cetian":[5,70,70,0],"Centaurian|Titanian":[7,95,95,0],"Centaurian|Vegan":[3,50,50,0],"Centaurian|Zeta Reticulan":[7,95,95,0],"Egyptian|Egyptian":[8,0,0,0],"Egyptian|Epsilon Eridan":[3,50,50,0],"Egyptian|Herculean":[7,95,95,0],"Egyptian|Hyperborean":[9,5,5,1],"Egyptian|Lemurian":[7,95,95,0],"Egyptian|Lyran":[4,60,60,0],"Egyptian|Nibiruan":[5,70,70,0],"Egyptian|Orion":[7,95,95,0],"Egyptian|Pleiadian":[3,50,50,0],"Egyptian|Polarisian":[2,35,35,0],"Egyptian|Procyonian":[6,80,80,0],"Egyptian|Siriusian":[3,50,50,0],"Egyptian|Tau Cetian":[3,50,50,0],"Egyptian|Titanian":[7,95,95,0],"Egyptian|Vegan":[2,35,35,0],"Egyptian|Zeta Reticulan":[7,95,95,0],"Epsilon Eridan|Epsilon Eridan":[8,0,0,0],"Epsilon Eridan|Herculean":[3,50,50,0],"Epsilon Eridan|Hyperborean":[3,50,50,0],"Epsilon Eridan|Lemurian":[3,50,50,0],"Epsilon Eridan|Lyran":[7,95,95,0],"Epsilon Eridan|Nibiruan":[7,95,95,0],"Epsilon Eridan|Orion":[2,35,35,0],"Epsilon Eridan|Pleiadian":[7,95,95,0],"Epsilon Eridan|Polarisian":[7,95,95,0],"Epsilon Eridan|Procyonian":[0,25,25,0],"Epsilon Eridan|Siriusian":[9,5,5,1],"Epsilon Eridan|Tau Cetian":[7,95,95,0],"Epsilon Eridan|Titanian":[4,60,60,0],"Epsilon Eridan|Vegan":[7,95,95,0],"Epsilon Eridan|Zeta Reticulan":[5,70,70,0],"Herculean|Herculean":[8,0,0,0],"Herculean|Hyperborean":[7,95,95,0],"Herculean|Lemurian":[7,95,95,0],"Herculean|Lyran":[3,50,50,0],"Herculean|Nibiruan":[2,35,35,0],"Herculean|Orion":[7,95,95,0],"Herculean|Pleiadian":[3,50,50,0],"Herculean|Polarisian":[3,50,50,0],"Herculean|Procyonian":[7,95,95,0],"Herculean|Siriusian":[4,60,60,0],"Herculean|Tau Cetian":[1,15,15,0],"Herculean|Titanian":[2,35,35,0],"Herculean|Vegan":[0,25,25,0],"Herculean|Zeta Reticulan":[9,5,5,1],"Hyperborean|Hyperborean":[8,0,0,0],"Hyperborean|Lemurian":[7,95,95,0],"Hyperborean|Lyran":[3,50,50,0],"Hyperborean|Nibiruan":[3,50,50,0],"Hyperborean|Orion":[7,95,95,0],"Hyperborean|Pleiadian":[2,35,35,0],"Hyperborean|Polarisian":[3,50,50,0],"Hyperborean|Procyonian":[2,35,35,0],"Hyperborean|Siriusian":[3,50,50,0],"Hyperborean|Tau Cetian":[2,35,35,0],"Hyperborean|Titanian":[7,95,95,0],"Hyperborean|Vegan":[3,50,50,0],"Hyperborean|Zeta Reticulan":[7,95,95,0],"Lemurian|Lemurian":[8,0,0,0],"Lemurian|Lyran":[1,15,15,0],"Lemurian|Nibiruan":[3,50,50,0],"Lemurian|Orion":[6,80,80,0],"Lemurian|Pleiadian":[5,70,70,0],"Lemurian|Polarisian":[3,50,50,0],"Lemurian|Procyonian":[7,95,95,0],"Lemurian|Siriusian":[2,35,35,0],"Lemurian|Tau Cetian":[3,50,50,0],"Lemurian|Titanian":[7,95,95,0],"Lemurian|Vegan":[4,60,60,0],"Lemurian|Zeta Reticulan":[7,95,95,0],"Lyran|Lyran":[8,0,0,0],"Lyran|Nibiruan":[6,80,80,0],"Lyran|Orion":[3,50,50,0],"Lyran|Pleiadian":[7,95,95,0],"Lyran|Polarisian":[7,95,95,0],"Lyran|Procyonian":[5,70,70,0],"Lyran|Siriusian":[7,95,95,0],"Lyran|Tau Cetian":[7,95,95,0],"Lyran|Titanian":[3,50,50,0],"Lyran|Vegan":[7,95,95,0],"Lyran|Zeta Reticulan":[2,35,35,0],"Nibiruan|Nibiruan":[8,0,0,0],"Nibiruan|Orion":[0,25,25,0],"Nibiruan|Pleiadian":[7,95,95,0],"Nibiruan|Polarisian":[7,95,95,0],"Nibiruan|Procyonian":[4,60,60,0],"Nibiruan|Siriusian":[7,95,95,0],"Nibiruan|Tau Cetian":[7,95,95,0],"Nibiruan|Titanian":[2,35,35,0],"Nibiruan|Vegan":[7,95,95,0],"Nibiruan|Zeta Reticulan":[3,50,50,0],"Orion|Orion":[8,0,0,0],"Orion|Pleiadian":[4,60,60,0],"Orion|Polarisian":[3,50,50,0],"Orion|Procyonian":[7,95,95,0],"Orion|Siriusian":[3,50,50,0],"Orion|Tau Cetian":[3,50,50,0],"Orion|Titanian":[7,95,95,0],"Orion|Vegan":[5,70,70,0],"Orion|Zeta Reticulan":[7,95,95,0],"Pleiadian|Pleiadian":[8,0,0,0],"Pleiadian|Polarisian":[9,5,5,1],"Pleiadian|Procyonian":[2,35,35,0],"Pleiadian|Siriusian":[7,95,95,0],"Pleiadian|Tau Cetian":[2,35,35,0],"Pleiadian|Titanian":[0,25,25,0],"Pleiadian|Vegan":[6,80,80,0],"Pleiadian|Zeta Reticulan":[3,50,50,0],"Polarisian|Polarisian":[8,0,0,0],"Polarisian|Procyonian":[3,50,50,0],"Polarisian|Siriusian":[7,95,95,0],"Polarisian|Tau Cetian":[6,80,80,0],"Polarisian|Titanian":[1,15,15,0],"Polarisian|Vegan":[2,35,35,0],"Polarisian|Zeta Reticulan":[3,50,50,0],"Procyonian|Procyonian":[8,0,0,0],"Procyonian|Siriusian":[1,15,15,0],"Procyonian|Tau Cetian":[2,35,35,0],"Procyonian|Titanian":[7,95,95,0],"Procyonian|Vegan":[3,50,50,0],"Procyonian|Zeta Reticulan":[7,95,95,0],"Siriusian|Siriusian":[8,0,0,0],"Siriusian|Tau Cetian":[7,95,95,0],"Siriusian|Titanian":[3,50,50,0],"Siriusian|Vegan":[7,95,95,0],"Siriusian|Zeta Reticulan":[3,50,50,0],"Tau Cetian|Tau Cetian":[8,0,0,0],"Tau Cetian|Titanian":[3,50,50,0],"Tau Cetian|Vegan":[9,5,5,1],"Tau Cetian|Zeta Reticulan":[0,25,25,0],"Titanian|Titanian":[8,0,0,0],"Titanian|Vegan":[3,50,50,0],"Titanian|Zeta Reticulan":[6,80,80,0],"Vegan|Vegan":[8,0,0,0],"Vegan|Zeta Reticulan":[1,15,15,0],"Zeta Reticulan|Zeta Reticulan":[8,0,0,0]};
function canonPair(a, b) {
  const d = CANON_PAIRS[a + "|" + b] || CANON_PAIRS[b + "|" + a];
  return d ? { verdict: CANON_VERDICT_NAMES[d[0]], tension_peak: d[1], tension_avg: d[2], pure: !!d[3] } : null;
}

function getConnectionType(origin1: string, origin2: string): string {
  if (!origin1 || !origin2 || origin1 === "Unknown" || origin2 === "Unknown") return "Unknown"
  const p = canonPair(origin1, origin2)
  return p ? p.verdict : "Unknown"
}

// ═══════════════════════════════════════════════════════════
// COMPATIBILITY SCORE (0–100)
// Higher = more compatible = shown first in feed
// ═══════════════════════════════════════════════════════════
function getCompatibilityScore(myOrigin: string, theirOrigin: string): number {
  const type = getConnectionType(myOrigin, theirOrigin)
  // Score is used for feed ranking only — not exposed to users
  const scores: Record<string, number> = {
    "Eternal Reflection": 95,
    "Frequency Twins": 90,
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
