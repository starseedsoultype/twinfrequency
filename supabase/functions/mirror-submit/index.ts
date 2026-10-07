import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("OLESYA_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function validateInitData(initData: string): Promise<Record<string, string> | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const keyBytes = await crypto.subtle.sign("HMAC", secretKey, enc.encode(BOT_TOKEN));
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", hmacKey, enc.encode(dataCheckString));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected !== hash) return null;

  const result: Record<string, string> = {};
  for (const [k, v] of params.entries()) result[k] = v;
  return result;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const { initData, name, scores } = await req.json();

  const validated = await validateInitData(initData);
  if (!validated) {
    return new Response(JSON.stringify({ error: "Invalid initData" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const user = JSON.parse(validated.user || "{}");
  const telegram_id = user.id;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let code = generateCode();
  let inserted = false;

  for (let i = 0; i < 5; i++) {
    const { error } = await supabase.from("mirror_sessions").insert({
      code,
      owner_telegram_id: telegram_id,
      owner_name: name,
      self_scores: scores,
    });

    if (!error) {
      inserted = true;
      break;
    }

    if (error.code !== "23505") {
      return new Response(JSON.stringify({ error: "DB error" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    code = generateCode();
  }

  if (!inserted) {
    return new Response(JSON.stringify({ error: "Could not create session" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const share_url = `https://t.me/olesyabreeze_bot?start=m_${code}`;
  const direct_url = `https://starseedsoultype.com/mirror.html?code=${code}&name=${encodeURIComponent(name)}`;

  return new Response(JSON.stringify({ code, share_url, direct_url }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
