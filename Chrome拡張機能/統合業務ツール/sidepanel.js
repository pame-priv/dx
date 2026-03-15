import { businessConfig } from './business_config.js';
import { menuConfig as menuConfigA } from './業務A/menu_config.js';
import { menuConfig as menuConfigB } from './業務B/menu_config.js';
import { menuConfig as menuConfigC } from './業務C/menu_config.js';

const STORAGE_KEY = 'selectedBusiness';
const STORAGE_KEY_FONT_SIZE = 'fontSize';
const DEFAULT_FONT_SIZE = 16;

// 業務IDとconfigのマッピング
const menuConfigs = {
  gyomuA: menuConfigA,
  gyomuB: menuConfigB,
  gyomuC: menuConfigC,
};

// DOM要素
const businessSelect = document.getElementById('businessSelect');
const menuContainer = document.getElementById('menuContainer');

// 初期化
async function init() {
  // 保存されたフォントサイズを適用
  await applyFontSize();

  // プルダウンに業務一覧をセット
  businessConfig.forEach(business => {
    const option = document.createElement('option');
    option.value = business.id;
    option.textContent = business.name;
    businessSelect.appendChild(option);
  });

  // 保存された業務を復元
  const saved = await chrome.storage.local.get(STORAGE_KEY);
  if (saved[STORAGE_KEY]) {
    businessSelect.value = saved[STORAGE_KEY];
  }

  // メニューを読み込む
  loadMenus();

  // プルダウン変更時
  businessSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ [STORAGE_KEY]: businessSelect.value });
    loadMenus();
  });
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

// メニュー読み込み
function loadMenus() {
  const selectedId = businessSelect.value;
  const config = menuConfigs[selectedId];

  // ヘッダー色変更用
  document.body.dataset.business = selectedId;

  if (!config) {
    menuContainer.innerHTML = '<p>業務が選択されていないか、設定がありません</p>';
    return;
  }

  renderMenus(config.items);
}

// メニュー描画
function renderMenus(items) {
  menuContainer.innerHTML = '';

  items.forEach(item => {
    if (item.type === 'menu') {
      // 単独メニュー
      const button = createMenuButton(item.name, item.path);
      menuContainer.appendChild(button);
    } else if (item.type === 'accordion') {
      // アコーディオン
      const accordion = createAccordion(item.name, item.menus);
      menuContainer.appendChild(accordion);
    }
  });
}

// メニューボタン作成
function createMenuButton(name, path) {
  const button = document.createElement('button');
  button.className = 'menu-button';
  button.textContent = name;
  button.addEventListener('click', () => {
    window.location.href = path;
  });
  return button;
}

// アコーディオン作成
function createAccordion(name, menus) {
  const wrapper = document.createElement('div');
  wrapper.className = 'accordion';

  const header = document.createElement('button');
  header.className = 'accordion-header';
  header.textContent = name;

  const content = document.createElement('div');
  content.className = 'accordion-content';

  const contentInner = document.createElement('div');
  contentInner.className = 'accordion-content-inner';

  menus.forEach(menu => {
    const button = createMenuButton(menu.name, menu.path);
    contentInner.appendChild(button);
  });

  content.appendChild(contentInner);

  header.addEventListener('click', () => {
    header.classList.toggle('open');
    content.classList.toggle('open');
  });

  wrapper.appendChild(header);
  wrapper.appendChild(content);
  return wrapper;
}

// 実行
init();