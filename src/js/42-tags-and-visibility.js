    // タグ編集とタグ別表示フィルター
    const hiddenTagNames = state.hiddenTags;
    const tagFilterButton = document.getElementById('btn-tag-filter');
    const tagFilterPanel = document.getElementById('tag-filter-panel');
    const tagFilterList = document.getElementById('tag-filter-list');
    const tagFilterActiveCount = document.getElementById('tag-filter-active-count');
    const nodeTagList = document.getElementById('node-tag-list');
    const nodeTagInput = document.getElementById('node-tag-input');
    let tagVisibilityCache = new Map();

    function getNodeTags(node) {
      const source = Array.isArray(node.tags) ? node.tags : (typeof node.tags === 'string' ? [node.tags] : []);
      return [...new Set(source.map(tag => String(tag).trim()).filter(Boolean))];
    }

    function rebuildTagVisibilityCache() {
      const groupTags = new Map();
      for (const node of state.nodes) {
        if (!node.groupId) continue;
        if (!groupTags.has(node.groupId)) groupTags.set(node.groupId, new Set());
        getNodeTags(node).forEach(tag => groupTags.get(node.groupId).add(tag));
      }

      tagVisibilityCache = new Map();
      for (const node of state.nodes) {
        const tags = node.groupId
          ? [...(groupTags.get(node.groupId) || [])]
          : getNodeTags(node);
        tagVisibilityCache.set(node.id, tags.length === 0 || tags.some(tag => !hiddenTagNames.has(tag)));
      }
    }

    function isNodeVisibleByTags(node) {
      if (tagVisibilityCache.has(node.id)) return tagVisibilityCache.get(node.id);
      const tags = getNodeTags(node);
      return tags.length === 0 || tags.some(tag => !hiddenTagNames.has(tag));
    }

    function getAllTags() {
      const tags = new Set();
      state.nodes.forEach(node => getNodeTags(node).forEach(tag => tags.add(tag)));
      return [...tags].sort((a, b) => a.localeCompare(b, 'ja'));
    }

    function renderTagFilter() {
      if (!tagFilterList) return;
      const tags = getAllTags();
      for (const hiddenTag of [...hiddenTagNames]) {
        if (!tags.includes(hiddenTag)) hiddenTagNames.delete(hiddenTag);
      }

      tagFilterList.innerHTML = '';
      if (tags.length === 0) {
        tagFilterList.innerHTML = '<div class="tag-filter-empty">図形を選択してタグを追加すると、ここで表示を切り替えられます。</div>';
      } else {
        for (const tag of tags) {
          const count = state.nodes.filter(node => getNodeTags(node).includes(tag)).length;
          const label = document.createElement('label');
          label.className = 'tag-filter-option';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = !hiddenTagNames.has(tag);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) hiddenTagNames.delete(tag);
            else hiddenTagNames.add(tag);
            refreshTagVisibility();
          });
          const name = document.createElement('span');
          name.className = 'tag-filter-name';
          name.textContent = tag;
          const nodeCount = document.createElement('span');
          nodeCount.className = 'tag-filter-node-count';
          nodeCount.textContent = `${count}要素`;
          label.append(checkbox, name, nodeCount);
          tagFilterList.appendChild(label);
        }
      }

      const visibleTags = tags.length - tags.filter(tag => hiddenTagNames.has(tag)).length;
      if (tagFilterActiveCount) {
        tagFilterActiveCount.textContent = hiddenTagNames.size === 0 ? '全て' : `${visibleTags}/${tags.length}`;
      }
      rebuildTagVisibilityCache();
    }

    function refreshTagVisibility() {
      rebuildTagVisibilityCache();
      state.selectedNodeIds = new Set([...state.selectedNodeIds].filter(id => {
        const node = state.nodes.find(item => item.id === id);
        return node && isNodeVisibleByTags(node);
      }));
      if (state.selectedNodeId) {
        const selected = state.nodes.find(node => node.id === state.selectedNodeId);
        if (!selected || !isNodeVisibleByTags(selected)) state.selectedNodeId = null;
      }
      if (!state.selectedNodeId && state.selectedNodeIds.size > 0) {
        state.selectedNodeId = state.selectedNodeIds.values().next().value;
      }
      if (state.selectedNodeIds.size === 0) state.selectedNodeId = null;

      if (state.selectedEdgeId) {
        const edge = state.edges.find(item => item.id === state.selectedEdgeId);
        const source = edge && state.nodes.find(node => node.id === edge.source);
        const target = edge && state.nodes.find(node => node.id === edge.target);
        if (!source || !target || !isNodeVisibleByTags(source) || !isNodeVisibleByTags(target)) {
          state.selectedEdgeId = null;
        }
      }

      renderAll();
      if (searchInput.value.trim()) performSearch(searchInput.value);
      renderTagFilter();
    }

    function getSelectedNodesForTagEdit() {
      const ids = new Set(state.selectedNodeIds);
      if (state.selectedNodeId) ids.add(state.selectedNodeId);
      return state.nodes.filter(node => ids.has(node.id));
    }

    function renderNodeTagEditor() {
      if (!nodeTagList) return;
      const selectedNodes = getSelectedNodesForTagEdit();
      nodeTagList.innerHTML = '';
      const tagListLabel = document.getElementById('node-tag-list-label');
      if (selectedNodes.length === 0) {
        if (tagListLabel) tagListLabel.textContent = 'タグ: 未設定';
        return;
      }

      const tagCounts = new Map();
      selectedNodes.forEach(node => getNodeTags(node).forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }));
      if (tagListLabel) tagListLabel.textContent = tagCounts.size > 0 ? 'タグ:' : 'タグ: 未設定';
      for (const [tag, count] of [...tagCounts].sort(([a], [b]) => a.localeCompare(b, 'ja'))) {
        const chip = document.createElement('span');
        chip.className = `node-tag-chip ${count < selectedNodes.length ? 'partial' : ''}`;
        chip.title = count < selectedNodes.length ? '選択中の一部の要素に設定されています' : tag;
        const name = document.createElement('span');
        name.textContent = tag;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'node-tag-remove';
        remove.textContent = '×';
        remove.title = `選択中の要素から「${tag}」を削除`;
        remove.addEventListener('click', () => updateSelectedNodeTag(tag, false));
        chip.append(name, remove);
        nodeTagList.appendChild(chip);
      }
    }

    function updateSelectedNodeTag(rawTag, add) {
      const tag = String(rawTag || '').trim();
      if (!tag) return;
      if (tag.length > 32) {
        showToast('タグは32文字以内で入力してください');
        return;
      }
      const selectedNodes = getSelectedNodesForTagEdit();
      if (selectedNodes.length === 0) return;
      const hasChange = selectedNodes.some(node => add
        ? !getNodeTags(node).includes(tag)
        : getNodeTags(node).includes(tag));
      if (!hasChange) return;

      pushHistory();
      if (add) hiddenTagNames.delete(tag);
      for (const node of selectedNodes) {
        const tags = getNodeTags(node);
        if (add && !tags.includes(tag)) tags.push(tag);
        if (!add && tags.includes(tag)) node.tags = tags.filter(item => item !== tag);
        else if (add) node.tags = tags;
        if (!Array.isArray(node.tags) || node.tags.length === 0) delete node.tags;
      }
      rebuildTagVisibilityCache();
      refreshTagVisibility();
      persistToLocalStorage();
    }

    function addTagFromInput() {
      const value = nodeTagInput.value.trim();
      if (!value) return;
      updateSelectedNodeTag(value, true);
      nodeTagInput.value = '';
      nodeTagInput.focus();
    }

    tagFilterButton?.addEventListener('click', () => {
      const open = tagFilterPanel.classList.contains('hidden');
      tagFilterPanel.classList.toggle('hidden', !open);
      tagFilterButton.setAttribute('aria-expanded', String(open));
      if (open) renderTagFilter();
    });

    document.getElementById('btn-show-all-tags')?.addEventListener('click', () => {
      hiddenTagNames.clear();
      refreshTagVisibility();
    });

    document.getElementById('btn-add-node-tag')?.addEventListener('click', addTagFromInput);
    nodeTagInput?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addTagFromInput();
      }
      event.stopPropagation();
    });
    nodeTagInput?.addEventListener('pointerdown', event => event.stopPropagation());

    document.addEventListener('click', event => {
      if (!tagFilterPanel || tagFilterPanel.classList.contains('hidden')) return;
      if (!tagFilterPanel.contains(event.target) && !tagFilterButton.contains(event.target)) {
        tagFilterPanel.classList.add('hidden');
        tagFilterButton.setAttribute('aria-expanded', 'false');
      }
    });

    renderTagFilter();
