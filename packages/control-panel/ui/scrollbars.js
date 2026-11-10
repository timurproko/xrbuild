// One per-document overlay layer. Native overflow remains the scroll engine; no content wrappers.
const mounted = new WeakMap();
let sequence = 0;
export function installOverlayScrollbars(doc = document) {
  if (mounted.has(doc)) return mounted.get(doc);
  const win = doc.defaultView;
  if (!win?.ResizeObserver || !win.MutationObserver || !win.matchMedia || !doc.body) return () => {};
  const regions = new Map(), layers = new Map(), generatedIds = new Map();
  const events = new win.AbortController(), {signal} = events;
  const forced = win.matchMedia('(forced-colors: active)');
  let frame = 0, dirty = true, stopped = false;
  const own = node => node?.nodeType === 1 && (node.matches('.xrb-scrollbar-layer') || node.closest('.xrb-scrollbar-layer'));
  const schedule = (scan = false) => {
    if (stopped) return;
    dirty ||= scan;
    if (!frame) frame = win.requestAnimationFrame(update);
  };
  const resize = new win.ResizeObserver(() => schedule(true));
  resize.observe(doc.documentElement);resize.observe(doc.body);
  const mutations = new win.MutationObserver(records => {
    if (records.some(record => !own(record.target) && (record.type === 'attributes'
      || [...record.addedNodes, ...record.removedNodes].some(node => !own(node))))) schedule(true);
  });
  mutations.observe(doc.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['class','style','hidden','open']});
  const setStyle = (element, key, value) => {if (element.style[key] !== value) element.style[key] = value;};
  const idFor = element => {
    if (element.id) return element.id;
    const id = `xrb-scroll-region-${++sequence}`;element.id = id;generatedIds.set(element, id);return id;
  };
  const layerFor = host => {
    let layer = layers.get(host);
    if (!layer) {
      layer = doc.createElement('div');layer.className = 'xrb-scrollbar-layer';
      // A manual popover stays above menus/dialogs without taking part in document layout.
      if (typeof layer.showPopover === 'function') layer.setAttribute('popover','manual');
      host.append(layer);layers.set(host,layer);
      if (typeof layer.showPopover === 'function') {
        try { layer.showPopover(); } catch { layer.removeAttribute('popover'); }
      }
    }
    return layer;
  };
  function barFor(element, axis) {
    const listeners = new win.AbortController(), signal = listeners.signal;
    const bar = doc.createElement('div'), thumb = doc.createElement('span');
    bar.className = `xrb-scrollbar xrb-scrollbar-${axis}`;thumb.className = 'xrb-scrollbar-thumb';bar.append(thumb);
    bar.tabIndex = 0;bar.role = 'scrollbar';bar.setAttribute('aria-orientation',axis === 'y' ? 'vertical' : 'horizontal');
    bar.setAttribute('aria-controls',idFor(element));bar.setAttribute('aria-valuemin','0');
    const isPage = element === doc.scrollingElement;
    bar.setAttribute('aria-label',`${axis === 'y' ? 'Vertical' : 'Horizontal'} scroll ${isPage ? 'page' : element.getAttribute('aria-label') || 'region'}`);
    const state = {bar,thumb,element,axis,max:0,length:0,size:0,position:0,rtl:false,drag:null,dispose:()=>{listeners.abort();bar.remove();}};
    const scroll = position => {
      const value = Math.max(0,Math.min(state.max,position));
      state.position = value;
      if (axis === 'y') element.scrollTop = value;
      else element.scrollLeft = state.rtl ? value - state.max : value;
      schedule();
    };
    bar.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !state.max) return;
      event.preventDefault();event.stopPropagation();bar.focus({preventScroll:true});
      const rect = bar.getBoundingClientRect(),at = axis === 'y' ? event.clientY - rect.top : event.clientX - rect.left;
      if (event.target !== thumb) scroll((at - state.size / 2) / Math.max(1,state.length - state.size) * state.max);
      state.drag = {pointer:event.pointerId,at:axis === 'y' ? event.clientY : event.clientX,position:axis === 'y' ? element.scrollTop : state.rtl ? state.max + element.scrollLeft : element.scrollLeft};
      bar.setPointerCapture(event.pointerId);bar.dataset.dragging = '';
    },{signal});
    bar.addEventListener('pointermove',event => {
      if (!state.drag) return;
      const at = axis === 'y' ? event.clientY : event.clientX;
      scroll(state.drag.position + (at - state.drag.at) / Math.max(1,state.length - state.size) * state.max);
    },{signal});
    const stopDrag = () => {state.drag = null;delete bar.dataset.dragging;};
    bar.addEventListener('pointerup',stopDrag,{signal});bar.addEventListener('pointercancel',stopDrag,{signal});bar.addEventListener('lostpointercapture',stopDrag,{signal});
    bar.addEventListener('click',event=>event.stopPropagation(),{signal});
    bar.addEventListener('wheel',event=>{
      const delta = axis === 'y' ? event.deltaY : event.deltaX || event.deltaY;
      if (!delta) return;
      event.preventDefault();event.stopPropagation();
      scroll(state.position + delta * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? state.length : 1));
    },{signal,passive:false});
    bar.addEventListener('keydown',event=>{
      const page = axis === 'y' ? element.clientHeight : element.clientWidth;
      const steps = {ArrowDown:40,ArrowRight:40,ArrowUp:-40,ArrowLeft:-40,PageDown:page * .9,PageUp:-page * .9,Home:-state.max,End:state.max};
      if (!(event.key in steps)) return;
      event.preventDefault();event.stopPropagation();scroll(state.position + steps[event.key]);
    },{signal});
    return state;
  }
  function scan() {
    const candidates = new Set([doc.scrollingElement]);
    for (const element of doc.body.querySelectorAll('*')) {
      if (own(element) || element.matches('iframe,canvas,svg,option') || element.closest('[data-xrb-scrollbar="none"]')) continue;
      const style = win.getComputedStyle(element);
      if (/(auto|scroll|overlay)/.test(`${style.overflowX} ${style.overflowY}`)) candidates.add(element);
    }
    for (const [element, bars] of regions) if (!candidates.has(element) || !element.isConnected) {
      bars.forEach(state=>state.dispose());regions.delete(element);resize.unobserve(element);
      if (generatedIds.has(element)) {if (element.id === generatedIds.get(element)) element.removeAttribute('id');generatedIds.delete(element);}
    }
    for (const element of candidates) if (element && !regions.has(element)) {regions.set(element,[]);resize.observe(element);}
  }
  function viewport(element, isPage) {
    const box = isPage ? {left:0,top:0,right:win.innerWidth,bottom:win.innerHeight} : element.getBoundingClientRect();
    const result = {left:box.left,top:box.top,right:box.right,bottom:box.bottom};
    if (!isPage) {
      result.left += element.clientLeft;result.top += element.clientTop;
      result.right = result.left + element.clientWidth;result.bottom = result.top + element.clientHeight;
      for (let parent = element.parentElement; parent && parent !== doc.body; parent = parent.parentElement) {
        const style = win.getComputedStyle(parent),clip = parent.getBoundingClientRect();
        if (style.overflowX !== 'visible') {result.left = Math.max(result.left,clip.left);result.right = Math.min(result.right,clip.right);}
        if (style.overflowY !== 'visible') {result.top = Math.max(result.top,clip.top);result.bottom = Math.min(result.bottom,clip.bottom);}
      }
    }
    result.left = Math.max(0,result.left);result.top = Math.max(0,result.top);
    result.right = Math.min(win.innerWidth,result.right);result.bottom = Math.min(win.innerHeight,result.bottom);
    return result;
  }
  function update() {
    frame = 0;if (stopped) return;
    doc.documentElement.classList.toggle('xrb-overlay-scrollbars',!forced.matches);
    if (dirty) {dirty = false;scan();}
    const modal = [...doc.querySelectorAll('dialog:modal')].at(-1);
    const tokens = win.getComputedStyle(doc.documentElement);
    const thickness = parseFloat(tokens.getPropertyValue('--xrb-scrollbar-size')) || 10;
    const inset = parseFloat(tokens.getPropertyValue('--xrb-scrollbar-inset')) || 2;
    const minimum = parseFloat(tokens.getPropertyValue('--xrb-scrollbar-min')) || 24;
    for (const [element,bars] of regions) {
      const isPage = element === doc.scrollingElement,style = win.getComputedStyle(element),box = viewport(element,isPage);
      const hidden = forced.matches || !element.isConnected || element.closest('[hidden]') || (modal && !modal.contains(element)) || box.right <= box.left || box.bottom <= box.top;
      const axes = {y:!hidden && (isPage || /auto|scroll|overlay/.test(style.overflowY)) && !/hidden|clip/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1,
        x:!hidden && (isPage || /auto|scroll|overlay/.test(style.overflowX)) && !/hidden|clip/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1};
      for (const axis of ['y','x']) {
        let state = bars.find(item=>item.axis === axis);
        if (!axes[axis]) {if (state) state.bar.hidden = true;continue;}
        if (!state) {state = barFor(element,axis);bars.push(state);}
        const host = element.closest('dialog[open]') ?? doc.body,layer = layerFor(host);
        if (state.bar.parentElement !== layer) layer.append(state.bar);
        const vertical = axis === 'y',view = vertical ? element.clientHeight : element.clientWidth,total = vertical ? element.scrollHeight : element.scrollWidth;
        state.max = Math.max(0,total - view);state.rtl = !vertical && style.direction === 'rtl';
        state.position = vertical ? element.scrollTop : state.rtl ? state.max + element.scrollLeft : element.scrollLeft;
        state.length = Math.max(0,(vertical ? box.bottom - box.top : box.right - box.left) - 2 * inset - (axes[vertical ? 'x':'y'] ? thickness : 0));
        state.size = Math.min(state.length,Math.max(minimum,state.length * view / total));
        const offset = Math.max(0,Math.min(1,state.position / (state.max || 1))) * (state.length - state.size);
        state.bar.hidden = state.length <= 0;
        state.bar.setAttribute('aria-valuemax',String(Math.round(state.max)));state.bar.setAttribute('aria-valuenow',String(Math.round(state.position)));
        setStyle(state.bar,'left',`${vertical ? box.right - thickness - inset : box.left + inset}px`);setStyle(state.bar,'top',`${vertical ? box.top + inset : box.bottom - thickness - inset}px`);
        setStyle(state.bar,vertical ? 'height':'width',`${state.length}px`);
        setStyle(state.thumb,vertical ? 'height':'width',`${state.size}px`);
        setStyle(state.thumb,'transform',`translate${vertical ? 'Y':'X'}(${offset}px)`);
      }
    }
    for (const [host,layer] of layers) if (!host.isConnected || !layer.querySelector('.xrb-scrollbar:not([hidden])')) {layer.remove();layers.delete(host);}
  }
  doc.addEventListener('scroll',()=>schedule(),{capture:true,passive:true,signal});
  doc.addEventListener('load',()=>schedule(true),{capture:true,signal});
  win.addEventListener('resize',()=>schedule(true),{passive:true,signal});
  forced.addEventListener('change',()=>schedule(true),{signal});
  doc.fonts?.ready.then(()=>schedule(true));
  const dispose = () => {
    stopped = true;win.cancelAnimationFrame(frame);events.abort();resize.disconnect();mutations.disconnect();
    for (const bars of regions.values()) bars.forEach(state=>state.dispose());
    for (const layer of layers.values()) layer.remove();
    for (const [element,id] of generatedIds) if (element.id === id) element.removeAttribute('id');
    doc.documentElement.classList.remove('xrb-overlay-scrollbars');mounted.delete(doc);
  };
  mounted.set(doc,dispose);schedule(true);return dispose;
}

// Importing the shared browser primitives opts the document in once; Node-only consumers stay inert.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const start = () => installOverlayScrollbars(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
}
