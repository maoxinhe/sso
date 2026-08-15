// Admin UI rendering module - server-rendered HTML dashboard

const BASE_CSS = `
:root{
  --bg:#f6f7fb;--card:#fff;--text:#0f172a;--muted:#64748b;--border:#e5e7eb;
  --primary:#3b82f6;--primary-hover:#2563eb;--primary-bg:#eff6ff;
  --success:#10b981;--danger:#ef4444;--warning:#f59e0b;
  --shadow:0 1px 3px rgba(0,0,0,.04),0 1px 2px rgba(0,0,0,.02);
  --radius:10px;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;line-height:1.5}
a{color:var(--primary);text-decoration:none}a:hover{text-decoration:underline}
.layout{display:grid;grid-template-columns:240px 1fr;min-height:100vh}
.sidebar{background:#0f172a;color:#cbd5e1;padding:24px 0;position:sticky;top:0;height:100vh;overflow-y:auto}
.sidebar .brand{padding:0 24px 24px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:16px}
.sidebar .brand h1{margin:0;font-size:18px;color:#fff;letter-spacing:-.02em}
.sidebar .brand p{margin:4px 0 0;font-size:12px;color:#64748b}
.nav{display:flex;flex-direction:column;gap:2px;padding:0 12px}
.nav a{display:block;padding:10px 12px;border-radius:8px;color:#cbd5e1;font-size:14px;font-weight:500}
.nav a:hover{background:rgba(255,255,255,.06);color:#fff;text-decoration:none}
.nav a.active{background:var(--primary);color:#fff}
.main{padding:28px 36px;max-width:1400px}
.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
.topbar h2{margin:0;font-size:22px;font-weight:700;letter-spacing:-.02em}
.user-chip{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--border);border-radius:999px;padding:6px 12px 6px 6px;box-shadow:var(--shadow)}
.user-chip .avatar{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;display:grid;place-items:center;font-weight:600;font-size:12px}
.user-chip .email{font-size:13px;color:var(--muted);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;box-shadow:var(--shadow)}
.card+.card{margin-top:16px}
.card h3{margin:0 0 16px;font-size:15px;font-weight:600}
.grid{display:grid;gap:16px}
.grid.stats{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
.stat{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;box-shadow:var(--shadow)}
.stat .label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.stat .value{font-size:28px;font-weight:700;margin-top:6px;letter-spacing:-.02em}
.stat .delta{font-size:12px;color:var(--success);margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:12px 14px;text-align:left;border-bottom:1px solid var(--border)}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600;background:#fafbfc}
tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.02em}
.badge.green{background:#dcfce7;color:#166534}
.badge.red{background:#fee2e2;color:#991b1b}
.badge.gray{background:#f1f5f9;color:#334155}
.badge.blue{background:#dbeafe;color:#1e40af}
.badge.yellow{background:#fef3c7;color:#92400e}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text);font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .12s}
.btn:hover{border-color:#cbd5e1;background:#f8fafc}
.btn.primary{background:var(--primary);color:#fff;border-color:var(--primary)}
.btn.primary:hover{background:var(--primary-hover);border-color:var(--primary-hover)}
.btn.danger{background:#fff;color:var(--danger);border-color:#fecaca}
.btn.danger:hover{background:#fef2f2}
.btn.small{padding:5px 10px;font-size:12px}
.btn-row{display:flex;gap:8px;flex-wrap:wrap}
input,select,textarea{font-family:inherit;font-size:13px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text);width:100%}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(59,130,246,.12)}
label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}
.field{margin-bottom:14px}
.form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.empty{padding:40px;text-align:center;color:var(--muted);font-size:13px}
.muted{color:var(--muted)}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
pre{background:#0f172a;color:#e2e8f0;padding:14px 16px;border-radius:8px;overflow:auto;font-size:12px;margin:0}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:20px}
.tabs a{padding:10px 14px;border-bottom:2px solid transparent;color:var(--muted);font-weight:500;font-size:13px}
.tabs a.active{color:var(--primary);border-bottom-color:var(--primary)}
.kv{display:grid;grid-template-columns:140px 1fr;gap:10px 16px}
.kv .k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em;font-weight:600;padding-top:2px}
.alert{padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:16px}
.alert.info{background:var(--primary-bg);color:#1e40af;border:1px solid #bfdbfe}
.alert.warn{background:#fffbeb;color:#92400e;border:1px solid #fde68a}
.alert.error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
.monospace{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
@media(max-width:860px){.layout{grid-template-columns:1fr}.sidebar{position:static;height:auto;padding:16px 0}.main{padding:20px}}
`;

