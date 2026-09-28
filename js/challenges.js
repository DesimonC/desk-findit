/* Find It! V2 - challenge cards, progress and completion UI */
(function () {
  let loading = false;

  async function loadChallenges() {
    const session = FindItApp.state.session;
    if (!session || loading || FindItApp.state.game?.status !== "PLAYING") return;
    loading = true;
    try {
      const data = await FindItAPI.get("getChallenges", { gameCode:session.gameCode, playerId:session.playerId });
      render(data);
    } catch (error) {
      FindItApp.showMessage("challengeMessage", error.message, true);
    } finally { loading = false; }
  }

  function render(data) {
    const total = Number(data.challengeCount || 0);
    const done = Number(data.completedCount || 0);
    document.getElementById("progressText").textContent = done + " / " + total + " Complete";
    document.getElementById("progressBar").style.width = (total ? Math.round(done / total * 100) : 0) + "%";
    const cards = document.getElementById("challengeCards");
    cards.innerHTML = "";
    data.challenges.forEach(challenge => {
      const complete = challenge.status === "SUBMITTED" || challenge.status === "PASSED";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "challenge-card" + (complete ? " complete" : "");
      button.disabled = complete;
      button.innerHTML = '<span class="challenge-number">Challenge ' + challenge.challengeNumber + '</span><strong>' + escapeHtml(challenge.name) + '</strong><span class="challenge-description">' + escapeHtml(challenge.description) + '</span><span class="challenge-status">' + (challenge.status === "SUBMITTED" ? "✓ Photo submitted" : challenge.status === "PASSED" ? "✓ Passed" : "Open challenge →") + '</span>';
      if (!complete) button.addEventListener("click", () => window.FindItPhotos.open(challenge));
      cards.appendChild(button);
    });
    const completePanel = document.getElementById("completionPanel");
    completePanel.hidden = done !== total || total === 0;
    if (done === total && total > 0) {
      document.getElementById("completionTitle").textContent = "All done!";
      document.getElementById("completionText").textContent = data.everyoneComplete ? "Everyone has completed the challenges." : "You've completed all challenges. Waiting for the other players...";
    }
    if (FindItApp.state.session?.isHost) loadHostProgress();
  }

  async function loadHostProgress() {
    const session = FindItApp.state.session;
    try {
      const data = await FindItAPI.get("getCompletionStatus", { gameCode:session.gameCode, playerId:session.playerId });
      const box = document.getElementById("hostProgress");
      box.hidden = false;
      box.innerHTML = '<h3>Player progress</h3>' + data.players.map(p => '<div class="player-progress"><span>' + escapeHtml(p.name) + (p.isHost ? ' (Host)' : '') + '</span><strong>' + p.completedCount + '/' + p.challengeCount + (p.complete ? ' ✓' : '') + '</strong></div>').join('') + (data.everyoneComplete ? '<p class="ready-note">Everyone is complete. Voting can start in the next V2 stage.</p>' : '');
    } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  window.FindItChallenges = { load:loadChallenges };
})();
