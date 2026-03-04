# Render Deployment Guide

## 🚀 Quick Setup (Using Render Dashboard)

### 1. Prepare Your Repository
1. **Push to GitHub**: Make sure your code is in a GitHub repository
2. **Environment Variables**: Copy `.env.example` to `.env` and fill in your values

### 2. Deploy Backend (Web Service)
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `pointing-poker-backend`
   - **Environment**: `Node`
   - **Build Command**: `cd backend && npm install && npm run build`
   - **Start Command**: `cd backend && npm start`
   - **Plan**: `Free`

### 3. Deploy Frontend (Static Site)
1. Click **"New +"** → **"Static Site"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `pointing-poker-frontend`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/dist`
   - **Plan**: `Free`

### 4. Environment Variables
Add these to your **backend service**:
```
NODE_ENV=production
PORT=10000
OKTA_ISSUER=https://your-domain.okta.com/oauth2/default
OKTA_CLIENT_ID=your-okta-client-id
OKTA_CLIENT_SECRET=your-okta-client-secret
JWT_SECRET=your-256-bit-jwt-secret
FRONTEND_URL=https://your-frontend.onrender.com
```

### 5. Update CORS & URLs
Once deployed, update:
1. **Okta App Settings**: Add your Render URLs to allowed origins
2. **Frontend Config**: Update `frontend/src/config/api.ts` with actual URLs

---

## 🔧 Alternative: Deploy with render.yaml

1. **Commit the render.yaml** file to your repository
2. Go to Render Dashboard
3. Click **"New +"** → **"Blueprint"**
4. Connect repository and select `render.yaml`
5. Update environment variables in the dashboard

---

## 🌐 Post-Deployment Checklist

### Backend Service
- [ ] Service starts successfully (check logs)
- [ ] Health endpoint reachable: `https://your-backend.onrender.com/api/health`
- [ ] Environment variables configured

### Frontend Service  
- [ ] Site deploys successfully
- [ ] Can access the app
- [ ] API calls work (check browser network tab)

### Okta Configuration
- [ ] Add Render URLs to Okta app:
  - Sign-in redirect URI: `https://your-frontend.onrender.com/login/callback`
  - Sign-out redirect URI: `https://your-frontend.onrender.com/`
  - Trusted Origins: Both frontend and backend URLs

### CORS & Security
- [ ] Backend accepts requests from frontend URL
- [ ] SSL certificates working (automatic on Render)
- [ ] SSE connections working

---

## 🐛 Common Issues

### Cold Starts
**Problem**: 15-30 second delays on free tier  
**Solution**: Warm up with a cron job or consider paid plan

### CORS Errors
**Problem**: Frontend can't reach backend  
**Solution**: Check CORS configuration in backend and environment variables

### SSE Connection Issues
**Problem**: Real-time updates not working  
**Solution**: Ensure both services are using HTTPS and same domain

### Okta Authentication
**Problem**: Login redirects fail  
**Solution**: Verify redirect URIs in Okta match exactly

---

## 📋 Required Environment Variables

**Backend (.env):**
```bash
NODE_ENV=production
PORT=10000
OKTA_ISSUER=https://[your-domain].okta.com/oauth2/default
OKTA_CLIENT_ID=[your-client-id]  
OKTA_CLIENT_SECRET=[your-client-secret]
JWT_SECRET=[256-bit-secret]
FRONTEND_URL=https://[your-app].onrender.com
```

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🎯 Success Indicators

1. ✅ Backend health check responds
2. ✅ Frontend loads without errors
3. ✅ Can create/join rooms
4. ✅ Real-time voting works
5. ✅ Okta login/logout functions

Your app will be available at:
- **Frontend**: `https://pointing-poker-frontend.onrender.com`
- **Backend**: `https://pointing-poker-backend.onrender.com`