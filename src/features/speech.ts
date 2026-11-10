import type { Block } from "../parse/types";
import { mathSpeech } from "./math";
export const spokenBlock = (b: Block) =>
  mathSpeech(
    [
      b.text,
      ...(b.figureDescription ? [b.figureDescription] : []),
      ...(b.options ?? []).map(
        (o, i) => `option ${String.fromCharCode(65 + i)}, ${o}`,
      ),
      ...(b.cells ?? []).map((r) => r.map((c) => c || "blank").join(", ")),
      ...(b.pairs ?? []),
    ].join(". "),
  );
export interface PlayerEvents {
  block: (index: number, text: string) => void;
  word: (start: number, length: number) => void;
  state: (state: string) => void;
}
const noveltyVoice =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Eddy|Flo|Fred|Good News|Grandma|Grandpa|Hysterical|Jester|Junior|Kathy|Organ|Pipe Organ|Ralph|Reed|Rocko|Sandy|Shelley|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/;
export class Reader {
  index = 0;
  rate = 1;
  voice = "";
  playing = false;
  paused = false;
  private generation = 0;
  constructor(
    public blocks: Block[],
    public language: string,
    private events: PlayerEvents,
    private synth: SpeechSynthesis = speechSynthesis,
  ) {}
  voices() {
    const local = this.synth
      .getVoices()
      .filter(
        (v) => v.localService && v.lang.toLowerCase().startsWith(this.language),
      );
    // macOS lists its novelty voices first alphabetically; nobody should study to Zarvox by default.
    const usable = local.filter((v) => !noveltyVoice.test(v.name));
    return (usable.length ? usable : local).sort(
      (a, b) => Number(b.default) - Number(a.default),
    );
  }
  start(index = this.index, retried = false) {
    this.stop(false);
    this.index = Math.max(0, Math.min(index, this.blocks.length - 1));
    const voices = this.voices();
    if (!voices.length) {
      // Browsers load voices lazily, so an empty list right after page load is not yet an answer.
      if (!retried) {
        const generation = this.generation,
          again = () => {
            this.synth.removeEventListener?.("voiceschanged", again);
            clearTimeout(timer);
            if (generation === this.generation) this.start(index, true);
          },
          timer = setTimeout(again, 1500);
        this.synth.addEventListener?.("voiceschanged", again);
        this.events.state("Getting your device's voices ready.");
        return;
      }
      this.events.state(
        "No offline voice for this language is installed. Add a device voice in system settings.",
      );
      return;
    }
    this.playing = true;
    this.read(voices);
  }
  private read(voices: SpeechSynthesisVoice[]) {
    const b = this.blocks[this.index];
    if (!b) {
      this.stop();
      return;
    }
    const token = this.generation,
      text = spokenBlock(b),
      u = new SpeechSynthesisUtterance(text);
    u.voice = voices.find((v) => v.voiceURI === this.voice) ?? voices[0];
    u.lang = this.language;
    u.rate = this.rate;
    this.events.block(this.index, text);
    this.events.word(0, text.length);
    this.events.state(
      `Reading block ${this.index + 1} of ${this.blocks.length}. Sentence highlight until word timing is available.`,
    );
    u.onboundary = (e) => {
      if (token !== this.generation) return;
      const end =
        e.charLength || text.slice(e.charIndex).match(/^\S+/)?.[0].length || 1;
      this.events.word(e.charIndex, end);
    };
    u.onend = () => {
      if (token !== this.generation) return;
      this.index++;
      if (this.index < this.blocks.length) this.read(voices);
      else {
        this.index = 0;
        this.stop();
        this.events.state("Finished reading the worksheet.");
      }
    };
    u.onerror = () => {
      if (token === this.generation) {
        this.stop();
        this.events.state("Reading stopped. Try another local voice.");
      }
    };
    this.synth.speak(u);
  }
  toggle() {
    if (!this.playing) {
      this.start();
      return;
    }
    if (this.paused) {
      this.synth.resume();
      this.paused = false;
      this.events.state("Reading resumed.");
    } else {
      this.synth.pause();
      this.paused = true;
      this.events.state("Reading paused.");
    }
  }
  stop(announce = true) {
    this.generation++;
    this.synth.cancel();
    this.playing = false;
    this.paused = false;
    if (announce) this.events.state("Reading stopped.");
  }
}
interface Recognition {
  lang: string;
  processLocally?: boolean;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((e: {
        results: {
          [index: number]: { [index: number]: { transcript: string } };
        };
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type VoiceWindow = typeof globalThis & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export const recognitionAvailable = () =>
  !!(
    (globalThis as VoiceWindow).SpeechRecognition ||
    (globalThis as VoiceWindow).webkitSpeechRecognition
  );
export function dictate(
  lang: string,
  done: (text: string) => void,
  status: (text: string) => void,
) {
  const host = globalThis as VoiceWindow,
    Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  if (!Ctor) return;
  const r = new Ctor();
  r.lang = lang;
  r.continuous = false;
  r.interimResults = false;
  if ("processLocally" in r) r.processLocally = true;
  r.onresult = (e) => done(e.results[0][0].transcript);
  r.onerror = (e) =>
    status(`Voice typing stopped: ${e.error}. You can type your answer.`);
  r.onend = () => status("Microphone stopped.");
  r.start();
  status("Listening. Use Stop microphone to finish.");
  return () => r.stop();
}
