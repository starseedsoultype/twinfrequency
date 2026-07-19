// TwinFrequency — Feed Queue Edge Function
// Supabase Edge Function: GET /functions/v1/get-feed
// Returns a ranked list of profiles for the current user's feed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── CANONICAL CONNECTION MATRIX ──────────────────────────────
// Generated 2026-07-18 from starseed_relations_v2.csv. Single source of truth.
// Do not edit by hand — regenerate from the CSV.
const CANON_VERDICT_NAMES = ["Cosmic Flow", "Twin Stars", "Mirror Portals", "Celestial Mentor", "Karmic Bonds", "Shadow Contracts", "Black Holes", "Star Alchemy", "Eternal Reflection"];
const CANON_PAIRS: Record<string, number[]> = {"Aldebaran|Aldebaran":[8,0,0,0],"Aldebaran|Andromedan":[7,100,80,0],"Aldebaran|Anunnaki":[0,50,32,0],"Aldebaran|Arcturian":[7,100,68,0],"Aldebaran|Atlantean":[3,75,53,0],"Aldebaran|Blue Avian":[7,100,69,0],"Aldebaran|Cassiopeian":[3,75,43,0],"Aldebaran|Centaurian":[0,20,15,0],"Aldebaran|Egyptian":[6,90,56,0],"Aldebaran|Epsilon Eridan":[7,100,100,1],"Aldebaran|Herculean":[0,65,37,0],"Aldebaran|Hyperborean":[0,75,45,0],"Aldebaran|Lemurian":[7,100,62,0],"Aldebaran|Lyran":[3,50,35,0],"Aldebaran|Nibiruan":[6,90,60,0],"Aldebaran|Orion":[5,75,70,0],"Aldebaran|Pleiadian":[3,75,53,0],"Aldebaran|Polarisian":[6,90,49,0],"Aldebaran|Procyonian":[7,100,68,0],"Aldebaran|Siriusian":[7,100,68,0],"Aldebaran|Tau Cetian":[0,50,32,0],"Aldebaran|Titanian":[7,100,80,0],"Aldebaran|Vegan":[1,65,50,0],"Aldebaran|Zeta Reticulan":[7,100,75,0],"Andromedan|Andromedan":[8,0,0,0],"Andromedan|Anunnaki":[6,90,60,0],"Andromedan|Arcturian":[7,100,68,0],"Andromedan|Atlantean":[3,50,35,0],"Andromedan|Blue Avian":[0,20,15,0],"Andromedan|Cassiopeian":[7,100,75,0],"Andromedan|Centaurian":[7,100,69,0],"Andromedan|Egyptian":[0,75,45,0],"Andromedan|Epsilon Eridan":[7,100,68,0],"Andromedan|Herculean":[7,100,80,0],"Andromedan|Hyperborean":[6,90,56,0],"Andromedan|Lemurian":[5,75,70,0],"Andromedan|Lyran":[3,75,53,0],"Andromedan|Nibiruan":[0,50,32,0],"Andromedan|Orion":[7,100,62,0],"Andromedan|Pleiadian":[1,65,50,0],"Andromedan|Polarisian":[0,50,32,0],"Andromedan|Procyonian":[7,100,68,0],"Andromedan|Siriusian":[7,100,100,1],"Andromedan|Tau Cetian":[6,90,49,0],"Andromedan|Titanian":[0,65,37,0],"Andromedan|Vegan":[3,75,53,0],"Andromedan|Zeta Reticulan":[3,75,43,0],"Anunnaki|Anunnaki":[8,0,0,0],"Anunnaki|Arcturian":[3,75,43,0],"Anunnaki|Atlantean":[7,100,68,0],"Anunnaki|Blue Avian":[7,100,75,0],"Anunnaki|Cassiopeian":[7,100,62,0],"Anunnaki|Centaurian":[0,75,45,0],"Anunnaki|Egyptian":[7,100,80,0],"Anunnaki|Epsilon Eridan":[3,75,53,0],"Anunnaki|Herculean":[0,20,15,0],"Anunnaki|Hyperborean":[0,65,37,0],"Anunnaki|Lemurian":[1,65,45,0],"Anunnaki|Lyran":[7,100,75,0],"Anunnaki|Nibiruan":[7,100,95,0],"Anunnaki|Orion":[7,100,68,0],"Anunnaki|Pleiadian":[1,65,50,0],"Anunnaki|Polarisian":[6,90,62,0],"Anunnaki|Procyonian":[7,100,75,0],"Anunnaki|Siriusian":[3,50,35,0],"Anunnaki|Tau Cetian":[0,50,32,0],"Anunnaki|Titanian":[6,90,77,0],"Anunnaki|Vegan":[3,50,35,0],"Anunnaki|Zeta Reticulan":[7,100,62,0],"Arcturian|Arcturian":[8,0,0,0],"Arcturian|Atlantean":[0,65,37,0],"Arcturian|Blue Avian":[1,65,50,0],"Arcturian|Cassiopeian":[6,90,60,0],"Arcturian|Centaurian":[3,75,53,0],"Arcturian|Egyptian":[7,100,100,1],"Arcturian|Epsilon Eridan":[0,75,45,0],"Arcturian|Herculean":[3,50,35,0],"Arcturian|Hyperborean":[7,100,68,0],"Arcturian|Lemurian":[6,90,49,0],"Arcturian|Lyran":[7,100,80,0],"Arcturian|Nibiruan":[7,100,75,0],"Arcturian|Orion":[0,50,32,0],"Arcturian|Pleiadian":[7,100,69,0],"Arcturian|Polarisian":[5,75,70,0],"Arcturian|Procyonian":[7,100,80,0],"Arcturian|Siriusian":[6,90,56,0],"Arcturian|Tau Cetian":[7,100,62,0],"Arcturian|Titanian":[3,75,53,0],"Arcturian|Vegan":[0,20,15,0],"Arcturian|Zeta Reticulan":[0,50,32,0],"Atlantean|Atlantean":[8,0,0,0],"Atlantean|Blue Avian":[1,65,45,0],"Atlantean|Cassiopeian":[6,90,77,0],"Atlantean|Centaurian":[7,100,68,0],"Atlantean|Egyptian":[7,100,75,0],"Atlantean|Epsilon Eridan":[0,50,32,0],"Atlantean|Herculean":[7,100,62,0],"Atlantean|Hyperborean":[3,75,43,0],"Atlantean|Lemurian":[7,100,75,0],"Atlantean|Lyran":[7,100,95,0],"Atlantean|Nibiruan":[7,100,75,0],"Atlantean|Orion":[0,75,45,0],"Atlantean|Pleiadian":[6,90,62,0],"Atlantean|Polarisian":[1,65,50,0],"Atlantean|Procyonian":[7,100,80,0],"Atlantean|Siriusian":[6,90,60,0],"Atlantean|Tau Cetian":[3,50,35,0],"Atlantean|Titanian":[7,100,62,0],"Atlantean|Vegan":[0,50,32,0],"Atlantean|Zeta Reticulan":[0,20,15,0],"Blue Avian|Blue Avian":[8,0,0,0],"Blue Avian|Cassiopeian":[1,65,50,0],"Blue Avian|Centaurian":[7,100,75,0],"Blue Avian|Egyptian":[0,50,32,0],"Blue Avian|Epsilon Eridan":[7,100,62,0],"Blue Avian|Herculean":[6,90,62,0],"Blue Avian|Hyperborean":[6,90,49,0],"Blue Avian|Lemurian":[7,100,100,1],"Blue Avian|Lyran":[7,100,68,0],"Blue Avian|Nibiruan":[0,75,45,0],"Blue Avian|Orion":[7,100,75,0],"Blue Avian|Pleiadian":[7,100,75,0],"Blue Avian|Polarisian":[0,65,37,0],"Blue Avian|Procyonian":[3,75,53,0],"Blue Avian|Siriusian":[5,75,70,0],"Blue Avian|Tau Cetian":[6,90,55,0],"Blue Avian|Titanian":[0,50,32,0],"Blue Avian|Vegan":[7,100,75,0],"Blue Avian|Zeta Reticulan":[3,50,35,0],"Cassiopeian|Cassiopeian":[8,0,0,0],"Cassiopeian|Centaurian":[3,50,35,0],"Cassiopeian|Egyptian":[3,50,35,0],"Cassiopeian|Epsilon Eridan":[7,100,80,0],"Cassiopeian|Herculean":[7,100,68,0],"Cassiopeian|Hyperborean":[3,75,53,0],"Cassiopeian|Lemurian":[0,50,32,0],"Cassiopeian|Lyran":[0,20,15,0],"Cassiopeian|Nibiruan":[7,100,62,0],"Cassiopeian|Orion":[6,90,62,0],"Cassiopeian|Pleiadian":[0,75,45,0],"Cassiopeian|Polarisian":[1,65,45,0],"Cassiopeian|Procyonian":[0,50,32,0],"Cassiopeian|Siriusian":[0,65,37,0],"Cassiopeian|Tau Cetian":[7,100,68,0],"Cassiopeian|Titanian":[7,100,75,0],"Cassiopeian|Vegan":[7,100,75,0],"Cassiopeian|Zeta Reticulan":[7,100,95,0],"Centaurian|Centaurian":[8,0,0,0],"Centaurian|Egyptian":[6,90,49,0],"Centaurian|Epsilon Eridan":[5,75,70,0],"Centaurian|Herculean":[0,50,32,0],"Centaurian|Hyperborean":[0,50,32,0],"Centaurian|Lemurian":[7,100,75,0],"Centaurian|Lyran":[1,65,45,0],"Centaurian|Nibiruan":[7,100,75,0],"Centaurian|Orion":[7,100,100,1],"Centaurian|Pleiadian":[7,100,75,0],"Centaurian|Polarisian":[6,90,55,0],"Centaurian|Procyonian":[1,65,50,0],"Centaurian|Siriusian":[7,100,62,0],"Centaurian|Tau Cetian":[0,65,37,0],"Centaurian|Titanian":[6,90,62,0],"Centaurian|Vegan":[7,100,75,0],"Centaurian|Zeta Reticulan":[1,65,50,0],"Egyptian|Egyptian":[8,0,0,0],"Egyptian|Epsilon Eridan":[7,100,68,0],"Egyptian|Herculean":[6,90,60,0],"Egyptian|Hyperborean":[7,100,80,0],"Egyptian|Lemurian":[3,75,53,0],"Egyptian|Lyran":[3,75,43,0],"Egyptian|Nibiruan":[0,65,37,0],"Egyptian|Orion":[1,65,50,0],"Egyptian|Pleiadian":[7,100,62,0],"Egyptian|Polarisian":[0,20,15,0],"Egyptian|Procyonian":[7,100,68,0],"Egyptian|Siriusian":[7,100,68,0],"Egyptian|Tau Cetian":[7,100,69,0],"Egyptian|Titanian":[0,50,32,0],"Egyptian|Vegan":[5,75,70,0],"Egyptian|Zeta Reticulan":[3,75,53,0],"Epsilon Eridan|Epsilon Eridan":[8,0,0,0],"Epsilon Eridan|Herculean":[7,100,75,0],"Epsilon Eridan|Hyperborean":[7,100,68,0],"Epsilon Eridan|Lemurian":[7,100,69,0],"Epsilon Eridan|Lyran":[6,90,60,0],"Epsilon Eridan|Nibiruan":[3,50,35,0],"Epsilon Eridan|Orion":[0,20,15,0],"Epsilon Eridan|Pleiadian":[6,90,49,0],"Epsilon Eridan|Polarisian":[3,75,53,0],"Epsilon Eridan|Procyonian":[6,90,56,0],"Epsilon Eridan|Siriusian":[7,100,80,0],"Epsilon Eridan|Tau Cetian":[1,65,50,0],"Epsilon Eridan|Titanian":[3,75,43,0],"Epsilon Eridan|Vegan":[0,50,32,0],"Epsilon Eridan|Zeta Reticulan":[0,65,37,0],"Herculean|Herculean":[8,0,0,0],"Herculean|Hyperborean":[0,50,32,0],"Herculean|Lemurian":[3,50,35,0],"Herculean|Lyran":[7,100,62,0],"Herculean|Nibiruan":[6,90,77,0],"Herculean|Orion":[1,65,50,0],"Herculean|Pleiadian":[7,100,68,0],"Herculean|Polarisian":[7,100,75,0],"Herculean|Procyonian":[3,75,53,0],"Herculean|Siriusian":[3,75,43,0],"Herculean|Tau Cetian":[0,75,45,0],"Herculean|Titanian":[7,100,95,0],"Herculean|Vegan":[1,65,45,0],"Herculean|Zeta Reticulan":[7,100,75,0],"Hyperborean|Hyperborean":[8,0,0,0],"Hyperborean|Lemurian":[1,65,50,0],"Hyperborean|Lyran":[7,100,75,0],"Hyperborean|Nibiruan":[7,100,80,0],"Hyperborean|Orion":[3,75,53,0],"Hyperborean|Pleiadian":[5,75,70,0],"Hyperborean|Polarisian":[7,100,69,0],"Hyperborean|Procyonian":[7,100,100,1],"Hyperborean|Siriusian":[7,100,68,0],"Hyperborean|Tau Cetian":[0,20,15,0],"Hyperborean|Titanian":[6,90,60,0],"Hyperborean|Vegan":[7,100,62,0],"Hyperborean|Zeta Reticulan":[3,50,35,0],"Lemurian|Lemurian":[8,0,0,0],"Lemurian|Lyran":[0,75,45,0],"Lemurian|Nibiruan":[7,100,68,0],"Lemurian|Orion":[7,100,75,0],"Lemurian|Pleiadian":[0,65,37,0],"Lemurian|Polarisian":[7,100,75,0],"Lemurian|Procyonian":[0,50,32,0],"Lemurian|Siriusian":[0,20,15,0],"Lemurian|Tau Cetian":[7,100,75,0],"Lemurian|Titanian":[1,65,50,0],"Lemurian|Vegan":[6,90,55,0],"Lemurian|Zeta Reticulan":[6,90,62,0],"Lyran|Lyran":[8,0,0,0],"Lyran|Nibiruan":[7,100,68,0],"Lyran|Orion":[7,100,75,0],"Lyran|Pleiadian":[0,50,32,0],"Lyran|Polarisian":[3,50,35,0],"Lyran|Procyonian":[0,65,37,0],"Lyran|Siriusian":[0,50,32,0],"Lyran|Tau Cetian":[1,65,50,0],"Lyran|Titanian":[7,100,62,0],"Lyran|Vegan":[6,90,62,0],"Lyran|Zeta Reticulan":[6,90,77,0],"Nibiruan|Nibiruan":[8,0,0,0],"Nibiruan|Orion":[1,65,45,0],"Nibiruan|Pleiadian":[3,50,35,0],"Nibiruan|Polarisian":[0,50,32,0],"Nibiruan|Procyonian":[3,75,43,0],"Nibiruan|Siriusian":[3,75,53,0],"Nibiruan|Tau Cetian":[6,90,62,0],"Nibiruan|Titanian":[0,20,15,0],"Nibiruan|Vegan":[1,65,50,0],"Nibiruan|Zeta Reticulan":[7,100,62,0],"Orion|Orion":[8,0,0,0],"Orion|Pleiadian":[6,90,55,0],"Orion|Polarisian":[7,100,75,0],"Orion|Procyonian":[6,90,49,0],"Orion|Siriusian":[7,100,69,0],"Orion|Tau Cetian":[7,100,75,0],"Orion|Titanian":[3,50,35,0],"Orion|Vegan":[0,65,37,0],"Orion|Zeta Reticulan":[0,50,32,0],"Pleiadian|Pleiadian":[8,0,0,0],"Pleiadian|Polarisian":[7,100,75,0],"Pleiadian|Procyonian":[0,20,15,0],"Pleiadian|Siriusian":[0,50,32,0],"Pleiadian|Tau Cetian":[7,100,100,1],"Pleiadian|Titanian":[1,65,45,0],"Pleiadian|Vegan":[7,100,75,0],"Pleiadian|Zeta Reticulan":[7,100,75,0],"Polarisian|Polarisian":[8,0,0,0],"Polarisian|Procyonian":[7,100,62,0],"Polarisian|Siriusian":[1,65,50,0],"Polarisian|Tau Cetian":[7,100,75,0],"Polarisian|Titanian":[0,75,45,0],"Polarisian|Vegan":[7,100,100,1],"Polarisian|Zeta Reticulan":[7,100,68,0],"Procyonian|Procyonian":[8,0,0,0],"Procyonian|Siriusian":[0,75,45,0],"Procyonian|Tau Cetian":[5,75,70,0],"Procyonian|Titanian":[3,50,35,0],"Procyonian|Vegan":[7,100,69,0],"Procyonian|Zeta Reticulan":[6,90,60,0],"Siriusian|Siriusian":[8,0,0,0],"Siriusian|Tau Cetian":[3,75,53,0],"Siriusian|Titanian":[7,100,75,0],"Siriusian|Vegan":[6,90,49,0],"Siriusian|Zeta Reticulan":[7,100,80,0],"Tau Cetian|Tau Cetian":[8,0,0,0],"Tau Cetian|Titanian":[7,100,75,0],"Tau Cetian|Vegan":[7,100,75,0],"Tau Cetian|Zeta Reticulan":[1,65,45,0],"Titanian|Titanian":[8,0,0,0],"Titanian|Vegan":[7,100,68,0],"Titanian|Zeta Reticulan":[7,100,68,0],"Vegan|Vegan":[8,0,0,0],"Vegan|Zeta Reticulan":[0,75,45,0],"Zeta Reticulan|Zeta Reticulan":[8,0,0,0]};
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
