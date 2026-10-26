---
name: WhatsChat profile-photo storage
description: User decision on profile-photo uploads and future file-size limit.
---

Profile-photo uploads are deferred until durable storage compatible with the existing MongoDB and custom sign-in setup is ready. When uploads are implemented, the maximum file size is 5 MB.

**Why:** The user chose to keep the current database and sign-in rather than migrate to an incompatible storage setup.

**How to apply:** Do not add a partial or temporary uploader before compatible storage is available; enforce the 5 MB limit when uploads are enabled.
