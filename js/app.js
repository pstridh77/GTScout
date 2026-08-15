const grid = document.getElementById("badgeGrid");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const targetGroupFilter = document.getElementById("targetGroupFilter");
const typeFilter = document.getElementById("typeFilter");
const programFilter = document.getElementById("programFilter");

let allMarken = [];
let allAktiviteter = [];
const PLANNING_STORAGE_KEY = "gtscout_planering";
const BADGE_NOTES_STORAGE_KEY = "gtscout_badge_notes";
const CUSTOM_ACTIVITIES_STORAGE_KEY = "gtscout_custom_activities";
const CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY = "gtscout_custom_badge_activities";
const filters = {
    search: "",
    category: "Alla",
    targetGroup: "Alla",
    type: "Alla",
    program: "Alla"
};

async function loadMarken() {
    try {
        const [markenResponse, aktiviteterResponse] = await Promise.all([
            fetch("data/marken.json"),
            fetch("data/aktiviteter.json")
        ]);
        if (!markenResponse.ok || !aktiviteterResponse.ok) {
            throw new Error("Datafiler kunde inte laddas");
        }

        const [marken, aktiviteter] = await Promise.all([
            markenResponse.json(),
            aktiviteterResponse.json()
        ]);
        allMarken = marken;
        allAktiviteter = [...aktiviteter, ...loadCustomActivities()];
        renderMarken(marken);
    } catch (error) {
        console.error("Failed to load marken.json", error);
        const details = document.getElementById("details");
        if (details) {
            details.innerHTML = "<p>Data kunde inte laddas. Kontrollera filen data/marken.json och kör sidan via en webserver.</p>";
        }
    }
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

function getActivitiesForBadge(marke) {
    const activityIds = getBadgeActivityIds(marke);
    return activityIds
        .map(activityId => allAktiviteter.find(activity => activity.id === activityId))
        .filter(Boolean);
}

function getBadgesForActivity(activityId) {
    return allMarken.filter(marke => getBadgeActivityIds(marke).includes(activityId));
}

function getPlanningActivities(planning) {
    return Array.isArray(planning.activities) ? planning.activities : [];
}

function getTargetGroup(marke) {
    const rawGroup = (marke.grupp || marke.malgrupp || marke.målgrupp || "Ingen målgrupp").toString().trim();
    const normalizedGroup = rawGroup.toLowerCase();
    const targetGroupMap = {
        "familjescouting": "Familjescouting",
        "familjescouter": "Familjescouting",
        "spårare": "Spårare",
        "upptäckare": "Upptäckare",
        "upptackare": "Upptäckare",
        "äventyrare": "Äventyrare",
        "aventyrare": "Äventyrare",
        "utmanare": "Utmanare",
        "rover": "Rover",
        "roverscouter": "Rover"
    };

    return targetGroupMap[normalizedGroup] || rawGroup || "Ingen målgrupp";
}

function loadPlannings() {
    try {
        const storedPlannings = JSON.parse(localStorage.getItem(PLANNING_STORAGE_KEY));
        return Array.isArray(storedPlannings) ? storedPlannings : [];
    } catch {
        return [];
    }
}

function getPlanningIconPath(level) {
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

function getBadgePlannings(badgeId) {
    return loadPlannings().filter(planning =>
        Array.isArray(planning.badges) && planning.badges.includes(badgeId)
    );
}

function loadBadgeNotes() {
    try {
        const storedNotes = JSON.parse(localStorage.getItem(BADGE_NOTES_STORAGE_KEY));
        return storedNotes && typeof storedNotes === "object" ? storedNotes : {};
    } catch {
        return {};
    }
}

function saveBadgeNote(badgeId, note) {
    const notes = loadBadgeNotes();
    if (note.trim()) {
        notes[badgeId] = note;
    } else {
        delete notes[badgeId];
    }
    localStorage.setItem(BADGE_NOTES_STORAGE_KEY, JSON.stringify(notes));
}

let activeNoteBadge = null;

function createNotePopup() {
    const notePopup = document.createElement("div");
    notePopup.id = "badgeNotePopup";
    notePopup.className = "detail-popup hidden";
    notePopup.innerHTML = `
        <div class="detail-popup-content badge-note-popup-content">
            <button class="close-popup" type="button" aria-label="Stäng">&times;</button>
            <h2>Info</h2>
            <textarea id="badgeNoteInput" rows="6" placeholder="Skriv egen information..."></textarea>
            <p id="badgeNoteStatus" class="detail-note-status" role="status"></p>
            <div class="modal-actions">
                <button id="saveBadgeNoteBtn" class="btn-primary" type="button">Spara information</button>
            </div>
        </div>
    `;
    notePopup.querySelector(".close-popup").addEventListener("click", () => notePopup.classList.add("hidden"));
    notePopup.addEventListener("click", event => {
        if (event.target === notePopup) notePopup.classList.add("hidden");
    });
    document.body.appendChild(notePopup);
    return notePopup;
}

const notePopup = createNotePopup();

function openNotePopup(marke) {
    activeNoteBadge = marke;
    notePopup.querySelector("#badgeNoteInput").value = loadBadgeNotes()[marke.id] || "";
    notePopup.querySelector("#badgeNoteStatus").textContent = "";
    notePopup.classList.remove("hidden");
    notePopup.querySelector("#badgeNoteInput").focus();
}

notePopup.querySelector("#saveBadgeNoteBtn").addEventListener("click", () => {
    const noteInput = notePopup.querySelector("#badgeNoteInput");
    saveBadgeNote(activeNoteBadge.id, noteInput.value);
    notePopup.classList.add("hidden");
    showPopup(activeNoteBadge);
});

function populateFilters(marken) {
    const categories = [...new Set(marken.map(marke => marke.kategori || "Övrigt"))].sort();
    const targetGroups = [...new Set(marken.map(getTargetGroup))];
    const targetGroupOrder = ["Familjescouting", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];
    const orderedTargetGroups = targetGroups.sort((a, b) => {
        const indexA = targetGroupOrder.indexOf(a);
        const indexB = targetGroupOrder.indexOf(b);

        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }

        if (indexA !== -1) {
            return -1;
        }

        if (indexB !== -1) {
            return 1;
        }

        return a.localeCompare(b, "sv");
    });

    categoryFilter.innerHTML = [
        '<option value="Alla">Alla kategorier</option>',
        ...categories.map(category => `<option value="${category}" ${filters.category === category ? "selected" : ""}>${category}</option>`)
    ].join("");

    targetGroupFilter.innerHTML = [
        '<option value="Alla">Alla målgrupper</option>',
        ...orderedTargetGroups.map(group => `<option value="${group}" ${filters.targetGroup === group ? "selected" : ""}>${group}</option>`)
    ].join("");

    const programs = [...new Set(marken.flatMap(marke => Array.isArray(marke.program) ? marke.program : [marke.program || "Båda"]))].sort((a, b) => a.localeCompare(b, "sv"));
    programFilter.innerHTML = [
        '<option value="Alla">Alla program</option>',
        ...programs.map(program => `<option value="${program}" ${filters.program === program ? "selected" : ""}>${program}</option>`)
    ].join("");

    const types = [...new Set(marken.map(marke => (marke.Typ || marke.typ || "Intressemärke").toString()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv"));
    typeFilter.innerHTML = [
        '<option value="Alla">Alla typer</option>',
        ...types.map(type => `<option value="${type}" ${filters.type === type ? "selected" : ""}>${type}</option>`)
    ].join("");
}

function getFilteredMarken() {
    const searchTerm = filters.search.trim().toLowerCase();

    return allMarken.filter(marke => {
        const matchesCategory = filters.category === "Alla" || (marke.kategori || "Övrigt") === filters.category;
        const matchesTargetGroup = filters.targetGroup === "Alla" || getTargetGroup(marke) === filters.targetGroup;
        const badgePrograms = Array.isArray(marke.program) ? marke.program : [marke.program || "Båda"];
        const matchesProgram = filters.program === "Alla" || badgePrograms.includes(filters.program);
        const markeType = (marke.Typ || marke.typ || "Intressemärke").toString();
        const matchesType = filters.type === "Alla" || markeType === filters.type;

        if (!searchTerm && filters.type === "Alla") {
            return matchesCategory && matchesTargetGroup && matchesProgram && matchesType;
        }

        const searchableText = [
            marke.namn,
            marke.kategori,
            marke.grupp,
            marke.malgrupp,
            marke.inledning,
            ...(marke.kriterier || [])
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        const matchesSearch = searchableText.includes(searchTerm);
        return matchesCategory && matchesTargetGroup && matchesProgram && matchesType && (searchTerm ? matchesSearch : true);
    });
}

function renderMarken(marken) {
    allMarken = marken;
    populateFilters(marken);

    const filteredMarken = getFilteredMarken();
    grid.innerHTML = "";

    if (filteredMarken.length === 0) {
        grid.innerHTML = '<p class="no-results">Inga märken matchar filtret.</p>';
        return;
    }

    const categories = filteredMarken.reduce((acc, marke) => {
        const key = marke.kategori || "Övrigt";
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(marke);
        return acc;
    }, {});

    const targetGroupOrder = ["Familjescouting", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];

    Object.keys(categories).forEach(category => {
        const categoryGroup = document.createElement("section");
        categoryGroup.className = "category-group";

        const heading = document.createElement("h2");
        heading.className = "category-heading";
        heading.textContent = category;
        categoryGroup.appendChild(heading);

        const badgeRow = document.createElement("div");
        badgeRow.className = "category-badges";

        const groupedByTargetGroup = categories[category].reduce((acc, marke) => {
            const targetGroup = getTargetGroup(marke);
            if (!acc[targetGroup]) {
                acc[targetGroup] = [];
            }
            acc[targetGroup].push(marke);
            return acc;
        }, {});

        targetGroupOrder.forEach(targetGroup => {
            const groupItems = groupedByTargetGroup[targetGroup] || [];
            if (groupItems.length === 0) {
                return;
            }

            const slot = document.createElement("div");
            slot.className = "target-group-slot";

            const cards = document.createElement("div");
            cards.className = "target-group-cards";

            groupItems.forEach(marke => {
                const card = document.createElement("div");
                card.className = "badge";
                const badgePlannings = getBadgePlannings(marke.id);
                const planningIcons = badgePlannings.map(planning => {
                    const iconPath = getPlanningIconPath(planning.level);
                    return iconPath
                        ? `<img src="${iconPath}" alt="${planning.level}" title="${planning.name}" class="badge-planning-icon">`
                        : "";
                }).join("");
                card.innerHTML = `
                    <img src="${marke.bild}" alt="${marke.namn}">
                    <h3>${marke.namn}</h3>
                    <p>${getTargetGroup(marke)}</p>
                    ${planningIcons ? `<div class="badge-planning-icons" title="Finns i: ${badgePlannings.map(planning => planning.name).join(", ")}">${planningIcons}</div>` : ""}
                `;
                card.addEventListener("click", () => showPopup(marke));
                cards.appendChild(card);
            });

            slot.appendChild(cards);
            badgeRow.appendChild(slot);
        });

        categoryGroup.appendChild(badgeRow);
        grid.appendChild(categoryGroup);
    });
}

function handleFilterChange() {
    filters.search = searchInput.value;
    filters.category = categoryFilter.value;
    filters.targetGroup = targetGroupFilter.value;
    filters.type = typeFilter.value;
    filters.program = programFilter.value;
    renderMarken(allMarken);
}

searchInput.addEventListener("input", handleFilterChange);
categoryFilter.addEventListener("change", handleFilterChange);
targetGroupFilter.addEventListener("change", handleFilterChange);
typeFilter.addEventListener("change", handleFilterChange);
programFilter.addEventListener("change", handleFilterChange);

loadMarken();

function createPopup() {
    const popup = document.createElement("div");
    popup.id = "detailPopup";
    popup.className = "detail-popup hidden";

    popup.innerHTML = `
        <div class="detail-popup-content">
            <button class="close-popup" type="button">&times;</button>
            <div class="popup-body"></div>
        </div>
    `;

    popup.querySelector(".close-popup").addEventListener("click", () => {
        popup.classList.add("hidden");
    });

    popup.addEventListener("click", (event) => {
        if (event.target === popup) {
            popup.classList.add("hidden");
        }
    });

    document.body.appendChild(popup);
    return popup;
}

const popup = createPopup();

let activePlanningBadge = null;

function createPlanningPickerPopup() {
    const picker = document.createElement("div");
    picker.className = "detail-popup hidden";
    picker.innerHTML = `
        <div class="detail-popup-content planning-picker-content">
            <button class="close-popup" type="button" aria-label="Stäng">&times;</button>
            <h2>Lägg märke i planering</h2>
            <label class="filter-field planning-picker-filter">
                <span>Målgrupp</span>
                <select class="planning-picker-target-filter" aria-label="Filtrera planeringar efter målgrupp"></select>
            </label>
            <div class="planning-picker-list"></div>
            <p class="detail-planning-status planning-picker-status" role="status"></p>
            <button class="btn-secondary planning-picker-create" type="button">Skapa ny planering</button>
        </div>
    `;
    picker.querySelector(".close-popup").addEventListener("click", () => picker.classList.add("hidden"));
    picker.addEventListener("click", event => {
        if (event.target === picker) picker.classList.add("hidden");
    });
    picker.querySelector(".planning-picker-create").addEventListener("click", () => createPlanningFromBadge(picker));
    document.body.appendChild(picker);
    return picker;
}

const planningPickerPopup = createPlanningPickerPopup();

function addBadgeToPlanning(planning, badge) {
    planning.badges = Array.isArray(planning.badges) ? planning.badges : [];
    if (planning.badges.includes(badge.id)) return false;
    planning.badges.push(badge.id);
    return true;
}

function openPlanningPicker(marke) {
    activePlanningBadge = marke;
    const plannings = loadPlannings();
    const list = planningPickerPopup.querySelector(".planning-picker-list");
    const targetFilter = planningPickerPopup.querySelector(".planning-picker-target-filter");
    const status = planningPickerPopup.querySelector(".planning-picker-status");
    status.textContent = "";
    const targetGroups = [...new Set(plannings.map(planning => planning.level).filter(Boolean))];
    const targetGroupOrder = ["Familjescouting", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];
    targetGroups.sort((a, b) => {
        const indexA = targetGroupOrder.indexOf(a);
        const indexB = targetGroupOrder.indexOf(b);
        return (indexA === -1 ? targetGroupOrder.length : indexA) - (indexB === -1 ? targetGroupOrder.length : indexB);
    });
    targetFilter.innerHTML = [
        '<option value="Alla">Alla målgrupper</option>',
        ...targetGroups.map(group => `<option value="${group}">${group}</option>`)
    ].join("");
    targetFilter.value = targetGroups.includes(getTargetGroup(marke)) ? getTargetGroup(marke) : "Alla";

    const renderPlanningOptions = () => {
        const selectedTargetGroup = targetFilter.value;
        const visiblePlannings = plannings.filter(planning =>
            selectedTargetGroup === "Alla" || planning.level === selectedTargetGroup
        );
        list.innerHTML = visiblePlannings.length > 0
            ? visiblePlannings.map(planning => `
                <button class="planning-picker-option" type="button" data-planning-id="${planning.id}">
                    ${planning.name} (${planning.level})
                </button>
            `).join("")
            : plannings.length > 0
                ? "<p>Inga planeringar finns i den valda målgruppen.</p>"
                : "<p>Det finns inga planeringar ännu.</p>";

        list.querySelectorAll(".planning-picker-option").forEach(button => {
            button.addEventListener("click", () => {
                const planning = plannings.find(item => item.id === button.dataset.planningId);
                if (!planning || !activePlanningBadge) return;
                if (addBadgeToPlanning(planning, activePlanningBadge)) {
                    localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(plannings));
                    renderMarken(allMarken);
                    status.textContent = `Märket lades till i ${planning.name}.`;
                } else {
                    status.textContent = `Märket finns redan i ${planning.name}.`;
                }
            });
        });
    };

    targetFilter.onchange = renderPlanningOptions;
    renderPlanningOptions();
    planningPickerPopup.classList.remove("hidden");
}

function createPlanningFromBadge(picker) {
    if (!activePlanningBadge) return;
    const name = prompt("Namn på den nya planeringen:");
    if (!name || !name.trim()) return;
    const level = getTargetGroup(activePlanningBadge);
    const plannings = loadPlannings();
    if (plannings.some(planning => planning.name === name.trim() && planning.level === level)) {
        alert("Det finns redan en planering med det namnet i samma målgrupp.");
        return;
    }
    plannings.push({
        id: crypto.randomUUID(),
        name: name.trim(),
        level,
        badges: [activePlanningBadge.id],
        activities: []
    });
    localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(plannings));
    renderMarken(allMarken);
    picker.querySelector(".planning-picker-status").textContent = `Märket lades till i ${name.trim()}.`;
}

function createActivityPopup() {
    const activityPopup = document.createElement("div");
    activityPopup.id = "activityPopup";
    activityPopup.className = "detail-popup hidden";
    activityPopup.innerHTML = `
        <div class="detail-popup-content activity-popup-content">
            <button class="close-popup" type="button" aria-label="Stäng">&times;</button>
            <div class="activity-popup-body"></div>
        </div>
    `;
    activityPopup.querySelector(".close-popup").addEventListener("click", () => activityPopup.classList.add("hidden"));
    activityPopup.addEventListener("click", event => {
        if (event.target === activityPopup) activityPopup.classList.add("hidden");
    });
    document.body.appendChild(activityPopup);
    return activityPopup;
}

const activityPopup = createActivityPopup();

let activeCustomActivityBadge = null;
let activeCustomActivityId = null;
let activeActivityBadge = null;

function createCustomActivityPopup() {
    const popup = document.createElement("div");
    popup.className = "detail-popup hidden";
    popup.innerHTML = `
        <div class="detail-popup-content custom-activity-popup-content">
            <button class="close-popup" type="button" aria-label="Stäng">&times;</button>
            <h2 class="custom-activity-title">Skapa egen aktivitet</h2>
            <label class="modal-field"><span>Namn</span><input class="custom-activity-name" type="text" required></label>
            <label class="modal-field"><span>Beskrivning</span><textarea class="custom-activity-description" rows="3"></textarea></label>
            <label class="modal-field"><span>Tid i minuter</span><input class="custom-activity-time" type="number" min="0" step="5"></label>
            <label class="modal-field"><span>Material, ett per rad</span><textarea class="custom-activity-material" rows="3"></textarea></label>
            <label class="modal-field"><span>Genomförande</span><textarea class="custom-activity-instructions" rows="4"></textarea></label>
            <p class="custom-activity-status detail-planning-status" role="status"></p>
            <div class="modal-actions"><button class="btn-primary save-custom-activity" type="button">Spara aktivitet</button></div>
        </div>
    `;
    popup.querySelector(".close-popup").addEventListener("click", () => popup.classList.add("hidden"));
    popup.addEventListener("click", event => {
        if (event.target === popup) popup.classList.add("hidden");
    });
    popup.querySelector(".save-custom-activity").addEventListener("click", () => saveCustomActivity(popup));
    document.body.appendChild(popup);
    return popup;
}

const customActivityPopup = createCustomActivityPopup();

function openCustomActivityPopup(marke, activity = null) {
    activeCustomActivityBadge = marke;
    activeCustomActivityId = activity ? activity.id : null;
    customActivityPopup.querySelector(".custom-activity-title").textContent = activity ? "Redigera aktivitet" : "Skapa egen aktivitet";
    customActivityPopup.querySelector(".save-custom-activity").textContent = activity ? "Spara ändringar" : "Spara aktivitet";
    customActivityPopup.querySelector(".custom-activity-name").value = activity?.namn || "";
    customActivityPopup.querySelector(".custom-activity-description").value = activity?.beskrivning || "";
    customActivityPopup.querySelector(".custom-activity-time").value = activity?.tid || "";
    customActivityPopup.querySelector(".custom-activity-material").value = Array.isArray(activity?.material) ? activity.material.join("\n") : "";
    customActivityPopup.querySelector(".custom-activity-instructions").value = activity?.genomforande || "";
    customActivityPopup.querySelector(".custom-activity-status").textContent = "";
    customActivityPopup.classList.remove("hidden");
    customActivityPopup.querySelector(".custom-activity-name").focus();
}

function saveCustomActivity(popup) {
    const nameInput = popup.querySelector(".custom-activity-name");
    const name = nameInput.value.trim();
    if (!name || !activeCustomActivityBadge) {
        nameInput.focus();
        return;
    }
    const activity = {
        id: activeCustomActivityId || `egen-${crypto.randomUUID()}`,
        namn: name,
        beskrivning: popup.querySelector(".custom-activity-description").value.trim(),
        tid: Number(popup.querySelector(".custom-activity-time").value) || 0,
        material: popup.querySelector(".custom-activity-material").value
            .split(/\r?\n/)
            .map(item => item.trim())
            .filter(Boolean),
        genomforande: popup.querySelector(".custom-activity-instructions").value.trim()
    };
    const activities = loadCustomActivities();
    const existingIndex = activities.findIndex(item => item.id === activity.id);
    if (existingIndex === -1) {
        activities.push(activity);
    } else {
        activities[existingIndex] = activity;
    }
    localStorage.setItem(CUSTOM_ACTIVITIES_STORAGE_KEY, JSON.stringify(activities));
    if (!activeCustomActivityId) {
        const links = loadCustomBadgeActivities();
        links[activeCustomActivityBadge.id] = Array.isArray(links[activeCustomActivityBadge.id])
            ? links[activeCustomActivityBadge.id]
            : [];
        if (!links[activeCustomActivityBadge.id].includes(activity.id)) {
            links[activeCustomActivityBadge.id].push(activity.id);
        }
        localStorage.setItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY, JSON.stringify(links));
    }
    const activityIndex = allAktiviteter.findIndex(item => item.id === activity.id);
    if (activityIndex === -1) allAktiviteter.push(activity);
    else allAktiviteter[activityIndex] = activity;
    popup.classList.add("hidden");
    showPopup(activeCustomActivityBadge);
}

function showActivityPopup(activity) {
    const linkedBadges = getBadgesForActivity(activity.id).map(marke => marke.namn).join(", ");
    const material = Array.isArray(activity.material) ? activity.material : [];
    activityPopup.querySelector(".activity-popup-body").innerHTML = `
        <h2>${activity.namn}</h2>
        ${activity.beskrivning ? `<p>${activity.beskrivning}</p>` : ""}
        ${activity.tid ? `<p><strong>Tid:</strong> ${activity.tid} minuter</p>` : ""}
        ${material.length > 0 ? `<div><strong>Material:</strong><ul>${material.map(item => `<li>${item}</li>`).join("")}</ul></div>` : ""}
        ${activity.genomforande ? `<div><strong>Genomförande:</strong><p>${activity.genomforande}</p></div>` : ""}
        ${linkedBadges ? `<p><strong>Kopplad till märken:</strong> ${linkedBadges}</p>` : ""}
        ${activity.id.startsWith("egen-") ? `
            <div class="activity-popup-actions">
                <button class="btn-secondary edit-custom-activity" type="button">Redigera</button>
                <button class="btn-danger delete-custom-activity" type="button">Radera</button>
            </div>
        ` : ""}
    `;
    const editButton = activityPopup.querySelector(".edit-custom-activity");
    if (editButton) {
        editButton.addEventListener("click", () => {
            const badge = getBadgesForActivity(activity.id)[0];
            if (badge) {
                activityPopup.classList.add("hidden");
                openCustomActivityPopup(badge, activity);
            }
        });
    }
    const deleteButton = activityPopup.querySelector(".delete-custom-activity");
    if (deleteButton) deleteButton.addEventListener("click", () => deleteCustomActivity(activity));
    activityPopup.classList.remove("hidden");
}

function deleteCustomActivity(activity) {
    if (!confirm(`Radera aktiviteten "${activity.namn}"?`)) return;
    const activities = loadCustomActivities().filter(item => item.id !== activity.id);
    localStorage.setItem(CUSTOM_ACTIVITIES_STORAGE_KEY, JSON.stringify(activities));
    const links = loadCustomBadgeActivities();
    Object.keys(links).forEach(badgeId => {
        links[badgeId] = Array.isArray(links[badgeId])
            ? links[badgeId].filter(activityId => activityId !== activity.id)
            : [];
    });
    localStorage.setItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY, JSON.stringify(links));
    const plannings = loadPlannings().map(planning => ({
        ...planning,
        activities: Array.isArray(planning.activities)
            ? planning.activities.filter(activityId => activityId !== activity.id)
            : []
    }));
    localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(plannings));
    allAktiviteter = allAktiviteter.filter(item => item.id !== activity.id);
    activityPopup.classList.add("hidden");
    renderMarken(allMarken);
    if (activeActivityBadge) showPopup(activeActivityBadge);
}

