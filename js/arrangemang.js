const arrangementsGrid = document.getElementById("arrangementsGrid");
const arrangementsEmpty = document.getElementById("arrangementsEmpty");
const arrangementModal = document.getElementById("arrangementModal");
const arrangementForm = document.getElementById("arrangementForm");
const agendaEntryModal = document.getElementById("agendaEntryModal");
const agendaEntryForm = document.getElementById("agendaEntryForm");
const agendaEntryDialogFields = document.getElementById("agendaEntryDialogFields");
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

let arrangements = [];
let recipes = [];
let activities = [];
let draftAgenda = [];
let activeAgendaArrangementId = "";
let activeAgendaEntryId = "";
let activeAgendaEntryIsCopy = false;
let activeAgendaEntryIsNew = false;
let agendaEntryDialogTrigger = null;
let arrangementToastTimer = null;
let activeScheduleGesture = null;
let suppressScheduleClickUntil = 0;
let draftResponsibilities = [];
let planningOptions = [];
const mealTypes = ["Frukost", "Lunch", "Mellanmål", "Middag", "Kvällsmål"];
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

function renderArrangementSchedule(item) {
    const selectedDepartments = item.departments?.length ? item.departments : departments;
    const departmentCount = selectedDepartments.length;
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
    const scheduleDays = arrangementDates(item.start_date, item.end_date).map(date => {
        const entries = item.agenda.filter(entry => entry.date === date);
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
            const targets = entry.shared !== false
                ? [{ key: "shared", department: null }]
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
        const canEditAgenda = isArrangementEditable(item);
        const emptyCells = timePoints.map((time, rowIndex) => selectedDepartments.map((department, departmentIndex) => {
            const timeLabel = time || "Heldag";
            const addAttributes = canEditAgenda
                ? `type="button" data-add-agenda data-add-agenda-arrangement="${escapeArrangementHtml(item.id)}" data-add-agenda-date="${escapeArrangementHtml(date)}" data-add-agenda-time="${escapeArrangementHtml(time)}" data-add-agenda-department="${escapeArrangementHtml(department)}" aria-label="Lägg till programpunkt ${escapeArrangementHtml(timeLabel)} för ${escapeArrangementHtml(department)}" title="Lägg till programpunkt"`
                : `type="button" disabled aria-hidden="true"`;
            return `<button ${addAttributes} class="arrangement-schedule-slot department-tone-${departments.indexOf(department)}" style="grid-column:${departmentIndex + 2};grid-row:${rowIndex + 1}"></button>`;
        }).join("")).join("");
        const eventMarkup = scheduleEvents.map(event => {
            const startIndex = timePoints.indexOf(event.startTime);
            const startRow = startIndex + 1;
            const endIndex = event.endTime ? timePoints.indexOf(event.endTime) : -1;
            const endRow = endIndex > startIndex ? endIndex + 1 : startRow + 1;
            const departmentIndex = event.department === null ? -1 : selectedDepartments.indexOf(event.department);
            const column = departmentIndex < 0 ? "2 / -1" : String(departmentIndex + 2);
            const tone = event.department === null ? null : departments.indexOf(event.department);
            const laneWidth = (100 / event.laneCount).toFixed(4);
            const laneOffset = (event.laneIndex * 100 / event.laneCount).toFixed(4);
            const laneGap = 4;
            const width = event.laneCount > 1 ? `calc(${laneWidth}% - ${(laneGap * (event.laneCount - 1) / event.laneCount).toFixed(2)}px)` : "100%";
            const offset = event.laneIndex ? `calc(${laneOffset}% + ${(event.laneIndex * laneGap / event.laneCount).toFixed(2)}px)` : "0px";
            const card = renderScheduleEntry(event.entry, tone, item.id, isArrangementEditable(item));
            const durationMinutes = event.endMinutes - event.startMinutes;
            const durationClass = `${durationMinutes > 60 ? " arrangement-schedule-event--multi-hour" : ""}${event.startTime && durationMinutes < 60 ? " arrangement-schedule-event--short" : ""}`;
            const departmentSpan = event.department === null
                ? selectedDepartments.length
                : Math.max(1, event.entry.departments.filter(department => selectedDepartments.includes(department)).length);
            const stackingOrder = 1000 - departmentSpan * 100 + (event.department === null ? 0 : 1);
            return `<div class="arrangement-schedule-event${durationClass}${event.department === null ? " arrangement-schedule-event--shared" : ""}" style="grid-column:${column};grid-row:${startRow}/${endRow};--lane-width:${width};--lane-offset:${offset};--event-z-index:${stackingOrder}">${card}</div>`;
        }).join("");
        const headers = selectedDepartments.map(department => `<span class="arrangement-schedule-department department-tone-${departments.indexOf(department)}">${escapeArrangementHtml(department)}</span>`).join("");
        const showScheduleGrid = scheduleEvents.length > 0 || entries.length === 0;
        const grid = showScheduleGrid ? `<div class="arrangement-schedule-grid" style="--department-count:${departmentCount};--schedule-rows:${timeRowHeights.join(" ")}">${timeLabels}${emptyCells}${eventMarkup}</div>` : `<p class="arrangement-day-empty">Inga programpunkter den här dagen.</p>`;
        return `<section class="arrangement-day"><h3>${escapeArrangementHtml(formatArrangementDate(date))}</h3><div class="arrangement-schedule-header"><span>Tid</span><div class="arrangement-schedule-columns" style="--department-count:${departmentCount}">${headers}</div></div>${grid}</section>`;
    }).join("");
    return `<div class="arrangement-schedule">${scheduleDays}</div>`;
}

