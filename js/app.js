const marken = [
    {
        namn: "Värme",
        grupp: "Familjescout",
        bild: "images/marken/varme.png"
    },
    {
        namn: "Tända",
        grupp: "Spårare",
        bild: "images/marken/tanda.png"
    },
    {
        namn: "Brinna",
        grupp: "Upptäckare",
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
    alert(marke.namn);
    });

    grid.appendChild(card);
});
