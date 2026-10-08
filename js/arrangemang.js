const arrangementsGrid = document.getElementById("arrangementsGrid");
const arrangementsEmpty = document.getElementById("arrangementsEmpty");
const arrangementModal = document.getElementById("arrangementModal");
const arrangementForm = document.getElementById("arrangementForm");
const agendaEntryModal = document.getElementById("agendaEntryModal");
const agendaEntryForm = document.getElementById("agendaEntryForm");
const agendaEntryDialogFields = document.getElementById("agendaEntryDialogFields");
const responsibilityModal = document.getElementById("responsibilityModal");
const responsibilityForm = document.getElementById("responsibilityForm");
const arrangementNotesModal = document.getElementById("arrangementNotesModal");
const arrangementNotesForm = document.getElementById("arrangementNotesForm");
const shareArrangementModal = document.getElementById("shareArrangementModal");
const arrangementActionToast = document.getElementById("arrangementActionToast");
const scheduleGesturePreview = document.createElement("div");
scheduleGesturePreview.className = "schedule-gesture-preview hidden";
scheduleGesturePreview.setAttribute("aria-hidden", "true");
document.body.append(scheduleGesturePreview);
const arrangementResponsibilitiesList = document.getElementById("arrangementResponsibilitiesList");
const arrangementResponsibilitiesEmpty = document.getElementById("arrangementResponsibilitiesEmpty");
const roleLibraryStorageKey = "gtscout_arrangemang_roles";
const arrangementAgendaList = document.getElementById("arrangementAgendaList");
const arrangementAgendaEmpty = document.getElementById("arrangementAgendaEmpty");
const arrangementSyncStatus = document.getElementById("arrangementSyncStatus");
const isSharedArrangementView = new URLSearchParams(window.location.search).has("share");

let arrangements = [];
let recipes = [];
let activities = [];
let draftAgenda = [];
let activeAgendaArrangementId = "";
let activeAgendaEntryId = "";
let activeAgendaEntryIsCopy = false;
let activeAgendaEntryIsNew = false;
let agendaEntryDialogTrigger = null;
let activeResponsibilityArrangementId = "";
let activeResponsibilityId = "";
let responsibilityDialogTrigger = null;
let activeNotesArrangementId = "";
let notesDialogTrigger = null;
let arrangementToastTimer = null;
let activeScheduleGesture = null;
let suppressScheduleClickUntil = 0;
const arrangementDayExpansion = new Map();
const arrangementSchemaExpansion = new Set();
const arrangementScheduleOverview = new Set();
const collapsedArrangementNotes = new Set();
const collapsedArrangementMeals = new Set();
const collapsedArrangementChecklist = new Set();
const expandedArrangementIds = new Set();
const collapsedArrangementYears = new Set();
const arrangementDetailEditModes = new Set();
let draftResponsibilities = [];
let planningOptions = [];
const departments = ["Familjescouter", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];
const scheduleSnapMinutes = 15;
const scheduleMaxMinutes = 23 * 60 + 45;
let defaultRoleDefinitions = [];
const defaultRoleDefinitionsLoaded = fetch("data/arrangemang-roller.json")
    .then(response => {
        if (!response.ok) throw new Error("Rollistan kunde inte hämtas.");
        return response.json();
    })
    .then(roles => {
        defaultRoleDefinitions = Array.isArray(roles)
            ? roles.map(role => ({ name: String(role?.name || "").trim(), description: String(role?.description || "").trim() })).filter(role => role.name)
            : [];
        return defaultRoleDefinitions;
    })
    .catch(error => {
        console.error("Kunde inte läsa standardroller för arrangemang", error);
        return defaultRoleDefinitions;
    });
const statusLabels = { planned: "Planerat", completed: "Genomfört", cancelled: "Inställt" };

function escapeArrangementHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function agendaHasTargets(entry, activeDepartments) {
    return entry.shared === false
        ? entry.departments.length > 0
        : activeDepartments.some(department => !(entry.excluded_departments || []).includes(department));
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

function parseScheduleTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return null;
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
}

function formatScheduleTime(minutes) {
    const safeMinutes = Math.max(0, Math.min(scheduleMaxMinutes, minutes));
    return `${String(Math.floor(safeMinutes / 60)).padStart(2, "0")}:${String(safeMinutes % 60).padStart(2, "0")}`;
}

function formatScheduleDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const parts = [];
    if (hours) parts.push(`${hours} ${hours === 1 ? "timme" : "timmar"}`);
    if (remainingMinutes) parts.push(`${remainingMinutes} ${remainingMinutes === 1 ? "minut" : "minuter"}`);
    return parts.join(" ") || "0 minuter";
}

function showScheduleGesturePreview(event, label) {
    scheduleGesturePreview.textContent = label;
    scheduleGesturePreview.classList.remove("hidden");
    const left = Math.max(8, Math.min(event.clientX + 12, window.innerWidth - scheduleGesturePreview.offsetWidth - 8));
    const top = Math.max(8, event.clientY - scheduleGesturePreview.offsetHeight - 10);
    scheduleGesturePreview.style.left = `${left}px`;
    scheduleGesturePreview.style.top = `${top}px`;
}

function hideScheduleGesturePreview() {
    scheduleGesturePreview.classList.add("hidden");
}

function showArrangementToast(message, type = "success") {
    clearTimeout(arrangementToastTimer);
    arrangementActionToast.textContent = message;
    arrangementActionToast.classList.remove("hidden", "arrangement-action-toast--info", "arrangement-action-toast--error");
    if (type !== "success") arrangementActionToast.classList.add(`arrangement-action-toast--${type}`);
    arrangementToastTimer = setTimeout(() => arrangementActionToast.classList.add("hidden"), 5000);
}

function isArrangementEditable(item) {
    return !isSharedArrangementView && Boolean(window.GTScoutArrangements?.canWrite() || item.local_only);
}

function isArrangementDetailEditable(item) {
    return isArrangementEditable(item) && arrangementDetailEditModes.has(item.id);
}

async function shareArrangement(item) {
    if (!item || item.local_only || !window.GTScoutArrangements?.canWrite?.()) return;
    const token = item.share_token || crypto.randomUUID();
    const result = await window.GTScoutArrangements.save({ ...item, share_token: token });
    if (result.localOnly) {
        showArrangementToast("Delningen kunde inte sparas i databasen.", "error");
        return;
    }
    const shareUrl = new URL("arrangemang.html", window.location.href);
    shareUrl.searchParams.set("share", token);
    const urlInput = document.getElementById("shareArrangementUrl");
    const status = document.getElementById("shareArrangementStatus");
    urlInput.value = shareUrl.href;
    status.textContent = "";
    shareArrangementModal.classList.remove("hidden");
    urlInput.select();
    try {
        await navigator.clipboard.writeText(shareUrl.href);
        status.textContent = "Länken har kopierats. Du kan också markera den och kopiera manuellt.";
    } catch {
        status.textContent = "Markera länken och kopiera den manuellt.";
    }
}

function renderArrangementChecklist(checklist, arrangementId, editable) {
    const visibleTasks = editable ? checklist : checklist.filter(task => !task.done);
    if (!editable && !visibleTasks.length) return "";
    const isOpen = !collapsedArrangementChecklist.has(arrangementId);
    const rows = visibleTasks.length
        ? `<ul class="arrangement-checklist-list">${visibleTasks.map(task => `<li class="arrangement-checklist-item${task.done ? " arrangement-checklist-item--done" : ""}"><label><input type="checkbox" data-checklist-arrangement="${escapeArrangementHtml(arrangementId)}" data-checklist-task="${escapeArrangementHtml(task.id)}"${task.done ? " checked" : ""}${editable ? "" : " disabled"} aria-label="${task.done ? "Avklarad" : "Kvar att göra"}"><span>${escapeArrangementHtml(task.text)}</span></label>${editable ? `<button class="arrangement-checklist-remove" type="button" data-remove-checklist-task="${escapeArrangementHtml(task.id)}" data-arrangement-id="${escapeArrangementHtml(arrangementId)}" aria-label="Ta bort uppgiften ${escapeArrangementHtml(task.text)}" title="Ta bort uppgift">&times;</button>` : ""}</li>`).join("")}</ul>`
        : '<p class="arrangement-checklist-empty">Inga uppgifter tillagda.</p>';
    const addControl = editable
        ? `<form class="arrangement-checklist-add" data-add-checklist-form="${escapeArrangementHtml(arrangementId)}"><input type="text" maxlength="160" placeholder="Ny uppgift" data-checklist-new-task="${escapeArrangementHtml(arrangementId)}" aria-label="Ny uppgift"><button class="btn-secondary" type="submit">Lägg till</button></form>`
        : "";
    return `<details class="arrangement-checklist-overview" data-arrangement-id="${escapeArrangementHtml(arrangementId)}"${isOpen ? " open" : ""}><summary class="arrangement-section-summary"><strong>Att göra</strong><span>${visibleTasks.length}</span></summary><div class="arrangement-checklist-content">${rows}${addControl}</div></details>`;
}

async function saveArrangementChecklist(arrangement, checklist) {
    const result = await window.GTScoutArrangements.save({ ...arrangement, checklist });
    arrangementSyncStatus.textContent = result.localOnly
        ? result.error ? "Uppgiften sparades lokalt men kunde inte synkas." : "Uppgiften sparades lokalt."
        : "Uppgiften sparades.";
    if (result.error) showArrangementToast("Uppgiften sparades lokalt men kunde inte synkas.", "error");
    return result;
}

function openArrangementNotesDialog(item, trigger) {
    activeNotesArrangementId = item.id;
    notesDialogTrigger = trigger;
    document.getElementById("arrangementNotesDialogTitle").textContent = `Anteckningar · ${item.title}`;
    document.getElementById("arrangementNotesDialogLabel").textContent = `Anteckningar för ${item.title}`;
    document.getElementById("arrangementNotesDialogText").value = item.notes || "";
    document.getElementById("arrangementNotesDialogStatus").textContent = "";
    arrangementNotesModal.classList.remove("hidden");
    document.getElementById("arrangementNotesDialogText").focus();
}

