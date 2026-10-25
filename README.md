# SmartFlow — Premium Smart Mall Workspace

SmartFlow is a responsive React/Vite + Express + SQLite starter application for mall visitor services and employee operations. The UI uses the Midnight Forest, Soft Ivory, Jade Green and Champagne Gold palette, with a cinematic feature carousel, drag/touch scrolling, animated cards, reduced-motion support, and feature-specific data-entry panels.

## What is included

- Customer registration/login and employee OTP login flow.
- Employee-only operational modules and backend role checks.
- All 18 visitor feature modules and 9 employee operations modules from the SmartFlow feature list.
- Feature-specific fields stored in each record's metadata, in addition to title, description, location, status, owner and timestamps.
- SQLite persistence and audit log for important record changes.
- Server-side checks for duplicate active customer queue entries, generated queue tokens, customer queue cancellation, offer expiry filtering, private customer records, protected employee-only modules, and safer public found-item listings.
- Vite `/api` proxy to the Express API for local development.
- Automated API integration tests for key auth/authorization and record behaviors.

## Run in VS Code

Requirements: Node.js 20 or newer.

1. Extract the ZIP and open the `smartflow` folder in VS Code.
2. In the VS Code terminal, run `npm install`.
3. Copy the environment template:
   - PowerShell: `Copy-Item server/.env.example server/.env`
   - macOS/Linux: `cp server/.env.example server/.env`
4. Edit `server/.env` and set a unique `JWT_SECRET` of at least 24 characters. Keep `OTP_MODE=development` for local testing only.
5. Seed demo records and the demo accounts: `npm run seed`.
6. Start both servers: `npm run dev`.
7. Open `http://localhost:5173`. API health should be available at `http://localhost:4000/api/health`.

### Demo accounts

- Customer email: `visitor@smartflow.local`
- Customer password: `Visitor123!`
- Employee phone: `+919999999999`
- In development OTP mode, request an employee code and read it in the API terminal. Development OTP mode is not suitable for production.

## Tests

After installing dependencies, run:

```bash
npm test
```

The tests launch an isolated API process against a temporary SQLite database and check API health, customer access boundaries, queue token creation and duplicate-entry blocking, queue cancellation permissions, private record ownership, and expiry filtering for offers.

## Important scope and integration notes

This is a functional local foundation, not a claim that all 27 feature areas are production-complete. Feature-specific fields and stored workflows are included, but some requested domain workflows still need dedicated implementation and testing before being described as complete—for example, a database-backed indoor-map graph with Dijkstra/A* routing, employee-managed parking-space conflict resolution, restaurant queue service-time estimates, offer approval/redemption records, full lost-item claim verification and handover, valet handover checks, sensor/building-system integrations, historical analytics models, configurable rules execution, and validated simulation/ROI calculations.

No real mall sensors, live inventory, GPS-like indoor positioning, building-management systems, SMS provider, or official mall map is included by default. The app should label manually entered or sample information as such and must not present it as live. To send actual SMS OTPs, configure the Twilio Verify values in `server/.env` and test with an authorized number. Use HTTPS, secure secrets, deployment hardening, backup/retention policies and a security review before production use.

## Multi-mall experience
The refreshed UI includes a mall selector on the sign-in screen and inside the signed-in workspace. Each saved record carries a `mallId` and `mallName` in its metadata. Record lists and record updates are scoped to the selected mall. The included mall list is demonstration configuration; before production, replace the sample mall details/images with approved mall data and configure which services each mall actually supports. External image URLs require internet access; the interface has CSS gradients as its base treatment.
