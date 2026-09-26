const recipeGrid = document.getElementById("recipeGrid");
const recipeEmpty = document.getElementById("recipeEmpty");
const recipeSearch = document.getElementById("recipeSearch");
const recipeCategoryFilter = document.getElementById("recipeCategoryFilter");
const recipeDifficultyFilter = document.getElementById("recipeDifficultyFilter");
const recipeModal = document.getElementById("recipeModal");
const recipeForm = document.getElementById("recipeForm");
const recipeFormStatus = document.getElementById("recipeFormStatus");
const recipeSyncStatus = document.getElementById("recipeSyncStatus");
const recipeShareModal = document.getElementById("recipeShareModal");
const recipeShareUrl = document.getElementById("recipeShareUrl");
const recipeShareStatus = document.getElementById("recipeShareStatus");
let editingRecipeId = null;
let recipes = [];
const sharedRecipeIdFromUrl = new URLSearchParams(window.location.search).get("recipe");
const RECIPE_SCALE_OPTIONS = [4, 10, 25, 50, 100];
const recipeServingSelections = new Map();

function escapeRecipeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function setRecipeStatus(text, error = false) {
    recipeSyncStatus.textContent = text || "";
    recipeSyncStatus.classList.toggle("hidden", !text);
    recipeSyncStatus.classList.toggle("planning-sync-status--error", error);
}

