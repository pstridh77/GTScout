(function () {
    const filtersToggle = document.getElementById("filtersVisibilityToggle");
    const filters = document.querySelector("[data-page-filters]");
    const menuButton = document.getElementById("planningActionsBtn");
    const menu = document.getElementById("planningActionsDropdown");
    if (!filtersToggle || !filters || !menuButton || !menu) return;

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
        const label = visible ? "Dölj sökfält och filter" : "Visa sökfält och filter";
        filtersToggle.setAttribute("aria-label", label);
        filtersToggle.setAttribute("title", label);
        filtersToggle.setAttribute("aria-pressed", String(visible));
        filtersToggle.setAttribute("aria-expanded", String(visible));
    }

    filtersToggle.addEventListener("click", () => {
        filters.classList.toggle("filters--hidden");
        updateFilters();
        if (!filters.classList.contains("filters--hidden")) {
            filters.querySelector("input")?.focus();
        }
    });
    updateFilters();

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