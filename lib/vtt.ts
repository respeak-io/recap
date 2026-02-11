export function segmentsToVtt(
  segments: { start_time: number; end_time: number; spoken_content: string }[]
): string {
  let vtt = "WEBVTT\n\n";
  for (const seg of segments) {
    vtt += `${formatTime(seg.start_time)} --> ${formatTime(seg.end_time)}\n`;
    vtt += `${seg.spoken_content}\n\n`;
  }
  return vtt;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
