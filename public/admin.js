(() => {
  "use strict";

  const loginScreen = document.getElementById("admin-login-screen");
  const dashboard = document.getElementById("admin-dashboard");
  const loginForm = document.getElementById("admin-login-form");
  const loginError = document.getElementById("admin-login-error");
  const logoutBtn = document.getElementById("admin-logout-btn");
  const statsEl = document.getElementById("admin-stats");
  const usersBody = document.getElementById("admin-users-body");

  async function api(path, options = {}) {
    const resp = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    let data = null;
    try {
      data = await resp.json();
    } catch (e) {
      data = null;
    }
    if (!resp.ok) {
      const message = (data && data.error) || `Erreur serveur (${resp.status})`;
      throw new Error(message);
    }
    return data;
  }

  function showLogin() {
    loginScreen.classList.remove("hidden");
    dashboard.classList.add("hidden");
  }

  function showDashboard() {
    loginScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 o";
    const units = ["o", "Ko", "Mo", "Go"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i += 1;
    }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
    } catch (e) {
      return iso;
    }
  }

  const STAT_LABELS = {
    users: "Utilisateurs",
    clients: "Clients",
    sites: "Sites",
    techniciens: "Techniciens",
    logos: "Logos",
    rapports: "Rapports générés",
    storage_bytes: "Stockage utilisé",
  };

  function renderStats(stats) {
    statsEl.innerHTML = "";
    Object.keys(STAT_LABELS).forEach((key) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      const value = key === "storage_bytes" ? formatBytes(stats[key] || 0) : (stats[key] ?? 0);
      card.innerHTML = `<div class="value">${value}</div><div class="label">${STAT_LABELS[key]}</div>`;
      statsEl.appendChild(card);
    });
  }

  function renderUsers(users) {
    usersBody.innerHTML = "";
    if (!users.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7" class="admin-empty">Aucun utilisateur pour le moment.</td>`;
      usersBody.appendChild(tr);
      return;
    }
    users.forEach((u) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u.email}</td>
        <td class="muted">${formatDate(u.created_at)}</td>
        <td>${u.clients}</td>
        <td>${u.techniciens}</td>
        <td>${u.logos}</td>
        <td>${u.rapports}</td>
        <td><button class="btn btn-danger-ghost btn-sm" data-id="${u.id}" data-email="${u.email}">Supprimer</button></td>
      `;
      usersBody.appendChild(tr);
    });

    usersBody.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const email = btn.getAttribute("data-email");
        if (!window.confirm(`Supprimer définitivement l'utilisateur "${email}" ainsi que toutes ses données (clients, rapports, logos) ?`)) {
          return;
        }
        btn.disabled = true;
        btn.textContent = "Suppression…";
        try {
          await api(`/api/admin/users/${id}`, { method: "DELETE" });
          await loadDashboard();
        } catch (e) {
          window.alert(e.message || "Erreur lors de la suppression.");
          btn.disabled = false;
          btn.textContent = "Supprimer";
        }
      });
    });
  }

  async function loadDashboard() {
    const [stats, users] = await Promise.all([
      api("/api/admin/stats"),
      api("/api/admin/users"),
    ]);
    renderStats(stats);
    renderUsers(users);
  }

  async function init() {
    try {
      const me = await api("/api/admin/me");
      if (me.authenticated) {
        showDashboard();
        await loadDashboard();
        return;
      }
    } catch (e) {
      // ignore, fall back to login
    }
    showLogin();
  }

  loginForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    loginError.classList.add("hidden");
    const username = document.getElementById("admin-username").value.trim();
    const password = document.getElementById("admin-password").value;
    const submitBtn = loginForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });
      showDashboard();
      await loadDashboard();
    } catch (e) {
      loginError.textContent = e.message || "Identifiants incorrects.";
      loginError.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      await api("/api/admin/logout", { method: "POST" });
    } catch (e) {
      // ignore
    }
    showLogin();
  });

  init();
})();
