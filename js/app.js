const grid = document.getElementById("badgeGrid");

async function loadMarken() {
    try {
        const response = await fetch("data/marken.json");
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.status}`);
        }

        const marken = await response.json();
        renderMarken(marken);
    } catch (error) {
        console.error("Failed to load marken.json", error);
        const details = document.getElementById("details");
        if (details) {
            details.innerHTML = "<p>Data kunde inte laddas. Kontrollera filen data/marken.json och kör sidan via en webserver.</p>";
        }
    }
}

function renderMarken(marken) {
    marken.forEach(marke => {
        const card = document.createElement("div");
        card.className = "badge";
        card.innerHTML = `
            <img src="${marke.bild}" alt="${marke.namn}">
            <h3>${marke.namn}</h3>
            <p>${marke.grupp || marke.malgrupp || "Ingen målgrupp"}</p>
        `;
        card.addEventListener("click", () => showPopup(marke));
        grid.appendChild(card);
    });
}

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
        <img
            src="${marke.bild}"
            alt="${marke.namn}"
            class="detail-image">

        <div class="detail-text">
            <h2>${marke.namn}</h2>
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