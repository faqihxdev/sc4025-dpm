import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseChatReply } from './chat-format';

describe('reply emphasis', () => {
  it('keeps ordinary replies unchanged', () => {
    expect(parseChatReply('Try iced tea.')).toEqual([{ text: 'Try iced tea.', bold: false }]);
    expect(parseChatReply('')).toEqual([]);
  });

  it('emphasises selected phrases without losing surrounding punctuation', () => {
    expect(parseChatReply('Try **iced tea**, or keep **coffee**.')).toEqual([
      { text: 'Try ', bold: false }, { text: 'iced tea', bold: true },
      { text: ', or keep ', bold: false }, { text: 'coffee', bold: true },
      { text: '.', bold: false },
    ]);
  });

  it('leaves incomplete, empty or oversized emphasis as literal text', () => {
    for (const content of ['Try **tea', '****', '**   **', `**${'x'.repeat(101)}**`]) {
      expect(parseChatReply(content)).toEqual([{ text: content, bold: false }]);
    }
  });

  it('does not turn links, italics or HTML into other formatting', () => {
    const content = '[tea](https://example.com) *tea* <img src=x onerror=alert(1)>';
    expect(parseChatReply(content)).toEqual([{ text: content, bold: false }]);
  });

  it('renders HTML-like content as text even inside emphasis', () => {
    const parts = parseChatReply('**<img src=x onerror=alert(1)>**');
    const html = renderToStaticMarkup(createElement('p', null, ...parts.map((part, index) => part.bold ? createElement('strong', { key: index }, part.text) : part.text)));
    expect(html).toBe('<p><strong>&lt;img src=x onerror=alert(1)&gt;</strong></p>');
  });

  it('allows emphasis at both ends and adjacent phrases', () => {
    expect(parseChatReply('**Matcha****Chai**')).toEqual([{ text: 'Matcha', bold: true }, { text: 'Chai', bold: true }]);
  });
});
