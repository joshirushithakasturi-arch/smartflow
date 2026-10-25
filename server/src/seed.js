import { db } from './db.js';
import { hashPassword } from './auth.js';

const customer = db.prepare("SELECT id FROM users WHERE email=?").get('visitor@smartflow.local');
if (!customer) {
  const result = db.prepare("INSERT INTO users(name,email,password_hash,account_type,role) VALUES(?,?,?,?,?)")
    .run('Demo Visitor','visitor@smartflow.local',await hashPassword('Visitor123!'),'customer','customer');
  console.log('Seeded demo customer:', result.lastInsertRowid);
}
const employee = db.prepare("SELECT id FROM users WHERE phone=?").get('+919999999999');
if (!employee) {
  db.prepare("INSERT INTO users(name,phone,account_type,role) VALUES(?,?,?,?)")
    .run('Demo Operations Manager','+919999999999','employee','operations_manager');
  console.log('Seeded demo employee +919999999999');
}
const seedRows = [
 ['SmartPark','Parking space B123','Basement 1 · Zone B','Available','{"floor":"B1","zone":"B","source":"sample"}'],
 ['Smart Digital Twin & Indoor Navigation','Max Fashion','Level 1 · East Wing','Open','{"floor":"L1","category":"Fashion","sample":true}'],
 ['SmartDeals','Weekend Style Edit · 20% off','Max Fashion · Valid through Sunday','Active','{"discount":"20%","source":"sample"}'],
 ['SmartQueue','Food Court — Table Service','Level 3 · Food Court','Open','{"waitMinutes":12,"source":"sample estimate"}'],
 ['SmartStock','Everyday denim jacket','Max Fashion · Level 1','Availability unknown','{"sku":"DEMO-101","source":"sample"}'],
 ['SmartFacility','Restrooms','Available on Levels 1, 2 and 3','Open','{"category":"Restroom","verified":false}'],
 ['SmartFood','The Noodle House','Level 3 · Food Court','Open','{"cuisine":"Asian","menuStatus":"sample"}'],
 ['SmartCharge','Phone charging lounge','Level 2 · Near Atrium','Status unknown','{"source":"staff-managed"}'],
 ['SmartRest','Atrium seating','Level 2 · Central Atrium','Open','{"seating":"Public seating"}'],
 ['SmartPickup & Drop','Ride pickup zone P2','Ground Level · Gate 2','Open','{"zone":"P2"}'],
 ['SmartFamily','Baby care room','Level 2 · West Wing','Status unknown','{"verified":false}'],
 ['SmartElevator & Escalator Flow','Central elevators','Basement 2 to Level 4','Operational (reported)','{"source":"sample report"}'],
 ['SmartExit','North exit','Ground Level · North side','Open (reported)','{"congestion":"Unknown","source":"sample"}'],
 ['SmartHelp','Help desk ticket #SF-1024','Atrium information desk','In progress','{"ticket":"SF-1024","source":"sample"}'],
 ['SmartFlow Control Center','Basement B1 occupancy review','Parking operations','Needs review','{"priority":"Medium","source":"sample"}'],
 ['Predictive Congestion Intelligence','Weekend afternoon review','Food Court · Level 3','Estimated','{"basis":"Illustrative sample only"}'],
 ['SmartEco','Monthly electricity reading','Service area','Sample data','{"kwh":1240,"unit":"kWh","sample":true}'],
 ['Rules Engine','Queue threshold notification','Restaurant queue > 20 min','Enabled','{"threshold":20,"action":"Create staff alert"}'],
 ['What-if Simulation & Event Planning','Festive weekend scenario','Atrium + Food Court','Draft','{"attendance":5000,"sample":true}'],
 ['SmartFlow Learning & Analytics','Queue trend review','Last 30 days','Sample data','{"sample":true}'],
 ['SmartFlow Score & ROI','Pilot measurement baseline','Operations','Needs baseline','{"sample":true}'],
 ['Incident Memory','Escalator fault report','Level 2 · East Wing','Resolved','{"sample":true}']
];
const insert = db.prepare('INSERT INTO records(module,title,description,status,location,metadata) VALUES(?,?,?,?,?,?)');
const tx = db.transaction(() => {
  for (const [module,title,location,status,metadata] of seedRows) {
    if (!db.prepare('SELECT id FROM records WHERE module=? AND title=?').get(module,title))
      insert.run(module,title,'Illustrative demo record. Replace with verified mall data before production use.',status,location,metadata);
  }
});
tx();
console.log('SmartFlow sample data is ready. Existing data was preserved.');
