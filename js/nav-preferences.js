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
        { id: "index", label: "Hem" },
        { id: "marken", label: "Märken" },
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
        gast: ["index", "marken", "aktiviteter", "kokbok"],
        ledare: ["index", "marken", "aktiviteter", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "utvecklingstrappa"],
        admin: ["index", "marken", "aktiviteter", "kokbok", "planering", "arrangemang", "arshjul", "scouter", "admin", "utvecklingstrappa"]
    };

    function getDefaultPages(role) {
        return DEFAULTS[role] || DEFAULTS.gast;
    }

    // Rollens tak – sidor som rollen maximalt får se. Scouter kräver dessutom scoutbehörighet.
    function getAllowedPages(role) {
        const canAccessScouts = Boolean(window.GTScoutAuth?.canReadScouts?.());
        return getDefaultPages(role).filter(id => id !== "scouter" || canAccessScouts);
    }

    function getStoredPages() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!Array.isArray(stored)) return null;
            // Migrera gamla val: "index" betydde Märken före namnbytet till marken.html.
            // Om "marken" saknas men "index" finns, lägg till "marken" så att Märken inte försvinner.
            const migrated = stored.includes("index") && !stored.includes("marken")
                ? [...new Set(stored.flatMap(id => id === "index" ? ["index", "marken"] : [id]))]
                : stored;
            const valid = migrated.filter(id => PAGES.some(page => page.id === id));
            if (valid.length && valid.length !== stored.length) {
                savePages(valid);
            }
            return valid.length ? valid : null;
        } catch {
            return null;
        }
    }

    function savePages(pageIds) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(pageIds));
        } catch (error) {
            console.error("Kunde inte spara navigeringsinställningar", error);
        }
    }

    // Sparade val gäller bara inom det som rollen får se – en utloggad admin
    // blir gäst och ser bara gästsidor även om fler sidor sparats.
    function getVisiblePages(role) {
        const allowed = getAllowedPages(role);
        const stored = getStoredPages();
        if (!stored) return allowed;
        const visible = allowed.filter(id => stored.includes(id));
        return visible.length ? visible : allowed;
    }

    function applyNavVisibility(role) {
        const visible = new Set(getVisiblePages(role));
        document.querySelectorAll("[data-nav-page]").forEach(link => {
            const pageId = link.dataset.navPage;
            const isVisible = visible.has(pageId);
            // Dölj bara om sidan inte är aktiv (användaren står på den)
            // och ta aldrig bort hidden på sidor som är dolda av rollbaserade skäl
            if (!isVisible && !link.classList.contains("active")) {
                link.classList.add("hidden");
                link.dataset.navHiddenByPreferences = "true";
            } else if (isVisible && link.dataset.navHiddenByPreferences === "true") {
                link.classList.remove("hidden");
                delete link.dataset.navHiddenByPreferences;
            }
        });
    }

    function openPreferencesDialog() {
        const existing = document.getElementById("navPreferencesModal");
        if (existing) existing.remove();

        const role = window.GTScoutAuth?.getState?.().role || "gast";
        const allowed = getAllowedPages(role);
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
                    ${PAGES.filter(page => allowed.includes(page.id)).map(page => `
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
            modal.querySelectorAll("input[type='checkbox']").forEach(checkbox => {
                checkbox.checked = true;
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
        getAllowedPages,
        getVisiblePages,
        applyNavVisibility,
        openPreferencesDialog
    };
})();
