const SCOUT_STATUS_LABELS = {
    not_started: "Ej påbörjad",
    in_progress: "Pågår",
    completed: "Klar"
};
const SCOUT_STATUS_ORDER = ["not_started", "in_progress", "completed"];
const REPEATABLE_BADGE_IDS = new Set(["100_scout"]);
const REPEATABLE_BADGE_TARGET = 5;
const SCOUT_BADGE_TARGET_ORDER = ["Familjescouter", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];
const SCOUT_BADGE_TYPE_ORDER = ["Intressemärke", "Bevismärke", "Deltagarmärke"];
const SCOUT_TARGET_CLASS_NAMES = {
    Familjescouter: "familjescouting",
    Spårare: "sparare",
    Upptäckare: "upptackare",
    Äventyrare: "aventyrare",
    Utmanare: "utmanare",
    Rover: "rover"
};
const scoutSearch = document.getElementById("scoutSearch");
const scoutBadgeSearch = document.getElementById("scoutBadgeSearch");
const scoutActiveBadgeFilter = document.getElementById("scoutActiveBadgeFilter");
const removeFilteredScoutsBtn = document.getElementById("removeFilteredScoutsBtn");
const scoutYearDropdown = document.getElementById("scoutYearDropdown");
const scoutYearDropdownBtn = document.getElementById("scoutYearDropdownBtn");
const scoutYearDropdownMenu = document.getElementById("scoutYearDropdownMenu");
const scoutTargetDropdown = document.getElementById("scoutTargetDropdown");
const scoutTargetDropdownBtn = document.getElementById("scoutTargetDropdownBtn");
const scoutTargetDropdownMenu = document.getElementById("scoutTargetDropdownMenu");
const scoutCategoryDropdown = document.getElementById("scoutCategoryDropdown");
const scoutCategoryDropdownBtn = document.getElementById("scoutCategoryDropdownBtn");
const scoutCategoryDropdownMenu = document.getElementById("scoutCategoryDropdownMenu");
const scoutTableHead = document.getElementById("scoutsTableHead");
const scoutTableBody = document.getElementById("scoutsTableBody");
const scoutStickyHeader = document.getElementById("scoutStickyHeader");
const scoutTableTopScroll = document.getElementById("scoutTableTopScroll");
const scoutTableTopScrollContent = document.getElementById("scoutTableTopScrollContent");
const scoutEmpty = document.getElementById("scoutsEmpty");
const scoutModal = document.getElementById("scoutModal");
const scoutModalStatus = document.getElementById("scoutModalStatus");
const scoutCsvInput = document.getElementById("scoutCsvInput");
const scoutImportModal = document.getElementById("scoutImportModal");
const scoutImportPreview = document.getElementById("scoutImportPreview");
const scoutImportStatus = document.getElementById("scoutImportStatus");
const confirmScoutImportBtn = document.getElementById("confirmScoutImportBtn");
const scoutsContent = document.getElementById("scoutsContent");
const scoutsAccessDenied = document.getElementById("scoutsAccessDenied");
let scoutBadges = [];
let scoutData = [];
let pendingScoutImport = [];

function updateScoutTableStickyOffset() {
    const siteHeader = document.querySelector(".site-header");
    if (siteHeader) document.documentElement.style.setProperty("--scout-table-sticky-top", `${siteHeader.offsetHeight}px`);
}

