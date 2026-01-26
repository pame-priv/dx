import { parseMarkdown, setupMarkdownImages, resolveAssetPaths } from '../../common/markdown/markdown-parser.js';

// 現在のHTMLのパスから基準パスを自動取得
const currentPath = location.pathname;
const basePath = currentPath.substring(0, currentPath.lastIndexOf('/'));
const ASSET_BASE_PATH = basePath + '/data';

// ナレッジデータ
let knowledgeData = [];
let currentLevel = 'category1'; // 'category1' | 'category2' | 'items'
let selectedCategory1 = null;
let selectedCategory2 = null;

// 検索・フィルター状態
let searchQuery = '';
let filterCategory1 = '';
let filterCategory2 = '';
let isSearchMode = false;

// DOM要素
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const filterButton = document.getElementById('filterButton');
const filterLabel = document.getElementById('filterLabel');
const filterMenu = document.getElementById('filterMenu');
const sidebar = document.getElementById('sidebar');
const backButton = document.getElementById('backButton');
const sidebarTitle = document.getElementById('sidebarTitle');
const categoryList = document.getElementById('categoryList');
const mainContent = document.getElementById('mainContent');
const emptyState = document.getElementById('emptyState');
const cardGrid = document.getElementById('cardGrid');
const modalOverlay = document.getElementById('modalOverlay');
const modal = document.getElementById('modal');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalNote = document.getElementById('modalNote');

// 初期化
async function init() {
  try {
    const response = await fetch(chrome.runtime.getURL(basePath + '/data/knowledge.json'));
    knowledgeData = await response.json();
    renderCategory1();
    buildFilterMenu();
    setupEventListeners();
  } catch (error) {
    console.error('データ読み込みエラー:', error);
    categoryList.innerHTML = '<p style="padding: 1rem; color: #999;">データの読み込みに失敗しました</p>';
  }
}

// イベントリスナー設定
function setupEventListeners() {
  // 戻るボタン
  backButton.addEventListener('click', goBack);

  // モーダル閉じる
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeModal();
    }
  });

  // ESCキーでモーダル閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeFilterMenu();
    }
  });

  // 検索入力
  searchInput.addEventListener('input', handleSearch);

  // 検索クリア
  searchClear.addEventListener('click', clearSearch);

  // フィルタードロップダウン
  filterButton.addEventListener('click', toggleFilterMenu);

  // 外部クリックでフィルターメニューを閉じる
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-dropdown')) {
      closeFilterMenu();
    }
  });
}

// フィルターメニューを構築
function buildFilterMenu() {
  // カテゴリ1のユニーク一覧を取得
  const category1List = [...new Set(knowledgeData.map(item => item.category1))];

  let menuHTML = `
    <div class="filter-option active" data-category1="" data-category2="">
      すべてのカテゴリ
    </div>
  `;

  category1List.forEach(cat1 => {
    // このカテゴリ1に属するカテゴリ2を取得
    const category2List = [...new Set(
      knowledgeData
        .filter(item => item.category1 === cat1)
        .map(item => item.category2)
    )];

    menuHTML += `
      <div class="filter-group" data-category1="${cat1}">
        <div class="filter-group-header">
          <span>${cat1}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div class="filter-group-items">
          <div class="filter-option" data-category1="${cat1}" data-category2="">
            ${cat1}のすべて
          </div>
          ${category2List.map(cat2 => `
            <div class="filter-option" data-category1="${cat1}" data-category2="${cat2}">
              ${cat2}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });

  filterMenu.innerHTML = menuHTML;

  // フィルターグループのクリックイベント
  filterMenu.querySelectorAll('.filter-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = header.closest('.filter-group');
      group.classList.toggle('open');
    });
  });

  // フィルターオプションのクリックイベント
  filterMenu.querySelectorAll('.filter-option').forEach(option => {
    option.addEventListener('click', () => {
      selectFilter(
        option.dataset.category1,
        option.dataset.category2,
        option.textContent.trim()
      );
    });
  });
}

// フィルター選択
function selectFilter(cat1, cat2, label) {
  filterCategory1 = cat1;
  filterCategory2 = cat2;
  filterLabel.textContent = label;

  // アクティブ状態を更新
  filterMenu.querySelectorAll('.filter-option').forEach(opt => {
    opt.classList.remove('active');
    if (opt.dataset.category1 === cat1 && opt.dataset.category2 === cat2) {
      opt.classList.add('active');
    }
  });

  closeFilterMenu();
  performSearch();
}

// フィルターメニュー開閉
function toggleFilterMenu() {
  filterMenu.classList.toggle('active');
  filterButton.classList.toggle('active');
}

function closeFilterMenu() {
  filterMenu.classList.remove('active');
  filterButton.classList.remove('active');
}

// 検索処理
function handleSearch(e) {
  searchQuery = e.target.value.trim();
  searchClear.style.display = searchQuery ? 'flex' : 'none';
  performSearch();
}

// 検索クリア
function clearSearch() {
  searchInput.value = '';
  searchQuery = '';
  searchClear.style.display = 'none';
  performSearch();
}

// 検索実行
function performSearch() {
  isSearchMode = searchQuery !== '' || filterCategory1 !== '';

  if (isSearchMode) {
    // 検索モード
    let results = [...knowledgeData];

    // カテゴリフィルター
    if (filterCategory1) {
      results = results.filter(item => item.category1 === filterCategory1);
      if (filterCategory2) {
        results = results.filter(item => item.category2 === filterCategory2);
      }
    }

    // キーワード検索（AND検索）
    if (searchQuery) {
      const keywords = searchQuery.toLowerCase().split(/\s+/);
      results = results.filter(item => {
        const searchTarget = `${item.title} ${item.description} ${item.body} ${item.note}`.toLowerCase();
        return keywords.every(keyword => searchTarget.includes(keyword));
      });
    }

    renderSearchResults(results);
  } else {
    // 通常モード
    exitSearchMode();
  }
}

