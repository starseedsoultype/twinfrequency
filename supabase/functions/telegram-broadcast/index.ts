// telegram-broadcast v1 — admin broadcasts to @SeedSoulTest_bot
//
// Same shape as send-telegram-update-email: dry_run / test / send,
// audience selection, campaign_id deduplication, batch sending.
// Optionally attaches the free relationships guide.
//
// Native fetch only, no imports.

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DB = `${SUPABASE_URL}/rest/v1`;
const DB_H = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "apikey": SUPABASE_SERVICE_ROLE_KEY,
};

const GUIDE_KEY = "relationships_guide";

const AUDIENCE_FN: Record<string, string> = {
  subscribers: "get_tg_audience_subscribers",
  twinf: "get_tg_audience_twinf",
  all: "get_tg_audience_all",
};

const DEFAULT_KEY: Record<string, string> = {
  subscribers: "tg_subscribers_2026_07",
  twinf: "tg_twinf_2026_07",
  all: "tg_all_2026_07",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${DB}${path}`, { headers: { ...DB_H, Accept: "application/json" } });
  if (!res.ok) {
    console.error("dbGet", path, res.status);
    return [];
  }
  return res.json();
}

async function rpc<T>(fn: string, args: unknown, limit?: number): Promise<T[]> {
  const q = limit ? `?limit=${limit}` : "";
  const res = await fetch(`${DB}/rpc/${fn}${q}`, {
    method: "POST",
    headers: { ...DB_H, Accept: "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    console.error("rpc", fn, res.status, await res.text());
    return [];
  }
  return res.json();
}

async function tg(method: string, payload: unknown) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => ({ ok: false }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Guide, reusing the cached file_id ─────────────────────────
async function sendGuide(chatId: number) {
  const [asset] = await dbGet<{ file_id: string | null; source_url: string }>(
    `/bot_assets?key=eq.${GUIDE_KEY}&select=file_id,source_url&limit=1`,
  );
  if (!asset) return { ok: false, description: "bot_assets row missing" };

  let data = await tg("sendDocument", {
    chat_id: chatId,
    document: asset.file_id ?? asset.source_url,
  });

  if (data.ok && !asset.file_id) {
    const fileId = data.result?.document?.file_id;
    if (fileId) {
      await fetch(`${DB}/bot_assets?on_conflict=key`, {
        method: "POST",
        headers: { ...DB_H, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          key: GUIDE_KEY,
          file_id: fileId,
          source_url: asset.source_url,
          updated_at: new Date().toISOString(),
        }),
      });
    }
  } else if (!data.ok && asset.file_id) {
    data = await tg("sendDocument", { chat_id: chatId, document: asset.source_url });
  }

  return data;
}

async function markBlocked(telegramId: number) {
  await fetch(`${DB}/telegram_subscribers?on_conflict=telegram_id`, {
    method: "POST",
    headers: { ...DB_H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ telegram_id: telegramId, is_blocked: true }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── Admin check ─────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return json({ error: "Missing token" }, 401);

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return json({ error: "Invalid token" }, 401);
  const user = await userRes.json();
  if (!user?.id) return json({ error: "Invalid token" }, 401);

  const [profile] = await dbGet<{ is_admin: boolean }>(
    `/profiles?id=eq.${user.id}&select=is_admin&limit=1`,
  );
  if (!profile?.is_admin) return json({ error: "Not an admin" }, 403);

  // ── Params ──────────────────────────────────────────────────
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }

  const mode: string = body.mode ?? "dry_run";
  const audience: string = body.audience ?? "subscribers";
  const fn = AUDIENCE_FN[audience];
  if (!fn) return json({ error: `Unknown audience: ${audience}` }, 400);

  const broadcastKey: string = body.campaign_id?.trim() || DEFAULT_KEY[audience];
  const limit: number = Math.min(Number(body.limit) || 25, 200);
  const text: string = (body.text ?? "").trim();
  const attachGuide: boolean = body.attach_guide === true;

  const replyMarkup = body.button_text && body.button_url
    ? { inline_keyboard: [[{ text: body.button_text, url: body.button_url }]] }
    : undefined;

  // ── dry_run ─────────────────────────────────────────────────
  if (mode === "dry_run") {
    const remainingRows = await rpc<{ telegram_id: number }>(fn, { p_broadcast_key: broadcastKey });
    const sentRows = await dbGet<{ telegram_id: number }>(
      `/telegram_broadcast_log?broadcast_key=eq.${encodeURIComponent(broadcastKey)}&status=eq.sent&select=telegram_id`,
    );
    return json({
      audience,
      broadcast_key: broadcastKey,
      eligible: remainingRows.length + sentRows.length,
      already_sent: sentRows.length,
      remaining: remainingRows.length,
    });
  }

  if (!text && !attachGuide) return json({ error: "Nothing to send" }, 400);

  // ── test ────────────────────────────────────────────────────
  if (mode === "test") {
    const testId = Number(body.test_chat_id);
    if (!testId) return json({ error: "test_chat_id required" }, 400);

    let res: any = { ok: true };
    if (text) {
      res = await tg("sendMessage", {
        chat_id: testId,
        text: `[TEST]\n\n${text}`,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    }
    if (res.ok && attachGuide) res = await sendGuide(testId);

    return res.ok
      ? json({ mode: "test", sent_to: testId })
      : json({ error: res.description ?? "Telegram error" }, 400);
  }

  // ── send ────────────────────────────────────────────────────
  if (mode !== "send") return json({ error: `Unknown mode: ${mode}` }, 400);

  const targets = await rpc<{ telegram_id: number }>(fn, { p_broadcast_key: broadcastKey }, limit);

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const { telegram_id } of targets) {
    // Claim the slot first so a retry cannot double-send
    const claim = await fetch(`${DB}/telegram_broadcast_log?on_conflict=broadcast_key,telegram_id`, {
      method: "POST",
      headers: { ...DB_H, Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ broadcast_key: broadcastKey, telegram_id, status: "pending" }),
    });
    if (!claim.ok) {
      console.error("claim failed", telegram_id, claim.status);
      continue;
    }

    let res: any = { ok: true };
    if (text) {
      res = await tg("sendMessage", {
        chat_id: telegram_id,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    }
    if (res.ok && attachGuide) res = await sendGuide(telegram_id);

    const patchUrl =
      `${DB}/telegram_broadcast_log?broadcast_key=eq.${encodeURIComponent(broadcastKey)}&telegram_id=eq.${telegram_id}`;

    if (res.ok) {
      sent++;
      await fetch(patchUrl, {
        method: "PATCH",
        headers: { ...DB_H, Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "sent",
          sent_at: new Date().toISOString(),
          message_id: res.result?.message_id ?? null,
        }),
      });
    } else {
      failed++;
      const desc = String(res.description ?? "unknown error");
      errors.push(`${telegram_id}: ${desc}`);
      await fetch(patchUrl, {
        method: "PATCH",
        headers: { ...DB_H, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "error", error: desc }),
      });
      // Blocked or deleted accounts stay out of future audiences
      if (/blocked|deactivated|chat not found|user is deactivated/i.test(desc)) {
        await markBlocked(telegram_id);
      }
    }

    // Telegram tolerates roughly 30 messages per second
    await sleep(60);
  }

  const remainingRows = await rpc<{ telegram_id: number }>(fn, { p_broadcast_key: broadcastKey });

  return json({
    mode: "send",
    audience,
    broadcast_key: broadcastKey,
    sent,
    failed,
    remaining: remainingRows.length,
    errors: errors.slice(0, 10),
  });
});
