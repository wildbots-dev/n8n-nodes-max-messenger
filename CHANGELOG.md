# Changelog

## 0.1.1

- Credential: new default API domain **Automatic**. It uses `platform-api2.max.ru` and switches to `platform-api.max.ru` when the n8n host does not trust the Russian Trusted Root CA, so the credential works on any host without turning off certificate checks. Existing credentials keep their domain.
- MAX Trigger: removing a webhook that MAX has already dropped no longer fails, so a failed registration no longer hides its real cause behind "Subscription … is not found".

## 0.1.0

First release.

- **MAX** node:
  - Message: Send, Edit, Delete, Get, Get Many (with Return All), Answer Callback.
  - Chat: Get, Update, Send Action, Pin, Unpin, Get Pinned, Get Members, Get Administrators, Get Bot Membership, Remove Member, Leave.
  - Bot: Get Info, Set Commands. Video: Get.
  - Attachments from binary fields (uploaded automatically), image URLs, tokens, stickers and locations; inline keyboards built in the UI or from JSON; long text split into several messages; retries while MAX processes uploaded media and on HTTP 429.
  - Usable as an AI Agent tool.
- **MAX Trigger** node: webhook registered and removed automatically, secret header verified, other webhooks of the bot left untouched.
- **MAX Bot API** credential: `platform-api2.max.ru` by default, legacy domain, optional "Ignore SSL Issues", connection test via `GET /me`.
