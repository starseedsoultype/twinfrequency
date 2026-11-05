// Pure rules of the Origin letter sequence, no network or database.

export const GAP_DAYS: Record<number, number> = { 2: 1, 3: 2, 4: 2 }
export const LAST_LETTER = 4
export const MAX_ATTEMPTS = 3

export type Lead = { email: string; interest: string | null; created_at: string }
export type Send = { email: string; letter_no: number; status: string; attempts: number; sent_at: string | null }
export type Letter = { type_name: string; letter_no: number; subject: string; body: string; approved: boolean }
export type QueueItem = { email: string; typeName: string; letterNo: number; isNew: boolean; attempts: number }

export type PlanInput = {
  leads: Lead[]
  sends: Send[]
  unsubscribed: string[]
  typeNames: Record<string, string> // lead spelling -> type name
  letters: Letter[]
  blocks: Record<string, string>
  pdfUrls: Record<string, string>
  today: string // YYYY-MM-DD in New York
  start: string // first day of the wave, YYYY-MM-DD in New York
}

export type Plan = {
  queue: QueueItem[]
  finished: number
  failed: number
  notDue: number
  waitingText: number // next letter is not approved yet
  waitingBlock: number // next letter still has a bracket mark
  skippedNoType: number
}

export function normEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function nyDay(date: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(date))
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Places shared blocks into the body. ok = false while any [MARK] is left.
export function renderBody(body: string, blocks: Record<string, string>, pdfUrl: string): { ok: boolean; text: string } {
  let text = body
  for (const [key, value] of Object.entries(blocks)) {
    text = text.split(`[${key}]`).join(value.split('{{PDF_URL}}').join(pdfUrl))
  }
  return { ok: !/\[[^\]]*\]/.test(text) && !text.includes('{{'), text }
}

export function planRun(input: PlanInput): Plan {
  const plan: Plan = { queue: [], finished: 0, failed: 0, notDue: 0, waitingText: 0, waitingBlock: 0, skippedNoType: 0 }
  const unsub = new Set(input.unsubscribed.map(normEmail))
  const letters = new Map(input.letters.map((l) => [`${l.type_name}|${l.letter_no}`, l]))
  const sendsByEmail = new Map<string, Map<number, Send>>()
  for (const s of input.sends) {
    const email = normEmail(s.email)
    if (!sendsByEmail.has(email)) sendsByEmail.set(email, new Map())
    sendsByEmail.get(email)!.set(s.letter_no, s)
  }

  const seen = new Set<string>()
  for (const lead of input.leads) {
    const email = normEmail(lead.email ?? '')
    if (!email || seen.has(email) || unsub.has(email)) continue
    if (!lead.interest || lead.interest.startsWith('connection:')) continue
    const typeName = input.typeNames[lead.interest]
    if (!typeName) { plan.skippedNoType++; continue }
    seen.add(email)

    const sends = sendsByEmail.get(email) ?? new Map<number, Send>()
    if ([...sends.values()].some((s) => s.status === 'failed')) { plan.failed++; continue }

    let letterNo = 1
    while (letterNo <= LAST_LETTER && sends.get(letterNo)?.status === 'sent') letterNo++
    if (letterNo > LAST_LETTER) { plan.finished++; continue }

    const createdDay = nyDay(lead.created_at)
    const isNew = createdDay >= input.start
    let dueDay: string
    if (letterNo === 1) {
      const next = addDays(createdDay, 1)
      dueDay = next > input.start ? next : input.start
    } else {
      dueDay = addDays(nyDay(sends.get(letterNo - 1)!.sent_at!), GAP_DAYS[letterNo])
    }
    if (dueDay > input.today) { plan.notDue++; continue }

    const letter = letters.get(`${typeName}|${letterNo}`)
    if (!letter || !letter.approved) { plan.waitingText++; continue }
    if (!renderBody(letter.body, input.blocks, input.pdfUrls[typeName] ?? '').ok) { plan.waitingBlock++; continue }

    plan.queue.push({ email, typeName, letterNo, isNew, attempts: sends.get(letterNo)?.attempts ?? 0 })
  }

  plan.queue.sort((a, b) =>
    Number(b.isNew) - Number(a.isNew) || a.letterNo - b.letterNo || a.email.localeCompare(b.email))
  return plan
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}" style="color:#000000;">${url}</a>`)
}

// A plain personal letter with an unsubscribe link at the bottom.
export function buildHtml(text: string, unsubUrl: string): string {
  const paragraphs = text.trim().split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 18px;">${linkify(escapeHtml(p.trim())).replace(/\n/g, '<br>')}</p>`)
    .join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#FFFFFF;">
<div style="max-width:520px;margin:0 auto;padding:32px 24px;color:#000000;font-family:Georgia,serif;font-size:16px;line-height:1.6;">
${paragraphs}
<div style="margin-top:36px;font-family:Arial,Helvetica,sans-serif;"><a href="${escapeHtml(unsubUrl)}" style="font-size:12px;color:#888888;">unsubscribe</a></div>
</div></body></html>`
}
