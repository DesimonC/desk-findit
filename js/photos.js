/* Find It! V2 - protected photo activity. Camera/upload never controls or clears the game session. */
(function () {
  let selected = null;
  let photoData = null;
  let busy = false;
  let chooserOpen = false;
  let uploadInProgress = false;
  let uploadTimer = null;
  let uploadStartedAt = 0;
  let uploadProgress = 0;

  function log(stage, extra) {
    console.log("[FindIt Photos] " + stage, Object.assign({
      screen: FindItApp.state.screen,
      gameCode: FindItApp.state.session && FindItApp.state.session.gameCode,
      playerId: FindItApp.state.session && FindItApp.state.session.playerId,
      challengeId: selected && selected.challengeId
    }, extra || {}));
  }
  function validSession() { const s=FindItApp.state.session; return s&&s.gameCode&&s.playerId?s:null; }
  function setBusy(value) { busy=!!value; ["takePhotoButton","choosePhotoButton","passChallengeButton","photoBackButton","usePhotoButton","retakeButton","cancelPreviewButton"].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=busy;}); }
  function pauseGamePolling(){FindItApp.stopPolling();log("GAME POLLING PAUSED");}
  function resumeGamePolling(){FindItApp.ensurePolling();log("GAME POLLING RESUMED");}
  function resetInputs(){const a=document.getElementById("cameraInput"),b=document.getElementById("photoInput");if(a)a.value="";if(b)b.value="";}
  function setUploadProgress(percent,text){const wrap=document.getElementById("uploadProgressWrap"),bar=document.getElementById("uploadProgressBar"),label=document.getElementById("uploadProgressText");if(!wrap||!bar||!label)return;wrap.hidden=false;bar.style.width=Math.max(0,Math.min(100,percent))+"%";label.textContent=text||Math.round(percent)+"% uploaded";}
  function hideUploadProgress(){const wrap=document.getElementById("uploadProgressWrap"),bar=document.getElementById("uploadProgressBar");if(wrap)wrap.hidden=true;if(bar)bar.style.width="0%";}

  function open(challenge){stopUploadIndicator();selected=challenge;photoData=null;chooserOpen=false;uploadInProgress=false;hideUploadProgress();pauseGamePolling();log("OPEN PHOTO");document.getElementById("photoChallengeNumber").textContent="Challenge "+challenge.challengeNumber;document.getElementById("photoChallengeName").textContent=challenge.name;document.getElementById("photoChallengeDescription").textContent=challenge.description||"";resetInputs();document.getElementById("photoPreview").removeAttribute("src");document.getElementById("photoPreviewWrap").hidden=true;document.getElementById("photoActions").hidden=false;document.getElementById("previewActions").hidden=true;setBusy(false);FindItApp.showMessage("photoMessage","",false);FindItApp.navigate("photoScreen",{activity:"photo"});}

  function returnToGame(){
    if(busy||uploadInProgress)return;
    log("RETURN TO GAME");stopUploadIndicator();hideUploadProgress();chooserOpen=false;selected=null;photoData=null;
    FindItApp.navigate("challengesScreen");
    resumeGamePolling();
    Promise.resolve().then(()=>FindItChallenges.load()).catch(error=>console.warn("[FindIt Photos] Background challenge refresh failed; local progress preserved.",error));
  }
  function back(){returnToGame();}

  function openPicker(inputId,modeLabel){if(busy||chooserOpen||uploadInProgress)return;if(!validSession()){FindItApp.showMessage("photoMessage","Your game session is not available to the photo screen. Keep this page open.",true);return;}const input=document.getElementById(inputId);if(!input){FindItApp.showMessage("photoMessage","Photo control is not available on this device.",true);return;}chooserOpen=true;pauseGamePolling();log(modeLabel+" OPEN");input.value="";input.click();window.setTimeout(()=>{chooserOpen=false;},1500);}
  function takePhoto(){openPicker("cameraInput","CAMERA");}
  function choosePhoto(){openPicker("photoInput","PHOTO LIBRARY");}

  function selectedFile(event){chooserOpen=false;const file=event.target.files&&event.target.files[0];if(!file||busy||uploadInProgress){log("PHOTO PICKER CLOSED WITHOUT PHOTO");return;}if(!file.type.startsWith("image/")){FindItApp.showMessage("photoMessage","Please choose a photo.",true);return;}if(file.size>12*1024*1024){FindItApp.showMessage("photoMessage","That photo is too large. Please use a smaller photo.",true);return;}FindItApp.showMessage("photoMessage","Compressing photo for faster upload...",false);compressPhoto(file).then(result=>{photoData=result.data;document.getElementById("photoPreview").src=result.data;document.getElementById("photoPreviewWrap").hidden=false;document.getElementById("photoActions").hidden=true;document.getElementById("previewActions").hidden=false;FindItApp.showMessage("photoMessage","Photo ready — "+result.approxKB+" KB after compression.",false);log("PHOTO PROCESSED",result.meta);}).catch(error=>{console.warn("[FindIt Photos] Photo processing failed.",error);FindItApp.showMessage("photoMessage",error.message,true);});}

  function compressPhoto(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("The photo could not be read."));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error("The photo could not be opened."));img.onload=()=>{const maxEdge=800,scale=Math.min(1,maxEdge/Math.max(img.width,img.height));let width=Math.max(1,Math.round(img.width*scale)),height=Math.max(1,Math.round(img.height*scale));const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const ctx=canvas.getContext("2d");if(!ctx)return reject(new Error("This device could not prepare the photo."));ctx.drawImage(img,0,0,width,height);let quality=.60,processed=canvas.toDataURL("image/jpeg",quality),approxKB=Math.round(processed.length*.75/1024);if(approxKB>300){quality=.50;processed=canvas.toDataURL("image/jpeg",quality);approxKB=Math.round(processed.length*.75/1024);}if(approxKB>300&&Math.max(width,height)>640){const secondScale=640/Math.max(width,height);width=Math.max(1,Math.round(width*secondScale));height=Math.max(1,Math.round(height*secondScale));canvas.width=width;canvas.height=height;const ctx2=canvas.getContext("2d");if(!ctx2)return reject(new Error("This device could not finish preparing the photo."));ctx2.drawImage(img,0,0,width,height);processed=canvas.toDataURL("image/jpeg",.50);approxKB=Math.round(processed.length*.75/1024);}resolve({data:processed,approxKB,meta:{originalWidth:img.width,originalHeight:img.height,uploadWidth:width,uploadHeight:height,jpegQuality:quality,approximatePayloadKB:approxKB,originalFileKB:Math.round(file.size/1024)}});};img.src=reader.result;};reader.readAsDataURL(file);});}

  function retake(){if(busy||uploadInProgress)return;log("RETAKE");pauseGamePolling();FindItApp.showMessage("photoMessage","Take a replacement photo. Your current photo is kept until a new one is selected.",false);takePhoto();}
  function startUploadIndicator(){stopUploadIndicator();uploadStartedAt=Date.now();uploadProgress=8;setUploadProgress(uploadProgress,"Starting upload…");uploadTimer=setInterval(()=>{const seconds=Math.max(1,Math.floor((Date.now()-uploadStartedAt)/1000));if(uploadProgress<88)uploadProgress+=uploadProgress<55?9:4;setUploadProgress(uploadProgress,"Uploading photo… "+seconds+"s");},900);}
  function stopUploadIndicator(){if(uploadTimer)clearInterval(uploadTimer);uploadTimer=null;uploadStartedAt=0;}

  async function confirmServerStoredPhoto(session,challengeId){try{log("VERIFYING UPLOAD ON SERVER");const data=await FindItAPI.get("getChallenges",{gameCode:session.gameCode,playerId:session.playerId,_t:Date.now()});const list=Array.isArray(data&&data.challenges)?data.challenges:[],match=list.find(item=>String(item.challengeId)===String(challengeId)),stored=!!match&&String(match.status)==="SUBMITTED";log("UPLOAD VERIFY RESULT",{stored,status:match&&match.status});return stored;}catch(verifyError){console.warn("[FindIt Photos] Could not verify whether the failed upload was stored.",verifyError);log("UPLOAD VERIFY FAILED",{error:verifyError&&verifyError.message});return false;}}

  async function finishSuccessfulUpload(message,challengeId){
    log("UPLOAD CONFIRMED");
    stopUploadIndicator();setUploadProgress(100,"Upload complete ✓");FindItApp.showMessage("photoMessage",message||"Photo uploaded successfully.",false);
    if(window.FindItChallenges&&typeof FindItChallenges.markComplete==="function")FindItChallenges.markComplete(challengeId,"SUBMITTED");
    await new Promise(resolve=>setTimeout(resolve,120));
    uploadInProgress=false;setBusy(false);returnToGame();
  }

  async function submit(){if(!selected||!photoData||busy||uploadInProgress){if(uploadInProgress)log("DUPLICATE SUBMIT BLOCKED");return;}const session=validSession();if(!session){FindItApp.showMessage("photoMessage","Your game session is not available. Keep this screen open; the photo has not been discarded.",true);return;}uploadInProgress=true;pauseGamePolling();setBusy(true);startUploadIndicator();const payloadKB=Math.round(photoData.length*.75/1024),challengeId=String(selected.challengeId||"");log("UPLOAD START",{approximatePayloadKB:payloadKB});try{await FindItAPI.post("submitPhoto",{gameCode:session.gameCode,playerId:session.playerId,challengeId,photoData});log("UPLOAD SUCCESS");await finishSuccessfulUpload("Photo uploaded successfully.",challengeId);}catch(error){stopUploadIndicator();log("UPLOAD RESPONSE FAILED",{code:error&&error.code,error:error&&error.message});FindItApp.showMessage("photoMessage","Checking whether your photo reached the game…",false);setUploadProgress(92,"Checking upload…");const alreadyStored=error&&error.code==="CHALLENGE_ALREADY_COMPLETE"?true:await confirmServerStoredPhoto(session,challengeId);if(alreadyStored){log("UPLOAD RECOVERED AFTER RESPONSE FAILURE");await finishSuccessfulUpload("Photo received ✓",challengeId);return;}uploadInProgress=false;setBusy(false);setUploadProgress(0,"Upload failed");pauseGamePolling();log("UPLOAD FAIL",{code:error&&error.code,error:error&&error.message});FindItApp.showMessage("photoMessage","Upload could not be confirmed. Your photo and game are still here — tap Use Photo to retry.",true);}}

  async function pass(){if(!selected||busy||uploadInProgress)return;if(!window.confirm("Pass this challenge? You won't submit a photo for it."))return;const session=validSession();if(!session){FindItApp.showMessage("photoMessage","Your game session is not available. Keep this screen open and try again.",true);return;}const challengeId=String(selected.challengeId||"");pauseGamePolling();setBusy(true);FindItApp.showMessage("photoMessage","Passing challenge...",false);log("PASS START");try{await FindItAPI.post("passChallenge",{gameCode:session.gameCode,playerId:session.playerId,challengeId});log("PASS SUCCESS");if(window.FindItChallenges&&typeof FindItChallenges.markComplete==="function")FindItChallenges.markComplete(challengeId,"PASSED");setBusy(false);returnToGame();}catch(error){log("PASS FAIL",{error:error&&error.message});setBusy(false);pauseGamePolling();FindItApp.showMessage("photoMessage","Could not pass this challenge. Your game is still active — please try again.",true);}}

  function cancelPreview(){if(busy||uploadInProgress)return;photoData=null;document.getElementById("photoPreview").removeAttribute("src");document.getElementById("photoPreviewWrap").hidden=true;document.getElementById("photoActions").hidden=false;document.getElementById("previewActions").hidden=true;hideUploadProgress();FindItApp.showMessage("photoMessage","",false);log("PREVIEW CANCELLED");}
  document.addEventListener("DOMContentLoaded",()=>{document.getElementById("takePhotoButton").addEventListener("click",takePhoto);document.getElementById("choosePhotoButton").addEventListener("click",choosePhoto);document.getElementById("cameraInput").addEventListener("change",selectedFile);document.getElementById("photoInput").addEventListener("change",selectedFile);document.getElementById("usePhotoButton").addEventListener("click",submit);document.getElementById("retakeButton").addEventListener("click",retake);document.getElementById("cancelPreviewButton").addEventListener("click",cancelPreview);document.getElementById("passChallengeButton").addEventListener("click",pass);document.getElementById("photoBackButton").addEventListener("click",back);});
  window.FindItPhotos={open,back};
})();