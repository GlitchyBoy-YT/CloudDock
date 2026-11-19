import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const authScreen = document.querySelector("#auth-screen");
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
  loginTab.classList.toggle("active", !signup);
  signupTab.classList.toggle("active", signup);
  confirmWrap.hidden = !signup;
  forgotButton.hidden = signup;
  passwordInput.autocomplete = signup ? "new-password" : "current-password";
  submitButton.textContent = signup ? "Create account" : "Log in";
  showMessage("");
}
loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));

function showAuthSetupError() {
  authScreen.hidden = false;
  dashboard.style.display = "none";
  showMessage("CloudDock authentication is not configured yet. Add your Supabase project URL and publishable anon key in assets/js/config.js, then run supabase/migrations/0001_accounts_and_apps.sql in your Supabase SQL editor.", true);
  submitButton.disabled = true;
  forgotButton.disabled = true;
}
async function loadOwnedApps(user) {
  const { data, error } = await supabase.from("apps")
    .select("id,name,platform,runtime,status,version")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data || []).map(app => ({
    id: app.id, name: app.name, platform: app.platform, runtime: app.runtime,
    status: app.status === "running" ? "online" : "stopped", version: app.version || "Not deployed"
  }));
  const serialized = JSON.stringify(rows);
  const previous = localStorage.getItem("clouddock-demo-apps");
  localStorage.setItem("clouddock-demo-apps", serialized);
  // Reload once when the account's database data differs from the stale browser demo cache.
  if (previous !== serialized) {
    window.location.reload();
    return;
  }
}
function showDashboard(user) {
  authScreen.hidden = true;
  dashboard.style.display = "grid";
  accountEmail.textContent = user.email || "Signed in";
}
async function handleSession(session) {
  if (!session?.user) {
    dashboard.style.display = "none";
    authScreen.hidden = false;
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
  showAuthSetupError();
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
      if (mode === "signup") {
        if (password !== confirmInput.value) throw new Error("The passwords do not match.");
        if (password.length < 10) throw new Error("Use at least 10 characters for your password.");
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + window.location.pathname }
        });
        if (error) throw error;
        if (!data.session) {
          showMessage("Account created. Check your email for the verification link, then return here to log in.");
          setMode("login");
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

  // Intercept the app form so records are saved under the signed-in user's RLS-protected account.
  document.addEventListener("submit", async event => {
    if (event.target.id !== "create-form") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = new FormData(event.target);
    const name = String(data.get("name") || "").trim();
    const platform = String(data.get("platform") || "");
    const runtime = String(data.get("runtime") || "");
    const allowedPlatforms = ["Discord", "Nerimity", "Fluxer", "Stoat"];
    const allowedRuntimes = ["Node.js", "Python", "Docker image (planned)"];
    if (!name || !allowedPlatforms.includes(platform) || !allowedRuntimes.includes(runtime)) return;
    const { data: created, error } = await supabase.from("apps").insert({
      name, platform, runtime, status: "stopped", version: "Not deployed"
    }).select("id,name,platform,runtime,status,version").single();
    if (error) {
      const toast = document.querySelector("#toast");
      toast.textContent = "Could not create application: " + error.message;
      toast.classList.add("show");
      return;
    }
    const current = JSON.parse(localStorage.getItem("clouddock-demo-apps") || "[]");
    current.unshift({ id: created.id, name: created.name, platform: created.platform, runtime: created.runtime, status: "stopped", version: created.version });
    localStorage.setItem("clouddock-demo-apps", JSON.stringify(current));
    event.target.reset();
    document.querySelector("#modal").classList.remove("open");
    location.hash = "applications";
    location.reload();
  }, true);

  supabase.auth.onAuthStateChange((_event, session) => {
    // Avoid Supabase callback lock re-entrancy: session hydration is scheduled outside callback.
    setTimeout(() => handleSession(session), 0);
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) showMessage(error.message, true);
    handleSession(data?.session);
  });
}