function getCategoryIconPath(marke) {
    const targetGroup = getTargetGroup(marke);
    const normalizedTargetGroup = targetGroup.toLowerCase();
    const iconMap = {
        "familjescouting": "./images/icons/familjescout.png",
        "spårare": "./images/icons/sparare.png",
        "upptäckare": "./images/icons/upptackare.png",
        "äventyrare": "./images/icons/aventyrare.png",
        "utmanare": "./images/icons/utmanare.png",
        "rover": "./images/icons/rover.png"
    };

    return iconMap[normalizedTargetGroup] || "";
}

function showPopup(marke) {
    const body = popup.querySelector(".popup-body");
    const criteriaList = marke.kriterier
        ? marke.kriterier.map(k => `<li>${k}</li>`).join("")
        : "";
    const categoryIcon = getCategoryIconPath(marke);
    const targetGroup = getTargetGroup(marke);
    const badgePlannings = getBadgePlannings(marke.id);
    const badgeNote = loadBadgeNotes()[marke.id] || "";
    const badgeActivities = getActivitiesForBadge(marke);
    const activitySection = `
        <div class="detail-activities">
            <strong>Aktivitetsförslag:</strong>
            <div class="activity-list">
                ${badgeActivities.length > 0
                    ? badgeActivities.map(activity => `
                        <div class="activity-item">
                            <span class="activity-item-name"><strong>${activity.namn}</strong>${activity.tid ? `<small>${activity.tid} min</small>` : ""}</span>
                            <button class="activity-info-button" type="button" data-activity-id="${activity.id}" aria-label="Visa detaljer för ${activity.namn}">i</button>
                        </div>
                    `).join("")
                    : "<p>Inga aktiviteter kopplade ännu.</p>"}
            </div>
            <button id="createCustomActivityBtn" class="btn-secondary" type="button">Skapa egen aktivitet</button>
        </div>
    `;
    const planningStatus = badgePlannings.length > 0
        ? `
            <div class="detail-planning-status detail-planning-status--active">
                <strong>Finns i planering:</strong>
                <div class="detail-planning-list">
                    ${badgePlannings.map(planning => {
                        const iconPath = getPlanningIconPath(planning.level);
                        return `
                            <span class="detail-planning-item">
                                ${iconPath ? `<img src="${iconPath}" alt="${planning.level}">` : ""}
                                <span>${planning.name}</span>
                            </span>
                        `;
                    }).join("")}
                </div>
            </div>
        `
        : "";

    body.innerHTML = `
        <div class="detail-popup-header">
            <h2>${marke.namn}</h2>
            ${categoryIcon ? `<img src="${categoryIcon}" alt="${targetGroup}" class="detail-category-icon">` : ""}
        </div>
        <div class="detail-image-row">
            <img
                src="${marke.bild}"
                alt="${marke.namn}"
                class="detail-image">
        </div>

        <div class="detail-text">
            <div class="detail-category-row">
                <p><strong>Kategori:</strong> ${marke.kategori}</p>
            </div>
            ${marke.inledning ? `<p class="detail-introduction">${marke.inledning}</p>` : ""}
            
            ${criteriaList ? `
                <div class="detail-criteria">
                    <strong>Kriterier:</strong>
                    <ul>${criteriaList}</ul>
                </div>
            ` : ""}
            ${activitySection}
            <p><strong>Målgrupp:</strong> ${targetGroup}</p>
            <p><strong>Program:</strong> ${(Array.isArray(marke.program) ? marke.program : [marke.program || "Båda"]).join(", ")}</p>
            ${planningStatus}
            ${badgeNote ? `
                <div class="detail-note">
                    <strong>Info:</strong>
                    <p id="badgeNoteDisplay" class="detail-note-display"></p>
                </div>
            ` : ""}
            <button id="editBadgeNoteBtn" class="btn-secondary detail-note-button" type="button">
                ${badgeNote ? "Redigera info" : "Lägg till info"}
            </button>
            <div class="detail-planning-actions">
                <button id="addBadgeToPlanningBtn" class="btn-primary" type="button">Lägg till i planering</button>
            </div>
        </div>
    `;
    if (badgeNote) popup.querySelector("#badgeNoteDisplay").textContent = badgeNote;
    popup.querySelector("#editBadgeNoteBtn").addEventListener("click", () => openNotePopup(marke));
    popup.querySelector("#createCustomActivityBtn").addEventListener("click", () => openCustomActivityPopup(marke));
    popup.querySelector("#addBadgeToPlanningBtn").addEventListener("click", () => openPlanningPicker(marke));
    popup.querySelectorAll(".activity-info-button").forEach(button => {
        button.addEventListener("click", () => {
            const activity = allAktiviteter.find(item => item.id === button.dataset.activityId);
            if (activity) {
                activeActivityBadge = marke;
                showActivityPopup(activity);
            }
        });
    });
    popup.classList.remove("hidden");
}

