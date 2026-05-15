// TwinFrequency — Telegram Mini App Update Broadcast
// POST /functions/v1/send-telegram-update-email
// Modes: dry_run | test | send
// Only callable by admin (profiles.is_admin = true)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const BROADCAST_KEY = "telegram_mini_app_update_2026_05"
const FROM_EMAIL = "StarSeedSoul <hello@twinfrequency.io>"
const SUBJECT = "TwinF is now inside Telegram"
const TELEGRAM_BOT_URL = "https://t.me/SeedSoulTest_bot"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function buildHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${SUBJECT}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Inter:wght@200;300&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:'Inter',-apple-system,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="max-width:520px;margin:0 auto;padding:48px 24px;">

    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:13px;letter-spacing:5px;color:#5F5A55;text-transform:uppercase;margin-bottom:48px;text-align:center;">
      TwinF by StarSeedSoul
    </div>

    <div style="width:1px;height:48px;background:linear-gradient(to bottom,transparent,#C9A96E,transparent);margin:0 auto 48px;"></div>

    <div style="font-size:14px;line-height:1.9;color:#C9C1B8;font-weight:300;letter-spacing:0.3px;">

      <p style="margin:0 0 20px;">Hi,</p>

      <p style="margin:0 0 20px;">TwinF has a new update.</p>

      <p style="margin:0 0 20px;">You can now open TwinF directly inside Telegram as a Mini App.</p>

      <p style="margin:0 0 6px;">This makes the experience much easier:</p>
      <p style="margin:0 0 4px;padding-left:16px;">you can open your profile faster,</p>
      <p style="margin:0 0 4px;padding-left:16px;">return to your matches more smoothly,</p>
      <p style="margin:0 0 4px;padding-left:16px;">continue conversations with less friction,</p>
      <p style="margin:0 0 20px;padding-left:16px;">and receive Telegram notifications when someone writes to you.</p>

      <p style="margin:0 0 20px;">Your existing TwinF account can be connected to Telegram, so your profile, matches, messages, and StarSeedSoul Origin stay with you.</p>

      <p style="margin:0 0 40px;">Open the TwinF bot in Telegram and connect your existing account from your profile.</p>

    </div>

    <div style="text-align:center;margin-bottom:48px;">
      <a href="${TELEGRAM_BOT_URL}" style="display:inline-block;padding:15px 48px;border:1px solid rgba(201,169,110,0.35);background:transparent;color:#C9A96E;font-family:'Inter',-apple-system,sans-serif;font-weight:300;font-size:11px;letter-spacing:4px;text-transform:uppercase;text-decoration:none;">
        Open TwinF in Telegram
      </a>
    </div>

    <div style="width:1px;height:48px;background:linear-gradient(to bottom,transparent,#C9A96E,transparent);margin:0 auto 40px;"></div>

    <div style="font-size:13px;color:#7A7672;line-height:1.8;font-weight:300;">
      <p style="margin:0 0 4px;">Welcome to the new TwinF experience.</p>
      <p style="margin:0;color:#5F5A55;">TwinF by StarSeedSoul</p>
    </div>

  </div>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders })
    }

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single()

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders })
    }

    const body = await req.json()
    const mode: "dry_run" | "test" | "send" = body.mode
    const limit: number = body.limit ?? 10
    const customHtml: string | undefined = body.custom_html
    const customSubject: string | undefined = body.custom_subject

    if (!["dry_run", "test", "send"].includes(mode)) {
      return new Response(JSON.stringify({ error: "Invalid mode. Use: dry_run, test, send" }), { status: 400, headers: corsHeaders })
    }

    // Build eligible audience query
    const { data: eligible, error: queryError } = await supabase.rpc("get_broadcast_audience", {
      p_broadcast_key: BROADCAST_KEY,
    })

    if (queryError) {
      return new Response(JSON.stringify({ error: queryError.message }), { status: 500, headers: corsHeaders })
    }

    // dry_run — just count
    if (mode === "dry_run") {
      const { count: alreadySent } = await supabase
        .from("email_broadcast_log")
        .select("*", { count: "exact", head: true })
        .eq("broadcast_key", BROADCAST_KEY)
        .eq("status", "sent")

      return new Response(JSON.stringify({
        eligible: eligible.length,
        already_sent: alreadySent ?? 0,
        remaining: eligible.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), { status: 500, headers: corsHeaders })
    }

    // test — send one email to test_email
    if (mode === "test") {
      const testEmail: string = body.test_email
      if (!testEmail) {
        return new Response(JSON.stringify({ error: "test_email required for test mode" }), { status: 400, headers: corsHeaders })
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: testEmail,
          subject: `[TEST] ${customSubject ?? SUBJECT}`,
          html: customHtml ?? buildHtml(),
        }),
      })

      const result = await res.json()
      return new Response(JSON.stringify({ mode: "test", to: testEmail, resend: result }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // send — batch up to limit
    const batch = eligible.slice(0, limit)
    const results = { sent: 0, failed: 0, errors: [] as string[] }

    for (const row of batch) {
      // Insert pending log entry (ignore if already exists)
      await supabase.from("email_broadcast_log").upsert({
        broadcast_key: BROADCAST_KEY,
        user_id: row.user_id,
        email: row.email,
        status: "pending",
      }, { onConflict: "broadcast_key,email", ignoreDuplicates: true })

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: row.email,
          subject: customSubject ?? SUBJECT,
          html: customHtml ?? buildHtml(),
        }),
      })

      const result = await res.json()

      if (res.ok && result.id) {
        await supabase.from("email_broadcast_log")
          .update({ status: "sent", resend_id: result.id, sent_at: new Date().toISOString() })
          .eq("broadcast_key", BROADCAST_KEY)
          .eq("email", row.email)
        results.sent++
      } else {
        await supabase.from("email_broadcast_log")
          .update({ status: "error", error: JSON.stringify(result) })
          .eq("broadcast_key", BROADCAST_KEY)
          .eq("email", row.email)
        results.failed++
        results.errors.push(`${row.email}: ${JSON.stringify(result)}`)
      }
    }

    const remaining = eligible.length - batch.length

    return new Response(JSON.stringify({
      mode: "send",
      sent: results.sent,
      failed: results.failed,
      remaining,
      errors: results.errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
