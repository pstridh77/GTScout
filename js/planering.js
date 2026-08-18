const STORAGE_KEY = "gtscout_planering";
const BADGE_NOTES_STORAGE_KEY = "gtscout_badge_notes";
const CUSTOM_ACTIVITIES_STORAGE_KEY = "gtscout_custom_activities";
const CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY = "gtscout_custom_badge_activities";

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
let allAktiviteter = [];
let groups = loadGroups();
let activeGroupId = null; // which group is getting badges added
let groupFilters = { search: "", level: "Alla", year: "Alla", term: "Alla" };
let pdfSelectionState = new Set();
const BADGE_DND_MIME = "text/plain";
const ACTIVITY_DND_MIME = "application/x-gtscout-activity";
let activeDraggedActivity = null;
let editingStandaloneActivityId = null;
let activeActivityGroupId = null;
let activeStandaloneActivityBadge = null;
let activeStandaloneActivityPlanning = null;

function normalizePlanningTerm(value) {
    const normalized = String(value ?? "").trim();
    if (!normalized) return "";
    return /^(ht|vt)$/i.test(normalized) ? normalized.toUpperCase() : normalized;
}

function stripPlanningYearPrefix(value) {
    return String(value ?? "").replace(/^\s*År\s+/i, "").trim();
}

function parsePlanningYearAndTerm(group) {
    const name = stripPlanningYearPrefix(String(group?.name ?? ""));
    const explicitYear = Number.parseInt(String(group?.year ?? ""), 10);
    const year = Number.isFinite(explicitYear) ? explicitYear : (() => {
        const match = name.match(/\d+/);
        return match ? Number.parseInt(match[0], 10) : null;
    })();
    const explicitTerm = normalizePlanningTerm(group?.term);
    const term = explicitTerm || (() => {
        const match = name.match(/\b(?:HT|VT)\b/i);
        return match ? match[0].toUpperCase() : "";
    })();
    return { year, term };
}

function getGroupYearValue(group) {
    const parsed = parsePlanningYearAndTerm(group);
    return Number.isFinite(parsed.year) ? parsed.year : null;
}

function getGroupTermValue(group) {
    return normalizePlanningTerm(parsePlanningYearAndTerm(group).term);
}

function getGroupSortValue(group) {
    const year = getGroupYearValue(group);
    const term = getGroupTermValue(group);
    const termOrder = /^VT$/i.test(term) ? 0 : /^\bHT\b$/i.test(term) ? 1 : 2;
    return { year: Number.isFinite(year) ? year : 0, term: termOrder };
}

function loadCustomActivities() {
    try {
        const activities = JSON.parse(localStorage.getItem(CUSTOM_ACTIVITIES_STORAGE_KEY));
        return Array.isArray(activities) ? activities : [];
    } catch {
        return [];
    }
}

function loadCustomBadgeActivities() {
    try {
        const links = JSON.parse(localStorage.getItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY));
        return links && typeof links === "object" && !Array.isArray(links) ? links : {};
    } catch {
        return {};
    }
}

function getBadgeActivityIds(marke) {
    const links = loadCustomBadgeActivities();
    return [
        ...(Array.isArray(marke.aktiviteter) ? marke.aktiviteter : []),
        ...(Array.isArray(links[marke.id]) ? links[marke.id] : [])
    ];
}

