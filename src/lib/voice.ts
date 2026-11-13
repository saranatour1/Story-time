const PREFERRED = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
] as const;

export type VoiceFormat = "webm" | "ogg" | "m4a";

export const formatOfMime = (mime: string): VoiceFormat | undefined => {
  const type = mime.toLowerCase().split(";")[0]?.trim();
  if (type === "audio/webm") return "webm";
  if (type === "audio/ogg") return "ogg";
  if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/aac") return "m4a";
  return undefined;
};

export const canRecord = (): boolean => {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
};

export const pickMime = (): string | undefined => {
  return PREFERRED.find((type) => MediaRecorder.isTypeSupported(type));
};

export const micProblem = (error: unknown): string => {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "The microphone is blocked. Allow it for this site in your browser's settings, then try again.";
  }
  if (name === "NotFoundError") return "No microphone was found.";
  return "I couldn't start the microphone.";
};
