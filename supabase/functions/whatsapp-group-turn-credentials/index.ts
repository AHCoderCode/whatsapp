import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = (origin: string | null) => {
  if (!origin) return true;
  if (origin === "https://windows-12-beta.vercel.app") return true;
  if (/^https:\/\/windows-12-beta-[a-z0-9-]+-vexel-ai\.vercel\.app$/i.test(origin)) return true;
  if (origin === "https://whatsapp-vexel-ai.vercel.app" || origin === "https://whatsapp-for.vercel.app" || origin === "https://whatsapp-git-main-vexel-ai.vercel.app") return true;
  if (/^https:\/\/whatsapp-[a-z0-9-]+-vexel-ai\.vercel\.app$/i.test(origin)) return true;
  if (origin === "http://localhost:5173" || origin === "http://localhost:4173" || origin === "http://localhost:8080") return true;
  return false;
};

const corsHeaders = (origin: string | null): Record<string,string> => ({
  "Access-Control-Allow-Origin": origin && allowedOrigin(origin) ? origin : "https://whatsapp-for.vercel.app",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Vary": "Origin"
});
const respond = (body: Record<string,unknown>, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type":"application/json", "Cache-Control":"no-store" } });

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    if (!allowedOrigin(origin)) return respond({ error:"origin_not_allowed" },403,origin);
    return new Response("ok",{headers:corsHeaders(origin)});
  }
  if (request.method !== "POST") return respond({error:"method_not_allowed"},405,origin);
  if (!allowedOrigin(origin)) return respond({error:"origin_not_allowed"},403,origin);
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.replace(/^Bearer\s+/i,"").trim();
  if (!bearer) return respond({error:"authentication_required"},401,origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const keySet = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "";
  let publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (keySet) {
    try {
      const keys = JSON.parse(keySet) as Record<string,string>;
      publishableKey = keys.default || Object.values(keys)[0] || publishableKey;
    } catch (_) {}
  }
  if (!supabaseUrl || !publishableKey) return respond({error:"backend_configuration_unavailable"},503,origin);
  const supabase = createClient(supabaseUrl,publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+bearer}}
  });
  const {data:userData,error:userError} = await supabase.auth.getUser(bearer);
  if (userError || !userData.user) return respond({error:"invalid_session"},401,origin);

  let body: {groupCallId?:unknown};
  try { body = await request.json(); } catch (_) { return respond({error:"invalid_request"},400,origin); }
  const groupCallId = typeof body.groupCallId === "string" ? body.groupCallId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupCallId)) {
    return respond({error:"invalid_group_call_id"},400,origin);
  }

  const {data:call,error:callError} = await supabase.from("aeroshell_group_calls")
    .select("id,group_id,status,media_type,created_at").eq("id",groupCallId).maybeSingle();
  if (callError || !call || call.status !== "active") return respond({error:"group_call_not_active_or_forbidden"},404,origin);
  const {data:participant,error:participantError} = await supabase.from("aeroshell_group_call_participants")
    .select("status").eq("group_call_id",groupCallId).eq("user_id",userData.user.id).maybeSingle();
  if (participantError || !participant || participant.status !== "accepted") {
    return respond({error:"accepted_participant_required"},403,origin);
  }

  const cutoff = new Date(Date.now()-10*60*1000).toISOString();
  const {data:recent,error:recentError} = await supabase.from("aeroshell_group_turn_credential_requests")
    .select("id").eq("user_id",userData.user.id).gte("created_at",cutoff);
  if (recentError) return respond({error:"relay_authorization_failed"},503,origin);
  if ((recent||[]).length >= 20) return respond({error:"rate_limited"},429,origin);
  const {error:quotaError} = await supabase.from("aeroshell_group_turn_credential_requests")
    .insert({group_call_id:groupCallId,user_id:userData.user.id});
  if (quotaError) return respond({error:"relay_authorization_failed"},503,origin);

  const domain = (Deno.env.get("METERED_TURN_DOMAIN") || "").trim().toLowerCase();
  const apiKey = (Deno.env.get("METERED_TURN_API_KEY") || "").trim();
  if (!domain || !apiKey) return respond({error:"private_relay_not_configured"},503,origin);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.metered\.live$/i.test(domain)) {
    return respond({error:"backend_configuration_unavailable"},503,origin);
  }
  try {
    const endpoint = new URL("https://"+domain+"/api/v1/turn/credentials");
    endpoint.searchParams.set("apiKey",apiKey);
    const upstream = await fetch(endpoint,{method:"GET",headers:{Accept:"application/json"},signal:AbortSignal.timeout(8000)});
    if (!upstream.ok) return respond({error:"private_relay_unavailable"},502,origin);
    const payload = await upstream.json() as Array<{urls?:string|string[];username?:string;credential?:string}>;
    const servers:Array<{urls:string;username:string;credential:string}> = [];
    const seen = new Set<string>();
    for (const server of Array.isArray(payload)?payload:[]) {
      const candidates = Array.isArray(server?.urls)?server.urls:[server?.urls];
      if (typeof server?.username !== "string" || !server.username.trim() ||
          typeof server?.credential !== "string" || !server.credential.trim()) continue;
      const hosts = new Set<string>();
      for (const candidate of candidates) {
        if (typeof candidate !== "string") continue;
        const match = /^turns?:([a-z0-9.-]+\.relay\.metered\.ca):\d+(?:\?transport=(?:tcp|udp))?$/i.exec(candidate.trim());
        if (match) hosts.add(match[1].toLowerCase());
      }
      for (const host of hosts) {
        for (const url of ["turn:"+host+":80","turn:"+host+":80?transport=tcp","turn:"+host+":443","turns:"+host+":443?transport=tcp"]) {
          if (seen.has(url)) continue;
          seen.add(url);
          servers.push({urls:url,username:server.username,credential:server.credential});
        }
      }
    }
    if (!servers.length) return respond({error:"private_relay_unavailable"},502,origin);
    return respond({iceServers:servers},200,origin);
  } catch (_) {
    return respond({error:"private_relay_unavailable"},502,origin);
  }
});
