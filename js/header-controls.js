(function () {
    const filtersToggle = document.getElementById("filtersVisibilityToggle");
    const filters = document.querySelector("[data-page-filters]");
    const menuButton = document.getElementById("planningActionsBtn");
    const menu = document.getElementById("planningActionsDropdown");
    if (!filtersToggle && !menuButton) return;

    const header = document.querySelector(".site-header");
    if (header) {
        const updateHeaderHeight = () => {
            document.documentElement.style.setProperty("--site-header-height", `${header.offsetHeight}px`);
        };
        updateHeaderHeight();
        new ResizeObserver(updateHeaderHeight).observe(header);
    }

    function updateFilters() {
        const visible = !filters.classList.contains("filters--hidden");
        const filterLabel = filtersToggle.dataset.filterLabel || "sökfält och filter";
        const label = visible ? `Dölj ${filterLabel}` : `Visa ${filterLabel}`;
        filtersToggle.setAttribute("aria-label", label);
        filtersToggle.setAttribute("title", label);
        filtersToggle.setAttribute("aria-pressed", String(visible));
        filtersToggle.setAttribute("aria-expanded", String(visible));
    }

    if (filtersToggle && filters) {
        const preferenceKey = filters.dataset.filterPreference;
        if (preferenceKey) {
            try {
                const saved = localStorage.getItem(preferenceKey);
                const visible = saved === "true" || (saved !== "false" && !window.matchMedia("(max-width: 600px)").matches);
                filters.classList.toggle("filters--hidden", !visible);
            } catch (error) {
                console.error("Kunde inte läsa filterradens visningsläge", error);
                filters.classList.toggle("filters--hidden", window.matchMedia("(max-width: 600px)").matches);
            }
        }
        filtersToggle.addEventListener("click", () => {
            filters.classList.toggle("filters--hidden");
            updateFilters();
            if (preferenceKey) {
                try {
                    localStorage.setItem(preferenceKey, String(!filters.classList.contains("filters--hidden")));
                } catch (error) {
                    console.error("Kunde inte spara filterradens visningsläge", error);
                }
            }
            if (!filters.classList.contains("filters--hidden")) {
                filters.querySelector("input")?.focus();
            }
        });
        updateFilters();
    }

    if (!menuButton || !menu) return;

    function closeMenu() {
        menu.classList.add("hidden");
        menuButton.setAttribute("aria-expanded", "false");
    }

    menuButton.addEventListener("click", () => {
        const open = menu.classList.contains("hidden");
        menu.classList.toggle("hidden", !open);
        menuButton.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("click", event => {
        if (!menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !menu.classList.contains("hidden")) {
            closeMenu();
            menuButton.focus();
        }
    });

    menu.addEventListener("click", event => {
        if (event.target.closest("summary")) return;
        const item = event.target.closest("a, button");
        if (!item) return;
        closeMenu();
        if (item.dataset.headerAction) {
            document.getElementById(item.dataset.headerAction)?.click();
        }
    });

    const sections = [...menu.querySelectorAll(".site-menu-section")];
    function expandDesktopSections() {
        if (window.matchMedia("(min-width: 901px)").matches) {
            sections.forEach(section => { section.open = true; });
        }
    }
    sections.forEach(section => section.addEventListener("toggle", expandDesktopSections));
    window.addEventListener("resize", expandDesktopSections);
    expandDesktopSections();
})();