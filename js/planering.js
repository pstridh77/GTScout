const STORAGE_KEY = "gtscout_planering";
const BADGE_NOTES_STORAGE_KEY = "gtscout_badge_notes";

const DEFAULT_PLANNINGS_FALLBACK = [
    {
        level: "Familjescouting",
        plans: [
            { name: "\u00c5r 1 HT", badges: ["varme", "smaka", "utforska"] },
            { name: "\u00c5r 2 VT", badges: ["leka", "pyssla", "ny_i_naturen"] }
        ]
    },
    {
        level: "Sp\u00e5rare",
        plans: [
            { name: "\u00c5r 1 HT", badges: ["tanda", "matettan", "hitta"] },
            { name: "\u00c5r 2 VT", badges: ["blomman", "forsta_repmarket", "under_ytan"] },
            { name: "\u00c5r 2 HT", badges: ["experimentettan", "sortera_och_atervinn", "sova_borta_helg"] },
            { name: "\u00c5r 3 VT", badges: ["livraddning", "naturligt", "morker"] }
        ]
    },
    {
        level: "Uppt\u00e4ckare",
        plans: [
            { name: "\u00c5r 1 HT", badges: ["brinna", "mattvaan", "karta"] },
            { name: "\u00c5r 2 VT", badges: ["bygga", "andra_repmarket", "vatten"] },
            { name: "\u00c5r 2 HT", badges: ["fauna", "tekniken", "losa"] },
            { name: "\u00c5r 3 VT", badges: ["hallbarhet", "min_rost", "internationellt"] },
            { name: "\u00c5r 3 HT", badges: ["sova_borta_vecka", "inkludering", "vader"] },
            { name: "\u00c5r 4 VT", badges: ["lagerbal", "skorden", "varldsforbattraren"] }
        ]
    },
    {
        level: "\u00c4ventyrare",
        plans: [
            { name: "\u00c5r 1 HT", badges: ["elda", "mattrean", "navigera"] },
            { name: "\u00c5r 2 VT", badges: ["surra", "klattring", "paddla"] },
            { name: "\u00c5r 2 HT", badges: ["demokrati", "offline", "spara"] },
            { name: "\u00c5r 3 VT", badges: ["klimat", "vara_ute_skogen", "sjovett"] },
            { name: "\u00c5r 3 HT", badges: ["radda", "kroppslig_halsa", "genus_hbtqplus"] },
            { name: "\u00c5r 4 VT", badges: ["experimenttrean", "superpatrullen", "varldens_utmaning"] }
        ]
    },
    {
        level: "Utmanare",
        plans: [
            { name: "\u00c5r 1 HT", badges: ["ta_fyr", "mat_avancerat", "overlevnad"] },
            { name: "\u00c5r 2 VT", badges: ["bygga_avancerat", "budgetera", "upptack_varlden"] },
            { name: "\u00c5r 2 HT", badges: ["paddla_vanern", "klattra_kebnekaise", "vara_ute_sjalv"] },
            { name: "\u00c5r 3 VT", badges: ["innovationen", "reparera", "psykisk_halsa"] }
        ]
    },
    {
        level: "Rover",
        plans: [
            { name: "\u00c5r 1 VT", badges: ["skogsgourmet", "vandra_sjalv", "varldsmedborgare"] },
            { name: "\u00c5r 1 HT", badges: ["bygga_permanent", "paddla_gotland", "skogsrejv"] }
        ]
    }
];

let defaultPlannings = JSON.parse(JSON.stringify(DEFAULT_PLANNINGS_FALLBACK));

let allMarken = [];
let groups = loadGroups();
let activeGroupId = null; // which group is getting badges added
let groupFilters = { search: "", level: "Alla" };
let pdfSelectionState = new Set();
const BADGE_DND_MIME = "text/plain";

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

function loadBadgeNotesForTransfer() {
    try {
        const notes = JSON.parse(localStorage.getItem(BADGE_NOTES_STORAGE_KEY));
        return notes && typeof notes === "object" && !Array.isArray(notes) ? notes : {};
    } catch {
        return {};
    }
}

