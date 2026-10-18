// Turns an activity-log row into a short sentence. The log keeps what kind of
// change it was and the names of the fields that changed, never their values,
// so the words come from those alone.

// The words for each field a change can name.
const FIELD_WORDS: Partial<Record<string, string>> = {
  title: "title",
  description: "description",
  status: "status",
  visibility: "sharing",
  shareLink: "sharing",
  startsAt: "time",
  endsAt: "end time",
  place: "place",
  geo: "map pin",
  blocks: "notes & photos",
  transport: "transport",
  stops: "stops",
  labels: "labels",
  people: "who was there",
};

// An experience's own dates read as "dates"; a moment's start is its "time".
const wordFor = (entity: string, field: string): string => {
  if (entity === "event" && (field === "startsAt" || field === "endsAt")) return "dates";
  return FIELD_WORDS[field] ?? field;
};

// The changed fields in words: each once, in the order they were recorded. A
// place comes with its map pin, so the pin is not named again.
const fieldWords = (entity: string, fields: string[]): string => {
  const words = new Set(fields.map((f) => wordFor(entity, f)));
  if (fields.includes("place")) words.delete("map pin");
  return [...words].join(", ");
};

const onlyField = (fields: string[], field: string) =>
  fields.length > 0 && fields.every((f) => f === field);

export const describeChange = (c: { entity: string; action: string; fields: string[] }): string => {
  const { entity, action, fields } = c;
  const edited = (what: string) => {
    const words = fieldWords(entity, fields);
    return words === "" ? `Edited ${what}` : `Edited ${what}: ${words}`;
  };

  switch (`${entity}.${action}`) {
    case "moment.create":
      return "Added a moment";
    case "page.create":
      return "Added a page";
    case "guestNote.create":
      return "Left a note in the guestbook";
    case "moment.update":
      return edited("a moment");
    case "moment.delete":
      return "Deleted a moment";
    case "event.create":
      return "Created the experience";
    case "event.update":
      // Sharing is switched on and off, and the link renewed, on their own.
      if (onlyField(fields, "visibility")) return "Changed the sharing settings";
      if (onlyField(fields, "shareLink")) return "Made a new share link";
      if (onlyField(fields, "sharedPdf")) return "Changed the locked PDF on the share link";
      if (onlyField(fields, "shareRedacted")) return "Changed whether the share link shows photos";
      if (onlyField(fields, "shareEmail")) return "Emailed the share link";
      return edited("the experience");
    case "media.create":
      return "Uploaded a photo or video";
    case "media.update":
      return "Finished uploading a photo or video";
    case "session.accept":
      return "Joined the experience";
    case "session.revoke":
      return "Removed someone's access";
    case "session.update":
      return "Changed what someone can do";
    case "invite.create":
      return "Invited someone";
    case "invite.dismiss":
      return "Removed an invite";
    case "quota.create":
      return "Asked for more moments";
    case "quota.update":
      // An answer to a request sets its status; the owner's own change sets only the limit.
      if (fields.includes("status")) {
        return fields.includes("momentLimit")
          ? "Approved a request for more moments"
          : "Declined a request for more moments";
      }
      if (fields.includes("momentLimit")) return "Changed the moment limit";
      break;
  }

  // Anything the log does not describe yet still reads as a sentence.
  const phrase = `${action} ${entity}`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
};
