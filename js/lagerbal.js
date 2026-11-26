(function () {
    const grid = document.getElementById("songGrid");
    const search = document.getElementById("songSearch");
    const status = document.getElementById("songStatus");
    const dialog = document.getElementById("songDialog");
    const title = document.getElementById("songDetailTitle");
    const author = document.getElementById("songDetailAuthor");
    const lyrics = document.getElementById("songDetailLyrics");
    const shareDialog = document.getElementById("songShareDialog");
    const shareUrl = document.getElementById("songShareUrl");
    const shareStatus = document.getElementById("songShareStatus");
    const sharedSongId = new URL(window.location.href).searchParams.get("song");
    let songs = [];
    let loaded = false;
    let activeSong = null;

    function openSong(song) {
        activeSong = song;
        title.textContent = song.titel;
        author.textContent = song.upphovsperson || "";
        author.hidden = !song.upphovsperson;
        lyrics.textContent = song.text;
        dialog.showModal();
    }

    async function copyShareUrl(initial = false) {
        const url = shareUrl.value;
        shareUrl.select();
        try {
            await navigator.clipboard.writeText(url);
            if (shareDialog.open && shareUrl.value === url) {
                shareStatus.textContent = initial ? "Länken har kopierats. Du kan också kopiera den manuellt." : "Länken har kopierats.";
            }
        } catch (error) {
            if (shareDialog.open && shareUrl.value === url) {
                shareStatus.textContent = "Kunde inte kopiera länken. Markera den och kopiera manuellt.";
            }
        }
    }

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
            button.addEventListener("click", () => openSong(song));
            return button;
        }));
        status.textContent = visible.length ? "" : songs.length ? "Inga sånger matchar sökningen." : "Inga sånger ännu.";
        status.hidden = visible.length > 0;
    }

    search.addEventListener("input", renderSongs);
    document.getElementById("closeSongDialog").addEventListener("click", () => dialog.close());
    document.getElementById("shareSongBtn").addEventListener("click", () => {
        const url = new URL("lagerbal.html", window.location.href);
        url.searchParams.set("song", activeSong.id);
        shareUrl.value = url.href;
        shareStatus.textContent = "";
        shareDialog.showModal();
        copyShareUrl(true);
    });
    document.getElementById("copySongShareBtn").addEventListener("click", () => copyShareUrl());
    document.getElementById("closeSongShareDialog").addEventListener("click", () => shareDialog.close());
    document.getElementById("cancelSongShareBtn").addEventListener("click", () => shareDialog.close());
    shareDialog.addEventListener("click", event => {
        if (event.target === shareDialog) shareDialog.close();
    });
    shareDialog.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            event.preventDefault();
            shareDialog.close();
        }
    });
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
            if (sharedSongId) {
                const song = songs.find(item => item.id === sharedSongId);
                if (song) openSong(song);
                else {
                    status.hidden = false;
                    status.textContent = "Sången i länken kunde inte hittas.";
                }
            }
        })
        .catch(error => {
            console.error("Kunde inte hämta sångerna", error);
            status.textContent = "Kunde inte hämta sångerna. Kontrollera anslutningen och ladda om sidan.";
        });
})();
