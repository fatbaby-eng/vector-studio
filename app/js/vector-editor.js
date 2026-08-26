/* Vector Studio - vector-editor.js (reconstructed) */
const Utils = {
  uid: () => Math.random().toString(36).substr(2, 9),
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  degToRad: d => d * Math.PI / 180,
  radToDeg: r => r * 180 / Math.PI,
  hexToHsl: hex => {
    let r = 0, g = 0, b = 0;
    if (!hex || hex[0] !== '#') return [0, 0, 0];
    if (hex.length === 4) { r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16); }
    else { r = parseInt(hex.substr(1, 2), 16); g = parseInt(hex.substr(3, 2), 16); b = parseInt(hex.substr(5, 2), 16); }
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min; s = l > .5 ? d / (2 - max - min) : d / (max + min);
      switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; }
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  },
  hslToHex: (h, s, l) => {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = c => { const hex = Math.round(c * 255).toString(16); return hex.length === 1 ? '0' + hex : hex; };
    return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
  },
  getMousePos: (canvas, e) => { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; },
  dist: (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2),
  transformPoint: (pt, m) => ({ x: m[0] * pt.x + m[2] * pt.y + m[4], y: m[1] * pt.x + m[3] * pt.y + m[5] }),
  getObjectBounds: obj => {
    if (obj.type === 'path' && obj.points) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      obj.points.forEach(p => { 
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); 
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); 
        if (p.handleIn) {
          minX = Math.min(minX, p.x + p.handleIn.x); minY = Math.min(minY, p.y + p.handleIn.y);
          maxX = Math.max(maxX, p.x + p.handleIn.x); maxY = Math.max(maxY, p.y + p.handleIn.y);
        }
        if (p.handleOut) {
          minX = Math.min(minX, p.x + p.handleOut.x); minY = Math.min(minY, p.y + p.handleOut.y);
          maxX = Math.max(maxX, p.x + p.handleOut.x); maxY = Math.max(maxY, p.y + p.handleOut.y);
        }
      });
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    if (obj.type === 'line' && obj.x1 !== undefined) {
      const minX = Math.min(obj.x1, obj.x2), minY = Math.min(obj.y1, obj.y2), maxX = Math.max(obj.x1, obj.x2), maxY = Math.max(obj.y1, obj.y2);
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    if (obj.type === 'polygon' && obj.points) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      obj.points.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    if (obj.type === 'group' && obj.children) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      obj.children.forEach(c => {
        const b = Utils.getObjectBounds(c);
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
      });
      if (minX === Infinity) return { x: obj.x || 0, y: obj.y || 0, width: 0, height: 0 };
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    return { x: obj.x, y: obj.y, width: obj.width || 0, height: obj.height || 0 };
  }
};

