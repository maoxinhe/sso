import { exportPublicJwk, timingSafeEqual, verifyJwt } from "./crypto.js";
import { AuthService, setSessionCookie, clearSessionCookie, validatePasswordStrength, hashPassword, verifyPassword, resolveAccountEmail } from "./auth.js";
import { OidcService, parsePrivateJwk } from "./oidc-service.js";
import {
  renderDashboard, renderUsers, renderUserForm, renderApps, renderAppForm,
  renderInvites, renderInviteForm, renderAudit, renderAccount, escapeHtml,
  renderAListSSO,
} from "./admin-ui.js";
import { randomUrlSafe } from "./crypto.js";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function createApp({ store, config, env, turnstileFetch = (...args) => globalThis.fetch(...args) }) {
  const auth = new AuthService({ store, config });
  const oidc = new OidcService({ store, config });
  const turnstile = new TurnstileService({ config, turnstileFetch });

  return {
    async fetch(request) {
      const url = new URL(request.url);
      try {
        // ---------- Public: OIDC discovery & well-known ----------
        if (request.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
          return json(oidc.getDiscoveryMetadata());
        }
        if (request.method === "GET" && url.pathname === "/jwks.json") {
          const jwk = await exportPublicJwk(requirePrivateJwk(config));
          return json({ keys: [jwk] }, { headers: { "content-type": "application/jwk-set+json; charset=utf-8" } });
        }

        // ---------- Public: root ----------
        if (request.method === "GET" && url.pathname === "/") {
          return handleRoot(request, auth, config);
        }

        // ---------- Admin routes ----------
        if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
          return handleAdminRoutes(request, { store, config, auth, url });
        }

        // ---------- Admin Session Login ----------
        if (request.method === "GET" && url.pathname === "/admin-login") {
          return handleAdminLoginPage(request, config, url, null);
        }
        if (request.method === "POST" && url.pathname === "/admin-login") {
          return handleAdminLoginPost(request, auth, config, turnstile);
        }

        // ---------- OIDC Authorize (login page for OIDC flow) ----------
        if (request.method === "GET" && url.pathname === "/authorize") {
          return handleAuthorize(request, url, auth, oidc, config);
        }
        if (request.method === "GET" && url.pathname === "/register") {
          return handleRegisterPage(request, url, oidc, config);
        }
        if (request.method === "POST" && url.pathname === "/login") {
          return await handleOidcLoginPost(request, auth, oidc, turnstile, config);
        }
        if (request.method === "POST" && url.pathname === "/register") {
          return await handleOidcRegisterPost(request, auth, oidc, turnstile, config);
        }

        // ---------- OIDC Token & UserInfo ----------
        if (request.method === "POST" && url.pathname === "/token") {
          return await handleToken(request, oidc);
        }
        if (request.method === "GET" && url.pathname === "/userinfo") {
          return await handleUserInfo(request, oidc, config);
        }

        // ---------- AList One-Click SSO ----------
        if (request.method === "GET" && url.pathname === "/alist-sso") {
          return handleAListSSO(request, auth, config);
        }

        // ---------- Legacy API endpoints (admin bearer auth) ----------
        if (request.method === "POST" && url.pathname === "/api/login") {
          return await handleApiLogin(request, auth, oidc, config);
        }
        if (request.method === "POST" && url.pathname === "/api/register") {
          return await handleApiRegister(request, auth, oidc, config);
        }
        if (url.pathname === "/admin/invite-codes") {
          // Legacy endpoint
          return await handleLegacyInviteAdmin(request, store, config);
        }

        return html404();
      } catch (error) {
        console.error("Request failed", { path: url.pathname, message: getErrorMessage(error) });
        return errorResponse(error, request);
      }
    },
  };
}

// ============================================================
// ROOT
// ============================================================
async function handleRoot(request, auth, config) {
  // Already logged in admin: redirect to dashboard
  const ctx = await auth.getSessionFromRequest(request);
  if (ctx?.user?.isAdmin) return redirectResponse("/admin");
  if (ctx?.user) {
    // Logged in regular user: show a simple landing page with apps list
    return html(renderUserLanding({ user: ctx.user, issuer: config.issuer }));
  }
  if (config.openaiLoginUrl) return redirectResponse(config.openaiLoginUrl);
  return redirectResponse("/admin-login");
}

