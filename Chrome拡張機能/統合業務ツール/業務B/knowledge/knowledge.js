// ── 定数 ──────────────────────────────────────────────
const DATA_URL = 'https://drive.google.com/uc?export=download&id=DUMMY_GYOMU_B';
const STORAGE_KEY_FAVORITES = 'knowledgeFavorites_B';

// ── グローバル状態 ────────────────────────────────────────
let knowledgeData = null;
let selectedCategory1 = null;
let selectedCategory2 = null;
let searchFilterCategory = null;
let searchFilterSubcategory = null;
let favorites = [];

// ── ドラッグ&ドロップ状態 ───────────────────────────────────
let draggedElement = null;
let dropIndicator = null;
let currentDropIndex = -1;

// ── DOM要素 ──────────────────────────────────────────────
const elements = {
  searchInput: document.getElementById('searchInput'),
  searchClear: document.getElementById('searchClear'),
  filterButton: document.getElementById('filterButton'),
  filterLabel: document.getElementById('filterLabel'),
  filterMenu: document.getElementById('filterMenu'),
  sidebar: document.getElementById('sidebar'),
  backButton: document.getElementById('backButton'),
  sidebarTitle: document.getElementById('sidebarTitle'),
  categoryList: document.getElementById('categoryList'),
  emptyState: document.getElementById('emptyState'),
  knowledgeList: document.getElementById('knowledgeList'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalClose: document.getElementById('modalClose'),
  modalTitle: document.getElementById('modalTitle'),
  modalBody: document.getElementById('modalBody'),
  modalNote: document.getElementById('modalNote'),
  modalFavorite: document.getElementById('modalFavorite'),
  copyContentBtn: document.getElementById('copyContentBtn')
};

// ── SVGヘルパー ──────────────────────────────────────────
const starSvg = (filled) =>
  `<svg class="star-icon ${filled ? 'filled' : ''}" width="16" height="16" viewBox="0 0 24 24" ${filled ? 'fill="currentColor"' : 'fill="none"'} stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

const dragHandleSvg =
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"></circle><circle cx="15" cy="5" r="1.5"></circle><circle cx="9" cy="12" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle><circle cx="9" cy="19" r="1.5"></circle><circle cx="15" cy="19" r="1.5"></circle></svg>`;

// ══════════════════════════════════════════════════════════
// お気に入り管理
// ══════════════════════════════════════════════════════════

async function loadFavorites() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get([STORAGE_KEY_FAVORITES], (result) => {
        favorites = result[STORAGE_KEY_FAVORITES] || [];
        resolve();
      });
    } else {
      const stored = localStorage.getItem(STORAGE_KEY_FAVORITES);
      favorites = stored ? JSON.parse(stored) : [];
      resolve();
    }
  });
}

function saveFavorites() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ [STORAGE_KEY_FAVORITES]: favorites });
  } else {
    localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
  }
}

function isFavorite(category, subcategory, title) {
  return favorites.some(f =>
    f.category === category && f.subcategory === subcategory && f.title === title
  );
}

function toggleFavorite(category, subcategory, title) {
  const index = favorites.findIndex(f =>
    f.category === category && f.subcategory === subcategory && f.title === title
  );
  if (index === -1) {
    favorites.push({ category, subcategory, title });
  } else {
    favorites.splice(index, 1);
  }
  saveFavorites();
}

function getFavoriteItem(fav) {
  const subcategoryData = knowledgeData.categories[fav.category]?.[fav.subcategory];
  if (!subcategoryData) return null;
  return subcategoryData.titles.find(t => t.title === fav.title) || null;
}

// ══════════════════════════════════════════════════════════
// 初期化
// ══════════════════════════════════════════════════════════

async function init() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    knowledgeData = await response.json();

    if (!knowledgeData || !knowledgeData.categories) {
      throw new Error('データ構造が不正です');
    }

    await loadFavorites();
    displayCategory1();
    buildFilterMenu();
    setupEventListeners();
  } catch (error) {
    console.error('データ読み込みエラー:', error);
    elements.categoryList.innerHTML =
      '<p style="padding: 1rem; color: #999;">データの読み込みに失敗しました</p>';
  }
}

// ══════════════════════════════════════════════════════════
// イベントリスナー
// ══════════════════════════════════════════════════════════

