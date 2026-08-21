const grid = document.getElementById("badgeGrid");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const targetGroupFilter = document.getElementById("targetGroupFilter");
const typeFilter = document.getElementById("typeFilter");
const programFilter = document.getElementById("programFilter");

const siteMenuBtn = document.getElementById("siteMenuBtn");
const siteMenuDropdown = document.getElementById("siteMenuDropdown");
if (siteMenuBtn && siteMenuDropdown) {
    siteMenuBtn.addEventListener("click", event => {
        event.stopPropagation();
        const isOpen = !siteMenuDropdown.classList.contains("hidden");
        siteMenuDropdown.classList.toggle("hidden", isOpen);
        siteMenuBtn.setAttribute("aria-expanded", String(!isOpen));
    });
    document.addEventListener("click", event => {
        if (!siteMenuDropdown.contains(event.target) && event.target !== siteMenuBtn) {
            siteMenuDropdown.classList.add("hidden");
            siteMenuBtn.setAttribute("aria-expanded", "false");
        }
    });
}

let allMarken = [];
let allAktiviteter = [];
let activePopupBadge = null;
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

function getActivitiesForBadge(marke) {
    const activityIds = getBadgeActivityIds(marke);
    return activityIds
        .map(activityId => allAktiviteter.find(activity => activity.id === activityId))
        .filter(Boolean);
}

function getBadgesForActivity(activityId) {
    return allMarken.filter(marke => getBadgeActivityIds(marke).includes(activityId));
}

