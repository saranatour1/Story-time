import { describe, expect, test } from "vitest";
import { describeChange } from "./change-text";

const change = (entity: string, action: string, fields: string[] = []) =>
  describeChange({ entity, action, fields });

// The combinations the backend records, with the fields each one names.
describe("moments", () => {
  test("added and deleted", () => {
    expect(
      change("moment", "create", [
        "startsAt",
        "place",
        "geo",
        "blocks",
        "transport",
        "stops",
        "labels",
      ]),
    ).toBe("Added a moment");
    expect(change("moment", "delete")).toBe("Deleted a moment");
  });

  test("an edit names what changed, in words", () => {
    expect(change("moment", "update", ["place", "geo", "blocks"])).toBe(
      "Edited a moment: place, notes & photos",
    );
    expect(change("moment", "update", ["startsAt", "transport", "labels"])).toBe(
      "Edited a moment: time, transport, labels",
    );
  });

  test("a map pin that comes with its place is not named again", () => {
    expect(change("moment", "update", ["place", "geo"])).toBe("Edited a moment: place");
    expect(change("moment", "update", ["geo"])).toBe("Edited a moment: map pin");
  });

  test("an edit that names no field only says it was edited", () => {
    expect(change("moment", "update")).toBe("Edited a moment");
  });
});

describe("the experience", () => {
  test("created", () => {
    expect(change("event", "create", ["title", "status", "visibility", "region"])).toBe(
      "Created the experience",
    );
  });

  test("edited, with its dates read as dates", () => {
    expect(change("event", "update", ["title", "startsAt", "endsAt"])).toBe(
      "Edited the experience: title, dates",
    );
    expect(change("event", "update", ["title", "description", "status"])).toBe(
      "Edited the experience: title, description, status",
    );
  });

  test("sharing gets its own phrases, and is named once when mixed in", () => {
    expect(change("event", "update", ["visibility"])).toBe("Changed the sharing settings");
    expect(change("event", "update", ["shareRedacted"])).toBe(
      "Changed whether the share link shows photos",
    );
    expect(change("event", "update", ["shareEmail"])).toBe("Emailed the share link");
    expect(change("event", "update", ["shareLink"])).toBe("Made a new share link");
    expect(change("event", "update", ["title", "visibility", "shareLink"])).toBe(
      "Edited the experience: title, sharing",
    );
  });
});

describe("photos and videos", () => {
  test("uploaded, and finished uploading", () => {
    expect(change("media", "create", ["size", "mime", "status"])).toBe("Uploaded a photo or video");
    expect(change("media", "update", ["status"])).toBe("Finished uploading a photo or video");
  });
});

describe("people and invites", () => {
  test("joining and losing access", () => {
    expect(change("session", "accept", ["role"])).toBe("Joined the experience");
    expect(change("session", "revoke", ["revokedAt"])).toBe("Removed someone's access");
    expect(change("session", "update", ["role"])).toBe("Changed what someone can do");
  });

  test("invites sent and removed", () => {
    expect(change("invite", "create", ["role", "expiresAt"])).toBe("Invited someone");
    expect(change("invite", "dismiss")).toBe("Removed an invite");
  });
});

describe("more moments", () => {
  test("asked for, approved and declined", () => {
    expect(change("quota", "create", ["extra", "reason", "status"])).toBe("Asked for more moments");
    expect(change("quota", "update", ["status", "momentLimit"])).toBe(
      "Approved a request for more moments",
    );
    expect(change("quota", "update", ["status"])).toBe("Declined a request for more moments");
  });

  test("the owner setting the limit directly", () => {
    expect(change("quota", "update", ["momentLimit"])).toBe("Changed the moment limit");
  });
});

describe("pages and guestbook notes", () => {
  test("read as their own sentences", () => {
    expect(change("page", "create", ["order"])).toBe("Added a page");
    expect(change("guestNote", "create", ["text"])).toBe("Left a note in the guestbook");
  });
});

describe("anything else", () => {
  test("falls back to the action and the entity, capitalised", () => {
    expect(change("invite", "expire")).toBe("Expire invite");
    expect(change("user", "update", ["displayName"])).toBe("Update user");
  });
});
