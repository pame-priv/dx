document.addEventListener('DOMContentLoaded', () => {
    // ── DOM要素のキャッシュ ─────────────────────────────────────
    const elements = {
      contentCodeArea: document.getElementById('content-code-area').querySelector('code'),
      copyButton: document.getElementById('copyButton'),
      textInput: document.getElementById('textInput'),
      deleteButton: document.getElementById('deleteButton'),
      moveUpButton: document.getElementById('moveUpButton'),
      moveDownButton: document.getElementById('moveDownButton'),
      contentPreview: document.getElementById('content-preview'),
      container: document.querySelector('.container'),
      longText: document.getElementById('longText'),
      richTextEditor: document.getElementById('richTextEditor'),
      imageFileId: document.getElementById('imageFileId'),
      imageAlt: document.getElementById('imageAlt'),
      stepsCustomize: document.getElementById('stepsCustomize'),
      stepsDisplay: document.getElementById('stepsDisplay'),
      undoButton: document.getElementById('undoButton'),
      redoButton: document.getElementById('redoButton'),
      imageSizeControls: document.getElementById('imageSizeControls'),
      imageWidthInput: document.getElementById('imageWidthInput'),
      imageHeightDisplay: document.getElementById('imageHeightDisplay'),
      imageDecrease: document.getElementById('imageDecrease'),
      imageIncrease: document.getElementById('imageIncrease')
    };

    // ── 状態変数 ──────────────────────────────────────────────
    let selectedContents = new Set();
    let lastSelectedContent = null;
    let contentCounter = 0;
    const maxHistorySize = 100;
    let history = [];
    let currentHistoryIndex = -1;

    // ステップカードの初期データ
    const defaultSteps = [
      { number: 1, title: 'STEP 1のタイトル', note: '' },
      { number: 2, title: 'STEP 2のタイトル', note: '' },
      { number: 3, title: 'STEP 3のタイトル', note: '' }
    ];

    // ── ユーティリティ関数 ─────────────────────────────────────

    // Google Drive URLからファイルIDを抽出
    const extractGDriveFileId = (input) => {
      if (!input) return '';
      input = input.trim();
      // URL形式でない場合はそのまま返す
      if (!input.startsWith('http')) return input;
      // /file/d/FILE_ID/ パターン
      const fileD = input.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileD) return fileD[1];
      // id=FILE_ID パターン（open?id=, uc?id=, download?id= など）
      const idParam = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (idParam) return idParam[1];
      return input;
    };

    // インラインHTMLサニタイズ（許可: strong, a[href][target], br）
    const sanitizeInlineHtml = (html) => {
      if (!html) return '';
      const div = document.createElement('div');
      div.innerHTML = html;
      const sanitize = (node) => {
        const result = [];
        node.childNodes.forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) {
            // ゼロ幅スペースを除去
            const cleaned = child.textContent.replace(/\u200B/g, '');
            if (cleaned) result.push(escapeHtml(cleaned));
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const tag = child.tagName.toLowerCase();
            if (tag === 'strong' || tag === 'b') {
              result.push(`<strong>${sanitize(child)}</strong>`);
            } else if (tag === 'a') {
              const href = child.getAttribute('href') || '';
              result.push(`<a href="${escapeAttr(href)}" target="_blank">${sanitize(child)}</a>`);
            } else if (tag === 'br') {
              result.push('<br>');
            } else {
              // 不許可タグ: 子要素のテキストだけ残す
              result.push(sanitize(child));
            }
          }
        });
        return result.join('');
      };
      return sanitize(div);
    };

    const isInViewport = (el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 &&
             rect.left >= 0 &&
             rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
             rect.right <= (window.innerWidth || document.documentElement.clientWidth);
    };

    // ── ステップカードHTML生成（FAQ CODEと同じクラス名） ───────────
    const generateStepCards = (steps, stepGroupId) => {
      return `<div class="step-cards">\n${steps.map(step =>
        `  <div class="step-card">\n    <div class="step-label">STEP ${step.number}</div>\n    <div class="step-title">${step.title}</div>${step.note ? `\n    <p class="step-note">${step.note}</p>` : ''}\n  </div>`
      ).join('\n')}\n</div>`;
    };

    // ── ステップサブヘディング生成 ──────────────────────────────
    const addStepSubheading = (step, stepGroupId) => {
      const timestamp = Date.now();
      const contentId = `content-${timestamp}-${step.number}`;
      const headingId = `${stepGroupId}-step-${step.number}`;
      return `
        <div class="content-block step-subheading" data-content-id="${contentId}" data-type="subheading" data-text="STEP ${step.number} ${step.title}" data-heading-id="${headingId}" data-step-group-id="${stepGroupId}">
          <div id="${headingId}" class="step-subheading-content">
            <div class="step-label" contenteditable="false">STEP ${step.number}</div>
            <p contenteditable="false">${step.title}</p>
          </div>
        </div>`;
    };

    // ── 出力HTML生成 ───────────────────────────────────────────
    const generateOutputHTML = () => {
      const blocks = elements.contentPreview.querySelectorAll('.content-block');
      let html = '<!-- html -->\n';

      blocks.forEach(block => {
        const type = block.getAttribute('data-type');
        const text = block.getAttribute('data-text') || '';
        let blockHtml = '';

        // テキスト系ブロックのinnerHTMLを取得するヘルパー
        const getInlineContent = (block, selector) => {
          const el = block.querySelector(selector);
          return el ? sanitizeInlineHtml(el.innerHTML) : escapeHtml(text);
        };

        switch (type) {
          case 'title':
            blockHtml = `<div class="kn-title">${escapeHtml(text)}</div>`;
            break;
          case 'heading':
            blockHtml = `<div class="article_heading">\n  <p>${escapeHtml(text)}</p>\n</div>`;
            break;
          case 'subheading':
            if (block.classList.contains('step-subheading')) {
              const stepNumber = text.split(' ')[1];
              const stepTitle = text.replace(/^STEP \d+ /, '');
              const headingId = block.getAttribute('data-heading-id') || '';
              blockHtml = `<div id="${escapeAttr(headingId)}" class="article_subheading step-subheading">\n  <div class="step-subheading-content">\n    <div class="step-label">STEP ${stepNumber}</div>\n    <p>${escapeHtml(stepTitle)}</p>\n  </div>\n</div>`;
            } else {
              blockHtml = `<div class="article_subheading">\n  <p>${escapeHtml(text)}</p>\n</div>`;
            }
            break;
          case 'miniheading':
            blockHtml = `<p class="kn-miniheading">${escapeHtml(text)}</p>`;
            break;
          case 'text':
            blockHtml = `<p class="wysiwyg-indent1">${getInlineContent(block, '.wysiwyg-indent1')}</p>`;
            break;
          case 'highlight':
            blockHtml = `<p class="wysiwyg-indent1 warning-box">${getInlineContent(block, '.warning-box')}</p>`;
            break;
          case 'description':
            blockHtml = `<p class="wysiwyg-indent1 description-container">${getInlineContent(block, '.description-container')}</p>`;
            break;
          case 'list': {
            const listType = block.getAttribute('data-list-type') || 'ul';
            const items = text.split('\n').filter(l => l.trim());
            blockHtml = `<${listType} class="kn-list">\n${items.map(item => `  <li>${escapeHtml(item)}</li>`).join('\n')}\n</${listType}>`;
            break;
          }
          case 'image': {
            const fileId = block.getAttribute('data-file-id') || '';
            const alt = block.getAttribute('data-alt') || '';
            const imgWidth = block.getAttribute('data-width') || '';
            const widthAttr = imgWidth ? ` width="${escapeAttr(imgWidth)}"` : '';
            blockHtml = `<img class="knowledge-image" data-gdrive-id="${escapeAttr(fileId)}" alt="${escapeAttr(alt)}"${widthAttr}>`;
            break;
          }
          case 'divider':
            blockHtml = `<div class="article-divider"></div>`;
            break;
          case 'space':
            blockHtml = `<p class="wysiwyg-indent1">&nbsp;</p>`;
            break;
          case 'steps': {
            const stepsData = JSON.parse(block.getAttribute('data-steps') || '[]');
            blockHtml = generateStepCards(stepsData);
            break;
          }
        }

        if (blockHtml) {
          html += blockHtml + '\n';
        }
      });

      return html;
    };

    const escapeHtml = (text) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    const escapeAttr = (text) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    // ── コード表示の更新 ──────────────────────────────────────
    const updateCode = () => {
      elements.contentCodeArea.textContent = generateOutputHTML();
    };

    // ── コンテンツ追加処理 ─────────────────────────────────────
    let addContentBlock = (type) => {
      const contentId = `content-${Date.now()}-${contentCounter++}`;
      let previewContent = '';

      switch (type) {
        case 'title':
          previewContent = `<div class="content-block" data-content-id="${contentId}" data-type="title" data-text="タイトルを入力">
            <div class="kn-title"><p contenteditable="false">タイトルを入力</p></div>
          </div>`;
          break;
        case 'heading':
          previewContent = `<div class="content-block" data-content-id="${contentId}" data-type="heading" data-text="大見出し">
            <div class="article_heading"><p contenteditable="false">大見出し</p></div>
          </div>`;
          break;
        case 'subheading':
          previewContent = `<div class="content-block" data-content-id="${contentId}" data-type="subheading" data-text="小見出し">
            <div class="article_subheading"><p contenteditable="false">小見出し</p></div>
          </div>`;
          break;
        case 'miniheading':
          previewContent = `<div class="content-block" data-content-id="${contentId}" data-type="miniheading" data-text="ミニ見出し">
            <p class="kn-miniheading" contenteditable="false">ミニ見出し</p>
          </div>`;
          break;
        case 'text':
          previewContent = `<div class="content-block" data-content-id="${contentId}" data-type="text" data-text="ここにテキストを入力">
            <p class="wysiwyg-indent1" contenteditable="false">ここにテキストを入力</p>
          </div>`;
          break;
        case 'highlight':
          previewContent = `<div class="content-block" data-content-id="${contentId}" data-type="highlight" data-text="ここにハイライトテキストを入力">
            <p class="wysiwyg-indent1 warning-box" contenteditable="false">ここにハイライトテキストを入力</p>
          </div>`;
          break;
        case 'description':
          previewContent = `<div class="content-block" data-content-id="${contentId}" data-type="description" data-text="ここに説明テキストを入力">
            <p class="wysiwyg-indent1 description-container" contenteditable="false">ここに説明テキストを入力</p>
          </div>`;
          break;
        case 'list':
          previewContent = `<div class="content-block" data-content-id="${contentId}" data-type="list" data-text="項目1\n項目2\n項目3" data-list-type="ul">
            <ul class="kn-list">
              <li>項目1</li>
              <li>項目2</li>
              <li>項目3</li>
            </ul>
          </div>`;
          break;
        case 'image':
          previewContent = `<div class="content-block" data-content-id="${contentId}" data-type="image" data-file-id="" data-alt="">
            <div class="image-placeholder">
              <p>gdrive:ファイルID を入力してください</p>
              <p><a href="https://drive.google.com/drive/folders/14rH7DGzq8REwjDGdgBCstecrGgcqzx0S" target="_blank" rel="noopener noreferrer">画像置き場（Google Drive）にアップロード</a></p>
              <p class="image-note">※ 画像のファイル名は内容が分かりやすい名前にしてください</p>
            </div>
          </div>`;
          break;
        case 'space':
          previewContent = `<div class="content-block" data-content-id="${contentId}" data-type="space">
            <p class="wysiwyg-indent1">&nbsp;</p>
          </div>`;
          break;
        case 'divider':
          previewContent = `<div class="content-block" data-content-id="${contentId}" data-type="divider">
            <div class="article-divider"></div>
          </div>`;
          break;
        case 'steps': {
          const stepGroupId = `step-group-${Date.now()}`;
          const stepsData = JSON.stringify(defaultSteps);
          previewContent = `<div class="content-block step-cards-block" data-content-id="${contentId}" data-type="steps" data-steps='${stepsData}' data-step-group-id="${stepGroupId}">
            ${generateStepCards(defaultSteps, stepGroupId)}
          </div>`;
          defaultSteps.forEach(step => {
            previewContent += '\n' + addStepSubheading(step, stepGroupId);
          });
          break;
        }
      }

      // 挿入位置の決定
      if (selectedContents.size > 0) {
        const selectedArray = Array.from(selectedContents);
        const selectedElement = selectedArray[selectedArray.length - 1];
        selectedElement.insertAdjacentHTML('afterend', '\n' + previewContent.trim());
      } else {
        elements.contentPreview.insertAdjacentHTML('beforeend', previewContent.trim());
      }

      // 選択状態の更新
      document.querySelectorAll('.content-block.selected').forEach(el => {
        el.classList.remove('selected');
        selectedContents.delete(el);
      });
      const newElement = elements.contentPreview.querySelector(`[data-content-id="${contentId}"]`);
      newElement.classList.add('selected');
      selectedContents.clear();
      selectedContents.add(newElement);
      lastSelectedContent = newElement;

      if (!isInViewport(newElement)) {
        newElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // イベント設定
      elements.contentPreview.querySelectorAll('.content-block').forEach(element => {
        setupContentSelection(element);
        setupContentEditable(element);
      });

      // カスタマイズUIの初期化
      hideAllCustomize();
      showCustomizeFor(newElement);

      elements.deleteButton.disabled = false;
      elements.moveUpButton.disabled = !newElement.previousElementSibling;
      elements.moveDownButton.disabled = !newElement.nextElementSibling;

      setTimeout(updateCode, 0);
    };

    // ── カスタマイズUI表示制御 ──────────────────────────────────
    const customizeKeys = ['text', 'longtext', 'richtext', 'image', 'list-type', 'steps'];

    const hideAllCustomize = () => {
      customizeKeys.forEach(key => {
        const group = document.querySelector(`.input-group[data-for="${key}"]`);
        if (group) group.style.display = 'none';
      });
    };

    const showCustomizeFor = (element) => {
      if (!element) return;
      const type = element.getAttribute('data-type');

      switch (type) {
        case 'title':
        case 'heading':
        case 'subheading':
        case 'miniheading':
          // ステップサブヘディングはダブルクリックで直接編集するため、テキスト入力欄は不要
          if (element.classList.contains('step-subheading')) break;
          document.querySelector('.input-group[data-for="text"]').style.display = 'block';
          elements.textInput.value = element.getAttribute('data-text');
          break;
        case 'text':
        case 'highlight':
        case 'description': {
          document.querySelector('.input-group[data-for="richtext"]').style.display = 'block';
          // プレビュー要素のinnerHTMLをリッチテキストエディタに反映
          const previewEl = type === 'text' ? element.querySelector('.wysiwyg-indent1')
            : type === 'highlight' ? element.querySelector('.warning-box')
            : element.querySelector('.description-container');
          elements.richTextEditor.innerHTML = previewEl ? previewEl.innerHTML : escapeHtml(element.getAttribute('data-text') || '');
          break;
        }
        case 'list':
          document.querySelector('.input-group[data-for="longtext"]').style.display = 'block';
          document.querySelector('.input-group[data-for="list-type"]').style.display = 'block';
          elements.longText.value = element.getAttribute('data-text');
          updateListTypeButtons(element.getAttribute('data-list-type') || 'ul');
          break;
        case 'image':
          document.querySelector('.input-group[data-for="image"]').style.display = 'block';
          elements.imageFileId.value = element.getAttribute('data-file-id') || '';
          elements.imageAlt.value = element.getAttribute('data-alt') || '';
          // 画像が読み込み済みならサイズUIを表示
          if (element.getAttribute('data-ratio')) {
            showImageSizeControls(element);
          } else {
            elements.imageSizeControls.style.display = 'none';
          }
          break;
        case 'steps': {
          document.querySelector('.input-group[data-for="steps"]').style.display = 'block';
          const stepsData = JSON.parse(element.getAttribute('data-steps') || '[]');
          elements.stepsDisplay.textContent = stepsData.length;
          updateStepsCustomizeUI(stepsData);
          break;
        }
      }
    };

    // ── リスト種類ボタン制御 ──────────────────────────────────
    const updateListTypeButtons = (activeType) => {
      document.getElementById('listTypeUl').classList.toggle('active', activeType === 'ul');
      document.getElementById('listTypeOl').classList.toggle('active', activeType === 'ol');
    };

    document.getElementById('listTypeUl').addEventListener('click', () => {
      updateListTypeButtons('ul');
      updateSelectedList('ul');
    });

    document.getElementById('listTypeOl').addEventListener('click', () => {
      updateListTypeButtons('ol');
      updateSelectedList('ol');
    });

    const updateSelectedList = (listType) => {
      if (selectedContents.size !== 1) return;
      const el = Array.from(selectedContents)[0];
      if (el.getAttribute('data-type') !== 'list') return;
      el.setAttribute('data-list-type', listType);
      const text = el.getAttribute('data-text');
      const items = text.split('\n').filter(l => l.trim());
      el.innerHTML = `<${listType} class="kn-list">${items.map(i => `<li>${i}</li>`).join('')}</${listType}>`;
      updateCode();
      addHistoryPoint();
    };

    // ── コンテンツ選択処理 ─────────────────────────────────────
    const setupContentSelection = (element) => {
      if (element.dataset.selectionBound) return;
      element.dataset.selectionBound = 'true';

      element.addEventListener('dblclick', () => {
        if (element.classList.contains('selected')) {
          hideAllCustomize();
          showCustomizeFor(element);
        }
      });

      element.addEventListener('click', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          element.classList.toggle('selected');
          element.classList.contains('selected')
            ? selectedContents.add(element)
            : selectedContents.delete(element);
          lastSelectedContent = element;
        } else if (e.shiftKey && lastSelectedContent) {
          const blocks = Array.from(document.querySelectorAll('.content-block'));
          const start = blocks.indexOf(lastSelectedContent);
          const end = blocks.indexOf(element);
          const range = blocks.slice(Math.min(start, end), Math.max(start, end) + 1);
          document.querySelectorAll('.content-block.selected').forEach(el => el.classList.remove('selected'));
          selectedContents.clear();
          range.forEach(el => {
            el.classList.add('selected');
            selectedContents.add(el);
          });
        } else {
          document.querySelectorAll('.content-block.selected').forEach(el => el.classList.remove('selected'));
          selectedContents.clear();
          element.classList.add('selected');
          selectedContents.add(element);
          lastSelectedContent = element;
        }

        hideAllCustomize();
        elements.deleteButton.disabled = false;
        updateMoveButtonStates();
        updateCode();
      });
    };

    // ── contenteditable による直接編集 ──────────────────────────
    // インラインフォーマット対応のテキスト系ブロックタイプ
    const inlineFormattableTypes = ['text', 'highlight', 'description'];

    const setupContentEditable = (element) => {
      if (element.dataset.editBound) return;
      element.dataset.editBound = 'true';

      const type = element.getAttribute('data-type');
      const p = element.querySelector('p');
      if (!p) return;

      p.setAttribute('contenteditable', 'false');

      if (['space', 'divider', 'steps', 'image'].includes(type)) return;

      // ステップサブヘディングの編集処理
      if (element.classList.contains('step-subheading')) {
        const titleP = element.querySelector('.step-subheading-content p');
        const stepLabel = element.querySelector('.step-label');
        if (!titleP) return;

        element.addEventListener('dblclick', () => {
          if (element.classList.contains('selected')) {
            titleP.setAttribute('contenteditable', 'true');
            titleP.focus();
          }
        });

        titleP.addEventListener('input', () => {
          const stepNumber = stepLabel.textContent.replace('STEP ', '');
          element.setAttribute('data-text', `STEP ${stepNumber} ${titleP.textContent}`);
          // ステップカードのタイトルも同期
          const stepGroupId = element.getAttribute('data-step-group-id');
          const stepCards = document.querySelector(`.step-cards-block[data-step-group-id="${stepGroupId}"]`);
          if (stepCards) {
            const steps = JSON.parse(stepCards.getAttribute('data-steps') || '[]');
            const updatedSteps = steps.map(step =>
              step.number === parseInt(stepNumber) ? { ...step, title: titleP.textContent } : step
            );
            stepCards.setAttribute('data-steps', JSON.stringify(updatedSteps));
            stepCards.innerHTML = generateStepCards(updatedSteps, stepGroupId);
          }
          updateCode();
        });

        titleP.addEventListener('blur', () => {
          titleP.setAttribute('contenteditable', 'false');
          addHistoryPoint();
        });

        titleP.addEventListener('mousedown', (e) => {
          if (titleP.getAttribute('contenteditable') !== 'true') e.preventDefault();
        });
        return;
      }

      p.addEventListener('mousedown', (e) => {
        if (p.getAttribute('contenteditable') !== 'true') e.preventDefault();
      });

      element.addEventListener('dblclick', () => {
        if (element.classList.contains('selected')) {
          p.setAttribute('contenteditable', 'true');
          p.focus();
        }
      });

      p.addEventListener('input', () => {
        // プレーンテキストを data-text に同期
        element.setAttribute('data-text', p.textContent);
        // リッチテキストエディタがあれば同期
        if (inlineFormattableTypes.includes(type) && selectedContents.has(element)) {
          elements.richTextEditor.innerHTML = p.innerHTML;
        }
        updateCode();
      });

      p.addEventListener('blur', () => {
        p.setAttribute('contenteditable', 'false');
        addHistoryPoint();
      });
    };

    // ── 移動ボタン状態更新 ─────────────────────────────────────
    const updateMoveButtonStates = () => {
      if (selectedContents.size > 0) {
        const selectedArray = Array.from(selectedContents);
        const canMoveUp = selectedArray.every(el => el.previousElementSibling);
        const canMoveDown = selectedArray.every(el => el.nextElementSibling);
        elements.moveUpButton.disabled = !canMoveUp;
        elements.moveDownButton.disabled = !canMoveDown;
      } else {
        elements.moveUpButton.disabled = true;
        elements.moveDownButton.disabled = true;
      }
    };

    // ── テキスト入力フィールドの連動 ─────────────────────────────
    elements.textInput.addEventListener('input', () => {
      if (selectedContents.size !== 1) return;
      const el = Array.from(selectedContents)[0];
      const type = el.getAttribute('data-type');
      const text = elements.textInput.value;
      el.setAttribute('data-text', text);

      if (['title', 'heading', 'subheading', 'miniheading'].includes(type)) {
        const p = el.querySelector('p');
        if (p) p.textContent = text;
      }
      updateCode();
    });

    // リッチテキストエディタの連動（text/highlight/description用）
    elements.richTextEditor.addEventListener('input', () => {
      if (selectedContents.size !== 1) return;
      const el = Array.from(selectedContents)[0];
      const type = el.getAttribute('data-type');
      if (!inlineFormattableTypes.includes(type)) return;

      const html = elements.richTextEditor.innerHTML;
      const plainText = elements.richTextEditor.textContent;
      el.setAttribute('data-text', plainText);

      // プレビュー要素のinnerHTMLを同期
      const previewEl = type === 'text' ? el.querySelector('.wysiwyg-indent1')
        : type === 'highlight' ? el.querySelector('.warning-box')
        : el.querySelector('.description-container');
      if (previewEl) previewEl.innerHTML = html;
      updateCode();
    });

    // 長文テキストの連動（リスト専用）
    elements.longText.addEventListener('input', () => {
      if (selectedContents.size !== 1) return;
      const el = Array.from(selectedContents)[0];
      const type = el.getAttribute('data-type');
      const text = elements.longText.value;
      el.setAttribute('data-text', text);

      if (type === 'list') {
        const listType = el.getAttribute('data-list-type') || 'ul';
        const items = text.split('\n').filter(l => l.trim());
        el.innerHTML = `<${listType} class="kn-list">${items.map(i => `<li>${i}</li>`).join('')}</${listType}>`;
      }
      updateCode();
    });

    // 画像フィールドの連動（URL自動解析対応）
    elements.imageFileId.addEventListener('input', () => {
      if (selectedContents.size !== 1) return;
      const el = Array.from(selectedContents)[0];
      if (el.getAttribute('data-type') !== 'image') return;
      const fileId = extractGDriveFileId(elements.imageFileId.value);
      el.setAttribute('data-file-id', fileId);
      updateImagePreview(el, fileId);
      updateCode();
    });

    elements.imageAlt.addEventListener('input', () => {
      if (selectedContents.size !== 1) return;
      const el = Array.from(selectedContents)[0];
      if (el.getAttribute('data-type') !== 'image') return;
      el.setAttribute('data-alt', elements.imageAlt.value);
      updateCode();
    });

    // 画像プレビュー更新
    const DEFAULT_IMAGE_WIDTH = 500;

    const updateImagePreview = (element, fileId) => {
      if (!fileId) {
        element.innerHTML = '<div class="image-placeholder"><p>gdrive:ファイルID を入力してください</p><p><a href="https://drive.google.com/drive/folders/14rH7DGzq8REwjDGdgBCstecrGgcqzx0S" target="_blank" rel="noopener noreferrer">画像置き場（Google Drive）にアップロード</a></p><p class="image-note">※ 画像のファイル名は内容が分かりやすい名前にしてください</p></div>';
        elements.imageSizeControls.style.display = 'none';
        return;
      }
      const img = document.createElement('img');
      img.className = 'knowledge-image';
      img.alt = element.getAttribute('data-alt') || '';
      element.innerHTML = '';
      element.appendChild(img);

      // 画像読み込み後にサイズを設定
      img.addEventListener('load', () => {
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;
        const ratio = naturalH / naturalW;
        element.setAttribute('data-natural-width', naturalW);
        element.setAttribute('data-natural-height', naturalH);
        element.setAttribute('data-ratio', ratio);

        // 既にwidthが設定済みならそれを使う、なければ初期値を設定
        let currentWidth = parseInt(element.getAttribute('data-width'));
        if (!currentWidth) {
          currentWidth = Math.min(DEFAULT_IMAGE_WIDTH, naturalW);
          element.setAttribute('data-width', currentWidth);
        }
        img.style.width = currentWidth + 'px';
        img.style.height = Math.round(currentWidth * ratio) + 'px';

        // サイズUIを更新
        showImageSizeControls(element);
      });

      const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
      fetch(url)
        .then(res => res.blob())
        .then(blob => {
          img.src = URL.createObjectURL(blob);
        })
        .catch(err => {
          console.error('画像の取得に失敗:', err);
          element.innerHTML = '<div class="image-placeholder"><p>画像の読み込みに失敗しました</p></div>';
        });
    };

    // 画像サイズUIの表示・更新
    const showImageSizeControls = (element) => {
      const width = parseInt(element.getAttribute('data-width')) || DEFAULT_IMAGE_WIDTH;
      const ratio = parseFloat(element.getAttribute('data-ratio')) || 1;
      const height = Math.round(width * ratio);
      elements.imageSizeControls.style.display = 'flex';
      elements.imageWidthInput.value = width;
      elements.imageHeightDisplay.textContent = `× ${height} px`;
    };

    // 画像サイズ変更の適用
    const applyImageSize = (width) => {
      if (selectedContents.size !== 1) return;
      const el = Array.from(selectedContents)[0];
      if (el.getAttribute('data-type') !== 'image') return;
      const ratio = parseFloat(el.getAttribute('data-ratio'));
      if (!ratio) return;

      width = Math.max(50, width);
      el.setAttribute('data-width', width);
      const img = el.querySelector('img');
      if (img) {
        img.style.width = width + 'px';
        img.style.height = Math.round(width * ratio) + 'px';
      }
      elements.imageWidthInput.value = width;
      elements.imageHeightDisplay.textContent = `× ${Math.round(width * ratio)} px`;
      updateCode();
    };

    elements.imageWidthInput.addEventListener('input', () => {
      const width = parseInt(elements.imageWidthInput.value);
      if (width && width >= 50) applyImageSize(width);
    });

    elements.imageDecrease.addEventListener('click', () => {
      const current = parseInt(elements.imageWidthInput.value) || DEFAULT_IMAGE_WIDTH;
      applyImageSize(current - 50);
      if (typeof addHistoryPoint === 'function') addHistoryPoint();
    });

    elements.imageIncrease.addEventListener('click', () => {
      const current = parseInt(elements.imageWidthInput.value) || DEFAULT_IMAGE_WIDTH;
      applyImageSize(current + 50);
      if (typeof addHistoryPoint === 'function') addHistoryPoint();
    });

    elements.imageWidthInput.addEventListener('change', () => {
      if (typeof addHistoryPoint === 'function') addHistoryPoint();
    });

    // ── コンテンツ追加ボタンのイベント設定 ─────────────────────────
    document.querySelectorAll('.content-button').forEach(button => {
      button.addEventListener('click', () => {
        addContentBlock(button.getAttribute('data-type'));
      });
    });

    // ── コピー機能 ────────────────────────────────────────────
    elements.copyButton.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = generateOutputHTML();
      navigator.clipboard.writeText(code).then(() => {
        const originalText = elements.copyButton.textContent;
        elements.copyButton.textContent = 'コピーしました！';
        elements.copyButton.style.backgroundColor = '#45a049';
        setTimeout(() => {
          elements.copyButton.textContent = originalText;
          elements.copyButton.style.backgroundColor = '#4CAF50';
        }, 2000);
      });
    });

    // ── インポート機能 ─────────────────────────────────────────
    const importModal = document.getElementById('importModal');
    const importTextarea = document.getElementById('importTextarea');
    const importApplyBtn = document.getElementById('importApplyBtn');
    const importCancelBtn = document.getElementById('importCancelBtn');
    const importButton = document.getElementById('importButton');

    importButton.addEventListener('click', (e) => {
      e.stopPropagation();
      importTextarea.value = '';
      importModal.style.display = 'flex';
      importTextarea.focus();
    });

    importCancelBtn.addEventListener('click', () => {
      importModal.style.display = 'none';
    });

    importModal.addEventListener('click', (e) => {
      if (e.target === importModal) importModal.style.display = 'none';
    });

    importApplyBtn.addEventListener('click', () => {
      const html = importTextarea.value.trim();
      if (!html) return;

      // 既存コンテンツがあれば確認
      if (elements.contentPreview.querySelector('.content-block')) {
        if (!confirm('既存のコンテンツを上書きしますか？')) return;
      }

      importHTML(html);
      importModal.style.display = 'none';
    });

    // HTMLパース → ブロック生成
    const importHTML = (html) => {
      // <!-- html --> コメントを除去
      html = html.replace(/<!--\s*html\s*-->\s*/g, '');

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;

      let blocksHtml = '';

      tempDiv.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          if (!node.textContent.trim()) return; // 空白のみスキップ
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const contentId = `content-${Date.now()}-${contentCounter++}`;
        const el = node;
        const tag = el.tagName.toLowerCase();
        const cls = el.className || '';

        // kn-title
        if (cls.includes('kn-title')) {
          const text = el.textContent;
          blocksHtml += `<div class="content-block" data-content-id="${contentId}" data-type="title" data-text="${escapeAttr(text)}">
            <div class="kn-title"><p contenteditable="false">${escapeHtml(text)}</p></div>
          </div>`;
          return;
        }

        // article_heading
        if (cls.includes('article_heading')) {
          const text = el.textContent.trim();
          blocksHtml += `<div class="content-block" data-content-id="${contentId}" data-type="heading" data-text="${escapeAttr(text)}">
            <div class="article_heading"><p contenteditable="false">${escapeHtml(text)}</p></div>
          </div>`;
          return;
        }

        // article_subheading（ステップサブヘディング含む）
        if (cls.includes('article_subheading')) {
          if (cls.includes('step-subheading')) {
            // ステップサブヘディングの復元
            const subContent = el.querySelector('.step-subheading-content');
            const stepLabel = subContent ? subContent.querySelector('.step-label') : null;
            const titleP = subContent ? subContent.querySelector('p') : null;
            const stepNumber = stepLabel ? stepLabel.textContent.replace('STEP ', '') : '1';
            const stepTitle = titleP ? titleP.textContent : '';
            const headingId = el.id || '';
            // stepGroupIdをheadingIdから逆算
            const stepGroupId = headingId.replace(/-step-\d+$/, '');
            blocksHtml += `<div class="content-block step-subheading" data-content-id="${contentId}" data-type="subheading" data-text="STEP ${stepNumber} ${stepTitle}" data-heading-id="${headingId}" data-step-group-id="${stepGroupId}">
              <div id="${headingId}" class="step-subheading-content">
                <div class="step-label" contenteditable="false">STEP ${stepNumber}</div>
                <p contenteditable="false">${escapeHtml(stepTitle)}</p>
              </div>
            </div>`;
          } else {
            const text = el.textContent.trim();
            blocksHtml += `<div class="content-block" data-content-id="${contentId}" data-type="subheading" data-text="${escapeAttr(text)}">
              <div class="article_subheading"><p contenteditable="false">${escapeHtml(text)}</p></div>
            </div>`;
          }
          return;
        }

        // kn-miniheading
        if (cls.includes('kn-miniheading')) {
          const text = el.textContent;
          blocksHtml += `<div class="content-block" data-content-id="${contentId}" data-type="miniheading" data-text="${escapeAttr(text)}">
            <p class="kn-miniheading" contenteditable="false">${escapeHtml(text)}</p>
          </div>`;
          return;
        }

        // article-divider
        if (cls.includes('article-divider')) {
          blocksHtml += `<div class="content-block" data-content-id="${contentId}" data-type="divider">
            <div class="article-divider"></div>
          </div>`;
          return;
        }

        // step-cards
        if (cls.includes('step-cards')) {
          const steps = [];
          el.querySelectorAll('.step-card').forEach(card => {
            const label = card.querySelector('.step-label');
            const title = card.querySelector('.step-title');
            const note = card.querySelector('.step-note');
            const num = label ? parseInt(label.textContent.replace(/\D/g, '')) : steps.length + 1;
            steps.push({
              number: num,
              title: title ? title.textContent : '',
              note: note ? note.textContent : ''
            });
          });
          const stepGroupId = `step-group-${Date.now()}-${contentCounter}`;
          const stepsJson = JSON.stringify(steps);
          blocksHtml += `<div class="content-block step-cards-block" data-content-id="${contentId}" data-type="steps" data-steps='${escapeAttr(stepsJson)}' data-step-group-id="${stepGroupId}">
            ${generateStepCards(steps, stepGroupId)}
          </div>`;
          // インポート時、直後にステップサブヘディングが続かない場合は自動生成
          // （ステップサブヘディングがHTMLに含まれていれば別途復元されるのでここでは生成しない）
          return;
        }

        // img (knowledge-image)
        if (tag === 'img') {
          const fileId = el.getAttribute('data-gdrive-id') || '';
          const alt = el.getAttribute('alt') || '';
          const imgWidth = el.getAttribute('width') || '';
          const dataWidthAttr = imgWidth ? ` data-width="${escapeAttr(imgWidth)}"` : '';
          const previewInner = fileId
            ? `<img class="knowledge-image" src="https://drive.google.com/uc?export=download&id=${escapeAttr(fileId)}" alt="${escapeAttr(alt)}">`
            : '<div class="image-placeholder"><p>gdrive:ファイルID を入力してください</p><p><a href="https://drive.google.com/drive/folders/14rH7DGzq8REwjDGdgBCstecrGgcqzx0S" target="_blank" rel="noopener noreferrer">画像置き場（Google Drive）にアップロード</a></p><p class="image-note">※ 画像のファイル名は内容が分かりやすい名前にしてください</p></div>';
          blocksHtml += `<div class="content-block" data-content-id="${contentId}" data-type="image" data-file-id="${escapeAttr(fileId)}" data-alt="${escapeAttr(alt)}"${dataWidthAttr}>
            ${previewInner}
          </div>`;
          return;
        }

        // ul/ol (kn-list)
        if ((tag === 'ul' || tag === 'ol') && cls.includes('kn-list')) {
          const items = Array.from(el.querySelectorAll('li')).map(li => li.textContent);
          const text = items.join('\n');
          blocksHtml += `<div class="content-block" data-content-id="${contentId}" data-type="list" data-text="${escapeAttr(text)}" data-list-type="${tag}">
            <${tag} class="kn-list">${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</${tag}>
          </div>`;
          return;
        }

        // p タグ系
        if (tag === 'p') {
          // space
          if (el.innerHTML.trim() === '&nbsp;' || el.textContent.trim() === '') {
            blocksHtml += `<div class="content-block" data-content-id="${contentId}" data-type="space">
              <p class="wysiwyg-indent1">&nbsp;</p>
            </div>`;
            return;
          }

          // warning-box (highlight)
          if (cls.includes('warning-box')) {
            const inlineHtml = el.innerHTML;
            const text = el.textContent;
            blocksHtml += `<div class="content-block" data-content-id="${contentId}" data-type="highlight" data-text="${escapeAttr(text)}">
              <p class="wysiwyg-indent1 warning-box" contenteditable="false">${inlineHtml}</p>
            </div>`;
            return;
          }

          // description-container
          if (cls.includes('description-container')) {
            const inlineHtml = el.innerHTML;
            const text = el.textContent;
            blocksHtml += `<div class="content-block" data-content-id="${contentId}" data-type="description" data-text="${escapeAttr(text)}">
              <p class="wysiwyg-indent1 description-container" contenteditable="false">${inlineHtml}</p>
            </div>`;
            return;
          }

          // 通常テキスト (wysiwyg-indent1 or 無クラス)
          const inlineHtml = el.innerHTML;
          const text = el.textContent;
          blocksHtml += `<div class="content-block" data-content-id="${contentId}" data-type="text" data-text="${escapeAttr(text)}">
            <p class="wysiwyg-indent1" contenteditable="false">${inlineHtml}</p>
          </div>`;
          return;
        }
      });

      // プレビューに反映
      elements.contentPreview.innerHTML = blocksHtml;
      selectedContents.clear();
      lastSelectedContent = null;
      hideAllCustomize();
      elements.deleteButton.disabled = true;
      elements.moveUpButton.disabled = true;
      elements.moveDownButton.disabled = true;

      // イベント設定
      elements.contentPreview.querySelectorAll('.content-block').forEach(el => {
        el.dataset.selectionBound = '';
        el.dataset.editBound = '';
        setupContentSelection(el);
        setupContentEditable(el);
      });

      // 画像プレビューをfetchで取得
      elements.contentPreview.querySelectorAll('.content-block[data-type="image"]').forEach(el => {
        const fileId = el.getAttribute('data-file-id');
        if (fileId) updateImagePreview(el, fileId);
      });

      updateCode();
      addHistoryPoint();
    };

    // ── 表示切替（トグル）機能 ───────────────────────────────────
    document.querySelectorAll('.toggle-button').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const view = button.getAttribute('data-view');
        const section = button.closest('.content-section');
        section.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        if (view === 'preview') {
          section.querySelector('.preview-area').classList.add('active');
          section.querySelector('.code-area').classList.remove('active');
        } else {
          updateCode();
          section.querySelector('.preview-area').classList.remove('active');
          section.querySelector('.code-area').classList.add('active');
        }
      });
    });

    // ── 削除ボタン ──────────────────────────────────────────
    elements.deleteButton.addEventListener('click', () => {
      if (selectedContents.size > 0) {
        Array.from(selectedContents).forEach(content => {
          // ステップカード削除時は関連サブヘディングも削除
          if (content.classList.contains('step-cards-block')) {
            const stepGroupId = content.getAttribute('data-step-group-id');
            document.querySelectorAll(`.step-subheading[data-step-group-id="${stepGroupId}"]`).forEach(el => el.remove());
          }
          content.remove();
        });
        selectedContents.clear();
        lastSelectedContent = null;
        hideAllCustomize();
        elements.deleteButton.disabled = true;
        elements.moveUpButton.disabled = true;
        elements.moveDownButton.disabled = true;
        updateCode();
        addHistoryPoint();
      }
    });

    // ── 移動ボタン ──────────────────────────────────────────
    elements.moveUpButton.addEventListener('click', () => {
      if (selectedContents.size > 0) {
        const selectedArray = Array.from(selectedContents).sort((a, b) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
        );
        selectedArray.forEach(content => {
          if (content.previousElementSibling) {
            content.parentNode.insertBefore(content, content.previousElementSibling);
          }
        });
        updateCode();
        updateMoveButtonStates();
        addHistoryPoint();
      }
    });

    elements.moveDownButton.addEventListener('click', () => {
      if (selectedContents.size > 0) {
        const selectedArray = Array.from(selectedContents).sort((a, b) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1
        );
        selectedArray.forEach(content => {
          if (content.nextElementSibling && content.nextElementSibling.nextElementSibling) {
            content.parentNode.insertBefore(content, content.nextElementSibling.nextElementSibling);
          } else if (content.nextElementSibling) {
            content.parentNode.appendChild(content);
          }
        });
        updateCode();
        updateMoveButtonStates();
        addHistoryPoint();
      }
    });

    // ── ステップ数増減 ──────────────────────────────────────
    document.getElementById('decreaseSteps').addEventListener('click', () => {
      const selectedStep = Array.from(selectedContents).find(el => el.getAttribute('data-type') === 'steps');
      if (!selectedStep) return;
      const stepsData = JSON.parse(selectedStep.getAttribute('data-steps') || '[]');
      if (stepsData.length <= 1) return;
      const stepGroupId = selectedStep.getAttribute('data-step-group-id');
      const currentSteps = stepsData.length;
      stepsData.pop();
      selectedStep.setAttribute('data-steps', JSON.stringify(stepsData));
      selectedStep.innerHTML = generateStepCards(stepsData, stepGroupId);
      // 削除対象のサブヘディングを除去
      const targetHeadingId = `${stepGroupId}-step-${currentSteps}`;
      const subheading = document.querySelector(`.step-subheading[data-heading-id="${targetHeadingId}"]`);
      if (subheading) subheading.remove();
      elements.stepsDisplay.textContent = stepsData.length;
      updateStepsCustomizeUI(stepsData);
      updateCode();
      addHistoryPoint();
    });

    document.getElementById('increaseSteps').addEventListener('click', () => {
      const selectedStep = Array.from(selectedContents).find(el => el.getAttribute('data-type') === 'steps');
      if (!selectedStep) return;
      const stepsData = JSON.parse(selectedStep.getAttribute('data-steps') || '[]');
      const stepGroupId = selectedStep.getAttribute('data-step-group-id');
      const newNumber = stepsData.length + 1;
      const newStep = { number: newNumber, title: `STEP ${newNumber}のタイトル`, note: '' };
      stepsData.push(newStep);
      selectedStep.setAttribute('data-steps', JSON.stringify(stepsData));
      selectedStep.innerHTML = generateStepCards(stepsData, stepGroupId);
      // 新しいサブヘディングを最後のサブヘディングの後に挿入
      const lastSubheading = document.querySelector(`.step-subheading[data-heading-id="${stepGroupId}-step-${newNumber - 1}"]`);
      const newContent = addStepSubheading(newStep, stepGroupId);
      if (lastSubheading) {
        lastSubheading.insertAdjacentHTML('afterend', newContent);
      } else {
        selectedStep.insertAdjacentHTML('afterend', newContent);
      }
      // 新要素にイベント設定
      const newSubheading = document.querySelector(`.step-subheading[data-heading-id="${stepGroupId}-step-${newNumber}"]`);
      if (newSubheading) {
        newSubheading.dataset.selectionBound = '';
        newSubheading.dataset.editBound = '';
        setupContentSelection(newSubheading);
        setupContentEditable(newSubheading);
      }
      elements.stepsDisplay.textContent = stepsData.length;
      updateStepsCustomizeUI(stepsData);
      updateCode();
      addHistoryPoint();
    });

    // ── ステップカスタマイズUI ─────────────────────────────────
    const updateStepsCustomizeUI = (steps) => {
      elements.stepsCustomize.innerHTML = steps.map(step => `
        <div class="step-input" data-step="${step.number}">
          <h4>STEP ${step.number}</h4>
          <div class="input-row">
            <label>タイトル：</label>
            <input type="text" class="step-title-input" value="${step.title}">
          </div>
          <div class="input-row">
            <label>補足：</label>
            <input type="text" class="step-note-input" value="${step.note}">
          </div>
        </div>
      `).join('');

      const selectedStep = Array.from(selectedContents).find(el => el.getAttribute('data-type') === 'steps');
      if (!selectedStep) return;

      elements.stepsCustomize.querySelectorAll('input').forEach(input => {
        ['keyup', 'change'].forEach(eventType => {
          input.addEventListener(eventType, () => {
            const updatedSteps = Array.from(document.querySelectorAll('.step-input')).map(stepInput => ({
              number: parseInt(stepInput.dataset.step),
              title: stepInput.querySelector('.step-title-input').value,
              note: stepInput.querySelector('.step-note-input').value
            }));
            selectedStep.setAttribute('data-steps', JSON.stringify(updatedSteps));
            const stepGroupId = selectedStep.getAttribute('data-step-group-id');
            selectedStep.innerHTML = generateStepCards(updatedSteps, stepGroupId);
            // サブヘディングのタイトルも連動更新
            updatedSteps.forEach(step => {
              const headingId = `${stepGroupId}-step-${step.number}`;
              const subheading = document.querySelector(`.step-subheading[data-heading-id="${headingId}"]`);
              if (subheading) {
                subheading.querySelector('.step-label').textContent = `STEP ${step.number}`;
                subheading.querySelector('p').textContent = step.title;
                subheading.setAttribute('data-text', `STEP ${step.number} ${step.title}`);
              }
            });
            updateCode();
          });
        });
      });
    };

    // ── インラインフォーマットツールバー ────────────────────────
    const boldFormatBtn = document.getElementById('boldFormatBtn');
    const linkFormatBtn = document.getElementById('linkFormatBtn');

    // リッチテキストエディタにフォーカスがあるか確認
    const isRichTextEditorActive = () => {
      return document.activeElement === elements.richTextEditor ||
             elements.richTextEditor.contains(document.activeElement);
    };

    // リッチテキストエディタの内容をプレビューに同期するヘルパー
    const syncRichTextToPreview = () => {
      if (selectedContents.size !== 1) return;
      const el = Array.from(selectedContents)[0];
      const type = el.getAttribute('data-type');
      if (!inlineFormattableTypes.includes(type)) return;

      const html = elements.richTextEditor.innerHTML;
      el.setAttribute('data-text', elements.richTextEditor.textContent);

      const previewEl = type === 'text' ? el.querySelector('.wysiwyg-indent1')
        : type === 'highlight' ? el.querySelector('.warning-box')
        : el.querySelector('.description-container');
      if (previewEl) previewEl.innerHTML = html;
      updateCode();
    };

    // 書式適用後、カーソルを書式タグの外に移動するヘルパー
    const escapeFormattingAndCollapse = () => {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      sel.collapseToEnd();

      // カーソルが <strong>/<b>/<a> の中にいたら外に出す
      let node = sel.anchorNode;
      let formatEl = null;
      while (node && node !== elements.richTextEditor) {
        if (node.nodeType === Node.ELEMENT_NODE &&
            ['STRONG', 'B', 'A'].includes(node.tagName)) {
          formatEl = node;
          break;
        }
        node = node.parentNode;
      }
      if (formatEl) {
        // 書式タグの直後にゼロ幅スペースを挿入してカーソルを置く
        let next = formatEl.nextSibling;
        if (!next || next.nodeType !== Node.TEXT_NODE) {
          next = document.createTextNode('\u200B');
          formatEl.parentNode.insertBefore(next, formatEl.nextSibling);
        }
        const range = document.createRange();
        range.setStart(next, next.nodeType === Node.TEXT_NODE ? next.length : 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    };

    boldFormatBtn.addEventListener('mousedown', (e) => {
      // mousedown で処理（click だと selection が消える）
      e.preventDefault();
      if (!isRichTextEditorActive()) return;
      document.execCommand('bold', false, null);
      syncRichTextToPreview();
      escapeFormattingAndCollapse();
    });

    linkFormatBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (!isRichTextEditorActive()) return;
      const selection = window.getSelection();
      if (!selection.rangeCount || selection.isCollapsed) return;
      // 既にリンクの中にいるか確認
      const anchorNode = selection.anchorNode;
      const existingLink = anchorNode.parentElement.closest('a');
      if (existingLink) {
        // リンク解除
        document.execCommand('unlink', false, null);
      } else {
        const url = prompt('リンクURLを入力してください:', 'https://');
        if (url) {
          document.execCommand('createLink', false, url);
          // target="_blank" を設定
          const newLinks = elements.richTextEditor.querySelectorAll('a:not([target])');
          newLinks.forEach(a => a.setAttribute('target', '_blank'));
        }
      }
      syncRichTextToPreview();
      escapeFormattingAndCollapse();
    });

    // Ctrl+B のショートカット（リッチテキストエディタ内）
    elements.richTextEditor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        document.execCommand('bold', false, null);
        syncRichTextToPreview();
        escapeFormattingAndCollapse();
      }
    });

    // ── コンテンツ外クリックで選択解除 ───────────────────────────
    elements.container.addEventListener('click', (e) => {
      if (!e.target.closest('.content-block') && !e.target.closest('.customize-area') && !e.target.closest('.content-button')) {
        document.querySelectorAll('.content-block.selected').forEach(el => el.classList.remove('selected'));
        selectedContents.clear();
        lastSelectedContent = null;
        hideAllCustomize();
        elements.deleteButton.disabled = true;
        elements.moveUpButton.disabled = true;
        elements.moveDownButton.disabled = true;
        updateCode();
      }
    });

    // ── 履歴管理（Undo/Redo） ───────────────────────────────────
    const addToHistory = () => {
      const state = {
        html: elements.contentPreview.innerHTML,
        selectedIds: Array.from(selectedContents).map(el => el.getAttribute('data-content-id'))
      };
      history = history.slice(0, currentHistoryIndex + 1);
      history.push(state);
      if (history.length > maxHistorySize) history.shift();
      currentHistoryIndex = history.length - 1;
      updateHistoryButtons();
    };

    const updateHistoryButtons = () => {
      elements.undoButton.disabled = currentHistoryIndex <= 0;
      elements.redoButton.disabled = currentHistoryIndex >= history.length - 1;
    };

    const restoreState = (state) => {
      elements.contentPreview.innerHTML = state.html;
      selectedContents.clear();
      state.selectedIds.forEach(id => {
        const el = elements.contentPreview.querySelector(`[data-content-id="${id}"]`);
        if (el) {
          el.classList.add('selected');
          selectedContents.add(el);
          lastSelectedContent = el;
        }
      });
      elements.contentPreview.querySelectorAll('.content-block').forEach(el => {
        setupContentSelection(el);
        setupContentEditable(el);
      });
      updateCode();
      updateMoveButtonStates();
    };

    const undo = () => {
      if (currentHistoryIndex > 0) {
        currentHistoryIndex--;
        restoreState(history[currentHistoryIndex]);
        updateHistoryButtons();
      }
    };

    const redo = () => {
      if (currentHistoryIndex < history.length - 1) {
        currentHistoryIndex++;
        restoreState(history[currentHistoryIndex]);
        updateHistoryButtons();
      }
    };

    elements.undoButton.addEventListener('click', undo);
    elements.redoButton.addEventListener('click', redo);

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          undo();
        } else if (e.key === 'y') {
          e.preventDefault();
          redo();
        }
      }
    });

    const addHistoryPoint = () => setTimeout(addToHistory, 0);

    elements.longText.addEventListener('change', addHistoryPoint);
    elements.richTextEditor.addEventListener('blur', addHistoryPoint);
    elements.textInput.addEventListener('change', addHistoryPoint);
    elements.imageFileId.addEventListener('change', addHistoryPoint);
    elements.imageAlt.addEventListener('change', addHistoryPoint);

    // 初期履歴ポイント
    addHistoryPoint();

    // コンテンツ追加と削除に履歴を付与
    const wrapWithHistory = (func) => (...args) => {
      const result = func(...args);
      addHistoryPoint();
      return result;
    };

    const originalAddContentBlock = addContentBlock;
    addContentBlock = wrapWithHistory(originalAddContentBlock);

    document.getElementById('stepsCustomize').addEventListener('change', (e) => {
      if (e.target.matches('input')) addHistoryPoint();
    });

    document.addEventListener('blur', (e) => {
      const contentBlock = e.target.closest('.content-block');
      if (contentBlock && e.target.getAttribute('contenteditable') === 'true') addHistoryPoint();
    }, true);
  });