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
    let view = { mode: "calendar", year: new Date().getFullYear(), startMonth: 8 };
    let startMonthOverridden = false;
    let modalMode = "";
    let editingId = "";
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
                title: String(event.title || "").trim().slice(0, 120),
                start_date: startDate,
                end_date: endDate,
                color_variant: ["ring", "light", "dark", "custom"].includes(event.color_variant) ? event.color_variant : "ring",
                color: /^#[0-9a-f]{6}$/i.test(event.color) ? event.color : "",
                responsible: String(event.responsible || "").trim().slice(0, 100),
                location: String(event.location || "").trim().slice(0, 120),
                notes: String(event.notes || "").trim().slice(0, 2000)
            };
        }).filter(event => event?.title) : [];
        return {
            id: String(wheel.id || id()),
            name: String(wheel.name || "").trim().slice(0, 100),
            start_month: Math.min(12, Math.max(1, Number.parseInt(wheel.start_month, 10) || 8)),
            rings,
            events,
            schema_version: Math.max(2, Number(wheel.schema_version) || 0),
            created_by: wheel.created_by || null,
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
        if (ring.id === "__department_group__") return "#cceefa";
        return adjustHexColor(ring.color, 0.84);
    }

    function getEventColor(event, ring) {
        if (event.color_variant === "custom" && /^#[0-9a-f]{6}$/i.test(event.color || "")) return event.color;
        if (event.color_variant === "light") return adjustHexColor(ring.color, 0.32);
        if (event.color_variant === "dark") return adjustHexColor(ring.color, -0.24);
        return ring.color;
    }

    function isDepartmentRing(ring) {
        return Boolean(DEPARTMENT_RING_COLORS[ring.name]);
    }

    function getDisplayedRings(wheel, selectedIds) {
        const departmentRings = wheel.rings.filter(ring => isDepartmentRing(ring));
        const shownDepartmentRings = departmentRings.filter(ring => selectedIds.has(ring.id));
        let departmentGroupAdded = false;
        const displayed = [];
        wheel.rings.forEach(ring => {
            if (isDepartmentRing(ring)) {
                if (!departmentGroupAdded && shownDepartmentRings.length) {
                    displayed.push({
                        id: "__department_group__",
                        name: "Avdelning",
                        color: DEPARTMENT_RING_COLORS.Upptäckare.standard,
                        sourceRings: shownDepartmentRings
                    });
                    departmentGroupAdded = true;
                }
                return;
            }
            if (selectedIds.has(ring.id)) displayed.push(ring);
        });
        return { displayed, departmentRings };
    }

    function renderRingList(wheel) {
        const list = byId("yearWheelRingList");
        const { departmentRings } = getDisplayedRings(wheel, selectedRingIds);
        const otherRings = wheel.rings.filter(ring => !isDepartmentRing(ring));
        const selectedDepartments = departmentRings.filter(ring => selectedRingIds.has(ring.id)).length;
        const renderRingRow = ring => `
            <div class="year-wheel-ring-row">
                <label class="year-wheel-ring-toggle">
                    <input type="checkbox" data-ring-toggle="${escapeHtml(ring.id)}" ${selectedRingIds.has(ring.id) ? "checked" : ""}>
                    <span class="year-wheel-ring-swatch" style="--ring-color:${ring.color}"></span>
                    <span>${escapeHtml(ring.name)}</span>
                </label>
                ${canEdit() ? `<button class="year-wheel-ring-edit" type="button" data-edit-ring="${escapeHtml(ring.id)}" aria-label="Redigera ${escapeHtml(ring.name)}">Redigera</button>` : ""}
            </div>`;
        list.innerHTML = wheel.rings.length ? `
            ${departmentRings.length ? `<details class="year-wheel-department-group" open>
                <summary>
                    <span class="year-wheel-department-heading">
                        <input type="checkbox" data-department-toggle-all aria-label="Visa alla avdelningar" ${selectedDepartments === departmentRings.length ? "checked" : ""}>
                        <span>Avdelning</span>
                    </span>
                    <span class="year-wheel-department-chevron" aria-hidden="true"></span>
                </summary>
                <div class="year-wheel-department-list">${departmentRings.map(renderRingRow).join("")}</div>
            </details>` : ""}
            ${otherRings.map(renderRingRow).join("")}` : `<p class="year-wheel-empty">Lägg till en ring för att börja planera.</p>`;
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
        list.querySelectorAll("[data-edit-ring]").forEach(button => button.addEventListener("click", () => openRingForm(button.dataset.editRing)));
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
        const svg = [`<svg class="year-wheel-svg" viewBox="0 0 640 640" role="img" aria-label="Årshjul med månader och händelser"><defs><filter id="year-wheel-seam-shadow" x="60" y="60" width="520" height="520" filterUnits="userSpaceOnUse"><feDropShadow dx="3" dy="0" stdDeviation="2" flood-color="#142637" flood-opacity=".52"/></filter></defs>`];
        const monthIntervals = [];
        const overflowActions = [];
        const ringGap = shownRings.length ? Math.min(14, Math.max(8, ringWidth * 0.45)) : 0;
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
            monthIntervals.push({ monthIndex, startFraction, endFraction });
            const label = point(outerRadius + 32, (startFraction + endFraction) / 2);
            svg.push(`<text x="${label.x.toFixed(2)}" y="${label.y.toFixed(2)}" class="year-wheel-month-label" text-anchor="middle" dominant-baseline="middle">${MONTHS[monthIndex].slice(0, 3)}</text>`);
        }

        shownRings.forEach((ring, ringIndex) => {
            const outer = outerRadius - ringIndex * ringWidth;
            const inner = outer - ringWidth;
            const backgroundPath = `${arcPath(outer, inner, 0, 0.5)} ${arcPath(outer, inner, 0.5, 1)}`;
            const labelRadius = outer - ringGap / 2;
            const labelPathId = `year-wheel-ring-label-path-${ringIndex}`;
            const labelStart = 0.94;
            const labelEnd = 1.06;
            const labelStartPoint = point(labelRadius, labelStart);
            const labelEndPoint = point(labelRadius, labelEnd);
            svg.push(`<path d="${backgroundPath}" fill="${getRingBackgroundColor(ring)}" class="year-wheel-ring-background"/>`);
            svg.push(`<circle cx="320" cy="320" r="${outer.toFixed(2)}" stroke-width="${ringGap.toFixed(2)}" class="year-wheel-ring-gap"/>`);
            svg.push(`<path id="${labelPathId}" d="M ${labelStartPoint.x.toFixed(2)} ${labelStartPoint.y.toFixed(2)} A ${labelRadius.toFixed(2)} ${labelRadius.toFixed(2)} 0 0 1 ${labelEndPoint.x.toFixed(2)} ${labelEndPoint.y.toFixed(2)}" class="year-wheel-ring-label-path"/>`);
        });

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
            const laneHeight = (outer - inner) / Math.max(1, lanes.length);
            lanes.forEach((lane, laneIndex) => {
                const laneOuter = outer - laneIndex * laneHeight;
                const laneInner = outer - (laneIndex + 1) * laneHeight;
                lane.forEach(({ event, from, to: finish }) => {
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
            const labelRadius = outerRadius - ringIndex * ringWidth - ringGap / 2;
            const label = escapeHtml(ring.name.length > 24 ? `${ring.name.slice(0, 23)}…` : ring.name);
            const fontSize = Math.max(6, Math.min(10, ringGap * 0.9));
            svg.push(`<text class="year-wheel-ring-label" style="font-size:${fontSize.toFixed(1)}px"><title>${escapeHtml(ring.name)}</title><textPath href="#year-wheel-ring-label-path-${ringIndex}" startOffset="50%" text-anchor="middle">${label}</textPath></text>`);
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
        const endYear = periodRange.end.getUTCFullYear();
        const centerYear = view.mode === "calendar" || endYear === view.year
            ? String(view.year)
            : `${view.year}–${String(endYear).slice(-2)}`;
        svg.push(`<text x="320" y="310" class="year-wheel-center-title" text-anchor="middle">${centerYear}</text>`);
        svg.push(`<text x="320" y="334" class="year-wheel-center-subtitle" text-anchor="middle">${view.mode === "calendar" ? "Kalenderår" : "Verksamhetsår"}</text></svg>`);
        container.innerHTML = svg.join("");
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
        byId("yearWheelMenuAddBtn").classList.toggle("hidden", restrictedUser);
        byId("yearWheelMenuSettingsBtn").classList.toggle("hidden", !currentWheel() || !canEdit());
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
            end_date: endDate
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

    function renderEventList(wheel, events) {
        const list = byId("yearWheelEvents");
        const ringById = new Map(wheel.rings.map(ring => [ring.id, ring]));
        const groups = groupEventsByMonth(events);
        list.innerHTML = groups.size ? [...groups].map(([month, monthEvents]) => {
            const monthLabel = formatDate(`${month}-01`, { month: "long", year: "numeric" });
            const title = monthLabel.charAt(0).toLocaleUpperCase("sv") + monthLabel.slice(1);
            const cards = monthEvents.map(event => {
                const ring = ringById.get(event.ring_id);
                return `<article class="year-wheel-event-card">
                    <span class="year-wheel-event-card-swatch" style="--ring-color:${getEventColor(event, ring)}"></span>
                    <div class="year-wheel-event-card-main"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(ring.name)} · ${escapeHtml(formatDate(event.start_date, { day: "numeric", month: "long", year: "numeric" }))}${event.end_date !== event.start_date ? ` – ${escapeHtml(formatDate(event.end_date, { day: "numeric", month: "long", year: "numeric" }))}` : ""}</span>${event.responsible ? `<small>Ansvarig: ${escapeHtml(event.responsible)}</small>` : ""}${event.location ? `<small>Plats: ${escapeHtml(event.location)}</small>` : ""}${event.notes ? `<small class="year-wheel-event-notes">${escapeHtml(event.notes)}</small>` : ""}</div>
                    ${canEdit() ? `<div class="year-wheel-event-actions"><button class="btn-secondary" type="button" data-copy-event="${escapeHtml(event.id)}" aria-label="Kopiera ${escapeHtml(event.title)} till nästa år" title="Kopiera till nästa år"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg></button><button class="btn-secondary" type="button" data-edit-event="${escapeHtml(event.id)}" aria-label="Redigera ${escapeHtml(event.title)}" title="Redigera"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5L9 20l-6 1 1-6L16 3Z"></path><path d="m14 5 5 5"></path></svg></button></div>` : ""}
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
        list.querySelectorAll("[data-edit-event]").forEach(button => button.addEventListener("click", () => openEventForm(button.dataset.editEvent)));
    }

    function render() {
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
            byId("addYearWheelRingBtn").disabled = true;
            byId("addYearWheelEventBtn").disabled = true;
            byId("yearWheelReadOnlyNote").classList.add("hidden");
            return;
        }
        selectedWheelId = wheels.some(wheel => wheel.id === previousId) ? previousId : wheels[0].id;
        selector.value = selectedWheelId;
        const wheel = currentWheel();
        if (!startMonthOverridden) view.startMonth = wheel.start_month;
        const validRingIds = new Set(wheel.rings.map(ring => ring.id));
        if (selectedRingsForWheelId !== wheel.id || [...selectedRingIds].some(ringId => !validRingIds.has(ringId))) {
            selectedRingIds = new Set(wheel.rings.map(ring => ring.id));
            selectedRingsForWheelId = wheel.id;
        }
        selector.disabled = false;
        byId("addYearWheelRingBtn").disabled = !canEdit();
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
        byId("yearWheelStartMonthField").classList.toggle("hidden", view.mode !== "operational");
        byId("yearWheelStartMonth").value = String(view.startMonth);
        const range = period();
        const startKey = dateKey(range.start);
        const endKey = dateKey(range.end);
        byId("yearWheelDateRange").textContent = `${formatDate(startKey, { day: "numeric", month: "long", year: "numeric" })} – ${formatDate(endKey, { day: "numeric", month: "long", year: "numeric" })}`;
        renderRingList(wheel);
        const { displayed: shownRings } = getDisplayedRings(wheel, selectedRingIds);
        const visibleEvents = wheel.events.filter(event => selectedRingIds.has(event.ring_id)
            && event.start_date <= endKey && event.end_date >= startKey);
        renderWheelChart(wheel, shownRings, visibleEvents, range);
        renderEventList(wheel, visibleEvents);
    }

    function openModal(title, formFields, mode, itemId = "") {
        modalMode = mode;
        editingId = itemId;
        byId("yearWheelModalTitle").textContent = title;
        byId("yearWheelFormFields").innerHTML = formFields;
        byId("yearWheelFormMessage").classList.add("hidden");
        const deleteButton = byId("deleteYearWheelItemBtn");
        deleteButton.classList.toggle("hidden", !itemId || !["ring", "event", "wheel"].includes(mode));
        deleteButton.disabled = false;
        deleteButton.removeAttribute("title");
        byId("yearWheelModal").classList.remove("hidden");
        byId("yearWheelFormFields").querySelector("input,select,textarea")?.focus();
    }

    function closeModal() {
        byId("yearWheelModal").classList.add("hidden");
        modalMode = "";
        editingId = "";
    }

    function openWheelForm() {
        openModal("Nytt årshjul", `
            <label class="modal-field"><span>Namn</span><input name="name" required maxlength="100" placeholder="Till exempel Kårens verksamhetsår"></label>
            <label class="modal-field"><span>Verksamhetsåret börjar</span><select name="start_month">${MONTHS.map((month, index) => `<option value="${index + 1}" ${index + 1 === view.startMonth ? "selected" : ""}>${month}</option>`).join("")}</select></label>
            ${renderRingSelection([], [], true)}
        `, "wheel");
    }

    function openWheelSettings() {
        const wheel = currentWheel();
        if (!wheel || !canEdit()) return;
        openModal("Inställningar för årshjul", `
            <label class="modal-field"><span>Namn</span><input name="name" required maxlength="100" value="${escapeHtml(wheel.name)}"></label>
            <label class="modal-field"><span>Verksamhetsåret börjar</span><select name="start_month">${MONTHS.map((month, index) => `<option value="${index + 1}" ${index + 1 === wheel.start_month ? "selected" : ""}>${month}</option>`).join("")}</select></label>
            ${renderRingSelection(wheel.rings, wheel.events, false)}
        `, "wheel", wheel.id);
    }

    function ringOptionsMarkup(rings, events, isNewWheel) {
        const existingByName = new Map(rings.map(ring => [ring.name, ring]));
        const eventCounts = new Map();
        events.forEach(event => eventCounts.set(event.ring_id, (eventCounts.get(event.ring_id) || 0) + 1));
        const ringIdsWithEvents = getRingIdsWithEvents(events);
        const defaultOptions = DEFAULT_RINGS.map(([name, color]) => {
            const ring = existingByName.get(name);
            const locked = Boolean(ring && ringIdsWithEvents.has(ring.id));
            const checked = isNewWheel || Boolean(ring);
            const count = ring ? eventCounts.get(ring.id) || 0 : 0;
            const lockNote = locked ? `Har ${count} ${count === 1 ? "händelse" : "händelser"} – flytta eller ta bort dem först.` : "";
            return `<label class="year-wheel-ring-option${locked ? " year-wheel-ring-option--locked" : ""}">
                <input type="checkbox" ${ring ? `name="ring_ids" value="${escapeHtml(ring.id)}"` : `name="ring_names" value="${escapeHtml(name)}"`} ${checked ? "checked" : ""} ${locked ? "disabled" : ""}>
                ${ring && locked ? `<input type="hidden" name="ring_ids" value="${escapeHtml(ring.id)}">` : ""}
                <span class="year-wheel-ring-swatch" style="--ring-color:${color}"></span>
                <span class="year-wheel-ring-option-name">${escapeHtml(name)}</span>
                ${lockNote ? `<small>${escapeHtml(lockNote)}</small>` : ""}
            </label>`;
        }).join("");
        const customRings = rings.filter(ring => !DEFAULT_RINGS.some(([name]) => name === ring.name)).map(ring => {
            const locked = ringIdsWithEvents.has(ring.id);
            const count = eventCounts.get(ring.id) || 0;
            const lockNote = locked ? `Har ${count} ${count === 1 ? "händelse" : "händelser"} – flytta eller ta bort dem först.` : "";
            return `<label class="year-wheel-ring-option${locked ? " year-wheel-ring-option--locked" : ""}">
                <input type="checkbox" name="ring_ids" value="${escapeHtml(ring.id)}" checked ${locked ? "disabled" : ""}>
                ${locked ? `<input type="hidden" name="ring_ids" value="${escapeHtml(ring.id)}">` : ""}
                <span class="year-wheel-ring-swatch" style="--ring-color:${ring.color}"></span>
                <span class="year-wheel-ring-option-name">${escapeHtml(ring.name)}</span>
                ${lockNote ? `<small>${escapeHtml(lockNote)}</small>` : ""}
            </label>`;
        }).join("");
        return `<fieldset class="year-wheel-ring-selection">
            <legend>Ringar i årshjulet</legend>
            <p>Välj vilka ringar som ska ingå. Ringar med händelser kan inte tas bort.</p>
            <div class="year-wheel-ring-options">${defaultOptions}${customRings}</div>
        </fieldset>`;
    }

    function renderRingSelection(rings, events, isNewWheel) {
        return ringOptionsMarkup(rings, events, isNewWheel);
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
        const wheel = currentWheel();
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

    function openEventForm(eventId = "") {
        const wheel = currentWheel();
        if (!wheel || !canEdit() || !wheel.rings.length) return;
        const event = wheel.events.find(item => item.id === eventId);
        const chosenRing = event?.ring_id || wheel.rings.find(ring => selectedRingIds.has(ring.id))?.id || wheel.rings[0].id;
        const date = dateKey(period().start);
        openModal(event ? "Redigera händelse" : "Lägg till händelse", `
            <label class="modal-field"><span>Rubrik</span><input name="title" required maxlength="120" value="${escapeHtml(event?.title || "")}" placeholder="Till exempel Kårstämma"></label>
            <div class="year-wheel-ring-color-grid">
                <label class="modal-field"><span>Ring</span><select name="ring_id" required>${wheel.rings.map(ring => `<option value="${escapeHtml(ring.id)}" ${ring.id === chosenRing ? "selected" : ""}>${escapeHtml(ring.name)}</option>`).join("")}</select></label>
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
                <label class="modal-field"><span>Från och med</span><input name="start_date" type="date" required value="${escapeHtml(event?.start_date || date)}"></label>
                <label class="modal-field"><span>Till och med</span><input name="end_date" type="date" required value="${escapeHtml(event?.end_date || event?.start_date || date)}"></label>
            </div>
            <div class="year-wheel-form-grid">
                <label class="modal-field"><span>Ansvarig (valfritt)</span><input name="responsible" maxlength="100" value="${escapeHtml(event?.responsible || "")}"></label>
                <label class="modal-field"><span>Plats (valfritt)</span><input name="location" maxlength="120" value="${escapeHtml(event?.location || "")}"></label>
            </div>
            <label class="modal-field"><span>Anteckningar</span><textarea name="notes" rows="3" maxlength="2000">${escapeHtml(event?.notes || "")}</textarea></label>
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
        window.GTScoutYearWheelSync?.saveWheel(wheel);
    }

    function submitForm(event) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const value = Object.fromEntries(formData.entries());
        const selectedRingIdsFromForm = formData.getAll("ring_ids").map(String);
        const selectedRingNamesFromForm = formData.getAll("ring_names").map(String);
        const wheel = currentWheel();
        if (modalMode === "wheel" && editingId) {
            if (!wheel) return;
            const rings = buildConfiguredRings(wheel.rings, selectedRingIdsFromForm, selectedRingNamesFromForm);
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
            const updated = normalizeWheel({ ...wheel, name, start_month: Number.parseInt(value.start_month, 10), rings });
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
            const rings = buildConfiguredRings([], [], selectedRingNamesFromForm);
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
                rings,
                events: [],
                schema_version: 3,
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
        if (!wheel || !canEdit()) return;
        if (modalMode === "ring") {
            const name = String(value.name || "").trim();
            if (!name) return;
            const rings = [...wheel.rings];
            const index = rings.findIndex(ring => ring.id === editingId);
            const palette = DEPARTMENT_RING_COLORS[name];
            const variant = palette ? String(value.color_variant || "standard") : "custom";
            const ring = {
                id: editingId || id(),
                name,
                color: palette && variant !== "custom" ? palette[variant] : value.color,
                color_variant: variant
            };
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
                notes: String(value.notes || "").trim()
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
        byId("yearWheelMenuAddBtn").addEventListener("click", openWheelForm);
        byId("yearWheelMenuSettingsBtn").addEventListener("click", openWheelSettings);
        byId("addYearWheelRingBtn").addEventListener("click", () => openRingForm());
        byId("addYearWheelEventBtn").addEventListener("click", () => openEventForm());
        byId("closeYearWheelModal").addEventListener("click", closeModal);
        byId("yearWheelModal").addEventListener("click", event => {
            if (event.target === byId("yearWheelModal")) closeModal();
        });
        byId("yearWheelForm").addEventListener("submit", submitForm);
        byId("deleteYearWheelItemBtn").addEventListener("click", deleteCurrentItem);
        auth()?.onChange?.(() => {
            updateYearWheelMenuActions();
            render();
        });
        window.GTScoutYearWheelSync?.init({ onChange: incoming => {
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
            wheels = migrated.map(entry => entry.wheel);
            const activeMigration = migrated.find(entry => entry.changed && entry.wheel.id === selectedWheelId);
            if (activeMigration && selectedRingsForWheelId === selectedWheelId) {
                const termRing = activeMigration.wheel.rings.find(ring => ring.name === "Terminer");
                if (termRing) selectedRingIds.add(termRing.id);
            }
            render();
            if (canEdit()) {
                migrated.filter(entry => entry.changed).forEach(entry => window.GTScoutYearWheelSync?.saveWheel(entry.wheel));
            }
        } });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
    else initialize();
})();
