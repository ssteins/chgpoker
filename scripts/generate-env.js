#!/usr/bin/env node

/**
 * Helper script to generate environment variables for deployment
 */

const crypto = require('crypto');

console.log('🔧 Render Deployment Environment Variables\n');

// Generate JWT Secret
const jwtSecret = crypto.randomBytes(32).toString('hex');
console.log('Copy these to your Render backend service environment variables:\n');

console.log('NODE_ENV=production');
console.log('PORT=10000');
console.log(`JWT_SECRET=${jwtSecret}`);
console.log('OKTA_ISSUER=https://[your-domain].okta.com/oauth2/default');
console.log('OKTA_CLIENT_ID=[your-okta-client-id]');
console.log('OKTA_CLIENT_SECRET=[your-okta-client-secret]');
console.log('FRONTEND_URL=https://[your-frontend-name].onrender.com');

console.log('\n📝 Don\'t forget to:');
console.log('1. Replace [your-domain] with your actual Okta domain');
console.log('2. Replace [your-okta-client-id] with your Okta app client ID');
console.log('3. Replace [your-okta-client-secret] with your Okta app client secret');
console.log('4. Replace [your-frontend-name] with your actual Render frontend service name');
console.log('5. Update Okta app settings with your Render URLs');

console.log('\n🎯 Service URLs will be:');
console.log('Frontend: https://pointing-poker-frontend.onrender.com');
console.log('Backend: https://pointing-poker-backend.onrender.com');

console.log('\n📚 See DEPLOYMENT.md for complete setup instructions');