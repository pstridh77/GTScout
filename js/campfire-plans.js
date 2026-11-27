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
        status.textContent = syncState.loading ? "Hämtar planerade lägerbål..."
            : syncState.storageError ? "Kunde inte läsa lokalt sparade lägerbål. Uppgifterna har inte ändrats."
            : syncState.error ? "Kunde inte synka planerade lägerbål. Lokala uppgifter visas om de finns."
                : actionMessage || (!plans.length ? "Inga planerade lägerbål ännu."
                    : !window.GTScoutAuth?.isSignedIn?.() ? "Sparas bara i den här webbläsaren."
                        : !window.GTScoutCampfirePlans.canEdit() ? "Endast ledare kan redigera kårens lägerbål." : "");
        status.hidden = !section.open && !syncState.error && !syncState.storageError;
        list.innerHTML = visiblePlans.map(plan => {
            const entries = plan.items.map(item => {
                const custom = window.GTScoutSongCatalog.isCustomId(item.id);
                const song = custom ? null : songs.find(candidate => candidate.id === item.id);
                const name = escapeHtml(song?.titel || item.title);
                if (song) return `<li><a href="lagerbal.html?song=${encodeURIComponent(item.id)}" target="_blank" rel="noopener noreferrer">${name}</a></li>`;
                const suffix = !custom && catalogState === "loaded" ? " (finns inte längre i biblioteket)" : "";
                return `<li>${name}${suffix}</li>`;
            }).join("");
            return `<details class="campfire-plan" data-plan-id="${escapeHtml(plan.id)}"${expanded.has(plan.id) ? " open" : ""}>
                <summary><strong>${escapeHtml(plan.title)}</strong> <small>${plan.items.length} valda${plan.local_only ? " · Lokal" : ""}</small></summary>
                ${plan.description ? `<p>${escapeHtml(plan.description)}</p>` : ""}
                ${catalogState === "error" ? "<p>Kunde inte hämta sångbiblioteket. Sparade titlar visas.</p>" : ""}
                ${entries ? `<ol>${entries}</ol>` : "<p>Inga sånger valda.</p>"}
                ${editable ? `<div class="campfire-plan-actions"><button class="arrangement-delete-icon" type="button" data-plan-action="delete" aria-label="Ta bort ${escapeHtml(plan.title)}" title="Ta bort lägerbål"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z"/></svg></button><button class="btn-secondary" type="button" data-plan-action="edit">Redigera</button><button class="btn-secondary" type="button" data-plan-action="copy">Kopiera</button></div>` : ""}
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
    pickerContainer.addEventListener("input", event => picker.input(event));
    pickerContainer.addEventListener("keydown", event => picker.keydown(event));
    pickerContainer.addEventListener("change", event => picker.change(event));
    pickerContainer.addEventListener("click", event => picker.action(event));
    list.addEventListener("click", async event => {
        const button = event.target.closest("[data-plan-action]");
        if (!button || busy) return;
        const plan = plans.find(item => item.id === button.closest("[data-plan-id]")?.dataset.planId);
        if (!plan) return;
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
