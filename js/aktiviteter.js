(function () {
    const sync = window.GTScoutActivities;
    const auth = window.GTScoutAuth;
    const grid = document.getElementById("activityGrid");
    const empty = document.getElementById("activityEmpty");
    const search = document.getElementById("activitySearch");
    const categoryFilter = document.getElementById("activityCategoryFilter");
    const karFilter = document.getElementById("activityKarFilter");
    const modal = document.getElementById("activityModal");
    const detailModal = document.getElementById("activityDetailModal");
    const form = document.getElementById("activityForm");
    const formStatus = document.getElementById("activityFormStatus");
    const status = document.getElementById("activitySyncStatus");
    const addButton = document.getElementById("addActivityBtn");
    const saveButton = document.getElementById("saveActivityBtn");
    const deleteButton = document.getElementById("deleteActivityBtn");
    const collapseAllButtons = document.querySelectorAll('[data-collapse-all="activities"]');
    const collapsedCategories = new Set();
    let activities = [];
    let baseBadges = [];
    let editingId = null;
    let detailId = null;
    let loaded = false;
    let loadFailed = false;
    let saving = false;

    const deleteIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>';

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
    }

    function renderText(value) {
        return String(value || "").split(/(https?:\/\/[^\s<>]+)/g).map(part => {
            if (!/^https?:\/\//.test(part)) return escapeHtml(part).replace(/\n/g, "<br>");
            return `<a href="${escapeHtml(part)}" target="_blank" rel="noopener noreferrer">${escapeHtml(part)}</a>`;
        }).join("");
    }

    function badgesFor(activity) {
        const links = sync.getBadgeLinksMap();
        return [...baseBadges, ...(window.GTScoutBadges?.getAllBadges() || [])]
            .filter((badge, index, badges) => badges.findIndex(other => other.id === badge.id) === index)
            .filter(badge => links[badge.id]?.includes(activity.id));
    }

    function categoriesFor(activity) {
        if (activity.kategori) return [activity.kategori];
        const categories = badgesFor(activity).map(badge => badge.kategori || "Övrigt");
        return categories.length ? [...new Set(categories)] : ["Övrigt"];
    }

    function owner(activity) {
        return activity.kar_namn || (activity.kar_id ? "Okänd kår" : "Kår saknas");
    }

    function setStatus(text, error = false) {
        status.textContent = text;
        status.classList.toggle("hidden", !text);
        status.classList.toggle("planning-sync-status--error", error);
        status.classList.toggle("detail-note-warning", !error && /lokalt|webbläsaren/.test(text));
    }

    function updateStatus() {
        if (auth.getState().loading) return setStatus("Kontrollerar inloggning...");
        if (!loaded) return setStatus("Hämtar aktiviteter...");
        if (loadFailed) return setStatus("Kunde inte hämta från databasen – använder lokal data.", true);
        if (!auth.isOnline()) return setStatus("Aktiviteter sparas lokalt i den här webbläsaren.");
        if (sync.canWrite()) return setStatus(`Synkad med databasen (${activities.length} aktiviteter)`);
        setStatus(`Aktivitetsbiblioteket visas (${activities.length} st) – egna aktiviteter sparas lokalt.`);
    }

    function populateSelect(select, options) {
        const selected = select.value;
        select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
        select.value = options.some(([value]) => value === selected) ? selected : "Alla";
    }

    function populateFilters() {
        const categories = [...new Set(activities.flatMap(categoriesFor))].sort((left, right) => left.localeCompare(right, "sv"));
        populateSelect(categoryFilter, [["Alla", "Alla kategorier"], ...categories.map(category => [category, category])]);
        populateSelect(karFilter, [["Alla", "Alla kårer"], ["__saknas", "Kår saknas"], ...sync.getKarFilters().map(kar => [kar.id, kar.namn])]);
        const suggestions = [...new Set([...categories, ...baseBadges.map(badge => badge.kategori).filter(Boolean)])].sort((left, right) => left.localeCompare(right, "sv"));
        document.getElementById("activityCategories").replaceChildren(...suggestions.map(category => {
            const option = document.createElement("option");
            option.value = category;
            return option;
        }));
    }

    function updateCollapseAllButtons() {
        const groups = [...grid.querySelectorAll(".activity-category-group")];
        const allCollapsed = groups.length > 0 && groups.every(group => !group.open);
        collapseAllButtons.forEach(button => {
            const isMobileButton = button.classList.contains("section-collapse-toggle");
            button.textContent = isMobileButton
                ? (allCollapsed ? "Visa" : "Fäll ihop")
                : (allCollapsed ? "Visa alla kategorier" : "Fäll ihop alla kategorier");
            button.setAttribute("aria-expanded", String(!allCollapsed));
            button.disabled = groups.length === 0;
        });
    }

    function toggleAllCategories() {
        const groups = [...grid.querySelectorAll(".activity-category-group")];
        const collapse = groups.some(group => group.open);
        groups.forEach(group => {
            group.open = !collapse;
            if (collapse) collapsedCategories.add(group.querySelector("summary strong")?.textContent || "");
            else collapsedCategories.delete(group.querySelector("summary strong")?.textContent || "");
        });
        updateCollapseAllButtons();
    }

    function renderBadgeIcons(activity) {
        return badgesFor(activity).map(badge => `<img src="${escapeHtml(badge.bild)}" alt="${escapeHtml(badge.namn)}" title="${escapeHtml(badge.namn)}" class="activity-linked-badge-icon" loading="lazy">`).join("");
    }

    function renderActivities() {
        const query = search.value.trim().toLocaleLowerCase("sv");
        const visible = activities.filter(activity => {
            const text = [activity.namn, activity.beskrivning, activity.genomforande, activity.tid, owner(activity), ...activity.material].join(" ").toLocaleLowerCase("sv");
            return (!query || text.includes(query))
                && (categoryFilter.value === "Alla" || categoriesFor(activity).includes(categoryFilter.value))
                && (karFilter.value === "Alla" || (karFilter.value === "__saknas" ? !activity.kar_id : activity.kar_id === karFilter.value));
        });
        const groups = new Map();
        visible.forEach(activity => categoriesFor(activity).forEach(category => {
            if (!groups.has(category)) groups.set(category, []);
            groups.get(category).push(activity);
        }));
        grid.replaceChildren(...[...groups].sort(([left], [right]) => left.localeCompare(right, "sv")).map(([category, items]) => {
            const group = document.createElement("details");
            group.className = "activity-category-group";
            group.open = !collapsedCategories.has(category);
            group.innerHTML = `<summary class="recipe-meal-summary"><strong>${escapeHtml(category)}</strong><span>${items.length} st.</span></summary><div class="activity-cards"></div>`;
            group.querySelector(".activity-cards").innerHTML = items.sort((left, right) => left.namn.localeCompare(right.namn, "sv")).map(activity => {
                const own = activity.kar_id && activity.kar_id === auth.getState().karId;
                return `<article class="activity-card"><span class="recipe-category">${escapeHtml(category)}</span><div class="activity-card-meta"><span class="activity-owner-badge ${own ? "activity-owner-badge--mine" : "activity-owner-badge--other"}">${own ? "Min kår" : "Annan kår"}</span><span>${escapeHtml(owner(activity))}</span></div><h2><button class="activity-card-title" type="button" data-activity-action="view" data-activity-id="${escapeHtml(activity.id)}">${escapeHtml(activity.namn)}</button></h2><p class="activity-card-description">${escapeHtml(activity.beskrivning || "")}</p><div class="activity-card-bottom"><span>${escapeHtml(activity.tid || "Ingen tidsangivelse")}</span><div class="activity-linked-badge-list">${renderBadgeIcons(activity)}</div></div><div class="activity-card-actions">${sync.canDeleteActivity(activity) ? `<button class="btn-danger activity-tool-button" type="button" data-activity-action="delete" data-activity-id="${escapeHtml(activity.id)}" aria-label="Radera ${escapeHtml(activity.namn)}" title="Radera">${deleteIcon}</button>` : ""}</div></article>`;
            }).join("");
            group.addEventListener("toggle", () => {
                if (group.open) collapsedCategories.delete(category);
                else collapsedCategories.add(category);
                updateCollapseAllButtons();
            });
            return group;
        }));
        empty.classList.toggle("hidden", visible.length > 0 || !loaded);
        empty.textContent = activities.length ? "Inga aktiviteter matchar filtreringen." : 'Inga aktiviteter ännu. Klicka på "+ Skapa aktivitet" för att börja.';
        updateCollapseAllButtons();
    }

    function showDetail(activity) {
        detailId = activity.id;
        document.getElementById("activityDetailBody").innerHTML = `<h2 id="activityDetailTitle">${escapeHtml(activity.namn)}</h2><p>${renderText(activity.beskrivning)}</p><p><strong>Kår:</strong> ${escapeHtml(owner(activity))}</p>${activity.tid ? `<p><strong>Tid:</strong> ${escapeHtml(activity.tid)}</p>` : ""}${activity.material.length ? `<h3>Material</h3><ul>${activity.material.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}${activity.genomforande ? `<h3>Genomförande</h3><p>${renderText(activity.genomforande)}</p>` : ""}${badgesFor(activity).length ? `<h3>Kopplade märken</h3><div class="activity-linked-badge-list">${renderBadgeIcons(activity)}</div>` : ""}`;
        document.getElementById("activityDetailActions").innerHTML = `${sync.canEditActivity(activity) ? '<button class="btn-secondary" type="button" data-activity-action="edit">Redigera</button>' : ""}${sync.canDeleteActivity(activity) ? '<button class="btn-danger" type="button" data-activity-action="delete">Radera</button>' : ""}${sync.canWrite() && activity.kar_id && !sync.canEditActivity(activity) ? '<button class="btn-secondary" type="button" data-activity-action="copy">Kopiera till min kår</button>' : ""}`;
        detailModal.classList.remove("hidden");
    }

    function openForm(activity = null, copy = false) {
        if (auth.getState().loading || (activity && !copy && !sync.canEditActivity(activity))) return;
        if (copy && !sync.canWrite()) return;
        editingId = activity && !copy ? activity.id : null;
        document.getElementById("activityModalTitle").textContent = copy ? "Kopiera aktivitet till min kår" : editingId ? "Redigera aktivitet" : "Skapa aktivitet";
        document.getElementById("activityLocalNotice").classList.toggle("hidden", sync.canWrite());
        document.getElementById("activityName").value = activity?.namn || "";
        document.getElementById("activityCategory").value = activity?.kategori || "";
        document.getElementById("activityTime").value = activity?.tid || "";
        document.getElementById("activityDescription").value = activity?.beskrivning || "";
        document.getElementById("activityMaterial").value = activity?.material.join("\n") || "";
        document.getElementById("activityInstructions").value = activity?.genomforande || "";
        deleteButton.classList.toggle("hidden", !activity || copy || !sync.canDeleteActivity(activity));
        formStatus.textContent = "";
        detailModal.classList.add("hidden");
        modal.classList.remove("hidden");
        document.getElementById("activityName").focus();
    }

    async function saveActivity(event) {
        event.preventDefault();
        if (saving || auth.getState().loading) return;
        const existing = activities.find(activity => activity.id === editingId);
        if (editingId && (!existing || !sync.canEditActivity(existing))) {
            formStatus.textContent = "Du har inte behörighet att redigera aktiviteten.";
            return;
        }
        saving = true;
        saveButton.disabled = true;
        try {
            await sync.saveActivity({
                id: editingId || undefined,
                namn: document.getElementById("activityName").value.trim(),
                kategori: document.getElementById("activityCategory").value.trim() || "Övrigt",
                tid: document.getElementById("activityTime").value.trim(),
                beskrivning: document.getElementById("activityDescription").value.trim(),
                material: document.getElementById("activityMaterial").value.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
                genomforande: document.getElementById("activityInstructions").value.trim()
            });
            modal.classList.add("hidden");
            updateStatus();
        } catch (error) {
            formStatus.textContent = error.message || "Kunde inte spara aktiviteten.";
        } finally {
            saving = false;
            saveButton.disabled = false;
        }
    }

    async function deleteActivity(activity) {
        if (!sync.canDeleteActivity(activity) || !window.confirm(`Radera aktiviteten "${activity.namn}"?`)) return;
        try {
            await sync.deleteActivity(activity.id);
            const plans = JSON.parse(localStorage.getItem("gtscout_planering") || "[]");
            if (Array.isArray(plans)) localStorage.setItem("gtscout_planering", JSON.stringify(plans.map(plan => ({ ...plan, activities: Array.isArray(plan.activities) ? plan.activities.filter(id => id !== activity.id) : [] }))));
            modal.classList.add("hidden");
            detailModal.classList.add("hidden");
        } catch (error) {
            setStatus(error.message || "Kunde inte radera aktiviteten.", true);
        }
    }

    function handleActivityAction(event) {
        const button = event.target.closest("[data-activity-action]");
        const card = event.target.closest(".activity-card");
        if (!button && (!card || event.target.closest("a, button, input, select, textarea"))) return;
        const activityId = button?.dataset.activityId || card?.querySelector(".activity-card-title")?.dataset.activityId || detailId;
        const activity = activities.find(item => item.id === activityId);
        if (!activity) return;
        const action = button?.dataset.activityAction || "view";
        if (action === "view") showDetail(activity);
        if (action === "edit") openForm(activity);
        if (action === "copy") openForm(activity, true);
        if (action === "delete") deleteActivity(activity);
    }

    grid.addEventListener("click", handleActivityAction);
    detailModal.addEventListener("click", handleActivityAction);
    form.addEventListener("submit", saveActivity);
    addButton.addEventListener("click", () => openForm());
    deleteButton.addEventListener("click", () => {
        const activity = activities.find(item => item.id === editingId);
        if (activity) deleteActivity(activity);
    });
    [search, categoryFilter, karFilter].forEach(element => element.addEventListener("input", renderActivities));
    collapseAllButtons.forEach(button => button.addEventListener("click", toggleAllCategories));
    document.querySelectorAll("[data-close-activity-form]").forEach(button => button.addEventListener("click", () => modal.classList.add("hidden")));
    document.querySelector("[data-close-activity-detail]").addEventListener("click", () => detailModal.classList.add("hidden"));
    [modal, detailModal].forEach(element => element.addEventListener("click", event => {
        if (event.target === element) element.classList.add("hidden");
    }));
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") { modal.classList.add("hidden"); detailModal.classList.add("hidden"); }
    });
    auth.onChange(() => {
        addButton.disabled = auth.getState().loading;
        updateStatus();
        renderActivities();
        if (!detailModal.classList.contains("hidden")) {
            const activity = activities.find(item => item.id === detailId);
            if (activity) showDetail(activity);
        }
    });
    sync.init({ onChange(state) {
        activities = state.activities;
        loaded = state.loaded;
        loadFailed = Boolean(state.error);
        populateFilters();
        renderActivities();
        updateStatus();
    } });
    window.GTScoutBadges?.init({ onChange() { populateFilters(); renderActivities(); } });
    fetch("data/marken.json").then(response => {
        if (!response.ok) throw new Error("Märkeslistan kunde inte hämtas.");
        return response.json();
    }).then(badges => { baseBadges = badges; populateFilters(); renderActivities(); }).catch(error => console.error(error));
})();