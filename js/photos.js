/* Find It! V2 - protected photo activity. Camera/upload never controls or clears the game session. */
(function () {
  let selected = null;
  let photoData = null;
  let busy = false;
  let chooserOpen = false;
  let uploadTimer = null;
  let uploadStartedAt = 0;

  function log(stage, extra) {
    console.log("[FindIt Photos] " + stage, Object.assign({
      screen: FindItApp.state.screen,
      gameCode: FindItApp.state.session && FindItApp.state.session.gameCode,
      playerId: FindItApp.state.session && FindItApp.state.session.playerId,
      challengeId: selected && selected.challengeId
    }, extra || {}));
  }

  function validSession() {
    const session = FindItApp.state.session;
    return session && session.gameCode && session.playerId ? session : null;
  }

  function setBusy(value) {
    busy = !!value;
    ["takePhotoButton","choosePhotoButton","passChallengeButton","photoBackButton","usePhotoButton","retakeButton","cancelPreviewButton"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = busy;
    });
  }

  function pauseGamePolling() {
    FindItApp.stopPolling();
    log("GAME POLLING PAUSED");
  }

  function resumeGamePolling() {
    FindItApp.ensurePolling();
    log("GAME POLLING RESUMED");
  }

  function resetInputs() {
    const cameraInput = document.getElementById("cameraInput");
    const photoInput = document.getElementById("photoInput");
    if (cameraInput) cameraInput.value = "";
    if (photoInput) photoInput.value = "";
  }

  function open(challenge) {
    stopUploadIndicator();
    selected = challenge;
    photoData = null;
    chooserOpen = false;
    pauseGamePolling();
    log("OPEN PHOTO");
    document.getElementById("photoChallengeNumber").textContent = "Challenge " + challenge.challengeNumber;
    document.getElementById("photoChallengeName").textContent = challenge.name;
    document.getElementById("photoChallengeDescription").textContent = challenge.description || "";
    resetInputs();
    document.getElementById("photoPreview").removeAttribute("src");
    document.getElementById("photoPreviewWrap").hidden = true;
    document.getElementById("photoActions").hidden = false;
    document.getElementById("previewActions").hidden = true;
    setBusy(false);
    FindItApp.showMessage("photoMessage", "", false);
    FindItApp.navigate("photoScreen", { activity:"photo" });
  }

  async function returnToGame() {
    if (busy) return;
    log("RETURN TO GAME");
    stopUploadIndicator();
    chooserOpen = false;
    selected = null;
    photoData = null;
    FindItApp.navigate("challengesScreen");
    try {
      await FindItChallenges.load();
    } catch (error) {
      console.warn("[FindIt Photos] Challenge refresh failed after returning; preserving game screen.", error);
    }
    resumeGamePolling();
  }

  function back() {
    returnToGame();
  }

  function openPicker(inputId, modeLabel) {
    if (busy || chooserOpen) return;
    if (!validSession()) {
      FindItApp.showMessage("photoMessage", "Your game session is not available to the photo screen. Keep this page open.", true);
      return;
    }
    const input = document.getElementById(inputId);
    if (!input) {
      FindItApp.showMessage("photoMessage", "Photo control is not available on this device.", true);
      return;
    }
    chooserOpen = true;
    pauseGamePolling();
    log(modeLabel + " OPEN");
    input.value = "";
    input.click();
    window.setTimeout(() => { chooserOpen = false; }, 1500);
  }

  function takePhoto() {
    openPicker("cameraInput", "CAMERA");
  }

  function choosePhoto() {
    openPicker("photoInput", "PHOTO LIBRARY");
  }

  function selectedFile(event) {
    chooserOpen = false;
    const file = event.target.files && event.target.files[0];
    if (!file || busy) {
      log("PHOTO PICKER CLOSED WITHOUT PHOTO");
      return;
    }
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
      log("PHOTO PROCESSED", { approximatePayloadKB: Math.round(data.length * 0.75 / 1024) });
    }).catch(error => {
      console.warn("[FindIt Photos] Photo processing failed.", error);
      FindItApp.showMessage("photoMessage", error.message, true);
    });
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
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("This device could not prepare the photo."));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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
    log("RETAKE");
    pauseGamePolling();
    FindItApp.showMessage("photoMessage", "Take a replacement photo. Your current photo is kept until a new one is selected.", false);
    takePhoto();
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
      FindItApp.showMessage("photoMessage", "Your game session is not available. Keep this screen open; the photo has not been discarded.", true);
      return;
    }

    pauseGamePolling();
    setBusy(true);
    startUploadIndicator();
    log("UPLOAD START", { approximatePayloadKB: Math.round(photoData.length * 0.75 / 1024) });

    try {
      await FindItAPI.post("submitPhoto", {
        gameCode: session.gameCode,
        playerId: session.playerId,
        challengeId: selected.challengeId,
        photoData: photoData
      });

      log("UPLOAD SUCCESS");
      stopUploadIndicator();
      setBusy(false);
      await returnToGame();
    } catch (error) {
      stopUploadIndicator();
      log("UPLOAD FAIL", { error: error && error.message });
      console.warn("[FindIt Photos] Photo upload failed; preserving session, challenge and processed photo.", error);
      setBusy(false);
      pauseGamePolling();
      FindItApp.showMessage("photoMessage", "Upload failed. Your photo and game are still here — tap Use Photo to retry.", true);
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

    pauseGamePolling();
    setBusy(true);
    FindItApp.showMessage("photoMessage", "Passing challenge...", false);
    log("PASS START");
    try {
      await FindItAPI.post("passChallenge", {
        gameCode: session.gameCode,
        playerId: session.playerId,
        challengeId: selected.challengeId
      });
      log("PASS SUCCESS");
      setBusy(false);
      await returnToGame();
    } catch (error) {
      log("PASS FAIL", { error: error && error.message });
      setBusy(false);
      pauseGamePolling();
      FindItApp.showMessage("photoMessage", "Could not pass this challenge. Your game is still active — please try again.", true);
    }
  }

  function cancelPreview() {
    if (busy) return;
    photoData = null;
    document.getElementById("photoPreview").removeAttribute("src");
    document.getElementById("photoPreviewWrap").hidden = true;
    document.getElementById("photoActions").hidden = false;
    document.getElementById("previewActions").hidden = true;
    FindItApp.showMessage("photoMessage", "", false);
    log("PREVIEW CANCELLED");
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("takePhotoButton").addEventListener("click", takePhoto);
    document.getElementById("choosePhotoButton").addEventListener("click", choosePhoto);
    document.getElementById("cameraInput").addEventListener("change", selectedFile);
    document.getElementById("photoInput").addEventListener("change", selectedFile);
    document.getElementById("usePhotoButton").addEventListener("click", submit);
    document.getElementById("retakeButton").addEventListener("click", retake);
    document.getElementById("cancelPreviewButton").addEventListener("click", cancelPreview);
    document.getElementById("passChallengeButton").addEventListener("click", pass);
    document.getElementById("photoBackButton").addEventListener("click", back);
  });

  window.FindItPhotos = { open, back };
})();
