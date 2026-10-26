---
name: Mobile chat keyboard layout
description: Keep the chat header visible while a mobile keyboard changes the visual viewport.
---

For mobile chat, do not rely only on `100dvh` or a flex header being a sibling of the messages scroller. Track `window.visualViewport` resize/scroll changes to size and position the app shell, anchor the header within that shell, and scroll only the messages pane.

**Why:** On mobile, focusing a composer can resize or pan the visual viewport independently from the document layout viewport. Page-level scrolling and `scrollIntoView()` can move the header offscreen even when the message list has its own overflow.

**How to apply:** Check the chat with the software keyboard open on a real mobile browser or a keyboard-aware test. Keep `scrollTo()` scoped to the messages container and ensure only that container has vertical overflow.
