const arrangementsGrid = document.getElementById("arrangementsGrid");
const arrangementsEmpty = document.getElementById("arrangementsEmpty");
const arrangementModal = document.getElementById("arrangementModal");
const arrangementForm = document.getElementById("arrangementForm");
const arrangementAgendaList = document.getElementById("arrangementAgendaList");
const arrangementAgendaEmpty = document.getElementById("arrangementAgendaEmpty");
const arrangementSyncStatus = document.getElementById("arrangementSyncStatus");

let arrangements = [];
let recipes = [];
let activities = [];
let draftAgenda = [];
let planningOptions = [];
const mealTypes = ["Frukost", "Lunch", "Mellanmål", "Middag", "Kvällsmål"];
const departments = ["Familjescouter", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];
const statusLabels = { planned: "Planerat", completed: "Genomfört", cancelled: "Inställt" };

function escapeArrangementHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function formatArrangementDate(value, includeWeekday = true) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "";
    return new Intl.DateTimeFormat("sv-SE", includeWeekday
        ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
        : { day: "numeric", month: "short", year: "numeric" }
    ).format(new Date(`${value}T12:00:00`));
}

function formatDateSpan(item) {
    const start = formatArrangementDate(item.start_date, false);
    const end = formatArrangementDate(item.end_date, false);
    return start === end ? start : `${start}–${end}`;
}

function isArrangementEditable(item) {
    return Boolean(window.GTScoutArrangements?.canWrite() || item.local_only);
}

function arrangementDates(startDate, endDate) {
    const dates = [];
    for (const date = new Date(`${startDate}T12:00:00`); date <= new Date(`${endDate}T12:00:00`); date.setDate(date.getDate() + 1)) {
        dates.push(date.toISOString().slice(0, 10));
    }
    return dates;
}

function getSelectedArrangementDepartments() {
    return [...document.querySelectorAll("#arrangementDepartments input:checked")].map(input => input.value);
}

function renderDepartmentOptions(selected = []) {
    document.getElementById("arrangementDepartments").innerHTML = departments.map((department, index) =>
        `<label class="arrangement-department-choice department-tone-${index}"><input type="checkbox" name="arrangementDepartment" value="${escapeArrangementHtml(department)}"${selected.includes(department) ? " checked" : ""}><span>${escapeArrangementHtml(department)}</span></label>`
    ).join("");
}

function renderArrangementSchedule(item) {
    const selectedDepartments = item.departments?.length ? item.departments : departments;
    const departmentCount = selectedDepartments.length;
    const scheduleDays = arrangementDates(item.start_date, item.end_date).map(date => {
        const entries = item.agenda.filter(entry => entry.date === date);
        const times = [...new Set(entries.map(entry => entry.time || ""))].sort((left, right) => left.localeCompare(right));
        const rows = times.map(time => {
            const timeLabel = time || "Heldag";
            const rowEntries = entries.filter(entry => (entry.time || "") === time);
            const sharedEntries = rowEntries.filter(entry => entry.shared !== false);
            const scopedEntries = rowEntries.filter(entry => entry.shared === false);
            const sharedRow = sharedEntries.length
                ? `<div class="arrangement-schedule-row arrangement-schedule-row--shared" style="--department-count:${departmentCount}"><time>${escapeArrangementHtml(timeLabel)}</time><div class="arrangement-schedule-shared">${sharedEntries.map(entry => renderScheduleEntry(entry)).join("")}</div></div>`
                : "";
            const departmentRow = scopedEntries.length
                ? `<div class="arrangement-schedule-row"><time>${escapeArrangementHtml(timeLabel)}</time><div class="arrangement-schedule-columns" style="--department-count:${departmentCount}">${selectedDepartments.map(department => { const tone = departments.indexOf(department); return `<div class="arrangement-schedule-cell department-tone-${tone}">${scopedEntries.filter(entry => entry.departments.includes(department)).map(entry => renderScheduleEntry(entry, tone)).join("")}</div>`; }).join("")}</div></div>`
                : "";
            return sharedRow + departmentRow;
        }).join("");
        const headers = selectedDepartments.map(department => `<span class="arrangement-schedule-department department-tone-${departments.indexOf(department)}">${escapeArrangementHtml(department)}</span>`).join("");
        return `<section class="arrangement-day"><h3>${escapeArrangementHtml(formatArrangementDate(date))}</h3><div class="arrangement-schedule-header"><span>Tid</span><div class="arrangement-schedule-columns" style="--department-count:${departmentCount}">${headers}</div></div>${rows || `<p class="arrangement-day-empty">Inga programpunkter den här dagen.</p>`}</section>`;
    }).join("");
    return `<div class="arrangement-schedule">${scheduleDays}</div>`;
}

