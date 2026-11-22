    function updatePropertyBar() {
      const hasNodeSelection = state.selectedNodeIds.size > 0 || !!state.selectedNodeId;
      if (hasNodeSelection) {
        propertyBar.classList.remove('hidden');
        nodeProps.classList.remove('hidden');
        edgeProps.classList.add('hidden');
        renderColorSlots();
        renderNodeTagEditor();
        if (pickerState.activeKind && pickerPanel && !pickerPanel.classList.contains('hidden')) {
          syncColorPickerWithCurrent(true);
        }
        const btnEditText = document.getElementById('btn-edit-text');
        if (btnEditText) btnEditText.classList.remove('hidden');

        if (btnGroupNodes) {
          if (state.selectedNodeIds.size >= 2) {
            btnGroupNodes.classList.remove('hidden');
          } else {
            btnGroupNodes.classList.add('hidden');
          }
        }

        if (btnUngroupNodes) {
          const hasGrouped = state.nodes.some(n => state.selectedNodeIds.has(n.id) && n.groupId);
          if (hasGrouped) {
            btnUngroupNodes.classList.remove('hidden');
          } else {
            btnUngroupNodes.classList.add('hidden');
          }
        }
      } else if (state.selectedEdgeId) {
        const edge = state.edges.find(e => e.id === state.selectedEdgeId);
        if (edge) {
          propertyBar.classList.remove('hidden');
          const btnEditText = document.getElementById('btn-edit-text');
          if (btnEditText) btnEditText.classList.add('hidden');
          nodeProps.classList.add('hidden');
          edgeProps.classList.remove('hidden');
          renderEdgeColorSlots();
          if (pickerState.activeKind === 'edge' && pickerPanel && !pickerPanel.classList.contains('hidden')) {
            syncColorPickerWithCurrent(true);
          }
          document.getElementById('edge-style-select').value = edge.style || 'bezier';
          document.getElementById('edge-arrow-check').checked = edge.arrow !== false;
        }
      } else {
        propertyBar.classList.add('hidden');
        if (pickerPanel) pickerPanel.classList.add('hidden');
      }
    }

    function selectNode(nodeId, isMultiSelect = false) {
      state.selectedEdgeId = null;
      const clickedNode = state.nodes.find(n => n.id === nodeId);
      if (!clickedNode) return;

      if (isMultiSelect) {
        if (state.selectedNodeIds.has(nodeId)) {
          if (clickedNode.groupId) {
            const groupNodeIds = state.nodes.filter(n => n.groupId === clickedNode.groupId).map(n => n.id);
            groupNodeIds.forEach(id => state.selectedNodeIds.delete(id));
          } else {
            state.selectedNodeIds.delete(nodeId);
          }
        } else {
          if (clickedNode.groupId) {
            const groupNodeIds = state.nodes.filter(n => n.groupId === clickedNode.groupId).map(n => n.id);
            groupNodeIds.forEach(id => state.selectedNodeIds.add(id));
          } else {
            state.selectedNodeIds.add(nodeId);
          }
        }
      } else {
        if (clickedNode.groupId) {
          const groupNodeIds = state.nodes.filter(n => n.groupId === clickedNode.groupId).map(n => n.id);
          state.selectedNodeIds.clear();
          groupNodeIds.forEach(id => state.selectedNodeIds.add(id));
        } else {
          state.selectedNodeIds.clear();
          state.selectedNodeIds.add(nodeId);
        }
      }

      state.selectedNodeId = state.selectedNodeIds.values().next().value || null;

      document.querySelectorAll('.diagram-node').forEach(el => {
        if (state.selectedNodeIds.has(el.dataset.nodeId)) {
          el.classList.add('selected');
        } else {
          el.classList.remove('selected');
        }
      });
      document.querySelectorAll('.edge-group.selected').forEach(el => el.classList.remove('selected'));
      updatePropertyBar();
    }

    function selectNodes(nodeIds) {
      state.selectedEdgeId = null;
      state.selectedNodeIds.clear();
      for (const id of nodeIds) {
        state.selectedNodeIds.add(id);
      }
      state.selectedNodeId = state.selectedNodeIds.values().next().value || null;

      document.querySelectorAll('.diagram-node').forEach(el => {
        if (state.selectedNodeIds.has(el.dataset.nodeId)) {
          el.classList.add('selected');
        } else {
          el.classList.remove('selected');
        }
      });
      document.querySelectorAll('.edge-group.selected').forEach(el => el.classList.remove('selected'));
      updatePropertyBar();
    }

    function selectEdge(edgeId) {
      state.selectedEdgeId = edgeId;
      state.selectedNodeId = null;
      state.selectedNodeIds.clear();
      state.editingNodeId = null;
      renderNodes();
      renderEdges();
      updatePropertyBar();
    }

    function clearSelection() {
      if (state.editingNodeId) return;
      if (state.selectedNodeIds.size === 0 && !state.selectedNodeId && !state.selectedEdgeId) return;
      state.selectedNodeId = null;
      state.selectedNodeIds.clear();
      state.selectedEdgeId = null;
      document.querySelectorAll('.diagram-node.selected').forEach(el => el.classList.remove('selected'));
      document.querySelectorAll('.edge-group.selected').forEach(el => el.classList.remove('selected'));
      updatePropertyBar();
    }

    function groupSelectedNodes() {
      const selectedIds = Array.from(state.selectedNodeIds);
      if (selectedIds.length < 2) {
        showToast('グループ化するには2つ以上の図形を選択してください');
        return;
      }
      pushHistory();
      const newGroupId = 'group_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      for (const id of selectedIds) {
        const node = state.nodes.find(n => n.id === id);
        if (node) {
          node.groupId = newGroupId;
        }
      }
      renderNodes();
      persistToLocalStorage();
      showToast(`${selectedIds.length}個の図形をグループ化しました (Ctrl+G)`);
    }

    function ungroupSelectedNodes() {
      const selectedIds = Array.from(state.selectedNodeIds);
      const groupedNodes = state.nodes.filter(n => selectedIds.includes(n.id) && n.groupId);
      if (groupedNodes.length === 0) {
        showToast('選択中の図形にグループはありません');
        return;
      }
      pushHistory();
      const groupIdsToClear = new Set(groupedNodes.map(n => n.groupId));
      for (const node of state.nodes) {
        if (node.groupId && groupIdsToClear.has(node.groupId)) {
          delete node.groupId;
        }
      }
      renderNodes();
      persistToLocalStorage();
      showToast('グループを解除しました (Ctrl+Shift+G)');
    }

    function bringToFront() {
      const selectedIds = new Set(state.selectedNodeIds);
      if (selectedIds.size === 0 && state.selectedNodeId) {
        selectedIds.add(state.selectedNodeId);
      }
      if (selectedIds.size === 0) return;

      const unselected = [];
      const selected = [];
      for (const node of state.nodes) {
        if (selectedIds.has(node.id)) {
          selected.push(node);
        } else {
          unselected.push(node);
        }
      }

      if (selected.length === 0 || unselected.length === 0) return;

      pushHistory();
      state.nodes = [...unselected, ...selected];
      renderNodes();
      persistToLocalStorage();
      showToast('最前面へ移動しました');
    }

    function sendToBack() {
      const selectedIds = new Set(state.selectedNodeIds);
      if (selectedIds.size === 0 && state.selectedNodeId) {
        selectedIds.add(state.selectedNodeId);
      }
      if (selectedIds.size === 0) return;

      const unselected = [];
      const selected = [];
      for (const node of state.nodes) {
        if (selectedIds.has(node.id)) {
          selected.push(node);
        } else {
          unselected.push(node);
        }
      }

      if (selected.length === 0 || unselected.length === 0) return;

      pushHistory();
      state.nodes = [...selected, ...unselected];
      renderNodes();
      persistToLocalStorage();
      showToast('最背面へ移動しました');
    }

    const nodeContextMenu = document.getElementById('node-context-menu');

    function openNodeContextMenu(e, nodeId) {
      if (!state.selectedNodeIds.has(nodeId)) {
        selectNode(nodeId, false);
      }

      closeUrlMenu();
      if (!nodeContextMenu) return;

      const ctxGroup = document.getElementById('ctx-node-group');
      const ctxUngroup = document.getElementById('ctx-node-ungroup');
      if (ctxGroup) {
        ctxGroup.style.display = state.selectedNodeIds.size >= 2 ? 'flex' : 'none';
      }
      if (ctxUngroup) {
        const hasGrouped = state.nodes.some(n => state.selectedNodeIds.has(n.id) && n.groupId);
        ctxUngroup.style.display = hasGrouped ? 'flex' : 'none';
      }

      nodeContextMenu.classList.remove('hidden');
      const menuW = 180;
      const menuH = 190;
      const x = Math.min(window.innerWidth - menuW - 12, Math.max(8, e.clientX));
      const y = Math.min(window.innerHeight - menuH - 12, Math.max(8, e.clientY));
      nodeContextMenu.style.left = `${x}px`;
      nodeContextMenu.style.top = `${y}px`;
    }

    function closeNodeContextMenu() {
      if (nodeContextMenu) nodeContextMenu.classList.add('hidden');
    }

    function startEditingNode(nodeId) {
      const node = state.nodes.find(n => n.id === nodeId);
      if (!node || node.type === 'image') return;
      state.editingNodeId = nodeId;
      state.selectedNodeId = nodeId;
      state.selectedNodeIds.clear();
      state.selectedNodeIds.add(nodeId);
      renderNodes();
    }

    function finishEditingNode(nodeId, newText) {
      const node = state.nodes.find(n => n.id === nodeId);
      if (node && node.text !== newText) {
        pushHistory();
        node.text = newText;
      }
      state.editingNodeId = null;
      renderNodes();
      persistToLocalStorage();
    }

    // ===== URLリンクの編集・操作メニュー制御 =====
    let currentUrlContext = {
      nodeId: null,
      url: null
    };

    const urlContextMenu = document.getElementById('url-context-menu');
    const urlEditModal = document.getElementById('url-edit-modal');
    const modalUrlInput = document.getElementById('modal-url-input');

    function openUrlMenu(e, nodeId, url) {
      currentUrlContext = { nodeId, url };
      urlContextMenu.classList.remove('hidden');

      const menuW = 160;
      const menuH = 110;
      const x = Math.min(window.innerWidth - menuW - 12, Math.max(8, e.clientX));
      const y = Math.min(window.innerHeight - menuH - 12, Math.max(8, e.clientY));
      urlContextMenu.style.left = `${x}px`;
      urlContextMenu.style.top = `${y}px`;
    }

    function closeUrlMenu() {
      if (urlContextMenu) urlContextMenu.classList.add('hidden');
    }

    function openUrlEditModal(nodeId, url) {
      currentUrlContext = { nodeId, url };
      modalUrlInput.value = url || '';
      urlEditModal.classList.remove('hidden');
      setTimeout(() => {
        modalUrlInput.focus();
        modalUrlInput.select();
      }, 50);
    }

    function closeUrlEditModal() {
      if (urlEditModal) urlEditModal.classList.add('hidden');
    }

    function saveEditedUrl() {
      const { nodeId, url: oldUrl } = currentUrlContext;
      const newUrl = modalUrlInput.value.trim();
      if (!nodeId || !newUrl) return;

      if (!/^https?:\/\//i.test(newUrl)) {
        showToast('有効なURL (http:// または https://) を入力してください');
        return;
      }

      const node = state.nodes.find(n => n.id === nodeId);
      if (node) {
        pushHistory();
        if (oldUrl && node.text.includes(oldUrl)) {
          node.text = node.text.replace(oldUrl, newUrl);
        } else {
          node.text = (node.text ? node.text + '\n' : '') + newUrl;
        }
        renderNodes();
        persistToLocalStorage();
        showToast('リンクURLを更新しました');
      }
      closeUrlEditModal();
    }

    function deleteUrlFromNode() {
      const { nodeId, url } = currentUrlContext;
      if (!nodeId || !url) return;
      const node = state.nodes.find(n => n.id === nodeId);
      if (node) {
        pushHistory();
        node.text = node.text.replace(url, '').replace(/\n\s*\n/g, '\n').trim();
        renderNodes();
        persistToLocalStorage();
        showToast('リンクを削除しました');
      }
      closeUrlMenu();
    }

    function copyUrlToClipboard() {
      const { url } = currentUrlContext;
      if (!url) return;
      navigator.clipboard.writeText(url).then(() => {
        showToast('URLをクリップボードにコピーしました');
      }).catch(() => {
        showToast('URLのコピーに失敗しました');
      });
      closeUrlMenu();
    }
