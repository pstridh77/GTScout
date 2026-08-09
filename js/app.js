const grid = document.getElementById("badgeGrid");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const targetGroupFilter = document.getElementById("targetGroupFilter");
const programFilter = document.getElementById("programFilter");

let allMarken = [];
const filters = {
    search: "",
    category: "Alla",
    targetGroup: "Alla",
    program: "Alla"
};

async function loadMarken() {
    try {
        const response = await fetch("data/marken.json");
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.status}`);
        }

        const marken = await response.json();
        allMarken = marken;
        renderMarken(marken);
    } catch (error) {
        console.error("Failed to load marken.json", error);
        const details = document.getElementById("details");
        if (details) {
            details.innerHTML = "<p>Data kunde inte laddas. Kontrollera filen data/marken.json och kör sidan via en webserver.</p>";
        }
    }
}

function getTargetGroup(marke) {
    const rawGroup = (marke.grupp || marke.malgrupp || marke.målgrupp || "Ingen målgrupp").toString().trim();
    const normalizedGroup = rawGroup.toLowerCase();
    const targetGroupMap = {
        "familjescouting": "Familjescouting",
        "spårare": "Spårare",
        "upptäckare": "Upptäckare",
        "upptackare": "Upptäckare",
        "äventyrare": "Äventyrare",
        "aventyrare": "Äventyrare",
        "utmanare": "Utmanare",
        "rover": "Rover"
    };

    return targetGroupMap[normalizedGroup] || rawGroup || "Ingen målgrupp";
}

function populateFilters(marken) {
    const categories = [...new Set(marken.map(marke => marke.kategori || "Övrigt"))].sort();
    const targetGroups = [...new Set(marken.map(getTargetGroup))];
    const targetGroupOrder = ["Familjescouting", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];
    const orderedTargetGroups = targetGroups.sort((a, b) => {
        const indexA = targetGroupOrder.indexOf(a);
        const indexB = targetGroupOrder.indexOf(b);

        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }

        if (indexA !== -1) {
            return -1;
        }

        if (indexB !== -1) {
            return 1;
        }

        return a.localeCompare(b, "sv");
    });

    categoryFilter.innerHTML = [
        '<option value="Alla">Alla kategorier</option>',
        ...categories.map(category => `<option value="${category}" ${filters.category === category ? "selected" : ""}>${category}</option>`)
    ].join("");

    targetGroupFilter.innerHTML = [
        '<option value="Alla">Alla målgrupper</option>',
        ...orderedTargetGroups.map(group => `<option value="${group}" ${filters.targetGroup === group ? "selected" : ""}>${group}</option>`)
    ].join("");

    const programs = [...new Set(marken.flatMap(marke => Array.isArray(marke.program) ? marke.program : [marke.program || "Båda"]))].sort((a, b) => a.localeCompare(b, "sv"));
    programFilter.innerHTML = [
        '<option value="Alla">Alla program</option>',
        ...programs.map(program => `<option value="${program}" ${filters.program === program ? "selected" : ""}>${program}</option>`)
    ].join("");
}

function getFilteredMarken() {
    const searchTerm = filters.search.trim().toLowerCase();

    return allMarken.filter(marke => {
        const matchesCategory = filters.category === "Alla" || (marke.kategori || "Övrigt") === filters.category;
        const matchesTargetGroup = filters.targetGroup === "Alla" || getTargetGroup(marke) === filters.targetGroup;
        const badgePrograms = Array.isArray(marke.program) ? marke.program : [marke.program || "Båda"];
        const matchesProgram = filters.program === "Alla" || badgePrograms.includes(filters.program);

        if (!searchTerm) {
            return matchesCategory && matchesTargetGroup && matchesProgram;
        }

        const searchableText = [
            marke.namn,
            marke.kategori,
            marke.grupp,
            marke.malgrupp,
            marke.inledning,
            ...(marke.kriterier || [])
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        const matchesSearch = searchableText.includes(searchTerm);
        return matchesCategory && matchesTargetGroup && matchesProgram && matchesSearch;
    });
}

function renderMarken(marken) {
    allMarken = marken;
    populateFilters(marken);

    const filteredMarken = getFilteredMarken();
    grid.innerHTML = "";

    if (filteredMarken.length === 0) {
        grid.innerHTML = '<p class="no-results">Inga märken matchar filtret.</p>';
        return;
    }

    const categories = filteredMarken.reduce((acc, marke) => {
        const key = marke.kategori || "Övrigt";
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(marke);
        return acc;
    }, {});

    const targetGroupOrder = ["Familjescouting", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];

    Object.keys(categories).forEach(category => {
        const categoryGroup = document.createElement("section");
        categoryGroup.className = "category-group";

        const heading = document.createElement("h2");
        heading.className = "category-heading";
        heading.textContent = category;
        categoryGroup.appendChild(heading);

        const badgeRow = document.createElement("div");
        badgeRow.className = "category-badges";

        const groupedByTargetGroup = categories[category].reduce((acc, marke) => {
            const targetGroup = getTargetGroup(marke);
            if (!acc[targetGroup]) {
                acc[targetGroup] = [];
            }
            acc[targetGroup].push(marke);
            return acc;
        }, {});

        targetGroupOrder.forEach(targetGroup => {
            const groupItems = groupedByTargetGroup[targetGroup] || [];
            if (groupItems.length === 0) {
                return;
            }

            const slot = document.createElement("div");
            slot.className = "target-group-slot";

            const cards = document.createElement("div");
            cards.className = "target-group-cards";

            groupItems.forEach(marke => {
                const card = document.createElement("div");
                card.className = "badge";
                card.innerHTML = `
                    <img src="${marke.bild}" alt="${marke.namn}">
                    <h3>${marke.namn}</h3>
                    <p>${getTargetGroup(marke)}</p>
                `;
                card.addEventListener("click", () => showPopup(marke));
                cards.appendChild(card);
            });

            slot.appendChild(cards);
            badgeRow.appendChild(slot);
        });

        categoryGroup.appendChild(badgeRow);
        grid.appendChild(categoryGroup);
    });
}

function handleFilterChange() {
    filters.search = searchInput.value;
    filters.category = categoryFilter.value;
    filters.targetGroup = targetGroupFilter.value;
    filters.program = programFilter.value;
    renderMarken(allMarken);
}

searchInput.addEventListener("input", handleFilterChange);
categoryFilter.addEventListener("change", handleFilterChange);
targetGroupFilter.addEventListener("change", handleFilterChange);
programFilter.addEventListener("change", handleFilterChange);

loadMarken();

function createPopup() {
    const popup = document.createElement("div");
    popup.id = "detailPopup";
    popup.className = "detail-popup hidden";

    popup.innerHTML = `
        <div class="detail-popup-content">
            <button class="close-popup" type="button">&times;</button>
            <div class="popup-body"></div>
        </div>
    `;

    popup.querySelector(".close-popup").addEventListener("click", () => {
        popup.classList.add("hidden");
    });

    popup.addEventListener("click", (event) => {
        if (event.target === popup) {
            popup.classList.add("hidden");
        }
    });

    document.body.appendChild(popup);
    return popup;
}

const popup = createPopup();

function getCategoryIconPath(marke) {
    const targetGroup = getTargetGroup(marke);
    const normalizedTargetGroup = targetGroup.toLowerCase();
    const iconMap = {
        "familjescouting": "./images/icons/familjescout.png",
        "spårare": "./images/icons/sparare.png",
        "upptäckare": "./images/icons/upptackare.png",
        "äventyrare": "./images/icons/aventyrare.png",
        "utmanare": "./images/icons/utmanare.png",
        "rover": "./images/icons/rover.png"
    };

    return iconMap[normalizedTargetGroup] || "";
}

function showPopup(marke) {
    const body = popup.querySelector(".popup-body");
    const criteriaList = marke.kriterier
        ? marke.kriterier.map(k => `<li>${k}</li>`).join("")
        : "";
    const categoryIcon = getCategoryIconPath(marke);
    const targetGroup = getTargetGroup(marke);

    body.innerHTML = `
        <div class="detail-popup-header">
            <h2>${marke.namn}</h2>
            ${categoryIcon ? `<img src="${categoryIcon}" alt="${targetGroup}" class="detail-category-icon">` : ""}
        </div>
        <div class="detail-image-row">
            <img
                src="${marke.bild}"
                alt="${marke.namn}"
                class="detail-image">
        </div>

        <div class="detail-text">
            <div class="detail-category-row">
                <p><strong>Kategori:</strong> ${marke.kategori}</p>
            </div>
            ${marke.inledning ? `<p class="detail-introduction">${marke.inledning}</p>` : ""}
            
            ${criteriaList ? `
                <div class="detail-criteria">
                    <strong>Kriterier:</strong>
                    <ul>${criteriaList}</ul>
                </div>
            ` : ""}
            <p><strong>Målgrupp:</strong> ${targetGroup}</p>
            <p><strong>Program:</strong> ${(Array.isArray(marke.program) ? marke.program : [marke.program || "Båda"]).join(", ")}</p>
        </div>
    `;
    popup.classList.remove("hidden");
}