function setupEventListeners() {
  elements.backButton.addEventListener('click', handleCategoryBack);

  elements.modalClose.addEventListener('click', closeModal);
  elements.modalOverlay.addEventListener('click', (e) => {
    if (e.target === elements.modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeFilterMenu();
    }
  });

  elements.searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  elements.searchInput.addEventListener('input', (e) => {
    elements.searchClear.style.display = e.target.value.trim() ? 'flex' : 'none';
  });
  elements.searchClear.addEventListener('click', clearSearch);

  elements.filterButton.addEventListener('click', toggleFilterMenu);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-dropdown')) closeFilterMenu();
  });

  elements.copyContentBtn.addEventListener('click', copyModalContent);
}

// ══════════════════════════════════════════════════════════
// カテゴリナビゲーション
// ══════════════════════════════════════════════════════════

function displayCategory1() {
  selectedCategory1 = null;
  selectedCategory2 = null;

  elements.backButton.style.display = 'none';
  elements.sidebarTitle.textContent = 'カテゴリ';
  elements.categoryList.innerHTML = '';

  Object.keys(knowledgeData.categories).forEach(category => {
    const button = createCategoryButton(category, () => selectCategory1(category));
    elements.categoryList.appendChild(button);
  });

  showEmptyState();
}

function selectCategory1(category) {
  selectedCategory1 = category;
  selectedCategory2 = null;

  elements.backButton.style.display = 'flex';
  elements.sidebarTitle.textContent = category;
  elements.categoryList.innerHTML = '';

  // お気に入りサブカテゴリ
  const categoryFavorites = favorites.filter(f => f.category === category);
  if (categoryFavorites.length > 0) {
    const favButton = document.createElement('button');
    favButton.className = 'category-item category-item-favorite';
    favButton.innerHTML = `
      <span>${starSvg(true)} お気に入り</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;
    favButton.addEventListener('click', () => displayFavorites(category));
    elements.categoryList.appendChild(favButton);
  }

  Object.keys(knowledgeData.categories[category]).forEach(subCategory => {
    const button = createCategoryButton(subCategory, () => displayKnowledge(category, subCategory));
    elements.categoryList.appendChild(button);
  });

  showEmptyState();
}

function handleCategoryBack() {
  displayCategory1();
}

// ══════════════════════════════════════════════════════════
// ナレッジアイテム表示
// ══════════════════════════════════════════════════════════

function displayKnowledge(category1, category2) {
  selectedCategory1 = category1;
  selectedCategory2 = category2;

  updateCategoryActive(category2);
  resetKnowledgeList();

  const titles = knowledgeData.categories[category1][category2].titles;
  if (!titles || titles.length === 0) {
    showEmptyState('ナレッジがありません');
    return;
  }

  titles.forEach(item => {
    const div = createKnowledgeItemElement(item, category1, category2);
    elements.knowledgeList.appendChild(div);
  });
}

function displayFavorites(category) {
  selectedCategory1 = category;
  selectedCategory2 = '★お気に入り';

  updateCategoryActive(null, true);
  resetKnowledgeList();

  const categoryFavorites = favorites.filter(f => f.category === category);
  if (categoryFavorites.length === 0) {
    showEmptyState('お気に入りがありません');
    return;
  }

  categoryFavorites.forEach(fav => {
    const item = getFavoriteItem(fav);
    if (!item) return;
    const div = createKnowledgeItemElement(item, fav.category, fav.subcategory, true, true);
    elements.knowledgeList.appendChild(div);
  });

  // ドラッグイベント設定
  elements.knowledgeList.addEventListener('dragover', handleListDragOver);
  elements.knowledgeList.addEventListener('drop', handleListDrop);
}

function updateCategoryActive(name, isFavorite = false) {
  document.querySelectorAll('.category-item').forEach(item => {
    item.classList.remove('active');
    if (isFavorite && item.classList.contains('category-item-favorite')) {
      item.classList.add('active');
    } else if (item.querySelector('span')?.textContent?.trim() === name) {
      item.classList.add('active');
    }
  });
}

function resetKnowledgeList() {
  elements.knowledgeList.innerHTML = '';
  elements.emptyState.style.display = 'none';
  elements.knowledgeList.removeEventListener('dragover', handleListDragOver);
  elements.knowledgeList.removeEventListener('drop', handleListDrop);
}

// ══════════════════════════════════════════════════════════
// 要素作成
// ══════════════════════════════════════════════════════════

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

function createKnowledgeItemElement(item, category, subcategory, showCategory = false, isDraggable = false) {
  const div = document.createElement('div');
  div.className = 'knowledge-item';

  const isFav = isFavorite(category, subcategory, item.title);

  if (isDraggable) {
    div.draggable = true;
    div.dataset.category = category;
    div.dataset.subcategory = subcategory;
    div.dataset.title = item.title;
    div.classList.add('draggable');
  }

  div.innerHTML = `
    ${isDraggable ? `<div class="drag-handle" title="ドラッグして並び替え">${dragHandleSvg}</div>` : ''}
    <div class="knowledge-item-content">
      <div class="knowledge-item-header">
        <div class="knowledge-title">${item.title}</div>
        <button class="favorite-button ${isFav ? 'active' : ''}" title="お気に入り">
          ${starSvg(isFav)}
        </button>
      </div>
      ${showCategory ? `<div class="knowledge-category">${category} > ${subcategory}</div>` : ''}
      <div class="knowledge-description">${item.description || ''}</div>
    </div>
  `;

  // お気に入りボタン
  const favButton = div.querySelector('.favorite-button');
  favButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(category, subcategory, item.title);
    const nowFav = isFavorite(category, subcategory, item.title);
    favButton.classList.toggle('active', nowFav);
    favButton.innerHTML = starSvg(nowFav);
    buildFilterMenu();
  });

  // アイテムクリック
  div.addEventListener('click', (e) => {
    if (!e.target.closest('.favorite-button') && !e.target.closest('.drag-handle')) {
      showKnowledgeModal(item, category, subcategory);
    }
  });

  // ドラッグイベント
  if (isDraggable) {
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragend', handleDragEnd);
  }

  return div;
}

// ══════════════════════════════════════════════════════════
// ドラッグ&ドロップ
// ══════════════════════════════════════════════════════════

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  dropIndicator = document.createElement('div');
  dropIndicator.className = 'drop-indicator';
}

function handleListDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (!draggedElement || !dropIndicator) return;

  const items = [...elements.knowledgeList.querySelectorAll('.knowledge-item.draggable:not(.dragging)')];
  if (items.length === 0) return;

  const mouseY = e.clientY;
  let insertIndex = items.length;
  let insertBeforeElement = null;

  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    if (mouseY < rect.top + rect.height / 2) {
      insertIndex = i;
      insertBeforeElement = items[i];
      break;
    }
  }

  if (insertIndex !== currentDropIndex) {
    currentDropIndex = insertIndex;
    if (insertBeforeElement) {
      elements.knowledgeList.insertBefore(dropIndicator, insertBeforeElement);
    } else {
      elements.knowledgeList.appendChild(dropIndicator);
    }
  }
}

function handleListDrop(e) {
  e.preventDefault();
  if (!draggedElement || currentDropIndex === -1) return;
  if (dropIndicator && dropIndicator.parentNode) {
    dropIndicator.parentNode.insertBefore(draggedElement, dropIndicator);
  }
  removeDropIndicator();
  reorderFavorites();
}

function handleDragEnd() {
  this.classList.remove('dragging');
  removeDropIndicator();
  draggedElement = null;
}

function removeDropIndicator() {
  if (dropIndicator && dropIndicator.parentNode) {
    dropIndicator.parentNode.removeChild(dropIndicator);
  }
  dropIndicator = null;
  currentDropIndex = -1;
}

function reorderFavorites() {
  const currentCategory = selectedCategory1;
  const items = elements.knowledgeList.querySelectorAll('.knowledge-item.draggable');
  const otherFavorites = favorites.filter(f => f.category !== currentCategory);
  const reorderedCategoryFavorites = [...items].map(item => ({
    category: item.dataset.category,
    subcategory: item.dataset.subcategory,
    title: item.dataset.title
  }));
  favorites = [...otherFavorites, ...reorderedCategoryFavorites];
  saveFavorites();
}

// ══════════════════════════════════════════════════════════
// フィルターメニュー
// ══════════════════════════════════════════════════════════

function buildFilterMenu() {
  elements.filterMenu.innerHTML = '';

  const allOption = document.createElement('div');
  allOption.className = 'filter-option active';
  allOption.textContent = 'すべてのカテゴリ';
  allOption.addEventListener('click', () => selectFilter(null, null, 'すべて'));
  elements.filterMenu.appendChild(allOption);

  Object.keys(knowledgeData.categories).forEach(cat1 => {
    const group = document.createElement('div');
    group.className = 'filter-group';

    const header = document.createElement('div');
    header.className = 'filter-group-header';
    header.innerHTML = `
      <span>${cat1}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      group.classList.toggle('open');
    });
    group.appendChild(header);

    const items = document.createElement('div');
    items.className = 'filter-group-items';

    // カテゴリすべて
    const catAllOption = document.createElement('div');
    catAllOption.className = 'filter-option';
    catAllOption.textContent = `${cat1}のすべて`;
    catAllOption.addEventListener('click', (e) => {
      e.stopPropagation();
      selectFilter(cat1, null, `${cat1} すべて`);
    });
    items.appendChild(catAllOption);

    // お気に入り
    const catFavorites = favorites.filter(f => f.category === cat1);
    if (catFavorites.length > 0) {
      const favOption = document.createElement('div');
      favOption.className = 'filter-option filter-option-favorite';
      favOption.innerHTML = `${starSvg(true)} お気に入り`;
      favOption.addEventListener('click', (e) => {
        e.stopPropagation();
        selectFilter(cat1, '★お気に入り', `${cat1} > お気に入り`);
      });
      items.appendChild(favOption);
    }

    // サブカテゴリ
    Object.keys(knowledgeData.categories[cat1]).forEach(cat2 => {
      const option = document.createElement('div');
      option.className = 'filter-option';
      option.textContent = cat2;
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        selectFilter(cat1, cat2, `${cat1} > ${cat2}`);
      });
      items.appendChild(option);
    });

    group.appendChild(items);
    elements.filterMenu.appendChild(group);
  });
}