function exportPlannings() {
    const badgeNotes = loadBadgeNotesForTransfer();
    const exportData = {
        format: "gtscout-planeringar",
        version: 1,
        plannings: groups.map(group => ({
            name: group.name,
            level: group.level,
            badges: Array.isArray(group.badges) ? group.badges : []
        })),
        badgeNotes
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `gtscout-planeringar-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(downloadUrl);

    const exportInfoBody = document.getElementById("exportInfoBody");
    exportInfoBody.innerHTML = `
        <p><strong>Planeringar:</strong> ${groups.length}</p>
        <p><strong>Info-fält:</strong> ${Object.keys(badgeNotes).length}</p>
        <p><strong>Fil:</strong> gtscout-planeringar-${new Date().toISOString().slice(0, 10)}.json</p>
    `;
    document.getElementById("exportInfoModal").classList.remove("hidden");
}

function renderPdfSelectionList() {
    const list = document.getElementById("pdfSelectionList");
    const filterValue = document.getElementById("pdfPlanningFilter").value;
    list.innerHTML = "";
    const filteredGroups = groups.filter(group => filterValue === "Alla" || group.level === filterValue);
    if (filteredGroups.length === 0) {
        list.innerHTML = "<p>Det finns inga planeringar att exportera.</p>";
    } else {
        filteredGroups.forEach(group => {
            const label = document.createElement("label");
            label.className = "pdf-selection-option";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = group.id;
            checkbox.checked = pdfSelectionState.has(group.id);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    pdfSelectionState.add(group.id);
                } else {
                    pdfSelectionState.delete(group.id);
                }
            });
            const text = document.createElement("span");
            const name = document.createElement("strong");
            name.textContent = group.name;
            const level = document.createElement("small");
            level.textContent = group.level;
            text.append(name, level);
            label.append(checkbox, text);
            list.appendChild(label);
        });
    }
}

function openPdfSelection() {
    const filter = document.getElementById("pdfPlanningFilter");
    const targetGroups = [...new Set(groups.map(group => group.level).filter(Boolean))];
    const targetGroupOrder = ["Familjescouting", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];
    targetGroups.sort((a, b) => {
        const indexA = targetGroupOrder.indexOf(a);
        const indexB = targetGroupOrder.indexOf(b);
        return (indexA === -1 ? targetGroupOrder.length : indexA) - (indexB === -1 ? targetGroupOrder.length : indexB);
    });
    filter.innerHTML = "<option value=\"Alla\">Alla målgrupper</option>";
    targetGroups.forEach(targetGroup => {
        const option = document.createElement("option");
        option.value = targetGroup;
        option.textContent = targetGroup;
        filter.appendChild(option);
    });
    filter.value = targetGroups.includes(groupFilters.level) ? groupFilters.level : "Alla";
    pdfSelectionState = new Set(groups.map(group => group.id));
    renderPdfSelectionList();
    document.getElementById("pdfSelectionModal").classList.remove("hidden");
}

function generatePlanningPdf(selectedIds) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        alert("Kunde inte öppna PDF-vyn. Tillåt popupfönster för den här sidan.");
        return;
    }

    const escapeHtml = value => String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    const badgeNotes = loadBadgeNotesForTransfer();
    const selectedGroups = groups.filter(group => selectedIds.has(group.id));
    const resolveImage = imagePath => imagePath ? new URL(imagePath, window.location.href).href : "";
    const renderBadge = badgeId => {
        const marke = allMarken.find(item => item.id === badgeId);
        if (!marke) return `<p class="missing-badge">Märke ${escapeHtml(badgeId)} kunde inte hittas.</p>`;

        const criteria = Array.isArray(marke.kriterier) && marke.kriterier.length > 0
            ? `<p><strong>Kriterier:</strong> ${escapeHtml(marke.kriterier.join("; "))}</p>`
            : "";
        const programs = Array.isArray(marke.program) ? marke.program : [marke.program || "Båda"];
        const note = badgeNotes[marke.id]
            ? `<p><strong>Info:</strong> ${escapeHtml(badgeNotes[marke.id]).replace(/\n/g, "<br>")}</p>`
            : "";
        const image = resolveImage(marke.bild);

        return `
            <article class="pdf-badge">
                ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(marke.namn)}">` : ""}
                <div>
                    <h3>${escapeHtml(marke.namn)}</h3>
                    <p><strong>Kategori:</strong> ${escapeHtml(marke.kategori || "Övrigt")}</p>
                    <p><strong>Målgrupp:</strong> ${escapeHtml(getTargetGroup(marke))}</p>
                    <p><strong>Program:</strong> ${escapeHtml(programs.join(", "))}</p>
                    ${marke.inledning ? `<p><strong>Beskrivning:</strong> ${escapeHtml(marke.inledning)}</p>` : ""}
                    ${criteria}
                    ${note}
                </div>
            </article>
        `;
    };
    const planningSections = selectedGroups.map(group => `
        <section class="pdf-planning">
            <h2>${escapeHtml(group.name)}</h2>
            <p class="pdf-level">Målgrupp: ${escapeHtml(group.level)}</p>
            ${Array.isArray(group.badges) && group.badges.length > 0
                ? group.badges.map(renderBadge).join("")
                : "<p>Inga märken planerade.</p>"}
        </section>
    `).join("");

    printWindow.addEventListener("load", () => printWindow.print(), { once: true });
    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
        <html lang="sv">
        <head>
            <meta charset="UTF-8">
            <title>Märkesschema</title>
            <style>
                @page { size: A4; margin: 14mm; }
                * { box-sizing: border-box; }
                body { margin: 0; color: #172b4d; font: 11pt Arial, sans-serif; line-height: 1.45; }
                h1 { margin: 0 0 4px; color: #003660; font-size: 22pt; }
                .created { margin: 0 0 20px; color: #5b6b7a; }
                .pdf-planning { page-break-before: always; }
                .pdf-planning:first-of-type { page-break-before: auto; }
                .pdf-planning h2 { margin: 0; padding-bottom: 4px; border-bottom: 2px solid #003660; color: #003660; font-size: 17pt; }
                .pdf-level { margin: 6px 0 14px; font-weight: bold; }
                .pdf-badge { display: flex; gap: 14px; margin: 0 0 16px; padding: 10px 0; border-bottom: 1px solid #d0d7de; break-inside: avoid; }
                .pdf-badge img { width: 76px; height: 76px; flex: 0 0 76px; object-fit: contain; }
                .pdf-badge h3 { margin: 0 0 5px; color: #003660; font-size: 13pt; }
                .pdf-badge p { margin: 2px 0; }
                .missing-badge { color: #9b1c1c; }
            </style>
        </head>
        <body>
            <h1>Märkesschema</h1>
            <p class="created">Exporterad ${escapeHtml(new Date().toLocaleDateString("sv-SE"))}</p>
            ${planningSections || "<p>Inga planeringar valdes.</p>"}
        </body>
        </html>`);
    printWindow.document.close();
    printWindow.focus();
}

