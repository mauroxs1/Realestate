import Groq from "groq-sdk";

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const extension = mimeType.includes("ogg") ? "ogg" : "mp4";
  const file = new File([audioBuffer], `audio.${extension}`, { type: mimeType });
  const transcription = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    language: "es",
  });
  return transcription.text;
}
