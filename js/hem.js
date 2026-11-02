/**
 * Startsidan "Hem" – översikt med nästa kommande händelser och genvägar
 * till de moduler användaren har valt att se i menyn.
 */
(function () {
    const UPCOMING_LEVELS_KEY = "gtscout_home_upcoming_levels";
    const UPCOMING_TYPES_KEY = "gtscout_home_upcoming_types";
    const UPCOMING_WHEELS_KEY = "gtscout_home_upcoming_wheels";
    const UPCOMING_COUNT_KEY = "gtscout_home_upcoming_count";

    const UPCOMING_TYPES = [
        { id: "meetings", label: "Möten" },
        { id: "arrangements", label: "Arrangemang" },
        { id: "yearwheel", label: "Årshjul" }
    ];

    const MODULES = [
        { id: "marken", label: "Märken", description: "Märkesbiblioteket med kårens egna märken.", href: "marken.html", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12,2L15.09,8.26L22,9.27L17,14.14L18.18,21.02L12,17.77L5.82,21.02L7,14.14L2,9.27L8.91,8.26L12,2Z" /></svg>' },
        { id: "aktiviteter", label: "Aktiviteter", description: "Aktivitetsbank med genomföranden och material.", href: "aktiviteter.html", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5,5.5C14.88,5.5 16,4.38 16,3C16,1.62 14.88,0.5 13.5,0.5C12.12,0.5 11,1.62 11,3C11,4.38 12.12,5.5 13.5,5.5M9.89,19.38L10.89,15L13,17V23H15V15.5L12.89,13.5L13.5,10.5C14.79,12 16.79,13 19,13V11C17.24,11 15.74,10.14 14.79,8.82L13.79,7.5C13.34,6.96 12.71,6.65 12.04,6.65C11.68,6.65 11.32,6.75 11,6.94L6,9.5V14H8V10.35L10.38,9.03L8.89,14.5L4.5,18.5L5.91,20L9.89,19.38Z" /></svg>' },
        { id: "kokbok", label: "Recept", description: "Kårens kokbok med skalbara recept.", href: "kokbok.html", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.1,13.34L3.91,9.16C2.35,7.59 2.35,5.06 3.91,3.5L10.93,10.5L8.1,13.34M13.41,13L20.29,19.88L18.88,21.29L12,14.41L5.12,21.29L3.71,19.88L13.36,10.22L13.41,10.22C13.71,9.92 14.03,9.5 14.03,9.5C14.03,9.5 15.03,8.5 16.5,8.5C17.96,8.5 19.5,9.5 19.5,9.5L21.5,7.5L20.09,6.09L18.68,7.5C18.68,7.5 17.68,6 16.21,6C14.75,6 13.75,7 13.75,7C13.75,7 13.33,7.32 13.03,7.62L13.41,8L11,10.41L13.41,13Z" /></svg>' },
        { id: "planering", label: "Planeringar", description: "Terminsplaneringar med möten och märken.", href: "planering.html", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z" /></svg>' },
        { id: "arrangemang", label: "Arrangemang", description: "Hajker, övernattningar och läger.", href: "arrangemang.html", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12,2C8.13,2 5,5.13 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9C19,5.13 15.87,2 12,2M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5Z" /></svg>' },
        { id: "arshjul", label: "Årshjul", description: "Årshjulet med återkommande händelser.", href: "arshjul.html", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z" /></svg>' },
        { id: "scouter", label: "Scouter", description: "Scoutregistret för kåren.", href: "scouter.html", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16,13C15.71,13 15.38,13 15.03,13.05C16.19,13.89 17,15 17,16.5V19H23V16.5C23,14.17 18.33,13 16,13M8,13C5.67,13 1,14.17 1,16.5V19H15V16.5C15,14.17 10.33,13 8,13M8,11A3,3 0 0,0 11,8A3,3 0 0,0 8,5A3,3 0 0,0 5,8A3,3 0 0,0 8,11M16,11A3,3 0 0,0 19,8A3,3 0 0,0 16,5A3,3 0 0,0 13,8A3,3 0 0,0 16,11Z" /></svg>' },
        { id: "admin", label: "Administration", description: "Kårer, användare och behörigheter.", href: "admin.html", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M17.13,17C15.92,18.85 14.11,20.24 12,20.92C9.89,20.24 8.08,18.85 6.87,17C6.53,16.5 6.24,16 6,15.47C6,13.82 8.71,12.47 12,12.47C15.29,12.47 18,13.79 18,15.47C17.76,16 17.47,16.5 17.13,17Z" /></svg>' },
        { id: "utvecklingstrappa", label: "Utvecklingstrappa", description: "Utvecklingstrappan för scouter.", href: "utvecklingstrappa.html", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15,4A8,8 0 0,1 23,12A8,8 0 0,1 15,20A8,8 0 0,1 7,12A8,8 0 0,1 15,4M15,6A6,6 0 0,0 9,12A6,6 0 0,0 15,18A6,6 0 0,0 21,12A6,6 0 0,0 15,6M14,8H15.5V11.78L17.7,13.11L16.9,14.26L14,12.5V8M2,18A1,1 0 0,1 1,17A1,1 0 0,1 2,16A1,1 0 0,1 3,17A1,1 0 0,1 2,18M4,14A1,1 0 0,1 3,13A1,1 0 0,1 4,12A1,1 0 0,1 5,13A1,1 0 0,1 4,14M4,10A1,1 0 0,1 3,9A1,1 0 0,1 4,8A1,1 0 0,1 5,9A1,1 0 0,1 4,10Z" /></svg>' }
    ];

    let groups = [];
    let arrangements = [];
    let yearWheels = [];

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[char]));
    }

    function today() {
        return new Date().toISOString().slice(0, 10);
    }

    function formatDateSv(dateStr) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) return "";
        return new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${dateStr}T12:00:00`));
    }

    function isWithinNextYear(dateStr) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) return false;
        const now = new Date();
        const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
        return new Date(`${dateStr}T12:00:00`) <= oneYearFromNow;
    }

    function getStoredLevels() {
        try {
            const stored = JSON.parse(localStorage.getItem(UPCOMING_LEVELS_KEY));
            if (Array.isArray(stored) && stored.every(value => typeof value === "string")) return stored;
        } catch {
        }
        return null;
    }

    function saveLevels(levels) {
        try {
            localStorage.setItem(UPCOMING_LEVELS_KEY, JSON.stringify(levels));
        } catch (error) {
            console.error("Kunde inte spara avdelningsval", error);
        }
    }

    function getStoredTypes() {
        try {
            const stored = JSON.parse(localStorage.getItem(UPCOMING_TYPES_KEY));
            if (Array.isArray(stored) && stored.every(value => typeof value === "string")) return stored;
        } catch {
        }
        return null;
    }

    function saveTypes(types) {
        try {
            localStorage.setItem(UPCOMING_TYPES_KEY, JSON.stringify(types));
        } catch (error) {
            console.error("Kunde inte spara typval", error);
        }
    }

    function getSelectedTypes() {
        const stored = getStoredTypes();
        if (!stored) return UPCOMING_TYPES.map(type => type.id);
        return UPCOMING_TYPES.map(type => type.id).filter(id => stored.includes(id));
    }

    function getStoredWheels() {
        try {
            const stored = JSON.parse(localStorage.getItem(UPCOMING_WHEELS_KEY));
            if (Array.isArray(stored) && stored.every(value => typeof value === "string")) return stored;
        } catch {
        }
        return null;
    }

    function saveWheels(wheels) {
        try {
            localStorage.setItem(UPCOMING_WHEELS_KEY, JSON.stringify(wheels));
        } catch (error) {
            console.error("Kunde inte spara årshjulsval", error);
        }
    }

    function getSelectedWheels() {
        const available = yearWheels.map(wheel => wheel.id);
        const stored = getStoredWheels();
        if (!stored) return available;
        return available.filter(id => stored.includes(id));
    }

    function getStoredCount() {
        try {
            const stored = Number(localStorage.getItem(UPCOMING_COUNT_KEY));
            return Number.isSafeInteger(stored) && stored >= 1 && stored <= 20 ? stored : null;
        } catch {
            return null;
        }
    }

    function saveCount(count) {
        try {
            localStorage.setItem(UPCOMING_COUNT_KEY, String(count));
        } catch (error) {
            console.error("Kunde inte spara antal", error);
        }
    }

    function getSelectedCount() {
        return getStoredCount() || 4;
    }

    function getAvailableLevels() {
        return [...new Set(groups.map(group => String(group.level || "").trim()).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right, "sv"));
    }

    function getSelectedLevels() {
        const available = getAvailableLevels();
        const stored = getStoredLevels();
        if (!stored) return available;
        // Returnera bara de som finns kvar – om användaren valt bort alla visas inga möten.
        return available.filter(level => stored.includes(level));
    }

    function getUpcomingMeetings() {
        if (!getSelectedTypes().includes("meetings")) return [];
        const selectedLevels = new Set(getSelectedLevels());
        const now = today();
        return groups
            .filter(group => selectedLevels.has(String(group.level || "").trim()))
            .flatMap(group => (Array.isArray(group.meetings) ? group.meetings : [])
                .filter(meeting => /^\d{4}-\d{2}-\d{2}$/.test(meeting.date || "") && meeting.date >= now && isWithinNextYear(meeting.date))
                .map(meeting => ({ type: "meeting", date: meeting.date, group, meeting })))
            .sort((left, right) => left.date.localeCompare(right.date))
            .slice(0, 3);
    }

    function getUpcomingArrangements() {
        if (!getSelectedTypes().includes("arrangements")) return [];
        const now = today();
        return arrangements
            .filter(item => item.status !== "cancelled" && /^\d{4}-\d{2}-\d{2}$/.test(item.end_date || "") && item.end_date >= now && isWithinNextYear(item.start_date))
            .map(item => ({ type: "arrangement", date: item.start_date, item }))
            .sort((left, right) => left.date.localeCompare(right.date))
            .slice(0, 3);
    }

    function getUpcomingYearWheelEvents() {
        if (!getSelectedTypes().includes("yearwheel")) return [];
        const selectedWheels = new Set(getSelectedWheels());
        const now = today();
        return yearWheels
            .filter(wheel => selectedWheels.has(wheel.id))
            .flatMap(wheel => (Array.isArray(wheel.events) ? wheel.events : [])
                .filter(event => /^\d{4}-\d{2}-\d{2}$/.test(event.start_date || "") && event.start_date >= now && isWithinNextYear(event.start_date))
                .map(event => ({ type: "yearwheel", date: event.start_date, wheel, event })))
            .sort((left, right) => left.date.localeCompare(right.date))
            .slice(0, 3);
    }

    function renderUpcoming() {
        const container = document.getElementById("homeUpcoming");
        const meetings = getUpcomingMeetings();
        const upcomingArrangements = getUpcomingArrangements();
        const yearWheelEvents = getUpcomingYearWheelEvents();
        const entries = [...meetings, ...upcomingArrangements, ...yearWheelEvents]
            .sort((left, right) => left.date.localeCompare(right.date))
            .slice(0, getSelectedCount());

        if (!entries.length) {
            container.innerHTML = `<p class="home-empty">Inga kommande möten, arrangemang eller händelser.</p>`;
            return;
        }

        container.innerHTML = entries.map(entry => {
            if (entry.type === "meeting") {
                const { group, meeting } = entry;
                const sunset = window.GTScoutSunTimes?.sunsetTime(meeting.date) || "";
                return `<a class="home-upcoming-card" href="planering.html">
                    <span class="home-upcoming-kind">Träff ${escapeHtml(meeting.week || "")}</span>
                    <strong>${escapeHtml(group.name || group.level || "Planering")}</strong>
                    <span class="home-upcoming-meta">${escapeHtml(formatDateSv(meeting.date))}${meeting.location ? ` · ${escapeHtml(meeting.location)}` : ""}${sunset ? ` · ↓ ${escapeHtml(sunset)}` : ""}</span>
                </a>`;
            }
            if (entry.type === "arrangement") {
                const { item } = entry;
                const dateText = item.start_date === item.end_date
                    ? formatDateSv(item.start_date)
                    : `${formatDateSv(item.start_date)} – ${formatDateSv(item.end_date)}`;
                return `<a class="home-upcoming-card home-upcoming-card--arrangement" href="arrangemang.html">
                    <span class="home-upcoming-kind">${escapeHtml(item.type || "Arrangemang")}</span>
                    <strong>${escapeHtml(item.title)}</strong>
                    <span class="home-upcoming-meta">${escapeHtml(dateText)}${item.location ? ` · ${escapeHtml(item.location)}` : ""}</span>
                </a>`;
            }
            const { wheel, event } = entry;
            const dateText = event.start_date === event.end_date
                ? formatDateSv(event.start_date)
                : `${formatDateSv(event.start_date)} – ${formatDateSv(event.end_date)}`;
            return `<a class="home-upcoming-card home-upcoming-card--yearwheel" href="arshjul.html">
                <span class="home-upcoming-kind">${escapeHtml(wheel.name || "Årshjul")}</span>
                <strong>${escapeHtml(event.title)}</strong>
                <span class="home-upcoming-meta">${escapeHtml(dateText)}${event.location ? ` · ${escapeHtml(event.location)}` : ""}</span>
            </a>`;
        }).join("");
    }

    function renderModules() {
        const container = document.getElementById("homeModules");
        const role = window.GTScoutAuth?.getState?.().role || "gast";
        const visible = new Set(window.GTScoutNavPreferences?.getVisiblePages(role) || []);
        const modules = MODULES.filter(module => visible.has(module.id));
        container.innerHTML = modules.length
            ? modules.map(module => `<a class="home-module-card" href="${module.href}">
                <span class="home-module-icon">${module.icon}</span>
                <strong>${escapeHtml(module.label)}</strong>
                <span class="home-module-description">${escapeHtml(module.description)}</span>
            </a>`).join("")
            : `<p class="home-empty">Inga moduler valda. Anpassa menyn för att välja vilka sidor som ska synas.</p>`;
    }

    function renderHeader() {
        const state = window.GTScoutAuth?.getState?.();
        const karName = state?.karName || "";
        document.getElementById("homeKarName").textContent = karName ? `GTScout · ${karName}` : "GTScout";
        document.getElementById("homeSubtitle").textContent = state?.signedIn
            ? "Kom igång med kårens planering och aktiviteter."
            : "Du är inte inloggad – data sparas bara i den här webbläsaren.";
    }

    function openUpcomingSettings() {
        const modal = document.getElementById("homeUpcomingModal");
        const list = document.getElementById("homeUpcomingLevels");
        const available = getAvailableLevels();
        const selected = new Set(getSelectedLevels());
        const selectedTypes = new Set(getSelectedTypes());
        const selectedWheels = new Set(getSelectedWheels());
        list.innerHTML = `
            <div class="home-upcoming-settings-section">
                <label class="modal-field">
                    <span>Antal händelser</span>
                    <input id="homeUpcomingCount" type="number" min="1" max="20" value="${getSelectedCount()}">
                </label>
            </div>
            <div class="home-upcoming-settings-section" data-section="meetings">
                <label class="nav-preferences-item home-upcoming-settings-heading"><input type="checkbox" data-type="meetings" value="meetings" ${selectedTypes.has("meetings") ? "checked" : ""}><span><strong>Möten</strong></span></label>
                <div class="home-upcoming-settings-children">
                    ${available.length
                        ? available.map(level => `<label class="nav-preferences-item"><input type="checkbox" data-level="${escapeHtml(level)}" value="${escapeHtml(level)}" ${selected.has(level) ? "checked" : ""}><span>${escapeHtml(level)}</span></label>`).join("")
                        : `<p class="home-empty">Inga planeringar med avdelningar ännu.</p>`}
                </div>
            </div>
            <div class="home-upcoming-settings-section" data-section="arrangements">
                <label class="nav-preferences-item home-upcoming-settings-heading"><input type="checkbox" data-type="arrangements" value="arrangements" ${selectedTypes.has("arrangements") ? "checked" : ""}><span><strong>Arrangemang</strong></span></label>
            </div>
            <div class="home-upcoming-settings-section" data-section="yearwheel">
                <label class="nav-preferences-item home-upcoming-settings-heading"><input type="checkbox" data-type="yearwheel" value="yearwheel" ${selectedTypes.has("yearwheel") ? "checked" : ""}><span><strong>Årshjul</strong></span></label>
                <div class="home-upcoming-settings-children">
                    ${yearWheels.length
                        ? yearWheels.map(wheel => `<label class="nav-preferences-item"><input type="checkbox" data-wheel="${escapeHtml(wheel.id)}" value="${escapeHtml(wheel.id)}" ${selectedWheels.has(wheel.id) ? "checked" : ""}><span>${escapeHtml(wheel.name || "Namnlöst årshjul")}</span></label>`).join("")
                        : `<p class="home-empty">Inga årshjul ännu.</p>`}
                </div>
            </div>
        `;
        // Gråa ut undersektioner när typen är bortvald
        const updateSectionState = () => {
            const meetingsChecked = list.querySelector('input[data-type="meetings"]')?.checked;
            const yearwheelChecked = list.querySelector('input[data-type="yearwheel"]')?.checked;
            list.querySelector('[data-section="meetings"] .home-upcoming-settings-children')?.classList.toggle("home-upcoming-settings-children--disabled", !meetingsChecked);
            list.querySelector('[data-section="yearwheel"] .home-upcoming-settings-children')?.classList.toggle("home-upcoming-settings-children--disabled", !yearwheelChecked);
        };
        list.querySelectorAll('input[data-type]').forEach(checkbox => {
            checkbox.addEventListener("change", updateSectionState);
        });
        updateSectionState();
        modal.classList.remove("hidden");
    }

    function closeUpcomingSettings() {
        document.getElementById("homeUpcomingModal").classList.add("hidden");
    }

    function renderAll() {
        renderHeader();
        renderUpcoming();
        renderModules();
    }

    document.getElementById("homeUpcomingSettingsBtn").addEventListener("click", openUpcomingSettings);
    document.getElementById("closeHomeUpcomingModal").addEventListener("click", closeUpcomingSettings);
    document.getElementById("homeUpcomingModal").addEventListener("click", event => {
        if (event.target === event.currentTarget) closeUpcomingSettings();
    });
    document.getElementById("resetHomeUpcomingBtn").addEventListener("click", () => {
        document.querySelectorAll("#homeUpcomingLevels input[type='checkbox']").forEach(checkbox => {
            checkbox.checked = true;
        });
    });
    document.getElementById("saveHomeUpcomingBtn").addEventListener("click", () => {
        const selectedLevels = [...document.querySelectorAll("#homeUpcomingLevels input[data-level]:checked")].map(checkbox => checkbox.value);
        const selectedTypes = [...document.querySelectorAll("#homeUpcomingLevels input[data-type]:checked")].map(checkbox => checkbox.value);
        const selectedWheels = [...document.querySelectorAll("#homeUpcomingLevels input[data-wheel]:checked")].map(checkbox => checkbox.value);
        const count = Number(document.getElementById("homeUpcomingCount").value);
        saveLevels(selectedLevels);
        saveTypes(selectedTypes);
        saveWheels(selectedWheels);
        if (Number.isSafeInteger(count) && count >= 1 && count <= 20) saveCount(count);
        closeUpcomingSettings();
        renderUpcoming();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !document.getElementById("homeUpcomingModal").classList.contains("hidden")) {
            closeUpcomingSettings();
        }
    });

    window.GTScoutPlanningSync?.init({
        ignoreShared: true,
        getGroups: () => groups,
        applyGroups: remoteGroups => {
            groups = Array.isArray(remoteGroups) ? remoteGroups : [];
            renderUpcoming();
        }
    });

    window.GTScoutArrangements?.init({
        onChange: nextArrangements => {
            arrangements = nextArrangements || [];
            renderUpcoming();
        }
    });

    window.GTScoutYearWheelSync?.init({
        onChange: incoming => {
            yearWheels = Array.isArray(incoming) ? incoming : [];
            renderUpcoming();
        }
    });

    window.GTScoutAuth?.onChange(renderAll);
    renderAll();
})();
