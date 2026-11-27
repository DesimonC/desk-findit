/* Find It! links use URL fragments so personal rejoin tokens are not sent in HTTP requests. */
(function () {
  const CODE_PATTERN = /^[A-Z2-9]{4}$/;
  const TOKEN_PATTERN = /^[A-F0-9]{48,64}$/i;

  function normalizeCode(value) {
    const code = String(value || "").trim().toUpperCase();
    return CODE_PATTERN.test(code) ? code : "";
  }

  function readJoinCode(href) {
    try { const url=new URL(href);return normalizeCode(url.searchParams.get("join")||new URLSearchParams(url.hash.slice(1)).get("join")); }
    catch (_) { return ""; }
  }

  function readRejoinToken(href) {
    try { const url=new URL(href),token=url.searchParams.get("rejoin")||new URLSearchParams(url.hash.slice(1)).get("rejoin");return TOKEN_PATTERN.test(String(token||""))?String(token):""; }
    catch (_) { return ""; }
  }

  function buildJoinUrl(href, code, rejoinToken) {
    const normalized = normalizeCode(code);
    if (!normalized) throw new Error("A valid game code is required to make an invitation link.");
    const params=new URLSearchParams({join:normalized});
    if(rejoinToken){if(!TOKEN_PATTERN.test(String(rejoinToken)))throw new Error("The player rejoin token is invalid.");params.set("rejoin",String(rejoinToken));}
    const url = new URL(href);
    url.search = "";
    url.hash = params.toString();
    return url.href;
  }

  window.FindItInvitations = Object.freeze({ normalizeCode, readJoinCode, readRejoinToken, buildJoinUrl });
})();
