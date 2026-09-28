/* Find It! V2 - the only Apps Script HTTP client */
(function () {
  const GET_MAX_RETRIES = 2;
  const GET_RETRY_DELAY_MS = 450;

  function apiUrl() {
    const url = String(window.FINDIT_CONFIG.apiUrl || "").trim();
    if (!/^https:\/\//i.test(url) || url.includes("PASTE_APPS_SCRIPT")) {
      throw new Error("Apps Script Web App URL has not been configured in js/config.js.");
    }
    return url;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function readResponse(response, action, method, requestUrl) {
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    const details = {
      action,
      method,
      status: response.status,
      ok: response.ok,
      contentType,
      requestUrl,
      finalUrl: response.url,
      redirected: response.redirected,
      text
    };
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
    return details;
  }

  function isTransientEcho404(details) {
    return details.status === 404 &&
      /^text\/html\b/i.test(details.contentType) &&
      /script\.googleusercontent\.com\/macros\/echo/i.test(details.finalUrl || "");
  }

  function parseDetails(details) {
    let payload;
    try { payload = JSON.parse(details.text); }
    catch (_) {
      console.error("[FindIt API] INVALID JSON", {
        action: details.action,
        method: details.method,
        status: details.status,
        contentType: details.contentType,
        requestUrl: details.requestUrl,
        finalUrl: details.finalUrl,
        redirected: details.redirected,
        responsePreview: details.text.slice(0, 800)
      });
      throw new Error(details.action + " failed: HTTP " + details.status + " returned " + (details.contentType || "unknown content type") + ". See console [FindIt API] INVALID JSON details.");
    }
    if (!payload || payload.ok !== true) {
      const error = payload && payload.error ? payload.error : {};
      console.error("[FindIt API] API ERROR", {action:details.action, method:details.method, status:details.status, error});
      const e = new Error(error.message || "Find It API request failed.");
      e.code = error.code || "API_ERROR";
      throw e;
    }
    console.log("[FindIt API] OK", details.action);
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

      for (let attempt = 0; attempt <= GET_MAX_RETRIES; attempt++) {
        console.log("[FindIt API] GET", action, requestUrl, "attempt", attempt + 1);
        try {
          const response = await fetch(requestUrl, { method: "GET", redirect: "follow", cache: "no-store" });
          const details = await readResponse(response, action, "GET", requestUrl);

          if (isTransientEcho404(details) && attempt < GET_MAX_RETRIES) {
            const waitMs = GET_RETRY_DELAY_MS * (attempt + 1);
            console.warn("[FindIt API] TRANSIENT ECHO 404 - RETRYING", {
              action,
              attempt: attempt + 1,
              nextAttempt: attempt + 2,
              waitMs,
              finalUrl: details.finalUrl
            });
            await delay(waitMs);
            continue;
          }

          return parseDetails(details);
        } catch (error) {
          console.error("[FindIt API] GET FAILED", action, "attempt", attempt + 1, error);
          throw error;
        }
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
        const details = await readResponse(response, action, "POST", requestUrl);
        return parseDetails(details);
      } catch (error) {
        console.error("[FindIt API] POST FAILED - NOT RETRIED", action, error);
        throw error;
      }
    }
  };
})();