function selectFilter(cat1, cat2, label) {
  searchFilterCategory = cat1;
  searchFilterSubcategory = cat2;
  elements.filterLabel.textContent = label;
  elements.filterMenu.querySelectorAll('.filter-option').forEach(opt => opt.classList.remove('active'));
  closeFilterMenu();
}

function toggleFilterMenu() {
  elements.filterMenu.classList.toggle('active');
  elements.filterButton.classList.toggle('active');
}

function closeFilterMenu() {
  elements.filterMenu.classList.remove('active');
  elements.filterButton.classList.remove('active');
}

// ══════════════════════════════════════════════════════════
// 検索
// ══════════════════════════════════════════════════════════

function matchesKeywords(item, keywords) {
  const searchableText = [item.title, item.description, item.content, item.notes]
    .filter(Boolean).join(' ').toLowerCase();
  return keywords.every(k => searchableText.includes(k));
}

function performSearch() {
  const searchTerm = elements.searchInput.value.trim();
  if (!searchTerm) return;

  const keywords = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return;

  const searchResults = [];

  if (searchFilterSubcategory === '★お気に入り') {
    const targetFavorites = searchFilterCategory
      ? favorites.filter(f => f.category === searchFilterCategory)
      : favorites;
    targetFavorites.forEach(fav => {
      const item = getFavoriteItem(fav);
      if (!item) return;
      if (matchesKeywords(item, keywords)) {
        searchResults.push({ item, category1: fav.category, category2: fav.subcategory });
      }
    });
  } else {
    const categoriesToSearch = searchFilterCategory
      ? { [searchFilterCategory]: knowledgeData.categories[searchFilterCategory] }
      : knowledgeData.categories;

    Object.keys(categoriesToSearch).forEach(cat1 => {
      const subcategories = searchFilterSubcategory
        ? { [searchFilterSubcategory]: categoriesToSearch[cat1][searchFilterSubcategory] }
        : categoriesToSearch[cat1];

      Object.keys(subcategories).forEach(cat2 => {
        const titles = subcategories[cat2].titles;
        titles.forEach(item => {
          if (matchesKeywords(item, keywords)) {
            searchResults.push({ item, category1: cat1, category2: cat2 });
          }
        });
      });
    });
  }

  displaySearchResults(searchTerm, searchResults);
}