function formatActivityTime(activity) {
    const time = String(activity.tid ?? "").trim();
    if (!time) return "";
    return /^\d+(?:[.,]\d+)?$/.test(time) ? `${time} min` : time;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizeUrl(url) {
    const trimmedUrl = String(url ?? "").trim().replace(/[.,!?;:]+$/u, "");
    if (!trimmedUrl) return null;
    const candidate = /^(?:https?:\/\/)/i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    try {
        const parsedUrl = new URL(candidate);
        return ["http:", "https:"].includes(parsedUrl.protocol) ? parsedUrl.href : null;
    } catch {
        return null;
    }
}

function renderLinkedText(value) {
    const lines = String(value ?? "").split("\n");
    return lines.map(line => {
        const segments = [];
        const urlPattern = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
        let lastIndex = 0;
        let match;
        while ((match = urlPattern.exec(line)) !== null) {
            const [rawMatch] = match;
            const normalizedUrl = normalizeUrl(rawMatch);
            if (!normalizedUrl) continue;
            const matchedText = rawMatch.replace(/[.,!?;:]+$/u, "");
            const trailingText = rawMatch.slice(matchedText.length);
            segments.push(escapeHtml(line.slice(lastIndex, match.index)));
            segments.push(`<a href="${escapeHtml(normalizedUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(matchedText)}</a>`);
            segments.push(escapeHtml(trailingText));
            lastIndex = match.index + rawMatch.length;
        }
        segments.push(escapeHtml(line.slice(lastIndex)));
        return segments.join("");
    }).join("<br>");
}

function populatePlanningActivityCategories() {
    const categoryList = document.getElementById("planningActivityCategories");
    if (!categoryList) return;
    const categories = [...new Set([
        ...allMarken.map(item => item.kategori),
        ...allAktiviteter.map(item => item.kategori)
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv"));
    categoryList.replaceChildren(...categories.map(category => {
        const option = document.createElement("option");
        option.value = category;
        return option;
    }));
}

function createStandaloneActivityPopup() {
    const modal = document.getElementById("createActivityModal");
    const reset = () => {
        editingStandaloneActivityId = null;
        activeStandaloneActivityBadge = null;
        activeStandaloneActivityPlanning = null;
        document.getElementById("createActivityTitle").textContent = "Skapa aktivitet";
        document.getElementById("savePlanningActivityBtn").textContent = "Spara aktivitet";
        modal.querySelectorAll("input, textarea").forEach(field => field.value = "");
        document.getElementById("createActivityStatus").textContent = "";
        document.getElementById("planningActivityMemberships").textContent = "Inte tillagd i någon planering.";
    };
    document.getElementById("createActivityBtn").addEventListener("click", () => {
        document.getElementById("editActivitiesModal").classList.add("hidden");
        reset();
        populatePlanningActivityCategories();
        modal.classList.remove("hidden");
        document.getElementById("planningActivityName").focus();
    });
    document.getElementById("closeCreateActivityModal").addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", event => {
        if (event.target === modal) modal.classList.add("hidden");
    });
    document.getElementById("savePlanningActivityBtn").addEventListener("click", () => {
        const nameInput = document.getElementById("planningActivityName");
        const name = nameInput.value.trim();
        const status = document.getElementById("createActivityStatus");
        if (!name) {
            nameInput.focus();
            return;
        }
        const customActivities = loadCustomActivities();
        const existingActivity = customActivities.find(item => item.id === editingStandaloneActivityId);
        const activity = {
            id: editingStandaloneActivityId || `egen-${crypto.randomUUID()}`,
            namn: name,
            kategori: document.getElementById("planningActivityCategory").value.trim() || activeStandaloneActivityBadge?.kategori || existingActivity?.kategori || "Egna aktiviteter",
            beskrivning: document.getElementById("planningActivityDescription").value.trim(),
            tid: document.getElementById("planningActivityTime").value.trim(),
            material: document.getElementById("planningActivityMaterial").value.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
            genomforande: document.getElementById("planningActivityInstructions").value.trim()
        };
        const existingIndex = customActivities.findIndex(item => item.id === activity.id);
        if (existingIndex === -1) customActivities.push(activity);
        else customActivities[existingIndex] = activity;
        localStorage.setItem(CUSTOM_ACTIVITIES_STORAGE_KEY, JSON.stringify(customActivities));
        if (activeStandaloneActivityBadge) {
            const links = loadCustomBadgeActivities();
            links[activeStandaloneActivityBadge.id] = Array.isArray(links[activeStandaloneActivityBadge.id])
                ? links[activeStandaloneActivityBadge.id]
                : [];
            if (!links[activeStandaloneActivityBadge.id].includes(activity.id)) {
                links[activeStandaloneActivityBadge.id].push(activity.id);
            }
            localStorage.setItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY, JSON.stringify(links));
        }
        if (activeStandaloneActivityPlanning) {
            activeStandaloneActivityPlanning.activities = Array.isArray(activeStandaloneActivityPlanning.activities)
                ? activeStandaloneActivityPlanning.activities
                : [];
            if (!activeStandaloneActivityPlanning.activities.includes(activity.id)) {
                activeStandaloneActivityPlanning.activities.push(activity.id);
            }
        }
        saveGroups();
        const activityIndex = allAktiviteter.findIndex(item => item.id === activity.id);
        if (activityIndex === -1) allAktiviteter.push(activity);
        else allAktiviteter[activityIndex] = activity;
        modal.classList.add("hidden");
        renderPlanning(new Set([activeStandaloneActivityPlanning?.id].filter(Boolean)));
    });
}

function openStandaloneActivityForBadge(marke, planning) {
    const modal = document.getElementById("createActivityModal");
    populatePlanningActivityCategories();
    activeStandaloneActivityBadge = marke;
    activeStandaloneActivityPlanning = planning;
    editingStandaloneActivityId = null;
    document.getElementById("createActivityTitle").textContent = "Skapa egen aktivitet";
    document.getElementById("savePlanningActivityBtn").textContent = "Spara aktivitet";
    modal.querySelectorAll("input, textarea").forEach(field => field.value = "");
    document.getElementById("planningActivityCategory").value = marke.kategori || "";
    document.getElementById("planningActivityMemberships").innerHTML = `<span>${planning.name} (${planning.level})</span>`;
    document.getElementById("createActivityStatus").textContent = "";
    modal.classList.remove("hidden");
    document.getElementById("planningActivityName").focus();
}

function openStandaloneActivityForPlanning(planning) {
    const modal = document.getElementById("createActivityModal");
    activeStandaloneActivityBadge = null;
    activeStandaloneActivityPlanning = planning;
    editingStandaloneActivityId = null;
    document.getElementById("createActivityTitle").textContent = "Skapa aktivitet";
    document.getElementById("savePlanningActivityBtn").textContent = "Spara aktivitet";
    modal.querySelectorAll("input, textarea").forEach(field => field.value = "");
    populatePlanningActivityCategories();
    document.getElementById("planningActivityMemberships").innerHTML = `<span>${planning.name} (${planning.level})</span>`;
    document.getElementById("createActivityStatus").textContent = "";
    modal.classList.remove("hidden");
    document.getElementById("planningActivityName").focus();
}

function openActivityPicker(groupId) {
    activeActivityGroupId = groupId;
    const group = groups.find(item => item.id === groupId);
    if (!group) return;
    document.getElementById("selectActivityTitle").textContent = `Välj aktiviteter – ${group.name}`;
    document.getElementById("selectActivitySearch").value = "";
    populateActivityCategories();
    renderActivityPicker();
    document.getElementById("selectActivityModal").classList.remove("hidden");
}

function getActivityCategories(activity) {
    if (activity.kategori) return [activity.kategori];
    const categories = allMarken
        .filter(marke => getBadgeActivityIds(marke).includes(activity.id))
        .map(marke => marke.kategori || "Övrigt");
    return categories.length > 0 ? [...new Set(categories)] : ["Övrigt"];
}

function populateActivityCategories() {
    const categories = [...new Set(allAktiviteter.flatMap(getActivityCategories))]
        .sort((a, b) => a.localeCompare(b, "sv"));
    document.getElementById("selectActivityCategory").innerHTML = [
        '<option value="Alla">Alla kategorier</option>',
        ...categories.map(category => `<option value="${category}">${category}</option>`)
    ].join("");
}

function renderActivityPicker() {
    const group = groups.find(item => item.id === activeActivityGroupId);
    if (!group) return;
    const searchTerm = document.getElementById("selectActivitySearch").value.trim().toLowerCase();
    const category = document.getElementById("selectActivityCategory").value;
    const selected = new Set(Array.isArray(group.activities) ? group.activities : []);
    const activities = allAktiviteter.filter(activity => {
        const matchesCategory = category === "Alla" || getActivityCategories(activity).includes(category);
        const matchesSearch = !searchTerm || [activity.namn, activity.beskrivning, ...(activity.material || [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(searchTerm);
        return matchesCategory && matchesSearch;
    });
    document.getElementById("selectActivityList").innerHTML = activities.length > 0
        ? activities.map(activity => `
            <label class="activity-picker-item">
                <input type="checkbox" value="${activity.id}" ${selected.has(activity.id) ? "checked" : ""}>
                <span><small class="activity-picker-category">${getActivityCategories(activity).join(", ")}</small><strong>${activity.namn}</strong>${formatActivityTime(activity) ? `<small>${formatActivityTime(activity)}</small>` : ""}</span>
                <button class="activity-info-button activity-picker-info-button" type="button" data-activity-id="${activity.id}" title="Visa information" aria-label="Visa information om ${activity.namn}">i</button>
            </label>
        `).join("")
        : '<p class="no-results">Inga aktiviteter matchar.</p>';
    document.querySelectorAll(".activity-picker-info-button").forEach(button => {
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const activity = allAktiviteter.find(item => item.id === button.dataset.activityId);
            if (activity) showActivityDetail(activity);
        });
    });
}

function createActivityPicker() {
    const modal = document.getElementById("selectActivityModal");
    document.getElementById("closeSelectActivityModal").addEventListener("click", () => modal.classList.add("hidden"));
    document.getElementById("createActivityFromPickerBtn").addEventListener("click", () => {
        const group = groups.find(item => item.id === activeActivityGroupId);
        if (!group) return;
        modal.classList.add("hidden");
        openStandaloneActivityForPlanning(group);
    });
    modal.addEventListener("click", event => {
        if (event.target === modal) modal.classList.add("hidden");
    });
    document.getElementById("selectActivitySearch").addEventListener("input", renderActivityPicker);
    document.getElementById("selectActivityCategory").addEventListener("change", renderActivityPicker);
    document.getElementById("saveSelectedActivitiesBtn").addEventListener("click", () => {
        const group = groups.find(item => item.id === activeActivityGroupId);
        if (!group) return;
        const searchTerm = document.getElementById("selectActivitySearch").value.trim().toLowerCase();
        const category = document.getElementById("selectActivityCategory").value;
        const visibleActivityIds = new Set(allAktiviteter
            .filter(activity => {
                const matchesCategory = category === "Alla" || getActivityCategories(activity).includes(category);
                const matchesSearch = !searchTerm || [activity.namn, activity.beskrivning, ...(activity.material || [])]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                    .includes(searchTerm);
                return matchesCategory && matchesSearch;
            })
            .map(activity => activity.id));
        const selectedVisibleActivityIds = [...modal.querySelectorAll("#selectActivityList input:checked")]
            .map(input => input.value);
        const existingActivityIds = Array.isArray(group.activities) ? group.activities : [];
        group.activities = [
            ...existingActivityIds.filter(activityId => !visibleActivityIds.has(activityId)),
            ...selectedVisibleActivityIds
        ];
        group.activities = [...new Set(group.activities)];
        saveGroups();
        renderPlanning(new Set([activeActivityGroupId]));
        modal.classList.add("hidden");
    });
}

function renderEditActivitiesList() {
    const modal = document.getElementById("editActivitiesModal");
    const list = document.getElementById("editActivitiesList");
    const category = document.getElementById("editActivitiesCategory").value;
    const activities = allAktiviteter.filter(activity =>
        activity.id.startsWith("egen-") && (category === "Alla" || getActivityCategories(activity).includes(category))
    );
    list.innerHTML = activities.length > 0
        ? activities.map(activity => `
            <div class="activity-management-item">
                <div><small class="activity-picker-category">${getActivityCategories(activity).join(", ")}</small><strong>${activity.namn}</strong><small>${formatActivityTime(activity) || "Ingen tidsangivelse"}</small></div>
                <div class="activity-management-actions">
                    <button class="activity-info-button" type="button" data-activity-id="${activity.id}" title="Visa information" aria-label="Visa information om ${activity.namn}">i</button>
                    <button class="btn-secondary edit-managed-activity" type="button" data-activity-id="${activity.id}">Redigera</button>
                    <button class="btn-danger delete-managed-activity" type="button" data-activity-id="${activity.id}" aria-label="Radera ${activity.namn}">Radera</button>
                </div>
            </div>
        `).join("")
        : '<p class="no-results">Det finns inga egna aktiviteter ännu.</p>';
    list.querySelectorAll(".edit-managed-activity").forEach(button => {
        button.addEventListener("click", () => {
            const activity = allAktiviteter.find(item => item.id === button.dataset.activityId);
            if (!activity) return;
            modal.classList.add("hidden");
            openStandaloneActivityEditor(activity);
        });
    });
    list.querySelectorAll(".activity-info-button").forEach(button => {
        button.addEventListener("click", () => {
            const activity = allAktiviteter.find(item => item.id === button.dataset.activityId);
            if (activity) showActivityDetail(activity);
        });
    });
    list.querySelectorAll(".delete-managed-activity").forEach(button => {
        button.addEventListener("click", () => {
            const activity = allAktiviteter.find(item => item.id === button.dataset.activityId);
            if (!activity) return;
            deleteStandaloneActivity(activity);
            if (!allAktiviteter.some(item => item.id === activity.id)) renderEditActivitiesList();
        });
    });
}

function openEditActivitiesModal() {
    const categoryFilter = document.getElementById("editActivitiesCategory");
    const categories = [...new Set(allAktiviteter
        .filter(activity => activity.id.startsWith("egen-"))
        .flatMap(getActivityCategories))]
        .sort((a, b) => a.localeCompare(b, "sv"));
    categoryFilter.innerHTML = [
        '<option value="Alla">Alla kategorier</option>',
        ...categories.map(category => `<option value="${category}">${category}</option>`)
    ].join("");
    categoryFilter.onchange = renderEditActivitiesList;
    renderEditActivitiesList();
    const modal = document.getElementById("editActivitiesModal");
    modal.classList.remove("hidden");
}

function createEditActivitiesMenuAction() {
    const modal = document.getElementById("editActivitiesModal");
    document.getElementById("editActivitiesBtn").addEventListener("click", openEditActivitiesModal);
    document.getElementById("closeEditActivitiesModal").addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", event => {
        if (event.target === modal) modal.classList.add("hidden");
    });
}

function openStandaloneActivityEditor(activity) {
    const modal = document.getElementById("createActivityModal");
    populatePlanningActivityCategories();
    activeStandaloneActivityBadge = null;
    activeStandaloneActivityPlanning = null;
    editingStandaloneActivityId = activity.id;
    document.getElementById("createActivityTitle").textContent = "Redigera aktivitet";
    document.getElementById("savePlanningActivityBtn").textContent = "Spara ändringar";
    const currentGroups = groups.filter(group => Array.isArray(group.activities) && group.activities.includes(activity.id));
    document.getElementById("planningActivityMemberships").innerHTML = currentGroups.length > 0
        ? currentGroups.map(group => `<span>${group.name} (${group.level})</span>`).join("")
        : "Inte tillagd i någon planering.";
    document.getElementById("planningActivityName").value = activity.namn || "";
    document.getElementById("planningActivityDescription").value = activity.beskrivning || "";
    document.getElementById("planningActivityCategory").value = activity.kategori || "";
    document.getElementById("planningActivityTime").value = activity.tid || "";
    document.getElementById("planningActivityMaterial").value = Array.isArray(activity.material) ? activity.material.join("\n") : "";
    document.getElementById("planningActivityInstructions").value = activity.genomforande || "";
    document.getElementById("createActivityStatus").textContent = "";
    modal.classList.remove("hidden");
    document.getElementById("planningActivityName").focus();
}

