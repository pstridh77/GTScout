const recipeGrid = document.getElementById("recipeGrid");
const recipeEmpty = document.getElementById("recipeEmpty");
const recipeSearch = document.getElementById("recipeSearch");
const recipeCategoryFilter = document.getElementById("recipeCategoryFilter");
const recipeDifficultyFilter = document.getElementById("recipeDifficultyFilter");
const recipeModal = document.getElementById("recipeModal");
const recipeForm = document.getElementById("recipeForm");
const recipeFormStatus = document.getElementById("recipeFormStatus");
const recipeSyncStatus = document.getElementById("recipeSyncStatus");
let editingRecipeId = null;
let recipes = [];
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
    const rounded = Math.round(normalizedQuantity * 100) / 100;
    return `${String(rounded).replace(".", ",")}${normalizedUnit ? ` ${normalizedUnit}` : ""}`;
}

function scaleAmount(amount, baseAmount, baseServings, targetServings) {
    const explicit = parseAmount(amount);
    if (explicit) return formatAmount(explicit.quantity, explicit.unit);
    const base = parseAmount(baseAmount);
    if (!base || !baseServings || !targetServings) return amount || "";
    return formatAmount(base.quantity * targetServings / baseServings, base.unit);
}

function scaleIngredientAmount(row, recipe, targetServings) {
    const exactAmount = row.mangder?.[String(targetServings)];
    const exactParsed = parseAmount(exactAmount);
    if (exactAmount) return exactParsed ? formatAmount(exactParsed.quantity, exactParsed.unit) : exactAmount;

    const points = RECIPE_SCALE_OPTIONS
        .map(servings => ({ servings, parsed: parseAmount(row.mangder?.[String(servings)]) }))
        .filter(point => point.parsed);
    if (!points.length) return "";

    const base = [...points].reverse().find(point => point.servings <= targetServings) || points[0];
    return formatAmount(base.parsed.quantity * targetServings / base.servings, base.parsed.unit);
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
    editor.replaceChildren(...rows.map(row => {
        const element = document.createElement("div");
        element.className = "recipe-ingredient-row";
        element.innerHTML = `<input class="recipe-ingredient-name" data-ingredient-name type="text" placeholder="Ingrediens" value="${escapeRecipeHtml(row.namn)}" required><div class="recipe-ingredient-amounts">${RECIPE_SCALE_OPTIONS.map(servings => `<label><span>${servings}</span><input data-ingredient-amount="${servings}" type="text" placeholder="-" value="${escapeRecipeHtml(row.mangder?.[String(servings)] || "")}"></label>`).join("")}</div><button class="recipe-remove-ingredient" data-remove-ingredient type="button" aria-label="Ta bort ingrediens">&times;</button>`;
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

function renderRecipes() {
    const visible = visibleRecipes();
    recipeEmpty.classList.toggle("hidden", visible.length > 0);
    recipeGrid.replaceChildren(...visible.map(recipe => {
        const card = document.createElement("article");
        card.className = "recipe-card";
        const targetServings = getRecipeTargetServings(recipe);
        const scaledIngredients = getIngredientRows(recipe).map(row => `${scaleIngredientAmount(row, recipe, targetServings)} ${row.namn}`.trim());
        card.innerHTML = `<div class="recipe-card-top"><span class="recipe-category">${escapeRecipeHtml(recipe.kategori)}</span><span class="recipe-difficulty recipe-difficulty--${recipe.svarighet.toLocaleLowerCase("sv-SE")}">${escapeRecipeHtml(recipe.svarighet)}</span></div><h2>${escapeRecipeHtml(recipe.namn)}</h2><p class="recipe-description">${escapeRecipeHtml(recipe.beskrivning || "Ett recept för scoutköket.")}</p><dl class="recipe-meta"><div><dt>Portioner</dt><dd>${targetServings}</dd></div><div><dt>Tid</dt><dd>${escapeRecipeHtml(recipe.tid || "- ")}</dd></div></dl><label class="recipe-serving-control"><span>Visa recept för</span><input data-recipe-servings="${recipe.id}" aria-label="Visa ${escapeRecipeHtml(recipe.namn)} för antal personer" type="number" min="4" step="1" value="${targetServings}"></label><details><summary>Visa recept</summary><div class="recipe-details"><h3>Ingredienser</h3><ul>${scaledIngredients.map(item => `<li>${escapeRecipeHtml(item)}</li>`).join("")}</ul><h3>Gör så här</h3><p>${escapeRecipeHtml(recipe.instruktioner).replace(/\n/g, "<br>")}</p></div></details><div class="recipe-card-actions"><button class="btn-secondary" type="button" data-edit-recipe="${recipe.id}">Redigera</button></div>`;
        return card;
    }));
}

function openRecipeModal(recipe = null) {
    editingRecipeId = recipe?.id || null;
    document.getElementById("recipeModalTitle").textContent = recipe ? "Redigera recept" : "Lägg till recept";
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
document.getElementById("addIngredientBtn").addEventListener("click", () => {
    const rows = readIngredientRows();
    rows.push({ namn: "", mangder: { "4": "" } });
    renderIngredientEditor(rows);
    document.querySelector("[data-ingredient-name]:last-of-type")?.focus();
});
document.getElementById("recipeIngredientsEditor").addEventListener("click", event => {
    if (!event.target.closest("[data-remove-ingredient]")) return;
    const rows = readIngredientRows();
    const row = event.target.closest(".recipe-ingredient-row");
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
recipeGrid.addEventListener("click", event => { const button = event.target.closest("[data-edit-recipe]"); if (!button) return; const recipe = recipes.find(item => item.id === button.dataset.editRecipe); if (recipe && window.GTScoutCookbook.canWrite()) openRecipeModal(recipe); });
window.GTScoutCookbook.init({ onChange(nextRecipes) { recipes = nextRecipes; populateRecipeFilters(); renderRecipes(); setRecipeStatus(window.GTScoutCookbook.canWrite() ? "" : "Logga in som ledare eller admin för att redigera recept."); } });
