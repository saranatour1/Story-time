import { createFileRoute } from "@tanstack/react-router";
import { SettingsBlock, SettingsPage } from "@/components/settings/section";

const DataSettings = () => {
  return (
    <SettingsPage title="Data & privacy" description="What we keep, and what leaves your browser to make the app work.">
      <div className="space-y-10">
        <SettingsBlock title="What we store">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>What you add: profile fields, moments, notes, links, photos and videos.</li>
            <li>Place, notes and links are encrypted before they are saved.</li>
            <li>Photos are encrypted in storage and visible only to people you share with — or to anyone holding a link you switched on.</li>
            <li>JPEG photos lose the details the camera saved in them, like where they were taken, when they're added. Other photos and videos keep theirs.</li>
            <li>
              When you add photos, small copies of up to four photos from each moment go through Convex's AI gateway to
              Anthropic to draft the first note and labels, along with any words you typed about them; the copies aren't kept.
            </li>
            <li>
              When you type in the box above the moments, your words go through the same gateway. TypeSafe's Jev model
              reads them to tell a new moment from a change or a removal. For a change, Anthropic's Haiku model also gets
              your experience's title and each moment's time, place, labels and the start of its first note. Working out how
              you travelled between two stops sends their places and times to Jev. Nothing is kept.
            </li>
            <li>
              When you speak into the box, the recording goes through the same gateway to a speech-to-text model
              (Whisper) and comes back as text you can fix before sending. The recording isn't kept.
            </li>
            <li>
              Place search and the names of photo locations use OpenStreetMap data from photon.komoot.io; your typed text
              or the photo's coordinates are sent to it.
            </li>
            <li>
              When a story goes by foot, bike, car, bus or train, its map draws the leg along real streets and tracks.
              Whoever is watching, a shared link included, asks OpenStreetMap's public routers for it and sends only the
              two stops' coordinates, rounded to about 100 m; nothing is stored. If they can't be reached, the leg is a curve.
            </li>
            <li>
              Stickers you cut out of photos for a journal are cut on your device by Google's MediaPipe model, which the
              page downloads from storage.googleapis.com the first time. The photo isn't sent anywhere to be cut; the
              finished sticker is saved like any other photo, and everyone who can see the journal can see it.
            </li>
            <li>
              A link you put on a journal page is opened once by Story-time's server to read its title, a line about it and
              its picture. That picture then loads straight from the linked site for whoever reads the page, a shared link
              included, so that site sees their visit. Pictures you add from your device are saved like any other photo.
            </li>
            <li>
              A locked PDF of a journal is printed and locked in your browser with the PDF standard's AES-256 encryption, then
              stored encrypted like a photo. Anyone with the share link can download it, and it opens only with its password.
              The password is kept encrypted so its owner can copy it again; the link never gives it out.
            </li>
            <li>A journal's words (titles, notes, tickets, drawings, links) are encrypted like notes. Its layout isn't.</li>
            <li>
              From your GitHub or Google account, only an email address the provider says is verified is copied, as the
              address replies and reminders go to. Your name and picture are not. An address you type in Settings is used
              only after you open the link sent to it.
            </li>
            <li>
              If you turn on the memory reminder, its email says only that a memory is waiting, with a link: no words or
              photos from the trip. Emailing a share link hands the address to the email service; it isn't kept here.
            </li>
          </ul>
        </SettingsBlock>
      </div>
    </SettingsPage>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/settings/data")({ component: DataSettings });
