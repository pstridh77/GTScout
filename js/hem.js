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
        { id: "marken", label: "Märken", description: "Märkesbiblioteket med kårens egna märken.", href: "marken.html", icon: '<img src="images/marken/varme.png" alt="">' },
        { id: "aktiviteter", label: "Aktiviteter", description: "Aktivitetsbank med genomföranden och material.", href: "aktiviteter.html", icon: '<img src="images/marken/leka.png" alt="">' },
        { id: "kokbok", label: "Recept", description: "Kårens kokbok med skalbara recept.", href: "kokbok.html", icon: '<img src="images/marken/matettan.png" alt="">' },
        { id: "planering", label: "Planeringar", description: "Terminsplaneringar med möten och märken.", href: "planering.html", icon: '<img src="images/marken/karta.png" alt="">' },
        { id: "arrangemang", label: "Arrangemang", description: "Hajker, övernattningar och läger.", href: "arrangemang.html", icon: '<img src="images/marken/bygga_permanent.png" alt="">' },
        { id: "arshjul", label: "Årshjul", description: "Årshjulet med återkommande händelser.", href: "arshjul.html", icon: '<img src="images/marken/hallbarhet.png" alt="">' },
        { id: "scouter", label: "Scouter", description: "Scoutregistret för kåren.", href: "scouter.html", icon: '<img src="images/marken/kottmarket.png" alt="">' },
        { id: "admin", label: "Administration", description: "Kårer, användare och behörigheter.", href: "admin.html", icon: '<img src="images/marken/superhjalte.png" alt="">' },
        { id: "utvecklingstrappa", label: "Utvecklingstrappa", description: "Utvecklingstrappan för scouter.", href: "utvecklingstrappa.html", icon: '<img src="images/marken/budgetera.png" alt="">' }
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
                <div class="home-module-content">
                    <strong>${escapeHtml(module.label)}</strong>
                    <span class="home-module-description">${escapeHtml(module.description)}</span>
                </div>
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
