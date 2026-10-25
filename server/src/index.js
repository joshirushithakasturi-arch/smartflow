import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { db } from './db.js';
import { hashPassword, verifyPassword, signToken, requireAuth, allowTypes } from './auth.js';
import { sendEmployeeOtp, verifyEmployeeOtp } from './otp.js';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Local development should not lock out repeated login testing. Production remains limited.
  limit: process.env.NODE_ENV === 'production' ? 30 : 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' }
});
const safeUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, account_type: u.account_type, role: u.role });
const audit = (actor, action, type, id, details={}) => db.prepare('INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)').run(actor || null, action, type, id || null, JSON.stringify(details));
const getUser = id => db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(id);

app.get('/api/health', (_req,res) => res.json({ ok:true, app:'SmartFlow API', timestamp:new Date().toISOString() }));

app.post('/api/auth/customer/register', authLimiter, async (req,res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') || !/^(?=.*[A-Za-z])(?=.*\d).{10,}$/.test(password || ''))
      return res.status(400).json({ error:'Enter your name, a valid email, and a password of at least 10 characters with letters and numbers.' });
    const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase());
    if (exists) return res.status(409).json({ error:'An account with this email already exists.' });
    const info = db.prepare('INSERT INTO users(name,email,password_hash,account_type,role) VALUES(?,?,?,?,?)').run(name.trim(), email.toLowerCase(), await hashPassword(password), 'customer', 'customer');
    const user = getUser(info.lastInsertRowid);
    audit(user.id, 'customer.register', 'user', user.id);
    res.status(201).json({ token:signToken(user), user:safeUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error:'Could not create account.' }); }
});

app.post('/api/auth/customer/login', authLimiter, async (req,res) => {
  const email = String(req.body?.email || '').toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare("SELECT * FROM users WHERE email=? AND account_type='customer' AND active=1").get(email);
  if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) return res.status(401).json({ error:'Email or password is incorrect.' });
  audit(user.id, 'customer.login', 'user', user.id);
  res.json({ token:signToken(user), user:safeUser(user) });
});


app.post('/api/auth/employee/login', authLimiter, async (req,res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = db.prepare("SELECT * FROM users WHERE email=? AND account_type='employee' AND active=1").get(email);
  if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) return res.status(401).json({ error:'Employee email or password is incorrect.' });
  audit(user.id, 'employee.login', 'user', user.id);
  res.json({ token:signToken(user), user:safeUser(user) });
});

app.post('/api/auth/employee/request-otp', authLimiter, async (req,res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return res.status(400).json({ error:'Enter your registered phone in international format, e.g. +919876543210.' });
    const user = db.prepare("SELECT * FROM users WHERE phone=? AND account_type='employee' AND active=1").get(phone);
    if (!user) return res.status(401).json({ error:'This phone number is not authorized for employee access. Contact your manager.' });
    const result = await sendEmployeeOtp(phone);
    res.json({ message:'If this is an authorized employee number, a verification code has been sent.', mode:result.mode, developmentHint:result.mode === 'development' ? 'Local development only: check the API terminal for the OTP.' : undefined });
  } catch (e) { console.error(e); res.status(503).json({ error:e.message || 'Could not send OTP. Try again later.' }); }
});

app.post('/api/auth/employee/verify-otp', authLimiter, async (req,res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    const code = String(req.body?.code || '').trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{6}$/.test(code)) return res.status(400).json({ error:'Enter the registered phone and six-digit OTP.' });
    const user = db.prepare("SELECT * FROM users WHERE phone=? AND account_type='employee' AND active=1").get(phone);
    if (!user || !(await verifyEmployeeOtp(phone, code))) return res.status(401).json({ error:'The OTP is invalid or expired. Request a new code.' });
    audit(user.id, 'employee.otp_login', 'user', user.id);
    res.json({ token:signToken(user), user:safeUser(user) });
  } catch (e) { console.error(e); res.status(503).json({ error:'OTP verification is temporarily unavailable.' }); }
});

app.get('/api/auth/me', requireAuth, (req,res) => {
  const user = getUser(req.user.id);
  if (!user) return res.status(401).json({ error:'Account is inactive.' });
  res.json({ user:safeUser(user) });
});
app.post('/api/auth/logout', requireAuth, (req,res) => { audit(req.user.id, 'logout', 'user', req.user.id); res.json({ ok:true }); });

