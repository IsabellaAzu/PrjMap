    // テーマ設定はこの端末内だけに保存する。
    const THEME_STORAGE_KEY = 'inmymind_theme';
    const themeToggleButton = document.getElementById('btn-theme-toggle');
    let currentTheme = 'light';
    try {
      currentTheme = localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch (error) {
      // localStorageが使えない環境でもライトテーマで起動する。
    }

    function applyTheme(theme) {
      currentTheme = theme;
      document.documentElement.dataset.theme = theme;
      const isDark = theme === 'dark';
      themeToggleButton.textContent = isDark ? '☀' : '☾';
      themeToggleButton.title = isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え';
      themeToggleButton.setAttribute('aria-label', themeToggleButton.title);
      themeToggleButton.setAttribute('aria-pressed', String(isDark));
      const mapToggle = document.getElementById('btn-toggle-minimap');
      if (mapToggle) {
        const isMapVisible = mapToggle.getAttribute('aria-pressed') === 'true';
        mapToggle.style.color = isDark
          ? (isMapVisible ? '#e6c27a' : '#aa9a80')
          : (isMapVisible ? '#2563eb' : '#64748b');
        mapToggle.style.backgroundColor = isMapVisible
          ? (isDark ? '#49391f' : '#eff6ff')
          : '';
      }
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch (error) {
        // テーマ切り替え自体は保存できなくても反映する。
      }
    }

    applyTheme(currentTheme);
    themeToggleButton.addEventListener('click', () => {
      applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });

    // ツールバー・ボタンイベント登録
    document.querySelectorAll('[data-align]').forEach(button => {
      button.addEventListener('click', () => {
        const selected = state.nodes.filter(node => state.selectedNodeIds.has(node.id));
        const action = button.dataset.align;
        if (selected.length < 2) return;
        if ((action === 'distribute-x' || action === 'distribute-y') && selected.length < 3) {
          showToast('均等配置には図形を3つ以上選択してください');
          return;
        }

        pushHistory();
        const sortBy = (key, startKey) => [...selected].sort((a, b) => a[startKey] - b[startKey]);
        if (action === 'left') {
          const edge = Math.min(...selected.map(node => node.x));
          selected.forEach(node => { node.x = edge; });
        } else if (action === 'right') {
          const edge = Math.max(...selected.map(node => node.x + node.width));
          selected.forEach(node => { node.x = edge - node.width; });
        } else if (action === 'center-x') {
          const center = (Math.min(...selected.map(node => node.x)) + Math.max(...selected.map(node => node.x + node.width))) / 2;
          selected.forEach(node => { node.x = Math.round(center - node.width / 2); });
        } else if (action === 'top') {
          const edge = Math.min(...selected.map(node => node.y));
          selected.forEach(node => { node.y = edge; });
        } else if (action === 'bottom') {
          const edge = Math.max(...selected.map(node => node.y + node.height));
          selected.forEach(node => { node.y = edge - node.height; });
        } else if (action === 'center-y') {
          const center = (Math.min(...selected.map(node => node.y)) + Math.max(...selected.map(node => node.y + node.height))) / 2;
          selected.forEach(node => { node.y = Math.round(center - node.height / 2); });
        } else if (action === 'distribute-x' || action === 'distribute-y') {
          const horizontal = action === 'distribute-x';
          const startKey = horizontal ? 'x' : 'y';
          const sizeKey = horizontal ? 'width' : 'height';
          const ordered = sortBy(startKey, startKey);
          const first = ordered[0];
          const last = ordered[ordered.length - 1];
          const span = last[startKey] + last[sizeKey] - first[startKey];
          const totalSize = ordered.reduce((sum, node) => sum + node[sizeKey], 0);
          const gap = (span - totalSize) / (ordered.length - 1);
          let cursor = first[startKey];
          ordered.forEach(node => {
            node[startKey] = Math.round(cursor);
            cursor += node[sizeKey] + gap;
          });
        }
        renderNodes();
        renderEdges();
        renderMinimap();
      });
    });

    document.querySelectorAll('[data-add-shape]').forEach(btn => {
      btn.addEventListener('click', () => {
        addNode(btn.dataset.addShape);
      });
    });

    const freehandButton = document.getElementById('btn-freehand-tool');
    const selectToolButton = document.getElementById('btn-select-tool');
    const handwritingSettingsPanel = document.getElementById('handwriting-settings-panel');
    const freehandWidth = document.getElementById('freehand-width');
    let minimapHiddenForHandwritingPanel = false;
    if (freehandButton) {
      freehandButton.addEventListener('click', () => {
        const enabled = !document.body.classList.contains('freehand-mode');
        document.body.classList.toggle('freehand-mode', enabled);
        freehandButton.setAttribute('aria-pressed', String(enabled));
        selectToolButton.setAttribute('aria-pressed', String(!enabled));
        handwritingSettingsPanel.classList.toggle('hidden', !enabled);
        if (enabled) {
          positionHandwritingSettingsPanel();
        } else if (minimapHiddenForHandwritingPanel) {
          setMinimapVisible(true);
          minimapHiddenForHandwritingPanel = false;
        }
      });
      freehandWidth.addEventListener('change', () => {
        freehandWidth.value = String(Math.min(10, Math.max(2, Number(freehandWidth.value) || 2)));
      });
      document.querySelectorAll('[data-freehand-color]').forEach(button => {
        button.addEventListener('click', () => {
          state.freehandColor = button.dataset.freehandColor;
          document.querySelectorAll('[data-freehand-color]').forEach(item => item.classList.toggle('active', item === button));
        });
      });
      state.freehandColor = '#2563eb';
    }
    if (selectToolButton) {
      selectToolButton.addEventListener('click', () => {
        document.body.classList.remove('freehand-mode');
        freehandButton.setAttribute('aria-pressed', 'false');
        selectToolButton.setAttribute('aria-pressed', 'true');
        handwritingSettingsPanel.classList.add('hidden');
        if (minimapHiddenForHandwritingPanel) {
          setMinimapVisible(true);
          minimapHiddenForHandwritingPanel = false;
        }
      });
    }

    function positionHandwritingSettingsPanel() {
      if (!handwritingSettingsPanel) return;
      const workspace = document.querySelector('.workspace');
      const toolbar = document.querySelector('.left-toolbar');
      const trigger = document.getElementById('btn-freehand-tool');
      if (!workspace || !toolbar || !trigger) return;
      const workspaceRect = workspace.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const panelWidth = handwritingSettingsPanel.offsetWidth;
      const panelHeight = handwritingSettingsPanel.offsetHeight;
      const workspaceWidth = workspaceRect.width;
      const workspaceHeight = workspaceRect.height;
      const clampLeft = value => Math.max(8, Math.min(value, workspaceWidth - panelWidth - 8));
      const clampTop = value => Math.max(8, Math.min(value, workspaceHeight - panelHeight - 8));
      const intersects = (left, top, rect) => rect &&
        left + panelWidth + workspaceRect.left > rect.left &&
        left + workspaceRect.left < rect.right &&
        top + panelHeight + workspaceRect.top > rect.top &&
        top + workspaceRect.top < rect.bottom;
      const minimap = document.getElementById('minimap-wrapper');
      const minimapRect = minimap && !minimap.classList.contains('hidden') ? minimap.getBoundingClientRect() : null;
      const rightOfToolbar = toolbarRect.right - workspaceRect.left + 8;
      const besidePencil = triggerRect.top - workspaceRect.top;
      const belowMinimap = minimapRect ? minimapRect.bottom - workspaceRect.top + 8 : besidePencil;
      const leftOfMinimap = minimapRect ? minimapRect.left - workspaceRect.left - panelWidth - 8 : rightOfToolbar;
      const candidates = [
        [rightOfToolbar, besidePencil],
        [rightOfToolbar, belowMinimap],
        [leftOfMinimap, besidePencil],
        [rightOfToolbar, minimapRect ? minimapRect.top - workspaceRect.top - panelHeight - 8 : workspaceHeight - panelHeight - 8],
        [8, workspaceHeight - panelHeight - 8]
      ];
      let placement = candidates
        .map(([left, top]) => [clampLeft(left), clampTop(top)])
        .find(([left, top]) => !intersects(left, top, minimapRect));
      if (!placement && minimapRect) {
        setMinimapVisible(false);
        minimapHiddenForHandwritingPanel = true;
        placement = [clampLeft(rightOfToolbar), clampTop(besidePencil)];
      }
      const [left, top] = placement || [clampLeft(rightOfToolbar), clampTop(besidePencil)];
      handwritingSettingsPanel.style.left = `${left}px`;
      handwritingSettingsPanel.style.top = `${top}px`;
    }
    window.addEventListener('resize', () => {
      if (!handwritingSettingsPanel.classList.contains('hidden')) positionHandwritingSettingsPanel();
    });

    function resetToSample() {
      pushHistory();
      const sample = getSampleData();
      state.nodes = sample.nodes;
      state.edges = sample.edges;
      state.hiddenTags.clear();
      state.viewport = sample.viewport;
      state.selectedNodeId = null;
      state.selectedNodeIds.clear();
      state.selectedEdgeId = null;
      state.fileHandle = null;
      renderAll();
      persistToLocalStorage();
      showToast('プロジェクト構成サンプルを復元しました');
    }

    document.getElementById('file-menu').addEventListener('change', async event => {
      const action = event.target.value;
      event.target.value = '';

      if (action === 'open') await openLocalJsonFile();
      else if (action === 'save') await saveToLocalJsonFile();
      else if (action === 'reset-sample') resetToSample();
      else if (action === 'undo') undo();
      else if (action === 'redo') redo();
    });

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      const rect = viewportEl.getBoundingClientRect();
      const newZoom = Math.min(2.5, state.viewport.zoom * 1.2);
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      state.viewport.x = cx - (cx - state.viewport.x) * (newZoom / state.viewport.zoom);
      state.viewport.y = cy - (cy - state.viewport.y) * (newZoom / state.viewport.zoom);
      state.viewport.zoom = newZoom;
      applyViewportTransform();
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      const rect = viewportEl.getBoundingClientRect();
      const newZoom = Math.max(0.2, state.viewport.zoom / 1.2);
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      state.viewport.x = cx - (cx - state.viewport.x) * (newZoom / state.viewport.zoom);
      state.viewport.y = cy - (cy - state.viewport.y) * (newZoom / state.viewport.zoom);
      state.viewport.zoom = newZoom;
      applyViewportTransform();
    });

    document.getElementById('btn-fit-view').addEventListener('click', fitToScreen);

    document.querySelectorAll('#fill-color-palette [data-fill]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetIds = state.selectedNodeIds.size > 0 ? Array.from(state.selectedNodeIds) : (state.selectedNodeId ? [state.selectedNodeId] : []);
        if (targetIds.length === 0) return;
        pushHistory();
        targetIds.forEach(id => {
          const node = state.nodes.find(n => n.id === id);
          if (node) node.fill = btn.dataset.fill;
        });
        renderNodes();
        persistToLocalStorage();
      });
    });

    document.querySelectorAll('#stroke-color-palette [data-stroke]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetIds = state.selectedNodeIds.size > 0 ? Array.from(state.selectedNodeIds) : (state.selectedNodeId ? [state.selectedNodeId] : []);
        if (targetIds.length === 0) return;
        pushHistory();
        targetIds.forEach(id => {
          const node = state.nodes.find(n => n.id === id);
          if (node) node.stroke = btn.dataset.stroke;
        });
        renderNodes();
        persistToLocalStorage();
      });
    });

    document.getElementById('btn-edit-text').addEventListener('click', () => {
      if (state.selectedNodeId) {
        startEditingNode(state.selectedNodeId);
      }
    });

    document.getElementById('btn-group-nodes').addEventListener('click', groupSelectedNodes);
    document.getElementById('btn-ungroup-nodes').addEventListener('click', ungroupSelectedNodes);

    document.getElementById('edge-style-select').addEventListener('change', (e) => {
      const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
      if (!edge || edge.style === e.target.value) return;
      pushHistory();
      edge.style = e.target.value;
      delete edge.routePoints;
      renderEdges();
      persistToLocalStorage();
    });

    document.getElementById('edge-arrow-check').addEventListener('change', (e) => {
      const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
      if (!edge) return;
      pushHistory();
      edge.arrow = e.target.checked;
      renderEdges();
      persistToLocalStorage();
    });

    document.getElementById('btn-reset-edge-bends').addEventListener('click', () => {
      const edge = state.edges.find(item => item.id === state.selectedEdgeId);
      if (!edge || !edge.routePoints) return;
      pushHistory();
      delete edge.routePoints;
      renderEdges();
      persistToLocalStorage();
    });

    document.querySelectorAll('#edge-color-palette [data-edge-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
        if (!edge) return;
        pushHistory();
        edge.color = btn.dataset.edgeColor;
        renderEdges();
        persistToLocalStorage();
      });
    });

    document.getElementById('btn-edge-random-color').addEventListener('click', () => {
      const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
      if (!edge) return;
      pushHistory();
      edge.color = getRandomEdgeColor(edge.color);
      recordColorHistory('edge', edge.color);
      renderEdges();
      renderEdgeColorSlots();
      syncColorPickerWithCurrent(false);
      persistToLocalStorage();
    });

    function copySelectedNodes() {
      if (state.editingNodeId) return false;
      const targetIds = new Set(state.selectedNodeIds);
      if (state.selectedNodeId) targetIds.add(state.selectedNodeId);

      // グループメンバーも自動包含
      for (const id of Array.from(targetIds)) {
        const n = state.nodes.find(x => x.id === id);
        if (n && n.groupId) {
          for (const member of state.nodes) {
            if (member.groupId === n.groupId) {
              targetIds.add(member.id);
            }
          }
        }
      }

      if (targetIds.size === 0) return false;

      const copiedNodes = state.nodes
        .filter(n => targetIds.has(n.id))
        .map(n => JSON.parse(JSON.stringify(n)));

      // 選択されたノード同士をつなぐ内部エッジも一緒にコピー
      const copiedEdges = state.edges
        .filter(e => targetIds.has(e.source) && targetIds.has(e.target))
        .map(e => JSON.parse(JSON.stringify(e)));

      state.clipboard = {
        nodes: copiedNodes,
        edges: copiedEdges,
        pasteCount: 0
      };

      showToast(copiedNodes.length > 1
        ? `${copiedNodes.length}個のオブジェクトをコピーしました`
        : 'オブジェクトをコピーしました');
      return true;
    }

    function pasteNodes() {
      if (state.editingNodeId) return false;
      if (!state.clipboard || !state.clipboard.nodes || state.clipboard.nodes.length === 0) {
        return false;
      }

      pushHistory();
      state.clipboard.pasteCount += 1;
      const offset = 24 * state.clipboard.pasteCount;

      const idMap = new Map();
      const groupMap = new Map();
      const newNodes = [];
      const timestamp = Date.now();

      state.clipboard.nodes.forEach((orig, idx) => {
        const newId = `node_${timestamp}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
        idMap.set(orig.id, newId);

        const cloned = JSON.parse(JSON.stringify(orig));
        cloned.id = newId;
        cloned.x = Math.round(orig.x + offset);
        cloned.y = Math.round(orig.y + offset);

        if (orig.groupId) {
          if (!groupMap.has(orig.groupId)) {
            groupMap.set(orig.groupId, `group_${timestamp}_${Math.random().toString(36).slice(2, 6)}`);
          }
          cloned.groupId = groupMap.get(orig.groupId);
        }

        newNodes.push(cloned);
      });

      const newEdges = [];
      state.clipboard.edges.forEach((origEdge, idx) => {
        const newSource = idMap.get(origEdge.source);
        const newTarget = idMap.get(origEdge.target);
        if (newSource && newTarget) {
          const clonedEdge = JSON.parse(JSON.stringify(origEdge));
          clonedEdge.id = `edge_${timestamp}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
          clonedEdge.source = newSource;
          clonedEdge.target = newTarget;
          newEdges.push(clonedEdge);
        }
      });

      state.nodes.push(...newNodes);
      state.edges.push(...newEdges);

      // ペーストしたオブジェクトを選択状態にする
      state.selectedEdgeId = null;
      state.selectedNodeIds.clear();
      newNodes.forEach(n => state.selectedNodeIds.add(n.id));
      state.selectedNodeId = newNodes[0] ? newNodes[0].id : null;

      renderAll();
      persistToLocalStorage();
      showToast(newNodes.length > 1
        ? `${newNodes.length}個のオブジェクトを貼り付けました`
        : 'オブジェクトを貼り付けました');
      return true;
    }

    function deleteSelectedElement() {
      if (state.editingNodeId) return;
      const targetIds = new Set(state.selectedNodeIds);
      if (state.selectedNodeId) targetIds.add(state.selectedNodeId);
      for (const id of Array.from(targetIds)) {
        const n = state.nodes.find(x => x.id === id);
        if (n && n.groupId) {
          for (const member of state.nodes) {
            if (member.groupId === n.groupId) {
              targetIds.add(member.id);
            }
          }
        }
      }

      if (targetIds.size > 0) {
        pushHistory();
        state.nodes = state.nodes.filter(n => !targetIds.has(n.id));
        state.edges = state.edges.filter(e => !targetIds.has(e.source) && !targetIds.has(e.target));
        state.selectedNodeId = null;
        state.selectedNodeIds.clear();
        renderAll();
        persistToLocalStorage();
        showToast(targetIds.size > 1 ? `${targetIds.size}個の図形を一括削除しました` : '図形を削除しました');
      } else if (state.selectedEdgeId) {
        pushHistory();
        state.edges = state.edges.filter(e => e.id !== state.selectedEdgeId);
        state.selectedEdgeId = null;
        renderAll();
        persistToLocalStorage();
        showToast('接続線を削除しました');
      }
    }

    document.getElementById('btn-delete-selected').addEventListener('click', deleteSelectedElement);
    document.getElementById('btn-delete-edge').addEventListener('click', deleteSelectedElement);

    // URLメニュー・モーダルイベント登録
    document.getElementById('ctx-edit-url').addEventListener('click', () => {
      closeUrlMenu();
      openUrlEditModal(currentUrlContext.nodeId, currentUrlContext.url);
    });
    document.getElementById('ctx-copy-url').addEventListener('click', copyUrlToClipboard);
    document.getElementById('ctx-delete-url').addEventListener('click', deleteUrlFromNode);

    document.getElementById('btn-close-url-modal').addEventListener('click', closeUrlEditModal);
    document.getElementById('btn-cancel-url-modal').addEventListener('click', closeUrlEditModal);
    document.getElementById('btn-save-url-modal').addEventListener('click', saveEditedUrl);
    modalUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEditedUrl();
      } else if (e.key === 'Escape') {
        closeUrlEditModal();
      }
    });

    const btnBringFront = document.getElementById('btn-bring-front');
    if (btnBringFront) btnBringFront.addEventListener('click', bringToFront);
    const btnSendBack = document.getElementById('btn-send-back');
    if (btnSendBack) btnSendBack.addEventListener('click', sendToBack);

    const ctxBringFront = document.getElementById('ctx-bring-front');
    if (ctxBringFront) ctxBringFront.addEventListener('click', () => { closeNodeContextMenu(); bringToFront(); });
    const ctxSendBack = document.getElementById('ctx-send-back');
    if (ctxSendBack) ctxSendBack.addEventListener('click', () => { closeNodeContextMenu(); sendToBack(); });
    const ctxNodeGroup = document.getElementById('ctx-node-group');
    if (ctxNodeGroup) ctxNodeGroup.addEventListener('click', () => { closeNodeContextMenu(); groupSelectedNodes(); });
    const ctxNodeUngroup = document.getElementById('ctx-node-ungroup');
    if (ctxNodeUngroup) ctxNodeUngroup.addEventListener('click', () => { closeNodeContextMenu(); ungroupSelectedNodes(); });
    const ctxNodeDelete = document.getElementById('ctx-node-delete');
    if (ctxNodeDelete) ctxNodeDelete.addEventListener('click', () => { closeNodeContextMenu(); deleteSelectedElement(); });

    window.addEventListener('pointerdown', (e) => {
      if (urlContextMenu && !urlContextMenu.contains(e.target) && !e.target.closest('.url-dots-btn')) {
        closeUrlMenu();
      }
      if (nodeContextMenu && !nodeContextMenu.contains(e.target)) {
        closeNodeContextMenu();
      }
    });

    // キーボードショートカット
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeImageUploadModal();
        closeUrlEditModal();
        closeUrlMenu();
        closeNodeContextMenu();
      }

      if (state.editingNodeId) return;
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (!isMod && !document.body.classList.contains('freehand-mode') &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const selectedIds = new Set(state.selectedNodeIds);
        if (state.selectedNodeId) selectedIds.add(state.selectedNodeId);
        if (selectedIds.size === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const before = createSnapshot();
        selectedIds.forEach(id => {
          const node = state.nodes.find(item => item.id === id);
          if (node) {
            node.x += dx;
            node.y += dy;
          }
        });
        pushHistory(before);
        renderNodes();
        renderEdges();
        updatePropertyBar();
        renderMinimap();
        persistToLocalStorage();
        return;
      }

      if (isMod && key === 'c') {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        if (copySelectedNodes()) {
          e.preventDefault();
        }
      } else if (isMod && key === 'v') {
        if (state.clipboard && state.clipboard.nodes && state.clipboard.nodes.length > 0) {
          e.preventDefault();
          pasteNodes();
        }
      } else if (isMod && key === 'd') {
        if (copySelectedNodes()) {
          e.preventDefault();
          pasteNodes();
        }
      } else if (isMod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          ungroupSelectedNodes();
        } else {
          groupSelectedNodes();
        }
      } else if (isMod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (isMod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedElement();
      } else if (isMod && key === 's') {
        e.preventDefault();
        saveToLocalJsonFile();
      } else if (isMod && key === 'f') {
        e.preventDefault();
        searchInput.focus();
      }
    });


    // 俯瞰マップ表示/非表示トグル（初期表示：表示）
    const minimapWrapper = document.getElementById('minimap-wrapper');
    const btnToggleMinimap = document.getElementById('btn-toggle-minimap');
    let minimapVisible = true;

    function setMinimapVisible(visible) {
      minimapVisible = visible;
      if (minimapWrapper) {
        minimapWrapper.classList.toggle('hidden', !visible);
      }
      if (btnToggleMinimap) {
        btnToggleMinimap.setAttribute('aria-pressed', String(visible));
        btnToggleMinimap.style.color = currentTheme === 'dark'
          ? (visible ? '#e6c27a' : '#aa9a80')
          : (visible ? '#2563eb' : '#64748b');
        btnToggleMinimap.style.backgroundColor = visible
          ? (currentTheme === 'dark' ? '#49391f' : '#eff6ff')
          : '';
      }
      if (visible) {
        renderMinimap();
      }
    }

    if (btnToggleMinimap) {
      setMinimapVisible(true);
      btnToggleMinimap.addEventListener('click', () => {
        setMinimapVisible(!minimapVisible);
      });
    }

    // 左下操作ガイド 💡 トグル（同一枠内の詳細テキストを表示/非表示）
    const guideBody = document.getElementById('guide-body');
    const btnToggleGuide = document.getElementById('btn-toggle-guide');
    let guideVisible = false;

    function setGuideVisible(visible) {
      guideVisible = Boolean(visible);
      if (guideBody) {
        guideBody.classList.toggle('hidden', !guideVisible);
      }
      if (btnToggleGuide) {
        btnToggleGuide.setAttribute('aria-expanded', String(guideVisible));
        btnToggleGuide.classList.toggle('active', guideVisible);
      }
    }

    if (btnToggleGuide) {
      setGuideVisible(false);
      btnToggleGuide.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
      btnToggleGuide.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setGuideVisible(!guideVisible);
      });
    }

    window.addEventListener('resize', renderMinimap);

    window.addEventListener('DOMContentLoaded', async () => {
      const restored = await loadFromLocalStorage();
      const migratedTextOpacity = restored && migrateLegacyTextOpacity(state.nodes);
      if (!restored) {
        const sample = getSampleData();
        state.nodes = sample.nodes;
        state.edges = sample.edges;
        state.viewport = sample.viewport;
        persistToLocalStorage();
      }
      state.nodes.forEach(n => {
        if (n.fill && n.fill !== 'transparent') recordColorHistory('fill', n.fill);
        if (n.stroke && n.stroke !== 'transparent') recordColorHistory('stroke', n.stroke);
      });
      state.edges.forEach(ed => {
        if (ed.color && ed.color !== 'transparent') recordColorHistory('edge', ed.color);
      });
      renderAll();
      if (migratedTextOpacity) persistToLocalStorage();
    });
