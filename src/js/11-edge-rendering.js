    const EDGE_RANDOM_PALETTE = [
      '#2563eb', // ブルー
      '#059669', // エメラルド
      '#d97706', // アンバー
      '#e11d48', // ローズ
      '#7c3aed', // バイオレット
      '#0891b2', // シアン
      '#ea580c', // オレンジ
      '#db2777', // ピンク
      '#4f46e5', // インディゴ
      '#0d9488', // ティール
      '#65a30d', // ライムグリーン
      '#9333ea'  // パープル
    ];

    let edgeCycleState = { x: 0, y: 0, ids: '', index: -1 };

    // Option/Alt+クリックで、重なっている線やオブジェクトの背面にある線を順番に選ぶ。
    window.addEventListener('pointerdown', event => {
      if (!event.altKey || event.button !== 0) return;
      const edgeIds = [...new Set(document.elementsFromPoint(event.clientX, event.clientY)
        .map(element => element.closest && element.closest('.edge-group'))
        .filter(Boolean)
        .map(group => {
          const hitArea = group.querySelector('.edge-hit-area');
          return hitArea ? hitArea.dataset.edgeId : null;
        })
        .filter(Boolean))];
      if (edgeIds.length === 0) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const idKey = edgeIds.join('|');
      const sameSpot = Math.hypot(event.clientX - edgeCycleState.x, event.clientY - edgeCycleState.y) < 10;
      const sameCandidates = idKey === edgeCycleState.ids;
      edgeCycleState.index = sameSpot && sameCandidates
        ? (edgeCycleState.index + 1) % edgeIds.length
        : 0;
      edgeCycleState.x = event.clientX;
      edgeCycleState.y = event.clientY;
      edgeCycleState.ids = idKey;
      selectEdge(edgeIds[edgeCycleState.index]);
      if (edgeIds.length > 1) {
        showToast(`重なった線を選択中 ${edgeCycleState.index + 1}/${edgeIds.length}（Option+クリックで切替）`);
      }
    }, true);

    function getRandomEdgeColor(excludeColor = null) {
      const candidates = excludeColor
        ? EDGE_RANDOM_PALETTE.filter(c => c.toLowerCase() !== excludeColor.toLowerCase())
        : EDGE_RANDOM_PALETTE;
      const pool = candidates.length > 0 ? candidates : EDGE_RANDOM_PALETTE;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function getArrowMarkerIdForColor(color) {
      const normalized = (color || '#64748b').toLowerCase();
      const safeId = 'arrowhead-' + normalized.replace(/[^a-z0-9]/g, '');
      const defs = document.getElementById('edges-defs');
      if (defs && !document.getElementById(safeId)) {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', safeId);
        marker.setAttribute('markerWidth', '12');
        marker.setAttribute('markerHeight', '9');
        marker.setAttribute('refX', '10.5');
        marker.setAttribute('refY', '4.5');
        marker.setAttribute('orient', 'auto');
        marker.setAttribute('markerUnits', 'userSpaceOnUse');
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', '0 0.8, 11.5 4.5, 0 8.2');
        poly.setAttribute('fill', color || '#64748b');
        marker.appendChild(poly);
        defs.appendChild(marker);
      }
      return safeId;
    }

    function renderEdges() {
      rebuildTagVisibilityCache();
      const nodeMap = new Map(state.nodes.map(n => [n.id, n]));
      const usedSegments = [];
      edgesContainer.innerHTML = '';

      for (const edge of state.edges) {
        const srcNode = nodeMap.get(edge.source);
        const tgtNode = nodeMap.get(edge.target);
        if (!srcNode || !tgtNode) continue;
        if (!isNodeVisibleByTags(srcNode) || !isNodeVisibleByTags(tgtNode)) continue;

        const p1 = getEdgeAnchorPoint(srcNode, edge, 'source');
        const p2 = getEdgeAnchorPoint(tgtNode, edge, 'target');
        const separatedPath = buildBalancedEdgePath(
          p1, edge.sourceAnchor || 'right', edge.targetAnchor || 'left', p2, edge, usedSegments
        );
        const d = separatedPath
          ? separatedPath.d
          : buildEdgePath(p1, edge.sourceAnchor, p2, edge.targetAnchor, edge.style || 'avoid', edge.source, edge.target);
        const routePoints = separatedPath ? separatedPath.points : d.match(/-?\d+(?:\.\d+)?/g)?.map(Number).reduce((points, value, index, values) => {
          if (index % 2 === 0) points.push({ x: value, y: values[index + 1] });
          return points;
        }, []) || [];
        for (let index = 1; index < routePoints.length; index++) {
          const start = routePoints[index - 1];
          const end = routePoints[index];
          if (Math.abs(start.y - end.y) < 0.01) usedSegments.push({ horizontal: true, y: start.y, x1: start.x, x2: end.x });
          else if (Math.abs(start.x - end.x) < 0.01) usedSegments.push({ horizontal: false, x: start.x, y1: start.y, y2: end.y });
        }

        const isSelected = state.selectedEdgeId === edge.id;
        const baseColor = edge.color || '#64748b';
        const strokeColor = baseColor;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', `edge-group ${isSelected ? 'selected' : ''}`);

        const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hitPath.setAttribute('d', d);
        hitPath.setAttribute('class', 'edge-hit-area');
        hitPath.dataset.edgeId = edge.id;
        hitPath.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          selectEdge(edge.id);
        });

        // 選択時・ホバー時の目印を用意し、線色に関わらず見分けやすくする。
        const outlinePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        outlinePath.setAttribute('d', d);
        outlinePath.setAttribute('class', 'edge-selection-outline');
        g.appendChild(outlinePath);

        const haloPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        haloPath.setAttribute('d', d);
        haloPath.setAttribute('class', 'edge-selection-halo');
        g.appendChild(haloPath);

        const visPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        visPath.setAttribute('d', d);
        visPath.setAttribute('class', 'edge-visible-path');
        visPath.setAttribute('stroke', strokeColor);
        visPath.setAttribute('stroke-width', isSelected ? '3.2' : '2.2');
        if (isDashedEdgeStyle(edge.style)) {
          visPath.setAttribute('stroke-dasharray', '7,6');
        }
        if (edge.arrow !== false) {
          const markerId = getArrowMarkerIdForColor(strokeColor);
          visPath.setAttribute('marker-end', `url(#${markerId})`);
        }

        g.appendChild(hitPath);
        g.appendChild(visPath);

        if (isSelected) {
          [
            { endpoint: 'source', point: p1 },
            { endpoint: 'target', point: p2 }
          ].forEach(({ endpoint, point }) => {
            const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            handle.setAttribute('class', 'edge-endpoint-handle');
            handle.setAttribute('cx', point.x);
            handle.setAttribute('cy', point.y);
            handle.setAttribute('r', '8');
            const handleLabel = endpoint === 'source' ? 'ドラッグして線の起点をつなぎ直す' : 'ドラッグして線の終点をつなぎ直す';
            handle.setAttribute('aria-label', handleLabel);
            handle.setAttribute('title', handleLabel);
            handle.addEventListener('pointerdown', event => startReconnectingEdge(edge.id, endpoint, event));
            g.appendChild(handle);
          });
        }

        edgesContainer.appendChild(g);
      }
    }

    function renderNodes() {
      rebuildTagVisibilityCache();
      nodesContainer.innerHTML = '';
      const matchedSet = new Set(state.searchMatches);

      for (const node of state.nodes) {
        if (!isNodeVisibleByTags(node)) continue;
        const el = document.createElement('div');
        el.dataset.nodeId = node.id;

        const isSelected = state.selectedNodeIds.has(node.id) || state.selectedNodeId === node.id;
        const isEditing = state.editingNodeId === node.id;
        const isMatched = matchedSet.has(node.id);
        const isGrouped = !!node.groupId;

        el.className = `diagram-node ${isSelected ? 'selected' : ''} ${isGrouped ? 'grouped' : ''} ${isMatched ? 'search-match' : ''}`;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        el.style.width = `${node.width}px`;
        el.style.height = `${node.height}px`;
        el.style.opacity = String(node.opacity ?? 1);

        if (node.type === 'image') {
          el.classList.add('image-node');
          el.style.backgroundColor = 'transparent';
          if (node.stroke && node.stroke !== 'transparent') {
            el.style.border = `2px solid ${node.stroke}`;
          } else {
            el.style.border = isSelected ? '1px dashed #2563eb' : '2px solid transparent';
          }
          el.style.boxShadow = '0 4px 14px rgba(15, 23, 42, 0.08)';
          el.style.borderRadius = '6px';
          el.style.overflow = 'hidden';

          const img = document.createElement('img');
          img.className = 'node-image';
          img.src = node.src;
          img.alt = node.alt || '画像';
          img.draggable = false;
          el.appendChild(img);
        } else if (node.type === 'diamond') {
          el.style.backgroundColor = 'transparent';
          const svgBg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svgBg.setAttribute('viewBox', '0 0 100 100');
          svgBg.setAttribute('preserveAspectRatio', 'none');
          svgBg.setAttribute('class', 'diamond-bg');
          const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          poly.setAttribute('points', '50,2 98,50 50,98 2,50');
          poly.setAttribute('fill', node.fill === 'transparent' ? 'none' : (node.fill || '#ffffff'));
          poly.setAttribute('stroke', node.stroke === 'transparent' ? 'none' : (node.stroke || '#64748b'));
          poly.setAttribute('stroke-width', '2.5');
          poly.setAttribute('vector-effect', 'non-scaling-stroke');
          svgBg.appendChild(poly);
          el.appendChild(svgBg);
        } else {
          el.style.backgroundColor = node.fill || '#ffffff';
          if (node.stroke && node.stroke !== 'transparent') {
            el.style.border = `2px solid ${node.stroke}`;
          } else {
            el.style.border = isSelected ? '1px dashed #94a3b8' : '2px solid transparent';
          }

          if (node.type === 'roundRect') {
            el.style.borderRadius = '14px';
            el.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.06)';
          } else if (node.type === 'ellipse') {
            el.style.borderRadius = '50%';
            el.style.boxShadow = '0 4px 12px rgba(15, 23, 42, 0.06)';
          } else if (node.type === 'sticky') {
            el.style.borderRadius = '4px 4px 16px 4px';
            el.style.boxShadow = '0 6px 14px rgba(180, 83, 9, 0.12)';
          } else if (node.type === 'text') {
            el.style.borderRadius = '6px';
          } else {
            el.style.borderRadius = '4px';
            el.style.boxShadow = '0 3px 10px rgba(15, 23, 42, 0.05)';
          }
        }

        if (node.type !== 'image') {
          const content = document.createElement('div');
          content.className = 'node-content';
          if (node.type === 'diamond') {
            content.style.padding = '16px 26px';
          }

          if (isEditing) {
            const textarea = document.createElement('textarea');
            textarea.className = 'node-textarea';
            textarea.value = node.text || '';
            textarea.placeholder = 'テキストやURLを入力...';
            if (node.textColor) textarea.style.color = node.textColor;
            textarea.addEventListener('pointerdown', (e) => e.stopPropagation());
            textarea.addEventListener('keydown', (e) => {
              e.stopPropagation();
              if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                finishEditingNode(node.id, textarea.value);
              }
            });
            textarea.addEventListener('blur', () => {
              finishEditingNode(node.id, textarea.value);
            });
            content.appendChild(textarea);
            setTimeout(() => {
              textarea.focus();
              textarea.select();
            }, 10);
          } else {
            const textDiv = document.createElement('div');
            textDiv.className = 'node-text-display';
            const displayText = getTextWithoutUrls(node.text);
            textDiv.textContent = displayText || '';
            if (node.textColor) textDiv.style.color = node.textColor;
            if (displayText) {
              content.appendChild(textDiv);
            }

            const urls = extractSafeUrls(node.text);
            if (urls.length > 0) {
              const linksWrap = document.createElement('div');
              linksWrap.className = 'node-links';
              for (const url of urls) {
                const badge = document.createElement('div');
                badge.className = 'url-badge-item';

                const a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.className = 'url-link';
                a.title = `新しいタブで開く: ${url}`;
                const displayHost = url.replace(/^https?:\/\//, '');
                a.innerHTML = `<svg class="url-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg><span>${escapeHtml(displayHost)}</span>`;
                a.addEventListener('pointerdown', (e) => e.stopPropagation());
                a.addEventListener('click', (e) => e.stopPropagation());

                const dotsBtn = document.createElement('button');
                dotsBtn.className = 'url-dots-btn';
                dotsBtn.title = 'リンクを編集・操作';
                dotsBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;
                dotsBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
                dotsBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  openUrlMenu(e, node.id, url);
                });

                badge.appendChild(a);
                badge.appendChild(dotsBtn);
                linksWrap.appendChild(badge);
              }
              content.appendChild(linksWrap);
            }
          }

          el.appendChild(content);
        }

        ['top', 'right', 'bottom', 'left'].forEach(pos => {
          const anchor = document.createElement('div');
          anchor.className = `anchor-handle anchor-${pos}`;
          anchor.title = 'ドラッグして別の図形に線を繋ぐ';
          anchor.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            startConnecting(node.id, pos, e);
          });
          el.appendChild(anchor);
        });

        const resizer = document.createElement('div');
        resizer.className = 'resize-handle';
        resizer.title = 'ドラッグしてサイズ変更';
        resizer.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          startResizingNode(node.id, e);
        });
        el.appendChild(resizer);

        let lastClickTime = 0;
        let lastClickPos = { x: 0, y: 0 };

        el.addEventListener('pointerdown', (e) => {
          if (state.editingNodeId === node.id) return;
          if (e.target.closest('.url-badge-item, .anchor-handle, .resize-handle, button, a')) return;

          e.stopPropagation();

          if (node.type !== 'image') {
            const now = Date.now();
            const dist = Math.hypot(e.clientX - lastClickPos.x, e.clientY - lastClickPos.y);
            if (now - lastClickTime < 350 && dist < 12) {
              startEditingNode(node.id);
              lastClickTime = 0;
              return;
            }
            lastClickTime = now;
            lastClickPos = { x: e.clientX, y: e.clientY };
          }

          const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
          selectNode(node.id, isMulti);
          startDraggingNode(node.id, e);
        });

        el.addEventListener('dblclick', (e) => {
          if (node.type === 'image') return;
          if (e.target.closest('.url-badge-item, .anchor-handle, .resize-handle, button, a')) return;
          e.stopPropagation();
          startEditingNode(node.id);
        });

        el.addEventListener('contextmenu', (e) => {
          if (e.target.closest('.url-badge-item, .anchor-handle, .resize-handle')) return;
          e.preventDefault();
          e.stopPropagation();
          openNodeContextMenu(e, node.id);
        });

        nodesContainer.appendChild(el);
      }

      const visibleCount = state.nodes.filter(isNodeVisibleByTags).length;
      nodeCountLabel.textContent = visibleCount === state.nodes.length
        ? `${state.nodes.length}要素`
        : `${visibleCount}/${state.nodes.length}要素`;
      renderMinimap();
    }

    function escapeHtml(str) {
      return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[m]));
    }

    function renderAll() {
      applyViewportTransform();
      renderEdges();
      renderNodes();
      updatePropertyBar();
      renderTagFilter();
    }
