# CareerTrack backend deployment

This folder is a standalone Express + MongoDB backend for CareerTrack.

## Deploy on Render
1. Put this `backend` folder in the root of a GitHub repository, or add it as a `backend/` folder in the existing repository.
2. In Render, create a **New Web Service** connected to that repository.
3. If the backend is inside a subfolder, set **Root Directory** to `backend`. If these files are at repository root, leave Root Directory blank.
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variable `MONGODB_URI` with the MongoDB Atlas connection string. Add `FRONTEND_URL=https://savariyasathyan.github.io` if desired. Do not commit `.env` or publish database credentials.
7. After deploy, test `https://YOUR-RENDER-SERVICE.onrender.com/api/health`. It should return JSON with `Job Application Tracker API is running`.

## Frontend change required
In `src/App.jsx`, replace the existing line:

`const API = 'http://localhost:5000/api/applications'`

with:

`const API = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/applications``

Then create a GitHub Actions/Pages build with repository variable `VITE_API_URL` set to your Render service URL (without a trailing slash), or use the deployed URL directly in the line above. The frontend and backend must both be deployed for the online app to work.
