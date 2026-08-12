const STORAGE_KEY = "gtscout_planering";

const DEFAULT_PLANNINGS = [
    { level: "Familjescouting", names: ["\u00c5r 1 HT", "\u00c5r 2 VT"] },
    { level: "Sp\u00e5rare",        names: ["\u00c5r 1 HT", "\u00c5r 2 VT", "\u00c5r 2 HT", "\u00c5r 3 VT"] },
    { level: "Uppt\u00e4ckare",    names: ["\u00c5r 1 HT", "\u00c5r 2 VT", "\u00c5r 2 HT", "\u00c5r 3 VT", "\u00c5r 3 HT", "\u00c5r 4 VT"] },
    { level: "\u00c4ventyrare",    names: ["\u00c5r 1 HT", "\u00c5r 2 VT", "\u00c5r 2 HT", "\u00c5r 3 VT", "\u00c5r 3 HT", "\u00c5r 4 VT"] },
    { level: "Utmanare",       names: ["\u00c5r 1 HT", "\u00c5r 2 VT", "\u00c5r 2 HT", "\u00c5r 3 VT"] },
    { level: "Rover",          names: ["\u00c5r 1 VT", "\u00c5r 1 HT"] },
];

let allMarken = [];
let groups = loadGroups();
let activeGroupId = null; // which group is getting badges added
let groupFilters = { search: "", level: "Alla" };

// ── Persistence ────────────────────────────────────────────────────────────

function loadGroups() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}

function saveGroups() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadMarken() {
    try {
        const response = await fetch("data/marken.json");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        allMarken = await response.json();
    } catch (err) {
        console.error("Kunde inte ladda marken.json", err);
    }
    renderPlanning();
    populatePickerFilters();
}

// ── Target-group helper (matches app.js) ───────────────────────────────────

function getTargetGroup(marke) {
    const rawGroup = (marke.grupp || marke.malgrupp || marke.målgrupp || "Ingen målgrupp").toString().trim();
    const map = {
        "familjescouting": "Familjescouting",
        "spårare": "Spårare",
        "upptäckare": "Upptäckare",
        "upptackare": "Upptäckare",
        "äventyrare": "Äventyrare",
        "aventyrare": "Äventyrare",
        "utmanare": "Utmanare",
        "rover": "Rover"
    };
    return map[rawGroup.toLowerCase()] || rawGroup || "Ingen målgrupp";
}

function getLevelIcon(level) {
    const iconMap = {
        "Familjescouting": "./images/icons/familjescout.png",
        "Spårare": "./images/icons/sparare.png",
        "Upptäckare": "./images/icons/upptackare.png",
        "Äventyrare": "./images/icons/aventyrare.png",
        "Utmanare": "./images/icons/utmanare.png",
        "Rover": "./images/icons/rover.png"
    };
    return iconMap[level] || "";
}

// ── Render planning grid ───────────────────────────────────────────────────

const TARGET_GROUP_ORDER = ["Familjescouting", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];

