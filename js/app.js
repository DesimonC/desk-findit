/* Find It! V2 - sole navigation controller + sole state poller */
(function () {
  const state = {
    screen: "splashScreen",
    session: null,
    game: null,
    localActivity: null,
    pollTimer: null,
    polling: false
  };

  function showMessage(id, message, isError) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("error", !!isError);
  }

  function navigate(screenId, options) {
    const target = document.getElementById(screenId);
    if (!target) throw new Error("Unknown screen: " + screenId);
    document.querySelectorAll(".screen").forEach(el => {
      el.classList.remove("active");
      el.hidden = true;
    });
    target.hidden = false;
    target.classList.add("active");
    state.screen = screenId;
    state.localActivity = options && options.activity ? options.activity : null;
    window.scrollTo(0, 0);
  }

  function renderLobby(data) {
    document.getElementById("lobbyGameCode").textContent = data.game.gameCode;
    const list = document.getElementById("lobbyPlayers");
    list.innerHTML = "";
    data.players.forEach(player => {
      const li = document.createElement("li");
      li.textContent = player.name + (player.isHost ? " (Host)" : "");
      list.appendChild(li);
    });
    document.getElementById("startGameButton").hidden = !state.session.isHost;
  }

  function routeServerState(data) {
    state.game = data.game;
    if (data.game.status === "WAITING") {
      if (state.screen !== "lobbyScreen") navigate("lobbyScreen");
      renderLobby(data);
      return;
    }
    if (data.game.status === "PLAYING") {
      // Critical V2 rule: a PLAYING poll cannot close a local photo/challenge activity.
      if (state.localActivity === "photo") return;
      if (state.screen !== "challengesScreen") navigate("challengesScreen");
      document.getElementById("challengePlayerName").textContent = state.session.playerName;
      document.getElementById("challengeGameCode").textContent = data.game.gameCode;
      return;
    }
    if (data.game.status === "VOTING") {
      navigate("votingIntroScreen");
      return;
    }
    if (data.game.status === "FINISHED") {
      navigate("resultsScreen");
    }
  }

  async function pollNow() {
    if (state.polling || !FindItSession.valid(state.session)) return;
    state.polling = true;
    try {
      const data = await FindItAPI.get("getGameState", {
        gameCode: state.session.gameCode,
        playerId: state.session.playerId
      });
      routeServerState(data);
      showMessage("globalMessage", "", false);
    } catch (error) {
      showMessage("globalMessage", error.message, true);
      if (error.code === "SESSION_INVALID" || error.code === "GAME_NOT_FOUND") {
        stopPolling();
        FindItSession.clear();
        state.session = null;
        navigate("splashScreen");
      }
    } finally {
      state.polling = false;
    }
  }

  function startPolling() {
    stopPolling();
    pollNow();
    state.pollTimer = setInterval(pollNow, window.FINDIT_CONFIG.pollMs);
  }

  function stopPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  async function restore() {
    state.session = FindItSession.get();
    if (!FindItSession.valid(state.session)) {
      navigate("splashScreen");
      return;
    }
    startPolling();
  }

  window.FindItApp = {
    state,
    navigate,
    showMessage,
    setSession(session) {
      state.session = FindItSession.set(session);
      startPolling();
    },
    clearSession() {
      stopPolling();
      FindItSession.clear();
      state.session = null;
      state.game = null;
      state.localActivity = null;
      navigate("splashScreen");
    },
    pollNow,
    restore
  };

  document.addEventListener("DOMContentLoaded", restore);
})();