function syncScoutStickyHeader() {
    const table = document.querySelector(".scouts-table-wrap .scouts-table");
    const tableWrap = document.querySelector(".scouts-table-wrap");
    const siteHeader = document.querySelector(".site-header");
    const clonedTable = scoutStickyHeader?.querySelector("table");
    if (!table || !tableWrap || !siteHeader || !clonedTable) return;

    const tableRect = table.getBoundingClientRect();
    const tableWrapRect = tableWrap.getBoundingClientRect();
    const stickyTop = siteHeader.getBoundingClientRect().bottom + (scoutTableTopScroll?.offsetHeight || 0) + 2;
    const headerHeight = table.tHead?.getBoundingClientRect().height || 0;
    const shouldShow = tableRect.top <= stickyTop && tableRect.bottom > stickyTop + headerHeight;

    scoutStickyHeader.classList.toggle("hidden", !shouldShow);
    if (!shouldShow) return;

    scoutStickyHeader.style.top = `${stickyTop}px`;
    scoutStickyHeader.style.left = `${tableWrapRect.left}px`;
    scoutStickyHeader.style.width = `${tableWrap.clientWidth}px`;
    scoutStickyHeader.style.height = `${headerHeight}px`;
    clonedTable.style.width = `${table.offsetWidth}px`;
    clonedTable.style.transform = `translateX(${-tableWrap.scrollLeft}px)`;
    clonedTable.querySelectorAll("tr > :first-child").forEach(cell => {
        cell.style.transform = `translateX(${tableWrap.scrollLeft}px)`;
    });
}

function updateScoutStickyHeader() {
    const table = document.querySelector(".scouts-table-wrap .scouts-table");
    if (!scoutStickyHeader || !table) return;
    const clonedTable = table.cloneNode(true);
    clonedTable.tHead?.removeAttribute("id");
    clonedTable.querySelector("tbody")?.remove();
    scoutStickyHeader.replaceChildren(clonedTable);
    if (scoutTableTopScrollContent) scoutTableTopScrollContent.style.width = `${table.offsetWidth}px`;
    syncScoutStickyHeader();
}

function syncScoutTableScroll(source) {
    const tableWrap = document.querySelector(".scouts-table-wrap");
    if (!tableWrap || !scoutTableTopScroll) return;
    if (source !== tableWrap) tableWrap.scrollLeft = source.scrollLeft;
    if (source !== scoutTableTopScroll) scoutTableTopScroll.scrollLeft = source.scrollLeft;
    syncScoutStickyHeader();
}

function getScoutBadgeSortTarget(badge) {
    const targets = Array.isArray(badge.malgrupp) ? badge.malgrupp : [badge.malgrupp || "Övrigt"];
    return targets
        .map(target => SCOUT_BADGE_TARGET_ORDER.indexOf(target))
        .filter(index => index >= 0)
        .sort((left, right) => left - right)[0] ?? SCOUT_BADGE_TARGET_ORDER.length;
}

function getScoutBadgeSortType(badge) {
    const type = badge.Typ || badge.typ || "";
    const index = SCOUT_BADGE_TYPE_ORDER.indexOf(type);
    return index < 0 ? SCOUT_BADGE_TYPE_ORDER.length : index;
}

function escapeScoutHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizeCsvHeader(value) {
    return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[åä]/g, "a").replace(/ö/g, "o");
}

function parseCsv(text) {
    const separator = (text.split(/\r?\n/)[0].match(/;/g) || []).length > (text.split(/\r?\n/)[0].match(/,/g) || []).length ? ";" : ",";
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (char === '"' && text[index + 1] === '"' && quoted) { cell += '"'; index += 1; continue; }
        if (char === '"') { quoted = !quoted; continue; }
        if (!quoted && char === separator) { row.push(cell.trim()); cell = ""; continue; }
        if (!quoted && (char === "\n" || char === "\r")) {
            if (char === "\r" && text[index + 1] === "\n") index += 1;
            row.push(cell.trim());
            if (row.some(value => value)) rows.push(row);
            row = []; cell = ""; continue;
        }
        cell += char;
    }
    row.push(cell.trim());
    if (row.some(value => value)) rows.push(row);
    if (rows.length < 2) throw new Error("CSV-filen saknar data.");
    const headers = rows.shift().map(normalizeCsvHeader);
    const indexOf = name => headers.indexOf(name);
    const memberIndex = indexOf("medlemsnummer");
    const firstNameIndex = indexOf("fornamn");
    const lastNameIndex = indexOf("efternamn");
    const birthDateIndex = indexOf("fodelsedatum");
    if ([memberIndex, firstNameIndex, lastNameIndex, birthDateIndex].some(index => index < 0)) {
        throw new Error("CSV-filen måste ha kolumnerna Medlemsnummer, Förnamn, Efternamn och Födelsedatum.");
    }
    return rows.map(values => {
        const birthDate = parseBirthDate(values[birthDateIndex]);
        return {
            medlemsnummer: values[memberIndex],
            namn: `${values[firstNameIndex]} ${values[lastNameIndex]}`.trim(),
            fodelsedatum: birthDate.iso,
            fodelsear: birthDate.year,
            aktiv: true
        };
    }).filter(row => row.medlemsnummer && row.namn && row.fodelsear);
}

