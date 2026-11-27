(function () {
    const grid = document.getElementById("songGrid");
    const search = document.getElementById("songSearch");
    const categoryFilter = document.getElementById("songCategoryFilter");
    const status = document.getElementById("songStatus");
    const dialog = document.getElementById("songDialog");
    const title = document.getElementById("songDetailTitle");
    const category = document.getElementById("songDetailCategory");
    const info = document.getElementById("songDetailInfo");
    const lyrics = document.getElementById("songDetailLyrics");
    const shareDialog = document.getElementById("songShareDialog");
    const shareUrl = document.getElementById("songShareUrl");
    const shareStatus = document.getElementById("songShareStatus");
    const sharedSongId = new URL(window.location.href).searchParams.get("song");
    const boldPattern = /\*\*([^\r\n]+?)\*\*/g;
    const categories = window.GTScoutSongCatalog.categories;
    const collapsedCategories = new Set();
    let songs = [];
    let loaded = false;
    let activeSong = null;

    function renderLyrics(text) {
        const nodes = [];
        let lastIndex = 0;
        for (const match of text.matchAll(boldPattern)) {
            nodes.push(document.createTextNode(text.slice(lastIndex, match.index)));
            const strong = document.createElement("strong");
            strong.textContent = match[1];
            nodes.push(strong);
            lastIndex = match.index + match[0].length;
        }
        nodes.push(document.createTextNode(text.slice(lastIndex)));
        lyrics.replaceChildren(...nodes);
    }

    function songPreview(song) {
        if (song.info && song.info.trim()) return song.info;
        const text = song.text.replace(boldPattern, "$1").replace(/\s+/g, " ").trim();
        const characters = Array.from(text);
        if (characters.length <= 160) return text;
        return characters.slice(0, 160).join("").trimEnd() + "…";
    }

    function openSong(song) {
        activeSong = song;
        title.textContent = song.titel;
        category.textContent = song.kategori;
        info.textContent = song.info || "";
        info.hidden = !song.info;
        renderLyrics(song.text);
        window.GTScoutSongPlanSelection?.setSong(song);
        dialog.showModal();
    }

    window.GTScoutSongModal = { open: openSong };

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
        const visible = songs.filter(song =>
            (!categoryFilter.value || song.kategori === categoryFilter.value)
            && `${song.titel}\n${song.text.replace(boldPattern, "$1")}`.toLocaleLowerCase("sv").includes(query));
        const groups = new Map();
        visible.forEach(song => {
            if (!groups.has(song.kategori)) groups.set(song.kategori, []);
            groups.get(song.kategori).push(song);
        });
        grid.replaceChildren(...[...groups].sort(([left], [right]) => categories.indexOf(left) - categories.indexOf(right)).map(([groupCategory, items]) => {
            const group = document.createElement("details");
            group.className = "recipe-meal-group";
            group.open = !collapsedCategories.has(groupCategory);
            const summary = document.createElement("summary");
            summary.className = "recipe-meal-summary";
            const heading = document.createElement("strong");
            heading.textContent = groupCategory;
            const count = document.createElement("span");
            count.textContent = `${items.length} st.`;
            summary.append(heading, count);
            const cards = document.createElement("div");
            cards.className = "recipe-meal-cards";
            cards.replaceChildren(...items.map(song => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "recipe-card song-card";
                const songCategory = document.createElement("span");
                songCategory.className = "recipe-category";
                songCategory.textContent = song.kategori;
                button.append(songCategory);
                const name = document.createElement("span");
                name.className = "song-card-title";
                name.textContent = song.titel;
                button.append(name);
                const songInfo = document.createElement("span");
                songInfo.className = "recipe-description";
                songInfo.textContent = songPreview(song);
                button.append(songInfo);
                button.addEventListener("click", () => openSong(song));
                return button;
            }));
            group.append(summary, cards);
            group.addEventListener("toggle", () => {
                if (group.open) collapsedCategories.delete(groupCategory);
                else collapsedCategories.add(groupCategory);
            });
            return group;
        }));
        status.textContent = visible.length ? "" : songs.length ? "Inga sånger matchar filtreringen." : "Inga sånger ännu.";
        status.hidden = visible.length > 0;
    }

    search.addEventListener("input", renderSongs);
    categoryFilter.addEventListener("change", renderSongs);
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

    window.GTScoutSongCatalog.load()
        .then(data => {
            songs = data.slice().sort((left, right) => left.titel.trim().localeCompare(right.titel.trim(), "sv"));
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
