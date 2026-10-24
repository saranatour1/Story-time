# Using Story-time

This is for someone using the app, not for someone changing the code. It matches the app in the current version of the project. If the website you open is an older copy, the Journal section may not be there yet.

The shape of it is simple. You put in photos, or one sentence. You get a book of pages, and a film you can play.

## Sign in

On the sign-in screen, use **Continue with Google** or **Continue with GitHub**. There is no password in the app. Story-time does not copy your name or email from Google or GitHub. What you later type under Settings is what the app stores.

**Continue anonymously (dev only)** is for a private test copy. It should not appear on the real site, and the switch that allows it (`ALLOW_ANONYMOUS_SIGNIN`) should be left unset there.

## Start an experience

On the home page, choose **Start an experience** or **New experience**. You can own up to 20. **Grid** shows each experience as a card; **Calendar** puts them on a month calendar across their dates. An experience with no dates is only in Grid.

Give it a name. **Starts** is optional. The name is the title people see. It is not locked away the way a note is. See the encryption section below.

Down the side of an experience:

- **Moments** is a photo grid of the moments, with the box where you add things. Beside it are **Play story**, **Add photos**, **More** and an **Overview** of the experience (**Settings** there changes its name, description and dates) and **People**, who is on the trip, with a link to **Shared**.
- **Journal** is the book.
- **Shared** and **Activity** are only for the owner. Activity is a log of what changed. It does not send a message to anyone.

## Add moments

The box on Moments says **What happened, or what should change?**

**Photos and videos.** Use **Attach photos or videos**, or drop them on the box. They become moments on their own, grouped by when and where they were taken. Words you typed with them become the first moment's note; nothing else is written for you. You do not get a plan to approve. A photo can be up to 20 MB (JPEG, PNG, WebP, GIF, or AVIF); a bigger one is made smaller on your device to fit. A video can be up to 50 MB (MP4, WebM, or QuickTime). One experience holds up to 150 photos and 5 videos, and one person holds up to 1 GB of live uploads.

**A sentence about something new.** Press **Go**. If the sentence is something that happened, rather than a change to a moment you already have, it is saved straight away and you see **Moment added**. That moment gets a journal page on its own.

**A change or a removal.** The box shows **Proposed changes**. Read every line. Then choose **Apply**, or **Apply and delete** when something would be removed. **Cancel** or Escape drops the plan. You can also press Ctrl+Enter or ⌘Enter. Nothing is written until you do that. If you would rather keep the words as a new moment, choose **Add as a moment**.

The box can change at most 8 things in one request, and the sentence can be at most 600 characters. About 60 of these requests an hour is the limit. If it cannot read the sentence, the words stay in the box and you can send them again or use **Add as a moment**.

**Voice.** The microphone is **Record a message**. Speak for under a minute, then stop. The app types what you said into the box. It does not save a moment until you send the box the usual way. About 40 recordings an hour.

**Search** on the list is **Search places, notes, people…** If the trip is empty, the page says **Add photos, or say what happened in the box above.**

You can only change or delete moments you added, unless you are the owner.

## The journal

Open **Journal** in the sidebar. The first page is the cover. After that, each moment gets a page when it is saved, laid out like a scrapbook: a title, the date, the photos, the note.

**Make** is for editing. **Read** turns the pages like a book. Owners start in Make. Everyone else gets Read.

On a wide screen the left side is **Pages**, grouped by day, such as Wed 3 Jun. The open page and the ones next to it are drawn small. The rest are a short label. On a phone that strip is hidden. Use **The page before** and **The page after**.

While you are in Make you can move, resize, and turn things, draw, and add paper, tickets, and links (**Paste a link**, then **Add the link**). Right-click a thing for write, style, cut, copy, paste, and **Lock it in place**.

**Lock** in the top bar locks the whole journal, so nothing moves. The button then reads **Locked**. Choose it again to unlock. The hint is **Lock the whole journal, so nothing moves**. A single page has **Lock this page**. A locked journal or a locked page refuses edits until you unlock it. The message is **This journal is locked. Unlock it to change it.**