function parseBirthDate(value) {
    const raw = String(value || "").trim();
    let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) || raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!match) return { iso: "", year: 0 };
    const year = match[1].length === 4 ? Number(match[1]) : Number(match[3]);
    const month = match[1].length === 4 ? Number(match[2]) : Number(match[2]);
    const day = match[1].length === 4 ? Number(match[3]) : Number(match[1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { iso: "", year: 0 };
    return { iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, year };
}

function showScoutImportPreview(rows) {
    pendingScoutImport = rows;
    scoutImportPreview.innerHTML = `<table><thead><tr><th>Medlemsnummer</th><th>Namn</th><th>Födelsedatum</th></tr></thead><tbody>${rows.slice(0, 50).map(row => `<tr><td>${escapeScoutHtml(row.medlemsnummer)}</td><td>${escapeScoutHtml(row.namn)}</td><td>${escapeScoutHtml(row.fodelsedatum)}</td></tr>`).join("")}</tbody></table>`;
    scoutImportStatus.textContent = `${rows.length} scouter hittades${rows.length > 50 ? " (visar de första 50)" : ""}. Befintliga matchas på medlemsnummer.`;
    confirmScoutImportBtn.disabled = rows.length === 0;
}

function canManageScouts() {
    const auth = window.GTScoutAuth;
    return !auth?.isOnline?.() || !auth?.isSignedIn?.() || Boolean(window.GTScoutScouts?.canWrite?.());
}

function canViewScouts() {
    return Boolean(window.GTScoutAuth?.isSignedIn?.() && window.GTScoutAuth?.isLeader?.());
}

function updateScoutAccess() {
    const allowed = canViewScouts();
    scoutsContent.classList.toggle("hidden", !allowed);
    scoutsAccessDenied.classList.toggle("hidden", allowed);
    document.getElementById("importScoutsBtn").classList.toggle("hidden", !canDeleteScouts());
    removeFilteredScoutsBtn.classList.toggle("hidden", !canDeleteScouts());
    if (allowed) renderAll();
}

function canDeleteScouts() {
    return Boolean(window.GTScoutAuth?.isAdmin?.());
}

function getNextStatus(status) {
    const index = SCOUT_STATUS_ORDER.indexOf(status || "not_started");
    return SCOUT_STATUS_ORDER[(index + 1) % SCOUT_STATUS_ORDER.length];
}

function renderScoutHeader() {
    const badges = getVisibleScoutBadges();
    const targetGroups = [];
    badges.forEach(badge => {
        const targets = Array.isArray(badge.malgrupp) ? badge.malgrupp : [badge.malgrupp || "Övrigt"];
        const target = targets
            .map(value => ({ value, order: SCOUT_BADGE_TARGET_ORDER.indexOf(value) }))
            .sort((left, right) => (left.order < 0 ? SCOUT_BADGE_TARGET_ORDER.length : left.order) - (right.order < 0 ? SCOUT_BADGE_TARGET_ORDER.length : right.order))[0]?.value || "Övrigt";
        const previous = targetGroups[targetGroups.length - 1];
        if (previous?.name === target) previous.count += 1;
        else targetGroups.push({ name: target, count: 1 });
    });
    const targetHeader = `<tr class="scout-target-row"><th></th>${targetGroups.map(group => `<th class="scout-target-group--${SCOUT_TARGET_CLASS_NAMES[group.name] || "default"}" colspan="${group.count}">${escapeScoutHtml(group.name)}</th>`).join("")}<th></th></tr>`;
    const badgeHeader = `<tr><th class="scout-name-heading">Scout</th>${badges.map(badge => `<th class="scout-badge-heading"><button class="scout-badge-bulk-action" type="button" data-badge-id="${escapeScoutHtml(badge.id)}" title="Ändra status för alla filtrerade scouter: ${escapeScoutHtml(badge.namn)}" aria-label="Ändra status för alla filtrerade scouter: ${escapeScoutHtml(badge.namn)}"><img src="${escapeScoutHtml(badge.bild)}" alt=""></button></th>`).join("")}<th aria-label="Åtgärder"></th></tr>`;
    scoutTableHead.innerHTML = targetHeader + badgeHeader;
    updateScoutStickyHeader();
}

function advanceBadgeForVisibleScouts(badgeId) {
    const visibleScouts = getVisibleScouts();
    if (!visibleScouts.length) return;
    if (REPEATABLE_BADGE_IDS.has(badgeId)) {
        if (!confirm(`Öka markeringen ett steg för ${visibleScouts.length} filtrerade scouter?`)) return;
        window.GTScoutScouts.setCountMany(visibleScouts.map(scout => ({
            scoutId: scout.id,
            badgeId,
            count: ((Number(scout.counts?.[badgeId]) || 0) + 1) % (REPEATABLE_BADGE_TARGET + 1)
        })));
        return;
    }
    const hasNotStarted = visibleScouts.some(scout => (scout.statuses?.[badgeId] || "not_started") === "not_started");
    const hasInProgress = visibleScouts.some(scout => scout.statuses?.[badgeId] === "in_progress");
    const nextStatus = hasNotStarted ? "in_progress" : hasInProgress ? "completed" : "not_started";
    const scoutsToUpdate = visibleScouts.filter(scout => {
        const status = scout.statuses?.[badgeId] || "not_started";
        return hasNotStarted ? status === "not_started" : hasInProgress ? status === "in_progress" : status === "completed";
    });
    const actionLabel = nextStatus === "in_progress" ? "markera som pågår" : nextStatus === "completed" ? "markera som klara" : "återställa";
    if (!confirm(`Vill du ${actionLabel} ${scoutsToUpdate.length} filtrerade scouter?`)) return;
    window.GTScoutScouts.setStatusMany(scoutsToUpdate.map(scout => ({
        scoutId: scout.id,
        badgeId,
        status: nextStatus
    })));
}

function badgeHasStatus(badge) {
    return scoutData.some(scout => (Number(scout.counts?.[badge.id]) || 0) > 0 || scout.statuses?.[badge.id] === "in_progress" || scout.statuses?.[badge.id] === "completed");
}

function getVisibleScoutBadges() {
    const search = scoutBadgeSearch.value.trim().toLowerCase();
    const selectedTargets = [...scoutTargetDropdownMenu.querySelectorAll("input:checked")].map(input => input.value).filter(value => value !== "Alla");
    const selectedCategories = [...scoutCategoryDropdownMenu.querySelectorAll("input:checked")].map(input => input.value).filter(value => value !== "Alla");
    return scoutBadges.filter(badge => {
        const matchesSearch = !search || badge.namn.toLowerCase().includes(search);
        const targets = Array.isArray(badge.malgrupp) ? badge.malgrupp : [badge.malgrupp || "Övrigt"];
        const matchesTarget = selectedTargets.length === 0 || selectedTargets.some(target => targets.includes(target));
        const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(badge.kategori || "Övrigt");
        return matchesSearch && matchesTarget && matchesCategory && (!scoutActiveBadgeFilter.checked || badgeHasStatus(badge));
    });
}

function renderBadgeFilterDropdown(menu, button, values, allLabel, selectedValues) {
    menu.innerHTML = ["Alla", ...values].map(value => `<label class="multi-select-option" role="option" aria-selected="${value === "Alla" ? selectedValues.length === 0 : selectedValues.includes(value)}"><input type="checkbox" value="${escapeScoutHtml(value)}"${value === "Alla" ? selectedValues.length === 0 ? " checked" : "" : selectedValues.includes(value) ? " checked" : ""}><span class="multi-select-check" aria-hidden="true">✓</span><span>${value === "Alla" ? allLabel : escapeScoutHtml(value)}</span></label>`).join("");
    button.textContent = selectedValues.length === 0 ? allLabel : selectedValues.length === 1 ? selectedValues[0] : `${selectedValues.length} valda`;
    menu.querySelectorAll("input").forEach(input => input.addEventListener("change", () => {
        const allInput = menu.querySelector("input[value='Alla']");
        if (input.value === "Alla" && input.checked) menu.querySelectorAll("input").forEach(option => { option.checked = option.value === "Alla"; });
        else if (input.value !== "Alla" && input.checked) allInput.checked = false;
        updateBadgeFilterDropdowns();
        renderScoutHeader();
        renderScouts();
    }));
}

function updateBadgeFilterDropdowns() {
    const targets = [...new Set(scoutBadges.flatMap(badge => Array.isArray(badge.malgrupp) ? badge.malgrupp : [badge.malgrupp || "Övrigt"]))].sort((left, right) => {
        const leftIndex = SCOUT_BADGE_TARGET_ORDER.indexOf(left);
        const rightIndex = SCOUT_BADGE_TARGET_ORDER.indexOf(right);
        return (leftIndex < 0 ? SCOUT_BADGE_TARGET_ORDER.length : leftIndex) - (rightIndex < 0 ? SCOUT_BADGE_TARGET_ORDER.length : rightIndex) || left.localeCompare(right, "sv");
    });
    const categories = [...new Set(scoutBadges.map(badge => badge.kategori || "Övrigt"))].sort((a, b) => a.localeCompare(b, "sv"));
    const selectedTargets = [...scoutTargetDropdownMenu.querySelectorAll("input:checked")].map(input => input.value).filter(value => value !== "Alla");
    const selectedCategories = [...scoutCategoryDropdownMenu.querySelectorAll("input:checked")].map(input => input.value).filter(value => value !== "Alla");
    renderBadgeFilterDropdown(scoutTargetDropdownMenu, scoutTargetDropdownBtn, targets, "Alla målgrupper", selectedTargets.filter(value => targets.includes(value)));
    renderBadgeFilterDropdown(scoutCategoryDropdownMenu, scoutCategoryDropdownBtn, categories, "Alla kategorier", selectedCategories.filter(value => categories.includes(value)));
}

function updateYearFilter() {
    const current = [...scoutYearDropdownMenu.querySelectorAll("input:checked")].map(input => input.value);
    const years = [...new Set(scoutData.map(scout => scout.fodelsear).filter(Boolean))].sort((a, b) => a - b);
    const selectedYears = current.filter(value => value !== "Alla" && years.includes(Number(value)));
    const options = ["Alla", ...years.map(String)];
    scoutYearDropdownMenu.innerHTML = options.map(value => `<label class="multi-select-option" role="option" aria-selected="${value === "Alla" ? selectedYears.length === 0 : selectedYears.includes(value)}"><input type="checkbox" value="${value}"${value === "Alla" ? selectedYears.length === 0 ? " checked" : "" : selectedYears.includes(value) ? " checked" : ""}><span class="multi-select-check" aria-hidden="true">✓</span><span>${value === "Alla" ? "Alla år" : value}</span></label>`).join("");
    scoutYearDropdownBtn.textContent = selectedYears.length === 0 ? "Alla år" : selectedYears.length === 1 ? selectedYears[0] : `${selectedYears.length} år valda`;
    scoutYearDropdownMenu.querySelectorAll("input").forEach(input => input.addEventListener("change", handleYearFilterChange));
}

function handleYearFilterChange(event) {
    const input = event.target;
    const allInput = scoutYearDropdownMenu.querySelector("input[value='Alla']");
    if (input.value === "Alla" && input.checked) {
        scoutYearDropdownMenu.querySelectorAll("input").forEach(option => { option.checked = option.value === "Alla"; });
    } else if (input.value !== "Alla" && input.checked) {
        allInput.checked = false;
    }
    updateYearFilter();
    renderScouts();
}

function getVisibleScouts() {
    const search = scoutSearch.value.trim().toLowerCase();
    const selectedYears = [...scoutYearDropdownMenu.querySelectorAll("input:checked")].map(input => input.value);
    return scoutData.filter(scout => {
        const matchesName = !search || scout.namn.toLowerCase().includes(search);
        const matchesYear = selectedYears.includes("Alla") || selectedYears.length === 0 || selectedYears.includes(String(scout.fodelsear));
        return matchesName && matchesYear && scout.aktiv !== false;
    }).sort((left, right) => {
        const yearDifference = Number(left.fodelsear) - Number(right.fodelsear);
        return yearDifference || left.namn.localeCompare(right.namn, "sv");
    });
}

function renderScouts() {
    const visible = getVisibleScouts();
    removeFilteredScoutsBtn.disabled = !canDeleteScouts() || visible.length === 0;
    removeFilteredScoutsBtn.textContent = visible.length > 0 ? `Ta bort filtrerade (${visible.length})` : "Ta bort filtrerade";
    scoutEmpty.classList.toggle("hidden", scoutData.length > 0);
    const visibleBadges = getVisibleScoutBadges();
    scoutTableBody.innerHTML = visible.map(scout => `<tr>
        <th scope="row"><span class="scout-name">${escapeScoutHtml(scout.namn)} <span class="scout-birth-year">${escapeScoutHtml(scout.fodelsear)}</span></span></th>
        ${visibleBadges.map(badge => {
            if (REPEATABLE_BADGE_IDS.has(badge.id)) {
                const count = Number(scout.counts?.[badge.id]) || 0;
                const completed = count >= REPEATABLE_BADGE_TARGET;
                return `<td><button class="scout-status scout-count-status${completed ? " scout-count-status--gold" : ""}" type="button" data-scout-id="${scout.id}" data-badge-id="${escapeScoutHtml(badge.id)}" aria-label="${escapeScoutHtml(scout.namn)} – ${escapeScoutHtml(badge.namn)}: ${completed ? "Guld" : `${count} av ${REPEATABLE_BADGE_TARGET}`}" title="${completed ? "Guld" : `Öka antal (${count}/${REPEATABLE_BADGE_TARGET})`}">${completed ? "Guld" : `${count}/${REPEATABLE_BADGE_TARGET}`}</button></td>`;
            }
            const status = scout.statuses?.[badge.id] || "not_started";
            return `<td><button class="scout-status scout-status--${status}" type="button" data-scout-id="${scout.id}" data-badge-id="${escapeScoutHtml(badge.id)}" aria-label="${escapeScoutHtml(scout.namn)} – ${escapeScoutHtml(badge.namn)}: ${SCOUT_STATUS_LABELS[status]}" title="${SCOUT_STATUS_LABELS[status]}">${status === "completed" ? "✓" : status === "in_progress" ? "•" : "–"}</button></td>`;
        }).join("")}
        <td>${canDeleteScouts() ? `<button class="scout-remove-btn" type="button" data-scout-id="${scout.id}" aria-label="Ta bort ${escapeScoutHtml(scout.namn)}" title="Ta bort scout">&times;</button>` : ""}</td>
    </tr>`).join("");
    document.querySelectorAll(".scout-status").forEach(button => button.addEventListener("click", () => {
        const scout = scoutData.find(item => item.id === button.dataset.scoutId);
        if (!scout) return;
        if (REPEATABLE_BADGE_IDS.has(button.dataset.badgeId)) {
            const count = Number(scout.counts?.[button.dataset.badgeId]) || 0;
            window.GTScoutScouts.setCount(scout.id, button.dataset.badgeId, count >= REPEATABLE_BADGE_TARGET ? 0 : count + 1);
            return;
        }
        const current = scout.statuses?.[button.dataset.badgeId] || "not_started";
        window.GTScoutScouts.setStatus(scout.id, button.dataset.badgeId, getNextStatus(current));
    }));
    document.querySelectorAll(".scout-remove-btn").forEach(button => button.addEventListener("click", () => {
        const scout = scoutData.find(item => item.id === button.dataset.scoutId);
        if (scout && confirm(`Ta bort ${scout.namn}? Märkesstatusen tas också bort.`)) window.GTScoutScouts.remove(scout.id);
    }));
}

function renderAll() {
    if (!canViewScouts()) {
        scoutData = [];
        scoutsContent.classList.add("hidden");
        scoutsAccessDenied.classList.remove("hidden");
        return;
    }
    scoutData = window.GTScoutScouts?.getAll?.() || [];
    updateYearFilter();
    updateBadgeFilterDropdowns();
    renderScoutHeader();
    renderScouts();
}

async function loadScoutBadges() {
    try {
        const response = await fetch("data/marken.json");
        const baseBadges = await response.json();
        scoutBadges = [...baseBadges, ...(window.GTScoutBadges?.getAllBadges?.() || [])]
            .filter((badge, index, list) => list.findIndex(item => item.id === badge.id) === index)
            .sort((left, right) => {
                const targetDifference = getScoutBadgeSortTarget(left) - getScoutBadgeSortTarget(right);
                if (targetDifference) return targetDifference;
                const typeDifference = getScoutBadgeSortType(left) - getScoutBadgeSortType(right);
                if (typeDifference) return typeDifference;
                const categoryDifference = String(left.kategori || "Övrigt").localeCompare(String(right.kategori || "Övrigt"), "sv");
                return categoryDifference || left.namn.localeCompare(right.namn, "sv");
            });
        window.GTScoutScouts?.init({ badges: scoutBadges, onChange: renderAll });
        renderAll();
    } catch (error) {
        console.error("Kunde inte läsa märken", error);
    }
}

document.getElementById("importScoutsBtn").addEventListener("click", () => {
    if (!canDeleteScouts()) return;
    scoutCsvInput.click();
});
document.getElementById("closeScoutImportModal").addEventListener("click", () => scoutImportModal.classList.add("hidden"));
document.getElementById("cancelScoutImportBtn").addEventListener("click", () => scoutImportModal.classList.add("hidden"));
scoutImportModal.addEventListener("click", event => { if (event.target === scoutImportModal) scoutImportModal.classList.add("hidden"); });
scoutCsvInput.addEventListener("change", async event => {
    if (!canDeleteScouts()) return;
    const file = event.target.files?.[0];
    scoutCsvInput.value = "";
    if (!file) return;
    try {
        const rows = parseCsv(await file.text());
        showScoutImportPreview(rows);
        scoutImportModal.classList.remove("hidden");
    } catch (error) {
        scoutImportPreview.innerHTML = "";
        scoutImportStatus.textContent = error.message || "CSV-filen kunde inte läsas.";
        confirmScoutImportBtn.disabled = true;
        scoutImportModal.classList.remove("hidden");
    }
});
confirmScoutImportBtn.addEventListener("click", () => {
    if (!pendingScoutImport.length) return;
    window.GTScoutScouts.upsertMany(pendingScoutImport);
    pendingScoutImport = [];
    scoutImportModal.classList.add("hidden");
});

document.getElementById("addScoutBtn").addEventListener("click", () => {
    if (!canManageScouts()) return;
    document.getElementById("scoutName").value = "";
    document.getElementById("scoutBirthYear").value = "";
    scoutModalStatus.textContent = "";
    scoutModal.classList.remove("hidden");
    document.getElementById("scoutName").focus();
});
document.getElementById("closeScoutModal").addEventListener("click", () => scoutModal.classList.add("hidden"));
scoutModal.addEventListener("click", event => { if (event.target === scoutModal) scoutModal.classList.add("hidden"); });
document.getElementById("saveScoutBtn").addEventListener("click", () => {
    const name = document.getElementById("scoutName").value.trim();
    const birthYear = Number.parseInt(document.getElementById("scoutBirthYear").value, 10);
    if (!name || !Number.isInteger(birthYear) || birthYear < 1900 || birthYear > 2200) {
        scoutModalStatus.textContent = "Fyll i namn och ett giltigt födelseår.";
        return;
    }
    window.GTScoutScouts.add({ id: crypto.randomUUID(), namn: name, fodelsear: birthYear, aktiv: true });
    scoutModal.classList.add("hidden");
});
scoutSearch.addEventListener("input", renderScouts);
scoutBadgeSearch.addEventListener("input", () => { renderScoutHeader(); renderScouts(); });
scoutActiveBadgeFilter.addEventListener("change", () => { renderScoutHeader(); renderScouts(); });
removeFilteredScoutsBtn.addEventListener("click", () => {
    const visible = getVisibleScouts();
    if (!visible.length || !canDeleteScouts()) return;
    const names = visible.length <= 3 ? ` (${visible.map(scout => scout.namn).join(", ")})` : "";
    if (!confirm(`Ta bort ${visible.length} filtrerade scouter${names}? Märkesstatusen tas också bort.`)) return;
    window.GTScoutScouts.removeMany(visible.map(scout => scout.id));
});
[[scoutTargetDropdown, scoutTargetDropdownBtn, scoutTargetDropdownMenu], [scoutCategoryDropdown, scoutCategoryDropdownBtn, scoutCategoryDropdownMenu]].forEach(([dropdown, button, menu]) => button.addEventListener("click", event => {
    event.stopPropagation();
    document.querySelectorAll(".scouts-toolbar .multi-select-menu").forEach(otherMenu => { if (otherMenu !== menu) otherMenu.classList.add("hidden"); });
    const isOpen = !menu.classList.contains("hidden");
    menu.classList.toggle("hidden", isOpen);
    button.setAttribute("aria-expanded", String(!isOpen));
}));
scoutYearDropdownBtn.addEventListener("click", event => {
    event.stopPropagation();
    const isOpen = !scoutYearDropdownMenu.classList.contains("hidden");
    scoutYearDropdownMenu.classList.toggle("hidden", isOpen);
    scoutYearDropdownBtn.setAttribute("aria-expanded", String(!isOpen));
});
document.addEventListener("click", event => {
    const badgeAction = event.target.closest(".scout-badge-bulk-action");
    if (badgeAction) {
        advanceBadgeForVisibleScouts(badgeAction.dataset.badgeId);
        return;
    }
    if (!scoutYearDropdown.contains(event.target)) {
        scoutYearDropdownMenu.classList.add("hidden");
        scoutYearDropdownBtn.setAttribute("aria-expanded", "false");
    }
    [[scoutTargetDropdown, scoutTargetDropdownBtn, scoutTargetDropdownMenu], [scoutCategoryDropdown, scoutCategoryDropdownBtn, scoutCategoryDropdownMenu]].forEach(([dropdown, button, menu]) => {
        if (!dropdown.contains(event.target)) {
            menu.classList.add("hidden");
            button.setAttribute("aria-expanded", "false");
        }
    });
});
document.getElementById("openScoutLoginBtn").addEventListener("click", () => window.GTScoutAuth?.openLogin?.());
window.GTScoutAuth?.onChange(updateScoutAccess);
window.GTScoutBadges?.init({ onChange: loadScoutBadges });
window.addEventListener("scroll", syncScoutStickyHeader, { passive: true });
window.addEventListener("resize", () => {
    updateScoutTableStickyOffset();
    updateScoutStickyHeader();
});
document.querySelector(".scouts-table-wrap")?.addEventListener("scroll", event => syncScoutTableScroll(event.currentTarget), { passive: true });
scoutTableTopScroll?.addEventListener("scroll", event => syncScoutTableScroll(event.currentTarget), { passive: true });
updateScoutTableStickyOffset();
loadScoutBadges();
