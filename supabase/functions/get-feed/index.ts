// TwinFrequency — Feed Queue Edge Function
// Supabase Edge Function: GET /functions/v1/get-feed
// Returns a ranked list of profiles for the current user's feed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── CONNECTION TYPE ───────────────────────────────────────────
// Computed from the stacks, never tabled. These four letters per origin are the
// mechanics: they stay server-side and must not reach client code.
// Rule: take the permutation that maps one stack onto the other and classify it by
// cycle shape. The 24 permutations resolve into the 10 connection types, no gaps.
// Verified against the published matrix: 576 of 576 ordered pairs agree.
const STACKS: Record<string, string> = {
  "Siriusian":"REML","Pleiadian":"RMLE","Lemurian":"RELM","Cassiopeian":"RLME",
  "Procyonian":"RMEL","Lyran":"RLEM","Arcturian":"LEMR","Orion":"LMRE",
  "Vegan":"LERM","Zeta Reticulan":"LREM","Epsilon Eridan":"LMER","Atlantean":"LRME",
  "Andromedan":"ERLM","Polarisian":"ELMR","Nibiruan":"EMRL","Egyptian":"ELRM",
  "Titanian":"EMLR","Blue Avian":"ERML","Tau Cetian":"MREL","Aldebaran":"MLRE",
  "Centaurian":"MLER","Herculean":"MERL","Anunnaki":"MELR","Hyperborean":"MRLE",
};
const SINGLE_SWAP: Record<string, string> = {
  "14":"Cosmic Flow","23":"Twin Stars","13":"Karmic Bonds",
  "24":"Shadow Contracts","12":"Mirror Portals","34":"Mirror Portals",
};
function classifyConnection(a: string, b: string): string | null {
  const A = STACKS[a], B = STACKS[b];
  if (!A || !B) return null;
  const p = [0, 0, 0, 0, 0];
  for (let i = 0; i < 4; i++) p[i + 1] = B.indexOf(A[i]) + 1;
  const seen = new Set<number>(); const lens: number[] = []; const swaps: string[] = [];
  for (let s = 1; s <= 4; s++) {
    if (seen.has(s)) continue;
    const cyc = [s]; seen.add(s); let x = p[s];
    while (x !== s) { cyc.push(x); seen.add(x); x = p[x]; }
    if (cyc.length > 1) {
      lens.push(cyc.length);
      if (cyc.length === 2) swaps.push(cyc.slice().sort().join(""));
    }
  }
  lens.sort();
  const shape = lens.join(",");
  if (shape === "") return "Eternal Reflection";
  if (shape === "2") return SINGLE_SWAP[swaps[0]] || null;
  if (shape === "2,2") {
    const k = swaps.slice().sort().join("|");
    if (k === "14|23") return "Frequency Twins";
    if (k === "13|24") return "Black Holes";
    return "Mirror Portals";
  }
  if (shape === "3") return "Star Alchemy";
  return "Celestial Mentor";
}

const CHANNEL_FRICTION: Record<string, number> = {
  // 0 = no friction, 100 = maximum. Order follows what the canon says each channel does.
  "nourish": 0, "gift": 5, "mirror2": 10, "tandem": 15, "mirror1": 20,
  "mirror4": 30, "drift": 65, "mirror3": 70, "trap": 70, "clash": 100,
};
function channelOf(x: number, y: number): string {
  if (x === y) return "mirror" + x;
  const lo = Math.min(x, y), hi = Math.max(x, y);
  if (lo === 1 && hi === 4) return "gift";
  if (lo === 2 && hi === 3) return "nourish";
  if (lo === 1 && hi === 2) return "tandem";
  if (lo === 3 && hi === 4) return "trap";
  if (lo === 2 && hi === 4) return "drift";
  return "clash";
}
// Mean friction across the pair's four channels. Same rule the published matrix uses.
function pairTension(a: string, b: string): number | null {
  const A = STACKS[a], B = STACKS[b];
  if (!A || !B) return null;
  let sum = 0;
  for (let i = 0; i < 4; i++) sum += CHANNEL_FRICTION[channelOf(i + 1, B.indexOf(A[i]) + 1)];
  return Math.round(sum / 4);
}

function getConnectionType(origin1: string, origin2: string): string {
  if (!origin1 || !origin2) return "Unknown"
  return classifyConnection(origin1, origin2) ?? "Unknown"
}

// ═══════════════════════════════════════════════════════════
// FEED ORDER (0–100)
// Higher = shown earlier. Derived from the pair's tension so this can never
// disagree with the published figure: the most complementary rise to the top,
// everyone else follows. This orders the feed, it never removes anyone from it.
// Not exposed to users.
// ═══════════════════════════════════════════════════════════
function getCompatibilityScore(myOrigin: string, theirOrigin: string): number {
  const t = pairTension(myOrigin, theirOrigin)
  return t === null ? 40 : 100 - t
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