const allowedModules = new Set([
 'SmartPark','Smart Digital Twin & Indoor Navigation','SmartDeals','SmartExit','SmartQueue','SmartStock','SmartHelp','SmartAccess',
 'SmartPickup & Drop','SmartFacility','SmartFood','SmartCharge','SmartRest','SmartFind','SmartValet','SmartInfo','SmartFamily',
 'SmartElevator & Escalator Flow','SmartFlow Control Center','Predictive Congestion Intelligence','Mall-Wide Crowd Intelligence',
 'SmartEco','Rules Engine','What-if Simulation & Event Planning','SmartFlow Learning & Analytics','SmartFlow Score & ROI','Incident Memory'
]);
const employeeOnly = new Set(['SmartFlow Control Center','Predictive Congestion Intelligence','Mall-Wide Crowd Intelligence','SmartEco','Rules Engine','What-if Simulation & Event Planning','SmartFlow Learning & Analytics','SmartFlow Score & ROI','Incident Memory']);
const adminRoles = new Set(['operations_manager','admin']);
const restrictedRoles = {
 'SmartPark':['parking','operations_manager','admin'],
 'SmartDeals':['store','store_manager','operations_manager','admin'],
 'SmartQueue':['restaurant','restaurant_manager','operations_manager','admin'],
 'SmartStock':['store','store_manager','operations_manager','admin'],
 'SmartHelp':['support','security','maintenance','operations_manager','admin'],
 'SmartFind':['lost_found','security','operations_manager','admin'],
 'SmartExit':['security','operations_manager','admin'],
 'SmartElevator & Escalator Flow':['maintenance','operations_manager','admin'],
 'SmartInfo':['information','store_manager','operations_manager','admin'],
 'SmartFood':['restaurant','restaurant_manager','operations_manager','admin'],
 'SmartFacility':['maintenance','operations_manager','admin'],
 'SmartAccess':['maintenance','operations_manager','admin'],
 'SmartPickup & Drop':['parking','security','operations_manager','admin'],
 'SmartCharge':['maintenance','operations_manager','admin'],
 'SmartRest':['maintenance','operations_manager','admin'],
 'SmartValet':['valet','operations_manager','admin'],
 'SmartFamily':['maintenance','operations_manager','admin'],
 'Smart Digital Twin & Indoor Navigation':['operations_manager','admin']
};
function canManage(req,module) {
  if (req.user.type !== 'employee') return false;
  const roles = restrictedRoles[module];
  return !roles || roles.includes(req.user.role) || adminRoles.has(req.user.role);
}
function visibleRecord(row, user) {
  if (user.type === 'employee') return row;
  if (row.owner_id && row.owner_id !== user.id) return null;
  // Found-item records are private by default. Customers only see a deliberately safe listing,
  // never internal notes, claim evidence, exact handover details, or another user's information.
  if (row.module === 'SmartFind' && !row.owner_id) {
    const meta = safeJson(row.metadata);
    return { ...row, description: String(meta.publicDescription || 'A found item is held by the lost-and-found team. Submit a claim with details only you would know.'), location: meta.publicLocation || 'Lost-and-found desk', metadata: { itemCategory: meta.itemCategory || 'Unspecified', publicListing: true } };
  }
  return row;
}
function parseRecord(row) {
  return { ...row, metadata: safeJson(row.metadata) };
}
function safeJson(v) { try { return JSON.parse(v || '{}'); } catch { return {}; } }

