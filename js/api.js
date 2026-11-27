/* Find It! V2 - Supabase Edge Function HTTP client */
(function () {
  function apiUrl() { return String(window.FINDIT_CONFIG.apiUrl || "").trim(); }
  function headers(useSession) { const key=window.FINDIT_CONFIG.publishableKey,headers={apikey:key,Authorization:"Bearer "+key},session=window.FindItApp&&window.FindItApp.state&&window.FindItApp.state.session;if(useSession&&session&&session.rejoinToken)headers["x-findit-rejoin-token"]=session.rejoinToken;return headers; }
  async function request(url, method, body, useSession) {
    const options={method,headers:headers(useSession),cache:"no-store"};
    if(body!==undefined){options.headers["Content-Type"]="text/plain;charset=utf-8";options.body=JSON.stringify(body);}
    const response=await fetch(url,options),text=await response.text();let payload;
    try{payload=JSON.parse(text);}catch(_){throw new Error("Find It API returned HTTP "+response.status+" without a valid response.");}
    if(!payload||payload.ok!==true){const error=payload&&payload.error||{},e=new Error(error.message||"Find It API request failed.");e.code=error.code||"API_ERROR";throw e;}
    return payload.data;
  }
  window.FindItAPI={
    async get(action,params){const url=new URL(apiUrl());url.searchParams.set("action",action);Object.entries(params||{}).forEach(([k,v])=>{if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));});return request(url.toString(),"GET",undefined,!!(params&&params.playerId));},
    async post(action,data){const url=new URL(apiUrl());url.searchParams.set("action",action);return request(url.toString(),"POST",Object.assign({action},data||{}),!!(data&&data.playerId));}
  };
})();