function renderScheduleEntry(entry, departmentIndex = null, arrangementId = "", canEdit = false) {
    const tone = departmentIndex === null ? "arrangement-schedule-item--shared" : `department-tone-${departmentIndex}`;
    const formattedTime = /^\d{2}:\d{2}$/.test(entry.time || "") ? `${Number(entry.time.slice(0, 2))}:${entry.time.slice(3)}` : "";
    const mealType = entry.kind === "meal" && entry.meal_type ? ` (${escapeArrangementHtml(entry.meal_type)})` : "";
    const title = `${formattedTime ? `${escapeArrangementHtml(formattedTime)}: ` : ""}${escapeArrangementHtml(entry.title)}${mealType}`;
    const notes = entry.notes ? `<small class="arrangement-schedule-notes" title="${escapeArrangementHtml(entry.notes)}">${escapeArrangementHtml(entry.notes)}</small>` : "";
    const gestureHandles = canEdit && parseScheduleTime(entry.time) !== null
        ? `<span class="arrangement-schedule-drag-handle" data-agenda-drag-handle title="Dra för att flytta starttiden" aria-hidden="true"></span><span class="arrangement-schedule-resize-handle" data-agenda-resize-handle title="Dra för att ändra längden" aria-hidden="true"></span>`
        : "";
    const actionLabel = entry.kind === "activity" ? "Redigera aktivitet" : entry.kind === "meal" ? "Redigera måltid" : "Redigera programpunkt";
    const editAttributes = canEdit ? `data-edit-agenda="${escapeArrangementHtml(entry.id)}" data-arrangement-id="${escapeArrangementHtml(arrangementId)}" aria-label="${actionLabel}: ${escapeArrangementHtml(entry.title)}" title="Klicka för att redigera. Dra i greppet för att flytta starttiden och i nederkanten för att ändra längden."` : "disabled aria-disabled=\"true\"";
    return `<button type="button" class="arrangement-schedule-item ${tone}" ${editAttributes}><strong>${title}</strong>${notes}${gestureHandles}</button>`;
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
        const responsibilityHtml = item.responsibilities.length
            ? `<details class="arrangement-responsibilities-summary"><summary>Ansvariga och roller (${item.responsibilities.length})</summary><div class="arrangement-responsibilities-summary-list">${item.responsibilities.map(entry => {
                const roleDescription = String(entry.role_description || "").trim();
                const description = String(entry.description || "").trim();
                const roleDescriptionHtml = roleDescription ? `<p><strong>Rollbeskrivning</strong>${escapeArrangementHtml(roleDescription)}</p>` : "";
                const descriptionHtml = description && description !== roleDescription ? `<p><strong>Ansvar</strong>${escapeArrangementHtml(description)}</p>` : "";
                return `<details class="arrangement-responsibility-summary-item"><summary><span class="arrangement-responsibility-summary-role">${escapeArrangementHtml(entry.role || "Fritextbeskrivning")}</span><span class="arrangement-responsibility-summary-separator" aria-hidden="true">:</span><span class="arrangement-responsibility-summary-person">${escapeArrangementHtml(entry.person || "Ansvarspost")}</span></summary><div class="arrangement-responsibility-summary-details">${roleDescriptionHtml}${descriptionHtml}</div></details>`;
            }).join("")}</div></details>`
            : "";
        const cardWidth = item.departments.length > 2 ? " arrangement-card--wide" : "";
        const actions = isArrangementEditable(item)
            ? `<div class="arrangement-card-actions"><button class="btn-secondary" type="button" data-edit-arrangement="${escapeArrangementHtml(item.id)}">Redigera</button><button class="arrangement-delete-icon" type="button" data-delete-arrangement="${escapeArrangementHtml(item.id)}" aria-label="Ta bort ${escapeArrangementHtml(item.title)}" title="Ta bort arrangemang"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z"/></svg></button></div>`
            : "";
        return `<article class="arrangement-card${cardWidth}"><div class="arrangement-card-top"><div><p class="arrangement-card-type">${escapeArrangementHtml(item.type)}</p><h2>${escapeArrangementHtml(item.title)}</h2></div><span class="arrangement-status arrangement-status--${escapeArrangementHtml(item.status)}">${escapeArrangementHtml(statusLabels[item.status] || statusLabels.planned)}</span></div><p class="arrangement-card-dates">${escapeArrangementHtml(formatDateSpan(item))}${item.start_time ? ` · ${escapeArrangementHtml(item.start_time)}` : ""}${item.end_time ? `–${escapeArrangementHtml(item.end_time)}` : ""}</p>${item.location ? `<p class="arrangement-card-location">${escapeArrangementHtml(item.location)}</p>` : ""}<div class="arrangement-participant-tags">${participantTags}</div>${link}${responsibilityHtml}${agendaHtml}${actions}</article>`;
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

function getCatalogOptions(kind, selectedSourceType = "", selectedSourceId = "", fallbackTitle = "") {
    const catalog = kind === "meal" ? recipes.map(item => ({ sourceType: "recipe", id: String(item.id), name: String(item.namn || "") }))
        : kind === "activity" ? activities.map(item => ({ sourceType: "activity", id: String(item.id), name: String(item.namn || "") }))
            : [];
    const validSelection = catalog.some(item => item.id === selectedSourceId && item.sourceType === selectedSourceType);
    const oldLabel = !validSelection && selectedSourceId ? `<option value="${escapeArrangementHtml(`${selectedSourceType}:${selectedSourceId}`)}" selected>${escapeArrangementHtml(`${fallbackTitle || draftAgenda.find(item => item.source_id === selectedSourceId)?.title || "Tidigare bibliotekspost"} (inte längre i biblioteket)`)}</option>` : "";
    return `<option value="">Egen post</option>${oldLabel}${catalog.map(item => `<option value="${escapeArrangementHtml(`${item.sourceType}:${item.id}`)}"${item.id === selectedSourceId && item.sourceType === selectedSourceType ? " selected" : ""}>${escapeArrangementHtml(item.name)}</option>`).join("")}`;
}

function renderAgendaEditor() {
    const startDate = document.getElementById("arrangementStartDate").value;
    const endDate = document.getElementById("arrangementEndDate").value || startDate;
    const selectedDepartments = getSelectedArrangementDepartments();
    draftAgenda.sort((left, right) => left.date.localeCompare(right.date) || (left.time || "99:99").localeCompare(right.time || "99:99"));
    arrangementAgendaList.innerHTML = draftAgenda.map(entry => {
        const mealField = entry.kind === "meal" ? `<label class="agenda-entry-field"><span>Måltid</span><select data-agenda-field="meal_type">${mealTypes.map(type => `<option${entry.meal_type === type ? " selected" : ""}>${type}</option>`).join("")}</select></label>` : "";
        const sourceField = entry.kind === "program" ? "" : `<label class="agenda-entry-field"><span>${entry.kind === "meal" ? "Recept" : "Aktivitet"}</span><select data-agenda-field="source">${getCatalogOptions(entry.kind, entry.source_type, entry.source_id, entry.title)}</select></label>`;
        const shared = entry.shared !== false;
        const scopeOptions = departments.map(department => {
            const isActive = selectedDepartments.includes(department);
            const isChecked = entry.departments?.includes(department);
            return `<label class="arrangement-department-choice department-tone-${departments.indexOf(department)}"><input class="agenda-department-target" type="checkbox" value="${escapeArrangementHtml(department)}"${isChecked ? " checked" : ""}${isActive ? "" : " disabled"}><span>${escapeArrangementHtml(department)}</span></label>`;
        }).join("");
        const inactiveScopeNote = !shared && entry.departments?.some(department => !selectedDepartments.includes(department))
            ? `<small class="agenda-scope-hidden-note">Posten visas bara om dess avdelning väljs för arrangemanget.</small>`
            : "";
        const scopeField = `<div class="agenda-entry-scope"><span>Gäller</span><label class="agenda-shared-choice"><input data-agenda-field="shared" type="checkbox"${shared ? " checked" : ""}>Gemensamt för alla</label><div class="agenda-scope-options${shared ? " hidden" : ""}">${scopeOptions}</div>${inactiveScopeNote}</div>`;
        return `<article class="arrangement-agenda-entry" data-agenda-id="${escapeArrangementHtml(entry.id)}"><div class="arrangement-agenda-entry-top"><strong>${escapeArrangementHtml(entry.title || (entry.kind === "meal" ? "Måltid" : entry.kind === "activity" ? "Aktivitet" : "Programpunkt"))}</strong><button class="agenda-entry-remove" type="button" data-remove-agenda="${escapeArrangementHtml(entry.id)}" aria-label="Ta bort programpunkt" title="Ta bort programpunkt">&times;</button></div><div class="arrangement-agenda-entry-grid"><label class="agenda-entry-field"><span>Datum</span><input data-agenda-field="date" type="date" min="${escapeArrangementHtml(startDate)}" max="${escapeArrangementHtml(endDate)}" value="${escapeArrangementHtml(entry.date)}" required></label><label class="agenda-entry-field"><span>Start</span><input data-agenda-field="time" type="time" value="${escapeArrangementHtml(entry.time)}"></label><label class="agenda-entry-field"><span>Slut</span><input data-agenda-field="end_time" type="time" value="${escapeArrangementHtml(entry.end_time || "")}"></label><label class="agenda-entry-field"><span>Typ</span><select data-agenda-field="kind"><option value="meal"${entry.kind === "meal" ? " selected" : ""}>Mat</option><option value="activity"${entry.kind === "activity" ? " selected" : ""}>Aktivitet</option><option value="program"${entry.kind === "program" ? " selected" : ""}>Program</option></select></label>${mealField}${sourceField}<label class="agenda-entry-field agenda-entry-title"><span>Namn</span><input data-agenda-field="title" type="text" maxlength="160" value="${escapeArrangementHtml(entry.title)}" required placeholder="Till exempel lägerbål"></label><label class="agenda-entry-field agenda-entry-notes"><span>Anteckning</span><input data-agenda-field="notes" type="text" maxlength="240" value="${escapeArrangementHtml(entry.notes)}" placeholder="Valfri notering"></label>${scopeField}</div></article>`;
    }).join("");
    arrangementAgendaEmpty.classList.toggle("hidden", draftAgenda.length > 0);
}

function renderAgendaEntryDialog(arrangement, entry, focusField = "title") {
    activeAgendaArrangementId = arrangement.id;
    activeAgendaEntryId = entry.id;
    const selectedDepartments = arrangement.departments?.length ? arrangement.departments : departments;
    const mealField = entry.kind === "meal" ? `<label class="agenda-entry-field"><span>Måltid</span><select data-agenda-field="meal_type">${mealTypes.map(type => `<option${entry.meal_type === type ? " selected" : ""}>${type}</option>`).join("")}</select></label>` : "";
    const sourceField = entry.kind === "program" ? "" : `<label class="agenda-entry-field"><span>${entry.kind === "meal" ? "Recept" : "Aktivitet"}</span><select data-agenda-field="source">${getCatalogOptions(entry.kind, entry.source_type, entry.source_id, entry.title)}</select></label>`;
    const shared = entry.shared !== false;
    const scopeOptions = selectedDepartments.map(department => {
        const isChecked = entry.departments?.includes(department);
        return `<label class="arrangement-department-choice department-tone-${departments.indexOf(department)}"><input class="agenda-department-target" type="checkbox" value="${escapeArrangementHtml(department)}"${isChecked ? " checked" : ""}${shared ? " disabled" : ""}><span>${escapeArrangementHtml(department)}</span></label>`;
    }).join("");
    const inactiveScopeNote = !shared && entry.departments?.some(department => !selectedDepartments.includes(department))
        ? `<small class="agenda-scope-hidden-note">Posten visas bara om dess avdelning väljs för arrangemanget.</small>`
        : "";
    agendaEntryDialogFields.innerHTML = `<div class="agenda-entry-scope"><span>Målgrupp</span><label class="agenda-shared-choice"><input data-agenda-field="shared" type="checkbox"${shared ? " checked" : ""}>Gemensamt för alla</label><div class="agenda-scope-options${shared ? " agenda-scope-options--disabled" : ""}">${scopeOptions}</div>${inactiveScopeNote}</div><label class="agenda-entry-field agenda-entry-title"><span>Namn</span><input data-agenda-field="title" type="text" maxlength="160" value="${escapeArrangementHtml(entry.title)}" required placeholder="Till exempel lägerbål"></label><label class="agenda-entry-field"><span>Datum</span><input data-agenda-field="date" type="date" min="${escapeArrangementHtml(arrangement.start_date)}" max="${escapeArrangementHtml(arrangement.end_date)}" value="${escapeArrangementHtml(entry.date)}" required></label><label class="agenda-entry-field"><span>Start</span><input data-agenda-field="time" type="time" value="${escapeArrangementHtml(entry.time)}"></label><label class="agenda-entry-field"><span>Slut</span><input data-agenda-field="end_time" type="time" value="${escapeArrangementHtml(entry.end_time || "")}"></label><label class="agenda-entry-field"><span>Typ</span><select data-agenda-field="kind"><option value="meal"${entry.kind === "meal" ? " selected" : ""}>Mat</option><option value="activity"${entry.kind === "activity" ? " selected" : ""}>Aktivitet</option><option value="program"${entry.kind === "program" ? " selected" : ""}>Program</option></select></label>${mealField}${sourceField}<label class="agenda-entry-field agenda-entry-notes"><span>Anteckningar</span><textarea data-agenda-field="notes" rows="3" maxlength="240" placeholder="Skriv anteckningar">${escapeArrangementHtml(entry.notes)}</textarea></label>`;
    document.getElementById("agendaEntryDialogTitle").textContent = activeAgendaEntryIsCopy ? "Kopiera programpunkt" : activeAgendaEntryIsNew ? "Ny programpunkt" : "Redigera programpunkt";
    document.getElementById("agendaEntryDialogStatus").textContent = "";
    document.getElementById("copyAgendaEntryBtn").classList.toggle("hidden", !isArrangementEditable(arrangement) || activeAgendaEntryIsCopy || activeAgendaEntryIsNew);
    document.getElementById("deleteAgendaEntryBtn").classList.toggle("hidden", !isArrangementEditable(arrangement) || activeAgendaEntryIsCopy || activeAgendaEntryIsNew);
    document.getElementById("saveAgendaEntryBtn").textContent = activeAgendaEntryIsCopy ? "Lägg till kopia" : activeAgendaEntryIsNew ? "Lägg till" : "Spara";
    agendaEntryModal.classList.remove("hidden");
    agendaEntryDialogFields.querySelector(`[data-agenda-field="${focusField}"]`)?.focus();
}

function readAgendaEntryDialog() {
    const value = field => agendaEntryDialogFields.querySelector(`[data-agenda-field="${field}"]`)?.value || "";
    const selectedSource = value("source");
    const [sourceType = "", ...sourceParts] = selectedSource.split(":");
    return {
        id: activeAgendaEntryId,
        date: value("date"),
        time: value("time"),
        end_time: value("end_time"),
        kind: value("kind"),
        meal_type: value("meal_type"),
        source_type: sourceParts.length ? sourceType : "",
        source_id: sourceParts.join(":"),
        shared: agendaEntryDialogFields.querySelector('[data-agenda-field="shared"]')?.checked !== false,
        departments: [...agendaEntryDialogFields.querySelectorAll(".agenda-department-target:checked")].map(input => input.value),
        title: value("title").trim(),
        notes: value("notes").trim()
    };
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

async function openArrangementEditor(item = null, focusAgendaId = "") {
    await defaultRoleDefinitionsLoaded;
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
    document.getElementById("arrangementNotes").value = item?.notes || "";
    document.getElementById("arrangementExperience").value = item?.experience || item?.after_notes || "";
    document.getElementById("arrangementFormStatus").textContent = "";
    document.getElementById("deleteArrangementBtn").classList.toggle("hidden", !item);
    document.getElementById("arrangementLocalNotice").classList.toggle("hidden", window.GTScoutArrangements?.canWrite());
    renderDepartmentOptions(item?.departments?.length ? item.departments : departments);
    populatePlanningOptions(item?.planning_ref?.id || "");
    draftResponsibilities = (item?.responsibilities || []).map(entry => {
        const roleDescription = entry.role_description || getRoleDefinition(entry.role)?.description || "";
        return { ...entry, role_description: roleDescription, description: entry.description || roleDescription };
    });
    renderResponsibilityList();
    draftAgenda = (item?.agenda || []).map(entry => ({ ...entry }));
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
        responsibilities: readResponsibilitiesFromDom(),
        notes: document.getElementById("arrangementNotes").value.trim(),
        experience: document.getElementById("arrangementExperience").value.trim()
    };
}

async function saveScheduleGesture(arrangementId, entryId, changes) {
    const arrangement = arrangements.find(item => item.id === arrangementId);
    if (!arrangement || !isArrangementEditable(arrangement)) return;
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

arrangementsGrid.addEventListener("pointerdown", event => {
    const handle = event.target.closest("[data-agenda-drag-handle], [data-agenda-resize-handle]");
    if (!handle || event.button !== 0) return;
    const card = handle.closest("[data-edit-agenda]");
    const wrapper = card?.closest(".arrangement-schedule-event");
    const arrangement = arrangements.find(item => item.id === card?.dataset.arrangementId);
    const entry = arrangement?.agenda.find(item => item.id === card?.dataset.editAgenda);
    const startMinutes = parseScheduleTime(entry?.time);
    if (!card || !wrapper || !entry || startMinutes === null || !isArrangementEditable(arrangement)) return;
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

arrangementsGrid.addEventListener("click", async event => {
    const editButton = event.target.closest("[data-edit-arrangement]");
    const agendaButton = event.target.closest("[data-edit-agenda]");
    const addAgendaButton = event.target.closest("[data-add-agenda]");
    const deleteButton = event.target.closest("[data-delete-arrangement]");
    if (agendaButton && event.detail > 0 && performance.now() < suppressScheduleClickUntil) {
        event.preventDefault();
        return;
    }
    if (addAgendaButton) {
        const item = arrangements.find(arrangement => arrangement.id === addAgendaButton.dataset.addAgendaArrangement);
        if (item && isArrangementEditable(item)) {
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
                shared: false,
                departments: [addAgendaButton.dataset.addAgendaDepartment],
                title: "",
                notes: ""
            });
        }
        return;
    }
    if (agendaButton) {
        const item = arrangements.find(arrangement => arrangement.id === agendaButton.dataset.arrangementId);
        const entry = item?.agenda.find(agendaEntry => agendaEntry.id === agendaButton.dataset.editAgenda);
        if (item && entry && isArrangementEditable(item)) {
            activeAgendaEntryIsCopy = false;
            activeAgendaEntryIsNew = false;
            agendaEntryDialogTrigger = agendaButton;
            renderAgendaEntryDialog(item, entry);
        }
        return;
    }
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
    if (!agendaEntryModal.classList.contains("hidden")) {
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
    draftAgenda.push({ id: crypto.randomUUID(), date: startDate, time: "", end_time: "", kind: "program", meal_type: "", source_type: "", source_id: "", shared: true, departments: [], title: "", notes: "" });
    renderAgendaEditor();
});

document.getElementById("arrangementDepartments").addEventListener("change", () => {
    syncDraftAgenda();
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

async function saveAgendaEntryChanges(arrangement, agenda, completionMessage) {
    const saveButton = document.getElementById("saveAgendaEntryBtn");
    const status = document.getElementById("agendaEntryDialogStatus");
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

agendaEntryDialogFields.addEventListener("change", event => {
    const arrangement = arrangements.find(item => item.id === activeAgendaArrangementId);
    if (!arrangement) return;
    const entry = readAgendaEntryDialog();
    const field = event.target.dataset.agendaField;
    if (field === "kind") {
        entry.source_id = "";
        entry.source_type = "";
        entry.title = "";
        entry.meal_type = entry.kind === "meal" ? mealTypes[0] : "";
        renderAgendaEntryDialog(arrangement, entry, "kind");
    } else if (field === "shared") {
        entry.departments = entry.shared ? [] : arrangement.departments;
        renderAgendaEntryDialog(arrangement, entry, "shared");
    } else if (field === "source") {
        const source = entry.source_type === "recipe" ? recipes.find(recipe => String(recipe.id) === entry.source_id)
            : entry.source_type === "activity" ? activities.find(activity => String(activity.id) === entry.source_id) : null;
        if (source) entry.title = source.namn || "";
        renderAgendaEntryDialog(arrangement, entry, "source");
    }
});

agendaEntryForm.addEventListener("submit", async event => {
    event.preventDefault();
    const arrangement = arrangements.find(item => item.id === activeAgendaArrangementId);
    const entry = readAgendaEntryDialog();
    const status = document.getElementById("agendaEntryDialogStatus");
    if (!arrangement || !isArrangementEditable(arrangement)) {
        status.textContent = "Arrangemanget kan inte redigeras.";
        return;
    }
    if (!entry.title || entry.date < arrangement.start_date || entry.date > arrangement.end_date || (entry.shared === false && !entry.departments.length) || entry.departments.some(department => !departments.includes(department))) {
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
    if (!arrangement || !isArrangementEditable(arrangement)) return;
    const copy = { ...readAgendaEntryDialog(), id: crypto.randomUUID() };
    activeAgendaEntryIsCopy = true;
    activeAgendaEntryIsNew = false;
    renderAgendaEntryDialog(arrangement, copy);
});

document.getElementById("deleteAgendaEntryBtn").addEventListener("click", async () => {
    const arrangement = arrangements.find(item => item.id === activeAgendaArrangementId);
    const entry = arrangement?.agenda.find(item => item.id === activeAgendaEntryId);
    if (!arrangement || !entry || !isArrangementEditable(arrangement) || !confirm(`Ta bort programpunkten "${entry.title}"?`)) return;
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
    if (payload.agenda.some(entry => !entry.title || entry.date < payload.start_date || entry.date > payload.end_date || (entry.shared === false && !entry.departments.length) || entry.departments.some(department => !departments.includes(department)))) {
        status.textContent = "Kontrollera namn, tider och avdelningar för varje programpunkt.";
        return;
    }
    if (payload.responsibilities.some(entry => entry.role ? !entry.person : !entry.description)) {
        status.textContent = "Fyll i ansvarig för vald roll eller skriv en fritextbeskrivning.";
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
    }
});
window.GTScoutAuth?.onChange(() => updateSyncStatus());
updateSyncStatus();
