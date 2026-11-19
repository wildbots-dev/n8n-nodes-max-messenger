# Changelog

## 0.1.0

First release.

- **MAX** node:
  - Message: Send, Edit, Delete, Get, Get Many, Answer Callback.
  - Chat: Get, Update, Send Action, Pin, Unpin, Get Pinned, Get Members, Get Administrators, Get Bot Membership, Remove Member, Leave.
  - Bot: Get Info, Set Commands. Video: Get.
  - Attachments from binary fields (uploaded automatically), image URLs, tokens, stickers and locations; inline keyboards built in the UI or from JSON; long text split into several messages; retries while MAX processes uploaded media and on HTTP 429.
  - Usable as an AI Agent tool.
- **MAX Trigger** node: webhook registered and removed automatically, secret header verified, other webhooks of the bot left untouched.
- **MAX Bot API** credential: `platform-api2.max.ru` by default, legacy domain, optional "Ignore SSL Issues", connection test via `GET /me`.