Stickers are cut on your own device. **Cut out a sticker**, tap the thing you want to keep, or move the point with the arrow keys and press Enter. The first time, the scissors are a large download, about 13 MB. The photo stays on this device until you keep the sticker. A sticker nobody has placed can leave the shelf with **Take this sticker off the shelf**.

**Export** prints or saves:

- **This page as a PDF**
- **This day as a PDF**
- **The whole journal as a PDF**. Past 36 pages the menu adds **a long one**.
- **This page as a picture**
- **Save a journal file**, and, if you can edit, **Add pages from a journal file**

While it prints, the button counts **Printing 1/3…** and so on. Maps in a print are place names, not a live map.

**Save a journal file** downloads a file you can read on your computer. It is not a locked box. Treat it like a copy of the book.

If you have not saved the page yourself, opening the book brings the prints and the note up to date when the moment changes. After you have saved the page, it says **The moment changed.** and offers **Update this page**. That rebuilds the layout's own pieces and leaves a drawing, a sticker, or a title you added. If the moment was deleted, the page says **This moment was taken out of the trip.** and still offers **Take this page out**. A photo that can no longer be shown reads **This photo was removed**.

A note that was shortened on the page offers **Read the moment**, which opens the full words.

A trip that already had moments before pages were cut automatically gets those pages the next time a moment is added, or when a locked journal is unlocked. Until then the list can show a moment with no page.

## Sharing and invites

**Shared** is the owner's page. It has two cards.

**Share a link.** The switch is **Anyone with the link can watch**. The card says they can watch without an account, and that they see the moments and photos, not who added them. That includes the pictures. Copy the link. **Switch it off and the link stops working.** **Make a new link** retires the old one immediately. The toast is **Link on: anyone with it can watch**, **Link off: the old link no longer opens**, or **New link ready**.

The secret part of a share link sits after `#` in the address. Send the whole address. A link that is only the part before `#` does not open the trip.

**Invite someone.** An invite works once, for the first person who opens it. **Can watch** lets them read. **Can add moments** lets them add their own. **Email them (optional)** sends the invite if email is set up on the server. The address is used to send and is not stored. If email is not set up, you still get a link and the toast says **Invite link ready: copy it below**. When a message is sent, the toast says **Invite emailed**. The link is shown only then. You can email up to 10 invites a day. An experience can have 20 invites waiting.

An archived experience cannot turn on a new share link, and it takes no new people.

## Play

On Moments, picking a moment you can change opens it to edit. Picking anyone else's opens Play at that moment: the journal on its page, or the story you scroll if it has no page. **Play** on the book starts the film at that moment. Closing the film brings you back to the book.

A share link opens on the book as well. **Play** there starts the film. Closing it returns to the book.

## Limits, in one place