function renderPlanning() {
    const grid = document.getElementById("planningGrid");
    grid.innerHTML = "";

    const searchTerm = groupFilters.search.trim().toLowerCase();
    const visibleGroups = groups.filter(g => {
        const matchesLevel = groupFilters.level === "Alla" || g.level === groupFilters.level;
        const matchesSearch = !searchTerm || g.name.toLowerCase().includes(searchTerm);
        return matchesLevel && matchesSearch;
    });

    if (groups.length === 0) {
        grid.innerHTML = '<p class="no-results">Inga planeringar ännu. Klicka på "+ Lägg till planering" för att börja.</p>';
        return;
    }

    if (visibleGroups.length === 0) {
        grid.innerHTML = '<p class="no-results">Inga planeringar matchar filtret.</p>';
        return;
    }

    // Group plannings by scout level
    const byLevel = TARGET_GROUP_ORDER.reduce((acc, lvl) => { acc[lvl] = []; return acc; }, {});
    visibleGroups.forEach(g => { (byLevel[g.level] || (byLevel[g.level] = [])).push(g); });

    TARGET_GROUP_ORDER.forEach(level => {
        const levelGroups = byLevel[level];
        if (!levelGroups || levelGroups.length === 0) return;

        // Sort by year number, then VT before HT
        levelGroups.sort((a, b) => {
            const parse = name => {
                const year = parseInt(name.match(/\d+/) || [0], 10);
                const term = /\bVT\b/i.test(name) ? 0 : /\bHT\b/i.test(name) ? 1 : 2;
                return { year, term };
            };
            const pa = parse(a.name), pb = parse(b.name);
            return pa.year !== pb.year ? pa.year - pb.year : pa.term - pb.term;
        });

        const col = document.createElement("div");
        col.className = "level-row";

        const icon = getLevelIcon(level);
        const colHeader = document.createElement("div");
        colHeader.className = "level-row-header";
        colHeader.innerHTML = `
            ${icon ? `<img src="${icon}" alt="${level}" class="group-level-icon">` : ""}
            <span>${level}</span>
        `;
        col.appendChild(colHeader);

        const cardsRow = document.createElement("div");
        cardsRow.className = "level-row-cards";

        levelGroups.forEach(group => {
            const card = document.createElement("div");
            card.className = "group-card";
            card.innerHTML = `
                <div class="group-card-header">
                    <h3 class="group-name">${group.name}</h3>
                    <div class="group-card-actions">
                        <button class="btn-secondary add-badge-btn" type="button" data-group-id="${group.id}">+ Märke</button>
                        <button class="btn-danger remove-group-btn" type="button" data-group-id="${group.id}" title="Ta bort planering">&times;</button>
                    </div>
                </div>
                <div class="group-badges" data-group-id="${group.id}">
                    ${renderGroupBadges(group)}
                </div>
            `;
            card.querySelector(".add-badge-btn").addEventListener("click", () => openBadgePicker(group.id));
            card.querySelector(".remove-group-btn").addEventListener("click", () => removeGroup(group.id));
            cardsRow.appendChild(card);
        });

        col.appendChild(cardsRow);
        grid.appendChild(col);
    });

    // Bind remove-badge and dblclick on planned badges
    document.querySelectorAll(".remove-badge-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            removeBadgeFromGroup(btn.dataset.groupId, btn.dataset.badgeId);
        });
    });

    document.querySelectorAll(".planned-badge").forEach(el => {
        el.addEventListener("click", () => {
            const marke = allMarken.find(m => m.id === el.dataset.badgeId);
            if (marke) showBadgeDetail(marke);
        });
    });
}

function renderGroupBadges(group) {
    if (!group.badges || group.badges.length === 0) {
        return '<p class="group-empty">Inga märken planerade än.</p>';
    }

    return group.badges.map(badgeId => {
        const marke = allMarken.find(m => m.id === badgeId);
        if (!marke) return "";
        return `
            <div class="planned-badge" data-badge-id="${badgeId}" title="Klicka för mer info">
                <button class="remove-badge-btn" type="button"
                    data-group-id="${group.id}" data-badge-id="${badgeId}"
                    title="Ta bort ${marke.namn}">&times;</button>
                <img src="${marke.bild}" alt="${marke.namn}">
                <span>${marke.namn}</span>
            </div>
        `;
    }).join("");
}

// ── Groups CRUD ────────────────────────────────────────────────────────────

function addGroup(name, level) {
    groups.push({ id: crypto.randomUUID(), name, level, badges: [] });
    saveGroups();
    renderPlanning();
}

function removeGroup(id) {
    if (!confirm("Ta bort planeringen och alla planerade märken?")) return;
    groups = groups.filter(g => g.id !== id);
    saveGroups();
    renderPlanning();
}

function removeBadgeFromGroup(groupId, badgeId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    group.badges = group.badges.filter(b => b !== badgeId);
    saveGroups();
    renderPlanning();
}

function toggleBadgeInGroup(groupId, badgeId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    if (group.badges.includes(badgeId)) {
        group.badges = group.badges.filter(b => b !== badgeId);
    } else {
        group.badges.push(badgeId);
    }
    saveGroups();
    // Refresh badge state in picker without closing it
    renderPickerGrid();
    // Also refresh the planning cards behind the modal
    renderPlanning();
}
// ── Group filters ─────────────────────────────────────────────────────

document.getElementById("groupSearchInput").addEventListener("input", e => {
    groupFilters.search = e.target.value;
    renderPlanning();
});

document.getElementById("groupLevelFilter").addEventListener("change", e => {
    groupFilters.level = e.target.value;
    renderPlanning();
});
// ── Group modal ────────────────────────────────────────────────────────────

const defaultPlanningModal = document.getElementById("defaultPlanningModal");
const defaultPlanningLevel = document.getElementById("defaultPlanningLevel");

