const STORAGE_KEY = "gtscout_planering";

let allMarken = [];
let groups = loadGroups();
let activeGroupId = null; // which group is getting badges added

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
    populatePickerCategoryFilter();
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

function renderPlanning() {
    const grid = document.getElementById("planningGrid");
    grid.innerHTML = "";

    if (groups.length === 0) {
        grid.innerHTML = '<p class="no-results">Inga grupper ännu. Klicka på "+ Lägg till grupp" för att börja.</p>';
        return;
    }

    groups.forEach(group => {
        const card = document.createElement("div");
        card.className = "group-card";

        const icon = getLevelIcon(group.level);

        card.innerHTML = `
            <div class="group-card-header">
                <div class="group-card-title">
                    ${icon ? `<img src="${icon}" alt="${group.level}" class="group-level-icon">` : ""}
                    <div>
                        <h3 class="group-name">${group.name}</h3>
                        <span class="group-level-label">${group.level}</span>
                    </div>
                </div>
                <div class="group-card-actions">
                    <button class="btn-secondary add-badge-btn" type="button" data-group-id="${group.id}">+ Märke</button>
                    <button class="btn-danger remove-group-btn" type="button" data-group-id="${group.id}" title="Ta bort grupp">&times;</button>
                </div>
            </div>
            <div class="group-badges" data-group-id="${group.id}">
                ${renderGroupBadges(group)}
            </div>
        `;

        card.querySelector(".add-badge-btn").addEventListener("click", () => openBadgePicker(group.id));
        card.querySelector(".remove-group-btn").addEventListener("click", () => removeGroup(group.id));

        grid.appendChild(card);
    });

    // Bind remove-badge buttons
    document.querySelectorAll(".remove-badge-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            removeBadgeFromGroup(btn.dataset.groupId, btn.dataset.badgeId);
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
            <div class="planned-badge">
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
    if (!confirm("Ta bort gruppen och alla planerade märken?")) return;
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

// ── Group modal ────────────────────────────────────────────────────────────

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

// ── Badge picker modal ─────────────────────────────────────────────────────

const pickerModal = document.getElementById("badgePickerModal");
const pickerSearch = document.getElementById("pickerSearch");
const pickerCategoryFilter = document.getElementById("pickerCategoryFilter");

document.getElementById("closeBadgePicker").addEventListener("click", () => pickerModal.classList.add("hidden"));
pickerModal.addEventListener("click", e => { if (e.target === pickerModal) pickerModal.classList.add("hidden"); });

pickerSearch.addEventListener("input", renderPickerGrid);
pickerCategoryFilter.addEventListener("change", renderPickerGrid);

function openBadgePicker(groupId) {
    activeGroupId = groupId;
    const group = groups.find(g => g.id === groupId);
    document.getElementById("pickerTitle").textContent = `Välj märken – ${group.name}`;
    pickerSearch.value = "";
    pickerCategoryFilter.value = "Alla";
    renderPickerGrid();
    pickerModal.classList.remove("hidden");
}

function populatePickerCategoryFilter() {
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
    const categoryValue = pickerCategoryFilter.value;

    const filtered = allMarken.filter(marke => {
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
    });
}

// ── Init ───────────────────────────────────────────────────────────────────

loadMarken();