app.get('/api/records', requireAuth, (req,res) => {
  const module = String(req.query.module || '');
  if (!allowedModules.has(module)) return res.status(400).json({ error:'Unknown feature module.' });
  if (employeeOnly.has(module) && req.user.type !== 'employee') return res.status(403).json({ error:'This feature is available to authorized employees only.' });
  if (req.user.type === 'employee' && !canManage(req,module)) return res.status(403).json({ error:'Your role cannot access this module.' });
  const mallId = String(req.query.mallId || 'amb-hyd').slice(0,80);
  let rows = db.prepare('SELECT * FROM records WHERE module=? ORDER BY updated_at DESC, id DESC').all(module).map(parseRecord);
  rows = rows.filter(r => String(r.metadata?.mallId || 'amb-hyd') === mallId);
  if (module === 'SmartDeals') {
    const today = new Date().toISOString().slice(0,10);
    rows = rows.filter(r => r.status.toLowerCase() !== 'expired' && (!r.metadata?.validUntil || String(r.metadata.validUntil) >= today));
  }
  rows = rows.map(r => visibleRecord(r,req.user)).filter(Boolean);
  res.json({ records:rows });
});
app.post('/api/records', requireAuth, (req,res) => {
  const { module, title, description='', status='Open', location='', metadata={} } = req.body || {};
  if (!allowedModules.has(module)) return res.status(400).json({ error:'Unknown feature module.' });
  if (employeeOnly.has(module) && req.user.type !== 'employee') return res.status(403).json({ error:'Employee access required.' });
  if (req.user.type === 'customer' && employeeOnly.has(module)) return res.status(403).json({ error:'Employee access required.' });
  if (req.user.type === 'employee' && !canManage(req,module)) return res.status(403).json({ error:'Your role cannot create records in this module.' });
  if (!String(title || '').trim() || String(title).length > 160) return res.status(400).json({ error:'Title is required and must be under 160 characters.' });
  if (typeof metadata !== 'object' || Array.isArray(metadata)) return res.status(400).json({ error:'Metadata must be an object.' });
  const normalizedMetadata = { ...metadata, mallId: String(metadata.mallId || 'amb-hyd').slice(0,80), mallName: String(metadata.mallName || 'AMB Cinemas & Mall').slice(0,120) };
  if (module === 'SmartQueue' && req.user.type === 'customer') {
    const active = db.prepare("SELECT id FROM records WHERE module='SmartQueue' AND owner_id=? AND lower(status) NOT IN ('cancelled','served','completed','closed')").get(req.user.id);
    if (active) return res.status(409).json({ error:'You already have an active queue entry. Cancel it or wait until it is completed before joining another queue.' });
    const next = db.prepare("SELECT COUNT(*) AS n FROM records WHERE module='SmartQueue' AND lower(status) NOT IN ('cancelled','served','completed','closed')").get().n + 1;
    normalizedMetadata.token = `Q-${String(Date.now()).slice(-6)}`;
    normalizedMetadata.position = next;
    normalizedMetadata.queueCreatedAt = new Date().toISOString();
  }
  if (module === 'SmartPark' && String(normalizedMetadata.source || '').toLowerCase().includes('sensor') && req.user.type !== 'employee') return res.status(403).json({ error:'Only authorized employees or a connected sensor integration can mark availability as sensor-confirmed.' });
  if (module === 'SmartDeals' && normalizedMetadata.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(String(normalizedMetadata.validUntil))) return res.status(400).json({ error:'Offer expiry must be a valid YYYY-MM-DD date.' });
  if (module === 'SmartHelp') normalizedMetadata.ticket = normalizedMetadata.ticket || `SF-${Date.now().toString().slice(-7)}`;
  if (module === 'SmartFind') normalizedMetadata.claimRef = normalizedMetadata.claimRef || `LF-${Date.now().toString().slice(-7)}`;
  if (module === 'SmartValet') normalizedMetadata.requestRef = normalizedMetadata.requestRef || `VA-${Date.now().toString().slice(-7)}`;
  const owner = req.user.type === 'customer' ? req.user.id : null;
  const info = db.prepare('INSERT INTO records(module,title,description,status,location,metadata,owner_id,updated_by) VALUES(?,?,?,?,?,?,?,?)')
    .run(module,String(title).trim(),String(description).slice(0,2000),String(status).slice(0,60),String(location).slice(0,200),JSON.stringify(normalizedMetadata),owner,req.user.id);
  audit(req.user.id,'record.create',module,info.lastInsertRowid,{ title });
  res.status(201).json({ record:parseRecord(db.prepare('SELECT * FROM records WHERE id=?').get(info.lastInsertRowid)) });
});
app.patch('/api/records/:id', requireAuth, (req,res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM records WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error:'Record not found.' });
  const requestedMall = String(req.query.mallId || 'amb-hyd').slice(0,80);
  if (String(safeJson(existing.metadata).mallId || 'amb-hyd') !== requestedMall) return res.status(404).json({ error:'Record not found in the selected mall.' });
  if (req.user.type === 'customer' && (existing.owner_id !== req.user.id || employeeOnly.has(existing.module))) return res.status(403).json({ error:'You can only update your own permitted records.' });
  if (req.user.type === 'employee' && !canManage(req,existing.module)) return res.status(403).json({ error:'Your role cannot update this module.' });
  const { title=existing.title, description=existing.description, status=existing.status, location=existing.location, metadata=safeJson(existing.metadata) } = req.body || {};
  if (req.user.type === 'customer' && status !== existing.status) {
    const allowedCustomerStatuses = existing.module === 'SmartQueue' ? ['Cancelled'] : existing.module === 'SmartValet' && ['Submitted','Accepted'].includes(existing.status) ? ['Cancelled'] : [];
    if (!allowedCustomerStatuses.includes(status)) return res.status(403).json({ error:'Customers cannot change this workflow status. Use the available customer action or contact authorized staff.' });
  }
  if (existing.module === 'SmartValet' && status === 'Completed' && req.user.type !== 'employee') return res.status(403).json({ error:'Only authorized valet staff can confirm vehicle handover.' });
  if (!String(title).trim() || typeof metadata !== 'object' || Array.isArray(metadata)) return res.status(400).json({ error:'Invalid record fields.' });
  db.prepare('UPDATE records SET title=?,description=?,status=?,location=?,metadata=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(String(title).trim().slice(0,160),String(description).slice(0,2000),String(status).slice(0,60),String(location).slice(0,200),JSON.stringify(metadata),req.user.id,id);
  audit(req.user.id,'record.update',existing.module,id,{ status });
  res.json({ record:parseRecord(db.prepare('SELECT * FROM records WHERE id=?').get(id)) });
});
app.delete('/api/records/:id', requireAuth, (req,res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM records WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error:'Record not found.' });
  const requestedMall = String(req.query.mallId || 'amb-hyd').slice(0,80);
  if (String(safeJson(existing.metadata).mallId || 'amb-hyd') !== requestedMall) return res.status(404).json({ error:'Record not found in the selected mall.' });
  if (req.user.type === 'customer' && existing.owner_id !== req.user.id) return res.status(403).json({ error:'You can only remove your own records.' });
  if (req.user.type === 'employee' && !canManage(req,existing.module)) return res.status(403).json({ error:'Your role cannot delete records in this module.' });
  db.prepare('DELETE FROM records WHERE id=?').run(id);
  audit(req.user.id,'record.delete',existing.module,id);
  res.json({ ok:true });
});
app.get('/api/audit', requireAuth, allowTypes('employee'), (req,res) => {
  if (!adminRoles.has(req.user.role)) return res.status(403).json({ error:'Operations manager or admin access required.' });
  const rows = db.prepare('SELECT a.*,u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200').all();
  res.json({ events:rows.map(r=>({...r,details:safeJson(r.details)})) });
});