// 検索結果を表示
function renderSearchResults(results) {
  // サイドバーを非表示
  sidebar.style.display = 'none';

  emptyState.style.display = 'none';
  cardGrid.innerHTML = '';

  if (results.length === 0) {
    showEmptyState('該当するナレッジがありません');
    return;
  }

  results.forEach(item => {
    const card = createKnowledgeCard(item, true);
    cardGrid.appendChild(card);
  });
}

// 検索モード終了
function exitSearchMode() {
  isSearchMode = false;
  sidebar.style.display = 'flex';

  // 現在のカテゴリ状態に応じて表示
  if (currentLevel === 'category1') {
    renderCategory1();
  } else if (currentLevel === 'category2') {
    renderCategory2();
    if (selectedCategory2) {
      renderKnowledgeCards();
    } else {
      showEmptyState();
    }
  }
}

// カテゴリ1を表示
function renderCategory1() {
  currentLevel = 'category1';
  selectedCategory1 = null;
  selectedCategory2 = null;

  backButton.style.display = 'none';
  sidebarTitle.textContent = 'カテゴリ';

  // カテゴリ1のユニーク一覧を取得
  const categories = [...new Set(knowledgeData.map(item => item.category1))];

  categoryList.innerHTML = '';
  categories.forEach(cat => {
    const button = createCategoryButton(cat, () => selectCategory1(cat));
    categoryList.appendChild(button);
  });

  // メインエリアをリセット
  showEmptyState();
}

// カテゴリ2を表示
function renderCategory2() {
  currentLevel = 'category2';

  backButton.style.display = 'flex';
  sidebarTitle.textContent = selectedCategory1;

  // 選択したカテゴリ1に属するカテゴリ2を取得
  const items = knowledgeData.filter(item => item.category1 === selectedCategory1);
  const categories = [...new Set(items.map(item => item.category2))];

  categoryList.innerHTML = '';
  categories.forEach(cat => {
    const button = createCategoryButton(cat, () => selectCategory2(cat));
    categoryList.appendChild(button);
  });
}

// ナレッジカード一覧を表示
function renderKnowledgeCards() {
  currentLevel = 'items';

  // 選択したカテゴリに属するナレッジを取得
  const items = knowledgeData.filter(
    item => item.category1 === selectedCategory1 && item.category2 === selectedCategory2
  );

  if (items.length === 0) {
    showEmptyState('ナレッジがありません');
    return;
  }

  emptyState.style.display = 'none';
  cardGrid.innerHTML = '';

  items.forEach(item => {
    const card = createKnowledgeCard(item, false);
    cardGrid.appendChild(card);
  });
}

// カテゴリボタン作成
function createCategoryButton(text, onClick) {
  const button = document.createElement('button');
  button.className = 'category-item';
  button.innerHTML = `
    <span>${text}</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  `;
  button.addEventListener('click', onClick);
  return button;
}

// ナレッジカード作成
function createKnowledgeCard(item, showCategory = false) {
  const card = document.createElement('div');
  card.className = 'knowledge-card';

  let categoryBadge = '';
  if (showCategory) {
    categoryBadge = `<div class="card-category">${item.category1} > ${item.category2}</div>`;
  }

  card.innerHTML = `
    ${categoryBadge}
    <h3 class="card-title">${highlightText(item.title)}</h3>
    <p class="card-description">${highlightText(item.description)}</p>
  `;
  card.addEventListener('click', () => openModal(item));
  return card;
}

// テキストハイライト
function highlightText(text) {
  if (!searchQuery) return text;

  const keywords = searchQuery.toLowerCase().split(/\s+/);
  let result = text;

  keywords.forEach(keyword => {
    if (keyword) {
      const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi');
      result = result.replace(regex, '<span class="highlight">$1</span>');
    }
  });

  return result;
}

// 正規表現エスケープ
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// カテゴリ1選択
function selectCategory1(category) {
  selectedCategory1 = category;
  renderCategory2();
}

// カテゴリ2選択
function selectCategory2(category) {
  selectedCategory2 = category;
  
  // サイドバーのアクティブ状態を更新
  document.querySelectorAll('.category-item').forEach(item => {
    item.classList.remove('active');
    if (item.querySelector('span').textContent === category) {
      item.classList.add('active');
    }
  });

  renderKnowledgeCards();
}

// 戻る
function goBack() {
  renderCategory1();
}

// 空状態表示
function showEmptyState(message = 'カテゴリを選択してください') {
  emptyState.style.display = 'flex';
  emptyState.querySelector('p').textContent = message;
  cardGrid.innerHTML = '';
}

// モーダルを開く
function openModal(item) {
  modalTitle.textContent = item.title;
  
  // 画像パスを解決してからマークダウンでパース
  const bodyWithResolvedPaths = resolveAssetPaths(item.body, ASSET_BASE_PATH);
  modalBody.innerHTML = parseMarkdown(bodyWithResolvedPaths);
  setupMarkdownImages(modalBody);
  
  // 備考もマークダウンでパース
  if (item.note) {
    const noteWithResolvedPaths = resolveAssetPaths(item.note, ASSET_BASE_PATH);
    modalNote.innerHTML = parseMarkdown(noteWithResolvedPaths);
    setupMarkdownImages(modalNote);
  } else {
    modalNote.innerHTML = '';
  }
  
  modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// モーダルを閉じる
function closeModal() {
  modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

// 実行
init();