function renderScheduleEntry(entry, departmentIndex = null) {
    const tone = departmentIndex === null ? "arrangement-schedule-item--shared" : `department-tone-${departmentIndex}`;
    const meal = entry.kind === "meal" && entry.meal_type ? `<span class="arrangement-schedule-meal">${escapeArrangementHtml(entry.meal_type)}</span>` : "";
    const endTime = entry.end_time ? `<span class="arrangement-schedule-end">Slut ${escapeArrangementHtml(entry.end_time)}</span>` : "";
    const notes = entry.notes ? `<small>${escapeArrangementHtml(entry.notes)}</small>` : "";
    return `<article class="arrangement-schedule-item ${tone}">${meal}<strong>${escapeArrangementHtml(entry.title)}</strong>${endTime}${notes}</article>`;
}

function renderArrangements() {
    const query = document.getElementById("arrangementSearch").value.trim().toLocaleLowerCase("sv");
    const selectedStatus = document.getElementById("arrangementStatusFilter").value;
    const visible = arrangements.filter(item => {
        const matchesQuery = !query || `${item.title} ${item.location}`.toLocaleLowerCase("sv").includes(query);
        return matchesQuery && (selectedStatus === "all" || item.status === selectedStatus);
    });

    arrangementsGrid.innerHTML = visible.map(item => {
        const participantTags = item.departments.map((department, index) => `<span class="arrangement-department-tag department-tone-${departments.indexOf(department)}">${escapeArrangementHtml(department)}</span>`).join("");
        const agendaHtml = item.agenda.length ? renderArrangementSchedule(item) : `<p class="arrangement-card-no-agenda">Inget dagsprogram tillagt.</p>`;
        const link = item.planning_ref?.name ? `<p class="arrangement-card-planning">Planering: ${escapeArrangementHtml(item.planning_ref.name)}</p>` : "";
        const cardWidth = item.departments.length > 2 ? " arrangement-card--wide" : "";
        const actions = isArrangementEditable(item)
            ? `<div class="arrangement-card-actions"><button class="btn-secondary" type="button" data-edit-arrangement="${escapeArrangementHtml(item.id)}">Redigera</button><button class="arrangement-delete-icon" type="button" data-delete-arrangement="${escapeArrangementHtml(item.id)}" aria-label="Ta bort ${escapeArrangementHtml(item.title)}" title="Ta bort arrangemang"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z"/></svg></button></div>`
            : "";
        return `<article class="arrangement-card${cardWidth}"><div class="arrangement-card-top"><div><p class="arrangement-card-type">${escapeArrangementHtml(item.type)}</p><h2>${escapeArrangementHtml(item.title)}</h2></div><span class="arrangement-status arrangement-status--${escapeArrangementHtml(item.status)}">${escapeArrangementHtml(statusLabels[item.status] || statusLabels.planned)}</span></div><p class="arrangement-card-dates">${escapeArrangementHtml(formatDateSpan(item))}${item.start_time ? ` · ${escapeArrangementHtml(item.start_time)}` : ""}${item.end_time ? `–${escapeArrangementHtml(item.end_time)}` : ""}</p>${item.location ? `<p class="arrangement-card-location">${escapeArrangementHtml(item.location)}</p>` : ""}<div class="arrangement-participant-tags">${participantTags}</div>${link}${agendaHtml}${actions}</article>`;
    }).join("");

    arrangementsEmpty.classList.toggle("hidden", visible.length > 0);
    arrangementsGrid.classList.toggle("hidden", visible.length === 0);
    if (!visible.length) {
        arrangementsEmpty.textContent = arrangements.length ? "Inga arrangemang matchar filtreringen." : "Inga arrangemang ännu. Skapa ett för att börja planera.";
    }
}

