import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

let child;
let base;
let tmp;
let customerToken;
let secondCustomerToken;
let queueRecordId;

async function call(route, { method='GET', token, body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type':'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'smartflow-test-'));
  const port = 42000 + Math.floor(Math.random() * 10000);
  base = `http://127.0.0.1:${port}/api`;
  child = spawn(process.execPath, ['src/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), CLIENT_ORIGIN: 'http://localhost:5173', JWT_SECRET: 'test-only-secret-that-is-long-enough-123', DATABASE_FILE: path.join(tmp, 'smartflow-test.sqlite'), OTP_MODE: 'development' },
    stdio: ['ignore','pipe','pipe']
  });
  let ready = false;
  for (let i=0; i<80; i++) {
    try { const r = await fetch(`${base}/health`); if (r.ok) { ready = true; break; } } catch {}
    if (child.exitCode !== null) break;
    await delay(250);
  }
  assert.equal(ready, true, 'API should start for integration tests');
  const first = await call('/auth/customer/register', { method:'POST', body:{ name:'Test Customer', email:'test-one@example.test', password:'CustomerPass123' } });
  assert.equal(first.status, 201);
  customerToken = first.data.token;
  const second = await call('/auth/customer/register', { method:'POST', body:{ name:'Second Customer', email:'test-two@example.test', password:'CustomerPass123' } });
  assert.equal(second.status, 201);
  secondCustomerToken = second.data.token;
});

after(async () => {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  await delay(250);
  if (tmp) await rm(tmp, { recursive:true, force:true });
});

test('health endpoint responds', async () => {
  const result = await call('/health');
  assert.equal(result.status, 200);
  assert.equal(result.data.ok, true);
});

test('customers cannot open employee-only modules', async () => {
  const result = await call(`/records?module=${encodeURIComponent('SmartEco')}`, { token:customerToken });
  assert.equal(result.status, 403);
});

test('queue creates a token and blocks a second active entry', async () => {
  const created = await call('/records', { method:'POST', token:customerToken, body:{ module:'SmartQueue', title:'Test restaurant queue', description:'Party of two', location:'Demo food court', status:'Waiting', metadata:{ partySize:2 } } });
  assert.equal(created.status, 201);
  assert.match(created.data.record.metadata.token, /^Q-/);
  queueRecordId = created.data.record.id;
  const duplicate = await call('/records', { method:'POST', token:customerToken, body:{ module:'SmartQueue', title:'Duplicate queue', status:'Waiting', metadata:{ partySize:2 } } });
  assert.equal(duplicate.status, 409);
});

test('customers can cancel their own queue but cannot mark it served', async () => {
  const forbidden = await call(`/records/${queueRecordId}`, { method:'PATCH', token:customerToken, body:{ status:'Served' } });
  assert.equal(forbidden.status, 403);
  const cancelled = await call(`/records/${queueRecordId}`, { method:'PATCH', token:customerToken, body:{ status:'Cancelled' } });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.record.status, 'Cancelled');
});

test('customers cannot modify another customer’s private records', async () => {
  const created = await call('/records', { method:'POST', token:customerToken, body:{ module:'SmartPark', title:'Private parking note', status:'Saved', metadata:{ floor:'B1', spaceId:'B-TEST' } } });
  assert.equal(created.status, 201);
  const changed = await call(`/records/${created.data.record.id}`, { method:'PATCH', token:secondCustomerToken, body:{ title:'Attempted takeover' } });
  assert.equal(changed.status, 403);
});

test('expired offers are excluded from the active offers list', async () => {
  await call('/records', { method:'POST', token:customerToken, body:{ module:'SmartDeals', title:'Expired test offer', status:'Active', metadata:{ validUntil:'2020-01-01' } } });
  await call('/records', { method:'POST', token:customerToken, body:{ module:'SmartDeals', title:'Current test offer', status:'Active', metadata:{ validUntil:'2099-01-01' } } });
  const offers = await call(`/records?module=${encodeURIComponent('SmartDeals')}`, { token:customerToken });
  assert.equal(offers.status, 200);
  assert.equal(offers.data.records.some(r => r.title === 'Expired test offer'), false);
  assert.equal(offers.data.records.some(r => r.title === 'Current test offer'), true);
});
