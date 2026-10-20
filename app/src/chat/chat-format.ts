export interface ReplyPart {
  text: string;
  bold: boolean;
}

// Only **short phrases** get formatting. Everything else remains escaped React text.
export function parseChatReply(content: string): ReplyPart[] {
  const parts: ReplyPart[] = [];
  let cursor = 0;
  for (const match of content.matchAll(/\*\*([^*\n]{1,100})\*\*/g)) {
    if (!match[1].trim()) continue;
    if (match.index > cursor) parts.push({ text: content.slice(cursor, match.index), bold: false });
    parts.push({ text: match[1], bold: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < content.length) parts.push({ text: content.slice(cursor), bold: false });
  return parts;
}
