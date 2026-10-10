// Integration smoke test for isolated Railway staging. Uses disposable account, removes it in finally.
// Usage: node scripts/staging-smoke.mjs
import { randomBytes } from 'node:crypto';

const origin = process.env.SMOKE_WEB_URL || 'https://frontend-staging-2146.up.railway.app';
const api = process.env.SMOKE_API_URL || 'https://api-staging-706c3.up.railway.app';
const runId = Date.now().toString(36) + '-' + randomBytes(4).toString('hex');
const email = 'steward-smoke-' + runId + '@example.invalid';
const password = 'Smoke!' + randomBytes(20).toString('hex');
let token;
let successful = 0;
const expected = (condition, message) => { if (!condition) throw Error(message); };
async function check(name, fn) {
  await fn();
  console.log('PASS', name);
  successful += 1;
}
async function request(path, method = 'GET', body, auth = token, headers = {}) {
  const response = await fetch(api + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
      ...(auth ? {Authorization: 'Bearer ' + auth} : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, headers: response.headers, data };
}
let state;
try {
  await check('API health', async () => {
    const r=await request('/healthz');
    expected(r.status === 200 && r.data.status === 'ok', 'API health failed: '+r.status);
  });
  await check('Web page and build-time API URL', async () => {
    const r=await fetch(origin, { signal: AbortSignal.timeout(12000) });
    expected(r.ok, 'Frontend HTTP '+r.status);
    const html=await r.text();
    expected(html.includes('rel="manifest"'), 'Manifest link missing');
    const scripts=[...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map(m=>m[1]);
    expected(scripts.length > 0, 'Built JS missing');
    const code=await Promise.all(scripts.map(async (url)=>(await (await fetch(origin+url)).text())));
    expected(code.some(s=>s.includes(api)), 'VITE_API_URL missing from built JS; web may hit wrong server');
  });
  await check('PWA resources', async () => {
    for(const path of ['/manifest.webmanifest','/sw.js','/offline.html','/icons/icon-192.png','/icons/icon-512.png','/apple-touch-icon.png']){
      const r=await fetch(origin+path);
      expected(r.ok, 'Missing PWA resource: '+path+' HTTP '+r.status);
    }
    const m=await(await fetch(origin+'/manifest.webmanifest')).json();
    expected(m.display==='standalone' && m.icons.length>=2, 'PWA manifest invalid');
  });
  await check('CORS preflight', async () => {
    const r=await fetch(api+'/api/v1/auth/register',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},signal:AbortSignal.timeout(12000)});
    expected(r.status===204 && r.headers.get('access-control-allow-origin')===origin,'Preflight failed '+r.status);
    const denied=await fetch(api+'/healthz',{headers:{Origin:'https://invalid.example'},signal:AbortSignal.timeout(12000)});
    expected(denied.status===403,'Foreign origin should be denied');
  });
  await check('Unauthorized finance rejected', async () => {
    const r=await request('/api/v1/state');
    expected(r.status===401, 'Unauthorized state should be 401');
  });
  await check('Create disposable test account', async () => {
    const r=await request('/api/v1/auth/register','POST',{email,password},'');
    expected(r.status===201 && typeof r.data.token==='string','Signup failed HTTP '+r.status+' '+JSON.stringify(r.data));
    token=r.data.token;
  });
  await check('Fetch authenticated account and empty finance state', async () => {
    const me=await request('/api/v1/me');
    expected(me.status===200 && me.data.user.email===email,'Account response invalid');
    const r=await request('/api/v1/state');
    expected(r.status===200 && r.data.data?.version===1 && Number.isSafeInteger(r.data.revision),'Financial state fetch failed');
    state=r.data;
  });
  await check('Authenticated MCP tools and finance outputs', async () => {
    const call=async(method,params={})=>request('/mcp','POST',{jsonrpc:'2.0',id:1,method,params});
    const toolList=await call('tools/list');
    const names=toolList.data.result?.tools?.map(t=>t.name);
    expected(toolList.status===200 && Array.isArray(names),'MCP tool listing invalid');
    for (const name of ['get_financial_summary','list_upcoming_payments','suggest_spending_budget','analyze_spending_behavior']) {
      expected(names.includes(name),'Missing MCP tool '+name);
      const result=await call('tools/call',{name,arguments:{}});
      expected(result.status===200 && result.data.result?.content?.[0]?.type==='text','MCP tool call failed '+name);
      const output=JSON.parse(result.data.result.content[0].text);
      expected(output.currency==='VND','MCP response missing VND');
    }
  });
  await check('Persist and reload finance transaction', async () => {
    const item={id:crypto.randomUUID(),type:'expense',amount:12500,category:'Khác',date:'2026-10-10',note:'Disposable staging smoke test',need:'flexible',trigger:'impulse'};
    const updated={...state.data,transactions:[...state.data.transactions,item]};
    const save=await request('/api/v1/state','PUT',{data:updated,revision:state.revision});
    expected(save.status===200 && save.data.revision===state.revision+1,'State save failed');
    const reload=await request('/api/v1/state');
    expected(reload.status===200 && reload.data.data.transactions.some(t=>t.id===item.id && t.need==='flexible' && t.trigger==='impulse'),'Behavior metadata not persisted');
  });
  await check('MCP spending coach aggregates behavior without notes', async () => {
    const r=await request('/mcp','POST',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'analyze_spending_behavior',arguments:{}}});
    expected(r.status===200 && r.data.result?.content?.[0]?.text,'MCP spending data missing');
    const output=JSON.parse(r.data.result.content[0].text);
    expected(output.impulsiveOrEmotionDrivenSpent>=12500,'MCP failed to aggregate impulse spending');
    expected(!JSON.stringify(output).includes('Disposable staging smoke test'),'MCP leaked raw note');
  });
  await check('Stale revision update blocked', async () => {
    const r=await request('/api/v1/state','PUT',{data:state.data,revision:state.revision});
    expected(r.status===409,'Expected revision conflict 409, got '+r.status);
  });
  await check('Sign out and sign back in', async () => {
    const revoked=token;
    const out=await request('/api/v1/auth/logout','POST');
    expected(out.status===200,'Logout failed');
    token=null;
    const old=await request('/api/v1/state','GET',undefined,revoked);
    expected(old.status===401,'Revoked token still works');
    const login=await request('/api/v1/auth/login','POST',{email,password},'');
    expected(login.status===200 && typeof login.data.token==='string','Relogin failed');
    token=login.data.token;
  });
} finally {
  if(token){
    try {
      const cleanup=await request('/api/v1/account','DELETE',{password});
      if(cleanup.status!==200) console.warn('WARNING cleanup failed with HTTP',cleanup.status);
      else console.log('CLEANUP disposed smoke account');
    } catch(error) { console.warn('WARNING cleanup interrupted:',error.message); }
  }
}
console.log('SUCCESS:',successful,'staging smoke checks passed');