function deleteStandaloneActivity(activity) {
    if (!confirm(`Radera aktiviteten "${activity.namn}"?`)) return;
    localStorage.setItem(CUSTOM_ACTIVITIES_STORAGE_KEY, JSON.stringify(
        loadCustomActivities().filter(item => item.id !== activity.id)
    ));
    const links = loadCustomBadgeActivities();
    Object.keys(links).forEach(badgeId => {
        links[badgeId] = Array.isArray(links[badgeId])
            ? links[badgeId].filter(activityId => activityId !== activity.id)
            : [];
    });
    localStorage.setItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY, JSON.stringify(links));
    groups.forEach(group => {
        group.activities = Array.isArray(group.activities)
            ? group.activities.filter(activityId => activityId !== activity.id)
            : [];
    });
    saveGroups();
    allAktiviteter = allAktiviteter.filter(item => item.id !== activity.id);
    activityDetailPopup.classList.add("hidden");
    renderPlanning();
}

// ── Persistence ────────────────────────────────────────────────────────────

function loadGroups() {
    try {
        const storedGroups = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        return Array.isArray(storedGroups)
            ? storedGroups.map(group => {
                if (!group || typeof group !== "object") return group;
                const { year, term } = parsePlanningYearAndTerm(group);
                group.year = Number.isFinite(year) ? year : "";
                group.term = normalizePlanningTerm(term);
                group.activities = Array.isArray(group.activities) ? group.activities : [];
                group.badges = Array.isArray(group.badges) ? group.badges : [];
                group.meetings = normalizeMeetingList(Array.isArray(group.meetings) ? group.meetings : []);
                return group;
            }).filter(Boolean)
            : [];
    } catch {
        return [];
    }
}

function saveGroups() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups.map(group => ({
        ...group,
        badges: Array.isArray(group.badges) ? group.badges : [],
        activities: Array.isArray(group.activities) ? group.activities : [],
        meetings: normalizeMeetingList(Array.isArray(group.meetings) ? group.meetings : []),
        year: Number.isFinite(getGroupYearValue(group)) ? getGroupYearValue(group) : "",
        term: getGroupTermValue(group)
    }))));
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
            year: Number.isFinite(getGroupYearValue(group)) ? getGroupYearValue(group) : "",
            term: getGroupTermValue(group),
            badges: Array.isArray(group.badges) ? group.badges : [],
            activities: Array.isArray(group.activities) ? group.activities : [],
            meetings: normalizeMeetingList(Array.isArray(group.meetings) ? group.meetings : [])
        })),
        badgeNotes,
        customActivities: loadCustomActivities(),
        customBadgeActivities: loadCustomBadgeActivities()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `gtscout-planeringar-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(downloadUrl);

    const exportInfoBody = document.getElementById("exportInfoBody");
    const activityCount = groups.reduce((count, group) =>
        count + (Array.isArray(group.activities) ? group.activities.length : 0), 0);
    exportInfoBody.innerHTML = `
        <p><strong>Planeringar:</strong> ${groups.length}</p>
        <p><strong>Aktiviteter:</strong> ${activityCount}</p>
        <p><strong>Anteckningsfält:</strong> ${Object.keys(badgeNotes).length}</p>
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
    pdfSelectionState = new Set(groups
        .filter(group => filter.value === "Alla" || group.level === filter.value)
        .map(group => group.id));
    renderPdfSelectionList();
    document.getElementById("pdfSelectionModal").classList.remove("hidden");
}

