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
const RECIPE_SERVING_OPTIONS = [4, 10, 25, 50, 100];
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

function parseIngredientQuantity(value) {
    const text = String(value);
    const match = text.match(/(^|[\s,;])((?:\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?)|\d+\/\d+)(?=\s|$)/);
    if (!match) return null;
    const raw = match[2].replace(",", ".");
    const parts = raw.split(/\s+/);
    let quantity = 0;
    parts.forEach(part => {
        if (part.includes("/")) {
            const [numerator, denominator] = part.split("/").map(Number);
            if (denominator) quantity += numerator / denominator;
        } else {
            quantity += Number(part);
        }
    });
    const quantityStart = match.index + match[1].length;
    return Number.isFinite(quantity) && quantity > 0 ? { start: quantityStart, length: match[2].length, quantity } : null;
}

function formatIngredientQuantity(quantity) {
    const rounded = Math.round(quantity * 100) / 100;
    return String(rounded).replace(".", ",");
}

function scaleIngredient(ingredient, baseServings, targetServings) {
    const parsed = parseIngredientQuantity(ingredient);
    if (!parsed || !baseServings || baseServings === targetServings) return ingredient;
    const scaled = parsed.quantity * targetServings / baseServings;
    return `${ingredient.slice(0, parsed.start)}${formatIngredientQuantity(scaled)}${ingredient.slice(parsed.start + parsed.length)}`;
}

function getRecipeTargetServings(recipe) {
    const selected = recipeServingSelections.get(recipe.id);
    return RECIPE_SERVING_OPTIONS.includes(selected) ? selected : (RECIPE_SERVING_OPTIONS.includes(recipe.portioner) ? recipe.portioner : 4);
}

function renderRecipes() {
    const visible = visibleRecipes();
    recipeEmpty.classList.toggle("hidden", visible.length > 0);
    recipeGrid.replaceChildren(...visible.map(recipe => {
        const card = document.createElement("article");
        card.className = "recipe-card";
        const targetServings = getRecipeTargetServings(recipe);
        const servingOptions = RECIPE_SERVING_OPTIONS.map(servings => `<option value="${servings}"${servings === targetServings ? " selected" : ""}>${servings} personer</option>`).join("");
        const scaledIngredients = recipe.ingredienser.map(item => scaleIngredient(item, recipe.portioner, targetServings));
        card.innerHTML = `<div class="recipe-card-top"><span class="recipe-category">${escapeRecipeHtml(recipe.kategori)}</span><span class="recipe-difficulty recipe-difficulty--${recipe.svarighet.toLocaleLowerCase("sv-SE")}">${escapeRecipeHtml(recipe.svarighet)}</span></div><h2>${escapeRecipeHtml(recipe.namn)}</h2><p class="recipe-description">${escapeRecipeHtml(recipe.beskrivning || "Ett recept för scoutköket.")}</p><dl class="recipe-meta"><div><dt>Portioner</dt><dd>${targetServings}</dd></div><div><dt>Tid</dt><dd>${escapeRecipeHtml(recipe.tid || "- ")}</dd></div></dl><label class="recipe-serving-control"><span>Skala till</span><select data-recipe-servings="${recipe.id}" aria-label="Skala ${escapeRecipeHtml(recipe.namn)} till antal personer">${servingOptions}</select></label><details><summary>Visa recept</summary><div class="recipe-details"><h3>Ingredienser</h3><ul>${scaledIngredients.map(item => `<li>${escapeRecipeHtml(item)}</li>`).join("")}</ul><h3>Gör så här</h3><p>${escapeRecipeHtml(recipe.instruktioner).replace(/\n/g, "<br>")}</p></div></details><div class="recipe-card-actions"><button class="btn-secondary" type="button" data-edit-recipe="${recipe.id}">Redigera</button></div>`;
        return card;
    }));
}

function openRecipeModal(recipe = null) {
    editingRecipeId = recipe?.id || null;
    document.getElementById("recipeModalTitle").textContent = recipe ? "Redigera recept" : "Lägg till recept";
    document.getElementById("recipeName").value = recipe?.namn || "";
    document.getElementById("recipeCategory").value = recipe?.kategori || "";
    document.getElementById("recipeServings").value = recipe?.portioner || 4;
    document.getElementById("recipeTime").value = recipe?.tid || "";
    document.getElementById("recipeDifficulty").value = recipe?.svarighet || "Enkel";
    document.getElementById("recipeDescription").value = recipe?.beskrivning || "";
    document.getElementById("recipeIngredients").value = (recipe?.ingredienser || []).join("\n");
    document.getElementById("recipeInstructions").value = recipe?.instruktioner || "";
    document.getElementById("deleteRecipeBtn").classList.toggle("hidden", !recipe);
    recipeFormStatus.textContent = "";
    recipeModal.classList.remove("hidden");
    document.getElementById("recipeName").focus();
}

function closeRecipeModal() { recipeModal.classList.add("hidden"); editingRecipeId = null; }

async function saveRecipe(event) {
    event.preventDefault();
    const recipe = { id: editingRecipeId || crypto.randomUUID(), namn: document.getElementById("recipeName").value.trim(), kategori: document.getElementById("recipeCategory").value.trim() || "Övrigt", portioner: document.getElementById("recipeServings").value, tid: document.getElementById("recipeTime").value.trim(), svarighet: document.getElementById("recipeDifficulty").value, beskrivning: document.getElementById("recipeDescription").value.trim(), ingredienser: document.getElementById("recipeIngredients").value.split(/\r?\n/).map(value => value.trim()).filter(Boolean), instruktioner: document.getElementById("recipeInstructions").value.trim() };
    if (!recipe.ingredienser.length || !recipe.instruktioner) { recipeFormStatus.textContent = "Fyll i ingredienser och instruktioner."; return; }
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
