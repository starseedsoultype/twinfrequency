// seedsoul-bot-webhook v3 — @SeedSoulTest_bot
//
// Replaces the ManyChat webhook. Jobs:
//   1. Record everyone who opens the bot into telegram_subscribers
//   2. Deliver the welcome photo and the free relationships guide on /start
//   3. Ask where the person is in their connection, and answer per stage
//
// People arrive from an Instagram DM that already said "Here it is 💌", so the
// bot continues that conversation instead of restarting it.
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

// Stages where the pain is active. These get timed follow-ups in step 3.
const ACUTE_STAGES = ["pulled", "nocontact"];

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
// The Instagram DM already used "Here it is", "read it tonight" and
// "home and a wound at once". None of those repeat here.
const WELCOME = `You made it 💌

Your guide is below.

One line before you open it. That feeling of recognition rises from ten different bonds, and they behave nothing alike. Some steady you for years. Some burn bright and leave you rebuilding.

Yours is one of them.

Alexandra`;

const GUIDE_CAPTION = `Starseed Relationships and Twin Flame Connections

The ten frequencies, and how to read the one you are actually in.`;

const STAGE_QUESTION =
  `Before you read it, tell me where you are with them right now. It changes which part matters most.`;

const STAGE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: "We are together", callback_data: "stage:together" },
      { text: "On and off", callback_data: "stage:onoff" },
    ],
    [
      { text: "They pulled away", callback_data: "stage:pulled" },
      { text: "No contact now", callback_data: "stage:nocontact" },
    ],
  ],
};

const ORIGIN_KEYBOARD = {
  inline_keyboard: [[{ text: "Find my Origin", url: ORIGIN_URL }]],
};

const STAGE_REPLIES: Record<string, string> = {
  together: `Good. This is the part most people spend years trying to reach.

What matters now is how your bond behaves under pressure. All ten meet their first real test, and each one handles it differently. Knowing yours in advance is what keeps a hard season from reading as an ending.

That reading starts with your own Origin. Seven questions.`,

  onoff: `The loop itself is the clearest signal you have.

A bond that keeps breaking and returning is running a structure, and it repeats until someone names it. The face changes, the timing changes, the same dynamic walks back in. It loosens its grip the moment you can read it.

Yours has a name. Finding it starts with your Origin. Seven questions.`,

  pulled: `Distance carries information, and it means different things in different bonds.

Some structures pull back exactly when closeness arrives, every single time, and the retreat says very little about how much they feel. Others go quiet because the bond reached what it was built to hold. From where you are standing, those two look identical.

Telling them apart starts with your Origin. Seven questions.`,

  nocontact: `Then you have been carrying this alone for a while.

Here is what I can honestly give you. Timelines are guesses, wherever they come from. What can be named is what the bond actually was, which of the ten it ran on, and whether it was built to hold.

That is usually enough to let the waiting rest and the choosing begin.

It begins with your Origin. Seven questions.`,
};

const FALLBACK = `Your guide is above 💌

Whenever you want to know which of the ten you are in, it starts with your own Origin.`;

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

// Queue the two soft follow-ups for the stages where the pain is active.
// pg_cron picks these up later; nothing is sent from here.
async function queueFollowups(telegramId: number) {
  const now = Date.now();
  const rows = [
    { telegram_id: telegramId, kind: "evening", due_at: new Date(now + 5 * 3600_000).toISOString() },
    { telegram_id: telegramId, kind: "session", due_at: new Date(now + 28 * 3600_000).toISOString() },
  ];
  const res = await fetch(`${DB}/bot_followups?on_conflict=telegram_id,kind`, {
    method: "POST",
    headers: { ...DB_H, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) console.error("queueFollowups", res.status, await res.text());
}

async function handleStage(cbId: string, chatId: number, messageId: number, userId: number, stage: string) {
  const reply = STAGE_REPLIES[stage];
  if (!reply) {
    await tg("answerCallbackQuery", { callback_query_id: cbId });
    return;
  }

  await tg("answerCallbackQuery", { callback_query_id: cbId });

  await dbUpsert(
    "telegram_subscribers",
    { telegram_id: userId, stage, stage_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
    "telegram_id",
  );

  // Take the buttons away so the question reads as answered
  await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });

  await tg("sendMessage", { chat_id: chatId, text: reply, reply_markup: ORIGIN_KEYBOARD });

  if (ACUTE_STAGES.includes(stage)) await queueFollowups(userId);
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
    // ── Stage button tapped ─────────────────────────────────
    const cb = update.callback_query;
    if (cb?.id) {
      const data: string = cb.data ?? "";
      const chatId = cb.message?.chat?.id;
      const messageId = cb.message?.message_id;
      const userId = cb.from?.id;
      if (chatId && messageId && userId && data.startsWith("stage:")) {
        await handleStage(cb.id, chatId, messageId, userId, data.slice(6));
      } else {
        await tg("answerCallbackQuery", { callback_query_id: cb.id });
      }
      return new Response("ok");
    }

    // ── Someone blocked or unblocked the bot ────────────────
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
      await sendAsset(chatId, PHOTO_KEY, "sendPhoto", "photo", { caption: WELCOME });
      await sendAsset(chatId, GUIDE_KEY, "sendDocument", "document", { caption: GUIDE_CAPTION });
      await tg("sendMessage", {
        chat_id: chatId,
        text: STAGE_QUESTION,
        reply_markup: STAGE_KEYBOARD,
      });
      return new Response("ok");
    }

    // Anything else: point back to the guide and the Origin scan
    await tg("sendMessage", {
      chat_id: chatId,
      text: FALLBACK,
      reply_markup: ORIGIN_KEYBOARD,
    });

    return new Response("ok");
  } catch (e) {
    console.error(e);
    // Always 200 so Telegram stops retrying a poisoned update
    return new Response("ok");
  }
});