function layout({ title, activeNav, user, content, issuer }) {
  const initial = (user?.email || "?").charAt(0).toUpperCase();
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · SSO 管理后台</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="brand">
      <h1>🔐 SSO Console</h1>
      <p>${escapeHtml(stripProtocol(issuer))}</p>
    </div>
    <nav class="nav">
      <a href="/admin" class="${activeNav === "dashboard" ? "active" : ""}">📊 仪表盘</a>
      <a href="/admin/users" class="${activeNav === "users" ? "active" : ""}">👥 用户</a>
      <a href="/admin/apps" class="${activeNav === "apps" ? "active" : ""}">🔌 应用</a>
      <a href="/admin/invites" class="${activeNav === "invites" ? "active" : ""}">🎟️ 邀请码</a>
      <a href="/admin/audit" class="${activeNav === "audit" ? "active" : ""}">📜 审计日志</a>
      <a href="/admin/account" class="${activeNav === "account" ? "active" : ""}">⚙️ 我的账号</a>
    </nav>
  </aside>
  <main class="main">
    <div class="topbar">
      <h2>${escapeHtml(title)}</h2>
      <div class="btn-row">
        <a class="btn small" href="/" target="_blank" rel="noopener">🚪 SSO 入口</a>
        <form method="post" action="/admin/logout" style="display:inline">
          <button class="btn small danger" type="submit">退出登录</button>
        </form>
        <div class="user-chip">
          <div class="avatar">${escapeHtml(initial)}</div>
          <div class="email">${escapeHtml(user?.email || "")}</div>
        </div>
      </div>
    </div>
    ${content}
  </main>
</div>
</body>
</html>`;
}

function stripProtocol(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ============ Dashboard ============
export function renderDashboard({ user, issuer, stats, recentUsers, recentLogs }) {
  const statCards = [
    { label: "总用户数", value: stats.totalUsers, delta: "7 日活跃 " + stats.activeUsers7d },
    { label: "应用数量", value: stats.totalApps },
    { label: "邀请码", value: stats.totalInviteCodes },
    { label: "活跃会话", value: stats.activeSessions },
    { label: "审计事件", value: stats.totalAuditLogs },
  ];
  const content = `
    <div class="grid stats">
      ${statCards.map((s) => `
        <div class="stat">
          <div class="label">${escapeHtml(s.label)}</div>
          <div class="value">${s.value}</div>
          ${s.delta ? `<div class="delta">${escapeHtml(s.delta)}</div>` : ""}
        </div>`).join("")}
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:20px">
      <div class="card">
        <h3>最近注册的用户</h3>
        ${recentUsers.length ? `
        <table>
          <thead><tr><th>邮箱</th><th>昵称</th><th>管理员</th><th>创建时间</th></tr></thead>
          <tbody>
          ${recentUsers.map((u) => `
            <tr>
              <td class="monospace">${escapeHtml(u.email)}</td>
              <td>${escapeHtml(u.displayName)}</td>
              <td>${u.isAdmin ? `<span class="badge blue">是</span>` : `<span class="badge gray">否</span>`}</td>
              <td class="muted">${escapeHtml(formatDate(u.createdAt))}</td>
            </tr>`).join("")}
          </tbody>
        </table>` : `<div class="empty">暂无用户</div>`}
      </div>
      <div class="card">
        <h3>最近的审计事件</h3>
        ${recentLogs.length ? `
        <table>
          <thead><tr><th>时间</th><th>操作者</th><th>动作</th></tr></thead>
          <tbody>
          ${recentLogs.map((l) => `
            <tr>
              <td class="muted">${escapeHtml(formatDate(l.createdAt))}</td>
              <td class="monospace">${escapeHtml(l.email || "-")}</td>
              <td><span class="badge blue">${escapeHtml(l.action)}</span></td>
            </tr>`).join("")}
          </tbody>
        </table>` : `<div class="empty">暂无日志</div>`}
      </div>
    </div>`;
  return layout({ title: "仪表盘", activeNav: "dashboard", user, issuer, content });
}

// ============ Users ============
export function renderUsers({ user, issuer, users, flash }) {
  const content = `
    ${flashAlert(flash)}
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0">用户管理 (${users.length})</h3>
        <a class="btn primary" href="/admin/users/new">+ 新建用户</a>
      </div>
      ${users.length ? `
      <table>
        <thead><tr><th>ID</th><th>邮箱</th><th>昵称</th><th>状态</th><th>角色</th><th>注册时间</th><th>最近登录</th><th></th></tr></thead>
        <tbody>
        ${users.map((u) => `
          <tr>
            <td class="monospace muted">${u.id}</td>
            <td class="monospace">${escapeHtml(u.email)}</td>
            <td>${escapeHtml(u.displayName)}</td>
            <td>${u.isActive ? `<span class="badge green">活跃</span>` : `<span class="badge red">停用</span>`}</td>
            <td>${u.isAdmin ? `<span class="badge blue">管理员</span>` : `<span class="badge gray">成员</span>`}</td>
            <td class="muted">${escapeHtml(formatDate(u.createdAt))}</td>
            <td class="muted">${escapeHtml(formatDate(u.lastLoginAt))}</td>
            <td>
              <div class="btn-row">
                <a class="btn small" href="/admin/users/${encodeURIComponent(u.email)}">编辑</a>
                <form method="post" action="/admin/users/${encodeURIComponent(u.email)}/delete" style="display:inline" onsubmit="return confirm('确定要删除此用户？')">
                  <button class="btn small danger" type="submit">删除</button>
                </form>
              </div>
            </td>
          </tr>`).join("")}
        </tbody>
      </table>` : `<div class="empty">暂无用户，点击右上角创建第一个用户</div>`}
    </div>`;
  return layout({ title: "用户", activeNav: "users", user, issuer, content });
}

export function renderUserForm({ user, issuer, currentUser, target, mode, flash }) {
  target = target || { email: "", displayName: "", isAdmin: false, isActive: true, emailVerified: false };
  const isNew = mode === "new";
  const content = `
    ${flashAlert(flash)}
    <div class="card">
      <h3>${isNew ? "新建用户" : `编辑用户 · ${escapeHtml(target.email || "")}`}</h3>
      <form method="post" action="${isNew ? "/admin/users/new" : `/admin/users/${encodeURIComponent(target.email)}`}">
        <div class="form-grid">
          <div class="field">
            <label>邮箱 ${isNew ? "" : "(不可修改)"}</label>
            <input type="email" name="email" value="${escapeHtml(target.email || "")}" ${isNew ? "required" : "readonly"}>
          </div>
          <div class="field">
            <label>昵称</label>
            <input type="text" name="display_name" value="${escapeHtml(target.displayName || "")}">
          </div>
          ${isNew ? `
          <div class="field">
            <label>初始密码 ${currentUser?.isAdmin && !isNew ? "（留空不修改）" : "(至少8位，含字母+数字)"}</label>
            <input type="password" name="password" autocomplete="new-password" ${isNew ? "required" : ""}>
          </div>
          <div class="field">
            <label>邀请码（可选）</label>
            <input type="text" name="invite_code">
          </div>` : `
          <div class="field">
            <label>重置密码（留空不修改）</label>
            <input type="password" name="password" autocomplete="new-password">
          </div>`}
          <div class="field">
            <label>
              <input type="checkbox" name="is_admin" value="1" ${target.isAdmin ? "checked" : ""} style="width:auto;vertical-align:middle;margin-right:6px">
              管理员角色
            </label>
          </div>
          <div class="field">
            <label>
              <input type="checkbox" name="is_active" value="1" ${target.isActive ? "checked" : ""} style="width:auto;vertical-align:middle;margin-right:6px">
              账号启用
            </label>
          </div>
          <div class="field">
            <label>
              <input type="checkbox" name="email_verified" value="1" ${target.emailVerified ? "checked" : ""} style="width:auto;vertical-align:middle;margin-right:6px">
              邮箱已验证
            </label>
          </div>
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn primary" type="submit">${isNew ? "创建用户" : "保存更改"}</button>
          <a class="btn" href="/admin/users">返回</a>
        </div>
      </form>
    </div>`;
  return layout({ title: isNew ? "新建用户" : "编辑用户", activeNav: "users", user, issuer, content });
}

// ============ Apps ============
export function renderApps({ user, issuer, apps, flash }) {
  const content = `
    ${flashAlert(flash)}
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0">应用管理 (${apps.length})</h3>
        <a class="btn primary" href="/admin/apps/new">+ 新建应用</a>
      </div>
      <div class="alert info">
        💡 应用即 OIDC 客户端。每一个接入 SSO 的业务系统都需要在这里注册一个应用，拿到 Client ID / Secret 后配置到业务系统。
      </div>
      ${apps.length ? `
      <table>
        <thead><tr><th>应用名</th><th>Client ID</th><th>回调 URL</th><th>可见性</th><th>状态</th><th>创建时间</th><th></th></tr></thead>
        <tbody>
        ${apps.map((a) => `
          <tr>
            <td><strong>${escapeHtml(a.name)}</strong>${a.description ? `<div class="muted" style="font-size:12px;margin-top:2px">${escapeHtml(a.description)}</div>` : ""}</td>
            <td class="monospace">${escapeHtml(a.clientId)}</td>
            <td class="monospace muted">${escapeHtml(truncate(a.redirectUris?.[0] || "", 50))}${a.redirectUris?.length > 1 ? ` +${a.redirectUris.length - 1}` : ""}</td>
            <td>${a.isPublic ? `<span class="badge yellow">公开</span>` : `<span class="badge gray">机密</span>`}</td>
            <td>${a.isActive ? `<span class="badge green">启用</span>` : `<span class="badge red">停用</span>`}</td>
            <td class="muted">${escapeHtml(formatDate(a.createdAt))}</td>
            <td>
              <div class="btn-row">
                <a class="btn small" href="/admin/apps/${encodeURIComponent(a.clientId)}">编辑</a>
                <form method="post" action="/admin/apps/${encodeURIComponent(a.clientId)}/delete" style="display:inline" onsubmit="return confirm('删除此应用？业务端配置将失效。')">
                  <button class="btn small danger" type="submit">删除</button>
                </form>
              </div>
            </td>
          </tr>`).join("")}
        </tbody>
      </table>` : `<div class="empty">暂无应用。创建第一个应用以接入 SSO。</div>`}
    </div>`;
  return layout({ title: "应用", activeNav: "apps", user, issuer, content });
}

export function renderAppForm({ user, issuer, target, mode, flash, endpointHelp }) {
  target = target || { clientId: "", clientSecret: "", name: "", description: "", logoUrl: "", redirectUris: [], scopes: ["openid", "email", "profile"], isActive: true, isPublic: false };
  const isNew = mode === "new";
  const content = `
    ${flashAlert(flash)}
    <div class="card">
      <h3>${isNew ? "新建应用" : `编辑应用 · ${escapeHtml(target.name || "")}`}</h3>
      <form method="post" action="${isNew ? "/admin/apps/new" : `/admin/apps/${encodeURIComponent(target.clientId)}`}">
        <div class="form-grid">
          <div class="field">
            <label>应用名 *</label>
            <input type="text" name="name" value="${escapeHtml(target.name || "")}" required>
          </div>
          <div class="field">
            <label>Client ID ${isNew ? "(留空自动生成)" : "(不可修改)"}</label>
            <input type="text" name="client_id" value="${escapeHtml(target.clientId || "")}" ${isNew ? "" : "readonly"} placeholder="my-app">
          </div>
          <div class="field">
            <label>Client Secret ${isNew ? "(留空自动生成)" : "(留空不修改)"}</label>
            <input type="text" name="client_secret" value="${escapeHtml(isNew ? "" : target.clientSecret || "")}" autocomplete="off">
          </div>
        </div>
        <div class="field">
          <label>描述</label>
          <input type="text" name="description" value="${escapeHtml(target.description || "")}">
        </div>
        <div class="form-grid">
          <div class="field">
            <label>
              <input type="checkbox" name="is_active" value="1" ${target.isActive ? "checked" : ""} style="width:auto;vertical-align:middle;margin-right:6px">
              应用启用
            </label>
          </div>
          <div class="field">
            <label>
              <input type="checkbox" name="is_public" value="1" ${target.isPublic ? "checked" : ""} style="width:auto;vertical-align:middle;margin-right:6px">
              公开客户端（浏览器 / 移动端，无 Secret）
            </label>
          </div>
        </div>
        <div class="field">
          <label>允许的回调 URL * (每行一个，支持多个)</label>
          <textarea name="redirect_uris" rows="4" required placeholder="https://app.example.com/callback&#10;https://app2.example.com/callback">${escapeHtml((target.redirectUris || []).join("\n"))}</textarea>
        </div>
        <div class="field">
          <label>允许的 scope (空格或逗号分隔)</label>
          <input type="text" name="scopes" value="${escapeHtml((target.scopes || []).join(" "))}">
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn primary" type="submit">${isNew ? "创建应用" : "保存更改"}</button>
          <a class="btn" href="/admin/apps">返回</a>
        </div>
      </form>
    </div>
    ${!isNew && endpointHelp ? `
    <div class="card" style="margin-top:16px">
      <h3>🔗 OIDC 接入信息</h3>
      <p class="muted" style="margin-top:-8px">把这些端点配置到你的业务系统 OIDC / OAuth2 设置里。</p>
      <div class="kv">
        <div class="k">Issuer</div><div class="monospace">${escapeHtml(endpointHelp.issuer)}</div>
        <div class="k">Authorization Endpoint</div><div class="monospace">${escapeHtml(endpointHelp.authorizationEndpoint)}</div>
        <div class="k">Token Endpoint</div><div class="monospace">${escapeHtml(endpointHelp.tokenEndpoint)}</div>
        <div class="k">UserInfo Endpoint</div><div class="monospace">${escapeHtml(endpointHelp.userinfoEndpoint)}</div>
        <div class="k">JWKS URI</div><div class="monospace">${escapeHtml(endpointHelp.jwksUri)}</div>
        <div class="k">Discovery</div><div class="monospace">${escapeHtml(endpointHelp.discoveryUri)}</div>
      </div>
    </div>` : ""}`;
  return layout({ title: isNew ? "新建应用" : "编辑应用", activeNav: "apps", user, issuer, content });
}

// ============ Invites ============
export function renderInvites({ user, issuer, invites, flash }) {
  const content = `
    ${flashAlert(flash)}
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0">邀请码 (${invites.length})</h3>
        <a class="btn primary" href="/admin/invites/new">+ 生成邀请码</a>
      </div>
      ${invites.length ? `
      <table>
        <thead><tr><th>邀请码</th><th>使用量</th><th>上限</th><th>状态</th><th>过期时间</th><th>创建时间</th><th></th></tr></thead>
        <tbody>
        ${invites.map((i) => {
          const ratio = i.maxUses > 0 ? Math.round((i.usedCount / i.maxUses) * 100) : 0;
          const expired = i.expiresAt && new Date(i.expiresAt).getTime() < Date.now();
          const status = !i.enabled || expired ? "red" : ratio >= 100 ? "gray" : "green";
          const label = !i.enabled ? "已停用" : expired ? "已过期" : ratio >= 100 ? "已用完" : "可用";
          return `
          <tr>
            <td class="monospace"><strong>${escapeHtml(i.code)}</strong></td>
            <td>${i.usedCount} / ${i.maxUses} <span class="muted">(${ratio}%)</span></td>
            <td>${i.maxUses}</td>
            <td><span class="badge ${status}">${label}</span></td>
            <td class="muted">${i.expiresAt ? escapeHtml(formatDate(i.expiresAt)) : "永久"}</td>
            <td class="muted">${escapeHtml(formatDate(i.createdAt))}</td>
            <td>
              <div class="btn-row">
                <form method="post" action="/admin/invites/${encodeURIComponent(i.code)}/toggle" style="display:inline">
                  <button class="btn small" type="submit">${i.enabled ? "停用" : "启用"}</button>
                </form>
                <form method="post" action="/admin/invites/${encodeURIComponent(i.code)}/delete" style="display:inline" onsubmit="return confirm('删除此邀请码？')">
                  <button class="btn small danger" type="submit">删除</button>
                </form>
              </div>
            </td>
          </tr>`;
        }).join("")}
        </tbody>
      </table>` : `<div class="empty">暂无邀请码。</div>`}
    </div>`;
  return layout({ title: "邀请码", activeNav: "invites", user, issuer, content });
}

export function renderInviteForm({ user, issuer, flash }) {
  const content = `
    ${flashAlert(flash)}
    <div class="card">
      <h3>生成邀请码</h3>
      <form method="post" action="/admin/invites/new">
        <div class="form-grid">
          <div class="field">
            <label>邀请码 (留空自动生成)</label>
            <input type="text" name="code" placeholder="JOIN-2026">
          </div>
          <div class="field">
            <label>最大使用次数</label>
            <input type="number" name="max_uses" value="100" min="1">
          </div>
          <div class="field">
            <label>过期时间 (可选，ISO 8601)</label>
            <input type="datetime-local" name="expires_at">
          </div>
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn primary" type="submit">生成</button>
          <a class="btn" href="/admin/invites">返回</a>
        </div>
      </form>
    </div>`;
  return layout({ title: "生成邀请码", activeNav: "invites", user, issuer, content });
}

// ============ Audit ============
export function renderAudit({ user, issuer, logs }) {
  const content = `
    <div class="card">
      <h3>审计日志 (最近 ${logs.length} 条)</h3>
      ${logs.length ? `
      <table>
        <thead><tr><th>时间</th><th>用户</th><th>IP</th><th>动作</th><th>目标</th><th>详情</th></tr></thead>
        <tbody>
        ${logs.map((l) => `
          <tr>
            <td class="muted monospace">${escapeHtml(formatDate(l.createdAt))}</td>
            <td class="monospace">${escapeHtml(l.email || "-")}</td>
            <td class="monospace muted">${escapeHtml(l.ipAddress || "-")}</td>
            <td><span class="badge blue">${escapeHtml(l.action)}</span></td>
            <td class="muted monospace">${l.targetType ? `${escapeHtml(l.targetType)}:${escapeHtml(l.targetId || "")}` : "-"}</td>
            <td class="monospace muted" style="max-width:320px;overflow:hidden;text-overflow:ellipsis">${l.details ? escapeHtml(JSON.stringify(l.details)) : "-"}</td>
          </tr>`).join("")}
        </tbody>
      </table>` : `<div class="empty">暂无审计事件</div>`}
    </div>`;
  return layout({ title: "审计日志", activeNav: "audit", user, issuer, content });
}

// ============ Account ============
export function renderAccount({ user, issuer, sessions, flash }) {
  const content = `
    ${flashAlert(flash)}
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="card">
        <h3>个人信息</h3>
        <div class="kv">
          <div class="k">邮箱</div><div class="monospace">${escapeHtml(user.email)}</div>
          <div class="k">昵称</div><div>${escapeHtml(user.displayName)}</div>
          <div class="k">角色</div><div>${user.isAdmin ? `<span class="badge blue">管理员</span>` : `<span class="badge gray">成员</span>`}</div>
          <div class="k">邮箱验证</div><div>${user.emailVerified ? `<span class="badge green">已验证</span>` : `<span class="badge yellow">未验证</span>`}</div>
          <div class="k">注册时间</div><div class="muted">${escapeHtml(formatDate(user.createdAt))}</div>
          <div class="k">最近登录</div><div class="muted">${escapeHtml(formatDate(user.lastLoginAt))}</div>
        </div>
      </div>
      <div class="card">
        <h3>修改密码</h3>
        <form method="post" action="/admin/account/password">
          <div class="field">
            <label>当前密码</label>
            <input type="password" name="current_password" autocomplete="current-password" required>
          </div>
          <div class="field">
            <label>新密码（至少8位，字母+数字）</label>
            <input type="password" name="new_password" autocomplete="new-password" required>
          </div>
          <div class="field">
            <label>再次输入新密码</label>
            <input type="password" name="new_password_confirm" autocomplete="new-password" required>
          </div>
          <button class="btn primary" type="submit">更新密码</button>
        </form>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>活跃会话 (${sessions.length})</h3>
      ${sessions.length ? `
      <table>
        <thead><tr><th>IP</th><th>User-Agent</th><th>登录时间</th><th>最近活跃</th><th>过期</th><th></th></tr></thead>
        <tbody>
        ${sessions.map((s) => `
          <tr>
            <td class="monospace">${escapeHtml(s.ipAddress || "-")}</td>
            <td class="muted" style="max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(s.userAgent || "-")}</td>
            <td class="muted">${escapeHtml(formatDate(s.createdAt))}</td>
            <td class="muted">${escapeHtml(formatDate(s.lastSeenAt))}</td>
            <td class="muted">${escapeHtml(formatDate(s.expiresAt))}</td>
            <td>
              <form method="post" action="/admin/account/sessions/${encodeURIComponent(s.token)}/delete" style="display:inline">
                <button class="btn small danger" type="submit">终止</button>
              </form>
            </td>
          </tr>`).join("")}
        </tbody>
      </table>` : `<div class="empty">没有其他会话</div>`}
    </div>`;
  return layout({ title: "我的账号", activeNav: "account", user, issuer, content });
}

// ============ AList SSO Integration ============
export function renderAListSSO({ user, issuer, clientId, clientSecret, config }) {
  const content = `
    <div class="alert info">
      <strong>AList 单点登录配置</strong><br>
      将以下配置复制到 AList 管理后台 → 设置 → 认证 → OIDC 中即可完成对接。
    </div>
    <div class="card">
      <h3>AList OIDC 配置参数</h3>
      <div class="kv">
        <div class="k">OIDC 名称</div>
        <div><code>SSO</code></div>

        <div class="k">Client ID</div>
        <div><code class="monospace" style="word-break:break-all">${escapeHtml(clientId)}</code></div>

        <div class="k">Client Secret</div>
        <div><code class="monospace" style="word-break:break-all">${escapeHtml(clientSecret)}</code></div>

        <div class="k">Authorization URL</div>
        <div><code class="monospace" style="word-break:break-all">${escapeHtml(issuer)}/authorize</code></div>

        <div class="k">Token URL</div>
        <div><code class="monospace" style="word-break:break-all">${escapeHtml(issuer)}/token</code></div>

        <div class="k">Userinfo URL</div>
        <div><code class="monospace" style="word-break:break-all">${escapeHtml(issuer)}/userinfo</code></div>

        <div class="k">Redirect URL</div>
        <div><code class="monospace" style="word-break:break-all">你的AList地址/api/auth/oidc/callback</code></div>

        <div class="k">Scopes</div>
        <div><code>openid email profile</code></div>

        <div class="k">用户映射字段</div>
        <div><code>sub → sub, email → email, name → name</code></div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>AList 配置步骤</h3>
      <ol style="line-height:2;color:var(--text)">
        <li>登录 AList 管理后台</li>
        <li>进入 <strong>设置</strong> → <strong>认证</strong> → <strong>OIDC</strong></li>
        <li>将上方参数填入对应字段</li>
        <li><strong>Redirect URL</strong> 填写：<code class="monospace">https://你的AList地址/api/auth/oidc/callback</code></li>
        <li>保存配置，退出 AList 账号</li>
        <li>在 AList 登录页面点击 <strong>OIDC 登录</strong> 即可通过 SSO 登录</li>
      </ol>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>注意事项</h3>
      <ul style="line-height:2;color:var(--text)">
        <li>确保 AList 版本支持 OIDC 认证（v3.25.0+）</li>
        <li>如果 AList 没有 OIDC 选项，可使用 <strong>OAuth2</strong> 类型，参数相同</li>
        <li>首次使用 OIDC 登录的 SSO 用户会自动在 AList 中创建账号</li>
        <li>SSO 管理员会自动成为 AList 管理员（需在 AList 中手动设置）</li>
      </ul>
    </div>`;
  return layout({ title: "AList SSO 配置", activeNav: "", user, issuer, content });
}

// ============ Utilities ============
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function flashAlert(flash) {
  if (!flash) return "";
  const cls = flash.type === "error" ? "error" : flash.type === "warn" ? "warn" : "info";
  return `<div class="alert ${cls}">${escapeHtml(flash.message)}</div>`;
}
