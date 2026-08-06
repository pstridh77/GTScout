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

marken.forEach(marke => {

    const card = document.createElement("div");

    card.className = "badge";

    card.innerHTML = `
        <img src="${marke.bild}" alt="${marke.namn}">
        <h3>${marke.namn}</h3>
        <p>${marke.grupp}</p>
    `;

    

    card.addEventListener("click", () => {

        document.getElementById("details").innerHTML = `
            <img
                src="${marke.bild}"
                alt="${marke.namn}"
                class="detail-image">

            <div class="detail-text">
                <h2>${marke.namn}</h2>
                <p>
                    <strong>Målgrupp:</strong>
                    ${marke.grupp}
                </p>
                <p>
                    <strong>Kategori:</strong>
                    ${marke.kategori}
                </p>
            </div>
        `;

    });

    grid.appendChild(card);

});