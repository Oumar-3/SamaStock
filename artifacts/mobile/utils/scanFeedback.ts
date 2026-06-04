import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { Platform, Vibration } from "react-native";

let nativeBeepPlayer: AudioPlayer | null = null;

function playWebBeep() {
  if (Platform.OS !== "web") return;

  const AudioContextClass = (globalThis as typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  }).AudioContext ?? (globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;

  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 920;
  gain.gain.value = 0.08;

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.08);
}

async function playNativeBeep() {
  if (Platform.OS === "web") return;

  nativeBeepPlayer ??= createAudioPlayer(require("../assets/sounds/scan-beep.wav"));
  await nativeBeepPlayer.seekTo(0);
  nativeBeepPlayer.play();
}

export function playScanFeedback() {
  Vibration.vibrate(55);
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

  try {
    playWebBeep();
    void playNativeBeep().catch(() => {});
  } catch {
    // Audio feedback is optional; scanning must never fail because of sound.
  }
}
