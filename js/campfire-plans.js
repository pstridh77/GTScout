(function () {
    const list = document.getElementById("campfirePlansList");
    const section = document.getElementById("campfirePlansSection");
    const count = document.getElementById("campfirePlansCount");
    const searchToggle = document.getElementById("campfirePlansSearchToggle");
    const searchField = document.getElementById("campfirePlansSearchField");
    const search = document.getElementById("campfirePlansSearch");
    const noResults = document.getElementById("campfirePlansNoResults");
    const status = document.getElementById("campfirePlansStatus");
    const newButton = document.getElementById("newCampfirePlan");
    const dialog = document.getElementById("campfirePlanDialog");
    const form = document.getElementById("campfirePlanForm");
    const title = document.getElementById("campfirePlanTitle");
    const description = document.getElementById("campfirePlanDescription");
    const pickerContainer = document.getElementById("campfirePlanPicker");
    const formStatus = document.getElementById("campfirePlanFormStatus");
    const saveButton = document.getElementById("saveCampfirePlan");
    const localNotice = document.getElementById("campfireLocalNotice");
    const shareDialog = document.getElementById("campfireShareDialog");
    const shareUrl = document.getElementById("campfireShareUrl");
    const shareStatus = document.getElementById("campfireShareStatus");
    const snapshotParam = new URLSearchParams(window.location.hash.slice(1));
    const maxShareUrlLength = 8000;
    window.addEventListener("hashchange", () => {
        if (snapshotParam.has("campfire") || new URLSearchParams(window.location.hash.slice(1)).has("campfire")) {
            window.location.reload();
        }
    });
    const expanded = new Set();
    let plans = [];
    let syncState = { loading: true, error: false };
    let songs = [];
    let catalogState = "loading";
    let activePlan = null;
    let actionMessage = "";
    let trigger = null;
    let busy = false;
    let editorContext = null;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    function decodeSnapshot(encoded) {
        if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || window.location.href.length > maxShareUrlLength) {
            throw new Error("Ogiltig delningslänk.");
        }
        const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
        const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        if (!data || typeof data.title !== "string" || !data.title.trim()
            || typeof data.description !== "string" || !Array.isArray(data.items)
            || data.items.some(item => !item || typeof item.id !== "string" || !item.id.trim()
                || typeof item.title !== "string" || !item.title.trim())) {
            throw new Error("Ogiltigt innehåll i delningslänken.");
        }
        return data;
    }

    if (snapshotParam.has("campfire")) {
        const view = document.getElementById("sharedCampfireView");
        const sharedStatus = document.getElementById("sharedCampfireStatus");
        document.body.classList.add("shared-campfire-view");
        view.hidden = false;
        let snapshot;
        try {
            snapshot = decodeSnapshot(snapshotParam.get("campfire"));
        } catch (error) {
            console.error("Kunde inte läsa delat lägerbål", error);
            sharedStatus.textContent = "Delningslänken är ogiltig eller för lång.";
            return;
        }
        document.getElementById("sharedCampfireTitle").textContent = snapshot.title;
        const sharedDescription = document.getElementById("sharedCampfireDescription");
        sharedDescription.textContent = snapshot.description;
        sharedDescription.hidden = !snapshot.description;
        const sharedItems = document.getElementById("sharedCampfireItems");
        function renderSharedItems(catalog) {
            sharedItems.replaceChildren(...snapshot.items.map(item => {
                const entry = document.createElement("li");
                const song = !window.GTScoutSongCatalog.isCustomId(item.id)
                    ? catalog.find(candidate => candidate.id === item.id)
                    : null;
                if (song) {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "shared-campfire-song";
                    button.textContent = item.title;
                    button.addEventListener("click", () => {
                        if (window.GTScoutSongModal?.open) {
                            window.GTScoutSongModal.open(song);
                            return;
                        }
                        const dialog = document.getElementById("songDialog");
                        document.getElementById("songDetailTitle").textContent = song.titel;
                        document.getElementById("songDetailCategory").textContent = song.kategori;
                        const info = document.getElementById("songDetailInfo");
                        info.textContent = song.info || "";
                        info.hidden = !song.info;
                        const lyrics = document.getElementById("songDetailLyrics");
                        const nodes = [];
                        let lastIndex = 0;
                            const songText = String(song.text || "");
                            for (const match of songText.matchAll(/\*\*([^\r\n]+?)\*\*/g)) {
                                nodes.push(document.createTextNode(songText.slice(lastIndex, match.index)));
                            const strong = document.createElement("strong");
                            strong.textContent = match[1];
                            nodes.push(strong);
                            lastIndex = match.index + match[0].length;
                        }
                            nodes.push(document.createTextNode(songText.slice(lastIndex)));
                        lyrics.replaceChildren(...nodes);
                        dialog?.showModal();
                    });
                    entry.append(button);
                } else {
                    entry.textContent = item.title;
                }
                return entry;
            }));
        }
        window.GTScoutSongCatalog.load()
            .then(catalog => {
                renderSharedItems(catalog);
                sharedStatus.textContent = snapshot.items.length ? "" : "Inga sånger valda.";
            })
            .catch(error => {
                console.error("Kunde inte hämta sångbiblioteket", error);
                renderSharedItems([]);
                sharedStatus.textContent = "Kunde inte hämta sångbiblioteket. Sparade titlar visas.";
            });
        return;
    }

    function createSnapshotUrl(plan) {
        const snapshot = {
            title: plan.title,
            description: plan.description,
            items: plan.items.map(item => ({
                id: item.id,
                title: songs.find(song => song.id === item.id)?.titel || item.title
            }))
        };
        const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
        if (bytes.length > maxShareUrlLength * 3 / 4) throw new Error("Lägerbålet är för stort för att delas som länk. Korta beskrivningen eller listan.");
        let binary = "";
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const url = new URL("lagerbal.html", window.location.href);
        url.hash = `campfire=${encoded}`;
        if (url.href.length > maxShareUrlLength) throw new Error("Lägerbålet är för stort för att delas som länk. Korta beskrivningen eller listan.");
        return url.href;
    }

    async function copyShareUrl() {
        const url = shareUrl.value;
        shareUrl.select();
        try {
            await navigator.clipboard.writeText(url);
            if (shareDialog.open && shareUrl.value === url) shareStatus.textContent = "Länken har kopierats. Du kan också kopiera den manuellt.";
        } catch (error) {
            if (shareDialog.open && shareUrl.value === url) shareStatus.textContent = "Kunde inte kopiera länken. Markera den och kopiera manuellt.";
        }
    }

    const picker = window.GTScoutCampfirePicker.create({
        getSongs: () => songs, getCatalogState: () => catalogState, escapeHtml
    });

    function renderPlans() {
        const editable = window.GTScoutCampfirePlans.canEdit() && !syncState.loading;
        newButton.disabled = !editable || busy;
        count.textContent = syncState.loading ? "Hämtar..." : `${plans.length} st.`;
        const query = search.value.trim().toLocaleLowerCase("sv");
        const visiblePlans = plans.filter(plan => plan.title.toLocaleLowerCase("sv").includes(query));
        noResults.hidden = !query || visiblePlans.length > 0 || plans.length === 0;
        const statusText = syncState.loading ? "Hämtar planerade lägerbål..."
            : syncState.storageError ? "Kunde inte läsa lokalt sparade lägerbål. Uppgifterna har inte ändrats."
            : syncState.error ? "Kunde inte synka planerade lägerbål. Lokala uppgifter visas om de finns."
                : actionMessage || (!plans.length ? "Inga planerade lägerbål ännu."
                    : !window.GTScoutAuth?.isSignedIn?.() ? "Sparas bara i den här webbläsaren."
                        : !window.GTScoutCampfirePlans.canEdit() ? "Endast ledare kan redigera kårens lägerbål." : "");
        status.textContent = statusText;
        status.classList?.toggle("detail-note-warning", /lokalt|lokala|webbläsaren/i.test(statusText));
        status.classList?.toggle("planning-sync-status--error", Boolean(syncState.error || syncState.storageError));
        status.hidden = !section.open && !syncState.error && !syncState.storageError;
        list.innerHTML = visiblePlans.map(plan => {
            const entries = plan.items.map(item => {
                const custom = window.GTScoutSongCatalog.isCustomId(item.id);
                const song = custom ? null : songs.find(candidate => candidate.id === item.id);
                const name = escapeHtml(song?.titel || item.title);
                if (song) return `<li><button type="button" class="campfire-song-button" data-plan-song="${escapeHtml(item.id)}">${name}</button></li>`;
                const suffix = !custom && catalogState === "loaded" ? " (finns inte längre i biblioteket)" : "";
                return `<li>${name}${suffix}</li>`;
            }).join("");
            return `<details class="campfire-plan" data-plan-id="${escapeHtml(plan.id)}"${expanded.has(plan.id) ? " open" : ""}>
                <summary><strong>${escapeHtml(plan.title)}</strong> <small>${plan.items.length} valda${plan.local_only ? " · Lokal" : ""}</small></summary>
                ${plan.description ? `<p>${escapeHtml(plan.description)}</p>` : ""}
                ${catalogState === "error" ? "<p>Kunde inte hämta sångbiblioteket. Sparade titlar visas.</p>" : ""}
                ${entries ? `<ol>${entries}</ol>` : "<p>Inga sånger valda.</p>"}
                <div class="campfire-plan-actions">${editable ? `<button class="arrangement-delete-icon" type="button" data-plan-action="delete" aria-label="Ta bort ${escapeHtml(plan.title)}" title="Ta bort lägerbål"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z"/></svg></button><button class="btn-secondary" type="button" data-plan-action="edit">Redigera</button><button class="btn-secondary" type="button" data-plan-action="copy">Kopiera</button>` : ""}<button class="btn-secondary campfire-plan-share" type="button" data-plan-action="share" aria-label="Dela ${escapeHtml(plan.title)}" title="Dela lägerbål"${syncState.loading || syncState.storageError ? " disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18,16.08C17.24,16.08 16.54,16.38 16,16.85L8.91,12.74C8.96,12.5 9,12.25 9,12C9,11.75 8.96,11.5 8.91,11.26L15.92,7.17C16.47,7.66 17.2,7.97 18,7.97C19.66,7.97 21,6.63 21,4.97C21,3.31 19.66,1.97 18,1.97C16.34,1.97 15,3.31 15,4.97C15,5.22 15.04,5.47 15.09,5.71L8.08,9.8C7.53,9.31 6.8,9 6,9C4.34,9 3,10.34 3,12C3,13.66 4.34,15 6,15C6.8,15 7.53,14.69 8.08,14.2L15.17,18.31C15.12,18.54 15,18.77 15,19C15,20.66 16.34,22 18,22C19.66,22 21,20.66 21,19C21,17.34 19.66,16.08 18,16.08Z"/></svg></button></div>
            </details>`;
        }).join("");
        list.querySelectorAll(".campfire-plan").forEach(details => {
            details.addEventListener("toggle", () => {
                if (details.open) expanded.add(details.dataset.planId);
                else expanded.delete(details.dataset.planId);
            });
        });
    }

    function openEditor(plan, copy, button) {
        if (!window.GTScoutCampfirePlans.canEdit() || syncState.loading) return;
        trigger = button;
        editorContext = syncState.contextVersion;
        activePlan = copy ? null : plan;
        title.value = copy ? `Kopia av ${plan.title}` : plan?.title || "";
        description.value = plan?.description || "";
        document.getElementById("campfirePlanDialogTitle").textContent = copy ? "Kopiera lägerbål" : plan ? "Redigera lägerbål" : "Planera lägerbål";
        const isLocal = Boolean(plan?.local_only) || !window.GTScoutAuth?.isSignedIn?.();
        localNotice.textContent = plan?.local_only
            ? "Lägerbålet sparas bara i den här webbläsaren – inte i kårens databas."
            : "Du är inte inloggad – lägerbålet sparas bara i den här webbläsaren.";
        localNotice.classList.toggle("hidden", !isLocal);
        formStatus.textContent = "";
        pickerContainer.innerHTML = picker.render({ campfire_items: plan?.items || [] });
        dialog.showModal();
        title.focus();
    }

    function closeEditor() {
        dialog.close();
        if (trigger?.isConnected) trigger.focus();
        else newButton.focus();
    }

    function setSearchVisible(visible) {
        searchField.hidden = !visible;
        searchToggle.setAttribute("aria-expanded", String(visible));
        searchToggle.setAttribute("aria-pressed", String(visible));
        const label = `${visible ? "Dölj" : "Visa"} sökning för planerade lägerbål`;
        searchToggle.setAttribute("aria-label", label);
        searchToggle.setAttribute("title", label);
        if (visible) search.focus();
        else {
            search.value = "";
            renderPlans();
        }
    }

    section.addEventListener("toggle", () => {
        status.hidden = !section.open && !syncState.error && !syncState.storageError;
        if (!section.open && !searchField.hidden) setSearchVisible(false);
    });
    searchToggle.addEventListener("click", () => setSearchVisible(searchField.hidden));
    search.addEventListener("input", renderPlans);
    newButton.addEventListener("click", () => openEditor(null, false, newButton));
    document.getElementById("closeCampfirePlan").addEventListener("click", closeEditor);
    document.getElementById("cancelCampfirePlan").addEventListener("click", closeEditor);
    document.getElementById("closeCampfireShareDialog").addEventListener("click", () => shareDialog.close());
    document.getElementById("cancelCampfireShareDialog").addEventListener("click", () => shareDialog.close());
    document.getElementById("copyCampfireShareBtn").addEventListener("click", copyShareUrl);
    shareDialog.addEventListener("click", event => {
        if (event.target === shareDialog) shareDialog.close();
    });
    pickerContainer.addEventListener("input", event => picker.input(event));
    pickerContainer.addEventListener("keydown", event => picker.keydown(event));
    pickerContainer.addEventListener("change", event => picker.change(event));
    pickerContainer.addEventListener("click", event => picker.action(event));
    list.addEventListener("click", async event => {
        const songButton = event.target.closest("[data-plan-song]");
        if (songButton?.dataset?.planSong) {
            const song = songs.find(item => item.id === songButton.dataset.planSong);
            if (song) window.GTScoutSongModal?.open(song);
            return;
        }
        const button = event.target.closest("[data-plan-action]");
        if (!button || busy) return;
        const plan = plans.find(item => item.id === button.closest("[data-plan-id]")?.dataset.planId);
        if (!plan) return;
        if (button.dataset.planAction === "share") {
            if (syncState.loading || syncState.storageError) return;
            try {
                shareUrl.value = createSnapshotUrl(plan);
                shareStatus.textContent = "";
                shareDialog.showModal();
                copyShareUrl();
            } catch (error) {
                console.error("Kunde inte skapa delningslänk för lägerbål", error);
                actionMessage = error.message || "Kunde inte skapa delningslänken.";
                renderPlans();
            }
            return;
        }
        if (button.dataset.planAction === "edit" || button.dataset.planAction === "copy") {
            openEditor(plan, button.dataset.planAction === "copy", button);
            return;
        }
        if (!confirm(`Ta bort ${plan.title}?`)) return;
        busy = true;
        actionMessage = "";
        renderPlans();
        try {
            await window.GTScoutCampfirePlans.remove(plan.id);
            actionMessage = "Lägerbålet har tagits bort.";
        } catch (error) {
            console.error("Kunde inte ta bort planerat lägerbål", error);
            actionMessage = "Kunde inte ta bort lägerbålet. Försök igen.";
        } finally {
            busy = false;
            renderPlans();
        }
    });
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (busy) return;
        if (editorContext !== syncState.contextVersion || (activePlan && !plans.some(plan => plan.id === activePlan.id))) {
            formStatus.textContent = "Lägerbålet eller inloggningen har ändrats. Stäng och öppna listan igen.";
            return;
        }
        busy = true;
        saveButton.disabled = true;
        formStatus.textContent = "Sparar...";
        try {
            const result = await window.GTScoutCampfirePlans.save({
                ...activePlan, id: activePlan?.id || crypto.randomUUID(),
                title: title.value, description: description.value,
                items: picker.read(pickerContainer)
            });
            actionMessage = result.error ? "Lägerbålet sparades lokalt men kunde inte synkas."
                : result.localOnly ? "Lägerbålet sparades i den här webbläsaren." : "Lägerbålet sparades i kårens databas.";
            search.value = "";
            section.open = true;
            closeEditor();
        } catch (error) {
            console.error("Kunde inte spara planerat lägerbål", error);
            formStatus.textContent = error.message || "Kunde inte spara lägerbålet.";
        } finally {
            busy = false;
            saveButton.disabled = false;
            renderPlans();
        }
    });

    window.GTScoutCampfirePlans.init({ onChange(nextPlans, state) {
        if (shareDialog.open && syncState.contextVersion !== state.contextVersion) {
            shareDialog.close();
            shareUrl.value = "";
            shareStatus.textContent = "";
        }
        if (dialog.open && editorContext !== state.contextVersion) {
            dialog.close();
            activePlan = null;
            title.value = "";
            description.value = "";
            pickerContainer.replaceChildren();
            actionMessage = "Inloggningen har ändrats. Öppna lägerbålet igen.";
        }
        plans = nextPlans;
        syncState = state;
        renderPlans();
    } });
    window.GTScoutSongCatalog.load()
        .then(data => { songs = data; catalogState = "loaded"; })
        .catch(error => {
            console.error("Kunde inte hämta lägerbålsbiblioteket", error);
            catalogState = "error";
        })
        .then(() => {
            if (dialog.open) picker.refresh(pickerContainer.querySelector(".agenda-campfire-picker"));
            renderPlans();
        });
})();
