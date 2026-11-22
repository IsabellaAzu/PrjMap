    /**
     * InMyMind - 完全オフライン完結型ダイアグラム＆マインドマップ作成ツール
     * 外部CDNや外部ネットワーク通信を一切行わず、単体HTMLファイルのみで動作します。
     */

    const STORAGE_KEY = 'canvasflow_offline_diagram_v1';

    // アプリケーション全体の状態
    const state = {
      nodes: [],
      edges: [],
      viewport: {
        x: 120,
        y: 100,
        zoom: 1
      },
      selectedNodeId: null,
      selectedNodeIds: new Set(),
      selectedEdgeId: null,
      editingNodeId: null,
      searchQuery: '',
      searchMatches: [],
      searchMatchIndex: 0,
      hiddenTags: new Set(),
      fileHandle: null,
      clipboard: {
        nodes: [],
        edges: [],
        pasteCount: 0
      }
    };

    // Undo / Redo 履歴スタック
    const history = {
      past: [],
      future: [],
      maxSize: 60
    };

    function createSnapshot() {
      return JSON.stringify({
        nodes: state.nodes,
        edges: state.edges
      });
    }

    function updateHistoryButtons() {
      const btnUndo = document.getElementById('btn-undo');
      const btnRedo = document.getElementById('btn-redo');
      if (btnUndo) btnUndo.disabled = history.past.length === 0;
      if (btnRedo) btnRedo.disabled = history.future.length === 0;
    }

    function pushHistory(snapshotStr = createSnapshot()) {
      if (history.past.length > 0 && history.past[history.past.length - 1] === snapshotStr) {
        return;
      }
      history.past.push(snapshotStr);
      if (history.past.length > history.maxSize) {
        history.past.shift();
      }
      history.future = [];
      updateHistoryButtons();
    }

    function undo() {
      if (state.editingNodeId || history.past.length === 0) return;
      const currentSnapshot = createSnapshot();
      const prevSnapshot = history.past.pop();
      history.future.push(currentSnapshot);

      const restored = JSON.parse(prevSnapshot);
      state.nodes = restored.nodes;
      state.edges = restored.edges;
      state.selectedNodeId = null;
      state.selectedNodeIds.clear();
      state.selectedEdgeId = null;

      renderAll();
      persistToLocalStorage();
      updateHistoryButtons();
      showToast('1つ前の状態に戻しました');
    }

    function redo() {
      if (state.editingNodeId || history.future.length === 0) return;
      const currentSnapshot = createSnapshot();
      const nextSnapshot = history.future.pop();
      history.past.push(currentSnapshot);

      const restored = JSON.parse(nextSnapshot);
      state.nodes = restored.nodes;
      state.edges = restored.edges;
      state.selectedNodeId = null;
      state.selectedNodeIds.clear();
      state.selectedEdgeId = null;

      renderAll();
      persistToLocalStorage();
      updateHistoryButtons();
      showToast('操作をやり直しました');
    }

    // DOM参照
    const viewportEl = document.getElementById('canvas-viewport');
    const worldEl = document.getElementById('canvas-world');
    const nodesContainer = document.getElementById('nodes-container');
    const edgesContainer = document.getElementById('edges-container');
    const tempEdgePath = document.getElementById('temp-edge-path');
    const zoomLabel = document.getElementById('zoom-level-label');
    const propertyBar = document.getElementById('property-bar');
    const nodeProps = document.getElementById('node-props');
    const edgeProps = document.getElementById('edge-props');
    const minimapCanvas = document.getElementById('minimap-canvas');
    const minimapCtx = minimapCanvas.getContext('2d');
    const nodeCountLabel = document.getElementById('node-count-label');
    const fileStatusLabel = document.getElementById('file-status-label');
    const btnGroupNodes = document.getElementById('btn-group-nodes');
    const btnUngroupNodes = document.getElementById('btn-ungroup-nodes');
    const selectionMarquee = document.getElementById('selection-marquee');

    // インタラクション状態
    let interaction = {
      mode: 'none',
      startX: 0,
      startY: 0,
      origX: 0,
      origY: 0,
      origW: 0,
      origH: 0,
      targetNodeId: null,
      sourceAnchor: null,
      beforeSnapshot: null
    };

    // 初期サンプルデータ
    function getSampleData() {
      return {
        viewport: { x: 80, y: 80, zoom: 0.92 },
        nodes: [
          {
            id: 'node_1',
            type: 'roundRect',
            x: 360,
            y: 40,
            width: 240,
            height: 92,
            text: '新規Webサービス開発プロジェクト\n全体構成＆タスク俯瞰図',
            fill: '#eff6ff',
            stroke: '#2563eb'
          },
          {
            id: 'node_2',
            type: 'rect',
            x: 60,
            y: 220,
            width: 220,
            height: 110,
            text: '1. 要件定義・UI設計\n画面ワイヤーフレーム作成\nhttps://example.com/design-spec',
            fill: '#ffffff',
            stroke: '#64748b'
          },
          {
            id: 'node_3',
            type: 'rect',
            x: 370,
            y: 220,
            width: 220,
            height: 110,
            text: '2. フロントエンド実装\nオフライン対応＆ローカル保存\nhttps://github.com/example/app',
            fill: '#f0fdf4',
            stroke: '#059669'
          },
          {
            id: 'node_4',
            type: 'diamond',
            x: 690,
            y: 215,
            width: 200,
            height: 120,
            text: 'セキュリティ\nレビュー完了？',
            fill: '#fef9c3',
            stroke: '#d97706'
          },
          {
            id: 'node_5',
            type: 'sticky',
            x: 60,
            y: 410,
            width: 220,
            height: 105,
            text: '【メモ】共有ルール\nJSONファイルを共有フォルダへ格納してメンバーに展開する',
            fill: '#fef9c3',
            stroke: '#eab308'
          },
          {
            id: 'node_6',
            type: 'ellipse',
            x: 380,
            y: 415,
            width: 200,
            height: 95,
            text: '本番リリース\nマニュアル公開\nhttps://example.com/docs',
            fill: '#f3e8ff',
            stroke: '#7c3aed'
          },
          {
            id: 'node_7',
            type: 'text',
            x: 680,
            y: 425,
            width: 230,
            height: 75,
            text: '※図形をドラッグすると線も追随します。\n右上の検索窓からキーワード移動できます。',
            fill: 'transparent',
            stroke: 'transparent'
          }
        ],
        edges: [
          { id: 'edge_1', source: 'node_1', sourceAnchor: 'bottom', target: 'node_2', targetAnchor: 'top', style: 'bezier', color: '#2563eb', arrow: true },
          { id: 'edge_2', source: 'node_1', sourceAnchor: 'bottom', target: 'node_3', targetAnchor: 'top', style: 'bezier', color: '#059669', arrow: true },
          { id: 'edge_3', source: 'node_1', sourceAnchor: 'bottom', target: 'node_4', targetAnchor: 'top', style: 'bezier', color: '#d97706', arrow: true },
          { id: 'edge_4', source: 'node_2', sourceAnchor: 'bottom', target: 'node_5', targetAnchor: 'top', style: 'straight', color: '#7c3aed', arrow: true },
          { id: 'edge_5', source: 'node_3', sourceAnchor: 'bottom', target: 'node_6', targetAnchor: 'top', style: 'bezier', color: '#0891b2', arrow: true },
          { id: 'edge_6', source: 'node_4', sourceAnchor: 'bottom', target: 'node_6', targetAnchor: 'right', style: 'bezier', color: '#e11d48', arrow: true }
        ]
      };
    }

    // トースト通知表示
    let toastTimer = null;
    function showToast(message) {
      const toast = document.getElementById('toast-box');
      toast.textContent = message;
      toast.classList.add('visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('visible');
      }, 2400);
    }

    // ===== IndexedDB ストレージ管理（大容量対応＆LocalStorage自動フォールバック） =====
    const DB_NAME = 'CanvasFlowDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'diagramStore';
    const RECORD_KEY = 'current_diagram';

    let dbInstance = null;

    function openDatabase() {
      if (dbInstance) return Promise.resolve(dbInstance);
      return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
          return reject(new Error('IndexedDB not supported'));
        }
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          };
          req.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
          };
          req.onerror = () => {
            reject(req.error || new Error('Failed to open IndexedDB'));
          };
        } catch (err) {
          reject(err);
        }
      });
    }

    async function saveToStorageData(payload) {
      try {
        const db = await openDatabase();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(payload, RECORD_KEY);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
          return true;
        } catch (e) {
          console.error('Storage save failed:', e);
          return false;
        }
      }
    }

    async function loadFromStorageData() {
      try {
        const db = await openDatabase();
        const data = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(RECORD_KEY);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        if (data && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
          return data;
        }
      } catch (err) { }

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
            saveToStorageData(parsed).catch(() => { });
            return parsed;
          }
        }
      } catch (e) {
        console.error('LocalStorage fallback read failed:', e);
      }
      return null;
    }

    function persistToLocalStorage() {
      const payload = {
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        updatedAt: new Date().toISOString()
      };

      saveToStorageData(payload).then((success) => {
        if (success) {
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          fileStatusLabel.textContent = `ローカル自動保存 (${timeStr})`;
        }
      }).catch(() => { });
    }

    async function loadFromLocalStorage() {
      const data = await loadFromStorageData();
      if (data) {
        state.nodes = data.nodes;
        state.edges = data.edges;
        if (data.viewport) {
          state.viewport = data.viewport;
        }
        return true;
      }
      return false;
    }
