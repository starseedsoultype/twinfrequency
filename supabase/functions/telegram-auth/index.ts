// TwinFrequency — Telegram Mini App Auth
// POST /functions/v1/telegram-auth
// Validates Telegram initData, creates or finds Supabase user, returns session

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Validate Telegram initData signature (HMAC-SHA256)
async function validateTelegramData(initData: string, botToken: string): Promise<Record<string, string> | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get("hash")
  if (!hash) return null

  params.delete("hash")

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")

  const encoder = new TextEncoder()

  const secretKey = await crypto.subtle.importKey(
    "raw", encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  )
  const botKeyBytes = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(botToken))

  const dataKey = await crypto.subtle.importKey(
    "raw", botKeyBytes,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", dataKey, encoder.encode(dataCheckString))

  const computedHash = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")

  if (computedHash !== hash) return null

  const result: Record<string, string> = {}
  for (const [k, v] of params.entries()) result[k] = v
  return result
}

// Deterministic password — never stored, always derivable from telegram_id + bot_token
async function derivePassword(telegramId: string, botToken: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(botToken),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`twinf_${telegramId}`))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { initData } = await req.json()
    if (!initData) {
      return new Response(JSON.stringify({ error: "initData required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")
    if (!botToken) {
      return new Response(JSON.stringify({ error: "Bot token not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const data = await validateTelegramData(initData, botToken)
    if (!data) {
      return new Response(JSON.stringify({ error: "Invalid Telegram data" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const tgUser = JSON.parse(data.user || "{}")
    const telegramId = String(tgUser.id)
    if (!telegramId) {
      return new Response(JSON.stringify({ error: "No user in initData" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const email = `tg_${telegramId}@twinfrequency.io`
    const password = await derivePassword(telegramId, botToken)

    // Try sign in first (user exists)
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInData?.session) {
      return new Response(JSON.stringify({
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        is_new_user: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // User doesn't exist — create auth user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError || !newUser.user) {
      return new Response(JSON.stringify({ error: createError?.message || "Failed to create user" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // Create profile row with Telegram data pre-filled
    await supabase.from("profiles").upsert({
      id: newUser.user.id,
      telegram_id: parseInt(telegramId),
      name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || tgUser.username || null,
      photo_url: null, // Telegram photo_url requires extra API call, skip for now
    }, { onConflict: "id" })

    // Sign in the new user
    const { data: newSession, error: newSignInError } = await supabase.auth.signInWithPassword({ email, password })

    if (!newSession?.session) {
      return new Response(JSON.stringify({ error: newSignInError?.message || "Sign in failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    return new Response(JSON.stringify({
      access_token: newSession.session.access_token,
      refresh_token: newSession.session.refresh_token,
      is_new_user: true,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