function renderUserLanding({ user, issuer }) {
  const initial = (user.email || "?").charAt(0).toUpperCase();
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SSO · ${escapeHtml(stripHost(issuer))}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7fb;font-family:system-ui,-apple-system,sans-serif;color:#0f172a;padding:24px}
.card{width:min(440px,100%);background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.top{display:flex;align-items:center;gap:14px;margin-bottom:20px}
.avatar{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;display:grid;place-items:center;font-size:22px;font-weight:700}
h1{margin:0;font-size:20px}
.sub{color:#64748b;font-size:13px;margin-top:2px}
.row{display:flex;gap:8px;margin-top:18px}
.btn{flex:1;display:block;text-align:center;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px}
.btn.primary{background:#3b82f6;color:#fff}
.btn.ghost{background:#f1f5f9;color:#0f172a}
.btn:hover{filter:brightness(.98)}
</style>
</head>
<body>
<div class="card">
  <div class="top">
    <div class="avatar">${escapeHtml(initial)}</div>
    <div>
      <h1>你好, ${escapeHtml(user.displayName || user.email)}</h1>
      <div class="sub">${escapeHtml(user.email)}</div>
    </div>
  </div>
  <div class="row">
    ${user.isAdmin ? `<a class="btn primary" href="/admin">管理后台</a>` : ""}
    <form method="post" action="/admin/logout" style="flex:1"><button class="btn ghost" style="width:100%;border:0;cursor:pointer;font-family:inherit">退出登录</button></form>
  </div>
</div>
</body>
</html>`;
}

function stripHost(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

// ============================================================
// ADMIN SESSION LOGIN
// ============================================================
function handleAdminLoginPage(request, config, url, flash) {
  const msg = flash?.message;
  const msgType = flash?.type || "info";
  const redirect = url.searchParams.get("redirect") || "/admin";
  return html(renderAdminLogin({ issuer: config.issuer, redirect, msg, msgType, turnstileSiteKey: config.turnstileSiteKey }));
}

function renderAdminLogin({ issuer, redirect, msg, msgType, turnstileSiteKey }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>登录 · SSO 管理后台</title>
<style>
:root{--primary:#3b82f6;--primary-hover:#2563eb;--text:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#f6f7fb;--error:#ef4444;--warn:#f59e0b}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(1200px 600px at 10% -10%,#dbeafe 0,transparent 60%),radial-gradient(900px 500px at 100% 0%,#f3e8ff 0,transparent 60%),var(--bg);font-family:system-ui,-apple-system,sans-serif;color:var(--text);padding:20px}
.card{width:min(420px,100%);background:#fff;border:1px solid var(--border);border-radius:16px;padding:32px 28px;box-shadow:0 10px 30px -10px rgba(0,0,0,.1)}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.logo{width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:grid;place-items:center;color:#fff;font-size:20px}
.brand h1{margin:0;font-size:18px}.brand p{margin:2px 0 0;font-size:12px;color:var(--muted)}
label{display:block;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
input{width:100%;padding:11px 13px;border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;background:#fcfcfd}
input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(59,130,246,.12);background:#fff}
.field{margin-bottom:14px}
button{width:100%;padding:12px;border:0;border-radius:10px;background:var(--primary);color:#fff;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit;margin-top:4px}
button:hover{background:var(--primary-hover)}
.alert{padding:10px 14px;border-radius:10px;margin-bottom:16px;font-size:13px}
.alert.error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
.alert.warn{background:#fffbeb;color:#92400e;border:1px solid #fde68a}
.hint{margin-top:16px;text-align:center;font-size:12px;color:var(--muted)}
a{color:var(--primary);text-decoration:none}a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="card">
  <div class="brand">
    <div class="logo">🔐</div>
    <div><h1>SSO Console</h1><p>${escapeHtml(stripHost(issuer))}</p></div>
  </div>
  ${msg ? `<div class="alert ${msgType}">${escapeHtml(msg)}</div>` : ""}
  <form method="post" action="/admin-login">
    <input type="hidden" name="redirect" value="${escapeHtml(redirect)}">
    <div class="field">
      <label>邮箱或账号</label>
      <input type="text" name="account" autocomplete="username" required autofocus>
    </div>
    <div class="field">
      <label>密码</label>
      <input type="password" name="password" autocomplete="current-password" required>
    </div>
    ${renderTurnstile(turnstileSiteKey, "admin-login")}
    <button type="submit">登录管理后台</button>
  </form>
  <div class="hint">只有管理员可以登录此界面。</div>
</div>
${renderTurnstileScript(turnstileSiteKey)}
</body>
</html>`;
}

async function handleAdminLoginPost(request, auth, config, turnstile) {
  const form = await request.formData();
  const account = String(form.get("account") ?? "");
  const password = String(form.get("password") ?? "");
  const redirect = String(form.get("redirect") ?? "/admin");
  const ua = request.headers.get("user-agent");
  const ip = getClientIp(request);
  try {
    await turnstile.verifyForm(request, form);
    const { user } = await auth.loginWithPassword({ account, password, userAgent: ua, ipAddress: ip });
    if (!user.isAdmin) {
      // Fallback: check if user email is in ADMIN_EMAILS list → promote first time
      const { isAdminEmail } = await import("./config.js");
      if (isAdminEmail(config, user.email)) {
        user.isAdmin = true;
        await auth.store.updateUser(user.email, { isAdmin: true });
      } else {
        throw new Error("该账号没有管理员权限");
      }
    }
    const session = await auth.createSession(user, { userAgent: ua, ipAddress: ip });
    const headers = new Headers({ location: safeRedirect(redirect, "/admin") });
    setSessionCookie(headers, session.token, { issuer: config.issuer, secure: true, ttlSeconds: config.sessionTtlSeconds });
    return new Response(null, { status: 302, headers });
  } catch (err) {
    return handleAdminLoginPage(request, config, new URL(request.url + (request.url.includes("?") ? "&" : "?") + "_=t"), { type: "error", message: err.message });
  }
}

// ============================================================
// ADMIN ROUTES (require session + admin)
// ============================================================
async function handleAdminRoutes(request, { store, config, auth, url }) {
  const adminCtx = await auth.validateAdmin(request);
  if (!adminCtx) {
    // redirect to admin login with return URL
    if (request.method === "GET") {
      return redirectResponse("/admin-login?redirect=" + encodeURIComponent(url.pathname + url.search));
    }
    return json({ error: "未授权" }, { status: 401 });
  }
  const currentUser = adminCtx.user;

  // POST routes (forms)
  if (request.method === "POST") {
    return handleAdminPostRoutes(request, { store, config, auth, currentUser });
  }

  // GET routes - dashboard & sections
  const p = url.pathname;
  if (p === "/admin" || p === "/admin/") {
    const stats = await store.getStats();
    const recentUsers = await store.listUsers(6);
    const recentLogs = await store.listAuditLogs(8);
    return html(renderDashboard({ user: currentUser, issuer: config.issuer, stats, recentUsers, recentLogs }));
  }

  if (p === "/admin/users") {
    const users = await store.listUsers(200);
    return html(renderUsers({ user: currentUser, issuer: config.issuer, users, flash: getFlash(url) }));
  }
  if (p === "/admin/users/new") {
    return html(renderUserForm({ user: currentUser, issuer: config.issuer, target: null, mode: "new", flash: getFlash(url) }));
  }
  if (p.startsWith("/admin/users/")) {
    const email = decodeURIComponent(p.slice("/admin/users/".length));
    const target = await store.getUserByEmail(email);
    if (!target) return html404();
    return html(renderUserForm({ user: currentUser, issuer: config.issuer, currentUser, target, mode: "edit", flash: getFlash(url) }));
  }

  if (p === "/admin/apps") {
    const apps = await store.listApps(200);
    return html(renderApps({ user: currentUser, issuer: config.issuer, apps, flash: getFlash(url) }));
  }
  if (p === "/admin/apps/new") {
    return html(renderAppForm({ user: currentUser, issuer: config.issuer, target: null, mode: "new", flash: getFlash(url) }));
  }
  if (p.startsWith("/admin/apps/")) {
    const cid = decodeURIComponent(p.slice("/admin/apps/".length));
    const target = await store.getAppByClientId(cid);
    if (!target) return html404();
    return html(renderAppForm({
      user: currentUser, issuer: config.issuer, target, mode: "edit", flash: getFlash(url),
      endpointHelp: {
        issuer: config.issuer,
        authorizationEndpoint: `${config.issuer}/authorize`,
        tokenEndpoint: `${config.issuer}/token`,
        userinfoEndpoint: `${config.issuer}/userinfo`,
        jwksUri: `${config.issuer}/jwks.json`,
        discoveryUri: `${config.issuer}/.well-known/openid-configuration`,
      },
    }));
  }

  if (p === "/admin/invites") {
    const invites = await store.listInviteCodes(200);
    return html(renderInvites({ user: currentUser, issuer: config.issuer, invites, flash: getFlash(url) }));
  }
  if (p === "/admin/invites/new") {
    return html(renderInviteForm({ user: currentUser, issuer: config.issuer, flash: getFlash(url) }));
  }

  if (p === "/admin/audit") {
    const logs = await store.listAuditLogs(200);
    return html(renderAudit({ user: currentUser, issuer: config.issuer, logs }));
  }

  if (p === "/admin/account") {
    const sessions = currentUser?.id ? await store.listSessionsByUserId(currentUser.id) : [];
    return html(renderAccount({ user: currentUser, issuer: config.issuer, sessions, flash: getFlash(url) }));
  }

  return html404();
}

async function handleAdminPostRoutes(request, { store, config, auth, currentUser }) {
  const url = new URL(request.url);
  const p = url.pathname;
  const ua = request.headers.get("user-agent");
  const ip = getClientIp(request);

  const redirectWithFlash = (to, type, message) => {
    const sep = to.includes("?") ? "&" : "?";
    const flash = message ? encodeURIComponent(message) : "";
    return redirectResponse(`${to}${sep}flash_type=${type || "info"}&flash=${flash}`);
  };

  // Logout (works for regular sessions too)
  if (p === "/admin/logout") {
    await auth.logoutSession(request);
    const headers = new Headers({ location: "/" });
    clearSessionCookie(headers, { issuer: config.issuer });
    return new Response(null, { status: 302, headers });
  }

  if (!currentUser?.isAdmin) {
    return json({ error: "需要管理员权限" }, { status: 403 });
  }

  // ---------- Users ----------
  if (p === "/admin/users/new") {
    const form = await request.formData();
    const email = String(form.get("email") ?? "");
    const displayName = String(form.get("display_name") ?? "");
    const password = String(form.get("password") ?? "");
    const inviteCode = String(form.get("invite_code") ?? "") || null;
    const isAdmin = form.get("is_admin") === "1";
    const isActive = form.get("is_active") === "1";
    const emailVerified = form.get("email_verified") === "1";
    const strengthErr = validatePasswordStrength(password);
    if (strengthErr) return redirectWithFlash("/admin/users/new", "error", strengthErr);
    try {
      const passwordHash = await hashPassword(password);
      const user = await store.createUser({ email, displayName, passwordHash, inviteCode, isAdmin, emailVerified });
      if (!isActive) await store.updateUser(user.email, { isActive: false });
      await store.addAuditLog({ userId: currentUser.id, email: currentUser.email, action: "admin.user.create", targetType: "user", targetId: user.email, ipAddress: ip, userAgent: ua });
      return redirectWithFlash("/admin/users", "info", `已创建用户 ${user.email}`);
    } catch (e) {
      return redirectWithFlash("/admin/users/new", "error", e.message);
    }
  }

  if (p.startsWith("/admin/users/") && p.endsWith("/delete")) {
    const email = decodeURIComponent(p.slice("/admin/users/".length, -"/delete".length));
    await store.deleteSessionsByUserId((await store.getUserByEmail(email))?.id ?? 0);
    await store.deleteUser(email);
    await store.addAuditLog({ userId: currentUser.id, email: currentUser.email, action: "admin.user.delete", targetType: "user", targetId: email, ipAddress: ip, userAgent: ua });
    return redirectWithFlash("/admin/users", "info", `已删除用户 ${email}`);
  }

  if (p.startsWith("/admin/users/") && !p.includes("/sessions/")) {
    const email = decodeURIComponent(p.slice("/admin/users/".length));
    const form = await request.formData();
    const updates = {
      displayName: String(form.get("display_name") ?? ""),
      isAdmin: form.get("is_admin") === "1",
      isActive: form.get("is_active") === "1",
      emailVerified: form.get("email_verified") === "1",
    };
    const newPassword = String(form.get("password") ?? "");
    if (newPassword) {
      const err = validatePasswordStrength(newPassword);
      if (err) return redirectWithFlash(`/admin/users/${encodeURIComponent(email)}`, "error", err);
      updates.passwordHash = await hashPassword(newPassword);
    }
    await store.updateUser(email, updates);
    if (updates.isActive === false) {
      await store.deleteSessionsByUserId((await store.getUserByEmail(email))?.id ?? 0);
    }
    await store.addAuditLog({ userId: currentUser.id, email: currentUser.email, action: "admin.user.update", targetType: "user", targetId: email, details: Object.keys(updates), ipAddress: ip, userAgent: ua });
    return redirectWithFlash(`/admin/users/${encodeURIComponent(email)}`, "info", "已保存更改");
  }

  // ---------- Apps ----------
  if (p === "/admin/apps/new") {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    if (!name) return redirectWithFlash("/admin/apps/new", "error", "应用名为必填");
    const clientId = String(form.get("client_id") ?? "").trim() || `app_${randomUrlSafe(10).toLowerCase()}`;
    const clientSecret = String(form.get("client_secret") ?? "").trim() || randomUrlSafe(32);
    const description = String(form.get("description") ?? "");
    const redirectUris = String(form.get("redirect_uris") ?? "").split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const scopes = String(form.get("scopes") ?? "").split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    if (!redirectUris.length) return redirectWithFlash("/admin/apps/new", "error", "至少配置一个回调 URL");
    try {
      await store.createApp({
        clientId, clientSecret, name, description,
        redirectUris, scopes: scopes.length ? scopes : ["openid", "email", "profile"],
        isActive: form.get("is_active") === "1",
        isPublic: form.get("is_public") === "1",
        createdBy: currentUser.email,
      });
      await store.addAuditLog({ userId: currentUser.id, email: currentUser.email, action: "admin.app.create", targetType: "app", targetId: clientId, ipAddress: ip, userAgent: ua });
      return redirectWithFlash("/admin/apps", "info", `已创建应用 ${name}`);
    } catch (e) {
      return redirectWithFlash("/admin/apps/new", "error", e.message);
    }
  }

  if (p.startsWith("/admin/apps/") && p.endsWith("/delete")) {
    const cid = decodeURIComponent(p.slice("/admin/apps/".length, -"/delete".length));
    await store.deleteApp(cid);
    await store.addAuditLog({ userId: currentUser.id, email: currentUser.email, action: "admin.app.delete", targetType: "app", targetId: cid, ipAddress: ip, userAgent: ua });
    return redirectWithFlash("/admin/apps", "info", "应用已删除");
  }

  if (p.startsWith("/admin/apps/")) {
    const cid = decodeURIComponent(p.slice("/admin/apps/".length));
    const form = await request.formData();
    const existing = await store.getAppByClientId(cid);
    if (!existing) return redirectWithFlash("/admin/apps", "error", "应用不存在");
    const updates = {
      name: String(form.get("name") ?? existing.name),
      description: String(form.get("description") ?? ""),
      isActive: form.get("is_active") === "1",
      isPublic: form.get("is_public") === "1",
    };
    const newSecret = String(form.get("client_secret") ?? "").trim();
    if (newSecret) updates.clientSecret = newSecret;
    const redirectUris = String(form.get("redirect_uris") ?? "").split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (redirectUris.length) updates.redirectUris = redirectUris;
    const scopes = String(form.get("scopes") ?? "").split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    if (scopes.length) updates.scopes = scopes;
    await store.updateApp(cid, updates);
    await store.addAuditLog({ userId: currentUser.id, email: currentUser.email, action: "admin.app.update", targetType: "app", targetId: cid, details: Object.keys(updates), ipAddress: ip, userAgent: ua });
    return redirectWithFlash(`/admin/apps/${encodeURIComponent(cid)}`, "info", "已保存更改");
  }

  // ---------- Invites ----------
  if (p === "/admin/invites/new") {
    const form = await request.formData();
    let code = String(form.get("code") ?? "").trim();
    const maxUses = Number(form.get("max_uses") ?? 100) || 100;
    const expiresAtInput = String(form.get("expires_at") ?? "").trim();
    const expiresAt = expiresAtInput ? new Date(expiresAtInput).toISOString() : null;
    if (!code) code = `INVITE-${randomUrlSafe(6).toUpperCase()}`;
    await store.createInviteCode({ code, maxUses, enabled: true, createdBy: currentUser.email, expiresAt });
    await store.addAuditLog({ userId: currentUser.id, email: currentUser.email, action: "admin.invite.create", targetType: "invite", targetId: code, details: { maxUses }, ipAddress: ip, userAgent: ua });
    return redirectWithFlash("/admin/invites", "info", `已创建邀请码 ${code}`);
  }

  if (p.startsWith("/admin/invites/") && p.endsWith("/toggle")) {
    const code = decodeURIComponent(p.slice("/admin/invites/".length, -"/toggle".length));
    const existing = await store.getInviteCode(code);
    if (existing) {
      await store.updateInviteCode(code, { enabled: !existing.enabled });
      await store.addAuditLog({ userId: currentUser.id, email: currentUser.email, action: "admin.invite.toggle", targetType: "invite", targetId: code, details: { enabled: !existing.enabled }, ipAddress: ip, userAgent: ua });
    }
    return redirectResponse("/admin/invites");
  }

  if (p.startsWith("/admin/invites/") && p.endsWith("/delete")) {
    const code = decodeURIComponent(p.slice("/admin/invites/".length, -"/delete".length));
    await store.deleteInviteCode(code);
    await store.addAuditLog({ userId: currentUser.id, email: currentUser.email, action: "admin.invite.delete", targetType: "invite", targetId: code, ipAddress: ip, userAgent: ua });
    return redirectWithFlash("/admin/invites", "info", "邀请码已删除");
  }

  // ---------- Account ----------
  if (p === "/admin/account/password") {
    const form = await request.formData();
    const curPw = String(form.get("current_password") ?? "");
    const newPw = String(form.get("new_password") ?? "");
    const confirm = String(form.get("new_password_confirm") ?? "");
    const u = await store.getUserByEmail(currentUser.email);
    if (!u || !(await verifyPassword(curPw, u.passwordHash || ""))) {
      return redirectWithFlash("/admin/account", "error", "当前密码不正确");
    }
    if (newPw !== confirm) return redirectWithFlash("/admin/account", "error", "两次输入的新密码不一致");
    const strengthErr = validatePasswordStrength(newPw);
    if (strengthErr) return redirectWithFlash("/admin/account", "error", strengthErr);
    await store.updateUser(u.email, { passwordHash: await hashPassword(newPw) });
    await store.addAuditLog({ userId: currentUser.id, email: currentUser.email, action: "account.password_change", ipAddress: ip, userAgent: ua });
    return redirectWithFlash("/admin/account", "info", "密码已更新");
  }

  if (p.startsWith("/admin/account/sessions/") && p.endsWith("/delete")) {
    const token = decodeURIComponent(p.slice("/admin/account/sessions/".length, -"/delete".length));
    await store.deleteSession(token);
    return redirectWithFlash("/admin/account", "info", "会话已终止");
  }

  return html404();
}

// ============================================================
// OIDC AUTHORIZE (SSO Login for applications)
// ============================================================
async function handleAuthorize(request, url, auth, oidc, config) {
  const authRequest = await oidc.validateAuthorizeRequest(url.searchParams);
  // If user already has a valid session, skip login and issue code directly
  const ctx = await auth.getSessionFromRequest(request);
  if (ctx?.user?.isActive) {
    return issueCodeRedirect({ user: ctx.user, authRequest, oidc });
  }
  return html(renderOidcLogin({ authRequest, config, errorMsg: null }));
}

function handleRegisterPage(request, url, oidc, config) {
  return oidc.validateAuthorizeRequest(url.searchParams).then((authRequest) =>
    html(renderOidcRegister({ authRequest, config, errorMsg: null }))
  );
}

async function handleOidcLoginPost(request, auth, oidc, turnstile, config) {
  const { form, authRequest } = await parseOidcAuthForm(request, oidc);
  await turnstile.verifyForm(request, form);
  const account = String(form.get("account") ?? "");
  const password = String(form.get("password") ?? "");
  const inviteCode = String(form.get("invite_code") ?? "");
  const ua = request.headers.get("user-agent");
  const ip = getClientIp(request);

  let userResult;
  try {
    if (password) {
      userResult = await auth.loginWithPassword({ account, password, userAgent: ua, ipAddress: ip });
    } else if (inviteCode) {
      userResult = await auth.loginWithInviteOnly({ account, inviteCode, userAgent: ua, ipAddress: ip });
    } else {
      throw new Error("请输入密码或邀请码");
    }
  } catch (e) {
    return html(renderOidcLogin({ authRequest, config, errorMsg: e.message, account }));
  }
  // Create session cookie for next time
  const session = await auth.createSession(userResult.user, { userAgent: ua, ipAddress: ip });
  const response = await issueCodeRedirect({ user: userResult.user, authRequest, oidc });
  setSessionCookie(response.headers, session.token, { issuer: config.issuer, ttlSeconds: config.sessionTtlSeconds });
  return response;
}

async function handleOidcRegisterPost(request, auth, oidc, turnstile, config) {
  const { form, authRequest } = await parseOidcAuthForm(request, oidc);
  await turnstile.verifyForm(request, form);
  const account = String(form.get("account") ?? "");
  const inviteCode = String(form.get("invite_code") ?? "");
  const displayName = String(form.get("display_name") ?? "");
  const password = String(form.get("password") ?? "");
  const ua = request.headers.get("user-agent");
  const ip = getClientIp(request);
  if (!inviteCode) return html(renderOidcRegister({ authRequest, config, errorMsg: "请输入邀请码", account, displayName }));
  if (password) {
    const err = validatePasswordStrength(password);
    if (err) return html(renderOidcRegister({ authRequest, config, errorMsg: err, account, displayName }));
  }
  try {
    const { user } = await auth.registerWithInvite({ account, displayName, password, inviteCode, userAgent: ua, ipAddress: ip });
    const session = await auth.createSession(user, { userAgent: ua, ipAddress: ip });
    const response = await issueCodeRedirect({ user, authRequest, oidc });
    setSessionCookie(response.headers, session.token, { issuer: config.issuer, ttlSeconds: config.sessionTtlSeconds });
    return response;
  } catch (e) {
    return html(renderOidcRegister({ authRequest, config, errorMsg: e.message, account, displayName }));
  }
}

async function parseOidcAuthForm(request, oidc) {
  const form = await request.formData();
  const authRequest = {
    clientId: String(form.get("client_id") ?? ""),
    redirectUri: String(form.get("redirect_uri") ?? ""),
    scope: String(form.get("scope") ?? "openid email"),
    state: String(form.get("state") ?? ""),
    nonce: String(form.get("nonce") ?? ""),
    codeChallenge: String(form.get("code_challenge") ?? ""),
    codeChallengeMethod: String(form.get("code_challenge_method") ?? ""),
  };
  await oidc.validateAuthorizeRequest(new URLSearchParams({
    client_id: authRequest.clientId, redirect_uri: authRequest.redirectUri,
    response_type: "code", scope: authRequest.scope,
  }));
  return { form, authRequest };
}

async function issueCodeRedirect({ user, authRequest, oidc }) {
  const code = await oidc.createAuthorizationCode({
    user,
    clientId: authRequest.clientId,
    redirectUri: authRequest.redirectUri,
    scope: authRequest.scope,
    nonce: authRequest.nonce,
    codeChallenge: authRequest.codeChallenge,
    codeChallengeMethod: authRequest.codeChallengeMethod,
  });
  const redirect = new URL(authRequest.redirectUri);
  redirect.searchParams.set("code", code.code);
  if (authRequest.state) redirect.searchParams.set("state", authRequest.state);
  return redirectResponse(redirect.toString());
}

// ============================================================
// OIDC TOKEN / USERINFO
// ============================================================
async function handleToken(request, oidc) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");
  if (grantType !== "authorization_code") {
    return oauthError("unsupported_grant_type", "仅支持 authorization_code", 400);
  }
  const credentials = parseClientCredentials(request, form);
  try {
    const token = await oidc.exchangeCode({
      code: String(form.get("code") ?? ""),
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: String(form.get("redirect_uri") ?? ""),
      codeVerifier: String(form.get("code_verifier") ?? ""),
    });
    return json(token, { headers: { "cache-control": "no-store", "pragma": "no-cache" } });
  } catch (e) {
    return oauthError("invalid_grant", e.message, 400);
  }
}

async function handleUserInfo(request, oidc, config) {
  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "缺少 Bearer token" }, { status: 401 });
  try {
    const claims = await verifyJwt(match[1], requirePrivateJwk(config));
    const info = await oidc.getUserInfoById(claims.sub);
    return json(info);
  } catch (e) {
    return json({ error: e.message || "token 无效" }, { status: 401 });
  }
}

function parseClientCredentials(request, form) {
  const header = request.headers.get("authorization") ?? "";
  const basic = header.match(/^Basic\s+(.+)$/i);
  if (basic) {
    const decoded = atob(basic[1]);
    const [clientId, clientSecret] = decoded.split(":");
    return { clientId, clientSecret };
  }
  return {
    clientId: String(form.get("client_id") ?? ""),
    clientSecret: String(form.get("client_secret") ?? ""),
  };
}

// ============================================================
// LEGACY API
// ============================================================
async function handleApiLogin(request, auth, oidc, config) {
  if (!(await isAdminRequest(request, config))) return json({ error: "未授权" }, { status: 401 });
  const body = await request.json();
  const account = body.account;
  if (!account) return json({ error: "缺少 account 参数" }, { status: 400 });
  const { user } = body.password
    ? await auth.loginWithPassword({ account, password: body.password, ipAddress: getClientIp(request) })
    : await auth.loginWithInviteOnly({ account, inviteCode: body.invite_code, ipAddress: getClientIp(request) });
  const authRequest = {
    clientId: body.client_id ?? config.legacyClientId,
    redirectUri: body.redirect_uri ?? (config.legacyRedirectUris[0] || ""),
    scope: body.scope ?? "openid email",
    state: body.state ?? "",
    nonce: body.nonce ?? "",
    codeChallenge: body.code_challenge ?? "",
    codeChallengeMethod: body.code_challenge_method ?? "",
  };
  await oidc.validateAuthorizeRequest(new URLSearchParams({
    client_id: authRequest.clientId, redirect_uri: authRequest.redirectUri,
    response_type: "code", scope: authRequest.scope,
  }));
  const code = await oidc.createAuthorizationCode({ user, ...authRequest });
  const redirect = new URL(authRequest.redirectUri);
  redirect.searchParams.set("code", code.code);
  if (authRequest.state) redirect.searchParams.set("state", authRequest.state);
  return json({ code: code.code, redirect_uri: redirect.toString(), user });
}

async function handleApiRegister(request, auth, oidc, config) {
  if (!(await isAdminRequest(request, config))) return json({ error: "未授权" }, { status: 401 });
  const body = await request.json();
  if (!body.account || !body.invite_code) return json({ error: "缺少 account 或 invite_code" }, { status: 400 });
  const { user } = await auth.registerWithInvite({
    account: body.account,
    displayName: body.display_name,
    password: body.password,
    inviteCode: body.invite_code,
    ipAddress: getClientIp(request),
  });
  const authRequest = {
    clientId: body.client_id ?? config.legacyClientId,
    redirectUri: body.redirect_uri ?? (config.legacyRedirectUris[0] || ""),
    scope: body.scope ?? "openid email",
    state: body.state ?? "",
    nonce: body.nonce ?? "",
    codeChallenge: body.code_challenge ?? "",
    codeChallengeMethod: body.code_challenge_method ?? "",
  };
  await oidc.validateAuthorizeRequest(new URLSearchParams({
    client_id: authRequest.clientId, redirect_uri: authRequest.redirectUri,
    response_type: "code", scope: authRequest.scope,
  }));
  const code = await oidc.createAuthorizationCode({ user, ...authRequest });
  const redirect = new URL(authRequest.redirectUri);
  redirect.searchParams.set("code", code.code);
  if (authRequest.state) redirect.searchParams.set("state", authRequest.state);
  return json({ code: code.code, redirect_uri: redirect.toString(), user });
}

async function handleLegacyInviteAdmin(request, store, config) {
  if (!(await isAdminRequest(request, config))) return json({ error: "未授权" }, { status: 401 });
  if (request.method === "POST") {
    const body = await request.json();
    const code = await store.createInviteCode({
      code: body.code, maxUses: Number(body.maxUses ?? 100), enabled: body.enabled ?? true,
    });
    return json(code, { status: 201 });
  }
  if (request.method === "GET") return json({ message: "请在管理后台 /admin/invites 管理邀请码" });
  return json({ error: "方法不允许" }, { status: 405 });
}

// ============================================================
// OIDC UI RENDERING
// ============================================================
function renderOidcLogin({ authRequest, config, errorMsg, account = "" }) {
  const appName = authRequest.app?.name || "SSO";
  return renderAuthSkeleton({
    appName, logoUrl: authRequest.app?.logoUrl, config,
    title: "登录",
    lead: `登录以继续访问 <strong>${escapeHtml(appName)}</strong>`,
    errorMsg,
    html: `
      <form method="post" action="/login">
        ${renderHiddenAuthFields(authRequest)}
        <div class="field">
          <label>账号 ${config.defaultAccountDomain ? `<span class="domain">@${escapeHtml(config.defaultAccountDomain)}</span>` : ""}</label>
          <input name="account" autocomplete="username" required value="${escapeHtml(account)}">
        </div>
        <div class="field">
          <label>密码</label>
          <input type="password" name="password" autocomplete="current-password">
          <div class="hint">或者留空，在下方使用邀请码登录（首次登录可注册）</div>
        </div>
        <div class="field">
          <label>邀请码（无密码时使用）</label>
          <input name="invite_code" autocomplete="one-time-code">
        </div>
        ${renderTurnstile(config.turnstileSiteKey, "login")}
        <button type="submit" class="btn-primary">登录 / 注册并登录</button>
      </form>
      <p class="footer">还没有账号？使用上方邀请码会自动注册。<br><a href="${buildAuthLink("/register", authRequest)}">前往注册页 →</a></p>
      ${renderTurnstileScript(config.turnstileSiteKey)}
    `,
  });
}

function renderOidcRegister({ authRequest, config, errorMsg, account = "", displayName = "" }) {
  const appName = authRequest.app?.name || "SSO";
  return renderAuthSkeleton({
    appName, logoUrl: authRequest.app?.logoUrl, config,
    title: "注册账号",
    lead: `注册后将自动登录并授权给 <strong>${escapeHtml(appName)}</strong>`,
    errorMsg,
    html: `
      <form method="post" action="/register">
        ${renderHiddenAuthFields(authRequest)}
        <div class="field">
          <label>账号 ${config.defaultAccountDomain ? `<span class="domain">@${escapeHtml(config.defaultAccountDomain)}</span>` : ""}</label>
          <input name="account" autocomplete="username" required value="${escapeHtml(account)}">
        </div>
        <div class="field">
          <label>昵称（可选）</label>
          <input name="display_name" value="${escapeHtml(displayName)}">
        </div>
        <div class="field">
          <label>邀请码</label>
          <input name="invite_code" autocomplete="one-time-code" required>
        </div>
        <div class="field">
          <label>设置密码（推荐）</label>
          <input type="password" name="password" autocomplete="new-password">
          <div class="hint">至少 8 位，字母 + 数字</div>
        </div>
        ${renderTurnstile(config.turnstileSiteKey, "register")}
        <button type="submit" class="btn-primary">注册并登录</button>
      </form>
      <p class="footer">已有账号？<a href="${buildAuthLink("/authorize", authRequest)}">返回登录 →</a></p>
      ${renderTurnstileScript(config.turnstileSiteKey)}
    `,
  });
}

function renderAuthSkeleton({ appName, logoUrl, config, title, lead, errorMsg, html }) {
  const css = `
:root{--primary:#3b82f6;--primary-hover:#2563eb;--text:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#f6f7fb;--danger:#ef4444}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(1200px 600px at 10% -10%,#dbeafe 0,transparent 60%),radial-gradient(900px 500px at 100% 0%,#f3e8ff 0,transparent 60%),var(--bg);font-family:system-ui,-apple-system,sans-serif;color:var(--text);padding:20px}
.card{width:min(440px,100%);background:#fff;border:1px solid var(--border);border-radius:16px;padding:32px 28px;box-shadow:0 10px 30px -10px rgba(0,0,0,.1)}
.app{display:flex;align-items:center;gap:12px;margin-bottom:22px;padding-bottom:18px;border-bottom:1px dashed var(--border)}
.app-logo{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:grid;place-items:center;color:#fff;font-weight:700;font-size:18px;overflow:hidden}
.app-logo img{width:100%;height:100%;object-fit:cover}
.app h2{margin:0;font-size:14px;color:var(--muted);font-weight:500}
.app p{margin:2px 0 0;font-size:16px;font-weight:700;letter-spacing:-.01em}
h1{margin:0 0 6px;font-size:22px;font-weight:700;letter-spacing:-.02em}
.lead{color:var(--muted);font-size:13px;margin:0 0 20px;line-height:1.5}
.lead strong{color:var(--text);font-weight:600}
.error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:16px}
label{display:block;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
label .domain{text-transform:none;letter-spacing:0;color:var(--primary);font-weight:500;margin-left:4px;text-decoration:none}
input{width:100%;padding:11px 13px;border:1px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;background:#fcfcfd;color:var(--text)}
input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(59,130,246,.12);background:#fff}
.field{margin-bottom:14px}
.hint{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.4}
.btn-primary{width:100%;padding:12px;border:0;border-radius:10px;background:var(--primary);color:#fff;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit;margin-top:6px;transition:background .15s}
.btn-primary:hover{background:var(--primary-hover)}
.footer{margin:20px 0 0;text-align:center;font-size:12px;color:var(--muted);line-height:1.6}
a{color:var(--primary);text-decoration:none;font-weight:500}
a:hover{text-decoration:underline}
.turnstile{min-height:65px;margin:14px 0}
`;
  const initial = appName.charAt(0).toUpperCase();
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(appName)}</title>
<style>${css}</style>
</head>
<body>
<div class="card">
  <div class="app">
    <div class="app-logo">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="">` : escapeHtml(initial)}</div>
    <div><h2>登录至</h2><p>${escapeHtml(appName)}</p></div>
  </div>
  <h1>${escapeHtml(title)}</h1>
  <p class="lead">${lead}</p>
  ${errorMsg ? `<div class="error">${escapeHtml(errorMsg)}</div>` : ""}
  ${html}
</div>
</body>
</html>`;
}

