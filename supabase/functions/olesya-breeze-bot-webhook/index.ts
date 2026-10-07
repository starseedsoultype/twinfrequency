import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("OLESYA_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Set together with Telegram's setWebhook secret_token. Until it is set, requests are
// accepted as before; once set, anything without the matching header is rejected.
const WEBHOOK_SECRET = (Deno.env.get("OLESYA_WEBHOOK_SECRET") ?? "").trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  if (WEBHOOK_SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  try {
    const update = await req.json();

    const message = update.message;
    const text = message?.text || "";
    const chatId = message?.chat?.id;
    const user = message?.from;

    if (!chatId || !user) {
      return new Response("ok");
    }

    await supabase
      .from("olesya_breeze_bot_users")
      .upsert({
        telegram_id: user.id,
        username: user.username || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        language_code: user.language_code || null,
        source: "telegram_bot",
        last_seen_at: new Date().toISOString(),
      }, {
        onConflict: "telegram_id"
      });

    if (text.startsWith("/start m_")) {
      const code = text.split("m_")[1]?.trim()?.toUpperCase();

      const { data: session } = await supabase
        .from("mirror_sessions")
        .select("owner_name, expires_at")
        .eq("code", code)
        .single();

      if (!session) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "Ссылка Зеркала не найдена."
          })
        });

        return new Response("ok");
      }

      if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "Это Зеркало уже закрылось."
          })
        });

        return new Response("ok");
      }

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text:
`${session.owner_name} пригласила тебя в своё Зеркало.

Ответь на 5 коротких вопросов о том, как ты воспринимаешь её со стороны. Это займёт около 2 минут.`,
          reply_markup: {
            inline_keyboard: [[
              {
                text: "Ответить",
                web_app: {
                  url: `https://starseedsoultype.com/mirror.html?code=${code}&name=${encodeURIComponent(session.owner_name)}&v=4`
                }
              }
            ]]
          }
        })
      });

      return new Response("ok");
    }

    if (text === "/start") {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text:
`Ты знаешь, как ощущаешь себя внутри? Зеркало помогает увидеть, каким тебя переживают другие!

Ответь на пять коротких вопросов о себе.

Потом отправь личную ссылку трём людям, рядом с которыми ты бываешь настоящим. Когда ответы соберутся, Зеркало покажет, где твой внутренний образ совпадает с тем, что считывают окружающие, а где появляется разница в восприятии.`,
          reply_markup: {
            inline_keyboard: [[
              {
                text: "Заглянуть в Зеркало",
                web_app: {
                  url: "https://starseedsoultype.com/mirror.html?v=4"
                }
              }
            ]]
          }
        })
      });
    }

    return new Response("ok");
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
