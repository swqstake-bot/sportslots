
import crypto from 'crypto';

// Configuration
const CONFIG = {
  appName: 'Test1111',
  ownerId: 'l0zxMHXQlm',
  version: '1.0',
  url: 'https://keyauth.win/api/1.3/'
};

let sessionid = null;

// Helper to generate HWID (mimics browser/electron behavior)
function getHwid() {
  // Use a fixed HWID for consistent testing or generate one
  return crypto.createHash('sha256').update('node-debug-script-hwid').digest('hex');
}

async function doRequest(body) {
  // Filter undefined
  const cleanBody = {};
  for (const k in body) {
    if (body[k] !== undefined) cleanBody[k] = body[k];
  }

  const params = new URLSearchParams(cleanBody).toString();
  const fullUrl = `${CONFIG.url}?${params}`; // Note: KeyAuth uses POST body, but support asked for URL. I'll print both.
  
  console.log('\n--- REQUEST DEBUG START ---');
  console.log('Target URL:', CONFIG.url);
  console.log('Method:', 'POST');
  console.log('Content-Type:', 'application/x-www-form-urlencoded');
  console.log('Body Params (Object):', cleanBody);
  console.log('Body Payload (String):', params);
  console.log('--- REQUEST DEBUG END ---\n');

  const res = await fetch(CONFIG.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  const text = await res.text();
  console.log('Response Raw:', text);
  
  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
}

async function run() {
  console.log('Starting KeyAuth Debug Script v3...');
  console.log('Config:', CONFIG);

  // 1. Init
  console.log('\nStep 1: Init...');
  const initRes = await doRequest({
    type: 'init',
    name: CONFIG.appName,
    ownerid: CONFIG.ownerId,
    version: CONFIG.version
  });

  if (!initRes.success) {
    console.error('Init Failed:', initRes);
    return;
  }
  
  sessionid = initRes.sessionid;
  console.log('Init Success. Session ID:', sessionid);

  // 2. Login
  const username = 'test';
  const password = 'admin';
  const hwid = getHwid();
  
  console.log(`\nStep 2: Login (User: ${username}, Pass: ${password}, HWID: ${hwid})...`);
  
  const loginRes = await doRequest({
    type: 'login',
    name: CONFIG.appName,
    ownerid: CONFIG.ownerId,
    sessionid: sessionid,
    username: username,
    pass: password,
    hwid: hwid
  });

  if (loginRes.success) {
    console.log('Login Success!');
    console.log('Data:', loginRes);
  } else {
    console.error('Login Failed:', loginRes);
  }
}

run().catch(console.error);
