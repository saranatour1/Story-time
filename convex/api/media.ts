import { mediaApi } from "../model/media";

// Written in convex/model/media.ts.
export const {
  reserveUpload,
  confirmUpload,
  reserveThumb,
  attachThumb,
  getForDownload,
  reserveAvatarUpload,
  setAvatar,
  clearAvatar,
  getForDelete,
  markDeleted,
  unattached,
  listKeysForEvent,
} = mediaApi;
