---
name: Admin chat privacy
description: Privacy boundary for reply-enabled administrator chats sent to multiple users.
---

App notifications may allow replies, but each response is private to its sender and the admin. WhatsChat messages in Chats are one-way and cannot receive user replies.

**Why:** The user explicitly chose this visibility boundary.

**How to apply:** Keep notification replies owner-scoped and authorize them against the recipient. Do not add reply controls to WhatsChat system-message threads.
