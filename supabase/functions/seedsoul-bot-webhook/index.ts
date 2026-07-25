// seedsoul-bot-webhook v2 — @SeedSoulTest_bot
//
// Replaces the ManyChat webhook. Two jobs:
//   1. Record everyone who opens the bot into telegram_subscribers
//   2. Deliver the welcome photo and the free relationships guide on /start
//
// Native fetch only, no imports, so it deploys through the Management API.

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Shared secret set on the Telegram webhook so only Telegram can call this.
// Read from bot_config so it needs no dashboard step; the env var wins if set.
const ENV_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
let cachedSecret: string | null = null;

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DB = `${SUPABASE_URL}/rest/v1`;
const DB_H = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "apikey": SUPABASE_SERVICE_ROLE_KEY,
};

const GUIDE_KEY = "relationships_guide";
const PHOTO_KEY = "welcome_photo";
const ORIGIN_URL = "https://www.starseedsoultype.com/quiz.html";

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${DB}${path}`, { headers: { ...DB_H, Accept: "application/json" } });
  if (!res.ok) {
    console.error("dbGet", path, res.status);
    return [];
  }
  return res.json();
}

async function dbUpsert(table: string, body: unknown, onConflict: string) {
  const res = await fetch(`${DB}/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { ...DB_H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error("dbUpsert", table, res.status, await res.text());
}

async function tg(method: string, payload: unknown) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) console.error("telegram", method, JSON.stringify(data).slice(0, 300));
  return data;
}

// ── Copy ──────────────────────────────────────────────────────
const GREETING = "Here it is 💌";

const GUIDE_CAPTION = `Starseed Relationships and Twin Flame Connections

The ten frequencies behind the bond, and how to read the one you are actually in.

Read it tonight. It explains why the connection feels like home and a wound at once.

Alexandra`;

const FALLBACK = `Your guide is above 💌

Your own Origin is where all of this starts. Seven questions, two minutes.`;

const KEYBOARD = {
  inline_keyboard: [[{ text: "Find your Origin", url: ORIGIN_URL }]],
};

// ── Asset delivery, with cached file_id ───────────────────────
// First send goes by public URL, Telegram returns a file_id, and every
// later send reuses that id and is instant.
async function sendAsset(
  chatId: number,
  key: string,
  method: "sendPhoto" | "sendDocument",
  field: "photo" | "document",
  extra: Record<string, unknown> = {},
) {
  const [asset] = await dbGet<{ file_id: string | null; source_url: string }>(
    `/bot_assets?key=eq.${key}&select=file_id,source_url&limit=1`,
  );
  if (!asset) {
    console.error("bot_assets row missing:", key);
    return { ok: false };
  }

  let data = await tg(method, {
    chat_id: chatId,
    [field]: asset.file_id ?? asset.source_url,
    ...extra,
  });

  if (data.ok && !asset.file_id) {
    const result = data.result ?? {};
    const fileId = field === "photo"
      ? result.photo?.[result.photo.length - 1]?.file_id
      : result.document?.file_id;
    if (fileId) {
      await dbUpsert(
        "bot_assets",
        { key, file_id: fileId, source_url: asset.source_url, updated_at: new Date().toISOString() },
        "key",
      );
      console.log("cached file_id for", key);
    }
  } else if (!data.ok && asset.file_id) {
    // Cached id went stale, fall back to the URL once
    console.warn("cached file_id failed for", key, "retrying by URL");
    data = await tg(method, { chat_id: chatId, [field]: asset.source_url, ...extra });
  }

  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");

  if (cachedSecret === null) {
    if (ENV_SECRET) {
      cachedSecret = ENV_SECRET;
    } else {
      const [row] = await dbGet<{ value: string }>(
        "/bot_config?key=eq.webhook_secret&select=value&limit=1",
      );
      cachedSecret = row?.value ?? "";
    }
  }

  if (cachedSecret) {
    const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (got !== cachedSecret) return new Response("forbidden", { status: 403 });
  }

  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return new Response("ok");
  }

  try {
    // Someone blocked or unblocked the bot
    const chatMember = update.my_chat_member;
    if (chatMember?.from?.id) {
      const status = chatMember.new_chat_member?.status;
      const blocked = status === "kicked" || status === "left";
      await dbUpsert(
        "telegram_subscribers",
        {
          telegram_id: chatMember.from.id,
          username: chatMember.from.username ?? null,
          first_name: chatMember.from.first_name ?? null,
          last_name: chatMember.from.last_name ?? null,
          language_code: chatMember.from.language_code ?? null,
          is_blocked: blocked,
          last_seen_at: new Date().toISOString(),
        },
        "telegram_id",
      );
      return new Response("ok");
    }

    const message = update.message;
    const chatId = message?.chat?.id;
    const user = message?.from;
    if (!chatId || !user) return new Response("ok");

    const text: string = message.text ?? "";
    const isStart = text.startsWith("/start");
    const startParam = isStart ? text.slice(6).trim() || null : null;

    // Every interaction records or refreshes the subscriber
    await dbUpsert(
      "telegram_subscribers",
      {
        telegram_id: user.id,
        username: user.username ?? null,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
        language_code: user.language_code ?? null,
        source: "bot",
        ...(startParam ? { start_param: startParam } : {}),
        is_blocked: false,
        last_seen_at: new Date().toISOString(),
      },
      "telegram_id",
    );

    if (isStart) {
      // Photo carries the greeting, the guide follows with its own caption
      await sendAsset(chatId, PHOTO_KEY, "sendPhoto", "photo", { caption: GREETING });
      await sendAsset(chatId, GUIDE_KEY, "sendDocument", "document", {
        caption: GUIDE_CAPTION,
        reply_markup: KEYBOARD,
      });
      return new Response("ok");
    }

    // Anything else: point back to the guide and the Origin scan
    await tg("sendMessage", {
      chat_id: chatId,
      text: FALLBACK,
      reply_markup: KEYBOARD,
    });

    return new Response("ok");
  } catch (e) {
    console.error(e);
    // Always 200 so Telegram stops retrying a poisoned update
    return new Response("ok");
  }
});
