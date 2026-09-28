import { watch, type Ref } from "vue";

// One context for every page: mobile browsers only allow audio after a tap, so
// a steep started on the timer must still chime on the Cha Xi page.
let context: AudioContext | null = null;

/**
 * A soft chime the moment a steep reaches its target. `unlock()` is called
 * from the Start tap, which is the user gesture the browser needs.
 */
export function useTargetChime(
  elapsed: Readonly<Ref<number>>,
  target: Readonly<Ref<number | null>>,
  enabled: Readonly<Ref<boolean>>,
): { unlock: () => void } {
  // A page opened mid-steep, past its target, must not chime a second time for it.
  let fired = target.value !== null && elapsed.value >= target.value;

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