function closeArrangementNotesDialog() {
    const trigger = notesDialogTrigger;
    const arrangementId = activeNotesArrangementId;
    arrangementNotesModal.classList.add("hidden");
    activeNotesArrangementId = "";
    notesDialogTrigger = null;
    const fallbackTrigger = [...arrangementsGrid.querySelectorAll("[data-edit-arrangement-notes]")]
        .find(button => button.dataset.editArrangementNotes === arrangementId);
    (trigger?.isConnected ? trigger : fallbackTrigger)?.focus();
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

function getCustomRoleDefinitions() {
    try {
        const stored = JSON.parse(localStorage.getItem(roleLibraryStorageKey) || "[]");
        return Array.isArray(stored) ? stored.map(role => ({
            name: String(role?.name || "").trim(),
            description: String(role?.description || "").trim()
        })).filter(role => role.name) : [];
    } catch {
        return [];
    }
}

function getRoleDefinitions() {
    const definitions = [...defaultRoleDefinitions, ...getCustomRoleDefinitions()];
    arrangements.forEach(item => {
        (item.responsibilities || []).forEach(entry => {
            if (entry.role) definitions.push({ name: entry.role, description: entry.role_description || entry.description || "" });
        });
    });
    const uniqueDefinitions = new Map();
    definitions.forEach(role => {
        const key = role.name.trim().toLocaleLowerCase("sv");
        if (key && !uniqueDefinitions.has(key)) uniqueDefinitions.set(key, { name: role.name.trim(), description: role.description.trim() });
    });
    return [...uniqueDefinitions.values()];
}

function getRoleDefinition(name) {
    return getRoleDefinitions().find(role => role.name === name) || null;
}

function getAssignedRoleCounts() {
    const counts = new Map();
    draftResponsibilities.forEach(entry => {
        if (entry.role && entry.person.trim()) counts.set(entry.role, (counts.get(entry.role) || 0) + 1);
    });
    return counts;
}

function getNextUnassignedRole() {
    const usedRoles = new Set(draftResponsibilities.map(entry => entry.role).filter(Boolean));
    return getRoleDefinitions().find(role => !usedRoles.has(role.name)) || null;
}

function getRoleOptionLabel(role, count) {
    if (!count) return role.name;
    const assignedText = count === 1 ? "Tilldelad" : `Tilldelad (${count})`;
    return `${role.name} · ${assignedText}`;
}

function renderResponsibilityList() {
    const assignedRoleCounts = getAssignedRoleCounts();
    const roleOptions = getRoleDefinitions().map(role => `<option value="${escapeArrangementHtml(role.name)}">${escapeArrangementHtml(getRoleOptionLabel(role, assignedRoleCounts.get(role.name) || 0))}</option>`).join("");
    arrangementResponsibilitiesList.innerHTML = draftResponsibilities.map(entry =>
        `<article class="arrangement-responsibility-entry" data-responsibility-id="${escapeArrangementHtml(entry.id)}" data-role-description="${escapeArrangementHtml(entry.role_description || "")}"><div class="arrangement-responsibility-entry-top"><strong>${escapeArrangementHtml(entry.person || "Ny ansvarspost")}${entry.role ? ` · ${escapeArrangementHtml(entry.role)}` : ""}</strong><button class="agenda-entry-remove" type="button" data-remove-responsibility="${escapeArrangementHtml(entry.id)}" aria-label="Ta bort ansvarspost" title="Ta bort ansvarspost">&times;</button></div><div class="arrangement-responsibility-grid"><label class="responsibility-field responsibility-field--role"><span>Roll</span><select data-responsibility-field="role">${roleOptions}<option value="">Övrig</option></select></label><label class="responsibility-field responsibility-field--person"><span>Ansvarig</span><input data-responsibility-field="person" type="text" maxlength="120" value="${escapeArrangementHtml(entry.person)}" placeholder="Namn" autocomplete="name"></label><label class="responsibility-field responsibility-field--description"><span>Rollbeskrivning/fritext</span><textarea data-responsibility-field="description" rows="2" maxlength="600" placeholder="Ansvar, samordning, tider och övriga detaljer">${escapeArrangementHtml(entry.description)}</textarea></label></div></article>`
    ).join("");
    arrangementResponsibilitiesList.querySelectorAll("[data-responsibility-field='role']").forEach(select => {
        const row = select.closest(".arrangement-responsibility-entry");
        select.value = draftResponsibilities.find(entry => entry.id === row.dataset.responsibilityId)?.role || "";
    });
    arrangementResponsibilitiesEmpty.classList.toggle("hidden", draftResponsibilities.length > 0);
}

function refreshAssignedRoleLabels() {
    const assignedRoleCounts = getAssignedRoleCounts();
    arrangementResponsibilitiesList.querySelectorAll("[data-responsibility-field='role'] option").forEach(option => {
        if (!option.value) return;
        const definition = getRoleDefinition(option.value);
        if (definition) option.textContent = getRoleOptionLabel(definition, assignedRoleCounts.get(option.value) || 0);
    });
}

function readResponsibilitiesFromDom() {
    return [...arrangementResponsibilitiesList.querySelectorAll(".arrangement-responsibility-entry")].map(row => {
        const value = field => row.querySelector(`[data-responsibility-field="${field}"]`)?.value.trim() || "";
        const entry = {
            id: row.dataset.responsibilityId,
            person: value("person"),
            role: value("role"),
            role_description: row.dataset.roleDescription || "",
            description: value("description")
        };
        return entry;
    }).filter(entry => entry.person || entry.role || entry.description);
}

function syncDraftResponsibilities() {
    draftResponsibilities = readResponsibilitiesFromDom();
}

function renderArrangementScheduleOverview(item, selectedDepartments, canEditAgenda) {
    const isTime = time => /^\d{2}:\d{2}$/.test(time || "");
    const allDates = arrangementDates(item.start_date, item.end_date);
    const dates = canEditAgenda ? allDates : allDates.filter(date => item.agenda.some(entry => entry.date === date));
    if (!dates.length) {
        return '<p class="arrangement-day-empty">Inga programpunkter att visa.</p>';
    }
    const addAgendaSlotAttributes = (date, minute = null) => {
        const time = minute !== null && minute < 1440 ? formatScheduleTime(minute) : "";
        const label = time ? `Lägg till programpunkt ${time}` : "Lägg till programpunkt utan tid";
        return `data-add-agenda data-add-agenda-arrangement="${escapeArrangementHtml(item.id)}" data-add-agenda-date="${escapeArrangementHtml(date)}" data-add-agenda-time="${time}" aria-label="${label}" title="${label}"`;
    };
    const timedEntries = item.agenda.filter(entry => isTime(entry.time)).map(entry => {
        const startMinutes = parseScheduleTime(entry.time);
        const parsedEnd = parseScheduleTime(entry.end_time);
        const endMinutes = parsedEnd !== null && parsedEnd > startMinutes ? parsedEnd : Math.min(1440, startMinutes + 60);
        return { entry, startMinutes, endMinutes };
    });
    const timeBounds = [
        ...timedEntries.flatMap(event => [event.startMinutes, event.endMinutes]),
        parseScheduleTime(item.start_time),
        parseScheduleTime(item.end_time)
    ].filter(value => value !== null);
    let startMinutes = timeBounds.length ? Math.floor(Math.min(...timeBounds) / 60) * 60 : 9 * 60;
    let endMinutes = timeBounds.length ? Math.ceil(Math.max(...timeBounds) / 60) * 60 : 17 * 60;
    if (endMinutes <= startMinutes) endMinutes = Math.min(1440, startMinutes + 60);
    if (endMinutes <= startMinutes) startMinutes = Math.max(0, endMinutes - 60);

    const timePoints = new Set([startMinutes, endMinutes]);
    timedEntries.forEach(event => {
        if (event.startMinutes >= startMinutes && event.startMinutes <= endMinutes) timePoints.add(event.startMinutes);
        if (event.endMinutes >= startMinutes && event.endMinutes <= endMinutes) timePoints.add(event.endMinutes);
    });
    for (let minute = Math.floor(startMinutes / 60) * 60 + 60; minute < endMinutes; minute += 60) timePoints.add(minute);
    const sortedTimes = [...timePoints].sort((left, right) => left - right);
    const formatTime = minutes => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const rowHeights = sortedTimes.map((minute, index) => {
        const nextMinute = sortedTimes[index + 1];
        return `${nextMinute === undefined ? 48 : Math.max(1, (nextMinute - minute) * 0.8)}px`;
    });
    const overviewEvents = dates.map((date, dateIndex) => {
        const entriesForDate = item.agenda.filter(entry => entry.date === date);
        const events = entriesForDate.flatMap(entry => {
            if (!isTime(entry.time)) return [];
            const timing = timedEntries.find(event => event.entry.id === entry.id);
            if (!timing) return [];
            const targets = entry.shared !== false
                ? [{ tone: null, label: "Gemensamt" }]
                : selectedDepartments.filter(department => entry.departments.includes(department))
                    .map(department => ({ tone: departments.indexOf(department), label: department }));
            return targets.map(target => ({
                ...timing,
                ...target,
                dateIndex,
                laneIndex: 0,
                laneCount: 1
            }));
        });
        const sortedEvents = [...events].sort((left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes);
        let cluster = [];
        let clusterEnd = -1;
        const assignClusterLanes = () => {
            if (!cluster.length) return;
            const laneEnds = [];
            cluster.forEach(event => {
                let laneIndex = laneEnds.findIndex(end => end <= event.startMinutes);
                if (laneIndex < 0) {
                    laneIndex = laneEnds.length;
                    laneEnds.push(event.endMinutes);
                } else {
                    laneEnds[laneIndex] = event.endMinutes;
                }
                event.laneIndex = laneIndex;
            });
            cluster.forEach(event => { event.laneCount = laneEnds.length; });
        };
        sortedEvents.forEach(event => {
            if (cluster.length && event.startMinutes >= clusterEnd) {
                assignClusterLanes();
                cluster = [];
                clusterEnd = -1;
            }
            cluster.push(event);
            clusterEnd = Math.max(clusterEnd, event.endMinutes);
        });
        assignClusterLanes();

        const allDayEntries = entriesForDate.filter(entry => !isTime(entry.time)).map(entry => {
            const targetLabel = entry.shared !== false
                ? "Gemensamt"
                : selectedDepartments.filter(department => entry.departments.includes(department)).join(", ");
            const targetDepartment = selectedDepartments.find(department => entry.departments.includes(department));
            const tone = entry.shared !== false || !targetDepartment ? "arrangement-schedule-item--shared"
                : `department-tone-${departments.indexOf(targetDepartment)}`;
            const editAttributes = canEditAgenda
                ? `data-edit-agenda="${escapeArrangementHtml(entry.id)}" data-arrangement-id="${escapeArrangementHtml(item.id)}" aria-label="Redigera programpunkt: ${escapeArrangementHtml(entry.title)}"`
                : "disabled aria-disabled=\"true\"";
            return `<button type="button" class="arrangement-overview-all-day-item ${tone}" ${editAttributes}><strong>${escapeArrangementHtml(entry.title)}</strong><span>${escapeArrangementHtml(targetLabel)}</span></button>`;
        }).join("");
        return { events, allDayEntries };
    });

    const timeLabels = sortedTimes.map((minute, index) => {
        const label = minute % 60 === 0 ? formatTime(minute) : "";
        const row = index + 3;
        return `<span class="${label ? "arrangement-schedule-time" : "arrangement-schedule-time-marker"}" style="grid-column:1;grid-row:${row}"${label ? "" : " aria-hidden=\"true\""}>${escapeArrangementHtml(label)}</span>`;
    }).join("");
    const dayHeaders = dates.map((date, index) => `<strong class="arrangement-overview-day" style="grid-column:${index + 2};grid-row:1"><span>${escapeArrangementHtml(new Intl.DateTimeFormat("sv-SE", { weekday: "short" }).format(new Date(`${date}T12:00:00`)))}</span><time datetime="${escapeArrangementHtml(date)}">${escapeArrangementHtml(new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`)))}</time></strong>`).join("");
    const dayAllDayRows = dates.map((date, index) => {
        const { allDayEntries } = overviewEvents[index];
        const emptyLabel = !allDayEntries && !canEditAgenda ? '<span class="arrangement-overview-all-day-empty">Heldag</span>' : "";
        const addButton = canEditAgenda
            ? `<button type="button" class="arrangement-overview-all-day-add" ${addAgendaSlotAttributes(date)}>+ Heldag</button>`
            : "";
        return `<div class="arrangement-overview-all-day" style="grid-column:${index + 2};grid-row:2">${allDayEntries}${emptyLabel}${addButton}</div>`;
    }).join("");
        const emptyCells = dates.flatMap((date, dateIndex) => sortedTimes.map((minute, timeIndex) => {
            const hourClass = minute % 60 === 0 ? " arrangement-overview-slot--hour" : "";
            const position = `grid-column:${dateIndex + 2};grid-row:${timeIndex + 3}`;
        const cell = canEditAgenda && minute < 1440
                ? `<button type="button" class="arrangement-overview-slot${hourClass}" style="${position}" ${addAgendaSlotAttributes(date, minute)}></button>`
                : `<span class="arrangement-overview-slot${hourClass}" style="${position}" aria-hidden="true"></span>`;
            return cell;
        })).join("");
    const eventMarkup = overviewEvents.flatMap(({ events }, dateIndex) => events.map(event => {
        const startIndex = sortedTimes.indexOf(event.startMinutes);
        const endIndex = sortedTimes.indexOf(event.endMinutes);
        const startRow = (startIndex >= 0 ? startIndex : 0) + 3;
        const endRow = endIndex > startIndex ? endIndex + 3 : startRow + 1;
        const laneWidth = (100 / event.laneCount).toFixed(4);
        const laneOffset = (event.laneIndex * 100 / event.laneCount).toFixed(4);
        const card = renderScheduleEntry(event.entry, event.tone, item.id, canEditAgenda);
        const durationClass = event.endMinutes - event.startMinutes < 60 ? " arrangement-schedule-overview-event--short" : "";
        return `<div class="arrangement-schedule-event arrangement-schedule-overview-event${event.tone === null ? " arrangement-schedule-event--shared" : ""}${durationClass}" style="grid-column:${dateIndex + 2};grid-row:${startRow}/${endRow};--lane-width:${laneWidth}%;--lane-offset:${laneOffset}%;--event-z-index:${event.tone === null ? 1 : 2}">${card}</div>`;
    })).join("");
    const columns = `48px repeat(${dates.length}, minmax(128px, 1fr))`;
    return `<div class="arrangement-schedule-overview"><div class="arrangement-overview-scroll"><div class="arrangement-overview-grid" style="--overview-columns:${columns};--schedule-rows:${rowHeights.join(" ")}"><span class="arrangement-overview-time-heading" style="grid-column:1;grid-row:1 / 3">Tid</span>${dayHeaders}${dayAllDayRows}${timeLabels}${emptyCells}${eventMarkup}</div></div></div>`;
}

function renderArrangementSchedule(item) {
    const selectedDepartments = item.departments?.length ? item.departments : departments;
    const departmentCount = selectedDepartments.length;
    const canEditAgenda = isArrangementDetailEditable(item);
    const showOverview = arrangementScheduleOverview.has(item.id);
    const getSharedSegments = excludedDepartments => {
        const segments = [];
        let segmentStart = -1;
        selectedDepartments.forEach((department, departmentIndex) => {
            const included = !excludedDepartments.includes(department);
            if (included && segmentStart < 0) segmentStart = departmentIndex;
            if (!included && segmentStart >= 0) {
                segments.push({ startColumn: segmentStart + 2, endColumn: departmentIndex + 2 });
                segmentStart = -1;
            }
        });
        if (segmentStart >= 0) segments.push({ startColumn: segmentStart + 2, endColumn: selectedDepartments.length + 2 });
        return segments;
    };
        const isTime = time => /^\d{2}:\d{2}$/.test(time || "");
    const addHour = time => {
        const [hours, minutes] = time.split(":").map(Number);
        const nextMinutes = hours * 60 + minutes + 60;
        return nextMinutes < 1440 ? `${String(Math.floor(nextMinutes / 60)).padStart(2, "0")}:${String(nextMinutes % 60).padStart(2, "0")}` : "";
    };
    const agendaStarts = item.agenda.map(entry => entry.time).filter(isTime).sort();
    const agendaEnds = item.agenda.map(entry => isTime(entry.end_time) && (!isTime(entry.time) || entry.end_time > entry.time) ? entry.end_time : isTime(entry.time) ? addHour(entry.time) : "").filter(isTime).sort();
    const scheduleStart = isTime(item.start_time) ? item.start_time : agendaStarts[0] || "09:00";
    const inferredEnd = agendaEnds.at(-1) || (agendaStarts.length ? addHour(scheduleStart) : "17:00");
    let scheduleEnd = isTime(item.end_time) ? item.end_time : inferredEnd || "17:00";
    if (scheduleEnd <= scheduleStart) scheduleEnd = addHour(scheduleStart) || "23:00";
    const allScheduleDates = arrangementDates(item.start_date, item.end_date);
    const scheduleDates = canEditAgenda
        ? allScheduleDates
        : allScheduleDates.filter(date => item.agenda.some(entry => entry.date === date));
    const scheduleDateCount = scheduleDates.length;
    const scheduleDateLabel = `${scheduleDateCount} ${scheduleDateCount === 1 ? "dag" : "dagar"}`;
    const scheduleEntryLabel = `${item.agenda.length} ${item.agenda.length === 1 ? "programpunkt" : "programpunkter"}`;
    const expandedDates = arrangementDayExpansion.get(item.id);
    const scheduleDays = scheduleDates.map(date => {
        const entries = item.agenda.filter(entry => entry.date === date);
        const dayIsOpen = expandedDates ? expandedDates.has(date) : false;
        const countLabel = entries.length === 1 ? "1 programpunkt" : `${entries.length} programpunkter`;
        const startTimes = entries.map(entry => entry.time).filter(isTime);
        const eventTimes = entries.flatMap(entry => {
            const startTime = isTime(entry.time) ? entry.time : "";
            const endTime = isTime(entry.end_time) && (!startTime || entry.end_time > startTime)
                ? entry.end_time
                : startTime ? addHour(startTime) : "";
            return [startTime, endTime];
        }).filter(isTime);
        const timedMinutes = startTimes.map(time => {
            const [hours, minutes] = time.split(":").map(Number);
            return hours * 60 + minutes;
        });
        const timelineMinutes = eventTimes.map(time => {
            const [hours, minutes] = time.split(":").map(Number);
            return hours * 60 + minutes;
        });
        const times = new Set(eventTimes);
        if (timedMinutes.length && timelineMinutes.length) {
            const firstHour = Math.floor(Math.min(...timedMinutes) / 60) * 60 + 60;
            const lastTime = Math.max(...timelineMinutes);
            for (let minute = firstHour; minute < lastTime; minute += 60) {
                times.add(`${String(Math.floor(minute / 60)).padStart(2, "0")}:00`);
            }
        }
        const sortedTimes = [...times].sort((left, right) => left.localeCompare(right));
        if (!entries.length) {
            times.add(scheduleStart);
            times.add(scheduleEnd);
            const startMinutes = Number(scheduleStart.slice(0, 2)) * 60 + Number(scheduleStart.slice(3));
            const endMinutes = Number(scheduleEnd.slice(0, 2)) * 60 + Number(scheduleEnd.slice(3));
            for (let minute = Math.floor(startMinutes / 60) * 60 + 60; minute <= endMinutes; minute += 60) {
                if (minute < 1440) times.add(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
            }
        }
        const timePoints = [...(entries.some(entry => !isTime(entry.time)) ? [""] : []), ...[...times].sort((left, right) => left.localeCompare(right))];
        const timeRowHeights = timePoints.map((time, index) => {
            if (!isTime(time)) return "48px";
            const nextTime = timePoints.slice(index + 1).find(isTime);
            if (!nextTime) return "48px";
            const currentMinutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
            const nextMinutes = Number(nextTime.slice(0, 2)) * 60 + Number(nextTime.slice(3));
            return `${((nextMinutes - currentMinutes) * 48 / 60).toFixed(2)}px`;
        });
        const scheduleEvents = entries.flatMap(entry => {
            const startTime = isTime(entry.time) ? entry.time : "";
            const endTime = isTime(entry.end_time) && (!startTime || entry.end_time > startTime)
                ? entry.end_time
                : startTime ? addHour(startTime) : "";
            const sharedSegments = entry.shared !== false ? getSharedSegments(entry.excluded_departments || []) : [];
            const targets = entry.shared !== false
                ? sharedSegments.length ? [{ key: "shared", department: null, segments: sharedSegments }] : []
                : selectedDepartments.filter(department => entry.departments.includes(department)).map(department => ({ key: department, department }));
            const startMinutes = startTime ? Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) : 0;
            const endMinutes = isTime(endTime)
                ? Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3))
                : startTime ? startMinutes + 60 : 1440;
            return targets.map(target => ({
                entry,
                startTime,
                endTime,
                department: target.department,
                segments: target.segments,
                startMinutes,
                endMinutes,
                laneIndex: 0,
                laneCount: 1
            }));
        });
        const laneGroups = new Map();
        scheduleEvents.forEach(event => {
            const key = JSON.stringify([event.department || "shared", Boolean(event.startTime)]);
            if (!laneGroups.has(key)) laneGroups.set(key, []);
            laneGroups.get(key).push(event);
        });
        laneGroups.forEach(eventsInLane => {
            const sortedEvents = [...eventsInLane].sort((left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes);
            let cluster = [];
            let clusterEnd = -1;
            const assignClusterLanes = () => {
                if (!cluster.length) return;
                const laneEnds = [];
                cluster.forEach(event => {
                    let laneIndex = laneEnds.findIndex(end => end <= event.startMinutes);
                    if (laneIndex < 0) {
                        laneIndex = laneEnds.length;
                        laneEnds.push(event.endMinutes);
                    } else {
                        laneEnds[laneIndex] = event.endMinutes;
                    }
                    event.laneIndex = laneIndex;
                });
                cluster.forEach(event => { event.laneCount = laneEnds.length; });
            };
            sortedEvents.forEach(event => {
                if (cluster.length && event.startMinutes >= clusterEnd) {
                    assignClusterLanes();
                    cluster = [];
                    clusterEnd = -1;
                }
                cluster.push(event);
                clusterEnd = Math.max(clusterEnd, event.endMinutes);
            });
            assignClusterLanes();
        });
        const timeLabels = timePoints.map((time, index) => {
            const label = time ? time.endsWith(":00") ? time : "" : "Heldag";
            const className = label ? "arrangement-schedule-time" : "arrangement-schedule-time-marker";
            const element = label ? "time" : "span";
            return `<${element} class="${className}" style="grid-column:1;grid-row:${index + 1}"${label ? "" : " aria-hidden=\"true\""}>${escapeArrangementHtml(label)}</${element}>`;
        }).join("");
        const emptyCells = timePoints.map((time, rowIndex) => selectedDepartments.map((department, departmentIndex) => {
            const timeLabel = time || "Heldag";
            const hourClass = isTime(time) && time.endsWith(":00") ? " arrangement-schedule-slot--hour" : "";
            const addAttributes = canEditAgenda
                ? `type="button" data-add-agenda data-add-agenda-arrangement="${escapeArrangementHtml(item.id)}" data-add-agenda-date="${escapeArrangementHtml(date)}" data-add-agenda-time="${escapeArrangementHtml(time)}" data-add-agenda-department="${escapeArrangementHtml(department)}" aria-label="Lägg till programpunkt ${escapeArrangementHtml(timeLabel)} för ${escapeArrangementHtml(department)}" title="Lägg till programpunkt"`
                : `type="button" disabled aria-hidden="true"`;
            return `<button ${addAttributes} class="arrangement-schedule-slot department-tone-${departments.indexOf(department)}${hourClass}" style="grid-column:${departmentIndex + 2};grid-row:${rowIndex + 1}"></button>`;
        }).join("")).join("");
        const eventMarkup = scheduleEvents.map(event => {
            const startIndex = timePoints.indexOf(event.startTime);
            const startRow = startIndex + 1;
            const endIndex = event.endTime ? timePoints.indexOf(event.endTime) : -1;
            const endRow = endIndex > startIndex ? endIndex + 1 : startRow + 1;
            const departmentIndex = event.department === null ? -1 : selectedDepartments.indexOf(event.department);
            const tone = event.department === null ? null : departments.indexOf(event.department);
            const laneWidth = (100 / event.laneCount).toFixed(4);
            const laneOffset = (event.laneIndex * 100 / event.laneCount).toFixed(4);
            const laneGap = 4;
            const width = event.laneCount > 1 ? `calc(${laneWidth}% - ${(laneGap * (event.laneCount - 1) / event.laneCount).toFixed(2)}px)` : "100%";
            const offset = event.laneIndex ? `calc(${laneOffset}% + ${(event.laneIndex * laneGap / event.laneCount).toFixed(2)}px)` : "0px";
            const card = renderScheduleEntry(event.entry, tone, item.id, isArrangementDetailEditable(item));
            const durationMinutes = event.endMinutes - event.startMinutes;
            const durationClass = `${durationMinutes > 60 ? " arrangement-schedule-event--multi-hour" : ""}${event.startTime && durationMinutes < 60 ? " arrangement-schedule-event--short" : ""}`;
            const departmentSpan = event.department === null
                ? event.segments.reduce((total, segment) => total + segment.endColumn - segment.startColumn, 0)
                : Math.max(1, event.entry.departments.filter(department => selectedDepartments.includes(department)).length);
            const stackingOrder = 1000 - departmentSpan * 100 + (event.department === null ? 0 : 1);
            const segments = event.department === null ? event.segments : [{ startColumn: departmentIndex + 2, endColumn: departmentIndex + 3 }];
            const mainSegmentIndex = segments.reduce((largestIndex, segment, index) => segment.endColumn - segment.startColumn > segments[largestIndex].endColumn - segments[largestIndex].startColumn ? index : largestIndex, 0);
            return segments.map((segment, segmentIndex) => {
                const continuationClass = segmentIndex === mainSegmentIndex ? "" : " arrangement-schedule-event--continuation";
                return `<div class="arrangement-schedule-event${durationClass}${event.department === null ? " arrangement-schedule-event--shared" : ""}${continuationClass}" style="grid-column:${segment.startColumn}/${segment.endColumn};grid-row:${startRow}/${endRow};--lane-width:${width};--lane-offset:${offset};--event-z-index:${stackingOrder}">${card}</div>`;
            }).join("");
        }).join("");
        const headers = selectedDepartments.map(department => `<span class="arrangement-schedule-department department-tone-${departments.indexOf(department)}">${escapeArrangementHtml(department)}</span>`).join("");
        const showScheduleGrid = scheduleEvents.length > 0 || entries.length === 0;
        const grid = showScheduleGrid ? `<div class="arrangement-schedule-grid" style="--department-count:${departmentCount};--schedule-rows:${timeRowHeights.join(" ")}">${timeLabels}${emptyCells}${eventMarkup}</div>` : `<p class="arrangement-day-empty">Inga programpunkter den här dagen.</p>`;
        return `<details class="arrangement-day" data-arrangement-id="${escapeArrangementHtml(item.id)}" data-arrangement-date="${escapeArrangementHtml(date)}"${dayIsOpen ? " open" : ""}><summary class="arrangement-day-summary"><h3>${escapeArrangementHtml(formatArrangementDate(date))}</h3><span>${countLabel}</span></summary><div class="arrangement-day-content"><div class="arrangement-schedule-header"><span>Tid</span><div class="arrangement-schedule-columns" style="--department-count:${departmentCount}">${headers}</div></div>${grid}</div></details>`;
    }).join("");
    const isSchemaExpanded = arrangementSchemaExpansion.has(item.id);
    const viewControls = `<div class="arrangement-schedule-view-toggle" role="group" aria-label="Schemalayout"><button type="button" data-toggle-schedule-overview="${escapeArrangementHtml(item.id)}" data-schedule-view="days" aria-pressed="${!showOverview}">Dag för dag</button><button type="button" data-toggle-schedule-overview="${escapeArrangementHtml(item.id)}" data-schedule-view="overview" aria-pressed="${showOverview}">Helhetsschema</button></div>`;
    const scheduleContent = showOverview
        ? renderArrangementScheduleOverview(item, selectedDepartments, canEditAgenda)
        : `<div class="arrangement-schedule-days">${scheduleDays}</div>`;
    return `<details class="arrangement-schedule" data-arrangement-id="${escapeArrangementHtml(item.id)}"${isSchemaExpanded ? " open" : ""}><summary class="arrangement-section-summary"><strong>Schema</strong><span>${scheduleDateLabel} · ${scheduleEntryLabel}</span></summary><div class="arrangement-schedule-body">${viewControls}${scheduleContent}</div></details>`;
}

function renderArrangementMealSummary(item, canEdit = false) {
    const mealsByDate = new Map();
    (item.agenda || []).filter(entry => entry.kind === "meal")
        .sort((left, right) => left.date.localeCompare(right.date) || (left.time || "99:99").localeCompare(right.time || "99:99"))
        .forEach(entry => {
            const mealRecipes = [...new Set(getMealRecipeIds(entry)
                .map(id => recipes.find(recipe => String(recipe.id) === id)?.namn)
                .filter(Boolean))];
            const mealType = entry.meal_type || entry.title || "Måltid";
            const mealContents = mealRecipes.length
                ? mealRecipes.join(", ")
                : entry.meal_type && entry.title !== entry.meal_type ? entry.title : "";
            const mealName = mealContents ? `${mealType}: ${mealContents}` : mealType;
            if (!mealsByDate.has(entry.date)) mealsByDate.set(entry.date, []);
            mealsByDate.get(entry.date).push({ entry, name: mealName });
        });
    if (!mealsByDate.size && !canEdit) return "";
    const rows = [...mealsByDate].map(([date, meals]) =>
        `<section class="arrangement-meal-day"><h4><time datetime="${escapeArrangementHtml(date)}">${escapeArrangementHtml(formatArrangementDate(date))}</time></h4><ul>${meals.map(({ entry, name }) => {
            const mealLabel = escapeArrangementHtml(name);
            const mealContent = canEdit
                ? `<button class="arrangement-meal-entry" type="button" data-edit-agenda="${escapeArrangementHtml(entry.id)}" data-arrangement-id="${escapeArrangementHtml(item.id)}" aria-label="Redigera måltid: ${mealLabel}" title="Redigera eller ta bort måltid">${mealLabel}</button>`
                : mealLabel;
            return `<li>${mealContent}</li>`;
        }).join("")}</ul></section>`
    ).join("");
    const mealCount = [...mealsByDate.values()].reduce((count, meals) => count + meals.length, 0);
    const mealCountLabel = `${mealCount} ${mealCount === 1 ? "måltid" : "måltider"}`;
    const isOpen = !collapsedArrangementMeals.has(item.id);
    const mealContent = rows
        ? `<div class="arrangement-meal-summary-days">${rows}</div>`
        : `<p class="arrangement-meals-empty">Inga måltider planerade.</p>`;
    const addMealButton = canEdit
        ? `<button class="btn-secondary arrangement-meal-add" type="button" data-add-meal="${escapeArrangementHtml(item.id)}">+ Lägg till mat</button>`
        : "";
    return `<details class="arrangement-meal-summary" data-arrangement-id="${escapeArrangementHtml(item.id)}"${isOpen ? " open" : ""}><summary><h3>Måltider</h3><span>${mealCountLabel}</span></summary>${mealContent}${addMealButton}</details>`;
}

function renderScheduleEntry(entry, departmentIndex = null, arrangementId = "", canEdit = false) {
    const tone = departmentIndex === null ? "arrangement-schedule-item--shared" : `department-tone-${departmentIndex}`;
    const leadersOnly = entry.kind !== "meal" && Boolean(entry.leaders_only);
    const formattedTime = /^\d{2}:\d{2}$/.test(entry.time || "") ? `${Number(entry.time.slice(0, 2))}:${entry.time.slice(3)}` : "";
    const mealRecipes = entry.kind === "meal"
        ? [...new Set(getMealRecipeIds(entry).map(id => recipes.find(recipe => String(recipe.id) === id)?.namn).filter(Boolean))]
        : [];
    const mealType = mealRecipes.length
        ? ` (${mealRecipes.map(escapeArrangementHtml).join(", ")})`
        : entry.kind === "meal" && entry.meal_type ? ` (${escapeArrangementHtml(entry.meal_type)})` : "";
    const title = `${formattedTime ? `${escapeArrangementHtml(formattedTime)}: ` : ""}${escapeArrangementHtml(entry.title)}${mealType}`;
    const audienceLabel = leadersOnly ? '<small class="arrangement-schedule-audience">Ledare</small>' : "";
    const responsible = entry.responsible ? `<small class="arrangement-schedule-responsible">Ansvarig: ${escapeArrangementHtml(entry.responsible)}</small>` : "";
    const notes = entry.notes ? `<small class="arrangement-schedule-notes" title="${escapeArrangementHtml(entry.notes)}">${escapeArrangementHtml(entry.notes)}</small>` : "";
    const gestureHandles = canEdit && parseScheduleTime(entry.time) !== null
        ? `<span class="arrangement-schedule-drag-handle" data-agenda-drag-handle title="Dra för att flytta starttiden" aria-hidden="true"></span><span class="arrangement-schedule-resize-handle" data-agenda-resize-handle title="Dra för att ändra längden" aria-hidden="true"></span>`
        : "";
    const actionLabel = entry.kind === "activity" ? "Redigera aktivitet" : entry.kind === "meal" ? "Redigera måltid" : "Redigera programpunkt";
    const editAttributes = canEdit ? `data-edit-agenda="${escapeArrangementHtml(entry.id)}" data-arrangement-id="${escapeArrangementHtml(arrangementId)}" aria-label="${actionLabel}: ${escapeArrangementHtml(entry.title)}" title="Klicka för att redigera. Dra i greppet för att flytta starttiden och i nederkanten för att ändra längden."` : "disabled aria-disabled=\"true\"";
    return `<button type="button" class="arrangement-schedule-item ${tone}${leadersOnly ? " arrangement-schedule-item--leaders-only" : ""}" ${editAttributes}><span class="arrangement-schedule-heading"><strong>${title}</strong>${audienceLabel}</span>${responsible}${notes}${gestureHandles}</button>`;
}

function renderArrangements() {
    const query = document.getElementById("arrangementSearch").value.trim().toLocaleLowerCase("sv");
    const selectedStatus = document.getElementById("arrangementStatusFilter").value;
    const visible = arrangements.filter(item => {
        const matchesQuery = !query || `${item.title} ${item.description} ${item.location}`.toLocaleLowerCase("sv").includes(query);
        return matchesQuery && (selectedStatus === "all" || item.status === selectedStatus);
    });

    const orderedVisible = [...visible].sort((left, right) => left.start_date.localeCompare(right.start_date) || left.title.localeCompare(right.title, "sv"));
    const renderedCards = orderedVisible.map(item => {
        const participantTags = item.departments.map((department, index) => `<span class="arrangement-department-tag department-tone-${departments.indexOf(department)}">${escapeArrangementHtml(department)}</span>`).join("");
        const agendaHtml = renderArrangementSchedule(item);
        const canEditDetails = isArrangementDetailEditable(item);
        const mealSummaryHtml = renderArrangementMealSummary(item, canEditDetails);
        const link = item.planning_ref?.name ? `<p class="arrangement-card-planning">Planering: ${escapeArrangementHtml(item.planning_ref.name)}</p>` : "";
        const lockAction = canEditDetails ? "Lås redigering" : "Lås upp för redigering";
        const lockIcon = canEditDetails
            ? `<path fill="currentColor" d="M18 8h-1V6a5 5 0 0 0-9.9-1h2.05A3 3 0 0 1 15 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2Zm-6 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/>`
            : `<path fill="currentColor" d="M18 8h-1V6a5 5 0 0 0-10 0v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2ZM9 6a3 3 0 0 1 6 0v2H9V6Zm3 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/>`;
        const detailEditControl = isArrangementEditable(item)
            ? `<div class="arrangement-detail-edit-control${canEditDetails ? " arrangement-detail-edit-control--active" : ""}"><button class="btn-secondary arrangement-detail-edit-toggle" type="button" data-toggle-arrangement-edit="${escapeArrangementHtml(item.id)}" aria-label="${lockAction} för ${escapeArrangementHtml(item.title)}" title="${lockAction} för ${escapeArrangementHtml(item.title)}" aria-pressed="${canEditDetails}"><svg viewBox="0 0 24 24" aria-hidden="true">${lockIcon}</svg></button></div>`
            : "";
        const responsibilityCountLabel = item.responsibilities.length === 1 ? "1 roll" : `${item.responsibilities.length} roller`;
        const canEditResponsibilities = canEditDetails;
        const addResponsibilityButton = canEditResponsibilities
            ? `<button class="btn-secondary arrangement-responsibility-add" type="button" data-add-responsibility="${escapeArrangementHtml(item.id)}">+ Lägg till ansvarig</button>`
            : "";
        const responsibilityHtml = item.responsibilities.length || canEditResponsibilities
            ? `<div class="arrangement-responsibilities-overview"><details class="arrangement-responsibilities-summary" data-arrangement-id="${escapeArrangementHtml(item.id)}"><summary class="arrangement-section-summary"><strong>Ansvariga och roller</strong><span>${responsibilityCountLabel}</span></summary><div class="arrangement-responsibilities-summary-list">${item.responsibilities.length ? item.responsibilities.map(entry => {
                const roleDescription = String(entry.role_description || "").trim();
                const description = String(entry.description || "").trim();
                const roleDescriptionHtml = roleDescription ? `<p><strong>Rollbeskrivning</strong>${escapeArrangementHtml(roleDescription)}</p>` : "";
                const descriptionHtml = description && description !== roleDescription ? `<p><strong>Ansvar</strong>${escapeArrangementHtml(description)}</p>` : "";
                const responsibilityActions = canEditResponsibilities
                    ? `<div class="arrangement-responsibility-summary-actions"><button class="arrangement-responsibility-edit" type="button" data-edit-responsibility="${escapeArrangementHtml(entry.id)}" data-arrangement-id="${escapeArrangementHtml(item.id)}" aria-label="Redigera ${escapeArrangementHtml(entry.person || "ansvarspost")}" title="Redigera ansvarig"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg></button><button class="arrangement-delete-icon arrangement-responsibility-delete" type="button" data-delete-responsibility="${escapeArrangementHtml(entry.id)}" data-arrangement-id="${escapeArrangementHtml(item.id)}" aria-label="Ta bort ${escapeArrangementHtml(entry.person || "ansvarspost")}" title="Ta bort ansvarig"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z"/></svg></button></div>`
                    : "";
                return `<details class="arrangement-responsibility-summary-item" data-responsibility-id="${escapeArrangementHtml(entry.id)}"><summary><span class="arrangement-responsibility-summary-role">${escapeArrangementHtml(entry.role || "Övrig")}</span><span class="arrangement-responsibility-summary-separator" aria-hidden="true">:</span><span class="arrangement-responsibility-summary-person">${escapeArrangementHtml(entry.person || "Ansvarspost")}</span></summary><div class="arrangement-responsibility-summary-details"><div class="arrangement-responsibility-summary-info">${roleDescriptionHtml}${descriptionHtml}</div>${responsibilityActions}</div></details>`;
            }).join("") : `<p class="arrangement-responsibilities-empty">Inga ansvariga tillagda.</p>`}</div>${addResponsibilityButton}</details></div>`
            : "";
        const detailsOpen = expandedArrangementIds.has(item.id);
        const cardWidth = detailsOpen && item.departments.length > 2 ? " arrangement-card--wide" : "";
        const canShare = !item.local_only && window.GTScoutArrangements?.canWrite?.();
        const actions = isArrangementEditable(item)
            ? `<div class="arrangement-card-actions"><button class="btn-secondary" type="button" data-edit-arrangement="${escapeArrangementHtml(item.id)}">Redigera</button><button class="btn-secondary" type="button" data-copy-arrangement="${escapeArrangementHtml(item.id)}">Kopiera</button>${canShare ? `<button class="btn-secondary share-arrangement-btn" type="button" data-share-arrangement="${escapeArrangementHtml(item.id)}" aria-label="Dela arrangemang" title="Dela arrangemang"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M18,16.08C17.24,16.08 16.54,16.38 16,16.85L8.91,12.74C8.96,12.5 9,12.25 8.91,11.26L15.92,7.17C16.47,7.66 17.2,7.97 18,7.97C19.66,7.97 21,6.63 21,4.97C21,3.31 19.66,1.97 18,1.97C16.34,1.97 15,3.31 15,4.97C15,5.22 15.04,5.47 15.09,5.71L8.08,9.8C7.53,9.31 6.8,9 6,9C4.34,9 3,10.34 3,12C3,13.66 4.34,15 6,15C6.8,15 7.53,14.69 8.08,14.2L15.17,18.31C15.12,18.54 15,18.77 15,19C15,20.66 16.34,22 18,22C19.66,22 21,20.66 21,19C21,17.34 19.66,16.08 18,16.08Z"/></svg></button>` : ""}<button class="arrangement-delete-icon" type="button" data-delete-arrangement="${escapeArrangementHtml(item.id)}" aria-label="Ta bort ${escapeArrangementHtml(item.title)}" title="Ta bort arrangemang"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z"/></svg></button></div>`
            : "";
        const notes = String(item.notes || "").trim();
        const checklist = item.checklist || [];
        const description = String(item.description || "").trim();
        const notesContent = canEditDetails
            ? `<button class="arrangement-notes-preview" type="button" data-edit-arrangement-notes="${escapeArrangementHtml(item.id)}" aria-label="Redigera anteckningar för ${escapeArrangementHtml(item.title)}"><span>${notes ? escapeArrangementHtml(notes) : "Inga anteckningar ännu. Klicka för att lägga till."}</span><span class="arrangement-notes-preview-hint">Klicka för att redigera</span></button>`
            : `<p>${notes ? escapeArrangementHtml(notes) : "Inga anteckningar."}</p>`;
        const notesOpen = !collapsedArrangementNotes.has(item.id);
        const notesHtml = notes || canEditDetails
            ? `<details class="arrangement-detail-notes" data-arrangement-id="${escapeArrangementHtml(item.id)}"${notesOpen ? " open" : ""}><summary><h3>Anteckningar</h3></summary>${notesContent}</details>`
            : "";
        const checklistHtml = renderArrangementChecklist(checklist, item.id, canEditDetails);
        const timeRange = [item.start_time, item.end_time].filter(Boolean).join("–");
        return `<details class="arrangement-card${cardWidth}" data-arrangement-id="${escapeArrangementHtml(item.id)}" data-department-count="${item.departments.length}"${detailsOpen ? " open" : ""}><summary class="arrangement-card-summary"><div class="arrangement-card-summary-title"><h2>${escapeArrangementHtml(item.title)}</h2><span class="arrangement-card-type arrangement-card-summary-type">${escapeArrangementHtml(item.type)}</span><span class="arrangement-status arrangement-status--${escapeArrangementHtml(item.status)}">${escapeArrangementHtml(statusLabels[item.status] || statusLabels.planned)}</span></div><p class="arrangement-card-dates"><span>${escapeArrangementHtml(formatDateSpan(item))}</span>${timeRange ? `<span class="arrangement-card-summary-times"> · ${escapeArrangementHtml(timeRange)}</span>` : ""}</p>${description ? `<p class="arrangement-card-description">${escapeArrangementHtml(description)}</p>` : ""}${item.location ? `<p class="arrangement-card-location"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/></svg><span>${escapeArrangementHtml(item.location)}</span></p>` : ""}<div class="arrangement-participant-tags">${participantTags}</div></summary><div class="arrangement-card-details">${detailEditControl}${link}<div class="arrangement-card-sections">${notesHtml}${checklistHtml}${mealSummaryHtml}${responsibilityHtml}${agendaHtml}</div>${actions}</div></details>`;
    });
    const cardsByYear = new Map();
    orderedVisible.forEach((item, index) => {
        const year = item.start_date.slice(0, 4);
        if (!cardsByYear.has(year)) cardsByYear.set(year, []);
        cardsByYear.get(year).push(renderedCards[index]);
    });
    arrangementsGrid.innerHTML = [...cardsByYear].map(([year, cards]) => {
        const countLabel = `${cards.length} st.`;
        const isOpen = !collapsedArrangementYears.has(year);
        return `<details class="arrangement-year-group" data-arrangement-year="${escapeArrangementHtml(year)}"${isOpen ? " open" : ""}><summary class="arrangement-year-summary"><strong>${escapeArrangementHtml(year)}</strong><span>${countLabel}</span></summary><div class="arrangement-year-cards">${cards.join("")}</div></details>`;
    }).join("");
    arrangementsGrid.querySelectorAll(".arrangement-card").forEach(card => {
        const editControl = card.querySelector(".arrangement-detail-edit-control");
        const actions = card.querySelector(".arrangement-card-actions");
        if (editControl && actions) actions.prepend(editControl);
        const editUnlocked = arrangementDetailEditModes.has(card.dataset.arrangementId);
        const editArrangementButton = actions?.querySelector("[data-edit-arrangement]");
        if (editArrangementButton) {
            if (editUnlocked) {
                editArrangementButton.className = "btn-secondary arrangement-edit-details-icon";
                editArrangementButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>`;
                editArrangementButton.setAttribute("aria-label", `Redigera arrangemangsdetaljer för ${card.querySelector(".arrangement-card-summary h2")?.textContent || "arrangemanget"}`);
                editArrangementButton.title = "Redigera arrangemangsdetaljer";
                card.querySelector(".arrangement-card-summary-title")?.append(editArrangementButton);
            } else {
                editArrangementButton.remove();
            }
        }
    });

    arrangementsEmpty.classList.toggle("hidden", visible.length > 0);
    arrangementsGrid.classList.toggle("hidden", visible.length === 0);
    if (!visible.length) {
        arrangementsEmpty.textContent = isSharedArrangementView
            ? "Det delade arrangemanget kunde inte visas. Kontrollera att länken fortfarande är aktiv."
            : arrangements.length ? "Inga arrangemang matchar filtreringen." : "Inga arrangemang ännu. Skapa ett för att börja planera.";
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

function getCatalogOptions(kind, selectedSourceType = "", selectedSourceId = "", fallbackTitle = "") {
    const catalog = kind === "meal" ? recipes.map(item => ({ sourceType: "recipe", id: String(item.id), name: String(item.namn || "") }))
        : kind === "activity" ? activities.map(item => ({ sourceType: "activity", id: String(item.id), name: String(item.namn || "") }))
            : [];
    const validSelection = catalog.some(item => item.id === selectedSourceId && item.sourceType === selectedSourceType);
    const oldLabel = !validSelection && selectedSourceId ? `<option value="${escapeArrangementHtml(`${selectedSourceType}:${selectedSourceId}`)}" selected>${escapeArrangementHtml(`${fallbackTitle || draftAgenda.find(item => item.source_id === selectedSourceId)?.title || "Tidigare bibliotekspost"} (inte längre i biblioteket)`)}</option>` : "";
    return `<option value="">Egen post</option>${oldLabel}${catalog.map(item => `<option value="${escapeArrangementHtml(`${item.sourceType}:${item.id}`)}"${item.id === selectedSourceId && item.sourceType === selectedSourceType ? " selected" : ""}>${escapeArrangementHtml(item.name)}</option>`).join("")}`;
}

function getMealRecipeIds(entry) {
    if (Array.isArray(entry.recipe_ids)) return entry.recipe_ids.map(String);
    return entry.source_type === "recipe" && entry.source_id ? [String(entry.source_id)] : [];
}

function renderMealRecipePicker(entry) {
    const selectedIds = getMealRecipeIds(entry);
    const groups = new Map();
    recipes.forEach(recipe => {
        const category = String(recipe.kategori || "Övrigt").trim() || "Övrigt";
        if (!groups.has(category)) groups.set(category, []);
        const id = String(recipe.id);
        groups.get(category).push({ id, name: String(recipe.namn || "Recept utan namn") });
    });
    selectedIds.filter(id => !recipes.some(recipe => String(recipe.id) === id)).forEach(id => {
        if (!groups.has("Tidigare recept")) groups.set("Tidigare recept", []);
        const fallback = selectedIds.length === 1 ? entry.title || "Tidigare recept" : `Tidigare recept ${id}`;
        groups.get("Tidigare recept").push({ id, name: `${fallback} (inte längre i kokboken)`, unavailable: true });
    });
    const categoryOrder = ["Frukost", "Lunch", "Fika", "Middag", "Kvällsmål", "Lägerbål"];
    const groupMarkup = [...groups.entries()].sort(([left], [right]) => {
        const leftIndex = categoryOrder.indexOf(left);
        const rightIndex = categoryOrder.indexOf(right);
        if (leftIndex >= 0 || rightIndex >= 0) {
            if (leftIndex < 0) return 1;
            if (rightIndex < 0) return -1;
            return leftIndex - rightIndex;
        }
        return left.localeCompare(right, "sv");
    }).map(([category, groupRecipes]) => {
        const recipeChoices = groupRecipes.sort((left, right) => left.name.localeCompare(right.name, "sv")).map(recipe =>
            `<label class="agenda-recipe-choice"><input class="agenda-recipe-target" type="checkbox" value="${escapeArrangementHtml(recipe.id)}"${selectedIds.includes(recipe.id) ? " checked" : ""}><span>${escapeArrangementHtml(recipe.name)}</span></label>`
        ).join("");
        const hasSelectedRecipes = groupRecipes.some(recipe => selectedIds.includes(recipe.id));
        return `<details class="agenda-recipe-category"${hasSelectedRecipes ? " open" : ""}><summary>${escapeArrangementHtml(category)}</summary>${recipeChoices}</details>`;
    }).join("");
    const emptyMessage = groups.size ? "" : "<small>Inga recept i kokboken ännu. Du kan ändå skriva ett eget namn.</small>";
    return `<div class="agenda-recipe-picker"><span>Recept</span><label class="agenda-recipe-search-field"><span>Sök recept</span><input class="agenda-recipe-search" type="search" placeholder="Börja skriva ett receptnamn" autocomplete="off"></label><div class="agenda-recipe-selection"><span class="agenda-recipe-summary" role="status" aria-live="polite"></span><button class="agenda-recipe-clear" type="button" data-clear-agenda-recipes>Rensa val</button></div><div class="agenda-recipe-options" role="group" aria-label="Recept">${groupMarkup}</div><small class="agenda-recipe-no-results hidden" role="status">Inga recept matchar sökningen.</small>${emptyMessage}</div>`;
}

function updateMealRecipePicker(picker) {
    if (!picker) return;
    const query = picker.querySelector(".agenda-recipe-search")?.value.trim().toLocaleLowerCase("sv") || "";
    const options = [...picker.querySelectorAll(".agenda-recipe-choice")];
    options.forEach(option => { option.hidden = !option.textContent.toLocaleLowerCase("sv").includes(query); });
    const selectedOptions = options.filter(option => option.querySelector(".agenda-recipe-target")?.checked);
    const selectedNames = selectedOptions.map(option => option.querySelector("span")?.textContent.trim()).filter(Boolean);
    const summary = picker.querySelector(".agenda-recipe-summary");
    if (summary) {
        const previewNames = selectedNames.slice(0, 3).join(", ");
        const remainingCount = selectedNames.length - Math.min(selectedNames.length, 3);
        summary.textContent = selectedNames.length
            ? `${selectedNames.length} valda: ${previewNames}${remainingCount ? `, +${remainingCount} fler` : ""}`
            : "Inga recept valda";
        summary.title = selectedNames.join(", ");
    }
    const clearButton = picker.querySelector("[data-clear-agenda-recipes]");
    if (clearButton) clearButton.disabled = selectedNames.length === 0;
    const noResults = picker.querySelector(".agenda-recipe-no-results");
    if (noResults) noResults.classList.toggle("hidden", !query || options.some(option => !option.hidden));
    picker.querySelectorAll(".agenda-recipe-category").forEach(group => {
        const hasVisibleRecipes = [...group.querySelectorAll(".agenda-recipe-choice")].some(option => !option.hidden);
        const hasSelectedRecipes = group.querySelector(".agenda-recipe-target:checked") !== null;
        group.hidden = !hasVisibleRecipes;
        group.open = query ? hasVisibleRecipes : hasSelectedRecipes;
    });
}

function appendAgendaLeadersOnlyField(container, entry) {
    if (!container || entry.kind === "meal") return;
    const scope = container.matches(".agenda-entry-scope") ? container : container.querySelector(".agenda-entry-scope");
    if (!scope) return;
    const label = document.createElement("label");
    label.className = "agenda-entry-leaders-only";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.agendaField = "leaders_only";
    checkbox.checked = Boolean(entry.leaders_only);
    const text = document.createElement("span");
    text.textContent = "Ledare";
    label.append(checkbox, text);
    const sharedChoice = scope.querySelector(".agenda-shared-choice");
    if (!sharedChoice) {
        scope.append(label);
        return;
    }
    const toggles = document.createElement("div");
    toggles.className = "agenda-scope-toggles";
    sharedChoice.before(toggles);
    toggles.append(sharedChoice, label);
}

function renderAgendaEditor() {
    const startDate = document.getElementById("arrangementStartDate").value;
    const endDate = document.getElementById("arrangementEndDate").value || startDate;
    const selectedDepartments = getSelectedArrangementDepartments();
    draftAgenda.sort((left, right) => left.date.localeCompare(right.date) || (left.time || "99:99").localeCompare(right.time || "99:99"));
    arrangementAgendaList.innerHTML = draftAgenda.map(entry => {
        const recipeField = entry.kind === "meal" ? renderMealRecipePicker(entry) : "";
        const sourceField = entry.kind === "activity" ? `<label class="agenda-entry-field"><span>Aktivitet</span><select data-agenda-field="source">${getCatalogOptions(entry.kind, entry.source_type, entry.source_id, entry.title)}</select></label>` : "";
        const shared = entry.shared !== false;
        const scopeDepartments = shared
            ? selectedDepartments.filter(department => !(entry.excluded_departments || []).includes(department))
            : entry.departments;
        const scopeOptions = departments.map(department => {
            const isActive = selectedDepartments.includes(department);
            const isChecked = scopeDepartments?.includes(department);
            return `<label class="arrangement-department-choice department-tone-${departments.indexOf(department)}"><input class="agenda-department-target" type="checkbox" value="${escapeArrangementHtml(department)}"${isChecked ? " checked" : ""}${isActive ? "" : " disabled"}><span>${escapeArrangementHtml(department)}</span></label>`;
        }).join("");
        const inactiveScopeNote = !shared && entry.departments?.some(department => !selectedDepartments.includes(department))
            ? `<small class="agenda-scope-hidden-note">Posten visas bara om dess avdelning väljs för arrangemanget.</small>`
            : "";
        const scopeField = `<div class="agenda-entry-scope"><span>${shared ? "Avdelningar som deltar" : "Gäller avdelningar"}</span><label class="agenda-shared-choice"><input data-agenda-field="shared" type="checkbox"${shared ? " checked" : ""}>Gemensamt för alla</label>${shared ? "<small class=\"agenda-scope-help\">Avmarkera avdelningar som inte ska delta.</small>" : ""}<div class="agenda-scope-options">${scopeOptions}</div>${inactiveScopeNote}</div>`;
        return `<article class="arrangement-agenda-entry" data-agenda-id="${escapeArrangementHtml(entry.id)}"><div class="arrangement-agenda-entry-top"><strong>${escapeArrangementHtml(entry.title || (entry.kind === "meal" ? "Måltid" : entry.kind === "activity" ? "Aktivitet" : "Programpunkt"))}</strong><button class="agenda-entry-remove" type="button" data-remove-agenda="${escapeArrangementHtml(entry.id)}" aria-label="Ta bort programpunkt" title="Ta bort programpunkt">&times;</button></div><div class="arrangement-agenda-entry-grid"><label class="agenda-entry-field"><span>Datum</span><input data-agenda-field="date" type="date" min="${escapeArrangementHtml(startDate)}" max="${escapeArrangementHtml(endDate)}" value="${escapeArrangementHtml(entry.date)}" required></label><label class="agenda-entry-field"><span>Start</span><input data-agenda-field="time" type="time" value="${escapeArrangementHtml(entry.time)}"></label><label class="agenda-entry-field"><span>Slut</span><input data-agenda-field="end_time" type="time" value="${escapeArrangementHtml(entry.end_time || "")}"></label><label class="agenda-entry-field"><span>Typ</span><select data-agenda-field="kind"><option value="meal"${entry.kind === "meal" ? " selected" : ""}>Mat</option><option value="activity"${entry.kind === "activity" ? " selected" : ""}>Aktivitet</option><option value="program"${entry.kind === "program" ? " selected" : ""}>Program</option></select></label>${recipeField}${sourceField}<label class="agenda-entry-field agenda-entry-title"><span>Namn</span><input data-agenda-field="title" type="text" maxlength="160" value="${escapeArrangementHtml(entry.title)}" required placeholder="Till exempel lägerbål"></label><label class="agenda-entry-field"><span>Ansvarig</span><input data-agenda-field="responsible" type="text" maxlength="120" value="${escapeArrangementHtml(entry.responsible || "")}" placeholder="Namn"></label><label class="agenda-entry-field agenda-entry-notes"><span>Anteckning</span><input data-agenda-field="notes" type="text" maxlength="240" value="${escapeArrangementHtml(entry.notes)}" placeholder="Valfri notering"></label>${scopeField}</div></article>`;
    }).join("");
    arrangementAgendaList.querySelectorAll(".arrangement-agenda-entry").forEach(row => {
        const entry = draftAgenda.find(item => item.id === row.dataset.agendaId);
        if (!entry) return;
        appendAgendaLeadersOnlyField(row.querySelector(".arrangement-agenda-entry-grid"), entry);
        row.classList.toggle("arrangement-agenda-entry--leaders-only", entry.kind !== "meal" && Boolean(entry.leaders_only));
    });
    arrangementAgendaList.querySelectorAll(".agenda-recipe-picker").forEach(updateMealRecipePicker);
    arrangementAgendaEmpty.classList.toggle("hidden", draftAgenda.length > 0);
}

function renderAgendaEntryDialog(arrangement, entry, focusField = "title") {
    activeAgendaArrangementId = arrangement.id;
    activeAgendaEntryId = entry.id;
    const selectedDepartments = arrangement.departments?.length ? arrangement.departments : departments;
    const recipeField = entry.kind === "meal" ? renderMealRecipePicker(entry) : "";
    const sourceField = entry.kind === "activity" ? `<label class="agenda-entry-field"><span>Aktivitet</span><select data-agenda-field="source">${getCatalogOptions(entry.kind, entry.source_type, entry.source_id, entry.title)}</select></label>` : "";
    const shared = entry.shared !== false;
    const scopeDepartments = shared
        ? selectedDepartments.filter(department => !(entry.excluded_departments || []).includes(department))
        : entry.departments;
    const scopeOptions = selectedDepartments.map(department => {
        const isChecked = scopeDepartments?.includes(department);
        return `<label class="arrangement-department-choice department-tone-${departments.indexOf(department)}"><input class="agenda-department-target" type="checkbox" value="${escapeArrangementHtml(department)}"${isChecked ? " checked" : ""}><span>${escapeArrangementHtml(department)}</span></label>`;
    }).join("");
    const inactiveScopeNote = !shared && entry.departments?.some(department => !selectedDepartments.includes(department))
        ? `<small class="agenda-scope-hidden-note">Posten visas bara om dess avdelning väljs för arrangemanget.</small>`
        : "";
    agendaEntryDialogFields.innerHTML = `<div class="agenda-entry-scope"><span>${shared ? "Avdelningar som deltar" : "Gäller avdelningar"}</span><label class="agenda-shared-choice"><input data-agenda-field="shared" type="checkbox"${shared ? " checked" : ""}>Gemensamt för alla</label>${shared ? "<small class=\"agenda-scope-help\">Avmarkera avdelningar som inte ska delta.</small>" : ""}<div class="agenda-scope-options">${scopeOptions}</div>${inactiveScopeNote}</div><label class="agenda-entry-field agenda-entry-title"><span>Namn</span><input data-agenda-field="title" type="text" maxlength="160" value="${escapeArrangementHtml(entry.title)}" required placeholder="${entry.kind === "meal" ? "Till exempel Frukost" : "Till exempel lägerbål"}"></label><label class="agenda-entry-field"><span>Datum</span><input data-agenda-field="date" type="date" min="${escapeArrangementHtml(arrangement.start_date)}" max="${escapeArrangementHtml(arrangement.end_date)}" value="${escapeArrangementHtml(entry.date)}" required></label><label class="agenda-entry-field"><span>Start</span><input data-agenda-field="time" type="time" value="${escapeArrangementHtml(entry.time || "")}"></label><label class="agenda-entry-field"><span>Slut</span><input data-agenda-field="end_time" type="time" value="${escapeArrangementHtml(entry.end_time || "")}"></label><label class="agenda-entry-field"><span>Typ</span><select data-agenda-field="kind"><option value="meal"${entry.kind === "meal" ? " selected" : ""}>Mat</option><option value="activity"${entry.kind === "activity" ? " selected" : ""}>Aktivitet</option><option value="program"${entry.kind === "program" ? " selected" : ""}>Program</option></select></label>${recipeField}${sourceField}<label class="agenda-entry-field"><span>Ansvarig</span><input data-agenda-field="responsible" type="text" maxlength="120" value="${escapeArrangementHtml(entry.responsible || "")}" placeholder="Namn"></label><label class="agenda-entry-field agenda-entry-notes"><span>Anteckningar</span><textarea data-agenda-field="notes" rows="3" maxlength="240" placeholder="Skriv anteckningar">${escapeArrangementHtml(entry.notes)}</textarea></label>`;
    appendAgendaLeadersOnlyField(agendaEntryDialogFields, entry);
    const entryLabel = entry.kind === "meal" ? "måltid" : "programpunkt";
    document.getElementById("agendaEntryDialogTitle").textContent = activeAgendaEntryIsCopy ? `Kopiera ${entryLabel}` : activeAgendaEntryIsNew ? `Ny ${entryLabel}` : `Redigera ${entryLabel}`;
    document.getElementById("agendaEntryDialogStatus").textContent = "";
    document.getElementById("copyAgendaEntryBtn").classList.toggle("hidden", !isArrangementEditable(arrangement) || activeAgendaEntryIsCopy || activeAgendaEntryIsNew);
    document.getElementById("deleteAgendaEntryBtn").classList.toggle("hidden", !isArrangementEditable(arrangement) || activeAgendaEntryIsCopy || activeAgendaEntryIsNew);
    document.getElementById("saveAgendaEntryBtn").textContent = activeAgendaEntryIsCopy ? "Lägg till kopia" : activeAgendaEntryIsNew ? "Lägg till" : "Spara";
    agendaEntryModal.classList.remove("hidden");
    agendaEntryDialogFields.querySelector(`[data-agenda-field="${focusField}"]`)?.focus();
    updateMealRecipePicker(agendaEntryDialogFields.querySelector(".agenda-recipe-picker"));
}

function readAgendaEntryDialog() {
    const value = field => agendaEntryDialogFields.querySelector(`[data-agenda-field="${field}"]`)?.value || "";
    const selectedSource = value("source");
    const [sourceType = "", ...sourceParts] = selectedSource.split(":");
    const kind = value("kind");
    const existingEntry = arrangements.find(item => item.id === activeAgendaArrangementId)?.agenda.find(entry => entry.id === activeAgendaEntryId);
    const recipeIds = [...agendaEntryDialogFields.querySelectorAll(".agenda-recipe-target:checked")].map(input => input.value);
    const shared = agendaEntryDialogFields.querySelector('[data-agenda-field="shared"]')?.checked !== false;
    const leadersOnly = agendaEntryDialogFields.querySelector('[data-agenda-field="leaders_only"]')?.checked === true;
    const selectedScopeDepartments = [...agendaEntryDialogFields.querySelectorAll(".agenda-department-target:checked")].map(input => input.value);
    const activeDepartments = [...agendaEntryDialogFields.querySelectorAll(".agenda-department-target")].map(input => input.value);
    return {
        id: activeAgendaEntryId,
        date: value("date"),
        time: value("time"),
        end_time: value("end_time"),
        kind,
        leaders_only: kind !== "meal" && leadersOnly,
        meal_type: existingEntry?.meal_type || "",
        source_type: kind === "meal" ? recipeIds.length ? "recipe" : "" : sourceParts.length ? sourceType : "",
        source_id: kind === "meal" ? recipeIds[0] || "" : sourceParts.join(":"),
        recipe_ids: recipeIds,
        shared,
        departments: shared ? [] : selectedScopeDepartments,
        excluded_departments: shared ? activeDepartments.filter(department => !selectedScopeDepartments.includes(department)) : [],
        title: value("title").trim(),
        responsible: value("responsible").trim(),
        notes: value("notes").trim()
    };
}

function readAgendaFromDom() {
    return [...arrangementAgendaList.querySelectorAll(".arrangement-agenda-entry")].map(row => {
        const value = field => row.querySelector(`[data-agenda-field="${field}"]`)?.value || "";
        const selectedSource = value("source");
        const [sourceType = "", ...sourceParts] = selectedSource.split(":");
        const kind = value("kind");
        const existingEntry = draftAgenda.find(entry => entry.id === row.dataset.agendaId);
        const recipeIds = [...row.querySelectorAll(".agenda-recipe-target:checked")].map(input => input.value);
        const shared = row.querySelector('[data-agenda-field="shared"]')?.checked !== false;
        const leadersOnly = row.querySelector('[data-agenda-field="leaders_only"]')?.checked === true;
        const selectedScopeDepartments = [...row.querySelectorAll(".agenda-department-target:checked")].map(input => input.value);
        const activeDepartments = getSelectedArrangementDepartments();
        return {
            id: row.dataset.agendaId,
            date: value("date"),
            time: value("time"),
            end_time: value("end_time"),
            kind,
            leaders_only: kind !== "meal" && leadersOnly,
            meal_type: existingEntry?.meal_type || "",
            source_type: kind === "meal" ? recipeIds.length ? "recipe" : "" : sourceParts.length ? sourceType : "",
            source_id: kind === "meal" ? recipeIds[0] || "" : sourceParts.join(":"),
            recipe_ids: recipeIds,
            shared,
            departments: shared ? [] : selectedScopeDepartments,
            excluded_departments: shared ? activeDepartments.filter(department => !selectedScopeDepartments.includes(department)) : [],
            title: value("title").trim(),
            responsible: value("responsible").trim(),
            notes: value("notes").trim()
        };
    });
}

function syncDraftAgenda() {
    draftAgenda = readAgendaFromDom();
}

async function openArrangementEditor(item = null, focusAgendaId = "", isCopy = false) {
    await defaultRoleDefinitionsLoaded;
    const form = arrangementForm;
    form.dataset.arrangementId = item && !isCopy ? item.id : "";
    document.getElementById("arrangementModalTitle").textContent = isCopy ? "Kopiera arrangemang" : item ? "Redigera arrangemang" : "Nytt arrangemang";
    document.getElementById("arrangementTitle").value = isCopy ? `Kopia av ${item.title}` : item?.title || "";
    document.getElementById("arrangementDescription").value = item?.description || "";
    document.getElementById("arrangementType").value = item?.type || "Hajk";
    document.getElementById("arrangementStatus").value = isCopy ? "planned" : item?.status || "planned";
    document.getElementById("arrangementStartDate").value = item?.start_date || new Date().toISOString().slice(0, 10);
    document.getElementById("arrangementEndDate").value = item?.end_date || item?.start_date || new Date().toISOString().slice(0, 10);
    document.getElementById("arrangementStartTime").value = item?.start_time || "";
    document.getElementById("arrangementEndTime").value = item?.end_time || "";
    document.getElementById("arrangementLocation").value = item?.location || "";
    document.getElementById("arrangementExperience").value = isCopy ? "" : item?.experience || item?.after_notes || "";
    document.getElementById("arrangementFormStatus").textContent = "";
    document.getElementById("deleteArrangementBtn").classList.toggle("hidden", !item || isCopy);
    document.getElementById("arrangementLocalNotice").classList.toggle("hidden", window.GTScoutArrangements?.canWrite());
    renderDepartmentOptions(item?.departments?.length ? item.departments : departments);
    populatePlanningOptions(item?.planning_ref?.id || "");
    draftResponsibilities = (item?.responsibilities || []).map(entry => {
        const roleDescription = entry.role_description || getRoleDefinition(entry.role)?.description || "";
        return { ...entry, id: isCopy ? crypto.randomUUID() : entry.id, role_description: roleDescription, description: entry.description || roleDescription };
    });
    renderResponsibilityList();
    draftAgenda = (item?.agenda || []).map(entry => ({ ...entry, id: isCopy ? crypto.randomUUID() : entry.id }));
    renderAgendaEditor();
    arrangementModal.classList.remove("hidden");
    if (focusAgendaId) {
        const row = [...arrangementAgendaList.querySelectorAll(".arrangement-agenda-entry")].find(entry => entry.dataset.agendaId === focusAgendaId);
        row?.scrollIntoView({ block: "center" });
        row?.querySelector('[data-agenda-field="title"]')?.focus();
    } else {
        document.getElementById("arrangementTitle").focus();
    }
}

function updateSyncStatus() {
    const loading = Boolean(window.GTScoutAuth?.getState().loading);
    const syncState = window.GTScoutArrangements?.getSyncState();
    arrangementSyncStatus.classList.toggle("planning-sync-status--error", Boolean(syncState?.error));
    arrangementSyncStatus.classList.toggle("detail-note-warning", !isSharedArrangementView && !loading && !window.GTScoutArrangements?.canRead());
    if (isSharedArrangementView) {
        arrangementSyncStatus.textContent = "Delat arrangemang · skrivskyddad visning";
        return;
    }
    if (loading) {
        arrangementSyncStatus.textContent = "Kontrollerar inloggning...";
        return;
    }
    if (!window.GTScoutArrangements?.canRead()) {
        arrangementSyncStatus.textContent = "Du är inte inloggad – arrangemang sparas bara i den här webbläsaren.";
        return;
    }
    if (syncState?.loading) {
        arrangementSyncStatus.textContent = "Hämtar arrangemang...";
        return;
    }
    if (syncState?.error) {
        arrangementSyncStatus.textContent = "Kunde inte hämta från databasen – använder lokal data.";
        return;
    }
    arrangementSyncStatus.textContent = window.GTScoutArrangements.canWrite()
        ? `Synkad med databasen (${arrangements.length} arrangemang)`
        : `Kårens arrangemang visas (${arrangements.length} st) – egna arrangemang sparas lokalt.`;
}

function readFormPayload() {
    const planningId = document.getElementById("arrangementPlanningRef").value;
    const planning = planningOptions.find(item => item.id === planningId);
    return {
        id: arrangementForm.dataset.arrangementId || crypto.randomUUID(),
        title: document.getElementById("arrangementTitle").value.trim(),
        description: document.getElementById("arrangementDescription").value.trim(),
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
        responsibilities: readResponsibilitiesFromDom(),
        experience: document.getElementById("arrangementExperience").value.trim()
    };
}

async function openResponsibilityDialog(arrangement, trigger, responsibility = null) {
    await defaultRoleDefinitionsLoaded;
    if (!isArrangementDetailEditable(arrangement)) return;
    activeResponsibilityArrangementId = arrangement.id;
    activeResponsibilityId = responsibility?.id || "";
    responsibilityDialogTrigger = trigger;
    document.getElementById("responsibilityDialogTitle").textContent = responsibility ? "Redigera ansvarig" : "Lägg till ansvarig";
    document.getElementById("saveResponsibilityBtn").textContent = responsibility ? "Spara ändringar" : "Lägg till ansvarig";
    const roleSelect = document.getElementById("responsibilityDialogRole");
    roleSelect.innerHTML = `<option value="">Övrig / egen roll</option>${getRoleDefinitions().map(role => `<option value="${escapeArrangementHtml(role.name)}">${escapeArrangementHtml(role.name)}</option>`).join("")}`;
    roleSelect.value = responsibility?.role || "";
    document.getElementById("responsibilityDialogPerson").value = responsibility?.person || "";
    document.getElementById("responsibilityDialogDescription").value = responsibility?.description || "";
    document.getElementById("responsibilityDialogStatus").textContent = "";
    document.getElementById("responsibilityCustomRoleName").value = "";
    document.getElementById("responsibilityCustomRoleDescription").value = "";
    document.getElementById("responsibilityRoleStatus").textContent = "";
    document.getElementById("responsibilityCustomRoleForm").classList.add("hidden");
    document.getElementById("toggleResponsibilityRoleForm").setAttribute("aria-expanded", "false");
    document.getElementById("saveResponsibilityBtn").disabled = false;
    responsibilityModal.classList.remove("hidden");
    roleSelect.focus();
}

function closeResponsibilityDialog() {
    const trigger = responsibilityDialogTrigger;
    responsibilityModal.classList.add("hidden");
    activeResponsibilityArrangementId = "";
    activeResponsibilityId = "";
    responsibilityDialogTrigger = null;
    document.getElementById("responsibilityDialogTitle").textContent = "Lägg till ansvarig";
    document.getElementById("saveResponsibilityBtn").textContent = "Lägg till ansvarig";
    if (trigger?.isConnected) trigger.focus();
}

async function saveScheduleGesture(arrangementId, entryId, changes) {
    const arrangement = arrangements.find(item => item.id === arrangementId);
    if (!arrangement || !isArrangementDetailEditable(arrangement)) return;
    const agenda = arrangement.agenda.map(entry => entry.id === entryId ? { ...entry, ...changes } : entry);
    try {
        const result = await window.GTScoutArrangements.save({ ...arrangement, agenda });
        const message = result.error
            ? "Tidsändringen sparades lokalt men kunde inte synkas."
            : result.localOnly ? "Tidsändringen sparades lokalt." : "Tidsändringen har sparats.";
        showArrangementToast(message, result.error ? "error" : result.localOnly ? "info" : "success");
        arrangementSyncStatus.textContent = result.localOnly
            ? result.error ? "Kunde inte nå databasen · ändringen finns lokalt" : "Sparas lokalt i den här webbläsaren"
            : "Sparat i databasen";
    } catch (error) {
        showArrangementToast(error.message || "Kunde inte spara tidsändringen.", "error");
        renderArrangements();
    }
}

function clearScheduleGesture(gesture) {
    hideScheduleGesturePreview();
    gesture.wrapper.style.removeProperty("transform");
    gesture.wrapper.style.removeProperty("height");
    gesture.wrapper.style.removeProperty("overflow");
    gesture.wrapper.classList.remove("arrangement-schedule-event--dragging");
    if (gesture.card.hasPointerCapture(gesture.pointerId)) gesture.card.releasePointerCapture(gesture.pointerId);
}

arrangementsGrid.addEventListener("toggle", event => {
    const day = event.target;
    if (day.matches?.("details.arrangement-year-group[data-arrangement-year]")) {
        if (day.open) collapsedArrangementYears.delete(day.dataset.arrangementYear);
        else collapsedArrangementYears.add(day.dataset.arrangementYear);
        return;
    }
    if (day.matches?.("details.arrangement-detail-notes[data-arrangement-id]")) {
        if (day.open) collapsedArrangementNotes.delete(day.dataset.arrangementId);
        else collapsedArrangementNotes.add(day.dataset.arrangementId);
        return;
    }
    if (day.matches?.("details.arrangement-checklist-overview[data-arrangement-id]")) {
        if (day.open) collapsedArrangementChecklist.delete(day.dataset.arrangementId);
        else collapsedArrangementChecklist.add(day.dataset.arrangementId);
        return;
    }
    if (day.matches?.("details.arrangement-meal-summary[data-arrangement-id]")) {
        if (day.open) collapsedArrangementMeals.delete(day.dataset.arrangementId);
        else collapsedArrangementMeals.add(day.dataset.arrangementId);
        return;
    }
    if (day.matches?.("details.arrangement-card[data-arrangement-id]")) {
        if (day.open) {
            expandedArrangementIds.add(day.dataset.arrangementId);
        } else {
            const arrangementId = day.dataset.arrangementId;
            expandedArrangementIds.delete(arrangementId);
            arrangementDetailEditModes.delete(arrangementId);
            collapsedArrangementNotes.add(arrangementId);
            collapsedArrangementMeals.add(arrangementId);
            collapsedArrangementChecklist.add(arrangementId);
            arrangementSchemaExpansion.delete(arrangementId);
            arrangementDayExpansion.delete(arrangementId);
            day.querySelectorAll("details").forEach(section => { section.open = false; });
        }
        day.classList.toggle("arrangement-card--wide", day.open && Number(day.dataset.departmentCount) > 2);
        if (!day.open) renderArrangements();
        return;
    }
    if (day.matches?.("details.arrangement-schedule[data-arrangement-id]")) {
        if (day.open) arrangementSchemaExpansion.add(day.dataset.arrangementId);
        else {
            arrangementSchemaExpansion.delete(day.dataset.arrangementId);
            arrangementDayExpansion.delete(day.dataset.arrangementId);
            day.querySelectorAll("details.arrangement-day[open]").forEach(openDay => { openDay.open = false; });
        }
        return;
    }
    if (!day.matches?.("details.arrangement-day[data-arrangement-id]")) return;
    const openDates = new Set([...arrangementsGrid.querySelectorAll("details.arrangement-day[open]")]
        .filter(openDay => openDay.dataset.arrangementId === day.dataset.arrangementId)
        .map(openDay => openDay.dataset.arrangementDate));
    arrangementDayExpansion.set(day.dataset.arrangementId, openDates);
}, true);

arrangementsGrid.addEventListener("pointerdown", event => {
    const handle = event.target.closest("[data-agenda-drag-handle], [data-agenda-resize-handle]");
    if (!handle || event.button !== 0) return;
    const card = handle.closest("[data-edit-agenda]");
    const wrapper = card?.closest(".arrangement-schedule-event");
    const arrangement = arrangements.find(item => item.id === card?.dataset.arrangementId);
    const entry = arrangement?.agenda.find(item => item.id === card?.dataset.editAgenda);
    const startMinutes = parseScheduleTime(entry?.time);
    if (!card || !wrapper || !entry || startMinutes === null || !isArrangementDetailEditable(arrangement)) return;
    const parsedEnd = parseScheduleTime(entry.end_time);
    const hasExplicitEnd = parsedEnd !== null && parsedEnd > startMinutes;
    const endMinutes = Math.min(scheduleMaxMinutes, hasExplicitEnd ? parsedEnd : startMinutes + 60);
    if (endMinutes <= startMinutes) return;
    activeScheduleGesture = {
        pointerId: event.pointerId,
        mode: handle.matches("[data-agenda-resize-handle]") ? "resize" : "move",
        card,
        wrapper,
        arrangementId: arrangement.id,
        entryId: entry.id,
        startY: event.clientY,
        startMinutes,
        endMinutes,
        hasExplicitEnd,
        moved: false,
        changes: null
    };
    try {
        card.setPointerCapture(event.pointerId);
    } catch {
        activeScheduleGesture = null;
        return;
    }
    const initialPreview = activeScheduleGesture.mode === "resize"
        ? formatScheduleDuration(endMinutes - startMinutes)
        : `Start ${formatScheduleTime(startMinutes)}`;
    showScheduleGesturePreview(event, initialPreview);
    event.preventDefault();
});

arrangementsGrid.addEventListener("pointermove", event => {
    const gesture = activeScheduleGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.moved && Math.abs(deltaY) < 6) return;
    gesture.moved = true;
    event.preventDefault();
    const deltaMinutes = Math.round(deltaY / 12) * scheduleSnapMinutes;
    gesture.wrapper.classList.add("arrangement-schedule-event--dragging");
    if (gesture.mode === "move") {
        const duration = gesture.endMinutes - gesture.startMinutes;
        const nextStart = Math.max(0, Math.min(scheduleMaxMinutes - duration, gesture.startMinutes + deltaMinutes));
        const appliedDelta = nextStart - gesture.startMinutes;
        gesture.wrapper.style.transform = `translateY(${appliedDelta * 0.8}px)`;
        gesture.changes = {
            time: formatScheduleTime(nextStart),
            end_time: gesture.hasExplicitEnd ? formatScheduleTime(nextStart + duration) : ""
        };
        showScheduleGesturePreview(event, `Start ${formatScheduleTime(nextStart)}`);
    } else {
        const nextEnd = Math.max(gesture.startMinutes + scheduleSnapMinutes, Math.min(scheduleMaxMinutes, gesture.endMinutes + deltaMinutes));
        gesture.wrapper.style.height = `${(nextEnd - gesture.startMinutes) * 0.8}px`;
        gesture.wrapper.style.overflow = "visible";
        gesture.changes = { end_time: formatScheduleTime(nextEnd) };
        showScheduleGesturePreview(event, formatScheduleDuration(nextEnd - gesture.startMinutes));
    }
});

arrangementsGrid.addEventListener("pointerup", async event => {
    const gesture = activeScheduleGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    activeScheduleGesture = null;
    const shouldSave = gesture.moved && gesture.changes && Object.entries(gesture.changes).some(([key, value]) => {
        const previous = key === "time" ? formatScheduleTime(gesture.startMinutes)
            : gesture.hasExplicitEnd ? formatScheduleTime(gesture.endMinutes) : "";
        return value !== previous;
    });
    clearScheduleGesture(gesture);
    if (!shouldSave) return;
    suppressScheduleClickUntil = performance.now() + 100;
    await saveScheduleGesture(gesture.arrangementId, gesture.entryId, gesture.changes);
});

arrangementsGrid.addEventListener("pointercancel", event => {
    const gesture = activeScheduleGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    activeScheduleGesture = null;
    clearScheduleGesture(gesture);
});

arrangementsGrid.addEventListener("change", async event => {
    const checkbox = event.target.closest("[data-checklist-arrangement][data-checklist-task]");
    if (!checkbox) return;
    const arrangement = arrangements.find(item => item.id === checkbox.dataset.checklistArrangement);
    if (!arrangement || !isArrangementDetailEditable(arrangement)) return;
    const checklist = arrangement.checklist.map(task => task.id === checkbox.dataset.checklistTask
        ? { ...task, done: checkbox.checked }
        : { ...task });
    try {
        await saveArrangementChecklist(arrangement, checklist);
        const updatedCheckbox = [...arrangementsGrid.querySelectorAll("[data-checklist-arrangement][data-checklist-task]")]
            .find(input => input.dataset.checklistArrangement === arrangement.id && input.dataset.checklistTask === checkbox.dataset.checklistTask);
        updatedCheckbox?.focus();
    } catch (error) {
        showArrangementToast(error.message || "Uppgiften kunde inte sparas.", "error");
    }
});

arrangementsGrid.addEventListener("submit", async event => {
    const form = event.target.closest("[data-add-checklist-form]");
    if (!form) return;
    event.preventDefault();
    const arrangement = arrangements.find(item => item.id === form.dataset.addChecklistForm);
    const input = form.querySelector("[data-checklist-new-task]");
    const text = input.value.trim();
    if (!arrangement || !isArrangementDetailEditable(arrangement)) return;
    if (!text) {
        input.focus();
        return;
    }
    const checklist = [...arrangement.checklist, { id: crypto.randomUUID(), text, done: false }];
    try {
        await saveArrangementChecklist(arrangement, checklist);
        [...arrangementsGrid.querySelectorAll("[data-checklist-new-task]")]
            .find(field => field.dataset.checklistNewTask === arrangement.id)?.focus();
    } catch (error) {
        showArrangementToast(error.message || "Uppgiften kunde inte läggas till.", "error");
    }
});

arrangementsGrid.addEventListener("click", async event => {
    const button = event.target.closest("[data-remove-checklist-task]");
    if (!button) return;
    event.preventDefault();
    const arrangement = arrangements.find(item => item.id === button.dataset.arrangementId);
    if (!arrangement || !isArrangementDetailEditable(arrangement)) return;
    const checklist = arrangement.checklist.filter(task => task.id !== button.dataset.removeChecklistTask);
    try {
        await saveArrangementChecklist(arrangement, checklist);
        [...arrangementsGrid.querySelectorAll("[data-checklist-new-task]")]
            .find(field => field.dataset.checklistNewTask === arrangement.id)?.focus();
    } catch (error) {
        showArrangementToast(error.message || "Uppgiften kunde inte tas bort.", "error");
    }
});

arrangementsGrid.addEventListener("click", async event => {
    const scheduleOverviewButton = event.target.closest("[data-toggle-schedule-overview]");
    if (scheduleOverviewButton) {
        event.preventDefault();
        const arrangementId = scheduleOverviewButton.dataset.toggleScheduleOverview;
        const showOverview = scheduleOverviewButton.dataset.scheduleView === "overview";
        if (showOverview) {
            arrangementScheduleOverview.add(arrangementId);
            arrangementSchemaExpansion.add(arrangementId);
            expandedArrangementIds.add(arrangementId);
        } else {
            arrangementScheduleOverview.delete(arrangementId);
        }
        renderArrangements();
        [...arrangementsGrid.querySelectorAll(".arrangement-card")]
            .find(card => card.dataset.arrangementId === arrangementId)
            ?.querySelector(`[data-schedule-view="${showOverview ? "overview" : "days"}"]`)?.focus();
        return;
    }
    const detailEditButton = event.target.closest("[data-toggle-arrangement-edit]");
    const editNotesButton = event.target.closest("[data-edit-arrangement-notes]");
    const addMealButton = event.target.closest("[data-add-meal]");
    const editButton = event.target.closest("[data-edit-arrangement]");
    const copyButton = event.target.closest("[data-copy-arrangement]");
    const shareButton = event.target.closest("[data-share-arrangement]");
    const agendaButton = event.target.closest("[data-edit-agenda]");
    const addAgendaButton = event.target.closest("[data-add-agenda]");
    const addResponsibilityButton = event.target.closest("[data-add-responsibility]");
    const editResponsibilityButton = event.target.closest("[data-edit-responsibility]");
    const deleteResponsibilityButton = event.target.closest("[data-delete-responsibility]");
    const deleteButton = event.target.closest("[data-delete-arrangement]");
    if (detailEditButton) {
        const item = arrangements.find(arrangement => arrangement.id === detailEditButton.dataset.toggleArrangementEdit);
        if (!item || !isArrangementEditable(item)) return;
        const card = detailEditButton.closest(".arrangement-card");
        const overviewWasOpen = Boolean(card?.querySelector(".arrangement-responsibilities-summary")?.open);
        const openResponsibilityIds = [...(card?.querySelectorAll(".arrangement-responsibility-summary-item[open]") || [])]
            .map(row => row.dataset.responsibilityId);
        if (arrangementDetailEditModes.has(item.id)) arrangementDetailEditModes.delete(item.id);
        else arrangementDetailEditModes.add(item.id);
        expandedArrangementIds.add(item.id);
        renderArrangements();
        const updatedCard = [...arrangementsGrid.querySelectorAll(".arrangement-card")]
            .find(element => element.dataset.arrangementId === item.id);
        const updatedOverview = updatedCard?.querySelector(".arrangement-responsibilities-summary");
        if (updatedOverview) {
            updatedOverview.open = overviewWasOpen;
            openResponsibilityIds.forEach(id => {
                const row = [...updatedOverview.querySelectorAll(".arrangement-responsibility-summary-item")]
                    .find(entry => entry.dataset.responsibilityId === id);
                if (row) row.open = true;
            });
        }
        updatedCard?.querySelector("[data-toggle-arrangement-edit]")?.focus();
        return;
    }
    if (editNotesButton) {
        const arrangement = arrangements.find(item => item.id === editNotesButton.dataset.editArrangementNotes);
        if (arrangement && isArrangementDetailEditable(arrangement)) openArrangementNotesDialog(arrangement, editNotesButton);
        return;
    }
    if (addMealButton) {
        const item = arrangements.find(arrangement => arrangement.id === addMealButton.dataset.addMeal);
        if (item && isArrangementDetailEditable(item)) {
            activeAgendaEntryIsCopy = false;
            activeAgendaEntryIsNew = true;
            agendaEntryDialogTrigger = addMealButton;
            renderAgendaEntryDialog(item, {
                id: crypto.randomUUID(),
                date: item.start_date,
                time: "",
                end_time: "",
                kind: "meal",
                meal_type: "",
                source_type: "",
                source_id: "",
                recipe_ids: [],
                shared: true,
                departments: [],
                excluded_departments: [],
                title: "",
                responsible: "",
                notes: ""
            });
        }
        return;
    }
    if (agendaButton && event.detail > 0 && performance.now() < suppressScheduleClickUntil) {
        event.preventDefault();
        return;
    }
    if (addAgendaButton) {
        const item = arrangements.find(arrangement => arrangement.id === addAgendaButton.dataset.addAgendaArrangement);
        if (item && isArrangementDetailEditable(item)) {
            activeAgendaEntryIsCopy = false;
            activeAgendaEntryIsNew = true;
            agendaEntryDialogTrigger = addAgendaButton;
            renderAgendaEntryDialog(item, {
                id: crypto.randomUUID(),
                date: addAgendaButton.dataset.addAgendaDate,
                time: addAgendaButton.dataset.addAgendaTime,
                end_time: "",
                kind: "program",
                meal_type: "",
                source_type: "",
                source_id: "",
                shared: !addAgendaButton.dataset.addAgendaDepartment,
                departments: addAgendaButton.dataset.addAgendaDepartment ? [addAgendaButton.dataset.addAgendaDepartment] : [],
                title: "",
                responsible: "",
                notes: ""
            });
        }
        return;
    }
    if (addResponsibilityButton) {
        const item = arrangements.find(arrangement => arrangement.id === addResponsibilityButton.dataset.addResponsibility);
        if (item && isArrangementDetailEditable(item)) openResponsibilityDialog(item, addResponsibilityButton);
        return;
    }
    if (editResponsibilityButton) {
        const item = arrangements.find(arrangement => arrangement.id === editResponsibilityButton.dataset.arrangementId);
        const responsibility = item?.responsibilities.find(entry => entry.id === editResponsibilityButton.dataset.editResponsibility);
        if (item && responsibility && isArrangementDetailEditable(item)) openResponsibilityDialog(item, editResponsibilityButton, responsibility);
        return;
    }
    if (deleteResponsibilityButton) {
        const item = arrangements.find(arrangement => arrangement.id === deleteResponsibilityButton.dataset.arrangementId);
        const responsibility = item?.responsibilities.find(entry => entry.id === deleteResponsibilityButton.dataset.deleteResponsibility);
        if (!item || !responsibility || !isArrangementDetailEditable(item)) return;
        const confirmation = `Ta bort ${responsibility.person || "ansvarspost"}${responsibility.role ? ` · ${responsibility.role}` : ""}?`;
        if (!confirm(confirmation)) return;
        const card = deleteResponsibilityButton.closest(".arrangement-card");
        const overview = card?.querySelector(".arrangement-responsibilities-summary");
        const overviewWasOpen = Boolean(overview?.open);
        const openIds = [...(overview?.querySelectorAll(".arrangement-responsibility-summary-item[open]") || [])]
            .map(row => row.dataset.responsibilityId)
            .filter(id => id !== responsibility.id);
        try {
            const result = await window.GTScoutArrangements.save({
                ...item,
                responsibilities: item.responsibilities.filter(entry => entry.id !== responsibility.id)
            });
            const updatedCard = [...arrangementsGrid.querySelectorAll(".arrangement-card")]
                .find(element => element.dataset.arrangementId === item.id);
            const updatedOverview = updatedCard?.querySelector(".arrangement-responsibilities-summary");
            if (updatedOverview) {
                updatedOverview.open = overviewWasOpen;
                openIds.forEach(id => {
                    const row = [...updatedOverview.querySelectorAll(".arrangement-responsibility-summary-item")]
                        .find(entry => entry.dataset.responsibilityId === id);
                    if (row) row.open = true;
                });
                updatedOverview.querySelector(":scope > summary")?.focus();
            }
            const message = result.error
                ? "Ansvarig borttagen lokalt men kunde inte synkas."
                : result.localOnly ? "Ansvarig borttagen lokalt." : "Ansvarig har tagits bort.";
            showArrangementToast(message, result.error ? "error" : result.localOnly ? "info" : "success");
            arrangementSyncStatus.textContent = result.localOnly
                ? result.error ? "Kunde inte nå databasen · ändringen finns lokalt" : "Sparas lokalt i den här webbläsaren"
                : "Sparat i databasen";
        } catch (error) {
            showArrangementToast(error.message || "Kunde inte ta bort ansvarig.", "error");
        }
        return;
    }
    if (agendaButton) {
        const item = arrangements.find(arrangement => arrangement.id === agendaButton.dataset.arrangementId);
        const entry = item?.agenda.find(agendaEntry => agendaEntry.id === agendaButton.dataset.editAgenda);
        if (item && entry && isArrangementDetailEditable(item)) {
            activeAgendaEntryIsCopy = false;
            activeAgendaEntryIsNew = false;
            agendaEntryDialogTrigger = agendaButton;
            renderAgendaEntryDialog(item, entry);
        }
        return;
    }
    if (editButton) {
        event.preventDefault();
        const item = arrangements.find(arrangement => arrangement.id === editButton.dataset.editArrangement);
        if (item && isArrangementDetailEditable(item)) openArrangementEditor(item);
        return;
    }
    if (copyButton) {
        const item = arrangements.find(arrangement => arrangement.id === copyButton.dataset.copyArrangement);
        if (item && isArrangementEditable(item)) openArrangementEditor(item, "", true);
        return;
    }
    if (shareButton) {
        const item = arrangements.find(arrangement => arrangement.id === shareButton.dataset.shareArrangement);
        if (item) await shareArrangement(item);
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
document.getElementById("closeArrangementNotesModal").addEventListener("click", closeArrangementNotesDialog);
document.getElementById("cancelArrangementNotesBtn").addEventListener("click", closeArrangementNotesDialog);
arrangementNotesModal.addEventListener("click", event => {
    if (event.target === arrangementNotesModal) closeArrangementNotesDialog();
});
document.getElementById("closeShareArrangementModal").addEventListener("click", () => shareArrangementModal.classList.add("hidden"));
document.getElementById("closeShareArrangementBtn").addEventListener("click", () => shareArrangementModal.classList.add("hidden"));
shareArrangementModal.addEventListener("click", event => {
    if (event.target === shareArrangementModal) shareArrangementModal.classList.add("hidden");
});
document.getElementById("copyShareArrangementBtn").addEventListener("click", async () => {
    const urlInput = document.getElementById("shareArrangementUrl");
    const status = document.getElementById("shareArrangementStatus");
    try {
        await navigator.clipboard.writeText(urlInput.value);
        shareArrangementModal.classList.add("hidden");
    } catch {
        urlInput.select();
        status.textContent = "Kopieringen misslyckades. Markera länken och kopiera den manuellt.";
    }
});
arrangementNotesForm.addEventListener("submit", async event => {
    event.preventDefault();
    const arrangement = arrangements.find(item => item.id === activeNotesArrangementId);
    const status = document.getElementById("arrangementNotesDialogStatus");
    const saveButton = document.getElementById("saveArrangementNotesBtn");
    if (!arrangement || !isArrangementDetailEditable(arrangement)) {
        status.textContent = "Arrangemanget kan inte redigeras.";
        return;
    }
    saveButton.disabled = true;
    status.textContent = "Sparar...";
    try {
        const result = await window.GTScoutArrangements.save({
            ...arrangement,
            notes: document.getElementById("arrangementNotesDialogText").value.trim()
        });
        arrangementSyncStatus.textContent = result.localOnly
            ? result.error ? "Kunde inte nå databasen · ändringen finns lokalt" : "Sparas lokalt i den här webbläsaren"
            : "Sparat i databasen";
        closeArrangementNotesDialog();
        const message = result.error
            ? "Anteckningarna sparades lokalt men kunde inte synkas."
            : result.localOnly ? "Anteckningarna sparades lokalt." : "Anteckningarna har sparats.";
        showArrangementToast(message, result.error ? "error" : result.localOnly ? "info" : "success");
    } catch (error) {
        status.textContent = error.message || "Kunde inte spara anteckningarna.";
    } finally {
        saveButton.disabled = false;
    }
});
document.getElementById("closeResponsibilityModal").addEventListener("click", closeResponsibilityDialog);
document.getElementById("cancelResponsibilityBtn").addEventListener("click", closeResponsibilityDialog);
responsibilityModal.addEventListener("click", event => {
    if (event.target === responsibilityModal) closeResponsibilityDialog();
});
const closeAgendaEntryDialog = () => {
    const trigger = agendaEntryDialogTrigger;
    const arrangementId = activeAgendaArrangementId;
    const entryId = activeAgendaEntryId;
    agendaEntryModal.classList.add("hidden");
    activeAgendaArrangementId = "";
    activeAgendaEntryId = "";
    activeAgendaEntryIsCopy = false;
    activeAgendaEntryIsNew = false;
    agendaEntryDialogTrigger = null;
    if (trigger?.isConnected) {
        trigger.focus();
        return;
    }
    const agendaTrigger = [...arrangementsGrid.querySelectorAll("[data-edit-agenda]")].find(button => button.dataset.arrangementId === arrangementId && button.dataset.editAgenda === entryId);
    const arrangementTrigger = [...arrangementsGrid.querySelectorAll("[data-edit-arrangement]")].find(button => button.dataset.editArrangement === arrangementId);
    (agendaTrigger || arrangementTrigger)?.focus();
};
document.getElementById("closeAgendaEntryModal").addEventListener("click", closeAgendaEntryDialog);
document.getElementById("cancelAgendaEntryBtn").addEventListener("click", closeAgendaEntryDialog);
agendaEntryModal.addEventListener("click", event => {
    if (event.target === agendaEntryModal) closeAgendaEntryDialog();
});
document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!arrangementNotesModal.classList.contains("hidden")) {
        event.preventDefault();
        closeArrangementNotesDialog();
    } else if (!responsibilityModal.classList.contains("hidden")) {
        event.preventDefault();
        closeResponsibilityDialog();
    } else if (!agendaEntryModal.classList.contains("hidden")) {
        event.preventDefault();
        closeAgendaEntryDialog();
    } else if (!arrangementModal.classList.contains("hidden")) {
        event.preventDefault();
        const arrangementId = arrangementForm.dataset.arrangementId;
        arrangementModal.classList.add("hidden");
        const trigger = [...arrangementsGrid.querySelectorAll("[data-edit-arrangement]")].find(button => button.dataset.editArrangement === arrangementId);
        (trigger || document.getElementById("addArrangementBtn")).focus();
    }
});

document.getElementById("addResponsibilityBtn").addEventListener("click", () => {
    syncDraftResponsibilities();
    const nextRole = getNextUnassignedRole();
    draftResponsibilities.push({
        id: crypto.randomUUID(),
        person: "",
        role: nextRole?.name || "",
        role_description: nextRole?.description || "",
        description: nextRole?.description || ""
    });
    renderResponsibilityList();
    arrangementResponsibilitiesList.querySelector(".arrangement-responsibility-entry:last-child [data-responsibility-field='role']")?.focus();
});

arrangementResponsibilitiesList.addEventListener("input", () => {
    syncDraftResponsibilities();
    refreshAssignedRoleLabels();
});
arrangementResponsibilitiesList.addEventListener("change", event => {
    const roleSelect = event.target.closest('[data-responsibility-field="role"]');
    if (!roleSelect) return;
    syncDraftResponsibilities();
    const row = roleSelect.closest(".arrangement-responsibility-entry");
    const responsibility = draftResponsibilities.find(entry => entry.id === row.dataset.responsibilityId);
    if (!responsibility) return;
    const definition = getRoleDefinition(responsibility.role);
    responsibility.role_description = definition?.description || "";
    responsibility.description = definition?.description || "";
    row.dataset.roleDescription = responsibility.role_description;
    row.querySelector('[data-responsibility-field="description"]').value = responsibility.description;
    row.querySelector(".arrangement-responsibility-entry-top strong").textContent = `${responsibility.person || "Ny ansvarspost"}${responsibility.role ? ` · ${responsibility.role}` : ""}`;
    refreshAssignedRoleLabels();
});
arrangementResponsibilitiesList.addEventListener("click", event => {
    const removeButton = event.target.closest("[data-remove-responsibility]");
    if (!removeButton) return;
    syncDraftResponsibilities();
    draftResponsibilities = draftResponsibilities.filter(entry => entry.id !== removeButton.dataset.removeResponsibility);
    renderResponsibilityList();
});

const customRoleForm = document.getElementById("customRoleForm");
const toggleRoleLibraryBtn = document.getElementById("toggleRoleLibraryBtn");
toggleRoleLibraryBtn.addEventListener("click", () => {
    const shouldShow = customRoleForm.classList.contains("hidden");
    customRoleForm.classList.toggle("hidden", !shouldShow);
    toggleRoleLibraryBtn.setAttribute("aria-expanded", String(shouldShow));
    document.getElementById("customRoleStatus").textContent = "";
    if (shouldShow) document.getElementById("customRoleName").focus();
});

document.getElementById("cancelCustomRoleBtn").addEventListener("click", () => {
    customRoleForm.classList.add("hidden");
    toggleRoleLibraryBtn.setAttribute("aria-expanded", "false");
});

document.getElementById("saveCustomRoleBtn").addEventListener("click", () => {
    const name = document.getElementById("customRoleName").value.trim();
    const description = document.getElementById("customRoleDescription").value.trim();
    const status = document.getElementById("customRoleStatus");
    if (!name) {
        status.textContent = "Skriv ett namn på rollen.";
        document.getElementById("customRoleName").focus();
        return;
    }
    if (getRoleDefinitions().some(role => role.name.toLocaleLowerCase("sv") === name.toLocaleLowerCase("sv"))) {
        status.textContent = "Rollen finns redan i listan.";
        document.getElementById("customRoleName").focus();
        return;
    }
    const customRoles = [...getCustomRoleDefinitions(), { name, description }];
    localStorage.setItem(roleLibraryStorageKey, JSON.stringify(customRoles));
    syncDraftResponsibilities();
    renderResponsibilityList();
    customRoleForm.classList.add("hidden");
    toggleRoleLibraryBtn.setAttribute("aria-expanded", "false");
    document.getElementById("customRoleName").value = "";
    document.getElementById("customRoleDescription").value = "";
});

document.getElementById("addAgendaEntryBtn").addEventListener("click", () => {
    syncDraftAgenda();
    const startDate = document.getElementById("arrangementStartDate").value || new Date().toISOString().slice(0, 10);
    draftAgenda.push({ id: crypto.randomUUID(), date: startDate, time: "", end_time: "", kind: "program", leaders_only: false, meal_type: "", source_type: "", source_id: "", recipe_ids: [], shared: true, departments: [], title: "", notes: "" });
    renderAgendaEditor();
});

document.getElementById("arrangementDepartments").addEventListener("change", () => {
    syncDraftAgenda();
    renderAgendaEditor();
});

arrangementAgendaList.addEventListener("input", event => {
    if (event.target.matches(".agenda-recipe-search")) updateMealRecipePicker(event.target.closest(".agenda-recipe-picker"));
    syncDraftAgenda();
});
arrangementAgendaList.addEventListener("change", event => {
    const row = event.target.closest(".arrangement-agenda-entry");
    if (!row) return;
    syncDraftAgenda();
    const item = draftAgenda.find(entry => entry.id === row.dataset.agendaId);
    let shouldRender = false;
    if (item && event.target.dataset.agendaField === "kind") {
        item.source_id = "";
        item.source_type = "";
        item.recipe_ids = [];
        item.title = "";
        item.meal_type = "";
        if (item.kind === "meal") item.leaders_only = false;
        shouldRender = true;
    }
    if (item && event.target.dataset.agendaField === "leaders_only") {
        item.leaders_only = event.target.checked;
        shouldRender = true;
    }
    if (item && event.target.dataset.agendaField === "shared") {
        item.shared = event.target.checked;
        item.departments = item.shared ? [] : getSelectedArrangementDepartments();
        item.excluded_departments = [];
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
    if (item && event.target.matches(".agenda-recipe-target")) {
        updateMealRecipePicker(row.querySelector(".agenda-recipe-picker"));
    }
    if (shouldRender) renderAgendaEditor();
});

arrangementAgendaList.addEventListener("click", event => {
    const clearRecipesButton = event.target.closest("[data-clear-agenda-recipes]");
    if (clearRecipesButton) {
        const row = clearRecipesButton.closest(".arrangement-agenda-entry");
        if (!row) return;
        row.querySelectorAll(".agenda-recipe-target").forEach(input => { input.checked = false; });
        syncDraftAgenda();
        updateMealRecipePicker(row.querySelector(".agenda-recipe-picker"));
        return;
    }
    const removeButton = event.target.closest("[data-remove-agenda]");
    if (!removeButton) return;
    syncDraftAgenda();
    draftAgenda = draftAgenda.filter(entry => entry.id !== removeButton.dataset.removeAgenda);
    renderAgendaEditor();
});

async function saveAgendaEntryChanges(arrangement, agenda, completionMessage) {
    const saveButton = document.getElementById("saveAgendaEntryBtn");
    const status = document.getElementById("agendaEntryDialogStatus");
    if (!isArrangementDetailEditable(arrangement)) {
        status.textContent = "Aktivera redigering för att ändra arrangemanget.";
        return;
    }
    saveButton.disabled = true;
    status.textContent = "Sparar...";
    try {
        const result = await window.GTScoutArrangements.save({ ...arrangement, agenda });
        closeAgendaEntryDialog();
        const storageFeedback = result.localOnly
            ? result.error ? "Kunde inte synka, men ändringen finns sparad lokalt." : "Ändringen sparas bara i den här webbläsaren."
            : "Ändringen har sparats i databasen.";
        showArrangementToast(`${completionMessage} ${storageFeedback}`, result.error ? "error" : result.localOnly ? "info" : "success");
        arrangementSyncStatus.textContent = result.localOnly
            ? result.error ? "Kunde inte nå databasen · ändringen finns lokalt" : "Sparas lokalt i den här webbläsaren"
            : "Sparat i databasen";
    } catch (error) {
        const message = error.message || "Kunde inte spara programpunkten.";
        status.textContent = message;
        showArrangementToast(message, "error");
    } finally {
        saveButton.disabled = false;
    }
}

document.getElementById("responsibilityDialogRole").addEventListener("change", event => {
    const definition = getRoleDefinition(event.target.value);
    document.getElementById("responsibilityDialogDescription").value = definition?.description || "";
});

const responsibilityCustomRoleForm = document.getElementById("responsibilityCustomRoleForm");
const toggleResponsibilityRoleForm = document.getElementById("toggleResponsibilityRoleForm");
toggleResponsibilityRoleForm.addEventListener("click", () => {
    const shouldShow = responsibilityCustomRoleForm.classList.contains("hidden");
    responsibilityCustomRoleForm.classList.toggle("hidden", !shouldShow);
    toggleResponsibilityRoleForm.setAttribute("aria-expanded", String(shouldShow));
    document.getElementById("responsibilityRoleStatus").textContent = "";
    if (shouldShow) document.getElementById("responsibilityCustomRoleName").focus();
});

document.getElementById("cancelResponsibilityRoleBtn").addEventListener("click", () => {
    responsibilityCustomRoleForm.classList.add("hidden");
    toggleResponsibilityRoleForm.setAttribute("aria-expanded", "false");
});

document.getElementById("saveResponsibilityRoleBtn").addEventListener("click", () => {
    const name = document.getElementById("responsibilityCustomRoleName").value.trim();
    const description = document.getElementById("responsibilityCustomRoleDescription").value.trim();
    const status = document.getElementById("responsibilityRoleStatus");
    if (!name) {
        status.textContent = "Skriv ett namn på rollen.";
        document.getElementById("responsibilityCustomRoleName").focus();
        return;
    }
    if (getRoleDefinitions().some(role => role.name.toLocaleLowerCase("sv") === name.toLocaleLowerCase("sv"))) {
        status.textContent = "Rollen finns redan i listan.";
        document.getElementById("responsibilityCustomRoleName").focus();
        return;
    }
    localStorage.setItem(roleLibraryStorageKey, JSON.stringify([...getCustomRoleDefinitions(), { name, description }]));
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    const roleSelect = document.getElementById("responsibilityDialogRole");
    roleSelect.append(option);
    roleSelect.value = name;
    document.getElementById("responsibilityDialogDescription").value = description;
    responsibilityCustomRoleForm.classList.add("hidden");
    toggleResponsibilityRoleForm.setAttribute("aria-expanded", "false");
    document.getElementById("responsibilityCustomRoleName").value = "";
    document.getElementById("responsibilityCustomRoleDescription").value = "";
});

responsibilityForm.addEventListener("submit", async event => {
    event.preventDefault();
    const arrangement = arrangements.find(item => item.id === activeResponsibilityArrangementId);
    const status = document.getElementById("responsibilityDialogStatus");
    const person = document.getElementById("responsibilityDialogPerson").value.trim();
    const role = document.getElementById("responsibilityDialogRole").value.trim();
    const description = document.getElementById("responsibilityDialogDescription").value.trim();
    const isEditing = Boolean(activeResponsibilityId);
    const existingResponsibility = (arrangement?.responsibilities || []).find(entry => entry.id === activeResponsibilityId);
    if (!arrangement || !isArrangementDetailEditable(arrangement)) {
        status.textContent = "Arrangemanget kan inte redigeras.";
        return;
    }
    if (isEditing && !existingResponsibility) {
        status.textContent = "Ansvarsposten finns inte längre.";
        return;
    }
    if (!role && !description) {
        status.textContent = "Välj en roll eller fyll i en ansvarsbeskrivning.";
        return;
    }
    const definition = getRoleDefinition(role);
    const responsibility = {
        ...existingResponsibility,
        id: existingResponsibility?.id || crypto.randomUUID(),
        person,
        role,
        role_description: definition?.description || (role === existingResponsibility?.role ? existingResponsibility.role_description || "" : ""),
        description: description || definition?.description || ""
    };
    const responsibilities = arrangement.responsibilities || [];
    const updatedResponsibilities = existingResponsibility
        ? responsibilities.map(entry => entry.id === existingResponsibility.id ? responsibility : entry)
        : [...responsibilities, responsibility];
    const saveButton = document.getElementById("saveResponsibilityBtn");
    saveButton.disabled = true;
    status.textContent = "Sparar...";
    try {
        const result = await window.GTScoutArrangements.save({
            ...arrangement,
            responsibilities: updatedResponsibilities
        });
        closeResponsibilityDialog();
        const message = result.error
            ? `Ansvarig ${isEditing ? "uppdaterad" : "tillagd"} lokalt men kunde inte synkas.`
            : result.localOnly ? `Ansvarig ${isEditing ? "uppdaterad" : "tillagd"} lokalt.` : `Ansvarig har ${isEditing ? "uppdaterats" : "lagts till"}.`;
        showArrangementToast(message, result.error ? "error" : result.localOnly ? "info" : "success");
        arrangementSyncStatus.textContent = result.localOnly
            ? result.error ? "Kunde inte nå databasen · ändringen finns lokalt" : "Sparas lokalt i den här webbläsaren"
            : "Sparat i databasen";
        const card = [...arrangementsGrid.querySelectorAll(".arrangement-card")]
            .find(element => element.dataset.arrangementId === arrangement.id);
        const overview = card?.querySelector(".arrangement-responsibilities-summary");
        if (overview) overview.open = true;
        const newRow = [...(overview?.querySelectorAll(".arrangement-responsibility-summary-item") || [])]
            .find(element => element.dataset.responsibilityId === responsibility.id);
        if (newRow) {
            newRow.open = true;
            newRow.querySelector(":scope > summary")?.focus();
        }
    } catch (error) {
        const message = error.message || "Kunde inte spara ansvarig.";
        status.textContent = message;
        showArrangementToast(message, "error");
    } finally {
        saveButton.disabled = false;
    }
});

agendaEntryDialogFields.addEventListener("change", event => {
    const arrangement = arrangements.find(item => item.id === activeAgendaArrangementId);
    if (!arrangement) return;
    const entry = readAgendaEntryDialog();
    const field = event.target.dataset.agendaField;
    if (field === "kind") {
        entry.source_id = "";
        entry.source_type = "";
        entry.recipe_ids = [];
        entry.title = "";
        entry.meal_type = "";
        renderAgendaEntryDialog(arrangement, entry, "kind");
    } else if (field === "shared") {
        entry.departments = entry.shared ? [] : arrangement.departments;
        entry.excluded_departments = [];
        renderAgendaEntryDialog(arrangement, entry, "shared");
    } else if (field === "source") {
        const source = entry.source_type === "recipe" ? recipes.find(recipe => String(recipe.id) === entry.source_id)
            : entry.source_type === "activity" ? activities.find(activity => String(activity.id) === entry.source_id) : null;
        if (source) entry.title = source.namn || "";
        renderAgendaEntryDialog(arrangement, entry, "source");
    } else if (event.target.matches(".agenda-recipe-target")) {
        updateMealRecipePicker(agendaEntryDialogFields.querySelector(".agenda-recipe-picker"));
    }
});

agendaEntryDialogFields.addEventListener("input", event => {
    if (event.target.matches(".agenda-recipe-search")) updateMealRecipePicker(event.target.closest(".agenda-recipe-picker"));
});

agendaEntryDialogFields.addEventListener("click", event => {
    if (!event.target.closest("[data-clear-agenda-recipes]")) return;
    agendaEntryDialogFields.querySelectorAll(".agenda-recipe-target").forEach(input => { input.checked = false; });
    updateMealRecipePicker(agendaEntryDialogFields.querySelector(".agenda-recipe-picker"));
});

agendaEntryForm.addEventListener("submit", async event => {
    event.preventDefault();
    const arrangement = arrangements.find(item => item.id === activeAgendaArrangementId);
    const entry = readAgendaEntryDialog();
    const status = document.getElementById("agendaEntryDialogStatus");
    if (!arrangement || !isArrangementDetailEditable(arrangement)) {
        status.textContent = "Arrangemanget kan inte redigeras.";
        return;
    }
    const activeDepartments = arrangement.departments?.length ? arrangement.departments : departments;
    if (!entry.title || entry.date < arrangement.start_date || entry.date > arrangement.end_date || !agendaHasTargets(entry, activeDepartments) || entry.departments.some(department => !departments.includes(department)) || entry.excluded_departments.some(department => !departments.includes(department))) {
        status.textContent = "Kontrollera namn, datum och avdelningar för programpunkten.";
        return;
    }
    const entryExists = arrangement.agenda.some(item => item.id === entry.id);
    const shouldAddEntry = activeAgendaEntryIsCopy || activeAgendaEntryIsNew;
    if (shouldAddEntry ? entryExists : !entryExists) {
        status.textContent = "Programpunkten kunde inte hittas längre.";
        return;
    }
    const agenda = shouldAddEntry
        ? [...arrangement.agenda, entry]
        : arrangement.agenda.map(item => item.id === entry.id ? entry : item);
    const completionMessage = activeAgendaEntryIsCopy ? "Kopian är tillagd." : activeAgendaEntryIsNew ? "Programpunkten är tillagd." : "Programpunkten är sparad.";
    await saveAgendaEntryChanges(arrangement, agenda, completionMessage);
});

document.getElementById("copyAgendaEntryBtn").addEventListener("click", () => {
    const arrangement = arrangements.find(item => item.id === activeAgendaArrangementId);
    if (!arrangement || !isArrangementDetailEditable(arrangement)) return;
    const copy = { ...readAgendaEntryDialog(), id: crypto.randomUUID() };
    activeAgendaEntryIsCopy = true;
    activeAgendaEntryIsNew = false;
    renderAgendaEntryDialog(arrangement, copy);
});

document.getElementById("deleteAgendaEntryBtn").addEventListener("click", async () => {
    const arrangement = arrangements.find(item => item.id === activeAgendaArrangementId);
    const entry = arrangement?.agenda.find(item => item.id === activeAgendaEntryId);
    if (!arrangement || !entry || !isArrangementDetailEditable(arrangement) || !confirm(`Ta bort programpunkten "${entry.title}"?`)) return;
    await saveAgendaEntryChanges(arrangement, arrangement.agenda.filter(item => item.id !== entry.id), "Programpunkten är borttagen.");
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
    if (payload.agenda.some(entry => !entry.title || entry.date < payload.start_date || entry.date > payload.end_date || !agendaHasTargets(entry, payload.departments) || entry.departments.some(department => !departments.includes(department)) || entry.excluded_departments.some(department => !departments.includes(department)))) {
        status.textContent = "Kontrollera namn, tider och avdelningar för varje programpunkt.";
        return;
    }
    if (payload.responsibilities.some(entry => entry.role ? !entry.person : !entry.description)) {
        status.textContent = "Fyll i ansvarig för vald roll eller skriv en fritextbeskrivning.";
        return;
    }
    const existing = arrangements.find(item => item.id === payload.id);
    payload.notes = existing?.notes || "";
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
    if (!agendaEntryModal.classList.contains("hidden")) {
        const arrangement = arrangements.find(item => item.id === activeAgendaArrangementId);
        if (arrangement) renderAgendaEntryDialog(arrangement, readAgendaEntryDialog(), "source");
    }
} });
window.GTScoutCookbook?.init({ onChange(nextRecipes) {
    recipes = nextRecipes || [];
    if (!arrangementModal.classList.contains("hidden")) {
        syncDraftAgenda();
        renderAgendaEditor();
    }
    if (!agendaEntryModal.classList.contains("hidden")) {
        const arrangement = arrangements.find(item => item.id === activeAgendaArrangementId);
        if (arrangement) renderAgendaEntryDialog(arrangement, readAgendaEntryDialog(), "source");
    }
} });
window.GTScoutArrangements.init({
    onChange(nextArrangements) {
        arrangements = nextArrangements || [];
        renderArrangements();
        updateSyncStatus();
    }
});
window.GTScoutAuth?.onChange(() => updateSyncStatus());
updateSyncStatus();
