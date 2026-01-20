// ===============================
// Bacteriology Text - script.js (FULL)
// - items.json / morphoPhysioClassification.json / taxa.json 対応
// - 学名 + タキソノミー（Bacteria > ... > Genus）表示
// - MRSA/EHEC等は baseSpecies を参照して taxonomy を表示
// ===============================

let items = [];
let morpho = null;

// taxa tree -> map(id -> node + parent)
let taxaRoot = null;
let taxaMap = {}; // { id: {id, rank, label, description, children, parent } }

const listEl = document.getElementById("list");
const contentEl = document.getElementById("content");
const searchInput = document.getElementById("searchInput");
const importanceFilter = document.getElementById("importanceFilter");
const viewMode = document.getElementById("viewMode");

const sectionLabels = {
  bacteriology: "細菌学的特徴",
  clinical: "臨床的特徴",
  diagnosis: "診断",
  treatment: "治療",
  infectionControl: "感染対策",
  law: "感染症法",
  biosafety: "バイオセーフティ",
  lpsn: "LPSN（命名・分類）"
};

// --- boot ---
Promise.all([
  fetch("data/build/items.json").then(r => r.json()),
  fetch("data/morphoPhysioClassification.json").then(r => r.json()),
  fetch("data/taxa.json").then(r => r.json())
]).then(([itemData, morphoData, taxaData]) => {
  items = itemData.items || [];
  morpho = morphoData.morphoPhysioClassification || null;

  taxaRoot = taxaData || null;
  taxaMap = {};
  if (taxaRoot) buildTaxaMap(taxaRoot, null);

  renderItems();
  handleHash();
}).catch(err => {
  console.error(err);
  contentEl.innerHTML = `<p>データの読み込みに失敗しました。data/*.json を確認してください。</p>`;
});

// listeners
searchInput.addEventListener("input", renderItems);
importanceFilter.addEventListener("change", renderItems);
viewMode.addEventListener("change", renderItems);
window.addEventListener("hashchange", handleHash);

// ===============================
// 左ペイン描画
// ===============================
function renderItems() {
  listEl.innerHTML = "";

  if (viewMode.value === "items") {
    const keyword = (searchInput.value || "").toLowerCase();
    const imp = Number(importanceFilter.value || 0);

    items
      .filter(i => {
        const text = [
          i.title || "",
          i.summary || "",
          ...(i.tags || []),
          ...(i.labels || [])
        ].join(" ").toLowerCase();
        return text.includes(keyword) && (imp === 0 || (Number(i.importance || 0) >= imp));
      })
      .forEach(i => addItemLink(i));
  } else {
    if (!morpho?.groups) {
      listEl.innerHTML = "<p>分類データがありません。</p>";
      return;
    }
    renderMorphoGroups(morpho.groups);
  }
}

function addItemLink(item) {
  const div = document.createElement("div");
  div.className = "item";
  div.innerHTML = `
    <strong>${escapeHTML(item.title || "(no title)")}</strong><br>
    <small>重要度 ${escapeHTML(String(item.importance ?? ""))}</small>
  `;
  div.onclick = () => showItem(item);
  listEl.appendChild(div);
}

// ===============================
// 形態・性質分類表示
// ===============================
function renderMorphoGroups(groups) {
  groups.forEach(g => {
    const gDiv = document.createElement("div");
    gDiv.className = "group";
    gDiv.innerHTML = `<div class="group-title">${escapeHTML(g.label || "")}</div>`;
    listEl.appendChild(gDiv);

    if (g.subgroups) renderMorphoGroups(g.subgroups);

    if (g.items) {
      g.items.forEach(id => {
        const item = items.find(i => i.id === id);
        if (item) addItemLink(item);
      });
    }
  });
}

// ===============================
// taxa.json -> map
// ===============================
function buildTaxaMap(node, parentId = null) {
  taxaMap[node.id] = {
    ...node,
    parent: parentId
  };
  (node.children || []).forEach(child => buildTaxaMap(child, node.id));
}

function getTaxonomyPathFromGenusId(genusId) {
  if (!genusId || !taxaMap[genusId]) return [];
  const path = [];
  let cur = taxaMap[genusId];
  while (cur) {
    path.unshift(cur.label || cur.id);
    cur = cur.parent ? taxaMap[cur.parent] : null;
  }
  return path;
}

function getGenusLabel(genusId) {
  if (genusId && taxaMap[genusId]?.label) return taxaMap[genusId].label;
  return capitalize(genusId || "");
}