async function ensureDemoAccounts() {
  const demoEmployeeEmail = 'employee@smartflow.local';
  const demoEmployeePassword = 'Employee123!';
  const existingEmployee = db.prepare('SELECT * FROM users WHERE email=?').get(demoEmployeeEmail);
  if (!existingEmployee) {
    const passwordHash = await hashPassword(demoEmployeePassword);
    db.prepare('INSERT INTO users(name,email,phone,password_hash,account_type,role,active) VALUES(?,?,?,?,?,?,1)')
      .run('Demo Operations Manager', demoEmployeeEmail, '+919999999999', passwordHash, 'employee', 'operations_manager');
    console.log(`Created demo employee account: ${demoEmployeeEmail} / ${demoEmployeePassword}`);
  } else if (existingEmployee.account_type !== 'employee' || existingEmployee.role !== 'operations_manager' || !existingEmployee.active) {
    const passwordHash = await hashPassword(demoEmployeePassword);
    db.prepare("UPDATE users SET password_hash=?, account_type='employee', role='operations_manager', active=1 WHERE id=?")
      .run(passwordHash, existingEmployee.id);
    console.log(`Repaired demo employee account: ${demoEmployeeEmail} / ${demoEmployeePassword}`);
  }

  const demoCustomerEmail = 'visitor@smartflow.local';
  const existingCustomer = db.prepare('SELECT * FROM users WHERE email=?').get(demoCustomerEmail);
  if (!existingCustomer) {
    const passwordHash = await hashPassword('Visitor123!');
    db.prepare('INSERT INTO users(name,email,password_hash,account_type,role,active) VALUES(?,?,?,?,?,1)')
      .run('Demo Visitor', demoCustomerEmail, passwordHash, 'customer', 'customer');
    console.log(`Created demo customer account: ${demoCustomerEmail} / Visitor123!`);
  }
}

const port = Number(process.env.PORT || 4000);
ensureDemoAccounts().then(() => {
  app.listen(port, () => console.log(`SmartFlow API listening on http://localhost:${port}`));
}).catch(error => {
  console.error('Could not initialize SmartFlow demo accounts:', error);
  process.exit(1);
});
