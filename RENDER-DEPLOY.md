# Quick Render Deployment 🚀

## Files Created for You:
- ✅ `render.yaml` - Render service configuration
- ✅ `DEPLOYMENT.md` - Complete deployment guide  
- ✅ `.env.example` - Environment variable template
- ✅ `frontend/src/config/api.ts` - API configuration
- ✅ `scripts/generate-env.js` - Environment variable generator

## 🎯 Quick Deploy Steps:

1. **Generate Environment Variables**:
   ```bash
   npm run deploy:env
   ```

2. **Push to GitHub** (if not already):
   ```bash
   git add .
   git commit -m "Add deployment configuration"
   git push
   ```

3. **Deploy to Render**:
   - Go to [render.com](https://render.com)
   - Connect GitHub repository
   - Use the `render.yaml` blueprint OR deploy services manually
   - Add environment variables (use output from step 1)

4. **Configure Okta**:
   - Add your Render URLs to Okta app settings
   - Update redirect URIs

5. **Test Your App**:
   - ✅ Frontend: `https://pointing-poker-frontend.onrender.com` 
   - ✅ Backend: `https://pointing-poker-backend.onrender.com/api/health`

## 📚 Need Help?
See `DEPLOYMENT.md` for detailed instructions and troubleshooting.

## 💰 Cost: 100% FREE
Both services will run on Render's free tier with automatic SSL certificates!