function getImportedPlanningName(name, level) {
    let candidate = name;
    let suffix = 2;
    while (groups.some(group => group.name === candidate && group.level === level)) {
        candidate = `${name} (${suffix++})`;
    }
    return candidate;
}

function importPlannings(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            const importedPlannings = Array.isArray(parsed) ? parsed : parsed.plannings;
            if (!Array.isArray(importedPlannings)) throw new Error("Ogiltigt format");

            const validPlannings = importedPlannings.filter(planning =>
                planning && typeof planning.name === "string" && planning.name.trim() &&
                typeof planning.level === "string"
            );
            if (validPlannings.length === 0) throw new Error("Inga giltiga planeringar");

            const importedNotes = parsed && !Array.isArray(parsed) && parsed.badgeNotes && typeof parsed.badgeNotes === "object"
                ? parsed.badgeNotes
                : {};
            const badgeNotes = loadBadgeNotesForTransfer();
            let importedNoteCount = 0;
            Object.entries(importedNotes).forEach(([badgeId, note]) => {
                if (typeof note === "string" && note.trim() && !badgeNotes[badgeId]) {
                    badgeNotes[badgeId] = note;
                    importedNoteCount += 1;
                }
            });

            validPlannings.forEach(planning => {
                groups.push({
                    id: crypto.randomUUID(),
                    name: getImportedPlanningName(planning.name.trim(), planning.level),
                    level: planning.level,
                    badges: Array.isArray(planning.badges) ? [...new Set(planning.badges.filter(Boolean))] : []
                });
            });
            saveGroups();
            localStorage.setItem(BADGE_NOTES_STORAGE_KEY, JSON.stringify(badgeNotes));
            renderPlanning();
            alert(`${validPlannings.length} planeringar och ${importedNoteCount} Info-fält importerades.`);
        } catch (error) {
            alert("Kunde inte importera planeringarna. Kontrollera att filen är en giltig JSON-export.");
        }
        importPlanningInput.value = "";
    };
    reader.readAsText(file);
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

