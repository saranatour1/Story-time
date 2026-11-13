import { useAction } from "convex/react";
import { MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  MAX_VOICE_BYTES,
  MAX_VOICE_SECONDS,
  VOICE_BITS_PER_SECOND,
} from "../../../convex/lib/limits";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { canRecord, formatOfMime, micProblem, pickMime } from "@/lib/voice";
import { trackAi } from "@/lib/analytics";

export const VoiceButton = ({
  onText,
  disabled,
  quiet = false,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
  quiet?: boolean;
}) => {
  const transcribe = useAction(api.ai.voice.transcribe);
  const [phase, setPhase] = useState<"idle" | "recording" | "sending">("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const supported = canRecord();

  const release = () => {
    window.clearInterval(timer.current);
    const rec = recorder.current;
    recorder.current = null;
    if (rec === null) return;
    rec.onstop = null;
    if (rec.state !== "inactive") rec.stop();
    rec.stream.getTracks().forEach((track) => track.stop());
  };
  useEffect(() => release, []);

  const send = async (clip: Blob, mime: string) => {
    const format = formatOfMime(mime);
    if (format === undefined) {
      toast.error("This browser recorded in a format I can't read. Type it instead.");
      return;
    }
    if (clip.size > MAX_VOICE_BYTES) {
      toast.error("That recording is too long. Keep it under a minute.");
      return;
    }
    setPhase("sending");
    try {
      onText(await trackAi("voice", transcribe({ audio: await clip.arrayBuffer(), format })));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPhase("idle");
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: VOICE_BITS_PER_SECOND,
      });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType;
        release();
        void send(new Blob(chunks, { type }), type);
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      setPhase("recording");
      timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (error) {
      release();
      toast.error(micProblem(error));
    }
  };

  useEffect(() => {
    if (phase === "recording" && seconds >= MAX_VOICE_SECONDS) recorder.current?.stop();
  }, [phase, seconds]);

  if (!supported) return null;
  const recording = phase === "recording";
  return (
    <Button
      type="button"
      size={recording ? "sm" : quiet ? "icon-sm" : "icon"}
      variant={recording ? "destructive" : quiet ? "ghost" : "outline"}
      disabled={disabled || phase === "sending"}
      aria-label={
        recording
          ? "Stop recording"
          : phase === "sending"
            ? "Turning your voice into text"
            : "Record a message"
      }
      title={recording ? "Stop recording" : "Speak instead of typing"}
      onClick={() => (recording ? recorder.current?.stop() : void start())}
    >
      {recording ? (
        <>
          <SquareIcon aria-hidden className="fill-current" /> {seconds}s
        </>
      ) : (
        <MicIcon aria-hidden className={phase === "sending" ? "animate-pulse" : undefined} />
      )}
    </Button>
  );
};
