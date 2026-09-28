/* Find It! V2 - the only Apps Script HTTP client */
(function () {
  function apiUrl() {
    const url = String(window.FINDIT_CONFIG.apiUrl || "").trim();
    if (!/^https:\/\//i.test(url) || url.includes("PASTE_APPS_SCRIPT")) {
      throw new Error("Apps Script Web App URL has not been configured in js/config.js.");
    }
    return url;
  }

  async function parseResponse(response) {
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch (_) {
      throw new Error("The API returned HTML or invalid JSON. Check the Apps Script deployment URL and access settings.");
    }
    if (!payload || payload.ok !== true) {
      const error = payload && payload.error ? payload.error : {};
      const e = new Error(error.message || "Find It API request failed.");
      e.code = error.code || "API_ERROR";
      throw e;
    }
    return payload.data;
  }

  window.FindItAPI = {
    async get(action, params) {
      const url = new URL(apiUrl());
      url.searchParams.set("action", action);
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
      return parseResponse(await fetch(url.toString(), { method: "GET", redirect: "follow", cache: "no-store" }));
    },

    async post(action, data) {
      const url = new URL(apiUrl());
      url.searchParams.set("action", action);
      return parseResponse(await fetch(url.toString(), {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ action }, data || {}))
      }));
    }
  };
})();
