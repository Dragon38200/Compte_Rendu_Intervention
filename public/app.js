"use strict";

/* ===================================================================== */
/*  État global                                                          */
/* ===================================================================== */
const state = {
  user: null,
  template: "intervention", // "intervention" | "verif_armoire" | "prep_intervention" | "crealis"
  clients: [],        // [{id, nom, sites:[{id, site, adresse, contact}]}]
  techniciens: [],     // [{id, nom}]
  logos: [],           // [{id, nom, url}]
  gallery: [],         // [{type:'photo', file, previewUrl, caption, scale} | {type:'text', text}]
  logoClient: { file: null, url: null, name: "" },
  signatures: {
    technicien: { nom: "", dataUrl: null },
    client: { nom: "", dataUrl: null },
    exterieur: { nom: "", dataUrl: null },
  },
  editingClientId: null,
  editingSiteId: null,
  editingTechId: null,
};

const QUICK_SYMBOLS = ["✅", "❌", "⚠️", "🔴", "🟠", "🟢", "🔵", "⬆️", "⬇️", "➡️", "⬅️", "⚡", "🔧", "📌"];

/* ===================================================================== */
/*  Appels API                                                           */
/* ===================================================================== */
async function api(path, options = {}) {
  const resp = await fetch(path, {
    credentials: "same-origin",
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,
  });
  let data = null;
  try { data = await resp.json(); } catch (_) { /* pas de corps JSON */ }
  if (!resp.ok) {
    throw new Error((data && data.error) || `Erreur serveur (${resp.status})`);
  }
  return data;
}

/* ===================================================================== */
/*  Authentification                                                     */
/* ===================================================================== */
const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");
const authError = document.getElementById("authError");

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove("hidden");
}
function clearAuthError() {
  authError.classList.add("hidden");
}

document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    clearAuthError();
    const isLogin = tab.dataset.tab === "login";
    document.getElementById("formLogin").classList.toggle("hidden", !isLogin);
    document.getElementById("formRegister").classList.toggle("hidden", isLogin);
  });
});

document.getElementById("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthError();
  const identifier = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  // Compte admin : identifiant "admin" (pas une adresse email), redirige
  // vers le tableau de bord d'administration plutôt que l'application.
  if (identifier.toLowerCase() === "admin") {
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username: identifier, password }),
      });
      window.location.href = "/admin.html";
    } catch (err) {
      showAuthError(err.message);
    }
    return;
  }

  try {
    const user = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: identifier,
        password: password,
      }),
    });
    await enterApp(user);
  } catch (err) {
    showAuthError(err.message);
  }
});

document.getElementById("formRegister").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthError();
  try {
    const user = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("registerEmail").value,
        password: document.getElementById("registerPassword").value,
      }),
    });
    await enterApp(user);
  } catch (err) {
    showAuthError(err.message);
  }
});

document.getElementById("btnLogout").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.reload();
});

async function enterApp(user) {
  state.user = user;
  document.getElementById("userEmail").textContent = user.email;
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  await initApp();
}

(async function bootstrap() {
  try {
    const user = await api("/api/auth/me");
    await enterApp(user);
  } catch (_) {
    // Pas connecté : on reste sur l'écran de connexion.
  }
})();

/* ===================================================================== */
/*  Initialisation de l'application une fois connecté                    */
/* ===================================================================== */
async function initApp() {
  setDefaultDateAndFilename();
  buildEmojiBars();
  buildItemsTableEmptyRow();
  wireStaticButtons();
  await Promise.all([loadClients(), loadTechniciens(), loadLogos()]);
  document.getElementById("fFolder").addEventListener("input", updateDefaultFilename);
  document.getElementById("fClient").addEventListener("change", onClientFieldChanged);
  document.getElementById("fSite").addEventListener("change", onSiteFieldChanged);
}

function setDefaultDateAndFilename() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  document.getElementById("fDate").value = `${dd}/${mm}/${now.getFullYear()}`;
  updateDefaultFilename();
}
function updateDefaultFilename() {
  const folder = document.getElementById("fFolder").value.trim() || "Rapport";
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  document.getElementById("fFilename").value = `${folder}_${stamp}`;
}

function setStatus(message, kind = "info") {
  const el = document.getElementById("statusLabel");
  el.textContent = message;
  el.className = `status-label status-${kind}`;
}

/* ===================================================================== */
/*  Barre d'emojis réutilisable                                          */
/* ===================================================================== */
function buildEmojiBars() {
  document.querySelectorAll(".emoji-bar").forEach(bar => {
    bar.innerHTML = "";
    QUICK_SYMBOLS.forEach(symbol => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-btn";
      btn.textContent = symbol;
      btn.addEventListener("click", () => {
        const targetId = bar.dataset.target;
        const el = document.getElementById(targetId) || bar.closest(".gallery-item")?.querySelector("textarea");
        if (el) {
          insertAtCursor(el, symbol);
        }
      });
      bar.appendChild(btn);
    });
  });
}
function insertAtCursor(el, text) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + text.length;
  el.focus();
  el.dispatchEvent(new Event("input"));
}

/* ===================================================================== */
/*  Tableau Matériel & Prestations                                       */
/* ===================================================================== */
const itemsBody = document.getElementById("itemsBody");
let selectedRow = null;