// ===============================
// 本文表示
// ===============================
function showItem(item) {
  location.hash = item.id;

  // (1) taxonomy を辿る "species item" を決定
  // species -> 自分
  // clinical/pathotype -> baseSpecies を参照
  const resolved = resolveBaseSpecies(item);

  // (2) 学名（Genus species）
  const sciName = resolved
    ? `${getGenusLabel(resolved.taxonGenus)} ${resolved.species || ""}`.trim()
    : "";

  const sciHTML = sciName
    ? `<div class="scientific-name"><em>${escapeHTML(sciName)}</em></div>`
    : "";

  // (3) taxonomy パス（Bacteria > ... > Genus）
  let taxonomyHTML = "";
  if (resolved?.taxonGenus) {
    const path = getTaxonomyPathFromGenusId(resolved.taxonGenus);
    if (path.length) {
      taxonomyHTML = `
        <div class="taxonomy">
          <em>${path.join(" ＞ ")}</em>
        </div>
      `;
    }
  }

  // (4) labels（MRSA/EHECなど）
  let labelsHTML = "";
  if (item.labels && resolved) {
    labelsHTML = `
      <div class="clinical-concept">
        <strong>Base species：</strong>
        <a href="#${resolved.id}">${resolved.title}</a><br>
        <strong>Clinical concept：</strong>
        ${item.labels.join(", ")}
      </div>
    `;
  }

  // (5) タイトル・概要
  let html = `
    <h2>${escapeHTML(item.title || "")}</h2>
    ${sciHTML}
    ${taxonomyHTML}
    ${labelsHTML}
    <p><strong>概要：</strong>${escapeHTML(item.summary || "")}</p>
    ${item.tags?.length ? `<p><strong>タグ：</strong>${escapeHTML(item.tags.join(", "))}</p>` : ""}
  `;

  // (6) baseSpecies 情報（conceptの場合のみ補助表示）
  if (item.entryType !== "species") {
    const base = resolved;

  }

  html += `<hr>`;

  // (7) body sections（item.body を優先表示）
  html += renderBodySections(item);
  // (7.5) reference
  if (item.reference?.length) {
    html += `
      <hr>
      <h3>参考文献</h3>
      <ul class="references">
    `;
    item.reference.forEach(ref => {
      const title = escapeHTML(ref.title || "");
      const url = ref.url ? escapeAttr(ref.url) : null;

      if (url) {
        html += `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></li>`;
      } else {
        html += `<li>${title}</li>`;
      }
    });
    html += "</ul>";
  }
  // concept の場合、必要なら base species の本文も見られるようリンクだけ用意
  if (item.entryType !== "species") {
    const base = resolved;
    if (base) {
      html += `
        <hr>
        <p><strong>参考：</strong><a href="#${escapeHTML(base.id)}">${escapeHTML(base.title || base.id)} の本文へ</a></p>
      `;
    }
  }

  // (8) related
  if (item.related?.length) {
    html += "<hr><ul>";
    item.related.forEach(id => {
      const r = items.find(i => i.id === id);
      if (r) html += `<li><a href="#${escapeHTML(r.id)}">${escapeHTML(r.title)}</a></li>`;
    });
    html += "</ul>";
  }

  contentEl.innerHTML = html;
}

function renderBodySections(item) {
  let html = "";
  const body = item.body || {};

  for (const key of Object.keys(sectionLabels)) {
    const val = body[key];
    if (!val) continue;

    if (key === "lpsn") {
      html += `
        <h3>${sectionLabels[key]}</h3>
        <p><a href="${escapeAttr(val)}" target="_blank" rel="noopener noreferrer">LPSN official page</a></p>
      `;
    } else {
      html += `<h3>${sectionLabels[key]}</h3><p>${escapeHTML(val).replace(/\n/g, "<br>")}</p>`;
    }
  }

  // body が空なら、最低限の案内
  if (!html) {
    html = `<p>${escapeHTML("（本文は準備中）")}</p>`;
  }
  return html;
}

function resolveBaseSpecies(item) {
  if (!item) return null;

  if (item.entryType === "species") return item;

  const baseId = item.baseSpecies;
  if (!baseId) return null;

  const base = items.find(i => i.id === baseId);
  if (!base) return null;

  // baseSpecies が concept の誤指定でも、最終的に species まで追う（保険）
  if (base.entryType === "species") return base;
  if (base.baseSpecies) {
    const base2 = items.find(i => i.id === base.baseSpecies);
    return base2?.entryType === "species" ? base2 : base;
  }
  return base;
}

// ===============================
function handleHash() {
  const id = location.hash.replace("#", "");
  if (!id) return;
  const item = items.find(i => i.id === id);
  if (item) showItem(item);
}

// utils
function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  // simple attribute escaping
  return String(str ?? "")
    .replace(/"/g, "&quot;")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
}

function capitalize(s) {
  s = String(s ?? "");
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
