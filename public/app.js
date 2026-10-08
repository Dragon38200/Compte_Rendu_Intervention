"use strict";

/* ===================================================================== */
/*  État global                                                          */
/* ===================================================================== */
const state = {
  user: null,
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
  try {
    const user = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value,
        password: document.getElementById("loginPassword").value,
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
    folder: document.getElementById("fFolder").value.trim(),
    date: document.getElementById("fDate").value.trim(),
    technicien: document.getElementById("fTechnicien").value.trim(),
    client: document.getElementById("fClient").value.trim(),
    site: document.getElementById("fSite").value.trim(),
    adresse: document.getElementById("fAdresse").value.trim(),
    contact: document.getElementById("fContact").value.trim(),
    equipement: document.getElementById("fEquipement").value.trim(),
    serie: document.getElementById("fSerie").value.trim(),
    observations: document.getElementById("fObservations").value.trim(),
    filename: document.getElementById("fFilename").value.trim() || "rapport",
    items: getItemsPayload(),
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
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.toLowerCase().endsWith(`.${extension}`) ? filename : `${filename}.${extension}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus(`Rapport ${extension.toUpperCase()} généré avec succès`, "success");
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
  setDefaultDateAndFilename();

  itemsBody.innerHTML = "";
  selectedRow = null;
  buildItemsTableEmptyRow();

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

renderGallery();
