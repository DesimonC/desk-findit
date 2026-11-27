/* Find It! invitation links: code-only links; players enter the name they used in the game. */
(function () {
  const CODE_PATTERN = /^[A-Z2-9]{4}$/;

  function normalizeCode(value) {
    const code = String(value || "").trim().toUpperCase();
    return CODE_PATTERN.test(code) ? code : "";
  }

  function readJoinCode(href) {
    try { return normalizeCode(new URL(href).searchParams.get("join")); }
    catch (_) { return ""; }
  }

  function buildJoinUrl(href, code) {
    const normalized = normalizeCode(code);
    if (!normalized) throw new Error("A valid game code is required to make an invitation link.");
    const url = new URL(href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("join", normalized);
    return url.href;
  }

  window.FindItInvitations = Object.freeze({ normalizeCode, readJoinCode, buildJoinUrl });
})();
