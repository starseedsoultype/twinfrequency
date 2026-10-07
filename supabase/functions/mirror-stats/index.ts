// Mirror is switched off (2026-10-07). The working version is in git history
// (commit 0b1a0ec, "Archive Mirror Edge Function sources as deployed").
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  return new Response(JSON.stringify({ error: "Mirror is closed" }), {
    status: 410,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