function populateRecipeFilters() {
    const selected = recipeCategoryFilter.value;
    const categories = [...new Set(recipes.map(recipe => recipe.kategori).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv"));
    recipeCategoryFilter.replaceChildren(new Option("Alla kategorier", "Alla"), ...categories.map(category => new Option(category, category)));
    recipeCategoryFilter.value = categories.includes(selected) ? selected : "Alla";
    document.getElementById("recipeCategories").replaceChildren(...categories.map(category => { const option = document.createElement("option"); option.value = category; return option; }));
}

function visibleRecipes() {
    const query = recipeSearch.value.trim().toLocaleLowerCase("sv-SE");
    return recipes.filter(recipe => {
        const haystack = [recipe.namn, recipe.kategori, recipe.beskrivning, ...recipe.ingredienser].join(" ").toLocaleLowerCase("sv-SE");
        return (!query || haystack.includes(query)) && (recipeCategoryFilter.value === "Alla" || recipe.kategori === recipeCategoryFilter.value) && (recipeDifficultyFilter.value === "Alla" || recipe.svarighet === recipeDifficultyFilter.value);
    });
}

function parseAmount(value) {
    const match = String(value || "").trim().match(/^(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(ml|cl|dl|l|liter|mg|g|gram|kg|krm|tsk|msk|st)?\b/i);
    if (!match) return null;
    const parts = match[1].replace(",", ".").split(/\s+/);
    let quantity = 0;
    parts.forEach(part => {
        if (part.includes("/")) {
            const [numerator, denominator] = part.split("/").map(Number);
            if (denominator) quantity += numerator / denominator;
        } else quantity += Number(part);
    });
    const unit = (match[2] || "").toLowerCase() === "liter" ? "l" : (match[2] || "").toLowerCase();
    return Number.isFinite(quantity) && quantity > 0 ? { quantity, unit } : null;
}

function formatAmount(quantity, unit) {
    let normalizedQuantity = quantity;
    let normalizedUnit = unit;
    if (unit === "ml" && quantity >= 1000) { normalizedQuantity = quantity / 1000; normalizedUnit = "l"; }
    if (unit === "cl" && quantity >= 100) { normalizedQuantity = quantity / 100; normalizedUnit = "l"; }
    if (unit === "dl" && quantity > 10) { normalizedQuantity = quantity / 10; normalizedUnit = "l"; }
    if (unit === "mg" && quantity >= 1000) { normalizedQuantity = quantity / 1000; normalizedUnit = "g"; }
    if (["g", "gram"].includes(unit) && quantity >= 1000) { normalizedQuantity = quantity / 1000; normalizedUnit = "kg"; }
    if (normalizedUnit === "gram") normalizedUnit = "g";
    const rounded = normalizedUnit === "g"
        ? Math.round(normalizedQuantity / 10) * 10
        : ["krm", "tsk", "msk"].includes(normalizedUnit)
            ? Math.round(normalizedQuantity * 2) / 2
            : Math.round(normalizedQuantity * 10) / 10;
    return `${String(rounded).replace(".", ",")}${normalizedUnit ? ` ${normalizedUnit}` : ""}`;
}

function scaleAmount(amount, baseAmount, baseServings, targetServings) {
    const explicit = parseAmount(amount);
    if (explicit) return formatAmount(explicit.quantity, explicit.unit);
    const base = parseAmount(baseAmount);
    if (!base || !baseServings || !targetServings) return amount || "";
    return formatAmount(base.quantity * targetServings / baseServings, base.unit);
}

function toComparableAmount(parsed) {
    const unit = parsed.unit;
    const volumeFactors = { ml: 1, cl: 10, dl: 100, l: 1000 };
    const weightFactors = { mg: 1, g: 1000, gram: 1000, kg: 1000000 };
    const spoonFactors = { krm: 1, tsk: 3, msk: 9 };
    if (volumeFactors[unit]) return { category: "volume", value: parsed.quantity * volumeFactors[unit], unit };
    if (weightFactors[unit]) return { category: "weight", value: parsed.quantity * weightFactors[unit], unit };
    if (spoonFactors[unit]) return { category: "spoon", value: parsed.quantity * spoonFactors[unit], unit };
    return { category: `unit:${unit}`, value: parsed.quantity, unit };
}

function formatComparableAmount(value, comparable) {
    const volumeFactors = { ml: 1, cl: 10, dl: 100, l: 1000 };
    const weightFactors = { mg: 1, g: 1000, gram: 1000, kg: 1000000 };
    const spoonFactors = { krm: 1, tsk: 3, msk: 9 };
    const factors = comparable.category === "volume" ? volumeFactors : comparable.category === "weight" ? weightFactors : comparable.category === "spoon" ? spoonFactors : null;
    const quantity = factors ? value / factors[comparable.unit] : value;
    return formatAmount(quantity, comparable.unit);
}

function scaleIngredientAmount(row, recipe, targetServings) {
    const exactAmount = row.mangder?.[String(targetServings)];
    const exactParsed = parseAmount(exactAmount);
    if (exactAmount) return exactParsed ? formatAmount(exactParsed.quantity, exactParsed.unit) : exactAmount;

    const points = RECIPE_SCALE_OPTIONS
        .map(servings => {
            const parsed = parseAmount(row.mangder?.[String(servings)]);
            return parsed ? { servings, parsed, comparable: toComparableAmount(parsed) } : null;
        })
        .filter(point => point?.comparable)
        .filter((point, _, all) => point.comparable.category === all[0].comparable.category);
    if (!points.length) return "";

    if (points.length === 1) {
        const point = points[0];
        return formatComparableAmount(point.comparable.value * targetServings / point.servings, point.comparable);
    }

    let lower = points[0];
    let upper = points[1];
    if (targetServings <= points[0].servings) {
        [lower, upper] = points.slice(0, 2);
    } else if (targetServings >= points[points.length - 1].servings) {
        [lower, upper] = points.slice(-2);
    } else {
        for (let index = 1; index < points.length; index += 1) {
            if (points[index].servings >= targetServings) {
                lower = points[index - 1];
                upper = points[index];
                break;
            }
        }
    }

    const ratio = (targetServings - lower.servings) / (upper.servings - lower.servings);
    const value = lower.comparable.value + (upper.comparable.value - lower.comparable.value) * ratio;
    return formatComparableAmount(value, lower.comparable);
}

function parseLegacyIngredient(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(ml|cl|dl|l|liter|mg|g|gram|kg|krm|tsk|msk|st)?\s+(.+)$/i);
    if (!match) return { namn: text, mangder: {} };
    return { namn: match[3].trim(), mangder: { "4": `${match[1]}${match[2] ? ` ${match[2]}` : ""}` } };
}

function getIngredientRows(recipe) {
    if (Array.isArray(recipe.ingredienser_skalningar) && recipe.ingredienser_skalningar.length) {
        return recipe.ingredienser_skalningar.map(row => ({ namn: row.namn, mangder: { ...row.mangder } }));
    }
    return recipe.ingredienser.map(parseLegacyIngredient).filter(row => row.namn);
}

function renderIngredientEditor(rows) {
    const editor = document.getElementById("recipeIngredientsEditor");
    editor.replaceChildren(...rows.map((row, index) => {
        const element = document.createElement("div");
        element.className = "recipe-ingredient-row";
        element.innerHTML = `<input class="recipe-ingredient-name" data-ingredient-name type="text" placeholder="Ingrediens" value="${escapeRecipeHtml(row.namn)}" required><div class="recipe-ingredient-amounts">${RECIPE_SCALE_OPTIONS.map(servings => `<label><span>${servings}</span><input data-ingredient-amount="${servings}" type="text" placeholder="-" value="${escapeRecipeHtml(row.mangder?.[String(servings)] || "")}"></label>`).join("")}</div><div class="recipe-ingredient-actions"><button class="recipe-move-ingredient" data-move-ingredient="up" type="button" aria-label="Flytta ${escapeRecipeHtml(row.namn)} upp"${index === 0 ? " disabled" : ""}>&uarr;</button><button class="recipe-move-ingredient" data-move-ingredient="down" type="button" aria-label="Flytta ${escapeRecipeHtml(row.namn)} ner"${index === rows.length - 1 ? " disabled" : ""}>&darr;</button><button class="recipe-remove-ingredient" data-remove-ingredient type="button" aria-label="Ta bort ingrediens">&times;</button></div>`;
        return element;
    }));
}

function readIngredientRows() {
    return [...document.querySelectorAll("[data-ingredient-name]")].map(nameInput => {
        const row = nameInput.closest(".recipe-ingredient-row");
        const mangder = {};
        row.querySelectorAll("[data-ingredient-amount]").forEach(input => { if (input.value.trim()) mangder[input.dataset.ingredientAmount] = input.value.trim(); });
        return { namn: nameInput.value.trim(), mangder };
    }).filter(row => row.namn);
}

function getRecipeTargetServings(recipe) {
    const selected = recipeServingSelections.get(recipe.id);
    return Number.isFinite(selected) && selected >= 4 ? selected : (Number(recipe.portioner) >= 4 ? Number(recipe.portioner) : 4);
}

function openSharedRecipeFromUrl() {
    if (!sharedRecipeIdFromUrl) return;
    const card = [...recipeGrid.querySelectorAll(".recipe-card")]
        .find(element => [...element.querySelectorAll("[data-share-recipe]")]
            .some(button => button.dataset.shareRecipe === sharedRecipeIdFromUrl));
    if (!card) return;
    const details = card.querySelector("details");
    if (details && !details.open) {
        details.setAttribute("open", "");
        card.scrollIntoView({ block: "center" });
    }
}

async function shareRecipe(recipe) {
    const shareUrl = new URL("kokbok.html", window.location.href);
    shareUrl.searchParams.set("recipe", recipe.id);
    recipeShareUrl.value = shareUrl.href;
    recipeShareStatus.textContent = "";
    recipeShareModal.classList.remove("hidden");
    recipeShareUrl.select();
    try {
        await navigator.clipboard.writeText(shareUrl.href);
        recipeShareStatus.textContent = "Länken har kopierats. Du kan också kopiera den manuellt.";
    } catch {
        recipeShareStatus.textContent = "Markera länken och kopiera den manuellt.";
    }
}

function renderRecipes() {
    const visible = visibleRecipes();
    recipeEmpty.classList.toggle("hidden", visible.length > 0);
    recipeGrid.replaceChildren(...visible.map(recipe => {
        const card = document.createElement("article");
        card.className = "recipe-card";
        const targetServings = getRecipeTargetServings(recipe);
        const scaledIngredients = getIngredientRows(recipe).map(row => `${scaleIngredientAmount(row, recipe, targetServings)} ${row.namn}`.trim());
                card.innerHTML = `<div class="recipe-card-top"><span class="recipe-category">${escapeRecipeHtml(recipe.kategori)}</span><span class="recipe-difficulty recipe-difficulty--${recipe.svarighet.toLocaleLowerCase("sv-SE")}">${escapeRecipeHtml(recipe.svarighet)}</span></div><h2>${escapeRecipeHtml(recipe.namn)}</h2><p class="recipe-description">${escapeRecipeHtml(recipe.beskrivning || "Ett recept för scoutköket.")}</p><dl class="recipe-meta"><div><dt>Portioner</dt><dd>${targetServings}</dd></div><div><dt>Tid</dt><dd>${escapeRecipeHtml(recipe.tid || "- ")}</dd></div></dl><label class="recipe-serving-control"><span>Visa recept för</span><input data-recipe-servings="${recipe.id}" aria-label="Visa ${escapeRecipeHtml(recipe.namn)} för antal personer" type="number" min="4" step="1" value="${targetServings}"></label><details><summary>Visa recept</summary><div class="recipe-details"><h3>Ingredienser</h3><ul>${scaledIngredients.map(item => `<li>${escapeRecipeHtml(item)}</li>`).join("")}</ul><h3>Gör så här</h3><p>${escapeRecipeHtml(recipe.instruktioner).replace(/\n/g, "<br>")}</p></div></details><div class="recipe-card-actions"><button class="btn-secondary recipe-share-icon-btn" type="button" data-share-recipe="${recipe.id}" aria-label="Dela recept" title="Dela recept"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M18,16.08C17.24,16.08 16.54,16.38 16,16.85L8.91,12.74C8.96,12.5 9,12.25 9,12C9,11.75 8.96,11.5 8.91,11.26L15.92,7.17C16.47,7.66 17.2,7.97 18,7.97C19.66,7.97 21,6.63 21,4.97C21,3.31 19.66,1.97 18,1.97C16.34,1.97 15,1.97 15,4.97C15,5.22 15.04,5.47 15.09,5.71L8.08,9.8C7.53,9.31 6.8,9 6,9C4.34,9 3,10.34 3,12C3,13.66 4.34,15 6,15C6.8,15 7.53,14.69 8.08,14.2L15.17,18.31C15.12,18.54 15,18.77 15,19C15,20.66 16.34,22 18,22C19.66,22 21,20.66 21,19C21,17.34 19.66,16.08 18,16.08Z" /></svg></button><button class="btn-secondary" type="button" data-edit-recipe="${recipe.id}">Redigera</button></div>`;
        if (!window.GTScoutCookbook.canEdit?.()) card.querySelector("[data-edit-recipe]")?.remove();
        card.addEventListener("click", event => {
            if (event.target.closest("button, input, summary, details")) return;
            const details = card.querySelector("details");
            if (details) details.open = !details.open;
        });
        return card;
    }));
    openSharedRecipeFromUrl();
}

function openRecipeModal(recipe = null) {
    editingRecipeId = recipe?.id || null;
    document.getElementById("recipeModalTitle").textContent = recipe ? "Redigera recept" : "Lägg till recept";
    document.getElementById("recipeCreateWarning").classList.toggle("hidden", window.GTScoutCookbook.canEdit?.());
    document.getElementById("recipeName").value = recipe?.namn || "";
    document.getElementById("recipeCategory").value = recipe?.kategori || "";
    document.getElementById("recipeTime").value = recipe?.tid || "";
    document.getElementById("recipeDifficulty").value = recipe?.svarighet || "Enkel";
    document.getElementById("recipeDescription").value = recipe?.beskrivning || "";
    renderIngredientEditor(recipe ? getIngredientRows(recipe) : [{ namn: "", mangder: { "4": "" } }]);
    document.getElementById("recipeInstructions").value = recipe?.instruktioner || "";
    document.getElementById("deleteRecipeBtn").classList.toggle("hidden", !recipe);
    recipeFormStatus.textContent = "";
    recipeModal.classList.remove("hidden");
    document.getElementById("recipeName").focus();
}

function closeRecipeModal() { recipeModal.classList.add("hidden"); editingRecipeId = null; }

async function saveRecipe(event) {
    event.preventDefault();
    const ingredienser_skalningar = readIngredientRows();
    const ingredienser = ingredienser_skalningar.map(row => `${row.mangder?.["4"] || ""} ${row.namn}`.trim());
    const recipe = { id: editingRecipeId || crypto.randomUUID(), namn: document.getElementById("recipeName").value.trim(), kategori: document.getElementById("recipeCategory").value.trim() || "Övrigt", portioner: 4, tid: document.getElementById("recipeTime").value.trim(), svarighet: document.getElementById("recipeDifficulty").value, beskrivning: document.getElementById("recipeDescription").value.trim(), ingredienser, ingredienser_skalningar, instruktioner: document.getElementById("recipeInstructions").value.trim() };
    if (!ingredienser_skalningar.length || !recipe.instruktioner) { recipeFormStatus.textContent = "Lägg till minst en ingrediens och fyll i instruktioner."; return; }
    try {
        const result = await window.GTScoutCookbook.save(recipe);
        recipes = window.GTScoutCookbook.getAll();
        populateRecipeFilters(); renderRecipes(); closeRecipeModal();
        setRecipeStatus(result.localOnly ? "Sparat lokalt i den här webbläsaren." : "Receptet sparades i databasen.");
    } catch (error) { recipeFormStatus.textContent = error.message || "Receptet kunde inte sparas."; }
}

async function deleteRecipe() {
    const recipe = recipes.find(item => item.id === editingRecipeId);
    if (!recipe || !window.confirm(`Ta bort receptet "${recipe.namn}"?`)) return;
    try { await window.GTScoutCookbook.remove(recipe.id); recipes = window.GTScoutCookbook.getAll(); populateRecipeFilters(); renderRecipes(); closeRecipeModal(); setRecipeStatus("Receptet togs bort."); } catch (error) { recipeFormStatus.textContent = error.message || "Receptet kunde inte tas bort."; }
}

document.getElementById("addRecipeBtn").addEventListener("click", () => window.GTScoutCookbook.canWrite() ? openRecipeModal() : setRecipeStatus("Logga in som ledare eller admin för att skapa recept.", true));
document.getElementById("closeRecipeModal").addEventListener("click", closeRecipeModal);
document.getElementById("cancelRecipeBtn").addEventListener("click", closeRecipeModal);
document.getElementById("deleteRecipeBtn").addEventListener("click", deleteRecipe);
document.getElementById("closeRecipeShareModal").addEventListener("click", () => recipeShareModal.classList.add("hidden"));
document.getElementById("cancelRecipeShareBtn").addEventListener("click", () => recipeShareModal.classList.add("hidden"));
recipeShareModal.addEventListener("click", event => { if (event.target === recipeShareModal) recipeShareModal.classList.add("hidden"); });
document.getElementById("copyRecipeShareBtn").addEventListener("click", async () => {
    recipeShareUrl.select();
    try { await navigator.clipboard.writeText(recipeShareUrl.value); recipeShareStatus.textContent = "Länken har kopierats."; } catch { recipeShareStatus.textContent = "Markera länken och kopiera den manuellt."; }
});
document.getElementById("addIngredientBtn").addEventListener("click", () => {
    const rows = readIngredientRows();
    rows.push({ namn: "", mangder: { "4": "" } });
    renderIngredientEditor(rows);
    document.querySelector("[data-ingredient-name]:last-of-type")?.focus();
});
document.getElementById("recipeIngredientsEditor").addEventListener("click", event => {
    const rows = readIngredientRows();
    const row = event.target.closest(".recipe-ingredient-row");
    const moveButton = event.target.closest("[data-move-ingredient]");
    if (moveButton && row) {
        const index = [...row.parentElement.children].indexOf(row);
        const nextIndex = moveButton.dataset.moveIngredient === "up" ? index - 1 : index + 1;
        if (nextIndex >= 0 && nextIndex < rows.length) [rows[index], rows[nextIndex]] = [rows[nextIndex], rows[index]];
        renderIngredientEditor(rows);
        return;
    }
    if (!event.target.closest("[data-remove-ingredient]") || !row) return;
    const index = [...row.parentElement.children].indexOf(row);
    rows.splice(index, 1);
    renderIngredientEditor(rows.length ? rows : [{ namn: "", mangder: { "4": "" } }]);
});
recipeForm.addEventListener("submit", saveRecipe);
[recipeSearch, recipeCategoryFilter, recipeDifficultyFilter].forEach(element => element.addEventListener("input", renderRecipes));
recipeGrid.addEventListener("change", event => {
    const select = event.target.closest("[data-recipe-servings]");
    if (!select) return;
    const card = select.closest(".recipe-card");
    const wasDetailsOpen = Boolean(card?.querySelector("details")?.open);
    recipeServingSelections.set(select.dataset.recipeServings, Number(select.value));
    renderRecipes();
    if (wasDetailsOpen) {
        const updatedSelect = [...recipeGrid.querySelectorAll("[data-recipe-servings]")]
            .find(element => element.dataset.recipeServings === select.dataset.recipeServings);
        updatedSelect?.closest(".recipe-card")?.querySelector("details")?.setAttribute("open", "");
    }
});
recipeGrid.addEventListener("click", event => {
    const shareButton = event.target.closest("[data-share-recipe]");
    if (shareButton) {
        const recipe = recipes.find(item => item.id === shareButton.dataset.shareRecipe);
        if (recipe) shareRecipe(recipe);
        return;
    }
    const button = event.target.closest("[data-edit-recipe]");
    if (!button) return;
    const recipe = recipes.find(item => item.id === button.dataset.editRecipe);
    if (recipe && window.GTScoutCookbook.canWrite()) openRecipeModal(recipe);
});
window.GTScoutCookbook.init({ onChange(nextRecipes) { recipes = nextRecipes; populateRecipeFilters(); renderRecipes(); setRecipeStatus(window.GTScoutCookbook.canWrite() ? "" : "Logga in som ledare eller admin för att redigera recept."); } });
