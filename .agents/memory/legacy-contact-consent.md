---
name: Legacy contact consent
description: Mutual acceptance rules for existing WhatsChat contacts.
---

Treat the old `friends` list as historical data, not proof of consent. Only contacts marked by the current request-and-accept flow should appear in the contact list; existing users must re-confirm through that flow.

**Why:** The user explicitly requested that contact consent apply to people registered before the request feature existed.

**How to apply:** Keep legacy connections non-destructively hidden until both accounts have accepted the current friend request.