function getPlanningOptions() {
    try {
        const stored = JSON.parse(localStorage.getItem("gtscout_planering") || "[]");
        return Array.isArray(stored) ? stored.filter(item => item?.id && item?.name).map(item => ({ id: String(item.id), name: String(item.name) })) : [];
    } catch {
        return [];
    }
}

function populatePlanningOptions(selectedId = "") {
    planningOptions = getPlanningOptions();
    const select = document.getElementById("arrangementPlanningRef");
    select.innerHTML = `<option value="">Ingen koppling</option>${planningOptions.map(item => `<option value="${escapeArrangementHtml(item.id)}">${escapeArrangementHtml(item.name)}</option>`).join("")}`;
    select.value = planningOptions.some(item => item.id === selectedId) ? selectedId : "";
}

function getCatalogOptions(kind, selectedSourceType = "", selectedSourceId = "") {
    const catalog = kind === "meal" ? recipes.map(item => ({ sourceType: "recipe", id: String(item.id), name: String(item.namn || "") }))
        : kind === "activity" ? activities.map(item => ({ sourceType: "activity", id: String(item.id), name: String(item.namn || "") }))
            : [];
    const validSelection = catalog.some(item => item.id === selectedSourceId && item.sourceType === selectedSourceType);
    const oldLabel = !validSelection && selectedSourceId ? `<option value="${escapeArrangementHtml(`${selectedSourceType}:${selectedSourceId}`)}" selected>${escapeArrangementHtml(`${draftAgenda.find(item => item.source_id === selectedSourceId)?.title || "Tidigare bibliotekspost"} (inte längre i biblioteket)`)}</option>` : "";
    return `<option value="">Egen post</option>${oldLabel}${catalog.map(item => `<option value="${escapeArrangementHtml(`${item.sourceType}:${item.id}`)}"${item.id === selectedSourceId && item.sourceType === selectedSourceType ? " selected" : ""}>${escapeArrangementHtml(item.name)}</option>`).join("")}`;
}

function renderAgendaEditor() {
    const startDate = document.getElementById("arrangementStartDate").value;
    const endDate = document.getElementById("arrangementEndDate").value || startDate;
    const selectedDepartments = getSelectedArrangementDepartments();
    draftAgenda.sort((left, right) => left.date.localeCompare(right.date) || (left.time || "99:99").localeCompare(right.time || "99:99"));
    arrangementAgendaList.innerHTML = draftAgenda.map(entry => {
        const mealField = entry.kind === "meal" ? `<label class="agenda-entry-field"><span>Måltid</span><select data-agenda-field="meal_type">${mealTypes.map(type => `<option${entry.meal_type === type ? " selected" : ""}>${type}</option>`).join("")}</select></label>` : "";
        const sourceField = entry.kind === "program" ? "" : `<label class="agenda-entry-field"><span>${entry.kind === "meal" ? "Recept" : "Aktivitet"}</span><select data-agenda-field="source">${getCatalogOptions(entry.kind, entry.source_type, entry.source_id)}</select></label>`;
        const shared = entry.shared !== false;
        const scopeOptions = selectedDepartments.map((department, index) => `<label class="arrangement-department-choice department-tone-${departments.indexOf(department)}"><input class="agenda-department-target" type="checkbox" value="${escapeArrangementHtml(department)}"${entry.departments?.includes(department) ? " checked" : ""}><span>${escapeArrangementHtml(department)}</span></label>`).join("");
        const scopeField = `<div class="agenda-entry-scope"><span>Gäller</span><label class="agenda-shared-choice"><input data-agenda-field="shared" type="checkbox"${shared ? " checked" : ""}>Gemensamt för alla</label><div class="agenda-scope-options${shared ? " hidden" : ""}">${scopeOptions}</div></div>`;
        return `<article class="arrangement-agenda-entry" data-agenda-id="${escapeArrangementHtml(entry.id)}"><div class="arrangement-agenda-entry-top"><strong>${escapeArrangementHtml(entry.title || (entry.kind === "meal" ? "Måltid" : entry.kind === "activity" ? "Aktivitet" : "Programpunkt"))}</strong><button class="agenda-entry-remove" type="button" data-remove-agenda="${escapeArrangementHtml(entry.id)}" aria-label="Ta bort programpunkt" title="Ta bort programpunkt">&times;</button></div><div class="arrangement-agenda-entry-grid"><label class="agenda-entry-field"><span>Datum</span><input data-agenda-field="date" type="date" min="${escapeArrangementHtml(startDate)}" max="${escapeArrangementHtml(endDate)}" value="${escapeArrangementHtml(entry.date)}" required></label><label class="agenda-entry-field"><span>Start</span><input data-agenda-field="time" type="time" value="${escapeArrangementHtml(entry.time)}"></label><label class="agenda-entry-field"><span>Slut</span><input data-agenda-field="end_time" type="time" value="${escapeArrangementHtml(entry.end_time || "")}"></label><label class="agenda-entry-field"><span>Typ</span><select data-agenda-field="kind"><option value="meal"${entry.kind === "meal" ? " selected" : ""}>Mat</option><option value="activity"${entry.kind === "activity" ? " selected" : ""}>Aktivitet</option><option value="program"${entry.kind === "program" ? " selected" : ""}>Program</option></select></label>${mealField}${sourceField}<label class="agenda-entry-field agenda-entry-title"><span>Namn</span><input data-agenda-field="title" type="text" maxlength="160" value="${escapeArrangementHtml(entry.title)}" required placeholder="Till exempel lägerbål"></label><label class="agenda-entry-field agenda-entry-notes"><span>Anteckning</span><input data-agenda-field="notes" type="text" maxlength="240" value="${escapeArrangementHtml(entry.notes)}" placeholder="Valfri notering"></label>${scopeField}</div></article>`;
    }).join("");
    arrangementAgendaEmpty.classList.toggle("hidden", draftAgenda.length > 0);
}

