import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {handler} from '../supabase/functions/findit-api/index.mjs';
import {MemoryBackend} from './memory-backend.mjs';

test('two phone browsers: loading, lobby, waiting room, photos, tie-break, cleanup and replay', {timeout:90000}, async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),store=new MemoryBackend();
 const serve=handler({get:()=> 'test'},()=>store);
 const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=path==='/'?'index.html':path.slice(1);if(file.includes('..'))throw Error();const bytes=await readFile(root+file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(bytes);}catch{res.statusCode=404;res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;try{browser=await chromium.launch({headless:true,...(process.env.FINDIT_CHROMIUM_PATH?{executablePath:process.env.FINDIT_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--single-process']}: {})});}catch(error){server.close();throw error;}
 const contexts=[],errors=[];
 try{
  async function phone(){const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.route('https://rqbwdxsxxqnyqigikrht.supabase.co/functions/v1/findit-api',async route=>{const request=route.request();const response=await serve(new Request(request.url(),{method:request.method(),headers:request.headers(),body:request.method()==='POST'?request.postData():undefined}));await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});});
   await page.route('https://photos.example/**',route=>route.fulfill({path:root+'file_00000000cad881f492198522f5cb5b90.png',contentType:'image/png'}));
   await page.goto('http://127.0.0.1:'+server.address().port+'/?backend=supabase');return page;}
  const host=await phone();await host.waitForTimeout(500);assert.equal(await host.locator('#appContent').isVisible(),false);
  await host.locator('#appContent').waitFor({state:'visible'});assert.equal(await host.locator('.app-brand img').isVisible(),true);
  const guest=await phone();await guest.locator('#appContent').waitFor({state:'visible'});
  await host.locator('#hostButton').click();await host.locator('#hostNameInput').fill('Host');await host.locator('#createGameButton').click();await host.locator('#lobbyScreen').waitFor({state:'visible'});
  const code=await host.locator('#lobbyGameCode').textContent();assert.equal(code.length,6);
  await guest.locator('#joinGameCodeInput').fill(code);await guest.locator('#joinNameInput').fill('Guest');await guest.locator('#joinButton').click();await guest.locator('#lobbyScreen').waitFor({state:'visible'});
  await host.waitForFunction(()=>document.getElementById('lobbyPlayers').children.length===2);
  await host.locator('#startGameButton').click();
  async function photo(page){await page.locator('#challengesScreen').waitFor({state:'visible'});await page.locator('.challenge-card').first().click();await page.locator('#photoInput').setInputFiles(root+'file_00000000cad881f492198522f5cb5b90.png');await page.locator('#previewActions').waitFor({state:'visible'});await page.locator('#usePhotoButton').click();}
  await photo(host);await host.locator('#waitingScreen').waitFor({state:'visible'});assert.match(await host.locator('#waitingScreen').textContent(),/Waiting for everyone/);
  await photo(guest);await host.locator('#votingIntroScreen').waitFor({state:'visible'});await guest.locator('#votingIntroScreen').waitFor({state:'visible'});
  const g=store.rows.get(code).data,hEntry=g.entries.find(e=>e.playerId===g.players[0].playerId).entryId,aEntry=g.entries.find(e=>e.playerId===g.players[1].playerId).entryId;
  await host.locator('[data-entry="'+hEntry+'"]').click();await guest.locator('[data-entry="'+aEntry+'"]').click();
  await host.waitForFunction(()=>document.getElementById('votingChallengeName').textContent==='Final tie-break vote');
  await guest.waitForFunction(()=>document.getElementById('votingChallengeName').textContent==='Final tie-break vote');
  await host.locator('[data-entry="'+hEntry+'"]').click();await guest.locator('[data-entry="'+aEntry+'"]').click();
  await host.locator('#resultsScreen').waitFor({state:'visible'});await guest.locator('#resultsScreen').waitFor({state:'visible'});
  await host.waitForFunction(()=>document.getElementById('finalResults').textContent.includes('Host'));
  assert.equal(store.rows.get(code).data.winnerId,hEntry);
  await host.screenshot({path:'/tmp/findit-results-mobile.png',fullPage:true});
  assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await host.locator('#endGameButton').click();await host.locator('#brandLoading').waitFor({state:'visible'});assert.equal(store.rows.size,0);assert.equal(store.files.size,0);
  await guest.locator('#brandLoading').waitFor({state:'visible'});
  await host.locator('#appContent').waitFor({state:'visible'});await guest.locator('#appContent').waitFor({state:'visible'});
  assert.equal(await host.locator('#votingArea').textContent(),'');assert.equal(await host.locator('#joinNameInput').inputValue(),'');
  // A second game must not inherit the cached results or disabled End Game button.
  await host.locator('#hostButton').click();await host.locator('#hostNameInput').fill('Replay');await host.locator('#createGameButton').click();await host.locator('#lobbyScreen').waitFor({state:'visible'});await host.locator('#startGameButton').click();await host.locator('.challenge-card').first().click();await host.locator('#passChallengeButton').click();await host.locator('#resultsScreen').waitFor({state:'visible'});await host.waitForFunction(()=>document.getElementById('finalResults').textContent.includes('No Winner'));assert.equal(await host.locator('#endGameButton').isEnabled(),true);
  await host.locator('#endGameButton').click();await host.locator('#brandLoading').waitFor({state:'visible'});assert.equal(store.rows.size,0);
  // The default deployment still loads the legacy backend while Supabase is staged.
  const legacy=await contexts[0].newPage();await legacy.route('https://script.google.com/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,data:{hasWinner:false}})}));await legacy.goto('http://127.0.0.1:'+server.address().port+'/');await legacy.locator('#appContent').waitFor({state:'visible'});assert.equal(await legacy.evaluate(()=>FindItAPI.isSupabase),false);assert.equal(await legacy.locator('#joinGameCodeInput').getAttribute('maxlength'),'4');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
