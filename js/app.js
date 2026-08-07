const marken = [
    {
        namn: "Värme",
        grupp: "Familjescout",
        kategori: "Eld",
        bild: "images/marken/varme.png",
        inledning: "Genom att jobba med intressemärket Värme övar du på att bli trygg vid eld.",
        kriterier: [
            "Våga hålla i en tändsticka som brinner.",
            "Blåsa ut en låga.",
            "Prata om hur farlig eld är.",
            "Veta hur man håller i en lykta."
        ]
    },
    {
        namn: "Tända",
        grupp: "Spårare",
        kategori: "Eld",
        bild: "images/marken/tanda.png",
        inledning: "Genom att jobba med intressemärket Tända övar du på grunderna för att elda.",
        kriterier: [
            "Kunna tända en tändsticka.",
            "Provat att tända lykta och eld.",
            "Känna till risker med eld.",
            "Veta vad du gör om du bränner dig."
        ]
    },
    {
        namn: "Brinna",
        grupp: "Upptäckare",
        kategori: "Eld",
        bild: "images/marken/brinna.png",
        inledning: "Genom att jobba med intressemärket Brinna lär du dig hur man tar ansvar för eld och värme.",
        kriterier: [
            "Känna igen vilken eld som är säker.",
            "Kunna göra upp en kontrollerad eld.",
            "Förstå vad som händer om eld sprider sig.",
            "Veta hur du släcker en eld på ett säkert sätt."
        ]
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
            ${marke.inledning ? `<p class="detail-introduction">${marke.inledning}</p>` : ""}
            <p><strong>Målgrupp:</strong> ${marke.grupp}</p>
            <p><strong>Kategori:</strong> ${marke.kategori}</p>
            ${criteriaList ? `
                <div class="detail-criteria">
                    <strong>Kriterier:</strong>
                    <ul>${criteriaList}</ul>
                </div>
            ` : ""}
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