/**
 * 画像モーダル
 * どのページからでも使える共通画像ビューア
 * ズーム・パン機能付き
 */

class ImageModal {
    constructor() {
      this.overlay = null;
      this.isOpen = false;
      this.scale = 1;
      this.minScale = 0.5;
      this.maxScale = 3;
      this.scaleStep = 0.25;
      
      // パン（ドラッグ移動）用
      this.isPanning = false;
      this.startX = 0;
      this.startY = 0;
      this.translateX = 0;
      this.translateY = 0;
      
      this.init();
    }
  
    init() {
      // モーダル要素を作成
      this.overlay = document.createElement('div');
      this.overlay.className = 'img-modal-overlay';
      this.overlay.innerHTML = `
        <div class="img-modal">
          <div class="img-modal-toolbar">
            <button class="img-modal-zoom-btn" data-action="zoom-out" aria-label="縮小">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>
            <span class="img-modal-zoom-level">100%</span>
            <button class="img-modal-zoom-btn" data-action="zoom-in" aria-label="拡大">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </button>
            <button class="img-modal-zoom-btn" data-action="zoom-reset" aria-label="リセット">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                <path d="M3 3v5h5"></path>
              </svg>
            </button>
            <button class="img-modal-close" aria-label="閉じる">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="img-modal-content">
            <img class="img-modal-image" src="" alt="" draggable="false">
          </div>
          <div class="img-modal-caption"></div>
        </div>
      `;
  
      document.body.appendChild(this.overlay);
  
      // 要素の参照を保持
      this.modal = this.overlay.querySelector('.img-modal');
      this.content = this.overlay.querySelector('.img-modal-content');
      this.image = this.overlay.querySelector('.img-modal-image');
      this.caption = this.overlay.querySelector('.img-modal-caption');
      this.closeBtn = this.overlay.querySelector('.img-modal-close');
      this.zoomLevel = this.overlay.querySelector('.img-modal-zoom-level');
      this.toolbar = this.overlay.querySelector('.img-modal-toolbar');
  
      this.setupEventListeners();
    }
  
    setupEventListeners() {
      // 閉じるボタン
      this.closeBtn.addEventListener('click', () => this.close());
  
      // オーバーレイクリックで閉じる（パン中でなければ）
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay && !this.isPanning) {
          this.close();
        }
      });
  
      // ESCキーで閉じる
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });
  
      // ズームボタン
      this.toolbar.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          if (action === 'zoom-in') this.zoomIn();
          else if (action === 'zoom-out') this.zoomOut();
          else if (action === 'zoom-reset') this.zoomReset();
        });
      });
  
      // マウスホイールでズーム
      this.content.addEventListener('wheel', (e) => {
        if (!this.isOpen) return;
        e.preventDefault();
        if (e.deltaY < 0) {
          this.zoomIn();
        } else {
          this.zoomOut();
        }
      }, { passive: false });
  
      // ドラッグでパン - マウス
      this.image.addEventListener('mousedown', (e) => this.startPan(e));
      document.addEventListener('mousemove', (e) => this.doPan(e));
      document.addEventListener('mouseup', () => this.endPan());
  
      // ドラッグでパン - タッチ
      this.image.addEventListener('touchstart', (e) => this.startPan(e), { passive: false });
      document.addEventListener('touchmove', (e) => this.doPan(e), { passive: false });
      document.addEventListener('touchend', () => this.endPan());
  
      // カスタムイベントをリッスン
      window.addEventListener('open-image-modal', (e) => {
        this.open(e.detail.src, e.detail.alt);
      });

      // .knowledge-image クリック → モーダル表示
      document.body.addEventListener('click', (e) => {
        const img = e.target.closest('.knowledge-image');
        if (img && img.src) {
          e.preventDefault();
          this.open(img.src, img.alt || '');
        }
      });
    }
  
    startPan(e) {
      if (this.scale <= 1) return; // 100%以下ではパン不要
      
      e.preventDefault();
      this.isPanning = true;
      this.image.classList.add('grabbing');
      
      const point = e.touches ? e.touches[0] : e;
      this.startX = point.clientX - this.translateX;
      this.startY = point.clientY - this.translateY;
    }
  
    doPan(e) {
      if (!this.isPanning) return;
      
      e.preventDefault();
      const point = e.touches ? e.touches[0] : e;
      this.translateX = point.clientX - this.startX;
      this.translateY = point.clientY - this.startY;
      
      this.applyTransform();
    }
  
    endPan() {
      if (this.isPanning) {
        this.isPanning = false;
        this.image.classList.remove('grabbing');
      }
    }
  
    zoomIn() {
      this.scale = Math.min(this.scale + this.scaleStep, this.maxScale);
      this.applyTransform();
      this.updateZoomLevel();
    }
  
    zoomOut() {
      this.scale = Math.max(this.scale - this.scaleStep, this.minScale);
      // 100%以下に戻したらパン位置もリセット
      if (this.scale <= 1) {
        this.translateX = 0;
        this.translateY = 0;
      }
      this.applyTransform();
      this.updateZoomLevel();
    }
  
    zoomReset() {
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
      this.applyTransform();
      this.updateZoomLevel();
    }
  
    applyTransform() {
      this.image.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }
  
    updateZoomLevel() {
      this.zoomLevel.textContent = `${Math.round(this.scale * 100)}%`;
    }
  
    open(src, alt = '') {
      this.image.src = src;
      this.image.alt = alt;
      this.caption.textContent = alt;
      this.caption.style.display = alt ? 'block' : 'none';
  
      // ズーム・パンをリセット
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
      this.applyTransform();
      this.updateZoomLevel();
  
      this.overlay.classList.add('active');
      this.isOpen = true;
      document.body.style.overflow = 'hidden';
    }
  
    close() {
      this.overlay.classList.remove('active');
      this.isOpen = false;
      this.isPanning = false;
      document.body.style.overflow = '';
    }
  }
  
  // 自動初期化
  let imageModalInstance = null;
  
  export function initImageModal() {
    if (!imageModalInstance) {
      imageModalInstance = new ImageModal();
    }
    return imageModalInstance;
  }
  
  // DOMContentLoadedで自動初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImageModal);
  } else {
    initImageModal();
  }