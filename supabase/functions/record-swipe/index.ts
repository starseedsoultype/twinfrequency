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

function getConnectionType(origin1: string, origin2: string): string {
  if (!origin1 || !origin2) return "Unknown"
  return classifyConnection(origin1, origin2) ?? "Unknown"
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

async function sendMatchNotifications(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  targetId: string,
  connectionType: string,
  matchId: string
) {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")
  if (!botToken) return

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, telegram_id")
    .in("id", [userId, targetId])

  if (!profiles) return

  const me = profiles.find(p => p.id === userId)
  const them = profiles.find(p => p.id === targetId)
  if (!me || !them) return

  const sendMsg = async (chatId: number, partnerName: string) => {
    const text =
      `✨ A new frequency match\n\n` +
      `You and ${partnerName || "someone"} are a *${connectionType}* connection.\n\n` +
      `Open TwinFrequency to start the conversation.`

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{
            text: "Open TwinFrequency",
            web_app: { url: `https://twinfrequency.io/chats.html` }
          }]]
        }
      })
    })
  }

  const tasks = []
  if (me.telegram_id) tasks.push(sendMsg(me.telegram_id, them.name))
  if (them.telegram_id) tasks.push(sendMsg(them.telegram_id, me.name))
  await Promise.allSettled(tasks)
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

        await sendMatchNotifications(supabase, user.id, target_id, connectionType, newMatch?.id ?? "")
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
        await sendMatchNotifications(supabase, user.id, target_id, connectionType, matchRetry.id)
        return new Response(
          JSON.stringify({ matched: true, match_id: matchRetry.id, connection_type: connectionType }),
          { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
        )
      }

      await sendMatchNotifications(supabase, user.id, target_id, matchRetry.connection_type, matchRetry.id)
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

    await sendMatchNotifications(supabase, user.id, target_id, connectionType, match.id)
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
