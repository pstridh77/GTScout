(function () {
    const categories = ["Sång", "Rop", "Lek"];
    const customPrefix = "custom:";
    const isCustomId = id => typeof id === "string" && id.startsWith(customPrefix);
    const createCustomId = () => customPrefix + crypto.randomUUID();

    let loading;
    async function fetchSongs() {
        const response = await fetch("data/sanger.json");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data) || data.some(song => !song || typeof song.id !== "string" || !song.id.trim() || isCustomId(song.id)
            || typeof song.titel !== "string" || !song.titel.trim() || typeof song.text !== "string" || !song.text.trim()
            || !categories.includes(song.kategori)
            || (song.info != null && typeof song.info !== "string"))
            || new Set(data.map(song => song.id)).size !== data.length) {
            throw new Error("Sångfilen har ett ogiltigt format.");
        }
        return data;
    }

    function load() {
        if (!loading) loading = fetchSongs();
        return loading;
    }

    window.GTScoutSongCatalog = { categories, load, isCustomId, createCustomId };
})();
