/* Find It! V2 - create, join and lobby actions */
(function () {
  function value(id) { return String(document.getElementById(id).value || "").trim(); }

  async function createGame() {
    const hostName = value("hostNameInput");
    const challengeCount = Number(document.getElementById("challengeCountInput").value);
    FindItApp.showMessage("hostSetupMessage", "Creating game...", false);
    try {
      const data = await FindItAPI.post("createGame", { hostName, challengeCount });
      FindItApp.setSession({
        gameCode: data.game.gameCode,
        playerId: data.player.playerId,
        playerName: data.player.name,
        isHost: true
      });
    } catch (error) {
      FindItApp.showMessage("hostSetupMessage", error.message, true);
    }
  }

  async function joinGame() {
    const gameCode = value("joinGameCodeInput").toUpperCase();
    const playerName = value("joinNameInput");
    FindItApp.showMessage("joinMessage", "Joining...", false);
    try {
      const data = await FindItAPI.post("joinGame", { gameCode, playerName });
      FindItApp.setSession({
        gameCode: data.game.gameCode,
        playerId: data.player.playerId,
        playerName: data.player.name,
        isHost: false
      });
    } catch (error) {
      FindItApp.showMessage("joinMessage", error.message, true);
    }
  }

  async function startGame() {
    const session = FindItApp.state.session;
    if (!session || !session.isHost) return;
    FindItApp.showMessage("lobbyMessage", "Starting game...", false);
    try {
      await FindItAPI.post("startGame", { gameCode: session.gameCode, playerId: session.playerId });
      await FindItApp.pollNow();
    } catch (error) {
      FindItApp.showMessage("lobbyMessage", error.message, true);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("hostButton").addEventListener("click", () => FindItApp.navigate("hostSetupScreen"));
    document.getElementById("joinButton").addEventListener("click", joinGame);
    document.getElementById("createGameButton").addEventListener("click", createGame);
    document.getElementById("startGameButton").addEventListener("click", startGame);
    document.getElementById("hostBackButton").addEventListener("click", () => FindItApp.navigate("splashScreen"));
    document.querySelectorAll("[data-home]").forEach(button => button.addEventListener("click", () => FindItApp.clearSession()));
  });
})();