function buildItemsTableEmptyRow() {
  addItemRow();
}
function addItemRow() {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="it-desig" value="Prestation / Élément"></td>
    <td style="width:70px"><input type="number" class="it-qte" value="1" step="1" min="0"></td>
    <td style="width:100px"><input type="number" class="it-pu" value="0.00" step="0.01" min="0"></td>
    <td style="width:10px"></td>
  `;
  tr.addEventListener("click", () => {
    if (selectedRow) selectedRow.classList.remove("selected");
    selectedRow = tr;
    tr.classList.add("selected");
  });
  tr.querySelectorAll("input").forEach(inp => inp.addEventListener("input", updateItemsTotal));
  itemsBody.appendChild(tr);
  updateItemsTotal();
}
function updateItemsTotal() {
  let total = 0;
  itemsBody.querySelectorAll("tr").forEach(tr => {
    const qte = parseFloat(tr.querySelector(".it-qte").value) || 0;
    const pu = parseFloat(tr.querySelector(".it-pu").value) || 0;
    total += qte * pu;
  });
  document.getElementById("itemsTotal").textContent = `${total.toFixed(2)} €`;
}
function getItemsPayload() {
  return Array.from(itemsBody.querySelectorAll("tr")).map(tr => ({
    designation: tr.querySelector(".it-desig").value.trim(),
    qte: parseFloat(tr.querySelector(".it-qte").value) || 0,
    pu: parseFloat(tr.querySelector(".it-pu").value) || 0,
  }));
}

document.getElementById("btnAddRow").addEventListener("click", addItemRow);
document.getElementById("btnDelRow").addEventListener("click", () => {
  if (selectedRow) {
    selectedRow.remove();
    selectedRow = null;
    updateItemsTotal();
  }
});

/* ===================================================================== */
/*  Grille de vérification "Vérification Armoire Électrique"             */
/*  (Fiche de contrôle armoire V2024 — 3 volets repris du document       */
/*   fourni par le client : ASPECT EXTÉRIEUR, ÉQUIPEMENTS INTÉRIEURS,    */
/*   ESSAIS FONCTIONNELS)                                                */
/* ===================================================================== */
const ARMOIRE_CHECKLIST = [
  {
    id: "exterieur",
    icon: "🗄️",
    title: "1. Aspect extérieur – Enveloppe",
    items: [
      { id: "ext_1", reg: false, label: "Vérification du bon état physique du coffret ou de l'armoire (rayures, chocs…)" },
      { id: "ext_2", reg: false, label: "Vérification du bon état du matériel installé" },
      { id: "ext_3", reg: true, label: "Vérification de la bonne fermeture du coffret ou de l'armoire. Si demande spécifique du client, vérifier le type de clé / fermeture." },
      { id: "ext_4", reg: false, label: "Vérification de la fourniture de la clé ou de l'objet de déverrouillage de l'armoire" },
      { id: "ext_5", reg: false, label: "Vérification de l'étanchéité « relative » du coffret ou de l'armoire. Présence de plastron et autres capuchons si nécessaire." },
      { id: "ext_6", reg: false, label: "Vérification présence et bon état des presse-étoupes" },
      { id: "ext_7", reg: true, label: "Présence de la signalisation électrique sur la face avant du coffret" },
      { id: "ext_8", reg: true, label: "Présence et fonctionnement mécanique du sectionneur (si nécessaire)" },
      { id: "ext_9", reg: true, label: "Présence des repères voyants et boutonnerie 22,5 (repère 178 sur Cembre Genius)" },
      { id: "ext_10", reg: true, label: "Si présence d'un arrêt d'urgence, présence de la collerette spécifique" },
    ],
  },
  {
    id: "interieur",
    icon: "🔌",
    title: "2. Équipements intérieurs de l'armoire",
    items: [
      { id: "int_1", reg: false, label: "Vérification du bon état du matériel installé" },
      { id: "int_2", reg: false, label: "Vérification de la présence de tous les capots de goulottes. Bon état et bonne fixation des goulottes." },
      { id: "int_3", reg: false, label: "Vérification de la bonne fixation des rails et des équipements" },
      { id: "int_4", reg: true, label: "Pas de fils volants dans l'armoire !" },
      { id: "int_5", reg: true, label: "Si présence d'équipement ATEX – SI : respect des normes de montage Sécurité Intrinsèque (goulotte bleue + distance de sécurité des équipements « normaux »)" },
      { id: "int_6", reg: false, label: "Présence d'un porte-plans (si nécessaire)" },
      { id: "int_7", reg: true, label: "Présence des schémas électriques dans l'armoire" },
      { id: "int_8", reg: true, label: "Vérification de la mise à la terre des portes si présence d'équipements électriques" },
      { id: "int_9", reg: true, label: "Vérification de la présence et de l'état du barreau de terre. Serrage des connecteurs de terre (vis M5 ou M6)." },
      { id: "int_10", reg: false, label: "Identification de chaque fil câblé (crayon ou stabilo sur plans)" },
      { id: "int_11", reg: false, label: "Serrage efficace des fils et des cosses" },
      { id: "int_12", reg: false, label: "Contrôle du sertissage des embouts de câblage (par prélèvement) — pince et embouts adaptés à la section (cf. couleurs des embouts)" },
      { id: "int_13", reg: false, label: "Contrôle du sertissage des cosses (par prélèvement) — pince et cosses adaptées à la section (cf. couleurs des cosses)" },
      { id: "int_14", reg: false, label: "Un fil par borne (sauf indication du plan)" },
      { id: "int_15", reg: false, label: "Vérification de la couleur des fils, suivant standard client ou à défaut standard Mounier" },
      { id: "int_16", reg: false, label: "Vérification de la nature des fils suivant standard client ou à défaut standard Mounier (attention : CERN = sans halogène)" },
      { id: "int_17", reg: true, label: "Repérage des appareils sur l'appareil ou sur goulotte — repères conformes au plan et lisibles" },
      { id: "int_18", reg: false, label: "Repérage des fils et des câbles (si nécessaire) — repère 503 Cembre dans bague adaptée à la taille du fil, conforme au plan et lisible" },
      { id: "int_19", reg: false, label: "Repérage des borniers et des n° de bornes (bornes Phoenix, repère n°35 Cembre) — conforme au plan et lisible" },
      { id: "int_20", reg: true, label: "Sur les alimentations et les transfos : raccordement du potentiel de référence à la terre + carcasse acier" },
      { id: "int_21", reg: false, label: "Matériel employé estampillé CE" },
      { id: "int_22", reg: false, label: "Vérification de la nomenclature par rapport au cahier des charges" },
      { id: "int_23", reg: false, label: "Si porte-fusible, vérifier la présence des fusibles conformément au schéma électrique" },
      { id: "int_24", reg: false, label: "Autres contrôles spécifiques clients", type: "text" },
    ],
  },
  {
    id: "essais",
    icon: "⚡",
    title: "3. Essais fonctionnels",
    note: "Les essais fonctionnels doivent être réalisés uniquement par du personnel formé et habilité (habilitation électrique). L'identification des tensions de commande et de puissance est nécessaire avant toute mise sous tension de l'armoire.",
    items: [
      { id: "ess_1", reg: false, label: "Vérification des polarités et des tensions par contrôleur universel (avant mise sous tension)" },
      { id: "ess_2", reg: true, label: "Validation du fonctionnement du voyant « sous tension » et/ou tri-LED si présent" },
      { id: "ess_3", reg: true, label: "Validation du déclenchement des inter-différentiels — appui sur les boutons « Test » des équipements concernés (utiliser si besoin l'appareil de déclenchement des différentiels)" },
      { id: "ess_4", reg: false, label: "Validation du fonctionnement des différentes alimentations" },
      { id: "ess_5", reg: false, label: "Vérification des tensions sur les répartiteurs" },
      { id: "ess_6", reg: false, label: "Validation du fonctionnement de la ventilation et du thermostat (si présent) — faire déclencher le ou les thermostats" },
      { id: "ess_7", reg: false, label: "Isolement : validation de l'isolement diélectrique (essais réservés au personnel qualifié — voir fiche d'essais dédiée)" },
    ],
  },
];

function renderArmoireChecklist() {
  const container = document.getElementById("armoireChecklist");
  container.innerHTML = "";
  ARMOIRE_CHECKLIST.forEach(section => {
    const details = document.createElement("details");
    details.className = "armoire-section";
    details.open = true;
    details.dataset.sectionId = section.id;

    const summary = document.createElement("summary");
    summary.className = "armoire-section-header";
    summary.innerHTML = `
      <span class="armoire-section-header-left">
        <span class="armoire-section-chevron">▶</span>
        <span class="armoire-section-icon">${section.icon}</span>
        <span>
          <span class="armoire-section-title">${section.title}</span>
          ${section.note ? `<div class="armoire-section-sub">${section.note}</div>` : ""}
        </span>
      </span>
      <span class="armoire-section-count" data-count-for="${section.id}">0 / ${section.items.filter(it => it.type !== "text").length}</span>
    `;
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "armoire-section-body";

    section.items.forEach(item => {
      const row = document.createElement("div");
      row.className = "armoire-item" + (item.type === "text" ? " armoire-item-text" : "");
      row.dataset.itemId = item.id;

      if (item.type === "text") {
        row.innerHTML = `
          <div class="armoire-item-label">${item.label}</div>
        `;
        const wrap = document.createElement("div");
        wrap.style.width = "100%";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "armoire-comment armoire-comment-full";
        input.placeholder = "Préciser si nécessaire…";
        row.appendChild(input);
      } else {
        const regBadge = item.reg ? `<span class="armoire-reg-badge">Réglementaire</span>` : "";
        row.innerHTML = `
          <div class="armoire-item-label">${item.label}${regBadge}</div>
        `;
        const controls = document.createElement("div");
        controls.className = "armoire-item-controls";
        const seg = document.createElement("div");
        seg.className = "seg-control";
        seg.innerHTML = `
          <button type="button" class="seg-btn seg-ok" data-value="OK">OK</button>
          <button type="button" class="seg-btn seg-nok" data-value="NOK">NOK</button>
          <button type="button" class="seg-btn seg-so" data-value="SO">NC</button>
        `;
        seg.querySelectorAll(".seg-btn").forEach(btn => {
          btn.addEventListener("click", () => {
            const already = btn.classList.contains("active");
            seg.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
            if (!already) btn.classList.add("active");
            row.classList.toggle("has-nok", !already && btn.dataset.value === "NOK");
            updateArmoireSectionCount(section.id);
            updateArmoireNotation();
          });
        });
        const comment = document.createElement("input");
        comment.type = "text";
        comment.className = "armoire-comment";
        comment.placeholder = "Modification / problème constaté…";

        controls.appendChild(seg);
        controls.appendChild(comment);
        row.appendChild(controls);
      }
      body.appendChild(row);
    });

    details.appendChild(body);
    container.appendChild(details);
  });
}

function updateArmoireSectionCount(sectionId) {
  const section = ARMOIRE_CHECKLIST.find(s => s.id === sectionId);
  const details = document.querySelector(`.armoire-section[data-section-id="${sectionId}"]`);
  if (!section || !details) return;
  const checkableItems = section.items.filter(it => it.type !== "text");
  let answered = 0, hasNok = false;
  checkableItems.forEach(item => {
    const row = details.querySelector(`.armoire-item[data-item-id="${item.id}"]`);
    const activeBtn = row?.querySelector(".seg-btn.active");
    if (activeBtn) {
      answered++;
      if (activeBtn.dataset.value === "NOK") hasNok = true;
    }
  });
  const badge = details.querySelector(`.armoire-section-count`);
  badge.textContent = `${answered} / ${checkableItems.length}`;
  badge.classList.toggle("has-nok", hasNok);
  badge.classList.toggle("complete", answered === checkableItems.length);
}

/* ===================================================================== */
/*  Notation automatique : % de points conformes (OK) par rapport au     */
/*  nombre total de points évalués, les points "NC" (non concerné)       */
/*  étant exclus du calcul. Barème :                                     */
/*    100 % de OK  -> Conforme                                           */
/*    >= 80 % de OK -> Admis sous réserves                                */
/*    <  80 % de OK -> Contrôle qualité refusé                           */
/* ===================================================================== */
const ARMOIRE_VERDICT_META = {
  CONFORME: { label: "✓ Conforme", className: "verdict-ok" },
  ADMIS_SOUS_RESERVES: { label: "⚠ Admis sous réserves", className: "verdict-warn" },
  REFUSE: { label: "✕ Contrôle qualité refusé", className: "verdict-refuse" },
};

function computeArmoireNotation() {
  let ok = 0, nok = 0, nc = 0;
  document.querySelectorAll(".armoire-item:not(.armoire-item-text)").forEach(row => {
    const activeBtn = row.querySelector(".seg-btn.active");
    if (!activeBtn) return;
    const value = activeBtn.dataset.value;
    if (value === "OK") ok++;
    else if (value === "NOK") nok++;
    else if (value === "SO") nc++;
  });
  const considered = ok + nok;
  const pct = considered ? (ok / considered) * 100 : null;
  let verdict = null;
  if (pct !== null) {
    if (pct >= 100) verdict = "CONFORME";
    else if (pct >= 80) verdict = "ADMIS_SOUS_RESERVES";
    else verdict = "REFUSE";
  }
  return { ok, nok, nc, considered, pct, verdict };
}

function updateArmoireNotation() {
  const pctLabel = document.getElementById("armoireNotationPct");
  const detailLabel = document.getElementById("armoireNotationDetail");
  const badge = document.getElementById("armoireNotationBadge");
  if (!pctLabel || !detailLabel || !badge) return;

  const { ok, considered, pct, verdict } = computeArmoireNotation();
  pctLabel.textContent = pct === null ? "—" : `${Math.round(pct)} %`;
  detailLabel.textContent =
    `${ok} point${ok > 1 ? "s" : ""} conforme${ok > 1 ? "s" : ""} sur ${considered} évalué${considered > 1 ? "s" : ""} (NC exclus)`;

  badge.classList.remove("verdict-pending", "verdict-ok", "verdict-warn", "verdict-refuse");
  if (!verdict) {
    badge.textContent = "En attente de saisie";
    badge.classList.add("verdict-pending");
  } else {
    badge.textContent = ARMOIRE_VERDICT_META[verdict].label;
    badge.classList.add(ARMOIRE_VERDICT_META[verdict].className);
  }
}

function getArmoirePayload() {
  const sections = ARMOIRE_CHECKLIST.map(section => ({
    id: section.id,
    title: section.title,
    note: section.note || "",
    items: section.items.map(item => {
      const row = document.querySelector(`.armoire-item[data-item-id="${item.id}"]`);
      if (item.type === "text") {
        return {
          id: item.id, label: item.label, type: "text", reg: false,
          comment: row?.querySelector(".armoire-comment")?.value.trim() || "",
        };
      }
      const activeBtn = row?.querySelector(".seg-btn.active");
      return {
        id: item.id, label: item.label, type: "check", reg: !!item.reg,
        value: activeBtn ? activeBtn.dataset.value : "",
        comment: row?.querySelector(".armoire-comment")?.value.trim() || "",
      };
    }),
  }));
  return {
    affaire: document.getElementById("aAffaire").value.trim(),
    identification: document.getElementById("aIdentification").value.trim(),
    plan: document.getElementById("aPlan").value.trim(),
    indice: document.getElementById("aIndice").value.trim(),
    cableur: document.getElementById("aCableur").value.trim(),
    controleur: document.getElementById("aControleur").value.trim(),
    reglementaire: document.getElementById("aReglementaire").checked,
    sections,
  };
}

function resetArmoireChecklist() {
  ["aAffaire", "aIdentification", "aPlan", "aIndice", "aCableur", "aControleur"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("aReglementaire").checked = true;
  document.querySelectorAll(".armoire-item .seg-btn.active").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".armoire-item").forEach(r => r.classList.remove("has-nok"));
  document.querySelectorAll(".armoire-comment").forEach(i => { i.value = ""; });
  ARMOIRE_CHECKLIST.forEach(section => updateArmoireSectionCount(section.id));
  updateArmoireNotation();
}

renderArmoireChecklist();
updateArmoireNotation();

/* ===================================================================== */
/*  Bibliothèque clients (client + sites)                                */
/* ===================================================================== */
async function loadClients() {
  state.clients = await api("/api/clients");
  const dl = document.getElementById("dlClients");
  dl.innerHTML = "";
  state.clients.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.nom;
    dl.appendChild(opt);
  });
}

function findClientByName(nom) {
  return state.clients.find(c => c.nom.toLowerCase() === (nom || "").trim().toLowerCase());
}

function onClientFieldChanged() {
  const client = findClientByName(document.getElementById("fClient").value);
  const dlSites = document.getElementById("dlSites");
  dlSites.innerHTML = "";
  if (!client) return;
  client.sites.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.site || "";
    dlSites.appendChild(opt);
  });
  if (client.sites.length === 1) {
    document.getElementById("fSite").value = client.sites[0].site || "";
    document.getElementById("fAdresse").value = client.sites[0].adresse || "";
    document.getElementById("fContact").value = client.sites[0].contact || "";
  }
}
function onSiteFieldChanged() {
  const client = findClientByName(document.getElementById("fClient").value);
  if (!client) return;
  const site = client.sites.find(s => (s.site || "") === document.getElementById("fSite").value);
  if (site) {
    document.getElementById("fAdresse").value = site.adresse || "";
    document.getElementById("fContact").value = site.contact || "";
  }
}

function renderClientsList() {
  const list = document.getElementById("clientsList");
  list.innerHTML = "";
  state.clients.forEach(c => {
    const sites = c.sites.length ? c.sites : [{ id: null, site: "", adresse: "", contact: "" }];
    sites.forEach(s => {
      const row = document.createElement("div");
      row.className = "modal-list-item";
      row.innerHTML = `${c.nom}${s.site ? " — " + s.site : ""}<div class="modal-list-sub">${s.adresse || ""}</div>`;
      row.addEventListener("click", () => {
        list.querySelectorAll(".modal-list-item").forEach(el => el.classList.remove("selected"));
        row.classList.add("selected");
        state.editingClientId = c.id;
        state.editingSiteId = s.id;
        document.getElementById("ceNom").value = c.nom;
        document.getElementById("ceSite").value = s.site || "";
        document.getElementById("ceAdresse").value = s.adresse || "";
        document.getElementById("ceContact").value = s.contact || "";
      });
      row.addEventListener("dblclick", () => applyClientToForm(c, s));
      list.appendChild(row);
    });
  });
}

document.getElementById("btnClientLibrary").addEventListener("click", () => {
  renderClientsList();
  clientFormNew();
  openModal("modalClients");
});
function clientFormNew() {
  state.editingClientId = null;
  state.editingSiteId = null;
  document.getElementById("formClientEdit").reset();
  document.getElementById("ceNom").focus();
}
document.getElementById("btnClientNew").addEventListener("click", clientFormNew);

/* Charge un client (+ site) de la bibliothèque dans le formulaire principal
   du rapport — c'est ce qui manquait : la bibliothèque ne faisait jusque-là
   que gérer les fiches (créer/modifier/supprimer), sans jamais les
   réinjecter dans le rapport en cours. */
function applyClientToForm(client, site) {
  document.getElementById("fClient").value = client.nom || "";
  document.getElementById("fSite").value = site?.site || "";
  document.getElementById("fAdresse").value = site?.adresse || "";
  document.getElementById("fContact").value = site?.contact || "";
  onClientFieldChanged();
  closeAllModals();
  setStatus(`Client « ${client.nom} » chargé dans le rapport`, "success");
}
document.getElementById("btnClientUse").addEventListener("click", () => {
  const nom = document.getElementById("ceNom").value.trim();
  if (!nom) {
    alert("Sélectionne d'abord un client dans la liste à gauche.");
    return;
  }
  const client = state.editingClientId
    ? state.clients.find(c => c.id === state.editingClientId)
    : { nom };
  const site = {
    site: document.getElementById("ceSite").value.trim(),
    adresse: document.getElementById("ceAdresse").value.trim(),
    contact: document.getElementById("ceContact").value.trim(),
  };
  applyClientToForm(client, site);
});

document.getElementById("formClientEdit").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nom = document.getElementById("ceNom").value.trim();
  const site = document.getElementById("ceSite").value.trim();
  const adresse = document.getElementById("ceAdresse").value.trim();
  const contact = document.getElementById("ceContact").value.trim();
  if (!nom) return;
  try {
    if (state.editingClientId) {
      await api(`/api/clients/${state.editingClientId}`, { method: "PUT", body: JSON.stringify({ nom }) });
      if (state.editingSiteId) {
        await api(`/api/sites/${state.editingSiteId}`, { method: "PUT", body: JSON.stringify({ site, adresse, contact }) });
      } else if (site || adresse || contact) {
        await api(`/api/clients/${state.editingClientId}/sites`, { method: "POST", body: JSON.stringify({ site, adresse, contact }) });
      }
    } else {
      await api("/api/clients", { method: "POST", body: JSON.stringify({ nom, site, adresse, contact }) });
    }
    await loadClients();
    renderClientsList();
    clientFormNew();
    setStatus("Bibliothèque clients mise à jour", "success");
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("btnClientDelete").addEventListener("click", async () => {
  if (!state.editingClientId) return;
  const ok = await confirmDialog("Supprimer ce client ?", "Le client et tous ses sites seront définitivement supprimés.");
  if (!ok) return;
  await api(`/api/clients/${state.editingClientId}`, { method: "DELETE" });
  await loadClients();
  renderClientsList();
  clientFormNew();
});

/* ===================================================================== */
/*  Bibliothèque techniciens                                             */
/* ===================================================================== */
async function loadTechniciens() {
  state.techniciens = await api("/api/techniciens");
  const dl = document.getElementById("dlTechniciens");
  dl.innerHTML = "";
  state.techniciens.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.nom;
    dl.appendChild(opt);
  });
}
function renderTechList() {
  const list = document.getElementById("techList");
  list.innerHTML = "";
  state.techniciens.forEach(t => {
    const row = document.createElement("div");
    row.className = "modal-list-item";
    row.textContent = t.nom;
    row.addEventListener("click", () => {
      list.querySelectorAll(".modal-list-item").forEach(el => el.classList.remove("selected"));
      row.classList.add("selected");
      state.editingTechId = t.id;
      document.getElementById("teNom").value = t.nom;
    });
    list.appendChild(row);
  });
}
document.getElementById("btnTechLibrary").addEventListener("click", () => {
  renderTechList();
  techFormNew();
  openModal("modalTechniciens");
});
function techFormNew() {
  state.editingTechId = null;
  document.getElementById("formTechEdit").reset();
  document.getElementById("teNom").focus();
}
document.getElementById("btnTechNew").addEventListener("click", techFormNew);

document.getElementById("formTechEdit").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nom = document.getElementById("teNom").value.trim();
  if (!nom) return;
  try {
    if (state.editingTechId) {
      await api(`/api/techniciens/${state.editingTechId}`, { method: "PUT", body: JSON.stringify({ nom }) });
    } else {
      await api("/api/techniciens", { method: "POST", body: JSON.stringify({ nom }) });
    }
    await loadTechniciens();
    renderTechList();
    techFormNew();
    setStatus("Bibliothèque techniciens mise à jour", "success");
  } catch (err) {
    alert(err.message);
  }
});
document.getElementById("btnTechDelete").addEventListener("click", async () => {
  if (!state.editingTechId) return;
  const ok = await confirmDialog("Supprimer ce technicien ?", "Cette action est irréversible.");
  if (!ok) return;
  await api(`/api/techniciens/${state.editingTechId}`, { method: "DELETE" });
  await loadTechniciens();
  renderTechList();
  techFormNew();
});

document.getElementById("btnTechUse").addEventListener("click", () => {
  const nom = document.getElementById("teNom").value.trim();
  if (!nom) {
    alert("Sélectionne d'abord un technicien dans la liste à gauche.");
    return;
  }
  const field = document.getElementById("fTechnicien");
  field.value = nom;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  closeAllModals();
  setStatus(`Technicien « ${nom} » chargé dans le rapport`, "success");
});

/* ===================================================================== */
/*  Logo client                                                          */
/* ===================================================================== */
const logoZone = document.getElementById("logoZone");
const logoFileInput = document.getElementById("logoFileInput");

async function loadLogos() {
  state.logos = await api("/api/logos");
  const sel = document.getElementById("logoLibrarySelect");
  sel.innerHTML = '<option value="">— Bibliothèque de logos —</option>';
  state.logos.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = l.nom;
    sel.appendChild(opt);
  });
}

/* ---------------------------------------------------------------------
   Compression des images côté navigateur avant envoi au serveur.
   Nécessaire car Vercel plafonne une requête de fonction serverless à
   4,5 Mo (limite fixe de la plateforme, non configurable) : une photo de
   téléphone (souvent 3 à 8 Mo) la dépasse à elle seule, d'où l'erreur
   "413" dès que plusieurs photos sont jointes à un rapport. On redimen-
   sionne et recompresse donc chaque image avant de l'ajouter à l'état,
   sans perte visible pour un rapport (1600px de large suffit largement).
   --------------------------------------------------------------------- */
function compressImageFile(file, { maxDim = 1600, quality = 0.82 } = {}) {
  return new Promise((resolve) => {
    // On ne retouche pas ce qui est déjà léger (ex: logo déjà petit) ou
    // les formats qu'un <canvas> ne saurait pas réencoder proprement.
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.size < 300 * 1024) {
      resolve(file);
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) {
          resolve(file); // la compression n'a rien gagné : on garde l'original
          return;
        }
        const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        resolve(new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() }));
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

async function setLogoClientFromFile(file) {
  const compressed = await compressImageFile(file, { maxDim: 1000, quality: 0.85 });
  state.logoClient = { file: compressed, url: null, name: compressed.name };
  showLogoFilled(URL.createObjectURL(compressed), compressed.name);
}
function setLogoClientFromLibrary(logo) {
  state.logoClient = { file: null, url: logo.url, name: logo.nom };
  showLogoFilled(logo.url, logo.nom);
}
function showLogoFilled(src, name) {
  document.getElementById("logoEmpty").classList.add("hidden");
  const filled = document.getElementById("logoFilled");
  filled.classList.remove("hidden");
  document.getElementById("logoThumb").src = src;
  document.getElementById("logoName").textContent = name;
}
function clearLogoClient() {
  state.logoClient = { file: null, url: null, name: "" };
  document.getElementById("logoEmpty").classList.remove("hidden");
  document.getElementById("logoFilled").classList.add("hidden");
  document.getElementById("logoLibrarySelect").value = "";
}

logoZone.addEventListener("click", (e) => {
  if (e.target.closest(".logo-filled")) return;
  logoFileInput.click();
});
logoZone.addEventListener("dragover", (e) => { e.preventDefault(); logoZone.style.borderColor = "#38BDF8"; });
logoZone.addEventListener("dragleave", () => { logoZone.style.borderColor = ""; });
logoZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  logoZone.style.borderColor = "";
  const file = e.dataTransfer.files[0];
  if (file) await setLogoClientFromFile(file);
});
logoFileInput.addEventListener("change", async () => {
  if (logoFileInput.files[0]) await setLogoClientFromFile(logoFileInput.files[0]);
  logoFileInput.value = "";
});
document.getElementById("btnLogoChange").addEventListener("click", (e) => { e.stopPropagation(); logoFileInput.click(); });
document.getElementById("btnLogoRemove").addEventListener("click", (e) => { e.stopPropagation(); clearLogoClient(); });

document.getElementById("logoLibrarySelect").addEventListener("change", (e) => {
  const id = e.target.value;
  if (!id) return;
  const logo = state.logos.find(l => String(l.id) === id);
  if (logo) setLogoClientFromLibrary(logo);
});

document.getElementById("btnLogoSaveLibrary").addEventListener("click", async () => {
  if (!state.logoClient.file && !state.logoClient.url) {
    alert("Dépose d'abord un logo dans la zone « Logo Client » avant de l'ajouter à la bibliothèque.");
    return;
  }
  const suggested = document.getElementById("fClient").value.trim() || "Logo";
  const nom = prompt("Nom à associer à ce logo dans la bibliothèque :", suggested);
  if (!nom) return;
  try {
    let blob;
    if (state.logoClient.file) {
      blob = state.logoClient.file;
    } else {
      blob = await (await fetch(state.logoClient.url)).blob();
    }
    const fd = new FormData();
    fd.append("nom", nom);
    fd.append("fichier", blob, state.logoClient.name || "logo.png");
    await api("/api/logos", { method: "POST", body: fd });
    await loadLogos();
    setStatus("Logo ajouté à la bibliothèque", "success");
  } catch (err) {
    alert(err.message);
  }
});

/* ===================================================================== */
/*  Galerie mixte photos / blocs de texte                                */
/* ===================================================================== */
const gallery = document.getElementById("gallery");
const photoFileInput = document.getElementById("photoFileInput");
const photoCameraInput = document.getElementById("photoCameraInput");
const photoZone = document.getElementById("photoZone");

async function addPhotoFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith("image/"));
  if (!files.length) return;
  setStatus(`Compression de ${files.length > 1 ? `${files.length} photos` : "la photo"}…`, "info");
  const compressed = await Promise.all(files.map(f => compressImageFile(f)));
  compressed.forEach(file => {
    state.gallery.push({ type: "photo", file, previewUrl: URL.createObjectURL(file), caption: file.name.replace(/\.[^.]+$/, ""), scale: 1.0 });
  });
  renderGallery();
  setStatus("Prêt", "info");
}

photoZone.addEventListener("click", () => photoFileInput.click());
photoZone.addEventListener("dragover", (e) => { e.preventDefault(); photoZone.classList.add("dragover"); });
photoZone.addEventListener("dragleave", () => photoZone.classList.remove("dragover"));
photoZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  photoZone.classList.remove("dragover");
  await addPhotoFiles(e.dataTransfer.files);
});
photoFileInput.addEventListener("change", async () => {
  await addPhotoFiles(photoFileInput.files);
  photoFileInput.value = "";
});
// "capture=environment" fait ouvrir directement l'appareil photo sur un
// smartphone (au lieu du sélecteur de fichiers classique) ; sur un
// ordinateur sans webcam adaptée, le navigateur retombe simplement sur un
// sélecteur de fichiers normal — aucune dégradation à gérer explicitement.
document.getElementById("btnTakePhoto").addEventListener("click", () => photoCameraInput.click());
photoCameraInput.addEventListener("change", async () => {
  await addPhotoFiles(photoCameraInput.files);
  photoCameraInput.value = "";
});
document.getElementById("btnAddText").addEventListener("click", () => {
  state.gallery.push({ type: "text", text: "" });
  renderGallery();
});
function updatePhotoCount() {
  const n = state.gallery.filter(it => it.type === "photo").length;
  document.getElementById("photoCount").textContent = `${n} photo${n > 1 ? "s" : ""}`;
}

function renderGallery() {
  gallery.innerHTML = "";

  const addInsertRow = (index) => {
    const row = document.createElement("div");
    row.className = "gallery-insert";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "+ Texte ici";
    btn.addEventListener("click", () => {
      state.gallery.splice(index, 0, { type: "text", text: "" });
      renderGallery();
    });
    row.appendChild(btn);
    gallery.appendChild(row);
  };

  addInsertRow(0);
  state.gallery.forEach((item, idx) => {
    gallery.appendChild(buildGalleryItemEl(item, idx));
    addInsertRow(idx + 1);
  });
  updatePhotoCount();
}

function buildGalleryItemEl(item, idx) {
  const el = document.createElement("div");
  el.className = `gallery-item ${item.type}`;

  if (item.type === "photo") {
    const thumb = document.createElement("img");
    thumb.className = "gallery-thumb";
    thumb.src = item.previewUrl;
    thumb.addEventListener("click", () => openImagePreview(item.previewUrl));
    el.appendChild(thumb);

    const main = document.createElement("div");
    main.className = "gallery-main";
    main.innerHTML = `<div class="cap-label">Légende :</div>`;
    const input = document.createElement("input");
    input.type = "text";
    input.value = item.caption;
    input.addEventListener("input", () => { item.caption = input.value; });
    main.appendChild(input);
    el.appendChild(main);
  } else {
    const main = document.createElement("div");
    main.className = "gallery-main";
    main.innerHTML = `<div class="text-block-title">📝 Texte libre</div>`;
    const textarea = document.createElement("textarea");
    textarea.rows = 2;
    textarea.value = item.text;
    textarea.id = `txt-${idx}-${Date.now()}`;
    textarea.addEventListener("input", () => { item.text = textarea.value; });
    main.appendChild(textarea);
    const emojiBar = document.createElement("div");
    emojiBar.className = "emoji-bar";
    main.appendChild(emojiBar);
    el.appendChild(main);
    // Barre d'emoji spécifique à ce bloc (insère dans son propre textarea)
    QUICK_SYMBOLS.forEach(symbol => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-btn";
      btn.textContent = symbol;
      btn.addEventListener("click", () => insertAtCursor(textarea, symbol));
      emojiBar.appendChild(btn);
    });
  }

  const controls = document.createElement("div");
  controls.className = "gallery-controls";

  const btnUp = document.createElement("button");
  btnUp.className = "ctrl-btn";
  btnUp.textContent = "▲";
  btnUp.title = "Remonter";
  btnUp.addEventListener("click", () => moveGalleryItem(idx, -1));
  controls.appendChild(btnUp);

  const btnDown = document.createElement("button");
  btnDown.className = "ctrl-btn";
  btnDown.textContent = "▼";
  btnDown.title = "Descendre";
  btnDown.addEventListener("click", () => moveGalleryItem(idx, 1));
  controls.appendChild(btnDown);

  if (item.type === "photo") {
    const btnResize = document.createElement("button");
    btnResize.className = "ctrl-btn";
    btnResize.textContent = "⤢";
    btnResize.title = `Redimensionner (${Math.round(item.scale * 100)}%)`;
    btnResize.addEventListener("click", () => {
      const value = prompt(
        "Taille de l'image dans le rapport, en % de la taille par défaut :\n(100% = taille automatique habituelle)",
        String(Math.round(item.scale * 100))
      );
      if (value === null) return;
      const n = parseInt(value, 10);
      if (!isNaN(n) && n >= 25 && n <= 300) {
        item.scale = n / 100;
        renderGallery();
      }
    });
    controls.appendChild(btnResize);
  }

  const btnDel = document.createElement("button");
  btnDel.className = "ctrl-btn danger";
  btnDel.textContent = "✕";
  btnDel.title = "Supprimer";
  btnDel.addEventListener("click", () => {
    state.gallery.splice(idx, 1);
    renderGallery();
  });
  controls.appendChild(btnDel);

  el.appendChild(controls);
  return el;
}

function moveGalleryItem(idx, direction) {
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= state.gallery.length) return;
  const tmp = state.gallery[idx];
  state.gallery[idx] = state.gallery[newIdx];
  state.gallery[newIdx] = tmp;
  renderGallery();
}

function openImagePreview(src) {
  document.getElementById("previewImageFull").src = src;
  openModal("modalImagePreview");
}

/* ===================================================================== */
/*  Signatures (canvas tactile / souris / stylet)                        */
/* ===================================================================== */
const SIG_KEYS = [
  { key: "technicien", label: "SIGNATURE TECHNICIEN", sourceField: "fTechnicien" },
  { key: "client", label: "SIGNATURE CLIENT", sourceField: "fClient" },
  { key: "exterieur", label: "SIGNATURE INTERVENANT EXTÉRIEUR", sourceField: null },
];

function buildSignatureBlocks() {
  const container = document.getElementById("sigBlocks");
  container.innerHTML = "";
  SIG_KEYS.forEach(({ key, label }) => {
    const block = document.createElement("div");
    block.className = "sig-block";
    block.innerHTML = `
      <label>${label}</label>
      <input type="text" id="sigName-${key}" value="${state.signatures[key].nom || ""}">
      <div class="sig-canvas-wrap">
        <canvas class="sig-canvas" id="sigCanvas-${key}" width="380" height="130"></canvas>
      </div>
      <button type="button" class="sig-clear" data-sig-clear="${key}">Effacer la signature</button>
    `;
    container.appendChild(block);
  });

  SIG_KEYS.forEach(({ key }) => setupSignatureCanvas(key));
  container.querySelectorAll("[data-sig-clear]").forEach(btn => {
    btn.addEventListener("click", () => clearSignatureCanvas(btn.dataset.sigClear));
  });
}

const sigCanvasCtx = {};
function setupSignatureCanvas(key) {
  const canvas = document.getElementById(`sigCanvas-${key}`);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state.signatures[key].dataUrl) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = state.signatures[key].dataUrl;
  }
  sigCanvasCtx[key] = { canvas, ctx, drawing: false, hasInk: !!state.signatures[key].dataUrl, lastX: 0, lastY: 0 };

  const getPos = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const point = evt.touches ? evt.touches[0] : evt;
    return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
  };

  const start = (evt) => {
    evt.preventDefault();
    const st = sigCanvasCtx[key];
    st.drawing = true;
    const pos = getPos(evt);
    st.lastX = pos.x; st.lastY = pos.y;
  };
  const move = (evt) => {
    const st = sigCanvasCtx[key];
    if (!st.drawing) return;
    evt.preventDefault();
    const pos = getPos(evt);
    st.ctx.strokeStyle = "#0B0F19";
    st.ctx.lineWidth = 2.4;
    st.ctx.lineCap = "round";
    st.ctx.lineJoin = "round";
    st.ctx.beginPath();
    st.ctx.moveTo(st.lastX, st.lastY);
    st.ctx.lineTo(pos.x, pos.y);
    st.ctx.stroke();
    st.lastX = pos.x; st.lastY = pos.y;
    st.hasInk = true;
  };
  const end = () => { sigCanvasCtx[key].drawing = false; };

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
}
function clearSignatureCanvas(key) {
  const st = sigCanvasCtx[key];
  st.ctx.fillStyle = "#FFFFFF";
  st.ctx.fillRect(0, 0, st.canvas.width, st.canvas.height);
  st.hasInk = false;
}

document.getElementById("btnSignatures").addEventListener("click", () => {
  buildSignatureBlocks();
  // Pré-remplissage : technicien/client du rapport en cours si pas déjà défini.
  if (!state.signatures.technicien.nom) {
    document.getElementById("sigName-technicien").value = document.getElementById("fTechnicien").value;
  }
  if (!state.signatures.client.nom) {
    document.getElementById("sigName-client").value = document.getElementById("fClient").value;
  }
  openModal("modalSignatures");
});

document.getElementById("btnSigValidate").addEventListener("click", () => {
  SIG_KEYS.forEach(({ key }) => {
    const nom = document.getElementById(`sigName-${key}`).value.trim();
    const st = sigCanvasCtx[key];
    state.signatures[key] = {
      nom,
      dataUrl: st.hasInk ? st.canvas.toDataURL("image/png") : null,
    };
  });
  closeAllModals();
  setStatus("Signatures enregistrées", "success");
});

/* ===================================================================== */
/*  Génération du rapport (.docx ou .pdf — même contenu, deux formats)   */
/* ===================================================================== */
async function buildGenerateFormData() {
  const content = [];
  const photoFiles = [];
  for (const item of state.gallery) {
    if (item.type === "photo") {
      const idx = photoFiles.length;
      photoFiles.push(item.file);
      content.push({ type: "photo", photo_index: idx, caption: item.caption, scale: item.scale });
    } else {
      if (item.text.trim()) content.push({ type: "text", text: item.text });
    }
  }

  const payload = {
    template: state.template,
    folder: document.getElementById("fFolder").value.trim(),
    date: document.getElementById("fDate").value.trim(),
    technicien: document.getElementById("fTechnicien").value.trim(),
    client: document.getElementById("fClient").value.trim(),
    site: document.getElementById("fSite").value.trim(),
    adresse: document.getElementById("fAdresse").value.trim(),
    include_map: document.getElementById("fIncludeMap").checked,
    contact: document.getElementById("fContact").value.trim(),
    equipement: document.getElementById("fEquipement").value.trim(),
    serie: document.getElementById("fSerie").value.trim(),
    observations: document.getElementById("fObservations").value.trim(),
    filename: document.getElementById("fFilename").value.trim() || "rapport",
    items: state.template === "verif_armoire" ? [] : getItemsPayload(),
    armoire: state.template === "verif_armoire" ? getArmoirePayload() : null,
    content,
    signatures: {
      technicien: { nom: state.signatures.technicien.nom || document.getElementById("fTechnicien").value.trim(), image: state.signatures.technicien.dataUrl },
      client: { nom: state.signatures.client.nom || document.getElementById("fClient").value.trim(), image: state.signatures.client.dataUrl },
      exterieur: { nom: state.signatures.exterieur.nom, image: state.signatures.exterieur.dataUrl },
    },
  };

  const fd = new FormData();
  fd.append("payload", JSON.stringify(payload));
  photoFiles.forEach((file, i) => fd.append(`photo_${i}`, file));
  if (state.logoClient.file) {
    fd.append("logo", state.logoClient.file);
  } else if (state.logoClient.url) {
    const blob = await (await fetch(state.logoClient.url)).blob();
    fd.append("logo", blob, "logo.png");
  }

  // Estimation de la taille totale envoyée (photos + logo + signatures en
  // base64 dans le payload JSON) : Vercel plafonne une requête de fonction
  // serverless à 4,5 Mo, limite fixe de la plateforme. On prévient donc
  // clairement plutôt que de laisser échouer avec un 413 cryptique.
  let estimatedBytes = JSON.stringify(payload).length;
  for (const file of photoFiles) estimatedBytes += file.size;
  if (state.logoClient.file) estimatedBytes += state.logoClient.file.size;

  return { fd, filename: payload.filename, estimatedBytes };
}

async function generateReportFile({ endpoint, extension, statusVerb }) {
  setStatus(`${statusVerb} en cours…`, "info");
  try {
    const { fd, filename, estimatedBytes } = await buildGenerateFormData();

    const MAX_BYTES = 4.3 * 1024 * 1024; // marge sous la limite Vercel (4,5 Mo)
    if (estimatedBytes > MAX_BYTES) {
      throw new Error(
        `Le rapport est trop volumineux pour être envoyé (≈${(estimatedBytes / 1024 / 1024).toFixed(1)} Mo, `
        + `limite 4,5 Mo). Retirez quelques photos ou générez le rapport en plusieurs fois.`
      );
    }

    const resp = await fetch(endpoint, { method: "POST", credentials: "same-origin", body: fd });
    if (!resp.ok) {
      let msg = `Erreur serveur (${resp.status})`;
      if (resp.status === 413) {
        msg = "Le rapport est trop volumineux pour être envoyé (limite 4,5 Mo). Retirez quelques photos ou générez le rapport en plusieurs fois.";
      } else {
        try { const j = await resp.json(); msg = j.error || msg; } catch (_) {}
      }
      throw new Error(msg);
    }
    // Avertissement best-effort remonté par le serveur si le rapport n'a
    // pas pu être enregistré dans "Tous les rapports" (Blob/DB), même si
    // le fichier généré ci-dessous est bien valide et téléchargé.
    const rawSaveWarning = resp.headers.get("X-Report-Save-Warning");
    const saveWarning = rawSaveWarning ? decodeURIComponent(rawSaveWarning) : null;

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.toLowerCase().endsWith(`.${extension}`) ? filename : `${filename}.${extension}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (saveWarning) {
      setStatus(`Rapport ${extension.toUpperCase()} généré, mais pas enregistré dans "Tous les rapports" : ${saveWarning}`, "error");
    } else {
      setStatus(`Rapport ${extension.toUpperCase()} généré avec succès`, "success");
    }
  } catch (err) {
    setStatus(`Échec : ${err.message}`, "error");
  }
}

