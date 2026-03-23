export interface TTSOptions {
  voice: string;
  speed: number;
  language: string;
  format: "mp3" | "wav";
}

export interface TTSProvider {
  synthesize(text: string, options: TTSOptions): Promise<Buffer>;
}
