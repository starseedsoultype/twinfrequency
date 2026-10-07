import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STATS_KEY = Deno.env.get("STATS_KEY") ?? "mirror2026";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Stats-Key",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const key = req.headers.get("X-Stats-Key") || new URL(req.url).searchParams.get("key");
  if (key !== STATS_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const [sessionsRes, friendsRes] = await Promise.all([
    db.from("mirror_sessions").select("id, code, result_unlocked, friend_count, self_scores, created_at"),
    db.from("mirror_friend_responses").select("session_code, scores, created_at"),
  ]);

  const sessions = sessionsRes.data ?? [];
  const friends = friendsRes.data ?? [];

  const total = sessions.length;
  const unlocked = sessions.filter((s: any) => s.result_unlocked).length;
  const totalFriends = friends.length;
  const avgFriends = total > 0 ? (totalFriends / total).toFixed(1) : "0";

  // Friend count distribution
  const fcDist: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3+": 0 };
  sessions.forEach((s: any) => {
    const fc = s.friend_count ?? 0;
    if (fc === 0) fcDist["0"]++;
    else if (fc === 1) fcDist["1"]++;
    else if (fc === 2) fcDist["2"]++;
    else fcDist["3+"]++;
  });

  // Self dominant frequency
  const selfFreq: Record<string, number> = { R: 0, E: 0, M: 0, L: 0 };
  sessions.forEach((s: any) => {
    const sc = s.self_scores;
    if (!sc) return;
    const dom = (["R","E","M","L"] as const).reduce((a: string, b: string) => (sc[a] ?? 0) >= (sc[b] ?? 0) ? a : b);
    selfFreq[dom]++;
  });

  // Friend dominant + gap analysis
  const matchCount = { match: 0, gap: 0 };
  const friendFreq: Record<string, number> = { R: 0, E: 0, M: 0, L: 0 };

  // Group friends by session_code (short code)
  const friendsBySession: Record<string, any[]> = {};
  friends.forEach((f: any) => {
    if (!friendsBySession[f.session_code]) friendsBySession[f.session_code] = [];
    friendsBySession[f.session_code].push(f);
  });

  sessions.filter((s: any) => s.result_unlocked).forEach((s: any) => {
    const sessionFriends = friendsBySession[s.code] || [];  // FIX: use s.code not s.id
    if (sessionFriends.length === 0) return;

    const agg: Record<string, number> = { R: 0, E: 0, M: 0, L: 0 };
    sessionFriends.forEach((f: any) => {
      agg.R += f.scores?.R ?? 0;
      agg.E += f.scores?.E ?? 0;
      agg.M += f.scores?.M ?? 0;
      agg.L += f.scores?.L ?? 0;
    });
    const friendDom = Object.entries(agg).reduce((a, b) => a[1] >= b[1] ? a : b)[0];
    friendFreq[friendDom]++;

    const sc = s.self_scores;
    if (!sc) return;
    const selfDom = (["R","E","M","L"] as const).reduce((a: string, b: string) => (sc[a] ?? 0) >= (sc[b] ?? 0) ? a : b);
    if (selfDom === friendDom) matchCount.match++;
    else matchCount.gap++;
  });

  // Sessions by day (last 14 days)
  const byDay: Record<string, number> = {};
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    byDay[d.toISOString().slice(0, 10)] = 0;
  }
  sessions.forEach((s: any) => {
    const day = s.created_at?.slice(0, 10);
    if (day && byDay[day] !== undefined) byDay[day]++;
  });

  return new Response(JSON.stringify({
    total,
    unlocked,
    unlockRate: total > 0 ? Math.round(unlocked / total * 100) : 0,
    totalFriends,
    avgFriends,
    fcDist,
    selfFreq,
    friendFreq,
    matchCount,
    byDay,
  }), { headers: { ...CORS, "Content-Type": "application/json" } });
});
