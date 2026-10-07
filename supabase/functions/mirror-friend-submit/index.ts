import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("OLESYA_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const { session_code, friend_name, scores, response_token } = await req.json();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase.rpc("mirror_submit_friend_response", {
    p_code: session_code,
    p_friend_name: friend_name,
    p_scores: scores,
    p_response_token: response_token,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  if (data.error === "not_found") {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  if (data.error === "expired") {
    return new Response(JSON.stringify({ error: "Session expired" }), {
      status: 410,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  if (data.just_unlocked) {
    const result_url = `https://starseedsoultype.com/mirror.html?result=${session_code}`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: data.owner_telegram_id,
        text: "🪩 Твоё зеркало готово\n\n3 человека ответили о тебе.",
        reply_markup: {
          inline_keyboard: [[{
            text: "Открыть зеркало",
            web_app: { url: result_url }
          }]]
        }
      })
    });
  }

  return new Response(JSON.stringify({
    success: true,
    friend_count: data.friend_count,
    duplicate: data.duplicate || false
  }), {
    headers: { ...CORS, "Content-Type": "application/json" }
  });
});
