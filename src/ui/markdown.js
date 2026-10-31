import { escapeHtml } from '../util/format.js';

function renderInline(raw) {
  let text = escapeHtml(raw);
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return text;
}

export function renderMarkdown(input) {
  const source = String(input ?? '');
  const codeBlocks = [];
  const withTokens = source.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const token = `\u0000OBCODE${codeBlocks.length}\u0000`;
    const language = String(lang || '').trim();
    codeBlocks.push(
      `<pre class="ob-code"${language ? ` data-lang="${escapeHtml(language)}"` : ''}><code>${escapeHtml(
        code.replace(/\n$/, '')
      )}</code></pre>`
    );
    return `\n${token}\n`;
  });

  const lines = withTokens.split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(line => renderInline(line)).join('<br>')}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType) return;
    const tag = listType === 'ol' ? 'ol' : 'ul';
    html.push(`<${tag}>${listItems.map(item => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`);
    listType = null;
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const tokenMatch = /^\u0000OBCODE(\d+)\u0000$/.exec(trimmed);
    if (tokenMatch) {
      flushParagraph();
      flushList();
      html.push(codeBlocks[Number(tokenMatch[1])] || '');
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    const unordered = /^\s*[-*]\s+(.*)$/.exec(line);
    if (unordered) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(unordered[1]);
      continue;
    }
    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(ordered[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return html.join('\n').replace(/\u0000OBCODE(\d+)\u0000/g, (_, index) => codeBlocks[Number(index)] || '');
}
