/* Find It! V2 - isolated photo activity. It never controls game state. */
(function () {
  let selected = null;
  let photoData = null;
  let busy = false;

  function open(challenge) {
    selected = challenge;
    photoData = null;
    document.getElementById("photoChallengeNumber").textContent = "Challenge " + challenge.challengeNumber;
    document.getElementById("photoChallengeName").textContent = challenge.name;
    document.getElementById("photoChallengeDescription").textContent = challenge.description || "";
    document.getElementById("photoInput").value = "";
    document.getElementById("photoPreview").removeAttribute("src");
    document.getElementById("photoPreviewWrap").hidden = true;
    document.getElementById("photoActions").hidden = false;
    document.getElementById("previewActions").hidden = true;
    FindItApp.showMessage("photoMessage", "", false);
    FindItApp.navigate("photoScreen", { activity:"photo" });
  }

  function back() {
    if (busy) return;
    selected = null; photoData = null;
    FindItApp.navigate("challengesScreen");
    FindItChallenges.load();
  }

  function choosePhoto() { if (!busy) document.getElementById("photoInput").click(); }

  function selectedFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { FindItApp.showMessage("photoMessage", "Please choose a photo.", true); return; }
    if (file.size > 12 * 1024 * 1024) { FindItApp.showMessage("photoMessage", "That photo is too large. Please use a smaller photo.", true); return; }
    compressPhoto(file).then(data => {
      photoData = data;
      document.getElementById("photoPreview").src = data;
      document.getElementById("photoPreviewWrap").hidden = false;
      document.getElementById("photoActions").hidden = true;
      document.getElementById("previewActions").hidden = false;
    }).catch(error => FindItApp.showMessage("photoMessage", error.message, true));
  }

  function compressPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The photo could not be read."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("The photo could not be opened."));
        img.onload = () => {
          const max = 1600;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", .82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function retake() {
    photoData = null;
    document.getElementById("photoInput").value = "";
    document.getElementById("photoPreviewWrap").hidden = true;
    document.getElementById("photoActions").hidden = false;
    document.getElementById("previewActions").hidden = true;
    choosePhoto();
  }

  async function submit() {
    if (!selected || !photoData || busy) return;
    busy = true; setBusy(true); FindItApp.showMessage("photoMessage", "Uploading photo...", false);
    try {
      const session = FindItApp.state.session;
      await FindItAPI.post("submitPhoto", { gameCode:session.gameCode, playerId:session.playerId, challengeId:selected.challengeId, photoData:photoData });
      selected = null; photoData = null;
      FindItApp.navigate("challengesScreen");
      await FindItChallenges.load();
    } catch (error) { FindItApp.showMessage("photoMessage", error.message, true); }
    finally { busy = false; setBusy(false); }
  }

  async function pass() {
    if (!selected || busy) return;
    if (!window.confirm("Pass this challenge? You won't submit a photo for it.")) return;
    busy = true; setBusy(true); FindItApp.showMessage("photoMessage", "Passing challenge...", false);
    try {
      const session = FindItApp.state.session;
      await FindItAPI.post("passChallenge", { gameCode:session.gameCode, playerId:session.playerId, challengeId:selected.challengeId });
      selected = null; photoData = null;
      FindItApp.navigate("challengesScreen");
      await FindItChallenges.load();
    } catch (error) { FindItApp.showMessage("photoMessage", error.message, true); }
    finally { busy = false; setBusy(false); }
  }

  function setBusy(value) {
    ["takePhotoButton","passChallengeButton","photoBackButton","usePhotoButton","retakeButton","cancelPreviewButton"].forEach(id => { const el=document.getElementById(id); if(el) el.disabled=value; });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("takePhotoButton").addEventListener("click", choosePhoto);
    document.getElementById("photoInput").addEventListener("change", selectedFile);
    document.getElementById("usePhotoButton").addEventListener("click", submit);
    document.getElementById("retakeButton").addEventListener("click", retake);
    document.getElementById("cancelPreviewButton").addEventListener("click", () => { photoData=null; document.getElementById("photoPreviewWrap").hidden=true; document.getElementById("photoActions").hidden=false; document.getElementById("previewActions").hidden=true; });
    document.getElementById("passChallengeButton").addEventListener("click", pass);
    document.getElementById("photoBackButton").addEventListener("click", back);
  });

  window.FindItPhotos = { open, back };
})();
