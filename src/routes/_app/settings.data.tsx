import { createFileRoute } from "@tanstack/react-router";
import { SettingsBlock, SettingsPage } from "@/components/settings/section";

const DataSettings = () => {
  return (
    <SettingsPage
      title="Data & privacy"
      description="What we keep, and what leaves your browser to make the app work."
    >
      <div className="space-y-10">
        <SettingsBlock title="What we store">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>What you add: profile fields, moments, notes, links, photos and videos.</li>
            <li>Place, notes and links are encrypted before they are saved.</li>
            <li>
              Photos are encrypted in storage and visible only to people you share with — or to
              anyone holding a link you switched on.
            </li>
            <li>
              JPEG photos lose the details the camera saved in them, like where they were taken,
              when they're added. Other photos and videos keep theirs.
            </li>
            <li>
              When you add photos, small copies of up to four photos from each moment go through
              Convex's AI gateway to Anthropic to draft the first note and labels, along with any
              words you typed about them; the copies aren't kept. Every AI request except voice goes
              only to zero-data-retention endpoints, where the provider keeps nothing it's sent. For
              each request Story-time keeps a usage record (which model, which feature, your account
              id, tokens, cost), never what was sent or written back.
            </li>
            <li>
              When you type in the box above the moments, your words go through the same gateway.
              TypeSafe's Jev model reads them to tell a new moment from a change or a removal. For a
              change, Anthropic's Haiku model also gets your experience's title and each moment's
              time, place, labels and the start of its first note. Working out how you travelled
              between two stops sends their places and times to Jev. Nothing is kept.
            </li>
            <li>
              When you speak into the box, the recording goes through the same gateway to a
              speech-to-text model (Whisper) and comes back as text you can fix before sending.
              Story-time doesn't keep the recording. Unlike the models above, the gateway can't yet
              ask Whisper's provider for a zero-data-retention endpoint.
            </li>
            <li>
              Place search and the names of photo locations use OpenStreetMap data from
              photon.komoot.io; your typed text or the photo's coordinates are sent to it.
            </li>
            <li>
              When a story goes by foot, bike, car, bus or train, its map draws the leg along real
              streets and tracks. Whoever is watching, a shared link included, asks OpenStreetMap's
              public routers for it and sends only the two stops' coordinates, rounded to about 100
              m; nothing is stored. If they can't be reached, the leg is a curve.
            </li>
            <li>
              From your GitHub or Google account we copy your name, the address of your profile
              picture, and an email address only if the provider says it is verified, as the address
              replies and reminders go to. The picture stays with GitHub or Google and loads from
              there until you upload your own. An address you type in Settings is used only after
              you open the link sent to it.
            </li>
            <li>
              If you turn on the memory reminder, its email says only that a memory is waiting, with
              a link: no words or photos from the trip. Emailing a share link hands the address to
              the email service; it isn't kept here.
            </li>
            <li>
              Databuddy counts visits, page speed and errors on the live site, without cookies. It
              gets the page's address with trip ids, invite codes and share-link names blanked out,
              never the part of a share link after the #, and nothing you wrote. It isn't told who
              you are. It counts a few buttons by a fixed name (sign in, add photos, play, share,
              export, guestbook), never by what they say, and whether each AI request worked, hit
              the day's limit or failed, never what you asked.
            </li>
          </ul>
        </SettingsBlock>
      </div>
    </SettingsPage>
  );
};

export const Route = createFileRoute("/_app/settings/data")({ component: DataSettings });
