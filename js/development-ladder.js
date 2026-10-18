(function () {
    const LEVELS = ["Familjescouter", "Spårare", "Upptäckare", "Äventyrare", "Utmanare", "Rover"];
    const LEVEL_ICONS = {
        Familjescouter: "images/icons/familjescout.png",
        Spårare: "images/icons/sparare.png",
        Upptäckare: "images/icons/upptackare.png",
        Äventyrare: "images/icons/aventyrare.png",
        Utmanare: "images/icons/utmanare.png",
        Rover: "images/icons/rover.png"
    };
    const templateSelect = document.getElementById("developmentTemplateSelect");
    const ladder = document.getElementById("developmentLadder");
    const summary = document.getElementById("developmentLadderSummary");
    const status = document.getElementById("developmentLadderStatus");
    const badgeDialog = document.getElementById("developmentBadgeDialog");
    const badgeDialogContent = document.getElementById("developmentBadgeDetails");
    const closeBadgeDialogButton = document.getElementById("closeDevelopmentBadgeDialog");
    let templates = [];
    let badgesById = new Map();
    let badgeDialogTrigger = null;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    function parsePlan(plan) {
        const match = String(plan?.name || "").match(/(?:läsår|år)\s*(\d+)\s*(HT|VT)/i);
        return match ? { year: Number(match[1]), term: match[2].toUpperCase() } : null;
    }

    function formatBadgeText(value) {
        return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
    }

    function badgeMarkup(badgeId) {
        const badge = badgesById.get(badgeId);
        if (!badge) return `<p class="development-empty-term">Märket ${escapeHtml(badgeId)} saknas i märkeskatalogen.</p>`;
        return `<button class="development-badge" type="button" data-badge-id="${escapeHtml(badge.id)}" aria-label="Visa information om ${escapeHtml(badge.namn)}"><img src="${escapeHtml(badge.bild || "")}" alt="" loading="lazy"><span class="development-badge-name">${escapeHtml(badge.namn)}</span><span class="development-badge-category">${escapeHtml(badge.kategori || "")}</span></button>`;
    }

    function openBadgeDialog(badge, trigger) {
        const targetGroups = Array.isArray(badge.malgrupp) ? badge.malgrupp : [badge.malgrupp || ""];
        const targetGroupLabel = targetGroups.filter(Boolean).join(", ") || "Ej angiven";
        const categoryIcons = targetGroups
            .map(targetGroup => ({ targetGroup, icon: LEVEL_ICONS[targetGroup] }))
            .filter(item => item.icon);
        const criteria = Array.isArray(badge.kriterier) ? badge.kriterier : [];
        const programs = Array.isArray(badge.program) ? badge.program : [badge.program || "Båda"];

        badgeDialogContent.innerHTML = `
            <div class="detail-popup-top">
                <div class="detail-popup-main">
                    <div class="detail-popup-header"><h2 id="developmentBadgeTitle">${escapeHtml(badge.namn)}</h2></div>
                    <div class="detail-image-row"><img src="${escapeHtml(badge.bild || "")}" alt="${escapeHtml(badge.namn)}" class="detail-image"></div>
                </div>
                ${categoryIcons.length ? `<div class="detail-category-icons" aria-label="Målgrupper: ${escapeHtml(targetGroupLabel)}">${categoryIcons.map(item => `<img src="${escapeHtml(item.icon)}" alt="${escapeHtml(item.targetGroup)}" class="detail-category-icon">`).join("")}</div>` : ""}
            </div>
            <div class="detail-text">
                <div class="detail-category-row"><p><strong>Kategori:</strong> ${escapeHtml(badge.kategori || "Ej angiven")}</p><p><strong>Typ:</strong> ${escapeHtml(badge.Typ || badge.typ || "Ej angiven")}</p></div>
                ${badge.inledning ? `<p class="detail-introduction">${formatBadgeText(badge.inledning)}</p>` : ""}
                ${criteria.length ? `<div class="detail-criteria"><strong>Kriterier:</strong><ul>${criteria.map(item => `<li>${formatBadgeText(item)}</li>`).join("")}</ul></div>` : ""}
                <p><strong>Målgrupp:</strong> ${escapeHtml(targetGroupLabel)}</p>
                <p><strong>Program:</strong> ${escapeHtml(programs.filter(Boolean).join(", ") || "Båda")}</p>
            </div>
        `;
        badgeDialogTrigger = trigger;
        badgeDialog.showModal();
        closeBadgeDialogButton.focus();
    }

    function renderLevel(level, index, templateLevels) {
        const levelData = templateLevels.get(level);
        const plans = Array.isArray(levelData?.plans) ? levelData.plans : [];
        const indexedPlans = new Map();
        plans.forEach(plan => {
            const position = parsePlan(plan);
            if (!position) return;
            const key = `${position.year}-${position.term}`;
            if (!indexedPlans.has(key)) indexedPlans.set(key, []);
            indexedPlans.get(key).push(...(Array.isArray(plan.badges) ? plan.badges : []));
        });
        const years = [...new Set([...indexedPlans.keys()].map(key => Number(key.split("-")[0])))].sort((a, b) => a - b);
        const levelBadgeCount = plans.reduce((count, plan) => count + (Array.isArray(plan.badges) ? plan.badges.length : 0), 0);
        const icon = LEVEL_ICONS[level];
        const heading = `<div class="development-level-heading"><span class="development-level-marker" aria-hidden="true">${index + 1}</span>${icon ? `<img class="development-level-icon" src="${icon}" alt="">` : ""}<div><h2 id="developmentLevel${index}">${escapeHtml(level)}</h2><p class="development-level-count">${levelBadgeCount} ${levelBadgeCount === 1 ? "märke" : "märken"}</p></div></div>`;

        if (!years.length) {
            return `<section class="development-level" aria-labelledby="developmentLevel${index}">${heading}<p class="development-empty-level">Ingen standardplanering finns för den här åldersgruppen i den valda mallen.</p></section>`;
        }

        const yearMarkup = years.map(year => {
            const termMarkup = ["HT", "VT"].map(term => {
                const badgeIds = indexedPlans.get(`${year}-${term}`) || [];
                const label = term === "HT" ? "Hösttermin · HT" : "Vårtermin · VT";
                const badges = badgeIds.length
                    ? badgeIds.map(badgeMarkup).join("")
                    : '<p class="development-empty-term">Inga märken planerade.</p>';
                return `<div class="development-term" data-term="${term}"><h3>${label}</h3><div class="development-badges">${badges}</div></div>`;
            }).join("");
            return `<div class="development-year"><h3 class="development-year-title">År ${year}</h3><div class="development-terms">${termMarkup}</div></div>`;
        }).join("");

        return `<section class="development-level" aria-labelledby="developmentLevel${index}">${heading}<div class="development-years">${yearMarkup}</div></section>`;
    }

    function render() {
        const template = templates[Number(templateSelect.value)] || templates[0];
        if (!template) return;
        const templateLevels = new Map((template.plannings || []).map(level => [level.level, level]));
        ladder.innerHTML = LEVELS.map((level, index) => renderLevel(level, index, templateLevels)).join("");
        const badgeCount = (template.plannings || []).reduce((count, level) => count + (level.plans || []).reduce((levelCount, plan) => levelCount + (plan.badges || []).length, 0), 0);
        summary.textContent = `${LEVELS.length} åldersgrupper · ${badgeCount} märkesplatser i standardplaneringen`;
        status.textContent = `Visar ${template.name}.`;
        status.classList.remove("development-ladder-status--error");
    }

    ladder.addEventListener("click", event => {
        const trigger = event.target.closest("[data-badge-id]");
        const badge = trigger ? badgesById.get(trigger.dataset.badgeId) : null;
        if (badge) openBadgeDialog(badge, trigger);
    });

    closeBadgeDialogButton.addEventListener("click", () => badgeDialog.close());
    badgeDialog.addEventListener("click", event => {
        if (event.target === badgeDialog) badgeDialog.close();
    });
    badgeDialog.addEventListener("close", () => {
        const trigger = badgeDialogTrigger;
        badgeDialogTrigger = null;
        if (trigger?.isConnected) window.setTimeout(() => trigger.focus(), 0);
    });

    async function loadData() {
        try {
            const [templateResponse, badgeResponse] = await Promise.all([
                fetch("data/default-planeringar.json"),
                fetch("data/marken.json")
            ]);
            if (!templateResponse.ok || !badgeResponse.ok) throw new Error("Standardplaneringarna eller märkeskatalogen kunde inte hämtas.");
            [templates, badgesById] = await Promise.all([
                templateResponse.json(),
                badgeResponse.json().then(badges => new Map(badges.map(badge => [badge.id, badge])))
            ]);
            if (!Array.isArray(templates) || !templates.length) throw new Error("Inga standardplaneringar hittades.");
            templateSelect.replaceChildren(...templates.map((template, index) => new Option(template.name, String(index))));
            templateSelect.addEventListener("change", render);
            render();
        } catch (error) {
            status.textContent = error.message || "Utvecklingstrappan kunde inte laddas.";
            status.classList.add("development-ladder-status--error");
            ladder.replaceChildren();
        }
    }

    loadData();
})();