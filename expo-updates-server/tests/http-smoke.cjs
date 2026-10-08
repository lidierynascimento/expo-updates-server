const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = 'http://127.0.0.1:3100';
const origin = 'https://expo.vdigitalslab.com';
let cookie = '';
const slug = 'smoke-' + Date.now();
async function post(route, payload, useCookie = true, requestOrigin = origin) {
  return fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin, ...(useCookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(payload) });
}
(async () => {
  try {
    assert.match(await (await fetch(base)).text(), /Entrar no painel OTA/);
    assert.equal((await post('/api/admin/releases',{action:'project',name:'X',slug},false)).status,401);
    const login = await post('/api/admin/session',{username:'test-admin',password:'test-local-only'},false);
    assert.equal(login.status,200); cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/api/admin/releases',{action:'project',name:'X',slug},true,'https://evil.example.com')).status,403);
    assert.equal((await post('/api/admin/releases',{action:'project',name:'Smoke',slug})).status,200);
    const file = (name,data) => ({path:name,data:Buffer.from(data).toString('base64')});
    const payload = {action:'publish',project:slug,runtime:'1',files:[file('metadata.json',JSON.stringify({fileMetadata:{android:{bundle:'bundles/main.js',assets:[]}}})),file('expoConfig.json',JSON.stringify({runtimeVersion:'1',name:'Smoke'})),file('bundles/main.js','console.log("smoke");')]};
    const published = await post('/api/admin/releases',payload); assert.equal(published.status,200);
    const headers = {'expo-platform':'android','expo-runtime-version':'1','expo-protocol-version':'1'};
    let manifest = await fetch(base+'/api/manifest?project='+slug,{headers}); assert.equal(manifest.status,200);
    const body = await manifest.text(); assert.match(body,/multipart|launchAsset/);
    const match = body.match(/"launchAsset":(\{[^}]+\})/); assert.ok(match);
    const url = JSON.parse(match[1]).url.replace(origin,base);
    assert.equal(await (await fetch(url)).text(),'console.log("smoke");');
    assert.equal((await post('/api/admin/releases',{action:'rollback',project:slug,runtime:'1',confirm:true})).status,200);
    manifest = await fetch(base+'/api/manifest?project='+slug,{headers:{...headers,'expo-embedded-update-id':'test-id'}}); assert.match(await manifest.text(),/rollBackToEmbedded/);
    assert.equal(await (await fetch(url)).text(),'console.log("smoke");');
    assert.equal((await fetch(base+'/api/manifest?project=../escape',{headers})).status,400);
    assert.equal((await post('/api/admin/session',{action:'logout'})).status,200);
    console.log('PASS: login, authentication, origin protection, project creation, publishing, manifest, assets, rollback and old asset downloads');
  } finally { await fs.rm(path.join('updates','projects',slug),{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1});
