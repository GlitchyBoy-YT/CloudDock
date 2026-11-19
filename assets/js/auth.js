import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const authScreen = document.querySelector("#auth-screen");
const publicSite = document.querySelector("#public-site");
const dashboard = document.querySelector("#dashboard-shell");
const form = document.querySelector("#auth-form");
const emailInput = document.querySelector("#auth-email");
const passwordInput = document.querySelector("#auth-password");
const confirmInput = document.querySelector("#auth-confirm");
const confirmWrap = document.querySelector("#confirm-wrap");
const submitButton = document.querySelector("#auth-submit");
const message = document.querySelector("#auth-message");
const loginTab = document.querySelector("#login-tab");
const signupTab = document.querySelector("#signup-tab");
const forgotButton = document.querySelector("#forgot-password");
const authTabs = document.querySelector(".auth-tabs");
const emailLabel = emailInput.closest("label");
const signOutButton = document.querySelector("#sign-out");
const accountEmail = document.querySelector("#account-email");

let mode = "login";
let busy = false;
const configured = SUPABASE_URL && SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("YOUR_PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}
function setMode(next) {
  mode = next;
  const signup = mode === "signup";
  const recovery = mode === "recovery";
  authTabs.hidden = recovery;
  emailLabel.hidden = recovery;
  loginTab.classList.toggle("active", !signup && !recovery);
  signupTab.classList.toggle("active", signup);
  confirmWrap.hidden = !signup && !recovery;
  forgotButton.hidden = signup || recovery;
  passwordInput.autocomplete = signup || recovery ? "new-password" : "current-password";
  submitButton.textContent = recovery ? "Update password" : signup ? "Create account" : "Log in";
  showMessage("");
}
loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));

function showAuthSetupError() {
  publicSite.hidden = true;
  authScreen.hidden = false;
  dashboard.style.display = "none";
  showMessage("CloudDock authentication is not configured yet. Add your Supabase project URL and publishable anon key in assets/js/config.js, then run supabase/migrations/0001_accounts_and_apps.sql in your Supabase SQL editor.", true);
  submitButton.disabled = true;
  forgotButton.disabled = true;
}
async function controlPlane(action, payload = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) throw new Error('Please sign in again.');
  const response = await fetch(SUPABASE_URL + '/functions/v1/control-plane', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sessionData.session.access_token },
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(result.error || ('Control plane error (' + response.status + ').'));
  return result;
}
async function loadOwnedApps(user) {
  const result = await controlPlane('list_services');
  const rows = (result.services || []).map(service => ({
    id: service.id, name: service.name,
    platform: service.platform ? service.platform[0].toUpperCase() + service.platform.slice(1) : service.service_type,
    runtime: service.runtime === 'nodejs' ? 'Node.js' : service.runtime === 'python' ? 'Python' : service.runtime,
    status: service.status === 'running' ? 'online' : 'stopped', version: service.status === 'running' ? 'Running' : service.status
  }));
  localStorage.setItem('clouddock-demo-apps', JSON.stringify(rows));
  window.clouddockServices = result.services || [];
  window.clouddockControlPlane = controlPlane;
  if (typeof window.draw === 'function') window.draw();
}
function showDashboard(user) {
  publicSite.hidden = true;
  authScreen.hidden = true;
  dashboard.style.display = "grid";
  accountEmail.textContent = user.email || "Signed in";
}
async function handleSession(session) {
  if (!session?.user) {
    dashboard.style.display = "none";
    authScreen.hidden = true;
    publicSite.hidden = false;
    accountEmail.textContent = "";
    return;
  }
  try {
    await loadOwnedApps(session.user);
    showDashboard(session.user);
    // Re-run the legacy renderer after the authenticated records have loaded.
    if (typeof window.draw === "function") window.draw();
  } catch (error) {
    showMessage("Could not load your applications: " + error.message, true);
    authScreen.hidden = false;
    dashboard.style.display = "none";
  }
}