function addDefaultPlanningForLevel(level) {
    const template = DEFAULT_PLANNINGS.find(p => p.level === level);
    if (!template) return 0;

    let added = 0;
    template.names.forEach(name => {
        if (!groups.some(g => g.level === level && g.name === name)) {
            groups.push({ id: crypto.randomUUID(), name, level, badges: [] });
            added += 1;
        }
    });

    if (added > 0) {
        saveGroups();
        renderPlanning();
    }
    return added;
}

document.getElementById("loadDefaultsBtn").addEventListener("click", () => {
    const currentFilterLevel = document.getElementById("groupLevelFilter").value;
    defaultPlanningLevel.value = currentFilterLevel !== "Alla" ? currentFilterLevel : "Familjescouting";
    defaultPlanningModal.classList.remove("hidden");
    defaultPlanningLevel.focus();
});

document.getElementById("closeDefaultPlanningModal").addEventListener("click", () => {
    defaultPlanningModal.classList.add("hidden");
});

defaultPlanningModal.addEventListener("click", e => {
    if (e.target === defaultPlanningModal) defaultPlanningModal.classList.add("hidden");
});

document.getElementById("saveDefaultPlanningBtn").addEventListener("click", () => {
    const selectedLevel = defaultPlanningLevel.value;
    addDefaultPlanningForLevel(selectedLevel);
    defaultPlanningModal.classList.add("hidden");
});

const groupModal = document.getElementById("groupModal");
document.getElementById("addGroupBtn").addEventListener("click", () => {
    document.getElementById("groupName").value = "";
    groupModal.classList.remove("hidden");
    document.getElementById("groupName").focus();
});
document.getElementById("closeGroupModal").addEventListener("click", () => groupModal.classList.add("hidden"));
groupModal.addEventListener("click", e => { if (e.target === groupModal) groupModal.classList.add("hidden"); });

document.getElementById("saveGroupBtn").addEventListener("click", () => {
    const name = document.getElementById("groupName").value.trim();
    if (!name) {
        document.getElementById("groupName").focus();
        return;
    }
    const level = document.getElementById("groupLevel").value;
    addGroup(name, level);
    groupModal.classList.add("hidden");
});

document.getElementById("groupName").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("saveGroupBtn").click();
});

defaultPlanningLevel.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("saveDefaultPlanningBtn").click();
});

// ── Badge picker modal ─────────────────────────────────────────────────────

const pickerModal = document.getElementById("badgePickerModal");
const pickerSearch = document.getElementById("pickerSearch");
const pickerTargetGroupFilter = document.getElementById("pickerTargetGroupFilter");
const pickerCategoryFilter = document.getElementById("pickerCategoryFilter");

document.getElementById("closeBadgePicker").addEventListener("click", () => pickerModal.classList.add("hidden"));
pickerModal.addEventListener("click", e => { if (e.target === pickerModal) pickerModal.classList.add("hidden"); });

pickerSearch.addEventListener("input", renderPickerGrid);
pickerTargetGroupFilter.addEventListener("change", renderPickerGrid);
pickerCategoryFilter.addEventListener("change", renderPickerGrid);

function openBadgePicker(groupId) {
    activeGroupId = groupId;
    const group = groups.find(g => g.id === groupId);
    document.getElementById("pickerTitle").textContent = `Välj märken – ${group.name}`;
    pickerSearch.value = "";
    pickerTargetGroupFilter.value = group.level;
    pickerCategoryFilter.value = "Alla";
    renderPickerGrid();
    pickerModal.classList.remove("hidden");
}

function populatePickerFilters() {
    const targetGroupOrder = ["Familjescouting", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];
    const targetGroups = [...new Set(allMarken.map(getTargetGroup))]
        .sort((a, b) => {
            const ia = targetGroupOrder.indexOf(a);
            const ib = targetGroupOrder.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return a.localeCompare(b, "sv");
        });
    pickerTargetGroupFilter.innerHTML = [
        '<option value="Alla">Alla målgrupper</option>',
        ...targetGroups.map(g => `<option value="${g}">${g}</option>`)
    ].join("");

    const categories = [...new Set(allMarken.map(m => m.kategori || "Övrigt"))].sort();
    pickerCategoryFilter.innerHTML = [
        '<option value="Alla">Alla kategorier</option>',
        ...categories.map(c => `<option value="${c}">${c}</option>`)
    ].join("");
}

