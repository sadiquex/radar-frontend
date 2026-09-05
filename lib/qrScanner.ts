/**
 * Reading a QR code off the camera.
 *
 * Chrome exposes a native BarcodeDetector, which is fast and free. Safari does
 * not, so jsQR is loaded on demand as a fallback rather than shipped to every
 * visitor — most people will never open the scanner.
 */

export type CameraFailure = "denied" | "unavailable" | "failed";

export interface Scanner {
  stop(): void;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

// A decode attempt several times a second is plenty and leaves the phone's
// battery alone; requestAnimationFrame would run this at 60fps for no gain.
const DECODE_INTERVAL_MS = 180;

export function cameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/** Which of the three messages the user should get. */
export function classifyCameraError(err: unknown): CameraFailure {
  const name =
    typeof err === "object" && err !== null && "name" in err
      ? String((err as { name: unknown }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    // The camera exists but something else is holding it — common right after
    // a video call.
    case "NotReadableError":
    case "TrackStartError":
      return "unavailable";
    default:
      return "failed";
  }
}

async function makeDetector(): Promise<(source: HTMLVideoElement) => Promise<string | null>> {
  const Native = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector;

  if (Native !== undefined) {
    const detector = new Native({ formats: ["qr_code"] });
    return async (video) => {
      const found = await detector.detect(video);
      return found[0]?.rawValue ?? null;
    };
  }

  // Safari and anything older: decode in JS, loaded only now.
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (ctx === null || video.videoWidth === 0) return null;
    // Downscale: a QR fills a good part of the frame, and decoding a 1080p
    // image several times a second is wasteful on a phone.
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(data, width, height)?.data ?? null;
  };
}

/**
 * Opens the rear camera and calls `onCode` with the first thing it decodes.
 * Always call `stop()` — an un-stopped stream leaves the camera light on.
 */
export async function startScanner(opts: {
  video: HTMLVideoElement;
  onCode: (text: string) => void;
  onError: (failure: CameraFailure) => void;
}): Promise<Scanner> {
  let stopped = false;
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    // Detaching matters on iOS, which otherwise keeps the indicator lit.
    opts.video.srcObject = null;
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    // The caller may have closed the scanner while we were waiting for
    // permission; without this the stream leaks and the camera stays on.
    if (stopped) {
      for (const track of stream.getTracks()) track.stop();
      return { stop };
    }

    opts.video.srcObject = stream;
    opts.video.muted = true;
    // Required on iOS, or the video takes over the whole screen.
    opts.video.playsInline = true;
    await opts.video.play();

    const decode = await makeDetector();

    const tick = async () => {
      if (stopped) return;
      try {
        const text = await decode(opts.video);
        if (stopped) return;
        if (text !== null && text.length > 0) {
          opts.onCode(text);
          return; // The caller decides what happens next, including stopping.
        }
      } catch {
        // A single failed frame means nothing — the next one is 180ms away.
      }
      timer = setTimeout(() => void tick(), DECODE_INTERVAL_MS);
    };
    void tick();
  } catch (err) {
    stop();
    opts.onError(classifyCameraError(err));
  }

  return { stop };
}
