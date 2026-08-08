const grid = document.getElementById("badgeGrid");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const targetGroupFilter = document.getElementById("targetGroupFilter");

let allMarken = [];
const filters = {
    search: "",
    category: "Alla",
    targetGroup: "Alla"
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

function populateFilters(marken) {
    const categories = [...new Set(marken.map(marke => marke.kategori || "Övrigt"))].sort();
    const targetGroups = [...new Set(marken.map(marke => marke.grupp || marke.malgrupp || "Ingen målgrupp"))];
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
}

function getFilteredMarken() {
    const searchTerm = filters.search.trim().toLowerCase();

    return allMarken.filter(marke => {
        const matchesCategory = filters.category === "Alla" || (marke.kategori || "Övrigt") === filters.category;
        const matchesTargetGroup = filters.targetGroup === "Alla" || (marke.grupp || marke.malgrupp || "Ingen målgrupp") === filters.targetGroup;

        if (!searchTerm) {
            return matchesCategory && matchesTargetGroup;
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
        return matchesCategory && matchesTargetGroup && matchesSearch;
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

    Object.keys(categories).forEach(category => {
        const categoryGroup = document.createElement("section");
        categoryGroup.className = "category-group";

        const heading = document.createElement("h2");
        heading.className = "category-heading";
        heading.textContent = category;
        categoryGroup.appendChild(heading);

        const badgeRow = document.createElement("div");
        badgeRow.className = "category-badges";

        categories[category].forEach(marke => {
            const card = document.createElement("div");
            card.className = "badge";
            const targetGroup = marke.grupp || marke.malgrupp || "Ingen målgrupp";
            const targetGroupColors = {
                "Familjescouting": "#652483",
                "Spårare": "#41a62a",
                "Upptäckare": "#00a8e1",
                "Äventyrare": "#e95f13",
                "Utmanare": "#da005e",
                "Rover": "#837a02"
            };
            const color = targetGroupColors[targetGroup];
            if (color) {
                card.style.backgroundColor = color;
                card.style.color = "white";
            }
            card.innerHTML = `
                <img src="${marke.bild}" alt="${marke.namn}">
                <h3>${marke.namn}</h3>
                <p>${targetGroup}</p>
            `;
            card.addEventListener("click", () => showPopup(marke));
            badgeRow.appendChild(card);
        });

        categoryGroup.appendChild(badgeRow);
        grid.appendChild(categoryGroup);
    });
}

function handleFilterChange() {
    filters.search = searchInput.value;
    filters.category = categoryFilter.value;
    filters.targetGroup = targetGroupFilter.value;
    renderMarken(allMarken);
}

searchInput.addEventListener("input", handleFilterChange);
categoryFilter.addEventListener("change", handleFilterChange);
targetGroupFilter.addEventListener("change", handleFilterChange);

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

function showPopup(marke) {
    const body = popup.querySelector(".popup-body");
    const criteriaList = marke.kriterier
        ? marke.kriterier.map(k => `<li>${k}</li>`).join("")
        : "";

    body.innerHTML = `
        <h2>${marke.namn}</h2>
        <img
            src="${marke.bild}"
            alt="${marke.namn}"
            class="detail-image">

        <div class="detail-text">
            
            <p><strong>Kategori:</strong> ${marke.kategori}</p>
            ${marke.inledning ? `<p class="detail-introduction">${marke.inledning}</p>` : ""}
            
            
            ${criteriaList ? `
                <div class="detail-criteria">
                    <strong>Kriterier:</strong>
                    <ul>${criteriaList}</ul>
                </div>
            ` : ""}
            <p><strong>Målgrupp:</strong> ${marke.grupp || marke.malgrupp || "Ingen målgrupp"}</p>
        </div>
    `;
    popup.classList.remove("hidden");
}

marken.forEach(marke => {
    const card = document.createElement("div");
    card.className = "badge";
    card.innerHTML = `
        <img src="${marke.bild}" alt="${marke.namn}">
        <h3>${marke.namn}</h3>
        <p>${marke.grupp}</p>
    `;
    card.addEventListener("click", () => showPopup(marke));
    grid.appendChild(card);
});