function renderPickerGrid() {
    const pickerGrid = document.getElementById("pickerGrid");
    const group = groups.find(g => g.id === activeGroupId);
    if (!group) return;

    const searchTerm = pickerSearch.value.trim().toLowerCase();
    const targetGroupValue = pickerTargetGroupFilter.value;
    const categoryValue = pickerCategoryFilter.value;

    const filtered = allMarken.filter(marke => {
        const matchesTargetGroup = targetGroupValue === "Alla" || getTargetGroup(marke) === targetGroupValue;
        if (!matchesTargetGroup) return false;
        const matchesCategory = categoryValue === "Alla" || (marke.kategori || "Övrigt") === categoryValue;
        if (!matchesCategory) return false;
        if (!searchTerm) return true;
        const text = [marke.namn, marke.kategori, ...(marke.kriterier || [])].filter(Boolean).join(" ").toLowerCase();
        return text.includes(searchTerm);
    });

    if (filtered.length === 0) {
        pickerGrid.innerHTML = '<p class="no-results">Inga märken matchar.</p>';
        return;
    }

    pickerGrid.innerHTML = filtered.map(marke => {
        const selected = group.badges.includes(marke.id);
        return `
            <button type="button"
                class="picker-badge ${selected ? "picker-badge--selected" : ""}"
                data-badge-id="${marke.id}">
                <img src="${marke.bild}" alt="${marke.namn}">
                <span>${marke.namn}</span>
                ${selected ? '<span class="picker-checkmark">✓</span>' : ""}
            </button>
        `;
    }).join("");

    pickerGrid.querySelectorAll(".picker-badge").forEach(btn => {
        btn.addEventListener("click", () => toggleBadgeInGroup(activeGroupId, btn.dataset.badgeId));
        btn.addEventListener("dblclick", e => {
            e.stopPropagation();
            const marke = allMarken.find(m => m.id === btn.dataset.badgeId);
            if (marke) showBadgeDetail(marke);
        });
    });
}

// ── Badge detail popup ────────────────────────────────────────────────────

function createDetailPopup() {
    const popup = document.createElement("div");
    popup.id = "detailPopup";
    popup.className = "detail-popup hidden";
    popup.innerHTML = `
        <div class="detail-popup-content">
            <button class="close-popup" type="button">&times;</button>
            <div class="popup-body"></div>
        </div>
    `;
    popup.querySelector(".close-popup").addEventListener("click", () => popup.classList.add("hidden"));
    popup.addEventListener("click", e => { if (e.target === popup) popup.classList.add("hidden"); });
    document.body.appendChild(popup);
    return popup;
}

const detailPopup = createDetailPopup();

function showBadgeDetail(marke) {
    const body = detailPopup.querySelector(".popup-body");
    const iconMap = {
        "Familjescouting": "./images/icons/familjescout.png",
        "Sp\u00e5rare": "./images/icons/sparare.png",
        "Uppt\u00e4ckare": "./images/icons/upptackare.png",
        "\u00c4ventyrare": "./images/icons/aventyrare.png",
        "Utmanare": "./images/icons/utmanare.png",
        "Rover": "./images/icons/rover.png"
    };
    const targetGroup = getTargetGroup(marke);
    const categoryIcon = iconMap[targetGroup] || "";
    const criteriaList = marke.kriterier ? marke.kriterier.map(k => `<li>${k}</li>`).join("") : "";
    body.innerHTML = `
        <div class="detail-popup-header">
            <h2>${marke.namn}</h2>
            ${categoryIcon ? `<img src="${categoryIcon}" alt="${targetGroup}" class="detail-category-icon">` : ""}
        </div>
        <div class="detail-image-row">
            <img src="${marke.bild}" alt="${marke.namn}" class="detail-image">
        </div>
        <div class="detail-text">
            <div class="detail-category-row">
                <p><strong>Kategori:</strong> ${marke.kategori}</p>
            </div>
            ${marke.inledning ? `<p class="detail-introduction">${marke.inledning}</p>` : ""}
            ${criteriaList ? `<div class="detail-criteria"><strong>Kriterier:</strong><ul>${criteriaList}</ul></div>` : ""}
            <p><strong>M\u00e5lgrupp:</strong> ${targetGroup}</p>
            <p><strong>Program:</strong> ${(Array.isArray(marke.program) ? marke.program : [marke.program || "B\u00e5da"]).join(", ")}</p>
        </div>
    `;
    detailPopup.classList.remove("hidden");
}

// ── Init ───────────────────────────────────────────────────────────────────

loadMarken();
