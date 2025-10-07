Kesug — Airdrop Manager v2
==========================

This package includes:
- React + Vite + Tailwind frontend (src/)
- Google Apps Script backend (apps_script/Code.gs)
- README with deployment instructions

Important changes in v2:
- Per-account rewardAmount and investmentAmount can be manually entered by the user (Editor mode).
- When an airdrop is marked as 'ended' (Editor action), the backend computes:
   - totalEarned (sum of rewardAmount for assignments linked to the airdrop)
   - totalInvested (sum of investmentAmount)
   - profit = totalEarned - totalInvested
   - endedAt timestamp
- These totals are written into the Airdrops sheet and displayed in the UI.

Setup steps:
1. Download and extract this project.
2. Create a Google Sheet with three sheets named exactly:
   - Accounts
     Headers (row 1): id, name, email, twitter, discord, telegram, secretPhraseEncrypted
   - Airdrops
     Headers: id, name, url, group, startDate, endDate, createdAt, ended, totalEarned, totalInvested, profit, endedAt
   - Assignments
     Headers: id, airdropId, accountId, status, rewardAmount, investmentAmount

3. Open Google Apps Script (script.google.com), create a new project, paste apps_script/Code.gs,
   set SHEET_ID at the top to your spreadsheet ID, and deploy as Web App:
     - Execute as: Me
     - Who has access: Choose appropriately (Anyone with link for testing)
   Copy the Web App URL (it will be like https://script.google.com/macros/s/AKfycb.../exec)

4. Update src/App.jsx:
   - Set BACKEND_URL to your Apps Script URL (include trailing /exec if present)
   - Optionally set OAUTH_CLIENT_ID to your Google OAuth Client ID to enable sign-in prompts.

5. Install and run locally:
   npm install
   npm run dev

6. Build and deploy to Netlify:
   npm run build
   Deploy the dist folder to Netlify.

Security notes:
- Secret phrases are encrypted client-side using Web Crypto AES-GCM with a passphrase you provide.
  The server stores only ciphertext. If you lose the passphrase, you cannot recover secrets.
- Do not use this project to automate or cheat referral programs.
