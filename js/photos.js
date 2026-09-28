/* Find It! V2 - isolated photo activity. It never controls game state. */
(function () {
  let selected = null;
  let photoData = null;
  let busy = false;
  let uploadTimer = null;
  let uploadStartedAt = 0;

  function validSession() {
    const session = FindItApp.state.session;
    return session && session.gameCode && session.playerId ? session : null;
  }

  function open(challenge) {
    stopUploadIndicator();
    selected = challenge;
    photoData = null;
    busy = false;
    document.getElementById("photoChallengeNumber").textContent = "Challenge " + challenge.challengeNumber;
    document.getElementById("photoChallengeName").textContent = challenge.name;
    document.getElementById("photoChallengeDescription").textContent = challenge.description || "";
    document.getElementById("photoInput").value = "";
    document.getElementById("photoPreview").removeAttribute("src");
    document.getElementById("photoPreviewWrap").hidden = true;
    document.getElementById("photoActions").hidden = false;
    document.getElementById("previewActions").hidden = true;
    setBusy(false);
    FindItApp.showMessage("photoMessage", "", false);
    FindItApp.navigate("photoScreen", { activity:"photo" });
  }

  function back() {
    if (busy) return;
    stopUploadIndicator();
    selected = null;
    photoData = null;
    FindItApp.navigate("challengesScreen");
    FindItChallenges.load();
  }

  function choosePhoto() {
    if (!busy) document.getElementById("photoInput").click();
  }

  function selectedFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) {
      FindItApp.showMessage("photoMessage", "Please choose a photo.", true);
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      FindItApp.showMessage("photoMessage", "That photo is too large. Please use a smaller photo.", true);
      return;
    }
    FindItApp.showMessage("photoMessage", "Preparing photo...", false);
    compressPhoto(file).then(data => {
      photoData = data;
      document.getElementById("photoPreview").src = data;
      document.getElementById("photoPreviewWrap").hidden = false;
      document.getElementById("photoActions").hidden = true;
      document.getElementById("previewActions").hidden = false;
      FindItApp.showMessage("photoMessage", "Photo ready to upload.", false);
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
          const max = 1000;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          const processed = canvas.toDataURL("image/jpeg", .70);
          console.log("[FindIt Photos] Processed before upload", {
            originalWidth: img.width,
            originalHeight: img.height,
            uploadWidth: canvas.width,
            uploadHeight: canvas.height,
            jpegQuality: 0.70,
            approximatePayloadKB: Math.round(processed.length * 0.75 / 1024)
          });
          resolve(processed);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function retake() {
    if (busy) return;
    photoData = null;
    document.getElementById("photoInput").value = "";
    document.getElementById("photoPreviewWrap").hidden = true;
    document.getElementById("photoActions").hidden = false;
    document.getElementById("previewActions").hidden = true;
    FindItApp.showMessage("photoMessage", "", false);
    choosePhoto();
  }

  function startUploadIndicator() {
    stopUploadIndicator();
    uploadStartedAt = Date.now();
    updateUploadIndicator();
    uploadTimer = setInterval(updateUploadIndicator, 1000);
  }

  function updateUploadIndicator() {
    const seconds = Math.max(0, Math.floor((Date.now() - uploadStartedAt) / 1000));
    const dots = ".".repeat((seconds % 3) + 1);
    FindItApp.showMessage("photoMessage", "Uploading photo" + dots + " " + seconds + "s", false);
  }

  function stopUploadIndicator() {
    if (uploadTimer) clearInterval(uploadTimer);
    uploadTimer = null;
    uploadStartedAt = 0;
  }

  async function submit() {
    if (!selected || !photoData || busy) return;
    const session = validSession();
    if (!session) {
      FindItApp.showMessage("photoMessage", "Your game session is not available. Keep this screen open and try again.", true);
      return;
    }

    busy = true;
    setBusy(true);
    startUploadIndicator();

    try {
      await FindItAPI.post("submitPhoto", {
        gameCode: session.gameCode,
        playerId: session.playerId,
        challengeId: selected.challengeId,
        photoData: photoData
      });

      stopUploadIndicator();
      selected = null;
      photoData = null;
      busy = false;
      setBusy(false);
      FindItApp.navigate("challengesScreen");
      await FindItChallenges.load();
    } catch (error) {
      stopUploadIndicator();
      console.warn("[FindIt Photos] Photo upload failed; keeping player, challenge and photo for manual retry.", error);
      busy = false;
      setBusy(false);
      FindItApp.showMessage("photoMessage", "Upload failed. Your photo is still here — tap Use Photo to retry.", true);
    }
  }

  async function pass() {
    if (!selected || busy) return;
    if (!window.confirm("Pass this challenge? You won't submit a photo for it.")) return;
    const session = validSession();
    if (!session) {
      FindItApp.showMessage("photoMessage", "Your game session is not available. Keep this screen open and try again.", true);
      return;
    }

    busy = true;
    setBusy(true);
    FindItApp.showMessage("photoMessage", "Passing challenge...", false);
    try {
      await FindItAPI.post("passChallenge", {
        gameCode: session.gameCode,
        playerId: session.playerId,
        challengeId: selected.challengeId
      });
      selected = null;
      photoData = null;
      busy = false;
      setBusy(false);
      FindItApp.navigate("challengesScreen");
      await FindItChallenges.load();
    } catch (error) {
      console.warn("[FindIt Photos] Pass failed; preserving current player and challenge.", error);
      busy = false;
      setBusy(false);
      FindItApp.showMessage("photoMessage", "Could not pass this challenge. Please try again.", true);
    }
  }

  function setBusy(value) {
    ["takePhotoButton","passChallengeButton","photoBackButton","usePhotoButton","retakeButton","cancelPreviewButton"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = value;
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("takePhotoButton").addEventListener("click", choosePhoto);
    document.getElementById("photoInput").addEventListener("change", selectedFile);
    document.getElementById("usePhotoButton").addEventListener("click", submit);
    document.getElementById("retakeButton").addEventListener("click", retake);
    document.getElementById("cancelPreviewButton").addEventListener("click", () => {
      if (busy) return;
      photoData = null;
      document.getElementById("photoPreviewWrap").hidden = true;
      document.getElementById("photoActions").hidden = false;
      document.getElementById("previewActions").hidden = true;
      FindItApp.showMessage("photoMessage", "", false);
    });
    document.getElementById("passChallengeButton").addEventListener("click", pass);
    document.getElementById("photoBackButton").addEventListener("click", back);
  });

  window.FindItPhotos = { open, back };
})();