function renderHiddenAuthFields(req) {
  const fields = {
    client_id: req.clientId, redirect_uri: req.redirectUri, response_type: "code",
    scope: req.scope, state: req.state, nonce: req.nonce,
    code_challenge: req.codeChallenge, code_challenge_method: req.codeChallengeMethod,
  };
  return Object.entries(fields).filter(([, v]) => v).map(([k, v]) =>
    `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`
  ).join("");
}

function buildAuthLink(path, req) {
  const u = new URL(path, "https://sso.local");
  const p = { client_id: req.clientId, redirect_uri: req.redirectUri, response_type: "code",
    scope: req.scope, state: req.state, nonce: req.nonce,
    code_challenge: req.codeChallenge, code_challenge_method: req.codeChallengeMethod };
  for (const [k, v] of Object.entries(p)) if (v) u.searchParams.set(k, v);
  return `${u.pathname}${u.search}`;
}

// ============================================================
// Turnstile
// ============================================================
class TurnstileService {
  constructor({ config, turnstileFetch }) {
    this.config = config; this.turnstileFetch = turnstileFetch;
  }
  async verifyForm(request, form) {
    if (!this.config.turnstileSiteKey && !this.config.turnstileSecretKey) return;
    if (!this.config.turnstileSiteKey) throw new Error("缺少 TURNSTILE_SITE_KEY 配置");
    if (!this.config.turnstileSecretKey) throw new Error("缺少 TURNSTILE_SECRET_KEY 配置");
    const token = String(form.get("cf-turnstile-response") ?? "").trim();
    if (!token) throw new Error("请完成 Cloudflare 人机验证");
    const body = new FormData();
    body.set("secret", this.config.turnstileSecretKey);
    body.set("response", token);
    const remoteIp = getClientIp(request);
    if (remoteIp) body.set("remoteip", remoteIp);
    const res = await this.turnstileFetch(TURNSTILE_SITEVERIFY_URL, { method: "POST", body });
    if (!res.ok) throw new Error("人机验证服务不可用，请稍后再试");
    const result = await res.json();
    if (!result.success) throw new Error("人机验证失败，请重新验证");
  }
}

