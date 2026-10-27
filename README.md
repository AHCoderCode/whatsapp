# WhatsApp-style frontend demo

A responsive, installable PWA that recreates a WhatsApp-inspired interface using static HTML, CSS and JavaScript.

## What's included

- Local sign-up and log-in using a username, password and unique custom in-app number.
- Automatic username lookup when a known custom number is typed.
- Chats with demo messages, working local message composition, search, unread/favorites/groups filters, archive, pin, mute, star and context menus.
- Group creation, participant management and group information.
- Incoming/outgoing contact requests with Accept, Decline and Cancel actions.
- Profile editing, local profile photo, settings pages, theme and wallpaper controls.
- Visual preview sections for Updates, Communities, Channels, Calls, Starred, Archived and Locked chats.
- PWA manifest and offline app-shell caching.

## Run and deploy

No build step or package installation is required. Serve the repository root as a static site or deploy it to Vercel.

## Demo-only boundary

This version deliberately has NO backend. Account details, passwords, messages, contact requests and settings are saved in the current browser's local storage. The custom +990 number is only a local application identifier; it is not a real telephone number and cannot receive SMS or calls. Data is not shared across devices or users. Do not use real passwords or private conversations in this prototype.

The project is a WhatsApp-inspired frontend recreation, not an official WhatsApp client, and does not connect to WhatsApp services.
