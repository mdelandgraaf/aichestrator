# CSA Android Caller ID Overlay App

## Overview

A native Android application that displays an overlay when receiving incoming calls, showing the caller's information from CSA (contacts, company, and recent activities/conversations) so users immediately know who is calling and what the last interactions were.

---

## Core Functionality

### 1. Incoming Call Detection & Overlay

When a phone call comes in:
1. App detects the incoming call via `BroadcastReceiver` listening to `TelephonyManager.ACTION_PHONE_STATE_CHANGED`
2. Extracts the caller's phone number
3. Searches local cache (and optionally CSA API) for matching contact
4. Displays overlay window with contact information

### 2. Overlay Display Content

```
┌─────────────────────────────────────────┐
│  [Company Logo/Avatar]                  │
│                                         │
│  John Smith                             │
│  Sales Director @ Acme Corp             │
│  Tier 1 ⭐                              │
│                                         │
│  ─────────────────────────────────────  │
│  Recent Activities:                     │
│                                         │
│  📞 Phone Call - 3 days ago             │
│     "Discussed Q4 pricing proposal"     │
│     Outcome: Interested                 │
│                                         │
│  📧 Email - 1 week ago                  │
│     "Follow-up on product demo"         │
│                                         │
│  🤝 Meeting - 2 weeks ago               │
│     "Initial discovery call"            │
│     Outcome: Qualified lead             │
│                                         │
│  [Log Call]  [View in CSA]  [Dismiss]   │
└─────────────────────────────────────────┘
```

---

## Technical Requirements

### Android Permissions Required

```xml
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
<uses-permission android:name="android.permission.READ_CALL_LOG" />
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

| Permission | Purpose |
|------------|---------|
| `READ_PHONE_STATE` | Detect incoming calls and get phone number |
| `READ_CALL_LOG` | Access caller phone number (Android 9+) |
| `SYSTEM_ALERT_WINDOW` | Display overlay on top of other apps |
| `INTERNET` | Communicate with CSA API |
| `FOREGROUND_SERVICE` | Keep service running for call detection |
| `RECEIVE_BOOT_COMPLETED` | Auto-start service after device reboot |

### Minimum Android Version

- **Minimum SDK:** Android 8.0 (API 26)
- **Target SDK:** Android 14 (API 34)
- Rationale: Android 8+ required for foreground service requirements and notification channels

---

## CSA API Integration

### Authentication

The app authenticates using the existing CSA auth system:

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}

Response:
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d"
  }
}
```

The JWT token is stored securely in Android's `EncryptedSharedPreferences`.

### New API Endpoint Required: Phone Number Lookup

**A new endpoint is needed in the CSA backend:**

```
GET /api/crm/contacts/lookup-by-phone?phone=+31612345678
Authorization: Bearer <token>

Response:
{
  "data": {
    "contact": {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Smith",
      "phone": "+31612345678",
      "phoneMobile": "+31687654321",
      "jobTitle": "Sales Director",
      "company": {
        "id": "uuid",
        "name": "Acme Corp",
        "tier": "1",
        "phone": "+31201234567"
      }
    },
    "recentActivities": [
      {
        "id": "uuid",
        "activityType": "phone_call",
        "subject": "Discussed Q4 pricing proposal",
        "description": "Called about the pricing proposal we sent...",
        "activityDate": "2026-01-24T14:30:00Z",
        "durationMinutes": 15,
        "outcome": "Interested"
      },
      {
        "id": "uuid",
        "activityType": "email",
        "subject": "Follow-up on product demo",
        "activityDate": "2026-01-20T09:00:00Z",
        "outcome": null
      }
    ]
  }
}
```

### Phone Number Matching Logic

The backend should normalize and match phone numbers:

