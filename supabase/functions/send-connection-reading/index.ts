import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = "StarSeedSoul <hello@twinfrequency.io>";
const CALENDLY_LINK = "https://calendly.com/readingstarseedsoul/fifteen-minute-starseed-soul-origin-reading-ses-clone";
const LIBRARY_LINK = "https://twinfrequency.io/library.html";

// Full descriptions for each connection type
// Written in warm, poetic, human voice — no negations, no dashes
// Moves between cosmic and everyday reality
const CONNECTION_READINGS: Record<string, string[]> = {
  "Frequency Twins": [
    "Your connection carries the signature of perfect structural harmony. It feels as though two instruments were tuned to the exact same frequency long before either of you knew the other existed. You meet each other completely at every level of experience, from the deepest foundational truth to the most vulnerable creative expression.",
    "There is an inevitable quality to how you interact. When one of you offers a vision or an energy, the other receives it with absolute natural grace. You provide exactly what your partner requires for growth, and they return that gift effortlessly.",
    "In your everyday life together, this translates into a profound sense of ease. You understand each other in the quiet moments over morning coffee just as deeply as you do in your grandest shared adventures. The connection asks you to simply exist together and enjoy the rare beauty of complete resonance."
  ],
  "Twin Stars": [
    "You share a connection of deep complementarity layered with profound pockets of recognition. In the areas that matter most to your soul evolution, you complete each other beautifully. At the same time, you share a comforting sameness in other aspects of your design, creating a powerful magnetic pull.",
    "This dynamic feels textured and rich. You look at this person and see reflections of your own inner world, while simultaneously experiencing the awe of discovering someone who holds the missing pieces to your puzzle.",
    "On a practical level, you find yourselves finishing each other's thoughts in certain areas, while learning entirely new ways of being in others. It is a relationship that offers both the comfort of a familiar home and the thrill of an expansive journey."
  ],
  "Cosmic Flow": [
    "Your relationship moves with a natural, sustainable rhythm. Energy flows easily between you, creating a current of mutual support that feels incredibly comfortable. You speak a similar language of the soul, bringing out the ease and grace in each other rather than focusing on the sharp edges.",
    "This is a connection where your natural creative output serves as the exact nourishment the other person needs to grow. You generate inspiration for each other simply by being yourselves, creating a beautiful cycle of giving and receiving.",
    "In your daily interactions, this manifests as a peaceful coexistence. You navigate life together smoothly, finding joy in shared routines and quiet companionship. It is a connection built on gentle flow rather than dramatic charge, offering a safe harbor for both of your spirits."
  ],
  "Mirror Portals": [
    "Your connection is deeply inspiring and carries a distinct, captivating edge. You see something truly admirable in each other, recognizing familiar traits while also feeling the strong pull of complementary strengths. There is a powerful creative energy that sparks when you come together.",
    "Alongside this profound connection, there is a specific area where you experience the world quite differently. This space between you serves as an invitation to expand your understanding of what is possible in a relationship.",
    "In your shared life, you experience moments of brilliant collaboration and deep recognition, interspersed with times when you must consciously choose to bridge the gap in your perspectives. It is a dynamic that keeps you both engaged, asking you to continuously learn the unique language of your partner."
  ],
  "Celestial Mentor": [
    "You have entered a profound teaching relationship. This connection brings together genuine gifts and meaningful friction, creating a space for exceptional personal development. You offer each other ideal complementarity in some areas, while challenging each other to grow in others.",
    "The dynamic between you often shifts, with one of you naturally holding more authority or wisdom in a specific aspect of life, while the other takes on the role of the student. This exchange of knowledge flows both ways, depending on which part of your souls is activated.",
    "Navigating this connection requires maturity and a willingness to embrace growth. In your everyday moments, you find yourselves learning profound lessons through your interactions. The reward for your dedication is genuine, lasting evolution for both of you."
  ],
  "Karmic Bonds": [
    "Your connection carries a magnetic quality that draws you together across contexts and time. There is a profound sense of returning to each other, guided by a force that bypasses the rational mind. You experience genuine moments of deep meeting that feel both ancient and immediate.",
    "This bond asks you to bring conscious attention to the patterns you create together. The intense pull you feel is an invitation to look closely at the dynamics playing out between you and to find new ways of responding to familiar situations.",
    "In your daily life, you may notice certain themes surfacing repeatedly. This is the beautiful work of your connection. By choosing to navigate these moments with awareness and compassion, you transform recurring patterns into profound opportunities for spiritual resolution and growth."
  ],
  "Shadow Contracts": [
    "This connection serves as a powerful catalyst for transformation. You activate each other in ways that are impossible to ignore, drawing out the deepest parts of your inner worlds. The pull between you is real and undeniable, ensuring that your time together is always deeply engaging.",
    "Your relationship acts as a mirror for the aspects of yourselves that are asking to be seen and integrated. While this activation can feel intense, it holds the potential for extraordinary personal evolution when approached with courage and an open heart.",
    "In the reality of your shared days, you find yourselves consistently challenged to grow beyond your current limitations. When both of you commit to working with the material that surfaces, this connection becomes a profound crucible for mutual awakening and lasting change."
  ],
  "Black Holes": [
    "Your relationship generates an enormous, captivating charge. You feel an intense need for each other, creating a dynamic where neither of you can remain indifferent. The pull is exceptionally strong, often making this one of the most significant connections you will experience.",
    "This intensity stems from a deep, structural activation of your core needs and vulnerabilities. You are drawn together to explore the very edges of your emotional and spiritual capacities, engaging in a profound dance of seeking and offering.",
    "Navigating this powerful connection in your everyday life requires exceptional self awareness and clear boundaries. By bringing consciousness to the intense energy between you, you can harness its transformative power while maintaining your own center of gravity."
  ],
  "Star Alchemy": [
    "You have encountered a relationship of maximum potential and profound intensity. The collision of your souls brings your deepest certainties face to face with your most vulnerable spaces. You simply cannot remain neutral about each other, as the connection demands your full presence.",
    "This is the kind of relationship that changes people fundamentally. The structural opposition between your designs creates an extraordinary crucible for transformation, asking you to expand your understanding of yourself and the world.",
    "In your daily interactions, you experience the full spectrum of human emotion and spiritual awakening. By bringing a high level of awareness and compassion to your dynamic, you unlock the potential for extraordinary alchemy, turning your deepest challenges into your greatest strengths."
  ],
  "Eternal Reflection": [
    "You have met a soul that mirrors your own design completely. This connection offers the rare gift of total, instant recognition. You understand each other at a fundamental level, experiencing a profound sense of familiarity and comfort in each other's presence.",
    "Every strength you possess is reflected back to you, and every vulnerability is met with exact understanding. There is a beautiful absence of friction in your dynamic, allowing you to simply be yourselves without the need for translation or explanation.",
    "In your life together, this translates into a deeply peaceful coexistence. You find solace in knowing that your partner truly comprehends your experience of the world. It is a connection that offers a safe, reflective space for you to observe your own soul in the presence of another."
  ]
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[A-Za-z]{2,}$/;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const connection_type = typeof body?.connection_type === "string" ? body.connection_type : "";
    const connection_tension = typeof body?.connection_tension === "string" ? body.connection_tension.slice(0, 200) : "";

    if (!email || !connection_type) return jsonError("Missing required fields", 400);
    if (!EMAIL_RE.test(email)) return jsonError("Invalid email", 400);

    // Only our own curated readings are ever sent. Caller-supplied text is never
    // put into an email from this domain, so the function cannot be used as a relay.
    const paragraphs = CONNECTION_READINGS[connection_type];
    if (!paragraphs) return jsonError("Unknown connection type", 400);

    const readingParagraphs = paragraphs
      .map((p: string) => `<p style="margin:0 0 20px 0;line-height:1.9;color:#e8e0f0;font-size:15px;">${p.trim()}</p>`)
      .join("");

    const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#07060F;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#07060F;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.2em;color:#C9A84C;text-transform:uppercase;">StarSeedSoul Typology</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <p style="margin:0;font-size:12px;letter-spacing:0.15em;color:rgba(201,168,76,0.6);text-transform:uppercase;">Your Soul Connection</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <h1 style="margin:0;font-size:36px;font-weight:400;color:#C9A84C;letter-spacing:0.05em;">${escapeHtml(connection_type)}</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <p style="margin:0;font-size:12px;letter-spacing:0.1em;color:rgba(201,168,76,0.5);">${escapeHtml(connection_tension)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:40px;">
              <div style="height:1px;background:linear-gradient(to right,transparent,rgba(201,168,76,0.4),transparent);"></div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0 0 28px 0;font-size:11px;letter-spacing:0.2em;color:rgba(201,168,76,0.6);text-transform:uppercase;">Your Reading</p>
              ${readingParagraphs}
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:40px;">
              <div style="height:1px;background:linear-gradient(to right,transparent,rgba(201,168,76,0.4),transparent);"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:16px;">
              <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:rgba(201,168,76,0.6);text-transform:uppercase;">Want to go deeper?</p>
              <p style="margin:0 0 28px 0;font-size:16px;color:#e8e0f0;line-height:1.8;">I read this connection personally. What it means for you specifically, how it moves through your life right now, and what it is asking you to understand and embrace.</p>
              <p style="margin:0 0 28px 0;font-size:14px;color:rgba(201,168,76,0.7);font-style:italic;">15 minutes. Personal format. $55.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:48px;">
              <a href="${CALENDLY_LINK}" style="display:inline-block;padding:16px 40px;background:transparent;border:1px solid rgba(201,168,76,0.7);color:#C9A84C;text-decoration:none;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;">Book Your Session ✦</a>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:32px;">
              <div style="height:1px;background:linear-gradient(to right,transparent,rgba(201,168,76,0.2),transparent);"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <p style="margin:0;font-size:13px;color:rgba(232,224,240,0.5);line-height:1.7;font-style:italic;">P.S. All 10 connection types are described in detail in the Twin Frequency Library. <a href="${LIBRARY_LINK}" style="color:rgba(201,168,76,0.6);text-decoration:underline;">Explore them here.</a></p>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0 0 8px 0;font-size:10px;letter-spacing:0.15em;color:rgba(201,168,76,0.3);text-transform:uppercase;">StarSeedSoul Typology</p>
              <p style="margin:0;font-size:10px;color:rgba(232,224,240,0.2);line-height:1.6;">You received this because you completed the Soul Connection Quiz.<br>To unsubscribe, reply with "unsubscribe" to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `Your Soul Connection Reading: ${connection_type}`,
        html: emailHtml,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend error:", resendData);
      return jsonError("Failed to send email", 500);
    }

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Function error:", err);
    return jsonError("Internal server error", 500);
  }
});