document.getElementById("btnGenerate").addEventListener("click", () => {
  generateReportFile({ endpoint: "/api/generate", extension: "docx", statusVerb: "Génération du rapport Word" });
});
document.getElementById("btnGeneratePdf").addEventListener("click", () => {
  generateReportFile({ endpoint: "/api/generate-pdf", extension: "pdf", statusVerb: "Génération du rapport PDF" });
});

/* ===================================================================== */
/*  Envoi du rapport par email                                           */
/* ===================================================================== */
document.getElementById("btnEmailReport").addEventListener("click", () => {
  document.getElementById("emailError").classList.add("hidden");
  const emailToInput = document.getElementById("emailTo");
  if (!emailToInput.value) {
    emailToInput.value = state.user?.email || "";
  }
  openModal("modalEmail");
});

document.getElementById("btnEmailSend").addEventListener("click", async () => {
  const emailError = document.getElementById("emailError");
  emailError.classList.add("hidden");

  const emailTo = document.getElementById("emailTo").value.trim();
  if (!emailTo || !emailTo.includes("@")) {
    emailError.textContent = "Merci de saisir une adresse email valide.";
    emailError.classList.remove("hidden");
    return;
  }
  const emailFormat = document.getElementById("emailFormat").value;

  const btn = document.getElementById("btnEmailSend");
  btn.disabled = true;
  btn.textContent = "Envoi en cours…";
  try {
    const { fd, estimatedBytes } = await buildGenerateFormData();

    const MAX_BYTES = 4.3 * 1024 * 1024;
    if (estimatedBytes > MAX_BYTES) {
      throw new Error(
        `Le rapport est trop volumineux pour être envoyé (≈${(estimatedBytes / 1024 / 1024).toFixed(1)} Mo, `
        + `limite 4,5 Mo). Retirez quelques photos ou générez le rapport en plusieurs fois.`
      );
    }

    fd.append("email_to", emailTo);
    fd.append("email_format", emailFormat);

    const resp = await fetch("/api/send-report-email", { method: "POST", credentials: "same-origin", body: fd });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || `Erreur serveur (${resp.status})`);
    }

    closeAllModals();
    if (data.save_warning) {
      setStatus(`Rapport envoyé à ${data.sent_to}, mais pas enregistré dans "Tous les rapports" : ${data.save_warning}`, "error");
    } else {
      setStatus(`Rapport envoyé par email à ${data.sent_to}`, "success");
    }
  } catch (err) {
    emailError.textContent = err.message;
    emailError.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Envoyer";
  }
});