function readAgendaFromDom() {
    return [...arrangementAgendaList.querySelectorAll(".arrangement-agenda-entry")].map(row => {
        const value = field => row.querySelector(`[data-agenda-field="${field}"]`)?.value || "";
        const selectedSource = value("source");
        const [sourceType = "", ...sourceParts] = selectedSource.split(":");
        return {
            id: row.dataset.agendaId,
            date: value("date"),
            time: value("time"),
            end_time: value("end_time"),
            kind: value("kind"),
            meal_type: value("meal_type"),
            source_type: sourceParts.length ? sourceType : "",
            source_id: sourceParts.join(":"),
            shared: row.querySelector('[data-agenda-field="shared"]')?.checked !== false,
            departments: [...row.querySelectorAll(".agenda-department-target:checked")].map(input => input.value),
            title: value("title").trim(),
            notes: value("notes").trim()
        };
    });
}

function syncDraftAgenda() {
    draftAgenda = readAgendaFromDom();
}

function openArrangementEditor(item = null) {
    const form = arrangementForm;
    form.dataset.arrangementId = item?.id || "";
    document.getElementById("arrangementModalTitle").textContent = item ? "Redigera arrangemang" : "Nytt arrangemang";
    document.getElementById("arrangementTitle").value = item?.title || "";
    document.getElementById("arrangementType").value = item?.type || "Hajk";
    document.getElementById("arrangementStatus").value = item?.status || "planned";
    document.getElementById("arrangementStartDate").value = item?.start_date || new Date().toISOString().slice(0, 10);
    document.getElementById("arrangementEndDate").value = item?.end_date || item?.start_date || new Date().toISOString().slice(0, 10);
    document.getElementById("arrangementStartTime").value = item?.start_time || "";
    document.getElementById("arrangementEndTime").value = item?.end_time || "";
    document.getElementById("arrangementLocation").value = item?.location || "";
    document.getElementById("arrangementAfterNotes").value = item?.after_notes || "";
    document.getElementById("arrangementFormStatus").textContent = "";
    document.getElementById("deleteArrangementBtn").classList.toggle("hidden", !item);
    document.getElementById("arrangementLocalNotice").classList.toggle("hidden", window.GTScoutArrangements?.canWrite());
    renderDepartmentOptions(item?.departments?.length ? item.departments : departments);
    populatePlanningOptions(item?.planning_ref?.id || "");
    draftAgenda = (item?.agenda || []).map(entry => ({ ...entry }));
    renderAgendaEditor();
    arrangementModal.classList.remove("hidden");
    document.getElementById("arrangementTitle").focus();
}

