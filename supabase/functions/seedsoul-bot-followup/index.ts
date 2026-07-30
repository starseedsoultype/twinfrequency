// seedsoul-bot-followup v2
//
// Drains the bot_followups queue. Called by pg_cron every ten minutes, so
// the whole delayed-message system lives inside Supabase with no external
// scheduler.
//
// Kinds:
//   evening       +5h after an acute stage answer, soft, no offer
//   session       +28h after an acute stage answer, adapts to whether the
//                 Origin is known yet
//   origin_offer  +24h after the quiz, the person's own reading
//   origin_offer2 +72h after the quiz, only for people who never opened it
//   cart          +24h after opening the price without buying
//   pair_turn     +7d after the quiz, turns towards the other person
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
const GO_URL = `${SUPABASE_URL}/functions/v1/bot-go`;

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

const OFFER2 = `A word on what is actually inside, since a reading is easy to leave for later.

It describes the structure underneath your personality rather than the personality itself. What you reach for first, what you protect without noticing, and why certain people land in you the way they do.

Most people read theirs twice. Once for the recognition, once for what to do with it.

Alexandra`;

const CART = `You opened your reading and stepped away.

That is usually one of two things. Either the moment passed, or something in the description sat a little too close.

It stays where you left it.

Alexandra`;

const PAIR_TURN = `You have had your own Origin for a week.

The question that tends to arrive next is theirs, because two Origins together are what turn a feeling into a reading of the two of you.

That part I do with you directly. One connection, whatever shape it is in.

Alexandra`;

function goLink(token: string, kind: string) {
  return `${GO_URL}?t=${token}&k=${kind}`;
}

// Personal token, same scheme the webhook uses.
async function ensureToken(telegramId: number, existing: string | null) {
  if (existing) return existing;
  const token = crypto.randomUUID().replace(/-/g, "");
  await fetch(`${DB}/telegram_subscribers?on_conflict=telegram_id`, {
    method: "POST",
    headers: { ...DB_H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ telegram_id: telegramId, quiz_token: token }),
  });
  return token;
}

// The uncomfortably accurate line, straight from the canon record.
async function shadowLine(origin: string) {
  const [row] = await dbGet<{ shadow: string | null }>(
    `/api_origins?origin_name=eq.${encodeURIComponent(origin)}&language=eq.en` +
      `&select=shadow&limit=1`,
  );
  return row?.shadow?.trim() ?? "";
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
    const [sub] = await dbGet<{ is_blocked: boolean; origin: string | null; quiz_token: string | null }>(
      `/telegram_subscribers?telegram_id=eq.${row.telegram_id}` +
        `&select=is_blocked,origin,quiz_token&limit=1`,
    );

    const skip = async () => {
      skipped++;
      await dbPatch(`/bot_followups?id=eq.${row.id}`, { status: "skipped" });
    };

    if (!sub || sub.is_blocked) {
      await skip();
      continue;
    }

    let text = "";
    let markup: unknown = undefined;

    if (row.kind === "evening") {
      text = EVENING;
    } else if (row.kind === "session") {
      const token = await ensureToken(row.telegram_id, sub.quiz_token);
      if (sub.origin) {
        text = SESSION_WITH_ORIGIN;
        markup = { inline_keyboard: [[{ text: "Book a reading", url: goLink(token, "session") }]] };
      } else {
        text = SESSION_NO_ORIGIN;
        markup = { inline_keyboard: [[{ text: "Find my Origin", url: `${ORIGIN_URL}?tg=${token}` }]] };
      }
    } else if (row.kind === "origin_offer") {
      if (!sub.origin) { await skip(); continue; }
      const token = await ensureToken(row.telegram_id, sub.quiz_token);
      const shadow = await shadowLine(sub.origin);
      text = `One thing about ${sub.origin} that people recognise last and feel first.

${shadow}

Your full reading follows that thread all the way down. Where it starts, how it shows up in love, and what settles it.

Alexandra`;
      markup = { inline_keyboard: [[{ text: "Read my Origin", url: goLink(token, "origin") }]] };
    } else if (row.kind === "origin_offer2") {
      if (!sub.origin) { await skip(); continue; }
      // Anyone who already reached the price is handled by the cart message
      const clicks = await dbGet<{ id: string }>(
        `/bot_clicks?telegram_id=eq.${row.telegram_id}&kind=eq.origin&select=id&limit=1`,
      );
      if (clicks.length) { await skip(); continue; }
      const token = await ensureToken(row.telegram_id, sub.quiz_token);
      text = OFFER2;
      markup = { inline_keyboard: [[{ text: "Read my Origin", url: goLink(token, "origin") }]] };
    } else if (row.kind === "cart") {
      const token = await ensureToken(row.telegram_id, sub.quiz_token);
      text = CART;
      markup = { inline_keyboard: [[{ text: "Open it again", url: goLink(token, "origin") }]] };
    } else if (row.kind === "pair_turn") {
      const token = await ensureToken(row.telegram_id, sub.quiz_token);
      text = PAIR_TURN;
      markup = { inline_keyboard: [[{ text: "Read it with me", url: goLink(token, "session") }]] };
    } else {
      await skip();
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