function displaySearchResults(searchTerm, results) {
  elements.knowledgeList.innerHTML = '';
  elements.emptyState.style.display = 'none';
  elements.sidebar.style.display = 'none';

  let filterInfo = '';
  if (searchFilterCategory && searchFilterSubcategory) {
    filterInfo = ` (${searchFilterCategory} > ${searchFilterSubcategory})`;
  } else if (searchFilterCategory) {
    filterInfo = ` (${searchFilterCategory})`;
  }

  const headerDiv = document.createElement('div');
  headerDiv.className = 'search-results-header';
  headerDiv.innerHTML = `
    <div class="search-results-title">「${results.length}件」${filterInfo}</div>
    <button class="search-reset-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      検索をクリア
    </button>
  `;
  headerDiv.querySelector('.search-reset-btn').addEventListener('click', clearSearch);
  elements.knowledgeList.appendChild(headerDiv);

  if (results.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'knowledge-item no-results';
    noResults.innerHTML = `
      <div class="knowledge-item-content">
        <div class="knowledge-title">該当する結果がありません</div>
        <div class="knowledge-description">別のキーワードで検索してください。</div>
      </div>
    `;
    elements.knowledgeList.appendChild(noResults);
    return;
  }

  results.forEach(result => {
    const div = createKnowledgeItemElement(result.item, result.category1, result.category2, true);
    elements.knowledgeList.appendChild(div);
  });
}

