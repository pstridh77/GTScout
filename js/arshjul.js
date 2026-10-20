(function () {
    const VIEW_STORAGE_KEY = "gtscout_arshjul_view";
    const COLORS = ["#398a86", "#667085", "#c56b36", "#5d7cc5", "#8b83ef", "#56a86b", "#36a7d5", "#e49b38", "#d65b65", "#a45db2"];
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

    function getEventColor(event, ring) {
        if (event.color_variant === "custom" && /^#[0-9a-f]{6}$/i.test(event.color || "")) return event.color;
        if (event.color_variant === "light") return adjustHexColor(ring.color, 0.32);
        if (event.color_variant === "dark") return adjustHexColor(ring.color, -0.24);
        return ring.color;
    }

    function renderRingList(wheel) {
        const list = byId("yearWheelRingList");
        list.innerHTML = wheel.rings.length ? wheel.rings.map(ring => `
            <div class="year-wheel-ring-row">
                <label class="year-wheel-ring-toggle">
                    <input type="checkbox" data-ring-toggle="${escapeHtml(ring.id)}" ${selectedRingIds.has(ring.id) ? "checked" : ""}>
                    <span class="year-wheel-ring-swatch" style="--ring-color:${ring.color}"></span>
                    <span>${escapeHtml(ring.name)}</span>
                </label>
                ${canEdit() ? `<button class="year-wheel-ring-edit" type="button" data-edit-ring="${escapeHtml(ring.id)}" aria-label="Redigera ${escapeHtml(ring.name)}">Redigera</button>` : ""}
            </div>`).join("") : `<p class="year-wheel-empty">Lägg till en ring för att börja planera.</p>`;
        list.querySelectorAll("[data-ring-toggle]").forEach(input => input.addEventListener("change", () => {
            if (input.checked) selectedRingIds.add(input.dataset.ringToggle);
            else selectedRingIds.delete(input.dataset.ringToggle);
            render();
        }));
        list.querySelectorAll("[data-edit-ring]").forEach(button => button.addEventListener("click", () => openRingForm(button.dataset.editRing)));
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
            const separator = point(outerRadius + 2, startFraction);
            svg.push(`<line x1="320" y1="320" x2="${separator.x.toFixed(2)}" y2="${separator.y.toFixed(2)}" class="year-wheel-month-divider"/>`);
            const label = point(outerRadius + 32, (startFraction + endFraction) / 2);
            svg.push(`<text x="${label.x.toFixed(2)}" y="${label.y.toFixed(2)}" class="year-wheel-month-label" text-anchor="middle" dominant-baseline="middle">${MONTHS[monthIndex].slice(0, 3)}</text>`);
        }

        shownRings.forEach((ring, ringIndex) => {
            const outer = outerRadius - ringIndex * ringWidth;
            const inner = outer - ringWidth + Math.min(1.5, ringWidth / 4);
            const events = visibleEvents.filter(event => event.ring_id === ring.id);
            svg.push(`<circle cx="320" cy="320" r="${((outer + inner) / 2).toFixed(2)}" class="year-wheel-ring-track"/>`);
            events.forEach(event => {
                const clippedStart = event.start_date < dateKey(start) ? dateKey(start) : event.start_date;
                const lastDay = dateKey(new Date(endExclusive.getTime() - 86400000));
                const clippedEnd = event.end_date > lastDay ? lastDay : event.end_date;
                const startDay = dayIndex(clippedStart, start);
                const endDay = dayIndex(clippedEnd, start) + 1;
                const from = Math.max(0, startDay / days);
                const to = Math.min(1, endDay / days);
                if (to <= from) return;
                const minWidth = 1 / 180;
                const finish = Math.min(1, Math.max(to, from + minWidth));
                const mid = (from + finish) / 2;
                const radius = (outer + inner) / 2;
                const label = point(radius, mid);
                const eventColor = getEventColor(event, ring);
                const tangentRotation = (mid * 360) % 360;
                const rotation = tangentRotation > 90 && tangentRotation < 270 ? tangentRotation + 180 : tangentRotation;
                const title = `${event.title} · ${formatDate(event.start_date)}${event.end_date !== event.start_date ? `–${formatDate(event.end_date)}` : ""}`;
                const eventLabel = finish - from >= 0.04
                    ? `<text x="${label.x.toFixed(2)}" y="${label.y.toFixed(2)}" transform="rotate(${rotation.toFixed(1)} ${label.x.toFixed(2)} ${label.y.toFixed(2)})" style="fill:${getRingTextColor(eventColor)}" class="year-wheel-event-label">${escapeHtml(event.title)}</text>`
                    : "";
                const path = finish - from >= 0.999
                    ? `${arcPath(outer - 1, inner + 1, from, from + 0.5)} ${arcPath(outer - 1, inner + 1, from + 0.5, finish)}`
                    : arcPath(outer - 1, inner + 1, from, finish);
                svg.push(`<g class="year-wheel-event-mark" data-event-edit="${escapeHtml(event.id)}" tabindex="${canEdit() ? "0" : "-1"}" role="${canEdit() ? "button" : "img"}" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title><path d="${path}" fill="${eventColor}" class="year-wheel-event-arc"/>${eventLabel}</g>`);
            });
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
    }

    function renderEventList(wheel, events) {
        const list = byId("yearWheelEvents");
        const ringById = new Map(wheel.rings.map(ring => [ring.id, ring]));
        const ordered = [...events].sort((left, right) => left.start_date.localeCompare(right.start_date) || left.title.localeCompare(right.title, "sv"));
        list.innerHTML = ordered.length ? ordered.map(event => {
            const ring = ringById.get(event.ring_id);
            return `<article class="year-wheel-event-card">
                <span class="year-wheel-event-card-swatch" style="--ring-color:${getEventColor(event, ring)}"></span>
                <div class="year-wheel-event-card-main"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(ring.name)} · ${escapeHtml(formatDate(event.start_date, { day: "numeric", month: "long", year: "numeric" }))}${event.end_date !== event.start_date ? ` – ${escapeHtml(formatDate(event.end_date, { day: "numeric", month: "long", year: "numeric" }))}` : ""}</span>${event.responsible ? `<small>Ansvarig: ${escapeHtml(event.responsible)}</small>` : ""}${event.location ? `<small>Plats: ${escapeHtml(event.location)}</small>` : ""}${event.notes ? `<small class="year-wheel-event-notes">${escapeHtml(event.notes)}</small>` : ""}</div>
                ${canEdit() ? `<button class="btn-secondary" type="button" data-edit-event="${escapeHtml(event.id)}">Redigera</button>` : ""}
            </article>`;
        }).join("") : `<p class="year-wheel-empty">Inga händelser för de valda ringarna i den här perioden.</p>`;
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
            byId("editYearWheelBtn").classList.add("hidden");
            byId("yearWheelChart").innerHTML = `<p class="year-wheel-empty">Skapa ett årshjul för att komma igång.</p>`;
            byId("yearWheelRingList").innerHTML = `<p class="year-wheel-empty">Inga ringar att visa.</p>`;
            byId("yearWheelEvents").innerHTML = "";
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
        byId("editYearWheelBtn").classList.toggle("hidden", !canEdit());
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
        const shownRings = wheel.rings.filter(ring => selectedRingIds.has(ring.id));
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
        byId("deleteYearWheelItemBtn").classList.toggle("hidden", !itemId || !["ring", "event", "wheel"].includes(mode));
        byId("yearWheelModal").classList.remove("hidden");
        byId("yearWheelFormFields").querySelector("input,select,textarea")?.focus();
    }

    function closeModal() {
        byId("yearWheelModal").classList.add("hidden");
        modalMode = "";
        editingId = "";
    }

    function openWheelForm() {
        openModal("Nytt årshjul", `<label class="modal-field"><span>Namn</span><input name="name" required maxlength="100" placeholder="Till exempel Kårens verksamhetsår"></label>`, "wheel");
    }

    function openWheelSettings() {
        const wheel = currentWheel();
        if (!wheel || !canEdit()) return;
        openModal("Inställningar för årshjul", `
            <label class="modal-field"><span>Namn</span><input name="name" required maxlength="100" value="${escapeHtml(wheel.name)}"></label>
            <label class="modal-field"><span>Verksamhetsåret börjar</span><select name="start_month">${MONTHS.map((month, index) => `<option value="${index + 1}" ${index + 1 === wheel.start_month ? "selected" : ""}>${month}</option>`).join("")}</select></label>
        `, "wheel", wheel.id);
    }

    function openRingForm(ringId = "") {
        const wheel = currentWheel();
        if (!wheel || !canEdit()) return;
        const ring = wheel.rings.find(item => item.id === ringId);
        openModal(ring ? "Redigera ring" : "Lägg till ring", `
            <label class="modal-field"><span>Namn på ringen</span><input name="name" required maxlength="60" value="${escapeHtml(ring?.name || "")}" placeholder="Till exempel Styrelse"></label>
            <label class="modal-field" data-ring-color-variant${DEPARTMENT_RING_COLORS[ring?.name || ""] ? "" : " hidden"}><span>Avdelningsfärg</span><select name="color_variant"><option value="standard" ${ring?.color_variant === "standard" || !ring?.color_variant && DEPARTMENT_RING_COLORS[ring?.name || ""] ? "selected" : ""}>Standardfärg</option><option value="light" ${ring?.color_variant === "light" ? "selected" : ""}>Ljusare alternativfärg</option><option value="custom" ${ring?.color_variant === "custom" ? "selected" : ""}>Egen färg</option></select></label>
            <label class="modal-field" data-ring-custom-color${DEPARTMENT_RING_COLORS[ring?.name || ""] && ring?.color_variant !== "custom" ? " hidden" : ""}><span>Färg</span><input name="color" type="color" value="${escapeHtml(ring?.color || DEPARTMENT_RING_COLORS[ring?.name || ""]?.standard || COLORS[wheel.rings.length % COLORS.length])}"></label>
        `, "ring", ringId);
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
            <label class="modal-field"><span>Ring</span><select name="ring_id" required>${wheel.rings.map(ring => `<option value="${escapeHtml(ring.id)}" ${ring.id === chosenRing ? "selected" : ""}>${escapeHtml(ring.name)}</option>`).join("")}</select></label>
            <div class="year-wheel-form-grid">
                <label class="modal-field"><span>Från och med</span><input name="start_date" type="date" required value="${escapeHtml(event?.start_date || date)}"></label>
                <label class="modal-field"><span>Till och med</span><input name="end_date" type="date" required value="${escapeHtml(event?.end_date || event?.start_date || date)}"></label>
            </div>
            <label class="modal-field"><span>Händelsefärg</span><div class="year-wheel-color-choice-row">
                <select name="color_variant">
                    <option value="ring" ${!event || !event.color_variant || event.color_variant === "ring" ? "selected" : ""}>Ringens färg</option>
                    <option value="light" ${event?.color_variant === "light" ? "selected" : ""}>Ljusare nyans</option>
                    <option value="dark" ${event?.color_variant === "dark" ? "selected" : ""}>Mörkare nyans</option>
                    <option value="custom" ${event?.color_variant === "custom" ? "selected" : ""}>Valfri färg</option>
                </select>
                <label class="year-wheel-color-picker" data-event-color-preview>
                    <input name="color" type="color" aria-label="Välj händelsefärg" value="${escapeHtml(event?.color || wheel.rings.find(ring => ring.id === chosenRing)?.color || COLORS[0])}">
                    <span class="year-wheel-color-preview" aria-hidden="true"></span>
                </label>
            </div></label>
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
        const wheel = currentWheel();
        if (modalMode === "wheel" && editingId) {
            const updated = normalizeWheel({ ...wheel, name: String(value.name || "").trim(), start_month: Number.parseInt(value.start_month, 10) });
            if (!updated.name) return;
            wheels = wheels.map(item => item.id === wheel.id ? updated : item);
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
            if (!name) return;
            const created = normalizeWheel({
                id: id(),
                name,
                start_month: view.startMonth,
                rings: DEFAULT_RINGS.map(([ringName, color]) => ({ id: id(), name: ringName, color })),
                events: [],
                schema_version: 3,
                created_by: auth()?.getUser?.()?.id || null
            });
            wheels = [...wheels, created];
            selectedWheelId = created.id;
            selectedRingIds = new Set(created.rings.map(ring => ring.id));
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
            if (!window.confirm(`Ta bort ringen "${ring?.name || ""}" och dess händelser?`)) return;
            const updated = normalizeWheel({
                ...wheel,
                rings: wheel.rings.filter(item => item.id !== editingId),
                events: wheel.events.filter(item => item.ring_id !== editingId)
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
        byId("addYearWheelBtn").addEventListener("click", openWheelForm);
        byId("editYearWheelBtn").addEventListener("click", openWheelSettings);
        byId("addYearWheelRingBtn").addEventListener("click", () => openRingForm());
        byId("addYearWheelEventBtn").addEventListener("click", () => openEventForm());
        byId("closeYearWheelModal").addEventListener("click", closeModal);
        byId("yearWheelModal").addEventListener("click", event => {
            if (event.target === byId("yearWheelModal")) closeModal();
        });
        byId("yearWheelForm").addEventListener("submit", submitForm);
        byId("deleteYearWheelItemBtn").addEventListener("click", deleteCurrentItem);
        auth()?.onChange?.(() => {
            byId("addYearWheelBtn").classList.toggle("hidden", Boolean(auth()?.isOnline?.() && auth()?.isSignedIn?.()) && !auth()?.isLeader?.());
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
