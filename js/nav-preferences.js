/**
 * Anpassning av huvudnavigationen.
 *
 * Rollbaserade standardvärden styr vilka sidor som visas som standard.
 * Användaren kan själv anpassa vilka sidor som ska synas via en dialog
 * under menyn. Valet sparas i localStorage per webbläsare.
 */
(function () {
    const STORAGE_KEY = "gtscout_nav_preferences";

    const PAGES = [
        { id: "index", label: "Märken" },
        { id: "aktiviteter", label: "Aktiviteter" },
        { id: "kokbok", label: "Recept" },
        { id: "planering", label: "Planeringar" },
        { id: "arrangemang", label: "Arrangemang" },
        { id: "arshjul", label: "Årshjul" },
        { id: "scouter", label: "Scouter" },
        { id: "admin", label: "Administration" },
        { id: "utvecklingstrappa", label: "Utvecklingstrappa" }
    ];

    const DEFAULTS = {
        gast: ["index", "aktiviteter", "kokbok"],
        ledare: ["index", "aktiviteter", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "utvecklingstrappa"],
        admin: ["index", "aktiviteter", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "admin", "utvecklingstrappa"]
    };

    function getDefaultPages(role) {
        return DEFAULTS[role] || DEFAULTS.gast;
    }

    function getStoredPages() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (Array.isArray(stored) && stored.every(id => PAGES.some(page => page.id === id))) {
                return stored;
            }
        } catch {
        }
        return null;
    }

    function savePages(pageIds) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(pageIds));
        } catch (error) {
            console.error("Kunde inte spara navigeringsinställningar", error);
        }
    }

    function getVisiblePages(role) {
        return getStoredPages() || getDefaultPages(role);
    }

    function applyNavVisibility(role) {
        const visible = new Set(getVisiblePages(role));
        document.querySelectorAll("[data-nav-page]").forEach(link => {
            const pageId = link.dataset.navPage;
            const isVisible = visible.has(pageId);
            // Dölj bara om sidan inte är aktiv (användaren står på den)
            if (!isVisible && !link.classList.contains("active")) {
                link.classList.add("hidden");
            } else {
                link.classList.remove("hidden");
            }
        });
    }

    function openPreferencesDialog() {
        const existing = document.getElementById("navPreferencesModal");
        if (existing) existing.remove();

        const role = window.GTScoutAuth?.getState?.().role || "gast";
        const visible = new Set(getVisiblePages(role));
        const modal = document.createElement("div");
        modal.id = "navPreferencesModal";
        modal.className = "modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "navPreferencesTitle");
        modal.innerHTML = `
            <div class="modal-content">
                <button class="close-popup" type="button" aria-label="Stäng">&times;</button>
                <h2 id="navPreferencesTitle">Anpassa meny</h2>
                <p class="modal-field-hint">Välj vilka sidor som ska synas i menyn. Ändringen sparas i den här webbläsaren.</p>
                <div class="nav-preferences-list">
                    ${PAGES.map(page => `
                        <label class="nav-preferences-item">
                            <input type="checkbox" value="${page.id}" ${visible.has(page.id) ? "checked" : ""}>
                            <span>${page.label}</span>
                        </label>
                    `).join("")}
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary" type="button" data-nav-reset>Återställ till standard</button>
                    <span class="modal-actions-spacer"></span>
                    <button class="btn-primary" type="button" data-nav-save>Spara</button>
                </div>
            </div>
        `;
        document.body.append(modal);

        const close = () => {
            modal.remove();
            document.removeEventListener("keydown", handleEscape);
        };
        const handleEscape = event => {
            if (event.key === "Escape") close();
        };
        document.addEventListener("keydown", handleEscape);
        modal.querySelector(".close-popup").addEventListener("click", close);
        modal.addEventListener("click", event => {
            if (event.target === modal) close();
        });
        modal.querySelector("[data-nav-reset]").addEventListener("click", () => {
            const defaults = getDefaultPages(role);
            modal.querySelectorAll("input[type='checkbox']").forEach(checkbox => {
                checkbox.checked = defaults.includes(checkbox.value);
            });
        });
        modal.querySelector("[data-nav-save]").addEventListener("click", () => {
            const selected = [...modal.querySelectorAll("input[type='checkbox']:checked")].map(checkbox => checkbox.value);
            savePages(selected);
            applyNavVisibility(role);
            close();
        });
    }

    window.GTScoutNavPreferences = {
        PAGES,
        getDefaultPages,
        getVisiblePages,
        applyNavVisibility,
        openPreferencesDialog
    };
})();
