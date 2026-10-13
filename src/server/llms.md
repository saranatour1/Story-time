# Story-time

> Story-time keeps the photos and notes from a trip in the order they happened, and only the people who were there can see them. Everyone adds what they caught; the app puts it in order by time and place, draws the route on a map, makes a scrapbook journal, and plays it back as a short film.

This file is for AI agents and assistants. Served at /llms.txt, and at / when a request asks for `text/markdown`.

## What people do with it

- Make an experience (a trip, a wedding weekend, a day out) and invite the people who were there. An invite works once, for one person, as a viewer or a contributor.
- Add photos from the camera roll. The browser reads each photo's time and place, removes that metadata from the file, and groups the photos into moments by day and stop.
- Type or say a sentence ("we had lunch at the market, then took the ferry") to add, change or remove moments.
- Read the trip as a journal: an A4 scrapbook with a page per moment, stickers cut from photos, and a PDF export, which can be locked with a password.
- Play it back as a film, stop by stop, with the route drawn on a map: along streets for walking, cycling, driving, buses and trains, and as an arc for flights and ferries.
- Share a read-only link that the owner can switch off at any time, and get an optional email when a past year has the same date.

## Privacy

- Private by default. Every page except the home page needs a sign-in (Google or GitHub) or a share link from the owner.
- Notes, places, labels and links are encrypted in the database, with a key per experience.
- Photos are encrypted in storage with a key per experience. Each one is served only after a check that the person asking may see it.
- The database runs in the EU (Ireland). Photos are stored with Cloudflare R2, in a bucket located in Europe.
- AI features (photo notes, the sentence box, voice, journal titles) send only what that feature needs.

## For agents

- The home page is the only public page: https://story-time.saranatour.dev/
- There is no public API. Pages under /e/, /home and /settings need the person's own sign-in. Agents should not try to reach them without it.
- A share link carries its key after the `#`. Treat one as private: don't store it, index it or pass it on.
- Search engines: index the home page only. Shared and invite pages answer with `noindex`.
- Content signals (robots.txt): search=yes, ai-input=yes, ai-train=no.

## Pages

- [Home](https://story-time.saranatour.dev/): what Story-time does, and sign-in.
- [Privacy](https://story-time.saranatour.dev/#privacy): who can see what.
