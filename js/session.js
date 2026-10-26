/* Find It! V2 - one local session */
(function () {
  function key() { return window.FINDIT_CONFIG.sessionKey; }

  function storage() { return window.FindItAPI && FindItAPI.isSupabase ? sessionStorage : localStorage; }
  window.FindItSession = {
    get() {
      try { return JSON.parse(storage().getItem(key())) || null; }
      catch (_) { return null; }
    },
    set(session) {
      storage().setItem(key(), JSON.stringify({
        gameCode: String(session.gameCode || "").toUpperCase(),
        playerId: String(session.playerId || ""),
        playerName: String(session.playerName || ""),
        isHost: session.isHost === true,
        sessionToken: String(session.sessionToken || "")
      }));
      return this.get();
    },
    clear() { storage().removeItem(key()); },
    valid(session) {
      return !!(session && session.gameCode && session.playerId);
    }
  };
})();