/* ===================================================================== */
/*  Réinitialisation du formulaire                                       */
/* ===================================================================== */
document.getElementById("btnReset").addEventListener("click", async () => {
  const ok = await confirmDialog(
    "Réinitialiser le rapport ?",
    "Tous les champs, photos, textes, le logo client et les signatures en cours seront effacés. Cette action est irréversible."
  );
  if (!ok) return;

  ["fFolder", "fTechnicien", "fClient", "fSite", "fAdresse", "fContact", "fEquipement", "fSerie", "fObservations"]
    .forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("fIncludeMap").checked = false;
  state.template = "intervention";
  document.querySelectorAll(".template-tab").forEach(t => t.classList.toggle("active", t.dataset.template === "intervention"));
  setDefaultDateAndFilename();

  itemsBody.innerHTML = "";
  selectedRow = null;
  buildItemsTableEmptyRow();

  resetArmoireChecklist();
  applyTemplateVisibility("intervention");

  state.gallery = [];
  renderGallery();

  clearLogoClient();

  state.signatures = {
    technicien: { nom: "", dataUrl: null },
    client: { nom: "", dataUrl: null },
    exterieur: { nom: "", dataUrl: null },
  };

  setStatus("Formulaire réinitialisé", "info");
});

/* ===================================================================== */
/*  Modales génériques                                                   */
/* ===================================================================== */
function openModal(id) {
  document.getElementById("modalBackdrop").classList.remove("hidden");
  document.getElementById(id).classList.remove("hidden");
}
function closeAllModals() {
  document.getElementById("modalBackdrop").classList.add("hidden");
  document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
}
function wireStaticButtons() {
  document.getElementById("modalBackdrop").addEventListener("click", closeAllModals);
  document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", closeAllModals));
}

