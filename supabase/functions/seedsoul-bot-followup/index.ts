// seedsoul-bot-followup v1
//
// Drains the bot_followups queue. Called by pg_cron every ten minutes, so
// the whole delayed-message system lives inside Supabase with no external
// scheduler.
//
// Two kinds, queued only for the acute stages (pulled away / no contact):
//   evening — a few hours after the stage answer, soft, no offer
//   session — the next day, adapted to whether the Origin is known yet
//
// Native fetch only, no imports.

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

const ORIGIN_URL = "https://www.starseedsoultype.com/quiz.html";
const SESSION_URL =
  "https://calendly.com/readingstarseedsoul/fifteen-minute-starseed-soul-origin-reading-ses-clone";

const BATCH = 40;

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${DB}${path}`, { headers: { ...DB_H, Accept: "application/json" } });
  if (!res.ok) {
    console.error("dbGet", path, res.status);
    return [];
  }
  return res.json();
}

async function dbPatch(path: string, body: unknown) {
  const res = await fetch(`${DB}${path}`, {
    method: "PATCH",
    headers: { ...DB_H, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error("dbPatch", path, res.status, await res.text());
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

// ── Copy ──────────────────────────────────────────────────────
const EVENING = `One more thing, then I will leave you with it.

The heaviest part is usually the guessing. It runs quietly in the background and takes the energy meant for your own days.

When the bond has a name, that part settles. The feeling stays, the question rests.

Whenever you want yours read properly, I am here.

Alexandra`;

const SESSION_WITH_ORIGIN = `You know your own Origin now, and that is the half you can see.

The other half sits with them. Putting the two together is what turns a feeling into a reading, and that part I do myself, one connection at a time.

I take a few of these a week. If you want yours, the times are here.

Alexandra`;

const SESSION_NO_ORIGIN = `Your guide has been with you a day now.

If the question is still running, the shortest way through it is your own Origin. Seven questions, and it names the frequency you carry into every connection.

Whenever you want the two of you read together after that, I am here.

Alexandra`;

// Personal quiz link, same token scheme the webhook uses.
async function originLink(telegramId: number) {
  const [row] = await dbGet<{ quiz_token: string | null }>(
    `/telegram_subscribers?telegram_id=eq.${telegramId}&select=quiz_token&limit=1`,
  );
  let token = row?.quiz_token ?? null;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "");
    await fetch(`${DB}/telegram_subscribers?on_conflict=telegram_id`, {
      method: "POST",
      headers: { ...DB_H, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ telegram_id: telegramId, quiz_token: token }),
    });
  }
  return `${ORIGIN_URL}?tg=${token}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  // Only pg_cron knows this secret
  const [secretRow] = await dbGet<{ value: string }>(
    "/bot_config?key=eq.cron_secret&select=value&limit=1",
  );
  const expected = secretRow?.value ?? "";
  if (!expected || req.headers.get("X-Cron-Secret") !== expected) {
    return new Response("forbidden", { status: 403 });
  }

  const due = await dbGet<{ id: string; telegram_id: number; kind: string }>(
    `/bot_followups?status=eq.pending&due_at=lte.${new Date().toISOString()}` +
      `&select=id,telegram_id,kind&order=due_at&limit=${BATCH}`,
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of due) {
    const [sub] = await dbGet<{ is_blocked: boolean; origin: string | null }>(
      `/telegram_subscribers?telegram_id=eq.${row.telegram_id}&select=is_blocked,origin&limit=1`,
    );

    if (!sub || sub.is_blocked) {
      skipped++;
      await dbPatch(`/bot_followups?id=eq.${row.id}`, { status: "skipped" });
      continue;
    }

    let text = "";
    let markup: unknown = undefined;

    if (row.kind === "evening") {
      text = EVENING;
    } else if (row.kind === "session") {
      if (sub.origin) {
        text = SESSION_WITH_ORIGIN;
        markup = { inline_keyboard: [[{ text: "Book a reading", url: SESSION_URL }]] };
      } else {
        text = SESSION_NO_ORIGIN;
        markup = { inline_keyboard: [[{ text: "Find my Origin", url: await originLink(row.telegram_id) }]] };
      }
    } else {
      skipped++;
      await dbPatch(`/bot_followups?id=eq.${row.id}`, { status: "skipped" });
      continue;
    }

    const res: any = await tg("sendMessage", {
      chat_id: row.telegram_id,
      text,
      ...(markup ? { reply_markup: markup } : {}),
    });

    if (res.ok) {
      sent++;
      await dbPatch(`/bot_followups?id=eq.${row.id}`, {
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    } else {
      failed++;
      const desc = String(res.description ?? "unknown error");
      await dbPatch(`/bot_followups?id=eq.${row.id}`, { status: "error", error: desc });
      if (/blocked|deactivated|chat not found/i.test(desc)) {
        await dbPatch(`/telegram_subscribers?telegram_id=eq.${row.telegram_id}`, { is_blocked: true });
      }
    }

    await sleep(60);
  }

  return new Response(JSON.stringify({ ok: true, due: due.length, sent, skipped, failed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
