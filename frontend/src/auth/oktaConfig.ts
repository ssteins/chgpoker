import { OktaAuth } from '@okta/okta-auth-js';

// Okta configuration
// Replace these with your actual Okta Developer app values
const oktaConfig = {
  issuer: import.meta.env.VITE_OKTA_ISSUER || 'https://dev-12345.okta.com/oauth2/default',
  clientId: import.meta.env.VITE_OKTA_CLIENT_ID || 'your-client-id',
  redirectUri: `${window.location.origin}/login/callback`,
  scopes: ['openid', 'profile', 'email'],
  pkce: true,
  disableHttpsCheck: import.meta.env.DEV
};

export const oktaAuth = new OktaAuth(oktaConfig);

export default oktaConfig;