if (!supabase) {
  document.addEventListener("clouddock:open-auth", showAuthSetupError);
} else {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    busy = true;
    submitButton.disabled = true;
    showMessage(mode === "signup" ? "Creating your account…" : "Signing you in…");
    try {
      if (mode === "recovery") {
        if (password !== confirmInput.value) throw new Error("The passwords do not match.");
        if (password.length < 10) throw new Error("Use at least 10 characters for your password.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        await supabase.auth.signOut();
        setMode("login");
        showMessage("Your password was updated. You can now log in with the new password.");
      } else if (mode === "signup") {
        if (password !== confirmInput.value) throw new Error("The passwords do not match.");
        if (password.length < 10) throw new Error("Use at least 10 characters for your password.");
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + window.location.pathname }
        });
        if (error) throw error;
        if (!data.session) {
          setMode("login");
          showMessage("Account created. Check your email for the verification link, then return here to log in.");
          return;
        }
        showMessage("Account created successfully.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      showMessage(error.message || "Authentication failed.", true);
    } finally {
      busy = false;
      submitButton.disabled = false;
    }
  });

  forgotButton.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) return showMessage("Enter your email address first.", true);
    showMessage("Sending password reset email…");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    showMessage(error ? error.message : "If an account exists for that address, a password reset email has been sent.", Boolean(error));
  });

  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    const { error } = await supabase.auth.signOut();
    if (error) showMessage(error.message, true);
    signOutButton.disabled = false;
  });

  // Create hosting services through the authenticated control plane.
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'create-form') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const data = new FormData(event.target);
    const name = String(data.get('name') || '').trim();
    const platform = String(data.get('platform') || '').toLowerCase();
    const runtimeLabel = String(data.get('runtime') || '');
    const runtime = runtimeLabel === 'Node.js' ? 'nodejs' : runtimeLabel === 'Python' ? 'python' : '';
    try {
      await controlPlane('create_service', { name, service_type:'bot', platform, runtime });
      event.target.reset(); document.querySelector('#modal').classList.remove('open'); location.hash='applications';
      await loadOwnedApps((await supabase.auth.getUser()).data.user);
      const toast=document.querySelector('#toast'); toast.textContent='Hosting service created. Upload a ZIP to deploy it.'; toast.classList.add('show');
    } catch (error) { const toast=document.querySelector('#toast'); toast.textContent=error.message; toast.classList.add('show'); }
  }, true);

  document.addEventListener('click', async event => {
    const button=event.target.closest('[data-service-action]'); if(!button) return;
    button.disabled=true;
    try {
      await controlPlane('service_action',{service_id:button.dataset.serviceId,operation:button.dataset.serviceAction});
      const toast=document.querySelector('#toast'); toast.textContent='Operation queued for a hosting worker.'; toast.classList.add('show');
      await loadOwnedApps((await supabase.auth.getUser()).data.user);
    } catch(error) { const toast=document.querySelector('#toast'); toast.textContent=error.message; toast.classList.add('show'); }
    finally { button.disabled=false; }
  });

  document.addEventListener('click', async event => {
    const button=event.target.closest('[data-service-secrets]'); if(!button) return;
    const name=window.prompt('Environment variable name (example: DISCORD_TOKEN):'); if(!name) return;
    const value=window.prompt('Enter the secret value. It is encrypted before storage and cannot be viewed again:'); if(!value) return;
    button.disabled=true;
    try {
      await controlPlane('set_secret',{service_id:button.dataset.serviceSecrets,name,value});
      const toast=document.querySelector('#toast'); toast.textContent='Environment secret saved securely.'; toast.classList.add('show');
    } catch(error) { const toast=document.querySelector('#toast'); toast.textContent=error.message; toast.classList.add('show'); }
    finally { button.disabled=false; }
  });

  document.addEventListener('change', async event => {
    const input=event.target.closest('[data-service-source]'); if(!input || !input.files?.[0]) return;
    const file=input.files[0];
    if(!file.name.toLowerCase().endsWith('.zip') || file.size>100*1024*1024) { const toast=document.querySelector('#toast'); toast.textContent='Choose a ZIP archive no larger than 100 MB.'; toast.classList.add('show'); input.value=''; return; }
    input.disabled=true;
    try {
      const signed=await controlPlane('create_upload_url',{service_id:input.dataset.serviceSource});
      const upload=await fetch(signed.upload_url,{method:'PUT',headers:{'Content-Type':'application/zip','x-upsert':'false'},body:file});
      if(!upload.ok) throw new Error('Source upload failed. Check the private service-source bucket setup.');
      await controlPlane('service_action',{service_id:input.dataset.serviceSource,operation:'deploy'});
      const toast=document.querySelector('#toast'); toast.textContent='Source uploaded and deployment queued.'; toast.classList.add('show');
      await loadOwnedApps((await supabase.auth.getUser()).data.user);
    } catch(error) { const toast=document.querySelector('#toast'); toast.textContent=error.message; toast.classList.add('show'); }
    finally { input.disabled=false; input.value=''; }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    // Password recovery links create a temporary session; let the user choose a new password.
    if (event === "PASSWORD_RECOVERY") {
      setMode("recovery");
      authScreen.hidden = false;
      dashboard.style.display = "none";
      showMessage("Choose a new password for your CloudDock account.");
      return;
    }
    // Avoid Supabase callback lock re-entrancy: session hydration is scheduled outside callback.
    setTimeout(() => handleSession(session), 0);
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) showMessage(error.message, true);
    handleSession(data?.session);
  });
}
