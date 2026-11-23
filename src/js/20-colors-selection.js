    // ===== 色履歴（各4枠固定・履歴順）＆ カスタムカラーピッカー管理 =====
    const COLOR_HISTORY_KEY = 'canvasflow_color_history_v1';
    const colorHistory = {
      fill: ['#ffffff', '#eff6ff', '#f0fdf4'],
      stroke: ['#64748b', '#2563eb', '#059669'],
      text: ['#1e293b', '#0f172a', '#ffffff'],
      edge: ['#2563eb', '#059669', '#d97706']
    };

    try {
      const savedHist = JSON.parse(localStorage.getItem(COLOR_HISTORY_KEY) || 'null');
      if (savedHist) {
        if (Array.isArray(savedHist.fill) && savedHist.fill.length > 0) {
          colorHistory.fill = savedHist.fill.slice(0, 3);
        }
        if (Array.isArray(savedHist.stroke) && savedHist.stroke.length > 0) {
          colorHistory.stroke = savedHist.stroke.slice(0, 3);
        }
        if (Array.isArray(savedHist.text) && savedHist.text.length > 0) {
          colorHistory.text = savedHist.text.slice(0, 3).map(getOpaqueColor);
        }
        if (Array.isArray(savedHist.edge) && savedHist.edge.length > 0) {
          colorHistory.edge = savedHist.edge.slice(0, 3);
        }
      }
    } catch (_) {}

    function saveColorHistory() {
      try {
        localStorage.setItem(COLOR_HISTORY_KEY, JSON.stringify({
          fill: colorHistory.fill.slice(0, 3),
          stroke: colorHistory.stroke.slice(0, 3),
          text: colorHistory.text.slice(0, 3),
          edge: colorHistory.edge.slice(0, 3)
        }));
      } catch (_) {}
    }

    function recordColorHistory(kind, color) {
      if (!color || color === 'transparent' || color === 'none') return;
      if (kind === 'text') color = getOpaqueColor(color);
      const list = colorHistory[kind];
      const normalized = color.trim();
      const idx = list.findIndex(c => c.toLowerCase() === normalized.toLowerCase());
      if (idx !== -1) {
        list.splice(idx, 1);
      }
      list.unshift(normalized);
      if (list.length > 3) {
        list.length = 3;
      }
      saveColorHistory();
    }

    function parseColorToRgba(colorStr) {
      if (!colorStr || colorStr === 'transparent' || colorStr === 'none') {
        return { r: 255, g: 255, b: 255, a: 0 };
      }
      const tmp = document.createElement('div');
      tmp.style.color = '';
      tmp.style.color = colorStr;
      document.body.appendChild(tmp);
      const computed = getComputedStyle(tmp).color;
      document.body.removeChild(tmp);

      const m = computed.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
      if (!m) {
        return { r: 37, g: 99, b: 235, a: 1 };
      }
      return {
        r: Math.round(Number(m[1])),
        g: Math.round(Number(m[2])),
        b: Math.round(Number(m[3])),
        a: m[4] !== undefined ? Math.max(0, Math.min(1, Number(m[4]))) : 1
      };
    }

    function rgbaToCss(r, g, b, a) {
      const cr = Math.max(0, Math.min(255, Math.round(r)));
      const cg = Math.max(0, Math.min(255, Math.round(g)));
      const cb = Math.max(0, Math.min(255, Math.round(b)));
      const ca = Math.max(0, Math.min(1, Number(a)));
      if (ca >= 0.999) {
        return '#' + [cr, cg, cb].map(v => v.toString(16).padStart(2, '0')).join('');
      }
      const alphaRounded = Math.round(ca * 100) / 100;
      return `rgba(${cr}, ${cg}, ${cb}, ${alphaRounded})`;
    }

    function getOpaqueColor(color) {
      const rgba = parseColorToRgba(color);
      return rgbaToCss(rgba.r, rgba.g, rgba.b, 1);
    }

    function migrateLegacyTextOpacity(nodes) {
      let migrated = false;
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        if (node.type !== 'image' && node.textColor) {
          const rgba = node.textColor === 'transparent'
            ? { r: 30, g: 41, b: 59, a: 0 }
            : parseColorToRgba(node.textColor);
          if (rgba.a < 0.999) {
            const storedOpacity = node.opacity == null ? 1 : Number(node.opacity);
            const currentOpacity = Number.isFinite(storedOpacity)
              ? Math.max(0, Math.min(1, storedOpacity))
              : 1;
            node.opacity = Math.round(currentOpacity * rgba.a * 100) / 100;
            node.textColor = rgbaToCss(rgba.r, rgba.g, rgba.b, 1);
            migrated = true;
          }
        }
        if (node.opacity != null) {
          const storedOpacity = Number(node.opacity);
          if (!Number.isFinite(storedOpacity)) {
            delete node.opacity;
            migrated = true;
          } else if (storedOpacity < 0.1 || storedOpacity > 1) {
            node.opacity = Math.max(0.1, Math.min(1, storedOpacity));
            migrated = true;
          }
        }
      }
      return migrated;
    }

    function rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      let h = 0;
      const s = max === 0 ? 0 : d / max;
      const v = max;
      if (d !== 0) {
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
      }
      return { h, s, v };
    }

    function hsvToRgb(h, s, v) {
      h = ((h % 360) + 360) % 360;
      const c = v * s;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = v - c;
      let rp = 0, gp = 0, bp = 0;
      if (h < 60) { rp = c; gp = x; }
      else if (h < 120) { rp = x; gp = c; }
      else if (h < 180) { gp = c; bp = x; }
      else if (h < 240) { gp = x; bp = c; }
      else if (h < 300) { rp = x; bp = c; }
      else { rp = c; bp = x; }
      return {
        r: Math.round((rp + m) * 255),
        g: Math.round((gp + m) * 255),
        b: Math.round((bp + m) * 255)
      };
    }

    function getSelectedTargetIds() {
      if (state.selectedNodeIds.size > 0) return Array.from(state.selectedNodeIds);
      if (state.selectedNodeId) return [state.selectedNodeId];
      return [];
    }

    function getCurrentSelectedColor(kind) {
      const ids = getSelectedTargetIds();
      if (ids.length === 0) return null;
      const firstNode = ids
        .map(id => state.nodes.find(n => n.id === id))
        .find(node => node && (kind !== 'text' || node.type !== 'image'));
      if (!firstNode) return null;
      if (kind === 'fill') return firstNode.fill ?? '#ffffff';
      if (kind === 'stroke') return firstNode.stroke ?? '#64748b';
      return firstNode.textColor ?? '#1e293b';
    }

    function getCurrentSelectedEdgeColor() {
      if (!state.selectedEdgeId) return null;
      const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
      return edge ? (edge.color || '#64748b') : null;
    }

    function applyColorToSelected(kind, colorValue) {
      if (kind === 'edge') {
        const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
        if (!edge) return;
        pushHistory();
        edge.color = colorValue;
        if (colorValue && colorValue !== 'transparent') {
          recordColorHistory('edge', colorValue);
        }
        renderEdges();
        renderEdgeColorSlots();
        syncColorPickerWithCurrent(false);
        persistToLocalStorage();
        return;
      }

      const nodes = getSelectedTargetIds()
        .map(id => state.nodes.find(n => n.id === id))
        .filter(node => node && (kind !== 'text' || node.type !== 'image'));
      if (nodes.length === 0) return;
      pushHistory();
      const appliedColor = kind === 'text' && colorValue !== 'transparent'
        ? getOpaqueColor(colorValue)
        : colorValue;
      nodes.forEach(node => {
        const property = kind === 'text' ? 'textColor' : kind;
        if (kind === 'text' && colorValue === 'transparent') delete node[property];
        else node[property] = appliedColor;
      });
      if (appliedColor && appliedColor !== 'transparent') {
        recordColorHistory(kind, appliedColor);
      }
      renderNodes();
      renderColorSlots();
      syncObjectOpacityControl();
      syncColorPickerWithCurrent(false);
      persistToLocalStorage();
    }

    function createColorSwatchEl(colorValue, kind, isActive) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `swatch-btn ${isActive ? 'active' : ''}`;
      if (!colorValue || colorValue === 'transparent') {
        btn.style.background = '#f1f5f9';
        btn.style.border = '1px solid #cbd5e1';
        btn.textContent = '無';
        btn.title = '透明（無）';
      } else {
        const rgba = parseColorToRgba(colorValue);
        if (rgba.a < 1) {
          btn.style.background = `linear-gradient(135deg, ${rgbaToCss(rgba.r, rgba.g, rgba.b, rgba.a)} 50%, #e2e8f0 50%)`;
        } else {
          btn.style.background = colorValue;
        }
        btn.style.border = '1px solid rgba(15, 23, 42, 0.18)';
        btn.title = colorValue;
      }
      btn.addEventListener('click', () => {
        applyColorToSelected(kind, colorValue || 'transparent');
      });
      return btn;
    }

    function renderColorSlots() {
      const currentFill = getCurrentSelectedColor('fill');
      const currentStroke = getCurrentSelectedColor('stroke');
      const currentText = getCurrentSelectedColor('text');

      const fillHistEl = document.getElementById('fill-history-slots');
      const fillActiveEl = document.getElementById('fill-active-slot');
      const fillNoneBtn = document.getElementById('fill-none-btn');

      if (fillHistEl) {
        fillHistEl.innerHTML = '';
        for (let i = 0; i < 3; i++) {
          const histColor = colorHistory.fill[i];
          if (histColor) {
            fillHistEl.appendChild(createColorSwatchEl(histColor, 'fill', false));
          } else {
            const emptySlot = document.createElement('span');
            emptySlot.className = 'swatch-btn';
            emptySlot.style.background = '#f8fafc';
            emptySlot.style.border = '1px dashed #cbd5e1';
            emptySlot.style.cursor = 'default';
            emptySlot.style.boxShadow = 'none';
            fillHistEl.appendChild(emptySlot);
          }
        }
      }

      if (fillActiveEl) {
        fillActiveEl.innerHTML = '';
        if (currentFill && currentFill !== 'transparent') {
          fillActiveEl.appendChild(createColorSwatchEl(currentFill, 'fill', true));
        }
      }

      if (fillNoneBtn) {
        fillNoneBtn.classList.toggle('active', currentFill === 'transparent');
      }

      const strokeHistEl = document.getElementById('stroke-history-slots');
      const strokeActiveEl = document.getElementById('stroke-active-slot');
      const strokeNoneBtn = document.getElementById('stroke-none-btn');

      if (strokeHistEl) {
        strokeHistEl.innerHTML = '';
        for (let i = 0; i < 3; i++) {
          const histColor = colorHistory.stroke[i];
          if (histColor) {
            strokeHistEl.appendChild(createColorSwatchEl(histColor, 'stroke', false));
          } else {
            const emptySlot = document.createElement('span');
            emptySlot.className = 'swatch-btn';
            emptySlot.style.background = '#f8fafc';
            emptySlot.style.border = '1px dashed #cbd5e1';
            emptySlot.style.cursor = 'default';
            emptySlot.style.boxShadow = 'none';
            strokeHistEl.appendChild(emptySlot);
          }
        }
      }

      if (strokeActiveEl) {
        strokeActiveEl.innerHTML = '';
        if (currentStroke && currentStroke !== 'transparent') {
          strokeActiveEl.appendChild(createColorSwatchEl(currentStroke, 'stroke', true));
        }
      }

      if (strokeNoneBtn) {
        strokeNoneBtn.classList.toggle('active', currentStroke === 'transparent');
      }

      const textHistEl = document.getElementById('text-color-history-slots');
      const textActiveEl = document.getElementById('text-color-active-slot');
      const textDefaultBtn = document.getElementById('text-color-default-btn');
      if (textHistEl) {
        textHistEl.innerHTML = '';
        for (let i = 0; i < 3; i++) {
          const histColor = colorHistory.text[i];
          if (histColor) {
            textHistEl.appendChild(createColorSwatchEl(histColor, 'text', false));
          } else {
            const emptySlot = document.createElement('span');
            emptySlot.className = 'swatch-btn';
            emptySlot.style.background = '#f8fafc';
            emptySlot.style.border = '1px dashed #cbd5e1';
            emptySlot.style.cursor = 'default';
            emptySlot.style.boxShadow = 'none';
            textHistEl.appendChild(emptySlot);
          }
        }
      }
      if (textActiveEl) {
        textActiveEl.innerHTML = '';
        if (currentText && currentText !== 'transparent') {
          textActiveEl.appendChild(createColorSwatchEl(currentText, 'text', true));
        }
      }
      if (textDefaultBtn) textDefaultBtn.classList.toggle('active', currentText === '#1e293b');
      syncObjectOpacityControl();
    }

    function syncObjectOpacityControl() {
      const slider = document.getElementById('object-opacity-slider');
      const value = document.getElementById('object-opacity-value');
      if (!slider) return;
      const selectedNode = getSelectedTargetIds()
        .map(id => state.nodes.find(node => node.id === id))
        .find(Boolean);
      const percent = Math.max(10, Math.round((selectedNode?.opacity ?? 1) * 10) * 10);
      slider.value = String(percent);
      if (value) value.value = `${percent}%`;
    }

    let objectOpacityHistoryStarted = false;

    function applyObjectOpacityFromSlider(commit = false) {
      const slider = document.getElementById('object-opacity-slider');
      if (!slider) return;
      const opacity = Math.max(0.1, Number(slider.value) / 100);
      const nodes = getSelectedTargetIds()
        .map(id => state.nodes.find(node => node.id === id))
        .filter(Boolean);
      if (nodes.length === 0) return;

      const updates = nodes.filter(node => Math.abs((node.opacity ?? 1) - opacity) > 0.001);

      if (updates.length > 0) {
        if (!objectOpacityHistoryStarted) {
          pushHistory();
          objectOpacityHistoryStarted = true;
        }
        updates.forEach(node => {
          if (opacity >= 1) delete node.opacity;
          else node.opacity = opacity;
        });
        renderNodes();
        persistToLocalStorage();
      }

      const value = document.getElementById('object-opacity-value');
      if (value) value.value = `${slider.value}%`;
      if (commit) objectOpacityHistoryStarted = false;
    }

    function renderEdgeColorSlots() {
      const currentEdge = getCurrentSelectedEdgeColor();
      const edgeHistEl = document.getElementById('edge-history-slots');
      const edgeActiveEl = document.getElementById('edge-active-slot');

      if (edgeHistEl) {
        edgeHistEl.innerHTML = '';
        for (let i = 0; i < 3; i++) {
          const histColor = colorHistory.edge[i];
          if (histColor) {
            edgeHistEl.appendChild(createColorSwatchEl(histColor, 'edge', false));
          } else {
            const emptySlot = document.createElement('span');
            emptySlot.className = 'swatch-btn';
            emptySlot.style.background = '#f8fafc';
            emptySlot.style.border = '1px dashed #cbd5e1';
            emptySlot.style.cursor = 'default';
            emptySlot.style.boxShadow = 'none';
            edgeHistEl.appendChild(emptySlot);
          }
        }
      }

      if (edgeActiveEl) {
        edgeActiveEl.innerHTML = '';
        if (currentEdge) {
          edgeActiveEl.appendChild(createColorSwatchEl(currentEdge, 'edge', true));
        }
      }
    }

    // カスタムカラーピッカー（SVグラデーション＋色相スライダー＋不透明度スライダー）
    const pickerState = {
      activeKind: null, // 'fill' | 'stroke' | 'text' | 'edge' | null
      h: 145,
      s: 0.9,
      v: 0.75,
      a: 1,
      isDraggingSv: false,
      isFirstCommitInSession: true
    };

    const pickerPanel = document.getElementById('custom-color-picker-panel');
    const pickerTargetLabel = document.getElementById('picker-target-label');
    const pickerReadout = document.getElementById('picker-rgba-readout');
    const pickerSvCanvas = document.getElementById('picker-sv-canvas');
    const pickerSvCtx = pickerSvCanvas ? pickerSvCanvas.getContext('2d') : null;
    const pickerPreviewCircle = document.getElementById('picker-preview-circle');
    const pickerHueSlider = document.getElementById('picker-hue-slider');
    const pickerAlphaSlider = document.getElementById('picker-alpha-slider');
    const pickerHexInput = document.getElementById('picker-hex-input');

    function drawSvCanvas() {
      if (!pickerSvCtx || !pickerSvCanvas) return;
      const w = pickerSvCanvas.width;
      const h = pickerSvCanvas.height;
      const pureHue = hsvToRgb(pickerState.h, 1, 1);

      pickerSvCtx.clearRect(0, 0, w, h);
      pickerSvCtx.fillStyle = `rgb(${pureHue.r}, ${pureHue.g}, ${pureHue.b})`;
      pickerSvCtx.fillRect(0, 0, w, h);

      const whiteGrad = pickerSvCtx.createLinearGradient(0, 0, w, 0);
      whiteGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      pickerSvCtx.fillStyle = whiteGrad;
      pickerSvCtx.fillRect(0, 0, w, h);

      const blackGrad = pickerSvCtx.createLinearGradient(0, 0, 0, h);
      blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      blackGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
      pickerSvCtx.fillStyle = blackGrad;
      pickerSvCtx.fillRect(0, 0, w, h);

      // 現在位置の円形インジケーター
      const cx = pickerState.s * w;
      const cy = (1 - pickerState.v) * h;
      pickerSvCtx.beginPath();
      pickerSvCtx.arc(cx, cy, 7, 0, Math.PI * 2);
      pickerSvCtx.lineWidth = 2.5;
      pickerSvCtx.strokeStyle = '#ffffff';
      pickerSvCtx.stroke();

      pickerSvCtx.beginPath();
      pickerSvCtx.arc(cx, cy, 8.5, 0, Math.PI * 2);
      pickerSvCtx.lineWidth = 1;
      pickerSvCtx.strokeStyle = 'rgba(0,0,0,0.45)';
      pickerSvCtx.stroke();
    }

    function updateAlphaSliderTrack() {
      if (!pickerAlphaSlider) return;
      const rgb = hsvToRgb(pickerState.h, pickerState.s, pickerState.v);
      pickerAlphaSlider.style.background = `linear-gradient(to right, rgba(${rgb.r},${rgb.g},${rgb.b},0) 0%, rgba(${rgb.r},${rgb.g},${rgb.b},1) 100%)`;
    }

    function syncColorPickerWithCurrent(resetSession = true) {
      if (!pickerState.activeKind) return;
      const curColor = pickerState.activeKind === 'edge'
        ? getCurrentSelectedEdgeColor()
        : getCurrentSelectedColor(pickerState.activeKind);
      const rgba = parseColorToRgba(curColor && curColor !== 'transparent' ? curColor : '#2563eb');
      const hsv = rgbToHsv(rgba.r, rgba.g, rgba.b);
      if (hsv.s > 0.02) {
        pickerState.h = hsv.h;
      }
      pickerState.s = hsv.s;
      pickerState.v = hsv.v;
      pickerState.a = pickerState.activeKind === 'text'
        ? 1
        : (curColor === 'transparent' ? 0 : Math.round(rgba.a * 10) / 10);
      if (resetSession) {
        pickerState.isFirstCommitInSession = true;
      }

      if (pickerHueSlider) pickerHueSlider.value = String(Math.round(pickerState.h));
      if (pickerAlphaSlider) pickerAlphaSlider.value = String(Math.round(pickerState.a * 100));
      drawSvCanvas();
      updateAlphaSliderTrack();
      refreshPickerReadoutOnly();
    }

    function refreshPickerReadoutOnly() {
      const rgb = hsvToRgb(pickerState.h, pickerState.s, pickerState.v);
      const cssColor = rgbaToCss(rgb.r, rgb.g, rgb.b, pickerState.a);
      if (pickerPreviewCircle) {
        pickerPreviewCircle.style.background = cssColor;
      }
      if (pickerReadout) {
        pickerReadout.textContent = `${Math.round(pickerState.a * 100)}%`;
      }
      if (pickerHexInput && document.activeElement !== pickerHexInput) {
        pickerHexInput.value = cssColor;
      }
    }

    function commitPickerColor(recordHist = false) {
      if (!pickerState.activeKind) return;
      const rgb = hsvToRgb(pickerState.h, pickerState.s, pickerState.v);
      const alpha = pickerState.activeKind === 'text' ? 1 : pickerState.a;
      const cssColor = alpha <= 0.01 ? 'transparent' : rgbaToCss(rgb.r, rgb.g, rgb.b, alpha);

      if (pickerState.activeKind === 'edge') {
        const edge = state.edges.find(ed => ed.id === state.selectedEdgeId);
        if (!edge) return;
        if (pickerState.isFirstCommitInSession) {
          pushHistory();
          pickerState.isFirstCommitInSession = false;
        }
        edge.color = cssColor === 'transparent' ? '#64748b' : cssColor;
        if (recordHist && edge.color !== 'transparent') {
          recordColorHistory('edge', edge.color);
        }
        refreshPickerReadoutOnly();
        renderEdges();
        renderEdgeColorSlots();
        persistToLocalStorage();
        return;
      }

      const nodes = getSelectedTargetIds()
        .map(id => state.nodes.find(n => n.id === id))
        .filter(node => node && (pickerState.activeKind !== 'text' || node.type !== 'image'));
      if (nodes.length === 0) return;

      if (pickerState.isFirstCommitInSession) {
        pushHistory();
        pickerState.isFirstCommitInSession = false;
      }

      nodes.forEach(node => {
        const property = pickerState.activeKind === 'text' ? 'textColor' : pickerState.activeKind;
        node[property] = cssColor;
      });

      if (recordHist && cssColor !== 'transparent') {
        recordColorHistory(pickerState.activeKind, cssColor);
      }

      refreshPickerReadoutOnly();
      renderNodes();
      renderColorSlots();
      persistToLocalStorage();
    }

    function toggleColorPicker(kind) {
      const btnFill = document.getElementById('btn-toggle-fill-picker');
      const btnStroke = document.getElementById('btn-toggle-stroke-picker');
      const btnText = document.getElementById('btn-toggle-text-color-picker');
      const btnEdge = document.getElementById('btn-toggle-edge-picker');

      if (pickerState.activeKind === kind && pickerPanel && !pickerPanel.classList.contains('hidden')) {
        pickerState.activeKind = null;
        pickerPanel.classList.add('hidden');
        if (btnFill) btnFill.classList.remove('open');
        if (btnStroke) btnStroke.classList.remove('open');
        if (btnText) btnText.classList.remove('open');
        if (btnEdge) btnEdge.classList.remove('open');
        return;
      }

      pickerState.activeKind = kind;
      if (pickerAlphaSlider) {
        pickerAlphaSlider.classList.toggle('hidden', kind === 'text');
        pickerAlphaSlider.disabled = kind === 'text';
      }
      if (pickerReadout) pickerReadout.classList.toggle('hidden', kind === 'text');
      if (pickerTargetLabel) {
        if (kind === 'fill') pickerTargetLabel.textContent = '塗り — カラー選択';
        else if (kind === 'stroke') pickerTargetLabel.textContent = '枠線 — カラー選択';
        else if (kind === 'text') pickerTargetLabel.textContent = '文字色 — カラー選択';
        else pickerTargetLabel.textContent = '線色 — カラー選択';
      }
      if (btnFill) btnFill.classList.toggle('open', kind === 'fill');
      if (btnStroke) btnStroke.classList.toggle('open', kind === 'stroke');
      if (btnText) btnText.classList.toggle('open', kind === 'text');
      if (btnEdge) btnEdge.classList.toggle('open', kind === 'edge');
      if (pickerPanel) pickerPanel.classList.remove('hidden');
      syncColorPickerWithCurrent(true);
    }

    if (pickerSvCanvas) {
      const updateSvFromPointer = (e, finalize = false) => {
        const rect = pickerSvCanvas.getBoundingClientRect();
        const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        pickerState.s = nx;
        pickerState.v = 1 - ny;
        drawSvCanvas();
        updateAlphaSliderTrack();
        commitPickerColor(finalize);
      };

      pickerSvCanvas.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        pickerState.isDraggingSv = true;
        pickerSvCanvas.setPointerCapture(e.pointerId);
        updateSvFromPointer(e, false);
      });

      pickerSvCanvas.addEventListener('pointermove', (e) => {
        if (!pickerState.isDraggingSv) return;
        updateSvFromPointer(e, false);
      });

      pickerSvCanvas.addEventListener('pointerup', (e) => {
        if (!pickerState.isDraggingSv) return;
        pickerState.isDraggingSv = false;
        updateSvFromPointer(e, true);
      });
    }

    if (pickerHueSlider) {
      pickerHueSlider.addEventListener('input', (e) => {
        pickerState.h = Number(e.target.value);
        drawSvCanvas();
        updateAlphaSliderTrack();
        commitPickerColor(false);
      });
      pickerHueSlider.addEventListener('change', () => {
        commitPickerColor(true);
      });
    }

    if (pickerAlphaSlider) {
      pickerAlphaSlider.addEventListener('input', (e) => {
        pickerState.a = Number(e.target.value) / 100;
        commitPickerColor(false);
      });
      pickerAlphaSlider.addEventListener('change', () => {
        commitPickerColor(true);
      });
    }

    const objectOpacitySlider = document.getElementById('object-opacity-slider');
    objectOpacitySlider?.addEventListener('input', () => applyObjectOpacityFromSlider(false));
    objectOpacitySlider?.addEventListener('change', () => applyObjectOpacityFromSlider(true));

    function applyPickerHexInput() {
      if (!pickerHexInput) return;
      const val = pickerHexInput.value.trim();
      if (!val) return;
      const colorProbe = document.createElement('span');
      colorProbe.style.color = val;
      if (!colorProbe.style.color) return;

      const rgba = parseColorToRgba(val);
      const hsv = rgbToHsv(rgba.r, rgba.g, rgba.b);
      pickerState.h = hsv.h;
      pickerState.s = hsv.s;
      pickerState.v = hsv.v;
      pickerState.a = pickerState.activeKind === 'text' ? 1 : rgba.a;
      if (pickerHueSlider) pickerHueSlider.value = String(Math.round(pickerState.h));
      if (pickerAlphaSlider) pickerAlphaSlider.value = String(Math.round(pickerState.a * 100));
      drawSvCanvas();
      updateAlphaSliderTrack();
      commitPickerColor(true);
    }

    if (pickerHexInput) {
      pickerHexInput.addEventListener('paste', () => {
        setTimeout(applyPickerHexInput, 0);
      });
      pickerHexInput.addEventListener('change', applyPickerHexInput);
    }

    document.getElementById('btn-toggle-fill-picker').addEventListener('click', () => {
      document.getElementById('node-props')?.appendChild(pickerPanel);
      toggleColorPicker('fill');
    });
    document.getElementById('btn-toggle-stroke-picker').addEventListener('click', () => {
      document.getElementById('node-props')?.appendChild(pickerPanel);
      toggleColorPicker('stroke');
    });
    document.getElementById('btn-toggle-text-color-picker').addEventListener('click', () => {
      document.getElementById('node-props')?.appendChild(pickerPanel);
      toggleColorPicker('text');
    });
    document.getElementById('btn-toggle-edge-picker').addEventListener('click', () => {
      document.getElementById('edge-props')?.appendChild(pickerPanel);
      toggleColorPicker('edge');
    });
    document.getElementById('fill-none-btn').addEventListener('click', () => applyColorToSelected('fill', 'transparent'));
    document.getElementById('stroke-none-btn').addEventListener('click', () => applyColorToSelected('stroke', 'transparent'));
    document.getElementById('text-color-default-btn').addEventListener('click', () => applyColorToSelected('text', 'transparent'));
    document.getElementById('btn-close-color-picker').addEventListener('click', () => {
      if (pickerState.activeKind) {
        commitPickerColor(true);
      }
      pickerState.activeKind = null;
      if (pickerPanel) pickerPanel.classList.add('hidden');
      document.getElementById('btn-toggle-fill-picker')?.classList.remove('open');
      document.getElementById('btn-toggle-stroke-picker')?.classList.remove('open');
      document.getElementById('btn-toggle-text-color-picker')?.classList.remove('open');
    });