/* ===================================================================== */
/*  Sélecteur de template de rapport                                     */
/* ===================================================================== */
function applyTemplateVisibility(template) {
  document.querySelectorAll(".tpl-panel").forEach(panel => {
    panel.classList.toggle("hidden", !panel.classList.contains(`tpl-${template}`));
  });
  // Thème clair bleu/vert propre à l'onglet Crealis.
  document.documentElement.classList.toggle("theme-crealis", template === "crealis");
}

document.querySelectorAll(".template-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".template-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    state.template = tab.dataset.template;
    applyTemplateVisibility(state.template);
  });
});
applyTemplateVisibility(state.template);

let confirmResolver = null;
function confirmDialog(title, message) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMessage").textContent = message;
  openModal("modalConfirm");
  return new Promise(resolve => { confirmResolver = resolve; });
}
document.getElementById("btnConfirmOk").addEventListener("click", () => {
  closeAllModals();
  if (confirmResolver) { confirmResolver(true); confirmResolver = null; }
});
document.getElementById("modalConfirm").querySelector("[data-close]").addEventListener("click", () => {
  if (confirmResolver) { confirmResolver(false); confirmResolver = null; }
});
document.getElementById("modalBackdrop").addEventListener("click", () => {
  if (confirmResolver) { confirmResolver(false); confirmResolver = null; }
});

