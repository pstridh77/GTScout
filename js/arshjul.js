(function () {
    const VIEW_STORAGE_KEY = "gtscout_arshjul_view";
    const COLORS = ["#398a86", "#991d1b", "#c56b36", "#5d7cc5", "#8b83ef", "#56a86b", "#36a7d5", "#e49b38", "#d65b65", "#a45db2"];
    const DEPARTMENT_RING_COLORS = {
        Familjescouter: { standard: "#652d91", light: "#dfcce9" },
        Spårare: { standard: "#41a62a", light: "#d9efd2" },
        Upptäckare: { standard: "#00a8e1", light: "#cceefa" },
        Äventyrare: { standard: "#e95f13", light: "#f9ddce" },
        Utmanare: { standard: "#da005e", light: "#f5ccdf" },
        Rover: { standard: "#e2e000", light: "#f5f4b8" },
        Ledare: { standard: "#455a64", light: "#d3dadd" }
    };
    const LEGACY_DEFAULT_RING_COLORS = {
        Familjescouter: "#8b83ef",
        Spårare: "#56a86b",
        Upptäckare: "#36a7d5",
        Äventyrare: "#e49b38",
        Utmanare: "#d65b65",
        Rover: "#a45db2"
    };
    const DEFAULT_RINGS = [
        ["Familjescouter", DEPARTMENT_RING_COLORS.Familjescouter.standard],
        ["Spårare", DEPARTMENT_RING_COLORS.Spårare.standard],
        ["Upptäckare", DEPARTMENT_RING_COLORS.Upptäckare.standard],
        ["Äventyrare", DEPARTMENT_RING_COLORS.Äventyrare.standard],
        ["Utmanare", DEPARTMENT_RING_COLORS.Utmanare.standard],
        ["Rover", DEPARTMENT_RING_COLORS.Rover.standard],
        ["Styrelse", COLORS[0]], ["Kårgemensamt", COLORS[1]], ["Arrangemang", COLORS[2]],
        ["Terminer", COLORS[3]]
    ];
    const MONTHS = ["Januari", "Februari", "Mars", "April", "Maj", "Juni", "Juli", "Augusti", "September", "Oktober", "November", "December"];
    const byId = id => document.getElementById(id);
    const auth = () => window.GTScoutAuth;
    let wheels = [];
    let selectedWheelId = "";
    let selectedRingIds = new Set();
    let selectedRingsForWheelId = "";
    let departmentDisplayMode = "grouped";
    let departmentDisplayForWheelId = "";
    let departmentFilterGroupOpen = true;
    let departmentFilterForWheelId = "";
    let view = { mode: "calendar", year: new Date().getFullYear(), startMonth: 8, chartMode: "details" };
    let startMonthOverridden = false;
    let modalMode = "";
    let editingId = "";
    let wheelDraft = null;
    let draftRingIds = new Set();
    let draggedRingId = "";
    let departmentGroupOpen = true;
    const collapsedEventMonths = new Set();

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[char]));
    }

    function id() {
        return crypto.randomUUID();
    }

    function currentWheel() {
        return wheels.find(wheel => wheel.id === selectedWheelId) || null;
    }

    function canEdit() {
        return Boolean(!auth()?.isOnline?.() || !auth()?.isSignedIn?.() || window.GTScoutYearWheelSync?.canWrite?.());
    }

    function normalizeText(value, maxLength) {
        return String(value || "").trim().slice(0, maxLength).trimEnd();
    }

    function normalizeWheel(input) {
        const wheel = input && typeof input === "object" ? input : {};
        const rings = Array.isArray(wheel.rings) ? wheel.rings.map(ring => ({
            id: String(ring?.id || id()),
            name: String(ring?.name || "").trim().slice(0, 60),
            color: /^#[0-9a-f]{6}$/i.test(ring?.color) ? ring.color : COLORS[0],
            color_variant: ["standard", "light", "custom"].includes(ring?.color_variant) ? ring.color_variant : "custom"
        })).filter(ring => ring.name) : [];
        const ringIds = new Set(rings.map(ring => ring.id));
        const events = Array.isArray(wheel.events) ? wheel.events.map(event => {
            if (!event || typeof event !== "object" || !ringIds.has(String(event.ring_id))) return null;
            const startDate = String(event.start_date || "");
            const endDate = String(event.end_date || startDate);
            if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) return null;
            const ringId = String(event.ring_id);
            return {
                id: String(event.id || id()),
                ring_id: ringId,
                title: normalizeText(event.title, 120),
                start_date: startDate,
                end_date: endDate,
                color_variant: ["ring", "light", "dark", "custom"].includes(event.color_variant) ? event.color_variant : "ring",
                color: /^#[0-9a-f]{6}$/i.test(event.color) ? event.color : "",
                responsible: normalizeText(event.responsible, 100),
                location: normalizeText(event.location, 120),
                notes: normalizeText(event.notes, 2000),
                copied_from_id: String(event.copied_from_id || ""),
                needs_review: Boolean(event.needs_review),
                source_arrangement_id: String(event.source_arrangement_id || ""),
                source_arrangement_fields: {
                    responsible: Boolean(event.source_arrangement_fields?.responsible),
                    location: Boolean(event.source_arrangement_fields?.location),
                    notes: Boolean(event.source_arrangement_fields?.notes)
                }
            };
        }).filter(event => event?.title) : [];
        return {
            id: String(wheel.id || id()),
            name: String(wheel.name || "").trim().slice(0, 100),
            start_month: Math.min(12, Math.max(1, Number.parseInt(wheel.start_month, 10) || 8)),
            group_departments: wheel.group_departments !== false,
            department_ring_color: /^#[0-9a-f]{6}$/i.test(wheel.department_ring_color) ? wheel.department_ring_color : DEPARTMENT_RING_COLORS.Upptäckare.standard,
            rings,
            events,
            schema_version: Math.max(2, Number(wheel.schema_version) || 0),
            created_by: wheel.created_by || null,
            local_kar_id: wheel.local_kar_id || null,
            updated_at: wheel.updated_at || null,
            local_only: Boolean(wheel.local_only)
        };
    }

    function isDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(`${value}T12:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }

    function readViewPreferences() {
        try {
            const saved = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || "{}");
            if (["calendar", "operational"].includes(saved.mode)) view.mode = saved.mode;
            if (["overview", "details"].includes(saved.chartMode)) view.chartMode = saved.chartMode;
            if (Number.isInteger(saved.year) && saved.year >= 1900 && saved.year <= 2200) view.year = saved.year;
            if (Number.isInteger(saved.startMonth) && saved.startMonth >= 1 && saved.startMonth <= 12) {
                view.startMonth = saved.startMonth;
                startMonthOverridden = true;
            }
            if (saved.departmentDisplayByWheel && typeof saved.departmentDisplayByWheel === "object") {
                view.departmentDisplayByWheel = Object.fromEntries(Object.entries(saved.departmentDisplayByWheel)
                    .filter(([, mode]) => mode === "grouped" || mode === "individual"));
            }
        } catch (error) {
            console.error("Kunde inte läsa årshjulets vyinställningar", error);
        }
    }

    function saveViewPreferences() {
        localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
    }

    function period() {
        const start = view.mode === "calendar"
            ? new Date(Date.UTC(view.year, 0, 1))
            : new Date(Date.UTC(view.year, view.startMonth - 1, 1));
        const endExclusive = view.mode === "calendar"
            ? new Date(Date.UTC(view.year + 1, 0, 1))
            : new Date(Date.UTC(view.year + 1, view.startMonth - 1, 1));
        return { start, end: new Date(endExclusive.getTime() - 86400000), endExclusive };
    }

    function dateKey(date) {
        return date.toISOString().slice(0, 10);
    }

    function shiftDateToNextYear(dateString) {
        if (!isDate(dateString)) return "";
        const [year, month, day] = dateString.split("-").map(Number);
        if (year >= 9999) return "";
        const nextYear = year + 1;
        const lastDay = new Date(Date.UTC(nextYear, month, 0)).getUTCDate();
        return `${nextYear}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
    }

    function hasNextYearCopy(event, events) {
        if (event.copied_from_id) return true;
        const startDate = shiftDateToNextYear(event.start_date);
        const endDate = shiftDateToNextYear(event.end_date);
        if (!startDate || !endDate) return false;
        return events.some(candidate => {
            if (candidate.id === event.id || candidate.ring_id !== event.ring_id) return false;
            if (candidate.copied_from_id === event.id) return true;
            return candidate.title === event.title
                && candidate.start_date === startDate
                && candidate.end_date === endDate
                && candidate.responsible === event.responsible
                && candidate.location === event.location
                && candidate.notes === event.notes;
        });
    }

    function getEventDateSpan(startDate, endDate) {
        const start = new Date(`${startDate}T12:00:00Z`);
        const end = new Date(`${endDate}T12:00:00Z`);
        const span = Math.round((end - start) / 86400000);
        return Number.isFinite(span) ? Math.max(0, span) : 0;
    }

    function addDaysToEventDate(dateString, days) {
        const date = new Date(`${dateString}T12:00:00Z`);
        if (Number.isNaN(date.getTime())) return "";
        date.setUTCDate(date.getUTCDate() + days);
        return dateKey(date);
    }

    function updateEventEndDateFromStart(startInput, endInput, previousStartDate) {
        if (!startInput.value) return;
        const previousStart = previousStartDate || startInput.value;
        const previousEnd = endInput.value || previousStart;
        const duration = getEventDateSpan(previousStart, previousEnd);
        endInput.value = addDaysToEventDate(startInput.value, duration);
        startInput.dataset.previousValue = startInput.value;
    }

    function showEventInCurrentPeriod(event) {
        const range = period();
        const startKey = dateKey(range.start);
        const endKey = dateKey(range.end);
        if (event.start_date <= endKey && event.end_date >= startKey) return;

        const targetDate = event.end_date < startKey ? event.end_date : event.start_date;
        const [targetYear, targetMonth] = targetDate.split("-").map(Number);
        view.year = view.mode === "calendar" || targetMonth >= view.startMonth
            ? targetYear
            : targetYear - 1;
        saveViewPreferences();
    }

    function formatDate(dateString, options = { day: "numeric", month: "short" }) {
        if (!isDate(dateString)) return dateString;
        return new Intl.DateTimeFormat("sv-SE", { ...options, timeZone: "UTC" }).format(new Date(`${dateString}T12:00:00Z`));
    }

    function dayIndex(dateString, start) {
        return Math.floor((new Date(`${dateString}T12:00:00Z`) - start) / 86400000);
    }

    function totalDays(start, endExclusive) {
        return Math.round((endExclusive - start) / 86400000);
    }

    function point(radius, fraction) {
        const angle = fraction * Math.PI * 2 - Math.PI / 2;
        return { x: 320 + Math.cos(angle) * radius, y: 320 + Math.sin(angle) * radius, angle };
    }

    function arcPath(outer, inner, startFraction, endFraction) {
        const start = point(outer, startFraction);
        const finish = point(outer, endFraction);
        const innerFinish = point(inner, endFraction);
        const innerStart = point(inner, startFraction);
        const largeArc = endFraction - startFraction > 0.5 ? 1 : 0;
        return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${outer} ${outer} 0 ${largeArc} 1 ${finish.x.toFixed(2)} ${finish.y.toFixed(2)} L ${innerFinish.x.toFixed(2)} ${innerFinish.y.toFixed(2)} A ${inner} ${inner} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)} Z`;
    }

    function getRingTextColor(hexColor) {
        const channels = hexColor.match(/[a-f\d]{2}/gi)?.map(channel => parseInt(channel, 16) / 255) || [0, 0, 0];
        const luminance = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
            .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
        return luminance > 0.45 ? "#17303b" : "#ffffff";
    }

    function adjustHexColor(hexColor, amount) {
        const channels = hexColor.match(/[a-f\d]{2}/gi);
        if (!channels || channels.length !== 3) return hexColor;
        const target = amount > 0 ? 255 : 0;
        const adjusted = channels.map(channel => {
            const value = parseInt(channel, 16);
            return Math.round(value + (target - value) * Math.abs(amount))
                .toString(16)
                .padStart(2, "0");
        });
        return `#${adjusted.join("")}`;
    }

    function getRingBackgroundColor(ring) {
        return adjustHexColor(ring.color || DEPARTMENT_RING_COLORS.Upptäckare.standard, 0.84);
    }

    function getEventColor(event, ring) {
        if (event.color_variant === "custom" && /^#[0-9a-f]{6}$/i.test(event.color || "")) return event.color;
        if (event.color_variant === "light") return adjustHexColor(ring.color, 0.32);
        if (event.color_variant === "dark") return adjustHexColor(ring.color, -0.24);
        return ring.color;
    }

    function syncArrangementEvents(wheel, arrangements) {
        const ring = wheel.rings.find(item => item.name.trim().toLocaleLowerCase("sv") === "arrangemang");
        if (!ring) return null;
        const events = [...wheel.events];
        let changed = false;
        arrangements.forEach(arrangement => {
            const title = normalizeText(arrangement?.title, 120);
            const startDate = String(arrangement?.start_date || "");
            const endDate = String(arrangement?.end_date || startDate);
            const arrangementId = String(arrangement?.id || "");
            if (!arrangementId || !title || !isDate(startDate) || !isDate(endDate) || endDate < startDate) return;
            const responsible = normalizeText((Array.isArray(arrangement.responsibilities) ? arrangement.responsibilities : [])
                .map(entry => {
                    const person = String(entry?.person || "").trim();
                    const role = String(entry?.role || "").trim();
                    return person && role ? `${person} (${role})` : person || role;
                })
                .filter(Boolean)
                .join(", "), 100);
            const location = normalizeText(arrangement.location, 120);
            const notes = normalizeText(arrangement.notes, 2000);
            const sourceFields = {
                responsible: Boolean(responsible),
                location: Boolean(location),
                notes: Boolean(notes)
            };
            const index = events.findIndex(event => event.source_arrangement_id === arrangementId);
            if (index < 0) {
                events.push({
                    id: id(),
                    ring_id: ring.id,
                    title,
                    start_date: startDate,
                    end_date: endDate,
                    color_variant: "ring",
                    color: "",
                    responsible,
                    location,
                    notes,
                    source_arrangement_fields: sourceFields,
                    source_arrangement_id: arrangementId
                });
                changed = true;
                return;
            }
            const existing = events[index];
            const previousSources = existing.source_arrangement_fields || {};
            const syncedValue = (field, value) => value
                ? value
                : previousSources[field] ? "" : existing[field];
            const updated = {
                ...existing,
                ring_id: ring.id,
                title,
                start_date: startDate,
                end_date: endDate,
                responsible: syncedValue("responsible", responsible),
                location: syncedValue("location", location),
                notes: syncedValue("notes", notes),
                source_arrangement_fields: sourceFields
            };
            if (existing.ring_id === updated.ring_id && existing.title === updated.title
                && existing.start_date === updated.start_date && existing.end_date === updated.end_date
                && existing.responsible === updated.responsible && existing.location === updated.location
                && existing.notes === updated.notes
                && Boolean(previousSources.responsible) === sourceFields.responsible
                && Boolean(previousSources.location) === sourceFields.location
                && Boolean(previousSources.notes) === sourceFields.notes) return;
            events[index] = updated;
            changed = true;
        });
        return changed ? normalizeWheel({ ...wheel, events }) : null;
    }

    function isDepartmentRing(ring) {
        return Boolean(DEPARTMENT_RING_COLORS[ring.name]);
    }

    function getDisplayedRings(wheel, selectedIds, groupDepartments = true) {
        const departmentRings = wheel.rings.filter(ring => isDepartmentRing(ring));
        const shownDepartmentRings = departmentRings.filter(ring => selectedIds.has(ring.id));
        let departmentGroupAdded = false;
        const displayed = [];
        wheel.rings.forEach(ring => {
            if (isDepartmentRing(ring)) {
                if (groupDepartments && !departmentGroupAdded && shownDepartmentRings.length) {
                    displayed.push({
                        id: "__department_group__",
                        name: "Avdelning",
                        color: wheel.department_ring_color || DEPARTMENT_RING_COLORS.Upptäckare.standard,
                        sourceRings: shownDepartmentRings
                    });
                    departmentGroupAdded = true;
                } else if (!groupDepartments && selectedIds.has(ring.id)) {
                    displayed.push(ring);
                }
                return;
            }
            if (selectedIds.has(ring.id)) displayed.push(ring);
        });
        return { displayed, departmentRings };
    }

    function renderRingList(wheel) {
        const list = byId("yearWheelRingList");
        if (departmentFilterForWheelId !== wheel.id) {
            departmentFilterForWheelId = wheel.id;
            departmentFilterGroupOpen = true;
        }
        const { departmentRings } = getDisplayedRings(wheel, selectedRingIds, departmentDisplayMode === "grouped");
        const otherRings = wheel.rings.filter(ring => !isDepartmentRing(ring));
        const selectedDepartments = departmentRings.filter(ring => selectedRingIds.has(ring.id)).length;
        const renderRingRow = ring => `
            <div class="year-wheel-ring-row">
                <label class="year-wheel-ring-toggle">
                    <input type="checkbox" data-ring-toggle="${escapeHtml(ring.id)}" ${selectedRingIds.has(ring.id) ? "checked" : ""}>
                    <span class="year-wheel-ring-swatch" style="--ring-color:${ring.color}"></span>
                    <span>${escapeHtml(ring.name)}</span>
                </label>
            </div>`;
        list.innerHTML = wheel.rings.length ? `
            ${departmentRings.length && departmentDisplayMode === "grouped" ? `<details class="year-wheel-department-group"${departmentFilterGroupOpen ? " open" : ""}>
                <summary>
                    <span class="year-wheel-department-heading">
                        <input type="checkbox" data-department-toggle-all aria-label="Visa alla avdelningar" ${selectedDepartments === departmentRings.length ? "checked" : ""}>
                        <span>Avdelning</span>
                    </span>
                    <span class="year-wheel-department-chevron" aria-hidden="true"></span>
                </summary>
                <div class="year-wheel-department-list">${departmentRings.map(renderRingRow).join("")}</div>
            </details>` : ""}
            ${departmentRings.length && departmentDisplayMode === "individual" ? departmentRings.map(renderRingRow).join("") : ""}
            ${otherRings.map(renderRingRow).join("")}` : `<p class="year-wheel-empty">Lägg till en ring för att börja planera.</p>`;
        const departmentGroup = list.querySelector(".year-wheel-department-group");
        if (departmentGroup) {
            departmentGroup.open = departmentFilterGroupOpen;
            departmentGroup.addEventListener("toggle", () => { departmentFilterGroupOpen = departmentGroup.open; });
        }
        const departmentToggle = list.querySelector("[data-department-toggle-all]");
        if (departmentToggle) {
            departmentToggle.indeterminate = selectedDepartments > 0 && selectedDepartments < departmentRings.length;
            departmentToggle.addEventListener("click", event => event.stopPropagation());
            departmentToggle.addEventListener("change", () => {
                departmentRings.forEach(ring => {
                    if (departmentToggle.checked) selectedRingIds.add(ring.id);
                    else selectedRingIds.delete(ring.id);
                });
                render();
            });
        }
        list.querySelectorAll("[data-ring-toggle]").forEach(input => input.addEventListener("change", () => {
            if (input.checked) selectedRingIds.add(input.dataset.ringToggle);
            else selectedRingIds.delete(input.dataset.ringToggle);
            render();
        }));
    }

    function getEventArcFractions(startDay, endDay, days) {
        let from = Math.max(0, startDay / days);
        let to = Math.min(1, endDay / days);
        if (to <= from) return null;

        const minimumWidth = Math.min(1, 7 / days);
        if (to - from < minimumWidth) {
            from = Math.max(0, Math.min((from + to - minimumWidth) / 2, 1 - minimumWidth));
            to = from + minimumWidth;
        }
        return { from, to };
    }

    function getEventLaneLayout(events, maxLanes) {
        const lanes = [];
        const laneEnds = [];
        const overflowGroups = [];
        const ordered = [...events].sort((left, right) => left.from - right.from
            || right.to - left.to
            || left.event.title.localeCompare(right.event.title, "sv"));

        ordered.forEach(item => {
            const laneIndex = laneEnds.findIndex(end => end <= item.from);
            if (laneIndex >= 0) {
                lanes[laneIndex].push(item);
                laneEnds[laneIndex] = item.to;
                return;
            }
            if (lanes.length < maxLanes) {
                lanes.push([item]);
                laneEnds.push(item.to);
                return;
            }
            const group = overflowGroups[overflowGroups.length - 1];
            if (group && item.from <= group.to) {
                group.to = Math.max(group.to, item.to);
                group.events.push(item.event);
            } else {
                overflowGroups.push({ from: item.from, to: item.to, events: [item.event] });
            }
        });

        overflowGroups.forEach(group => {
            const overlappingEvents = ordered
                .filter(item => item.from < group.to && item.to > group.from)
                .map(item => item.event);
            group.events = [...new Map(overlappingEvents.map(event => [event.id, event])).values()];
        });

        lanes.forEach((lane, laneIndex) => lane.forEach(item => {
            const overlaps = ordered.filter(candidate => candidate.from < item.to && candidate.to > item.from);
            const changes = overlaps.flatMap(candidate => [
                [Math.max(item.from, candidate.from), 1],
                [Math.min(item.to, candidate.to), -1]
            ]).sort((left, right) => left[0] - right[0] || left[1] - right[1]);
            let active = 0;
            let maxConcurrent = 1;
            changes.forEach(([, change]) => {
                active += change;
                maxConcurrent = Math.max(maxConcurrent, active);
            });
            item.laneIndex = laneIndex;
            item.laneCount = Math.min(maxLanes, maxConcurrent);
        }));

        return { lanes, overflowGroups };
    }

    function openEventOverflow(events, ringById) {
        const rows = events.map(event => {
            const ring = ringById.get(event.ring_id);
            const details = `${ring?.name || "Avdelning"} · ${formatDate(event.start_date, { day: "numeric", month: "long", year: "numeric" })}${event.end_date !== event.start_date ? ` – ${formatDate(event.end_date, { day: "numeric", month: "long", year: "numeric" })}` : ""}`;
            const content = `<span class="year-wheel-overflow-swatch" style="--event-color:${getEventColor(event, ring)}"></span><span class="year-wheel-overflow-event-text"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(details)}</small></span>`;
            return canEdit()
                ? `<button class="year-wheel-overflow-event" type="button" data-overflow-event="${escapeHtml(event.id)}">${content}<span class="year-wheel-overflow-edit">Redigera</span></button>`
                : `<div class="year-wheel-overflow-event">${content}</div>`;
        }).join("");
        openModal("Flera aktiviteter samtidigt", `<div class="year-wheel-overflow-list">${rows}</div>`, "event-overflow");
        byId("yearWheelFormFields").querySelectorAll("[data-overflow-event]").forEach(button => {
            button.addEventListener("click", () => openEventForm(button.dataset.overflowEvent));
        });
    }

    function renderWheelChart(wheel, shownRings, visibleEvents, periodRange) {
        const container = byId("yearWheelChart");
        const { start, endExclusive } = periodRange;
        const days = totalDays(start, endExclusive);
        const outerRadius = 244;
        const innerRadius = 64;
        const ringWidth = shownRings.length ? (outerRadius - innerRadius) / shownRings.length : 0;
        const svg = [`<svg class="year-wheel-svg" viewBox="24 24 592 592" role="img" aria-label="Årshjul med månader och händelser"><defs><filter id="year-wheel-seam-shadow" x="60" y="60" width="520" height="520" filterUnits="userSpaceOnUse"><feDropShadow dx="3" dy="0" stdDeviation="2" flood-color="#142637" flood-opacity=".52"/></filter></defs>`];
        const monthIntervals = [];
        const monthLabels = [];
        const overflowActions = [];
        const ringGap = shownRings.length ? Math.min(18, Math.max(10, ringWidth * 0.5)) : 0;
        for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
            const monthIndex = view.mode === "calendar"
                ? monthOffset
                : (view.startMonth - 1 + monthOffset) % 12;
            const yearOffset = view.mode === "operational" && monthIndex < view.startMonth - 1 ? 1 : 0;
            const monthStart = new Date(Date.UTC(view.year + yearOffset, monthIndex, 1));
            const nextMonth = new Date(Date.UTC(view.year + yearOffset + (monthIndex === 11 ? 1 : 0), (monthIndex + 1) % 12, 1));
            const from = Math.max(0, dayIndex(dateKey(monthStart), start));
            const to = Math.min(days, dayIndex(dateKey(nextMonth), start));
            if (to <= from) continue;
            const startFraction = from / days;
            const endFraction = to / days;
            monthIntervals.push({ monthIndex, startFraction, endFraction, date: dateKey(monthStart) });
            const label = point(outerRadius + 16, (startFraction + endFraction) / 2);
            monthLabels.push(`<text x="${label.x.toFixed(2)}" y="${label.y.toFixed(2)}" class="year-wheel-month-label" text-anchor="middle" dominant-baseline="middle">${MONTHS[monthIndex].slice(0, 3)}</text>`);
        }

        shownRings.forEach((ring, ringIndex) => {
            const outer = outerRadius - ringIndex * ringWidth;
            const inner = outer - ringWidth;
            const backgroundPath = `${arcPath(outer, inner, 0, 0.5)} ${arcPath(outer, inner, 0.5, 1)}`;
            const labelRadius = outer;
            const labelPathId = `year-wheel-ring-label-path-${ringIndex}`;
            const labelStart = 0.94;
            const labelEnd = 1.06;
            const labelStartPoint = point(labelRadius, labelStart);
            const labelEndPoint = point(labelRadius, labelEnd);
            svg.push(`<path d="${backgroundPath}" fill="${getRingBackgroundColor(ring)}" class="year-wheel-ring-background"/>`);
            svg.push(`<circle cx="320" cy="320" r="${outer.toFixed(2)}" stroke-width="${ringGap.toFixed(2)}" class="year-wheel-ring-gap"/>`);
            svg.push(`<path id="${labelPathId}" d="M ${labelStartPoint.x.toFixed(2)} ${labelStartPoint.y.toFixed(2)} A ${labelRadius.toFixed(2)} ${labelRadius.toFixed(2)} 0 0 1 ${labelEndPoint.x.toFixed(2)} ${labelEndPoint.y.toFixed(2)}" class="year-wheel-ring-label-path"/>`);
        });

        if (canEdit() && wheel.rings.length) {
            shownRings.forEach((ring, ringIndex) => {
                const outer = outerRadius - ringIndex * ringWidth + ringGap / 2;
                const inner = ringIndex === shownRings.length - 1 ? innerRadius : outer - ringWidth;
                const sourceRing = ring.sourceRings?.[0] || ring;
                monthIntervals.forEach(({ monthIndex, startFraction, endFraction, date }) => {
                    svg.push(`<path d="${arcPath(outer, inner, startFraction, endFraction)}" class="year-wheel-month-action" data-month-create="${date}" data-ring-create="${escapeHtml(sourceRing.id)}" role="button" tabindex="0" aria-label="Lägg till händelse i ${escapeHtml(ring.name)}, ${MONTHS[monthIndex].toLowerCase()} ${date.slice(0, 4)}"><title>${escapeHtml(ring.name)} · Lägg till händelse ${date}</title></path>`);
                });
            });
        }

        monthIntervals.forEach(({ startFraction }) => {
            const separator = point(outerRadius + 2, startFraction);
            svg.push(`<line x1="320" y1="320" x2="${separator.x.toFixed(2)}" y2="${separator.y.toFixed(2)}" class="year-wheel-month-divider"/>`);
        });

        shownRings.forEach((ring, ringIndex) => {
            const slotOuter = outerRadius - ringIndex * ringWidth;
            const slotInner = slotOuter - ringWidth;
            const outer = slotOuter - ringGap / 2;
            const inner = slotInner + ringGap / 2;
            const sourceRings = ring.sourceRings || [ring];
            const sourceRingById = new Map(sourceRings.map(sourceRing => [sourceRing.id, sourceRing]));
            const events = visibleEvents.filter(event => sourceRingById.has(event.ring_id));
            svg.push(`<circle cx="320" cy="320" r="${((outer + inner) / 2).toFixed(2)}" class="year-wheel-ring-track"/>`);
            const positionedEvents = events.map(event => {
                const clippedStart = event.start_date < dateKey(start) ? dateKey(start) : event.start_date;
                const lastDay = dateKey(new Date(endExclusive.getTime() - 86400000));
                const clippedEnd = event.end_date > lastDay ? lastDay : event.end_date;
                const startDay = dayIndex(clippedStart, start);
                const endDay = dayIndex(clippedEnd, start) + 1;
                const arc = getEventArcFractions(startDay, endDay, days);
                return arc ? { event, from: arc.from, to: arc.to } : null;
            }).filter(Boolean);
            const maxLanes = Math.min(3, Math.max(1, Math.floor((outer - inner) / 6)));
            const { lanes, overflowGroups } = getEventLaneLayout(positionedEvents, maxLanes);
            lanes.forEach(lane => {
                lane.forEach(({ event, from, to: finish, laneIndex, laneCount }) => {
                    const laneHeight = (outer - inner) / laneCount;
                    const laneOuter = outer - laneIndex * laneHeight;
                    const laneInner = laneOuter - laneHeight;
                    const mid = (from + finish) / 2;
                    const radius = (laneOuter + laneInner) / 2;
                    const label = point(radius, mid);
                    const eventColor = getEventColor(event, sourceRingById.get(event.ring_id));
                    const tangentRotation = (mid * 360) % 360;
                    const rotation = tangentRotation > 90 && tangentRotation < 270 ? tangentRotation + 180 : tangentRotation;
                    const title = `${event.title} · ${formatDate(event.start_date)}${event.end_date !== event.start_date ? `–${formatDate(event.end_date)}` : ""}`;
                    const eventLabel = finish - from >= 0.04
                        ? `<text x="${label.x.toFixed(2)}" y="${label.y.toFixed(2)}" transform="rotate(${rotation.toFixed(1)} ${label.x.toFixed(2)} ${label.y.toFixed(2)})" style="fill:${getRingTextColor(eventColor)}" class="year-wheel-event-label">${escapeHtml(event.title)}</text>`
                        : "";
                    const laneInset = Math.min(0.8, Math.max(0.25, (laneOuter - laneInner) * 0.06));
                    const path = finish - from >= 0.999
                        ? `${arcPath(laneOuter - laneInset, laneInner + laneInset, from, from + 0.5)} ${arcPath(laneOuter - laneInset, laneInner + laneInset, from + 0.5, finish)}`
                        : arcPath(laneOuter - laneInset, laneInner + laneInset, from, finish);
                    svg.push(`<g class="year-wheel-event-mark" data-event-edit="${escapeHtml(event.id)}" tabindex="${canEdit() ? "0" : "-1"}" role="${canEdit() ? "button" : "img"}" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title><path d="${path}" fill="${eventColor}" class="year-wheel-event-arc"/>${eventLabel}</g>`);
                });
            });
            overflowGroups.forEach(group => {
                const mid = (group.from + group.to) / 2;
                const badge = point((outer + inner) / 2, mid);
                const count = group.events.length;
                const label = `+${count}`;
                const title = `${count} ${count === 1 ? "aktivitet" : "aktiviteter"} samtidigt. Klicka för att visa hela listan.`;
                const actionIndex = overflowActions.push(group.events) - 1;
                svg.push(`<g class="year-wheel-overflow-mark" data-event-overflow="${actionIndex}" tabindex="0" role="button" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title><circle cx="${badge.x.toFixed(2)}" cy="${badge.y.toFixed(2)}" r="10" class="year-wheel-overflow-badge"/><text x="${badge.x.toFixed(2)}" y="${badge.y.toFixed(2)}" class="year-wheel-overflow-label">${label}</text></g>`);
            });
        });
        shownRings.forEach((ring, ringIndex) => {
            const label = escapeHtml(ring.name.length > 24 ? `${ring.name.slice(0, 23)}…` : ring.name);
            const fontSize = Math.max(6, Math.min(10, ringGap * 0.9));
            svg.push(`<text class="year-wheel-ring-label" dominant-baseline="central" style="font-size:${fontSize.toFixed(1)}px"><title>${escapeHtml(ring.name)}</title><textPath href="#year-wheel-ring-label-path-${ringIndex}" startOffset="50%" text-anchor="middle">${label}</textPath></text>`);
        });
        if (shownRings.length) {
            const januaryStart = new Date(Date.UTC(
                start.getUTCFullYear() + (start.getUTCMonth() === 0 ? 0 : 1),
                0,
                1
            ));
            const seamFraction = dayIndex(dateKey(januaryStart), start) / days;
            const seamOuter = point(outerRadius, seamFraction);
            const seamInner = point(innerRadius, seamFraction);
            svg.push(`<line x1="${seamOuter.x.toFixed(2)}" y1="${seamOuter.y.toFixed(2)}" x2="${seamInner.x.toFixed(2)}" y2="${seamInner.y.toFixed(2)}" class="year-wheel-year-seam"/>`);
        }
        if (!shownRings.length) svg.push(`<circle cx="320" cy="320" r="64" class="year-wheel-empty-center"/>`);
        svg.push(...monthLabels);
        const endYear = periodRange.end.getUTCFullYear();
        const centerYear = view.mode === "calendar" || endYear === view.year
            ? String(view.year)
            : `${view.year}–${String(endYear).slice(-2)}`;
        svg.push(`<text x="320" y="310" class="year-wheel-center-title year-wheel-year-edit" text-anchor="middle" role="button" tabindex="0" data-year-edit aria-label="Ändra ${view.mode === "calendar" ? "kalenderår" : "verksamhetsårets startår"}, ${view.year}">${centerYear}</text>`);
        svg.push(`<text x="320" y="334" class="year-wheel-center-subtitle" text-anchor="middle">${view.mode === "calendar" ? "Kalenderår" : "Verksamhetsår"}</text></svg>`);
        container.innerHTML = svg.join("");
        container.querySelectorAll("[data-month-create]").forEach(mark => {
            mark.addEventListener("click", () => openEventForm("", mark.dataset.monthCreate, mark.dataset.ringCreate));
            mark.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEventForm("", mark.dataset.monthCreate, mark.dataset.ringCreate);
                }
            });
        });
        const yearButton = container.querySelector("[data-year-edit]");
        yearButton.addEventListener("click", openYearForm);
        yearButton.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openYearForm();
            }
        });
        container.querySelectorAll("[data-event-edit]").forEach(mark => {
            mark.addEventListener("click", () => openEventForm(mark.dataset.eventEdit));
            mark.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEventForm(mark.dataset.eventEdit);
                }
            });
        });
        const ringById = new Map(wheel.rings.map(item => [item.id, item]));
        container.querySelectorAll("[data-event-overflow]").forEach(mark => {
            const overflowEvents = overflowActions[Number(mark.dataset.eventOverflow)];
            if (!overflowEvents) return;
            mark.addEventListener("click", () => openEventOverflow(overflowEvents, ringById));
            mark.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEventOverflow(overflowEvents, ringById);
                }
            });
        });
    }

    function groupEventsByMonth(events) {
        const ordered = [...events].sort((left, right) => left.start_date.localeCompare(right.start_date) || left.title.localeCompare(right.title, "sv"));
        const groups = new Map();
        ordered.forEach(event => {
            const month = event.start_date.slice(0, 7);
            if (!groups.has(month)) groups.set(month, []);
            groups.get(month).push(event);
        });
        return groups;
    }

    function toggleEventMonths(groups, collapsedMonths) {
        const collapse = groups.some(group => group.open);
        groups.forEach(group => {
            const month = group.dataset.eventMonth;
            group.open = !collapse;
            if (collapse) collapsedMonths.add(month);
            else collapsedMonths.delete(month);
        });
        return collapse;
    }

    function updateEventMonthToggle(groups) {
        const buttons = document.querySelectorAll('[data-collapse-all="year-wheel-months"]');
        const allCollapsed = groups.length > 0 && groups.every(group => !group.open);
        const allExpanded = groups.length > 0 && groups.every(group => group.open);
        buttons.forEach(button => {
            const isMenuButton = button.classList.contains("section-collapse-menu-item");
            button.textContent = allCollapsed
                ? (isMenuButton ? "Visa alla månader" : "Visa")
                : (isMenuButton ? "Fäll ihop alla månader" : "Fäll ihop");
            button.setAttribute("aria-expanded", String(allExpanded));
            button.disabled = groups.length === 0;
        });
    }

    function updateYearWheelMenuActions() {
        const restrictedUser = Boolean(auth()?.isOnline?.() && auth()?.isSignedIn?.()) && !auth()?.isLeader?.();
        byId("yearWheelMenuAddEventBtn").disabled = !currentWheel() || !canEdit() || !currentWheel().rings.length;
        byId("yearWheelMenuAddBtn").classList.toggle("hidden", restrictedUser);
        byId("yearWheelMenuSettingsBtn").classList.toggle("hidden", !currentWheel() || !canEdit());
        byId("yearWheelMenuCopyEventsBtn").classList.toggle("hidden", !currentWheel() || !canEdit());
    }

    function copyEventToNextYear(eventId) {
        const wheel = currentWheel();
        const event = wheel?.events.find(item => item.id === eventId);
        if (!wheel || !event || !canEdit()) return;
        const startDate = shiftDateToNextYear(event.start_date);
        const endDate = shiftDateToNextYear(event.end_date);
        if (!startDate || !endDate) {
            byId("yearWheelSyncStatus").textContent = "Händelsen kan inte kopieras eftersom datumet ligger utanför det tillåtna kalenderintervallet.";
            byId("yearWheelSyncStatus").classList.remove("hidden");
            byId("yearWheelSyncStatus").classList.add("planning-sync-status--error");
            return;
        }
        const copiedEvent = {
            ...event,
            id: id(),
            start_date: startDate,
            end_date: endDate,
            copied_from_id: event.id,
            needs_review: true,
            source_arrangement_id: "",
            source_arrangement_fields: {}
        };
        const updated = normalizeWheel({ ...wheel, events: [...wheel.events, copiedEvent] });
        wheels = wheels.map(item => item.id === wheel.id ? updated : item);
        selectedRingIds.add(copiedEvent.ring_id);
        const [year, month] = copiedEvent.start_date.split("-").map(Number);
        view.year = view.mode === "calendar" || month >= view.startMonth ? year : year - 1;
        saveViewPreferences();
        render();
        saveWheel(updated);
        openEventForm(copiedEvent.id);
    }

    function getCopyableEvents(wheel) {
        const range = period();
        const startKey = dateKey(range.start);
        const endKey = dateKey(range.end);
        return wheel.events.filter(event => event.start_date <= endKey
            && event.end_date >= startKey
            && !hasNextYearCopy(event, wheel.events));
    }

    function openBulkCopyForm() {
        const wheel = currentWheel();
        if (!wheel || !canEdit()) return;
        const events = getCopyableEvents(wheel);
        const groups = groupEventsByMonth(events);
        const fields = groups.size ? [...groups].map(([month, monthEvents]) => {
            const monthLabel = formatDate(`${month}-01`, { month: "long", year: "numeric" });
            const title = monthLabel.charAt(0).toLocaleUpperCase("sv") + monthLabel.slice(1);
            return `<details class="year-wheel-copy-month" open>
                <summary class="year-wheel-copy-month-summary"><span class="year-wheel-copy-chevron" aria-hidden="true"></span><input type="checkbox" data-copy-month="${escapeHtml(month)}" aria-label="Markera alla händelser i ${escapeHtml(title)}"><strong>${escapeHtml(title)}</strong><span class="year-wheel-copy-month-count">${monthEvents.length} ${monthEvents.length === 1 ? "händelse" : "händelser"}</span></summary>
                <div class="year-wheel-copy-month-events">${monthEvents.map(event => `<label class="year-wheel-copy-option"><input type="checkbox" name="copy_event_ids" value="${escapeHtml(event.id)}" data-copy-month-event="${escapeHtml(month)}"><span>${escapeHtml(event.title)}</span><small>${escapeHtml(formatDate(event.start_date, { day: "numeric", month: "long" }))}${event.end_date !== event.start_date ? ` – ${escapeHtml(formatDate(event.end_date, { day: "numeric", month: "long" }))}` : ""}</small></label>`).join("")}</div>
            </details>`;
        }).join("") : `<p class="year-wheel-empty">Inga händelser att kopiera för den valda perioden. Händelser som redan har en kopia hoppas över.</p>`;
        const range = period();
        const startYear = range.start.getUTCFullYear();
        const endYear = range.end.getUTCFullYear();
        const yearLabel = startYear === endYear ? String(startYear) : `${startYear}–${endYear}`;
        const content = `<label class="year-wheel-copy-select-year"><input type="checkbox" data-copy-year ${events.length ? "" : "disabled"}> Markera alla händelser ${startYear === endYear ? `år ${yearLabel}` : `för perioden ${yearLabel}`}</label><div class="year-wheel-copy-list">${fields}</div>`;
        openModal("Kopiera händelser till nästa år", content, "bulk-copy");
        const submitButton = byId("yearWheelForm").querySelector('[type="submit"]');
        submitButton.textContent = "Kopiera valda";
        submitButton.disabled = events.length === 0;
        const fieldsContainer = byId("yearWheelFormFields");
        const updateYearSelectionState = () => {
            const yearCheckbox = fieldsContainer.querySelector("[data-copy-year]");
            const eventCheckboxes = [...fieldsContainer.querySelectorAll("[data-copy-month-event]")];
            const selectedCount = eventCheckboxes.filter(checkbox => checkbox.checked).length;
            yearCheckbox.checked = eventCheckboxes.length > 0 && selectedCount === eventCheckboxes.length;
            yearCheckbox.indeterminate = selectedCount > 0 && selectedCount < eventCheckboxes.length;
        };
        fieldsContainer.querySelector("[data-copy-year]").addEventListener("change", event => {
            fieldsContainer.querySelectorAll("[data-copy-month-event]").forEach(checkbox => {
                checkbox.checked = event.currentTarget.checked;
            });
            fieldsContainer.querySelectorAll("[data-copy-month]").forEach(checkbox => {
                checkbox.checked = event.currentTarget.checked;
                checkbox.indeterminate = false;
            });
        });
        byId("yearWheelFormFields").querySelectorAll(".year-wheel-copy-month-summary").forEach(summary => {
            const monthCheckbox = summary.querySelector("[data-copy-month]");
            monthCheckbox.addEventListener("click", event => event.stopPropagation());
            monthCheckbox.addEventListener("change", event => {
                event.stopPropagation();
                byId("yearWheelFormFields").querySelectorAll(`[data-copy-month-event="${monthCheckbox.dataset.copyMonth}"]`).forEach(eventCheckbox => {
                    eventCheckbox.checked = monthCheckbox.checked;
                });
                monthCheckbox.indeterminate = false;
                updateYearSelectionState();
            });
        });
        byId("yearWheelFormFields").querySelectorAll("[data-copy-month-event]").forEach(eventCheckbox => {
            eventCheckbox.addEventListener("change", () => {
                const monthCheckbox = byId("yearWheelFormFields").querySelector(`[data-copy-month="${eventCheckbox.dataset.copyMonthEvent}"]`);
                const monthEvents = [...byId("yearWheelFormFields").querySelectorAll(`[data-copy-month-event="${eventCheckbox.dataset.copyMonthEvent}"]`)];
                monthCheckbox.checked = monthEvents.every(item => item.checked);
                monthCheckbox.indeterminate = monthEvents.some(item => item.checked) && !monthCheckbox.checked;
                updateYearSelectionState();
            });
        });
    }

    function markEventReviewed(eventId) {
        const wheel = currentWheel();
        const event = wheel?.events.find(item => item.id === eventId);
        if (!wheel || !event || !event.needs_review || !canEdit()) return;
        const updated = normalizeWheel({
            ...wheel,
            events: wheel.events.map(item => item.id === eventId ? { ...item, needs_review: false } : item)
        });
        wheels = wheels.map(item => item.id === wheel.id ? updated : item);
        render();
        saveWheel(updated);
    }

    function renderEventList(wheel, events) {
        const list = byId("yearWheelEvents");
        const ringById = new Map(wheel.rings.map(ring => [ring.id, ring]));
        const groups = groupEventsByMonth(events);
        list.innerHTML = groups.size ? [...groups].map(([month, monthEvents]) => {
            const monthLabel = formatDate(`${month}-01`, { month: "long", year: "numeric" });
            const title = monthLabel.charAt(0).toLocaleUpperCase("sv") + monthLabel.slice(1);
            const cards = monthEvents.map(event => {
                const ring = ringById.get(event.ring_id);
                return `<article class="year-wheel-event-card${event.needs_review ? " year-wheel-event-card--needs-review" : ""}">
                    <span class="year-wheel-event-card-swatch" style="--ring-color:${getEventColor(event, ring)}"></span>
                    <div class="year-wheel-event-card-main"><strong>${escapeHtml(event.title)}${event.needs_review ? ` <span class="year-wheel-review-badge">Kontrollera kopia</span>` : ""}</strong><span>${escapeHtml(ring.name)} · ${escapeHtml(formatDate(event.start_date, { day: "numeric", month: "long", year: "numeric" }))}${event.end_date !== event.start_date ? ` – ${escapeHtml(formatDate(event.end_date, { day: "numeric", month: "long", year: "numeric" }))}` : ""}</span>${event.responsible ? `<small>Ansvarig: ${escapeHtml(event.responsible)}</small>` : ""}${event.location ? `<small>Plats: ${escapeHtml(event.location)}</small>` : ""}${event.notes ? `<small class="year-wheel-event-notes">${escapeHtml(event.notes)}</small>` : ""}</div>
                    ${canEdit() ? `<div class="year-wheel-event-actions">${event.needs_review ? `<button class="btn-secondary" type="button" data-mark-event-reviewed="${escapeHtml(event.id)}" title="Markera kopian som kontrollerad">Kontrollerad</button>` : ""}<button class="btn-secondary" type="button" data-copy-event="${escapeHtml(event.id)}" aria-label="Kopiera ${escapeHtml(event.title)} till nästa år" title="Kopiera till nästa år"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg></button><button class="btn-secondary" type="button" data-edit-event="${escapeHtml(event.id)}" aria-label="Redigera ${escapeHtml(event.title)}" title="Redigera"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5L9 20l-6 1 1-6L16 3Z"></path><path d="m14 5 5 5"></path></svg></button></div>` : ""}
                </article>`;
            }).join("");
            return `<details class="year-wheel-month-group" data-event-month="${month}" ${collapsedEventMonths.has(month) ? "" : "open"}>
                <summary class="recipe-meal-summary"><strong>${escapeHtml(title)}</strong><span>${monthEvents.length} ${monthEvents.length === 1 ? "händelse" : "händelser"}</span></summary>
                <div class="year-wheel-events">${cards}</div>
            </details>`;
        }).join("") : `<p class="year-wheel-empty">Inga händelser för de valda ringarna i den här perioden.</p>`;
        const monthGroups = [...list.querySelectorAll("[data-event-month]")];
        updateEventMonthToggle(monthGroups);
        monthGroups.forEach(group => group.addEventListener("toggle", () => {
            if (group.open) collapsedEventMonths.delete(group.dataset.eventMonth);
            else collapsedEventMonths.add(group.dataset.eventMonth);
            updateEventMonthToggle([...list.querySelectorAll("[data-event-month]")]);
        }));
        list.querySelectorAll("[data-copy-event]").forEach(button => button.addEventListener("click", () => copyEventToNextYear(button.dataset.copyEvent)));
        list.querySelectorAll("[data-mark-event-reviewed]").forEach(button => button.addEventListener("click", () => markEventReviewed(button.dataset.markEventReviewed)));
        list.querySelectorAll("[data-edit-event]").forEach(button => button.addEventListener("click", () => openEventForm(button.dataset.editEvent)));
    }

    function render() {
        document.body.classList.toggle("year-wheel-page--details", view.chartMode === "details");
        byId("yearWheelOverviewBtn").setAttribute("aria-pressed", String(view.chartMode === "overview"));
        byId("yearWheelDetailsBtn").setAttribute("aria-pressed", String(view.chartMode === "details"));
        byId("yearWheelChart").classList.toggle("year-wheel-chart--overview", view.chartMode === "overview");
        const selector = byId("yearWheelSelect");
        const previousId = selectedWheelId;
        selector.innerHTML = wheels.map(wheel => `<option value="${escapeHtml(wheel.id)}">${escapeHtml(wheel.name)}</option>`).join("");
        if (!wheels.length) {
            selectedWheelId = "";
            byId("yearWheelDisplayName").textContent = "Inget årshjul valt";
            byId("yearWheelDateRange").textContent = "";
            byId("yearWheelChart").innerHTML = `<p class="year-wheel-empty">Skapa ett årshjul för att komma igång.</p>`;
            byId("yearWheelRingList").innerHTML = `<p class="year-wheel-empty">Inga ringar att visa.</p>`;
            byId("yearWheelEvents").innerHTML = "";
            updateEventMonthToggle([]);
            updateYearWheelMenuActions();
            selector.disabled = true;
            byId("addYearWheelEventBtn").disabled = true;
            byId("yearWheelReadOnlyNote").classList.add("hidden");
            byId("yearWheelDepartmentDisplayField").classList.add("hidden");
            return;
        }
        selectedWheelId = wheels.some(wheel => wheel.id === previousId) ? previousId : wheels[0].id;
        selector.value = selectedWheelId;
        const wheel = currentWheel();
        if (departmentDisplayForWheelId !== wheel.id) {
            departmentDisplayMode = view.departmentDisplayByWheel?.[wheel.id] || (wheel.group_departments ? "grouped" : "individual");
            departmentDisplayForWheelId = wheel.id;
        }
        if (!startMonthOverridden) view.startMonth = wheel.start_month;
        const validRingIds = new Set(wheel.rings.map(ring => ring.id));
        if (selectedRingsForWheelId !== wheel.id || [...selectedRingIds].some(ringId => !validRingIds.has(ringId))) {
            selectedRingIds = new Set(wheel.rings.map(ring => ring.id));
            selectedRingsForWheelId = wheel.id;
        }
        selector.disabled = false;
        byId("addYearWheelEventBtn").disabled = !canEdit() || !wheel.rings.length;
        const remoteWritable = Boolean(window.GTScoutYearWheelSync?.canWrite?.());
        byId("yearWheelReadOnlyNote").textContent = canEdit() && !remoteWritable
            ? "Det här årshjulet sparas lokalt. Logga in som ledare för att dela med kåren."
            : "Du kan visa och filtrera hjulet. Ledare kan redigera.";
        byId("yearWheelReadOnlyNote").classList.toggle("hidden", remoteWritable);
        byId("yearWheelDisplayName").textContent = wheel.name;
        updateYearWheelMenuActions();
        byId("yearWheelMode").value = view.mode;
        byId("yearWheelYear").value = view.year;
        byId("yearWheelYearLabel").textContent = view.mode === "calendar" ? "Kalenderår" : "Verksamhetsår (startår)";
        byId("yearWheelDepartmentDisplayField").classList.toggle("hidden", !wheel.rings.some(isDepartmentRing));
        byId("yearWheelDepartmentDisplay").value = departmentDisplayMode;
        byId("yearWheelStartMonthField").classList.toggle("hidden", view.mode !== "operational");
        byId("yearWheelStartMonth").value = String(view.startMonth);
        const range = period();
        const startKey = dateKey(range.start);
        const endKey = dateKey(range.end);
        byId("yearWheelDateRange").textContent = `${formatDate(startKey, { day: "numeric", month: "long", year: "numeric" })} – ${formatDate(endKey, { day: "numeric", month: "long", year: "numeric" })}`;
        renderRingList(wheel);
        const { displayed: shownRings } = getDisplayedRings(wheel, selectedRingIds, departmentDisplayMode === "grouped");
        const visibleEvents = wheel.events.filter(event => selectedRingIds.has(event.ring_id)
            && event.start_date <= endKey && event.end_date >= startKey);
        renderWheelChart(wheel, shownRings, visibleEvents, range);
        renderEventList(wheel, visibleEvents);
    }

    function openModal(title, formFields, mode, itemId = "") {
        modalMode = mode;
        editingId = itemId;
        byId("yearWheelModal").querySelector(".year-wheel-modal-content").classList.toggle("year-wheel-modal-content--bulk-copy", mode === "bulk-copy");
        byId("yearWheelForm").classList.toggle("year-wheel-form--bulk-copy", mode === "bulk-copy");
        byId("yearWheelModalTitle").textContent = title;
        byId("yearWheelFormFields").innerHTML = formFields;
        byId("yearWheelFormMessage").classList.add("hidden");
        const submitButton = byId("yearWheelForm").querySelector('[type="submit"]');
        submitButton.textContent = "Spara";
        submitButton.disabled = false;
        const deleteButton = byId("deleteYearWheelItemBtn");
        deleteButton.classList.toggle("hidden", !itemId || !["ring", "event", "wheel"].includes(mode));
        deleteButton.disabled = false;
        deleteButton.removeAttribute("title");
        byId("yearWheelModal").classList.remove("hidden");
        byId("yearWheelFormFields").querySelector("input,select,textarea")?.focus();
    }

    function closeModal() {
        if (["ring", "department-ring-color"].includes(modalMode) && wheelDraft) {
            renderWheelDraft();
            return;
        }
        byId("yearWheelModal").classList.add("hidden");
        byId("yearWheelModal").querySelector(".year-wheel-modal-content").classList.remove("year-wheel-modal-content--bulk-copy");
        byId("yearWheelForm").classList.remove("year-wheel-form--bulk-copy");
        modalMode = "";
        editingId = "";
        wheelDraft = null;
    }

    function openYearForm() {
        const label = view.mode === "calendar" ? "Kalenderår" : "Verksamhetsår (startår)";
        openModal("Ändra år", `
            <label class="modal-field"><span>${label}</span><input name="year" type="number" required min="1900" max="2200" step="1" value="${view.year}"></label>
        `, "year");
    }

    function openWheelForm() {
        departmentGroupOpen = true;
        wheelDraft = { id: "", name: "", start_month: view.startMonth, group_departments: true,
            department_ring_color: DEPARTMENT_RING_COLORS.Upptäckare.standard,
            rings: DEFAULT_RINGS.map(([name]) => createDefaultRing(name)), events: [] };
        draftRingIds = new Set(wheelDraft.rings.map(ring => ring.id));
        renderWheelDraft();
    }

    function openWheelSettings() {
        const wheel = currentWheel();
        if (!wheel || !canEdit()) return;
        departmentGroupOpen = true;
        wheelDraft = { ...wheel, rings: [...wheel.rings] };
        draftRingIds = new Set(wheel.rings.map(ring => ring.id));
        renderWheelDraft();
    }

    function renderWheelDraft() {
        const draft = wheelDraft;
        openModal(draft.id ? "Inställningar för årshjul" : "Nytt årshjul", `
            <label class="modal-field"><span>Namn</span><input name="name" required maxlength="100" value="${escapeHtml(draft.name)}" placeholder="Till exempel Kårens verksamhetsår"></label>
            <label class="modal-field"><span>Verksamhetsåret börjar</span><select name="start_month">${MONTHS.map((month, index) => `<option value="${index + 1}" ${index + 1 === Number(draft.start_month) ? "selected" : ""}>${month}</option>`).join("")}</select></label>
            ${renderDepartmentDisplayOption(draft.group_departments)}
            ${renderRingSelection(draft.rings, draft.events, false, draftRingIds, draft.group_departments, draft.department_ring_color)}
        `, "wheel", draft.id);
        const departmentToggle = byId("yearWheelFormFields").querySelector("[data-config-department-toggle-all]");
        if (departmentToggle) departmentToggle.indeterminate = departmentToggle.dataset.indeterminate === "true";
        const departmentDetails = byId("yearWheelFormFields").querySelector(".year-wheel-ring-group-details");
        departmentDetails?.addEventListener("toggle", () => { departmentGroupOpen = departmentDetails.open; });
    }

    function updateDepartmentGroupToggle(group) {
        const details = group.querySelector(".year-wheel-ring-group-details");
        if (!details) return;
        const ringInputs = [...group.querySelectorAll(".year-wheel-ring-config-children .year-wheel-ring-option input[type=checkbox]")];
        const selectedCount = ringInputs.filter(input => input.checked).length;
        const selectedEventCount = ringInputs.filter(input => input.checked)
            .reduce((total, input) => total + (Number(input.dataset.eventCount) || 0), 0);
        const eventLabel = `${selectedEventCount} ${selectedEventCount === 1 ? "händelse" : "händelser"}`;
        const count = group.querySelector("[data-department-group-count]");
        if (count) count.textContent = `${selectedCount} av ${ringInputs.length} valda · ${eventLabel}`;
    }

    function captureWheelDraft() {
        const data = new FormData(byId("yearWheelForm"));
        const value = Object.fromEntries(data.entries());
        wheelDraft.name = String(value.name || "");
        wheelDraft.start_month = value.start_month;
        wheelDraft.group_departments = value.group_departments !== "individual";
        if (/^#[0-9a-f]{6}$/i.test(value.department_ring_color || "")) wheelDraft.department_ring_color = value.department_ring_color;
        const selected = buildConfiguredRings(wheelDraft.rings, data.getAll("ring_ids").map(String), data.getAll("ring_names").map(String));
        selected.forEach(ring => {
            if (!wheelDraft.rings.some(item => item.id === ring.id)) wheelDraft.rings.push(ring);
        });
        draftRingIds = new Set(selected.map(ring => ring.id));
    }

    function deleteDraftRing(ringId) {
        if (getRingEventCount(wheelDraft.events, ringId)) {
            byId("yearWheelFormMessage").textContent = "Flytta eller ta bort ringens händelser innan ringen tas bort.";
            byId("yearWheelFormMessage").classList.remove("hidden");
            return;
        }
        const ring = wheelDraft.rings.find(item => item.id === ringId);
        if (!ring || !window.confirm(`Ta bort ringen "${ring.name}"?`)) return;
        wheelDraft.rings = wheelDraft.rings.filter(item => item.id !== ringId);
        draftRingIds.delete(ringId);
        renderWheelDraft();
    }

    function renderDepartmentDisplayOption(grouped) {
        return `<label class="modal-field"><span>Avdelningsringar</span><select name="group_departments"><option value="grouped" ${grouped ? "selected" : ""}>Samla under ringen Avdelning</option><option value="individual" ${grouped ? "" : "selected"}>Visa som egna ringar</option></select></label>`;
    }

    function ringOptionsMarkup(rings, events, isNewWheel, selectedIds = new Set(rings.map(ring => ring.id)), groupDepartments = false, departmentRingColor = "#00a8e1") {
        const actions = (ring, index, showOrder = true) => ring ? `<div class="year-wheel-ring-actions">
            ${showOrder ? `<div class="year-wheel-ring-order">
                <button class="year-wheel-ring-order-button" type="button" data-config-ring-action="move-up" data-ring-id="${escapeHtml(ring.id)}" aria-label="Flytta ${escapeHtml(ring.name)} utåt" title="Flytta utåt" ${index === 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></button>
                <button class="year-wheel-ring-order-button" type="button" data-config-ring-action="move-down" data-ring-id="${escapeHtml(ring.id)}" aria-label="Flytta ${escapeHtml(ring.name)} inåt" title="Flytta inåt" ${index === rings.length - 1 ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg></button>
            </div>` : ""}
            <button class="year-wheel-ring-edit" type="button" data-config-ring-action="edit" data-ring-id="${escapeHtml(ring.id)}" aria-label="Redigera ${escapeHtml(ring.name)}" title="Redigera ring"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20Z"/></svg></button>
        </div>` : "";
        const existingByName = new Map(rings.map(ring => [ring.name, ring]));
        const eventCounts = new Map();
        events.forEach(event => eventCounts.set(event.ring_id, (eventCounts.get(event.ring_id) || 0) + 1));
        const ringIdsWithEvents = getRingIdsWithEvents(events);
        const renderRingOption = (ring, name, color, index = -1) => {
            const locked = Boolean(ring && ringIdsWithEvents.has(ring.id));
            const checked = isNewWheel || Boolean(ring && selectedIds.has(ring.id));
            const count = ring ? eventCounts.get(ring.id) || 0 : 0;
            const lockNote = locked ? `${count} ${count === 1 ? "händelse" : "händelser"} · låst` : "";
            return `<div class="year-wheel-ring-config"${ring ? ` data-ring-id="${escapeHtml(ring.id)}"` : ""}><label class="year-wheel-ring-option${locked ? " year-wheel-ring-option--locked" : ""}">
                <input type="checkbox" data-event-count="${count}" aria-label="Ingår: ${escapeHtml(name)}" ${ring ? `name="ring_ids" value="${escapeHtml(ring.id)}"` : `name="ring_names" value="${escapeHtml(name)}"`} ${checked ? "checked" : ""} ${locked ? `disabled title="Flytta eller ta bort ringens händelser för att kunna ta bort ringen"` : ""}>
                ${ring && locked ? `<input type="hidden" name="ring_ids" value="${escapeHtml(ring.id)}">` : ""}
                <span class="year-wheel-ring-swatch" style="--ring-color:${ring?.color || color}"></span>
                <span class="year-wheel-ring-option-name">${escapeHtml(name)}</span>
                ${lockNote ? `<small>${escapeHtml(lockNote)}</small>` : ""}
            </label>${actions(ring, index, !(groupDepartments && ring && DEPARTMENT_RING_COLORS[ring.name]))}${ring && !(groupDepartments && DEPARTMENT_RING_COLORS[ring.name]) ? `<span class="year-wheel-ring-drag-handle" draggable="true" data-ring-drag-handle="${escapeHtml(ring.id)}" aria-hidden="true" title="Dra för att ändra ordning"><svg viewBox="0 0 24 24"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/></svg></span>` : ""}</div>`;
        };
        const configured = rings.map((ring, index) => ({ ring, name: ring.name, color: ring.color, index, department: Boolean(DEPARTMENT_RING_COLORS[ring.name]) }));
        const unconfigured = DEFAULT_RINGS
            .filter(([name]) => !existingByName.has(name))
            .map(([name, color]) => ({ ring: null, name, color, index: -1, department: Boolean(DEPARTMENT_RING_COLORS[name]) }));
        const options = [...configured, ...unconfigured];
        const renderOptions = items => items.map(item => renderRingOption(item.ring, item.name, item.color, item.index)).join("");
        const departmentOptions = options.filter(item => item.department);
        const selectedDepartmentCount = departmentOptions.filter(item => isNewWheel || (item.ring && selectedIds.has(item.ring.id))).length;
        const selectedDepartmentEventCount = departmentOptions
            .filter(item => item.ring && selectedIds.has(item.ring.id))
            .reduce((total, item) => total + (eventCounts.get(item.ring.id) || 0), 0);
        const selectedDepartmentEventLabel = `${selectedDepartmentEventCount} ${selectedDepartmentEventCount === 1 ? "händelse" : "händelser"}`;
        const firstDepartmentIndex = rings.findIndex(ring => Boolean(DEPARTMENT_RING_COLORS[ring.name]));
        const nonDepartmentRings = rings.filter(ring => !DEPARTMENT_RING_COLORS[ring.name]);
        const departmentPosition = firstDepartmentIndex < 0
            ? nonDepartmentRings.length
            : rings.slice(0, firstDepartmentIndex).filter(ring => !DEPARTMENT_RING_COLORS[ring.name]).length;
        const renderDepartmentGroup = () => `<div class="year-wheel-ring-config-group">
                <div class="year-wheel-ring-config year-wheel-ring-config-group-row">
                    <input type="checkbox" data-config-department-toggle-all data-indeterminate="${selectedDepartmentCount > 0 && selectedDepartmentCount < departmentOptions.length}" aria-label="Välj alla avdelningsringar" ${selectedDepartmentCount === departmentOptions.length ? "checked" : ""}>
                    <span class="year-wheel-ring-swatch" style="--ring-color:${escapeHtml(departmentRingColor)}"></span>
                    <details class="year-wheel-ring-group-details"${departmentGroupOpen ? " open" : ""}>
                        <summary>
                            <span class="year-wheel-ring-option-name">Avdelning</span>
                            <small data-department-group-count>${selectedDepartmentCount} av ${departmentOptions.length} valda · ${selectedDepartmentEventLabel}</small>
                        </summary>
                        <div class="year-wheel-ring-config-children">${renderOptions(departmentOptions)}</div>
                    </details>
                    <div class="year-wheel-ring-actions">
                        <div class="year-wheel-ring-order">
                            <button class="year-wheel-ring-order-button" type="button" data-config-ring-action="move-department-up" aria-label="Flytta Avdelning utåt" title="Flytta Avdelning utåt" ${firstDepartmentIndex < 0 || departmentPosition === 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></button>
                            <button class="year-wheel-ring-order-button" type="button" data-config-ring-action="move-department-down" aria-label="Flytta Avdelning inåt" title="Flytta Avdelning inåt" ${firstDepartmentIndex < 0 || departmentPosition >= nonDepartmentRings.length ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg></button>
                        </div>
                        <button class="year-wheel-ring-edit" type="button" data-config-ring-action="edit-department" aria-label="Redigera färg på Avdelningsringen" title="Redigera Avdelningsringen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20Z"/></svg></button>
                    </div>
                </div>
            </div>`;
        let ringOptions = renderOptions(options);
        if (groupDepartments && departmentOptions.length) {
            const displayItems = [];
            let groupAdded = false;
            options.forEach(item => {
                if (item.department) {
                    if (!groupAdded) {
                        displayItems.push(renderDepartmentGroup());
                        groupAdded = true;
                    }
                } else displayItems.push(renderRingOption(item.ring, item.name, item.color, item.index));
            });
            ringOptions = displayItems.join("");
        }
        return `<fieldset class="year-wheel-ring-selection">
            <legend>Ringar i årshjulet</legend>
            <p>Välj vilka ringar som ska ingå. Första ringen visas ytterst. Ringar med händelser är låsta tills händelserna flyttats eller tagits bort.</p>
            <div class="year-wheel-ring-options">${ringOptions}</div>
        </fieldset>`;
    }

    function renderRingSelection(rings, events, isNewWheel, selectedIds, groupDepartments, departmentRingColor) {
        return `${ringOptionsMarkup(rings, events, isNewWheel, selectedIds, groupDepartments, departmentRingColor)}
            <button class="btn-secondary" type="button" data-config-ring-action="add">+ Lägg till ring</button>
            <p>Ändringarna sparas när du sparar årshjulet.</p>`;
    }

    function createDefaultRing(name) {
        const defaultRing = DEFAULT_RINGS.find(([defaultName]) => defaultName === name);
        if (!defaultRing) return null;
        const [ringName, color] = defaultRing;
        return {
            id: id(),
            name: ringName,
            color,
            color_variant: DEPARTMENT_RING_COLORS[ringName] ? "standard" : "custom"
        };
    }

    function buildConfiguredRings(existingRings, selectedRingIds, selectedRingNames) {
        const selectedIds = new Set(selectedRingIds);
        const selectedNames = new Set(selectedRingNames);
        const rings = existingRings.filter(ring => selectedIds.has(ring.id));
        const existingNames = new Set(existingRings.map(ring => ring.name));
        selectedNames.forEach(name => {
            if (!existingNames.has(name)) {
                const ring = createDefaultRing(name);
                if (ring) rings.push(ring);
            }
        });
        return rings;
    }

    function getRingIdsWithEvents(events) {
        return new Set(events.map(event => event.ring_id));
    }

    function getRingEventCount(events, ringId) {
        return events.filter(event => event.ring_id === ringId).length;
    }

    function openRingForm(ringId = "") {
        const wheel = wheelDraft || currentWheel();
        if (!wheel || !canEdit()) return;
        const ring = wheel.rings.find(item => item.id === ringId);
        const eventCount = ring ? getRingEventCount(wheel.events, ring.id) : 0;
        openModal(ring ? "Redigera ring" : "Lägg till ring", `
            <label class="modal-field"><span>Namn på ringen</span><input name="name" required maxlength="60" value="${escapeHtml(ring?.name || "")}" placeholder="Till exempel Styrelse"></label>
            <label class="modal-field" data-ring-color-variant${DEPARTMENT_RING_COLORS[ring?.name || ""] ? "" : " hidden"}><span>Avdelningsfärg</span><select name="color_variant"><option value="standard" ${ring?.color_variant === "standard" || !ring?.color_variant && DEPARTMENT_RING_COLORS[ring?.name || ""] ? "selected" : ""}>Standardfärg</option><option value="light" ${ring?.color_variant === "light" ? "selected" : ""}>Ljusare alternativfärg</option><option value="custom" ${ring?.color_variant === "custom" ? "selected" : ""}>Egen färg</option></select></label>
            <label class="modal-field" data-ring-custom-color${DEPARTMENT_RING_COLORS[ring?.name || ""] && ring?.color_variant !== "custom" ? " hidden" : ""}><span>Färg</span><input name="color" type="color" value="${escapeHtml(ring?.color || DEPARTMENT_RING_COLORS[ring?.name || ""]?.standard || COLORS[wheel.rings.length % COLORS.length])}"></label>
            ${eventCount ? `<p class="detail-note-warning">Ringen har ${eventCount} händelser. Flytta eller ta bort dem innan ringen tas bort.</p>` : ""}
        `, "ring", ringId);
        if (eventCount) {
            const deleteButton = byId("deleteYearWheelItemBtn");
            deleteButton.disabled = true;
            deleteButton.title = "Flytta eller ta bort ringens händelser först";
        }
        const nameInput = byId("yearWheelFormFields").querySelector('[name="name"]');
        const colorVariant = byId("yearWheelFormFields").querySelector('[name="color_variant"]');
        const colorInput = byId("yearWheelFormFields").querySelector('[name="color"]');
        const colorVariantField = byId("yearWheelFormFields").querySelector("[data-ring-color-variant]");
        const customColorField = byId("yearWheelFormFields").querySelector("[data-ring-custom-color]");
        const updateDepartmentColor = () => {
            const palette = DEPARTMENT_RING_COLORS[nameInput.value.trim()];
            colorVariantField.hidden = !palette;
            if (!palette) {
                customColorField.hidden = false;
                return;
            }
            if (colorVariant.value === "custom") customColorField.hidden = false;
            else {
                colorInput.value = palette[colorVariant.value];
                customColorField.hidden = true;
            }
        };
        nameInput.addEventListener("input", updateDepartmentColor);
        colorVariant?.addEventListener("change", updateDepartmentColor);
    }

    function openDepartmentRingForm() {
        if (!wheelDraft || !canEdit()) return;
        openModal("Redigera Avdelningsringen", `
            <label class="modal-field"><span>Färg</span><input name="department_ring_color" type="color" value="${escapeHtml(wheelDraft.department_ring_color || DEPARTMENT_RING_COLORS.Upptäckare.standard)}"></label>
        `, "department-ring-color");
    }

    function openEventForm(eventId = "", initialDate = "", initialRingId = "") {
        const wheel = currentWheel();
        if (!wheel || !canEdit() || !wheel.rings.length) return;
        const event = wheel.events.find(item => item.id === eventId);
        const linkedArrangement = Boolean(event?.source_arrangement_id);
        const linkedArrangementNote = "Fält som hämtas från arrangemanget ändras där och synkas automatiskt hit.";
        const linkedArrangementAttributes = linkedArrangement
            ? `readonly aria-describedby="yearWheelLinkedArrangementNote" title="${escapeHtml(linkedArrangementNote)}"`
            : "";
        const sourceFieldAttributes = field => linkedArrangement && event.source_arrangement_fields?.[field]
            ? `readonly aria-describedby="yearWheelLinkedArrangementNote" title="${escapeHtml(linkedArrangementNote)}"`
            : "";
        const linkedArrangementRingAttributes = linkedArrangement
            ? `disabled aria-describedby="yearWheelLinkedArrangementNote" title="Ringen hämtas från arrangemanget."`
            : "";
        const chosenRing = event?.ring_id || wheel.rings.find(ring => ring.id === initialRingId)?.id || wheel.rings.find(ring => selectedRingIds.has(ring.id))?.id || wheel.rings[0].id;
        const date = initialDate || dateKey(period().start);
        openModal(event ? "Redigera händelse" : "Lägg till händelse", `
            ${linkedArrangement ? `<p id="yearWheelLinkedArrangementNote" class="year-wheel-linked-arrangement-note">${escapeHtml(linkedArrangementNote)}</p>` : ""}
            <label class="modal-field"><span>Rubrik</span><input name="title" required maxlength="120" value="${escapeHtml(event?.title || "")}" placeholder="Till exempel Kårstämma" ${linkedArrangementAttributes}></label>
            <div class="year-wheel-ring-color-grid">
                <label class="modal-field"><span>Ring</span><select ${linkedArrangement ? "" : 'name="ring_id"'} required ${linkedArrangementRingAttributes}>${wheel.rings.map(ring => `<option value="${escapeHtml(ring.id)}" ${ring.id === chosenRing ? "selected" : ""}>${escapeHtml(ring.name)}</option>`).join("")}</select>${linkedArrangement ? `<input type="hidden" name="ring_id" value="${escapeHtml(chosenRing)}">` : ""}</label>
                <label class="modal-field"><span>Händelsefärg</span><div class="year-wheel-color-choice-row">
                    <select name="color_variant">
                        <option value="ring" ${!event || !event.color_variant || event.color_variant === "ring" ? "selected" : ""}>Ringens färg</option>
                        <option value="light" ${event?.color_variant === "light" ? "selected" : ""}>Ljusare nyans</option>
                        <option value="dark" ${event?.color_variant === "dark" ? "selected" : ""}>Mörkare nyans</option>
                        <option value="custom" ${event?.color_variant === "custom" ? "selected" : ""}>Valfri färg</option>
                    </select>
                    <span class="year-wheel-color-picker" data-event-color-preview>
                        <input name="color" type="color" aria-label="Välj händelsefärg" value="${escapeHtml(event?.color || wheel.rings.find(ring => ring.id === chosenRing)?.color || COLORS[0])}">
                        <span class="year-wheel-color-preview" aria-hidden="true"></span>
                    </span>
                </div></label>
            </div>
            <div class="year-wheel-form-grid">
                <label class="modal-field"><span>Från och med</span><input name="start_date" type="date" required value="${escapeHtml(event?.start_date || date)}" ${linkedArrangementAttributes}></label>
                <label class="modal-field"><span>Till och med</span><input name="end_date" type="date" required value="${escapeHtml(event?.end_date || event?.start_date || date)}" ${linkedArrangementAttributes}></label>
            </div>
            <div class="year-wheel-form-grid">
                <label class="modal-field"><span>Ansvarig (valfritt)</span><input name="responsible" maxlength="100" value="${escapeHtml(event?.responsible || "")}" ${sourceFieldAttributes("responsible")}></label>
                <label class="modal-field"><span>Plats (valfritt)</span><input name="location" maxlength="120" value="${escapeHtml(event?.location || "")}" ${sourceFieldAttributes("location")}></label>
            </div>
            <label class="modal-field"><span>Anteckningar</span><textarea name="notes" rows="3" maxlength="2000" ${sourceFieldAttributes("notes")}>${escapeHtml(event?.notes || "")}</textarea></label>
        `, "event", eventId);
        const startInput = byId("yearWheelFormFields").querySelector('[name="start_date"]');
        const endInput = byId("yearWheelFormFields").querySelector('[name="end_date"]');
        const ringInput = byId("yearWheelFormFields").querySelector('[name="ring_id"]');
        const colorVariantInput = byId("yearWheelFormFields").querySelector('[name="color_variant"]');
        const colorInput = byId("yearWheelFormFields").querySelector('[name="color"]');
        const colorPicker = byId("yearWheelFormFields").querySelector("[data-event-color-preview]");
        const colorSwatch = colorPicker.querySelector(".year-wheel-color-preview");
        const updateColorPreview = () => {
            const ring = wheel.rings.find(item => item.id === ringInput.value) || wheel.rings[0];
            colorSwatch.style.backgroundColor = getEventColor({
                color_variant: colorVariantInput.value,
                color: colorInput.value
            }, ring);
        };
        const updateCustomColor = () => {
            colorInput.disabled = colorVariantInput.value !== "custom";
            if (!event && colorInput && colorVariantInput.value === "custom") {
                colorInput.value = wheel.rings.find(ring => ring.id === ringInput.value)?.color || COLORS[0];
            }
            updateColorPreview();
        };
        colorVariantInput.addEventListener("change", updateCustomColor);
        ringInput.addEventListener("change", updateColorPreview);
        colorInput.addEventListener("input", updateColorPreview);
        updateCustomColor();
        startInput.dataset.previousValue = startInput.value;
        startInput.addEventListener("change", () => {
            updateEventEndDateFromStart(startInput, endInput, startInput.dataset.previousValue);
        });
    }

    function saveWheel(wheel) {
        const updated = syncArrangementEvents(wheel, window.GTScoutArrangements?.getAll?.() || []) || wheel;
        window.GTScoutYearWheelSync?.saveWheel(updated);
    }

    function syncArrangementsIntoWheels(arrangements) {
        if (!Array.isArray(arrangements) || !wheels.length) return;
        const updates = [];
        wheels = wheels.map(wheel => {
            const updated = syncArrangementEvents(wheel, arrangements);
            if (updated) {
                updates.push(updated);
                return updated;
            }
            return wheel;
        });
        render();
        if (canEdit()) updates.forEach(wheel => window.GTScoutYearWheelSync?.saveWheel(wheel));
    }

    function submitForm(event) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const value = Object.fromEntries(formData.entries());
        if (modalMode === "year") {
            const year = Number(value.year);
            if (!Number.isInteger(year) || year < 1900 || year > 2200) {
                byId("yearWheelFormMessage").textContent = "Ange ett helt årtal mellan 1900 och 2200.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            view.year = year;
            saveViewPreferences();
            closeModal();
            render();
            return;
        }
        if (modalMode === "department-ring-color" && wheelDraft) {
            if (/^#[0-9a-f]{6}$/i.test(value.department_ring_color || "")) {
                wheelDraft.department_ring_color = value.department_ring_color;
            }
            renderWheelDraft();
            return;
        }
        const selectedRingIdsFromForm = formData.getAll("ring_ids").map(String);
        const selectedRingNamesFromForm = formData.getAll("ring_names").map(String);
        const wheel = currentWheel();
        if (modalMode === "bulk-copy") {
            if (!wheel || !canEdit()) return;
            const selectedIds = new Set(formData.getAll("copy_event_ids").map(String));
            const selectedEvents = getCopyableEvents(wheel).filter(item => selectedIds.has(item.id));
            if (!selectedEvents.length) {
                byId("yearWheelFormMessage").textContent = "Välj minst en händelse att kopiera.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const copies = selectedEvents.map(item => {
                const startDate = shiftDateToNextYear(item.start_date);
                const endDate = shiftDateToNextYear(item.end_date);
                return startDate && endDate ? {
                    ...item,
                    id: id(),
                    start_date: startDate,
                    end_date: endDate,
                    copied_from_id: item.id,
                    needs_review: true,
                    source_arrangement_id: "",
                    source_arrangement_fields: {}
                } : null;
            });
            if (copies.some(item => !item)) {
                byId("yearWheelFormMessage").textContent = "Minst en vald händelse ligger utanför det tillåtna kalenderintervallet och kunde inte kopieras.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const updated = normalizeWheel({ ...wheel, events: [...wheel.events, ...copies] });
            copies.forEach(item => selectedRingIds.add(item.ring_id));
            const [year, month] = copies[0].start_date.split("-").map(Number);
            view.year = view.mode === "calendar" || month >= view.startMonth ? year : year - 1;
            saveViewPreferences();
            closeModal();
            render();
            saveWheel(updated);
            return;
        }
        if (modalMode === "wheel" && editingId) {
            if (!wheel) return;
            const rings = buildConfiguredRings(wheelDraft?.rings || wheel.rings, selectedRingIdsFromForm, selectedRingNamesFromForm);
            const name = String(value.name || "").trim();
            if (!name || !rings.length) {
                byId("yearWheelFormMessage").textContent = !rings.length ? "Välj minst en ring till årshjulet." : "Ange ett namn på årshjulet.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const selectedIds = new Set(rings.map(ring => ring.id));
            const previousRingIds = new Set(wheel.rings.map(ring => ring.id));
            if (wheel.events.some(item => !selectedIds.has(item.ring_id))) {
                byId("yearWheelFormMessage").textContent = "Flytta eller ta bort händelser innan deras ring tas bort.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const updated = normalizeWheel({
                ...wheel,
                name,
                start_month: Number.parseInt(value.start_month, 10),
                group_departments: value.group_departments !== "individual",
                department_ring_color: value.department_ring_color || wheelDraft?.department_ring_color,
                rings
            });
            wheels = wheels.map(item => item.id === wheel.id ? updated : item);
            if (!Object.prototype.hasOwnProperty.call(view.departmentDisplayByWheel || {}, wheel.id)) {
                departmentDisplayMode = updated.group_departments ? "grouped" : "individual";
            }
            selectedRingIds = new Set([...selectedRingIds].filter(ringId => selectedIds.has(ringId)));
            rings.filter(ring => !previousRingIds.has(ring.id)).forEach(ring => selectedRingIds.add(ring.id));
            view.startMonth = updated.start_month;
            startMonthOverridden = true;
            saveViewPreferences();
            closeModal();
            render();
            saveWheel(updated);
            return;
        }
        if (modalMode === "wheel") {
            const name = String(value.name || "").trim();
            const startMonth = Number.parseInt(value.start_month, 10);
            const rings = buildConfiguredRings(wheelDraft?.rings || [], selectedRingIdsFromForm, selectedRingNamesFromForm);
            if (!name || !rings.length || !Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
                byId("yearWheelFormMessage").textContent = !name
                    ? "Ange ett namn på årshjulet."
                    : !rings.length
                        ? "Välj minst en ring till årshjulet."
                        : "Välj en giltig startmånad för verksamhetsåret.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const created = normalizeWheel({
                id: id(),
                name,
                start_month: startMonth,
                group_departments: value.group_departments !== "individual",
                department_ring_color: value.department_ring_color || wheelDraft?.department_ring_color,
                rings,
                events: [],
                schema_version: 3,
                created_by: auth()?.getUser?.()?.id || null
            });
            wheels = [...wheels, created];
            selectedWheelId = created.id;
            departmentDisplayMode = created.group_departments ? "grouped" : "individual";
            departmentDisplayForWheelId = created.id;
            selectedRingIds = new Set(created.rings.map(ring => ring.id));
            view.startMonth = created.start_month;
            startMonthOverridden = true;
            saveViewPreferences();
            closeModal();
            render();
            saveWheel(created);
            return;
        }
        if (modalMode === "ring") {
            const targetWheel = wheelDraft || wheel;
            if (!targetWheel || !canEdit()) return;
            const name = String(value.name || "").trim();
            if (!name) return;
            const rings = [...targetWheel.rings];
            const index = rings.findIndex(ring => ring.id === editingId);
            const palette = DEPARTMENT_RING_COLORS[name];
            const variant = palette ? String(value.color_variant || "standard") : "custom";
            const ring = {
                id: editingId || id(),
                name,
                color: palette && variant !== "custom" ? palette[variant] : value.color,
                color_variant: variant
            };
            if (wheelDraft) {
                if (index < 0) {
                    rings.push(ring);
                    draftRingIds.add(ring.id);
                } else rings[index] = ring;
                wheelDraft.rings = rings;
                renderWheelDraft();
                return;
            }
            if (index < 0) {
                rings.push(ring);
                selectedRingIds.add(ring.id);
            } else rings[index] = ring;
            const updated = normalizeWheel({ ...wheel, rings });
            wheels = wheels.map(item => item.id === wheel.id ? updated : item);
            closeModal();
            render();
            saveWheel(updated);
            return;
        }
        if (!wheel || !canEdit()) return;
        if (modalMode === "event") {
            const startDate = String(value.start_date || "");
            const endDate = String(value.end_date || "");
            if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) {
                byId("yearWheelFormMessage").textContent = "Slutdatum måste vara samma dag eller efter startdatum.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const eventData = {
                id: editingId || id(),
                ring_id: String(value.ring_id),
                title: String(value.title || "").trim(),
                start_date: startDate,
                end_date: endDate,
                color_variant: ["ring", "light", "dark", "custom"].includes(value.color_variant) ? value.color_variant : "ring",
                color: value.color,
                responsible: String(value.responsible || "").trim(),
                location: String(value.location || "").trim(),
                notes: String(value.notes || "").trim(),
                copied_from_id: wheel.events.find(item => item.id === editingId)?.copied_from_id || "",
                needs_review: false,
                source_arrangement_id: wheel.events.find(item => item.id === editingId)?.source_arrangement_id || "",
                source_arrangement_fields: wheel.events.find(item => item.id === editingId)?.source_arrangement_fields || {}
            };
            if (!eventData.title || !wheel.rings.some(ring => ring.id === eventData.ring_id)) return;
            selectedRingIds.add(eventData.ring_id);
            showEventInCurrentPeriod(eventData);
            const events = editingId
                ? wheel.events.map(item => item.id === editingId ? eventData : item)
                : [...wheel.events, eventData];
            const updated = normalizeWheel({ ...wheel, events });
            wheels = wheels.map(item => item.id === wheel.id ? updated : item);
            closeModal();
            render();
            saveWheel(updated);
        }
    }

    function deleteCurrentItem() {
        if (modalMode === "ring" && wheelDraft && editingId) {
            deleteDraftRing(editingId);
            return;
        }
        const wheel = currentWheel();
        if (!wheel || !editingId) return;
        if (modalMode === "wheel") {
            if (!window.confirm(`Ta bort årshjulet "${wheel.name}" och alla dess händelser?`)) return;
            wheels = wheels.filter(item => item.id !== wheel.id);
            selectedWheelId = wheels[0]?.id || "";
            closeModal();
            render();
            window.GTScoutYearWheelSync?.removeWheel(wheel.id);
            return;
        }
        if (modalMode === "ring") {
            const ring = wheel.rings.find(item => item.id === editingId);
            if (getRingEventCount(wheel.events, editingId)) {
                byId("yearWheelFormMessage").textContent = "Flytta eller ta bort ringens händelser innan ringen tas bort.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            if (!window.confirm(`Ta bort ringen "${ring?.name || ""}"?`)) return;
            const updated = normalizeWheel({
                ...wheel,
                rings: wheel.rings.filter(item => item.id !== editingId)
            });
            wheels = wheels.map(item => item.id === wheel.id ? updated : item);
            selectedRingIds.delete(editingId);
            closeModal();
            render();
            saveWheel(updated);
            return;
        }
        if (modalMode === "event") {
            if (!window.confirm("Ta bort den här händelsen?")) return;
            const updated = normalizeWheel({ ...wheel, events: wheel.events.filter(item => item.id !== editingId) });
            wheels = wheels.map(item => item.id === wheel.id ? updated : item);
            closeModal();
            render();
            saveWheel(updated);
        }
    }

    function initialize() {
        readViewPreferences();
        [["yearWheelOverviewBtn", "overview"], ["yearWheelDetailsBtn", "details"]].forEach(([buttonId, mode]) => {
            byId(buttonId).addEventListener("click", () => {
                view.chartMode = mode;
                saveViewPreferences();
                render();
            });
        });
        byId("yearWheelMode").value = view.mode;
        byId("yearWheelYear").value = view.year;
        byId("yearWheelStartMonth").value = String(view.startMonth);
        document.querySelectorAll('[data-collapse-all="year-wheel-months"]').forEach(button => button.addEventListener("click", () => {
            const groups = [...byId("yearWheelEvents").querySelectorAll("[data-event-month]")];
            toggleEventMonths(groups, collapsedEventMonths);
            updateEventMonthToggle(groups);
        }));
        byId("yearWheelMode").addEventListener("change", () => {
            view.mode = byId("yearWheelMode").value;
            saveViewPreferences();
            render();
        });
        byId("yearWheelDepartmentDisplay").addEventListener("change", () => {
            const wheel = currentWheel();
            if (!wheel) return;
            departmentDisplayMode = byId("yearWheelDepartmentDisplay").value === "individual" ? "individual" : "grouped";
            view.departmentDisplayByWheel = {
                ...(view.departmentDisplayByWheel || {}),
                [wheel.id]: departmentDisplayMode
            };
            saveViewPreferences();
            render();
        });
        byId("yearWheelYear").addEventListener("change", () => {
            const year = Number.parseInt(byId("yearWheelYear").value, 10);
            if (Number.isInteger(year) && year >= 1900 && year <= 2200) {
                view.year = year;
                saveViewPreferences();
                render();
            }
        });
        byId("yearWheelStartMonth").addEventListener("change", () => {
            const startMonth = Number.parseInt(byId("yearWheelStartMonth").value, 10);
            if (startMonth >= 1 && startMonth <= 12) {
                view.startMonth = startMonth;
                startMonthOverridden = true;
                saveViewPreferences();
                render();
            }
        });
        byId("yearWheelSelect").addEventListener("change", () => {
            selectedWheelId = byId("yearWheelSelect").value;
            const wheel = currentWheel();
            if (wheel) selectedRingIds = new Set(wheel.rings.map(ring => ring.id));
            render();
        });
        byId("yearWheelMenuAddBtn").addEventListener("click", openWheelForm);
        byId("yearWheelMenuSettingsBtn").addEventListener("click", openWheelSettings);
        byId("yearWheelMenuCopyEventsBtn").addEventListener("click", openBulkCopyForm);
        byId("addYearWheelEventBtn").addEventListener("click", () => openEventForm());
        byId("closeYearWheelModal").addEventListener("click", closeModal);
        byId("yearWheelModal").addEventListener("click", event => {
            if (event.target === byId("yearWheelModal")) closeModal();
        });
        byId("yearWheelForm").addEventListener("submit", submitForm);
        byId("yearWheelFormFields").addEventListener("change", event => {
            const departmentToggle = event.target.closest?.("[data-config-department-toggle-all]");
            if (departmentToggle && modalMode === "wheel" && wheelDraft) {
                const ringInputs = [...departmentToggle.closest(".year-wheel-ring-config-group").querySelectorAll(".year-wheel-ring-config-children .year-wheel-ring-option input[type=checkbox]")];
                ringInputs.forEach(input => { if (!input.disabled) input.checked = departmentToggle.checked; });
                const selectedCount = ringInputs.filter(input => input.checked).length;
                departmentToggle.checked = selectedCount === ringInputs.length;
                departmentToggle.indeterminate = selectedCount > 0 && selectedCount < ringInputs.length;
                updateDepartmentGroupToggle(departmentToggle.closest(".year-wheel-ring-config-group"));
                captureWheelDraft();
                return;
            }
            if ((event.target.name === "ring_ids" || event.target.name === "ring_names") && event.target.type === "checkbox" && modalMode === "wheel" && wheelDraft) {
                const group = event.target.closest?.(".year-wheel-ring-config-group");
                const groupToggle = group?.querySelector("[data-config-department-toggle-all]");
                if (groupToggle) {
                    const ringInputs = [...group.querySelectorAll(".year-wheel-ring-config-children .year-wheel-ring-option input[type=checkbox]")];
                    const selectedCount = ringInputs.filter(input => input.checked).length;
                    groupToggle.checked = selectedCount === ringInputs.length;
                    groupToggle.indeterminate = selectedCount > 0 && selectedCount < ringInputs.length;
                    updateDepartmentGroupToggle(group);
                    captureWheelDraft();
                }
                return;
            }
            if (event.target.name !== "group_departments" || modalMode !== "wheel" || !wheelDraft) return;
            captureWheelDraft();
            renderWheelDraft();
            byId("yearWheelFormFields").querySelector('select[name="group_departments"]')?.focus();
        });
        byId("yearWheelFormFields").addEventListener("click", event => {
            const button = event.target.closest("[data-config-ring-action]");
            if (!button || button.disabled || modalMode !== "wheel" || !wheelDraft || !canEdit()) return;
            captureWheelDraft();
            const action = button.dataset.configRingAction;
            if (action === "move-department-up" || action === "move-department-down") {
                const departmentRings = wheelDraft.rings.filter(ring => Boolean(DEPARTMENT_RING_COLORS[ring.name]));
                const otherRings = wheelDraft.rings.filter(ring => !DEPARTMENT_RING_COLORS[ring.name]);
                const firstDepartmentIndex = wheelDraft.rings.findIndex(ring => Boolean(DEPARTMENT_RING_COLORS[ring.name]));
                if (firstDepartmentIndex < 0) return;
                const currentPosition = wheelDraft.rings.slice(0, firstDepartmentIndex)
                    .filter(ring => !DEPARTMENT_RING_COLORS[ring.name]).length;
                const nextPosition = currentPosition + (action === "move-department-up" ? -1 : 1);
                if (nextPosition < 0 || nextPosition > otherRings.length) return;
                wheelDraft.rings = [
                    ...otherRings.slice(0, nextPosition),
                    ...departmentRings,
                    ...otherRings.slice(nextPosition)
                ];
                renderWheelDraft();
                return;
            }
            if (action === "move-up" || action === "move-down") {
                const index = wheelDraft.rings.findIndex(ring => ring.id === button.dataset.ringId);
                const nextIndex = index + (action === "move-up" ? -1 : 1);
                if (index < 0 || nextIndex < 0 || nextIndex >= wheelDraft.rings.length) return;
                [wheelDraft.rings[index], wheelDraft.rings[nextIndex]] = [wheelDraft.rings[nextIndex], wheelDraft.rings[index]];
                renderWheelDraft();
                return;
            }
            if (action === "edit-department") {
                openDepartmentRingForm();
                return;
            }
            openRingForm(action === "edit" ? button.dataset.ringId : "");
        });
        byId("yearWheelFormFields").addEventListener("dragstart", event => {
            const handle = event.target.closest("[data-ring-drag-handle]");
            if (!handle || modalMode !== "wheel" || !wheelDraft || !canEdit()) return;
            draggedRingId = handle.dataset.ringDragHandle;
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", draggedRingId);
            }
        });
        byId("yearWheelFormFields").addEventListener("dragover", event => {
            if (!draggedRingId) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        });
        byId("yearWheelFormFields").addEventListener("drop", event => {
            if (!draggedRingId || modalMode !== "wheel" || !wheelDraft || !canEdit()) return;
            const target = event.target.closest(".year-wheel-ring-config[data-ring-id]");
            if (!target || target.dataset.ringId === draggedRingId) return;
            event.preventDefault();
            captureWheelDraft();
            const sourceIndex = wheelDraft.rings.findIndex(ring => ring.id === draggedRingId);
            const targetIndex = wheelDraft.rings.findIndex(ring => ring.id === target.dataset.ringId);
            if (sourceIndex >= 0 && targetIndex >= 0) {
                [wheelDraft.rings[sourceIndex], wheelDraft.rings[targetIndex]] = [wheelDraft.rings[targetIndex], wheelDraft.rings[sourceIndex]];
                renderWheelDraft();
            }
            draggedRingId = "";
        });
        byId("yearWheelFormFields").addEventListener("dragend", () => { draggedRingId = ""; });
        byId("deleteYearWheelItemBtn").addEventListener("click", deleteCurrentItem);
        window.GTScoutArrangements?.init({ onChange: syncArrangementsIntoWheels });
        auth()?.onChange?.(() => {
            updateYearWheelMenuActions();
            render();
        });
        window.GTScoutYearWheelSync?.init({ onChange: (incoming, source) => {
            const migrated = (incoming || []).map(input => {
                if (Number(input?.schema_version) >= 3) return { wheel: normalizeWheel(input), changed: false };
                const existingRings = Array.isArray(input?.rings) ? input.rings : [];
                const alreadyHasTerms = existingRings.some(ring => String(ring?.name || "").trim().toLocaleLowerCase("sv") === "terminer");
                const migratedRings = existingRings.map(ring => {
                    const name = String(ring?.name || "").trim();
                    const palette = DEPARTMENT_RING_COLORS[name];
                    const isLegacyDefault = LEGACY_DEFAULT_RING_COLORS[name]?.toLocaleLowerCase() === String(ring?.color || "").toLocaleLowerCase();
                    if (!palette || !isLegacyDefault) return ring;
                    return { ...ring, color: palette.standard, color_variant: "standard" };
                });
                const wheel = normalizeWheel({
                    ...input,
                    schema_version: 3,
                    rings: alreadyHasTerms
                        ? migratedRings
                        : [...migratedRings, { id: id(), name: "Terminer", color: COLORS[3], color_variant: "custom" }]
                });
                return { wheel, changed: true };
            }).filter(entry => entry.wheel.name);
            // Endast inläsning och ändrade källdata får starta automatisk synk, inte sparnotifieringar.
            if (source === "load") {
                const arrangements = window.GTScoutArrangements?.getAll?.() || [];
                migrated.forEach(entry => {
                    const updated = syncArrangementEvents(entry.wheel, arrangements);
                    if (updated) {
                        entry.wheel = updated;
                        entry.changed = true;
                    }
                });
            }
            wheels = migrated.map(entry => entry.wheel);
            const activeMigration = migrated.find(entry => entry.changed && entry.wheel.id === selectedWheelId);
            if (activeMigration && selectedRingsForWheelId === selectedWheelId) {
                const termRing = activeMigration.wheel.rings.find(ring => ring.name === "Terminer");
                if (termRing) selectedRingIds.add(termRing.id);
            }
            render();
            if (source === "load" && canEdit()) {
                migrated.filter(entry => entry.changed).forEach(entry => window.GTScoutYearWheelSync?.saveWheel(entry.wheel));
            }
        } });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
    else initialize();
})();
