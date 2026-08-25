# Mickey Water Billing System

Simple water billing web app with MongoDB, user/admin login, and admin editing.

## Setup

1. Install dependencies:
   ```bash
   cd "c:\Users\micki\Downloads\mickey-water-system"
   npm install
   ```
2. Create a `.env` file in the project root with:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://127.0.0.1:27017/mickey_water
   JWT_SECRET=your_secret_key_here
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your_email@example.com
   SMTP_PASS=your_smtp_password
   SMTP_FROM=your_email@example.com
   TAPSA_API_KEY=your_tapsa_api_key
   TAPSA_SENDER_ID=TAPSA
   CLIENT_ORIGIN=http://localhost:3000
   ADMIN_EMAIL=admin@admin.com
   ADMIN_PASSWORD=Admin123
   ```
3. Start MongoDB locally or use MongoDB Atlas.

SMS za moja kwa moja zinatumia TAPSA. Weka API key halisi, si maandishi `your_tapsa_api_key`, pamoja na `TAPSA_SENDER_ID` kwenye environment ya server. Ikiwa TAPSA haijawekwa, token si sahihi, au huduma haipatikani, kitufe cha SMS kitafungua programu ya SMS kwenye kifaa.

Password reset email inahitaji SMTP settings zilizo hapo juu. Backup ya MongoDB inaendeshwa kwa `npm run backup` baada ya kusakinisha MongoDB Database Tools (`mongodump`). Backup files zinawekwa kwenye `backups/`, ambayo haifuatiliwi na Git.
4. Run the app:
   ```bash
   npm start
   ```
5. Open `http://localhost:3000` in your browser.

## Deployment

### Render
1. Push the project to GitHub.
2. Create a new Web Service on Render and connect your repository.
3. Use the existing `render.yaml`, or set the start command to:
   ```bash
   npm install && node server.js
   ```
4. Set these environment variables in Render:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `NODE_ENV=production`
   - `CLIENT_ORIGIN` (optional; comma-separated allowed frontend origins)
5. Deploy and confirm the service starts successfully.

### Vercel
1. Push the project to GitHub.
2. Import the repository into Vercel.
3. Ensure `vercel.json` is present in the project root.
4. Configure environment variables in Vercel:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `NODE_ENV=production`

   Note: Use the exact variable names above. If you set `mongodb_url` instead of `MONGODB_URI`, the app will not find the value unless your code has fallback support.
5. Deploy from the Vercel dashboard or run:
   ```bash
   vercel --prod
   ```

## Default admin
- Email: `admin@admin.com`
- Password: `Admin123`

## Pages
- `/` — login page
- `/dashboard.html` — main app page after login

## Features
- User and admin login with JWT authentication
- Create and save water billing records in MongoDB
- Admin can edit and delete records
- Search and filter records by month/year
- Monthly and yearly summary totals

## Mfumo wa malipo ya manual

- Mtumiaji huunda bill; bill huanza ikiwa `Haijalipwa` na haiwezi kujitangaza kuwa imelipwa.
- Kwenye bill, mtumiaji hutuma kiasi alicholipa, namba ya rejea ya muamala, na maelezo ya ziada.
- Ombi hubaki `pending` mpaka admin alikague kwenye kichupo cha **Idhini za Malipo**.
- Admin akichagua **Idhinisha na toa risiti**, mfumo huweka `approved`, huunda namba ya risiti, na bill hubadilika kuwa `Imelipwa` ikiwa deni lote limelipwa.
- Admin akikataa, ombi huwekwa `rejected` na sababu huonekana kwa mtumiaji. Ujumbe wa bill si risiti; risiti hutolewa kwa malipo yaliyoidhinishwa pekee.