```sql
-- Normalize phone numbers by removing non-digits (except leading +)
-- Match against: contacts.phone, contacts.phone_mobile, companies.phone

SELECT c.*, comp.name as company_name, comp.tier as company_tier
FROM contacts c
LEFT JOIN companies comp ON c.company_id = comp.id
WHERE c.organization_id = $1
  AND c.deleted_at IS NULL
  AND (
    normalize_phone(c.phone) = normalize_phone($2)
    OR normalize_phone(c.phone_mobile) = normalize_phone($2)
  )
LIMIT 1;
```

Phone normalization should handle:
- Country codes (+31, 0031, 31)
- Leading zeros (0612345678 vs 612345678)
- Formatting (spaces, dashes, parentheses)

---

## App Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    CSA Caller ID App                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │   Login     │    │  Settings   │    │   Sync      │ │
│  │  Activity   │    │  Activity   │    │  Service    │ │
│  └─────────────┘    └─────────────┘    └─────────────┘ │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │           CallDetectionService                   │   │
│  │  (Foreground Service + BroadcastReceiver)        │   │
│  └─────────────────────────────────────────────────┘   │
│                           │                             │
│                           ▼                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │              OverlayManager                      │   │
│  │  (WindowManager + Custom View)                   │   │
│  └─────────────────────────────────────────────────┘   │
│                           │                             │
│         ┌─────────────────┴─────────────────┐          │
│         ▼                                   ▼          │
│  ┌─────────────┐                    ┌─────────────┐   │
│  │ Local Cache │                    │  CSA API    │   │
│  │  (Room DB)  │                    │   Client    │   │
│  └─────────────┘                    └─────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Incoming Call
       │
       ▼
2. BroadcastReceiver detects PHONE_STATE_RINGING
       │
       ▼
3. Extract phone number from intent/TelephonyManager
       │
       ▼
4. Query local Room database for cached contact
       │
       ├── Found ──► Display overlay immediately
       │
       └── Not Found ──► Query CSA API
                              │
                              ├── Found ──► Cache & Display overlay
                              │
                              └── Not Found ──► Show "Unknown Caller" or hide
```

---

## Local Caching Strategy

### Room Database Schema

```kotlin
@Entity(tableName = "contacts")
data class CachedContact(
    @PrimaryKey val id: String,
    val firstName: String,
    val lastName: String,
    val phone: String?,
    val phoneMobile: String?,
    val jobTitle: String?,
    val companyId: String?,
    val companyName: String?,
    val companyTier: String?,
    val lastSyncedAt: Long
)

@Entity(tableName = "activities")
data class CachedActivity(
    @PrimaryKey val id: String,
    val contactId: String,
    val activityType: String,
    val subject: String?,
    val description: String?,
    val activityDate: Long,
    val durationMinutes: Int?,
    val outcome: String?,
    val lastSyncedAt: Long
)

@Entity(tableName = "phone_index")
data class PhoneIndex(
    @PrimaryKey val normalizedPhone: String,
    val contactId: String
)
```

### Sync Strategy

1. **Initial Sync:** Download all contacts with phone numbers on first login
2. **Periodic Sync:** Background sync every 15 minutes (configurable)
3. **On-Demand Sync:** When phone number not found in cache, query API
4. **Activity Sync:** Fetch recent activities (last 30 days) for cached contacts

### Estimated Data Size

| Contacts | Avg Activities/Contact | Approx Size |
|----------|------------------------|-------------|
| 100      | 10                     | ~500 KB     |
| 500      | 10                     | ~2.5 MB     |
| 1000     | 10                     | ~5 MB       |

---

## User Interface Screens

### 1. Login Screen

- CSA logo
- Email input
- Password input
- "Remember me" checkbox
- Login button
- CSA server URL configuration (for self-hosted instances)

### 2. Main/Settings Screen

- Connection status indicator
- Last sync timestamp
- Manual sync button
- Overlay settings:
  - Enable/disable overlay
  - Show on lock screen (yes/no)
  - Overlay position (top/center/bottom)
  - Show activities count (3/5/10)
  - Auto-dismiss after X seconds
- Notification settings
- Logout button

### 3. Overlay Window

- Contact name & job title
- Company name & tier
- Recent activities list (scrollable)
- "Log Call" button - opens quick call logging form
- "Open in CSA" button (deep link to web app)
- "Dismiss" button

### 4. Log Call Screen (Post-Call)

Quick form that appears after clicking "Log Call":

- Pre-filled: Contact name, Company, Date/Time, Duration (from call log)
- User inputs:
  - Subject (quick text input)
  - Notes (optional, multiline)
  - Outcome dropdown (Connected, Voicemail, No Answer, Busy, Other)
- "Save" submits to CSA API: `POST /api/crm/activities`
- "Cancel" dismisses without saving

---

## Security Considerations

### Token Storage

```kotlin
// Use EncryptedSharedPreferences
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val securePrefs = EncryptedSharedPreferences.create(
    context,
    "csa_secure_prefs",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)
