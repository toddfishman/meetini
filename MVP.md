# Meetini MVP Requirements

## Core Features

### 1. Contact Recognition and Integration
- Text-to-meeting and voice-to-meeting must recognize names
- Find contact info in opted-in services:
  - Gmail
  - LinkedIn
  - Facebook
  - Phone contacts
- Send invitations via text or email based on voice/text prompts

### 2. Smart Meeting Scheduling
- Algorithm should analyze multiple people's:
  - Availability
  - Preferences
- Make SMART and ideal recommendations

### 3. Google Calendar Integration
- Create accurate, working calendar invitations
- Ensure proper synchronization

### 4. Email and SMS Notifications

#### Required Email Templates

1. **Support Auto-Response** (`support@meetini.ai`)
   - General acknowledgment
   - 24-48 hour response time promise

2. **Non-Current-User Invite Email**
   - Three functional links:
     1. "Let Meetini Schedule it"
        - Links to sign-up page
        - For new users wanting full automation
     2. "Accept & Schedule Myself"
        - For non-users who want this specific meeting
        - Show 3 preferred time slots
     3. "Decline Invitation"
        - Basic decline page
        - Optional feedback (radio buttons):
          - Spam report
          - Unknown sender
          - Too busy
          - Other reasons

3. **All-Current User Invite Email**
   - Auto-sent when all invitees are Meetini users
   - Include all meetini details
   - Request confirmation from each user
   - Triggers Confirmation Email when all confirm

4. **Meetini Confirmation Email**
   - Sent after all confirmations received
   - Only after calendar invites are added

5. **User Mix Invite Email**
   - For mixed user/non-user invitee groups
   - Indicates waiting for non-user responses
   - Triggers Confirmation Email after all responses

## Success Criteria
- All email templates must be functional
- All links in emails must work
- Calendar integration must be accurate
- Contact recognition must be reliable
- Smart scheduling must provide useful recommendations
