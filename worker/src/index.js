import Docker from "dockerode";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";

const required = ["CLOUDDOCK_CONTROL_PLANE_URL","CLOUDDOCK_WORKER_TOKEN","CLOUDDOCK_WORKER_NAME"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
const api = process.env.CLOUDDOCK_CONTROL_PLANE_URL.replace(/\/$/,"");
const token = process.env.CLOUDDOCK_WORKER_TOKEN;
if (token.length < 32) throw new Error("CLOUDDOCK_WORKER_TOKEN must be at least 32 characters.");
const dataRoot = path.resolve(process.env.CLOUDDOCK_DATA_DIR || "/var/lib/clouddock/services");
const memoryCapacity = Number(process.env.CLOUDDOCK_WORKER_MEMORY_MB || 4096);
const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock" });
let workerId = null;
let shuttingDown = false;
let lastReconcileAt = 0;

async function call(action, payload = {}) {
  const response = await fetch(api, {
    method: "POST",
    headers: { "Content-Type":"application/json", "x-clouddock-worker-token":token },
    body: JSON.stringify({ action, worker_id:workerId, ...payload }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Control plane returned HTTP ${response.status}`);
  if (body.error) throw new Error(body.error);
  return body;
}
async function register() {
  const result = await call("register", {
    name:process.env.CLOUDDOCK_WORKER_NAME,
    region:process.env.CLOUDDOCK_WORKER_REGION || "unknown",
    capacity_memory_mb:memoryCapacity,
  });
  workerId = result.worker.id;
  console.log("Registered CloudDock worker", result.worker.name, result.worker.id);
}
function safeServiceDir(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid service identifier.");
  return path.join(dataRoot,id);
}
async function downloadSource(url, destination) {
  if (!url) throw new Error("No source archive has been uploaded for this service.");
  const response = await fetch(url, { signal:AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error("Could not download the uploaded source archive.");
  const archivePath = path.join(os.tmpdir(), `clouddock-${crypto.randomUUID()}.zip`);
  await pipeline(response.body, createWriteStream(archivePath,{mode:0o600}));
  const stat = await fs.stat(archivePath);
  if (stat.size > 100 * 1024 * 1024) { await fs.rm(archivePath,{force:true}); throw new Error("Source archive exceeds the 100 MB limit."); }
  await fs.rm(destination,{recursive:true,force:true});
  await fs.mkdir(destination,{recursive:true,mode:0o750});
  const directory = await unzipper.Open.file(archivePath);
  let total = 0;
  for (const entry of directory.files) {
    if (entry.type !== "File" && entry.type !== "Directory") throw new Error("Archive contains an unsupported entry type.");
    const normalized = entry.path.replaceAll("\\","/");
    if (normalized.startsWith("/") || normalized.split("/").some(part => part === "..") || normalized.includes("\0")) throw new Error("Archive contains an unsafe file path.");
    total += entry.uncompressedSize || 0;
    if (total > 300 * 1024 * 1024) throw new Error("Uncompressed source archive exceeds the 300 MB limit.");
    const target = path.resolve(destination,normalized);
    if (!target.startsWith(destination + path.sep) && target !== destination) throw new Error("Archive path escapes the service directory.");
    if (entry.type === "Directory") {
      await fs.mkdir(target,{recursive:true,mode:0o777});
      await fs.chmod(target,0o777);
    } else {
      await fs.mkdir(path.dirname(target),{recursive:true,mode:0o777});
      await fs.chmod(path.dirname(target),0o777);
      await pipeline(entry.stream(),createWriteStream(target,{mode:0o666}));
    }
  }
  await fs.rm(archivePath,{force:true});
  await fs.chmod(destination,0o777);
}
const imageFor = runtime => {
  if (runtime === "nodejs") return { image:"node:22-alpine", command:["sh","-lc","if [ -f package-lock.json ]; then npm ci --omit=dev --ignore-scripts --cache /tmp/.npm; elif [ -f package.json ]; then npm install --omit=dev --ignore-scripts --cache /tmp/.npm; fi; exec node index.js"] };
  if (runtime === "python") return { image:"python:3.12-alpine", command:["sh","-lc","if [ -f requirements.txt ]; then pip install --no-cache-dir --disable-pip-version-check --target /tmp/python-packages -r requirements.txt; fi; export PYTHONPATH=/tmp/python-packages; exec python main.py"] };
  throw new Error("This worker currently supports bot workloads using Node.js and Python only.");
};
async function ensureNetwork() {
  try { await docker.getNetwork("clouddock-egress").inspect(); }
  catch { await docker.createNetwork({Name:"clouddock-egress",Driver:"bridge",Internal:false,Options:{"com.docker.network.bridge.enable_icc":"false"}}); }
}
async function stopContainer(id) {
  if (!id) return;
  const container = docker.getContainer(id);
  try { await container.stop({t:10}); } catch (error) { if (error.statusCode !== 304 && error.statusCode !== 404) throw error; }
  try { await container.remove({force:true}); } catch (error) { if (error.statusCode !== 404) throw error; }
}
async function startService(service, env) {
  if (!service.source_object) throw new Error("Upload a ZIP source archive before deploying this service.");
  const dir = safeServiceDir(service.id);
  await downloadSource(service.source_download_url,dir);
  const {image,command} = imageFor(service.runtime);
  await new Promise((resolve,reject)=>docker.pull(image,(err,stream)=>err?reject(err):docker.modem.followProgress(stream,(e)=>e?reject(e):resolve())));
  const container = await docker.createContainer({
    Image:image,
    name:`clouddock-${service.id}`,
    Cmd:command,
    WorkingDir:"/workspace",
    User:"10001:10001",
    Env:Object.entries(env || {}).map(([key,value])=>`${key}=${value}`),
    HostConfig:{
      Binds:[`${dir}:/workspace:rw`],
      Memory:Math.max(128,Math.min(16384,service.memory_mb))*1024*1024,
      NanoCpus:Math.max(100,Math.min(8000,service.cpu_millicores))*1000000,
      PidsLimit:128,
      ReadonlyRootfs:true,
      CapDrop:["ALL"],
      SecurityOpt:["no-new-privileges:true"],
      NetworkMode:"clouddock-egress",
      Tmpfs:{"/tmp":"rw,noexec,nosuid,size=64m"},
      Init:true,
      RestartPolicy:{Name:"unless-stopped"},
    },
    Labels:{"com.clouddock.managed":"true","com.clouddock.service-id":service.id},
  });
  await container.start();
  return container.id;
}
async function execute(job,service,environment,sourceUrl) {
  const existing = service.container_id;
  if (job.action === "delete") {
    await stopContainer(existing);
    await fs.rm(safeServiceDir(service.id),{recursive:true,force:true});
    return null;
  }
  if (job.action === "stop") {
    await stopContainer(existing);
    return null;
  }
  if (job.action === "start" && existing) {
    const container = docker.getContainer(existing);
    try { await container.start(); return existing; } catch (error) { if (error.statusCode !== 404) throw error; }
  }
  if (existing) await stopContainer(existing);
  const serviceWithUrl = {...service,source_download_url:sourceUrl};
  return await startService(serviceWithUrl,environment);
}
async function processJob(job,service,environment,sourceUrl) {
  let containerId = null;
  const leaseHeartbeat = setInterval(() => {
    call("heartbeat").catch(error => console.error("Could not renew job lease:",error.message));
  }, 25000);
  try {
    containerId = await execute(job,service,environment,sourceUrl);
    await call("complete",{job_id:job.id,service_id:service.id,owner_id:job.owner_id,action:job.action,success:true,container_id:containerId});
    console.log("Completed",job.action,"for",service.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker operation failed";
    await call("complete",{job_id:job.id,service_id:service.id,owner_id:job.owner_id,action:job.action,success:false,error:message});
    console.error("Job failed:",message);
  } finally {
    clearInterval(leaseHeartbeat);
  }
}
async function monitorContainers() {
  const containers = await docker.listContainers({all:true,filters:{label:["com.clouddock.managed=true"]}});
  for (const item of containers) {
    if (item.State !== "exited" && item.State !== "dead") continue;
    const serviceId = item.Labels?.["com.clouddock.service-id"];
    if (!serviceId) continue;
    try {
      await call("report_state",{service_id:serviceId,status:"failed",message:"Workload exited unexpectedly. Check its logs on the worker host."});
      await docker.getContainer(item.Id).remove({force:true});
    } catch (error) { console.error("Could not report exited workload:",error.message); }
  }
}
async function mainLoop() {
  await fs.mkdir(dataRoot,{recursive:true,mode:0o750});
  await ensureNetwork();
  await register();
  while (!shuttingDown) {
    try {
      await call("heartbeat");
      if (Date.now() - lastReconcileAt > 30000) { await call("reconcile"); lastReconcileAt = Date.now(); }
      const result = await call("claim");
      if (result.job && result.service) await processJob(result.job,result.service,result.environment || {},result.source_download_url);
      else { await monitorContainers(); await new Promise(resolve=>setTimeout(resolve,4000)); }
    } catch (error) {
      console.error("Worker loop error:",error.message);
      await new Promise(resolve=>setTimeout(resolve,8000));
    }
  }
}
for (const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>{shuttingDown=true;});
mainLoop().catch(error=>{console.error(error);process.exitCode=1;});