function normalizeTargetGroup(group) {
    const rawGroup = String(group ?? "").trim();
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

    return targetGroupMap[normalizedGroup] || rawGroup;
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
            <h2>Anteckning</h2>
            <textarea id="badgeNoteInput" rows="6" placeholder="Skriv en anteckning..."></textarea>
            <p id="badgeNoteStatus" class="detail-note-status" role="status"></p>
            <div class="modal-actions">
                <button id="saveBadgeNoteBtn" class="btn-primary" type="button">Spara anteckning</button>
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
    const targetGroups = [...new Set(marken.flatMap(getTargetGroups))];
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
        const matchesTargetGroup = filters.targetGroup === "Alla" || getTargetGroups(marke).includes(filters.targetGroup);
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
            const targetGroup = filters.targetGroup !== "Alla" && getTargetGroups(marke).includes(filters.targetGroup)
                ? filters.targetGroup
                : getPrimaryTargetGroup(marke);
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
                    <p>${formatTargetGroups(marke)}</p>
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

let activeActivityPickerBadge = null;

function createActivityPickerPopup() {
    const picker = document.createElement("div");
    picker.className = "detail-popup hidden";
    picker.innerHTML = `
        <div class="detail-popup-content activity-picker-content">
            <button class="close-popup" type="button" aria-label="Stäng">&times;</button>
            <h2>Välj aktiviteter</h2>
            <div class="picker-filters">
                <input type="search" class="activity-picker-search picker-search-input" placeholder="Sök aktivitet...">
                <select class="activity-picker-category" aria-label="Filtrera aktiviteter efter kategori"></select>
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
    picker.querySelector(".activity-picker-search").addEventListener("input", () => renderActivityPickerList(picker));
    picker.querySelector(".activity-picker-category").addEventListener("change", () => renderActivityPickerList(picker));
    picker.querySelector(".activity-picker-create").addEventListener("click", () => {
        if (!activeActivityPickerBadge) return;
        picker.classList.add("hidden");
        openCustomActivityPopup(activeActivityPickerBadge);
    });
    picker.querySelector(".activity-picker-save").addEventListener("click", () => {
        if (!activeActivityPickerBadge) return;
        const searchTerm = picker.querySelector(".activity-picker-search").value.trim().toLowerCase();
        const selectedCategory = picker.querySelector(".activity-picker-category").value || "Alla";
        const staticActivityIds = new Set(Array.isArray(activeActivityPickerBadge.aktiviteter) ? activeActivityPickerBadge.aktiviteter : []);
        const visibleActivityIds = new Set(allAktiviteter
            .filter(activity => selectedCategory === "Alla" || activity.kategori === selectedCategory)
            .filter(activity => !searchTerm || `${activity.namn} ${activity.kategori || ""}`.toLowerCase().includes(searchTerm))
            .map(activity => activity.id));
        const checkedIds = new Set([...picker.querySelectorAll(".activity-picker-list input:checked")].map(input => input.value));
        visibleActivityIds.forEach(activityId => {
            if (staticActivityIds.has(activityId)) return;
            if (checkedIds.has(activityId)) addActivityToBadge(activeActivityPickerBadge, activityId);
            else removeActivityFromBadge(activeActivityPickerBadge, activityId);
        });
        picker.classList.add("hidden");
        showPopup(activeActivityPickerBadge);
    });
    document.body.appendChild(picker);
    return picker;
}

const activityPickerPopup = createActivityPickerPopup();

function addActivityToBadge(marke, activityId) {
    const links = loadCustomBadgeActivities();
    links[marke.id] = Array.isArray(links[marke.id]) ? links[marke.id] : [];
    if (getBadgeActivityIds(marke).includes(activityId)) return false;
    links[marke.id].push(activityId);
    localStorage.setItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY, JSON.stringify(links));
    return true;
}

function removeActivityFromBadge(marke, activityId) {
    const links = loadCustomBadgeActivities();
    if (!Array.isArray(links[marke.id])) return false;
    const index = links[marke.id].indexOf(activityId);
    if (index === -1) return false;
    links[marke.id].splice(index, 1);
    localStorage.setItem(CUSTOM_BADGE_ACTIVITIES_STORAGE_KEY, JSON.stringify(links));
    return true;
}

function populateActivityPickerCategories(picker) {
    const categorySelect = picker.querySelector(".activity-picker-category");
    const previousValue = categorySelect.value || "Alla";
    const categories = [...new Set(allAktiviteter.map(activity => activity.kategori).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "sv"));
    categorySelect.innerHTML = [
        '<option value="Alla">Alla kategorier</option>',
        ...categories.map(category => `<option value="${category}">${category}</option>`)
    ].join("");
    categorySelect.value = categories.includes(previousValue) ? previousValue : "Alla";
}

function renderActivityPickerList(picker) {
    if (!activeActivityPickerBadge) return;
    const searchTerm = picker.querySelector(".activity-picker-search").value.trim().toLowerCase();
    const selectedCategory = picker.querySelector(".activity-picker-category").value || "Alla";
    const staticActivityIds = new Set(Array.isArray(activeActivityPickerBadge.aktiviteter) ? activeActivityPickerBadge.aktiviteter : []);
    const linkedActivityIds = new Set(getBadgeActivityIds(activeActivityPickerBadge));
    const list = picker.querySelector(".activity-picker-list");
    const visibleActivities = allAktiviteter
        .filter(activity => selectedCategory === "Alla" || activity.kategori === selectedCategory)
        .filter(activity => !searchTerm || `${activity.namn} ${activity.kategori || ""}`.toLowerCase().includes(searchTerm))
        .sort((a, b) => (a.kategori || "").localeCompare(b.kategori || "", "sv") || a.namn.localeCompare(b.namn, "sv"));
    list.innerHTML = visibleActivities.length > 0
        ? visibleActivities.map(activity => {
            const isStatic = staticActivityIds.has(activity.id);
            const isChecked = linkedActivityIds.has(activity.id);
            return `
            <label class="activity-picker-item">
                <input type="checkbox" value="${activity.id}" ${isChecked ? "checked" : ""} ${isStatic ? "disabled" : ""}>
                <span>${activity.kategori ? `<small class="activity-picker-category">${activity.kategori}</small>` : ""}<strong>${activity.namn}</strong>${formatActivityTime(activity) ? `<small>${formatActivityTime(activity)}</small>` : ""}${isStatic ? `<small>Fast kopplad</small>` : ""}</span>
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
            if (activity) showActivityPopup(activity);
        });
    });
}

