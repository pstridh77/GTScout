const STORAGE_KEY = "gtscout_planering";
const BADGE_NOTES_STORAGE_KEY = "gtscout_badge_notes";
const CUSTOM_ACTIVITIES_STORAGE_KEY = "gtscout_custom_activities";
const CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY = "gtscout_custom_badge_activities";
const SHOW_ACTIVITIES_STORAGE_KEY = "gtscout_show_activities";
const SHOW_MEETINGS_STORAGE_KEY = "gtscout_show_meetings";

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

let defaultPlanningTemplates = [{
    name: "Standardplanering",
    plannings: JSON.parse(JSON.stringify(DEFAULT_PLANNINGS_FALLBACK))
}];

let baseMarken = [];
let allMarken = [];
let allAktiviteter = [];
let groups = loadGroups();
let activeGroupId = null; // which group is getting badges added
let groupFilters = { search: "", level: "Alla", year: "Alla", term: "Alla" };
let pdfSelectionState = new Set();
let meetingSelectionGroupId = null;
let meetingSelectionState = new Set();
let showPlanningActivities = localStorage.getItem(SHOW_ACTIVITIES_STORAGE_KEY) !== "false";
let showPlanningMeetings = localStorage.getItem(SHOW_MEETINGS_STORAGE_KEY) !== "false";
const BADGE_DND_MIME = "text/plain";
const ACTIVITY_DND_MIME = "application/x-gtscout-activity";
let activeDraggedActivity = null;
let editingStandaloneActivityId = null;
let activeActivityGroupId = null;
let activeMeetingActivityPicker = null;
let activeMeetingActivityCreation = null;
let activeStandaloneActivityBadge = null;
let activeStandaloneActivityPlanning = null;
let activeBadgeActivityLibraryMarke = null;
let activeBadgeActivityLibraryPlanning = null;
let planningBadgeActivityKarFilter = "Alla";

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
    const syncedActivities = window.GTScoutActivities?.getAllActivities?.();
    if (Array.isArray(syncedActivities) && syncedActivities.length > 0) {
        return syncedActivities.filter(activity => activity.id.startsWith("egen-"));
    }
    try {
        const activities = JSON.parse(localStorage.getItem(CUSTOM_ACTIVITIES_STORAGE_KEY));
        return Array.isArray(activities) ? activities : [];
    } catch {
        return [];
    }
}

function loadCustomBadgeActivities() {
    let localLinks = {};
    try {
        const links = JSON.parse(localStorage.getItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY));
        localLinks = links && typeof links === "object" && !Array.isArray(links) ? links : {};
    } catch {
        localLinks = {};
    }

    const syncedLinks = window.GTScoutActivities?.getBadgeLinksMap?.();
    if (!syncedLinks || typeof syncedLinks !== "object") {
        return localLinks;
    }

    const merged = { ...localLinks };
    Object.entries(syncedLinks).forEach(([badgeId, activityIds]) => {
        if (!Array.isArray(activityIds)) return;
        merged[badgeId] = [
            ...new Set([
                ...(Array.isArray(merged[badgeId]) ? merged[badgeId] : []),
                ...activityIds
            ])
        ];
    });
    return merged;
}

function getBadgeActivityIds(marke) {
    const links = loadCustomBadgeActivities();
    return [
        ...(Array.isArray(marke.aktiviteter) ? marke.aktiviteter : []),
        ...(Array.isArray(links[marke.id]) ? links[marke.id] : [])
    ];
}

function addActivityToBadge(marke, activityId) {
    if (window.GTScoutActivities?.addBadgeActivityLink) {
        if (!window.GTScoutActivities.canWrite()) return false;
        window.GTScoutActivities.addBadgeActivityLink(marke.id, activityId).catch(error => {
            console.error("Kunde inte koppla aktivitet", error);
        });
        return true;
    }
    const links = loadCustomBadgeActivities();
    links[marke.id] = Array.isArray(links[marke.id]) ? links[marke.id] : [];
    if (links[marke.id].includes(activityId)) return false;
    links[marke.id].push(activityId);
    localStorage.setItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY, JSON.stringify(links));
    return true;
}

function removeActivityFromBadge(marke, activityId) {
    if (window.GTScoutActivities?.removeBadgeActivityLink) {
        if (!window.GTScoutActivities.canWrite()) return false;
        if (!window.GTScoutActivities.canEditBadgeLink(marke.id, activityId)) return false;
        window.GTScoutActivities.removeBadgeActivityLink(marke.id, activityId).catch(error => {
            console.error("Kunde inte ta bort aktivitetskoppling", error);
        });
        return true;
    }
    const links = loadCustomBadgeActivities();
    if (!Array.isArray(links[marke.id])) return false;
    const index = links[marke.id].indexOf(activityId);
    if (index === -1) return false;
    links[marke.id].splice(index, 1);
    localStorage.setItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY, JSON.stringify(links));
    return true;
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

function getActivityOwnerLabel(activity) {
    if (!activity?.kar_id) return "Kår saknas";
    return activity.kar_namn || "Okänd kår";
}

function getActivityOwnershipMeta(activity) {
    const ownKarId = window.GTScoutAuth?.getState?.().karId || null;
    if (!activity?.kar_id || !ownKarId) {
        return { label: "Annan kår", className: "activity-owner-badge--other" };
    }
    if (activity.kar_id === ownKarId) {
        return { label: "Min kår", className: "activity-owner-badge--mine" };
    }
    return { label: "Annan kår", className: "activity-owner-badge--other" };
}

function renderActivityOwnershipBadge(activity) {
    const meta = getActivityOwnershipMeta(activity);
    return `<span class="activity-owner-badge ${meta.className}">${meta.label}</span>`;
}

function canEditActivity(activity) {
    const sync = window.GTScoutActivities;
    if (sync?.canEditActivity) return sync.canEditActivity(activity);
    return activity?.id?.startsWith("egen-");
}

function canDeleteActivity(activity) {
    const sync = window.GTScoutActivities;
    if (sync?.canDeleteActivity) return sync.canDeleteActivity(activity);
    return Boolean(window.GTScoutAuth?.isAdmin?.() && canEditActivity(activity));
}

function canDeleteGroup(group) {
    const auth = window.GTScoutAuth;
    if (!auth) return false;
    if (group?.local_only) return true;
    if (auth.isAdmin?.()) return true;
    const userId = auth.getUser?.()?.id;
    if (userId && group?.created_by === userId) return true;
    return false;
}

function canEditPlannings() {
    return true;
}

function canEditGroup(group) {
    const auth = window.GTScoutAuth;
    if (!auth?.isOnline?.()) return true;
    return Boolean(group?.local_only || window.GTScoutPlanningSync?.canWrite?.());
}

function getPlanningOwnerLabel(group) {
    const auth = window.GTScoutAuth;
    if (group?.created_by && group.created_by === auth?.getUser?.()?.id) return "Du";
    return group?.created_by_name || (group?.created_by ? "En annan ledare" : "Ingen tilldelad");
}

async function fetchKarLeadersAndAdmins() {
    const auth = window.GTScoutAuth;
    const client = auth?.getClient?.();
    const karId = auth?.getState?.()?.karId;
    if (!client || !auth?.isAdmin?.() || !karId) return [];

    try {
        let query = client.from("profiles").select("id, full_name, email, role, kar_id");
        if (auth.isSystemAdmin?.()) {
            query = query.or(`kar_id.eq.${karId},role.eq.admin`);
        } else {
            query = query.eq("kar_id", karId);
        }
        const { data, error } = await query;
        if (error) {
            console.error("Kunde inte hämta ledare/admins för kåren", error);
            return [];
        }
        return (data || []).filter(p => p.role === "ledare" || p.role === "admin");
    } catch (err) {
        console.error("Fel vid hämtning av profiler", err);
        return [];
    }
}

function getPlanningUpdaterName() {
    const auth = window.GTScoutAuth;
    const profile = auth?.getProfile?.();
    return profile?.full_name || profile?.email || "Okänd användare";
}

function formatPlanningUpdatedAt(value) {
    const updatedAt = new Date(value);
    if (Number.isNaN(updatedAt.getTime())) return "uppgift saknas";
    return updatedAt.toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
}

function isActivityVisibleForKarFilter(activity, karFilter) {
    if (!karFilter || karFilter === "Alla") return true;
    if (karFilter === "__saknas") return !activity.kar_id;
    return activity.kar_id === karFilter;
}

