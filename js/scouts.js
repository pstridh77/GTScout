const SCOUT_STATUS_LABELS = {
    not_started: "Ej påbörjad",
    in_progress: "Pågår",
    completed: "Klar"
};
const SCOUT_STATUS_ORDER = ["not_started", "in_progress", "completed"];
const REPEATABLE_BADGE_IDS = new Set(["100_scout"]);
const REPEATABLE_BADGE_TARGET = 5;
const scoutSearch = document.getElementById("scoutSearch");
const scoutYearFilter = document.getElementById("scoutYearFilter");
const scoutTableHead = document.getElementById("scoutsTableHead");
const scoutTableBody = document.getElementById("scoutsTableBody");
const scoutEmpty = document.getElementById("scoutsEmpty");
const scoutModal = document.getElementById("scoutModal");
const scoutModalStatus = document.getElementById("scoutModalStatus");
let scoutBadges = [];
let scoutData = [];

function escapeScoutHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function canManageScouts() {
    const auth = window.GTScoutAuth;
    return !auth?.isOnline?.() || !auth?.isSignedIn?.() || Boolean(window.GTScoutScouts?.canWrite?.());
}

function getNextStatus(status) {
    const index = SCOUT_STATUS_ORDER.indexOf(status || "not_started");
    return SCOUT_STATUS_ORDER[(index + 1) % SCOUT_STATUS_ORDER.length];
}

function renderScoutHeader() {
    scoutTableHead.innerHTML = `<tr><th>Scout</th><th>Födelseår</th>${scoutBadges.map(badge => `<th class="scout-badge-heading" title="${escapeScoutHtml(badge.namn)}"><span>${escapeScoutHtml(badge.namn)}</span></th>`).join("")}<th aria-label="Åtgärder"></th></tr>`;
}

function updateYearFilter() {
    const current = scoutYearFilter.value;
    const years = [...new Set(scoutData.map(scout => scout.fodelsear).filter(Boolean))].sort((a, b) => a - b);
    scoutYearFilter.innerHTML = `<option value="Alla">Alla år</option>${years.map(year => `<option value="${year}">${year}</option>`).join("")}`;
    scoutYearFilter.value = years.includes(Number(current)) ? current : "Alla";
}

function renderScouts() {
    const search = scoutSearch.value.trim().toLowerCase();
    const year = scoutYearFilter.value;
    const visible = scoutData.filter(scout => {
        const matchesName = !search || scout.namn.toLowerCase().includes(search);
        const matchesYear = year === "Alla" || String(scout.fodelsear) === year;
        return matchesName && matchesYear && scout.aktiv !== false;
    });
    scoutEmpty.classList.toggle("hidden", scoutData.length > 0);
    scoutTableBody.innerHTML = visible.map(scout => `<tr>
        <th scope="row"><span class="scout-name">${escapeScoutHtml(scout.namn)}</span></th>
        <td>${escapeScoutHtml(scout.fodelsear)}</td>
        ${scoutBadges.map(badge => {
            if (REPEATABLE_BADGE_IDS.has(badge.id)) {
                const count = Number(scout.counts?.[badge.id]) || 0;
                const completed = count >= REPEATABLE_BADGE_TARGET;
                return `<td><button class="scout-status scout-count-status${completed ? " scout-count-status--gold" : ""}" type="button" data-scout-id="${scout.id}" data-badge-id="${escapeScoutHtml(badge.id)}" aria-label="${escapeScoutHtml(scout.namn)} – ${escapeScoutHtml(badge.namn)}: ${completed ? "Guld" : `${count} av ${REPEATABLE_BADGE_TARGET}`}" title="${completed ? "Guld" : `Öka antal (${count}/${REPEATABLE_BADGE_TARGET})`}">${completed ? "Guld" : `${count}/${REPEATABLE_BADGE_TARGET}`}</button></td>`;
            }
            const status = scout.statuses?.[badge.id] || "not_started";
            return `<td><button class="scout-status scout-status--${status}" type="button" data-scout-id="${scout.id}" data-badge-id="${escapeScoutHtml(badge.id)}" aria-label="${escapeScoutHtml(scout.namn)} – ${escapeScoutHtml(badge.namn)}: ${SCOUT_STATUS_LABELS[status]}" title="${SCOUT_STATUS_LABELS[status]}">${status === "completed" ? "✓" : status === "in_progress" ? "•" : "–"}</button></td>`;
        }).join("")}
        <td>${canManageScouts() ? `<button class="scout-remove-btn" type="button" data-scout-id="${scout.id}" aria-label="Ta bort ${escapeScoutHtml(scout.namn)}" title="Ta bort scout">&times;</button>` : ""}</td>
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
    scoutData = window.GTScoutScouts?.getAll?.() || [];
    updateYearFilter();
    renderScoutHeader();
    renderScouts();
}

async function loadScoutBadges() {
    try {
        const response = await fetch("data/marken.json");
        const baseBadges = await response.json();
        scoutBadges = [...baseBadges, ...(window.GTScoutBadges?.getAllBadges?.() || [])]
            .filter((badge, index, list) => list.findIndex(item => item.id === badge.id) === index)
            .sort((left, right) => left.namn.localeCompare(right.namn, "sv"));
        window.GTScoutScouts?.init({ badges: scoutBadges, onChange: renderAll });
        renderAll();
    } catch (error) {
        console.error("Kunde inte läsa märken", error);
    }
}

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
scoutYearFilter.addEventListener("change", renderScouts);
window.GTScoutBadges?.init({ onChange: loadScoutBadges });
loadScoutBadges();
