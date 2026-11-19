import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-clouddock-worker-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const env = (key: string) => Deno.env.get(key) ?? "";
const supabaseUrl = env("SUPABASE_URL");
const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = env("SUPABASE_ANON_KEY");
const workerToken = env("CLOUDDOCK_WORKER_TOKEN");
const encryptionKey = env("CLOUDDOCK_SECRETS_ENCRYPTION_KEY");
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function encryptSecret(value: string): Promise<string> {
  if (!encryptionKey) throw new Error("Secret encryption is not configured.");
  const raw = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("CLOUDDOCK_SECRETS_ENCRYPTION_KEY must be base64 for exactly 32 random bytes.");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  return "v1." + btoa(String.fromCharCode(...iv)) + "." + btoa(String.fromCharCode(...encrypted));
}
async function decryptSecret(value: string): Promise<string> {
  const [version, ivText, dataText] = value.split(".");
  if (version !== "v1" || !ivText || !dataText || !encryptionKey) throw new Error("Stored secret cannot be decrypted.");
  const raw = Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const iv = Uint8Array.from(atob(ivText), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(dataText), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data));
}
async function requireUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in is required.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Your session is invalid or expired.");
  return data.user;
}
async function storageSignedUrl(path: string, upload: boolean) {
  const endpoint = upload ? "upload/sign" : "sign";
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${endpoint}/service-source/${path}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(upload ? { upsert: false } : { expiresIn: 300 }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Could not create a source upload/download URL.");
  return data;
}
async function handleCustomer(user: { id: string }, body: Record<string, unknown>) {
  const action = String(body.action || "");
  if (action === "list_services") {
    const { data, error } = await admin.from("hosting_services").select("id,name,service_type,platform,runtime,region,status,desired_state,memory_mb,storage_mb,cpu_millicores,created_at,updated_at").eq("owner_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return { services: data };
  }
  if (action === "create_service") {
    const name = String(body.name || "").trim();
    const serviceType = String(body.service_type || "");
    const platform = body.platform == null ? null : String(body.platform);
    const runtime = String(body.runtime || "");
    if (name.length < 1 || name.length > 48) throw new Error("Service names must be 1–48 characters.");
    const valid = serviceType === "bot" && ["nodejs", "python"].includes(runtime) && ["discord", "nerimity", "fluxer", "stoat"].includes(platform || "");
    if (!valid) throw new Error("Bot hosting currently supports Discord, Nerimity, Fluxer, and Stoat with Node.js or Python. Minecraft and website hosting are not deployable yet.");
    const { data: plan, error: planError } = await admin.from("hosting_plans").select("*").eq("id", "free").eq("enabled", true).single();
    if (planError || !plan) throw new Error("New service creation is temporarily unavailable.");
    const { count, error: countError } = await admin.from("hosting_services").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
    if (countError) throw countError;
    if ((count || 0) >= plan.max_services) throw new Error("Your current plan has reached its service limit.");
    const { data, error } = await admin.from("hosting_services").insert({
      owner_id: user.id, name, service_type: serviceType, platform, runtime,
      plan_id: plan.id, memory_mb: Math.min(512, plan.max_memory_mb), storage_mb: Math.min(512, plan.max_storage_mb), cpu_millicores: 500,
    }).select("id,name,service_type,platform,runtime,region,status,desired_state,memory_mb,storage_mb,cpu_millicores,created_at").single();
    if (error) throw error;
    return { service: data };
  }
  if (action === "service_action") {
    const id = String(body.service_id || "");
    const operation = String(body.operation || "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["start", "stop", "restart", "deploy"].includes(operation)) throw new Error("Invalid service operation.");
    const { data, error } = await admin.rpc("clouddock_enqueue_job", { p_service_id: id, p_owner_id: user.id, p_action: operation });
    if (error) throw error;
    return { job: data };
  }
  if (action === "create_upload_url") {
    const id = String(body.service_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid service ID.");
    const { data: svc, error } = await admin.from("hosting_services").select("id,owner_id").eq("id", id).eq("owner_id", user.id).single();
    if (error || !svc) throw new Error("Service not found.");
    const objectPath = `${user.id}/${id}/source-${crypto.randomUUID()}.zip`;
    const signed = await storageSignedUrl(objectPath, true);
    const token = signed.token;
    if (!token) throw new Error("Storage did not return an upload token.");
    const { error: updateError } = await admin.from("hosting_services").update({ source_object: objectPath, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_id", user.id);
    if (updateError) throw updateError;
    return { object_path: objectPath, upload_token: token, upload_url: `${supabaseUrl}/storage/v1${signed.url || `/object/upload/sign/service-source/${objectPath}?token=${token}`}` };
  }
  if (action === "set_secret") {
    const id = String(body.service_id || "");
    const name = String(body.name || "").toUpperCase();
    const value = String(body.value || "");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[A-Z][A-Z0-9_]{0,63}$/.test(name) || value.length < 1 || value.length > 4096) throw new Error("Invalid secret name or value.");
    const { data: ownedService, error: ownershipError } = await admin.from("hosting_services").select("id").eq("id", id).eq("owner_id", user.id).single();
    if (ownershipError || !ownedService) throw new Error("Service not found.");
    const encrypted = await encryptSecret(value);
    const { error } = await admin.from("hosting_service_secrets").upsert({ service_id: id, owner_id: user.id, secret_name: name, encrypted_value: encrypted, updated_at: new Date().toISOString() }, { onConflict: "service_id,secret_name" });
    if (error) throw error;
    return { saved: true };
  }
  if (action === "delete_service") {
    const id = String(body.service_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid service ID.");
    const { data: svc, error: lookupError } = await admin.from("hosting_services").select("id,source_object").eq("id", id).eq("owner_id", user.id).single();
    if (lookupError || !svc) throw new Error("Service not found.");
    const { data, error } = await admin.rpc("clouddock_enqueue_job", { p_service_id: id, p_owner_id: user.id, p_action: "delete" });
    if (error) throw error;
    return { queued: true, job: data };
  }
  if (action === "list_secrets") {
    const id = String(body.service_id || "");
    const { data: owned, error: ownershipError } = await admin.from("hosting_services").select("id").eq("id", id).eq("owner_id", user.id).single();
    if (ownershipError || !owned) throw new Error("Service not found.");
    const { data, error } = await admin.from("hosting_service_secrets").select("secret_name,created_at,updated_at").eq("service_id", id).eq("owner_id", user.id).order("secret_name");
    if (error) throw error;
    return { secrets: data };
  }
  if (action === "delete_secret") {
    const id = String(body.service_id || "");
    const name = String(body.name || "").toUpperCase();
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) throw new Error("Invalid secret name or service.");
    const { data: owned, error: ownershipError } = await admin.from("hosting_services").select("id").eq("id", id).eq("owner_id", user.id).single();
    if (ownershipError || !owned) throw new Error("Service not found.");
    const { error } = await admin.from("hosting_service_secrets").delete().eq("service_id", id).eq("owner_id", user.id).eq("secret_name", name);
    if (error) throw error;
    return { deleted: true };
  }
  if (action === "service_events") {
    const id = String(body.service_id || "");
    const { data, error } = await admin.from("hosting_service_events").select("id,level,message,created_at").eq("service_id", id).eq("owner_id", user.id).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return { events: data };
  }
  if (action === "service_jobs") {
    const id = String(body.service_id || "");
    const { data, error } = await admin.from("hosting_jobs").select("id,action,status,error,created_at,completed_at").eq("service_id", id).eq("owner_id", user.id).order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    return { jobs: data };
  }
  throw new Error("Unknown customer action.");
}
async function handleWorker(body: Record<string, unknown>) {
  const action = String(body.action || "");
  if (action === "register") {
    const name = String(body.name || "").trim();
    const region = String(body.region || "unknown");
    const capacity = Number(body.capacity_memory_mb || 0);
    if (!name || name.length > 64 || !Number.isInteger(capacity) || capacity < 512) throw new Error("Invalid worker registration.");
    const { data, error } = await admin.from("hosting_workers").upsert({ name, region, capacity_memory_mb: capacity, status: "online", last_heartbeat_at: new Date().toISOString() }, { onConflict: "name" }).select("id,name,region,status,capacity_memory_mb").single();
    if (error) throw error;
    return { worker: data };
  }
  const workerId = String(body.worker_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(workerId)) throw new Error("Invalid worker ID.");
  if (action === "reconcile") {
    const { data, error } = await admin.rpc("clouddock_reconcile_stale_jobs");
    if (error) throw error;
    return { reconciled: data ?? 0 };
  }
  if (action === "heartbeat") {
    const now = new Date().toISOString();
    const { error } = await admin.from("hosting_workers").update({ status: "online", last_heartbeat_at: now }).eq("id", workerId);
    if (error) throw error;
    const { error: leaseError } = await admin.from("hosting_jobs").update({ claimed_at: now }).eq("worker_id", workerId).in("status", ["claimed","running"]);
    if (leaseError) throw leaseError;
    return { ok: true };
  }
  if (action === "claim") {
    const { data, error } = await admin.rpc("clouddock_claim_job", { p_worker_id: workerId });
    if (error) throw error;
    if (!data?.length) return { job: null };
    const job = data[0];
    const { data: svc, error: svcError } = await admin.from("hosting_services").select("*").eq("id", job.service_id).single();
    if (svcError) throw svcError;
    const { data: secrets, error: secretsError } = await admin.from("hosting_service_secrets").select("secret_name,encrypted_value").eq("service_id", job.service_id);
    if (secretsError) throw secretsError;
    const environment: Record<string, string> = {};
    for (const secret of secrets || []) environment[secret.secret_name] = await decryptSecret(secret.encrypted_value);
    let source_download_url: string | null = null;
    if (svc.source_object) {
      const signed = await storageSignedUrl(svc.source_object, false);
      source_download_url = signed.signedURL || signed.signedUrl || null;
      if (source_download_url && !source_download_url.startsWith("http")) source_download_url = supabaseUrl + "/storage/v1" + source_download_url;
    }
    return { job, service: svc, environment, source_download_url };
  }
  if (action === "report_state") {
    const serviceId = String(body.service_id || "");
    const status = String(body.status || "");
    if (!/^[0-9a-f-]{36}$/i.test(serviceId) || !["running","failed","stopped"].includes(status)) throw new Error("Invalid service state report.");
    const { data: svc, error: svcError } = await admin.from("hosting_services").select("id,owner_id,worker_id").eq("id",serviceId).eq("worker_id",workerId).single();
    if (svcError || !svc) throw new Error("Service is not assigned to this worker.");
    const message = String(body.message || `Worker reports service ${status}.`).slice(0,500);
    const { error } = await admin.from("hosting_services").update({status,container_id:status==="running" ? undefined : null,last_error:status==="failed" ? message : null,updated_at:new Date().toISOString()}).eq("id",serviceId);
    if (error) throw error;
    const { error: eventError } = await admin.from("hosting_service_events").insert({service_id:serviceId,owner_id:svc.owner_id,level:status==="failed"?"error":"info",message});
    if (eventError) throw eventError;
    return {reported:true};
  }
  if (action === "complete") {
    const jobId = String(body.job_id || "");
    const serviceId = String(body.service_id || "");
    const success = body.success === true;
    const containerId = body.container_id == null ? null : String(body.container_id).slice(0, 128);
    const errorText = body.error == null ? null : String(body.error).slice(0, 1000);
    const { data: job, error: jobError } = await admin.from("hosting_jobs").select("id,service_id,owner_id,action,worker_id,status").eq("id", jobId).eq("worker_id", workerId).single();
    if (jobError || !job || job.status !== "claimed") throw new Error("Job is not assigned to this worker.");
    if (job.service_id !== serviceId) throw new Error("Job/service mismatch.");
    if (success && job.action === "delete") {
      const { data: svc, error: svcError } = await admin.from("hosting_services").select("id,source_object").eq("id", serviceId).single();
      if (svcError || !svc) throw new Error("Service not found while completing deletion.");
      if (svc.source_object) {
        const { error: storageError } = await admin.storage.from("service-source").remove([svc.source_object]);
        if (storageError) throw new Error("Could not remove the service source archive.");
      }
      const { error: eventError } = await admin.from("hosting_service_events").insert({ service_id: serviceId, owner_id: job.owner_id, level: "info", message: "Hosting service deletion completed." });
      if (eventError) throw eventError;
      const { error: deleteError } = await admin.from("hosting_services").delete().eq("id", serviceId);
      if (deleteError) throw deleteError;
      return { completed: true, deleted: true };
    }
    const { error: updateJobError } = await admin.from("hosting_jobs").update({ status: success ? "succeeded" : "failed", result: { container_id: containerId }, error: errorText, completed_at: new Date().toISOString() }).eq("id", jobId);
    if (updateJobError) throw updateJobError;
    const { error: serviceError } = await admin.from("hosting_services").update({ status: success ? (job.action === "stop" ? "stopped" : "running") : "failed", container_id: success ? containerId : null, last_error: errorText, updated_at: new Date().toISOString() }).eq("id", serviceId);
    if (serviceError) throw serviceError;
    const { error: eventError } = await admin.from("hosting_service_events").insert({ service_id: serviceId, owner_id: job.owner_id, level: success ? "info" : "error", message: success ? `Operation ${job.action} completed.` : `Operation failed: ${errorText || "unknown error"}` });
    if (eventError) throw eventError;
    return { completed: true };
  }
  throw new Error("Unknown worker action.");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "Control plane is not configured." }, 503);
  try {
    const body = await req.json();
    if (req.headers.get("x-clouddock-worker-token") === workerToken && workerToken.length >= 32) {
      return json(await handleWorker(body));
    }
    const user = await requireUser(req);
    return json(await handleCustomer(user, body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected control-plane error.";
    return json({ error: message }, message.includes("Sign in") || message.includes("session") ? 401 : 400);
  }
});