/* ===================================================================== */
/*  Carte (adresse client)                                               */
/* ===================================================================== */
document.getElementById("btnMapAdresse").addEventListener("click", () => {
  const adresse = document.getElementById("fAdresse").value.trim();
  if (!adresse) {
    alert("Renseigne d'abord l'adresse du client avant de l'afficher sur la carte.");
    return;
  }
  // Inclure le nom du client aide Google Maps à mieux situer une adresse
  // partielle (ex: sans ville) quand ce champ est rempli.
  const client = document.getElementById("fClient").value.trim();
  const query = encodeURIComponent(client ? `${adresse} (${client})` : adresse);

  document.getElementById("mapModalTitle").textContent = `Adresse — ${adresse}`;
  document.getElementById("mapIframe").src = `https://www.google.com/maps?q=${query}&output=embed`;
  document.getElementById("mapOpenExternal").href = `https://www.google.com/maps/search/?api=1&query=${query}`;
  openModal("modalMap");
});
document.getElementById("modalMap").querySelector("[data-close]").addEventListener("click", () => {
  document.getElementById("mapIframe").src = ""; // stoppe le chargement de la carte une fois fermée
});
document.getElementById("modalBackdrop").addEventListener("click", () => {
  const frame = document.getElementById("mapIframe");
  if (frame.src) frame.src = "";
});

