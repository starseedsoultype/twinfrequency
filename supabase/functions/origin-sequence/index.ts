// Origin letter sequence.
// POST /functions/v1/origin-sequence
// { action: "run" }  from pg_cron, service role only. Does nothing while switched off.
// { action: "status" | "set_enabled" | "test" }  from the admin page, admin only.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildHtml, MAX_ATTEMPTS, normEmail, nyDay, planRun, renderBody } from "./logic.ts"
import type { Letter, Plan } from "./logic.ts"

const FROM_EMAIL = "StarSeedSoul <hello@twinfrequency.io>"
const UNSUBSCRIBE_BASE_URL = "https://twinfrequency.io/unsubscribe.html"
const PACE_MS = 120 // Resend allows 10 requests a second
const TIME_BUDGET_MS = 100_000 // the rest goes out on the next run

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

async function all<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as T[]))
    if (!data || data.length < 1000) return rows
  }
}

async function getConfig(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("bot_config").select("key,value").like("key", "origin_seq_%")
  if (error) throw new Error(error.message)
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
}

async function setConfig(key: string, value: string) {
  const { error } = await supabase.from("bot_config").upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

async function loadContent() {
  const [types, names, letters, blocks] = await Promise.all([
    all<{ type_name: string; pdf_url: string }>("origin_seq_types", "type_name,pdf_url"),
    all<{ lead_name: string; type_name: string }>("origin_seq_type_names", "lead_name,type_name"),
    all<Letter>("origin_seq_letters", "type_name,letter_no,subject,body,approved"),
    all<{ key: string; body: string }>("origin_seq_blocks", "key,body"),
  ])
  return {
    letters,
    pdfUrls: Object.fromEntries(types.map((t) => [t.type_name, t.pdf_url])),
    typeNames: Object.fromEntries(names.map((n) => [n.lead_name, n.type_name])),
    blocks: Object.fromEntries(blocks.map((b) => [b.key, b.body])),
  }
}

async function buildPlan(start: string, today: string): Promise<{ plan: Plan; content: Awaited<ReturnType<typeof loadContent>> }> {
  const [content, leads, sends, unsub] = await Promise.all([
    loadContent(),
    all<{ email: string; interest: string | null; created_at: string }>("api_leads", "email,interest,created_at"),
    all<{ email: string; letter_no: number; status: string; attempts: number; sent_at: string | null }>(
      "origin_seq_sends", "email,letter_no,status,attempts,sent_at"),
    all<{ email: string }>("email_unsubscribes", "email"),
  ])
  const plan = planRun({ leads, sends, unsubscribed: unsub.map((u) => u.email), ...content, today, start })
  return { plan, content }
}

async function sendEmail(to: string, subject: string, text: string, idempotencyKey?: string) {
  const unsubUrl = `${UNSUBSCRIBE_BASE_URL}?email=${encodeURIComponent(to)}`
  return await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      reply_to: Deno.env.get("REPLY_TO_EMAIL") || "hello@twinfrequency.io",
      to,
      subject,
      text: `${text}\n\nUnsubscribe: ${unsubUrl}`,
      html: buildHtml(text, unsubUrl),
      headers: { "List-Unsubscribe": `<${unsubUrl}>` },
    }),
  })
}

