const STORAGE_KEY_BUSINESS = 'selectedBusiness';
const STORAGE_KEY_FONT_SIZE = 'fontSize';
const DEFAULT_FONT_SIZE = 16;

// 共通ヘッダーを挿入
export async function insertHeader() {
  try {
    // 業務IDを取得してbodyに設定
    await applyBusinessTheme();
    
    // 保存されたフォントサイズを適用
    await applyFontSize();

    const response = await fetch(chrome.runtime.getURL('common/header/header.html'));
    const html = await response.text();

    const headerContainer = document.createElement('div');
    headerContainer.innerHTML = html;
    document.body.insertBefore(headerContainer.firstElementChild, document.body.firstChild);

    // ヘッダーのCSSを読み込む
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('common/header/header.css');
    document.head.appendChild(link);

    // ヘッダーのイベント設定
    setupHeaderEvents();
  } catch (error) {
    console.error('ヘッダー読み込みエラー:', error);
  }
}

// 業務テーマを適用
async function applyBusinessTheme() {
  try {
    const saved = await chrome.storage.local.get(STORAGE_KEY_BUSINESS);
    if (saved[STORAGE_KEY_BUSINESS]) {
      document.body.dataset.business = saved[STORAGE_KEY_BUSINESS];
    }
  } catch (error) {
    console.error('業務テーマ取得エラー:', error);
  }
}

// フォントサイズを適用
async function applyFontSize() {
  try {
    const saved = await chrome.storage.local.get(STORAGE_KEY_FONT_SIZE);
    const fontSize = saved[STORAGE_KEY_FONT_SIZE] || DEFAULT_FONT_SIZE;
    document.documentElement.style.fontSize = fontSize + 'px';
  } catch (error) {
    console.error('フォントサイズ取得エラー:', error);
  }
}

function setupHeaderEvents() {
  // 戻るボタン
  document.getElementById('backButton')?.addEventListener('click', () => {
    history.back();
  });

  // TOPボタン
  document.getElementById('topButton')?.addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('sidepanel.html');
  });

  // フォントサイズスライダー
  const slider = document.getElementById('fontSizeSlider');
  if (slider) {
    // 現在の値をセット
    chrome.storage.local.get(STORAGE_KEY_FONT_SIZE).then(saved => {
      slider.value = saved[STORAGE_KEY_FONT_SIZE] || DEFAULT_FONT_SIZE;
    });

    // スライダー変更時
    slider.addEventListener('input', (e) => {
      const newSize = e.target.value;
      document.documentElement.style.fontSize = newSize + 'px';
    });

    // スライダー確定時に保存
    slider.addEventListener('change', (e) => {
      const newSize = e.target.value;
      chrome.storage.local.set({ [STORAGE_KEY_FONT_SIZE]: Number(newSize) });
    });

    // ダブルクリックで初期値に戻す
    slider.addEventListener('dblclick', () => {
      slider.value = DEFAULT_FONT_SIZE;
      document.documentElement.style.fontSize = DEFAULT_FONT_SIZE + 'px';
      chrome.storage.local.set({ [STORAGE_KEY_FONT_SIZE]: DEFAULT_FONT_SIZE });
    });
  }
}

// 外部リンク → chrome.tabs.create で新規タブに開く（サイドパネル対応）
document.body.addEventListener('click', (e) => {
  const link = e.target.closest('a[href]');
  if (link && link.href.startsWith('http')) {
    e.preventDefault();
    chrome.tabs.create({ url: link.href });
  }
});

// ページ読み込み時に自動実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', insertHeader);
} else {
  insertHeader();
}