async function loadDefaultPlannings() {
    try {
        const response = await fetch("data/default-planeringar.json");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            defaultPlannings = data;
        }
    } catch (err) {
        console.warn("Kunde inte ladda default-planeringar.json, anv\u00e4nder fallback.", err);
    }
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

function getBadgeNote(badgeId) {
    try {
        const notes = JSON.parse(localStorage.getItem(BADGE_NOTES_STORAGE_KEY));
        return notes && typeof notes === "object" ? notes[badgeId] || "" : "";
    } catch {
        return "";
    }
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
            <div class="level-row-title">
                ${icon ? `<img src="${icon}" alt="${level}" class="group-level-icon">` : ""}
                <span>${level}</span>
            </div>
            <button class="level-remove-all-btn" type="button" data-level="${level}" title="Ta bort alla planeringar i målgruppen">Ta bort alla</button>
        `;
        colHeader.querySelector(".level-remove-all-btn").addEventListener("click", () => removeLevelGroups(level));
        col.appendChild(colHeader);

        const cardsRow = document.createElement("div");
        cardsRow.className = "level-row-cards";

        levelGroups.forEach(group => {
            const card = document.createElement("div");
            card.className = "group-card";
            card.innerHTML = `
                <div class="group-card-header">
                    <h3 class="group-name" title="Dubbelklicka för att byta namn">${group.name}</h3>
                    <div class="group-card-actions">
                        <button class="btn-secondary add-badge-btn" type="button" data-group-id="${group.id}">+ Märke</button>
                        <button class="btn-danger remove-group-btn" type="button" data-group-id="${group.id}" title="Ta bort planering">&times;</button>
                    </div>
                </div>
                <div class="group-badges" data-group-id="${group.id}">
                    ${renderGroupBadges(group)}
                </div>
            `;
            card.querySelector(".group-name").addEventListener("dblclick", () => renameGroup(group.id));
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

    bindBadgeDragAndDrop();
}

function renderGroupBadges(group) {
    if (!group.badges || group.badges.length === 0) {
        return '<p class="group-empty">Inga märken planerade än.</p>';
    }

    return group.badges.map(badgeId => {
        const marke = allMarken.find(m => m.id === badgeId);
        if (!marke) return "";
        return `
            <div class="planned-badge" data-group-id="${group.id}" data-badge-id="${badgeId}" draggable="true" title="Klicka för mer info">
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

function removeLevelGroups(level) {
    const count = groups.filter(g => g.level === level).length;
    if (count === 0) return;
    if (!confirm(`Ta bort alla ${count} planeringar för ${level}?`)) return;
    groups = groups.filter(g => g.level !== level);
    saveGroups();
    renderPlanning();
}

function renameGroup(id) {
    const group = groups.find(g => g.id === id);
    if (!group) return;

    const nextName = prompt("Nytt namn på planering:", group.name);
    if (nextName === null) return;

    const trimmedName = nextName.trim();
    if (!trimmedName) {
        alert("Namnet kan inte vara tomt.");
        return;
    }

    if (groups.some(g => g.id !== id && g.level === group.level && g.name === trimmedName)) {
        alert("Det finns redan en planering med det namnet i samma målgrupp.");
        return;
    }

    group.name = trimmedName;
    saveGroups();
    renderPlanning();
}

function moveBadgeBetweenGroups(sourceGroupId, targetGroupId, badgeId, targetIndex = null) {
    if (!sourceGroupId || !targetGroupId || !badgeId) return false;

    const sourceGroup = groups.find(g => g.id === sourceGroupId);
    const targetGroup = groups.find(g => g.id === targetGroupId);
    if (!sourceGroup || !targetGroup) return false;
    if (!sourceGroup.badges.includes(badgeId)) return false;

    if (sourceGroupId === targetGroupId) {
        const fromIndex = sourceGroup.badges.indexOf(badgeId);
        if (fromIndex === -1) return false;

        let toIndex = targetIndex == null ? sourceGroup.badges.length - 1 : targetIndex;
        toIndex = Math.max(0, Math.min(toIndex, sourceGroup.badges.length - 1));
        if (toIndex === fromIndex) return false;

        const [moved] = sourceGroup.badges.splice(fromIndex, 1);
        if (toIndex > fromIndex) toIndex -= 1;
        sourceGroup.badges.splice(toIndex, 0, moved);
    } else {
        if (targetGroup.badges.includes(badgeId)) return false;
        sourceGroup.badges = sourceGroup.badges.filter(b => b !== badgeId);

        const insertAt = targetIndex == null
            ? targetGroup.badges.length
            : Math.max(0, Math.min(targetIndex, targetGroup.badges.length));
        targetGroup.badges.splice(insertAt, 0, badgeId);
    }

    saveGroups();
    renderPlanning();
    return true;
}

function parseDraggedBadge(event) {
    try {
        const raw = event.dataTransfer.getData(BADGE_DND_MIME);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return {
            badgeId: parsed.badgeId,
            sourceGroupId: parsed.sourceGroupId
        };
    } catch {
        return null;
    }
}

function bindBadgeDragAndDrop() {
    const clearDragMarkers = () => {
        document.querySelectorAll(".group-badges--dragover").forEach(zone => zone.classList.remove("group-badges--dragover"));
        document.querySelectorAll(".planned-badge--drop-target").forEach(el => el.classList.remove("planned-badge--drop-target"));
    };

    document.querySelectorAll(".planned-badge").forEach(el => {
        el.addEventListener("dragstart", e => {
            const { badgeId, groupId } = el.dataset;
            if (!badgeId || !groupId) return;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData(BADGE_DND_MIME, JSON.stringify({ badgeId, sourceGroupId: groupId }));
            el.classList.add("planned-badge--dragging");
        });

        el.addEventListener("dragend", () => {
            el.classList.remove("planned-badge--dragging");
            clearDragMarkers();
        });

        el.addEventListener("dragover", e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            el.classList.add("planned-badge--drop-target");
        });

        el.addEventListener("dragleave", e => {
            if (!el.contains(e.relatedTarget)) {
                el.classList.remove("planned-badge--drop-target");
            }
        });

        el.addEventListener("drop", e => {
            e.preventDefault();
            e.stopPropagation();
            clearDragMarkers();

            const dragged = parseDraggedBadge(e);
            if (!dragged) return;

            const targetGroupId = el.dataset.groupId;
            const targetBadgeId = el.dataset.badgeId;
            const targetGroup = groups.find(g => g.id === targetGroupId);
            if (!targetGroup) return;

            const targetIndex = targetGroup.badges.indexOf(targetBadgeId);
            moveBadgeBetweenGroups(dragged.sourceGroupId, targetGroupId, dragged.badgeId, targetIndex);
        });
    });

    document.querySelectorAll(".group-badges").forEach(zone => {
        zone.addEventListener("dragover", e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        });

        zone.addEventListener("dragenter", e => {
            e.preventDefault();
            zone.classList.add("group-badges--dragover");
        });

        zone.addEventListener("dragleave", e => {
            if (!zone.contains(e.relatedTarget)) {
                zone.classList.remove("group-badges--dragover");
            }
        });

        zone.addEventListener("drop", e => {
            e.preventDefault();
            clearDragMarkers();

            const dragged = parseDraggedBadge(e);
            if (!dragged) return;

            moveBadgeBetweenGroups(dragged.sourceGroupId, zone.dataset.groupId, dragged.badgeId, null);
        });
    });
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
    const template = defaultPlannings.find(p => p.level === level);
    if (!template) return 0;

    let added = 0;
    const plans = (template.plans || []).filter(p => p && typeof p.name === "string");
    plans.forEach(plan => {
        if (!groups.some(g => g.level === level && g.name === plan.name)) {
            groups.push({
                id: crypto.randomUUID(),
                name: plan.name,
                level,
                badges: Array.isArray(plan.badges) ? [...new Set(plan.badges)] : []
            });
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
    defaultPlanningLevel.value = document.getElementById("groupLevel").value;
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
    const selectedLevel = document.getElementById("groupLevel").value;
    addDefaultPlanningForLevel(selectedLevel);
    defaultPlanningModal.classList.add("hidden");
    groupModal.classList.add("hidden");
});

const groupModal = document.getElementById("groupModal");
const exportInfoModal = document.getElementById("exportInfoModal");
const pdfSelectionModal = document.getElementById("pdfSelectionModal");
const pdfSelectionList = document.getElementById("pdfSelectionList");
const pdfPlanningFilter = document.getElementById("pdfPlanningFilter");
document.getElementById("closeExportInfoModal").addEventListener("click", () => exportInfoModal.classList.add("hidden"));
document.getElementById("closeExportInfoBtn").addEventListener("click", () => exportInfoModal.classList.add("hidden"));
exportInfoModal.addEventListener("click", event => {
    if (event.target === exportInfoModal) exportInfoModal.classList.add("hidden");
});
document.getElementById("closePdfSelectionModal").addEventListener("click", () => pdfSelectionModal.classList.add("hidden"));
pdfSelectionModal.addEventListener("click", event => {
    if (event.target === pdfSelectionModal) pdfSelectionModal.classList.add("hidden");
});
document.getElementById("selectAllPdfBtn").addEventListener("click", () => {
    groups
        .filter(group => pdfPlanningFilter.value === "Alla" || group.level === pdfPlanningFilter.value)
        .forEach(group => pdfSelectionState.add(group.id));
    renderPdfSelectionList();
});
document.getElementById("clearPdfBtn").addEventListener("click", () => {
    groups
        .filter(group => pdfPlanningFilter.value === "Alla" || group.level === pdfPlanningFilter.value)
        .forEach(group => pdfSelectionState.delete(group.id));
    renderPdfSelectionList();
});
pdfPlanningFilter.addEventListener("change", renderPdfSelectionList);
document.getElementById("generatePdfBtn").addEventListener("click", () => {
    const selectedIds = pdfSelectionState;
    if (selectedIds.size === 0) {
        alert("Välj minst en planering.");
        return;
    }
    pdfSelectionModal.classList.add("hidden");
    generatePlanningPdf(selectedIds);
});

const importPlanningInput = document.getElementById("importPlanningInput");
document.getElementById("exportPlanningBtn").addEventListener("click", exportPlannings);
document.getElementById("importPlanningBtn").addEventListener("click", () => importPlanningInput.click());
document.getElementById("exportPlanningPdfBtn").addEventListener("click", openPdfSelection);
importPlanningInput.addEventListener("change", event => {
    const [file] = event.target.files;
    if (file) importPlannings(file);
});

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
    const badgeNote = getBadgeNote(marke.id);
    const badgePlannings = groups.filter(group =>
        Array.isArray(group.badges) && group.badges.includes(marke.id)
    );
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
            ${badgePlannings.length > 0 ? `
                <div class="detail-planning-status detail-planning-status--active">
                    <strong>Finns i planering:</strong>
                    <div class="detail-planning-list"></div>
                </div>
            ` : ""}
            ${badgeNote ? `
                <div class="detail-note">
                    <strong>Info:</strong>
                    <p class="detail-note-display"></p>
                </div>
            ` : ""}
        </div>
    `;
    if (badgePlannings.length > 0) {
        const planningList = body.querySelector(".detail-planning-list");
        badgePlannings.forEach(group => {
            const item = document.createElement("span");
            item.className = "detail-planning-item";
            const iconPath = iconMap[group.level] || "";
            item.innerHTML = iconPath ? `<img src="${iconPath}" alt="${group.level}">` : "";
            const name = document.createElement("span");
            name.textContent = group.name;
            item.appendChild(name);
            planningList.appendChild(item);
        });
    }
    if (badgeNote) body.querySelector(".detail-note-display").textContent = badgeNote;
    detailPopup.classList.remove("hidden");
}

// ── Init ───────────────────────────────────────────────────────────────────

loadDefaultPlannings();
loadMarken();