```

### Data Protection

- All API calls over HTTPS
- Local database encrypted with SQLCipher (optional)
- Clear data on logout
- Automatic logout on token expiry
- No sensitive data in logs

### Privacy

- Only sync contacts owned by the logged-in user (or team if manager)
- Respect CSA's organization-level data isolation
- Option to disable overlay per-call (quick dismiss)

---

## Backend Changes Required

### 1. New Endpoint: Phone Lookup

Add to `backend/src/modules/crm/routes.ts`:

```typescript
// GET /contacts/lookup-by-phone
fastify.get('/contacts/lookup-by-phone', {
  preHandler: [authenticate],
}, async (request, reply) => {
  const { phone } = request.query as { phone: string };
  const user = request.user!;

  // Normalize phone number
  const normalizedPhone = normalizePhoneNumber(phone);

  // Search contacts by phone
  const result = await db.query(`
    SELECT c.*,
           comp.name as company_name,
           comp.tier as company_tier,
           comp.id as company_id
    FROM contacts c
    LEFT JOIN companies comp ON c.company_id = comp.id
    WHERE c.organization_id = $1
      AND c.deleted_at IS NULL
      AND (
        regexp_replace(c.phone, '[^0-9+]', '', 'g') LIKE '%' || $2
        OR regexp_replace(c.phone_mobile, '[^0-9+]', '', 'g') LIKE '%' || $2
      )
    LIMIT 1
  `, [user.organizationId, normalizedPhone]);

  if (result.rows.length === 0) {
    return reply.status(404).send({ error: true, message: 'Contact not found' });
  }

  const contact = result.rows[0];

  // Get recent activities
  const activities = await db.query(`
    SELECT a.*
    FROM activities a
    JOIN activity_contacts ac ON a.id = ac.activity_id
    WHERE ac.contact_id = $1
      AND a.deleted_at IS NULL
    ORDER BY a.activity_date DESC
    LIMIT 10
  `, [contact.id]);

  return {
    data: {
      contact: formatContact(contact),
      recentActivities: activities.rows.map(formatActivity)
    }
  };
});
```

### 2. New Endpoint: Bulk Contact Sync for Mobile

```typescript
// GET /contacts/mobile-sync
// Returns all contacts with phone numbers for caching
fastify.get('/contacts/mobile-sync', {
  preHandler: [authenticate],
}, async (request, reply) => {
  const { since } = request.query as { since?: string };
  const user = request.user!;

  // Get contacts modified since timestamp (or all if no timestamp)
  const contacts = await db.query(`
    SELECT c.id, c.first_name, c.last_name, c.phone, c.phone_mobile,
           c.job_title, c.company_id,
           comp.name as company_name, comp.tier as company_tier,
           c.updated_at
    FROM contacts c
    LEFT JOIN companies comp ON c.company_id = comp.id
    WHERE c.organization_id = $1
      AND c.deleted_at IS NULL
      AND (c.phone IS NOT NULL OR c.phone_mobile IS NOT NULL)
      ${since ? 'AND c.updated_at > $2' : ''}
    ORDER BY c.updated_at ASC
  `, since ? [user.organizationId, since] : [user.organizationId]);

  return {
    data: {
      contacts: contacts.rows,
      syncedAt: new Date().toISOString()
    }
  };
});
```

### 3. Phone Number Normalization Function

```typescript
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, '');

  // Handle country codes (example for Netherlands)
  // +31612345678 -> 31612345678
  // 0031612345678 -> 31612345678
  // 0612345678 -> 612345678

  if (normalized.startsWith('+')) {
    normalized = normalized.substring(1);
  }
  if (normalized.startsWith('00')) {
    normalized = normalized.substring(2);
  }
  if (normalized.startsWith('0')) {
    normalized = normalized.substring(1);
  }

  // Return last 9 digits for matching (most unique part)
  return normalized.slice(-9);
}
```

---

## Development Approach

### Technology Stack

| Component | Technology |
|-----------|------------|
| Language | Kotlin |
| Min SDK | API 26 (Android 8.0) |
| Architecture | MVVM + Clean Architecture |
| DI | Hilt |
| Database | Room + SQLCipher |
| Networking | Retrofit + OkHttp |
| Async | Kotlin Coroutines + Flow |
| UI | Jetpack Compose (settings) + XML (overlay) |

### Project Structure

```
app/
├── data/
│   ├── local/
│   │   ├── db/
│   │   │   ├── CsaDatabase.kt
│   │   │   ├── ContactDao.kt
│   │   │   └── ActivityDao.kt
│   │   └── preferences/
│   │       └── SecurePreferences.kt
│   ├── remote/
│   │   ├── api/
│   │   │   └── CsaApiService.kt
│   │   └── dto/
│   │       └── ContactDto.kt
│   └── repository/
│       └── ContactRepository.kt
├── domain/
│   ├── model/
│   │   ├── Contact.kt
│   │   └── Activity.kt
│   └── usecase/
│       ├── LookupContactUseCase.kt
│       └── SyncContactsUseCase.kt
├── presentation/
│   ├── login/
│   ├── settings/
│   ├── logcall/
│   │   ├── LogCallActivity.kt
│   │   └── LogCallViewModel.kt
│   └── overlay/
│       ├── OverlayManager.kt
│       └── CallerInfoView.kt
└── service/
    ├── CallDetectionService.kt
    ├── CallReceiver.kt
    └── SyncWorker.kt
