const marken = [
    {
        namn: "Värme",
        grupp: "Familjescout",
        kategori: "Eld",
        bild: "images/marken/varme.png"
    },
    {
        namn: "Tända",
        grupp: "Spårare",
        kategori: "Eld",
        bild: "images/marken/tanda.png"
    },
    {
        namn: "Brinna",
        grupp: "Upptäckare",
        kategori: "Eld",
        bild: "images/marken/brinna.png"
    }
];

const grid = document.getElementById("badgeGrid");

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
    body.innerHTML = `
        <img
            src="${marke.bild}"
            alt="${marke.namn}"
            class="detail-image">

        <div class="detail-text">
            <h2>${marke.namn}</h2>
            <p><strong>Målgrupp:</strong> ${marke.grupp}</p>
            <p><strong>Kategori:</strong> ${marke.kategori}</p>
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