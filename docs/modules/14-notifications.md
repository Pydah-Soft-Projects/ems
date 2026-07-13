# Module: Notifications

## Overview (Workflow 12)

Event-driven notifications to students, examination staff, and administrators.

## Events (from doc)

- Examination published
- Fee generated
- Fee due reminder
- Late fee applied
- Payment successful / failed
- Hall ticket available
- Examination reminder
- Result published
- General announcements

## Channels

- Email
- SMS
- In-app notification
- Push notification
- WhatsApp (optional)

## Status

⏳ **Planned**

## Implementation notes

- Event bus from exam publish, fee gen, payment success
- Template per event type
- Delivery status tracking + retry