/* ============================== App ============================== */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('main-canvas');
  let ctx = canvas.getContext('2d'); // reassignable so PNG export can draw offscreen
  const wrapper = document.querySelector('.canvas-wrapper');

  const state = {
    tool: 'select',
    layers: [],
    activeLayerId: null,
    selection: [],
    zoom: 1, panX: 0, panY: 0,
    artboard: { x: 0, y: 0, width: 800, height: 600 },
    showGrid: false,
    undoStack: [], redoStack: [],
    clipboard: null,
    defaults: {
      fill: '#000000', stroke: 'none', strokeWidth: 1,
      strokeJoin: 'miter', strokeCap: 'butt', strokeDash: '',
      fontFamily: 'DM Sans', fontSize: 24, fontWeight: 'normal'
    },
    docBg: '#ffffff',
    shapeCount: 0
  };

  let drag = null;          // active pointer interaction
  let penPoints = null;     // in-progress pen path
  let penMouse = null;      // current mouse for pen preview
  let spaceDown = false;

  /* ---------- helpers ---------- */
  const activeLayer = () => state.layers.find(l => l.id === state.activeLayerId);
  const w2s = p => ({ x: p.x * state.zoom + state.panX, y: p.y * state.zoom + state.panY });
  const s2w = p => ({ x: (p.x - state.panX) / state.zoom, y: (p.y - state.panY) / state.zoom });

  function makeLayer(name) {
    return { id: Utils.uid(), name: name || `Layer ${state.layers.length + 1}`, visible: true, locked: false, objects: [] };
  }

  function snapshot() {
    state.undoStack.push(JSON.stringify({ layers: state.layers, artboard: state.artboard }));
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack = [];
  }
  function restore(json) {
    const d = JSON.parse(json);
    state.layers = d.layers; state.artboard = d.artboard;
    state.selection = [];
    if (!state.layers.find(l => l.id === state.activeLayerId))
      state.activeLayerId = state.layers.length ? state.layers[0].id : null;
    renderLayersPanel(); updatePanels(); render();
  }
  function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(JSON.stringify({ layers: state.layers, artboard: state.artboard }));
    restore(state.undoStack.pop());
  }
  function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(JSON.stringify({ layers: state.layers, artboard: state.artboard }));
    restore(state.redoStack.pop());
  }

  function baseObject(type) {
    const d = state.defaults;
    return {
      id: Utils.uid(), type, name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${++state.shapeCount}`,
      rotation: 0, opacity: 100, visible: true,
      fill: d.fill, stroke: d.stroke, strokeWidth: d.strokeWidth,
      strokeJoin: d.strokeJoin, strokeCap: d.strokeCap, strokeDash: d.strokeDash
    };
  }

  /* ---------- canvas sizing / view ---------- */
  function resizeCanvas() {
    const w = wrapper.clientWidth, h = wrapper.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.position = 'absolute';
    canvas.style.left = '0'; canvas.style.top = '0';
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.style.background = 'transparent';
    canvas.style.boxShadow = 'none';
  }

  function fitCanvas() {
    resizeCanvas();
    const m = 60;
    const z = Math.min((canvas.width - m * 2) / state.artboard.width, (canvas.height - m * 2) / state.artboard.height);
    state.zoom = Math.max(0.02, z);
    state.panX = (canvas.width - state.artboard.width * state.zoom) / 2 - state.artboard.x * state.zoom;
    state.panY = (canvas.height - state.artboard.height * state.zoom) / 2 - state.artboard.y * state.zoom;
    render();
  }
  function zoomAt(screenPt, factor) {
    const w = s2w(screenPt);
    state.zoom = Utils.clamp(state.zoom * factor, 0.02, 64);
    state.panX = screenPt.x - w.x * state.zoom;
    state.panY = screenPt.y - w.y * state.zoom;
    render();
  }

  /* ---------- rendering ---------- */
  function applyStyle(o) {
    ctx.lineJoin = o.strokeJoin || 'miter';
    ctx.lineCap = o.strokeCap || 'butt';
    ctx.lineWidth = o.strokeWidth || 1;
    if (o.strokeDash) {
      const dash = o.strokeDash.split(/[,\s]+/).map(Number).filter(n => n > 0);
      ctx.setLineDash(dash);
    } else ctx.setLineDash([]);
  }
  function fillStroke(o) {
    if (o.fill && o.fill !== 'none') { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke && o.stroke !== 'none' && (o.strokeWidth || 1) > 0) { ctx.strokeStyle = o.stroke; ctx.stroke(); }
  }

  function drawObject(o) {
    if (o.visible === false) return;
    ctx.save();
    ctx.globalAlpha = (o.opacity == null ? 100 : o.opacity) / 100;
    const b = Utils.getObjectBounds(o);
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    if (o.rotation) { ctx.translate(cx, cy); ctx.rotate(Utils.degToRad(o.rotation)); ctx.translate(-cx, -cy); }
    applyStyle(o);
    switch (o.type) {
      case 'rect':
        ctx.beginPath(); ctx.rect(o.x, o.y, o.width, o.height); fillStroke(o); break;
      case 'ellipse':
        ctx.beginPath(); ctx.ellipse(o.x + o.width / 2, o.y + o.height / 2, Math.abs(o.width / 2), Math.abs(o.height / 2), 0, 0, Math.PI * 2); fillStroke(o); break;
      case 'polygon':
      case 'path':
        if (o.points && o.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(o.points[0].x, o.points[0].y);
          for (let i = 1; i < o.points.length; i++) {
            const p1 = o.points[i - 1], p2 = o.points[i];
            if (p1.handleOut || p2.handleIn) {
              const cp1x = p1.x + (p1.handleOut ? p1.handleOut.x : 0);
              const cp1y = p1.y + (p1.handleOut ? p1.handleOut.y : 0);
              const cp2x = p2.x + (p2.handleIn ? p2.handleIn.x : 0);
              const cp2y = p2.y + (p2.handleIn ? p2.handleIn.y : 0);
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            } else {
              ctx.lineTo(p2.x, p2.y);
            }
          }
          if (o.closed && o.points.length > 1) {
            const p1 = o.points[o.points.length - 1], p2 = o.points[0];
            if (p1.handleOut || p2.handleIn) {
              const cp1x = p1.x + (p1.handleOut ? p1.handleOut.x : 0);
              const cp1y = p1.y + (p1.handleOut ? p1.handleOut.y : 0);
              const cp2x = p2.x + (p2.handleIn ? p2.handleIn.x : 0);
              const cp2y = p2.y + (p2.handleIn ? p2.handleIn.y : 0);
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            } else {
              ctx.lineTo(p2.x, p2.y);
            }
            ctx.closePath();
          }
          fillStroke(o);
        }
        break;
      case 'line':
        ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2);
        if (o.stroke && o.stroke !== 'none') { ctx.strokeStyle = o.stroke; ctx.stroke(); }
        else { ctx.strokeStyle = o.fill && o.fill !== 'none' ? o.fill : '#000'; ctx.stroke(); }
        break;
      case 'text': {
        const weight = o.fontWeight || 'normal', size = o.fontSize || 24, fam = o.fontFamily || 'DM Sans';
        ctx.font = `${weight} ${size}px ${fam}`;
        ctx.textBaseline = 'alphabetic';
        if (o.fill && o.fill !== 'none') { ctx.fillStyle = o.fill; ctx.fillText(o.text || '', o.x, o.y); }
        if (o.stroke && o.stroke !== 'none') { ctx.strokeStyle = o.stroke; ctx.strokeText(o.text || '', o.x, o.y); }
        break;
      }
      case 'group':
        (o.children || []).forEach(drawObject);
        break;
    }
    ctx.restore();
  }

  function render() {
    resizeCanvas();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const a = state.artboard;
    const tl = w2s({ x: a.x, y: a.y });
    const aw = a.width * state.zoom, ah = a.height * state.zoom;

    // artboard shadow + paper
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 20;
    ctx.fillStyle = state.docBg || '#ffffff';
    ctx.fillRect(tl.x, tl.y, aw, ah);
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(tl.x, tl.y, aw, ah); ctx.clip();

    if (state.showGrid) {
      const step = Math.max(20 * state.zoom, 8);
      ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = tl.x; x <= tl.x + aw; x += step) { ctx.moveTo(x, tl.y); ctx.lineTo(x, tl.y + ah); }
      for (let y = tl.y; y <= tl.y + ah; y += step) { ctx.moveTo(tl.x, y); ctx.lineTo(tl.x + aw, y); }
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
    state.layers.forEach(l => { if (l.visible) l.objects.forEach(drawObject); });
    // pen in-progress
    if (penPoints && penPoints.length) {
      ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1.5 / state.zoom; ctx.setLineDash([4 / state.zoom, 4 / state.zoom]);
      ctx.beginPath();
      ctx.moveTo(penPoints[0].x, penPoints[0].y);
      for (let i = 1; i < penPoints.length; i++) ctx.lineTo(penPoints[i].x, penPoints[i].y);
      if (penMouse) ctx.lineTo(penMouse.x, penMouse.y);
      ctx.stroke(); ctx.setLineDash([]);
      penPoints.forEach(p => {
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(p.x - 3 / state.zoom, p.y - 3 / state.zoom, 6 / state.zoom, 6 / state.zoom);
      });
    }
    ctx.restore();
    ctx.restore();

    drawSelection();
    updateStatus();
  }

  /* ---------- selection ---------- */
  function combinedBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.selection.forEach(o => {
      const b = Utils.getObjectBounds(o);
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
    });
    if (minX === Infinity) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  function handlePositions(b) {
    return {
      nw: { x: b.x, y: b.y }, n: { x: b.x + b.width / 2, y: b.y }, ne: { x: b.x + b.width, y: b.y },
      e: { x: b.x + b.width, y: b.y + b.height / 2 }, se: { x: b.x + b.width, y: b.y + b.height },
      s: { x: b.x + b.width / 2, y: b.y + b.height }, sw: { x: b.x, y: b.y + b.height },
      w: { x: b.x, y: b.y + b.height / 2 }
    };
  }

  function drawSelection() {
    if (!state.selection.length) return;
    ctx.save();
    
    if ((state.tool === 'directSelect' || state.tool === 'pen' || state.tool === 'convert') && state.selection.length === 1) {
      const o = state.selection[0];
      const pts = o.points || (o.type === 'line' ? [{x:o.x1, y:o.y1}, {x:o.x2, y:o.y2}] : []);
      pts.forEach(p => {
        const sp = w2s(p);
        
        // draw bezier handles
        ctx.strokeStyle = '#22c55e';
        ctx.fillStyle = '#fff';
        if (p.handleIn) {
          const hin = w2s({ x: p.x + p.handleIn.x, y: p.y + p.handleIn.y });
          ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(hin.x, hin.y); ctx.stroke();
          ctx.beginPath(); ctx.arc(hin.x, hin.y, 4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        }
        if (p.handleOut) {
          const hout = w2s({ x: p.x + p.handleOut.x, y: p.y + p.handleOut.y });
          ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(hout.x, hout.y); ctx.stroke();
          ctx.beginPath(); ctx.arc(hout.x, hout.y, 4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        }

        ctx.fillStyle = '#fff';
        ctx.fillRect(sp.x - 4, sp.y - 4, 8, 8);
        ctx.strokeRect(sp.x - 4, sp.y - 4, 8, 8);
      });
    } else {
      const b = combinedBounds();
      if (b) {
        const tl = w2s({ x: b.x, y: b.y });
        ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(tl.x, tl.y, b.width * state.zoom, b.height * state.zoom);
        ctx.setLineDash([]);
        const pos = handlePositions(b);
        const hs = 4;
        HANDLES.forEach(k => {
          const p = w2s(pos[k]);
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#22c55e';
          ctx.fillRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
          ctx.strokeRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
        });
      }
    }
    ctx.restore();

    if (drag && drag.mode === 'marquee' && drag.current) {
      const p1 = w2s(drag.startWorld), p2 = w2s(drag.current);
      ctx.save();
      ctx.strokeStyle = '#22c55e'; ctx.fillStyle = 'rgba(34,197,94,.1)';
      ctx.setLineDash([4, 3]);
      const rx = Math.min(p1.x, p2.x), ry = Math.min(p1.y, p2.y);
      ctx.fillRect(rx, ry, Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
      ctx.strokeRect(rx, ry, Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
      ctx.restore();
    }
  }

  function hitHandle(screenPt) {
    const b = combinedBounds();
    if (!b) return null;
    const pos = handlePositions(b);
    const tol = 7;
    for (const k of HANDLES) {
      const p = w2s(pos[k]);
      if (Math.abs(screenPt.x - p.x) <= tol && Math.abs(screenPt.y - p.y) <= tol) return k;
    }
    return null;
  }

  function pointInObject(pt, o) {
    if (o.type === 'line') {
      // distance from point to segment
      const { x1, y1, x2, y2 } = o;
      const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      let t = len2 ? ((pt.x - x1) * (x2 - x1) + (pt.y - y1) * (y2 - y1)) / len2 : 0;
      t = Utils.clamp(t, 0, 1);
      const px = x1 + t * (x2 - x1), py = y1 + t * (y2 - y1);
      return Math.hypot(pt.x - px, pt.y - py) <= Math.max(5 / state.zoom, (o.strokeWidth || 1) / 2);
    }
    const b = Utils.getObjectBounds(o);
    return pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height;
  }

  function hitTest(worldPt, deep) {
    for (let li = state.layers.length - 1; li >= 0; li--) {
      const layer = state.layers[li];
      if (!layer.visible || layer.locked) continue;
      for (let oi = layer.objects.length - 1; oi >= 0; oi--) {
        const o = layer.objects[oi];
        if (o.visible === false) continue;
        if (deep && o.type === 'group') {
          for (let ci = o.children.length - 1; ci >= 0; ci--) {
            if (pointInObject(worldPt, o.children[ci])) return { object: o.children[ci], layer, container: o };
          }
        }
        if (pointInObject(worldPt, o)) return { object: o, layer, container: null };
      }
    }
    return null;
  }

  /* ---------- transforms on objects ---------- */
  function moveObject(o, dx, dy) {
    if (o.type === 'line') { o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy; }
    else if ((o.type === 'path' || o.type === 'polygon') && o.points) o.points.forEach(p => { p.x += dx; p.y += dy; });
    else if (o.type === 'group') o.children.forEach(c => moveObject(c, dx, dy));
    else { o.x += dx; o.y += dy; }
  }

  function scaleObject(o, oldB, newB) {
    const sx = oldB.width ? newB.width / oldB.width : 1;
    const sy = oldB.height ? newB.height / oldB.height : 1;
    const map = p => ({ x: newB.x + (p.x - oldB.x) * sx, y: newB.y + (p.y - oldB.y) * sy });
    if (o.type === 'line') {
      const p1 = map({ x: o.x1, y: o.y1 }), p2 = map({ x: o.x2, y: o.y2 });
      o.x1 = p1.x; o.y1 = p1.y; o.x2 = p2.x; o.y2 = p2.y;
    } else if ((o.type === 'path' || o.type === 'polygon') && o.points) {
      o.points = o.points.map(p => {
        let mapped = map(p);
        if (p.handleIn) mapped.handleIn = { x: p.handleIn.x * sx, y: p.handleIn.y * sy };
        if (p.handleOut) mapped.handleOut = { x: p.handleOut.x * sx, y: p.handleOut.y * sy };
        return mapped;
      });
    } else if (o.type === 'group') {
      o.children.forEach(c => scaleObject(c, oldB, newB));
    } else {
      const p = map({ x: o.x, y: o.y });
      o.x = p.x; o.y = p.y;
      o.width = (o.width || 0) * sx; o.height = (o.height || 0) * sy;
      if (o.type === 'text' && o.fontSize) o.fontSize = Math.max(1, o.fontSize * sy);
    }
  }

  /* ---------- layers panel ---------- */
  function renderLayersPanel() {
    const list = $('layers-list');
    list.innerHTML = '';
    [...state.layers].reverse().forEach(layer => {
      const row = document.createElement('div');
      row.className = 'layer-item' + (layer.id === state.activeLayerId ? ' active' : '') + (layer.visible ? '' : ' hidden');
      const vis = document.createElement('span');
      vis.className = 'layer-visibility' + (layer.visible ? ' visible' : '');
      vis.textContent = layer.visible ? '●' : '○';
      vis.title = 'Toggle visibility';
      vis.onclick = e => { e.stopPropagation(); snapshot(); layer.visible = !layer.visible; renderLayersPanel(); render(); };
      const lock = document.createElement('span');
      lock.className = 'layer-lock' + (layer.locked ? ' locked' : '');
      lock.textContent = layer.locked ? '🔒' : '🔓';
      lock.title = 'Toggle lock';
      lock.onclick = e => { e.stopPropagation(); layer.locked = !layer.locked; renderLayersPanel(); };
      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = `${layer.name} (${layer.objects.length})`;
      name.ondblclick = e => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.className = 'layer-name'; input.value = layer.name;
        name.replaceWith(input); input.focus(); input.select();
        const commit = () => { layer.name = input.value.trim() || layer.name; renderLayersPanel(); };
        input.onblur = commit;
        input.onkeydown = ev => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') renderLayersPanel(); };
      };
      row.append(vis, lock, name);
      row.onclick = () => { state.activeLayerId = layer.id; renderLayersPanel(); updateStatus(); };
      list.appendChild(row);
    });
  }

  /* ---------- properties panel ---------- */
  function updatePanels() {
    const sel = state.selection;
    const first = sel[0];
    const b = combinedBounds();
    const setVal = (id, v) => { $(id).value = v == null || isNaN(v) ? '' : (typeof v === 'number' ? Math.round(v * 100) / 100 : v); };
    setVal('prop-x', b ? b.x : ''); setVal('prop-y', b ? b.y : '');
    setVal('prop-w', b ? b.width : ''); setVal('prop-h', b ? b.height : '');
    setVal('prop-rot', first ? first.rotation || 0 : '');
    setVal('prop-op', first ? (first.opacity == null ? 100 : first.opacity) : '');
    setVal('prop-stroke-w', first ? first.strokeWidth : state.defaults.strokeWidth);
    
    // Doc properties
    setVal('doc-w', state.artboard.width); setVal('doc-h', state.artboard.height);
    const docBgEl = $('doc-bg');
    if (docBgEl) {
      docBgEl.querySelector('.color-preview').style.background = state.docBg;
      docBgEl.querySelector('.color-label').textContent = state.docBg;
    }

    const fillEl = $('fill-color'), strokeEl = $('stroke-color');
    const fill = first ? first.fill : state.defaults.fill;
    const stroke = first ? first.stroke : state.defaults.stroke;
    fillEl.querySelector('.color-preview').style.background = fill === 'none' ? 'transparent' : fill;
    fillEl.querySelector('.color-label').textContent = fill || 'none';
    strokeEl.querySelector('.color-preview').style.background = stroke === 'none' ? 'transparent' : stroke;
    strokeEl.querySelector('.color-label').textContent = stroke || 'none';

    $('text-props').style.display = sel.some(o => o.type === 'text') ? '' : 'none';
    if (first && first.type === 'text') {
      $('prop-font').value = first.fontFamily || 'DM Sans';
      setVal('prop-font-size', first.fontSize || 24);
      $('prop-font-weight').value = first.fontWeight || 'normal';
    }
  }

  function bindProp(id, fn) {
    $(id).addEventListener('change', e => {
      if (!state.selection.length) { fn(e.target.value, null); render(); return; }
      snapshot();
      state.selection.forEach(o => fn(e.target.value, o));
      renderLayersPanel(); updatePanels(); render();
    });
  }

  function setupProperties() {
    bindProp('prop-rot', (v, o) => { if (o) o.rotation = parseFloat(v) || 0; });
    bindProp('prop-op', (v, o) => { if (o) o.opacity = Utils.clamp(parseFloat(v) || 0, 0, 100); });
    bindProp('prop-stroke-w', (v, o) => { if (o) o.strokeWidth = Math.max(0, parseFloat(v) || 0); else state.defaults.strokeWidth = Math.max(0, parseFloat(v) || 0); });
    bindProp('prop-join', (v, o) => { if (o) o.strokeJoin = v; else state.defaults.strokeJoin = v; });
    bindProp('prop-cap', (v, o) => { if (o) o.strokeCap = v; else state.defaults.strokeCap = v; });
    bindProp('prop-dash', (v, o) => { if (o) o.strokeDash = v; else state.defaults.strokeDash = v; });
    bindProp('prop-font', (v, o) => { if (o && o.type === 'text') o.fontFamily = v; });
    bindProp('prop-font-size', (v, o) => { if (o && o.type === 'text') { o.fontSize = Math.max(1, parseFloat(v) || 1); measureText(o); } });
    bindProp('prop-font-weight', (v, o) => { if (o && o.type === 'text') o.fontWeight = v; });

    // x/y/w/h move the combined selection
    const bindBox = (id, apply) => {
      $(id).addEventListener('change', e => {
        const b = combinedBounds(); if (!b) return;
        const v = parseFloat(e.target.value); if (isNaN(v)) return;
        snapshot();
        apply(b, v);
        renderLayersPanel(); updatePanels(); render();
      });
    };
    bindBox('prop-x', (b, v) => state.selection.forEach(o => moveObject(o, v - b.x, 0)));
    bindBox('prop-y', (b, v) => state.selection.forEach(o => moveObject(o, 0, v - b.y)));
    bindBox('prop-w', (b, v) => { if (v > 0) state.selection.forEach(o => scaleObject(o, b, { x: b.x, y: b.y, width: v, height: b.height })); });
    bindBox('prop-h', (b, v) => { if (v > 0) state.selection.forEach(o => scaleObject(o, b, { x: b.x, y: b.y, width: b.width, height: v })); });
  }

  function measureText(o) {
    ctx.font = `${o.fontWeight || 'normal'} ${o.fontSize || 24}px ${o.fontFamily || 'DM Sans'}`;
    o.width = ctx.measureText(o.text || '').width;
    o.height = (o.fontSize || 24) * 1.2;
    // store with y as top for bounds purposes
    o.yTop = o.y - (o.fontSize || 24);
  }

  /* ---------- color picker ---------- */
  const picker = { target: 'fill', h: 0, s: 0, l: 0, a: 100 };

  function openPicker(target) {
    picker.target = target;
    let cur = '#000000';
    if (target === 'doc-bg') cur = state.docBg || '#ffffff';
    else if (target === 'fill') cur = state.selection[0] ? state.selection[0].fill : state.defaults.fill;
    else cur = state.selection[0] ? state.selection[0].stroke : state.defaults.stroke;
    const hex = cur && cur !== 'none' ? cur : '#000000';
    const [h, s, l] = Utils.hexToHsl(hex);
    picker.h = h; picker.s = s; picker.l = l; picker.a = 100;
    syncPickerUI();
    $('color-picker').classList.add('active');
  }
  function pickerHex() { return Utils.hslToHex(picker.h, picker.s, picker.l); }
  function syncPickerUI() {
    $('hue-slider').value = picker.h; $('hue-val').textContent = picker.h;
    $('sat-slider').value = picker.s; $('sat-val').textContent = picker.s + '%';
    $('light-slider').value = picker.l; $('light-val').textContent = picker.l + '%';
    $('alpha-slider').value = picker.a; $('alpha-val').textContent = picker.a + '%';
    const hex = pickerHex();
    $('color-preview-large').style.background = hex;
    $('color-hex-input').value = hex;

    // Sync CMYK
    let r = parseInt(hex.substr(1,2),16)/255, g = parseInt(hex.substr(3,2),16)/255, b = parseInt(hex.substr(5,2),16)/255;
    let k = 1 - Math.max(r, g, b);
    let c = (1 - r - k) / (1 - k) || 0;
    let m = (1 - g - k) / (1 - k) || 0;
    let y = (1 - b - k) / (1 - k) || 0;
    $('cyan-slider').value = Math.round(c*100); $('cyan-val').textContent = Math.round(c*100) + '%';
    $('magenta-slider').value = Math.round(m*100); $('magenta-val').textContent = Math.round(m*100) + '%';
    $('yellow-slider').value = Math.round(y*100); $('yellow-val').textContent = Math.round(y*100) + '%';
    $('black-slider').value = Math.round(k*100); $('black-val').textContent = Math.round(k*100) + '%';

    drawWheel();
  }
  function drawWheel() {
    const wc = $('color-wheel'), wctx = wc.getContext('2d');
    const { width, height } = wc;
    // saturation (x) / lightness (y) square for current hue
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        wctx.fillStyle = Utils.hslToHex(picker.h, x / width * 100, 100 - y / height * 100);
        wctx.fillRect(x, y, 4, 4);
      }
    }
    // marker
    const mx = picker.s / 100 * width, my = (100 - picker.l) / 100 * height;
    wctx.strokeStyle = '#fff'; wctx.lineWidth = 2;
    wctx.beginPath(); wctx.arc(mx, my, 6, 0, Math.PI * 2); wctx.stroke();
    wctx.strokeStyle = '#000'; wctx.lineWidth = 1;
    wctx.beginPath(); wctx.arc(mx, my, 7, 0, Math.PI * 2); wctx.stroke();
  }
  function applyPickerColor(value) {
    if (picker.target === 'doc-bg') { state.docBg = value; updatePanels(); render(); return; }
    const apply = o => { if (picker.target === 'fill') o.fill = value; else o.stroke = value; };
    if (state.selection.length) { snapshot(); state.selection.forEach(apply); }
    else { if (picker.target === 'fill') state.defaults.fill = value; else state.defaults.stroke = value; }
    updatePanels(); render();
  }
  function setupColorPicker() {
    $('fill-color').addEventListener('click', () => openPicker('fill'));
    $('stroke-color').addEventListener('click', () => openPicker('stroke'));
    const modal = $('color-picker');
    modal.querySelector('.close-btn').onclick = () => modal.classList.remove('active');
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
    $('hue-slider').oninput = e => { picker.h = +e.target.value; syncPickerUI(); };
    $('sat-slider').oninput = e => { picker.s = +e.target.value; syncPickerUI(); };
    $('light-slider').oninput = e => { picker.l = +e.target.value; syncPickerUI(); };
    $('alpha-slider').oninput = e => { picker.a = +e.target.value; syncPickerUI(); };
    $('color-hex-input').onchange = e => {
      let v = e.target.value.trim();
      if (/^#?[0-9a-fA-F]{3}$/.test(v) || /^#?[0-9a-fA-F]{6}$/.test(v)) {
        if (v[0] !== '#') v = '#' + v;
        const [h, s, l] = Utils.hexToHsl(v);
        picker.h = h; picker.s = s; picker.l = l;
      }
      syncPickerUI();
    };

    // CMYK mode toggle
    $('picker-mode').addEventListener('click', e => {
      if (e.target.tagName !== 'BUTTON') return;
      document.querySelectorAll('#picker-mode button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const mode = e.target.getAttribute('data-mode');
      $('hsl-sliders').style.display = mode === 'hsl' ? 'block' : 'none';
      $('cmyk-sliders').style.display = mode === 'cmyk' ? 'block' : 'none';
    });

    const syncCmykToHsl = () => {
      const c = +$('cyan-slider').value / 100, m = +$('magenta-slider').value / 100, y = +$('yellow-slider').value / 100, k = +$('black-slider').value / 100;
      const r = Math.round(255 * (1 - c) * (1 - k));
      const g = Math.round(255 * (1 - m) * (1 - k));
      const b = Math.round(255 * (1 - y) * (1 - k));
      const hex = '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
      const [h, s, l] = Utils.hexToHsl(hex);
      picker.h = h; picker.s = s; picker.l = l;
      syncPickerUI();
    };
    ['cyan','magenta','yellow','black'].forEach(c => {
      $(`${c}-slider`).addEventListener('input', syncCmykToHsl);
    });

    const wc = $('color-wheel');
    const wheelPick = e => {
      const r = wc.getBoundingClientRect();
      picker.s = Utils.clamp((e.clientX - r.left) / r.width * 100, 0, 100);
      picker.l = Utils.clamp(100 - (e.clientY - r.top) / r.height * 100, 0, 100);
      syncPickerUI();
    };
    wc.addEventListener('mousedown', e => {
      wheelPick(e);
      const mv = ev => wheelPick(ev);
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    });
    modal.querySelectorAll('.swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        let bg = sw.style.background;
        const m = bg.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
        if (m) {
          const hex = '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
          const [h, s, l] = Utils.hexToHsl(hex);
          picker.h = h; picker.s = s; picker.l = l;
          if (m[4] !== undefined) picker.a = Math.round(parseFloat(m[4]) * 100);
          syncPickerUI();
        }
      });
    });
    $('color-apply').onclick = () => {
      let hex = pickerHex();
      if (picker.a < 100) {
        const r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
        applyPickerColor(`rgba(${r},${g},${b},${(picker.a / 100).toFixed(2)})`);
      } else applyPickerColor(hex);
      modal.classList.remove('active');
    };
    $('color-none').onclick = () => { applyPickerColor('none'); modal.classList.remove('active'); };
  }

  /* ---------- tools ---------- */
  const TOOL_INFO = {
    select: ['Select Tool', 'Click and drag to select and move objects'],
    directSelect: ['Direct Select', 'Click to select objects inside groups'],
    rectangle: ['Rectangle', 'Click and drag to draw a rectangle'],
    ellipse: ['Ellipse', 'Click and drag to draw an ellipse'],
    polygon: ['Polygon', 'Click and drag to draw a polygon'],
    line: ['Line', 'Click and drag to draw a line'],
    pen: ['Pen', 'Click to add points, double-click or Enter to finish, Esc to cancel'],
    pencil: ['Pencil', 'Click and drag to draw freehand'],
    text: ['Type', 'Click to place text'],
    artboard: ['Artboard', 'Click and drag to resize the artboard'],
    zoom: ['Zoom', 'Click to zoom in, Alt+Click to zoom out'],
    hand: ['Hand', 'Click and drag to pan the canvas']
  };

  function setTool(tool) {
    if (penPoints) finishPen(false);
    state.tool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    canvas.style.cursor = tool === 'hand' ? 'grab' : (tool === 'select' || tool === 'directSelect') ? 'default' : 'crosshair';
    updateStatus();
  }

  function addObject(o) {
    let layer = activeLayer();
    if (!layer) { layer = makeLayer(); state.layers.push(layer); state.activeLayerId = layer.id; }
    layer.objects.push(o);
    state.selection = [o];
    renderLayersPanel(); updatePanels(); render();
  }

  /* ---------- pointer handling ---------- */
  canvas.addEventListener('mousedown', e => {
    if (e.button === 1 || spaceDown || state.tool === 'hand') {
      drag = { mode: 'pan', start: Utils.getMousePos(canvas, e), panX: state.panX, panY: state.panY };
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    const sp = Utils.getMousePos(canvas, e);
    const wp = s2w(sp);
    const tool = state.tool;

    if (tool === 'zoom') { zoomAt(sp, e.altKey ? 1 / 1.5 : 1.5); return; }

    if (tool === 'pen') {
      if (!penPoints) {
        if (state.selection.length === 1 && (state.selection[0].type === 'path' || state.selection[0].type === 'polygon')) {
          const o = state.selection[0];
          const pts = o.points || [];
          const pIndex = pts.findIndex(p => Utils.dist(wp, p) < 5 / state.zoom);
          if (pIndex !== -1) {
            snapshot();
            o.points.splice(pIndex, 1);
            if (o.points.length < 2) deleteSelection();
            render();
            return;
          }
          let insertIdx = -1;
          for (let i = 0; i < pts.length; i++) {
            const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
            if (!o.closed && i === pts.length - 1) break;
            const len2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
            if (len2 === 0) continue;
            let t = ((wp.x - p1.x) * (p2.x - p1.x) + (wp.y - p1.y) * (p2.y - p1.y)) / len2;
            t = Utils.clamp(t, 0, 1);
            const proj = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
            if (Utils.dist(wp, proj) < 5 / state.zoom) { insertIdx = i + 1; break; }
          }
          if (insertIdx !== -1) {
            snapshot();
            o.points.splice(insertIdx, 0, wp);
            render();
            return;
          }
        }
        penPoints = [wp];
      }
      else {
        if (Utils.dist(wp, penPoints[0]) < 5 / state.zoom) {
          finishPen(true);
        } else {
          penPoints.push(wp);
        }
      }
      render(); return;
    }

    if (tool === 'text') {
      const t = prompt('Enter text:', 'Text');
      if (t != null && t !== '') {
        snapshot();
        const o = Object.assign(baseObject('text'), {
          text: t, x: wp.x, y: wp.y,
          fontFamily: state.defaults.fontFamily, fontSize: state.defaults.fontSize, fontWeight: state.defaults.fontWeight
        });
        measureText(o);
        addObject(o);
      }
      return;
    }

    if (tool === 'pencil') {
      drag = { mode: 'pencil', points: [wp] };
      return;
    }

    if (tool === 'artboard') {
      drag = { mode: 'artboard', startWorld: wp, orig: { ...state.artboard } };
      snapshot();
      return;
    }

    if (['rectangle', 'ellipse', 'polygon', 'line'].includes(tool)) {
      drag = { mode: 'draw', shape: tool, startWorld: wp, current: wp };
      snapshot();
      return;
    }

    // select / directSelect / convert
    const deep = tool === 'directSelect';
    if ((tool === 'directSelect' || tool === 'convert') && state.selection.length === 1) {
      const o = state.selection[0];
      const pts = o.points || (o.type === 'line' ? [{x:o.x1, y:o.y1}, {x:o.x2, y:o.y2}] : []);
      
      // check bezier handles
      let handleHit = null;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.handleIn && Utils.dist(wp, {x: p.x + p.handleIn.x, y: p.y + p.handleIn.y}) < 5 / state.zoom) { handleHit = { index: i, type: 'handleIn' }; break; }
        if (p.handleOut && Utils.dist(wp, {x: p.x + p.handleOut.x, y: p.y + p.handleOut.y}) < 5 / state.zoom) { handleHit = { index: i, type: 'handleOut' }; break; }
      }
      if (handleHit) {
        drag = { mode: 'edit-handle', object: o, index: handleHit.index, handle: handleHit.type, startWorld: wp, isConvert: tool === 'convert' };
        snapshot(); return;
      }
      
      const pIndex = pts.findIndex(p => Utils.dist(wp, p) < 5 / state.zoom);
      if (pIndex !== -1) {
        if (tool === 'convert') {
          const p = pts[pIndex];
          if (p.handleIn || p.handleOut) {
            snapshot(); delete p.handleIn; delete p.handleOut; render(); return;
          } else {
            drag = { mode: 'drag-bezier', object: o, index: pIndex, startWorld: wp };
            snapshot(); return;
          }
        }
        drag = { mode: 'edit-point', object: o, index: pIndex, startWorld: wp };
        snapshot();
        return;
      }
    }
    
    const handle = hitHandle(sp);
    if (handle && state.selection.length) {
      drag = { mode: 'resize', handle, origBounds: combinedBounds(), origSel: structuredClone(state.selection) };
      snapshot();
      return;
    }
    const hit = hitTest(wp, deep);
    if (hit) {
      if (e.shiftKey) {
        const i = state.selection.indexOf(hit.object);
        if (i >= 0) state.selection.splice(i, 1); else state.selection.push(hit.object);
      } else if (!state.selection.includes(hit.object)) {
        state.selection = [hit.object];
      }
      drag = { mode: 'maybe-move', startWorld: wp, moved: false };
      updatePanels(); render();
    } else {
      if (!e.shiftKey) state.selection = [];
      drag = { mode: 'marquee', startWorld: wp, current: wp };
      updatePanels(); render();
    }
  });

  canvas.addEventListener('mousemove', e => {
    const sp = Utils.getMousePos(canvas, e);
    const wp = s2w(sp);
    if (penPoints) { penMouse = wp; render(); }
    if (!drag) return;

    switch (drag.mode) {
      case 'pan':
        state.panX = drag.panX + (sp.x - drag.start.x);
        state.panY = drag.panY + (sp.y - drag.start.y);
        render(); break;
      case 'pencil':
        if (!drag.points.length || Utils.dist(drag.points[drag.points.length - 1], wp) > 2 / state.zoom) {
          drag.points.push(wp); previewPencil(drag.points);
        }
        break;
      case 'draw':
        drag.current = wp; previewShape(drag); break;
      case 'artboard': {
        const x = Math.min(drag.startWorld.x, wp.x), y = Math.min(drag.startWorld.y, wp.y);
        state.artboard = { x, y, width: Math.abs(wp.x - drag.startWorld.x), height: Math.abs(wp.y - drag.startWorld.y) };
        render(); break;
      }
      case 'maybe-move': {
        const dx = wp.x - drag.startWorld.x, dy = wp.y - drag.startWorld.y;
        if (!drag.moved && Math.hypot(dx * state.zoom, dy * state.zoom) > 3) {
          drag.moved = true; snapshot();
        }
        if (drag.moved) {
          state.selection.forEach(o => moveObject(o, dx, dy));
          drag.startWorld = wp;
          updatePanels(); render();
        }
        break;
      }
      case 'marquee':
        drag.current = wp; render(); break;
      case 'resize': {
        const b = drag.origBounds;
        const nb = { x: b.x, y: b.y, width: b.width, height: b.height };
        if (drag.handle.includes('e')) nb.width = Math.max(1, wp.x - b.x);
        if (drag.handle.includes('s')) nb.height = Math.max(1, wp.y - b.y);
        if (drag.handle.includes('w')) { nb.x = Math.min(wp.x, b.x + b.width - 1); nb.width = b.x + b.width - nb.x; }
        if (drag.handle.includes('n')) { nb.y = Math.min(wp.y, b.y + b.height - 1); nb.height = b.y + b.height - nb.y; }
        
        if (e.shiftKey || $('prop-constrain')?.checked) {
          const ratio = b.width / b.height;
          if (drag.handle.includes('e') || drag.handle.includes('w')) {
            const nh = nb.width / ratio;
            if (drag.handle.includes('n')) nb.y = b.y + b.height - nh;
            nb.height = nh;
          } else if (drag.handle.includes('n') || drag.handle.includes('s')) {
            const nw = nb.height * ratio;
            if (drag.handle.includes('w')) nb.x = b.x + b.width - nw;
            nb.width = nw;
          }
        }

        // restore originals then rescale
        drag.origSel.forEach((orig, i) => {
          const live = state.selection[i];
          copyGeometry(orig, live);
          scaleObject(live, b, nb);
        });
        updatePanels(); render();
        break;
      }
      case 'edit-point': {
        const dx = wp.x - drag.startWorld.x, dy = wp.y - drag.startWorld.y;
        if (drag.object.type === 'line') {
          if (drag.index === 0) { drag.object.x1 += dx; drag.object.y1 += dy; }
          else { drag.object.x2 += dx; drag.object.y2 += dy; }
        } else if (drag.object.points) {
          drag.object.points[drag.index].x += dx;
          drag.object.points[drag.index].y += dy;
        }
        drag.startWorld = wp;
        updatePanels(); render();
        break;
      }
      case 'drag-bezier': {
        const dx = wp.x - drag.startWorld.x, dy = wp.y - drag.startWorld.y;
        const p = drag.object.points[drag.index];
        p.handleOut = { x: dx, y: dy };
        p.handleIn = { x: -dx, y: -dy }; // symmetric
        render();
        break;
      }
      case 'edit-handle': {
        const dx = wp.x - drag.startWorld.x, dy = wp.y - drag.startWorld.y;
        const p = drag.object.points[drag.index];
        p[drag.handle].x += dx;
        p[drag.handle].y += dy;
        if (!e.altKey && !drag.isConvert) {
          // keep opposite handle symmetric
          const opp = drag.handle === 'handleIn' ? 'handleOut' : 'handleIn';
          if (p[opp]) {
            p[opp].x -= dx;
            p[opp].y -= dy;
          }
        }
        drag.startWorld = wp;
        render();
        break;
      }
    }
  });

  function copyGeometry(src, dst) {
    for (const k of ['x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'fontSize'])
      if (src[k] !== undefined) dst[k] = src[k];
    if (src.points) dst.points = src.points.map(p => ({ ...p }));
    if (src.children) src.children.forEach((c, i) => copyGeometry(c, dst.children[i]));
  }

  function previewShape(d) {
    render();
    ctx.save();
    ctx.translate(state.panX, state.panY); ctx.scale(state.zoom, state.zoom);
    const o = buildShape(d.shape, d.startWorld, d.current);
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1.5 / state.zoom; ctx.setLineDash([4 / state.zoom, 4 / state.zoom]);
    ctx.fillStyle = 'rgba(34,197,94,.08)';
    if (o.type === 'line') { ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke(); }
    else if (o.type === 'rect') { ctx.fillRect(o.x, o.y, o.width, o.height); ctx.strokeRect(o.x, o.y, o.width, o.height); }
    else if (o.type === 'ellipse') { ctx.beginPath(); ctx.ellipse(o.x + o.width / 2, o.y + o.height / 2, o.width / 2, o.height / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else if (o.type === 'polygon') { ctx.beginPath(); o.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }

  function previewPencil(points) {
    render();
    ctx.save();
    ctx.translate(state.panX, state.panY); ctx.scale(state.zoom, state.zoom);
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1.5 / state.zoom;
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
  }

  function buildShape(shape, a, b) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (shape === 'line') return { type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    if (shape === 'polygon') {
      const cx = x + w / 2, cy = y + h / 2, r = Math.max(w, h) / 2;
      const points = [];
      for (let i = 0; i < 6; i++) {
        const ang = Utils.degToRad(60 * i - 90);
        points.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
      }
      return { type: 'polygon', points, closed: true };
    }
    return { type: shape === 'rectangle' ? 'rect' : 'ellipse', x, y, width: w, height: h };
  }

  window.addEventListener('mouseup', e => {
    if (!drag) return;
    const wp = s2w(Utils.getMousePos(canvas, e));
    switch (drag.mode) {
      case 'pan': canvas.style.cursor = state.tool === 'hand' ? 'grab' : canvas.style.cursor; break;
      case 'pencil':
        if (drag.points.length > 1) {
          snapshot();
          addObject(Object.assign(baseObject('path'), { points: drag.points, closed: false }));
        }
        break;
      case 'draw': {
        const o = buildShape(drag.shape, drag.startWorld, wp);
        const tiny = o.type === 'line' ? Utils.dist({ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }) < 2 : (o.width < 2 && o.height < 2);
        if (tiny) { state.undoStack.pop(); render(); } // discard accidental click
        else addObject(Object.assign(baseObject(o.type === 'rect' ? 'rect' : o.type), o));
        break;
      }
      case 'marquee': {
        const r = {
          x: Math.min(drag.startWorld.x, wp.x), y: Math.min(drag.startWorld.y, wp.y),
          width: Math.abs(wp.x - drag.startWorld.x), height: Math.abs(wp.y - drag.startWorld.y)
        };
        const hits = [];
        state.layers.forEach(l => {
          if (!l.visible || l.locked) return;
          l.objects.forEach(o => {
            const b = Utils.getObjectBounds(o);
            if (b.x < r.x + r.width && b.x + b.width > r.x && b.y < r.y + r.height && b.y + b.height > r.y) hits.push(o);
          });
        });
        if (hits.length) state.selection = e.shiftKey ? [...new Set([...state.selection, ...hits])] : hits;
        updatePanels(); render();
        break;
      }
      case 'maybe-move':
        if (drag.moved) { renderLayersPanel(); updatePanels(); }
        break;
      case 'resize': 
      case 'edit-point':
      case 'drag-bezier':
      case 'edit-handle':
        renderLayersPanel(); updatePanels(); break;
      case 'artboard': break;
    }
    drag = null;
    updateStatus();
  });

  canvas.addEventListener('dblclick', () => { if (penPoints) finishPen(false); });

  function finishPen(close) {
    if (penPoints && penPoints.length > 1) {
      snapshot();
      addObject(Object.assign(baseObject('path'), { points: penPoints, closed: !!close }));
    }
    penPoints = null; penMouse = null;
    render();
  }

  /* ---------- wheel zoom ---------- */
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const sp = Utils.getMousePos(canvas, e);
    if (e.ctrlKey || e.metaKey) zoomAt(sp, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    else if (e.shiftKey) { state.panX -= e.deltaY; render(); }
    else { state.panX -= e.deltaX; state.panY -= e.deltaY; render(); }
  }, { passive: false });

  /* ---------- actions ---------- */
  function deleteSelection() {
    if (!state.selection.length) return;
    snapshot();
    state.layers.forEach(l => { l.objects = l.objects.filter(o => !state.selection.includes(o)); });
    state.selection = [];
    renderLayersPanel(); updatePanels(); render();
  }
  function copySelection() {
    if (state.selection.length) state.clipboard = structuredClone(state.selection);
  }
  function pasteClipboard() {
    if (!state.clipboard || !state.clipboard.length) return;
    snapshot();
    const layer = activeLayer();
    if (!layer) return;
    const copies = structuredClone(state.clipboard);
    copies.forEach(o => { o.id = Utils.uid(); moveObject(o, 10, 10); layer.objects.push(o); });
    state.selection = copies;
    renderLayersPanel(); updatePanels(); render();
  }
  function groupSelection() {
    if (state.selection.length < 2) return;
    const layer = activeLayer(); if (!layer) return;
    snapshot();
    const members = state.selection.filter(o => layer.objects.includes(o));
    if (members.length < 2) return;
    layer.objects = layer.objects.filter(o => !members.includes(o));
    const g = Object.assign(baseObject('group'), { children: members });
    layer.objects.push(g);
    state.selection = [g];
    renderLayersPanel(); updatePanels(); render();
  }
  function ungroupSelection() {
    const g = state.selection.find(o => o.type === 'group');
    if (!g) return;
    const layer = activeLayer(); if (!layer) return;
    snapshot();
    const i = layer.objects.indexOf(g);
    layer.objects.splice(i, 1, ...g.children);
    state.selection = g.children;
    renderLayersPanel(); updatePanels(); render();
  }
  function reorder(front) {
    if (!state.selection.length) return;
    const layer = activeLayer(); if (!layer) return;
    snapshot();
    if (front) {
      state.selection.forEach(o => { const i = layer.objects.indexOf(o); if (i >= 0) { layer.objects.splice(i, 1); layer.objects.push(o); } });
    } else {
      state.selection.forEach(o => { const i = layer.objects.indexOf(o); if (i >= 0) layer.objects.splice(i, 1); });
      layer.objects.unshift(...state.selection);
    }
    renderLayersPanel(); render();
  }

  /* ---------- file: save / open / export ---------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function styleAttrs(o) {
    let s = `fill="${o.fill || 'none'}" opacity="${((o.opacity == null ? 100 : o.opacity) / 100)}"`;
    if (o.stroke && o.stroke !== 'none')
      s += ` stroke="${o.stroke}" stroke-width="${o.strokeWidth || 1}" stroke-linejoin="${o.strokeJoin || 'miter'}" stroke-linecap="${o.strokeCap || 'butt'}"`;
    if (o.strokeDash) s += ` stroke-dasharray="${o.strokeDash}"`;
    if (o.rotation) {
      const b = Utils.getObjectBounds(o);
      s += ` transform="rotate(${o.rotation} ${b.x + b.width / 2} ${b.y + b.height / 2})"`;
    }
    return s;
  }
  function objectToSVG(o) {
    switch (o.type) {
      case 'rect': return `<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" ${styleAttrs(o)}/>`;
      case 'ellipse': return `<ellipse cx="${o.x + o.width / 2}" cy="${o.y + o.height / 2}" rx="${Math.abs(o.width / 2)}" ry="${Math.abs(o.height / 2)}" ${styleAttrs(o)}/>`;
      case 'line': return `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" ${styleAttrs(o)}/>`;
      case 'polygon':
      case 'path': {
        if (!o.points || !o.points.length) return '';
        let d = `M${o.points[0].x} ${o.points[0].y}`;
        for (let i = 1; i < o.points.length; i++) {
          const p1 = o.points[i - 1], p2 = o.points[i];
          if (p1.handleOut || p2.handleIn) {
            const cp1x = p1.x + (p1.handleOut ? p1.handleOut.x : 0);
            const cp1y = p1.y + (p1.handleOut ? p1.handleOut.y : 0);
            const cp2x = p2.x + (p2.handleIn ? p2.handleIn.x : 0);
            const cp2y = p2.y + (p2.handleIn ? p2.handleIn.y : 0);
            d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
          } else {
            d += ` L ${p2.x} ${p2.y}`;
          }
        }
        if (o.closed || o.type === 'polygon') {
          if (o.points.length > 1) {
            const p1 = o.points[o.points.length - 1], p2 = o.points[0];
            if (p1.handleOut || p2.handleIn) {
              const cp1x = p1.x + (p1.handleOut ? p1.handleOut.x : 0);
              const cp1y = p1.y + (p1.handleOut ? p1.handleOut.y : 0);
              const cp2x = p2.x + (p2.handleIn ? p2.handleIn.x : 0);
              const cp2y = p2.y + (p2.handleIn ? p2.handleIn.y : 0);
              d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
            }
          }
          d += ' Z';
        }
        return `<path d="${d}" ${styleAttrs(o)}/>`;
      }
      case 'text': return `<text x="${o.x}" y="${o.y}" font-family="${esc(o.fontFamily || 'DM Sans')}" font-size="${o.fontSize || 24}" font-weight="${o.fontWeight || 'normal'}" ${styleAttrs(o)}>${esc(o.text || '')}</text>`;
      case 'group': return `<g ${styleAttrs(o)}>${o.children.map(objectToSVG).join('')}</g>`;
    }
    return '';
  }
  function saveSVG() {
    const a = state.artboard;
    const body = state.layers.map(l =>
      `<g id="${esc(l.name)}"${l.visible ? '' : ' display="none"'}>${l.objects.map(objectToSVG).join('')}</g>`
    ).join('\n  ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${a.x} ${a.y} ${a.width} ${a.height}" width="${a.width}" height="${a.height}">\n  ${body}\n</svg>`;
    download(new Blob([svg], { type: 'image/svg+xml' }), 'vector-studio.svg');
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function exportPNG() {
    const a = state.artboard, scale = 2;
    const off = document.createElement('canvas');
    off.width = a.width * scale; off.height = a.height * scale;
    const octx = off.getContext('2d');
    octx.fillStyle = state.docBg || '#ffffff';
    octx.fillRect(0, 0, off.width, off.height);
    // temporarily point the shared draw helpers at the offscreen context
    const realCtx = ctx;
    ctx = octx;
    octx.save();
    octx.scale(scale, scale);
    octx.translate(-a.x, -a.y);
    state.layers.forEach(l => { if (l.visible) l.objects.forEach(drawObject); });
    octx.restore();
    ctx = realCtx;
    off.toBlob(b => download(b, 'vector-studio.png'));
  }
  
  function exportPDF() {
    if (typeof jspdf === 'undefined') { alert('jsPDF is not loaded. Please try again later.'); return; }
    const a = state.artboard;
    // We render at high res to a canvas and add to PDF. Vector PDF generation from HTML5 canvas objects is very complex, so we will use an image-based PDF.
    const off = document.createElement('canvas');
    const scale = 4;
    off.width = a.width * scale; off.height = a.height * scale;
    const octx = off.getContext('2d');
    octx.fillStyle = state.docBg || '#ffffff';
    octx.fillRect(0, 0, off.width, off.height);
    const realCtx = ctx;
    ctx = octx;
    octx.save();
    octx.scale(scale, scale);
    octx.translate(-a.x, -a.y);
    state.layers.forEach(l => { if (l.visible) l.objects.forEach(drawObject); });
    octx.restore();
    ctx = realCtx;
    
    const doc = new jspdf.jsPDF({
      orientation: a.width > a.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [a.width, a.height]
    });
    doc.addImage(off.toDataURL('image/png'), 'PNG', 0, 0, a.width, a.height);
    doc.save('vector-studio.pdf');
  }

  function exportEPS() {
    const a = state.artboard;
    let eps = '%!PS-Adobe-3.0 EPSF-3.0\n';
    eps += `%%BoundingBox: 0 0 ${a.width} ${a.height}\n`;
    eps += `%%Creator: Vector Studio\n`;
    eps += `%%EndComments\n\n`;
    // Add background
    eps += `/setrgb { setrgbcolor } def\n`;
    let bg = state.docBg || '#ffffff';
    if (bg.startsWith('#')) {
      let r = parseInt(bg.substr(1, 2), 16) / 255 || 0;
      let g = parseInt(bg.substr(3, 2), 16) / 255 || 0;
      let b = parseInt(bg.substr(5, 2), 16) / 255 || 0;
      eps += `${r} ${g} ${b} setrgb\n`;
    }
    eps += `0 0 moveto ${a.width} 0 lineto ${a.width} ${a.height} lineto 0 ${a.height} lineto closepath fill\n\n`;
    
    // Convert RGB hex to RGB fraction
    const toRGB = (hex) => {
      if (hex === 'none') return null;
      let c = hex.substring(1);
      if (c.length === 3) c = c.split('').map(x => x + x).join('');
      return `${parseInt(c.substr(0,2),16)/255 || 0} ${parseInt(c.substr(2,2),16)/255 || 0} ${parseInt(c.substr(4,2),16)/255 || 0}`;
    };

    const processObject = (o) => {
      if (o.type === 'group') {
        o.children.forEach(processObject);
        return;
      }
      eps += `gsave\n`;
      if (o.rotation) {
        const ob = Utils.getObjectBounds(o);
        eps += `${ob.x + ob.width/2} ${ob.y + ob.height/2} translate\n`;
        eps += `${-o.rotation} rotate\n`; // EPS rotation is CCW
        eps += `${-(ob.x + ob.width/2)} ${-(ob.y + ob.height/2)} translate\n`;
      }
      
      let path = '';
      if (o.type === 'rect') {
        path = `${o.x} ${o.y} moveto ${o.x+o.width} ${o.y} lineto ${o.x+o.width} ${o.y+o.height} lineto ${o.x} ${o.y+o.height} lineto closepath\n`;
      } else if (o.type === 'line') {
        path = `${o.x1} ${o.y1} moveto ${o.x2} ${o.y2} lineto\n`;
      } else if (o.type === 'polygon' || o.type === 'path') {
        if (o.points && o.points.length > 0) {
          path = `${o.points[0].x} ${o.points[0].y} moveto\n`;
          for(let i=1; i<o.points.length; i++) {
             const p1 = o.points[i-1], p2 = o.points[i];
             if (p1.handleOut || p2.handleIn) {
               const cp1x = p1.x + (p1.handleOut ? p1.handleOut.x : 0);
               const cp1y = p1.y + (p1.handleOut ? p1.handleOut.y : 0);
               const cp2x = p2.x + (p2.handleIn ? p2.handleIn.x : 0);
               const cp2y = p2.y + (p2.handleIn ? p2.handleIn.y : 0);
               path += `${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y} curveto\n`;
             } else {
               path += `${p2.x} ${p2.y} lineto\n`;
             }
          }
          if (o.closed || o.type === 'polygon') {
            if (o.points.length > 1) {
              const p1 = o.points[o.points.length-1], p2 = o.points[0];
              if (p1.handleOut || p2.handleIn) {
                 const cp1x = p1.x + (p1.handleOut ? p1.handleOut.x : 0);
                 const cp1y = p1.y + (p1.handleOut ? p1.handleOut.y : 0);
                 const cp2x = p2.x + (p2.handleIn ? p2.handleIn.x : 0);
                 const cp2y = p2.y + (p2.handleIn ? p2.handleIn.y : 0);
                 path += `${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y} curveto\n`;
              }
            }
            path += `closepath\n`;
          }
        }
      }
      eps += path;
      
      if (o.fill && o.fill !== 'none') {
        eps += `gsave ${toRGB(o.fill)} setrgb fill grestore\n`;
      }
      if (o.stroke && o.stroke !== 'none') {
        eps += `${toRGB(o.stroke)} setrgb\n`;
        eps += `${o.strokeWidth || 1} setlinewidth\n`;
        eps += `stroke\n`;
      }
      eps += `grestore\n\n`;
    };

    // EPS coordinates: origin is bottom-left, so we apply a global transform
    eps += `0 ${a.height} translate\n`;
    eps += `1 -1 scale\n\n`;

    state.layers.forEach(l => { if (l.visible) l.objects.forEach(processObject); });
    eps += `%%EOF\n`;
    download(new Blob([eps], { type: 'application/postscript' }), 'vector-studio.eps');
  }

  function openSVG(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = new DOMParser().parseFromString(reader.result, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        if (!svg) throw new Error('no svg');
        snapshot();
        state.layers = [makeLayer('Imported')];
        state.activeLayerId = state.layers[0].id;
        state.selection = [];
        const vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width
          ? svg.viewBox.baseVal
          : { x: 0, y: 0, width: parseFloat(svg.getAttribute('width')) || 800, height: parseFloat(svg.getAttribute('height')) || 600 };
        state.artboard = { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
        importChildren(svg, state.layers[0].objects);
        renderLayersPanel(); updatePanels(); fitCanvas();
      } catch (err) {
        alert('Could not open this SVG file.');
      }
    };
    reader.readAsText(file);
  }
  function importChildren(node, out) {
    const layer = state.layers[0];
    [...node.children].forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'g') { importChildren(el, out); return; }
      const o = baseObject('rect');
      const num = (attr, def = 0) => parseFloat(el.getAttribute(attr)) || def;
      const fill = el.getAttribute('fill');
      const stroke = el.getAttribute('stroke');
      if (fill) o.fill = fill;
      if (stroke) { o.stroke = stroke; o.strokeWidth = num('stroke-width', 1); }
      let ok = true;
      switch (tag) {
        case 'rect': Object.assign(o, { type: 'rect', x: num('x'), y: num('y'), width: num('width'), height: num('height') }); break;
        case 'circle': { const r = num('r'); Object.assign(o, { type: 'ellipse', x: num('cx') - r, y: num('cy') - r, width: r * 2, height: r * 2 }); break; }
        case 'ellipse': Object.assign(o, { type: 'ellipse', x: num('cx') - num('rx'), y: num('cy') - num('ry'), width: num('rx') * 2, height: num('ry') * 2 }); break;
        case 'line': Object.assign(o, { type: 'line', x1: num('x1'), y1: num('y1'), x2: num('x2'), y2: num('y2') }); break;
        case 'polygon': case 'polyline': {
          const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
          const points = [];
          for (let i = 0; i + 1 < pts.length; i += 2) points.push({ x: pts[i], y: pts[i + 1] });
          Object.assign(o, { type: tag === 'polygon' ? 'polygon' : 'path', points, closed: tag === 'polygon' });
          break;
        }
        case 'path': {
          // sample the path geometry into a polyline using the browser's SVG engine
          const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          tmp.setAttribute('d', el.getAttribute('d') || '');
          const len = tmp.getTotalLength();
          const n = Math.min(200, Math.max(8, Math.floor(len / 4)));
          const points = [];
          for (let i = 0; i <= n; i++) { const p = tmp.getPointAtLength(len * i / n); points.push({ x: p.x, y: p.y }); }
          Object.assign(o, { type: 'path', points, closed: /z\s*$/i.test(el.getAttribute('d') || '') });
          break;
        }
        case 'text':
          Object.assign(o, {
            type: 'text', text: el.textContent || '', x: num('x'), y: num('y'),
            fontFamily: el.getAttribute('font-family') || 'DM Sans',
            fontSize: num('font-size', 24),
            fontWeight: el.getAttribute('font-weight') || 'normal'
          });
          measureText(o);
          break;
        default: ok = false;
      }
      if (ok) { o.name = `${tag} ${++state.shapeCount}`; out.push(o); }
    });
  }

  /* ---------- menus ---------- */
  function setupMenus() {
    document.querySelectorAll('.menu-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const dd = $('menu-' + btn.dataset.menu);
        const was = dd.classList.contains('active');
        document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
        if (!was) dd.classList.add('active');
      });
    });
    document.addEventListener('click', () => document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active')));
    document.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => doAction(item.dataset.action));
    });
  }

  function doAction(action) {
    switch (action) {
      case 'new':
        if (confirm('Start a new document? Unsaved work will be lost.')) {
          snapshot();
          state.layers = [makeLayer('Layer 1')];
          state.activeLayerId = state.layers[0].id;
          state.selection = [];
          state.artboard = { x: 0, y: 0, width: 800, height: 600 };
          renderLayersPanel(); updatePanels(); fitCanvas();
        }
        break;
      case 'open': $('file-input').click(); break;
      case 'save': saveSVG(); break;
      case 'export': exportPNG(); break;
      case 'export-pdf': exportPDF(); break;
      case 'export-eps': exportEPS(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'cut': copySelection(); deleteSelection(); break;
      case 'copy': copySelection(); break;
      case 'paste': pasteClipboard(); break;
      case 'delete': deleteSelection(); break;
      case 'select-all': {
        state.selection = [];
        state.layers.forEach(l => { if (l.visible && !l.locked) state.selection.push(...l.objects); });
        updatePanels(); render(); break;
      }
      case 'deselect': state.selection = []; updatePanels(); render(); break;
      case 'page-setup':
        $('newdoc-w').value = state.artboard.width;
        $('newdoc-h').value = state.artboard.height;
        $('new-doc-modal').classList.add('active');
        break;
      case 'zoom-in': zoomAt({ x: canvas.width / 2, y: canvas.height / 2 }, 1.25); break;
      case 'zoom-out': zoomAt({ x: canvas.width / 2, y: canvas.height / 2 }, 1 / 1.25); break;
      case 'fit-canvas': fitCanvas(); break;
      case 'reset-zoom': {
        const a = state.artboard;
        state.zoom = 1;
        state.panX = (canvas.width - a.width) / 2 - a.x;
        state.panY = (canvas.height - a.height) / 2 - a.y;
        render(); break;
      }
      case 'toggle-grid': state.showGrid = !state.showGrid; render(); break;
      case 'toggle-rulers':
        document.querySelectorAll('.ruler').forEach(r => r.style.display = r.style.display === 'none' ? '' : 'none');
        break;
      case 'group': groupSelection(); break;
      case 'ungroup': ungroupSelection(); break;
      case 'bring-front': reorder(true); break;
      case 'send-back': reorder(false); break;
    }
  }

  /* ---------- keyboard ---------- */
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === ' ') { spaceDown = true; canvas.style.cursor = 'grab'; e.preventDefault(); return; }
    if (penPoints && (e.key === 'Enter')) { finishPen(false); return; }
    if (penPoints && e.key === 'Escape') { penPoints = null; penMouse = null; render(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod) {
      const k = e.key.toLowerCase();
      const map = { z: 'undo', x: 'cut', c: 'copy', v: 'paste', a: 'select-all', d: 'deselect', g: 'group' };
      if (k === 'z' && e.shiftKey) { doAction('redo'); e.preventDefault(); return; }
      if (k === 'y') { doAction('redo'); e.preventDefault(); return; }
      if (k === 'g' && e.shiftKey) { doAction('ungroup'); e.preventDefault(); return; }
      if (k === ']') { doAction('bring-front'); e.preventDefault(); return; }
      if (k === '[') { doAction('send-back'); e.preventDefault(); return; }
      if (k === '+' || k === '=') { doAction('zoom-in'); e.preventDefault(); return; }
      if (k === '-') { doAction('zoom-out'); e.preventDefault(); return; }
      if (k === '0') { doAction('reset-zoom'); e.preventDefault(); return; }
      if (k === "'") { doAction('toggle-grid'); e.preventDefault(); return; }
      if (map[k]) { doAction(map[k]); e.preventDefault(); return; }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); return; }
    const tools = { v: 'select', a: 'directSelect', m: 'rectangle', l: 'ellipse', p: 'pen', n: 'pencil', t: 'text', z: 'zoom', h: 'hand', '\\': 'line' };
    if (e.key === 'O' && e.shiftKey) { setTool('artboard'); return; }
    const t = tools[e.key.toLowerCase()];
    if (t) setTool(t);
  });
  window.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; setTool(state.tool); } });

  /* ---------- status ---------- */
  function updateStatus() {
    $('status-zoom').textContent = Math.round(state.zoom * 100) + '%';
    $('status-dims').textContent = `${Math.round(state.artboard.width)} x ${Math.round(state.artboard.height)} px`;
    const info = TOOL_INFO[state.tool] || TOOL_INFO.select;
    $('status-tool').textContent = info[0];
    $('status-hint').textContent = info[1];
  }

  /* ---------- init ---------- */
  function init() {
    state.layers = [makeLayer('Layer 1')];
    state.activeLayerId = state.layers[0].id;

    document.querySelectorAll('.tool-btn').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $('layer-add').onclick = () => { snapshot(); const l = makeLayer(); state.layers.push(l); state.activeLayerId = l.id; renderLayersPanel(); };
    $('layer-delete').onclick = () => {
      if (state.layers.length <= 1) { alert('Cannot delete the last layer.'); return; }
      snapshot();
      state.layers = state.layers.filter(l => l.id !== state.activeLayerId);
      state.activeLayerId = state.layers[0].id;
      state.selection = [];
      renderLayersPanel(); updatePanels(); render();
    };
    $('layer-dup').onclick = () => {
      const l = activeLayer(); if (!l) return;
      snapshot();
      const copy = structuredClone(l);
      copy.id = Utils.uid(); copy.name = l.name + ' copy';
      copy.objects.forEach(o => o.id = Utils.uid());
      state.layers.push(copy); state.activeLayerId = copy.id;
      renderLayersPanel();
    };
    $('file-input').addEventListener('change', e => {
      if (e.target.files[0]) openSVG(e.target.files[0]);
      e.target.value = '';
    });

    setupMenus();
    setupProperties();
    setupColorPicker();

    // Document properties
    $('doc-w').addEventListener('change', e => { state.artboard.width = Math.max(1, parseFloat(e.target.value) || 800); fitCanvas(); });
    $('doc-h').addEventListener('change', e => { state.artboard.height = Math.max(1, parseFloat(e.target.value) || 600); fitCanvas(); });
    $('doc-bg').addEventListener('click', () => openPicker('doc-bg'));

    // New Doc Modal
    $('newdoc-close').onclick = () => $('new-doc-modal').classList.remove('active');
    $('newdoc-cancel').onclick = () => $('new-doc-modal').classList.remove('active');
    $('newdoc-create').onclick = () => {
      const w = parseFloat($('newdoc-w').value) || 800;
      const h = parseFloat($('newdoc-h').value) || 600;
      snapshot();
      state.layers = [makeLayer('Layer 1')];
      state.activeLayerId = state.layers[0].id;
      state.selection = [];
      state.artboard = { x: 0, y: 0, width: w, height: h };
      renderLayersPanel(); updatePanels(); fitCanvas();
      $('new-doc-modal').classList.remove('active');
    };
    $('newdoc-preset').addEventListener('change', e => {
      const parts = e.target.value.split(',');
      if (parts.length >= 3) {
        let w = parseFloat(parts[1]), h = parseFloat(parts[2]);
        $('newdoc-w').value = w;
        $('newdoc-h').value = h;
      }
    });

    window.addEventListener('resize', () => { resizeCanvas(); render(); });

    setTool('select');
    renderLayersPanel();
    updatePanels();
    fitCanvas();
  }

  init();
})();
