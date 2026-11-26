(function () {
    function create({ getSongs, getCatalogState, escapeHtml }) {
        function renderSelection(items) {
            const summary = items.length ? `${items.length} valda` : "Inga sånger valda";
            const list = items.length ? `<ol class="agenda-campfire-selected">${items.map((item, index) => {
                const available = getSongs().find(song => song.id === item.id);
                const title = available?.titel || item.title;
                const unavailable = getCatalogState() === "loaded" && !available ? " (finns inte längre i biblioteket)" : "";
                return `<li data-campfire-selected="${escapeHtml(item.id)}" data-campfire-title="${escapeHtml(title)}"><div class="agenda-campfire-row"><span>${escapeHtml(title + unavailable)}</span><div class="agenda-campfire-actions"><button type="button" data-campfire-move="-1" aria-label="Flytta ${escapeHtml(title)} uppåt" title="Flytta uppåt"${index === 0 ? " disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></button><button type="button" data-campfire-move="1" aria-label="Flytta ${escapeHtml(title)} nedåt" title="Flytta nedåt"${index === items.length - 1 ? " disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg></button><button type="button" data-campfire-remove aria-label="Ta bort ${escapeHtml(title)}" title="Ta bort"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></div></li>`;
            }).join("")}</ol>` : "";
            return `<div class="agenda-recipe-selection"><span class="agenda-recipe-summary" role="status" aria-live="polite">${summary}</span><button class="agenda-recipe-clear" type="button" data-clear-campfire${items.length ? "" : " disabled"}>Rensa val</button></div>${list}`;
        }

        function render(entry) {
            const items = entry.campfire_items || [];
            const selectedIds = new Set(items.map(item => item.id));
            const options = window.GTScoutSongCatalog.categories.map(category => {
                const songs = getSongs().filter(song => song.kategori === category)
                    .sort((left, right) => left.titel.trim().localeCompare(right.titel.trim(), "sv"));
                if (!songs.length) return "";
                return `<details class="agenda-recipe-category"><summary>${escapeHtml(category)}</summary>${songs.map(song =>
                    `<label class="agenda-recipe-choice"><input class="agenda-campfire-target" type="checkbox" value="${escapeHtml(song.id)}"${selectedIds.has(song.id) ? " checked" : ""}><span>${escapeHtml(song.titel)}</span></label>`
                ).join("")}</details>`;
            }).join("");
            const state = getCatalogState();
            const message = state === "loading" ? "Hämtar lägerbålsbiblioteket..."
                : state === "error" ? "Kunde inte hämta lägerbålsbiblioteket. Sparade val finns kvar; ladda om sidan för att försöka igen."
                    : !getSongs().length ? "Lägerbålsbiblioteket är tomt." : "";
            return `<div class="agenda-recipe-picker agenda-campfire-picker"><span>Sånger</span>${message ? "" : `<label class="agenda-recipe-search-field"><span>Sök sång</span><input class="agenda-recipe-search agenda-campfire-search" type="search" placeholder="Börja skriva en titel" autocomplete="off"></label>`}<div data-campfire-selection>${renderSelection(items)}</div>${message ? `<p class="agenda-campfire-status" role="status">${escapeHtml(message)}</p>` : `<div class="agenda-recipe-options" role="group" aria-label="Lägerbålsbibliotek">${options}</div><small class="agenda-campfire-no-results hidden" role="status">Inga sånger, rop eller lekar matchar sökningen.</small>`}</div>`;
        }

        function read(container) {
            return [...(container?.querySelectorAll("[data-campfire-selected]") || [])].map(row => ({
                id: row.dataset.campfireSelected, title: row.dataset.campfireTitle
            }));
        }

        function update(picker, items) {
            picker.querySelector("[data-campfire-selection]").innerHTML = renderSelection(items);
            picker.querySelectorAll(".agenda-campfire-target").forEach(input => {
                input.checked = items.some(item => item.id === input.value);
            });
        }

        function filter(picker) {
            const query = picker.querySelector(".agenda-campfire-search").value.trim().toLocaleLowerCase("sv");
            const choices = [...picker.querySelectorAll(".agenda-recipe-choice")];
            choices.forEach(choice => { choice.hidden = !choice.textContent.toLocaleLowerCase("sv").includes(query); });
            picker.querySelectorAll(".agenda-recipe-category").forEach(group => {
                const visible = [...group.querySelectorAll(".agenda-recipe-choice")].some(choice => !choice.hidden);
                group.hidden = !visible;
                group.open = query ? visible : group.querySelector(".agenda-campfire-target:checked") !== null;
            });
            picker.querySelector(".agenda-campfire-no-results").classList.toggle("hidden", !query || choices.some(choice => !choice.hidden));
        }

        function change(event) {
            const picker = event.target.closest(".agenda-campfire-picker");
            if (!picker || !event.target.matches(".agenda-campfire-target")) return false;
            const items = read(picker).filter(item => item.id !== event.target.value);
            if (event.target.checked) {
                const song = getSongs().find(item => item.id === event.target.value);
                if (song) items.push({ id: song.id, title: song.titel });
            }
            update(picker, items);
            return true;
        }

        function action(event) {
            const button = event.target.closest("[data-campfire-move], [data-campfire-remove], [data-clear-campfire]");
            if (!button) return false;
            const picker = button.closest(".agenda-campfire-picker");
            if (button.hasAttribute("data-clear-campfire")) {
                update(picker, []);
                picker.querySelector(".agenda-campfire-search")?.focus();
                return true;
            }
            const row = button.closest("[data-campfire-selected]");
            const items = read(picker);
            const index = items.findIndex(item => item.id === row.dataset.campfireSelected);
            if (index < 0) return false;
            if (button.hasAttribute("data-campfire-remove")) items.splice(index, 1);
            else {
                const next = index + Number(button.dataset.campfireMove);
                if (next < 0 || next >= items.length) return false;
                [items[index], items[next]] = [items[next], items[index]];
            }
            update(picker, items);
            const remaining = [...picker.querySelectorAll("[data-campfire-selected]")].find(item => item.dataset.campfireSelected === row.dataset.campfireSelected);
            const moveButton = remaining?.querySelector(`[data-campfire-move="${button.dataset.campfireMove}"]:not(:disabled)`)
                || remaining?.querySelector("[data-campfire-move]:not(:disabled)");
            (moveButton || picker.querySelector(".agenda-campfire-search"))?.focus();
            return true;
        }

        return { render, read, update, filter, change, action };
    }

    window.GTScoutCampfirePicker = { create };
})();
