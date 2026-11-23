    // 検索ロジック
    const searchInput = document.getElementById('search-input');
    const searchDropdown = document.getElementById('search-dropdown');
    const searchCounter = document.getElementById('search-counter');
    const searchCountText = document.getElementById('search-count-text');

    function performSearch(query) {
      state.searchQuery = query.trim().toLowerCase();
      if (!state.searchQuery) {
        state.searchMatches = [];
        state.searchMatchIndex = 0;
        searchCounter.classList.add('hidden');
        searchDropdown.classList.add('hidden');
        renderNodes();
        return;
      }

      const matches = state.nodes.filter(n => {
        if (!isNodeVisibleByTags(n)) return false;
        const searchable = `${n.text || ''} ${n.alt || ''}`.toLowerCase();
        return searchable.includes(state.searchQuery);
      });
      state.searchMatches = matches.map(n => n.id);
      state.searchMatchIndex = 0;

      renderNodes();

      if (matches.length > 0) {
        searchCounter.classList.remove('hidden');
        searchCountText.textContent = `1/${matches.length}`;
        searchDropdown.innerHTML = '';
        matches.forEach((m, idx) => {
          const item = document.createElement('button');
          item.className = 'search-dropdown-item';
          const rawLabel = m.type === 'image' ? `[画像] ${m.alt || '画像'}` : (m.text || '').replace(/\n/g, ' ');
          const previewText = rawLabel.slice(0, 48) || '(空の図形)';
          item.innerHTML = `<span class="search-item-text">${escapeHtml(previewText)}</span><span class="search-item-hint">移動 ↵</span>`;
          item.addEventListener('click', () => {
            state.searchMatchIndex = idx;
            searchCountText.textContent = `${idx + 1}/${matches.length}`;
            focusOnNode(m.id);
            searchDropdown.classList.add('hidden');
          });
          searchDropdown.appendChild(item);
        });
        searchDropdown.classList.remove('hidden');
      } else {
        searchCounter.classList.remove('hidden');
        searchCountText.textContent = '0/0';
        searchDropdown.innerHTML = `<div class="search-empty">一致する図形が見つかりません</div>`;
        searchDropdown.classList.remove('hidden');
      }
    }

    searchInput.addEventListener('input', (e) => performSearch(e.target.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && state.searchMatches.length > 0) {
        e.preventDefault();
        const targetId = state.searchMatches[state.searchMatchIndex];
        focusOnNode(targetId);
        state.searchMatchIndex = (state.searchMatchIndex + 1) % state.searchMatches.length;
        searchCountText.textContent = `${state.searchMatchIndex === 0 ? state.searchMatches.length : state.searchMatchIndex}/${state.searchMatches.length}`;
        searchDropdown.classList.add('hidden');
      } else if (e.key === 'Escape') {
        searchDropdown.classList.add('hidden');
      }
    });

    document.getElementById('btn-search-next').addEventListener('click', () => {
      if (state.searchMatches.length === 0) return;
      const targetId = state.searchMatches[state.searchMatchIndex];
      focusOnNode(targetId);
      state.searchMatchIndex = (state.searchMatchIndex + 1) % state.searchMatches.length;
      searchCountText.textContent = `${state.searchMatchIndex === 0 ? state.searchMatches.length : state.searchMatchIndex}/${state.searchMatches.length}`;
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
        searchDropdown.classList.add('hidden');
      }
    });

    // JSONファイル保存（開いたファイルがあれば同じファイルへ上書き）
    async function saveToLocalJsonFile() {
      const exportData = {
        app: 'InMyMind',
        version: 1,
        exportedAt: new Date().toISOString(),
        viewport: state.viewport,
        nodes: state.nodes,
        edges: state.edges
      };
      const jsonStr = JSON.stringify(exportData, null, 2);

      try {
        let handle = state.fileHandle;
        if (!handle && 'showSaveFilePicker' in window) {
          handle = await window.showSaveFilePicker({
            suggestedName: 'diagram.json',
            types: [{
              description: 'Diagram JSON File',
              accept: { 'application/json': ['.json'] }
            }]
          });
        }

        if (handle?.createWritable) {
          if (handle.requestPermission) {
            const permission = await handle.requestPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
              showToast('ファイルへの書き込みが許可されていません');
              return;
            }
          }
          const writable = await handle.createWritable();
          await writable.write(jsonStr);
          await writable.close();
          state.fileHandle = handle;
          const fileName = handle.name || 'diagram.json';
          fileStatusLabel.textContent = `保存済: ${fileName}`;
          showToast(`「${fileName}」に保存しました`);
          return;
        }

        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'diagram.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('diagram.json をダウンロードしました');
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('JSON save failed:', err);
        showToast('JSONファイルの保存に失敗しました');
      }
    }

    // ローカルJSONファイル読み込み
    async function openLocalJsonFile() {
      if ('showOpenFilePicker' in window) {
        try {
          const [handle] = await window.showOpenFilePicker({
            types: [{
              description: 'Diagram JSON File',
              accept: { 'application/json': ['.json'] }
            }],
            multiple: false
          });
          const file = await handle.getFile();
          const text = await file.text();
          applyImportedJson(text, file.name, handle);
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
      document.getElementById('hidden-file-input').click();
    }

    function applyImportedJson(jsonText, fileName = 'diagram.json', handle = null) {
      try {
        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          showToast('エラー: 有効なダイアグラムJSON形式ではありません');
          return;
        }
        pushHistory();
        state.nodes = parsed.nodes;
        migrateLegacyTextOpacity(state.nodes);
        state.edges = parsed.edges;
        state.hiddenTags.clear();
        if (parsed.viewport) {
          state.viewport = parsed.viewport;
        }
        state.selectedNodeId = null;
        state.selectedNodeIds.clear();
        state.selectedEdgeId = null;
        state.editingNodeId = null;
        state.fileHandle = handle;

        renderAll();
        persistToLocalStorage();
        fileStatusLabel.textContent = `読込済: ${fileName}`;
        showToast(`「${fileName}」を読み込みました`);
      } catch (e) {
        showToast('ファイルの解析に失敗しました');
      }
    }

    document.getElementById('hidden-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => applyImportedJson(ev.target.result, file.name, null);
      reader.readAsText(file);
      e.target.value = '';
    });