```

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Network Mode** | Offline-first | Cache all contacts locally, sync every 15 min. Fast lookups, works without network. |
| **Quick Actions** | Yes, Log Call button | Overlay includes "Log Call" button to quickly record call outcome/notes after call ends. |
| **Platform** | Android only | Focus on Android first, iOS can be added later if needed. |
| **Server URL** | Fixed server only | App works with main CSA hosted instance only (no self-hosted configuration). |

## Remaining Questions (Lower Priority)

1. **Multiple Organizations:** Should users be able to switch between organizations if they belong to multiple?

2. **Team Data Access:** Should managers see their team's contacts, or only their own?

3. **Call History Integration:** Should the app also enhance the native call history with CSA contact info?

4. **Push Notifications:** Should the backend push contact updates to the app, or rely on periodic polling?

---

## Estimated Effort

| Phase | Description |
|-------|-------------|
| 1 | Backend API endpoints (phone lookup, mobile sync) |
| 2 | Android app foundation (auth, Room DB, API client) |
| 3 | Call detection service + overlay |
| 4 | Contact sync + caching |
| 5 | Settings UI + polish |
| 6 | Testing + Play Store submission |

---

## References

- [Android Telephony Documentation](https://developer.android.com/reference/android/telephony/TelephonyManager)
- [System Alert Window Permission](https://developer.android.com/reference/android/Manifest.permission#SYSTEM_ALERT_WINDOW)
- [Room Persistence Library](https://developer.android.com/training/data-storage/room)
- [WorkManager for Background Sync](https://developer.android.com/topic/libraries/architecture/workmanager)
