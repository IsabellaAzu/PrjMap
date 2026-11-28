    function addNode(type, customWorldPos = null) {
      pushHistory();
      const rect = viewportEl.getBoundingClientRect();
      const centerWorld = customWorldPos || screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);

      const presets = {
        rect: { w: 180, h: 90, fill: '#ffffff', stroke: '#64748b', text: '新しい四角形' },
        roundRect: { w: 190, h: 90, fill: '#eff6ff', stroke: '#2563eb', text: '新しいステップ' },
        ellipse: { w: 170, h: 100, fill: '#f0fdf4', stroke: '#059669', text: '開始 / 終了' },
        diamond: { w: 170, h: 110, fill: '#fef9c3', stroke: '#d97706', text: '条件分岐？' },
        database: { w: 170, h: 120, fill: '#eff6ff', stroke: '#2563eb', text: 'データベース' },
        sticky: { w: 180, h: 110, fill: '#fef9c3', stroke: '#eab308', text: '付箋メモ' },
        text: { w: 200, h: 64, fill: 'transparent', stroke: 'transparent', text: 'テキストを入力' }
      };
      const p = presets[type] || presets.rect;
      const jitter = customWorldPos ? 0 : (state.nodes.length % 5) * 18;

      const newNode = {
        id: 'node_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type,
        x: Math.round(centerWorld.x - p.w / 2 + jitter),
        y: Math.round(centerWorld.y - p.h / 2 + jitter),
        width: p.w,
        height: p.h,
        text: p.text,
        fill: p.fill,
        stroke: p.stroke
      };
      if (type === 'text' && document.documentElement.dataset.theme === 'dark') {
        newNode.textColor = '#ffffff';
      }

      state.nodes.push(newNode);
      state.selectedNodeId = newNode.id;
      state.selectedNodeIds.clear();
      state.selectedNodeIds.add(newNode.id);
      state.selectedEdgeId = null;
      renderAll();
      persistToLocalStorage();
      if (type === 'text' && customWorldPos) {
        startEditingNode(newNode.id);
      }
    }

    // ===== 画像ファイルの読み込み＆最前面配置 =====
    function processImageFile(file, customWorldPos = null) {
      if (!file || !file.type.startsWith('image/')) {
        showToast('画像ファイル (PNG, JPG, WebP, GIF等) を選択してください');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const rawDataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          const isPng = file.type === 'image/png' || file.type === 'image/gif';
          const outputType = isPng ? 'image/png' : 'image/jpeg';
          const compressedDataUrl = canvas.toDataURL(outputType, 0.85);

          const initialW = 240;
          const initialH = Math.max(60, Math.round((initialW * h) / w));

          const rect = viewportEl.getBoundingClientRect();
          const centerWorld = customWorldPos || screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);

          const newNode = {
            id: 'node_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: 'image',
            x: Math.round(centerWorld.x - initialW / 2),
            y: Math.round(centerWorld.y - initialH / 2),
            width: initialW,
            height: initialH,
            src: compressedDataUrl,
            alt: file.name || '画像',
            fill: 'transparent',
            stroke: 'transparent'
          };

          pushHistory();
          // 配列末尾にpushすることで自動的に最前面レイヤーに配置
          state.nodes.push(newNode);
          state.selectedNodeId = newNode.id;
          state.selectedNodeIds.clear();
          state.selectedNodeIds.add(newNode.id);
          state.selectedEdgeId = null;

          renderAll();
          persistToLocalStorage();
          showToast(`画像「${file.name}」を最前面に配置しました`);
        };
        img.onerror = () => {
          showToast('画像の読み込みに失敗しました');
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    }

    // ===== 画像アップロード（画面全体ドラッグ＆ドロップ ＋ 左メニューimgモーダル） =====
    const dropOverlay = document.getElementById('drop-overlay');
    const imageUploadModal = document.getElementById('image-upload-modal');
    const modalDropZone = document.getElementById('modal-drop-zone');
    const imageFileInput = document.getElementById('image-file-input');

    function openImageUploadModal() {
      if (imageUploadModal) imageUploadModal.classList.remove('hidden');
    }

    function closeImageUploadModal() {
      if (imageUploadModal) imageUploadModal.classList.add('hidden');
      if (modalDropZone) modalDropZone.classList.remove('drag-over');
    }

    // 左メニュー「img」ボタンクリック時
    const btnAddImage = document.getElementById('btn-add-image');
    if (btnAddImage) {
      btnAddImage.addEventListener('click', openImageUploadModal);
    }

    const btnCloseImageModal = document.getElementById('btn-close-image-modal');
    if (btnCloseImageModal) {
      btnCloseImageModal.addEventListener('click', closeImageUploadModal);
    }

    if (imageUploadModal) {
      imageUploadModal.addEventListener('pointerdown', (e) => {
        if (e.target === imageUploadModal) closeImageUploadModal();
      });
    }

    // モーダル内のドロップエリアクリックでファイル選択ダイアログを開く
    if (modalDropZone && imageFileInput) {
      modalDropZone.addEventListener('click', () => {
        imageFileInput.click();
      });

      modalDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        modalDropZone.classList.add('drag-over');
      });

      modalDropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        modalDropZone.classList.remove('drag-over');
      });

      modalDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        modalDropZone.classList.remove('drag-over');
        if (dropOverlay) dropOverlay.classList.add('hidden');
        dragDepth = 0;

        const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
        const imgFiles = files.filter(f => f.type.startsWith('image/'));
        if (imgFiles.length > 0) {
          closeImageUploadModal();
          imgFiles.forEach((file, idx) => {
            const rect = viewportEl.getBoundingClientRect();
            const center = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
            processImageFile(file, { x: center.x + idx * 24, y: center.y + idx * 24 });
          });
        } else {
          showToast('画像ファイルを選択してください');
        }
      });

      imageFileInput.addEventListener('change', (e) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (files.length > 0) {
          closeImageUploadModal();
          files.forEach((file, idx) => {
            const rect = viewportEl.getBoundingClientRect();
            const center = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
            processImageFile(file, { x: center.x + idx * 24, y: center.y + idx * 24 });
          });
        }
        e.target.value = '';
      });
    }

    // 画面全体へのドラッグ＆ドロップ検知（ドラッグ時に専用レイヤーを自動表示）
    const dropZoneCard = document.getElementById('drop-zone-card');
    let dragDepth = 0;

    function hasFileTransfer(e) {
      if (!e.dataTransfer) return false;
      const types = Array.from(e.dataTransfer.types || []);
      if (types.includes('Files')) return true;
      return e.dataTransfer.items && Array.from(e.dataTransfer.items).some(it => it.kind === 'file');
    }

    function showDropLayer() {
      if (dropOverlay) {
        dropOverlay.classList.remove('hidden');
        dropOverlay.setAttribute('aria-hidden', 'false');
      }
    }

    function hideDropLayer() {
      if (dropOverlay) {
        dropOverlay.classList.add('hidden');
        dropOverlay.setAttribute('aria-hidden', 'true');
      }
      if (dropZoneCard) {
        dropZoneCard.classList.remove('drag-hover');
      }
    }

    window.addEventListener('dragenter', (e) => {
      if (!hasFileTransfer(e)) return;
      e.preventDefault();
      dragDepth++;
      if (imageUploadModal && imageUploadModal.classList.contains('hidden')) {
        showDropLayer();
      }
    });

    window.addEventListener('dragover', (e) => {
      if (!hasFileTransfer(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (imageUploadModal && imageUploadModal.classList.contains('hidden')) {
        showDropLayer();
      }
      if (dropZoneCard) {
        const target = e.target;
        if (target && (target === dropZoneCard || dropZoneCard.contains(target))) {
          dropZoneCard.classList.add('drag-hover');
        } else {
          dropZoneCard.classList.remove('drag-hover');
        }
      }
    });

    window.addEventListener('dragleave', (e) => {
      if (!hasFileTransfer(e)) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0 || (e.clientX <= 0 && e.clientY <= 0)) {
        dragDepth = 0;
        hideDropLayer();
      }
    });

    window.addEventListener('drop', (e) => {
      if (!hasFileTransfer(e)) return;
      e.preventDefault();
      dragDepth = 0;
      hideDropLayer();
      closeImageUploadModal();

      const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
      const imgFiles = files.filter(f => f.type.startsWith('image/'));
      if (imgFiles.length > 0) {
        const dropWorldPos = screenToWorld(e.clientX, e.clientY);
        imgFiles.forEach((file, idx) => {
          processImageFile(file, {
            x: dropWorldPos.x + idx * 24,
            y: dropWorldPos.y + idx * 24
          });
        });
      } else if (files.length > 0) {
        showToast('画像ファイル (PNG, JPG, WebP, GIF等) のみドロップできます');
      }
    });

    // クリップボードからの画像貼り付け (Ctrl+V / Cmd+V) にも対応
    window.addEventListener('paste', (e) => {
      if (state.editingNodeId) return;
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const items = e.clipboardData ? Array.from(e.clipboardData.items || []) : [];
      const imageItem = items.find(item => item.type.startsWith('image/'));
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          e.preventDefault();
          processImageFile(file);
          return;
        }
      }

      if (pasteNodes()) {
        e.preventDefault();
      }
    });
