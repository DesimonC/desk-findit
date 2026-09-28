/* Find It! V2 - one local session */
(function () {
  function key() { return window.FINDIT_CONFIG.sessionKey; }

  window.FindItSession = {
    get() {
      try { return JSON.parse(localStorage.getItem(key())) || null; }
      catch (_) { return null; }
    },
    set(session) {
      localStorage.setItem(key(), JSON.stringify({
        gameCode: String(session.gameCode || "").toUpperCase(),
        playerId: String(session.playerId || ""),
        playerName: String(session.playerName || ""),
        isHost: session.isHost === true
      }));
      return this.get();
    },
    clear() { localStorage.removeItem(key()); },
    valid(session) {
      return !!(session && session.gameCode && session.playerId);
    }
  };
})();
