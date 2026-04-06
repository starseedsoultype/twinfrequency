// TwinFrequency — Record Swipe Edge Function
// Supabase Edge Function: POST /functions/v1/record-swipe
// Body: { target_id: string, action: "like" | "pass" }
// Returns: { matched: boolean, match_id?: string, connection_type?: string }
//
// DB Schema:
//   likes    (id, from_user, to_user, created_at)
//   matches  (id, user1, user2, connection_type, created_at)
//   Trigger: on_like_created → check_mutual_like() auto-creates match on mutual like

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
// ═══════════════════════════════════════════════════════════
function getConnectionType(origin1: string, origin2: string): string {
  if (!origin1 || !origin2 || origin1 === "Unknown" || origin2 === "Unknown") return "Unknown"
  if (origin1 === origin2) return "Frequency Twins"

  const g1 = ORIGIN_GROUP[origin1]
  const g2 = ORIGIN_GROUP[origin2]
  if (!g1 || !g2) return "Unknown"

  const diff = Math.abs(g1 - g2)
  if (diff === 0) return "Eternal Reflection"

  if (diff === 1) {
    const lower = Math.min(g1, g2)
    if (lower === 1) return "Twin Stars"
    if (lower === 2) return "Cosmic Flow"
    if (lower === 3) return "Star Alchemy"
  }

  if (diff === 2) {
    const lower = Math.min(g1, g2)
    if (lower === 1) return "Mirror Portals"
    if (lower === 2) return "Celestial Mentor"
  }

  if (diff === 3) {
    const hash = (origin1.charCodeAt(0) + origin2.charCodeAt(0)) % 3
    if (hash === 0) return "Karmic Bonds"
    if (hash === 1) return "Shadow Contracts"
    return "Black Holes"
  }

  return "Unknown"
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return new Response("Unauthorized", { status: 401 })

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response("Unauthorized", { status: 401 })

    const body = await req.json()
    const { target_id, action } = body

    if (!target_id || !["like", "pass"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
      })
    }

    // ── If pass, just return (no record needed)
    if (action === "pass") {
      return new Response(
        JSON.stringify({ matched: false }),
        { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      )
    }

    // ── Record like (upsert to avoid duplicates)
    const { error: likeError } = await supabase
      .from("likes")
      .upsert(
        { from_user: user.id, to_user: target_id },
        { onConflict: "from_user,to_user" }
      )

    if (likeError) throw likeError

    // ── Check if mutual like exists (trigger may have already created match)
    const { data: mutualLike } = await supabase
      .from("likes")
      .select("id")
      .eq("from_user", target_id)
      .eq("to_user", user.id)
      .maybeSingle()

    if (!mutualLike) {
      // No mutual like yet — no match
      return new Response(
        JSON.stringify({ matched: false }),
        { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      )
    }

    // ── Mutual like exists — find the match (created by DB trigger)
    const { data: match } = await supabase
      .from("matches")
      .select("id, connection_type")
      .or(
        `and(user1.eq.${user.id},user2.eq.${target_id}),and(user1.eq.${target_id},user2.eq.${user.id})`
      )
      .maybeSingle()

    if (!match) {
      // Trigger may not have fired yet — wait a moment and retry once
      await new Promise(r => setTimeout(r, 300))
      const { data: matchRetry } = await supabase
        .from("matches")
        .select("id, connection_type")
        .or(
          `and(user1.eq.${user.id},user2.eq.${target_id}),and(user1.eq.${target_id},user2.eq.${user.id})`
        )
        .maybeSingle()

      if (!matchRetry) {
        // Trigger didn't fire — create match manually
        const { data: me } = await supabase.from("profiles").select("origin").eq("id", user.id).single()
        const { data: them } = await supabase.from("profiles").select("origin").eq("id", target_id).single()
        const connectionType = getConnectionType(me?.origin ?? "Unknown", them?.origin ?? "Unknown")

        const { data: newMatch } = await supabase
          .from("matches")
          .insert({
            user1: user.id < target_id ? user.id : target_id,
            user2: user.id < target_id ? target_id : user.id,
            connection_type: connectionType,
          })
          .select("id")
          .single()

        return new Response(
          JSON.stringify({ matched: true, match_id: newMatch?.id, connection_type: connectionType }),
          { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        )
      }

      // Backfill connection_type if missing
      if (!matchRetry.connection_type) {
        const { data: me } = await supabase.from("profiles").select("origin").eq("id", user.id).single()
        const { data: them } = await supabase.from("profiles").select("origin").eq("id", target_id).single()
        const connectionType = getConnectionType(me?.origin ?? "Unknown", them?.origin ?? "Unknown")
        await supabase.from("matches").update({ connection_type: connectionType }).eq("id", matchRetry.id)
        return new Response(
          JSON.stringify({ matched: true, match_id: matchRetry.id, connection_type: connectionType }),
          { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        )
      }

      return new Response(
        JSON.stringify({ matched: true, match_id: matchRetry.id, connection_type: matchRetry.connection_type }),
        { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      )
    }

    // ── Match found — backfill connection_type if missing
    let connectionType = match.connection_type
    if (!connectionType) {
      const { data: me } = await supabase.from("profiles").select("origin").eq("id", user.id).single()
      const { data: them } = await supabase.from("profiles").select("origin").eq("id", target_id).single()
      connectionType = getConnectionType(me?.origin ?? "Unknown", them?.origin ?? "Unknown")
      await supabase.from("matches").update({ connection_type: connectionType }).eq("id", match.id)
    }

    return new Response(
      JSON.stringify({ matched: true, match_id: match.id, connection_type: connectionType }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    )

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }
})
