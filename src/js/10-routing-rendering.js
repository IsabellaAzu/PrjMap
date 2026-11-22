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

    function findObstacleAvoidingPath(p1, a1, p2, a2, nodes, srcNodeId = null, tgtNodeId = null) {
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

          const tentativeG = currG + segLen + bendCost + overlap * OBSTACLE_PENALTY;
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
      return buildRoundedKeyPath(fullPts, 18);
    }

    function getBaseEdgeStyle(style = 'bezier') {
      if (!style) return 'bezier';
      return style.endsWith('-dashed') ? style.slice(0, -7) : style;
    }

    function isDashedEdgeStyle(style = '') {
      return typeof style === 'string' && style.endsWith('-dashed');
    }

    function buildEdgePath(p1, a1, p2, a2, style = 'bezier', srcNodeId = null, tgtNodeId = null) {
      const baseStyle = getBaseEdgeStyle(style);
      if (baseStyle === 'straight') {
        return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
      }
      if (baseStyle === 'avoid') {
        return findObstacleAvoidingPath(p1, a1, p2, a2, state.nodes, srcNodeId, tgtNodeId);
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
