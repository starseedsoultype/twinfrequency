// bot-go v1 — tracked redirect
//
// Paid links in the bot point here instead of straight at the shop. The hop
// is invisible to the person and gives us the one signal worth having:
// who reached the price and stopped.
//
// Reaching a paid link also queues the follow-up for it, once.
//
//   /bot-go?t=<quiz_token>&k=origin    the person's own Origin reading
//   /bot-go?t=<quiz_token>&k=session   a reading with Alexandra
//
// The destination is resolved here, never passed in the URL, so the link
// cannot be pointed somewhere else.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DB = `${SUPABASE_URL}/rest/v1`;
const DB_H = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "apikey": SUPABASE_SERVICE_ROLE_KEY,
};

const SESSION_URL =
  "https://calendly.com/readingstarseedsoul/fifteen-minute-starseed-soul-origin-reading-ses-clone";
const FALLBACK_URL = "https://www.starseedsoultype.com/";

// Wait a day before nudging someone who stopped at the price.
const CART_DELAY_H = 24;

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${DB}${path}`, { headers: { ...DB_H, Accept: "application/json" } });
  if (!res.ok) {
    console.error("dbGet", path, res.status);
    return [];
  }
  return res.json();
}

function redirect(url: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const token = (params.get("t") ?? "").trim();
  const kind = (params.get("k") ?? "").trim();

  if (!token) return redirect(FALLBACK_URL);

  const [sub] = await dbGet<{ telegram_id: number; origin: string | null }>(
    `/telegram_subscribers?quiz_token=eq.${encodeURIComponent(token)}&select=telegram_id,origin&limit=1`,
  );
  if (!sub) return redirect(FALLBACK_URL);

  // Work out where this person is actually going
  let target = FALLBACK_URL;
  if (kind === "session") {
    target = SESSION_URL;
  } else if (kind === "origin" && sub.origin) {
    const [product] = await dbGet<{ gumroad_url: string }>(
      `/api_origin_products?origin_name=eq.${encodeURIComponent(sub.origin)}&select=gumroad_url&limit=1`,
    );
    if (product?.gumroad_url) target = product.gumroad_url;
  }

  // Record the click, then queue the one nudge it earns
  await fetch(`${DB}/bot_clicks`, {
    method: "POST",
    headers: { ...DB_H, Prefer: "return=minimal" },
    body: JSON.stringify({ telegram_id: sub.telegram_id, kind, url: target }),
  }).catch(() => {});

  if (kind === "origin" && target !== FALLBACK_URL) {
    await fetch(`${DB}/bot_followups?on_conflict=telegram_id,kind`, {
      method: "POST",
      headers: { ...DB_H, Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        telegram_id: sub.telegram_id,
        kind: "cart",
        due_at: new Date(Date.now() + CART_DELAY_H * 3600_000).toISOString(),
      }),
    }).catch(() => {});
  }

  return redirect(target);
});
