import { useEffect, useState, useRef } from "react";

interface TurnLike {
  text?: string;
  speaker?: string;
}

/**
 * Reveal demo turns at a realistic 1x voice dictation pace (matching real speaking rate).
 * Calculates speaking duration from sentence length so dialogue can be easily read.
 */
export function useReadableTurns<T extends TurnLike>(eventId: string, turns: T[]): T[] {
  const [visible, setVisible] = useState(0);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  // Reset when a new call/event begins
  useEffect(() => {
    setVisible(turns.length > 0 ? 1 : 0);
  }, [eventId]);

  useEffect(() => {
    if (visible === 0 && turns.length > 0) {
      setVisible(1);
      return;
    }

    if (visible >= turns.length) return;

    // Calculate natural 1x speech duration for the current turn based on character count
    // Normal human speech is ~20-25 characters/sec (approx 40ms/character)
    const currentTurn = turns[visible - 1];
    const charCount = currentTurn?.text?.length ?? 60;
    // Base speech time + 700ms natural conversational pause before next speaker
    const speakDurationMs = Math.max(2200, Math.min(6500, charCount * 36)) + 700;

    const timer = window.setTimeout(() => {
      setVisible((count) => Math.min(count + 1, turnsRef.current.length));
    }, speakDurationMs);

    return () => window.clearTimeout(timer);
  }, [turns.length, visible]);

  return turns.slice(0, visible);
}

/**
 * Progressive voice-to-text dictation component.
 * Types text word-by-word/char-by-char with an iOS keyboard speech-to-text dictation cursor.
 */
export function VoiceDictatedText({
  text,
  isLatest,
  charSpeedMs = 28,
}: {
  text: string;
  isLatest: boolean;
  charSpeedMs?: number;
}) {
  const [displayedChars, setDisplayedChars] = useState(isLatest ? Math.min(6, text.length) : text.length);
  const isComplete = displayedChars >= text.length;

  useEffect(() => {
    if (!isLatest) {
      setDisplayedChars(text.length);
      return;
    }

    setDisplayedChars(Math.min(6, text.length));
    const interval = window.setInterval(() => {
      setDisplayedChars((prev) => {
        if (prev >= text.length) {
          window.clearInterval(interval);
          return text.length;
        }
        // Advance in 2-3 char chunks to emulate live STT audio buffer streaming
        return Math.min(prev + Math.floor(Math.random() * 2 + 2), text.length);
      });
    }, charSpeedMs);

    return () => window.clearInterval(interval);
  }, [text, isLatest, charSpeedMs]);

  // Click to instantly complete typing
  const handleFastForward = () => setDisplayedChars(text.length);

  return (
    <span onClick={handleFastForward} className="relative inline" title={isLatest && !isComplete ? "Click to show all" : undefined}>
      {text.slice(0, displayedChars)}
      {isLatest && !isComplete && (
        <span
          className="ml-0.5 inline-block h-[13px] w-[2px] rounded-full bg-lamp align-middle animate-pulse"
          aria-hidden="true"
        />
      )}
    </span>
  );
}
