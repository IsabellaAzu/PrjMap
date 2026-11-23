    function startDraggingNode(nodeId, e) {
      const node = state.nodes.find(n => n.id === nodeId);
      if (!node) return;

      if (!state.selectedNodeIds.has(nodeId)) {
        state.selectedNodeIds.add(nodeId);
        state.selectedNodeId = nodeId;
      }

      const expandedIds = new Set(state.selectedNodeIds);
      for (const nid of state.selectedNodeIds) {
        const n = state.nodes.find(x => x.id === nid);
        if (n && n.groupId) {
          for (const member of state.nodes) {
            if (member.groupId === n.groupId) {
              expandedIds.add(member.id);
            }
          }
        }
      }
      state.selectedNodeIds = expandedIds;
      state.selectedNodeId = state.selectedNodeIds.values().next().value || null;
      document.querySelectorAll('.diagram-node').forEach(el => {
        if (state.selectedNodeIds.has(el.dataset.nodeId)) {
          el.classList.add('selected');
        } else {
          el.classList.remove('selected');
        }
      });

      const dragNodes = [];
      for (const nid of state.selectedNodeIds) {
        const n = state.nodes.find(x => x.id === nid);
        if (n) {
          dragNodes.push({ id: n.id, origX: n.x, origY: n.y });
        }
      }

      interaction = {
        mode: 'drag-node',
        startX: e.clientX,
        startY: e.clientY,
        dragNodes,
        beforeSnapshot: createSnapshot()
      };
    }

    function startResizingNode(nodeId, e) {
      const node = state.nodes.find(n => n.id === nodeId);
      if (!node) return;
      interaction = {
        mode: 'resize-node',
        startX: e.clientX,
        startY: e.clientY,
        origW: node.width,
        origH: node.height,
        targetNodeId: nodeId,
        beforeSnapshot: createSnapshot()
      };
    }

    function startConnecting(sourceNodeId, sourceAnchor, e) {
      const srcNode = state.nodes.find(n => n.id === sourceNodeId);
      if (!srcNode) return;
      const lastEdgeColor = state.edges.length > 0 ? state.edges[state.edges.length - 1].color : null;
      const previewColor = getRandomEdgeColor(lastEdgeColor);
      interaction = {
        mode: 'connect',
        targetNodeId: sourceNodeId,
        sourceAnchor,
        previewColor
      };
      document.body.classList.add('connecting-mode');
      const p1 = getAnchorPoint(srcNode, sourceAnchor);
      tempEdgePath.setAttribute('stroke', previewColor);
      tempEdgePath.setAttribute('d', `M ${p1.x} ${p1.y} L ${p1.x} ${p1.y}`);
      tempEdgePath.classList.remove('hidden');
    }

    function startReconnectingEdge(edgeId, endpoint, e) {
      const edge = state.edges.find(item => item.id === edgeId);
      if (!edge) return;
      e.preventDefault();
      e.stopPropagation();
      interaction = {
        mode: 'rewire-edge',
        edgeId,
        endpoint,
        beforeSnapshot: createSnapshot()
      };
      document.body.classList.add('rewiring-edge');
    }

    viewportEl.addEventListener('pointerdown', (e) => {
      if (e.target !== viewportEl && e.target !== worldEl && e.target.id !== 'edges-svg') return;

      const worldPos = screenToWorld(e.clientX, e.clientY);
      if (e.shiftKey) {
        interaction = {
          mode: 'marquee',
          startX: e.clientX,
          startY: e.clientY,
          worldStartX: worldPos.x,
          worldStartY: worldPos.y,
          marqueeSelectedIds: new Set()
        };
        selectionMarquee.style.left = `${worldPos.x}px`;
        selectionMarquee.style.top = `${worldPos.y}px`;
        selectionMarquee.style.width = '0px';
        selectionMarquee.style.height = '0px';
        selectionMarquee.classList.remove('hidden');
      } else {
        clearSelection();
        interaction = {
          mode: 'pan',
          startX: e.clientX,
          startY: e.clientY,
          origX: state.viewport.x,
          origY: state.viewport.y
        };
        viewportEl.classList.add('panning');
      }
    });

    viewportEl.addEventListener('dblclick', (e) => {
      if (e.target !== viewportEl && e.target !== worldEl && e.target.id !== 'edges-svg') return;
      const worldPos = screenToWorld(e.clientX, e.clientY);
      addNode('text', worldPos);
    });

    window.addEventListener('pointermove', (e) => {
      if (interaction.mode === 'none') return;

      if (interaction.mode === 'pan') {
        state.viewport.x = interaction.origX + (e.clientX - interaction.startX);
        state.viewport.y = interaction.origY + (e.clientY - interaction.startY);
        applyViewportTransform();
      } else if (interaction.mode === 'drag-node') {
        const dx = (e.clientX - interaction.startX) / state.viewport.zoom;
        const dy = (e.clientY - interaction.startY) / state.viewport.zoom;

        for (const item of interaction.dragNodes) {
          const node = state.nodes.find(n => n.id === item.id);
          if (!node) continue;
          node.x = Math.round(item.origX + dx);
          node.y = Math.round(item.origY + dy);

          const nodeEl = nodesContainer.querySelector(`[data-node-id="${node.id}"]`);
          if (nodeEl) {
            nodeEl.style.left = `${node.x}px`;
            nodeEl.style.top = `${node.y}px`;
          }
        }
        renderEdges();
        renderMinimap();
      } else if (interaction.mode === 'marquee') {
        const curWorld = screenToWorld(e.clientX, e.clientY);
        const x1 = Math.min(interaction.worldStartX, curWorld.x);
        const y1 = Math.min(interaction.worldStartY, curWorld.y);
        const w = Math.abs(curWorld.x - interaction.worldStartX);
        const h = Math.abs(curWorld.y - interaction.worldStartY);

        selectionMarquee.style.left = `${x1}px`;
        selectionMarquee.style.top = `${y1}px`;
        selectionMarquee.style.width = `${w}px`;
        selectionMarquee.style.height = `${h}px`;

        const selectedIds = new Set();
        for (const n of state.nodes) {
          if (x1 < n.x + n.width && x1 + w > n.x && y1 < n.y + n.height && y1 + h > n.y) {
            selectedIds.add(n.id);
            if (n.groupId) {
              state.nodes.filter(x => x.groupId === n.groupId).forEach(x => selectedIds.add(x.id));
            }
          }
        }
        document.querySelectorAll('.diagram-node').forEach(el => {
          if (selectedIds.has(el.dataset.nodeId)) {
            el.classList.add('selected');
          } else {
            el.classList.remove('selected');
          }
        });
        interaction.marqueeSelectedIds = selectedIds;
      } else if (interaction.mode === 'resize-node') {
        const node = state.nodes.find(n => n.id === interaction.targetNodeId);
        if (!node) return;
        const dx = (e.clientX - interaction.startX) / state.viewport.zoom;
        const dy = (e.clientY - interaction.startY) / state.viewport.zoom;
        node.width = Math.max(40, Math.round(interaction.origW + dx));
        node.height = Math.max(30, Math.round(interaction.origH + dy));

        const nodeEl = nodesContainer.querySelector(`[data-node-id="${node.id}"]`);
        if (nodeEl) {
          nodeEl.style.width = `${node.width}px`;
          nodeEl.style.height = `${node.height}px`;
        }
        renderEdges();
        renderMinimap();
      } else if (interaction.mode === 'connect') {
        const srcNode = state.nodes.find(n => n.id === interaction.targetNodeId);
        if (!srcNode) return;
        const p1 = getAnchorPoint(srcNode, interaction.sourceAnchor);
        const p2 = screenToWorld(e.clientX, e.clientY);
        const d = buildEdgePath(p1, interaction.sourceAnchor, p2, 'left', 'avoid', srcNode.id, null);
        tempEdgePath.setAttribute('d', d);
      } else if (interaction.mode === 'rewire-edge') {
        const edge = state.edges.find(item => item.id === interaction.edgeId);
        if (!edge) return;
        const worldPoint = screenToWorld(e.clientX, e.clientY);
        const fixedNodeId = interaction.endpoint === 'source' ? edge.target : edge.source;
        const fixedAnchor = interaction.endpoint === 'source' ? edge.targetAnchor : edge.sourceAnchor;
        const fixedNode = state.nodes.find(node => node.id === fixedNodeId);
        if (!fixedNode) return;
        const fixedPoint = getAnchorPoint(fixedNode, fixedAnchor || (interaction.endpoint === 'source' ? 'left' : 'right'));
        const d = interaction.endpoint === 'source'
          ? `M ${worldPoint.x} ${worldPoint.y} L ${fixedPoint.x} ${fixedPoint.y}`
          : `M ${fixedPoint.x} ${fixedPoint.y} L ${worldPoint.x} ${worldPoint.y}`;
        tempEdgePath.setAttribute('stroke', edge.color || '#64748b');
        tempEdgePath.setAttribute('stroke-dasharray', '5,5');
        tempEdgePath.setAttribute('d', d);
        tempEdgePath.classList.remove('hidden');
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (interaction.mode === 'none') return;

      if (interaction.mode === 'pan') {
        viewportEl.classList.remove('panning');
        persistToLocalStorage();
      } else if (interaction.mode === 'drag-node' || interaction.mode === 'resize-node') {
        if (interaction.beforeSnapshot && interaction.beforeSnapshot !== createSnapshot()) {
          pushHistory(interaction.beforeSnapshot);
        }
        persistToLocalStorage();
      } else if (interaction.mode === 'marquee') {
        selectionMarquee.classList.add('hidden');
        if (interaction.marqueeSelectedIds && interaction.marqueeSelectedIds.size > 0) {
          selectNodes(interaction.marqueeSelectedIds);
        } else {
          clearSelection();
        }
      } else if (interaction.mode === 'connect') {
        document.body.classList.remove('connecting-mode');
        tempEdgePath.classList.add('hidden');

        const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
        const targetNodeEl = elemBelow ? elemBelow.closest('.diagram-node') : null;
        if (targetNodeEl) {
          const targetId = targetNodeEl.dataset.nodeId;
          if (targetId && targetId !== interaction.targetNodeId) {
            pushHistory();
            const targetNode = state.nodes.find(n => n.id === targetId);
            const worldPt = screenToWorld(e.clientX, e.clientY);
            const targetAnchor = findClosestAnchor(targetNode, worldPt.x, worldPt.y);

            state.edges.push({
              id: 'edge_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
              source: interaction.targetNodeId,
              sourceAnchor: interaction.sourceAnchor,
              target: targetId,
              targetAnchor,
              style: 'avoid',
              color: interaction.previewColor || getRandomEdgeColor(),
              arrow: true
            });
            renderEdges();
            persistToLocalStorage();
            showToast('図形同士を線で接続しました');
          }
        }
      } else if (interaction.mode === 'rewire-edge') {
        document.body.classList.remove('rewiring-edge');
        tempEdgePath.classList.add('hidden');
        tempEdgePath.removeAttribute('stroke-dasharray');

        const edge = state.edges.find(item => item.id === interaction.edgeId);
        const worldPoint = screenToWorld(e.clientX, e.clientY);
        const targetNode = state.nodes
          .filter(node => worldPoint.x >= node.x && worldPoint.x <= node.x + node.width &&
            worldPoint.y >= node.y && worldPoint.y <= node.y + node.height)
          .sort((a, b) => {
            const distA = Math.hypot(a.x + a.width / 2 - worldPoint.x, a.y + a.height / 2 - worldPoint.y);
            const distB = Math.hypot(b.x + b.width / 2 - worldPoint.x, b.y + b.height / 2 - worldPoint.y);
            return distA - distB;
          })[0];
        const targetId = targetNode && targetNode.id;
        const oppositeId = edge && (interaction.endpoint === 'source' ? edge.target : edge.source);
        if (edge && targetNode && targetId !== oppositeId) {
          const targetAnchor = findClosestAnchor(targetNode, worldPoint.x, worldPoint.y);
          pushHistory(interaction.beforeSnapshot);
          if (interaction.endpoint === 'source') {
            edge.source = targetId;
            edge.sourceAnchor = targetAnchor;
          } else {
            edge.target = targetId;
            edge.targetAnchor = targetAnchor;
          }
          selectEdge(edge.id);
          persistToLocalStorage();
          showToast('線の接続先を変更しました');
        } else {
          renderEdges();
        }
      }

      interaction = { mode: 'none' };
    });

    viewportEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewportEl.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(2.5, Math.max(0.2, state.viewport.zoom * zoomFactor));

      state.viewport.x = mouseX - (mouseX - state.viewport.x) * (newZoom / state.viewport.zoom);
      state.viewport.y = mouseY - (mouseY - state.viewport.y) * (newZoom / state.viewport.zoom);
      state.viewport.zoom = newZoom;

      applyViewportTransform();
    }, { passive: false });

    function animateViewportTo(targetX, targetY, targetZoom, duration = 420) {
      const startX = state.viewport.x;
      const startY = state.viewport.y;
      const startZoom = state.viewport.zoom;
      const startTime = performance.now();

      function step(now) {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const ease = 1 - Math.pow(1 - t, 3);

        state.viewport.x = startX + (targetX - startX) * ease;
        state.viewport.y = startY + (targetY - startY) * ease;
        state.viewport.zoom = startZoom + (targetZoom - startZoom) * ease;

        applyViewportTransform();
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          persistToLocalStorage();
        }
      }
      requestAnimationFrame(step);
    }

    function focusOnNode(nodeId) {
      const node = state.nodes.find(n => n.id === nodeId);
      if (!node) return;
      const rect = viewportEl.getBoundingClientRect();
      const targetZoom = Math.max(1, Math.min(1.25, state.viewport.zoom));
      const nodeCenterX = node.x + node.width / 2;
      const nodeCenterY = node.y + node.height / 2;

      const targetX = rect.width / 2 - nodeCenterX * targetZoom;
      const targetY = rect.height / 2 - nodeCenterY * targetZoom;

      selectNode(nodeId);
      animateViewportTo(targetX, targetY, targetZoom);
    }

    function fitToScreen() {
      const visibleNodes = state.nodes.filter(isNodeVisibleByTags);
      if (visibleNodes.length === 0) {
        animateViewportTo(100, 100, 1);
        return;
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of visibleNodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
      }
      const padding = 80;
      const contentW = Math.max(200, maxX - minX + padding * 2);
      const contentH = Math.max(200, maxY - minY + padding * 2);

      const rect = viewportEl.getBoundingClientRect();
      const targetZoom = Math.min(1.2, Math.max(0.25, Math.min(rect.width / contentW, rect.height / contentH)));

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const targetX = rect.width / 2 - centerX * targetZoom;
      const targetY = rect.height / 2 - centerY * targetZoom;

      animateViewportTo(targetX, targetY, targetZoom);
    }

    function renderMinimap() {
      const cw = minimapCanvas.width;
      const ch = minimapCanvas.height;
      minimapCtx.clearRect(0, 0, cw, ch);
      const visibleNodes = state.nodes.filter(isNodeVisibleByTags);

      if (visibleNodes.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of visibleNodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
      }

      const vpRect = viewportEl.getBoundingClientRect();
      const vpWorldX = -state.viewport.x / state.viewport.zoom;
      const vpWorldY = -state.viewport.y / state.viewport.zoom;
      const vpWorldW = vpRect.width / state.viewport.zoom;
      const vpWorldH = vpRect.height / state.viewport.zoom;

      minX = Math.min(minX, vpWorldX) - 60;
      minY = Math.min(minY, vpWorldY) - 60;
      maxX = Math.max(maxX, vpWorldX + vpWorldW) + 60;
      maxY = Math.max(maxY, vpWorldY + vpWorldH) + 60;

      const worldW = Math.max(1, maxX - minX);
      const worldH = Math.max(1, maxY - minY);
      const scale = Math.min(cw / worldW, ch / worldH);
      const offsetX = (cw - worldW * scale) / 2;
      const offsetY = (ch - worldH * scale) / 2;

      const nodeMap = new Map(visibleNodes.map(n => [n.id, n]));
      minimapCtx.lineWidth = 1.2;
      for (const e of state.edges) {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) continue;
        minimapCtx.strokeStyle = e.color || '#94a3b8';
        minimapCtx.setLineDash(isDashedEdgeStyle(e.style) ? [3, 3] : []);
        minimapCtx.beginPath();
        minimapCtx.moveTo((s.x + s.width / 2 - minX) * scale + offsetX, (s.y + s.height / 2 - minY) * scale + offsetY);
        minimapCtx.lineTo((t.x + t.width / 2 - minX) * scale + offsetX, (t.y + t.height / 2 - minY) * scale + offsetY);
        minimapCtx.stroke();
      }
      minimapCtx.setLineDash([]);

      for (const n of state.nodes) {
        const nx = (n.x - minX) * scale + offsetX;
        const ny = (n.y - minY) * scale + offsetY;
        const nw = Math.max(4, n.width * scale);
        const nh = Math.max(3, n.height * scale);

        minimapCtx.fillStyle = n.id === state.selectedNodeId ? '#2563eb' : (n.fill && n.fill !== 'transparent' ? n.fill : '#e2e8f0');
        minimapCtx.strokeStyle = n.id === state.selectedNodeId ? '#1d4ed8' : '#64748b';
        minimapCtx.lineWidth = 1;
        minimapCtx.globalAlpha = n.opacity ?? 1;
        minimapCtx.fillRect(nx, ny, nw, nh);
        minimapCtx.strokeRect(nx, ny, nw, nh);
        minimapCtx.globalAlpha = 1;
      }

      const vx = (vpWorldX - minX) * scale + offsetX;
      const vy = (vpWorldY - minY) * scale + offsetY;
      const vw = vpWorldW * scale;
      const vh = vpWorldH * scale;
      minimapCtx.strokeStyle = '#2563eb';
      minimapCtx.fillStyle = 'rgba(37, 99, 235, 0.08)';
      minimapCtx.lineWidth = 1.5;
      minimapCtx.fillRect(vx, vy, vw, vh);
      minimapCtx.strokeRect(vx, vy, vw, vh);

      minimapCanvas._mapTransform = { minX, minY, scale, offsetX, offsetY };
    }

    minimapCanvas.addEventListener('pointerdown', (e) => {
      const t = minimapCanvas._mapTransform;
      if (!t) return;
      const rect = minimapCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const targetWorldX = (clickX - t.offsetX) / t.scale + t.minX;
      const targetWorldY = (clickY - t.offsetY) / t.scale + t.minY;

      const vpRect = viewportEl.getBoundingClientRect();
      const newVpX = vpRect.width / 2 - targetWorldX * state.viewport.zoom;
      const newVpY = vpRect.height / 2 - targetWorldY * state.viewport.zoom;
      animateViewportTo(newVpX, newVpY, state.viewport.zoom, 250);
    });