function renderTurnstile(siteKey, action) {
  if (!siteKey) return "";
  return `<div class="turnstile cf-turnstile" data-sitekey="${escapeHtml(siteKey)}" data-action="${escapeHtml(action)}"></div>`;
}

function renderTurnstileScript(siteKey) {
  if (!siteKey) return "";
  return `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;
}

// ============================================================
// Helpers
// ============================================================
function requirePrivateJwk(config) {
  if (!config.privateJwk) throw new Error("缺少必要配置：PRIVATE_JWK");
  return parsePrivateJwk(config.privateJwk);
}

async function isAdminRequest(request, config) {
  const auth = request.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return !!(m && config.adminToken && timingSafeEqual(m[1], config.adminToken));
}

function getClientIp(request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "";
}

function getFlash(url) {
  const msg = url.searchParams.get("flash");
  if (!msg) return null;
  return { type: url.searchParams.get("flash_type") || "info", message: msg };
}

function safeRedirect(target, fallback) {
  if (!target || typeof target !== "string") return fallback;
  if (target.startsWith("//") || /^https?:\/\//i.test(target)) return fallback;
  if (!target.startsWith("/")) return fallback;
  return target;
}

function getErrorMessage(err) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return "处理失败";
}

// ============================================================
// Response helpers
// ============================================================
function html(body, init = {}) {
  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  if (init.headers) {
    for (const [k, v] of new Headers(init.headers)) headers.set(k, v);
  }
  return new Response(body, { status: init.status ?? 200, headers });
}

function json(body, init = {}) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (init.headers) {
    for (const [k, v] of new Headers(init.headers)) headers.set(k, v);
  }
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

function redirectResponse(location) {
  return new Response(null, { status: 302, headers: new Headers({ location }) });
}

// ============================================================
// AList SSO Integration
// ============================================================
async function handleAListSSO(request, auth, config) {
  const ctx = await auth.getSessionFromRequest(request);
  if (!ctx?.user) {
    return redirectResponse("/admin-login?redirect=" + encodeURIComponent("/alist-sso"));
  }

  const issuer = config.issuer;
  const clientId = config.legacyClientId || "";
  const clientSecret = config.legacyClientSecret || "";

  return html(renderAListSSO({
    user: ctx.user,
    issuer,
    clientId,
    clientSecret,
    config,
  }));
}

function oauthError(error, description, status) {
  return json({ error, error_description: description }, { status });
}

function html404() {
  return html(
    `<!doctype html><html><head><meta charset="utf-8"><title>404</title></head>
    <body style="display:grid;place-items:center;min-height:100vh;margin:0;font-family:sans-serif;background:#f6f7fb">
    <div style="text-align:center"><h1 style="font-size:48px;margin:0">404</h1><p style="color:#64748b">找不到页面</p>
    <a href="/" style="color:#3b82f6">返回首页</a></div></body></html>`,
    { status: 404 }
  );
}

function errorResponse(err, request) {
  const accept = request?.headers?.get("accept") ?? "";
  if (accept.includes("application/json")) {
    return json({ error: getErrorMessage(err) }, { status: 500 });
  }
  return html(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>错误</title>
    <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7fb;font-family:system-ui,sans-serif;padding:24px;color:#0f172a}
    .card{width:min(440px,100%);background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
    h1{margin:0 0 10px;font-size:22px;color:#ef4444}
    p{margin:0 0 18px;color:#64748b;line-height:1.6}
    a{color:#3b82f6;text-decoration:none;font-weight:600}
    </style></head><body>
    <div class="card">
      <h1>⚠️ 出错了</h1>
      <p>${escapeHtml(getErrorMessage(err))}</p>
      <a href="javascript:history.back()">← 返回</a>
    </div></body></html>`,
    { status: 400 }
  );
}