function populateActivityKarFilter(select) {
    if (!select) return;
    const previous = select.value || "Alla";
    const karFilters = window.GTScoutActivities?.getKarFilters?.() || [];
    select.innerHTML = [
        '<option value="Alla">Alla kårer</option>',
        '<option value="__saknas">Kår saknas</option>',
        ...karFilters.map(kar => `<option value="${escapeHtml(kar.id)}">${escapeHtml(kar.namn)}</option>`)
    ].join("");
    const validValues = new Set(["Alla", "__saknas", ...karFilters.map(kar => kar.id)]);
    select.value = validValues.has(previous) ? previous : "Alla";
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
    const updateWarning = () => {
        document.getElementById("createActivityWarning").classList.toggle("hidden", Boolean(window.GTScoutActivities?.canWrite?.()));
    };
    const reset = () => {
        editingStandaloneActivityId = null;
        activeStandaloneActivityBadge = null;
        activeStandaloneActivityPlanning = null;
        activeMeetingActivityCreation = null;
        document.getElementById("createActivityTitle").textContent = "Skapa aktivitet";
        document.getElementById("savePlanningActivityBtn").textContent = "Spara aktivitet";
        modal.querySelectorAll("input, textarea").forEach(field => field.value = "");
        document.getElementById("createActivityStatus").textContent = "";
        document.getElementById("planningActivityMemberships").textContent = "Inte tillagd i någon planering.";
        updateWarning();
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
    document.getElementById("savePlanningActivityBtn").addEventListener("click", async () => {
        const nameInput = document.getElementById("planningActivityName");
        const name = nameInput.value.trim();
        const status = document.getElementById("createActivityStatus");
        if (!name) {
            nameInput.focus();
            return;
        }
        const existingActivity = allAktiviteter.find(item => item.id === editingStandaloneActivityId);
        const activity = {
            id: editingStandaloneActivityId || `egen-${crypto.randomUUID()}`,
            namn: name,
            kategori: document.getElementById("planningActivityCategory").value.trim() || activeStandaloneActivityBadge?.kategori || existingActivity?.kategori || "Egna aktiviteter",
            beskrivning: document.getElementById("planningActivityDescription").value.trim(),
            tid: document.getElementById("planningActivityTime").value.trim(),
            material: document.getElementById("planningActivityMaterial").value.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
            genomforande: document.getElementById("planningActivityInstructions").value.trim()
        };

        let savedActivity = null;
        try {
            savedActivity = await window.GTScoutActivities.saveActivity(activity);
            if (activeStandaloneActivityBadge) {
                await window.GTScoutActivities.addBadgeActivityLink(activeStandaloneActivityBadge.id, savedActivity.id);
            }
        } catch (error) {
            status.textContent = error.message || "Kunde inte spara aktivitet.";
            return;
        }

        if (activeStandaloneActivityPlanning) {
            activeStandaloneActivityPlanning.activities = Array.isArray(activeStandaloneActivityPlanning.activities)
                ? activeStandaloneActivityPlanning.activities
                : [];
            if (!activeStandaloneActivityPlanning.activities.includes(savedActivity.id)) {
                activeStandaloneActivityPlanning.activities.push(savedActivity.id);
            }
        }
        if (activeMeetingActivityCreation) {
            activeMeetingActivityCreation.selectedIds.add(savedActivity.id);
            activeMeetingActivityCreation.onApply();
            activeMeetingActivityCreation = null;
        }
        saveGroups();
        allAktiviteter = window.GTScoutActivities.getAllActivities();
        modal.classList.add("hidden");
        renderPlanning(new Set([activeStandaloneActivityPlanning?.id].filter(Boolean)));
    });
}

function openStandaloneActivityForBadge(marke, planning) {
    if (!window.GTScoutActivities?.canWrite?.()) return;
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
    document.getElementById("createActivityWarning").classList.toggle("hidden", Boolean(window.GTScoutActivities?.canWrite?.()));
    modal.classList.remove("hidden");
    document.getElementById("planningActivityName").focus();
}

function openStandaloneActivityForPlanning(planning) {
    if (!planning || !canEditGroup(planning)) return;
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
    document.getElementById("createActivityWarning").classList.toggle("hidden", Boolean(window.GTScoutActivities?.canWrite?.()));
    modal.classList.remove("hidden");
    document.getElementById("planningActivityName").focus();
}

function openActivityPicker(groupId) {
    activeMeetingActivityPicker = null;
    activeActivityGroupId = groupId;
    const group = groups.find(item => item.id === groupId);
    if (!group || !canEditGroup(group)) return;
    document.getElementById("selectActivityTitle").textContent = `Välj aktiviteter – ${group.name}`;
    document.getElementById("selectActivitySearch").value = "";
    populateActivityCategories();
    populateActivityKarFilter(document.getElementById("selectActivityKarFilter"));
    const canWrite = window.GTScoutActivities?.canWrite?.();
    const canCreateActivity = canEditGroup(group);
    document.getElementById("createActivityFromPickerBtn").classList.toggle("hidden", !canCreateActivity);
    document.getElementById("saveSelectedActivitiesBtn").classList.toggle("hidden", !canWrite);
    renderActivityPicker();
    document.getElementById("selectActivityModal").classList.remove("hidden");
}

function openMeetingActivityPicker(group, selectedIds, onApply, activityFilter = null) {
    activeMeetingActivityPicker = { selectedIds, onApply, activityFilter };
    activeActivityGroupId = group.id;
    document.getElementById("selectActivityTitle").textContent = "Välj aktiviteter till mötet";
    document.getElementById("selectActivitySearch").value = "";
    populateActivityCategories();
    populateActivityKarFilter(document.getElementById("selectActivityKarFilter"));
    document.getElementById("createActivityFromPickerBtn").classList.toggle("hidden", !canEditGroup(group));
    const saveButton = document.getElementById("saveSelectedActivitiesBtn");
    saveButton.textContent = "Lägg till i möte";
    saveButton.classList.remove("hidden");
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

function isGameActivity(activity) {
    return getActivityCategories(activity).some(category => category.toLowerCase().includes("lek"));
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
    const karFilter = document.getElementById("selectActivityKarFilter")?.value || "Alla";
    const selected = activeMeetingActivityPicker?.selectedIds || new Set(Array.isArray(group.activities) ? group.activities : []);
    const activities = allAktiviteter.filter(activity => {
        if (activeMeetingActivityPicker?.activityFilter && !activeMeetingActivityPicker.activityFilter(activity)) return false;
        const matchesCategory = category === "Alla" || getActivityCategories(activity).includes(category);
        const matchesKar = isActivityVisibleForKarFilter(activity, karFilter);
        const matchesSearch = !searchTerm || [activity.namn, activity.beskrivning, ...(activity.material || [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(searchTerm);
        return matchesCategory && matchesKar && matchesSearch;
    });
    document.getElementById("selectActivityList").innerHTML = activities.length > 0
        ? activities.map(activity => `
            <label class="activity-picker-item">
                <input type="checkbox" value="${activity.id}" ${selected.has(activity.id) ? "checked" : ""}>
                <span><small class="activity-picker-category">${getActivityCategories(activity).join(", ")}</small>${renderActivityOwnershipBadge(activity)}<small>${escapeHtml(getActivityOwnerLabel(activity))}</small><strong>${activity.namn}</strong>${formatActivityTime(activity) ? `<small>${formatActivityTime(activity)}</small>` : ""}</span>
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
        const meetingPicker = activeMeetingActivityPicker;
        activeMeetingActivityPicker = null;
        modal.classList.add("hidden");
        openStandaloneActivityForPlanning(group);
        if (meetingPicker) {
            activeStandaloneActivityPlanning = null;
            activeMeetingActivityCreation = meetingPicker;
        }
    });
    modal.addEventListener("click", event => {
        if (event.target === modal) modal.classList.add("hidden");
    });
    document.getElementById("selectActivitySearch").addEventListener("input", renderActivityPicker);
    document.getElementById("selectActivityCategory").addEventListener("change", renderActivityPicker);
    document.getElementById("selectActivityKarFilter").addEventListener("change", renderActivityPicker);
    document.getElementById("saveSelectedActivitiesBtn").addEventListener("click", () => {
        const group = groups.find(item => item.id === activeActivityGroupId);
        if (!group) return;
        const searchTerm = document.getElementById("selectActivitySearch").value.trim().toLowerCase();
        const category = document.getElementById("selectActivityCategory").value;
        const karFilter = document.getElementById("selectActivityKarFilter")?.value || "Alla";
        const visibleActivityIds = new Set(allAktiviteter
            .filter(activity => {
                if (activeMeetingActivityPicker?.activityFilter && !activeMeetingActivityPicker.activityFilter(activity)) return false;
                const matchesCategory = category === "Alla" || getActivityCategories(activity).includes(category);
                const matchesKar = isActivityVisibleForKarFilter(activity, karFilter);
                const matchesSearch = !searchTerm || [activity.namn, activity.beskrivning, ...(activity.material || [])]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                    .includes(searchTerm);
                return matchesCategory && matchesKar && matchesSearch;
            })
            .map(activity => activity.id));
        const selectedVisibleActivityIds = [...modal.querySelectorAll("#selectActivityList input:checked")]
            .map(input => input.value);
        if (activeMeetingActivityPicker) {
            const selectedIds = activeMeetingActivityPicker.selectedIds;
            visibleActivityIds.forEach(activityId => selectedIds.delete(activityId));
            selectedVisibleActivityIds.forEach(activityId => selectedIds.add(activityId));
            activeMeetingActivityPicker.onApply();
            activeMeetingActivityPicker = null;
            modal.classList.add("hidden");
            return;
        }

        if (!window.GTScoutActivities?.canWrite?.()) return;
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

function createBadgeActivityLibraryPopup() {
    const picker = document.createElement("div");
    picker.className = "detail-popup hidden";
    picker.style.zIndex = "1250";
    picker.innerHTML = `
        <div class="detail-popup-content activity-picker-content">
            <button class="close-popup" type="button" aria-label="Stäng">&times;</button>
            <h2>Välj aktiviteter</h2>
            <div class="picker-filters">
                <input type="search" class="activity-picker-search picker-search-input" placeholder="Sök aktivitet...">
                <select class="activity-picker-category" aria-label="Filtrera aktiviteter efter kategori"></select>
                <select class="activity-picker-kar" aria-label="Filtrera aktiviteter efter kår"></select>
            </div>
            <div class="activity-picker-list"></div>
            <div class="modal-actions modal-actions--split">
                <button class="btn-secondary activity-picker-create" type="button">Skapa aktivitet</button>
                <button class="btn-primary activity-picker-save" type="button">Uppdatera märke</button>
            </div>
            <p class="detail-planning-status activity-picker-status" role="status"></p>
        </div>
    `;
    picker.querySelector(".close-popup").addEventListener("click", () => picker.classList.add("hidden"));
    picker.addEventListener("click", event => {
        if (event.target === picker) picker.classList.add("hidden");
    });
    picker.querySelector(".activity-picker-search").addEventListener("input", () => renderBadgeActivityLibraryList(picker));
    picker.querySelector(".activity-picker-category").addEventListener("change", () => renderBadgeActivityLibraryList(picker));
    picker.querySelector(".activity-picker-kar").addEventListener("change", () => renderBadgeActivityLibraryList(picker));
    picker.querySelector(".activity-picker-create").addEventListener("click", () => {
        if (!window.GTScoutActivities?.canWrite?.()) return;
        if (!activeBadgeActivityLibraryMarke) return;
        picker.classList.add("hidden");
        openStandaloneActivityForBadge(activeBadgeActivityLibraryMarke, activeBadgeActivityLibraryPlanning);
    });
    picker.querySelector(".activity-picker-save").addEventListener("click", () => {
        const marke = activeBadgeActivityLibraryMarke;
        const planning = activeBadgeActivityLibraryPlanning;
        if (!marke) return;
        const canWrite = window.GTScoutActivities?.canWrite?.();
        if (!canWrite && (!planning || !canEditGroup(planning))) return;
        const checkedIds = new Set([...picker.querySelectorAll(".activity-picker-list input:checked")].map(input => input.value));
        if (!canWrite) {
            planning.activities = [...new Set([...(planning.activities || []), ...checkedIds])];
            saveGroups();
            renderPlanning(new Set([planning.id]));
            picker.classList.add("hidden");
            showBadgeDetail(marke, planning.id);
            return;
        }
        const staticActivityIds = new Set(Array.isArray(marke.aktiviteter) ? marke.aktiviteter : []);
        allAktiviteter.forEach(activity => {
            if (staticActivityIds.has(activity.id)) return;
            const isLinked = getBadgeActivityIds(marke).includes(activity.id);
            if (checkedIds.has(activity.id) && !isLinked) addActivityToBadge(marke, activity.id);
            else if (!checkedIds.has(activity.id) && isLinked) removeActivityFromBadge(marke, activity.id);
        });
        picker.classList.add("hidden");
        showBadgeDetail(marke, planning?.id ?? null);
    });
    document.body.appendChild(picker);
    return picker;
}

const badgeActivityLibraryPopup = createBadgeActivityLibraryPopup();

function renderBadgeActivityLibraryList(picker) {
    if (!activeBadgeActivityLibraryMarke) return;
    const marke = activeBadgeActivityLibraryMarke;
    const searchTerm = picker.querySelector(".activity-picker-search").value.trim().toLowerCase();
    const selectedCategory = picker.querySelector(".activity-picker-category").value || "Alla";
    const selectedKar = picker.querySelector(".activity-picker-kar").value || "Alla";
    const staticActivityIds = new Set(Array.isArray(marke.aktiviteter) ? marke.aktiviteter : []);
    const selectingForPlanning = Boolean(activeBadgeActivityLibraryPlanning && !window.GTScoutActivities?.canWrite?.());
    const linkedActivityIds = new Set(selectingForPlanning
        ? activeBadgeActivityLibraryPlanning.activities || []
        : getBadgeActivityIds(marke));
    const list = picker.querySelector(".activity-picker-list");
    const visibleActivities = allAktiviteter
        .filter(activity => selectedCategory === "Alla" || getActivityCategories(activity).includes(selectedCategory))
        .filter(activity => isActivityVisibleForKarFilter(activity, selectedKar))
        .filter(activity => !searchTerm || `${activity.namn} ${getActivityCategories(activity).join(" ")}`.toLowerCase().includes(searchTerm))
        .sort((a, b) => getActivityCategories(a).join(", ").localeCompare(getActivityCategories(b).join(", "), "sv") || a.namn.localeCompare(b.namn, "sv"));
    list.innerHTML = visibleActivities.length > 0
        ? visibleActivities.map(activity => {
            const isStatic = !selectingForPlanning && staticActivityIds.has(activity.id);
            const isChecked = linkedActivityIds.has(activity.id);
            return `
            <label class="activity-picker-item">
                <input type="checkbox" value="${activity.id}" ${isChecked ? "checked" : ""} ${isStatic ? "disabled" : ""}>
                <span><small class="activity-picker-category">${getActivityCategories(activity).join(", ")}</small>${renderActivityOwnershipBadge(activity)}<small>${escapeHtml(getActivityOwnerLabel(activity))}</small><strong>${activity.namn}</strong>${formatActivityTime(activity) ? `<small>${formatActivityTime(activity)}</small>` : ""}${isStatic ? `<small>Fast kopplad</small>` : ""}</span>
                <button class="activity-info-button" type="button" data-activity-id="${activity.id}" title="Visa information" aria-label="Visa detaljer för ${activity.namn}">i</button>
            </label>
        `;
        }).join("")
        : '<p class="no-results">Inga aktiviteter matchar.</p>';
    list.querySelectorAll(".activity-info-button").forEach(button => {
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const activity = allAktiviteter.find(item => item.id === button.dataset.activityId);
            if (activity) showActivityDetail(activity);
        });
    });
}

function populateBadgeActivityLibraryCategories(picker) {
    const categorySelect = picker.querySelector(".activity-picker-category");
    const previousValue = categorySelect.value || "Alla";
    const categories = [...new Set(allAktiviteter.flatMap(getActivityCategories))]
        .sort((a, b) => a.localeCompare(b, "sv"));
    categorySelect.innerHTML = [
        '<option value="Alla">Alla kategorier</option>',
        ...categories.map(category => `<option value="${category}">${category}</option>`)
    ].join("");
    categorySelect.value = categories.includes(previousValue) ? previousValue : "Alla";
}

function openBadgeActivityLibraryPicker(marke, planning) {
    activeBadgeActivityLibraryMarke = marke;
    activeBadgeActivityLibraryPlanning = planning;
    badgeActivityLibraryPopup.querySelector(".activity-picker-search").value = "";
    badgeActivityLibraryPopup.querySelector(".activity-picker-status").textContent = "";
    populateBadgeActivityLibraryCategories(badgeActivityLibraryPopup);
    populateActivityKarFilter(badgeActivityLibraryPopup.querySelector(".activity-picker-kar"));
    const canWrite = window.GTScoutActivities?.canWrite?.();
    const canEditPlanning = Boolean(planning && canEditGroup(planning));
    badgeActivityLibraryPopup.querySelector(".activity-picker-create").classList.toggle("hidden", !canWrite);
    const saveButton = badgeActivityLibraryPopup.querySelector(".activity-picker-save");
    saveButton.classList.toggle("hidden", !canWrite && !canEditPlanning);
    saveButton.textContent = canWrite ? "Uppdatera märke" : "Lägg till i planering";
    if (!canWrite && !canEditPlanning) {
        badgeActivityLibraryPopup.querySelector(".activity-picker-status").textContent = "Du kan visa aktiviteter, men bara ledare/admin i ägande kår kan redigera kopplingar.";
    }
    renderBadgeActivityLibraryList(badgeActivityLibraryPopup);
    badgeActivityLibraryPopup.classList.remove("hidden");
}

function renderEditActivitiesList() {
    const modal = document.getElementById("editActivitiesModal");
    const list = document.getElementById("editActivitiesList");
    const category = document.getElementById("editActivitiesCategory").value;
    const karFilter = document.getElementById("editActivitiesKarFilter")?.value || "Alla";
    const activities = allAktiviteter
        .filter(activity => category === "Alla" || getActivityCategories(activity).includes(category))
        .filter(activity => isActivityVisibleForKarFilter(activity, karFilter))
        .sort((a, b) => {
            const editableDifference = Number(canEditActivity(b)) - Number(canEditActivity(a));
            if (editableDifference) return editableDifference;
            const categoryA = getActivityCategories(a).join(", ");
            const categoryB = getActivityCategories(b).join(", ");
            return categoryA.localeCompare(categoryB, "sv") || a.namn.localeCompare(b.namn, "sv");
        });
    list.innerHTML = activities.length > 0
        ? activities.map(activity => `
            <div class="activity-management-item">
                <div>
                    <small class="activity-picker-category">${getActivityCategories(activity).join(", ")}</small>
                    ${renderActivityOwnershipBadge(activity)}
                    <small>${escapeHtml(getActivityOwnerLabel(activity))}</small>
                    <strong>${activity.namn}</strong>
                    <div class="activity-management-time-row">
                        <small>${formatActivityTime(activity) || "Ingen tidsangivelse"}</small>
                        <div class="activity-linked-badge-list activity-management-badge-list" aria-label="Märken kopplade till aktiviteten">
                            ${allMarken
                                .filter(marke => getBadgeActivityIds(marke).includes(activity.id))
                                .map(marke => `<span class="activity-management-badge-item"><span class="activity-management-dot" aria-hidden="true">·</span><img src="${escapeHtml(marke.bild)}" alt="${escapeHtml(marke.namn)}" title="${escapeHtml(marke.namn)}" class="activity-linked-badge-icon"></span>`)
                                .join("")}
                        </div>
                    </div>
                </div>
                <div class="activity-management-actions">
                    <button class="activity-info-button" type="button" data-activity-id="${activity.id}" title="Visa information" aria-label="Visa information om ${activity.namn}">i</button>
                    ${canEditActivity(activity)
                        ? `<button class="btn-secondary edit-managed-activity" type="button" data-activity-id="${activity.id}">Redigera</button>
                    ${canDeleteActivity(activity) ? `<button class="btn-danger delete-managed-activity" type="button" data-activity-id="${activity.id}" aria-label="Radera ${activity.namn}">Radera</button>` : ""}`
                        : "<small>Läsläge</small>"}
                </div>
            </div>
        `).join("")
        : '<p class="no-results">Inga aktiviteter matchar filtret.</p>';
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
    const karFilter = document.getElementById("editActivitiesKarFilter");
    const categories = [...new Set(allAktiviteter
        .flatMap(getActivityCategories))]
        .sort((a, b) => a.localeCompare(b, "sv"));
    categoryFilter.innerHTML = [
        '<option value="Alla">Alla kategorier</option>',
        ...categories.map(category => `<option value="${category}">${category}</option>`)
    ].join("");
    categoryFilter.onchange = renderEditActivitiesList;
    populateActivityKarFilter(karFilter);
    karFilter.onchange = renderEditActivitiesList;
    const warning = document.getElementById("editActivitiesWarning");
    warning.classList.toggle("hidden", Boolean(window.GTScoutActivities?.canWrite?.()));
    renderEditActivitiesList();
    const modal = document.getElementById("editActivitiesModal");
    modal.classList.remove("hidden");
}

function createEditActivitiesMenuAction() {
    const modal = document.getElementById("editActivitiesModal");
    const editButton = document.getElementById("editActivitiesBtn");
    const syncVisibility = () => {
        editButton.classList.remove("hidden");
    };
    syncVisibility();
    window.GTScoutAuth?.onChange(syncVisibility);
    editButton.addEventListener("click", openEditActivitiesModal);
    document.getElementById("closeEditActivitiesModal").addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", event => {
        if (event.target === modal) modal.classList.add("hidden");
    });
}

function openStandaloneActivityEditor(activity) {
    if (!canEditActivity(activity)) return;
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

function openStandaloneActivityCopy(activity) {
    if (!window.GTScoutActivities?.canWrite?.()) return;
    const modal = document.getElementById("createActivityModal");
    populatePlanningActivityCategories();
    activeStandaloneActivityBadge = null;
    activeStandaloneActivityPlanning = null;
    editingStandaloneActivityId = null;
    document.getElementById("createActivityTitle").textContent = "Kopiera aktivitet till min kår";
    document.getElementById("savePlanningActivityBtn").textContent = "Spara som ny aktivitet";
    document.getElementById("planningActivityMemberships").textContent = "Inte tillagd i någon planering.";
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

async function deleteStandaloneActivity(activity) {
    if (!canDeleteActivity(activity)) return;
    if (!confirm(`Radera aktiviteten "${activity.namn}"?`)) return;
    try {
        await window.GTScoutActivities.deleteActivity(activity.id);
    } catch (error) {
        console.error("Kunde inte radera aktivitet", error);
        return;
    }
    groups.forEach(group => {
        group.activities = Array.isArray(group.activities)
            ? group.activities.filter(activityId => activityId !== activity.id)
            : [];
    });
    saveGroups();
    allAktiviteter = window.GTScoutActivities.getAllActivities();
    activityDetailPopup.classList.add("hidden");
    renderPlanning();
}

// ── Persistence ────────────────────────────────────────────────────────────

function normalizeGroupList(list) {
    return Array.isArray(list)
        ? list.map(group => {
            if (!group || typeof group !== "object") return group;
            const { year, term } = parsePlanningYearAndTerm(group);
            group.year = Number.isFinite(year) ? year : "";
            group.term = normalizePlanningTerm(term);
            group.note = typeof group.note === "string" ? group.note : "";
            group.activities = Array.isArray(group.activities) ? group.activities : [];
            group.badges = Array.isArray(group.badges) ? group.badges : [];
            group.meetings = normalizeMeetingList(Array.isArray(group.meetings) ? group.meetings : []);
            return group;
        }).filter(Boolean)
        : [];
}

function loadGroups() {
    try {
        return normalizeGroupList(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
    } catch {
        return [];
    }
}

function saveGroups() {
    const payload = groups.map(group => ({
        ...group,
        badges: Array.isArray(group.badges) ? group.badges : [],
        activities: Array.isArray(group.activities) ? group.activities : [],
        meetings: normalizeMeetingList(Array.isArray(group.meetings) ? group.meetings : []),
        note: typeof group.note === "string" ? group.note : "",
        year: Number.isFinite(getGroupYearValue(group)) ? getGroupYearValue(group) : "",
        term: getGroupTermValue(group)
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.GTScoutPlanningSync?.scheduleSave(payload);
}


function loadBadgeNotesForTransfer() {
    try {
        const notes = JSON.parse(localStorage.getItem(BADGE_NOTES_STORAGE_KEY));
        return notes && typeof notes === "object" && !Array.isArray(notes) ? notes : {};
    } catch {
        return {};
    }
}

function showTransferInfoModal(title, rows) {
    const titleEl = document.getElementById("exportInfoTitle");
    const bodyEl = document.getElementById("exportInfoBody");
    const modalEl = document.getElementById("exportInfoModal");
    if (!titleEl || !bodyEl || !modalEl) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = rows
        .map(row => `<p><strong>${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value)}</p>`)
        .join("");
    modalEl.classList.remove("hidden");
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
            note: typeof group.note === "string" ? group.note : "",
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

    const activityCount = groups.reduce((count, group) =>
        count + (Array.isArray(group.activities) ? group.activities.length : 0), 0);
    const exportFileName = `gtscout-planeringar-${new Date().toISOString().slice(0, 10)}.json`;
    showTransferInfoModal("Export klar", [
        { label: "Planeringar", value: String(groups.length) },
        { label: "Aktiviteter", value: String(activityCount) },
        { label: "Anteckningsfält", value: String(Object.keys(badgeNotes).length) },
        { label: "Fil", value: exportFileName }
    ]);
}

function renderPdfSelectionList() {
    const list = document.getElementById("pdfSelectionList");
    const filterValue = document.getElementById("pdfPlanningFilter").value;
    list.innerHTML = "";
    const filteredGroups = groups
        .filter(group => filterValue === "Alla" || group.level === filterValue)
        .sort((a, b) => {
            const levelOrderA = TARGET_GROUP_ORDER.indexOf(a.level);
            const levelOrderB = TARGET_GROUP_ORDER.indexOf(b.level);
            const normalizedLevelOrderA = levelOrderA === -1 ? TARGET_GROUP_ORDER.length : levelOrderA;
            const normalizedLevelOrderB = levelOrderB === -1 ? TARGET_GROUP_ORDER.length : levelOrderB;
            if (normalizedLevelOrderA !== normalizedLevelOrderB) {
                return normalizedLevelOrderA - normalizedLevelOrderB;
            }

            const planningOrderA = getGroupSortValue(a);
            const planningOrderB = getGroupSortValue(b);
            if (planningOrderA.year !== planningOrderB.year) {
                return planningOrderA.year - planningOrderB.year;
            }
            if (planningOrderA.term !== planningOrderB.term) {
                return planningOrderA.term - planningOrderB.term;
            }
            return String(a.name || "").localeCompare(String(b.name || ""), "sv");
        });
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
        .filter(group => groupFilters.year === "Alla" || String(getGroupYearValue(group) ?? "") === String(groupFilters.year))
        .filter(group => groupFilters.term === "Alla" || getGroupTermValue(group) === groupFilters.term)
        .map(group => group.id));
    renderPdfSelectionList();
    document.getElementById("pdfSelectionModal").classList.remove("hidden");
}

function renderMeetingSelectionList() {
    const list = document.getElementById("meetingSelectionList");
    const group = groups.find(item => item.id === meetingSelectionGroupId);
    const meetings = group ? normalizeMeetingList(group.meetings || []) : [];
    list.replaceChildren();
    if (meetings.length === 0) {
        list.innerHTML = "<p>Det finns inga möten att skriva ut.</p>";
        return;
    }
    meetings.forEach(meeting => {
        const label = document.createElement("label");
        label.className = "pdf-selection-option";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = meeting.id;
        checkbox.checked = meetingSelectionState.has(meeting.id);
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) meetingSelectionState.add(meeting.id);
            else meetingSelectionState.delete(meeting.id);
        });
        const text = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = `Träff ${meeting.week || "-"}`;
        const details = document.createElement("small");
        details.textContent = meeting.date || "";
        text.append(name, details);
        label.append(checkbox, text);
        list.appendChild(label);
    });
}

function openMeetingSelection(groupId) {
    const group = groups.find(item => item.id === groupId);
    if (!group) return;
    meetingSelectionGroupId = groupId;
    const meetings = normalizeMeetingList(group.meetings || []);
    meetingSelectionState = new Set(meetings.map(meeting => meeting.id));
    document.getElementById("meetingSelectionTitle").textContent = `Välj möten till PDF – ${group.name}`;
    renderMeetingSelectionList();
    document.getElementById("meetingSelectionModal").classList.remove("hidden");
}

function generatePlanningPdf(selectedIds, printMode = "planning", selectedMeetingIds = null) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        alert("Kunde inte öppna PDF-vyn. Tillåt popupfönster för den här sidan.");
        return;
    }

    const badgeNotes = loadBadgeNotesForTransfer();
    const selectedGroups = groups.filter(group => selectedIds.has(group.id));
    const resolveImage = imagePath => imagePath ? new URL(imagePath, window.location.href).href : "";
    const isMeetingDetailPrint = printMode === "meeting-detail";
    const isMeetingOverviewPrint = printMode === "meeting-overview";
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
            .map(activityId => ({
                id: activityId,
                activity: allAktiviteter.find(activity => activity.id === activityId)
            }));
        const activities = showPlanningActivities && badgeActivities.length > 0
            ? `<div class="pdf-badge-activities"><strong>Aktiviteter:</strong>${badgeActivities.map(activity => renderActivity(activity.id)).join("")}</div>`
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
    const renderActivity = (activityId, includeHandwritingSpace = false, handwritingRows = 3) => {
        const activity = allAktiviteter.find(item => item.id === activityId);
        if (!activity) return `<p class="missing-badge">Aktivitet ${escapeHtml(activityId)} kunde inte hittas.</p>`;
        const material = Array.isArray(activity.material) ? activity.material.join(", ") : "";
        const handwritingSpace = includeHandwritingSpace
            ? `<div class="pdf-meeting-detail-preparations-grid"><div><h4 aria-hidden="true">&nbsp;</h4><div class="pdf-handwriting-space" aria-label="Skrivyta för egna aktivitetsanteckningar">${"<span></span>".repeat(handwritingRows)}</div></div><div><h4>Ansvarig</h4><div class="pdf-handwriting-space" aria-label="Skrivyta för aktivitetens ansvarig">${"<span></span>".repeat(handwritingRows)}</div></div></div>`
            : "";
        return `<div class="pdf-activity"><h4>${escapeHtml(activity.namn)}</h4>${activity.kategori ? `<p><strong>Kategori:</strong> ${escapeHtml(activity.kategori)}</p>` : ""}${activity.beskrivning ? `<p><strong>Beskrivning:</strong> ${renderLinkedText(activity.beskrivning)}</p>` : ""}${formatActivityTime(activity) ? `<p><strong>Tid:</strong> ${escapeHtml(formatActivityTime(activity))}</p>` : ""}${material ? `<p><strong>Material:</strong> ${escapeHtml(material)}</p>` : ""}${activity.genomforande ? `<p><strong>Genomförande:</strong> ${renderLinkedText(activity.genomforande)}</p>` : ""}${handwritingSpace}</div>`;
    };
    const renderMeeting = (group, meeting) => {
        const meetingBadges = sortBadgesForDisplay(
            getMeetingBadgeIds(meeting)
                .map(badgeId => allMarken.find(item => item.id === badgeId))
                .filter(Boolean),
            Array.isArray(group.badges) ? group.badges : []
        );
        const selectedActivities = meeting.activities || [];
        const selectedGames = meeting.games || [];
        const badgeImages = meetingBadges.length > 0
            ? meetingBadges.map(badge => `<img class="pdf-meeting-badge" src="${escapeHtml(resolveImage(badge.bild))}" alt="${escapeHtml(badge.namn)}" title="${escapeHtml(badge.namn)}">`).join("")
            : "";
        return `<article class="pdf-meeting">
            <div class="pdf-meeting-header">
                ${badgeImages}
                <h3>Träff ${escapeHtml(meeting.week || "-")}${meeting.date ? ` <span>(${escapeHtml(meeting.date)})</span>` : ""}</h3>
            </div>
            ${meeting.notes ? `<p class="pdf-meeting-notes">${escapeHtml(meeting.notes)}</p>` : ""}
            ${selectedGames.length > 0 ? `<p><strong>Lek:</strong> ${selectedGames.map(activityId => {
                const activity = allAktiviteter.find(item => item.id === activityId);
                return activity ? escapeHtml(activity.namn) : `<span class="missing-activity">Lek saknas (${escapeHtml(activityId)})</span>`;
            }).join(", ")}</p>` : ""}
            ${selectedActivities.length > 0 ? `<p><strong>Aktiviteter:</strong> ${selectedActivities.map(activityId => {
                const activity = allAktiviteter.find(item => item.id === activityId);
                return activity ? escapeHtml(activity.namn) : `<span class="missing-activity">Aktivitet saknas (${escapeHtml(activityId)})</span>`;
            }).join(", ")}</p>` : ""}
            ${meeting.responsible ? `<p><strong>Ansvarig:</strong> ${escapeHtml(meeting.responsible)}</p>` : ""}
        </article>`;
    };
    const renderMeetingDetailPage = (group, meeting) => {
        const badges = getMeetingBadgeIds(meeting)
            .map(badgeId => allMarken.find(item => item.id === badgeId))
            .filter(Boolean);
        const levelIcon = getLevelIcon(group.level);
        const planningYear = getGroupYearValue(group);
        const planningTerm = getGroupTermValue(group);
        const selectedActivities = (meeting.activities || [])
            .map(activityId => allAktiviteter.find(item => item.id === activityId))
            .filter(Boolean);
        const selectedGames = (meeting.games || [])
            .map(activityId => allAktiviteter.find(item => item.id === activityId))
            .filter(Boolean);
        const badgeInfo = badges.length > 0
            ? `<div class="pdf-meeting-detail-summary">${badges.map(badge => `<div class="pdf-meeting-detail-badge"><img src="${escapeHtml(resolveImage(badge.bild))}" alt="${escapeHtml(badge.namn)}"><span>${escapeHtml(badge.namn)}</span></div>`).join("")}</div>`
            : `<div class="pdf-meeting-detail-summary"><p><strong>Märken:</strong> -</p></div>`;
        const dateInfo = meeting.date
            ? escapeHtml(meeting.date)
            : '<span class="pdf-meeting-detail-date-write-in" aria-label="Skriv datum här"></span>';
        const responsibleInfo = meeting.responsible
            ? escapeHtml(meeting.responsible)
            : '<span class="pdf-meeting-detail-responsible-write-in" aria-label="Skriv ansvarig här"></span>';
        const notesContent = `<h4>Anteckningar</h4>${meeting.notes ? `<p>${renderLinkedText(meeting.notes)}</p>` : ""}<div class="pdf-handwriting-space" aria-label="Skrivyta för mötesanteckningar"><span></span><span></span><span></span></div>`;
        const preparationsContent = `<div class="pdf-meeting-detail-preparations-grid"><div><h4>Förberedelser</h4><div class="pdf-handwriting-space" aria-label="Skrivyta för förberedelser"><span></span><span></span><span></span><span></span><span></span></div></div><div><h4>Ansvarig</h4><div class="pdf-handwriting-space" aria-label="Skrivyta för ansvarig"><span></span><span></span><span></span><span></span><span></span></div></div></div>`;
        const templateSections = [
            {
                title: "Inledningscermoni",
                text: "Mötet inleds med en ceremoni. Syftet är att varje scout ska bli sedd och välkomnad samt att skapa tydlig start på mötet. Att samla scouterna i en ring och hissa flaggan eller skicka runt något är vanligt."
            },
            {
                title: "Lek",
                text: "Sedan leker vi ofta en lek. Syftet är att ha roligt, lära känna varandra och att scouterna får röra på sig."
            },
            {
                title: "Aktivitet",
                text: "Därefter kommer mötets innehåll, det som ni ledare planerat att scouterna ska lära sig/öva på/tänka och känna kring."
            },
            {
                title: "Reflektion",
                text: "Efter aktiviteten samlas vi för reflektion i patrull eller i stor grupp beroende på scouternas behov och ledartillgång."
            },
            {
                title: "Avslutningscermoni",
                text: "Avslutningsvis är det dags för ceremoni igen. Den här gången är syftet att tacka för idag, markera ett tydligt slut på mötet och berätta vad som händer nästa gång."
            }
        ].map(section => `
            <div class="pdf-meeting-detail-section">
                <h4>${escapeHtml(section.title)}</h4>
                <div class="pdf-meeting-detail-section-content">
                    <p>${escapeHtml(section.text)}</p>
                    ${section.title === "Aktivitet"
                        ? `${selectedActivities.length > 0 ? selectedActivities.map(activity => renderActivity(activity.id, true)).join("") : ""}${selectedActivities.length === 0 ? `<div class="pdf-meeting-detail-preparations-grid"><div><h4 aria-hidden="true">&nbsp;</h4><div class="pdf-handwriting-space" aria-label="Skrivyta för aktiviteter"><span></span><span></span><span></span></div></div><div><h4>Ansvarig</h4><div class="pdf-handwriting-space" aria-label="Skrivyta för aktivitetens ansvarig"><span></span><span></span><span></span></div></div></div>` : ""}`
                        : ""}
                    ${section.title === "Lek"
                        ? `${selectedGames.length > 0 ? selectedGames.map(activity => renderActivity(activity.id, true, 1)).join("") : ""}${selectedGames.length === 0 ? `<div class="pdf-meeting-detail-preparations-grid"><div><h4 aria-hidden="true">&nbsp;</h4><div class="pdf-handwriting-space" aria-label="Skrivyta för egna anteckningar"><span></span></div></div><div><h4>Ansvarig</h4><div class="pdf-handwriting-space" aria-label="Skrivyta för lekens ansvarig"><span></span></div></div></div>` : ""}`
                        : ""}
                </div>
            </div>
        `).join("");
        return `
            <section class="pdf-meeting-detail-page">
                <header class="pdf-meeting-detail-document-header">
                    <img src="${escapeHtml(resolveImage("./images/icons/GTorp_250px.png"))}" alt="Gullbrandstorps Scoutkår">
                    <div class="pdf-meeting-detail-document-heading">
                        <span class="pdf-meeting-detail-meta-row">
                            <span>${planningYear !== null ? `År ${escapeHtml(String(planningYear))}` : "År -"}</span>
                            <span>&middot;</span>
                            <span>${escapeHtml(planningTerm || "Termin -")}</span>
                            <span>&middot;</span>
                            <span>${escapeHtml(group.level || "Målgrupp -")}</span>
                            ${levelIcon ? `<img src="${escapeHtml(resolveImage(levelIcon))}" alt="${escapeHtml(group.level || "Målgrupp")}">` : ""}
                        </span>
                        <span class="pdf-meeting-detail-meeting-row">Träff ${escapeHtml(meeting.week || "-")} &middot; Datum: ${dateInfo} &middot; Ansvarig: ${responsibleInfo}</span>
                    </div>
                </header>
                <div class="pdf-meeting-detail-info">
                    <div class="pdf-meeting-detail-card">
                        ${notesContent}
                        ${badgeInfo}
                    </div>
                </div>
                <div class="pdf-meeting-detail-sections">
                    ${templateSections}
                </div>
                <div class="pdf-meeting-detail-card pdf-meeting-detail-preparations">
                    ${preparationsContent}
                </div>
            </section>
        `;
    };

    const planningSections = selectedGroups.map(group => {
        const planningIcon = getLevelIcon(group.level);
        const icon = planningIcon
            ? `<img class="pdf-planning-icon" src="${escapeHtml(resolveImage(planningIcon))}" alt="${escapeHtml(group.level)}">`
            : "";
        const noteText = String(group.note ?? "").trim();
        const plannedActivityIds = Array.isArray(group.activities) ? group.activities : [];
        const linkedActivityIds = new Set((Array.isArray(group.badges) ? group.badges : []).flatMap(badgeId => {
            const marke = allMarken.find(item => item.id === badgeId);
            return marke ? getBadgeActivityIds(marke) : [];
        }));
        const unassignedActivities = plannedActivityIds.filter(activityId => !linkedActivityIds.has(activityId));
        const meetings = normalizeMeetingList(Array.isArray(group.meetings) ? group.meetings : [])
            .filter(meeting => !selectedMeetingIds || selectedMeetingIds.has(meeting.id));

        if (isMeetingDetailPrint) {
            return meetings.map(meeting => renderMeetingDetailPage(group, meeting)).join("") || "<p>Inga möten valdes.</p>";
        }

        return `
        <section class="pdf-planning">
            <h2 class="pdf-planning-heading">${icon}<span>${escapeHtml(group.name)} - ${escapeHtml(group.level)}</span></h2>
            ${noteText ? `<p class="pdf-planning-note">${renderLinkedText(noteText)}</p>` : ""}
            <p class="pdf-planning-intro">${isMeetingOverviewPrint ? "Följande möten är planerade:" : "Följande märken är planerade:"}</p>
            ${!isMeetingOverviewPrint && Array.isArray(group.badges) && group.badges.length > 0
                ? group.badges.map(badgeId => renderBadge(badgeId, group)).join("")
                : !isMeetingOverviewPrint ? "<p>Inga märken planerade.</p>" : ""}
            ${!isMeetingOverviewPrint && showPlanningActivities && unassignedActivities.length > 0
                ? `<div class="pdf-activities"><h3>Övriga aktiviteter</h3>${unassignedActivities.map(activityId => renderActivity(activityId)).join("")}</div>`
                : ""}
            ${showPlanningMeetings && meetings.length > 0 && (isMeetingOverviewPrint || !isMeetingOverviewPrint)
                ? `<div class="pdf-meetings"><h3>Möten</h3>${meetings.map(meeting => renderMeeting(group, meeting)).join("")}</div>`
                : ""}
        </section>
        `;
    }).join("");

    const printTitle = isMeetingOverviewPrint
        ? "Gullbrandstorps Scoutkårs Mötesöversikt"
        : isMeetingDetailPrint
            ? "Gullbrandstorps Scoutkårs Mötesplanering"
            : "Gullbrandstorps Scoutkårs Planeringsöversikt";

    printWindow.addEventListener("load", () => printWindow.print(), { once: true });
    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
        <html lang="sv">
        <head>
            <meta charset="UTF-8">
            <title>${escapeHtml(printTitle)}</title>
            <style>
                @page { size: A4; margin: 10mm 12mm 10mm 10mm; }
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
                .pdf-planning-note { margin: 8px 0 14px; color: #254b66; font-size: 11pt; line-height: 1.45; white-space: pre-wrap; }
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
                .pdf-activity h4 { margin: 0 0 2px; color: #003660; font-size: 11pt; }
                .pdf-activity p { margin: 2px 0; }
                .pdf-activities { margin-top: 14px; }
                .pdf-activities h3 { color: #003660; font-size: 12pt; }
                .pdf-meetings { margin-top: 18px; break-inside: avoid; }
                .pdf-meetings > h3 { margin: 0 0 8px; color: #003660; font-size: 12pt; }
                .pdf-meeting { position: relative; margin: 0 0 8px; padding: 8px 10px; border: 1px solid #d0d7de; border-radius: 6px; break-inside: avoid; }
                .pdf-meeting-header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
                .pdf-meeting-header h3 { margin: 0; color: #003660; font-size: 11pt; }
                .pdf-meeting h3 span { color: #536477; font-weight: normal; }
                .pdf-meeting p { margin: 2px 0; }
                .pdf-meeting-notes { white-space: pre-wrap; }
                .pdf-meeting-badge { width: 38px; height: 38px; object-fit: contain; flex: 0 0 38px; }
                .pdf-meeting-badges { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
                .pdf-meeting-detail-page { page-break-before: always; margin: 0 0 12px; padding-top: 4px; }
                .pdf-meeting-detail-page:first-of-type { page-break-before: auto; }
                .pdf-meeting-detail-document-header { display: flex; align-items: flex-start; gap: 7px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid #003660; color: #003660; font-size: 15pt; font-weight: bold; }
                .pdf-meeting-detail-document-header img { width: 18mm; height: 18mm; object-fit: contain; }
                .pdf-meeting-detail-document-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 2px 12px; min-width: 0; flex: 1; text-align: left; }
                .pdf-meeting-detail-document-title { display: block; white-space: nowrap; }
                .pdf-meeting-detail-header { margin-bottom: 8px; padding-bottom: 5px; border-bottom: 2px solid #003660; }
                .pdf-meeting-detail-header h2 { margin: 0 0 6px; color: #003660; font-size: 18pt; }
                .pdf-meeting-detail-header h3 { margin: 0; color: #254b66; font-size: 14pt; }
                .pdf-meeting-detail-header h2.pdf-meeting-detail-meta { display: block; font-size: 15pt; }
                .pdf-meeting-detail-meta-row { display: flex; align-items: center; justify-content: flex-start; gap: 8px; flex-wrap: wrap; }
                .pdf-meeting-detail-meta-row img { width: 30px; height: 30px; object-fit: contain; }
                .pdf-meeting-detail-meeting-row { display: block; flex-basis: 100%; margin-top: 4px; color: #254b66; font-size: 13pt; text-align: left; }
                .pdf-meeting-detail-date-write-in { display: inline-block; width: 35mm; border-bottom: 1px solid #9aa9b8; vertical-align: baseline; }
                .pdf-meeting-detail-responsible-write-in { display: inline-block; width: 45mm; border-bottom: 1px solid #9aa9b8; vertical-align: baseline; }
                .pdf-meeting-detail-info { display: grid; grid-template-columns: 1fr; gap: 8px; margin: 8px 0; }
                .pdf-meeting-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
                .pdf-meeting-detail-card { padding: 8px 10px; border: 1px solid #d0d7de; border-radius: 8px; background: #f8fafc; }
                .pdf-meeting-detail-card h4 { margin: 0 0 5px; color: #003660; font-size: 11pt; }
                .pdf-meeting-detail-card p, .pdf-meeting-detail-card ul { margin: 4px 0; }
                .pdf-meeting-detail-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 9px 0 4px; }
                .pdf-meeting-detail-badge { display: flex; align-items: center; gap: 12px; }
                .pdf-meeting-detail-badge img { width: 52px; height: 52px; object-fit: contain; }
                .pdf-meeting-detail-sections { display: grid; grid-template-columns: 1fr; gap: 7px; margin-top: 8px; }
                .pdf-meeting-detail-section { min-height: 0; padding: 7px 10px; border: 1px solid #d0d7de; border-radius: 8px; background: #f8fafc; }
                .pdf-meeting-detail-section h4 { margin: 0 0 4px; color: #003660; font-size: 11pt; }
                .pdf-meeting-detail-section-content { min-height: 0; border-top: 1px dashed #c7d2e2; padding-top: 5px; }
                .pdf-meeting-detail-section-content p { margin: 0; line-height: 1.3; }
                .pdf-meeting-detail-preparations { margin-top: 20px; break-inside: avoid; }
                .pdf-meeting-detail-preparations-grid { display: grid; grid-template-columns: 3fr 1fr; gap: 16px; }
                .pdf-handwriting-space { margin-top: 7px; padding-bottom: 5px; }
                .pdf-handwriting-space span { display: block; height: 24px; border-bottom: 1px solid #9aa9b8; }
                .missing-badge { color: #9b1c1c; }
            </style>
        </head>
        <body>
            ${isMeetingDetailPrint ? "" : `<header class="pdf-document-header">
                <img class="pdf-document-logo" src="${escapeHtml(resolveImage("./images/icons/GTorp_250px.png"))}" alt="Gullbrandstorps Scoutkår">
                <h1>${escapeHtml(printTitle)}</h1>
            </header>`}
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
    reader.onload = async () => {
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
                    note: typeof planning.note === "string" ? planning.note.trim() : "",
                    badges: Array.isArray(planning.badges) ? [...new Set(planning.badges.filter(Boolean))] : [],
                    activities: Array.isArray(planning.activities) ? [...new Set(planning.activities.filter(Boolean))] : [],
                    meetings: normalizeMeetingList(Array.isArray(planning.meetings) ? planning.meetings : [])
                });
            });
            saveGroups();
            localStorage.setItem(BADGE_NOTES_STORAGE_KEY, JSON.stringify(badgeNotes));
            window.GTScoutNotes?.scheduleSaveAll(badgeNotes);
            localStorage.setItem(CUSTOM_ACTIVITIES_STORAGE_KEY, JSON.stringify(customActivities));
            localStorage.setItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY, JSON.stringify(customBadgeActivities));

            if (window.GTScoutActivities?.canWrite?.()) {
                for (const activity of importedActivities) {
                    try {
                        await window.GTScoutActivities.saveActivity(activity);
                    } catch (error) {
                        console.error("Kunde inte importera aktivitet till databasen", error);
                    }
                }
                for (const [badgeId, activityIdsForBadge] of Object.entries(importedActivityLinks)) {
                    if (!Array.isArray(activityIdsForBadge)) continue;
                    for (const activityId of activityIdsForBadge) {
                        try {
                            await window.GTScoutActivities.addBadgeActivityLink(badgeId, activityId);
                        } catch (error) {
                            console.error("Kunde inte importera aktivitetskoppling till databasen", error);
                        }
                    }
                }
            }

            allAktiviteter = window.GTScoutActivities?.getAllActivities?.() || customActivities;
            renderPlanning();
            showTransferInfoModal("Import klar", [
                { label: "Planeringar", value: String(validPlannings.length) },
                { label: "Aktiviteter", value: String(importedActivities.length) },
                { label: "Anteckningsfält", value: String(importedNoteCount) },
                { label: "Fil", value: String(file?.name || "okänd fil") }
            ]);
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
        const markenResponse = await fetch("data/marken.json");
        if (!markenResponse.ok) throw new Error("Datafiler kunde inte laddas");
        const marken = await markenResponse.json();
        await Promise.all([
            window.GTScoutActivities?.ensureLoaded?.(),
            window.GTScoutBadges?.ensureLoaded?.()
        ]);
        const syncedActivities = window.GTScoutActivities?.getAllActivities?.() || [];
        baseMarken = marken;
        allMarken = [...baseMarken, ...(window.GTScoutBadges?.getAllBadges?.() || [])];
        allAktiviteter = syncedActivities.length ? syncedActivities : loadCustomActivities();
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
            defaultPlanningTemplates = data
                .filter(template => template && typeof template.name === "string" && Array.isArray(template.plannings))
                .map(template => ({ name: template.name, plannings: template.plannings }));
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
    document.getElementById("addGroupBtn")?.classList.toggle("hidden", !canEditPlannings());
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
            <button class="level-remove-all-btn${window.GTScoutAuth?.isAdmin?.() ? "" : " hidden"}" type="button" data-level="${level}" title="Ta bort alla planeringar i målgruppen">Ta bort alla</button>
        `;
        colHeader.querySelector(".level-remove-all-btn").addEventListener("click", () => removeLevelGroups(level));
        col.appendChild(colHeader);

        const groupsByYear = new Map();
        levelGroups.forEach(group => {
            const year = getGroupYearValue(group);
            const yearKey = Number.isFinite(year) ? String(year) : "unknown";
            if (!groupsByYear.has(yearKey)) groupsByYear.set(yearKey, []);
            groupsByYear.get(yearKey).push(group);
        });

        groupsByYear.forEach(yearGroups => {
            const cardsRow = document.createElement("div");
            cardsRow.className = "level-row-cards";

            yearGroups.forEach(group => {
                const card = document.createElement("div");
                card.className = "group-card";
                const noteText = String(group.note ?? "").trim();
                const planningYear = getGroupYearValue(group);
                const planningTerm = getGroupTermValue(group);
                card.innerHTML = `
                <div class="group-card-header">
                    <div class="group-card-heading">
                        <h3 class="group-name" title="Planeringens namn">${group.name}</h3>
                        <span class="group-planning-meta">År ${planningYear !== null ? planningYear : "-"} · ${planningTerm || "Termin -"}</span>
                    </div>
                    <div class="group-card-actions">
                        <button class="btn-secondary edit-group-btn" type="button" data-group-id="${group.id}"${canEditGroup(group) ? "" : " disabled aria-disabled=\"true\" title=\"Endast ledare och administratörer kan redigera denna planering\""}>Redigera</button>
                    </div>
                </div>
                ${noteText ? `<div class="group-note">${renderLinkedText(noteText)}</div>` : ""}
                <div class="group-badges" data-group-id="${group.id}">
                    ${renderGroupBadges(group, activeOpenActivityGroupIds, activeOpenMeetingGroupIds)}
                </div>
                `;
                card.querySelector(".edit-group-btn").addEventListener("click", () => openGroupEditor(group.id));
                card.querySelector(".add-badge-btn").addEventListener("click", event => {
                    event.stopPropagation();
                    openBadgePicker(group.id);
                });
                const addActivityButton = card.querySelector(".add-activity-btn");
                if (addActivityButton) {
                    addActivityButton.addEventListener("click", event => {
                        event.stopPropagation();
                        openActivityPicker(group.id);
                    });
                }
                const addMeetingButton = card.querySelector(".add-meeting-btn");
                if (addMeetingButton) {
                    addMeetingButton.addEventListener("click", event => {
                        event.stopPropagation();
                        openMeetingModal(group.id);
                    });
                }
                card.addEventListener("dblclick", event => {
                    const upperContentArea = event.target.closest(".group-card-header, .group-note");
                    if (!upperContentArea) return;
                    openGroupEditor(group.id);
                });
                cardsRow.appendChild(card);
            });

            col.appendChild(cardsRow);
        });

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
            openMeetingSelection(btn.dataset.groupId);
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
    const editable = canEditGroup(group);

    const badges = group.badges.map(badgeId => {
        const marke = allMarken.find(m => m.id === badgeId);
        if (!marke) return "";
        return `
            <div class="planned-badge" data-group-id="${group.id}" data-badge-id="${badgeId}" draggable="${editable}" title="Klicka för mer info">
                ${editable ? `
                <button class="remove-badge-btn" type="button"
                    data-group-id="${group.id}" data-badge-id="${badgeId}"
                    title="Ta bort ${marke.namn}">&times;</button>` : ""}
                <img src="${marke.bild}" alt="${marke.namn}">
                <span>${marke.namn}</span>
            </div>
        `;
    }).join("");
    let activityMarkup = "";
    if (showPlanningActivities) activityMarkup = `<details class="planned-activities"${openActivityGroupIds.has(group.id) ? " open" : ""}><summary><span>Aktiviteter${activities.length > 0 ? ` (${activities.length})` : ""}</span>${editable ? `<button class="btn-secondary add-activity-btn" type="button" data-group-id="${group.id}">+ Aktivitet</button>` : ""}</summary><div class="planned-activities-list">${activities.map(activityId => {
            const activity = allAktiviteter.find(item => item.id === activityId);
            return activity
                ? `<div class="planned-activity" data-group-id="${group.id}" data-activity-id="${activity.id}" draggable="true" title="Dra för att ändra ordning">
                        <span class="planned-activity-details">
                            ${renderActivityOwnershipBadge(activity)}
                            <span>${escapeHtml(activity.namn)}</span>
                            ${formatActivityTime(activity) ? `<small>${formatActivityTime(activity)}</small>` : ""}
                            ${renderMeetingLabels(group, activity.id)}
                        </span>
                        <button class="activity-info-button planned-activity-info-btn" type="button" data-activity-id="${activity.id}" title="Visa detaljer för ${activity.namn}" aria-label="Visa detaljer för ${activity.namn}">i</button>
                        <button class="remove-activity-btn" type="button" data-group-id="${group.id}" data-activity-id="${activity.id}" title="Ta bort ${activity.namn} från planeringen" aria-label="Ta bort ${activity.namn}">&times;</button>
                   </div>`
                     : `<div class="planned-activity planned-activity--missing" data-group-id="${group.id}" data-activity-id="${escapeHtml(activityId)}">
                            <span class="planned-activity-details"><span class="missing-activity">Aktivitet saknas</span><small>ID: ${escapeHtml(activityId)}</small></span>
                            <button class="remove-activity-btn" type="button" data-group-id="${group.id}" data-activity-id="${escapeHtml(activityId)}" title="Ta bort saknad aktivitet från planeringen" aria-label="Ta bort saknad aktivitet från planeringen">&times;</button>
                        </div>`;
                }).join("")}</div></details>`;
            const meetingsMarkup = showPlanningMeetings ? `<details class="planned-meetings"${openMeetingGroupIds.has(group.id) ? " open" : ""}><summary><span>Möten${meetings.length > 0 ? ` (${meetings.length})` : ""}</span><button class="btn-secondary add-meeting-btn" type="button" data-group-id="${group.id}"${editable ? "" : " disabled aria-disabled=\"true\" title=\"Endast ledare och administratörer kan ändra denna planering\""}>+ Möte</button></summary><div class="planned-meetings-list"><div class="planned-meetings-actions"><button class="btn-secondary print-meetings-btn" type="button" data-group-id="${group.id}">Skriv ut möten</button></div>${meetings.map(meeting => {
            const selectedActivities = (meeting.activities || []).map(activityId => allAktiviteter.find(item => item.id === activityId)).filter(Boolean);
            const meetingBadges = sortBadgesForDisplay(
                getMeetingBadgeIds(meeting)
                    .map(badgeId => allMarken.find(item => item.id === badgeId))
                    .filter(Boolean),
                Array.isArray(group.badges) ? group.badges : []
            );
            return `<div class="planned-meeting" data-group-id="${group.id}" data-meeting-id="${meeting.id}">
                    <div class="planned-meeting-header">
                        <strong>Träff ${escapeHtml(meeting.week || "-")}</strong>
                        <div class="planned-meeting-tools">
                            <button class="edit-meeting-btn" type="button" data-group-id="${group.id}" data-meeting-id="${meeting.id}">Redigera</button>
                            <button class="remove-meeting-btn" type="button" data-group-id="${group.id}" data-meeting-id="${meeting.id}" aria-label="Ta bort möte">&times;</button>
                        </div>
                    </div>
                    ${meeting.date ? `<small>${escapeHtml(meeting.date)}</small>` : ""}
                    ${meeting.notes ? `<p>${escapeHtml(meeting.notes)}</p>` : ""}
                    ${meetingBadges.length > 0 ? `<div class="planned-meeting-badges">${meetingBadges.map(badge => `<div class="planned-meeting-badge" title="${escapeHtml(badge.namn)}"><img src="${escapeHtml(badge.bild)}" alt="${escapeHtml(badge.namn)}"></div>`).join("")}</div>` : ""}
                    ${(meeting.games || []).length > 0 ? `<div class="planned-meeting-activity-list"><strong>Lek:</strong> ${(meeting.games || []).map(activityId => {
                        const activity = allAktiviteter.find(item => item.id === activityId);
                        return activity ? escapeHtml(activity.namn) : `<span class="missing-activity">Lek saknas (${escapeHtml(activityId)})</span>`;
                    }).join(", ")}</div>` : ""}
                    ${(meeting.activities || []).length > 0 ? `<div class="planned-meeting-activity-list"><strong>Aktiviteter:</strong> ${(meeting.activities || []).map(activityId => {
                        const activity = allAktiviteter.find(item => item.id === activityId);
                        return activity ? escapeHtml(activity.namn) : `<span class="missing-activity">Aktivitet saknas (${escapeHtml(activityId)})</span>`;
                    }).join(", ")}</div>` : ""}
                    ${meeting.responsible ? `<div><strong>Ansvarig:</strong> ${escapeHtml(meeting.responsible)}</div>` : ""}
                </div>`;
        }).join("")}</div></details>` : "";
    return `${badges}<div class="group-badges-actions"><button class="btn-secondary add-badge-btn" type="button" data-group-id="${group.id}"${editable ? "" : " disabled aria-disabled=\"true\" title=\"Endast ledare och administratörer kan ändra denna planering\""}>+ Märke</button></div>${activityMarkup}${meetingsMarkup}`;
}

// ── Groups CRUD ────────────────────────────────────────────────────────────

function addGroup(name, level, year = "", term = "", note = "") {
    if (!canEditPlannings()) return;
    const trimmedName = String(name || "").trim();
    const normalizedYear = Number.parseInt(String(year ?? ""), 10);
    const normalizedTerm = normalizePlanningTerm(term);
    const auth = window.GTScoutAuth;
    const profile = auth?.getProfile?.();
    const now = new Date().toISOString();
    const localOnly = Boolean(auth?.isOnline?.() && !window.GTScoutPlanningSync?.canWrite?.());
    groups.push({
        id: crypto.randomUUID(),
        created_by: auth?.getUser?.()?.id || null,
        created_by_name: profile?.full_name || profile?.email || "",
        updated_by_name: profile?.full_name || profile?.email || "",
        updated_at: now,
        local_only: localOnly,
        name: trimmedName || [Number.isFinite(normalizedYear) ? `${normalizedYear}` : "", normalizedTerm].filter(Boolean).join(" "),
        level,
        year: Number.isFinite(normalizedYear) ? normalizedYear : "",
        term: normalizedTerm,
        note: typeof note === "string" ? note.trim() : "",
        badges: [],
        activities: [],
        meetings: []
    });
    saveGroups();
    renderPlanning();
}

function copyGroup(id) {
    const source = groups.find(group => group.id === id);
    if (!source || !canEditPlannings()) return;

    const auth = window.GTScoutAuth;
    const profile = auth?.getProfile?.();
    const now = new Date().toISOString();
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = crypto.randomUUID();
    copy.name = `Kopia av ${source.name}`;
    copy.created_by = auth?.getUser?.()?.id || null;
    copy.created_by_name = profile?.full_name || profile?.email || "";
    copy.updated_by_name = profile?.full_name || profile?.email || "";
    copy.updated_at = now;
    copy.local_only = Boolean(auth?.isOnline?.() && !window.GTScoutPlanningSync?.canWrite?.());
    groups.push(copy);
    saveGroups();
    renderPlanning(new Set([copy.id]));
}

function removeGroup(id) {
    const group = groups.find(g => g.id === id);
    if (!canDeleteGroup(group)) return;
    if (!confirm("Ta bort planeringen och alla planerade märken?")) return;
    groups = groups.filter(g => g.id !== id);
    saveGroups();
    renderPlanning();
}

function removeLevelGroups(level) {
    if (!window.GTScoutAuth?.isAdmin?.()) return;
    const count = groups.filter(g => g.level === level).length;
    if (count === 0) return;
    if (!confirm(`Ta bort alla ${count} planeringar för ${level}?`)) return;
    groups = groups.filter(g => g.level !== level);
    saveGroups();
    renderPlanning();
}

function openGroupEditor(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group || !canEditGroup(group)) return;

    groupModal.dataset.editingGroupId = groupId;
    document.getElementById("groupModalTitle").textContent = "Redigera planering";
    document.getElementById("saveGroupBtn").textContent = "Uppdatera";
    document.getElementById("groupName").value = stripPlanningYearPrefix(group.name || "");
    document.getElementById("groupYear").value = Number.isFinite(getGroupYearValue(group)) ? getGroupYearValue(group) : "";
    document.getElementById("groupTerm").value = getGroupTermValue(group) || "";
    document.getElementById("groupNote").value = typeof group.note === "string" ? group.note : "";
    document.getElementById("groupLevel").value = group.level || "Familjescouting";

    const ownerRow = document.getElementById("planningOwnerRow");
    const ownerInfo = document.getElementById("planningOwnerInfo");
    const changeOwnerBtn = document.getElementById("changeOwnerBtn");
    const changeOwnerSection = document.getElementById("changeOwnerSection");
    
    ownerInfo.textContent = `Ägs av: ${getPlanningOwnerLabel(group)}`;
    ownerRow.classList.remove("hidden");
    changeOwnerSection.classList.add("hidden");

    const auth = window.GTScoutAuth;
    if (auth?.isAdmin?.()) {
        changeOwnerBtn.classList.remove("hidden");
    } else {
        changeOwnerBtn.classList.add("hidden");
    }

    const updatedInfo = document.getElementById("planningUpdatedInfo");
    updatedInfo.textContent = `Senast uppdaterad av: ${group.updated_by_name || "uppgift saknas"}, ${formatPlanningUpdatedAt(group.updated_at)}`;
    updatedInfo.classList.remove("hidden");
    document.getElementById("copyGroupBtn").classList.remove("hidden");
    const removeButton = document.getElementById("removeGroupBtn");
    const canDelete = canDeleteGroup(group);
    removeButton.classList.remove("hidden");
    removeButton.disabled = !canDelete;
    removeButton.setAttribute("aria-disabled", String(!canDelete));
    groupModal.classList.remove("hidden");
    document.getElementById("groupName").focus();
}

function resetGroupModalState() {
    groupModal.dataset.editingGroupId = "";
    document.getElementById("groupModalTitle").textContent = "Ny plannering";
    document.getElementById("saveGroupBtn").textContent = "Spara";
    document.getElementById("groupNote").value = "";
    document.getElementById("planningOwnerRow")?.classList.add("hidden");
    document.getElementById("changeOwnerBtn")?.classList.add("hidden");
    document.getElementById("changeOwnerSection")?.classList.add("hidden");
    document.getElementById("planningUpdatedInfo").classList.add("hidden");
    document.getElementById("copyGroupBtn").classList.add("hidden");
    const removeButton = document.getElementById("removeGroupBtn");
    removeButton.classList.add("hidden");
    removeButton.disabled = false;
    removeButton.setAttribute("aria-disabled", "false");
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
    if (!group || !canEditGroup(group)) return;
    group.badges = group.badges.filter(b => b !== badgeId);
    saveGroups();
    renderPlanning();
}

function removeActivityFromGroup(groupId, activityId) {
    const group = groups.find(g => g.id === groupId);
    if (!group || !canEditGroup(group) || !Array.isArray(group.activities)) return;
    group.activities = group.activities.filter(id => id !== activityId);
    group.meetings = normalizeMeetingList((group.meetings || []).map(meeting => ({
        ...meeting,
        activities: (meeting.activities || []).filter(id => id !== activityId)
    })));
    saveGroups();
    renderPlanning();
}

function normalizeMeetingBadgeIds(value) {
    if (Array.isArray(value)) {
        return [...new Set(value
            .flatMap(item => String(item ?? "").split(","))
            .map(item => item.trim())
            .filter(Boolean))];
    }
    if (typeof value === "string") {
        return [...new Set(value
            .split(",")
            .map(item => item.trim())
            .filter(Boolean))];
    }
    return [];
}

function sortBadgesForDisplay(badges, preferredOrder = []) {
    const preferredIndex = new Map(preferredOrder.map((badgeId, index) => [badgeId, index]));
    const targetGroupOrder = ["Familjescouting", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];
    return [...badges].sort((left, right) => {
        const leftPriority = preferredIndex.has(left.id) ? preferredIndex.get(left.id) : Number.MAX_SAFE_INTEGER;
        const rightPriority = preferredIndex.has(right.id) ? preferredIndex.get(right.id) : Number.MAX_SAFE_INTEGER;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;

        const leftGroupIndex = getTargetGroups(left)
            .map(group => targetGroupOrder.indexOf(group))
            .filter(index => index !== -1)
            .sort((a, b) => a - b)[0] ?? Number.MAX_SAFE_INTEGER;
        const rightGroupIndex = getTargetGroups(right)
            .map(group => targetGroupOrder.indexOf(group))
            .filter(index => index !== -1)
            .sort((a, b) => a - b)[0] ?? Number.MAX_SAFE_INTEGER;
        if (leftGroupIndex !== rightGroupIndex) return leftGroupIndex - rightGroupIndex;

        return left.namn.localeCompare(right.namn, "sv");
    });
}

function getMeetingBadgeIds(meeting) {
    const badgeIds = normalizeMeetingBadgeIds([
        ...(Array.isArray(meeting?.badgeIds) ? meeting.badgeIds : []),
        ...(Array.isArray(meeting?.markeIds) ? meeting.markeIds : []),
        ...(typeof meeting?.badgeId === "string" ? [meeting.badgeId] : []),
        ...(typeof meeting?.markeId === "string" ? [meeting.markeId] : [])
    ]);
    return badgeIds;
}

function normalizeMeetingList(meetings) {
    if (!Array.isArray(meetings)) return [];
    return meetings
        .map(meeting => {
            if (!meeting || typeof meeting !== "object") return null;
            const weekValue = String(meeting.week ?? "").trim();
            const badgeIds = getMeetingBadgeIds(meeting);
            return {
                id: typeof meeting.id === "string" && meeting.id.trim() ? meeting.id.trim() : crypto.randomUUID(),
                week: weekValue || (typeof meeting.vecka === "number" ? String(meeting.vecka) : ""),
                date: String(meeting.date ?? ""),
                responsible: String(meeting.responsible ?? meeting.ansvarig ?? "").trim(),
                badgeIds,
                badgeId: badgeIds[0] || "",
                games: Array.isArray(meeting.games) ? [...new Set(meeting.games.filter(Boolean))] : [],
                activities: Array.isArray(meeting.activities) ? [...new Set(meeting.activities.filter(Boolean))] : [],
                notes: String(meeting.notes ?? meeting.note ?? "").trim()
            };
        })
        .filter(Boolean)
        .sort((left, right) => {
            const leftDate = /^\d{4}-\d{2}-\d{2}$/.test(left.date) ? left.date : "9999-99-99";
            const rightDate = /^\d{4}-\d{2}-\d{2}$/.test(right.date) ? right.date : "9999-99-99";
            return leftDate.localeCompare(rightDate);
        });
}

function getMeetingLabelsForActivity(group, activityId) {
    return normalizeMeetingList(group?.meetings || [])
        .filter(meeting => meeting.activities.includes(activityId))
        .map(meeting => `Träff ${meeting.week || "-"}`);
}

function renderMeetingLabels(group, activityId) {
    const labels = getMeetingLabelsForActivity(group, activityId);
    return labels.length > 0
        ? `<span class="activity-meeting-links">Utlagd på: ${escapeHtml(labels.join(", "))}</span>`
        : `<span class="activity-meeting-links activity-meeting-links--empty">Inte utlagd på någon träff</span>`;
}

function openMeetingModal(groupId, meetingId = null) {
    const modal = document.getElementById("meetingModal");
    const group = groups.find(item => item.id === groupId);
    if (!group || !canEditGroup(group)) return;

    const meeting = meetingId ? normalizeMeetingList(group.meetings || []).find(item => item.id === meetingId) : null;
    const meetingName = meeting?.week ? `Träff ${meeting.week}` : "Träff";
    document.getElementById("meetingModalTitle").textContent = `${group.level || "Målgrupp"} – ${group.name} – ${meetingName}`;
    const gameList = document.getElementById("meetingGameList");
    const activityList = document.getElementById("meetingActivityList");
    const selectedIds = new Set((meeting && Array.isArray(meeting.activities) ? meeting.activities : []));
    const selectedGameIds = new Set((meeting && Array.isArray(meeting.games) ? meeting.games : []));
    const allGamesButton = document.getElementById("meetingAllGamesBtn");
    const allActivitiesButton = document.getElementById("meetingAllActivitiesBtn");
    const selectedBadgeIds = new Set(getMeetingBadgeIds(meeting));
    const badgeList = sortBadgesForDisplay(
        (Array.isArray(group.badges) ? group.badges : [])
            .map(badgeId => allMarken.find(item => item.id === badgeId))
            .filter(Boolean),
        Array.isArray(group.badges) ? group.badges : []
    );
    const planningActivityIds = new Set(Array.isArray(group.activities) ? group.activities : []);

    function renderMeetingActivities() {
        const availableActivityIds = new Set([...planningActivityIds, ...selectedIds]);
        const availableActivities = allAktiviteter
            .filter(activity => availableActivityIds.has(activity.id))
            .sort((left, right) => Number(selectedIds.has(right.id)) - Number(selectedIds.has(left.id)));
        activityList.innerHTML = availableActivities.length > 0
            ? availableActivities.map(activity => `
                <label class="meeting-activity-option">
                    <input type="checkbox" value="${activity.id}" ${selectedIds.has(activity.id) ? "checked" : ""}>
                    <span class="meeting-activity-details">
                        <span>${escapeHtml(activity.namn)}</span>
                        ${renderMeetingLabels(group, activity.id)}
                    </span>
                </label>`).join("")
            : "<p class='group-empty'>Det finns inga aktiviteter i denna planering ännu.</p>";
    }

    function renderMeetingGames() {
        const selectedGames = allAktiviteter
            .filter(activity => selectedGameIds.has(activity.id))
            .filter(isGameActivity);
        gameList.innerHTML = selectedGames.length > 0
            ? selectedGames.map(activity => `
                <label class="meeting-activity-option">
                    <input type="checkbox" value="${activity.id}" checked>
                    <span class="meeting-activity-details"><span>${escapeHtml(activity.namn)}</span></span>
                </label>`).join("")
            : "<p class='group-empty'>Ingen lek är vald ännu.</p>";
    }

    function persistSelectedGames() {
        const currentMeeting = modal.dataset.meetingId
            ? normalizeMeetingList(group.meetings || []).find(item => item.id === modal.dataset.meetingId)
            : null;
        if (!currentMeeting) return;
        currentMeeting.games = [...selectedGameIds];
        group.meetings = normalizeMeetingList((group.meetings || []).map(item => item.id === currentMeeting.id ? currentMeeting : item));
        saveGroups();
    }

    modal.dataset.groupId = groupId;
    modal.dataset.meetingId = meetingId || "";
    document.getElementById("meetingWeek").value = meeting ? (meeting.week || "") : "";
    document.getElementById("meetingDate").value = meeting ? (meeting.date || "") : "";
    document.getElementById("meetingResponsible").value = meeting ? (meeting.responsible || "") : "";
    const meetingBadge = document.getElementById("meetingBadge");
    const meetingBadgePicker = document.getElementById("meetingBadgePicker");
    meetingBadge.value = [...selectedBadgeIds].join(",");
    meetingBadgePicker.innerHTML = [
        `<button class="meeting-badge-option${selectedBadgeIds.size === 0 ? " meeting-badge-option--selected" : ""}" type="button" data-badge-id="" aria-pressed="${selectedBadgeIds.size === 0 ? "true" : "false"}">Inget märke</button>`,
        ...badgeList.map(badge => `<button class="meeting-badge-option${selectedBadgeIds.has(badge.id) ? " meeting-badge-option--selected" : ""}" type="button" data-badge-id="${escapeHtml(badge.id)}" aria-pressed="${selectedBadgeIds.has(badge.id) ? "true" : "false"}"><img src="${escapeHtml(badge.bild)}" alt=""><span>${escapeHtml(badge.namn)}</span></button>`)
    ].join("");
    meetingBadgePicker.querySelectorAll(".meeting-badge-option").forEach(option => {
        option.addEventListener("click", () => {
            const nextSelectedBadgeIds = new Set(normalizeMeetingBadgeIds(meetingBadge.value));
            const badgeId = option.dataset.badgeId || "";
            if (!badgeId) {
                if (nextSelectedBadgeIds.size === 0) return;
                nextSelectedBadgeIds.clear();
            } else if (nextSelectedBadgeIds.has(badgeId)) {
                nextSelectedBadgeIds.delete(badgeId);
                if (nextSelectedBadgeIds.size === 0) {
                    meetingBadge.value = "";
                    meetingBadgePicker.querySelectorAll(".meeting-badge-option").forEach(item => {
                        const isSelected = (item.dataset.badgeId || "") === "" && nextSelectedBadgeIds.size === 0;
                        item.classList.toggle("meeting-badge-option--selected", isSelected);
                        item.setAttribute("aria-pressed", String(isSelected));
                    });
                    return;
                }
            } else {
                nextSelectedBadgeIds.add(badgeId);
            }
            meetingBadge.value = [...nextSelectedBadgeIds].join(",");
            meetingBadgePicker.querySelectorAll(".meeting-badge-option").forEach(item => {
                const isSelected = (item.dataset.badgeId || "") === ""
                    ? nextSelectedBadgeIds.size === 0
                    : nextSelectedBadgeIds.has(item.dataset.badgeId || "");
                item.classList.toggle("meeting-badge-option--selected", isSelected);
                item.setAttribute("aria-pressed", String(isSelected));
            });
        });
    });
    document.getElementById("meetingNotes").value = meeting ? (meeting.notes || "") : "";
    document.getElementById("meetingSeriesCount").value = "10";
    document.getElementById("meetingSeriesStartWeek").value = "1";
    document.getElementById("meetingSeriesStartDate").value = "";
    activityList.onchange = event => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
        if (input.checked) selectedIds.add(input.value);
        else selectedIds.delete(input.value);
    };
    gameList.onchange = event => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
        if (input.checked) selectedGameIds.add(input.value);
        else selectedGameIds.delete(input.value);
    };
    allGamesButton.onclick = () => openMeetingActivityPicker(group, selectedGameIds, () => {
        renderMeetingGames();
        persistSelectedGames();
    }, isGameActivity);
    allActivitiesButton.onclick = () => openMeetingActivityPicker(group, selectedIds, renderMeetingActivities);
    renderMeetingGames();
    renderMeetingActivities();

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
    const badgeIds = normalizeMeetingBadgeIds(document.getElementById("meetingBadge").value);
    const notes = document.getElementById("meetingNotes").value.trim();
    const selectedGames = [...document.querySelectorAll("#meetingGameList input:checked")].map(input => input.value);
    const selectedActivities = [...document.querySelectorAll("#meetingActivityList input:checked")].map(input => input.value);
    if (!week && !date) {
        document.getElementById("meetingWeek").focus();
        return;
    }

    const payload = {
        week,
        date,
        responsible,
        badgeIds,
        badgeId: badgeIds[0] || "",
        games: [...new Set(selectedGames.filter(Boolean))],
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

function generateMeetingSeries(groupId, count, startWeek, startDate, activities = [], games = [], badgeId = "", responsible = "", notes = "") {
    const group = groups.find(item => item.id === groupId);
    if (!group) return;

    const meetingCount = Math.max(1, Number.parseInt(count, 10) || 1);
    const firstWeek = Math.max(1, Number.parseInt(startWeek, 10) || 1);
    const baseDate = startDate ? new Date(`${startDate}T12:00:00`) : new Date();
    const generatedMeetings = [];
    const badgeIds = normalizeMeetingBadgeIds(badgeId);

    for (let index = 0; index < meetingCount; index += 1) {
        const nextDate = new Date(baseDate);
        nextDate.setDate(baseDate.getDate() + (index * 7));
        generatedMeetings.push({
            id: crypto.randomUUID(),
            week: String(firstWeek + index),
            date: nextDate.toISOString().slice(0, 10),
            responsible,
            badgeIds,
            badgeId: badgeIds[0] || "",
            games: [...new Set(games.filter(Boolean))],
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
        const selectedGames = [...document.querySelectorAll("#meetingGameList input:checked")]
            .map(input => input.value);
        generateMeetingSeries(
            groupId,
            document.getElementById("meetingSeriesCount").value,
            document.getElementById("meetingSeriesStartWeek").value,
            document.getElementById("meetingSeriesStartDate").value,
            selectedActivities,
            selectedGames,
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
    const badgeIds = normalizeMeetingBadgeIds([
        meetingInput.badgeIds,
        meetingInput.badgeId,
        meetingInput.markeIds,
        meetingInput.markeId
    ]);
    const meeting = {
        id: typeof meetingInput.id === "string" && meetingInput.id.trim() ? meetingInput.id.trim() : crypto.randomUUID(),
        week: String(meetingInput.week ?? "").trim(),
        date: String(meetingInput.date ?? ""),
        responsible: String(meetingInput.responsible ?? meetingInput.ansvarig ?? "").trim(),
        badgeIds,
        badgeId: badgeIds[0] || "",
        games: Array.isArray(meetingInput.games) ? [...new Set(meetingInput.games.filter(Boolean))] : [],
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
        const nextBadgeIds = normalizeMeetingBadgeIds([
            meetingInput.badgeIds,
            meetingInput.badgeId,
            meetingInput.markeIds,
            meetingInput.markeId,
            meeting.badgeIds,
            meeting.badgeId
        ]);
        return {
            ...meeting,
            week: String(meetingInput.week ?? meeting.week ?? "").trim(),
            date: String(meetingInput.date ?? meeting.date ?? ""),
            responsible: String(meetingInput.responsible ?? meetingInput.ansvarig ?? meeting.responsible ?? "").trim(),
            badgeIds: nextBadgeIds,
            badgeId: nextBadgeIds[0] || "",
            games: Array.isArray(meetingInput.games)
                ? [...new Set(meetingInput.games.filter(Boolean))]
                : [...(meeting.games || [])],
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

function generateMeetingSeries(groupId, count, startWeek, startDate, activities = [], games = [], badgeId = "", responsible = "", notes = "") {
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
            games: [...new Set(games.filter(Boolean))],
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
const defaultPlanningTemplate = document.getElementById("defaultPlanningTemplate");
const defaultPlanningLevel = document.getElementById("defaultPlanningLevel");
const defaultPlanningYearCount = document.getElementById("defaultPlanningYearCount");

function getDefaultPlanningTemplate() {
    return defaultPlanningTemplates.find(template => template.name === defaultPlanningTemplate.value)
        || defaultPlanningTemplates[0]
        || { plannings: [] };
}

function populateDefaultPlanningTemplates() {
    defaultPlanningTemplate.innerHTML = defaultPlanningTemplates
        .map(template => `<option value="${escapeHtml(template.name)}">${escapeHtml(template.name)}</option>`)
        .join("");
}

function populateDefaultPlanningLevels(preferredLevel) {
    const levels = getDefaultPlanningTemplate().plannings
        .map(planning => planning?.level)
        .filter(level => typeof level === "string" && level.trim());
    defaultPlanningLevel.innerHTML = levels
        .map(level => `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`)
        .join("");
    defaultPlanningLevel.value = levels.includes(preferredLevel) ? preferredLevel : levels[0] || "";
}

function getDefaultPlanningYear(plan) {
    if (!plan || typeof plan !== "object") return null;
    const explicitYear = Number.parseInt(String(plan.year ?? "").trim(), 10);
    if (Number.isFinite(explicitYear)) return explicitYear;
    const name = String(plan.name ?? "");
    const match = name.match(/\b(\d+)\b/u);
    if (!match) return null;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function getAvailableDefaultYears(level) {
    const planning = getDefaultPlanningTemplate().plannings.find(item => item.level === level);
    if (!planning) return [];
    const years = [...new Set((planning.plans || [])
        .map(getDefaultPlanningYear)
        .filter(year => Number.isFinite(year)))].sort((a, b) => a - b);
    return years;
}

function updateDefaultPlanningYearOptions(level) {
    if (!defaultPlanningYearCount) return;
    const planning = getDefaultPlanningTemplate().plannings.find(item => item.level === level);
    const plans = Array.isArray(planning?.plans) ? planning.plans : [];
    const availableYears = getAvailableDefaultYears(level);
    const yearOptions = availableYears.length > 0 ? availableYears : [1];
    const perYearOptions = yearOptions.map(year => {
        const firstTerm = (year * 2) - 1;
        const lastTerm = year * 2;
        return `<option value="${year}">År ${year} (termin ${firstTerm}-${lastTerm})</option>`;
    });
    defaultPlanningYearCount.innerHTML = [
        ...perYearOptions,
        `<option value="alla">Alla (alla terminer)</option>`
    ].join("");
    defaultPlanningYearCount.value = "alla";
}

function getUniquePlanningName(level, name) {
    const existingNames = new Set(groups
        .filter(group => group.level === level)
        .map(group => group.name));
    if (!existingNames.has(name)) return name;

    let copyNumber = 2;
    while (existingNames.has(`${name} (${copyNumber})`)) {
        copyNumber += 1;
    }
    return `${name} (${copyNumber})`;
}

function addDefaultPlanningForLevel(level, yearCount) {
    const template = getDefaultPlanningTemplate().plannings.find(item => item.level === level);
    if (!template) return 0;

    const auth = window.GTScoutAuth;
    const profile = auth?.getProfile?.();
    const ownerName = profile?.full_name || profile?.email || "";
    const now = new Date().toISOString();
    const localOnly = Boolean(auth?.isOnline?.() && !window.GTScoutPlanningSync?.canWrite?.());
    let added = 0;
    const selectedYear = String(yearCount ?? "alla").trim().toLowerCase();
    const parsedYear = Number.parseInt(selectedYear, 10);
    const isAllYears = selectedYear === "alla" || !Number.isFinite(parsedYear);

    const plans = (template.plans || [])
        .filter(p => p && typeof p.name === "string")
        .filter(plan => {
            if (isAllYears) return true;
            const planYear = getDefaultPlanningYear(plan);
            return Number.isFinite(planYear) && planYear === parsedYear;
        });
    plans.forEach(plan => {
        const name = getUniquePlanningName(level, plan.name);
        groups.push({
            id: crypto.randomUUID(),
            created_by: auth?.getUser?.()?.id || null,
            created_by_name: ownerName,
            updated_by_name: ownerName,
            updated_at: now,
            local_only: localOnly,
            name,
            level,
            note: typeof plan.note === "string" ? plan.note.trim() : "",
            badges: Array.isArray(plan.badges) ? [...new Set(plan.badges)] : [],
            activities: Array.isArray(plan.activities) ? [...new Set(plan.activities)] : []
        });
        added += 1;
    });

    if (added > 0) {
        saveGroups();
        renderPlanning();
    }
    return added;
}

document.getElementById("openDefaultPlanningBtn").addEventListener("click", () => {
    const selectedLevel = document.getElementById("groupLevel").value || "Familjescouting";
    populateDefaultPlanningTemplates();
    populateDefaultPlanningLevels(selectedLevel);
    updateDefaultPlanningYearOptions(defaultPlanningLevel.value);
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
    const selectedYearCount = defaultPlanningYearCount?.value;
    addDefaultPlanningForLevel(selectedLevel, selectedYearCount);
    defaultPlanningModal.classList.add("hidden");
    groupModal.classList.add("hidden");
});

defaultPlanningLevel.addEventListener("change", () => {
    updateDefaultPlanningYearOptions(defaultPlanningLevel.value || "Familjescouting");
});

defaultPlanningTemplate.addEventListener("change", () => {
    populateDefaultPlanningLevels(defaultPlanningLevel.value);
    updateDefaultPlanningYearOptions(defaultPlanningLevel.value);
});

const groupModal = document.getElementById("groupModal");
const exportInfoModal = document.getElementById("exportInfoModal");
const pdfSelectionModal = document.getElementById("pdfSelectionModal");
const pdfSelectionList = document.getElementById("pdfSelectionList");
const pdfPlanningFilter = document.getElementById("pdfPlanningFilter");
const meetingSelectionModal = document.getElementById("meetingSelectionModal");
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
document.getElementById("closeMeetingSelectionModal").addEventListener("click", () => meetingSelectionModal.classList.add("hidden"));
meetingSelectionModal.addEventListener("click", event => {
    if (event.target === meetingSelectionModal) meetingSelectionModal.classList.add("hidden");
});
document.getElementById("selectAllMeetingsBtn").addEventListener("click", () => {
    const group = groups.find(item => item.id === meetingSelectionGroupId);
    meetingSelectionState = new Set(normalizeMeetingList(group?.meetings || []).map(meeting => meeting.id));
    renderMeetingSelectionList();
});
document.getElementById("clearMeetingsBtn").addEventListener("click", () => {
    meetingSelectionState.clear();
    renderMeetingSelectionList();
});
document.getElementById("generateMeetingsPdfBtn").addEventListener("click", () => {
    if (meetingSelectionState.size === 0) {
        alert("Välj minst ett möte.");
        return;
    }
    const selectedMode = document.querySelector("input[name='meetingPrintMode']:checked")?.value || "overview";
    meetingSelectionModal.classList.add("hidden");
    generatePlanningPdf(
        new Set([meetingSelectionGroupId]),
        selectedMode === "detailed" ? "meeting-detail" : "meeting-overview",
        meetingSelectionState
    );
});

const importPlanningInput = document.getElementById("importPlanningInput");
const planningActionsBtn = document.getElementById("planningActionsBtn");
const planningActionsDropdown = document.getElementById("planningActionsDropdown");
const togglePlanningActivitiesBtn = document.getElementById("togglePlanningActivitiesBtn");
const togglePlanningMeetingsBtn = document.getElementById("togglePlanningMeetingsBtn");
const updatePlanningDetailsToggles = () => {
    togglePlanningActivitiesBtn.querySelector(".planning-toggle-status").textContent = showPlanningActivities ? "✓" : "–";
    togglePlanningActivitiesBtn.classList.toggle("planning-toggle-item--off", !showPlanningActivities);
    togglePlanningActivitiesBtn.setAttribute("aria-pressed", String(showPlanningActivities));
    togglePlanningMeetingsBtn.querySelector(".planning-toggle-status").textContent = showPlanningMeetings ? "✓" : "–";
    togglePlanningMeetingsBtn.classList.toggle("planning-toggle-item--off", !showPlanningMeetings);
    togglePlanningMeetingsBtn.setAttribute("aria-pressed", String(showPlanningMeetings));
};
updatePlanningDetailsToggles();
togglePlanningActivitiesBtn.addEventListener("click", () => {
    showPlanningActivities = !showPlanningActivities;
    localStorage.setItem(SHOW_ACTIVITIES_STORAGE_KEY, String(showPlanningActivities));
    updatePlanningDetailsToggles();
    renderPlanning();
});
togglePlanningMeetingsBtn.addEventListener("click", () => {
    showPlanningMeetings = !showPlanningMeetings;
    localStorage.setItem(SHOW_MEETINGS_STORAGE_KEY, String(showPlanningMeetings));
    updatePlanningDetailsToggles();
    renderPlanning();
});
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
    if (!canEditPlannings()) return;
    resetGroupModalState();
    document.getElementById("groupName").value = "";
    document.getElementById("groupYear").value = new Date().getFullYear();
    document.getElementById("groupTerm").value = "HT";
    document.getElementById("groupNote").value = "";
    groupModal.classList.remove("hidden");
    document.getElementById("groupName").focus();
});
document.getElementById("closeGroupModal").addEventListener("click", () => {
    groupModal.classList.add("hidden");
    resetGroupModalState();
});
groupModal.addEventListener("click", e => { if (e.target === groupModal) { groupModal.classList.add("hidden"); resetGroupModalState(); } });

document.getElementById("removeGroupBtn").addEventListener("click", () => {
    const editingGroupId = groupModal.dataset.editingGroupId;
    if (!editingGroupId) return;
    removeGroup(editingGroupId);
    groupModal.classList.add("hidden");
    resetGroupModalState();
});

document.getElementById("copyGroupBtn").addEventListener("click", () => {
    const editingGroupId = groupModal.dataset.editingGroupId;
    if (!editingGroupId) return;
    copyGroup(editingGroupId);
    groupModal.classList.add("hidden");
    resetGroupModalState();
});

const changeOwnerBtn = document.getElementById("changeOwnerBtn");
const changeOwnerSection = document.getElementById("changeOwnerSection");
const newOwnerSelect = document.getElementById("newOwnerSelect");
const cancelChangeOwnerBtn = document.getElementById("cancelChangeOwnerBtn");
const confirmChangeOwnerBtn = document.getElementById("confirmChangeOwnerBtn");

changeOwnerBtn?.addEventListener("click", async () => {
    const auth = window.GTScoutAuth;
    if (!auth?.isAdmin?.()) return;

    const editingGroupId = groupModal.dataset.editingGroupId;
    if (!editingGroupId) return;
    const group = groups.find(g => g.id === editingGroupId);
    if (!group) return;

    changeOwnerBtn.disabled = true;
    changeOwnerBtn.textContent = "Hämtar...";

    const leaders = await fetchKarLeadersAndAdmins();
    changeOwnerBtn.disabled = false;
    changeOwnerBtn.textContent = "Byt ägare...";

    if (!leaders.length) {
        alert("Inga ledare eller administratörer hittades för kåren.");
        return;
    }

    newOwnerSelect.innerHTML = leaders.map(l => {
        const displayName = l.full_name ? `${l.full_name} (${l.email})` : l.email;
        const roleLabel = l.role === "admin" ? " [Admin]" : " [Ledare]";
        const isCurrent = group.created_by === l.id;
        return `<option value="${escapeHtml(l.id)}" data-name="${escapeHtml(l.full_name || l.email)}" ${isCurrent ? "selected" : ""}>${escapeHtml(displayName + roleLabel)}</option>`;
    }).join("");

    changeOwnerSection.classList.remove("hidden");
});

cancelChangeOwnerBtn?.addEventListener("click", () => {
    changeOwnerSection.classList.add("hidden");
});

confirmChangeOwnerBtn?.addEventListener("click", () => {
    const auth = window.GTScoutAuth;
    if (!auth?.isAdmin?.()) return;

    const editingGroupId = groupModal.dataset.editingGroupId;
    if (!editingGroupId) return;
    const group = groups.find(g => g.id === editingGroupId);
    if (!group) return;

    const selectedOption = newOwnerSelect.options[newOwnerSelect.selectedIndex];
    if (!selectedOption) return;

    const newOwnerId = selectedOption.value;
    const newOwnerName = selectedOption.getAttribute("data-name") || selectedOption.textContent;

    group.created_by = newOwnerId;
    group.created_by_name = newOwnerName;
    group.updated_by_name = getPlanningUpdaterName();
    group.updated_at = new Date().toISOString();

    const ownerInfo = document.getElementById("planningOwnerInfo");
    if (ownerInfo) {
        ownerInfo.textContent = `Ägs av: ${getPlanningOwnerLabel(group)}`;
    }

    const removeButton = document.getElementById("removeGroupBtn");
    const canDelete = canDeleteGroup(group);
    removeButton.disabled = !canDelete;
    removeButton.setAttribute("aria-disabled", String(!canDelete));

    changeOwnerSection.classList.add("hidden");
    saveGroups();
    renderPlanning();
});

document.getElementById("saveGroupBtn").addEventListener("click", () => {
    const name = document.getElementById("groupName").value.trim();
    const yearValue = document.getElementById("groupYear").value.trim();
    const termValue = normalizePlanningTerm(document.getElementById("groupTerm").value);
    const noteValue = document.getElementById("groupNote").value.trim();
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
        if (!group || !canEditGroup(group)) return;
        group.name = resolvedName;
        group.level = level;
        const parsedYear = Number.parseInt(yearValue, 10);
        group.year = Number.isFinite(parsedYear) ? parsedYear : "";
        group.term = termValue;
        group.note = noteValue;
        group.updated_by_name = getPlanningUpdaterName();
        group.updated_at = new Date().toISOString();
        saveGroups();
        renderPlanning();
    } else {
        addGroup(resolvedName, level, yearValue, termValue, noteValue);
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

defaultPlanningYearCount?.addEventListener("keydown", e => {
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
    if (!group || !canEditGroup(group)) return;
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
    popup.style.zIndex = "1300";
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
        .filter(marke => getBadgeActivityIds(marke).includes(activity.id));
    const linkedBadgeNames = linkedBadges.map(marke => marke.namn).join(", ");
    const material = Array.isArray(activity.material) ? activity.material : [];
    activityDetailPopup.querySelector(".activity-popup-body").innerHTML = `
        ${activity.kategori ? `<p class="activity-popup-category">${activity.kategori}</p>` : ""}
        <h2>${activity.namn}</h2>
        ${activity.beskrivning ? `<p>${renderLinkedText(activity.beskrivning)}</p>` : ""}
        <p><strong>Kår:</strong> ${escapeHtml(getActivityOwnerLabel(activity))}</p>
        ${formatActivityTime(activity) ? `<p><strong>Tid:</strong> ${formatActivityTime(activity)}</p>` : ""}
        ${material.length > 0 ? `<div><strong>Material:</strong><ul>${material.map(item => `<li>${item}</li>`).join("")}</ul></div>` : ""}
        ${activity.genomforande ? `<div><strong>Genomförande:</strong><p>${renderLinkedText(activity.genomforande)}</p></div>` : ""}
        ${linkedBadges.length > 0 ? `
            <div class="activity-linked-badges">
                <p><strong>Kopplad till märken:</strong> ${escapeHtml(linkedBadgeNames)}</p>
                <div class="activity-linked-badge-list" aria-label="Märken kopplade till aktiviteten">
                    ${linkedBadges.map(marke => `<img src="${escapeHtml(marke.bild)}" alt="${escapeHtml(marke.namn)}" title="${escapeHtml(marke.namn)}" class="activity-linked-badge-icon">`).join("")}
                </div>
            </div>
        ` : ""}
        ${canEditActivity(activity) || (window.GTScoutActivities?.canWrite?.() && !getActivityOwnershipMeta(activity).className.includes("mine")) ? `
            <div class="activity-popup-actions">
                ${canEditActivity(activity) ? `<button class="btn-secondary edit-standalone-activity" type="button">Redigera</button>
                ${canDeleteActivity(activity) ? '<button class="btn-danger delete-standalone-activity" type="button">Radera</button>' : ""}` : `<button class="btn-secondary copy-standalone-activity" type="button">Kopiera till min kår</button>`}
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
    const copyButton = activityDetailPopup.querySelector(".copy-standalone-activity");
    if (copyButton) {
        copyButton.addEventListener("click", () => {
            activityDetailPopup.classList.add("hidden");
            openStandaloneActivityCopy(activity);
        });
    }
    const deleteButton = activityDetailPopup.querySelector(".delete-standalone-activity");
    if (deleteButton) deleteButton.addEventListener("click", () => deleteStandaloneActivity(activity));
    activityDetailPopup.classList.remove("hidden");
}

function showBadgeDetail(marke, planningId = null) {
    const body = detailPopup.querySelector(".popup-body");
    const isCustomBadge = Boolean(marke.isCustom);
    const canAdministerBadge = Boolean(window.GTScoutBadges?.canEditBadge?.(marke));
    const disabledAdminAction = canAdministerBadge
        ? ""
        : ' disabled aria-disabled="true" title="Endast kårens administratör kan ändra kårmärket"';
    const iconMap = {
        "Familjescouting": "./images/icons/familjescout.png",
        "Sp\u00e5rare": "./images/icons/sparare.png",
        "Uppt\u00e4ckare": "./images/icons/upptackare.png",
        "\u00c4ventyrare": "./images/icons/aventyrare.png",
        "Utmanare": "./images/icons/utmanare.png",
        "Rover": "./images/icons/rover.png"
    };
    const targetGroups = formatTargetGroups(marke);
    const categoryIcons = getTargetGroups(marke)
        .map(targetGroup => ({ targetGroup, iconPath: iconMap[targetGroup] || "" }))
        .filter(item => item.iconPath);
    const criteriaList = marke.kriterier ? marke.kriterier.map(k => `<li>${k}</li>`).join("") : "";
    const badgeNote = getBadgeNote(marke.id);
    const badgePlannings = groups.filter(group =>
        Array.isArray(group.badges) && group.badges.includes(marke.id)
    );
    const planning = planningId ? groups.find(group => group.id === planningId) : null;
    const canEditPlanning = Boolean(planning && canEditGroup(planning));
    const allBadgeActivities = getBadgeActivityIds(marke)
        .map(activityId => allAktiviteter.find(activity => activity.id === activityId))
        .filter(Boolean);
    const activities = allBadgeActivities.filter(activity => isActivityVisibleForKarFilter(activity, planningBadgeActivityKarFilter));
    const selectedActivities = new Set(planning && Array.isArray(planning.activities) ? planning.activities : []);
    const activitySection = `
            <div class="detail-activities">
                <strong>Aktivitetsförslag:</strong>
                ${planning ? `<p>Välj aktiviteter för ${planning.name}.</p>` : ""}
                ${allBadgeActivities.length > 0 ? '<select class="badge-activity-kar-filter" aria-label="Filtrera aktiviteter efter kår"></select>' : ""}
                <div class="activity-list">
                    ${activities.length > 0 ? activities.map(activity => `
                        <label class="activity-item">
                            ${canEditPlanning ? `<input type="checkbox" class="planning-activity-selection" value="${activity.id}" ${selectedActivities.has(activity.id) ? "checked" : ""}>` : ""}
                            <span class="activity-item-name">${renderActivityOwnershipBadge(activity)}<strong>${activity.namn}</strong>${formatActivityTime(activity) ? `<small>${formatActivityTime(activity)}</small>` : ""}</span>
                            <button class="activity-info-button" type="button" data-activity-id="${activity.id}" aria-label="Visa detaljer för ${activity.namn}">i</button>
                        </label>
                    `).join("") : `<p>${allBadgeActivities.length > 0 ? "Inga aktiviteter matchar filtret." : "Inga aktiviteter tillagda."}</p>`}
                </div>
                ${canEditPlanning ? '<button id="addExistingActivityBtn" class="btn-secondary" type="button">Aktivitet</button>' : ""}
                ${canEditPlanning ? '<button id="saveBadgeActivitiesBtn" class="btn-primary" type="button">Uppdatera planering</button>' : ""}
            </div>
        `;
    body.innerHTML = `
        ${isCustomBadge ? '<span class="activity-owner-badge activity-owner-badge--mine badge-popup-owner-badge">Min kår</span>' : ""}
        <div class="detail-popup-top">
            <div class="detail-popup-main">
                <div class="detail-popup-header">
                    <h2>${marke.namn}</h2>
                </div>
                <div class="detail-image-row">
                    <img src="${marke.bild}" alt="${marke.namn}" class="detail-image">
                </div>
            </div>
            ${categoryIcons.length > 0 ? `
                <div class="detail-category-icons" aria-label="Målgrupper: ${targetGroups}">
                    ${categoryIcons.map(({ targetGroup, iconPath }) => `<img src="${iconPath}" alt="${targetGroup}" class="detail-category-icon">`).join("")}
                </div>
            ` : ""}
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
            ${isCustomBadge ? `<div class="detail-planning-actions"><div class="detail-admin-actions"><button id="editCustomBadgeBtn" class="btn-secondary" type="button"${disabledAdminAction}>Redigera märke</button><button id="deleteCustomBadgeBtn" class="btn-danger" type="button"${disabledAdminAction}>Ta bort märke</button></div></div>` : ""}
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
    const badgeActivityKarFilterSelect = body.querySelector(".badge-activity-kar-filter");
    if (badgeActivityKarFilterSelect) {
        populateActivityKarFilter(badgeActivityKarFilterSelect);
        badgeActivityKarFilterSelect.value = planningBadgeActivityKarFilter;
        badgeActivityKarFilterSelect.addEventListener("change", () => {
            planningBadgeActivityKarFilter = badgeActivityKarFilterSelect.value;
            showBadgeDetail(marke, planningId);
        });
    }
    body.querySelectorAll(".activity-info-button").forEach(button => {
        button.addEventListener("click", () => {
            const activity = allAktiviteter.find(item => item.id === button.dataset.activityId);
            if (activity) showActivityDetail(activity);
        });
    });
    const saveActivitiesButton = body.querySelector("#saveBadgeActivitiesBtn");
    const addExistingActivityButton = body.querySelector("#addExistingActivityBtn");
    body.querySelector("#editCustomBadgeBtn")?.addEventListener("click", () => {
        detailPopup.classList.add("hidden");
        window.GTScoutBadges.openEditDialog(marke);
    });
    body.querySelector("#deleteCustomBadgeBtn")?.addEventListener("click", async () => {
        if (!confirm(`Ta bort märket "${marke.namn}"? Märket tas bort från biblioteket men behålls i befintliga planeringar.`)) return;
        try {
            await window.GTScoutBadges.deleteBadge(marke);
            detailPopup.classList.add("hidden");
        } catch (error) {
            alert(error.message || "Märket kunde inte tas bort.");
        }
    });
    if (addExistingActivityButton) {
        addExistingActivityButton.addEventListener("click", () => {
            detailPopup.classList.add("hidden");
            openBadgeActivityLibraryPicker(marke, planning);
        });
    }
    if (saveActivitiesButton) {
        saveActivitiesButton.addEventListener("click", () => {
            const currentBadgeActivityIds = new Set(activities.map(activity => activity.id));
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
window.GTScoutAuth?.onChange(() => renderPlanning());

window.GTScoutActivities?.init({
    onChange: () => {
        allAktiviteter = window.GTScoutActivities.getAllActivities();
        renderPlanning();
        populatePickerFilters();
    }
});

window.GTScoutBadges?.init({
    getAvailableTypes: () => [...baseMarken, ...window.GTScoutBadges.getAllBadges()]
        .map(marke => marke.Typ || marke.typ)
        .filter(Boolean),
    getAvailableCategories: () => [...baseMarken, ...window.GTScoutBadges.getAllBadges()]
        .map(marke => marke.kategori)
        .filter(Boolean),
    onChange: () => {
        if (baseMarken.length === 0) return;
        allMarken = [...baseMarken, ...window.GTScoutBadges.getAllBadges()];
        renderPlanning();
        populatePickerFilters();
    }
});

window.GTScoutPlanningSync?.init({
    getGroups: () => groups,
    applyGroups: remoteGroups => {
        groups = normalizeGroupList(remoteGroups);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
        renderPlanning();
    }
});

window.GTScoutNotes?.init({
    onChange: () => renderPlanning()
});