/* ===================================================================== */
/*  Mes rapports (historique des rapports Word générés)                  */
/* ===================================================================== */
function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
function formatRapportDate(iso) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

async function renderRapportsList() {
  const list = document.getElementById("rapportsList");
  list.innerHTML = '<div class="modal-empty">Chargement…</div>';
  let rapports;
  try {
    rapports = await api("/api/rapports");
  } catch (err) {
    list.innerHTML = `<div class="modal-empty">Impossible de charger la liste : ${err.message}</div>`;
    return;
  }
  if (!rapports.length) {
    list.innerHTML = '<div class="modal-empty">Aucun rapport enregistré pour l’instant — ils apparaîtront ici après chaque génération (Word, PDF ou envoi par email).</div>';
    return;
  }
  list.innerHTML = "";
  rapports.forEach(r => {
    const row = document.createElement("div");
    row.className = "rapport-row";
    const metaParts = [r.client, r.date_rapport, formatFileSize(r.taille_octets), formatRapportDate(r.created_at)].filter(Boolean);
    row.innerHTML = `
      <div class="rapport-main">
        <div class="rapport-nom">${r.nom}</div>
        <div class="rapport-meta">${metaParts.join(" · ")}</div>
      </div>
      <div class="rapport-actions">
        <a class="btn btn-ghost btn-sm" href="${r.url}" download="${r.nom}" target="_blank" rel="noopener">⤓ Télécharger</a>
        <button type="button" class="btn btn-danger-ghost btn-sm" data-id="${r.id}">Supprimer</button>
      </div>
    `;
    row.querySelector("[data-id]").addEventListener("click", async () => {
      const ok = await confirmDialog("Supprimer ce rapport ?", `« ${r.nom} » sera définitivement supprimé pour tout le monde.`);
      if (!ok) return;
      await api(`/api/rapports/${r.id}`, { method: "DELETE" });
      renderRapportsList();
    });
    list.appendChild(row);
  });
}

document.getElementById("btnMesRapports").addEventListener("click", () => {
  openModal("modalRapports");
  renderRapportsList();
});

renderGallery();
