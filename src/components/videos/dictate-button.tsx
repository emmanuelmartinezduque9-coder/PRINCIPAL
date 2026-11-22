"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Lo poco que se usa del reconocimiento de voz del navegador (no está en todos). */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};

/**
 * «Dictar»: escucha en español y va pasando cada frase reconocida a `onText`. Sin reconocimiento
 * de voz en el navegador, no se enseña.
 */
export function DictateButton({ onText, disabled, className }: { onText: (text: string) => void; disabled?: boolean; className?: string }) {
  const supported = useSyncExternalStore(noSubscribe, () => recognitionClass() !== null, () => false);
  const [listening, setListening] = useState(false);
  const current = useRef<Recognition | null>(null);
  const latest = useRef(onText);
  useEffect(() => {
    latest.current = onText;
  }, [onText]);
  useEffect(() => () => current.current?.abort(), []);

  if (!supported) return null;

  function toggle() {
    if (current.current) {
      current.current.stop();
      return;
    }
    const Klass = recognitionClass();
    if (!Klass) return;
    const recognition = new Klass();
    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (result.isFinal && text) latest.current(text);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") toast.error("El navegador no deja usar el micrófono.");
      else if (event.error !== "aborted" && event.error !== "no-speech") toast.error("No se pudo dictar.");
    };
    recognition.onend = () => {
      current.current = null;
      setListening(false);
    };
    current.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      current.current = null;
      toast.error("No se pudo dictar.");
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className={cn("h-7 gap-1.5 px-2 text-xs", listening && "text-destructive hover:text-destructive", className)}
      aria-pressed={listening}
      disabled={disabled}
      onClick={toggle}
    >
      {listening ? <Square className="size-3 fill-current" aria-hidden /> : <Mic className="size-3.5" aria-hidden />}
      {listening ? "Parar" : "Dictar"}
    </Button>
  );
}

/** Añade lo dictado al final de un texto, con un espacio o en una línea nueva si hace falta. */
export const appendDictation = (text: string, dictated: string) => (text.trim() ? `${text.replace(/\s+$/, "")} ${dictated}` : dictated);
