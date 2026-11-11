// 把段落切成句子，避免瀏覽器對過長的語音片段出錯
export function splitSentences(paragraph) {
  return paragraph.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [paragraph];
}

export function pickDefaultVoice(voices) {
  return (
    voices.find((v) => /zh[-_]TW/i.test(v.lang)) ||
    voices.find((v) => /^zh/i.test(v.lang)) ||
    voices[0] ||
    null
  );
}