function generatePlanningPdf(selectedIds, meetingsOnly = false) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        alert("Kunde inte öppna PDF-vyn. Tillåt popupfönster för den här sidan.");
        return;
    }

    const badgeNotes = loadBadgeNotesForTransfer();
    const selectedGroups = groups.filter(group => selectedIds.has(group.id));
    const resolveImage = imagePath => imagePath ? new URL(imagePath, window.location.href).href : "";
    const renderBadge = (badgeId, group) => {
        const marke = allMarken.find(item => item.id === badgeId);
        if (!marke) return `<p class="missing-badge">Märke ${escapeHtml(badgeId)} kunde inte hittas.</p>`;

        const formatCriterion = value => escapeHtml(value)
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\n/g, "<br>");
        const criteria = Array.isArray(marke.kriterier) && marke.kriterier.length > 0
            ? `<div class="pdf-criteria"><strong>Kriterier:</strong><ul>${marke.kriterier.map(criterion => `<li>${formatCriterion(criterion)}</li>`).join("")}</ul></div>`
            : "";
        const note = badgeNotes[marke.id]
            ? `<p><strong>Anteckning:</strong> ${renderLinkedText(badgeNotes[marke.id])}</p>`
            : "";
        const badgeActivityIds = getBadgeActivityIds(marke);
        const plannedActivityIds = Array.isArray(group.activities) ? group.activities : [];
        const badgeActivities = badgeActivityIds
            .filter(activityId => plannedActivityIds.includes(activityId))
            .map(activityId => allAktiviteter.find(activity => activity.id === activityId))
            .filter(Boolean);
        const activities = badgeActivities.length > 0
            ? `<div class="pdf-badge-activities"><strong>Aktiviteter:</strong>${badgeActivities.map(activityId => renderActivity(activityId.id)).join("")}</div>`
            : "";
        const image = resolveImage(marke.bild);

        return `
            <article class="pdf-badge">
                ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(marke.namn)}">` : ""}
                <div>
                    <h3>${escapeHtml(marke.namn)}</h3>
                    ${marke.inledning ? `<p>${formatCriterion(marke.inledning)}</p>` : ""}
                    ${criteria}
                    ${activities}
                    ${note}
                    <p class="pdf-category"><strong>Kategori:</strong> ${escapeHtml(marke.kategori || "Övrigt")}</p>
                    <p><strong>Målgrupp:</strong> ${escapeHtml(formatTargetGroups(marke))}</p>
                    
                </div>
            </article>
        `;
    };
    const renderActivity = activityId => {
        const activity = allAktiviteter.find(item => item.id === activityId);
        if (!activity) return `<p class="missing-badge">Aktivitet ${escapeHtml(activityId)} kunde inte hittas.</p>`;
        const material = Array.isArray(activity.material) ? activity.material.join(", ") : "";
        return `<div class="pdf-activity"><h4>${escapeHtml(activity.namn)}</h4><p>${renderLinkedText(activity.beskrivning || "")}</p>${formatActivityTime(activity) ? `<p><strong>Tid:</strong> ${escapeHtml(formatActivityTime(activity))}</p>` : ""}${material ? `<p><strong>Material:</strong> ${escapeHtml(material)}</p>` : ""}</div>`;
    };
    const renderMeeting = meeting => {
        const badge = allMarken.find(item => item.id === meeting.badgeId);
        const selectedActivities = (meeting.activities || [])
            .map(activityId => allAktiviteter.find(item => item.id === activityId))
            .filter(Boolean);
        const badgeImage = badge?.bild
            ? `<img class="pdf-meeting-badge" src="${escapeHtml(resolveImage(badge.bild))}" alt="${escapeHtml(badge.namn)}" title="${escapeHtml(badge.namn)}">`
            : "";
        return `<article class="pdf-meeting">
            <h3>Vecka ${escapeHtml(meeting.week || "-")}${meeting.date ? ` <span>(${escapeHtml(meeting.date)})</span>` : ""}</h3>
            ${badgeImage}
            ${meeting.notes ? `<p class="pdf-meeting-notes">${escapeHtml(meeting.notes)}</p>` : ""}
            ${selectedActivities.length > 0 ? `<p><strong>Aktiviteter:</strong> ${escapeHtml(selectedActivities.map(activity => activity.namn).join(", "))}</p>` : ""}
            ${meeting.responsible ? `<p><strong>Ansvarig:</strong> ${escapeHtml(meeting.responsible)}</p>` : ""}
        </article>`;
    };
    const planningSections = selectedGroups.map(group => {
        const planningIcon = getLevelIcon(group.level);
        const icon = planningIcon
            ? `<img class="pdf-planning-icon" src="${escapeHtml(resolveImage(planningIcon))}" alt="${escapeHtml(group.level)}">`
            : "";
        const plannedActivityIds = Array.isArray(group.activities) ? group.activities : [];
        const linkedActivityIds = new Set((Array.isArray(group.badges) ? group.badges : []).flatMap(badgeId => {
            const marke = allMarken.find(item => item.id === badgeId);
            return marke ? getBadgeActivityIds(marke) : [];
        }));
        const unassignedActivities = plannedActivityIds.filter(activityId => !linkedActivityIds.has(activityId));
        const meetings = normalizeMeetingList(Array.isArray(group.meetings) ? group.meetings : []);
        return `
        <section class="pdf-planning">
            <h2 class="pdf-planning-heading">${icon}<span>${escapeHtml(group.name)} - ${escapeHtml(group.level)}</span></h2>
            <p class="pdf-planning-intro">${meetingsOnly ? "Följande möten är planerade:" : "Följande märken och aktiviteter är planerade:"}</p>
            ${!meetingsOnly && Array.isArray(group.badges) && group.badges.length > 0
                ? group.badges.map(badgeId => renderBadge(badgeId, group)).join("")
                : !meetingsOnly ? "<p>Inga märken planerade.</p>" : ""}
            ${!meetingsOnly && unassignedActivities.length > 0
                ? `<div class="pdf-activities"><h3>Övriga aktiviteter</h3>${unassignedActivities.map(renderActivity).join("")}</div>`
                : ""}
            ${meetings.length > 0
                ? `<div class="pdf-meetings"><h3>Möten</h3>${meetings.map(renderMeeting).join("")}</div>`
                : ""}
        </section>
        `;
    }).join("");

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
                .pdf-document-header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
                .pdf-document-logo { width: 28mm; height: 28mm; object-fit: contain; flex: 0 0 28mm; }
                h1 { margin: 0; color: #003660; font-size: 22pt; line-height: 1.15; }
                .created { margin: 0 0 20px; color: #5b6b7a; }
                .pdf-planning { page-break-before: always; }
                .pdf-planning:first-of-type { page-break-before: auto; }
                .pdf-planning-heading { display: flex; align-items: center; gap: 10px; margin: 0; padding-bottom: 4px; border-bottom: 2px solid #003660; color: #003660; font-size: 17pt; }
                .pdf-planning-intro { margin: 8px 0 14px; color: #003660; font-size: 12pt; font-weight: 600; }
                .pdf-planning-icon { width: 34px; height: 34px; object-fit: contain; }
                .pdf-level { margin: 6px 0 14px; font-weight: bold; }
                .pdf-badge { display: flex; gap: 14px; margin: 0 0 16px; padding: 10px 0; border-bottom: 1px solid #d0d7de; break-inside: avoid; }
                .pdf-badge img { width: 76px; height: 76px; flex: 0 0 76px; object-fit: contain; }
                .pdf-badge h3 { margin: 0 0 5px; color: #003660; font-size: 13pt; }
                .pdf-badge p { margin: 2px 0; }
                .pdf-category { margin-top: 14px !important; }
                .pdf-criteria { margin-top: 14px; }
                .pdf-criteria ul { margin: 3px 0 0 18px; padding: 0; }
                .pdf-criteria li { margin: 1px 0; }
                .pdf-badge-activities { margin-top: 14px; padding: 8px 10px; border-left: 3px solid #2f855a; background: #f0fdf4; break-inside: avoid; }
                .pdf-activity { margin-top: 6px; padding-top: 6px; border-top: 1px solid #cde8d4; }
                .pdf-activity:first-of-type { border-top: 0; padding-top: 2px; }
                .pdf-activity h4 { margin: 0 0 2px; color: #166534; font-size: 11pt; }
                .pdf-activity p { margin: 2px 0; }
                .pdf-activities { margin-top: 14px; }
                .pdf-activities h3 { color: #166534; font-size: 12pt; }
                .pdf-meetings { margin-top: 18px; break-inside: avoid; }
                .pdf-meetings > h3 { margin: 0 0 8px; color: #003660; font-size: 12pt; }
                .pdf-meeting { position: relative; margin: 0 0 8px; padding: 8px 10px; border: 1px solid #d0d7de; border-radius: 6px; break-inside: avoid; }
                .pdf-meeting h3 { margin: 0 0 4px; color: #003660; font-size: 11pt; }
                .pdf-meeting h3 span { color: #536477; font-weight: normal; }
                .pdf-meeting p { margin: 2px 0; }
                .pdf-meeting-notes { white-space: pre-wrap; }
                .pdf-meeting-badge { width: 32px; height: 32px; object-fit: contain; float: right; }
                .missing-badge { color: #9b1c1c; }
            </style>
        </head>
        <body>
            <header class="pdf-document-header">
                <img class="pdf-document-logo" src="${escapeHtml(resolveImage("./images/icons/GTorp_250px.png"))}" alt="Gullbrandstorps Scoutkår">
                <h1>${meetingsOnly ? "Gullbrandstorps Scoutkårs Mötesplanering" : "Gullbrandstorps Scoutkårs Märkesschema"}</h1>
            </header>
            ${planningSections || "<p>Inga planeringar valdes.</p>"}
            <p class="created">Exporterad ${escapeHtml(new Date().toLocaleDateString("sv-SE"))}</p>
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
            const importedActivities = parsed && !Array.isArray(parsed) && Array.isArray(parsed.customActivities)
                ? parsed.customActivities.filter(activity => activity && typeof activity.id === "string" && typeof activity.namn === "string")
                : [];
            const importedActivityLinks = parsed && !Array.isArray(parsed) && parsed.customBadgeActivities && typeof parsed.customBadgeActivities === "object"
                ? parsed.customBadgeActivities
                : {};
            const customActivities = loadCustomActivities();
            const activityIds = new Set(customActivities.map(activity => activity.id));
            importedActivities.forEach(activity => {
                if (!activityIds.has(activity.id)) {
                    customActivities.push(activity);
                    activityIds.add(activity.id);
                }
            });
            const customBadgeActivities = loadCustomBadgeActivities();
            Object.entries(importedActivityLinks).forEach(([badgeId, activityIdsForBadge]) => {
                if (!Array.isArray(activityIdsForBadge)) return;
                customBadgeActivities[badgeId] = [
                    ...new Set([
                        ...(Array.isArray(customBadgeActivities[badgeId]) ? customBadgeActivities[badgeId] : []),
                        ...activityIdsForBadge.filter(activityId => activityIds.has(activityId))
                    ])
                ];
            });
            const badgeNotes = loadBadgeNotesForTransfer();
            let importedNoteCount = 0;
            Object.entries(importedNotes).forEach(([badgeId, note]) => {
                if (typeof note === "string" && note.trim() && !badgeNotes[badgeId]) {
                    badgeNotes[badgeId] = note;
                    importedNoteCount += 1;
                }
            });

            validPlannings.forEach(planning => {
                const importedYear = Number.parseInt(String(planning.year ?? ""), 10);
                const importedTerm = normalizePlanningTerm(planning.term);
                groups.push({
                    id: crypto.randomUUID(),
                    name: getImportedPlanningName(planning.name.trim(), planning.level),
                    level: planning.level,
                    year: Number.isFinite(importedYear) ? importedYear : "",
                    term: importedTerm || (() => {
                        const fallback = String(planning.name ?? "").match(/\b(?:HT|VT)\b/i);
                        return fallback ? fallback[0].toUpperCase() : "";
                    })(),
                    badges: Array.isArray(planning.badges) ? [...new Set(planning.badges.filter(Boolean))] : [],
                    activities: Array.isArray(planning.activities) ? [...new Set(planning.activities.filter(Boolean))] : [],
                    meetings: normalizeMeetingList(Array.isArray(planning.meetings) ? planning.meetings : [])
                });
            });
            saveGroups();
            localStorage.setItem(BADGE_NOTES_STORAGE_KEY, JSON.stringify(badgeNotes));
            localStorage.setItem(CUSTOM_ACTIVITIES_STORAGE_KEY, JSON.stringify(customActivities));
            localStorage.setItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY, JSON.stringify(customBadgeActivities));
            allAktiviteter = [
                ...allAktiviteter.filter(activity => !activity.id.startsWith("egen-")),
                ...customActivities
            ];
            renderPlanning();
            alert(`${validPlannings.length} planeringar, ${importedActivities.length} aktiviteter och ${importedNoteCount} anteckningsfält importerades.`);
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
        const [markenResponse, aktiviteterResponse] = await Promise.all([
            fetch("data/marken.json"),
            fetch("data/aktiviteter.json")
        ]);
        if (!markenResponse.ok || !aktiviteterResponse.ok) throw new Error("Datafiler kunde inte laddas");
        const [marken, aktiviteter] = await Promise.all([
            markenResponse.json(),
            aktiviteterResponse.json()
        ]);
        allMarken = marken;
        allAktiviteter = [...aktiviteter, ...loadCustomActivities()];
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

function normalizeTargetGroup(group) {
    const rawGroup = String(group ?? "").trim();
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
    return map[rawGroup.toLowerCase()] || rawGroup;
}

function getTargetGroups(marke) {
    const rawGroups = marke.grupp ?? marke.malgrupp ?? marke.målgrupp ?? [];
    const groups = Array.isArray(rawGroups) ? rawGroups : [rawGroups];
    return [...new Set(groups.map(normalizeTargetGroup).filter(Boolean))];
}

function getPrimaryTargetGroup(marke) {
    return getTargetGroups(marke)[0] || "Ingen målgrupp";
}

function formatTargetGroups(marke) {
    return getTargetGroups(marke).join(", ") || "Ingen målgrupp";
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

function populateGroupFilterOptions() {
    const yearFilter = document.getElementById("groupYearFilter");
    const termFilter = document.getElementById("groupTermFilter");
    if (!yearFilter || !termFilter) return;

    const years = [...new Set(groups
        .map(getGroupYearValue)
        .filter(year => Number.isFinite(year)))].sort((a, b) => a - b);
    const terms = [...new Set(groups
        .map(getGroupTermValue)
        .filter(Boolean))]
        .sort((a, b) => {
            const order = { HT: 0, VT: 1 };
            const left = order[a] ?? 2;
            const right = order[b] ?? 2;
            return left !== right ? left - right : a.localeCompare(b, "sv");
        });

    yearFilter.innerHTML = [
        '<option value="Alla">Alla år</option>',
        ...years.map(year => `<option value="${year}">${year}</option>`)
    ].join("");
    termFilter.innerHTML = [
        '<option value="Alla">Alla terminer</option>',
        ...terms.map(term => `<option value="${term}">${term}</option>`)
    ].join("");

    if (!years.some(year => String(year) === String(groupFilters.year))) {
        groupFilters.year = "Alla";
    }
    if (!terms.some(term => term === groupFilters.term)) {
        groupFilters.term = "Alla";
    }

    yearFilter.value = groupFilters.year;
    termFilter.value = groupFilters.term;
}

function renderPlanning(openActivityGroupIds = new Set(), openMeetingGroupIds = new Set()) {
    const preservedOpenActivityGroupIds = new Set(
        [...document.querySelectorAll("#planningGrid .planned-activities[open]")]
            .map(details => details.closest(".group-badges")?.dataset.groupId)
            .filter(Boolean)
    );
    const preservedOpenMeetingGroupIds = new Set(
        [...document.querySelectorAll("#planningGrid .planned-meetings[open]")]
            .map(details => details.closest(".group-badges")?.dataset.groupId)
            .filter(Boolean)
    );
    const activeOpenActivityGroupIds = new Set([...preservedOpenActivityGroupIds, ...openActivityGroupIds]);
    const activeOpenMeetingGroupIds = new Set([...preservedOpenMeetingGroupIds, ...openMeetingGroupIds]);
    populateGroupFilterOptions();
    const grid = document.getElementById("planningGrid");
    grid.innerHTML = "";

    const searchTerm = groupFilters.search.trim().toLowerCase();
    const visibleGroups = groups.filter(g => {
        const matchesLevel = groupFilters.level === "Alla" || g.level === groupFilters.level;
        const matchesYear = groupFilters.year === "Alla" || String(getGroupYearValue(g) ?? "") === String(groupFilters.year);
        const matchesTerm = groupFilters.term === "Alla" || getGroupTermValue(g) === groupFilters.term;
        const matchesSearch = !searchTerm || g.name.toLowerCase().includes(searchTerm);
        return matchesLevel && matchesYear && matchesTerm && matchesSearch;
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
            const pa = getGroupSortValue(a);
            const pb = getGroupSortValue(b);
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
            const metaParts = [];
            if (Number.isFinite(getGroupYearValue(group))) metaParts.push(String(getGroupYearValue(group)));
            if (getGroupTermValue(group)) metaParts.push(getGroupTermValue(group));
            card.innerHTML = `
                <div class="group-card-header">
                    <h3 class="group-name" title="Planeringens namn">${group.name}</h3>
                    ${metaParts.length > 0 ? `<div class="group-meta">${metaParts.join(" • ")}</div>` : ""}
                    <div class="group-card-actions">
                        <button class="btn-secondary edit-group-btn" type="button" data-group-id="${group.id}" title="Redigera planering">Redigera</button>
                        <button class="btn-danger remove-group-btn" type="button" data-group-id="${group.id}" title="Ta bort planering">&times;</button>
                    </div>
                </div>
                <div class="group-badges" data-group-id="${group.id}">
                    ${renderGroupBadges(group, activeOpenActivityGroupIds, activeOpenMeetingGroupIds)}
                </div>
            `;
            card.querySelector(".edit-group-btn").addEventListener("click", () => openGroupEditor(group.id));
            card.querySelector(".add-badge-btn").addEventListener("click", event => {
                event.stopPropagation();
                openBadgePicker(group.id);
            });
            card.querySelector(".add-activity-btn").addEventListener("click", event => {
                event.stopPropagation();
                openActivityPicker(group.id);
            });
            card.querySelector(".add-meeting-btn").addEventListener("click", event => {
                event.stopPropagation();
                openMeetingModal(group.id);
            });
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

    document.querySelectorAll(".remove-activity-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            removeActivityFromGroup(btn.dataset.groupId, btn.dataset.activityId);
        });
    });

    document.querySelectorAll(".edit-meeting-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            openMeetingModal(btn.dataset.groupId, btn.dataset.meetingId);
        });
    });

    document.querySelectorAll(".print-meetings-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            generatePlanningPdf(new Set([btn.dataset.groupId]), true);
        });
    });

    document.querySelectorAll(".remove-meeting-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            removeMeetingFromGroup(btn.dataset.groupId, btn.dataset.meetingId);
        });
    });

    document.querySelectorAll(".planned-activity-info-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const activity = allAktiviteter.find(item => item.id === btn.dataset.activityId);
            if (activity) showActivityDetail(activity);
        });
    });

    document.querySelectorAll(".planned-badge").forEach(el => {
        el.addEventListener("click", () => {
            const marke = allMarken.find(m => m.id === el.dataset.badgeId);
            if (marke) showBadgeDetail(marke, el.dataset.groupId);
        });
    });

    bindBadgeDragAndDrop();
    bindActivityDragAndDrop();
}

function renderGroupBadges(group, openActivityGroupIds = new Set(), openMeetingGroupIds = new Set()) {
    const activities = Array.isArray(group.activities) ? group.activities : [];
    const meetings = normalizeMeetingList(Array.isArray(group.meetings) ? group.meetings : []);

    const badges = group.badges.map(badgeId => {
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
    const activityMarkup = `<details class="planned-activities"${openActivityGroupIds.has(group.id) ? " open" : ""}><summary><span>Aktiviteter</span><button class="btn-secondary add-activity-btn" type="button" data-group-id="${group.id}">+ Aktivitet</button></summary><div class="planned-activities-list">${activities.map(activityId => {
            const activity = allAktiviteter.find(item => item.id === activityId);
            return activity
                ? `<div class="planned-activity" data-group-id="${group.id}" data-activity-id="${activity.id}" draggable="true" title="Dra för att ändra ordning">
                        <span>${activity.namn}</span>
                        ${formatActivityTime(activity) ? `<small>${formatActivityTime(activity)}</small>` : ""}
                        <button class="activity-info-button planned-activity-info-btn" type="button" data-activity-id="${activity.id}" title="Visa detaljer för ${activity.namn}" aria-label="Visa detaljer för ${activity.namn}">i</button>
                        <button class="remove-activity-btn" type="button" data-group-id="${group.id}" data-activity-id="${activity.id}" title="Ta bort ${activity.namn} från planeringen" aria-label="Ta bort ${activity.namn}">&times;</button>
                   </div>`
                : "";
            }).join("")}</div></details>`;
        const meetingsMarkup = `<details class="planned-meetings"${openMeetingGroupIds.has(group.id) ? " open" : ""}><summary><span>Möten</span><button class="btn-secondary add-meeting-btn" type="button" data-group-id="${group.id}">+ Möte</button></summary><div class="planned-meetings-list"><div class="planned-meetings-actions"><button class="btn-secondary print-meetings-btn" type="button" data-group-id="${group.id}">Skriv ut möten</button></div>${meetings.map(meeting => {
            const selectedActivities = (meeting.activities || []).map(activityId => allAktiviteter.find(item => item.id === activityId)).filter(Boolean);
            const badge = allMarken.find(item => item.id === meeting.badgeId);
            return `<div class="planned-meeting" data-group-id="${group.id}" data-meeting-id="${meeting.id}">
                    <div class="planned-meeting-header">
                        <strong>Vecka ${escapeHtml(meeting.week || "-")}</strong>
                        <div class="planned-meeting-tools">
                            <button class="edit-meeting-btn" type="button" data-group-id="${group.id}" data-meeting-id="${meeting.id}">Redigera</button>
                            <button class="remove-meeting-btn" type="button" data-group-id="${group.id}" data-meeting-id="${meeting.id}" aria-label="Ta bort möte">&times;</button>
                        </div>
                    </div>
                    ${meeting.date ? `<small>${escapeHtml(meeting.date)}</small>` : ""}
                    ${meeting.notes ? `<p>${escapeHtml(meeting.notes)}</p>` : ""}
                    ${badge ? `<div class="planned-meeting-badge" title="${escapeHtml(badge.namn)}"><img src="${escapeHtml(badge.bild)}" alt="${escapeHtml(badge.namn)}"></div>` : ""}
                    ${selectedActivities.length > 0 ? `<div class="planned-meeting-activity-list"><strong>Aktiviteter:</strong> ${escapeHtml(selectedActivities.map(activity => activity.namn).join(", "))}</div>` : ""}
                    ${meeting.responsible ? `<div><strong>Ansvarig:</strong> ${escapeHtml(meeting.responsible)}</div>` : ""}
                </div>`;
        }).join("")}</div></details>`;
    return `${badges}<div class="group-badges-actions"><button class="btn-secondary add-badge-btn" type="button" data-group-id="${group.id}">+ Märke</button></div>${activityMarkup}${meetingsMarkup}`;
}

// ── Groups CRUD ────────────────────────────────────────────────────────────

function addGroup(name, level, year = "", term = "") {
    const trimmedName = String(name || "").trim();
    const normalizedYear = Number.parseInt(String(year ?? ""), 10);
    const normalizedTerm = normalizePlanningTerm(term);
    groups.push({
        id: crypto.randomUUID(),
        name: trimmedName || [Number.isFinite(normalizedYear) ? `${normalizedYear}` : "", normalizedTerm].filter(Boolean).join(" "),
        level,
        year: Number.isFinite(normalizedYear) ? normalizedYear : "",
        term: normalizedTerm,
        badges: [],
        activities: [],
        meetings: []
    });
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

function openGroupEditor(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    groupModal.dataset.editingGroupId = groupId;
    document.getElementById("groupModalTitle").textContent = "Redigera planering";
    document.getElementById("saveGroupBtn").textContent = "Uppdatera";
    document.getElementById("groupName").value = stripPlanningYearPrefix(group.name || "");
    document.getElementById("groupYear").value = Number.isFinite(getGroupYearValue(group)) ? getGroupYearValue(group) : "";
    document.getElementById("groupTerm").value = getGroupTermValue(group) || "";
    document.getElementById("groupLevel").value = group.level || "Familjescouting";
    groupModal.classList.remove("hidden");
    document.getElementById("groupName").focus();
}

function resetGroupModalState() {
    groupModal.dataset.editingGroupId = "";
    document.getElementById("groupModalTitle").textContent = "Ny plannering";
    document.getElementById("saveGroupBtn").textContent = "Spara";
}

function renameGroup(id) {
    openGroupEditor(id);
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

function moveActivityWithinGroup(sourceGroupId, targetGroupId, activityId, targetIndex) {
    if (!sourceGroupId || sourceGroupId !== targetGroupId) return false;
    const group = groups.find(item => item.id === sourceGroupId);
    if (!group || !Array.isArray(group.activities)) return false;

    const fromIndex = group.activities.indexOf(activityId);
    if (fromIndex === -1) return false;

    const boundedTargetIndex = Math.max(0, Math.min(targetIndex, group.activities.length));
    if (fromIndex === boundedTargetIndex || fromIndex + 1 === boundedTargetIndex) return false;

    const [movedActivityId] = group.activities.splice(fromIndex, 1);
    group.activities.splice(boundedTargetIndex > fromIndex ? boundedTargetIndex - 1 : boundedTargetIndex, 0, movedActivityId);
    saveGroups();
    const openActivityGroupIds = new Set(
        [...document.querySelectorAll(".planned-activities[open]")]
            .map(details => details.closest(".group-badges")?.dataset.groupId)
            .filter(Boolean)
    );
    openActivityGroupIds.add(sourceGroupId);
    renderPlanning(openActivityGroupIds);
    return true;
}

function parseDraggedActivity(event) {
    try {
        const raw = event.dataTransfer.getData(ACTIVITY_DND_MIME);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function getDraggedActivity(event) {
    return parseDraggedActivity(event) || activeDraggedActivity;
}

function bindActivityDragAndDrop() {
    const clearDragMarkers = () => {
        document.querySelectorAll(".planned-activity--dragging").forEach(item => item.classList.remove("planned-activity--dragging"));
        document.querySelectorAll(".planned-activity--insert-before, .planned-activity--insert-after").forEach(item => {
            item.classList.remove("planned-activity--insert-before", "planned-activity--insert-after");
        });
        document.querySelectorAll(".planned-activities-list--dragover").forEach(list => list.classList.remove("planned-activities-list--dragover"));
    };

    document.querySelectorAll(".planned-activity").forEach(item => {
        item.addEventListener("dragstart", event => {
            const { activityId, groupId } = item.dataset;
            if (!activityId || !groupId) return;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(ACTIVITY_DND_MIME, JSON.stringify({ activityId, groupId }));
            activeDraggedActivity = { activityId, groupId };
            item.classList.add("planned-activity--dragging");
        });

        item.addEventListener("dragend", () => {
            activeDraggedActivity = null;
            clearDragMarkers();
        });

        item.addEventListener("dragover", event => {
            const dragged = getDraggedActivity(event);
            if (!dragged || dragged.groupId !== item.dataset.groupId) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            document.querySelectorAll(".planned-activity--insert-before, .planned-activity--insert-after").forEach(target => {
                target.classList.remove("planned-activity--insert-before", "planned-activity--insert-after");
            });
            const insertAfter = event.clientY >= item.getBoundingClientRect().top + item.offsetHeight / 2;
            item.classList.add(insertAfter ? "planned-activity--insert-after" : "planned-activity--insert-before");
        });

        item.addEventListener("dragleave", event => {
            if (!item.contains(event.relatedTarget)) item.classList.remove("planned-activity--insert-before", "planned-activity--insert-after");
        });

        item.addEventListener("drop", event => {
            const dragged = getDraggedActivity(event);
            if (!dragged || dragged.groupId !== item.dataset.groupId) return;
            event.preventDefault();
            event.stopPropagation();
            const insertAfter = item.classList.contains("planned-activity--insert-after");
            clearDragMarkers();
            const group = groups.find(item => item.id === dragged.groupId);
            if (!group) return;
            const targetIndex = group.activities.indexOf(item.dataset.activityId)
                + (insertAfter ? 1 : 0);
            moveActivityWithinGroup(dragged.groupId, item.dataset.groupId, dragged.activityId, targetIndex);
        });
    });

    document.querySelectorAll(".planned-activities-list").forEach(list => {
        list.addEventListener("dragover", event => {
            const dragged = getDraggedActivity(event);
            if (!dragged || dragged.groupId !== list.closest(".group-badges")?.dataset.groupId) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            list.classList.add("planned-activities-list--dragover");
        });

        list.addEventListener("dragleave", event => {
            if (!list.contains(event.relatedTarget)) list.classList.remove("planned-activities-list--dragover");
        });

        list.addEventListener("drop", event => {
            const dragged = getDraggedActivity(event);
            const groupId = list.closest(".group-badges")?.dataset.groupId;
            if (!dragged || dragged.groupId !== groupId) return;
            event.preventDefault();
            clearDragMarkers();
            const group = groups.find(item => item.id === groupId);
            if (group) moveActivityWithinGroup(dragged.groupId, groupId, dragged.activityId, group.activities.length);
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

function removeActivityFromGroup(groupId, activityId) {
    const group = groups.find(g => g.id === groupId);
    if (!group || !Array.isArray(group.activities)) return;
    group.activities = group.activities.filter(id => id !== activityId);
    group.meetings = normalizeMeetingList((group.meetings || []).map(meeting => ({
        ...meeting,
        activities: (meeting.activities || []).filter(id => id !== activityId)
    })));
    saveGroups();
    renderPlanning();
}

function normalizeMeetingList(meetings) {
    if (!Array.isArray(meetings)) return [];
    return meetings
        .map(meeting => {
            if (!meeting || typeof meeting !== "object") return null;
            const weekValue = String(meeting.week ?? "").trim();
            return {
                id: typeof meeting.id === "string" && meeting.id.trim() ? meeting.id.trim() : crypto.randomUUID(),
                week: weekValue || (typeof meeting.vecka === "number" ? String(meeting.vecka) : ""),
                date: String(meeting.date ?? ""),
                responsible: String(meeting.responsible ?? meeting.ansvarig ?? "").trim(),
                badgeId: String(meeting.badgeId ?? meeting.markeId ?? "").trim(),
                activities: Array.isArray(meeting.activities) ? [...new Set(meeting.activities.filter(Boolean))] : [],
                notes: String(meeting.notes ?? meeting.note ?? "").trim()
            };
        })
        .filter(Boolean);
}

function openMeetingModal(groupId, meetingId = null) {
    const modal = document.getElementById("meetingModal");
    const group = groups.find(item => item.id === groupId);
    if (!group) return;

    document.getElementById("meetingModalTitle").textContent = `${group.level || "Målgrupp"} – ${group.name} – Möte`;
    const meeting = meetingId ? normalizeMeetingList(group.meetings || []).find(item => item.id === meetingId) : null;
    const activityList = document.getElementById("meetingActivityList");
    const selectedIds = new Set((meeting && Array.isArray(meeting.activities) ? meeting.activities : []));
    const badgeList = (Array.isArray(group.badges) ? group.badges : [])
        .map(badgeId => allMarken.find(item => item.id === badgeId))
        .filter(Boolean)
        .sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
    const availableActivities = (Array.isArray(group.activities) ? group.activities : [])
        .map(activityId => allAktiviteter.find(item => item.id === activityId))
        .filter(Boolean);

    modal.dataset.groupId = groupId;
    modal.dataset.meetingId = meetingId || "";
    document.getElementById("meetingWeek").value = meeting ? (meeting.week || "") : "";
    document.getElementById("meetingDate").value = meeting ? (meeting.date || "") : "";
    document.getElementById("meetingResponsible").value = meeting ? (meeting.responsible || "") : "";
    const meetingBadge = document.getElementById("meetingBadge");
    const meetingBadgePicker = document.getElementById("meetingBadgePicker");
    meetingBadge.value = meeting?.badgeId || "";
    meetingBadgePicker.innerHTML = [
        `<button class="meeting-badge-option${meetingBadge.value ? "" : " meeting-badge-option--selected"}" type="button" data-badge-id="" aria-pressed="${meetingBadge.value ? "false" : "true"}">Inget märke</button>`,
        ...badgeList.map(badge => `<button class="meeting-badge-option${meetingBadge.value === badge.id ? " meeting-badge-option--selected" : ""}" type="button" data-badge-id="${escapeHtml(badge.id)}" aria-pressed="${meetingBadge.value === badge.id ? "true" : "false"}"><img src="${escapeHtml(badge.bild)}" alt=""><span>${escapeHtml(badge.namn)}</span></button>`)
    ].join("");
    meetingBadgePicker.querySelectorAll(".meeting-badge-option").forEach(option => {
        option.addEventListener("click", () => {
            meetingBadge.value = option.dataset.badgeId || "";
            meetingBadgePicker.querySelectorAll(".meeting-badge-option").forEach(item => {
                const selected = item === option;
                item.classList.toggle("meeting-badge-option--selected", selected);
                item.setAttribute("aria-pressed", String(selected));
            });
        });
    });
    document.getElementById("meetingNotes").value = meeting ? (meeting.notes || "") : "";
    document.getElementById("meetingSeriesCount").value = "10";
    document.getElementById("meetingSeriesStartWeek").value = "1";
    document.getElementById("meetingSeriesStartDate").value = "";
    activityList.innerHTML = availableActivities.length > 0
        ? availableActivities.map(activity => `
            <label class="meeting-activity-option">
                <input type="checkbox" value="${activity.id}" ${selectedIds.has(activity.id) ? "checked" : ""}>
                <span>${escapeHtml(activity.namn)}</span>
            </label>`).join("")
        : "<p class='group-empty'>Det finns inga aktiva aktiviteter i denna planering ännu.</p>";

    modal.classList.remove("hidden");
    document.getElementById("meetingWeek").focus();
}

function saveMeetingFromModal() {
    const modal = document.getElementById("meetingModal");
    const groupId = modal.dataset.groupId;
    const group = groups.find(item => item.id === groupId);
    if (!group) return;

    const week = document.getElementById("meetingWeek").value.trim();
    const date = document.getElementById("meetingDate").value;
    const responsible = document.getElementById("meetingResponsible").value.trim();
    const badgeId = document.getElementById("meetingBadge").value;
    const notes = document.getElementById("meetingNotes").value.trim();
    const selectedActivities = [...document.querySelectorAll("#meetingActivityList input:checked")].map(input => input.value);
    if (!week && !date) {
        document.getElementById("meetingWeek").focus();
        return;
    }

    const payload = {
        week,
        date,
        responsible,
        badgeId,
        activities: [...new Set(selectedActivities.filter(Boolean))],
        notes
    };

    if (modal.dataset.meetingId) {
        updateMeetingForGroup(groupId, modal.dataset.meetingId, payload);
    } else {
        createMeetingForGroup(groupId, payload);
    }
    modal.classList.add("hidden");
}

function generateMeetingSeries(groupId, count, startWeek, startDate, activities = [], badgeId = "", responsible = "", notes = "") {
    const group = groups.find(item => item.id === groupId);
    if (!group) return;

    const meetingCount = Math.max(1, Number.parseInt(count, 10) || 1);
    const firstWeek = Math.max(1, Number.parseInt(startWeek, 10) || 1);
    const baseDate = startDate ? new Date(`${startDate}T12:00:00`) : new Date();
    const generatedMeetings = [];

    for (let index = 0; index < meetingCount; index += 1) {
        const nextDate = new Date(baseDate);
        nextDate.setDate(baseDate.getDate() + (index * 7));
        generatedMeetings.push({
            id: crypto.randomUUID(),
            week: String(firstWeek + index),
            date: nextDate.toISOString().slice(0, 10),
            responsible,
            badgeId,
            activities: [...new Set(activities.filter(Boolean))],
            notes
        });
    }

    group.meetings = normalizeMeetingList([...(Array.isArray(group.meetings) ? group.meetings : []), ...generatedMeetings]);
    saveGroups();
    renderPlanning();
}

function bindMeetingModalActions() {
    const modal = document.getElementById("meetingModal");
    const seriesModal = document.getElementById("meetingSeriesModal");
    document.getElementById("closeMeetingModal").addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", event => {
        if (event.target === modal) modal.classList.add("hidden");
    });
    document.getElementById("generateMeetingSeriesBtn").addEventListener("click", () => {
        const groupId = modal.dataset.groupId;
        if (!groupId) return;
        seriesModal.dataset.groupId = groupId;
        seriesModal.classList.remove("hidden");
        document.getElementById("meetingSeriesCount").focus();
    });
    const closeSeriesModal = () => seriesModal.classList.add("hidden");
    document.getElementById("closeMeetingSeriesModal").addEventListener("click", closeSeriesModal);
    document.getElementById("closeMeetingSeriesBtn").addEventListener("click", closeSeriesModal);
    seriesModal.addEventListener("click", event => {
        if (event.target === seriesModal) closeSeriesModal();
    });
    document.getElementById("confirmMeetingSeriesBtn").addEventListener("click", () => {
        const groupId = seriesModal.dataset.groupId;
        if (!groupId) return;
        const selectedActivities = [...document.querySelectorAll("#meetingActivityList input:checked")]
            .map(input => input.value);
        generateMeetingSeries(
            groupId,
            document.getElementById("meetingSeriesCount").value,
            document.getElementById("meetingSeriesStartWeek").value,
            document.getElementById("meetingSeriesStartDate").value,
            selectedActivities,
            document.getElementById("meetingBadge").value,
            document.getElementById("meetingResponsible").value.trim(),
            document.getElementById("meetingNotes").value.trim()
        );
        closeSeriesModal();
        modal.classList.add("hidden");
    });
    document.getElementById("saveMeetingBtn").addEventListener("click", saveMeetingFromModal);
}

bindMeetingModalActions();

function createMeetingForGroup(groupId, meetingInput = {}) {
    const group = groups.find(item => item.id === groupId);
    if (!group) return null;
    const meeting = {
        id: typeof meetingInput.id === "string" && meetingInput.id.trim() ? meetingInput.id.trim() : crypto.randomUUID(),
        week: String(meetingInput.week ?? "").trim(),
        date: String(meetingInput.date ?? ""),
        responsible: String(meetingInput.responsible ?? meetingInput.ansvarig ?? "").trim(),
        badgeId: String(meetingInput.badgeId ?? meetingInput.markeId ?? "").trim(),
        activities: Array.isArray(meetingInput.activities) ? [...new Set(meetingInput.activities.filter(Boolean))] : [],
        notes: String(meetingInput.notes ?? meetingInput.note ?? "").trim()
    };
    group.meetings = normalizeMeetingList([...(Array.isArray(group.meetings) ? group.meetings : []), meeting]);
    saveGroups();
    renderPlanning(new Set(), new Set([groupId]));
    return meeting;
}

function updateMeetingForGroup(groupId, meetingId, meetingInput = {}) {
    const group = groups.find(item => item.id === groupId);
    if (!group) return null;
    group.meetings = normalizeMeetingList((group.meetings || []).map(meeting => {
        if (meeting.id !== meetingId) return meeting;
        return {
            ...meeting,
            week: String(meetingInput.week ?? meeting.week ?? "").trim(),
            date: String(meetingInput.date ?? meeting.date ?? ""),
            responsible: String(meetingInput.responsible ?? meetingInput.ansvarig ?? meeting.responsible ?? "").trim(),
            badgeId: String(meetingInput.badgeId ?? meetingInput.markeId ?? meeting.badgeId ?? "").trim(),
            activities: Array.isArray(meetingInput.activities)
                ? [...new Set(meetingInput.activities.filter(Boolean))]
                : [...(meeting.activities || [])],
            notes: String(meetingInput.notes ?? meetingInput.note ?? meeting.notes ?? "").trim()
        };
    }));
    saveGroups();
    renderPlanning();
    return group.meetings.find(meeting => meeting.id === meetingId) || null;
}

function removeMeetingFromGroup(groupId, meetingId) {
    const group = groups.find(item => item.id === groupId);
    if (!group) return;
    group.meetings = normalizeMeetingList((group.meetings || []).filter(meeting => meeting.id !== meetingId));
    saveGroups();
    renderPlanning();
}

function getMeetingsForGroup(groupId) {
    const group = groups.find(item => item.id === groupId);
    if (!group) return [];
    return normalizeMeetingList(group.meetings || []);
}

function generateMeetingSeries(groupId, count, startWeek, startDate, activities = [], badgeId = "", responsible = "", notes = "") {
    const group = groups.find(item => item.id === groupId);
    if (!group) return;
    const meetingCount = Math.max(1, Number.parseInt(count, 10) || 1);
    const firstWeek = Math.max(1, Number.parseInt(startWeek, 10) || 1);
    const baseDate = startDate ? new Date(`${startDate}T12:00:00`) : new Date();
    const meetingsToAdd = [];

    for (let index = 0; index < meetingCount; index += 1) {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() + (index * 7));
        meetingsToAdd.push({
            id: crypto.randomUUID(),
            week: String(firstWeek + index),
            date: date.toISOString().slice(0, 10),
            badgeId,
            activities: [...new Set(activities.filter(Boolean))],
            responsible,
            notes
        });
    }

    group.meetings = normalizeMeetingList([...(Array.isArray(group.meetings) ? group.meetings : []), ...meetingsToAdd]);
    saveGroups();
    renderPlanning(new Set(), new Set([groupId]));
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

document.getElementById("groupYearFilter").addEventListener("change", e => {
    groupFilters.year = e.target.value;
    renderPlanning();
});

document.getElementById("groupTermFilter").addEventListener("change", e => {
    groupFilters.term = e.target.value;
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
                badges: Array.isArray(plan.badges) ? [...new Set(plan.badges)] : [],
                activities: Array.isArray(plan.activities) ? [...new Set(plan.activities)] : []
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

document.getElementById("openDefaultPlanningBtn").addEventListener("click", () => {
    const selectedLevel = document.getElementById("groupLevel").value || "Familjescouting";
    document.getElementById("defaultPlanningLevel").value = selectedLevel;
    defaultPlanningModal.classList.remove("hidden");
    document.getElementById("defaultPlanningLevel").focus();
});

document.getElementById("closeDefaultPlanningModal").addEventListener("click", () => {
    defaultPlanningModal.classList.add("hidden");
});

defaultPlanningModal.addEventListener("click", e => {
    if (e.target === defaultPlanningModal) defaultPlanningModal.classList.add("hidden");
});

document.getElementById("saveDefaultPlanningBtn").addEventListener("click", () => {
    const selectedLevel = defaultPlanningLevel.value || "Familjescouting";
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
pdfPlanningFilter.addEventListener("change", () => {
    pdfSelectionState = new Set(groups
        .filter(group => pdfPlanningFilter.value === "Alla" || group.level === pdfPlanningFilter.value)
        .map(group => group.id));
    renderPdfSelectionList();
});
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
const planningActionsBtn = document.getElementById("planningActionsBtn");
const planningActionsDropdown = document.getElementById("planningActionsDropdown");
planningActionsBtn.addEventListener("click", event => {
    event.stopPropagation();
    const isOpen = !planningActionsDropdown.classList.contains("hidden");
    planningActionsDropdown.classList.toggle("hidden", isOpen);
    planningActionsBtn.setAttribute("aria-expanded", String(!isOpen));
});
document.addEventListener("click", event => {
    if (!planningActionsDropdown.contains(event.target) && event.target !== planningActionsBtn) {
        planningActionsDropdown.classList.add("hidden");
        planningActionsBtn.setAttribute("aria-expanded", "false");
    }
});
planningActionsDropdown.addEventListener("click", () => {
    planningActionsDropdown.classList.add("hidden");
    planningActionsBtn.setAttribute("aria-expanded", "false");
});
document.getElementById("exportPlanningBtn").addEventListener("click", exportPlannings);
document.getElementById("importPlanningBtn").addEventListener("click", () => importPlanningInput.click());
document.getElementById("exportPlanningPdfBtn").addEventListener("click", openPdfSelection);
importPlanningInput.addEventListener("change", event => {
    const [file] = event.target.files;
    if (file) importPlannings(file);
});

document.getElementById("addGroupBtn").addEventListener("click", () => {
    resetGroupModalState();
    document.getElementById("groupName").value = "";
    document.getElementById("groupYear").value = new Date().getFullYear();
    document.getElementById("groupTerm").value = "HT";
    groupModal.classList.remove("hidden");
    document.getElementById("groupName").focus();
});
document.getElementById("closeGroupModal").addEventListener("click", () => {
    groupModal.classList.add("hidden");
    resetGroupModalState();
});
groupModal.addEventListener("click", e => { if (e.target === groupModal) { groupModal.classList.add("hidden"); resetGroupModalState(); } });

document.getElementById("saveGroupBtn").addEventListener("click", () => {
    const name = document.getElementById("groupName").value.trim();
    const yearValue = document.getElementById("groupYear").value.trim();
    const termValue = normalizePlanningTerm(document.getElementById("groupTerm").value);
    const resolvedName = name || [
        Number.isFinite(Number.parseInt(yearValue, 10)) ? `${Number.parseInt(yearValue, 10)}` : "",
        termValue
    ].filter(Boolean).join(" ");
    if (!resolvedName) {
        document.getElementById("groupName").focus();
        return;
    }
    const level = document.getElementById("groupLevel").value;
    const editingGroupId = groupModal.dataset.editingGroupId;

    if (editingGroupId) {
        const group = groups.find(g => g.id === editingGroupId);
        if (!group) return;
        group.name = resolvedName;
        group.level = level;
        const parsedYear = Number.parseInt(yearValue, 10);
        group.year = Number.isFinite(parsedYear) ? parsedYear : "";
        group.term = termValue;
        saveGroups();
        renderPlanning();
    } else {
        addGroup(resolvedName, level, yearValue, termValue);
    }

    groupModal.classList.add("hidden");
    resetGroupModalState();
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
    const targetGroups = [...new Set(allMarken.flatMap(getTargetGroups))]
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
        const matchesTargetGroup = targetGroupValue === "Alla" || getTargetGroups(marke).includes(targetGroupValue);
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
            if (marke) showBadgeDetail(marke, activeGroupId);
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

function createActivityDetailPopup() {
    const popup = document.createElement("div");
    popup.className = "detail-popup hidden";
    popup.innerHTML = `
        <div class="detail-popup-content activity-popup-content">
            <button class="close-popup" type="button" aria-label="Stäng">&times;</button>
            <div class="activity-popup-body"></div>
        </div>
    `;
    popup.querySelector(".close-popup").addEventListener("click", () => popup.classList.add("hidden"));
    popup.addEventListener("click", event => {
        if (event.target === popup) popup.classList.add("hidden");
    });
    document.body.appendChild(popup);
    return popup;
}

const activityDetailPopup = createActivityDetailPopup();

function showActivityDetail(activity) {
    const linkedBadges = allMarken
        .filter(marke => getBadgeActivityIds(marke).includes(activity.id))
        .map(marke => marke.namn)
        .join(", ");
    const material = Array.isArray(activity.material) ? activity.material : [];
    activityDetailPopup.querySelector(".activity-popup-body").innerHTML = `
        ${activity.kategori ? `<p class="activity-popup-category">${activity.kategori}</p>` : ""}
        <h2>${activity.namn}</h2>
        ${activity.beskrivning ? `<p>${renderLinkedText(activity.beskrivning)}</p>` : ""}
        ${formatActivityTime(activity) ? `<p><strong>Tid:</strong> ${formatActivityTime(activity)}</p>` : ""}
        ${material.length > 0 ? `<div><strong>Material:</strong><ul>${material.map(item => `<li>${item}</li>`).join("")}</ul></div>` : ""}
        ${activity.genomforande ? `<div><strong>Genomförande:</strong><p>${renderLinkedText(activity.genomforande)}</p></div>` : ""}
        ${linkedBadges ? `<p><strong>Kopplad till märken:</strong> ${linkedBadges}</p>` : ""}
        ${activity.id.startsWith("egen-") ? `
            <div class="activity-popup-actions">
                <button class="btn-secondary edit-standalone-activity" type="button">Redigera</button>
                <button class="btn-danger delete-standalone-activity" type="button">Radera</button>
            </div>
        ` : ""}
    `;
    const editButton = activityDetailPopup.querySelector(".edit-standalone-activity");
    if (editButton) {
        editButton.addEventListener("click", () => {
            activityDetailPopup.classList.add("hidden");
            openStandaloneActivityEditor(activity);
        });
    }
    const deleteButton = activityDetailPopup.querySelector(".delete-standalone-activity");
    if (deleteButton) deleteButton.addEventListener("click", () => deleteStandaloneActivity(activity));
    activityDetailPopup.classList.remove("hidden");
}

function showBadgeDetail(marke, planningId = null) {
    const body = detailPopup.querySelector(".popup-body");
    const iconMap = {
        "Familjescouting": "./images/icons/familjescout.png",
        "Sp\u00e5rare": "./images/icons/sparare.png",
        "Uppt\u00e4ckare": "./images/icons/upptackare.png",
        "\u00c4ventyrare": "./images/icons/aventyrare.png",
        "Utmanare": "./images/icons/utmanare.png",
        "Rover": "./images/icons/rover.png"
    };
    const primaryTargetGroup = getPrimaryTargetGroup(marke);
    const targetGroups = formatTargetGroups(marke);
    const categoryIcon = iconMap[primaryTargetGroup] || "";
    const criteriaList = marke.kriterier ? marke.kriterier.map(k => `<li>${k}</li>`).join("") : "";
    const badgeNote = getBadgeNote(marke.id);
    const badgePlannings = groups.filter(group =>
        Array.isArray(group.badges) && group.badges.includes(marke.id)
    );
    const planning = planningId ? groups.find(group => group.id === planningId) : null;
    const activities = getBadgeActivityIds(marke)
        .map(activityId => allAktiviteter.find(activity => activity.id === activityId))
        .filter(Boolean);
    const selectedActivities = new Set(planning && Array.isArray(planning.activities) ? planning.activities : []);
    const activitySection = `
            <div class="detail-activities">
                <strong>Aktivitetsförslag:</strong>
                ${planning ? `<p>Välj aktiviteter för ${planning.name}.</p>` : ""}
                <div class="activity-list">
                    ${activities.length > 0 ? activities.map(activity => `
                        <label class="activity-item">
                            ${planning ? `<input type="checkbox" class="planning-activity-selection" value="${activity.id}" ${selectedActivities.has(activity.id) ? "checked" : ""}>` : ""}
                            <span class="activity-item-name"><strong>${activity.namn}</strong>${formatActivityTime(activity) ? `<small>${formatActivityTime(activity)}</small>` : ""}</span>
                            <button class="activity-info-button" type="button" data-activity-id="${activity.id}" aria-label="Visa detaljer för ${activity.namn}">i</button>
                        </label>
                    `).join("") : "<p>Inga aktiviteter kopplade ännu.</p>"}
                </div>
                ${planning ? '<button id="createBadgeActivityBtn" class="btn-secondary" type="button">Lägg till egen aktivitet</button>' : ""}
                ${planning ? '<button id="saveBadgeActivitiesBtn" class="btn-primary" type="button">Uppdatera planering</button>' : ""}
            </div>
        `;
    body.innerHTML = `
        <div class="detail-popup-header">
            <h2>${marke.namn}</h2>
            ${categoryIcon ? `<img src="${categoryIcon}" alt="${targetGroups}" class="detail-category-icon">` : ""}
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
            ${activitySection}
            <p><strong>M\u00e5lgrupp:</strong> ${targetGroups}</p>
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
    if (badgeNote) body.querySelector(".detail-note-display").innerHTML = renderLinkedText(badgeNote);
    body.querySelectorAll(".activity-info-button").forEach(button => {
        button.addEventListener("click", () => {
            const activity = allAktiviteter.find(item => item.id === button.dataset.activityId);
            if (activity) showActivityDetail(activity);
        });
    });
    const saveActivitiesButton = body.querySelector("#saveBadgeActivitiesBtn");
    const createBadgeActivityButton = body.querySelector("#createBadgeActivityBtn");
    if (createBadgeActivityButton) {
        createBadgeActivityButton.addEventListener("click", () => {
            detailPopup.classList.add("hidden");
            openStandaloneActivityForBadge(marke, planning);
        });
    }
    if (saveActivitiesButton) {
        saveActivitiesButton.addEventListener("click", () => {
            const currentBadgeActivityIds = new Set(getBadgeActivityIds(marke));
            const selectedForBadge = [...body.querySelectorAll(".planning-activity-selection:checked")]
                .map(input => input.value);
            const existingActivities = Array.isArray(planning.activities) ? planning.activities : [];
            planning.activities = [
                ...existingActivities.filter(activityId => !currentBadgeActivityIds.has(activityId)),
                ...selectedForBadge
            ];
            planning.activities = [...new Set(planning.activities)];
            saveGroups();
            renderPlanning();
            showBadgeDetail(marke, planning.id);
        });
    }
    detailPopup.classList.remove("hidden");
}

// ── Init ───────────────────────────────────────────────────────────────────

createStandaloneActivityPopup();
createActivityPicker();
createEditActivitiesMenuAction();
loadDefaultPlannings();
loadMarken();
