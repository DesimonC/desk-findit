/* Find It! V2 - the only Apps Script HTTP client */
(function () {
  function apiUrl() {
    const url = String(window.FINDIT_CONFIG.apiUrl || "").trim();
    if (!/^https:\/\//i.test(url) || url.includes("PASTE_APPS_SCRIPT")) {
      throw new Error("Apps Script Web App URL has not been configured in js/config.js.");
    }
    return url;
  }

  async function parseResponse(response, action, method, requestUrl) {
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    console.log("[FindIt API] RESPONSE", {
      action,
      method,
      status: response.status,
      ok: response.ok,
      contentType,
      requestUrl,
      finalUrl: response.url,
      redirected: response.redirected
    });
    let payload;
    try { payload = JSON.parse(text); }
    catch (_) {
      console.error("[FindIt API] INVALID JSON", {
        action,
        method,
        status: response.status,
        contentType,
        requestUrl,
        finalUrl: response.url,
        redirected: response.redirected,
        responsePreview: text.slice(0, 800)
      });
      throw new Error(action + " failed: HTTP " + response.status + " returned " + (contentType || "unknown content type") + ". See console [FindIt API] INVALID JSON details.");
    }
    if (!payload || payload.ok !== true) {
      const error = payload && payload.error ? payload.error : {};
      console.error("[FindIt API] API ERROR", {action, method, status:response.status, error});
      const e = new Error(error.message || "Find It API request failed.");
      e.code = error.code || "API_ERROR";
      throw e;
    }
    console.log("[FindIt API] OK", action);
    return payload.data;
  }

  window.FindItAPI = {
    async get(action, params) {
      const url = new URL(apiUrl());
      url.searchParams.set("action", action);
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
      const requestUrl = url.toString();
      console.log("[FindIt API] GET", action, requestUrl);
      try {
        const response = await fetch(requestUrl, { method: "GET", redirect: "follow", cache: "no-store" });
        return await parseResponse(response, action, "GET", requestUrl);
      } catch (error) {
        console.error("[FindIt API] GET FAILED", action, error);
        throw error;
      }
    },

    async post(action, data) {
      const url = new URL(apiUrl());
      url.searchParams.set("action", action);
      const requestUrl = url.toString();
      console.log("[FindIt API] POST", action, requestUrl, data || {});
      try {
        const response = await fetch(requestUrl, {
          method: "POST",
          redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(Object.assign({ action }, data || {}))
        });
        return await parseResponse(response, action, "POST", requestUrl);
      } catch (error) {
        console.error("[FindIt API] POST FAILED", action, error);
        throw error;
      }
    }
  };
})();
