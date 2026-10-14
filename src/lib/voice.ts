// What the browser can record, and the names the server's transcriber knows.

// What the recorder is asked for, best first: Chrome, Edge and Firefox make
// webm or ogg, Safari makes mp4 (AAC).
const PREFERRED = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
] as const;

export type VoiceFormat = "webm" | "ogg" | "m4a";

// The server's name for a recorded type, or undefined for one it can't read.
export const formatOfMime = (mime: string): VoiceFormat | undefined => {
  const type = mime.toLowerCase().split(";")[0]?.trim();
  if (type === "audio/webm") return "webm";
  if (type === "audio/ogg") return "ogg";
  if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/aac") return "m4a";
  return undefined;
};

// Whether this browser can record at all: needs a microphone API and a recorder.
export const canRecord = (): boolean => {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
};

// The first type from PREFERRED this browser records, or undefined to let it choose.
export const pickMime = (): string | undefined => {
  return PREFERRED.find((type) => MediaRecorder.isTypeSupported(type));
};

// Why the microphone wasn't available, in words for the person.
export const micProblem = (error: unknown): string => {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "The microphone is blocked. Allow it for this site in your browser's settings, then try again.";
  }
  if (name === "NotFoundError") return "No microphone was found.";
  return "I couldn't start the microphone.";
};
