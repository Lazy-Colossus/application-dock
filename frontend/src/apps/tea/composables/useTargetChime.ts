import { watch, type Ref } from "vue";

/**
 * A soft chime the moment a steep reaches its target. Mobile browsers only
 * allow audio after a user gesture, so `unlock()` is called from the Start tap.
 */
export function useTargetChime(
  elapsed: Readonly<Ref<number>>,
  target: Readonly<Ref<number | null>>,
  enabled: Readonly<Ref<boolean>>,
): { unlock: () => void } {
  let context: AudioContext | null = null;
  let fired = false;

  function unlock(): void {
    if (context) {
      void context.resume();
      return;
    }
    if (typeof AudioContext === "undefined") return;
    context = new AudioContext();
  }

  function play(): void {
    if (!context) return;
    const at = context.currentTime;
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = "sine";
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
    tone.connect(gain).connect(context.destination);
    tone.start(at);
    tone.stop(at + 1.5);
  }

  watch([elapsed, target], ([seconds, goal]) => {
    if (goal === null || seconds < goal) {
      fired = false;
      return;
    }
    if (fired) return;
    fired = true;
    if (enabled.value) play();
  });

  return { unlock };
}