| What                                        | Limit                                       |
| ------------------------------------------- | ------------------------------------------- |
| Experiences you own                         | 10                                          |
| Moments in one experience                   | 100                                         |
| Photos in one experience                    | 150 (journal stickers don't count)          |
| Videos in one experience                    | 5                                           |
| Live uploads for one person                 | 1 GB                                        |
| One photo                                   | 20 MB (a bigger one is made smaller to fit) |
| One video                                   | 50 MB                                       |
| Stops in one moment                         | 10, counting the moment itself              |
| Things on one moment (photos, notes, links) | 20                                          |
| Labels on one moment                        | 10, 40 characters each                      |
| One note                                    | 5,000 characters                            |
| Journal pages                               | 150                                         |
| AI (the box and voice)                      | 10 uses a day, shared, back at midnight UTC |
| One sentence in the box                     | 600 characters, 8 changes                   |
| A voice recording                           | 1 minute                                    |
| Waiting invites                             | 20 per experience, 10 invite emails a day   |
| Emailing a share link                       | 10 a day                                    |

When the book is already at 150 pages, a new moment does not get a page. The moments list says so on that row.

## Tips

- Add the photos first, then look at **Journal**. The page is cut when the moment is saved. You do not have to build it by hand.
- Read **Proposed changes** before **Apply**. A removal is only offered when the sentence asked for one.
- The box is part of this website. There is no separate assistant to connect.
- Turn on **Share a link** only when you are happy for anyone holding it to see the photos. Details are in the next part.
- Use **Lock** before you hand someone the keyboard, if you do not want the pages moved.
- **Can watch** is enough for a guest who should not add moments. **Can add moments** is for someone who was there.
- **Activity** is where you look afterward. It will not tap you on the shoulder.

# Image encryption

Two locks are in use. They are not the same lock, and neither one hides a photo from a person you gave the share link to.

## The photo files

Photos and videos sit in a private bucket named `story-time-media` (Cloudflare R2). Each object is stored with a customer-supplied key, often called SSE-C. The browser never receives that key, and the page never holds an R2 web address.

When the app shows a picture, the browser asks this website for `GET /api/media/…`, with your sign-in token (`Authorization: Bearer …`) or, on a share link, `Authorization: Share …`. The site decides whether that caller may see it. Only then does it derive the key and read the object.

The derivation is `ssecKeyFor` in `src/server/r2.ts`. It uses the master secret `ENCRYPTION_MASTER_KEY`, the HKDF salt `storytime/r2`, and a label made of a scope plus a version. For a trip photo the scope is the experience id. For a profile image it is `avatar:` plus the person id. A different salt from the one used for notes means a photo key and a note key are not the same key, even though they start from the same secret.

Profile images, stickers, and moment photos all go through this. A share link can fetch a moment's photo. It can fetch a sticker only when a page of that same experience actually shows it. It cannot fetch a loose upload, or another trip's photo.

## The words

Notes, place names, map coordinates, labels, link addresses, and the words on a journal page (titles, captions, the text of a link card) are encrypted in the database with AES-GCM. The function is `encryptText` in `convex/lib/crypto.ts`. The key is derived from the same master secret, with the salt `storytime/event` and a label of the experience id plus a version (`events.keyVersion`). Nothing in the database stores that per-experience key itself.

Someone who can open the trip receives the words already decrypted. That is the query doing its job. Looking at the network panel and seeing a note in plain text does not mean the database stored it in plain text.

A few fields are still plain text on purpose, or because they are older:

- The experience title, the times, how you travelled (walk, train, plane, and the rest), page size and position, and the id of a photo.
- The experience description on rows saved before encryption. Newer descriptions are encrypted. Older ones stay readable as plain text until a one-off migration has been run on that deployment (`migrations.encryptPlainText`). The database still allows either form.

**Save a journal file** writes the decrypted book to your computer.

## What a share link does not hide

Anyone with the share link can see the photos. The app says so on **Share a link**: they see the moments and photos. The server decrypts the page for that token and then sends the image bytes. In the browser the picture is a `blob:` address created from those bytes. Inspect element shows that address, and the network panel shows the image response. There is no blur step, and there is no mode that withholds the bytes.

A link card on a page can also show a picture from the other website. That address is encrypted while it sits in the database. Once the page is opened, including with a share link, the page includes the `https://` address and the browser loads it directly. That other site sees the request.

Coordinates sent to a public map router, and place search, leave the browser as approximate locations. They are not the photo files. They are also not encrypted in transit beyond what the browser already does for an `https` site.

## Check it yourself

Do this with a trip you own, and a photo you just added. Seeing the photo in the app means the site has the key. It does not, by itself, prove the bucket refuses a download.

**In the browser, while signed in**

1. Open Moments, add a short note and one photo.
2. Open developer tools, then the Network panel. Reload the page.
3. Find the request to `/api/media/` followed by an id. It should be a request to your Story-time site, not to a public `r2.dev` or `amazonaws.com` address. The response is the picture. The cache header is `private, no-store`. The status is 200.
4. You should not see the master secret, or an `x-amz-server-side-encryption-customer-key` header, in any request the browser sends. The key stays on the server.
5. The note in the data the page loads is readable. That is expected. The database check below is the one that speaks to storage.

**In a private window, with only the share link**

1. On **Shared**, turn on **Anyone with the link can watch**, copy the link, and open it in a private window where you are not signed in.
2. The book should show the photo. In Network, `/api/media/…` is sent with `Authorization: Share …` and the response is the image. On the page, the picture's address starts with `blob:`.
3. That is the current behaviour. A successful image response here means the share link is doing what it was built to do. It is not a failure of the R2 key. If you need a link that shows no photos at all, that does not exist yet.

**In the database, for the words**

1. In the Convex dashboard, open the `moments` table and the row you just wrote.
2. `place`, `geo`, and the text inside a note block should look like `iv`, `ct`, and `v`, not like the sentence you typed and not like `38.7223` if you pinned a map.
3. Open `journalPages` for the same trip. A title or note on the page is the same kind of `iv` / `ct` value, not the sentence.
4. The experience `title` is still the name you chose. That one is not encrypted.

**In R2, for the file**

1. In the Cloudflare dashboard, open the R2 bucket `story-time-media`.
2. Find an object whose name starts with `events/` and then the experience id. That is a photo or video.
3. Download it the ordinary way, without supplying a customer encryption key.
4. The download should fail, or the file you receive should not open as a photo. SSE-C objects are not readable without that key. If a normal download opens as a picture, that object was stored without the customer key, and the setup below is wrong for it.
5. Do not paste the master secret into the dashboard, a ticket, or a chat to "try the key". The app is what is supposed to use it.

## What the owner of the deployment must confirm

The same `ENCRYPTION_MASTER_KEY` has to be set in both places:

- The Convex deployment (development, and production when you deploy).
- The Worker, as a secret. Locally it lives in `.dev.vars`, which is not committed. `.dev.vars.example` only lists the name. The README's deploy steps call the Worker secret the same value Convex has.

It is a base64 string of 32 random bytes. Generating a second, different value and putting it in only one of the two places makes pictures fail to open, or notes fail to read, depending on which copy is wrong. After you change it, old photos stay locked under the old value. Rotation is not a matter of replacing the secret and expecting yesterday's pictures to appear.

Also confirm:

- `ALLOW_ANONYMOUS_SIGNIN` is unset on the production Convex deployment.
- The R2 bucket in `wrangler.jsonc` is `story-time-media`, bound as `MEDIA`.
- Invite email is separate. `CF_ACCOUNT_ID`, `CF_EMAIL_TOKEN`, and `EMAIL_FROM` are optional. They do not encrypt photos. Without them, **Create invite** still gives you a link.

A photo that opens inside Story-time, and that refuses a plain download from R2, is the pair of checks that belong together.

## What the tests already cover

These tests run in the project. They do not talk to a real R2 bucket, and they do not prove a live deployment has the secret set.

- `convex/tests/moment-actions.test.ts`, **"each stop's coordinates round-trip, encrypted at rest and in the log"**. The signed-in query returns the real coordinates. The stored moment and the change log hold `iv` and `ct`, and the raw numbers do not appear in either.
- `convex/tests/share.test.ts`, **"a picture comes through a link only from a moment of that experience"**. A share token can read that photo's record, and cannot read another trip's photo or a photo with no moment.
- `convex/tests/share.test.ts`, **"a sticker is readable through a link only when a page of that experience shows it"**. A sticker on a page of this trip is allowed. A sticker that is only on the shelf, or on another trip, is not.
- `convex/tests/share.test.ts`, **"a link opens the book, one page at a time, and not another experience's page"** and **"malformed and unknown tokens read the same: no story"**. A bad token gets nothing. A good token gets the decrypted page, which is the opposite of hiding the book.

No test downloads an R2 object with and without the SSE-C key. That check is the manual one in the bucket. No test asserts that a journal page's stored text is ciphertext. Journal words use `encryptText`, the same function as notes. The coordinates test is the one that looks at the stored document.
