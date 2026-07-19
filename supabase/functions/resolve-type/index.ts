// StarSeed / TwinFrequency — Resolve Type Edge Function
// POST /functions/v1/resolve-type
// Body: { scores: {R,E,M,L} } | { origin_name: string } | { origin_slug: string }
// Returns: { name, funcs, group }
// The 24 type stacks live ONLY here — never in client code.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const TYPES: { name: string; funcs: string[]; group: string }[] = [
  { name: "Siriusian",      funcs: ["R","E","M","L"], group: "I" },
  { name: "Pleiadian",      funcs: ["R","M","L","E"], group: "I" },
  { name: "Lemurian",       funcs: ["R","E","L","M"], group: "I" },
  { name: "Cassiopeian",    funcs: ["R","L","M","E"], group: "I" },
  { name: "Procyonian",     funcs: ["R","M","E","L"], group: "I" },
  { name: "Lyran",          funcs: ["R","L","E","M"], group: "I" },
  { name: "Arcturian",      funcs: ["L","E","M","R"], group: "II" },
  { name: "Orion",          funcs: ["L","M","R","E"], group: "II" },
  { name: "Vegan",          funcs: ["L","E","R","M"], group: "II" },
  { name: "Zeta Reticulan", funcs: ["L","R","E","M"], group: "II" },
  { name: "Epsilon Eridan", funcs: ["L","M","E","R"], group: "II" },
  { name: "Atlantean",      funcs: ["L","R","M","E"], group: "II" },
  { name: "Andromedan",     funcs: ["E","R","L","M"], group: "III" },
  { name: "Polarisian",     funcs: ["E","L","M","R"], group: "III" },
  { name: "Nibiruan",       funcs: ["E","M","R","L"], group: "III" },
  { name: "Egyptian",       funcs: ["E","L","R","M"], group: "III" },
  { name: "Titanian",       funcs: ["E","M","L","R"], group: "III" },
  { name: "Blue Avian",     funcs: ["E","R","M","L"], group: "III" },
  { name: "Tau Cetian",     funcs: ["M","R","E","L"], group: "IV" },
  { name: "Aldebaran",      funcs: ["M","L","R","E"], group: "IV" },
  { name: "Centaurian",     funcs: ["M","L","E","R"], group: "IV" },
  { name: "Herculean",      funcs: ["M","E","R","L"], group: "IV" },
  { name: "Anunnaki",       funcs: ["M","E","L","R"], group: "IV" },
  { name: "Hyperborean",    funcs: ["M","R","L","E"], group: "IV" },
]

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function slugify(s: string): string {
  return String(s || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/_/g, "-")
}

function fromScores(scores: Record<string, number>) {
  // Same ordering semantics as the legacy client: entries in R,E,M,L order,
  // stable sort by score desc — ties resolve by that canonical order.
  const entries: [string, number][] = [
    ["R", Number(scores.R) || 0],
    ["E", Number(scores.E) || 0],
    ["M", Number(scores.M) || 0],
    ["L", Number(scores.L) || 0],
  ]
  const order = entries.sort((a, b) => b[1] - a[1]).map(([f]) => f)
  return TYPES.find(t => t.funcs.join("") === order.join("")) || null
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...CORS, "Content-Type": "application/json" } })
  }
  try {
    const body = await req.json()
    let t = null
    if (body && body.scores && typeof body.scores === "object") {
      t = fromScores(body.scores)
    } else if (body && typeof body.origin_name === "string") {
      const n = body.origin_name.trim().toLowerCase()
      t = TYPES.find(x => x.name.toLowerCase() === n) || null
    } else if (body && typeof body.origin_slug === "string") {
      const s = slugify(body.origin_slug)
      t = TYPES.find(x => slugify(x.name) === s) || null
    }
    if (!t) {
      return new Response(JSON.stringify({ error: "not_resolved" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } })
    }
    return new Response(JSON.stringify({ name: t.name, funcs: t.funcs, group: t.group }),
      { headers: { ...CORS, "Content-Type": "application/json" } })
  } catch (_e) {
    return new Response(JSON.stringify({ error: "invalid_json" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } })
  }
})