function clearSearch() {
  elements.searchInput.value = '';
  elements.searchClear.style.display = 'none';
  elements.sidebar.style.display = 'flex';
  elements.knowledgeList.innerHTML = '';

  if (selectedCategory1 && selectedCategory2) {
    if (selectedCategory2 === '★お気に入り') {
      displayFavorites(selectedCategory1);
    } else {
      displayKnowledge(selectedCategory1, selectedCategory2);
    }
  } else {
    showEmptyState();
  }
}

// ══════════════════════════════════════════════════════════
// モーダル
// ══════════════════════════════════════════════════════════

function showKnowledgeModal(item, category, subcategory) {
  elements.modalTitle.textContent = item.title;

  // コンテンツレンダリング
  const modalBody = elements.modalBody;
  if (item.content) {
    // HTML形式（<!-- html --> プレフィックスがあれば除去）
    const html = item.content.trimStart().startsWith('<!-- html -->')
      ? item.content.replace('<!-- html -->', '').trim()
      : item.content;
    modalBody.innerHTML = html;
  } else {
    modalBody.innerHTML = '';
  }

  // Google Drive画像をfetchしてBlobURLに差し替え
  modalBody.querySelectorAll('img[data-gdrive-id]').forEach(async (img) => {
    try {
      const url = `https://drive.google.com/uc?export=download&id=${img.dataset.gdriveId}`;
      const res = await fetch(url);
      const blob = await res.blob();
      img.src = URL.createObjectURL(blob);
    } catch (e) {
      console.error('画像の取得に失敗:', e);
    }
  });

  // 画像クリックでモーダル表示（image-modal連携）
  modalBody.querySelectorAll('img').forEach(img => {
    img.style.cursor = 'pointer';
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('open-image-modal', {
        detail: { src: img.src, alt: img.alt }
      }));
    });
  });

  // 備考
  if (item.notes) {
    elements.modalNote.innerHTML = item.notes;
    elements.modalNote.style.display = '';
  } else {
    elements.modalNote.innerHTML = '';
    elements.modalNote.style.display = 'none';
  }

  // お気に入りボタン
  updateModalFavoriteButton(category, subcategory, item.title);

  // モーダル表示
  elements.modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function updateModalFavoriteButton(category, subcategory, title) {
  const isFav = isFavorite(category, subcategory, title);
  elements.modalFavorite.innerHTML = `${starSvg(isFav)} ${isFav ? 'お気に入り解除' : 'お気に入り'}`;
  elements.modalFavorite.className = `modal-favorite-btn ${isFav ? 'active' : ''}`;

  const newBtn = elements.modalFavorite.cloneNode(true);
  elements.modalFavorite.parentNode.replaceChild(newBtn, elements.modalFavorite);
  elements.modalFavorite = newBtn;

  newBtn.addEventListener('click', () => {
    toggleFavorite(category, subcategory, title);
    updateModalFavoriteButton(category, subcategory, title);
    buildFilterMenu();
    if (selectedCategory1) {
      selectCategory1(selectedCategory1);
    }
  });
}

function closeModal() {
  elements.modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

function copyModalContent() {
  const content = elements.modalBody.innerText;
  navigator.clipboard.writeText(content).then(() => {
    const btn = elements.copyContentBtn;
    const originalText = btn.textContent;
    btn.textContent = 'コピーしました！';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('コピーに失敗:', err);
  });
}

// ══════════════════════════════════════════════════════════
// ユーティリティ
// ══════════════════════════════════════════════════════════

function showEmptyState(message = 'カテゴリを選択してください') {
  elements.emptyState.style.display = 'flex';
  elements.emptyState.querySelector('p').textContent = message;
  elements.knowledgeList.innerHTML = '';
}

// 実行
init();