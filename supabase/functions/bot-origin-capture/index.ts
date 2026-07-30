// bot-origin-capture v1
//
// Called by quiz.html when the Origin Scan was opened from the bot
// (a personal link carrying ?tg=<token>). Writes the result onto the
// subscriber and continues the conversation in Telegram.
//
// Guarded by the token itself, which is random per subscriber and never
// exposed anywhere else, so verify_jwt stays off and the quiz page needs
// no keys of its own.

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DB = `${SUPABASE_URL}/rest/v1`;
const DB_H = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "apikey": SUPABASE_SERVICE_ROLE_KEY,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { token?: string; origin?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }

  const token = (body.token ?? "").trim();
  const origin = (body.origin ?? "").trim();
  if (!token || !origin) return json({ error: "token and origin required" }, 400);

  // Resolve the token to a subscriber
  const lookup = await fetch(
    `${DB}/telegram_subscribers?quiz_token=eq.${encodeURIComponent(token)}&select=telegram_id,origin&limit=1`,
    { headers: { ...DB_H, Accept: "application/json" } },
  );
  const rows = lookup.ok ? await lookup.json() : [];
  const subscriber = rows?.[0];
  if (!subscriber) return json({ error: "Unknown token" }, 404);

  const alreadyKnown = Boolean(subscriber.origin);

  await fetch(`${DB}/telegram_subscribers?telegram_id=eq.${subscriber.telegram_id}`, {
    method: "PATCH",
    headers: { ...DB_H, Prefer: "return=minimal" },
    body: JSON.stringify({ origin, origin_at: new Date().toISOString() }),
  });

  // Continue the conversation once. Retaking the quiz updates the record
  // quietly instead of sending the same message again.
  if (!alreadyKnown) {
    // The sequence that follows recognition: the offer, a second pass for
    // anyone who left it alone, then the turn towards the other person.
    const now = Date.now();
    await fetch(`${DB}/bot_followups?on_conflict=telegram_id,kind`, {
      method: "POST",
      headers: { ...DB_H, Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify([
        { telegram_id: subscriber.telegram_id, kind: "origin_offer", due_at: new Date(now + 24 * 3600_000).toISOString() },
        { telegram_id: subscriber.telegram_id, kind: "origin_offer2", due_at: new Date(now + 72 * 3600_000).toISOString() },
        { telegram_id: subscriber.telegram_id, kind: "pair_turn", due_at: new Date(now + 7 * 24 * 3600_000).toISOString() },
      ]),
    }).catch(() => {});

    const text = `Your Origin is ${origin} 💌

That is the frequency you carry into every connection, and it is one half of why your bond behaves the way it does.

The other half is theirs. Whenever you want the two of them read together, I am here.

Alexandra`;

    const res = await fetch(`${TG}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: subscriber.telegram_id, text }),
    });
    if (!res.ok) console.error("telegram sendMessage", res.status, await res.text());
  }

  return json({ ok: true });
});