function updateSyncStatus() {
    if (!window.GTScoutArrangements?.canRead()) {
        arrangementSyncStatus.textContent = "Sparas lokalt i den här webbläsaren";
        return;
    }
    arrangementSyncStatus.textContent = window.GTScoutArrangements.canWrite()
        ? "Kårens arrangemang · synkning aktiv"
        : "Kårens arrangemang · skrivskyddad";
}

function readFormPayload() {
    const planningId = document.getElementById("arrangementPlanningRef").value;
    const planning = planningOptions.find(item => item.id === planningId);
    return {
        id: arrangementForm.dataset.arrangementId || crypto.randomUUID(),
        title: document.getElementById("arrangementTitle").value.trim(),
        type: document.getElementById("arrangementType").value,
        status: document.getElementById("arrangementStatus").value,
        start_date: document.getElementById("arrangementStartDate").value,
        end_date: document.getElementById("arrangementEndDate").value,
        start_time: document.getElementById("arrangementStartTime").value,
        end_time: document.getElementById("arrangementEndTime").value,
        location: document.getElementById("arrangementLocation").value.trim(),
        departments: getSelectedArrangementDepartments(),
        planning_ref: planning ? { id: planning.id, name: planning.name } : null,
        agenda: readAgendaFromDom(),
        after_notes: document.getElementById("arrangementAfterNotes").value.trim()
    };
}

arrangementsGrid.addEventListener("click", async event => {
    const editButton = event.target.closest("[data-edit-arrangement]");
    const deleteButton = event.target.closest("[data-delete-arrangement]");
    if (editButton) {
        const item = arrangements.find(arrangement => arrangement.id === editButton.dataset.editArrangement);
        if (item && isArrangementEditable(item)) openArrangementEditor(item);
        return;
    }
    if (!deleteButton) return;
    const item = arrangements.find(arrangement => arrangement.id === deleteButton.dataset.deleteArrangement);
    if (!item || !isArrangementEditable(item) || !confirm(`Ta bort ${item.title}?`)) return;
    try {
        await window.GTScoutArrangements.remove(item.id);
    } catch (error) {
        alert(error.message || "Kunde inte ta bort arrangemanget.");
    }
});

document.getElementById("addArrangementBtn").addEventListener("click", () => openArrangementEditor());
document.getElementById("arrangementSearch").addEventListener("input", renderArrangements);
document.getElementById("arrangementStatusFilter").addEventListener("change", renderArrangements);
document.getElementById("closeArrangementModal").addEventListener("click", () => arrangementModal.classList.add("hidden"));
document.getElementById("cancelArrangementBtn").addEventListener("click", () => arrangementModal.classList.add("hidden"));
arrangementModal.addEventListener("click", event => {
    if (event.target === arrangementModal) arrangementModal.classList.add("hidden");
});

document.getElementById("addAgendaEntryBtn").addEventListener("click", () => {
    syncDraftAgenda();
    const startDate = document.getElementById("arrangementStartDate").value || new Date().toISOString().slice(0, 10);
    draftAgenda.push({ id: crypto.randomUUID(), date: startDate, time: "", end_time: "", kind: "program", meal_type: "", source_type: "", source_id: "", shared: true, departments: [], title: "", notes: "" });
    renderAgendaEditor();
});

document.getElementById("arrangementDepartments").addEventListener("change", () => {
    syncDraftAgenda();
    const selected = getSelectedArrangementDepartments();
    draftAgenda.forEach(entry => {
        if (entry.shared === false) {
            entry.departments = entry.departments.filter(department => selected.includes(department));
            if (!entry.departments.length) entry.shared = true;
        }
    });
    renderAgendaEditor();
});

arrangementAgendaList.addEventListener("input", syncDraftAgenda);
arrangementAgendaList.addEventListener("change", event => {
    const row = event.target.closest(".arrangement-agenda-entry");
    if (!row) return;
    syncDraftAgenda();
    const item = draftAgenda.find(entry => entry.id === row.dataset.agendaId);
    let shouldRender = false;
    if (item && event.target.dataset.agendaField === "kind") {
        item.source_id = "";
        item.source_type = "";
        item.title = "";
        item.meal_type = item.kind === "meal" ? mealTypes[0] : "";
        shouldRender = true;
    }
    if (item && event.target.dataset.agendaField === "shared") {
        item.shared = event.target.checked;
        item.departments = item.shared ? [] : getSelectedArrangementDepartments();
        shouldRender = true;
    }
    if (item && event.target.dataset.agendaField === "source") {
        const selected = event.target.value;
        const [sourceType = "", ...sourceParts] = selected.split(":");
        item.source_type = sourceParts.length ? sourceType : "";
        item.source_id = sourceParts.join(":");
        const source = item.source_type === "recipe" ? recipes.find(recipe => String(recipe.id) === item.source_id)
            : item.source_type === "activity" ? activities.find(activity => String(activity.id) === item.source_id) : null;
        if (source) item.title = source.namn || "";
        shouldRender = true;
    }
    if (shouldRender) renderAgendaEditor();
});

