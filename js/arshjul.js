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
        ["Avdelningar", DEPARTMENT_RING_COLORS.Upptäckare.standard],
        ...Object.entries(DEPARTMENT_RING_COLORS).map(([name, palette]) => [name, palette.standard]),
        ["Styrelse", COLORS[0]], ["Kårgemensamt", COLORS[1]], ["Arrangemang", COLORS[2]],
        ["Terminer", COLORS[3]]
    ];
    const PLANNING_DEPARTMENTS = Object.keys(DEPARTMENT_RING_COLORS);
    const MONTHS = ["Januari", "Februari", "Mars", "April", "Maj", "Juni", "Juli", "Augusti", "September", "Oktober", "November", "December"];
    const byId = id => document.getElementById(id);
    const auth = () => window.GTScoutAuth;
    const recurrence = () => window.GTScoutYearWheelRecurrence;
    let wheels = [];
    let planningGroups = [];
    let selectedWheelId = "";
    let selectedRingIds = new Set();
    let selectedRingsForWheelId = "";
    let ringGroupOpen = true;
    let ringFilterForWheelId = "";
    let view = { mode: "calendar", year: new Date().getFullYear(), startMonth: 8, chartMode: "details" };
    let startMonthOverridden = false;
    let modalMode = "";
    let editingId = "";
    let editingOccurrenceDate = "";
    let recurrenceDraft = null;
    let checklistDraft = null;
    let checklistSortingEnabled = false;
    let pendingEditScope = null;
    let unlockedWheelId = "";
    let wheelDraft = null;
    let draggedRingId = "";
    let syncChoiceHandlers = null;
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

    function canWrite() {
        if (isSharedWheelView()) return false;
        return Boolean(!auth()?.isOnline?.() || !auth()?.isSignedIn?.() || window.GTScoutYearWheelSync?.canWrite?.());
    }

    function canEdit() {
        return canWrite() && (unlockedWheelId === currentWheel()?.id || Boolean(wheelDraft && !wheelDraft.id));
    }

    function isSharedWheelView() {
        return new URLSearchParams(window.location.search).has("share");
    }

    function normalizeText(value, maxLength) {
        return String(value || "").trim().slice(0, maxLength).trimEnd();
    }

    function normalizeWheel(input) {
        const wheel = input && typeof input === "object" ? input : {};
        if (Number(wheel.schema_version) > 7 || Number(wheel.recurrence_format) > 2) {
            throw new Error("Årshjulet använder ett nyare dataformat. Uppdatera sidan innan du fortsätter.");
        }
        const rings = Array.isArray(wheel.rings) ? wheel.rings.map(ring => ({
            id: String(ring?.id || id()),
            name: String(ring?.name || "").trim().slice(0, 60),
            color: /^#[0-9a-f]{6}$/i.test(ring?.color) ? ring.color : COLORS[0],
            color_variant: ["standard", "light", "custom"].includes(ring?.color_variant) ? ring.color_variant : "custom",
            parent_id: String(ring?.parent_id || ""),
            children_display: ring?.children_display === "individual" ? "individual" : "grouped",
            sync_arrangements: typeof ring?.sync_arrangements === "boolean"
                ? ring.sync_arrangements
                : String(ring?.name || "").trim().toLocaleLowerCase("sv") === "arrangemang",
            sync_meetings_from_department: Boolean(ring?.sync_meetings_from_department),
            sync_meetings_department: PLANNING_DEPARTMENTS.includes(ring?.sync_meetings_department)
                ? ring.sync_meetings_department
                : (PLANNING_DEPARTMENTS.includes(String(ring?.name || "").trim()) ? String(ring.name).trim() : ""),
            sync_excluded_planning_ids: Array.isArray(ring?.sync_excluded_planning_ids)
                ? [...new Set(ring.sync_excluded_planning_ids.map(String).filter(Boolean))]
                : [],
            sync_from_wheel: ring?.sync_from_wheel?.wheel_id ? {
                wheel_id: String(ring.sync_from_wheel.wheel_id),
                ring_ids: Array.isArray(ring.sync_from_wheel.ring_ids)
                    ? [...new Set(ring.sync_from_wheel.ring_ids.map(String).filter(Boolean))] : [],
                include_children_ring_ids: [...new Set((Array.isArray(ring.sync_from_wheel.include_children_ring_ids)
                    ? ring.sync_from_wheel.include_children_ring_ids
                    : ring.sync_from_wheel.include_children && Array.isArray(ring.sync_from_wheel.ring_ids)
                        ? ring.sync_from_wheel.ring_ids : []).map(String))]
                    .filter(ringId => Array.isArray(ring.sync_from_wheel.ring_ids)
                        && ring.sync_from_wheel.ring_ids.map(String).includes(ringId))
            } : null
        })).filter(ring => ring.name) : [];
        const ringsById = new Map(rings.map(ring => [ring.id, ring]));
        rings.forEach(ring => {
            const parent = ringsById.get(ring.parent_id);
            if (!parent || parent.id === ring.id || parent.parent_id) ring.parent_id = "";
        });
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
                recurrence: recurrence().normalizeRule(event.recurrence),
                exceptions: recurrence().normalizeExceptions(event.exceptions),
                checklist: recurrence().normalizeChecklist(event.checklist, Boolean(event.recurrence)),
                occurrence_checklists: recurrence().normalizeOccurrenceChecklists(event.occurrence_checklists),
                copied_from_id: String(event.copied_from_id || ""),
                needs_review: Boolean(event.needs_review),
                source_arrangement_id: String(event.source_arrangement_id || ""),
                source_arrangement_fields: {
                    responsible: Boolean(event.source_arrangement_fields?.responsible),
                    location: Boolean(event.source_arrangement_fields?.location),
                    notes: Boolean(event.source_arrangement_fields?.notes)
                },
                source_planning_id: String(event.source_planning_id || ""),
                source_wheel_id: String(event.source_wheel_id || ""),
                source_wheel_event_id: String(event.source_wheel_event_id || ""),
                source_wheel_ring_id: String(event.source_wheel_ring_id || ""),
                source_wheel_name: normalizeText(event.source_wheel_name, 100),
                source_wheel_ring_name: normalizeText(event.source_wheel_ring_name, 60),
                source_meeting_id: String(event.source_meeting_id || ""),
                source_planning_fields: {
                    responsible: Boolean(event.source_planning_fields?.responsible),
                    location: Boolean(event.source_planning_fields?.location),
                    notes: Boolean(event.source_planning_fields?.notes)
                }
            };
        }).filter(event => event?.title) : [];
        const hasChecklists = events.some(event => event.checklist !== null || Object.keys(event.occurrence_checklists).length);
        return {
            id: String(wheel.id || id()),
            name: String(wheel.name || "").trim().slice(0, 100),
            start_month: Math.min(12, Math.max(1, Number.parseInt(wheel.start_month, 10) || 8)),
            rings,
            events,
            share_token: String(wheel.share_token || "") || null,
            schema_version: Math.max(hasChecklists ? 7 : events.some(event => event.recurrence) ? 6 : 5, Number(wheel.schema_version) || 0),
            recurrence_format: Math.max(hasChecklists ? 2 : 1, Number(wheel.recurrence_format) || 1),
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

    function getWheelSourceRings(source, settings) {
        const selected = new Set(settings.ring_ids);
        const includeChildren = new Set(settings.include_children_ring_ids || []);
        const roots = new Set(source.rings.filter(ring => !ring.parent_id).map(ring => ring.id));
        return new Set(source.rings.filter(ring => selected.has(ring.id)
            || roots.has(ring.parent_id) && selected.has(ring.parent_id)
                && includeChildren.has(ring.parent_id)).map(ring => ring.id));
    }

    function wheelDependsOn(sourceId, targetId, allWheels, visited = new Set()) {
        if (sourceId === targetId) return true;
        if (visited.has(sourceId)) return false;
        visited.add(sourceId);
        return allWheels.find(wheel => wheel.id === sourceId)?.rings.some(ring =>
            ring.sync_from_wheel && wheelDependsOn(ring.sync_from_wheel.wheel_id, targetId, allWheels, visited)) || false;
    }

    function getWheelSourceError(wheel, settings, allWheels) {
        if (!settings) return "";
        const source = allWheels.find(item => item.id === settings.wheel_id);
        if (!source || source.local_kar_id !== wheel.local_kar_id) return "Källårshjulet saknas eller är inte tillgängligt i samma kår.";
        if (wheelDependsOn(source.id, wheel.id, allWheels)) return "De här årshjulen skulle hämta händelser från varandra. Välj ett annat källårshjul eller ta bort den andra synkningen först.";
        if (!settings.ring_ids.length) return "Välj minst en källring.";
        if (settings.ring_ids.some(ringId => !source.rings.some(ring => ring.id === ringId))) return "En vald källring saknas. Välj nya ringar eller koppla loss synkningen.";
        return "";
    }

    function detachWheelEvent(event) {
        return { ...event, source_wheel_id: "", source_wheel_event_id: "", source_wheel_ring_id: "",
            source_wheel_name: "", source_wheel_ring_name: "" };
    }

    function syncWheelSources(allWheels) {
        const resolved = new Map();
        function resolve(wheel) {
            if (resolved.has(wheel.id)) return resolved.get(wheel.id);
            let events = wheel.events;
            wheel.rings.forEach(ring => {
                const settings = ring.sync_from_wheel;
                // Missing sources must never be treated as an empty, successfully loaded source.
                if (!settings || getWheelSourceError(wheel, settings, allWheels)) return;
                const source = resolve(allWheels.find(item => item.id === settings.wheel_id));
                const ringIds = getWheelSourceRings(source, settings);
                const sourceEvents = source.events.filter(event => ringIds.has(event.ring_id));
                const desired = new Set(sourceEvents.map(event => event.id));
                const retained = events.filter(event => event.ring_id !== ring.id
                    || event.source_wheel_id !== source.id || desired.has(event.source_wheel_event_id));
                sourceEvents.forEach(event => {
                    const index = retained.findIndex(item => item.ring_id === ring.id
                        && item.source_wheel_id === source.id && item.source_wheel_event_id === event.id);
                    const existing = index < 0 ? null : retained[index];
                    const hasCustomColor = event.color_variant === "custom"
                        && /^#[0-9a-f]{6}$/i.test(event.color || "");
                    const copy = {
                        ...event,
                        id: existing?.id || id(),
                        ring_id: ring.id,
                        color_variant: hasCustomColor ? "custom" : "ring",
                        color: hasCustomColor ? event.color : "",
                        copied_from_id: "",
                        needs_review: false,
                        source_arrangement_id: "",
                        source_arrangement_fields: {},
                        source_planning_id: "",
                        source_meeting_id: "",
                        source_planning_fields: {},
                        source_wheel_id: source.id,
                        source_wheel_event_id: event.id,
                        source_wheel_ring_id: event.ring_id,
                        source_wheel_name: source.name,
                        source_wheel_ring_name: source.rings.find(item => item.id === event.ring_id).name
                    };
                    if (index < 0) retained.push(copy);
                    else retained[index] = copy;
                });
                events = retained;
            });
            const updated = normalizeWheel({ ...wheel, events });
            const result = JSON.stringify(updated) === JSON.stringify(wheel) ? wheel : updated;
            resolved.set(wheel.id, result);
            return result;
        }
        return allWheels.map(resolve);
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
        return adjustHexColor(ring.displayBackgroundColor || ring.color || DEPARTMENT_RING_COLORS.Upptäckare.standard, 0.84);
    }

    function getEventColor(event, ring) {
        if (event.color_variant === "custom" && /^#[0-9a-f]{6}$/i.test(event.color || "")) return event.color;
        if (event.color_variant === "light") return adjustHexColor(ring.color, 0.32);
        if (event.color_variant === "dark") return adjustHexColor(ring.color, -0.24);
        return ring.color;
    }

    function syncArrangementEvents(wheel, arrangements) {
        const rings = wheel.rings.filter(ring => ring.sync_arrangements
            ?? String(ring.name || "").trim().toLocaleLowerCase("sv") === "arrangemang");
        if (!rings.length) return null;
        const events = [...wheel.events];
        let changed = false;
        rings.forEach(ring => arrangements.forEach(arrangement => {
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
            const sourceChecklist = recurrence().normalizeChecklist(arrangement.checklist);
            const checklist = sourceChecklist?.length ? sourceChecklist : null;
            const sourceFields = {
                responsible: Boolean(responsible),
                location: Boolean(location),
                notes: Boolean(notes)
            };
            const index = events.findIndex(event => event.source_arrangement_id === arrangementId && event.ring_id === ring.id);
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
                    checklist,
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
                checklist,
                source_arrangement_fields: sourceFields
            };
            if (existing.ring_id === updated.ring_id && existing.title === updated.title
                && existing.start_date === updated.start_date && existing.end_date === updated.end_date
                && existing.responsible === updated.responsible && existing.location === updated.location
                && existing.notes === updated.notes
                && JSON.stringify(existing.checklist) === JSON.stringify(updated.checklist)
                && Boolean(previousSources.responsible) === sourceFields.responsible
                && Boolean(previousSources.location) === sourceFields.location
                && Boolean(previousSources.notes) === sourceFields.notes) return;
            events[index] = updated;
            changed = true;
        }));
        return changed ? normalizeWheel({ ...wheel, events }) : null;
    }

    function readLocalPlanningGroups() {
        try {
            const groups = JSON.parse(localStorage.getItem("gtscout_planering") || "[]");
            return Array.isArray(groups) ? groups.filter(group => group && typeof group === "object") : [];
        } catch (error) {
            console.error("Kunde inte läsa lokala planeringar för årshjulet", error);
            return [];
        }
    }

    function renderPlanningSyncSelection(department, excludedIds) {
        const plans = planningGroups.filter(group => group.level === department && group.id);
        if (!plans.length) return `<p class="year-wheel-dialog-help">Inga planeringar för avdelningen har hämtats ännu. Nya planeringar inkluderas automatiskt.</p>`;
        return `<div class="year-wheel-planning-sync-plans">
            ${plans.map(group => {
                const idValue = String(group.id || "");
                const name = getPlanningSourceLabel(group);
                const datedMeetings = Array.isArray(group.meetings)
                    ? group.meetings.filter(meeting => isDate(String(meeting?.date || ""))).length
                    : 0;
                return `<label class="year-wheel-planning-sync-plan">
                    <input type="checkbox" name="included_planning_ids" value="${escapeHtml(idValue)}" ${!excludedIds.has(idValue) ? "checked" : ""}>
                    <span><strong>${escapeHtml(name)}</strong><small>${datedMeetings} ${datedMeetings === 1 ? "möte med datum" : "möten med datum"}</small></span>
                </label>`;
            }).join("")}
        </div>`;
    }

    function getPlanningSourceLabel(group) {
        const name = normalizeText(group.name || "Planering", 65);
        const year = group.year !== "" && group.year !== undefined && Number.isFinite(Number(group.year))
            ? String(group.year)
            : "";
        const term = String(group.term || "").trim();
        const period = [
            year && !name.includes(year) ? year : "",
            term && !name.toLocaleUpperCase("sv").includes(term.toLocaleUpperCase("sv")) ? term : ""
        ].filter(Boolean).join(" ");
        return normalizeText(period ? `${name} · ${period}` : name, 80);
    }

    function syncPlanningMeetingEvents(wheel, groups) {
        const rings = wheel.rings.filter(ring => ring.sync_meetings_from_department
            && PLANNING_DEPARTMENTS.includes(ring.sync_meetings_department));
        if (!rings.length) return null;
        const events = [...wheel.events];
        let changed = false;
        rings.forEach(ring => {
            const excluded = new Set(ring.sync_excluded_planning_ids || []);
            const activePlans = groups.filter(group => group.level === ring.sync_meetings_department
                && group.id && !excluded.has(String(group.id)));
            const activePlanIds = new Set(activePlans.map(group => String(group.id)));
            const desiredMeetingKeys = new Set();
            activePlans.forEach(group => (Array.isArray(group.meetings) ? group.meetings : []).forEach(meeting => {
                const meetingDate = String(meeting?.date || "");
                const planId = String(group.id);
                const meetingId = String(meeting?.id || "");
                if (!meetingId || !isDate(meetingDate)) return;
                desiredMeetingKeys.add(`${planId}:${meetingId}`);
                const planName = getPlanningSourceLabel(group);
                const week = normalizeText(meeting.week || "", 20);
                const title = normalizeText(`${ring.sync_meetings_department} · ${planName} · Träff ${week || "möte"}`, 120);
                const responsible = normalizeText(meeting.responsible, 100);
                const location = normalizeText(meeting.location, 120);
                const notes = normalizeText(meeting.notes, 2000);
                const sourceChecklist = recurrence().normalizeChecklist(meeting.checklist);
                const checklist = sourceChecklist?.length ? sourceChecklist : null;
                const sourceFields = {
                    responsible: Boolean(responsible),
                    location: Boolean(location),
                    notes: Boolean(notes)
                };
                const index = events.findIndex(event => event.ring_id === ring.id
                    && event.source_planning_id === planId && event.source_meeting_id === meetingId);
                if (index < 0) {
                    events.push({
                        id: id(),
                        ring_id: ring.id,
                        title,
                        start_date: meetingDate,
                        end_date: meetingDate,
                        color_variant: "ring",
                        color: "",
                        responsible,
                        location,
                        notes,
                        checklist,
                        source_planning_id: planId,
                        source_meeting_id: meetingId,
                        source_planning_fields: sourceFields
                    });
                    changed = true;
                    return;
                }
                const existing = events[index];
                const previousSources = existing.source_planning_fields || {};
                const syncedValue = (field, value) => value
                    ? value
                    : previousSources[field] ? "" : existing[field];
                const updated = {
                    ...existing,
                    title,
                    start_date: meetingDate,
                    end_date: meetingDate,
                    responsible: syncedValue("responsible", responsible),
                    location: syncedValue("location", location),
                    notes: syncedValue("notes", notes),
                    checklist,
                    source_planning_fields: sourceFields
                };
                if (existing.title === updated.title && existing.start_date === updated.start_date
                    && existing.end_date === updated.end_date && existing.responsible === updated.responsible
                    && existing.location === updated.location && existing.notes === updated.notes
                    && JSON.stringify(existing.checklist) === JSON.stringify(updated.checklist)
                    && Boolean(previousSources.responsible) === sourceFields.responsible
                    && Boolean(previousSources.location) === sourceFields.location
                    && Boolean(previousSources.notes) === sourceFields.notes) return;
                events[index] = updated;
                changed = true;
            }));
            const retainedEvents = events.filter(event => event.ring_id !== ring.id || !event.source_planning_id
                || !activePlanIds.has(event.source_planning_id)
                || desiredMeetingKeys.has(`${event.source_planning_id}:${event.source_meeting_id}`));
            if (retainedEvents.length !== events.length) {
                events.splice(0, events.length, ...retainedEvents);
                changed = true;
            }
        });
        return changed ? normalizeWheel({ ...wheel, events }) : null;
    }

    function getDisplayedRings(wheel, selectedIds) {
        const roots = wheel.rings.filter(ring => !ring.parent_id);
        const displayed = [];
        roots.forEach(root => {
            const children = wheel.rings.filter(ring => ring.parent_id === root.id);
            if (children.length && root.children_display === "grouped") {
                const sourceRings = [root, ...children].filter(ring => selectedIds.has(ring.id));
                if (sourceRings.length) displayed.push({ ...root, sourceRings, eventRingId: root.id });
                return;
            }
            if (selectedIds.has(root.id)) displayed.push(root);
            children.forEach(child => {
                if (selectedIds.has(child.id)) displayed.push({ ...child, displayBackgroundColor: root.color });
            });
        });
        return displayed;
    }

    function renderRingList(wheel) {
        const list = byId("yearWheelRingList");
        if (ringFilterForWheelId !== wheel.id) {
            ringFilterForWheelId = wheel.id;
            ringGroupOpen = true;
        }
        const renderRingRow = (ring, label = ring.name) => `
            <div class="year-wheel-ring-row">
                <label class="year-wheel-ring-toggle">
                    <input type="checkbox" data-ring-toggle="${escapeHtml(ring.id)}" ${selectedRingIds.has(ring.id) ? "checked" : ""}>
                    <span class="year-wheel-ring-swatch" style="--ring-color:${ring.color}"></span>
                    <span>${escapeHtml(label)}</span>
                </label>
            </div>`;
        const roots = wheel.rings.filter(ring => !ring.parent_id);
        const renderRoot = root => {
            const children = wheel.rings.filter(ring => ring.parent_id === root.id);
            if (!children.length) return renderRingRow(root);
            const group = [root, ...children];
            const selectedCount = group.filter(ring => selectedRingIds.has(ring.id)).length;
            return `<details class="year-wheel-ring-filter-group"${ringGroupOpen ? " open" : ""}>
                <summary>
                    <span class="year-wheel-ring-filter-heading">
                        <input type="checkbox" data-ring-group-toggle="${escapeHtml(root.id)}" aria-label="Visa ${escapeHtml(root.name)} och alla underringar" ${selectedCount === group.length ? "checked" : ""}>
                        <span class="year-wheel-ring-swatch" style="--ring-color:${escapeHtml(root.color)}"></span>
                        <span>${escapeHtml(root.name)}</span>
                    </span>
                    <span class="year-wheel-ring-filter-chevron" aria-hidden="true"></span>
                </summary>
                <div class="year-wheel-ring-filter-children">${renderRingRow(root, `${root.name} · egna händelser`)}${children.map(child => renderRingRow(child)).join("")}</div>
            </details>`;
        };
        list.innerHTML = roots.length
            ? roots.map(renderRoot).join("")
            : `<p class="year-wheel-empty">Lägg till en ring för att börja planera.</p>`;
        list.querySelectorAll(".year-wheel-ring-filter-group").forEach(group => {
            group.open = ringGroupOpen;
            group.addEventListener("toggle", () => { ringGroupOpen = group.open; });
        });
        list.querySelectorAll("[data-ring-group-toggle]").forEach(toggle => {
            const root = roots.find(ring => ring.id === toggle.dataset.ringGroupToggle);
            const members = root ? [root, ...wheel.rings.filter(ring => ring.parent_id === root.id)] : [];
            const selectedCount = members.filter(ring => selectedRingIds.has(ring.id)).length;
            toggle.indeterminate = selectedCount > 0 && selectedCount < members.length;
            toggle.addEventListener("click", event => event.stopPropagation());
            toggle.addEventListener("change", () => {
                members.forEach(ring => {
                    if (toggle.checked) selectedRingIds.add(ring.id);
                    else selectedRingIds.delete(ring.id);
                });
                render();
            });
        });
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

        const minimumWidth = Math.min(1, 6 / days);
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

    function renderEventOverflowRows(events, ringById, editable) {
        return events.map(event => {
            const ring = ringById.get(event.ring_id);
            const ringName = ring?.name || "Möte";
            const date = `${formatDate(event.start_date, { day: "numeric", month: "long", year: "numeric" })}${event.end_date !== event.start_date ? ` – ${formatDate(event.end_date, { day: "numeric", month: "long", year: "numeric" })}` : ""}`;
            const action = editable ? "Redigera" : "Visa";
            const color = ring ? getEventColor(event, ring) : COLORS[0];
            return `<button class="year-wheel-overflow-event" type="button" data-overflow-event="${escapeHtml(event.id)}" aria-label="${action} ${escapeHtml(event.title)}">
                <span class="year-wheel-overflow-swatch" style="--event-color:${escapeHtml(color)}" aria-hidden="true"></span>
                <span class="year-wheel-overflow-event-text"><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(ringName)} · ${escapeHtml(date)}</small></span>
                <span class="year-wheel-overflow-edit">${action}</span>
            </button>`;
        }).join("");
    }

    function openEventOverflow(events, ringById) {
        const rows = renderEventOverflowRows(events, ringById, canEdit());
        openModal("Händelser nära varandra", `<div class="year-wheel-overflow-list">${rows}</div>`, "event-overflow");
        byId("yearWheelFormFields").querySelectorAll("[data-overflow-event]").forEach(button => {
            button.addEventListener("click", () => openEventForm(button.dataset.overflowEvent));
        });
    }

    function getEventSourceLabel(event) {
        if (event.source_wheel_id) return `Hämtad från ${event.source_wheel_name || "annat årshjul"} → ${event.source_wheel_ring_name || "ring"}`;
        if (event.source_arrangement_id) return "Hämtad från arrangemang";
        if (event.source_planning_id) {
            const group = planningGroups.find(item => String(item.id) === event.source_planning_id);
            return `Hämtad från avdelningsmöten${group ? ` → ${getPlanningSourceLabel(group)}` : ""}`;
        }
        return "";
    }

    function getChartEventDescription(event) {
        const source = getEventSourceLabel(event);
        const origin = source || (event.recurrence ? "Återkommande egen händelse" : "Egen händelse");
        return `${event.title} · ${formatDate(event.start_date)}${event.end_date !== event.start_date ? `–${formatDate(event.end_date)}` : ""} · ${origin}`;
    }

    function renderWheelChart(wheel, shownRings, visibleEvents, periodRange) {
        const container = byId("yearWheelChart");
        const { start, endExclusive } = periodRange;
        const days = totalDays(start, endExclusive);
        const outerRadius = 244;
        const innerRadius = 64;
        const ringWidth = shownRings.length ? (outerRadius - innerRadius) / shownRings.length : 0;
        const svg = [`<svg class="year-wheel-svg" viewBox="24 24 592 592" role="img" aria-label="Årshjul med månader och händelser"><defs><pattern id="year-wheel-sync-pattern" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#fff" stroke-opacity=".55" stroke-width="1.3"/></pattern><filter id="year-wheel-seam-shadow" x="60" y="60" width="520" height="520" filterUnits="userSpaceOnUse"><feDropShadow dx="3" dy="0" stdDeviation="2" flood-color="#142637" flood-opacity=".52"/></filter></defs>`];
        const monthIntervals = [];
        const monthLabels = [];
        const overflowActions = [];
        const ringGap = Math.min(12, ringWidth * 0.3);
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
                const sourceRing = ring.eventRingId
                    ? wheel.rings.find(item => item.id === ring.eventRingId)
                    : ring.sourceRings?.[0] || ring;
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
                    const title = getChartEventDescription(event);
                    const eventLabel = finish - from >= 0.04
                        ? `<text x="${label.x.toFixed(2)}" y="${label.y.toFixed(2)}" transform="rotate(${rotation.toFixed(1)} ${label.x.toFixed(2)} ${label.y.toFixed(2)})" style="fill:${getRingTextColor(eventColor)}" class="year-wheel-event-label">${escapeHtml(event.title)}</text>`
                        : "";
                    const laneInset = Math.min(0.8, Math.max(0.25, (laneOuter - laneInner) * 0.06));
                    const path = finish - from >= 0.999
                        ? `${arcPath(laneOuter - laneInset, laneInner + laneInset, from, from + 0.5)} ${arcPath(laneOuter - laneInset, laneInner + laneInset, from + 0.5, finish)}`
                        : arcPath(laneOuter - laneInset, laneInner + laneInset, from, finish);
                    svg.push(`<g class="year-wheel-event-mark" data-event-edit="${escapeHtml(event.id)}" tabindex="0" role="button" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title><path d="${path}" fill="${eventColor}" class="year-wheel-event-arc"/>${getEventSourceLabel(event) ? `<path d="${path}" fill="url(#year-wheel-sync-pattern)" class="year-wheel-event-sync-overlay" aria-hidden="true"/>` : ""}${eventLabel}</g>`);
                });
            });
            overflowGroups.forEach(group => {
                const mid = (group.from + group.to) / 2;
                const badge = point((outer + inner) / 2, mid);
                const count = group.events.length;
                const label = `+${count}`;
                const title = `${count} ${count === 1 ? "händelse visas" : "händelser visas"} tillsammans eftersom de ligger nära varandra. Klicka för att visa listan.`;
                const actionIndex = overflowActions.push(group.events) - 1;
                svg.push(`<g class="year-wheel-overflow-mark" data-event-overflow="${actionIndex}" tabindex="0" role="button" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title><circle cx="${badge.x.toFixed(2)}" cy="${badge.y.toFixed(2)}" r="10" class="year-wheel-overflow-badge"/><text x="${badge.x.toFixed(2)}" y="${badge.y.toFixed(2)}" class="year-wheel-overflow-label">${label}</text></g>`);
            });
        });
        shownRings.forEach((ring, ringIndex) => {
            const label = escapeHtml(ring.name.length > 24 ? `${ring.name.slice(0, 23)}…` : ring.name);
            const fontSize = Math.min(10, ringGap * 0.9);
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
        svg.push(`<text x="320" y="320" class="year-wheel-center-title year-wheel-year-edit" text-anchor="middle" dominant-baseline="central" role="button" tabindex="0" data-year-edit aria-label="Ändra ${view.mode === "calendar" ? "kalenderår" : "verksamhetsårets startår"}, ${view.year}">${centerYear}</text>`);
        svg.push(`<text x="320" y="292" class="year-wheel-center-subtitle" text-anchor="middle">${view.mode === "calendar" ? "Kalenderår" : "Verksamhetsår"}</text>`);
        [-1, 1].forEach(step => {
            const x = 320 + step * 20;
            const y = 350;
            const disabled = view.year + step < 1900 || view.year + step > 2200;
            const label = step < 0 ? "Föregående år" : "Nästa år";
            svg.push(`<g class="year-wheel-year-step" data-year-step="${step}" transform="translate(${x} ${y})" role="button" tabindex="${disabled ? "-1" : "0"}" aria-label="${label}" aria-disabled="${disabled}"><title>${label}</title><circle r="12"/><path d="M ${-step * 2} -4 L ${step * 2} 0 L ${-step * 2} 4"/></g>`);
        });
        svg.push("</svg>");
        const hasSyncedEvents = visibleEvents.some(event => getEventSourceLabel(event));
        container.innerHTML = svg.join("") + (hasSyncedEvents
            ? `<div class="year-wheel-sync-legend" aria-label="Händelsernas ursprung"><span><i class="year-wheel-legend-swatch" aria-hidden="true"></i>Egen händelse</span><span><i class="year-wheel-legend-swatch year-wheel-legend-swatch--synced" aria-hidden="true"></i>Synkad händelse</span></div>` : "")
            + `<p class="year-wheel-chart-event-info" data-chart-event-info role="status" aria-live="polite"></p>`;
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
        container.querySelectorAll("[data-year-step]").forEach(button => {
            const changeYear = () => {
                const year = view.year + Number(button.dataset.yearStep);
                if (year < 1900 || year > 2200) return;
                view.year = year;
                saveViewPreferences();
                render();
                container.querySelector(`[data-year-step="${button.dataset.yearStep}"]`)?.focus();
            };
            button.addEventListener("click", changeYear);
            button.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    changeYear();
                }
            });
        });
        container.querySelectorAll("[data-event-edit]").forEach(mark => {
            const event = visibleEvents.find(item => item.id === mark.dataset.eventEdit);
            const info = container.querySelector("[data-chart-event-info]");
            let hovered = false;
            let focused = false;
            const updateInfo = () => {
                info.textContent = (hovered || focused) && event ? getChartEventDescription(event) : "";
            };
            mark.addEventListener("mouseenter", () => { hovered = true; updateInfo(); });
            mark.addEventListener("mouseleave", () => { hovered = false; updateInfo(); });
            mark.addEventListener("focus", () => { focused = true; updateInfo(); });
            mark.addEventListener("blur", () => { focused = false; updateInfo(); });
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
        const sharedView = isSharedWheelView();
        const wheel = currentWheel();
        byId("yearWheelMenuPrintBtn").disabled = !wheel;
        byId("yearWheelMenuAddEventBtn").disabled = !currentWheel() || !canEdit() || !currentWheel().rings.length;
        byId("yearWheelMenuAddEventBtn").classList.toggle("hidden", sharedView);
        byId("addYearWheelEventBtn").classList.toggle("hidden", sharedView);
        byId("yearWheelMenuAddBtn").classList.toggle("hidden", restrictedUser || sharedView);
        byId("yearWheelMenuDefaultBtn").classList.toggle("hidden",
            sharedView || !auth()?.isSignedIn?.() || !auth()?.isOnline?.()
            || !auth()?.isAdmin?.() || !window.GTScoutYearWheelSync?.canWrite?.());
        const settingsButton = byId("yearWheelMenuSettingsBtn");
        const settingsTooltip = byId("yearWheelMenuSettingsTooltip");
        const settingsLocked = !canEdit();
        settingsTooltip.classList.toggle("hidden", !wheel || !canWrite());
        settingsTooltip.title = settingsLocked ? "Lås upp årshjulet för att kunna ändra inställningar." : "";
        settingsButton.disabled = settingsLocked;
        settingsButton.title = settingsLocked ? "" : "Inställningar";
        byId("yearWheelMenuCopyEventsBtn").classList.toggle("hidden", !currentWheel() || !canEdit());
        byId("shareYearWheelBtn").classList.toggle("hidden", sharedView || !wheel || wheel.local_only || !window.GTScoutYearWheelSync?.canWrite?.());
    }

    function updateYearWheelEditToggle() {
        const button = byId("yearWheelEditToggle");
        const unlocked = canEdit();
        const label = unlocked ? "Lås redigering" : "Lås upp för redigering";
        const icon = unlocked
            ? `<path fill="currentColor" d="M18 8h-1V6a5 5 0 0 0-9.9-1h2.05A3 3 0 0 1 15 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2Zm-6 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/>`
            : `<path fill="currentColor" d="M18 8h-1V6a5 5 0 0 0-10 0v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2ZM9 6a3 3 0 0 1 6 0v2H9V6Zm3 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"/>`;
        button.classList.toggle("hidden", !currentWheel() || !canWrite());
        button.classList.toggle("year-wheel-edit-toggle--active", unlocked);
        button.setAttribute("aria-label", label);
        button.setAttribute("title", label);
        button.setAttribute("aria-pressed", String(unlocked));
        button.querySelector("svg").innerHTML = icon;
        updateStickyYearWheelLock();
    }

    function updateStickyYearWheelLock() {
        const button = byId("yearWheelEditToggle");
        const anchor = byId("yearWheelEditControl").getBoundingClientRect();
        const header = document.querySelector(".site-header")?.getBoundingClientRect();
        const toolbar = byId("yearWheelToolbar").getBoundingClientRect();
        let top = Math.max(0, header?.bottom || 0);
        if (toolbar.height > 0 && toolbar.top <= top && toolbar.bottom > top) top = toolbar.bottom;
        top += 8;
        const sticky = !button.classList.contains("hidden") && anchor.top <= top;
        button.classList.toggle("year-wheel-edit-toggle--sticky", sticky);
        button.style.top = sticky ? `${top}px` : "";
        button.style.left = sticky ? `${anchor.left}px` : "";
    }

    function getYearWheelShareUrl(wheel) {
        const url = new URL("arshjul.html", window.location.href);
        if (wheel.share_token) url.searchParams.set("share", wheel.share_token);
        return wheel.share_token ? url.href : "";
    }

    function showYearWheelShareModal(wheel, message = "") {
        const shareUrl = getYearWheelShareUrl(wheel);
        const urlInput = byId("yearWheelShareUrl");
        urlInput.value = shareUrl;
        byId("yearWheelShareStatus").textContent = message;
        byId("rotateYearWheelShareBtn").classList.toggle("hidden", !wheel.share_token || !auth()?.isAdmin?.());
        byId("yearWheelShareModal").classList.remove("hidden");
        if (!wheel.share_token) return;
        urlInput.select?.();
        const clipboard = window.navigator?.clipboard;
        if (clipboard?.writeText) {
            clipboard.writeText(shareUrl).then(() => {
                byId("yearWheelShareStatus").textContent = message
                    ? `${message} Länken har kopierats.`
                    : "Länken har kopierats. Du kan också markera den och kopiera manuellt.";
            }).catch(() => {
                byId("yearWheelShareStatus").textContent = message
                    ? `${message} Markera länken och kopiera den manuellt.`
                    : "Markera länken och kopiera den manuellt.";
            });
        } else {
            byId("yearWheelShareStatus").textContent = message
                ? `${message} Markera länken och kopiera den manuellt.`
                : "Markera länken och kopiera den manuellt.";
        }
    }

    async function saveYearWheelShareToken(wheel, token, rotated = false) {
        const updated = normalizeWheel({ ...wheel, share_token: token });
        const result = await window.GTScoutYearWheelSync?.saveWheel(updated);
        if (result?.saved) {
            showYearWheelShareModal(currentWheel() || { ...updated, local_only: false }, rotated
                ? "Ny delningslänk skapad. Den gamla länken fungerar inte längre."
                : "Delningslänk skapad.");
            return;
        }

        const latest = currentWheel() || wheel;
        if (latest.share_token !== wheel.share_token) {
            await window.GTScoutYearWheelSync?.saveWheel({ ...latest, share_token: wheel.share_token });
        }
        showYearWheelShareModal(wheel, "Länken kunde inte sparas i databasen. Ingen ny delningslänk skapades.");
    }

    async function shareCurrentWheel() {
        const wheel = currentWheel();
        if (!wheel || wheel.local_only || isSharedWheelView() || !window.GTScoutYearWheelSync?.canWrite?.()) return;
        if (wheel.share_token) {
            showYearWheelShareModal(wheel);
            return;
        }
        await saveYearWheelShareToken(wheel, id());
    }

    async function rotateYearWheelShareToken() {
        const wheel = currentWheel();
        if (!wheel?.share_token || !auth()?.isAdmin?.() || !window.GTScoutYearWheelSync?.canWrite?.()) return;
        const button = byId("rotateYearWheelShareBtn");
        button.disabled = true;
        byId("yearWheelShareStatus").textContent = "Sparar ny delningslänk...";
        try {
            await saveYearWheelShareToken(wheel, id(), true);
        } finally {
            button.disabled = false;
        }
    }

    function copyEventToNextYear(eventId) {
        const wheel = currentWheel();
        const event = wheel?.events.find(item => item.id === eventId);
        if (!wheel || !event || event.recurrence || !canEdit()) return;
        const startDate = shiftDateToNextYear(event.start_date);
        const endDate = shiftDateToNextYear(event.end_date);
        if (!startDate || !endDate) {
            byId("yearWheelSyncStatus").textContent = "Händelsen kan inte kopieras eftersom datumet ligger utanför det tillåtna kalenderintervallet.";
            byId("yearWheelSyncStatus").classList.remove("hidden");
            byId("yearWheelSyncStatus").classList.add("planning-sync-status--error");
            return;
        }
        const copiedEvent = {
            ...detachWheelEvent(event),
            id: id(),
            start_date: startDate,
            end_date: endDate,
            copied_from_id: event.id,
            needs_review: true,
            source_arrangement_id: "",
            source_arrangement_fields: {}
        };
        copiedEvent.checklist = copyChecklist(event.checklist);
        copiedEvent.occurrence_checklists = {};
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
        return wheel.events.filter(event => !event.recurrence && event.start_date <= endKey
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
        }).join("") : `<p class="year-wheel-dialog-help">Inga händelser att kopiera för den valda perioden. Händelser som redan har en kopia hoppas över.</p>`;
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
                const ringLabel = getEventRingLabel(ring, ringById);
                const editable = canEdit() && !event.source_wheel_id;
                const eventAction = editable ? "Redigera" : "Visa";
                const eventActionIcon = editable
                    ? `<path d="m16 3 5 5L9 20l-6 1 1-6L16 3Z"/><path d="m14 5 5 5"/>`
                    : `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>`;
                const shortDate = `${formatDate(event.start_date, { day: "numeric", month: "short" })}${event.end_date !== event.start_date
                    ? `–${formatDate(event.end_date, { day: "numeric", month: "short" })}` : ""}`;
                return `<article class="year-wheel-event-card${event.needs_review ? " year-wheel-event-card--needs-review" : ""}" style="--event-ring-color:${escapeHtml(ring.color)}">
                    <span class="year-wheel-event-card-date">${escapeHtml(shortDate)}</span>
                    <div class="year-wheel-event-card-main">
                        <strong>${escapeHtml(event.title)}${event.recurrence ? ` <span class="year-wheel-review-badge">${event.is_exception ? "Ändrat tillfälle" : "Återkommande"}</span>` : ""}${event.needs_review ? ` <span class="year-wheel-review-badge">Kontrollera kopia</span>` : ""}</strong>
                        <span class="year-wheel-event-card-ring">${escapeHtml(ringLabel)}</span>
                        ${event.source_wheel_id ? `<span class="year-wheel-event-card-ring">Hämtad från ${escapeHtml(event.source_wheel_name)} · ${escapeHtml(event.source_wheel_ring_name)}</span>` : ""}
                        <span class="year-wheel-event-card-info">${event.responsible ? `<span>Ansvarig: ${escapeHtml(event.responsible)}</span>` : ""}${event.location ? `<span>Plats: ${escapeHtml(event.location)}</span>` : ""}${event.notes ? `<span class="year-wheel-event-notes">${escapeHtml(event.notes)}</span>` : ""}</span>
                    </div>
                    <div class="year-wheel-event-actions">${canEdit() && event.needs_review ? `<button class="btn-secondary" type="button" data-mark-event-reviewed="${escapeHtml(event.id)}" title="Markera kopian som kontrollerad">Kontrollerad</button>` : ""}${canEdit() && !event.recurrence ? `<button class="btn-secondary" type="button" data-copy-event="${escapeHtml(event.id)}" aria-label="Kopiera ${escapeHtml(event.title)} till nästa år" title="Kopiera till nästa år"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg></button>` : ""}<button class="btn-secondary" type="button" data-edit-event="${escapeHtml(event.id)}" aria-label="${eventAction} ${escapeHtml(event.title)}" title="${eventAction}"><svg viewBox="0 0 24 24" aria-hidden="true">${eventActionIcon}</svg></button></div>
                </article>`;
            }).join("");
            return `<details class="year-wheel-month-group" data-event-month="${month}" ${collapsedEventMonths.has(month) ? "" : "open"}>
                <summary class="recipe-meal-summary"><strong>${escapeHtml(title)}</strong><span>${monthEvents.length} ${monthEvents.length === 1 ? "händelse" : "händelser"}</span></summary>
                <div class="year-wheel-events">${cards}</div>
            </details>`;
        }).join("") : `<p class="year-wheel-empty">Inga händelser för de valda ringarna i den här perioden.</p>`;
        const series = wheel.events.filter(item => item.recurrence && selectedRingIds.has(item.ring_id));
        if (series.length) {
            list.innerHTML = `<details><summary>Återkommande serier (${series.length})</summary>
                ${series.map(item => `<p><button class="btn-secondary" type="button" data-series-edit="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button>
                    ${escapeHtml(recurrence().describe(item.recurrence))}</p>`).join("")}</details>` + list.innerHTML;
            list.querySelectorAll("[data-series-edit]").forEach(button =>
                button.addEventListener("click", () => openEventForm(button.dataset.seriesEdit)));
        }
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

    function getEventRingLabel(ring, ringById) {
        const parent = ringById.get(ring?.parent_id);
        if (!parent) return ring?.name || "Möte";
        return `${parent.name} · ${ring.name}`;
    }

    function render() {
        document.body.classList.toggle("year-wheel-page--details", view.chartMode === "details");
        document.body.classList.toggle("year-wheel-page--overview", view.chartMode === "overview");
        byId("yearWheelOverviewBtn").setAttribute("aria-pressed", String(view.chartMode === "overview"));
        byId("yearWheelDetailsBtn").setAttribute("aria-pressed", String(view.chartMode === "details"));
        byId("yearWheelChart").classList.toggle("year-wheel-chart--overview", view.chartMode === "overview");
        const selector = byId("yearWheelSelect");
        const wheelCount = byId("yearWheelCount");
        const previousId = selectedWheelId;
        selector.innerHTML = wheels.map(wheel => `<option value="${escapeHtml(wheel.id)}">${escapeHtml(wheel.name)}</option>`).join("");
        if (!wheels.length) {
            updateOverviewEventListHeight();
            selectedWheelId = "";
            wheelCount.textContent = "Inga årshjul";
            selector.setAttribute("aria-label", "Inga årshjul");
            byId("yearWheelDateRange").textContent = "";
            byId("yearWheelChart").innerHTML = `<p class="year-wheel-empty">Skapa ett årshjul för att komma igång.</p>`;
            byId("yearWheelRingList").innerHTML = `<p class="year-wheel-empty">Inga ringar att visa.</p>`;
            byId("yearWheelEvents").innerHTML = "";
            updateEventMonthToggle([]);
            updateYearWheelMenuActions();
            updateYearWheelEditToggle();
            selector.disabled = true;
            byId("addYearWheelEventBtn").disabled = true;
            byId("yearWheelReadOnlyNote").classList.add("hidden");
            byId("yearWheelSourceStatus").classList.add("hidden");
            return;
        }
        const requestedWheelId = new URLSearchParams(window.location.search).get("wheel");
        const defaultWheelId = requestedWheelId || window.GTScoutYearWheelSync?.getDefaultWheelId?.();
        selectedWheelId = wheels.some(wheel => wheel.id === previousId)
            ? previousId
            : wheels.some(wheel => wheel.id === defaultWheelId) ? defaultWheelId : wheels[0].id;
        selector.value = selectedWheelId;
        const selectedIndex = wheels.findIndex(wheel => wheel.id === selectedWheelId);
        wheelCount.textContent = wheels.length === 1 ? "1 hjul" : `${selectedIndex + 1} av ${wheels.length}`;
        const wheel = currentWheel();
        const sourceWarnings = isSharedWheelView() ? [] : wheel.rings.flatMap(ring => {
            const error = getWheelSourceError(wheel, ring.sync_from_wheel, wheels);
            return error ? [`${ring.name}: ${error} Tidigare hämtade händelser behålls tills kopplingen ändras.`] : [];
        });
        byId("yearWheelSourceStatus").textContent = sourceWarnings.join(" ");
        byId("yearWheelSourceStatus").classList.toggle("hidden", !sourceWarnings.length);
        selector.setAttribute("aria-label", `Välj årshjul: ${wheel.name}, ${selectedIndex + 1} av ${wheels.length}`);
        if (!startMonthOverridden) view.startMonth = wheel.start_month;
        const validRingIds = new Set(wheel.rings.map(ring => ring.id));
        if (selectedRingsForWheelId !== wheel.id || [...selectedRingIds].some(ringId => !validRingIds.has(ringId))) {
            selectedRingIds = new Set(wheel.rings.map(ring => ring.id));
            selectedRingsForWheelId = wheel.id;
        }
        selector.disabled = false;
        byId("addYearWheelEventBtn").disabled = !canEdit() || !wheel.rings.length;
        const remoteWritable = Boolean(window.GTScoutYearWheelSync?.canWrite?.());
        byId("yearWheelReadOnlyNote").textContent = isSharedWheelView()
            ? "Delat årshjul · skrivskyddad visning."
            : canWrite() && !remoteWritable
                ? "Det här årshjulet sparas lokalt. Logga in som ledare för att dela med kåren."
                : "Du kan visa och filtrera hjulet. Ledare kan redigera.";
        byId("yearWheelReadOnlyNote").classList.toggle("hidden", remoteWritable && !isSharedWheelView());
        updateYearWheelEditToggle();
        updateYearWheelMenuActions();
        byId("yearWheelMode").value = view.mode;
        byId("yearWheelYear").value = view.year;
        byId("yearWheelYearLabel").textContent = view.mode === "calendar" ? "Kalenderår" : "Verksamhetsår (startår)";
        byId("yearWheelStartMonthField").classList.toggle("hidden", view.mode !== "operational");
        byId("yearWheelStartMonth").value = String(view.startMonth);
        const range = period();
        const startKey = dateKey(range.start);
        const endKey = dateKey(range.end);
        byId("yearWheelDateRange").textContent = `${formatDate(startKey, { day: "numeric", month: "long", year: "numeric" })} – ${formatDate(endKey, { day: "numeric", month: "long", year: "numeric" })}`;
        renderRingList(wheel);
        const shownRings = getDisplayedRings(wheel, selectedRingIds);
        const visibleEvents = recurrence().expand(wheel.events, range).filter(event => selectedRingIds.has(event.ring_id));
        renderWheelChart(wheel, shownRings, visibleEvents, range);
        renderEventList(wheel, visibleEvents);
        updateOverviewEventListHeight();
    }

    function updateOverviewEventListHeight() {
        const eventSection = byId("yearWheelEventsSection");
        const shouldMatchChart = view.chartMode === "overview" && window.innerWidth >= 1200;
        if (!shouldMatchChart) {
            eventSection.style.height = "";
            return;
        }
        const chartHeight = byId("yearWheelChartCard").getBoundingClientRect().height;
        eventSection.style.height = `${chartHeight}px`;
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
        submitButton.classList.toggle("hidden", mode === "event-view" || mode === "event-overflow");
        byId("copyYearWheelEventBtn").classList.toggle("hidden", mode !== "event" || !itemId || !canEdit());
        const deleteButton = byId("deleteYearWheelItemBtn");
        deleteButton.classList.remove("year-wheel-delete-button--text");
        deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>';
        deleteButton.setAttribute("aria-label", "Ta bort");
        deleteButton.classList.toggle("hidden", !itemId || !["ring", "event", "wheel"].includes(mode));
        deleteButton.disabled = false;
        deleteButton.removeAttribute("title");
        byId("yearWheelModal").classList.remove("hidden");
        byId("yearWheelFormFields").querySelector("input,select,textarea")?.focus();
    }

    function closeModal() {
        byId("yearWheelRecurrenceModal").classList.add("hidden");
        byId("yearWheelArrangementSyncModal").classList.add("hidden");
        syncChoiceHandlers = null;
        if (modalMode === "ring" && wheelDraft) {
            renderWheelDraft();
            return;
        }
        byId("yearWheelModal").classList.add("hidden");
        byId("yearWheelModal").querySelector(".year-wheel-modal-content").classList.remove("year-wheel-modal-content--bulk-copy");
        byId("yearWheelForm").classList.remove("year-wheel-form--bulk-copy");
        modalMode = "";
        editingId = "";
        editingOccurrenceDate = "";
        recurrenceDraft = null;
        checklistDraft = null;
        wheelDraft = null;
    }

    function openYearForm() {
        const label = view.mode === "calendar" ? "Kalenderår" : "Verksamhetsår (startår)";
        openModal("Ändra år", `
            <label class="modal-field"><span>${label}</span><input name="year" type="number" required min="1900" max="2200" step="1" value="${view.year}"></label>
        `, "year");
    }

    function openPrintForm() {
        if (!currentWheel()) return;
        openModal("Skriv ut årshjul", `
            <p class="year-wheel-dialog-help">Välj utskriftslayout för den aktuella perioden.</p>
            <label class="modal-field"><span>Utskrift</span><select name="print_layout">
                <option value="wheel">Årshjul – A3 liggande</option>
                <option value="list">Alla händelser – A4 stående</option>
            </select></label>
            <aside class="year-wheel-dialog-help" aria-label="Hjälp om utskrift">
                <p>A3-utskriften får en QR-kod nere till vänster om årshjulet har en publik delningslänk. Hjulet följer dina ringfilter och hur ringarna har grupperats. Listan innehåller alla händelser i perioden, även i dolda ringar.</p>
                <p>Du får en förhandsvisning innan webbläsarens utskriftsdialog öppnas. Välj det föreslagna pappersformatet och stäng gärna av webbläsarens sidhuvud och sidfot.</p>
            </aside>
        `, "print");
        byId("yearWheelForm").querySelector('[type="submit"]').textContent = "Förhandsvisa";
    }

    function openDefaultWheelForm() {
        if (!auth()?.isAdmin?.() || !window.GTScoutYearWheelSync?.canWrite?.() || isSharedWheelView()) return;
        const defaultWheelId = window.GTScoutYearWheelSync.getDefaultWheelId?.();
        const savedWheels = wheels.filter(wheel => !wheel.local_only);
        openModal("Välj standardårshjul", `
            <p class="year-wheel-dialog-help">Det valda hjulet öppnas automatiskt för alla i kåren.</p>
            <label class="modal-field"><span>Standardårshjul</span><select name="default_wheel_id">
                <option value="" ${!defaultWheelId ? "selected" : ""}>Första årshjulet alfabetiskt</option>
                ${savedWheels.map(wheel => `<option value="${escapeHtml(wheel.id)}" ${wheel.id === defaultWheelId ? "selected" : ""}>${escapeHtml(wheel.name)}</option>`).join("")}
            </select></label>
        `, "default-wheel");
    }

    function openWheelForm() {
        if (!canWrite()) return;
        ringGroupOpen = true;
        wheelDraft = { id: "", name: "", start_month: view.startMonth,
            rings: [], events: [] };
        renderWheelDraft();
    }

    function openWheelSettings() {
        const wheel = currentWheel();
        if (!wheel || !canEdit()) return;
        ringGroupOpen = true;
        wheelDraft = { ...wheel, rings: [...wheel.rings] };
        renderWheelDraft();
    }

    function renderWheelDraft() {
        const draft = wheelDraft;
        openModal(draft.id ? "Inställningar för årshjul" : "Nytt årshjul", `
            <label class="modal-field"><span>Namn</span><input name="name" required maxlength="100" value="${escapeHtml(draft.name)}" placeholder="Till exempel Kårens verksamhetsår"></label>
            <label class="modal-field"><span>Verksamhetsåret börjar</span><select name="start_month">${MONTHS.map((month, index) => `<option value="${index + 1}" ${index + 1 === Number(draft.start_month) ? "selected" : ""}>${month}</option>`).join("")}</select></label>
            ${renderRingSelection(draft.rings, draft.events)}
        `, "wheel", draft.id);
        byId("yearWheelFormFields").querySelectorAll(".year-wheel-ring-group-details").forEach(details => {
            details.addEventListener("toggle", () => { ringGroupOpen = details.open; });
        });
    }

    function captureWheelDraft() {
        const data = new FormData(byId("yearWheelForm"));
        const value = Object.fromEntries(data.entries());
        wheelDraft.name = String(value.name || "");
        wheelDraft.start_month = value.start_month;
    }

    function deleteDraftRing(ringId) {
        if (getRingEventCount(wheelDraft.events, ringId)) {
            byId("yearWheelFormMessage").textContent = "Flytta eller ta bort ringens händelser innan ringen tas bort.";
            byId("yearWheelFormMessage").classList.remove("hidden");
            return;
        }
        const ring = wheelDraft.rings.find(item => item.id === ringId);
        if (!ring || !window.confirm(`Ta bort ringen "${ring.name}"?`)) return;
        if (wheelDraft.rings.some(item => item.parent_id === ringId)) {
            byId("yearWheelFormMessage").textContent = "Flytta upp eller ta bort ringens underringar innan ringen tas bort.";
            byId("yearWheelFormMessage").classList.remove("hidden");
            return;
        }
        wheelDraft.rings = wheelDraft.rings.filter(item => item.id !== ringId);
        renderWheelDraft();
    }

    function ringOptionsMarkup(rings, events) {
        const eventsByRing = new Map();
        events.forEach(event => eventsByRing.set(event.ring_id, (eventsByRing.get(event.ring_id) || 0) + 1));
        const ringName = ring => {
            const sources = [];
            if (ring.sync_arrangements) sources.push("arrangemang");
            if (ring.sync_meetings_from_department) sources.push("avdelningsmöten");
            if (ring.sync_from_wheel) {
                const source = wheels.find(item => item.id === ring.sync_from_wheel.wheel_id);
                sources.push(source ? `årshjul: ${source.name}` : "annat årshjul");
            }
            return `<span class="year-wheel-ring-option-name">${escapeHtml(ring.name)}${sources.length
                ? `<span class="year-wheel-ring-sync-label">Synkar från ${escapeHtml(sources.join(", "))}</span>` : ""}</span>`;
        };
        const actions = ring => {
            const siblings = rings.filter(candidate => (candidate.parent_id || "") === (ring.parent_id || ""));
            const index = siblings.findIndex(candidate => candidate.id === ring.id);
            return `<span class="year-wheel-ring-actions">
                <span class="year-wheel-ring-order">
                    <button class="year-wheel-ring-order-button" type="button" data-config-ring-action="move-up" data-ring-id="${escapeHtml(ring.id)}" aria-label="Flytta ${escapeHtml(ring.name)} utåt" title="Flytta utåt" ${index <= 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></button>
                    <button class="year-wheel-ring-order-button" type="button" data-config-ring-action="move-down" data-ring-id="${escapeHtml(ring.id)}" aria-label="Flytta ${escapeHtml(ring.name)} inåt" title="Flytta inåt" ${index < 0 || index === siblings.length - 1 ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg></button>
                </span>
                ${!ring.parent_id ? `<button class="year-wheel-ring-add-child" type="button" data-config-ring-action="add-child" data-parent-id="${escapeHtml(ring.id)}" title="Lägg till underring" aria-label="Lägg till underring under ${escapeHtml(ring.name)}">+</button>` : ""}
                <button class="year-wheel-ring-edit" type="button" data-config-ring-action="edit" data-ring-id="${escapeHtml(ring.id)}" aria-label="Redigera ${escapeHtml(ring.name)}" title="Redigera ring"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4 15.6 5 4.8 15.8 4 20Z"/></svg></button>
                <span class="year-wheel-ring-drag-handle" draggable="true" data-ring-drag-handle="${escapeHtml(ring.id)}" aria-hidden="true" title="Dra för att ändra ordning"><svg viewBox="0 0 24 24"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/></svg></span>
            </span>`;
        };
        const renderOption = ring => {
            const count = eventsByRing.get(ring.id) || 0;
            return `<div class="year-wheel-ring-config"${ring ? ` data-ring-id="${escapeHtml(ring.id)}"` : ""}>
                <div class="year-wheel-ring-option">
                    <span class="year-wheel-ring-swatch" style="--ring-color:${escapeHtml(ring.color)}"></span>
                    ${ringName(ring)}
                    ${count ? `<small>${count} ${count === 1 ? "händelse" : "händelser"}</small>` : ""}
                </div>${actions(ring)}
            </div>`;
        };
        const roots = rings.filter(ring => !ring.parent_id);
        const renderRoot = ring => {
            const children = rings.filter(candidate => candidate.parent_id === ring.id);
            if (!children.length) return renderOption(ring);
            return `<div class="year-wheel-ring-config-group">
                <div class="year-wheel-ring-config year-wheel-ring-config-group-row" data-ring-id="${escapeHtml(ring.id)}">
                    <span class="year-wheel-ring-swatch" style="--ring-color:${escapeHtml(ring.color)}"></span>
                    <details class="year-wheel-ring-group-details"${ringGroupOpen ? " open" : ""}>
                        <summary>
                            ${ringName(ring)}
                            ${actions(ring)}
                        </summary>
                        <div class="year-wheel-ring-config-children">${children.map(renderOption).join("")}</div>
                    </details>
                </div>
            </div>`;
        };
        const rootsMarkup = roots.map(renderRoot).join("");
        return `<fieldset class="year-wheel-ring-selection">
            <legend>Ringar i årshjulet</legend>
            <p class="year-wheel-dialog-help">Den första ringen visas ytterst. Ändra ringens placering för att göra den till en underring.</p>
            <div class="year-wheel-ring-options">${rootsMarkup || `<p class="year-wheel-empty">Inga ringar har lagts till ännu.</p>`}</div>
        </fieldset>`;
    }

    function renderRingSelection(rings, events) {
        return `${ringOptionsMarkup(rings, events)}
            <button class="btn-secondary" type="button" data-config-ring-action="add">+ Lägg till ring</button>
            <p class="year-wheel-dialog-help">Ändringarna sparas när du sparar årshjulet.</p>`;
    }

    function createDefaultRing(name) {
        const defaultRing = DEFAULT_RINGS.find(([defaultName]) => defaultName === name);
        if (!defaultRing) return null;
        const [ringName, color] = defaultRing;
        return {
            id: id(),
            name: ringName,
            color,
            color_variant: DEPARTMENT_RING_COLORS[ringName] ? "standard" : "custom",
            parent_id: "",
            children_display: "grouped",
            sync_arrangements: ringName.trim().toLocaleLowerCase("sv") === "arrangemang",
            sync_meetings_from_department: PLANNING_DEPARTMENTS.includes(ringName),
            sync_meetings_department: PLANNING_DEPARTMENTS.includes(ringName) ? ringName : "",
            sync_excluded_planning_ids: []
        };
    }

    function getRingEventCount(events, ringId) {
        return events.filter(event => event.ring_id === ringId).length;
    }

    function renderWheelSourceSelection(sourceId, selectedIds, includeChildrenIds = [], targetName = "", targetWheelId = "") {
        const source = wheels.find(wheel => wheel.id === sourceId);
        if (!source) return `<p class="year-wheel-dialog-help">Välj ett årshjul för att se dess ringar.</p>`;
        const circular = Boolean(targetWheelId && wheelDependsOn(source.id, targetWheelId, wheels));
        const orderedRings = source.rings.filter(ring => !ring.parent_id).flatMap(root =>
            [root, ...source.rings.filter(ring => ring.parent_id === root.id)]);
        return `${circular ? `<p class="detail-note" role="status">De här årshjulen hämtar händelser från varandra, direkt eller via andra årshjul. Välj ett annat källårshjul eller ta bort den andra synkningen först.</p>` : ""}
            <fieldset class="year-wheel-source-options${circular ? " year-wheel-source-options--blocked" : ""}" aria-label="Källringar"${circular ? ' disabled title="Kan inte väljas – hämtar redan från det här årshjulet"' : ""}>
            <div class="year-wheel-source-list">${orderedRings.map(ring => {
            const selected = selectedIds.includes(ring.id);
            const parent = source.rings.find(item => item.id === ring.parent_id);
            const inherited = parent && selectedIds.includes(parent.id) && includeChildrenIds.includes(parent.id);
            return `<div class="year-wheel-source-row${ring.parent_id ? " year-wheel-source-row--child" : ""}">
                <label class="year-wheel-arrangement-sync"><input type="checkbox" name="source_ring_ids" value="${escapeHtml(ring.id)}" ${selected || inherited ? "checked" : ""} ${inherited ? `disabled aria-label="${escapeHtml(ring.name)} – ingår via ${escapeHtml(parent.name)}"` : ""}><span>${escapeHtml(ring.name)}</span></label>
                ${inherited ? `${selected ? `<input type="hidden" name="source_ring_ids" value="${escapeHtml(ring.id)}">` : ""}<span class="year-wheel-source-inherited">Ingår via ${escapeHtml(parent.name)}</span>` : ""}
                ${!ring.parent_id ? `<div data-source-children="${escapeHtml(ring.id)}"${selected ? "" : " hidden"}><label class="year-wheel-arrangement-sync year-wheel-source-children"><input type="checkbox" name="source_child_ring_ids" value="${escapeHtml(ring.id)}" aria-label="Ta med underringar till ${escapeHtml(ring.name)}" title="Alla nuvarande och framtida underringar tas med. Avmarkera för att välja underringar separat." ${selected && includeChildrenIds.includes(ring.id) ? "checked" : ""} ${selected ? "" : "disabled"}><span>Ta med underringar</span></label></div>` : ""}
            </div>`;
        }).join("")}</div></fieldset>
            ${circular ? "" : `
            <p class="year-wheel-dialog-help">Alla nuvarande och framtida underringar tas med när alternativet är valt. Avmarkera för att välja underringar separat.</p>
            <p class="year-wheel-dialog-help" data-wheel-source-summary aria-live="polite">${(() => {
                const included = getWheelSourceRings(source, { ring_ids: selectedIds, include_children_ring_ids: includeChildrenIds });
                const names = orderedRings.filter(ring => included.has(ring.id)).map(ring => {
                    const parent = source.rings.find(item => item.id === ring.parent_id);
                    return parent ? `${parent.name} · ${ring.name}` : ring.name;
                });
                return `<strong>Hämtas:</strong> ${names.length ? escapeHtml(names.join(", ")) : "Inga ringar valda"}. Händelserna samlas i ${targetName ? `målringen ${escapeHtml(targetName)}` : "målringen"}. Inga underringar skapas där.`;
            })()}</p>`}`;
    }

    function openRingForm(ringId = "", parentId = "") {
        const wheel = wheelDraft || currentWheel();
        if (!wheel || !canEdit()) return;
        const ring = wheel.rings.find(item => item.id === ringId);
        const eventCount = ring ? getRingEventCount(wheel.events, ring.id) : 0;
        const linkedEvents = ring
            ? wheel.events.filter(event => event.ring_id === ring.id && event.source_arrangement_id)
            : [];
        const excludedPlanningIds = new Set(ring?.sync_excluded_planning_ids || []);
        const initialDepartment = ring?.sync_meetings_department
            || (PLANNING_DEPARTMENTS.includes(ring?.name) ? ring.name : "");
        const planningEnabled = Boolean(ring?.sync_meetings_from_department);
        const wheelSource = ring?.sync_from_wheel;
        const sourceWheels = wheels.filter(item => item.id !== wheel.id
            && item.local_kar_id === (wheel.local_kar_id || auth()?.getState?.().karId || null));
        const hasChildren = ring && wheel.rings.some(item => item.parent_id === ring.id);
        const parents = wheel.rings.filter(item => !item.parent_id && item.id !== ringId);
        const parentOptions = `<option value="" ${!ring?.parent_id && !parentId ? "selected" : ""}>Ingen, skapa som ring</option>${parents.map(parent => `<option value="${escapeHtml(parent.id)}" ${(ring?.parent_id || parentId) === parent.id ? "selected" : ""}>${escapeHtml(parent.name)}</option>`).join("")}`;
        const availableDefaults = DEFAULT_RINGS.filter(([name]) => !wheel.rings.some(item => item.name === name));
        openModal(ring ? "Redigera ring" : "Lägg till ring", `
            ${!ring ? `<label class="modal-field"><span>Utgå från</span><select name="default_ring"><option value="">Egen ring</option>${availableDefaults.map(([name]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select></label>` : ""}
            <label class="modal-field"><span>Namn på ringen</span><input name="name" required maxlength="60" value="${escapeHtml(ring?.name || "")}" placeholder="Till exempel Styrelse"></label>
            <label class="modal-field"><span>Placering</span><select name="parent_id" ${hasChildren ? "disabled title=\"Flytta upp eller ta bort underringarna först\"" : ""}>${parentOptions}</select>${hasChildren ? `<input type="hidden" name="parent_id" value="">` : ""}</label>
            ${!ring?.parent_id ? `<label class="modal-field"><span>Visa underringar</span><select name="children_display"><option value="grouped" ${ring?.children_display !== "individual" ? "selected" : ""}>Summera händelser i ringen</option><option value="individual" ${ring?.children_display === "individual" ? "selected" : ""}>Visa underringar separat</option></select></label>` : ""}
            <label class="year-wheel-arrangement-sync"><input name="sync_arrangements" type="checkbox" ${ring?.sync_arrangements ?? String(ring?.name || "").trim().toLocaleLowerCase("sv") === "arrangemang" ? "checked" : ""}><span>Synka arrangemang automatiskt</span></label>
            <label class="year-wheel-arrangement-sync"><input name="sync_meetings_from_department" type="checkbox" ${planningEnabled ? "checked" : ""}><span>Synka avdelning möten automatiskt</span></label>
            <label class="year-wheel-arrangement-sync"><input name="sync_from_wheel_enabled" type="checkbox" ${wheelSource ? "checked" : ""}><span>Synka från annat årshjul</span></label>
            <div data-wheel-sync-settings${wheelSource ? "" : " hidden"}>
                <label class="modal-field"><span>Årshjul</span><select name="source_wheel_id">
                    <option value="">Välj årshjul</option>
                    ${wheelSource && !sourceWheels.some(item => item.id === wheelSource.wheel_id) ? `<option value="${escapeHtml(wheelSource.wheel_id)}" selected>Källårshjulet saknas</option>` : ""}
                    ${sourceWheels.map(item => {
                        const circular = wheelDependsOn(item.id, wheel.id, wheels);
                        return `<option value="${escapeHtml(item.id)}" ${wheelSource?.wheel_id === item.id ? "selected" : ""} ${circular ? "disabled" : ""}>${escapeHtml(item.name)}${circular ? " – hämtar redan från det här årshjulet" : ""}</option>`;
                    }).join("")}
                </select></label>
                <p class="year-wheel-dialog-help">Du kan inte hämta från ett årshjul som redan hämtar händelser från det du redigerar, direkt eller via andra årshjul. Händelserna skulle då skickas runt mellan hjulen.</p>
                <div data-wheel-sync-rings>${renderWheelSourceSelection(wheelSource?.wheel_id, wheelSource?.ring_ids || [], wheelSource?.include_children_ring_ids || [], ring?.name || "", wheel.id || "")}</div>
                <p class="year-wheel-dialog-help">Valda ringars händelser samlas i den här ringen. Ändra händelserna i källårshjulet. Nya ringar väljs inte automatiskt. Hämtat innehåll blir även synligt via det här hjulets delningslänk.</p>
            </div>
            <input type="hidden" name="wheel_sync_action" value="">
            <div data-meeting-sync-settings${planningEnabled ? "" : " hidden"}>
                <label class="modal-field"><span>Avdelning</span><select name="sync_meetings_department">
                    <option value="">Välj avdelning</option>
                    ${PLANNING_DEPARTMENTS.map(department => `<option value="${escapeHtml(department)}" ${initialDepartment === department ? "selected" : ""}>${escapeHtml(department)}</option>`).join("")}
                </select></label>
                <input type="hidden" name="sync_excluded_planning_ids" value="${escapeHtml(JSON.stringify([...excludedPlanningIds]))}">
                <div data-meeting-sync-plans>${initialDepartment ? renderPlanningSyncSelection(initialDepartment, excludedPlanningIds) : `<p class="year-wheel-dialog-help">Välj en avdelning för att se dess planeringar.</p>`}</div>
                <p class="year-wheel-dialog-help">Planeringar inkluderas automatiskt. Avmarkera de planeringar som inte ska synkas.</p>
            </div>
            ${linkedEvents.length ? `<input type="hidden" name="arrangement_sync_action" value="">` : ""}
            ${ring && wheel.events.some(event => event.ring_id === ring.id && event.source_planning_id)
                ? `<input type="hidden" name="planning_sync_action" value="">`
                : ""}
            <label class="modal-field" data-ring-color-variant${DEPARTMENT_RING_COLORS[ring?.name || ""] ? "" : " hidden"}><span>Färgvariant</span><select name="color_variant"><option value="standard" ${ring?.color_variant === "standard" || !ring?.color_variant && DEPARTMENT_RING_COLORS[ring?.name || ""] ? "selected" : ""}>Standardfärg</option><option value="light" ${ring?.color_variant === "light" ? "selected" : ""}>Ljusare alternativfärg</option><option value="custom" ${ring?.color_variant === "custom" ? "selected" : ""}>Egen färg</option></select></label>
            <label class="modal-field" data-ring-custom-color${DEPARTMENT_RING_COLORS[ring?.name || ""] && ring?.color_variant !== "custom" ? " hidden" : ""}><span>Färg</span><input name="color" type="color" value="${escapeHtml(ring?.color || DEPARTMENT_RING_COLORS[ring?.name || ""]?.standard || COLORS[wheel.rings.length % COLORS.length])}"></label>
            ${eventCount ? `<p class="detail-note-warning">Ringen har ${eventCount} händelser. Flytta eller ta bort dem innan ringen tas bort.</p>` : ""}
        `, "ring", ringId);
        if (eventCount) {
            const deleteButton = byId("deleteYearWheelItemBtn");
            deleteButton.disabled = true;
            deleteButton.title = "Flytta eller ta bort ringens händelser först";
        }
        if (hasChildren) {
            const deleteButton = byId("deleteYearWheelItemBtn");
            deleteButton.disabled = true;
            deleteButton.title = "Flytta upp eller ta bort underringarna först";
        }
        const nameInput = byId("yearWheelFormFields").querySelector('[name="name"]');
        const defaultRingInput = byId("yearWheelFormFields").querySelector('[name="default_ring"]');
        const colorVariant = byId("yearWheelFormFields").querySelector('[name="color_variant"]');
        const colorInput = byId("yearWheelFormFields").querySelector('[name="color"]');
        const colorVariantField = byId("yearWheelFormFields").querySelector("[data-ring-color-variant]");
        const customColorField = byId("yearWheelFormFields").querySelector("[data-ring-custom-color]");
        const syncArrangementsInput = byId("yearWheelFormFields").querySelector('[name="sync_arrangements"]');
        const syncAction = byId("yearWheelFormFields").querySelector('[name="arrangement_sync_action"]');
        const syncMeetingsInput = byId("yearWheelFormFields").querySelector('[name="sync_meetings_from_department"]');
        const syncDepartmentInput = byId("yearWheelFormFields").querySelector('[name="sync_meetings_department"]');
        const excludedPlanningInput = byId("yearWheelFormFields").querySelector('[name="sync_excluded_planning_ids"]');
        const planningSyncSettings = byId("yearWheelFormFields").querySelector("[data-meeting-sync-settings]");
        const planningSyncPlans = byId("yearWheelFormFields").querySelector("[data-meeting-sync-plans]");
        const wheelSyncInput = byId("yearWheelFormFields").querySelector('[name="sync_from_wheel_enabled"]');
        const sourceWheelInput = byId("yearWheelFormFields").querySelector('[name="source_wheel_id"]');
        let selectedSourceIds = new Set(wheelSource?.ring_ids || []);
        let includedChildIds = new Set(wheelSource?.include_children_ring_ids || []);
        const sourceList = byId("yearWheelFormFields").querySelector("[data-wheel-sync-rings]");
        const updateSourceList = () => {
            sourceList.innerHTML = renderWheelSourceSelection(sourceWheelInput.value,
                [...selectedSourceIds], [...includedChildIds], nameInput.value, wheel.id || "");
        };
        wheelSyncInput.addEventListener("change", () => {
            byId("yearWheelFormFields").querySelector("[data-wheel-sync-settings]").hidden = !wheelSyncInput.checked;
        });
        sourceWheelInput.addEventListener("change", () => {
            selectedSourceIds = new Set();
            includedChildIds = new Set();
            updateSourceList();
        });
        sourceList.addEventListener("change", event => {
            const checkbox = event.target.closest?.('input[type="checkbox"]');
            if (!checkbox || checkbox.disabled) return;
            const selection = checkbox.name === "source_ring_ids" ? selectedSourceIds : includedChildIds;
            if (checkbox.checked) selection.add(checkbox.value);
            else selection.delete(checkbox.value);
            if (checkbox.name === "source_ring_ids" && !checkbox.checked) includedChildIds.delete(checkbox.value);
            const { name, value } = checkbox;
            updateSourceList();
            [...sourceList.querySelectorAll('input[type="checkbox"]')]
                .find(input => input.name === name && input.value === value)?.focus();
        });
        nameInput.addEventListener("input", updateSourceList);
        byId("yearWheelFormFields").querySelector("[data-wheel-sync-settings]").addEventListener("change", () => {
            byId("yearWheelFormFields").querySelector('[name="wheel_sync_action"]').value = "";
        });
        let syncSettingTouched = Boolean(ring);
        let planningSyncSettingTouched = Boolean(ring);
        syncMeetingsInput.addEventListener("change", () => {
            planningSyncSettingTouched = true;
            planningSyncSettings.hidden = !syncMeetingsInput.checked;
        });
        syncDepartmentInput.addEventListener("change", () => {
            const excluded = new Set(JSON.parse(excludedPlanningInput.value || "[]"));
            planningSyncPlans.innerHTML = syncDepartmentInput.value
                ? renderPlanningSyncSelection(syncDepartmentInput.value, excluded)
                : `<p class="year-wheel-dialog-help">Välj en avdelning för att se dess planeringar.</p>`;
        });
        planningSyncPlans.addEventListener("change", event => {
            const checkbox = event.target.closest?.('input[name="included_planning_ids"]');
            if (!checkbox) return;
            const excluded = new Set(JSON.parse(excludedPlanningInput.value || "[]"));
            if (checkbox.checked) excluded.delete(checkbox.value);
            else excluded.add(checkbox.value);
            excludedPlanningInput.value = JSON.stringify([...excluded]);
        });
        syncArrangementsInput.addEventListener("change", () => {
            syncSettingTouched = true;
        });
        syncArrangementsInput.addEventListener("change", () => {
            if (syncArrangementsInput.checked || !linkedEvents.length) {
                if (syncAction) syncAction.value = "";
                return;
            }
            const popup = byId("yearWheelArrangementSyncModal");
            byId("yearWheelArrangementSyncTitle").textContent = "Stänga av arrangemangssynkning?";
            byId("yearWheelArrangementSyncMessage").textContent =
                `Det finns ${linkedEvents.length} ${linkedEvents.length === 1 ? "synkad händelse" : "synkade händelser"} i den här ringen. Välj vad som ska hända när synkningen stängs av.`;
            byId("keepYearWheelArrangementEventsBtn").textContent = "Behåll som vanliga händelser";
            byId("deleteYearWheelArrangementEventsBtn").textContent = "Ta bort synkade händelser";
            syncChoiceHandlers = {
                choose(action) {
                    if (syncAction) syncAction.value = action;
                    popup.classList.add("hidden");
                    syncChoiceHandlers = null;
                    syncArrangementsInput.focus();
                },
                cancel() {
                    syncArrangementsInput.checked = true;
                    if (syncAction) syncAction.value = "";
                    popup.classList.add("hidden");
                    syncChoiceHandlers = null;
                    syncArrangementsInput.focus();
                }
            };
            popup.classList.remove("hidden");
            byId("keepYearWheelArrangementEventsBtn").focus();
        });
        const updateDepartmentColor = () => {
            if (!ring && !syncSettingTouched) {
                syncArrangementsInput.checked = nameInput.value.trim().toLocaleLowerCase("sv") === "arrangemang";
            }
            if (!ring && !planningSyncSettingTouched) {
                const department = nameInput.value.trim();
                const isDepartment = PLANNING_DEPARTMENTS.includes(department);
                syncMeetingsInput.checked = isDepartment;
                syncDepartmentInput.value = isDepartment ? department : "";
                planningSyncSettings.hidden = !isDepartment;
            }
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
        defaultRingInput?.addEventListener("change", () => {
            const preset = createDefaultRing(defaultRingInput.value);
            if (!preset) {
                nameInput.value = "";
                colorInput.value = COLORS[wheel.rings.length % COLORS.length];
                colorVariant.value = "custom";
                syncMeetingsInput.checked = false;
                syncDepartmentInput.value = "";
                planningSyncSettings.hidden = true;
            } else {
                nameInput.value = preset.name;
                colorInput.value = preset.color;
                colorVariant.value = preset.color_variant;
                syncDepartmentInput.value = preset.sync_meetings_department;
                syncMeetingsInput.checked = preset.sync_meetings_from_department;
                syncArrangementsInput.checked = preset.sync_arrangements;
            }
            updateDepartmentColor();
        });
        nameInput.addEventListener("input", updateDepartmentColor);
        colorVariant?.addEventListener("change", updateDepartmentColor);
    }

    function recurrenceForm(rule, date) {
        const anchor = new Date(`${date}T12:00:00Z`);
        const day = rule?.day || anchor.getUTCDate();
        const month = rule?.month || anchor.getUTCMonth() + 1;
        const weekday = rule?.weekday || (anchor.getUTCDay() + 6) % 7 + 1;
        const thursday = new Date(anchor);
        thursday.setUTCDate(anchor.getUTCDate() + 4 - (anchor.getUTCDay() + 6) % 7 - 1);
        const yearStart = new Date(`${thursday.getUTCFullYear()}-01-01T12:00:00Z`);
        const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
        const weekdays = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
        const options = [
            ["yearly_date", "Varje år – datum"], ["yearly_weekday", "Varje år – veckodag i månad"],
            ["yearly_week", "Varje år – veckonummer"], ["monthly_date", "Varje månad – datum"],
            ["monthly_weekday", "Varje månad – veckodag"], ["weekly", "Varje vecka"]
        ];
        return `<fieldset><legend>Upprepning</legend>
            <label class="modal-field"><span>Upprepas</span><select name="recurrence_type">${options.map(([value, label]) =>
                `<option value="${value}" ${value === (rule?.type || "") ? "selected" : ""}>${label}</option>`).join("")}</select></label>
            <div class="year-wheel-form-grid">
                <label class="modal-field" data-recurrence-field="month"><span>Månad</span><select name="recurrence_month">${MONTHS.map((label, index) =>
                    `<option value="${index + 1}" ${index + 1 === month ? "selected" : ""}>${label}</option>`).join("")}</select></label>
                <label class="modal-field" data-recurrence-field="day"><span>Dag i månaden</span><input name="recurrence_day" type="number" min="1" max="31" required value="${day}"></label>
                <label class="modal-field" data-recurrence-field="ordinal"><span>Vilken i månaden?</span><select name="recurrence_ordinal">${["Första", "Andra", "Tredje", "Fjärde", "Femte"].map((label, index) =>
                    `<option value="${index + 1}" ${index + 1 === (rule?.ordinal || 1) ? "selected" : ""}>${label}</option>`).join("")}</select></label>
                <label class="modal-field" data-recurrence-field="weekday"><span>Veckodag</span><select name="recurrence_weekday">${weekdays.map((label, index) =>
                    `<option value="${index + 1}" ${index + 1 === weekday ? "selected" : ""}>${label}</option>`).join("")}</select></label>
                <label class="modal-field" data-recurrence-field="week"><span>Vecka</span><input name="recurrence_week" type="number" min="1" max="53" required value="${rule?.week || week}"></label>
                <label class="modal-field" data-recurrence-field="until"><span>Sista tillfällets datum (valfritt)</span><input name="recurrence_until" type="date" value="${escapeHtml(rule?.until || "")}"></label>
            </div>
            <p class="year-wheel-recurrence-preview" data-recurrence-summary aria-live="polite"></p>
            <aside class="year-wheel-dialog-help" aria-label="Hjälp om upprepning">
                <strong>Så fungerar datumen</strong>
                <p>Startdatum är seriens tidigaste datum. Datumspannet bestämmer varje tillfälles längd. Datum som saknas använder månadens sista dag. Saknad femte veckodag eller vecka 53 hoppas över.</p>
            </aside>
        </fieldset>`;
    }

    function recurrenceFromValues(value, startDate) {
        if (!value.recurrence_type) return null;
        const rule = recurrence().normalizeRule({
            type: value.recurrence_type, day: Number(value.recurrence_day), month: Number(value.recurrence_month),
            weekday: Number(value.recurrence_weekday), ordinal: Number(value.recurrence_ordinal),
            week: Number(value.recurrence_week), until: value.recurrence_until || undefined
        });
        if (rule.until && rule.until < startDate) throw new Error("Upprepningens slutdatum får inte vara före seriens startdatum.");
        return rule;
    }

    function bindRecurrenceForm(startDate) {
        const fields = byId("yearWheelRecurrenceFields");
        const typeInput = fields.querySelector('[name="recurrence_type"]');
        const update = () => {
            const type = typeInput.value;
            const active = new Set(type ? ["until"] : []);
            if (["monthly_date", "yearly_date"].includes(type)) active.add("day");
            if (["yearly_date", "yearly_weekday"].includes(type)) active.add("month");
            if (type.includes("weekday")) active.add("ordinal");
            if (type.includes("weekday") || ["weekly", "yearly_week"].includes(type)) active.add("weekday");
            if (type === "yearly_week") active.add("week");
            fields.querySelectorAll("[data-recurrence-field]").forEach(label => {
                const visible = active.has(label.dataset.recurrenceField);
                label.classList.toggle("hidden", !visible);
                label.querySelector("input,select").disabled = !visible;
            });
            const values = Object.fromEntries(["type", "day", "month", "weekday", "ordinal", "week", "until"]
                .map(name => [`recurrence_${name}`, fields.querySelector(`[name="recurrence_${name}"]`).value]));
            const summary = fields.querySelector("[data-recurrence-summary]");
            try {
                summary.textContent = recurrence().describe(recurrenceFromValues(values, startDate));
            } catch (error) {
                summary.textContent = error.message;
            }
        };
        ["type", "day", "month", "weekday", "ordinal", "week", "until"].forEach(name => {
            fields.querySelector(`[name="recurrence_${name}"]`).addEventListener("change", update);
        });
        update();
    }

    function updateRecurrenceChoice() {
        const fields = byId("yearWheelFormFields");
        fields.querySelector('[name="recurring"]').checked = Boolean(recurrenceDraft);
        fields.querySelector("[data-recurrence-choice-summary]").textContent = recurrenceDraft
            ? recurrence().describe(recurrenceDraft) : "";
        fields.querySelector("[data-edit-recurrence]").classList.toggle("hidden", !recurrenceDraft);
    }

    function openRecurrenceDialog() {
        if (modalMode !== "event" || !canEdit() || editingOccurrenceDate) return;
        const startInput = byId("yearWheelFormFields").querySelector('[name="start_date"]');
        if (!isDate(startInput.value)) {
            byId("yearWheelFormMessage").textContent = "Ange ett giltigt startdatum innan du väljer upprepning.";
            byId("yearWheelFormMessage").classList.remove("hidden");
            updateRecurrenceChoice();
            startInput.focus();
            return;
        }
        const fields = byId("yearWheelRecurrenceFields");
        fields.innerHTML = recurrenceForm(recurrenceDraft || { type: "yearly_weekday" }, startInput.value);
        byId("yearWheelRecurrenceMessage").classList.add("hidden");
        bindRecurrenceForm(startInput.value);
        byId("yearWheelModal").classList.add("hidden");
        byId("yearWheelRecurrenceModal").classList.remove("hidden");
        fields.querySelector('[name="recurrence_type"]').focus();
    }

    function closeRecurrenceDialog() {
        byId("yearWheelRecurrenceModal").classList.add("hidden");
        byId("yearWheelModal").classList.remove("hidden");
        updateRecurrenceChoice();
        renderEventChecklist(false, Boolean(recurrenceDraft));
        byId("yearWheelFormFields").querySelector(recurrenceDraft ? "[data-edit-recurrence]" : '[name="recurring"]').focus();
    }

    function submitRecurrenceForm(event) {
        event.preventDefault();
        const value = Object.fromEntries(new FormData(event.currentTarget).entries());
        const startDate = byId("yearWheelFormFields").querySelector('[name="start_date"]').value;
        try {
            const rule = recurrenceFromValues(value, startDate);
            if (!rule) throw new Error("Välj en upprepningsregel.");
            recurrenceDraft = rule;
        } catch (error) {
            byId("yearWheelRecurrenceMessage").textContent = error.message;
            byId("yearWheelRecurrenceMessage").classList.remove("hidden");
            return;
        }
        closeRecurrenceDialog();
    }

    function copyChecklist(checklist) {
        return recurrence().normalizeChecklist(checklist, true)?.map(task => ({ ...task, id: id() })) ?? null;
    }

    function renderEventChecklist(readOnly, template) {
        const container = byId("yearWheelFormFields").querySelector("[data-event-checklist]");
        if (checklistDraft === null) {
            container.innerHTML = readOnly ? "" : '<button type="button" class="btn-secondary" data-add-event-checklist>Lägg till att göra-lista</button>';
            if (!readOnly) container.querySelector("[data-add-event-checklist]").addEventListener("click", () => {
                checklistDraft = [];
                renderEventChecklist(false, template);
            });
            return;
        }
        const series = currentWheel()?.events.find(item => item.id === editingId);
        const help = readOnly ? "Listan är skrivskyddad. Synkade listor ändras i källan."
            : template ? "Grundlista för serien. Varje tillfälle börjar utan avprickningar. Sparade tillfälleslistor påverkas inte av ändringar här."
                : editingOccurrenceDate ? "Listan och avprickningarna gäller bara detta tillfälle."
                    : "Listan sparas med händelsen.";
        container.innerHTML = `<details class="arrangement-checklist-overview year-wheel-checklist" aria-label="Att göra" open>
            <summary class="arrangement-section-summary"><strong>${template ? "Att göra – grundlista" : "Att göra"}</strong><span>${checklistDraft.length}</span></summary>
            <div class="arrangement-checklist-content">
            ${checklistDraft.length ? `<ul class="arrangement-checklist-list">${checklistDraft.map((task, index) => `<li class="arrangement-checklist-item${!readOnly && checklistSortingEnabled ? " year-wheel-checklist-item--editable" : ""}${task.done && !template ? " arrangement-checklist-item--done" : ""}" data-checklist-row="${index}">
                <label${readOnly ? "" : ' class="year-wheel-checklist-check"'}><input type="checkbox" data-checklist-done aria-label="Klar: ${escapeHtml(task.text)}"${task.done && !template ? " checked" : ""}${readOnly || template ? " disabled" : ""}>
                ${readOnly ? `<span>${escapeHtml(task.text)}</span>` : ""}</label>
                ${!readOnly ? `<input class="year-wheel-checklist-text" data-checklist-text aria-label="Uppgift" maxlength="160" required value="${escapeHtml(task.text)}">` : ""}
                ${readOnly ? task.responsible ? `<span class="year-wheel-checklist-responsible">${escapeHtml(task.responsible)}</span>` : "" : `<input class="year-wheel-checklist-responsible" data-checklist-responsible aria-label="Ansvarig (valfritt)" placeholder="Ansvarig" maxlength="100" value="${escapeHtml(task.responsible)}">`}
                ${!readOnly && checklistSortingEnabled ? `<span class="year-wheel-ring-order">
                    <button class="year-wheel-ring-order-button" type="button" data-checklist-move-up aria-label="Flytta ${escapeHtml(task.text)} uppåt" title="Flytta uppåt"${index === 0 ? " disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></button>
                    <button class="year-wheel-ring-order-button" type="button" data-checklist-move-down aria-label="Flytta ${escapeHtml(task.text)} nedåt" title="Flytta nedåt"${index === checklistDraft.length - 1 ? " disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg></button>
                </span>
                <span class="year-wheel-ring-drag-handle" draggable="true" data-checklist-drag-handle aria-hidden="true" title="Dra för att ändra ordning"><svg viewBox="0 0 24 24"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/></svg></span>` : ""}
                ${!readOnly ? '<button type="button" class="arrangement-checklist-remove" data-remove-checklist-task aria-label="Ta bort uppgift" title="Ta bort uppgift">&times;</button>' : ""}
            </li>`).join("")}</ul>` : '<p class="arrangement-checklist-empty">Inga uppgifter tillagda.</p>'}
            ${!readOnly ? `<div class="arrangement-checklist-add">
                <input type="text" data-new-checklist-task maxlength="160" placeholder="Ny uppgift" aria-label="Ny uppgift">
                <button type="button" class="btn-secondary" data-add-checklist-task>Lägg till</button>
            </div>
            <details class="year-wheel-checklist-settings"><summary>Inställningar för listan</summary>
                <p class="year-wheel-dialog-help">${help}</p>
                <label class="year-wheel-arrangement-sync"><input type="checkbox" data-checklist-enable-sorting${checklistSortingEnabled ? " checked" : ""}> Aktivera sortering</label>
                <div class="year-wheel-checklist-actions">
                ${editingOccurrenceDate && series?.checklist !== null ? '<button type="button" class="btn-secondary" data-reset-checklist>Hämta senaste grundlistan</button>' : ""}
                <button type="button" class="btn-secondary" data-remove-event-checklist>Ta bort att göra-listan</button>
                </div>
            </details>` : ""}
            </div>
        </details>`;
        if (readOnly) return;
        container.querySelector("[data-checklist-enable-sorting]").addEventListener("change", event => {
            const newTaskText = container.querySelector("[data-new-checklist-task]").value;
            checklistSortingEnabled = event.target.checked;
            renderEventChecklist(false, template);
            container.querySelector("[data-new-checklist-task]").value = newTaskText;
            container.querySelector(".year-wheel-checklist-settings").open = true;
            container.querySelector("[data-checklist-enable-sorting]").focus();
        });
        let draggedIndex = null;
        const moveTask = (from, to, focusSelector) => {
            if (!checklistSortingEnabled || from === to || to < 0 || to >= checklistDraft.length) return;
            const newTaskText = container.querySelector("[data-new-checklist-task]").value;
            const [task] = checklistDraft.splice(from, 1);
            checklistDraft.splice(to, 0, task);
            renderEventChecklist(false, template);
            container.querySelector("[data-new-checklist-task]").value = newTaskText;
            const row = container.querySelector(`[data-checklist-row="${to}"]`);
            row.querySelector(focusSelector).focus();
        };
        checklistDraft.forEach((task, index) => {
            const row = container.querySelector(`[data-checklist-row="${index}"]`);
            if (checklistSortingEnabled) {
                row.querySelector("[data-checklist-move-up]").addEventListener("click", () => {
                    moveTask(index, index - 1, index === 1 ? "[data-checklist-move-down]" : "[data-checklist-move-up]");
                });
                row.querySelector("[data-checklist-move-down]").addEventListener("click", () => {
                    moveTask(index, index + 1, index === checklistDraft.length - 2 ? "[data-checklist-move-up]" : "[data-checklist-move-down]");
                });
                const handle = row.querySelector("[data-checklist-drag-handle]");
                handle.addEventListener("dragstart", event => {
                    draggedIndex = index;
                    if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", task.id);
                    }
                });
                handle.addEventListener("dragend", () => { draggedIndex = null; });
                row.addEventListener("dragover", event => {
                    if (draggedIndex === null) return;
                    event.preventDefault();
                    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                });
                row.addEventListener("drop", event => {
                    if (draggedIndex === null) return;
                    event.preventDefault();
                    const from = draggedIndex;
                    draggedIndex = null;
                    moveTask(from, index, "[data-checklist-text]");
                });
            }
            row.querySelector("[data-checklist-done]").addEventListener("change", event => {
                task.done = !template && event.target.checked;
                row.classList.toggle("arrangement-checklist-item--done", task.done);
            });
            row.querySelector("[data-checklist-text]").addEventListener("input", event => {
                task.text = event.target.value;
            });
            row.querySelector("[data-checklist-responsible]").addEventListener("input", event => {
                task.responsible = event.target.value;
            });
            row.querySelector("[data-remove-checklist-task]").addEventListener("click", () => {
                checklistDraft.splice(index, 1);
                renderEventChecklist(false, template);
            });
        });
        const newTaskInput = container.querySelector("[data-new-checklist-task]");
        const addTask = () => {
            const text = newTaskInput.value.trim();
            if (!text) {
                byId("yearWheelFormMessage").textContent = "Ange en uppgiftstext.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                newTaskInput.focus();
                return;
            }
            byId("yearWheelFormMessage").classList.add("hidden");
            checklistDraft.push({ id: id(), text, responsible: "", done: false });
            renderEventChecklist(false, template);
            container.querySelector("[data-new-checklist-task]").focus();
        };
        container.querySelector("[data-add-checklist-task]").addEventListener("click", addTask);
        newTaskInput.addEventListener("keydown", event => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            addTask();
        });
        container.querySelector("[data-remove-event-checklist]").addEventListener("click", () => {
            if (!window.confirm("Ta bort att göra-listan här? Sparade listor för andra tillfällen behålls.")) return;
            checklistDraft = null;
            renderEventChecklist(false, template);
        });
        if (editingOccurrenceDate && series?.checklist !== null) {
            container.querySelector("[data-reset-checklist]").addEventListener("click", () => {
                if (!window.confirm("Ersätt tillfällets lista med senaste grundlistan? Egna ändringar och avprickningar tas bort när du sparar.")) return;
                checklistDraft = recurrence().normalizeChecklist(series.checklist, true);
                renderEventChecklist(false, false);
            });
        }
    }

    function restoreOccurrence(seriesId, date) {
        const wheel = currentWheel();
        const series = wheel?.events.find(item => item.id === seriesId);
        if (!canEdit() || !series?.recurrence || series.source_wheel_id) return;
        if (!window.confirm("Återställ tillfället till seriens mönster? Att göra-listan behålls.")) return;
        const exceptions = { ...series.exceptions };
        delete exceptions[date];
        const updated = normalizeWheel({ ...wheel, events: wheel.events.map(item =>
            item.id === seriesId ? { ...item, exceptions } : item) });
        wheels = wheels.map(item => item.id === wheel.id ? updated : item);
        render();
        saveWheel(updated);
        openEventForm(seriesId);
    }

    function closeEditScopeDialog() {
        byId("yearWheelEditScopeModal").classList.add("hidden");
        const trigger = pendingEditScope?.trigger;
        pendingEditScope = null;
        trigger?.focus?.();
    }

    function chooseEditScope(wholeSeries) {
        const choice = pendingEditScope;
        closeEditScopeDialog();
        if (!choice || currentWheel()?.id !== choice.wheelId || !canEdit()) return;
        const series = currentWheel().events.find(item => item.id === choice.seriesId);
        if (!series?.recurrence || series.source_wheel_id) return;
        openEventForm(choice.seriesId, "", "", choice.date, wholeSeries);
    }

    function openEventForm(eventId = "", initialDate = "", initialRingId = "", originalDate = "", wholeSeries = false) {
        const wheel = currentWheel();
        if (!wheel) return;
        const separator = eventId.lastIndexOf("@");
        const seriesId = separator >= 0 ? eventId.slice(0, separator) : eventId;
        const series = wheel.events.find(item => item.id === seriesId);
        const occurrenceDate = originalDate || (separator >= 0 ? eventId.slice(separator + 1) : "");
        const singleOccurrence = Boolean(series?.recurrence && occurrenceDate && !wholeSeries);
        const event = singleOccurrence ? recurrence().occurrence(series, occurrenceDate, true) : series;
        if (series && !event) return;
        const readOnly = !canEdit() || Boolean(event?.source_wheel_id);
        if ((!readOnly && !wheel.rings.length) || (readOnly && !event)) return;
        if (singleOccurrence && !readOnly && !originalDate) {
            const trigger = document.activeElement;
            closeModal();
            pendingEditScope = { wheelId: wheel.id, seriesId, date: occurrenceDate, trigger };
            byId("yearWheelEditScopeDescription").textContent = `${event.title} · ${formatDate(event.start_date, { day: "numeric", month: "long", year: "numeric" })}`;
            byId("yearWheelEditScopeModal").classList.remove("hidden");
            byId("yearWheelEditOccurrenceBtn").focus();
            return;
        }
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
        const linkedSource = linkedArrangement || Boolean(event?.source_planning_id || event?.source_wheel_id);
        recurrenceDraft = event?.recurrence || null;
        checklistDraft = recurrence().normalizeChecklist(event?.checklist);
        checklistSortingEnabled = false;
        openModal(readOnly ? "Visa händelse" : series?.recurrence
            ? singleOccurrence ? "Redigera tillfälle" : "Redigera serie"
            : event ? "Redigera händelse" : "Lägg till händelse", `
            ${series?.recurrence ? `<p class="year-wheel-recurrence-preview">${escapeHtml(recurrence().describe(series.recurrence))}. Gäller från ${escapeHtml(series.start_date)}.</p>
            ` : ""}
            ${event?.source_wheel_id ? `<p class="year-wheel-dialog-help">Hämtad från ${escapeHtml(event.source_wheel_name)} → ${escapeHtml(event.source_wheel_ring_name)}. Händelsen ändras i källårshjulet.${!isSharedWheelView() ? ` <a href="arshjul.html?wheel=${encodeURIComponent(event.source_wheel_id)}">Öppna i källårshjulet</a>` : ""}</p>` : ""}
            ${linkedArrangement ? `<p id="yearWheelLinkedArrangementNote" class="year-wheel-dialog-help">${escapeHtml(linkedArrangementNote)}</p>` : ""}
            <label class="modal-field"><span>Rubrik</span><input name="title" required maxlength="120" value="${escapeHtml(event?.title || "")}" placeholder="Till exempel Kårstämma" ${linkedArrangementAttributes}></label>
            <div class="year-wheel-ring-color-grid">
                <label class="modal-field"><span>Ring</span><select ${linkedArrangement ? "" : 'name="ring_id"'} required ${linkedArrangementRingAttributes}>${wheel.rings.map(ring => {
                    const parent = wheel.rings.find(item => item.id === ring.parent_id);
                    const label = parent ? `${parent.name} · ${ring.name}` : ring.name;
                    return `<option value="${escapeHtml(ring.id)}" ${ring.id === chosenRing ? "selected" : ""}>${escapeHtml(label)}</option>`;
                }).join("")}</select>${linkedArrangement ? `<input type="hidden" name="ring_id" value="${escapeHtml(chosenRing)}">` : ""}</label>
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
            ${singleOccurrence && event.start_date !== occurrenceDate ? `<p class="year-wheel-dialog-help">Flyttad från ${escapeHtml(formatDate(occurrenceDate, { day: "numeric", month: "long", year: "numeric" }))}.</p>` : ""}
            ${singleOccurrence && event.cancelled ? `<p class="detail-note-warning" role="status">Tillfället är inställt.</p>` : ""}
            ${singleOccurrence && event.is_exception && !readOnly ? `<button type="button" class="btn-secondary" data-restore-occurrence="${escapeHtml(occurrenceDate)}">Återställ till seriens mönster</button>` : ""}
            <div class="year-wheel-form-grid">
                <label class="modal-field"><span>Ansvarig (valfritt)</span><input name="responsible" maxlength="100" value="${escapeHtml(event?.responsible || "")}" ${sourceFieldAttributes("responsible")}></label>
                <label class="modal-field"><span>Plats (valfritt)</span><input name="location" maxlength="120" value="${escapeHtml(event?.location || "")}" ${sourceFieldAttributes("location")}></label>
            </div>
            <label class="modal-field"><span>Anteckningar</span><textarea name="notes" rows="3" maxlength="2000" ${sourceFieldAttributes("notes")}>${escapeHtml(event?.notes || "")}</textarea></label>
            <div data-event-checklist></div>
            ${!singleOccurrence && !linkedSource && !readOnly ? `
                <label class="year-wheel-recurrence-choice"><input name="recurring" type="checkbox" ${recurrenceDraft ? "checked" : ""}> Återkommande</label>
                <div class="year-wheel-recurrence-summary">
                    <span data-recurrence-choice-summary></span>
                    <button class="btn-secondary" type="button" data-edit-recurrence>Ändra regel</button>
                </div>` : ""}
            ${series?.recurrence && !singleOccurrence ? `<details><summary>Undantag (${Object.keys(series.exceptions || {}).length})</summary>
                ${Object.entries(series.exceptions || {}).sort(([left], [right]) => left.localeCompare(right)).map(([original, override]) =>
                    `<p>${escapeHtml(original)}: ${override.cancelled ? "Inställt" : `Ändrat tillfälle${override.start_date ? ` → ${escapeHtml(override.start_date)}` : ""}`}
                        ${!readOnly ? `<button class="btn-secondary" type="button" data-restore-occurrence="${escapeHtml(original)}">Återställ</button>` : ""}</p>`).join("")}
                </details>` : ""}
        `, readOnly ? "event-view" : "event", seriesId);
        editingOccurrenceDate = singleOccurrence ? occurrenceDate : "";
        renderEventChecklist(readOnly || linkedSource, Boolean(series?.recurrence && !singleOccurrence));
        byId("copyYearWheelEventBtn").classList.toggle("hidden", readOnly || !event || Boolean(event.recurrence));
        const deleteButton = byId("deleteYearWheelItemBtn");
        const deleteLabel = singleOccurrence ? "Ställ in tillfället" : series?.recurrence ? "Ta bort hela serien" : "Ta bort";
        if (singleOccurrence) deleteButton.textContent = deleteLabel;
        deleteButton.classList.toggle("year-wheel-delete-button--text", singleOccurrence);
        deleteButton.setAttribute("aria-label", deleteLabel);
        deleteButton.setAttribute("title", deleteLabel);
        if (!readOnly && singleOccurrence) {
            for (const name of ["ring_id", "color_variant", "color"]) {
                byId("yearWheelFormFields").querySelector(`[name="${name}"]`).disabled = true;
            }
        }
        if (!readOnly) {
            byId("yearWheelFormFields").querySelectorAll("[data-restore-occurrence]").forEach(button => {
                button.addEventListener("click", () => restoreOccurrence(seriesId, button.dataset.restoreOccurrence));
            });
            if (!singleOccurrence && !linkedSource) {
                const fields = byId("yearWheelFormFields");
                updateRecurrenceChoice();
                fields.querySelector('[name="recurring"]').addEventListener("change", change => {
                    if (change.target.checked) openRecurrenceDialog();
                    else {
                        recurrenceDraft = null;
                        updateRecurrenceChoice();
                        renderEventChecklist(false, false);
                    }
                });
                fields.querySelector("[data-edit-recurrence]").addEventListener("click", openRecurrenceDialog);
            }
        }
        if (readOnly) {
            byId("yearWheelFormFields").querySelectorAll("input, select, textarea").forEach(control => {
                if ((control.tagName === "INPUT" && control.type !== "color") || control.tagName === "TEXTAREA") {
                    control.readOnly = true;
                } else {
                    control.disabled = true;
                }
            });
        }
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
            colorInput.disabled = readOnly || singleOccurrence || colorVariantInput.value !== "custom";
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
        const withArrangements = syncArrangementEvents(wheel, window.GTScoutArrangements?.getAll?.() || []) || wheel;
        const updated = syncPlanningMeetingEvents(withArrangements, planningGroups) || withArrangements;
        const before = wheels;
        const incoming = wheels.some(item => item.id === wheel.id)
            ? wheels.map(item => item.id === wheel.id ? updated : item) : [...wheels, updated];
        persistWheelSources(incoming, new Set([updated.id]), before);
    }

    function persistWheelSources(incoming, changedIds = new Set(), before = incoming) {
        const updated = isSharedWheelView() ? incoming : syncWheelSources(incoming);
        const changes = updated.filter(wheel => changedIds.has(wheel.id)
            || wheel !== before.find(item => item.id === wheel.id));
        wheels = updated;
        render();
        if (canWrite()) changes.forEach(wheel => window.GTScoutYearWheelSync?.saveWheel(wheel));
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
        persistWheelSources(wheels, new Set(updates.map(wheel => wheel.id)));
    }

    function syncPlanningIntoWheels(groups) {
        planningGroups = Array.isArray(groups) ? groups.filter(group => group && typeof group === "object") : [];
        if (!wheels.length) return;
        const updates = [];
        wheels = wheels.map(wheel => {
            const updated = syncPlanningMeetingEvents(wheel, planningGroups);
            if (updated) {
                updates.push(updated);
                return updated;
            }
            return wheel;
        });
        if (modalMode === "ring") {
            const departmentInput = byId("yearWheelFormFields").querySelector('[name="sync_meetings_department"]');
            const planList = byId("yearWheelFormFields").querySelector("[data-meeting-sync-plans]");
            if (departmentInput && planList) {
                const excluded = new Set(JSON.parse(byId("yearWheelFormFields").querySelector('[name="sync_excluded_planning_ids"]').value || "[]"));
                planList.innerHTML = departmentInput.value
                    ? renderPlanningSyncSelection(departmentInput.value, excluded)
                    : `<p class="year-wheel-dialog-help">Välj en avdelning för att se dess planeringar.</p>`;
            }
        }
        persistWheelSources(wheels, new Set(updates.map(wheel => wheel.id)));
    }

    async function submitForm(event) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const value = Object.fromEntries(formData.entries());
        if (modalMode === "default-wheel") {
            if (!auth()?.isAdmin?.()) return;
            const selectedId = String(value.default_wheel_id || "");
            const result = await window.GTScoutYearWheelSync?.setDefaultWheel?.(selectedId);
            if (!result?.saved) {
                byId("yearWheelFormMessage").textContent = result?.error?.message || "Kunde inte spara standardårshjulet.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            selectedWheelId = selectedId || wheels[0]?.id || "";
            closeModal();
            render();
            return;
        }
        if (modalMode === "print") {
            const wheel = currentWheel();
            if (!wheel) return;
            const rings = getDisplayedRings(wheel, selectedRingIds);
            const eventColors = Object.fromEntries(recurrence().expand(wheel.events, period()).map(item => [
                item.id, getEventColor(item, wheel.rings.find(ring => ring.id === item.ring_id))
            ]));
            const eventTextColors = Object.fromEntries(Object.entries(eventColors).map(([eventId, color]) => [eventId, getRingTextColor(color)]));
            const ringBackgroundColors = Object.fromEntries(rings.map(ring => [ring.id, getRingBackgroundColor(ring)]));
            window.GTScoutYearWheelPrint.openDocument({
                wheel, rings, range: period(), mode: value.print_layout, eventColors, eventTextColors,
                ringBackgroundColors, qrUrl: getYearWheelShareUrl(wheel)
            });
            closeModal();
            return;
        }
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
                    ...detachWheelEvent(item),
                    id: id(),
                    start_date: startDate,
                    end_date: endDate,
                    copied_from_id: item.id,
                    needs_review: true,
                    source_arrangement_id: "",
                    source_arrangement_fields: {},
                    checklist: copyChecklist(item.checklist),
                    occurrence_checklists: {}
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
            const rings = wheelDraft?.rings || wheel.rings;
            const name = String(value.name || "").trim();
            if (!name) {
                byId("yearWheelFormMessage").textContent = "Ange ett namn på årshjulet.";
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
                rings,
                events: wheelDraft?.events || wheel.events
            });
            wheels = wheels.map(item => item.id === wheel.id ? updated : item);
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
            const rings = wheelDraft?.rings || [];
            if (!name || !Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
                byId("yearWheelFormMessage").textContent = !name
                    ? "Ange ett namn på årshjulet."
                    : "Välj en giltig startmånad för verksamhetsåret.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const created = normalizeWheel({
                id: id(),
                name,
                start_month: startMonth,
                rings,
                events: [],
                schema_version: 5,
                local_kar_id: auth()?.getState?.().karId || null,
                created_by: auth()?.getUser?.()?.id || null
            });
            wheels = [...wheels, created];
            selectedWheelId = created.id;
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
            const parentId = String(value.parent_id || "");
            if (parentId && !targetWheel.rings.some(item => item.id === parentId && !item.parent_id)) {
                byId("yearWheelFormMessage").textContent = "Underringar kan bara ligga direkt under en ring.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            if (parentId && parentId === editingId) {
                byId("yearWheelFormMessage").textContent = "En ring kan inte vara sin egen förälder.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const rings = [...targetWheel.rings];
            const index = rings.findIndex(ring => ring.id === editingId);
            const palette = DEPARTMENT_RING_COLORS[name];
            const variant = palette ? String(value.color_variant || "standard") : "custom";
            const ring = {
                id: editingId || id(),
                name,
                color: palette && variant !== "custom" ? palette[variant] : value.color,
                color_variant: variant,
                parent_id: parentId,
                children_display: value.children_display === "individual" ? "individual" : "grouped",
                sync_arrangements: value.sync_arrangements === "on",
                sync_from_wheel: value.sync_from_wheel_enabled === "on" ? {
                    wheel_id: String(value.source_wheel_id || ""),
                    ring_ids: [...new Set(formData.getAll("source_ring_ids").map(String))],
                    include_children_ring_ids: [...new Set(formData.getAll("source_child_ring_ids").map(String))]
                        .filter(ringId => formData.getAll("source_ring_ids").map(String).includes(ringId)
                            && wheels.find(item => item.id === String(value.source_wheel_id || ""))?.rings
                                .some(item => item.id === ringId && !item.parent_id))
                } : null,
                sync_meetings_from_department: value.sync_meetings_from_department === "on",
                sync_meetings_department: PLANNING_DEPARTMENTS.includes(String(value.sync_meetings_department || ""))
                    ? String(value.sync_meetings_department)
                    : "",
                sync_excluded_planning_ids: (() => {
                    try {
                        const excluded = JSON.parse(String(value.sync_excluded_planning_ids || "[]"));
                        return Array.isArray(excluded) ? [...new Set(excluded.map(String).filter(Boolean))] : [];
                    } catch {
                        return [];
                    }
                })()
            };
            if (ring.sync_meetings_from_department && !ring.sync_meetings_department) {
                byId("yearWheelFormMessage").textContent = "Välj en avdelning för att synka möten.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const sourceError = getWheelSourceError({
                ...targetWheel, local_kar_id: targetWheel.local_kar_id || auth()?.getState?.().karId || null
            }, ring.sync_from_wheel, wheels);
            if (sourceError) {
                byId("yearWheelFormMessage").textContent = sourceError;
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const sourceWheel = wheels.find(item => item.id === ring.sync_from_wheel?.wheel_id);
            const sourceRings = sourceWheel ? getWheelSourceRings(sourceWheel, ring.sync_from_wheel) : new Set();
            const staleWheelEvents = targetWheel.events.filter(item => item.ring_id === editingId && item.source_wheel_id
                && (!ring.sync_from_wheel || item.source_wheel_id !== sourceWheel?.id
                    || !sourceRings.has(item.source_wheel_ring_id)));
            const wheelSyncAction = String(value.wheel_sync_action || "");
            if (staleWheelEvents.length && !["keep", "delete"].includes(wheelSyncAction)) {
                const popup = byId("yearWheelArrangementSyncModal");
                byId("yearWheelArrangementSyncTitle").textContent = "Ändra synkning från årshjul?";
                byId("yearWheelArrangementSyncMessage").textContent =
                    staleWheelEvents.length === 1
                        ? "1 hämtad händelse omfattas inte längre av urvalet. Välj om den ska behållas eller tas bort."
                        : `${staleWheelEvents.length} hämtade händelser omfattas inte längre av urvalet. Välj om de ska behållas eller tas bort.`;
                byId("keepYearWheelArrangementEventsBtn").textContent = "Behåll som vanliga händelser";
                byId("deleteYearWheelArrangementEventsBtn").textContent = "Ta bort synkade händelser";
                syncChoiceHandlers = {
                    choose(action) {
                        byId("yearWheelFormFields").querySelector('[name="wheel_sync_action"]').value = action;
                        popup.classList.add("hidden");
                        syncChoiceHandlers = null;
                        byId("yearWheelForm").requestSubmit();
                    },
                    cancel() {
                        popup.classList.add("hidden");
                        syncChoiceHandlers = null;
                        byId("yearWheelFormFields").querySelector('[name="wheel_sync_action"]').value = "";
                    }
                };
                popup.classList.remove("hidden");
                byId("keepYearWheelArrangementEventsBtn").focus();
                return;
            }
            const linkedMeetingEvents = index < 0 ? [] : targetWheel.events.filter(event =>
                event.ring_id === editingId && event.source_planning_id
            );
            const excludedPlanIds = new Set(ring.sync_excluded_planning_ids);
            const staleMeetingEvents = linkedMeetingEvents.filter(event => !ring.sync_meetings_from_department
                || event.source_planning_id && (ring.sync_meetings_department !== targetWheel.rings[index].sync_meetings_department
                    || excludedPlanIds.has(event.source_planning_id)));
            const planningSyncAction = String(value.planning_sync_action || "");
            if (staleMeetingEvents.length && !["keep", "delete"].includes(planningSyncAction)) {
                const popup = byId("yearWheelArrangementSyncModal");
                byId("yearWheelArrangementSyncTitle").textContent = "Planeringens möten synkas inte längre";
                const isSingleMeeting = staleMeetingEvents.length === 1;
                byId("yearWheelArrangementSyncMessage").textContent = isSingleMeeting
                    ? "Det synkade mötet kommer inte längre att uppdateras från planeringen. Välj om du vill behålla det i årshjulet eller ta bort det."
                    : `${staleMeetingEvents.length} synkade möten kommer inte längre att uppdateras från planeringen. Välj om du vill behålla dem i årshjulet eller ta bort dem.`;
                byId("keepYearWheelArrangementEventsBtn").textContent = isSingleMeeting
                    ? "Behåll mötet som vanlig händelse"
                    : "Behåll möten som vanliga händelser";
                byId("deleteYearWheelArrangementEventsBtn").textContent = isSingleMeeting
                    ? "Ta bort mötet från årshjulet"
                    : "Ta bort möten från årshjulet";
                syncChoiceHandlers = {
                    choose(action) {
                        byId("yearWheelFormFields").querySelector('[name="planning_sync_action"]').value = action;
                        popup.classList.add("hidden");
                        syncChoiceHandlers = null;
                        byId("yearWheelForm").requestSubmit();
                    },
                    cancel() {
                        popup.classList.add("hidden");
                        syncChoiceHandlers = null;
                        byId("yearWheelFormFields").querySelector('[name="planning_sync_action"]').value = "";
                    }
                };
                popup.classList.remove("hidden");
                byId("keepYearWheelArrangementEventsBtn").focus();
                return;
            }
            const linkedEvents = index < 0 ? [] : targetWheel.events.filter(event =>
                event.ring_id === editingId && event.source_arrangement_id
            );
            const staleWheelIds = new Set(staleWheelEvents.map(item => item.id));
            let events = wheelSyncAction === "delete"
                ? targetWheel.events.filter(item => !staleWheelIds.has(item.id))
                : targetWheel.events.map(item => staleWheelIds.has(item.id) ? detachWheelEvent(item) : item);
            if (staleMeetingEvents.length) {
                events = planningSyncAction === "delete"
                    ? events.filter(event => !staleMeetingEvents.some(stale => stale.id === event.id))
                    : events.map(event => staleMeetingEvents.some(stale => stale.id === event.id)
                        ? { ...event, source_planning_id: "", source_meeting_id: "", source_planning_fields: {} }
                        : event);
            }
            if (index >= 0 && targetWheel.rings[index].sync_arrangements && !ring.sync_arrangements && linkedEvents.length) {
                if (!["keep", "delete"].includes(value.arrangement_sync_action)) {
                    byId("yearWheelFormMessage").textContent = "Välj om de synkade händelserna ska behållas eller tas bort.";
                    byId("yearWheelFormMessage").classList.remove("hidden");
                    return;
                }
                events = value.arrangement_sync_action === "delete"
                    ? events.filter(event => !linkedEvents.some(linked => linked.id === event.id))
                    : events.map(event => linkedEvents.some(linked => linked.id === event.id)
                        ? { ...event, source_arrangement_id: "", source_arrangement_fields: {} }
                        : event);
            }
            if (wheelDraft) {
                if (index < 0) {
                    rings.push(ring);
                } else rings[index] = ring;
                wheelDraft.rings = rings;
                wheelDraft.events = events;
                renderWheelDraft();
                return;
            }
            if (index < 0) {
                rings.push(ring);
                selectedRingIds.add(ring.id);
            } else rings[index] = ring;
            const updated = normalizeWheel({ ...wheel, rings, events });
            wheels = wheels.map(item => item.id === wheel.id ? updated : item);
            closeModal();
            render();
            saveWheel(updated);
            return;
        }
        if (!wheel || !canEdit()) return;
        if (modalMode === "event") {
            if (wheel.events.find(item => item.id === editingId)?.source_wheel_id) {
                byId("yearWheelFormMessage").textContent = "Händelsen ändras i källårshjulet.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            let checklist;
            try {
                checklist = recurrence().normalizeChecklist(checklistDraft, Boolean(recurrenceDraft && !editingOccurrenceDate));
            } catch (error) {
                byId("yearWheelFormMessage").textContent = `${error.message} Ange en uppgiftstext eller ta bort den tomma uppgiften.`;
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const startDate = String(value.start_date || "");
            const endDate = String(value.end_date || "");
            if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) {
                byId("yearWheelFormMessage").textContent = "Slutdatum måste vara samma dag eller efter startdatum.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            const previousEvent = wheel.events.find(item => item.id === editingId);
            if (editingOccurrenceDate && previousEvent?.recurrence) {
                const base = recurrence().occurrence({ ...previousEvent, exceptions: {} }, editingOccurrenceDate);
                if (!base) {
                    byId("yearWheelFormMessage").textContent = "Tillfället finns inte längre i serien. Öppna händelsen igen.";
                    byId("yearWheelFormMessage").classList.remove("hidden");
                    return;
                }
                const override = {};
                if (startDate !== base.start_date || endDate !== base.end_date) {
                    override.start_date = startDate;
                    override.end_date = endDate;
                }
                for (const name of ["title", "responsible", "location", "notes"]) {
                    const text = normalizeText(value[name], { title: 120, responsible: 100, location: 120, notes: 2000 }[name]);
                    if (name === "title" && !text) {
                        byId("yearWheelFormMessage").textContent = "Ange en rubrik.";
                        byId("yearWheelFormMessage").classList.remove("hidden");
                        return;
                    }
                    if (text !== base[name]) override[name] = text;
                }
                const exceptions = { ...previousEvent.exceptions };
                if (Object.keys(override).length) exceptions[editingOccurrenceDate] = override;
                else delete exceptions[editingOccurrenceDate];
                const updated = normalizeWheel({ ...wheel, events: wheel.events.map(item =>
                    item.id === editingId ? {
                        ...item, exceptions,
                        occurrence_checklists: {
                            ...item.occurrence_checklists,
                            ...(checklistDraft !== null || item.checklist !== null
                                || Object.hasOwn(item.occurrence_checklists, editingOccurrenceDate)
                                ? { [editingOccurrenceDate]: checklist } : {})
                        }
                    } : item) });
                showEventInCurrentPeriod({ start_date: startDate, end_date: endDate });
                wheels = wheels.map(item => item.id === wheel.id ? updated : item);
                closeModal();
                render();
                saveWheel(updated);
                return;
            }
            let rule;
            try {
                rule = previousEvent?.source_arrangement_id || previousEvent?.source_planning_id
                    ? null : recurrence().normalizeRule(recurrenceDraft);
                if (rule?.until && rule.until < startDate) throw new Error("Upprepningens slutdatum får inte vara före seriens startdatum.");
            } catch (error) {
                byId("yearWheelFormMessage").textContent = error.message;
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            let exceptions = previousEvent?.exceptions || {};
            const occurrenceChecklists = previousEvent?.occurrence_checklists || {};
            const candidate = { ...previousEvent, recurrence: rule, start_date: startDate, end_date: endDate, exceptions: {} };
            if (Object.keys(occurrenceChecklists).some(date => !rule || !recurrence().occurrence(candidate, date))) {
                byId("yearWheelFormMessage").textContent = "Ändringen skulle ta bort tillfällen med sparade att göra-listor. Behåll seriens datum och regel, eller skapa en ny serie.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
            if (Object.keys(exceptions).length && (JSON.stringify(rule) !== JSON.stringify(previousEvent.recurrence)
                || startDate !== previousEvent.start_date)) {
                if (!window.confirm("Ändringen av seriens mönster eller startdatum tar bort alla undantag, även inställda tillfällen. Fortsätta?")) return;
                exceptions = {};
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
                recurrence: rule,
                exceptions: rule ? exceptions : {},
                checklist: previousEvent?.source_arrangement_id || previousEvent?.source_planning_id
                    ? previousEvent.checklist : checklist,
                occurrence_checklists: occurrenceChecklists,
                copied_from_id: wheel.events.find(item => item.id === editingId)?.copied_from_id || "",
                needs_review: false,
                source_arrangement_id: wheel.events.find(item => item.id === editingId)?.source_arrangement_id || "",
                source_arrangement_fields: wheel.events.find(item => item.id === editingId)?.source_arrangement_fields || {},
                source_planning_id: wheel.events.find(item => item.id === editingId)?.source_planning_id || "",
                source_meeting_id: wheel.events.find(item => item.id === editingId)?.source_meeting_id || "",
                source_planning_fields: wheel.events.find(item => item.id === editingId)?.source_planning_fields || {}
            };
            if (previousEvent?.source_planning_id && previousEvent.ring_id !== eventData.ring_id) {
                eventData.source_planning_id = "";
                eventData.source_meeting_id = "";
                eventData.source_planning_fields = {};
            }
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
            if (!canEdit()) return;
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
            if (wheel.rings.some(item => item.parent_id === editingId)) {
                byId("yearWheelFormMessage").textContent = "Flytta upp eller ta bort ringens underringar innan ringen tas bort.";
                byId("yearWheelFormMessage").classList.remove("hidden");
                return;
            }
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
            if (!canEdit() || wheel.events.find(item => item.id === editingId)?.source_wheel_id) return;
            if (editingOccurrenceDate) {
                if (!window.confirm("Ställ in bara detta tillfälle? Serien fortsätter som vanligt.")) return;
                const updated = normalizeWheel({ ...wheel, events: wheel.events.map(item => item.id === editingId
                    ? { ...item, exceptions: { ...item.exceptions, [editingOccurrenceDate]: { cancelled: true } } } : item) });
                wheels = wheels.map(item => item.id === wheel.id ? updated : item);
                closeModal();
                render();
                saveWheel(updated);
                return;
            }
            const series = wheel.events.find(item => item.id === editingId);
            if (!window.confirm(series?.recurrence ? "Ta bort hela serien och alla dess undantag?" : "Ta bort den här händelsen?")) return;
            const updated = normalizeWheel({ ...wheel, events: wheel.events.filter(item => item.id !== editingId) });
            wheels = wheels.map(item => item.id === wheel.id ? updated : item);
            closeModal();
            render();
            saveWheel(updated);
        }
    }

    function initialize() {
        closeEditScopeDialog();
        planningGroups = readLocalPlanningGroups();
        readViewPreferences();
        window.addEventListener("scroll", updateStickyYearWheelLock, { passive: true });
        window.addEventListener("resize", updateStickyYearWheelLock);
        const resizeObserver = window.ResizeObserver && new window.ResizeObserver(updateStickyYearWheelLock);
        [document.querySelector(".site-header"), byId("yearWheelToolbar"), byId("yearWheelEditControl")]
            .filter(Boolean).forEach(element => resizeObserver?.observe(element));
        const layoutObserver = window.MutationObserver && new window.MutationObserver(updateStickyYearWheelLock);
        [document.body, byId("yearWheelToolbar")].forEach(element => {
            layoutObserver?.observe(element, { attributes: true, attributeFilter: ["class"] });
        });
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
        byId("yearWheelEditToggle").addEventListener("click", () => {
            const wheel = currentWheel();
            if (!wheel || !canWrite()) return;
            unlockedWheelId = canEdit() ? "" : wheel.id;
            render();
        });
        byId("yearWheelMenuAddBtn").addEventListener("click", openWheelForm);
        byId("yearWheelMenuPrintBtn").addEventListener("click", openPrintForm);
        byId("yearWheelMenuSettingsBtn").addEventListener("click", openWheelSettings);
        byId("yearWheelMenuDefaultBtn").addEventListener("click", openDefaultWheelForm);
        byId("yearWheelMenuCopyEventsBtn").addEventListener("click", openBulkCopyForm);
        byId("shareYearWheelBtn").addEventListener("click", shareCurrentWheel);
        byId("rotateYearWheelShareBtn").addEventListener("click", rotateYearWheelShareToken);
        byId("copyYearWheelShareBtn").addEventListener("click", async () => {
            const urlInput = byId("yearWheelShareUrl");
            const status = byId("yearWheelShareStatus");
            try {
                await window.navigator.clipboard.writeText(urlInput.value);
                status.textContent = "Länken har kopierats.";
            } catch {
                urlInput.select?.();
                status.textContent = "Markera länken och kopiera den manuellt.";
            }
        });
        byId("closeYearWheelShareModal").addEventListener("click", () => byId("yearWheelShareModal").classList.add("hidden"));
        byId("closeYearWheelShareBtn").addEventListener("click", () => byId("yearWheelShareModal").classList.add("hidden"));
        byId("yearWheelShareModal").addEventListener("click", event => {
            if (event.target === byId("yearWheelShareModal")) byId("yearWheelShareModal").classList.add("hidden");
        });
        byId("addYearWheelEventBtn").addEventListener("click", () => openEventForm());
        byId("copyYearWheelEventBtn").addEventListener("click", () => {
            if (modalMode === "event" && editingId) copyEventToNextYear(editingId);
        });
        byId("closeYearWheelModal").addEventListener("click", closeModal);
        byId("yearWheelEditOccurrenceBtn").addEventListener("click", () => chooseEditScope(false));
        byId("yearWheelEditSeriesBtn").addEventListener("click", () => chooseEditScope(true));
        byId("closeYearWheelEditScopeModal").addEventListener("click", closeEditScopeDialog);
        byId("cancelYearWheelEditScopeBtn").addEventListener("click", closeEditScopeDialog);
        byId("yearWheelEditScopeModal").addEventListener("click", event => {
            if (event.target === byId("yearWheelEditScopeModal")) closeEditScopeDialog();
        });
        byId("yearWheelEditScopeModal").addEventListener("keydown", event => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeEditScopeDialog();
            }
        });
        byId("yearWheelRecurrenceForm").addEventListener("submit", submitRecurrenceForm);
        byId("closeYearWheelRecurrenceModal").addEventListener("click", closeRecurrenceDialog);
        byId("cancelYearWheelRecurrenceBtn").addEventListener("click", closeRecurrenceDialog);
        byId("yearWheelRecurrenceModal").addEventListener("click", event => {
            if (event.target === byId("yearWheelRecurrenceModal")) closeRecurrenceDialog();
        });
        byId("yearWheelRecurrenceModal").addEventListener("keydown", event => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeRecurrenceDialog();
            }
        });
        byId("yearWheelModal").addEventListener("click", event => {
            if (event.target === byId("yearWheelModal")) closeModal();
        });
        byId("keepYearWheelArrangementEventsBtn").addEventListener("click", () => syncChoiceHandlers?.choose("keep"));
        byId("deleteYearWheelArrangementEventsBtn").addEventListener("click", () => syncChoiceHandlers?.choose("delete"));
        byId("cancelYearWheelArrangementSyncBtn").addEventListener("click", () => syncChoiceHandlers?.cancel());
        byId("yearWheelArrangementSyncModal").addEventListener("click", event => {
            if (event.target === byId("yearWheelArrangementSyncModal")) syncChoiceHandlers?.cancel();
        });
        byId("yearWheelForm").addEventListener("submit", submitForm);
        window.addEventListener("resize", updateOverviewEventListHeight);
        byId("yearWheelFormFields").addEventListener("click", event => {
            if (event.target.closest("[data-ring-drag-handle]")) {
                event.preventDefault();
                return;
            }
            const button = event.target.closest("[data-config-ring-action]");
            if (!button || button.disabled || modalMode !== "wheel" || !wheelDraft || !canEdit()) return;
            captureWheelDraft();
            const action = button.dataset.configRingAction;
            if (action === "move-up" || action === "move-down") {
                const index = wheelDraft.rings.findIndex(ring => ring.id === button.dataset.ringId);
                if (index < 0) return;
                const ring = wheelDraft.rings[index];
                const siblings = wheelDraft.rings.filter(item => (item.parent_id || "") === (ring.parent_id || ""));
                const siblingIndex = siblings.findIndex(item => item.id === ring.id);
                const nextSibling = siblings[siblingIndex + (action === "move-up" ? -1 : 1)];
                const nextIndex = wheelDraft.rings.findIndex(item => item.id === nextSibling?.id);
                if (nextIndex < 0) return;
                [wheelDraft.rings[index], wheelDraft.rings[nextIndex]] = [wheelDraft.rings[nextIndex], wheelDraft.rings[index]];
                renderWheelDraft();
                return;
            }
            if (action === "add-child") {
                openRingForm("", button.dataset.parentId);
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
            if (sourceIndex >= 0 && targetIndex >= 0
                && wheelDraft.rings[sourceIndex].parent_id === wheelDraft.rings[targetIndex].parent_id) {
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
            let migrated;
            try {
                migrated = (incoming || []).map(input => {
                    let candidate = input;
                    let changed = false;
                    if (Number(candidate?.schema_version) < 3) {
                        const existingRings = Array.isArray(candidate?.rings) ? candidate.rings : [];
                        const migratedRings = existingRings.map(ring => {
                            const name = String(ring?.name || "").trim();
                            const palette = DEPARTMENT_RING_COLORS[name];
                            const isLegacyDefault = LEGACY_DEFAULT_RING_COLORS[name]?.toLocaleLowerCase() === String(ring?.color || "").toLocaleLowerCase();
                            if (!palette || !isLegacyDefault) return ring;
                            return { ...ring, color: palette.standard, color_variant: "standard" };
                        });
                        candidate = {
                            ...candidate,
                            schema_version: 3,
                            rings: migratedRings
                        };
                        changed = true;
                    }
                    if (Number(candidate?.schema_version) < 5) {
                        candidate = { ...candidate, schema_version: 5 };
                        changed = true;
                    }
                    return { wheel: normalizeWheel(candidate), changed };
                }).filter(entry => entry.wheel.name);
            } catch (error) {
                console.error("Kunde inte läsa årshjulets data", error);
                wheels = [];
                render();
                byId("yearWheelSourceStatus").textContent = `Kunde inte läsa årshjulets data: ${error.message}`;
                byId("yearWheelSourceStatus").classList.remove("hidden");
                return;
            }
            // Endast inläsning och ändrade källdata får starta automatisk synk, inte sparnotifieringar.
            if (source === "load") {
                const arrangements = window.GTScoutArrangements?.getAll?.() || [];
                migrated.forEach(entry => {
                    const withArrangements = syncArrangementEvents(entry.wheel, arrangements) || entry.wheel;
                    const updated = syncPlanningMeetingEvents(withArrangements, planningGroups);
                    if (updated || withArrangements !== entry.wheel) {
                        entry.wheel = updated || withArrangements;
                        entry.changed = true;
                    }
                });
            }
            wheels = migrated.map(entry => entry.wheel);
            if (source === "load") {
                persistWheelSources(wheels, new Set(migrated.filter(entry => entry.changed).map(entry => entry.wheel.id)));
            } else render();
        } });
        window.GTScoutPlanningSync?.init({
            ignoreShared: true,
            getGroups: () => planningGroups,
            applyGroups: syncPlanningIntoWheels
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
    else initialize();
})();
