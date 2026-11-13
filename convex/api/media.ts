import { mediaApi } from "../model/media";

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