function openActivityPicker(marke) {
    activeActivityPickerBadge = marke;
    activityPickerPopup.querySelector(".activity-picker-search").value = "";
    activityPickerPopup.querySelector(".activity-picker-status").textContent = "";
    populateActivityPickerCategories(activityPickerPopup);
    renderActivityPickerList(activityPickerPopup);
    activityPickerPopup.classList.remove("hidden");
}

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
    targetFilter.value = targetGroups.find(group => getTargetGroups(marke).includes(group)) || "Alla";

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
    const badgeTargetGroups = getTargetGroups(activePlanningBadge);
    let level = badgeTargetGroups[0] || "Ingen målgrupp";
    if (badgeTargetGroups.length > 1) {
        const selectedLevel = prompt(`Välj målgrupp (${badgeTargetGroups.join(", ")}):`, level);
        if (selectedLevel === null) return;
        if (!badgeTargetGroups.includes(selectedLevel.trim())) {
            alert("Välj en av märkets målgrupper.");
            return;
        }
        level = selectedLevel.trim();
    }
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
            <label class="modal-field"><span>Kategori</span><input class="custom-activity-category" type="text" list="customActivityCategories" placeholder="Välj eller skriv en kategori"></label>
            <datalist id="customActivityCategories"></datalist>
            <label class="modal-field"><span>Namn</span><input class="custom-activity-name" type="text" required></label>
            <label class="modal-field"><span>Beskrivning</span><textarea class="custom-activity-description" rows="3"></textarea></label>
            <label class="modal-field"><span>Tid</span><input class="custom-activity-time" type="text" placeholder="t.ex. 20 minuter eller en kväll"></label>
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
    const categories = [...new Set([
        ...allMarken.map(item => item.kategori),
        ...allAktiviteter.map(item => item.kategori)
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv"));
    customActivityPopup.querySelector("#customActivityCategories").innerHTML = categories
        .map(category => `<option value="${category}"></option>`)
        .join("");
    customActivityPopup.querySelector(".custom-activity-title").textContent = activity ? "Redigera aktivitet" : "Skapa egen aktivitet";
    customActivityPopup.querySelector(".save-custom-activity").textContent = activity ? "Spara ändringar" : "Spara aktivitet";
    customActivityPopup.querySelector(".custom-activity-name").value = activity?.namn || "";
    customActivityPopup.querySelector(".custom-activity-description").value = activity?.beskrivning || "";
    customActivityPopup.querySelector(".custom-activity-category").value = activity?.kategori || marke?.kategori || "";
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
    if (!name) {
        nameInput.focus();
        return;
    }
    const existingActivity = loadCustomActivities().find(item => item.id === activeCustomActivityId);
    const category = popup.querySelector(".custom-activity-category").value.trim();
    const activity = {
        id: activeCustomActivityId || `egen-${crypto.randomUUID()}`,
        namn: name,
        kategori: category || existingActivity?.kategori || activeCustomActivityBadge?.kategori || "Övrigt",
        beskrivning: popup.querySelector(".custom-activity-description").value.trim(),
        tid: popup.querySelector(".custom-activity-time").value.trim(),
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
    if (!activeCustomActivityId && activeCustomActivityBadge) {
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
    if (activeCustomActivityBadge) showPopup(activeCustomActivityBadge);
}

function showActivityPopup(activity) {
    const linkedBadges = getBadgesForActivity(activity.id).map(marke => marke.namn).join(", ");
    const material = Array.isArray(activity.material) ? activity.material : [];
    activityPopup.querySelector(".activity-popup-body").innerHTML = `
        ${activity.kategori ? `<p class="activity-popup-category">${activity.kategori}</p>` : ""}
        <h2>${activity.namn}</h2>
        ${activity.beskrivning ? `<p>${renderLinkedText(activity.beskrivning)}</p>` : ""}
        ${formatActivityTime(activity) ? `<p><strong>Tid:</strong> ${formatActivityTime(activity)}</p>` : ""}
        ${material.length > 0 ? `<div><strong>Material:</strong><ul>${material.map(item => `<li>${item}</li>`).join("")}</ul></div>` : ""}
        ${activity.genomforande ? `<div><strong>Genomförande:</strong><p>${renderLinkedText(activity.genomforande)}</p></div>` : ""}
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
    const targetGroup = getPrimaryTargetGroup(marke);
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
    activePopupBadge = marke;
    const body = popup.querySelector(".popup-body");
    const formatCriterion = value => String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
    const criteriaList = marke.kriterier
        ? marke.kriterier.map(k => `<li>${formatCriterion(k)}</li>`).join("")
        : "";
    const categoryIcon = getCategoryIconPath(marke);
    const targetGroups = formatTargetGroups(marke);
    const badgePlannings = getBadgePlannings(marke.id);
    const badgeNote = loadBadgeNotes()[marke.id] || "";
    const activities = getActivitiesForBadge(marke);
    const staticActivityIds = new Set(Array.isArray(marke.aktiviteter) ? marke.aktiviteter : []);
    const activitySection = `
        <div class="detail-activities">
            <strong>Aktiviteter:</strong>
            <div class="activity-list">
                ${activities.length > 0
                    ? activities.map(activity => `
                        <div class="activity-item">
                                <span class="activity-item-name"><strong>${activity.namn}</strong>${formatActivityTime(activity) ? `<small>${formatActivityTime(activity)}</small>` : ""}</span>
                            <button class="activity-info-button" type="button" data-activity-id="${activity.id}" aria-label="Visa detaljer för ${activity.namn}">i</button>
                            ${!staticActivityIds.has(activity.id) ? `<button class="remove-activity-btn" type="button" data-activity-id="${activity.id}" title="Ta bort ${activity.namn}" aria-label="Ta bort ${activity.namn}">&times;</button>` : ""}
                        </div>
                    `).join("")
                    : "<p>Inga aktiviteter kopplade ännu.</p>"}
            </div>
            <button id="addExistingActivityBtn" class="btn-secondary" type="button">Aktivitet</button>
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
            ${categoryIcon ? `<img src="${categoryIcon}" alt="${targetGroups}" class="detail-category-icon">` : ""}
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
            ${marke.inledning ? `<p class="detail-introduction">${formatCriterion(marke.inledning)}</p>` : ""}
            
            ${criteriaList ? `
                <div class="detail-criteria">
                    <strong>Kriterier:</strong>
                    <ul>${criteriaList}</ul>
                </div>
            ` : ""}
            ${activitySection}
            <p><strong>Målgrupp:</strong> ${targetGroups}</p>
            <p><strong>Program:</strong> ${(Array.isArray(marke.program) ? marke.program : [marke.program || "Båda"]).join(", ")}</p>
            ${planningStatus}
            ${badgeNote ? `
                <div class="detail-note">
                    <strong>Anteckning:</strong>
                    <p id="badgeNoteDisplay" class="detail-note-display"></p>
                </div>
            ` : ""}
            <button id="editBadgeNoteBtn" class="btn-secondary detail-note-button" type="button">
                ${badgeNote ? "Redigera anteckning" : "Lägg till anteckning"}
            </button>
            <div class="detail-planning-actions">
                <button id="addBadgeToPlanningBtn" class="btn-primary" type="button">Lägg till i planering</button>
            </div>
        </div>
    `;
    if (badgeNote) popup.querySelector("#badgeNoteDisplay").innerHTML = renderLinkedText(badgeNote);
    popup.querySelector("#editBadgeNoteBtn").addEventListener("click", () => openNotePopup(marke));
    popup.querySelector("#addExistingActivityBtn").addEventListener("click", () => openActivityPicker(marke));
    popup.querySelector("#addBadgeToPlanningBtn").addEventListener("click", () => openPlanningPicker(marke));
    popup.querySelectorAll(".remove-activity-btn").forEach(button => {
        button.addEventListener("click", () => {
            removeActivityFromBadge(marke, button.dataset.activityId);
            showPopup(marke);
        });
    });
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

window.addEventListener("storage", event => {
    if (event.key === PLANNING_STORAGE_KEY && activePopupBadge && !popup.classList.contains("hidden")) {
        showPopup(activePopupBadge);
    }
});
