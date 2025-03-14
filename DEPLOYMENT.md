# Meetini MVP Deployment Checklist

## Pre-Deployment Verification
- [ ] Verify all required environment variables are set
- [ ] Confirm OAuth configuration is working
  - [ ] Token refresh logic intact
  - [ ] All required scopes present
  - [ ] Session handling working
- [ ] Test database migrations
- [ ] Check all API integrations
  - [ ] Google Calendar
  - [ ] Gmail
  - [ ] Contacts
  - [ ] OpenAI
  - [ ] Google Maps

## Required Environment Variables
```
NEXTAUTH_URL=<production-url>
NEXTAUTH_SECRET=<strong-secret>
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<oauth-client-secret>
DATABASE_URL=<production-db-url>
RESEND_API_KEY=<api-key>
RESEND_FROM_EMAIL=<verified-sender>
OPENAI_API_KEY=<api-key>
GOOGLE_MAPS_API_KEY=<api-key>
NODE_ENV=production
```

## OAuth Configuration
- [ ] Update Google OAuth credentials
  - [ ] Add production redirect URI
  - [ ] Verify all scopes are enabled:
    - openid
    - userinfo.email
    - userinfo.profile
    - calendar
    - calendar.events
    - gmail.modify
    - gmail.send
    - gmail.compose
    - contacts.readonly

## Database
- [ ] Run production migrations
- [ ] Verify database connection
- [ ] Check indexes and constraints

## Security
- [ ] Enable CORS for production domain
- [ ] Verify secure session configuration
- [ ] Check rate limiting
- [ ] Enable error logging
- [ ] Test error handling

## Post-Deployment
- [ ] Verify OAuth flow in production
- [ ] Test calendar integration
- [ ] Check email sending
- [ ] Monitor error logs
- [ ] Test user session persistence
