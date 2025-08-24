// Agreement parser usable in both browser and Node (Jest)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AgreementParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function formatAgreementContent(raw) {
    const summaryMatch = raw.match(/Plain-text summary:\s*([\s\S]*)/i);
    let summary = '';
    let agreementText = raw;

    if (summaryMatch) {
      summary = summaryMatch[1].trim();
      agreementText = raw.slice(0, summaryMatch.index).trim();
    }

    const codeMatch = agreementText.match(/```(?:html)?\n([\s\S]*?)```/i);
    let html = '';
    if (codeMatch) {
      html = codeMatch[1].trim();
    } else {
      const lines = agreementText.split(/\r?\n/).filter(l => l.trim().length);
      let inList = false;
      lines.forEach(line => {
        if (/^Final\b/i.test(line)) {
          html += `<h1>${line.trim()}</h1>`;
        } else if (/^\d+\./.test(line)) {
          const [num, rest] = line.split(/\.\s*/, 2);
          const [title, text] = rest.split(/:\s*/, 2);
          html += `<p><strong>${num}. ${title}:</strong> ${text}</p>`;
        } else if (/^Guiding Principles/i.test(line)) {
          if (inList) { html += '</ul>'; inList = false; }
          html += `<h2>${line.trim()}</h2>`;
        } else if (/^[A-Za-z ]+:/.test(line)) {
          if (!inList) { html += '<ul>'; inList = true; }
          const [label, text] = line.split(/:\s*/, 2);
          html += `<li><strong>${label}:</strong> ${text}</li>`;
        } else {
          if (inList) { html += '</ul>'; inList = false; }
          html += `<p>${line.trim()}</p>`;
        }
      });
      if (inList) html += '</ul>';
    }
    return { html, summary };
  }

  function parseAgreementStructured(raw) {
    // Extract optional summary block
    const summaryMatch = raw.match(/Plain-text summary:\s*([\s\S]*)/i);
    let summary = '';
    let preSummaryText = raw;
    if (summaryMatch) {
      summary = (summaryMatch[1] || '').trim();
      preSummaryText = raw.slice(0, summaryMatch.index).trim();
    }

    // If the agreement is inside a code fence, prefer that HTML; otherwise use preSummaryText
    const codeMatch = preSummaryText.match(/```(?:html)?\n([\s\S]*?)```/i);
    const html = codeMatch ? codeMatch[1].trim() : preSummaryText;

    const clauses = [];
    const principles = [];

    // Try parsing as HTML first for robust extraction
    try {
      const hasDOM = typeof document !== 'undefined' && document && typeof document.createElement === 'function';
      if (hasDOM) {
        const container = document.createElement('div');
        container.innerHTML = html;

        // Extract clauses from <p><strong>1. Title:</strong> Body</p> pattern
        const ps = container.querySelectorAll('p');
        ps.forEach(p => {
          const strong = p.querySelector('strong');
          if (!strong) return;
          const strongText = (strong.textContent || '').trim();
          const m = strongText.match(/^(\d+)\.\s*(.+?):\s*$/);
          if (!m) return;
          const number = parseInt(m[1], 10);
          const title = m[2].trim();
          // Body is the p text minus the strong prefix
          const fullText = (p.textContent || '').trim();
          let body = fullText.replace(strongText, '').trim();
          body = body.replace(/^[:\s-]+/, '').trim();
          clauses.push({ number, title, body });
        });

        // If no clauses found, also check for <ol><li> with similar content
        if (clauses.length === 0) {
          const lis = container.querySelectorAll('ol > li, ul > li');
          let cnum = 1;
          lis.forEach(li => {
            const strong = li.querySelector('strong');
            const liText = (li.textContent || '').trim();
            if (strong) {
              const label = (strong.textContent || '').replace(/:$/, '').trim();
              const rest = liText.replace(strong.textContent || '', '').replace(/^[:\s-]+/, '').trim();
              clauses.push({ number: cnum++, title: label, body: rest });
            } else if (liText) {
              clauses.push({ number: cnum++, title: '', body: liText });
            }
          });
        }

        // Find principles under an H2 titled "Guiding Principles" and subsequent list
        const h2s = container.querySelectorAll('h2, h3');
        let principlesRoot = null;
        h2s.forEach(h => {
          if (!principlesRoot && /guiding principles/i.test(h.textContent || '')) {
            principlesRoot = h.nextElementSibling && (h.nextElementSibling.matches('ul,ol') ? h.nextElementSibling : null);
            if (!principlesRoot) {
              const nextList = container.querySelector('h2 ~ ul, h2 ~ ol, h3 ~ ul, h3 ~ ol');
              if (nextList) principlesRoot = nextList;
            }
          }
        });
        if (principlesRoot) {
          principlesRoot.querySelectorAll('li').forEach(li => {
            const strong = li.querySelector('strong');
            if (strong) {
              const label = (strong.textContent || '').replace(/:$/, '').trim();
              const text = (li.textContent || '').replace(strong.textContent || '', '').replace(/^[:\s-]+/, '').trim();
              principles.push({ label, text });
            } else {
              principles.push({ label: '', text: (li.textContent || '').trim() });
            }
          });
        }
      } else {
        // Node environment: regex-based extraction for common patterns
        // Clauses like: <p><strong>1. Title:</strong> Body</p>
        const clauseRegex = /<p>\s*<strong>\s*(\d+)\.\s*([^:<]+?)\s*:\s*<\/strong>\s*([^<]+?)\s*<\/p>/gi;
        let m;
        while ((m = clauseRegex.exec(html)) !== null) {
          clauses.push({ number: parseInt(m[1], 10), title: m[2].trim(), body: m[3].trim() });
        }
        // Principles list items: <li><strong>Label:</strong> Text</li>
        const principlesRegex = /<li>\s*<strong>\s*([^:<]+?)\s*:\s*<\/strong>\s*([^<]+?)\s*<\/li>/gi;
        while ((m = principlesRegex.exec(html)) !== null) {
          principles.push({ label: m[1].trim(), text: m[2].trim() });
        }
      }
    } catch (e) {
      // ignore
    }

    // Fallback: text line parsing if HTML yielded nothing
    if (clauses.length === 0 && principles.length === 0) {
      const text = codeMatch ? codeMatch[1] : preSummaryText;
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let collectingPrinciples = false;
      for (const line of lines) {
        if (/^Guiding Principles/i.test(line)) { collectingPrinciples = true; continue; }
        const clauseMatch = line.match(/^(\d+)\.\s*(.+)$/);
        if (clauseMatch) {
          const rest = clauseMatch[2];
          const idx = rest.indexOf(':');
          const title = idx !== -1 ? rest.slice(0, idx).trim() : '';
          const body = idx !== -1 ? rest.slice(idx + 1).trim() : rest.trim();
          clauses.push({ number: parseInt(clauseMatch[1], 10), title, body });
          continue;
        }
        if (collectingPrinciples) {
          const m = line.match(/^([A-Za-z ]+):\s*(.+)$/);
          if (m) principles.push({ label: m[1].trim(), text: m[2].trim() });
        }
      }
    }

    return { clauses, principles, summary };
  }

  return { formatAgreementContent, parseAgreementStructured };
});
