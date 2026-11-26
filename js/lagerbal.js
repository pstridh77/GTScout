(function () {
    const grid = document.getElementById("songGrid");
    const search = document.getElementById("songSearch");
    const status = document.getElementById("songStatus");
    const dialog = document.getElementById("songDialog");
    const title = document.getElementById("songDetailTitle");
    const author = document.getElementById("songDetailAuthor");
    const lyrics = document.getElementById("songDetailLyrics");
    let songs = [];
    let loaded = false;

    function renderSongs() {
        if (!loaded) return;
        const query = search.value.trim().toLocaleLowerCase("sv");
        const visible = songs.filter(song => `${song.titel}\n${song.text}`.toLocaleLowerCase("sv").includes(query));
        grid.replaceChildren(...visible.map(song => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "activity-card song-card";
            const name = document.createElement("span");
            name.className = "song-card-title";
            name.textContent = song.titel;
            button.append(name);
            if (song.upphovsperson) {
                const byline = document.createElement("span");
                byline.className = "song-card-author";
                byline.textContent = song.upphovsperson;
                button.append(byline);
            }
            button.addEventListener("click", () => {
                title.textContent = song.titel;
                author.textContent = song.upphovsperson || "";
                author.hidden = !song.upphovsperson;
                lyrics.textContent = song.text;
                dialog.showModal();
            });
            return button;
        }));
        status.textContent = visible.length ? "" : songs.length ? "Inga sånger matchar sökningen." : "Inga sånger ännu.";
    }

    search.addEventListener("input", renderSongs);
    document.getElementById("closeSongDialog").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            dialog.close();
        }
    });

    fetch("data/sanger.json")
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (!Array.isArray(data) || data.some(song => !song || typeof song.id !== "string" || !song.id.trim()
                || typeof song.titel !== "string" || !song.titel.trim() || typeof song.text !== "string" || !song.text.trim()
                || (song.upphovsperson != null && typeof song.upphovsperson !== "string"))
                || new Set(data.map(song => song.id)).size !== data.length) {
                throw new Error("Sångfilen har ett ogiltigt format.");
            }
            songs = data.slice().sort((left, right) => left.titel.localeCompare(right.titel, "sv"));
            loaded = true;
            renderSongs();
        })
        .catch(error => {
            console.error("Kunde inte hämta sångerna", error);
            status.textContent = "Kunde inte hämta sångerna. Kontrollera anslutningen och ladda om sidan.";
        });
})();
