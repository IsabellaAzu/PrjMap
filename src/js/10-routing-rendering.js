    // URL抽出＆サニタイズ
    function extractSafeUrls(text) {
      if (!text) return [];
      const regex = /https?:\/\/[^\s<>"'()]+/gi;
      const matches = text.match(regex) || [];
      const validUrls = [];
      for (const rawUrl of matches) {
        try {
          const parsed = new URL(rawUrl);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            validUrls.push(parsed.href);
          }
        } catch (_) { }
      }
      return [...new Set(validUrls)];
    }

    // 表示用テキストの取得（URLを除去して重複表示を防止）
    function getTextWithoutUrls(text) {
      if (!text) return '';
      let cleaned = text.replace(/https?:\/\/[^\s<>"'()]+/gi, '').trim();
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
      return cleaned;
    }

    function applyViewportTransform() {
      const { x, y, zoom } = state.viewport;
      worldEl.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
      const gridSize = 24 * zoom;
      viewportEl.style.backgroundSize = `${gridSize}px ${gridSize}px`;
      viewportEl.style.backgroundPosition = `${x}px ${y}px`;
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
      renderMinimap();
    }

    function screenToWorld(clientX, clientY) {
      const rect = viewportEl.getBoundingClientRect();
      return {
        x: (clientX - rect.left - state.viewport.x) / state.viewport.zoom,
        y: (clientY - rect.top - state.viewport.y) / state.viewport.zoom
      };
    }

    function getAnchorPoint(node, anchor = 'right') {
      switch (anchor) {
        case 'top': return { x: node.x + node.width / 2, y: node.y };
        case 'bottom': return { x: node.x + node.width / 2, y: node.y + node.height };
        case 'left': return { x: node.x, y: node.y + node.height / 2 };
        case 'right':
        default: return { x: node.x + node.width, y: node.y + node.height / 2 };
      }
    }

    function getEdgeAnchorPoint(node, edge, endpoint) {
      const anchorKey = `${endpoint}Anchor`;
      const anchor = edge[anchorKey] || (endpoint === 'source' ? 'right' : 'left');
      const base = getAnchorPoint(node, anchor);
      const relatedEdges = state.edges
        .filter(candidate =>
          (candidate.source === node.id && (candidate.sourceAnchor || 'right') === anchor) ||
          (candidate.target === node.id && (candidate.targetAnchor || 'left') === anchor))
        .sort((a, b) => {
          const peerA = state.nodes.find(item => item.id === (a.source === node.id ? a.target : a.source));
          const peerB = state.nodes.find(item => item.id === (b.source === node.id ? b.target : b.source));
          const horizontalSide = anchor === 'top' || anchor === 'bottom';
          const coordinateA = peerA ? (horizontalSide ? peerA.x + peerA.width / 2 : peerA.y + peerA.height / 2) : 0;
          const coordinateB = peerB ? (horizontalSide ? peerB.x + peerB.width / 2 : peerB.y + peerB.height / 2) : 0;
          return coordinateA - coordinateB || String(a.id).localeCompare(String(b.id));
        });
      if (relatedEdges.length < 2) return base;

      const index = relatedEdges.findIndex(candidate => candidate.id === edge.id);
      const horizontalSide = anchor === 'top' || anchor === 'bottom';
      const available = (horizontalSide ? node.width : node.height) - 16;
      const spacing = Math.max(2, Math.min(8, available / (relatedEdges.length - 1)));
      const offset = (index - (relatedEdges.length - 1) / 2) * spacing;
      if (horizontalSide) base.x += offset;
      else base.y += offset;
      const centerX = node.x + node.width / 2;
      const centerY = node.y + node.height / 2;
      if (node.type === 'ellipse') {
        const rx = Math.max(1, node.width / 2);
        const ry = Math.max(1, node.height / 2);
        if (horizontalSide) {
          const dx = Math.max(-rx * 0.98, Math.min(rx * 0.98, base.x - centerX));
          const yOffset = ry * Math.sqrt(Math.max(0, 1 - (dx * dx) / (rx * rx)));
          base.y = centerY + (anchor === 'top' ? -yOffset : yOffset);
        } else {
          const dy = Math.max(-ry * 0.98, Math.min(ry * 0.98, base.y - centerY));
          const xOffset = rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)));
          base.x = centerX + (anchor === 'left' ? -xOffset : xOffset);
        }
      } else if (node.type === 'diamond') {
        const rx = Math.max(1, node.width / 2);
        const ry = Math.max(1, node.height / 2);
        if (horizontalSide) {
          const dx = Math.max(-rx * 0.98, Math.min(rx * 0.98, base.x - centerX));
          const yOffset = ry * (1 - Math.abs(dx) / rx);
          base.y = centerY + (anchor === 'top' ? -yOffset : yOffset);
        } else {
          const dy = Math.max(-ry * 0.98, Math.min(ry * 0.98, base.y - centerY));
          const xOffset = rx * (1 - Math.abs(dy) / ry);
          base.x = centerX + (anchor === 'left' ? -xOffset : xOffset);
        }
      }
      return base;
    }

    function buildFanOutEdgePath(p1, anchor, p2, edge) {
      if (getBaseEdgeStyle(edge.style || 'avoid') === 'straight') return null;
      if (anchor !== 'top' && anchor !== 'bottom' && anchor !== 'left' && anchor !== 'right') return null;
      const sameSideEdges = state.edges
        .filter(candidate => candidate.source === edge.source &&
          (candidate.sourceAnchor || 'right') === (edge.sourceAnchor || 'right'))
        .sort((a, b) => {
          const targetA = state.nodes.find(node => node.id === a.target);
          const targetB = state.nodes.find(node => node.id === b.target);
          const horizontalSide = anchor === 'top' || anchor === 'bottom';
          const positionA = targetA ? (horizontalSide ? targetA.x + targetA.width / 2 : targetA.y + targetA.height / 2) : 0;
          const positionB = targetB ? (horizontalSide ? targetB.x + targetB.width / 2 : targetB.y + targetB.height / 2) : 0;
          return positionA - positionB || String(a.id).localeCompare(String(b.id));
        });
      if (sameSideEdges.length < 2) return null;

      const rank = sameSideEdges.findIndex(candidate => candidate.id === edge.id);
      const verticalSide = anchor === 'top' || anchor === 'bottom';
      const direction = anchor === 'bottom' || anchor === 'right' ? 1 : -1;
      const span = verticalSide ? Math.abs(p2.y - p1.y) : Math.abs(p2.x - p1.x);
      if (span < 72) return null;
      const spacing = Math.min(44, (span - 48) / (sameSideEdges.length - 1));
      const laneOffset = Math.min(span - 24, 24 + rank * spacing);
      const lane = verticalSide
        ? { x: null, y: p1.y + direction * laneOffset }
        : { x: p1.x + direction * laneOffset, y: null };
      const points = verticalSide
        ? [p1, { x: p1.x, y: lane.y }, { x: p2.x, y: lane.y }, p2]
        : [p1, { x: lane.x, y: p1.y }, { x: lane.x, y: p2.y }, p2];

      const sourceId = edge.source;
      const targetId = edge.target;
      for (let index = 1; index < points.length; index++) {
        const start = points[index - 1];
        const end = points[index];
        const horizontal = Math.abs(start.y - end.y) < 0.01;
        const blocked = state.nodes.some(node => {
          if (node.id === sourceId || node.id === targetId) return false;
          if (horizontal) {
            return start.y > node.y - 8 && start.y < node.y + node.height + 8 &&
              Math.max(start.x, end.x) > node.x - 8 && Math.min(start.x, end.x) < node.x + node.width + 8;
          }
          return start.x > node.x - 8 && start.x < node.x + node.width + 8 &&
            Math.max(start.y, end.y) > node.y - 8 && Math.min(start.y, end.y) < node.y + node.height + 8;
        });
        if (blocked) return null;
      }

      return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    }

    function buildBalancedEdgePath(p1, sourceAnchor, targetAnchor, p2, edge, usedSegments, usedTurns) {
      if (getBaseEdgeStyle(edge.style || 'avoid') === 'straight') return null;
      const sourceVertical = sourceAnchor === 'top' || sourceAnchor === 'bottom';
      const targetVertical = targetAnchor === 'top' || targetAnchor === 'bottom';
      const sourceDirection = sourceAnchor === 'bottom' || sourceAnchor === 'right' ? 1 : -1;
      const targetDirection = targetAnchor === 'bottom' || targetAnchor === 'right' ? 1 : -1;
      const axisDelta = sourceVertical ? p2.y - p1.y : p2.x - p1.x;
      const span = Math.abs(axisDelta);
      const alignedPorts = sourceVertical ? Math.abs(p1.x - p2.x) <= 12 : Math.abs(p1.y - p2.y) <= 12;
      if (sourceVertical === targetVertical && sourceDirection !== targetDirection &&
        axisDelta * sourceDirection > 0 && alignedPorts) {
        const coordinate = sourceVertical ? (p1.x + p2.x) / 2 : (p1.y + p2.y) / 2;
        const points = sourceVertical
          ? [{ x: coordinate, y: p1.y }, { x: coordinate, y: p2.y }]
          : [{ x: p1.x, y: coordinate }, { x: p2.x, y: coordinate }];
        const blockedByNode = state.nodes.some(node => {
          if (node.id === edge.source || node.id === edge.target) return false;
          if (sourceVertical) return coordinate > node.x - 8 && coordinate < node.x + node.width + 8 &&
            Math.max(p1.y, p2.y) > node.y - 8 && Math.min(p1.y, p2.y) < node.y + node.height + 8;
          return coordinate > node.y - 8 && coordinate < node.y + node.height + 8 &&
            Math.max(p1.x, p2.x) > node.x - 8 && Math.min(p1.x, p2.x) < node.x + node.width + 8;
        });
        const overlapsLine = usedSegments.some(segment => {
          if (sourceVertical && !segment.horizontal) {
            const overlap = Math.min(Math.max(p1.y, p2.y), Math.max(segment.y1, segment.y2)) -
              Math.max(Math.min(p1.y, p2.y), Math.min(segment.y1, segment.y2));
            return overlap > 4 && Math.abs(coordinate - segment.x) < 24;
          }
          if (!sourceVertical && segment.horizontal) {
            const overlap = Math.min(Math.max(p1.x, p2.x), Math.max(segment.x1, segment.x2)) -
              Math.max(Math.min(p1.x, p2.x), Math.min(segment.x1, segment.x2));
            return overlap > 4 && Math.abs(coordinate - segment.y) < 24;
          }
          if (sourceVertical && segment.horizontal) {
            return coordinate > Math.min(segment.x1, segment.x2) && coordinate < Math.max(segment.x1, segment.x2) &&
              segment.y > Math.min(p1.y, p2.y) && segment.y < Math.max(p1.y, p2.y);
          }
          if (!sourceVertical && !segment.horizontal) {
            return segment.x > Math.min(p1.x, p2.x) && segment.x < Math.max(p1.x, p2.x) &&
              coordinate > Math.min(segment.y1, segment.y2) && coordinate < Math.max(segment.y1, segment.y2);
          }
          return false;
        });
        if (!blockedByNode && !overlapsLine) {
          return {
            d: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
            points
          };
        }
      }
      const facing = sourceVertical === targetVertical && sourceDirection !== targetDirection && axisDelta * sourceDirection > 0;
      const maxOffset = Math.min(320, Math.max(64, span + (facing ? 0 : 120)) - 24);
      const candidates = [];
      for (let offset = 24; offset <= maxOffset; offset += 8) candidates.push(offset);
      if (candidates.length === 0) return null;

      let bestPoints = null;
      let bestScore = Infinity;
      for (const offset of candidates) {
        let points;
        if (sourceVertical && targetVertical) {
          const y = p1.y + sourceDirection * offset;
          points = [p1, { x: p1.x, y }, { x: p2.x, y }, p2];
        } else if (!sourceVertical && !targetVertical) {
          const x = p1.x + sourceDirection * offset;
          points = [p1, { x, y: p1.y }, { x, y: p2.y }, p2];
        } else if (sourceVertical) {
          const y = p1.y + sourceDirection * offset;
          const targetStubX = p2.x + targetDirection * 24;
          points = [p1, { x: p1.x, y }, { x: targetStubX, y }, { x: targetStubX, y: p2.y }, p2];
        } else {
          const x = p1.x + sourceDirection * offset;
          const targetStubY = p2.y + targetDirection * 24;
          points = [p1, { x, y: p1.y }, { x, y: targetStubY }, { x: p2.x, y: targetStubY }, p2];
        }

        let score = Math.abs(offset - Math.max(24, Math.min(maxOffset, span / 2))) * 0.04;
        for (let index = 1; index < points.length; index++) {
          const a = points[index - 1];
          const b = points[index];
          const horizontal = Math.abs(a.y - b.y) < 0.01;
          const endpointStub = index === 1 || index === points.length - 1;
          const nodeBlocked = state.nodes.some(node => {
            if ((node.id === edge.source && index === 1) ||
              (node.id === edge.target && index === points.length - 1)) return false;
            if (horizontal) return a.y > node.y - 8 && a.y < node.y + node.height + 8 &&
              Math.max(a.x, b.x) > node.x - 8 && Math.min(a.x, b.x) < node.x + node.width + 8;
            return a.x > node.x - 8 && a.x < node.x + node.width + 8 &&
              Math.max(a.y, b.y) > node.y - 8 && Math.min(a.y, b.y) < node.y + node.height + 8;
          });
          if (nodeBlocked) score += 1000000;

          if (!endpointStub) {
            for (const segment of usedSegments) {
              if (horizontal && segment.horizontal) {
                const overlap = Math.min(Math.max(a.x, b.x), Math.max(segment.x1, segment.x2)) -
                  Math.max(Math.min(a.x, b.x), Math.min(segment.x1, segment.x2));
                const gap = Math.abs(a.y - segment.y);
                if (overlap > 4 && gap < 24) score += 10000000 + (24 - gap) * 1000 + overlap * 10;
              } else if (!horizontal && !segment.horizontal) {
                const overlap = Math.min(Math.max(a.y, b.y), Math.max(segment.y1, segment.y2)) -
                  Math.max(Math.min(a.y, b.y), Math.min(segment.y1, segment.y2));
                const gap = Math.abs(a.x - segment.x);
                if (overlap > 4 && gap < 24) score += 10000000 + (24 - gap) * 1000 + overlap * 10;
              } else if (horizontal && !segment.horizontal) {
                const crosses = segment.x > Math.min(a.x, b.x) && segment.x < Math.max(a.x, b.x) &&
                  a.y > Math.min(segment.y1, segment.y2) && a.y < Math.max(segment.y1, segment.y2);
                if (crosses) score += 100000;
              } else if (!horizontal && segment.horizontal) {
                const crosses = segment.y > Math.min(a.y, b.y) && segment.y < Math.max(a.y, b.y) &&
                  a.x > Math.min(segment.x1, segment.x2) && a.x < Math.max(segment.x1, segment.x2);
                if (crosses) score += 100000;
              }
            }
          }
        }

        for (let index = 1; index < points.length - 1; index++) {
          const previous = points[index - 1];
          const current = points[index];
          const next = points[index + 1];
          const incomingHorizontal = Math.abs(previous.y - current.y) < 0.01;
          const outgoingHorizontal = Math.abs(current.y - next.y) < 0.01;
          if (incomingHorizontal !== outgoingHorizontal && usedTurns.some(turn =>
            Math.abs(turn.x - current.x) < 24 && Math.abs(turn.y - current.y) < 24)) {
            score += 2000000;
          }
        }

        const length = points.reduce((sum, point, index) => index === 0 ? 0 :
          sum + Math.abs(point.x - points[index - 1].x) + Math.abs(point.y - points[index - 1].y), 0);
        const horizontalLength = points.reduce((sum, point, index) => index === 0 ? 0 :
          sum + (Math.abs(point.y - points[index - 1].y) < 0.01 ? Math.abs(point.x - points[index - 1].x) : 0), 0);
        score += length * 0.02 - horizontalLength * 0.002;
        if (score < bestScore) {
          bestScore = score;
          bestPoints = points;
        }
      }

      if (!bestPoints || bestScore >= 1000000) return null;
      return {
        d: bestPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
        points: bestPoints
      };
    }

    function buildNonOverlappingEdgePath(p1, anchor, targetAnchor, p2, edge, usedSegments) {
      if (getBaseEdgeStyle(edge.style || 'avoid') === 'straight') return null;
      const verticalSide = anchor === 'top' || anchor === 'bottom';
      if (!verticalSide && anchor !== 'left' && anchor !== 'right') return null;
      const direction = anchor === 'bottom' || anchor === 'right' ? 1 : -1;
      const axisDelta = verticalSide ? p2.y - p1.y : p2.x - p1.x;
      const span = Math.abs(axisDelta);

      const anchorKey = edge.sourceAnchor || 'right';
      const siblings = state.edges.filter(item => item.source === edge.source && (item.sourceAnchor || 'right') === anchorKey)
        .sort((a, b) => {
          const aNode = state.nodes.find(node => node.id === a.target);
          const bNode = state.nodes.find(node => node.id === b.target);
          const aPos = aNode ? (verticalSide ? aNode.x + aNode.width / 2 : aNode.y + aNode.height / 2) : 0;
          const bPos = bNode ? (verticalSide ? bNode.x + bNode.width / 2 : bNode.y + bNode.height / 2) : 0;
          return aPos - bPos || String(a.id).localeCompare(String(b.id));
        });
      const rank = Math.max(0, siblings.findIndex(item => item.id === edge.id));
      const sameFacingGap = axisDelta * direction >= 0;
      const laneLimit = sameFacingGap ? Math.max(24, span - 24) : 240;
      const maxOffset = Math.max(24, Math.min(240, laneLimit));
      const idealOffset = Math.min(maxOffset, 24 + rank * Math.min(12, Math.max(4, (maxOffset - 24) / Math.max(1, siblings.length - 1))));
      const candidates = [];
      for (let offset = 24; offset <= maxOffset; offset += 4) candidates.push(offset);
      const middleOffset = sameFacingGap ? span / 2 : 40;
      let bestRoute = null;
      let bestScore = Infinity;

      for (const offset of candidates) {
        const lane = verticalSide
          ? { x: null, y: p1.y + direction * offset }
          : { x: p1.x + direction * offset, y: null };
        const points = verticalSide
          ? [p1, { x: p1.x, y: lane.y }, { x: p2.x, y: lane.y }, p2]
          : [p1, { x: lane.x, y: p1.y }, { x: lane.x, y: p2.y }, p2];
        let score = Math.abs(offset - idealOffset) * 0.08 + Math.abs(offset - middleOffset) * 0.015;
        let blocked = false;

        for (let index = 1; index < points.length; index++) {
          const start = points[index - 1];
          const end = points[index];
          const horizontal = Math.abs(start.y - end.y) < 0.01;
          if (state.nodes.some(node => {
            if ((node.id === edge.source && index === 1) ||
              (node.id === edge.target && index === points.length - 1)) return false;
            if (horizontal) return start.y > node.y - 8 && start.y < node.y + node.height + 8 &&
              Math.max(start.x, end.x) > node.x - 8 && Math.min(start.x, end.x) < node.x + node.width + 8;
            return start.x > node.x - 8 && start.x < node.x + node.width + 8 &&
              Math.max(start.y, end.y) > node.y - 8 && Math.min(start.y, end.y) < node.y + node.height + 8;
          })) {
            score += 100000;
          }

          if (index === 2) {
            for (const segment of usedSegments) {
              if (horizontal && segment.horizontal) {
                const overlap = Math.min(Math.max(start.x, end.x), Math.max(segment.x1, segment.x2)) -
                  Math.max(Math.min(start.x, end.x), Math.min(segment.x1, segment.x2));
                const gap = Math.abs(start.y - segment.y);
                if (overlap > 8) score += gap < 20 ? 10000000 + (20 - gap) * 1000 + overlap * 10 : 0;
              } else if (!horizontal && !segment.horizontal) {
                const overlap = Math.min(Math.max(start.y, end.y), Math.max(segment.y1, segment.y2)) -
                  Math.max(Math.min(start.y, end.y), Math.min(segment.y1, segment.y2));
                const gap = Math.abs(start.x - segment.x);
                if (overlap > 8) score += gap < 20 ? 10000000 + (20 - gap) * 1000 + overlap * 10 : 0;
              }
            }
          }
        }

        const routeLength = points.reduce((total, point, index) => index === 0 ? 0 :
          total + Math.abs(point.x - points[index - 1].x) + Math.abs(point.y - points[index - 1].y), 0);
        const horizontalLength = points.reduce((total, point, index) => index === 0 ? 0 :
          total + (Math.abs(point.y - points[index - 1].y) < 0.01 ? Math.abs(point.x - points[index - 1].x) : 0), 0);
        score += routeLength * 0.02 - horizontalLength * 0.002;

        if (score < bestScore) {
          bestScore = score;
          bestRoute = points;
        }
      }

      if (!bestRoute || bestScore >= 1000000) return null;
      return {
        d: bestRoute.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
        points: bestRoute
      };
    }

    // Use a single straight segment when the connection faces along its axis
    // and that segment has clear space. This runs before any lane or grid search.
    function buildDirectEdgePath(p1, sourceAnchor, p2, targetAnchor, edge, usedSegments) {
      const horizontal = Math.abs(p1.y - p2.y) < 0.01;
      const vertical = Math.abs(p1.x - p2.x) < 0.01;
      if (!horizontal && !vertical) return null;
      const sourceFacesAlong = horizontal
        ? (sourceAnchor === 'right' && p2.x > p1.x || sourceAnchor === 'left' && p2.x < p1.x)
        : (sourceAnchor === 'bottom' && p2.y > p1.y || sourceAnchor === 'top' && p2.y < p1.y);
      const targetFacesAlong = horizontal
        ? (targetAnchor === 'left' && p1.x < p2.x || targetAnchor === 'right' && p1.x > p2.x)
        : (targetAnchor === 'top' && p1.y < p2.y || targetAnchor === 'bottom' && p1.y > p2.y);
      if (!sourceFacesAlong || !targetFacesAlong) return null;
      const blocked = state.nodes.some(node => {
        if (node.id === edge.source || node.id === edge.target) return false;
        return horizontal
          ? p1.y > node.y - 8 && p1.y < node.y + node.height + 8 &&
            Math.max(p1.x, p2.x) > node.x - 8 && Math.min(p1.x, p2.x) < node.x + node.width + 8
          : p1.x > node.x - 8 && p1.x < node.x + node.width + 8 &&
            Math.max(p1.y, p2.y) > node.y - 8 && Math.min(p1.y, p2.y) < node.y + node.height + 8;
      });
      if (blocked) return null;
      const occupied = usedSegments.some(segment => {
        if (horizontal !== segment.horizontal) return false;
        const overlap = horizontal
          ? Math.min(Math.max(p1.x, p2.x), Math.max(segment.x1, segment.x2)) - Math.max(Math.min(p1.x, p2.x), Math.min(segment.x1, segment.x2))
          : Math.min(Math.max(p1.y, p2.y), Math.max(segment.y1, segment.y2)) - Math.max(Math.min(p1.y, p2.y), Math.min(segment.y1, segment.y2));
        const gap = horizontal ? Math.abs(p1.y - segment.y) : Math.abs(p1.x - segment.x);
        return overlap > 8 && gap < 20;
      });
      if (occupied) return null;
      return { d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, points: [p1, p2] };
    }

    function buildOrthogonalEdgePath(p1, sourceAnchor, p2, targetAnchor, edge, usedSegments, usedTurns) {
      const stub = 20;
      const direction = anchor => anchor === 'right' || anchor === 'bottom' ? 1 : -1;
      const sourceVertical = sourceAnchor === 'top' || sourceAnchor === 'bottom';
      const targetVertical = targetAnchor === 'top' || targetAnchor === 'bottom';
      const sourceStub = sourceVertical
        ? { x: p1.x, y: p1.y + direction(sourceAnchor) * stub }
        : { x: p1.x + direction(sourceAnchor) * stub, y: p1.y };
      const targetStub = targetVertical
        ? { x: p2.x, y: p2.y + direction(targetAnchor) * stub }
        : { x: p2.x + direction(targetAnchor) * stub, y: p2.y };

      const xs = new Set([sourceStub.x, targetStub.x]);
      const ys = new Set([sourceStub.y, targetStub.y]);
      const addNear = (set, value) => {
        for (const delta of [-48, -32, -16, 16, 32, 48]) set.add(Math.round(value + delta));
      };
      addNear(xs, sourceStub.x); addNear(xs, targetStub.x);
      addNear(ys, sourceStub.y); addNear(ys, targetStub.y);
      for (const node of state.nodes) {
        if (node.id === edge.source || node.id === edge.target) continue;
        for (const x of [node.x - 16, node.x + node.width + 16]) xs.add(x);
        for (const y of [node.y - 16, node.y + node.height + 16]) ys.add(y);
      }
      for (const segment of usedSegments) {
        if (segment.horizontal) addNear(ys, segment.y);
        else addNear(xs, segment.x);
      }

      const simplify = points => {
        const result = [];
        for (const point of points) {
          const previous = result[result.length - 1];
          if (previous && Math.abs(previous.x - point.x) < 0.01 && Math.abs(previous.y - point.y) < 0.01) continue;
          while (result.length >= 2) {
            const a = result[result.length - 2];
            const b = result[result.length - 1];
            if ((Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - point.x) < 0.01) ||
                (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - point.y) < 0.01)) result.pop();
            else break;
          }
          result.push(point);
        }
        return result;
      };
      const segmentBlocked = (a, b, index, count) => {
        const horizontal = Math.abs(a.y - b.y) < 0.01;
        return state.nodes.some(node => {
          if ((index === 0 && node.id === edge.source) || (index === count - 1 && node.id === edge.target)) return false;
          return horizontal
            ? a.y > node.y - 8 && a.y < node.y + node.height + 8 && Math.max(a.x, b.x) > node.x - 8 && Math.min(a.x, b.x) < node.x + node.width + 8
            : a.x > node.x - 8 && a.x < node.x + node.width + 8 && Math.max(a.y, b.y) > node.y - 8 && Math.min(a.y, b.y) < node.y + node.height + 8;
        });
      };
      const overlapsUsed = (a, b) => {
        const horizontal = Math.abs(a.y - b.y) < 0.01;
        for (const segment of usedSegments) {
          if (horizontal === segment.horizontal) {
            const overlap = horizontal
              ? Math.min(Math.max(a.x, b.x), Math.max(segment.x1, segment.x2)) - Math.max(Math.min(a.x, b.x), Math.min(segment.x1, segment.x2))
              : Math.min(Math.max(a.y, b.y), Math.max(segment.y1, segment.y2)) - Math.max(Math.min(a.y, b.y), Math.min(segment.y1, segment.y2));
            if (overlap > 6 && (horizontal ? Math.abs(a.y - segment.y) : Math.abs(a.x - segment.x)) < 16) return true;
          } else {
            const crossing = horizontal
              ? segment.x > Math.min(a.x, b.x) && segment.x < Math.max(a.x, b.x) && a.y > Math.min(segment.y1, segment.y2) && a.y < Math.max(segment.y1, segment.y2)
              : segment.y > Math.min(a.y, b.y) && segment.y < Math.max(a.y, b.y) && a.x > Math.min(segment.x1, segment.x2) && a.x < Math.max(segment.x1, segment.x2);
            if (crossing) return true;
          }
        }
        return false;
      };

      let best = null;
      let bestCost = Infinity;
      const xValues = [...xs];
      const yValues = [...ys];
      for (const x of xValues) for (const y of yValues) {
        const points = simplify([p1, sourceStub, { x, y: sourceStub.y }, { x, y }, { x: targetStub.x, y }, targetStub, p2]);
        if (points.length < 2) continue;
        let blocked = false;
        let cost = 0;
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1], b = points[i];
          if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) { blocked = true; break; }
          if (segmentBlocked(a, b, i - 1, points.length - 1) || overlapsUsed(a, b)) { blocked = true; break; }
          cost += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        }
        if (blocked) continue;
        const bends = Math.max(0, points.length - 2);
        cost += bends * 42;
        for (let i = 1; i < points.length - 1; i++) {
          // Keep bends on separate lanes: sharing either coordinate makes
          // different routes appear to turn together even when the other axis differs.
          if (usedTurns.some(turn => Math.abs(turn.x - points[i].x) < 16 || Math.abs(turn.y - points[i].y) < 16)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        if (cost < bestCost) { bestCost = cost; best = points; }
      }
      if (!best) return null;
      return { points: best, d: best.map((point, i) => `${i ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ') };
    }

    function findClosestAnchor(targetNode, worldX, worldY) {
      const anchors = ['top', 'right', 'bottom', 'left'];
      let bestAnchor = 'left';
      let minDist = Infinity;
      for (const a of anchors) {
        const pt = getAnchorPoint(targetNode, a);
        const dist = Math.hypot(pt.x - worldX, pt.y - worldY);
        if (dist < minDist) {
          minDist = dist;
          bestAnchor = a;
        }
      }
      return bestAnchor;
    }

    // ===== A* グリッド経路探索（障害物・枠を自動迂回する直交ルーティング） =====
    function getAnchorDirection(anchor) {
      switch (anchor) {
        case 'top': return { dx: 0, dy: -1 };
        case 'bottom': return { dx: 0, dy: 1 };
        case 'left': return { dx: -1, dy: 0 };
        case 'right':
        default: return { dx: 1, dy: 0 };
      }
    }

    function computeSegmentObstacleOverlap(x1, y1, x2, y2, obstacles) {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      const isHoriz = Math.abs(y1 - y2) < 0.01;
      let overlap = 0;

      for (let i = 0; i < obstacles.length; i++) {
        const ob = obstacles[i];
        if (isHoriz) {
          if (y1 > ob.top && y1 < ob.bottom && maxX > ob.left && minX < ob.right) {
            const ox1 = Math.max(minX, ob.left);
            const ox2 = Math.min(maxX, ob.right);
            if (ox2 > ox1) overlap += (ox2 - ox1);
          }
        } else {
          if (x1 > ob.left && x1 < ob.right && maxY > ob.top && minY < ob.bottom) {
            const oy1 = Math.max(minY, ob.top);
            const oy2 = Math.min(maxY, ob.bottom);
            if (oy2 > oy1) overlap += (oy2 - oy1);
          }
        }
      }
      return overlap;
    }

    function simplifyOrthogonalPoints(pts) {
      if (pts.length <= 2) return pts;
      // 連続重複点の除去
      const dedup = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const prev = dedup[dedup.length - 1];
        if (Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y) > 0.5) {
          dedup.push(pts[i]);
        }
      }
      if (dedup.length <= 2) return dedup;

      // 同一直線上の不要な中間点を統合
      const result = [dedup[0]];
      for (let i = 1; i < dedup.length - 1; i++) {
        const a = result[result.length - 1];
        const b = dedup[i];
        const c = dedup[i + 1];
        const sameX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;
        const sameY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;
        if (!sameX && !sameY) {
          result.push(b);
        }
      }
      result.push(dedup[dedup.length - 1]);
      return result;
    }

    // なめらか曲線のカギ線（直線区間を最小限にしたS字/U字ベジェカギ線）生成
    // - 折れ線の各区間（始点→最初の角→中間角→最後の角→終点）をできる限り連続した3次ベジェ曲線（C）で繋ぐ
    // - 直線（L）は矢印が潰れないための終点直前ごくわずか（12px程度）だけにとどめ、全体を柔らかな曲線カギ線にする
    function buildRoundedKeyPath(points, cornerRadius = 32) {
      if (!points || points.length === 0) return '';
      if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
      if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
      }

      const pStart = points[0];
      const pEnd = points[points.length - 1];
      const filtered = [pStart];
      for (let i = 1; i < points.length - 1; i++) {
        const pt = points[i];
        const prev = filtered[filtered.length - 1];
        if (Math.hypot(pt.x - prev.x, pt.y - prev.y) >= 18 && Math.hypot(pt.x - pEnd.x, pt.y - pEnd.y) >= 18) {
          filtered.push(pt);
        }
      }
      filtered.push(pEnd);

      const simplified = simplifyOrthogonalPoints(filtered);
      if (simplified.length <= 2) {
        return `M ${simplified[0].x} ${simplified[0].y} L ${simplified[1].x} ${simplified[1].y}`;
      }

      const nPts = simplified.length;
      const last = simplified[nPts - 1];
      const beforeLast = simplified[nPts - 2];
      const endSegLen = Math.hypot(last.x - beforeLast.x, last.y - beforeLast.y);

      // 矢印の形・向きがつぶれないよう、終点手前だけごく短いアプローチ直線（最大12px）を確保
      const approachLen = Math.min(12, endSegLen * 0.25);
      const uxEnd = endSegLen > 0.001 ? (last.x - beforeLast.x) / endSegLen : 0;
      const uyEnd = endSegLen > 0.001 ? (last.y - beforeLast.y) / endSegLen : 1;
      const approachPt = {
        x: last.x - uxEnd * approachLen,
        y: last.y - uyEnd * approachLen
      };

      // 始点から最初の曲がり角まではすぐ曲線へ入り、直線区間を減らす
      const pts = [simplified[0]];
      for (let i = 1; i < nPts - 1; i++) {
        pts.push(simplified[i]);
      }
      if (Math.hypot(approachPt.x - pts[pts.length - 1].x, approachPt.y - pts[pts.length - 1].y) > 2) {
        pts.push(approachPt);
      }
      pts.push(last);

      // 折れ線の各頂点間をなめらかな3次ベジェで連続接続（直線Lの区切りを極力なくす）
      // 各区間の中点をアンカーにし、各コーナーを3次ベジェ曲線で包み込むことで途切れのない曲線カギ線にする
      let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;

      if (pts.length === 3) {
        // 典型的な1カギ線（始点 → コーナー → 終点アプローチ → 終点）
        const p0 = pts[0];
        const corner = pts[1];
        const p2 = pts[2];
        const p3 = pts[3] || p2;

        // 始点からコーナー手前まで、コーナーを通過するふっくらした3次ベジェ
        const cp1x = p0.x + (corner.x - p0.x) * 0.65;
        const cp1y = p0.y + (corner.y - p0.y) * 0.65;
        const cp2x = corner.x + (p2.x - corner.x) * 0.35;
        const cp2y = corner.y + (p2.y - corner.y) * 0.35;
        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
        if (pts.length > 3) {
          d += ` L ${p3.x.toFixed(1)} ${p3.y.toFixed(1)}`;
        }
        return d;
      }

      // 複数コーナー（迂回カギ線など）の場合：コーナー同士をなめらかな3次ベジェで連続接続
      const cornerCount = pts.length - 2; // 終点アプローチ・終点を除いた中間点
      const firstCorner = pts[1];
      const cpStart1x = pts[0].x + (firstCorner.x - pts[0].x) * 0.55;
      const cpStart1y = pts[0].y + (firstCorner.y - pts[0].y) * 0.55;

      // 最初の区間をコーナー側へなめらかに立ち上げる
      let prevAnchor = {
        x: pts[0].x + (firstCorner.x - pts[0].x) * 0.45,
        y: pts[0].y + (firstCorner.y - pts[0].y) * 0.45
      };
      d += ` Q ${cpStart1x.toFixed(1)} ${cpStart1y.toFixed(1)}, ${prevAnchor.x.toFixed(1)} ${prevAnchor.y.toFixed(1)}`;

      for (let i = 1; i <= cornerCount; i++) {
        const curr = pts[i];
        const next = pts[i + 1];

        // 次の区間との間になめらかな接続点（直線区間を挟まず曲線同士がつながるポイント）を設定
        const isBeforeApproach = (i === cornerCount);
        const endTarget = isBeforeApproach
          ? approachPt
          : {
              x: curr.x + (next.x - curr.x) * 0.55,
              y: curr.y + (next.y - curr.y) * 0.55
            };

        const cp1x = prevAnchor.x + (curr.x - prevAnchor.x) * 0.72;
        const cp1y = prevAnchor.y + (curr.y - prevAnchor.y) * 0.72;
        const cp2x = curr.x + (endTarget.x - curr.x) * 0.28;
        const cp2y = curr.y + (endTarget.y - curr.y) * 0.28;

        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${endTarget.x.toFixed(1)} ${endTarget.y.toFixed(1)}`;
        prevAnchor = endTarget;
      }

      d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
      return d;
    }

    function findObstacleAvoidingPath(p1, a1, p2, a2, nodes, srcNodeId = null, tgtNodeId = null, usedSegments = [], usedTurns = []) {
      const STUB = 22;
      const PAD = 18;
      const OUTER_MARGIN = 64;

      const dir1 = getAnchorDirection(a1);
      const dir2 = getAnchorDirection(a2);

      const s1 = { x: Math.round(p1.x + dir1.dx * STUB), y: Math.round(p1.y + dir1.dy * STUB) };
      const s2 = { x: Math.round(p2.x + dir2.dx * STUB), y: Math.round(p2.y + dir2.dy * STUB) };

      // 始点・終点ノードや他ノードを障害物矩形として構築
      // 終点ノードの上部・左部など空きスペースに回り込みやすいようパディングを設定
      const obstacles = [];
      let minX = Math.min(p1.x, p2.x, s1.x, s2.x);
      let maxX = Math.max(p1.x, p2.x, s1.x, s2.x);
      let minY = Math.min(p1.y, p2.y, s1.y, s2.y);
      let maxY = Math.max(p1.y, p2.y, s1.y, s2.y);

      for (const n of nodes) {
        const isEndpointNode = (n.id === srcNodeId || n.id === tgtNodeId);
        const pad = isEndpointNode ? 14 : PAD;
        const ob = {
          left: n.x - pad,
          right: n.x + n.width + pad,
          top: n.y - pad,
          bottom: n.y + n.height + pad
        };
        obstacles.push(ob);
        minX = Math.min(minX, ob.left);
        maxX = Math.max(maxX, ob.right);
        minY = Math.min(minY, ob.top);
        maxY = Math.max(maxY, ob.bottom);
      }

      // ハナングリッド（Hanan Grid）用のX・Y座標候補を収集
      const xSet = new Set([
        s1.x,
        s2.x,
        Math.round(minX - OUTER_MARGIN),
        Math.round(maxX + OUTER_MARGIN)
      ]);
      const ySet = new Set([
        s1.y,
        s2.y,
        Math.round(minY - OUTER_MARGIN),
        Math.round(maxY + OUTER_MARGIN)
      ]);

      for (const ob of obstacles) {
        xSet.add(Math.round(ob.left));
        xSet.add(Math.round(ob.right));
        ySet.add(Math.round(ob.top));
        ySet.add(Math.round(ob.bottom));
      }
      // Give the search explicit neighboring lanes around routes already placed.
      for (const segment of usedSegments) {
        if (segment.horizontal) {
          for (const delta of [-24, -16, 16, 24]) ySet.add(Math.round(segment.y + delta));
        } else {
          for (const delta of [-24, -16, 16, 24]) xSet.add(Math.round(segment.x + delta));
        }
      }
      for (const turn of usedTurns) {
        for (const delta of [-24, -16, 16, 24]) {
          xSet.add(Math.round(turn.x + delta));
          ySet.add(Math.round(turn.y + delta));
        }
      }

      // 隣接グリッドの中間ラインも追加して、空きスペースやノード間の空間を素直に抜けるようにする
      const baseXs = Array.from(xSet).sort((a, b) => a - b);
      const baseYs = Array.from(ySet).sort((a, b) => a - b);
      for (let i = 0; i < baseXs.length - 1; i++) {
        if (baseXs[i + 1] - baseXs[i] >= 18) {
          xSet.add(Math.round((baseXs[i] + baseXs[i + 1]) / 2));
        }
      }
      for (let i = 0; i < baseYs.length - 1; i++) {
        if (baseYs[i + 1] - baseYs[i] >= 18) {
          ySet.add(Math.round((baseYs[i] + baseYs[i + 1]) / 2));
        }
      }

      const xs = Array.from(xSet).sort((a, b) => a - b);
      const ys = Array.from(ySet).sort((a, b) => a - b);
      const nx = xs.length;
      const ny = ys.length;

      const startIx = xs.indexOf(s1.x);
      const startIy = ys.indexOf(s1.y);
      const goalIx = xs.indexOf(s2.x);
      const goalIy = ys.indexOf(s2.y);

      if (startIx === -1 || startIy === -1 || goalIx === -1 || goalIy === -1) {
        return buildRoundedKeyPath([p1, s1, s2, p2], 18);
      }

      const totalStates = nx * ny * 3;
      const gScore = new Float64Array(totalStates);
      gScore.fill(Infinity);
      const cameFrom = new Int32Array(totalStates);
      cameFrom.fill(-1);
      const closed = new Uint8Array(totalStates);

      const heapStates = [];
      const heapF = [];
      function pushHeap(stateIdx, fVal) {
        let i = heapStates.length;
        heapStates.push(stateIdx);
        heapF.push(fVal);
        while (i > 0) {
          const parent = (i - 1) >> 1;
          if (heapF[parent] <= fVal) break;
          heapStates[i] = heapStates[parent];
          heapF[i] = heapF[parent];
          i = parent;
        }
        heapStates[i] = stateIdx;
        heapF[i] = fVal;
      }

      function popHeap() {
        if (heapStates.length === 0) return -1;
        const top = heapStates[0];
        const lastState = heapStates.pop();
        const lastF = heapF.pop();
        if (heapStates.length > 0) {
          let i = 0;
          const half = heapStates.length >> 1;
          while (i < half) {
            let child = (i << 1) + 1;
            const right = child + 1;
            if (right < heapStates.length && heapF[right] < heapF[child]) {
              child = right;
            }
            if (lastF <= heapF[child]) break;
            heapStates[i] = heapStates[child];
            heapF[i] = heapF[child];
            i = child;
          }
          heapStates[i] = lastState;
          heapF[i] = lastF;
        }
        return top;
      }

      const initDir = (dir1.dx !== 0) ? 1 : 2;
      const startState = (startIy * nx + startIx) * 3 + initDir;
      gScore[startState] = 0;
      const h0 = Math.abs(xs[goalIx] - xs[startIx]) + Math.abs(ys[goalIy] - ys[startIy]);
      pushHeap(startState, h0);

      // カギ線としてスッキリ見えるよう、無駄な角（曲がり）にはしっかりペナルティを与える
      const BEND_PENALTY = 220;
      const OBSTACLE_PENALTY = 50000;
      const DIRS = [
        { dx: 1, dy: 0, dirCode: 1 },
        { dx: -1, dy: 0, dirCode: 1 },
        { dx: 0, dy: 1, dirCode: 2 },
        { dx: 0, dy: -1, dirCode: 2 }
      ];

      let bestGoalState = -1;
      let bestGoalCost = Infinity;

      while (heapStates.length > 0) {
        const curr = popHeap();
        if (closed[curr]) continue;
        closed[curr] = 1;

        const currDir = curr % 3;
        const cellIdx = (curr - currDir) / 3;
        const ix = cellIdx % nx;
        const iy = (cellIdx - ix) / nx;

        if (ix === goalIx && iy === goalIy) {
          const endDir = (dir2.dx !== 0) ? 1 : 2;
          const finalBend = (currDir !== 0 && currDir !== endDir) ? BEND_PENALTY : 0;
          const totalCost = gScore[curr] + finalBend;
          if (totalCost < bestGoalCost) {
            bestGoalCost = totalCost;
            bestGoalState = curr;
          }
          break;
        }

        const x1 = xs[ix];
        const y1 = ys[iy];
        const currG = gScore[curr];

        for (let d = 0; d < 4; d++) {
          const nix = ix + DIRS[d].dx;
          const niy = iy + DIRS[d].dy;
          if (nix < 0 || nix >= nx || niy < 0 || niy >= ny) continue;

          const nextDir = DIRS[d].dirCode;
          const nextState = (niy * nx + nix) * 3 + nextDir;
          if (closed[nextState]) continue;

          const x2 = xs[nix];
          const y2 = ys[niy];
          const segLen = Math.abs(x2 - x1) + Math.abs(y2 - y1);
          const overlap = computeSegmentObstacleOverlap(x1, y1, x2, y2, obstacles);
          const bendCost = (currDir !== 0 && currDir !== nextDir) ? BEND_PENALTY : 0;
          let routeCost = 0;
          let sharesOccupiedLane = false;
          const horizontal = Math.abs(y1 - y2) < 0.01;
          for (const segment of usedSegments) {
            if (horizontal === segment.horizontal) {
              const shared = horizontal
                ? Math.min(Math.max(x1, x2), Math.max(segment.x1, segment.x2)) - Math.max(Math.min(x1, x2), Math.min(segment.x1, segment.x2))
                : Math.min(Math.max(y1, y2), Math.max(segment.y1, segment.y2)) - Math.max(Math.min(y1, y2), Math.min(segment.y1, segment.y2));
              const laneGap = horizontal ? Math.abs(y1 - segment.y) : Math.abs(x1 - segment.x);
              // A route may cross another route, but it must never reuse its lane.
              // A large score was insufficient: a long detour could still cost more.
              if (shared > 4 && laneGap < 20) {
                sharesOccupiedLane = true;
                break;
              }
            } else {
              const crosses = horizontal
                ? segment.x > Math.min(x1, x2) && segment.x < Math.max(x1, x2) && y1 > Math.min(segment.y1, segment.y2) && y1 < Math.max(segment.y1, segment.y2)
                : segment.y > Math.min(y1, y2) && segment.y < Math.max(y1, y2) && x1 > Math.min(segment.x1, segment.x2) && x1 < Math.max(segment.x1, segment.x2);
              if (crosses) routeCost += 12000;
            }
          }
          if (sharesOccupiedLane) continue;
          if (currDir !== 0 && currDir !== nextDir && usedTurns.some(turn =>
            Math.abs(turn.x - x1) < 16 || Math.abs(turn.y - y1) < 16)) routeCost += 24000;

          const tentativeG = currG + segLen + bendCost + overlap * OBSTACLE_PENALTY + routeCost;
          if (tentativeG < gScore[nextState]) {
            gScore[nextState] = tentativeG;
            cameFrom[nextState] = curr;
            const h = Math.abs(xs[goalIx] - x2) + Math.abs(ys[goalIy] - y2);
            pushHeap(nextState, tentativeG + h);
          }
        }
      }

      const gridPts = [];
      if (bestGoalState !== -1) {
        let trace = bestGoalState;
        while (trace !== -1) {
          const dir = trace % 3;
          const cell = (trace - dir) / 3;
          const ix = cell % nx;
          const iy = (cell - ix) / nx;
          gridPts.push({ x: xs[ix], y: ys[iy] });
          trace = cameFrom[trace];
        }
        gridPts.reverse();
      } else {
        gridPts.push(s1, s2);
      }

      const fullPts = [p1, ...gridPts, p2];
      return fullPts.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    }

    function buildEditableEdgePath(p1, p2, edge) {
      if (!Array.isArray(edge.routePoints) && Array.isArray(edge.bendPoints) && edge.bendPoints.length > 0) {
        const sourceDirection = getAnchorDirection(edge.sourceAnchor || 'right');
        const targetDirection = getAnchorDirection(edge.targetAnchor || 'left');
        edge.routePoints = [
          p1,
          { x: p1.x + sourceDirection.dx * 20, y: p1.y + sourceDirection.dy * 20 },
          ...edge.bendPoints.map(point => ({ x: point.x, y: point.y })),
          { x: p2.x + targetDirection.dx * 20, y: p2.y + targetDirection.dy * 20 },
          p2
        ];
        delete edge.bendPoints;
      }
      if (!Array.isArray(edge.routePoints) || edge.routePoints.length < 2) return null;
      const raw = edge.routePoints
        .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
        .map(point => ({ x: point.x, y: point.y }));
      if (raw.length < 2) return null;
      raw[0] = { x: p1.x, y: p1.y };
      raw[raw.length - 1] = { x: p2.x, y: p2.y };
      const points = [raw[0]];
      for (let i = 1; i < raw.length; i++) {
        const a = points[points.length - 1], b = raw[i];
        if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) {
          const prior = raw[i - 1];
          const wasVertical = Math.abs(prior.x - b.x) < Math.abs(prior.y - b.y);
          points.push(wasVertical ? { x: a.x, y: b.y } : { x: b.x, y: a.y });
        }
        points.push(b);
      }
      const simplified = [];
      for (const point of points) {
        const last = simplified[simplified.length - 1];
        if (last && Math.abs(last.x - point.x) < 0.01 && Math.abs(last.y - point.y) < 0.01) continue;
        while (simplified.length >= 2) {
          const a = simplified[simplified.length - 2], b = simplified[simplified.length - 1];
          if ((Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - point.x) < 0.01) ||
              (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - point.y) < 0.01)) simplified.pop();
          else break;
        }
        simplified.push(point);
      }
      return {
        points: simplified,
        d: simplified.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
      };
    }

    function getBaseEdgeStyle(style = 'bezier') {
      if (!style) return 'bezier';
      return style.endsWith('-dashed') ? style.slice(0, -7) : style;
    }

    function isDashedEdgeStyle(style = '') {
      return typeof style === 'string' && style.endsWith('-dashed');
    }

    function buildEdgePath(p1, a1, p2, a2, style = 'bezier', srcNodeId = null, tgtNodeId = null, usedSegments = [], usedTurns = []) {
      const baseStyle = getBaseEdgeStyle(style);
      if (baseStyle === 'straight') {
        return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
      }
      if (baseStyle === 'avoid' || baseStyle === 'bezier') {
        return findObstacleAvoidingPath(p1, a1, p2, a2, state.nodes, srcNodeId, tgtNodeId, usedSegments, usedTurns);
      }
      const dist = Math.max(45, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.4);
      const offset = (anchor) => {
        switch (anchor) {
          case 'top': return { dx: 0, dy: -dist };
          case 'bottom': return { dx: 0, dy: dist };
          case 'left': return { dx: -dist, dy: 0 };
          case 'right': return { dx: dist, dy: 0 };
          default: return { dx: 0, dy: 0 };
        }
      };
      const o1 = offset(a1);
      const o2 = offset(a2);
      return `M ${p1.x} ${p1.y} C ${p1.x + o1.dx} ${p1.y + o1.dy}, ${p2.x + o2.dx} ${p2.y + o2.dy}, ${p2.x} ${p2.y}`;
    }
