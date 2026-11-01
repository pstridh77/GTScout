const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadSyncRetry() {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "sync-retry.js"), "utf8");
    const context = vm.createContext({ window: {}, setTimeout });
    vm.runInContext(source, context);
    return context.window.GTScoutSyncRetry;
}

const networkError = message => Object.assign(new Error(message), { name: "TypeError" });

test("isNetworkError recognizes transient fetch failures across browsers", () => {
    const { isNetworkError } = loadSyncRetry();
    assert.equal(isNetworkError(networkError("Load failed")), true);
    assert.equal(isNetworkError(networkError("Failed to fetch")), true);
    assert.equal(isNetworkError(networkError("NetworkError when attempting to fetch resource.")), true);
    assert.equal(isNetworkError(new Error("TypeError: Load failed")), true);
    assert.equal(isNetworkError(new Error("failed to fetch")), true);
});

test("isNetworkError rejects errors with codes and other messages", () => {
    const { isNetworkError } = loadSyncRetry();
    assert.equal(isNetworkError({ code: "23505", message: "duplicate key value" }), false);
    assert.equal(isNetworkError(new Error("AbortError: The operation was aborted")), false);
    assert.equal(isNetworkError(new Error("Load failed but then recovered")), false);
    assert.equal(isNetworkError(null), false);
    assert.equal(isNetworkError(undefined), false);
});

test("withRetry returns the operation result on first success", async () => {
    const { withRetry } = loadSyncRetry();
    let calls = 0;
    const result = await withRetry(async () => { calls++; return "ok"; });
    assert.equal(result, "ok");
    assert.equal(calls, 1);
});

test("withRetry retries once after a network error and succeeds", async () => {
    const { withRetry } = loadSyncRetry();
    let calls = 0;
    const result = await withRetry(async () => {
        calls++;
        if (calls === 1) throw networkError("Failed to fetch");
        return "ok";
    });
    assert.equal(result, "ok");
    assert.equal(calls, 2);
});

test("withRetry throws after a second network error", async () => {
    const { withRetry } = loadSyncRetry();
    let calls = 0;
    await assert.rejects(withRetry(async () => {
        calls++;
        throw networkError("Load failed");
    }), /Load failed/);
    assert.equal(calls, 2);
});

test("withRetry does not retry non-network errors", async () => {
    const { withRetry } = loadSyncRetry();
    let calls = 0;
    await assert.rejects(withRetry(async () => {
        calls++;
        throw Object.assign(new Error("duplicate key value"), { code: "23505" });
    }), /duplicate key value/);
    assert.equal(calls, 1);
});

test("withRetry aborts the retry when the guard no longer holds", async () => {
    const { withRetry } = loadSyncRetry();
    let calls = 0;
    let allowed = true;
    await assert.rejects(withRetry(async () => {
        calls++;
        allowed = false;
        throw networkError("Failed to fetch");
    }, () => allowed), /Failed to fetch/);
    assert.equal(calls, 1);
});

test("withRetry retries when the guard still holds", async () => {
    const { withRetry } = loadSyncRetry();
    let calls = 0;
    const result = await withRetry(async () => {
        calls++;
        if (calls === 1) throw networkError("NetworkError when attempting to fetch resource.");
        return "ok";
    }, () => true);
    assert.equal(result, "ok");
    assert.equal(calls, 2);
});

test("withRetry works without a guard", async () => {
    const { withRetry } = loadSyncRetry();
    let calls = 0;
    const result = await withRetry(async () => {
        calls++;
        if (calls === 1) throw networkError("Load failed");
        return 42;
    });
    assert.equal(result, 42);
    assert.equal(calls, 2);
});