async function run() {
  const config = await getConfig()
  if (config.origin_seq_enabled !== "true") return { skipped: "switched off" }
  const today = nyDay(new Date())
  const start = config.origin_seq_start
  if (!start) return { skipped: "no start date" }
  const cap = parseInt(config.origin_seq_daily_cap ?? "150") || 150

  const { plan, content } = await buildPlan(start, today)
  const startedAt = Date.now()
  const letters = new Map(content.letters.map((l) => [`${l.type_name}|${l.letter_no}`, l]))
  const result = { sent: 0, errors: 0, failed: 0, queued: plan.queue.length, stoppedBy: null as string | null }

  for (const item of plan.queue.slice(0, cap)) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) { result.stoppedBy = "time budget"; break }
    const letter = letters.get(`${item.typeName}|${item.letterNo}`)!
    const { text } = renderBody(letter.body, content.blocks, content.pdfUrls[item.typeName])
    const attempts = item.attempts + 1

    const { error: claimError } = await supabase.from("origin_seq_sends").upsert({
      email: item.email, letter_no: item.letterNo, status: "sending", attempts, updated_at: new Date().toISOString(),
    })
    if (claimError) throw new Error(claimError.message)

    const res = await sendEmail(item.email, letter.subject, text, `origin-seq-${item.letterNo}-${item.email}`)
    const body = await res.json().catch(() => ({}))
    const now = new Date().toISOString()

    if (res.status === 429) {
      // Rate or daily limit: not the address's fault, so the attempt does not count.
      await supabase.from("origin_seq_sends").update({
        status: "error", attempts: item.attempts, error: JSON.stringify(body), updated_at: now,
      }).eq("email", item.email).eq("letter_no", item.letterNo)
      result.stoppedBy = "resend limit"
      break
    }
    if (res.ok && body.id) {
      await supabase.from("origin_seq_sends").update({
        status: "sent", resend_id: body.id, sent_at: now, error: null, updated_at: now,
      }).eq("email", item.email).eq("letter_no", item.letterNo)
      result.sent++
    } else {
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "error"
      await supabase.from("origin_seq_sends").update({
        status, error: JSON.stringify(body), updated_at: now,
      }).eq("email", item.email).eq("letter_no", item.letterNo)
      if (status === "failed") result.failed++
      else result.errors++
    }
    await sleep(PACE_MS)
  }
  return result
}

async function status() {
  const config = await getConfig()
  const today = nyDay(new Date())
  const start = config.origin_seq_start ?? today
  const { plan, content } = await buildPlan(start, today)
  const sends = await all<{ letter_no: number; status: string }>("origin_seq_sends", "letter_no,status")
  const perLetter = [1, 2, 3, 4].map((n) => ({
    letter: n,
    texts: content.letters.filter((l) => l.letter_no === n).length,
    approved: content.letters.filter((l) => l.letter_no === n && l.approved).length,
    sent: sends.filter((s) => s.letter_no === n && s.status === "sent").length,
    errors: sends.filter((s) => s.letter_no === n && (s.status === "error" || s.status === "failed")).length,
  }))
  return {
    enabled: config.origin_seq_enabled === "true",
    start: config.origin_seq_start ?? null,
    cap: parseInt(config.origin_seq_daily_cap ?? "150") || 150,
    today,
    perLetter,
    types: Object.keys(content.pdfUrls),
    pairBlockReady: !!content.blocks.PAIR_BLOCK,
    dueNow: plan.queue.length,
    notDue: plan.notDue,
    finished: plan.finished,
    failed: plan.failed,
    waitingText: plan.waitingText,
    waitingBlock: plan.waitingBlock,
    skippedNoType: plan.skippedNoType,
  }
}

async function setEnabled(enabled: boolean) {
  const config = await getConfig()
  if (enabled && !config.origin_seq_start) await setConfig("origin_seq_start", nyDay(new Date()))
  await setConfig("origin_seq_enabled", enabled ? "true" : "false")
  return { enabled }
}

// Sends every letter of one type to one address, approved or not. Writes nothing to the journal.
async function test(typeName: string, to: string) {
  const { letters, blocks, pdfUrls } = await loadContent()
  if (!pdfUrls[typeName]) return { error: "unknown type" }
  const results: Record<string, string> = {}
  for (const n of [1, 2, 3, 4]) {
    const letter = letters.find((l) => l.type_name === typeName && l.letter_no === n)
    if (!letter) { results[n] = "no text"; continue }
    const { ok, text } = renderBody(letter.body, blocks, pdfUrls[typeName])
    if (!ok) { results[n] = "mark left in text, not sent"; continue }
    const res = await sendEmail(normEmail(to), `[TEST] ${letter.subject}`, text)
    results[n] = res.ok ? "sent" : `error ${res.status}`
    await sleep(PACE_MS)
  }
  return { to, typeName, results }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "")
    const body = await req.json().catch(() => ({}))
    const isService = !!token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (body.action === "run") {
      if (!isService) return json({ error: "Forbidden" }, 403)
      return json(await run())
    }

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return json({ error: "Unauthorized" }, 401)
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
    if (!profile?.is_admin) return json({ error: "Forbidden" }, 403)

    if (body.action === "status") return json(await status())
    if (body.action === "set_enabled") return json(await setEnabled(body.enabled === true))
    if (body.action === "test") {
      if (!body.type_name || !body.to) return json({ error: "type_name and to are required" }, 400)
      return json(await test(body.type_name, body.to))
    }
    return json({ error: "Unknown action" }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
