/**
 * シンプルなマークダウンパーサー
 * 対応記法：見出し、太字、斜体、リスト、コードブロック、インラインコード、リンク、画像、テーブル
 */

/**
 * アセットパスを解決する
 * @param {string} text - マークダウンテキスト
 * @param {string} basePath - 基準パス（例: '業務A/knowledge/data'）
 * @returns {string} パス解決済みテキスト
 */
export function resolveAssetPaths(text, basePath) {
    if (!text || !basePath) return text;
    
    // asset/から始まるパスをChrome拡張のURLに変換
    return text.replace(/!\[([^\]]*)\]\(asset\/([^)]+)\)/g, (match, alt, filename) => {
      const url = chrome.runtime.getURL(`${basePath}/asset/${filename}`);
      return `![${alt}](${url})`;
    });
  }
  
  export function parseMarkdown(text) {
    if (!text) return '';
  
    let html = escapeHtml(text);
  
    // コードブロック（```で囲まれた部分）- 先に処理
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre class="md-code-block" data-lang="${lang}"><code>${code.trim()}</code></pre>`;
    });
  
    // インラインコード（`で囲まれた部分）
    html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  
    // テーブル
    html = parseTable(html);
  
    // 見出し
    html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
  
    // 太字と斜体
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
    // 画像（クリック可能）
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
      return `<figure class="md-image-container">
        <img src="${src}" alt="${alt}" class="md-image" data-modal-image tabindex="0">
        <figcaption class="md-image-caption">${alt}</figcaption>
      </figure>`;
    });
  
    // リンク
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener">$1</a>');
  
    // 番号付きリスト
    html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="md-ol-item" value="$1">$2</li>');
    html = html.replace(/(<li class="md-ol-item"[^>]*>.*<\/li>\n?)+/g, '<ol class="md-ol">$&</ol>');
  
    // 箇条書きリスト
    html = html.replace(/^[-*] (.+)$/gm, '<li class="md-ul-item">$1</li>');
    html = html.replace(/(<li class="md-ul-item">.*<\/li>\n?)+/g, '<ul class="md-ul">$&</ul>');
  
    // 水平線
    html = html.replace(/^---$/gm, '<hr class="md-hr">');
  
    // 段落（連続する改行で分割）
    html = html.replace(/\n\n+/g, '</p><p class="md-p">');
    
    // 単一改行を<br>に（コードブロック内以外）
    html = html.replace(/\n/g, '<br>');
  
    // 全体をpタグで囲む（既にブロック要素で始まっていない場合）
    if (!html.match(/^<(h[1-3]|ul|ol|pre|hr|figure|table)/)) {
      html = `<p class="md-p">${html}</p>`;
    }
  
    // 空のpタグを削除
    html = html.replace(/<p class="md-p"><\/p>/g, '');
    html = html.replace(/<p class="md-p">(<(h[1-3]|ul|ol|pre|hr|figure|table))/g, '$1');
    html = html.replace(/(<\/(h[1-3]|ul|ol|pre|hr|figure|table)>)<\/p>/g, '$1');
  
    return html;
  }
  
  // テーブルパース
  function parseTable(html) {
    const lines = html.split('\n');
    const result = [];
    let inTable = false;
    let tableRows = [];
  
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // テーブル行の検出（|で始まり|で終わる）
      if (line.match(/^\|.*\|$/)) {
        // 区切り行（|---|---|）の検出
        if (line.match(/^\|[\s\-:]+\|$/)) {
          continue; // 区切り行はスキップ
        }
        
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        
        tableRows.push(line);
      } else {
        if (inTable) {
          // テーブル終了、HTMLに変換
          result.push(convertTableToHtml(tableRows));
          inTable = false;
          tableRows = [];
        }
        result.push(line);
      }
    }
  
    // 最後がテーブルで終わった場合
    if (inTable) {
      result.push(convertTableToHtml(tableRows));
    }
  
    return result.join('\n');
  }
  
  // テーブル行をHTMLに変換
  function convertTableToHtml(rows) {
    if (rows.length === 0) return '';
  
    let html = '<table class="md-table"><thead><tr>';
    
    // ヘッダー行
    const headerCells = rows[0].split('|').filter(cell => cell.trim() !== '');
    headerCells.forEach(cell => {
      html += `<th>${cell.trim()}</th>`;
    });
    html += '</tr></thead>';
  
    // ボディ行
    if (rows.length > 1) {
      html += '<tbody>';
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].split('|').filter(cell => cell.trim() !== '');
        html += '<tr>';
        cells.forEach(cell => {
          html += `<td>${cell.trim()}</td>`;
        });
        html += '</tr>';
      }
      html += '</tbody>';
    }
  
    html += '</table>';
    return html;
  }
  
  // HTMLエスケープ
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // 画像のクリックイベントを設定（image-modalと連携）
  export function setupMarkdownImages(container) {
    const images = container.querySelectorAll('[data-modal-image]');
    images.forEach(img => {
      img.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('open-image-modal', {
          detail: { src: img.src, alt: img.alt }
        }));
      });
      img.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          img.click();
        }
      });
    });
  }