arrangementAgendaList.addEventListener("click", event => {
    const removeButton = event.target.closest("[data-remove-agenda]");
    if (!removeButton) return;
    syncDraftAgenda();
    draftAgenda = draftAgenda.filter(entry => entry.id !== removeButton.dataset.removeAgenda);
    renderAgendaEditor();
});

for (const fieldId of ["arrangementStartDate", "arrangementEndDate"]) {
    document.getElementById(fieldId).addEventListener("change", () => {
        syncDraftAgenda();
        const startDate = document.getElementById("arrangementStartDate").value;
        const endDate = document.getElementById("arrangementEndDate").value || startDate;
        if (startDate && endDate >= startDate) {
            draftAgenda.forEach(entry => {
                if (entry.date < startDate) entry.date = startDate;
                if (entry.date > endDate) entry.date = endDate;
            });
        }
        renderAgendaEditor();
    });
}

arrangementForm.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = readFormPayload();
    const status = document.getElementById("arrangementFormStatus");
    if (!payload.departments.length) {
        status.textContent = "Välj minst en avdelning.";
        return;
    }
    if (payload.end_date < payload.start_date) {
        status.textContent = "Slutdatum kan inte vara före startdatum.";
        return;
    }
    if (payload.agenda.some(entry => !entry.title || entry.date < payload.start_date || entry.date > payload.end_date || (entry.shared === false && !entry.departments.length) || entry.departments.some(department => !payload.departments.includes(department)))) {
        status.textContent = "Kontrollera namn, tider och avdelningar för varje programpunkt.";
        return;
    }
    const existing = arrangements.find(item => item.id === payload.id);
    if (existing) payload.created_by = existing.created_by;
    document.getElementById("saveArrangementBtn").disabled = true;
    status.textContent = "Sparar...";
    try {
        const result = await window.GTScoutArrangements.save(payload);
        arrangementModal.classList.add("hidden");
        arrangementSyncStatus.textContent = result.localOnly
            ? result.error ? "Kunde inte nå databasen · ändringen finns lokalt" : "Sparas lokalt i den här webbläsaren"
            : "Sparat i databasen";
    } catch (error) {
        status.textContent = error.message || "Kunde inte spara arrangemanget.";
    } finally {
        document.getElementById("saveArrangementBtn").disabled = false;
    }
});

document.getElementById("deleteArrangementBtn").addEventListener("click", async () => {
    const item = arrangements.find(arrangement => arrangement.id === arrangementForm.dataset.arrangementId);
    if (!item || !isArrangementEditable(item) || !confirm(`Ta bort ${item.title}?`)) return;
    try {
        await window.GTScoutArrangements.remove(item.id);
        arrangementModal.classList.add("hidden");
    } catch (error) {
        document.getElementById("arrangementFormStatus").textContent = error.message || "Kunde inte ta bort arrangemanget.";
    }
});

window.GTScoutActivities?.init({ onChange(state) {
    activities = state.activities || [];
    if (!arrangementModal.classList.contains("hidden")) {
        syncDraftAgenda();
        renderAgendaEditor();
    }
} });
window.GTScoutCookbook?.init({ onChange(nextRecipes) {
    recipes = nextRecipes || [];
    if (!arrangementModal.classList.contains("hidden")) {
        syncDraftAgenda();
        renderAgendaEditor();
    }
} });
window.GTScoutArrangements.init({
    onChange(nextArrangements) {
        arrangements = nextArrangements || [];
        renderArrangements();
    }
});
window.GTScoutAuth?.onChange(() => updateSyncStatus());
updateSyncStatus();
