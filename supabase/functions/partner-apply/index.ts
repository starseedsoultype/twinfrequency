import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Partner applications from starseedsoultype.com/partners.html.
// Recipient is fixed server-side, so this cannot be used to email anyone else.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "StarSeedSoul Partners <hello@twinfrequency.io>";
const TO_EMAIL = "timsocion@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (v: unknown, max: number) =>
  String(v ?? "").trim().slice(0, max);

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();

    // Honeypot: bots fill the hidden field, people never see it
    if (clean(body.website, 200)) return json({ success: true });

    const f = {
      name: clean(body.name, 120),
      email: clean(body.email, 200),
      platform: clean(body.platform, 60),
      handle: clean(body.handle, 120),
      link: clean(body.link, 300),
      audience: clean(body.audience, 60),
      payout: clean(body.payout, 20),
      message: clean(body.message, 2000),
    };

    if (!f.name || !f.link || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
      return json({ error: "Missing required fields" }, 400);
    }

    const rows = [
      ["Name", f.name],
      ["Email", f.email],
      ["Platform", f.platform],
      ["Username", f.handle],
      ["Link", f.link],
      ["Audience size", f.audience],
      ["Payout via", f.payout],
      ["Message", f.message],
    ]
      .map(([k, v]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#888;vertical-align:top;">${k}</td><td style="padding:6px 0;">${esc(v || "—").replace(/\n/g, "<br>")}</td></tr>`
      )
      .join("");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: f.email,
        subject: `New partner: ${f.name}${f.platform ? " · " + f.platform : ""}${f.audience ? " · " + f.audience : ""}`,
        html: `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;color:#222;"><p>New partner application from partners.html</p><table cellpadding="0" cellspacing="0">${rows}</table><p style="color:#888;font-size:12px;margin-top:20px;">Reply to this email to answer ${esc(f.name)} directly.</p></div>`,
      }),
    });

    if (!res.ok) {
      console.error("Resend error:", await res.text());
      return json({ error: "Failed to send" }, 500);
    }
    return json({ success: true });
  } catch (err) {
    console.error("partner-apply error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
