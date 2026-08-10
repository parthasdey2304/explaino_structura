/**
 * Gemini Live API integration for real-time voice conversation.
 *
 * Uses Google's Gemini 2.0 Flash Live model for bidirectional audio streaming.
 * The bot is configured to behave as "Explaino" — a friendly coding & learning
 * assistant. No Gemini branding is exposed to the user.
 */

const GEMINI_STORAGE_KEY = "explaino-gemini-api-key";
const GEMINI_LIVE_ENDPOINT = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

const EXPLAINO_SYSTEM_INSTRUCTION = `
You are Explaino, a friendly and knowledgeable AI assistant embedded in a browser-based learning and coding platform.
Your role is to help users understand concepts, debug code, explain algorithms, and learn new topics.
- Be concise, clear, and encouraging.
- Use simple language but don't shy away when the user wants depth.
- When explaining code, walk through it step by step.
- If the user asks about something outside your knowledge, say so honestly.
- Never mention that you are powered by Gemini, Google, or any specific model.
- You are simply "the AI assistant" or "Explaino".
- Keep responses natural for spoken conversation — avoid long markdown lists, use plain conversational language.
- If the user wants code, provide it clearly.
`;

export function getStoredGeminiKey(): string {
  try {
    return localStorage.getItem(GEMINI_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStoredGeminiKey(key: string): void {
  try {
    localStorage.setItem(GEMINI_STORAGE_KEY, key.trim());
  } catch {
    // ignore
  }
}

export interface GeminiLiveHandlers {
  onAudioStart?: () => void;
  onAudioEnd?: () => void;
  onTextDelta?: (text: string) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (err: string) => void;
  onClose?: () => void;
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private playbackContext: AudioContext | null = null;
  private isRecording = false;
  private isPlaying = false;
  private handlers: GeminiLiveHandlers;
  private apiKey: string;
  private textBuffer = "";

  constructor(apiKey: string, handlers: GeminiLiveHandlers = {}) {
    this.apiKey = apiKey;
    this.handlers = handlers;
  }

  async start(): Promise<void> {
    const url = `${GEMINI_LIVE_ENDPOINT}?key=${this.apiKey}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => this.onOpen();
    this.ws.onmessage = (e) => this.onMessage(e);
    this.ws.onerror = () => this.handlers.onError?.("Connection error");
    this.ws.onclose = () => {
      this.stopRecording();
      this.handlers.onClose?.();
    };

    await this.startRecording();
  }

  private onOpen() {
    // Send setup config with system instruction.
    const setupMsg = {
      setup: {
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: ["audio", "text"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede",
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: EXPLAINO_SYSTEM_INSTRUCTION }],
        },
      },
    };
    this.ws?.send(JSON.stringify(setupMsg));
  }

  private async onMessage(event: MessageEvent) {
    let data: any;
    if (typeof event.data === "string") {
      data = JSON.parse(event.data);
    } else {
      return;
    }

    if (data.setupComplete) {
      return;
    }

    // Server content: model turn with text or audio.
    if (data.serverContent) {
      const parts = data.serverContent.modelTurn?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.text) {
            this.textBuffer += part.text;
            this.handlers.onTextDelta?.(part.text);
          }
          if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio")) {
            this.playAudio(part.inlineData.data);
          }
        }
      }
    }

    // Input transcription (what the user said).
    if (data.serverContent?.inputTranscription) {
      const text = data.serverContent.inputTranscription.text;
      this.handlers.onTranscript?.(text, true);
    }

    // Turn complete.
    if (data.serverContent?.turnComplete) {
      this.handlers.onAudioEnd?.();
    }

    // Errors.
    if (data.error) {
      this.handlers.onError?.(data.error.message || "Unknown error");
    }
  }

  private async startRecording() {
    try {
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = this.float32ToInt16(input);
        const base64 = this.arrayBufferToBase64(pcm.buffer);
        this.sendAudioChunk(base64);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);
      this.isRecording = true;
    } catch (err: any) {
      this.handlers.onError?.(err.message || "Microphone access denied");
    }
  }

  private sendAudioChunk(base64Pcm: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64Pcm,
          },
        ],
      },
    };
    this.ws.send(JSON.stringify(msg));
  }

  private stopRecording() {
    this.isRecording = false;
    this.processorNode?.disconnect();
    this.sourceNode?.disconnect();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.processorNode = null;
  }

  private async playAudio(base64Pcm: string) {
    try {
      if (!this.playbackContext) {
        this.playbackContext = new AudioContext({ sampleRate: 24000 });
      }
      const ctx = this.playbackContext;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      this.isPlaying = true;
      this.handlers.onAudioStart?.();

      const raw = atob(base64Pcm);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const pcmData = new Int16Array(bytes.buffer as ArrayBuffer);
      const float32 = this.int16ToFloat32(pcmData);

      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32 as Float32Array<ArrayBuffer>, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        this.isPlaying = false;
        this.handlers.onAudioEnd?.();
      };
      source.start();
    } catch (err: any) {
      this.handlers.onError?.(err.message || "Audio playback error");
      this.handlers.onAudioEnd?.();
    }
  }

  private float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }

  private int16ToFloat32(int16: Int16Array): Float32Array {
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }
    return float32;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | ArrayBufferLike): string {
    const bytes = new Uint8Array(buffer as ArrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  stop() {
    this.stopRecording();
    this.playbackContext?.close();
    this.playbackContext = null;
    this.isPlaying = false;
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
