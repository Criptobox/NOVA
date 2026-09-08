/* ============================================================
   NOVA PWA v001 — views.js
   Vistas dinámicas + datos persistentes + respuestas del agente
   ============================================================ */
'use strict';

/* ---------- Utilidades ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 });
const todayISO = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
const prioTag = p => p === 3 ? '<span class="tag red">ALTA</span>' : p === 2 ? '<span class="tag yellow">MEDIA</span>' : '<span class="tag">BAJA</span>';

/* ---------- Datos semilla ---------- */
function seedData() {
  if (!NOVA.get(NOVA.keys.TASKS, null)) {
    NOVA.set(NOVA.keys.TASKS, [
      { id: uid(), text: 'Preparar presentación de ventas', done: false, prio: 3, created: Date.now() },
      { id: uid(), text: 'Responder correos de clientes', done: false, prio: 2, created: Date.now() },
      { id: uid(), text: 'Revisar inventario semanal', done: true, prio: 1, created: Date.now() }
    ]);
  }
  if (!NOVA.get(NOVA.keys.EVENTS, null)) {
    const t = todayISO();
    NOVA.set(NOVA.keys.EVENTS, [
      { id: uid(), date: t, time: '09:00', title: 'Reunión de equipo', place: 'Google Meet' },
      { id: uid(), date: t, time: '15:00', title: 'Cliente potencial', place: 'Llamar' },
      { id: uid(), date: t, time: '17:00', title: 'Revisar inventario', place: 'Tiendamax' }
    ]);
  }
  if (!NOVA.get(NOVA.keys.MEM, null)) {
    NOVA.set(NOVA.keys.MEM, [
      { id: uid(), text: 'Prefiero reuniones cortas por la mañana', cat: 'Preferencias', created: Date.now() },
      { id: uid(), text: 'Mi negocio se llama Tiendamax', cat: 'Proyectos', created: Date.now() }
    ]);
  }
  if (!NOVA.get(NOVA.keys.ROUTINES, null)) {
    NOVA.set(NOVA.keys.ROUTINES, [
      { id: uid(), icon: '☀️', name: 'Resumen diario', desc: 'Todas las días · 8:00 AM', time: '08:00', on: true },
      { id: uid(), icon: '📊', name: 'Revisión de ventas', desc: 'Todos los días · 9:00 AM', time: '09:00', on: true },
      { id: uid(), icon: '📦', name: 'Notificación de pedidos', desc: 'Cuando llegue un nuevo pedido', time: '', on: true },
      { id: uid(), icon: '⏰', name: 'Recordatorio importante', desc: 'Lunes a viernes · 4:00 PM', time: '16:00', on: true }
    ]);
  }
  if (!NOVA.get(NOVA.keys.PRODUCTS, null)) {
    NOVA.set(NOVA.keys.PRODUCTS, [
      { id: uid(), icon: '⌚', name: 'Smart Watch Pro', sku: 'SW-001', stock: 15, price: 1899, sold: 12 },
      { id: uid(), icon: '🎧', name: 'Audífonos Bluetooth', sku: 'AB-204', stock: 3, price: 599, sold: 9 },
      { id: uid(), icon: '🔋', name: 'Power Bank 10K', sku: 'PB-330', stock: 22, price: 449, sold: 8 },
      { id: uid(), icon: '📱', name: 'Funda Premium', sku: 'FP-88', stock: 7, price: 299, sold: 7 },
      { id: uid(), icon: '🔌', name: 'Cargador Rápido', sku: 'CR-110', stock: 5, price: 349, sold: 6 },
      { id: uid(), icon: '🖥', name: 'Monitor 24" LED', sku: 'MN-024', stock: 9, price: 3299, sold: 4 },
      { id: uid(), icon: '⌨', name: 'Teclado Mecánico', sku: 'TK-777', stock: 12, price: 1199, sold: 3 }
    ]);
  }
}

/* ============================================================
   VISTA: MEMORIA
   ============================================================ */
RENDERERS.memoria = function () {
  const mem = NOVA.get(NOVA.keys.MEM, []);
  const cats = {};
  mem.forEach(m => { cats[m.cat] = (cats[m.cat] || 0) + 1; });
  const catColors = ['var(--cyan)', 'var(--violet)', 'var(--green)', 'var(--yellow)'];
  const total = mem.length || 1;
  $('#view-memoria').innerHTML = `
  <div class="viewhead"><h2>Memoria personal</h2><p>Lo que NOVA recuerda de ti. Se guarda solo en este dispositivo y puedes exportarlo o borrarlo cuando quieras.</p></div>
  <div class="grid" style="grid-template-columns:1.4fr 1fr">
    <article class="card">
      <div class="cardhead"><h3>Recuerdos guardados</h3><span class="muted">${mem.length} EN TOTAL</span></div>
      <div class="list" id="memList">
        ${mem.length ? mem.map(m => `
          <div class="row">
            <div class="thumb">◈</div>
            <div class="grow"><b>${esc(m.text)}</b><small>${esc(m.cat)} · ${new Date(m.created).toLocaleDateString('es-ES')}</small></div>
            <button class="button danger" data-delmem="${m.id}">Eliminar</button>
          </div>`).join('') : '<div class="empty"><span class="big">◈</span>Sin recuerdos aún. Dime "recuerda que…" o agrega uno aquí.</div>'}
      </div>
    </article>
    <div style="display:grid;gap:12px;align-content:start">
      <article class="card">
        <div class="cardhead"><h3>Agregar recuerdo</h3></div>
        <div class="panelbody">
          <div class="field"><label>Qué quieres que recuerde</label><textarea id="memText" rows="3" placeholder="Ej. Mi cliente favorito pide factura"></textarea></div>
          <div class="field"><label>Categoría</label>
            <select id="memCat"><option>Preferencias</option><option>Proyectos</option><option>Personas</option><option>Negocio</option><option>Otro</option></select></div>
          <button class="button green" style="width:100%" id="memAdd">◈ Guardar en la memoria</button>
        </div>
      </article>
      <article class="card">
        <div class="cardhead"><h3>Cobertura por categoría</h3></div>
        <div class="panelbody">
          ${Object.keys(cats).length ? Object.entries(cats).map(([c, n], i) => `
            <div class="metric"><span>${esc(c)}</span><b>${Math.round(n / total * 100)}%</b></div>
            <div class="bar"><i style="width:${Math.round(n / total * 100)}%;background:linear-gradient(90deg,${catColors[i % 4]},#8d65ff)"></i></div>`).join('')
          : '<div class="empty">Sin datos todavía</div>'}
        </div>
      </article>
    </div>
  </div>`;
  $('#memAdd').onclick = () => {
    const t = $('#memText').value.trim(); if (!t) return toast('Escribe algo para recordar.', 'warn');
    addMemory($('#memText').value.trim(), $('#memCat').value);
    toast('Recuerdo guardado', 'ok'); RENDERERS.memoria();
  };
  $$('#memList [data-delmem]').forEach(b => b.onclick = () => {
    NOVA.set(NOVA.keys.MEM, NOVA.get(NOVA.keys.MEM, []).filter(m => m.id !== b.dataset.delmem));
    NOVA.emit('data'); RENDERERS.memoria(); toast('Recuerdo eliminado', '', 1600);
  });
};
function addMemory(text, cat) {
  const mem = NOVA.get(NOVA.keys.MEM, []);
  mem.unshift({ id: uid(), text, cat: cat || 'Otro', created: Date.now() });
  NOVA.set(NOVA.keys.MEM, mem.slice(0, 100));
  NOVA.emit('data');
}
window.addMemoryFn = t => addMemory(t, 'Voz');

/* ============================================================
   VISTA: CALENDARIO
   ============================================================ */
let calCursor = new Date(); let selectedDay = todayISO();
RENDERERS.calendario = function () {
  renderCalGrid();
  renderCalEvents();
};
function renderCalGrid() {
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  const first = new Date(y, m, 1);
  const startOff = (first.getDay() + 6) % 7; // lunes primero
  const days = new Date(y, m + 1, 0).getDate();
  const evMap = {};
  NOVA.get(NOVA.keys.EVENTS, []).forEach(e => { evMap[e.date] = (evMap[e.date] || 0) + 1; });
  const monthName = calCursor.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  $('#calMonthTag').textContent = monthName.toUpperCase();
  let cells = '';
  for (let i = 0; i < startOff; i++) cells += '<b></b>';
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cls = [iso === todayISO() ? 'today' : '', evMap[iso] ? 'hasdot' : ''].join(' ');
    cells += `<b class="${cls}" data-day="${iso}" style="cursor:pointer">${d}</b>`;
  }
  const host = $('#miniCalendar').closest ? $('#view-calendario') : null;
  $('#view-calendario').innerHTML = `
  <div class="viewhead"><h2>Calendario</h2><p>Tus eventos y recordatorios. Toca un día para verlo o agregar algo.</p></div>
  <div class="grid" style="grid-template-columns:1.2fr 1fr">
    <article class="card">
      <div class="cardhead"><h3>${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</h3>
        <span><button class="button" id="calPrev">‹</button> <button class="button" id="calToday">Hoy</button> <button class="button" id="calNext">›</button></span></div>
      <div class="calendar">
        <div class="days"><b>L</b><b>M</b><b>X</b><b>J</b><b>V</b><b>S</b><b>D</b>${cells}</div>
      </div>
    </article>
    <article class="card">
      <div class="cardhead"><h3 id="evDayTitle">Eventos</h3><span class="muted" id="evCount"></span></div>
      <div class="panelbody" id="evList"></div>
      <div class="panelbody" style="border-top:1px solid rgba(95,168,255,.1)">
        <div class="formgrid">
          <div class="field"><label>Hora</label><input type="time" id="evTime" value="10:00"></div>
          <div class="field"><label>Lugar</label><input id="evPlace" placeholder="Opcional"></div>
        </div>
        <div class="field"><label>Evento</label><input id="evTitle" placeholder="Ej. Llamada con proveedor"></div>
        <button class="button green" style="width:100%" id="evAdd">+ Agregar al ${selectedDay === todayISO() ? 'día seleccionado' : selectedDay}</button>
      </div>
    </article>
  </div>`;
  $('#calPrev').onclick = () => { calCursor = new Date(y, m - 1, 1); renderCalGrid(); };
  $('#calNext').onclick = () => { calCursor = new Date(y, m + 1, 1); renderCalGrid(); };
  $('#calToday').onclick = () => { calCursor = new Date(); selectedDay = todayISO(); renderCalGrid(); };
  $$('#view-calendario [data-day]').forEach(b => b.onclick = () => {
    selectedDay = b.dataset.day;
    const [yy, mm] = selectedDay.split('-');
    calCursor = new Date(yy, mm - 1, 1);
    renderCalGrid();
  });
  $('#evAdd').onclick = () => {
    const title = $('#evTitle').value.trim();
    if (!title) return toast('Escribe el nombre del evento.', 'warn');
    const evs = NOVA.get(NOVA.keys.EVENTS, []);
    evs.push({ id: uid(), date: selectedDay, time: $('#evTime').value || '10:00', title, place: $('#evPlace').value.trim() });
    NOVA.set(NOVA.keys.EVENTS, evs); NOVA.emit('data');
    toast('Evento agregado', 'ok'); renderCalGrid(); renderCalEvents();
  };
}
function renderCalEvents() {
  const evs = NOVA.get(NOVA.keys.EVENTS, []).filter(e => e.date === selectedDay).sort((a, b) => a.time.localeCompare(b.time));
  const el = $('#evList'); if (!el) return;
  $('#evDayTitle').textContent = 'Eventos · ' + new Date(selectedDay + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  $('#evCount').textContent = `${evs.length} EVENTOS`;
  el.innerHTML = evs.length ? evs.map(e => `
    <div class="event" style="padding:10px">
      <b style="color:var(--cyan);font-size:11px">${e.time}</b>
      <div class="grow"><b>${esc(e.title)}</b><br><span class="muted">${esc(e.place || '')}</span></div>
      <button class="del" data-delev="${e.id}" aria-label="Eliminar">×</button>
    </div>`).join('') : '<div class="empty"><span class="big">▣</span>Sin eventos ese día.</div>';
  $$('#evList [data-delev]').forEach(b => b.onclick = () => {
    NOVA.set(NOVA.keys.EVENTS, NOVA.get(NOVA.keys.EVENTS, []).filter(e => e.id !== b.dataset.delev));
    NOVA.emit('data'); renderCalGrid(); renderCalEvents();
  });
}

/* ============================================================
   VISTA: TAREAS
   ============================================================ */
let taskFilter = 'todas';
RENDERERS.tareas = function () {
  const tasks = NOVA.get(NOVA.keys.TASKS, []);
  const pend = tasks.filter(t => !t.done).length;
  const show = tasks.filter(t => taskFilter === 'todas' ? true : taskFilter === 'pendientes' ? !t.done : t.done);
  $('#view-tareas').innerHTML = `
  <div class="viewhead"><h2>Tareas</h2><p>Gestiona tu lista. También puedes decir: “agrega tarea llamar al proveedor”.</p></div>
  <div class="grid" style="grid-template-columns:1.4fr 1fr">
    <article class="card">
      <div class="cardhead"><h3>Mis tareas</h3>
        <span>
          ${['todas', 'pendientes', 'hechas'].map(f => `<button class="button ${taskFilter === f ? 'green' : ''}" data-filter="${f}">${f}</button>`).join(' ')}
        </span></div>
      <div class="list" id="taskList">
        ${show.length ? show.map(t => `
          <div class="row">
            <button class="thumb" data-toggletask="${t.id}" style="cursor:pointer;font-size:13px" aria-label="Alternar">${t.done ? '✅' : '◻'}</button>
            <div class="grow"><b style="${t.done ? 'text-decoration:line-through;opacity:.55' : ''}">${esc(t.text)}</b>
              <small>Creada ${new Date(t.created).toLocaleDateString('es-ES')}</small></div>
            ${prioTag(t.prio)}
            <button class="button danger" data-deltask="${t.id}">×</button>
          </div>`).join('') : '<div class="empty"><span class="big">✓</span>Nada por aquí. ¡Buen trabajo!</div>'}
      </div>
    </article>
    <article class="card">
      <div class="cardhead"><h3>Nueva tarea</h3><span class="muted">${pend} PENDIENTES</span></div>
      <div class="panelbody">
        <div class="field"><label>Descripción</label><input id="taskText" placeholder="Ej. Pedir más inventario de audífonos"></div>
        <div class="field"><label>Prioridad</label><select id="taskPrio"><option value="1">Baja</option><option value="2" selected>Media</option><option value="3">Alta</option></select></div>
        <button class="button green" style="width:100%" id="taskAdd">+ Agregar tarea</button>
        <div class="metric" style="margin-top:14px"><span>Progreso del día</span><b>${tasks.length ? Math.round((tasks.length - pend) / tasks.length * 100) : 0}%</b></div>
        <div class="bar"><i style="width:${tasks.length ? Math.round((tasks.length - pend) / tasks.length * 100) : 0}%"></i></div>
      </div>
    </article>
  </div>`;
  $$('#view-tareas [data-filter]').forEach(b => b.onclick = () => { taskFilter = b.dataset.filter; RENDERERS.tareas(); });
  $('#taskAdd').onclick = () => {
    const t = $('#taskText').value.trim(); if (!t) return toast('Escribe la tarea.', 'warn');
    addTask(t, parseInt($('#taskPrio').value, 10));
    toast('Tarea agregada', 'ok'); RENDERERS.tareas();
  };
  $$('#taskList [data-toggletask]').forEach(b => b.onclick = () => {
    const ts = NOVA.get(NOVA.keys.TASKS, []);
    const t = ts.find(x => x.id === b.dataset.toggletask);
    if (t) { t.done = !t.done; NOVA.set(NOVA.keys.TASKS, ts); NOVA.emit('data'); RENDERERS.tareas(); }
  });
  $$('#taskList [data-deltask]').forEach(b => b.onclick = () => {
    NOVA.set(NOVA.keys.TASKS, NOVA.get(NOVA.keys.TASKS, []).filter(t => t.id !== b.dataset.deltask));
    NOVA.emit('data'); RENDERERS.tareas();
  });
};
function addTask(text, prio) {
  const ts = NOVA.get(NOVA.keys.TASKS, []);
  ts.unshift({ id: uid(), text, done: false, prio: prio || 2, created: Date.now() });
  NOVA.set(NOVA.keys.TASKS, ts);
  NOVA.emit('data');
}
window.addTaskFn = t => addTask(t, 2);

/* ============================================================
   VISTA: AUTOMATIZACIONES
   ============================================================ */
RENDERERS.automatizaciones = function () {
  const rs = NOVA.get(NOVA.keys.ROUTINES, []);
  const on = rs.filter(r => r.on).length;
  $('#view-automatizaciones').innerHTML = `
  <div class="viewhead"><h2>Automatizaciones</h2><p>Rutinas que NOVA ejecuta por ti. (Ejecución en segundo plano real llega con la versión de servidor.)</p></div>
  <div class="grid" style="grid-template-columns:1.4fr 1fr">
    <article class="card">
      <div class="cardhead"><h3>Mis rutinas</h3><span class="muted">${on} ACTIVAS · ${rs.length} TOTALES</span></div>
      <div class="routines" id="routineList">
        ${rs.map(r => `
          <div class="routine">
            <span style="font-size:16px">${r.icon}</span>
            <div class="grow"><b>${esc(r.name)}</b><br><small class="muted">${esc(r.desc)}${r.time ? ' · ' + r.time : ''}</small></div>
            <span class="switch ${r.on ? 'on' : ''}" data-toggleroutine="${r.id}" role="switch" aria-checked="${r.on}"></span>
            <button class="button danger" data-delroutine="${r.id}">×</button>
          </div>`).join('')}
      </div>
    </article>
    <article class="card">
      <div class="cardhead"><h3>Crear rutina</h3></div>
      <div class="panelbody">
        <div class="field"><label>Nombre</label><input id="rtName" placeholder="Ej. Cierre de caja"></div>
        <div class="formgrid">
          <div class="field"><label>Icono</label><select id="rtIcon"><option>☀️</option><option>📊</option><option>📦</option><option>⏰</option><option>🔔</option><option>🧹</option><option>💼</option></select></div>
          <div class="field"><label>Hora (opcional)</label><input type="time" id="rtTime"></div>
        </div>
        <div class="field"><label>Descripción</label><input id="rtDesc" placeholder="Ej. Todos los días · 6:00 PM"></div>
        <button class="button green" style="width:100%" id="rtAdd">+ Crear rutina</button>
      </div>
    </article>
  </div>`;
  $$('#routineList [data-toggleroutine]').forEach(sw => sw.onclick = () => {
    const rs2 = NOVA.get(NOVA.keys.ROUTINES, []);
    const r = rs2.find(x => x.id === sw.dataset.toggleroutine);
    if (r) { r.on = !r.on; NOVA.set(NOVA.keys.ROUTINES, rs2); NOVA.emit('data');
      if (r.on) toast(`${r.icon} Rutina "${r.name}" activada`, 'ok'); RENDERERS.automatizaciones(); }
  });
  $$('#routineList [data-delroutine]').forEach(b => b.onclick = () => {
    NOVA.set(NOVA.keys.ROUTINES, NOVA.get(NOVA.keys.ROUTINES, []).filter(r => r.id !== b.dataset.delroutine));
    NOVA.emit('data'); RENDERERS.automatizaciones();
  });
  $('#rtAdd').onclick = () => {
    const name = $('#rtName').value.trim(); if (!name) return toast('Escribe el nombre de la rutina.', 'warn');
    const rs2 = NOVA.get(NOVA.keys.ROUTINES, []);
    rs2.push({ id: uid(), icon: $('#rtIcon').value, name, desc: $('#rtDesc').value.trim() || 'Rutina personalizada', time: $('#rtTime').value, on: true });
    NOVA.set(NOVA.keys.ROUTINES, rs2); NOVA.emit('data');
    toast('Rutina creada', 'ok'); RENDERERS.automatizaciones();
  };
};

/* ============================================================
   VISTA: ARCHIVOS (análisis 100% local)
   ============================================================ */
RENDERERS.archivos = function () {
  $('#view-archivos').innerHTML = `
  <div class="viewhead"><h2>Archivos y multimodal</h2><p>Analiza imágenes y documentos <b>en tu propio dispositivo</b>: nada se sube a ningún servidor.</p></div>
  <div class="grid" style="grid-template-columns:1.4fr 1fr">
    <article class="card">
      <div class="cardhead"><h3>Análisis local</h3><span class="tag">PRIVADO</span></div>
      <div class="dropzone" id="drop">
        📎 Arrastra un archivo aquí o toca para elegirlo<br><span class="muted">Imágenes · TXT · CSV · MD · PDF (info básica)</span>
        <input type="file" id="fileInput" hidden accept="image/*,.txt,.csv,.md,.json,.pdf">
      </div>
      <div class="panelbody" id="fileResult"><div class="empty"><span class="big">□</span>Aún no hay archivo seleccionado.</div></div>
    </article>
    <article class="card">
      <div class="cardhead"><h3>Lo que NOVA ve</h3></div>
      <div class="panelbody" id="fileInsight"><div class="empty">El análisis aparecerá aquí.</div></div>
    </article>
  </div>`;
  const drop = $('#drop'), input = $('#fileInput');
  drop.onclick = () => input.click();
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag'); };
  drop.ondragleave = () => drop.classList.remove('drag');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('drag'); if (e.dataTransfer.files[0]) analyzeFile(e.dataTransfer.files[0]); };
  input.onchange = () => { if (input.files[0]) analyzeFile(input.files[0]); };
};
function analyzeFile(file) {
  const res = $('#fileResult'), ins = $('#fileInsight');
  const kb = file.size / 1024;
  const base = `<div class="row"><div class="thumb">${file.type.startsWith('image') ? '🖼' : '📄'}</div>
    <div class="grow"><b>${esc(file.name)}</b><small>${file.type || 'tipo desconocido'} · ${kb < 1024 ? kb.toFixed(1) + ' KB' : (kb / 1024).toFixed(2) + ' MB'}</small></div></div>`;
  if (file.type.startsWith('image')) {
    const img = new Image();
    img.onload = () => {
      res.innerHTML = `<img class="preview" src="${img.src}" alt="vista previa">${base}
        <div class="metric"><span>Dimensiones</span><b>${img.naturalWidth} × ${img.naturalHeight} px</b></div>
        <div class="metric"><span>Relación de aspecto</span><b>${(img.naturalWidth / img.naturalHeight).toFixed(2)}</b></div>`;
      // análisis de color dominante con canvas
      const c = document.createElement('canvas');
      const s = 42; c.width = s; c.height = s;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0, s, s);
      const data = cx.getImageData(0, 0, s, s).data;
      const buckets = {};
      for (let i = 0; i < data.length; i += 4) {
        const key = `${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`;
        buckets[key] = (buckets[key] || 0) + 1;
      }
      const top = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([k, n]) => {
          const [r, g, b] = k.split(',').map(v => (parseInt(v) << 5) + 16);
          return `<span style="display:inline-block;width:26px;height:26px;border-radius:8px;background:rgb(${r},${g},${b});border:1px solid rgba(255,255,255,.2);margin:2px" title="rgb(${r},${g},${b})"></span>`;
        }).join('');
      ins.innerHTML = `<b style="font-size:12px">Análisis de imagen</b>
        <div class="metric"><span>Colores dominantes</span></div><div>${top}</div>
        <div class="metric"><span>Brillo medio</span><b>${avgBrightness(data)}%</b></div>
        <p class="muted" style="font-size:10px;line-height:1.6">Análisis realizado localmente con canvas. En v002 con IA en la nube podré describir el contenido, generar fichas de producto y etiquetas automáticas.</p>`;
    };
    img.src = URL.createObjectURL(file);
  } else if (/text|json|csv/.test(file.type) || /\.(txt|csv|md|json)$/i.test(file.name)) {
    const fr = new FileReader();
    fr.onload = () => {
      const txt = String(fr.result);
      const lines = txt.split(/\n/).filter(l => l.trim()).length;
      const words = txt.split(/\s+/).filter(Boolean).length;
      const first = txt.split(/\n/).slice(0, 3).join(' ').slice(0, 180);
      res.innerHTML = `${base}
        <div class="metric"><span>Líneas</span><b>${lines}</b></div>
        <div class="metric"><span>Palabras</span><b>${words}</b></div>
        <div class="metric"><span>Caracteres</span><b>${txt.length}</b></div>`;
      ins.innerHTML = `<b style="font-size:12px">Resumen del documento</b>
        <p style="font-size:11px;line-height:1.6;color:#b7c9df">“${esc(first)}${txt.length > 180 ? '…' : ''}”</p>
        <p class="muted" style="font-size:10px">Lectura local del archivo. Con backend, NOVA podría resumir PDFs completos y responder preguntas sobre ellos.</p>`;
    };
    fr.readAsText(file);
  } else {
    res.innerHTML = `${base}<p class="muted" style="font-size:10px">Tipo binario: muestro solo metadatos. El análisis profundo de PDF/docx llegará en la versión con backend.</p>`;
    ins.innerHTML = '<div class="empty"><span class="big">📄</span>Sin análisis detallado para este tipo… todavía.</div>';
  }
  toast('Análisis completado (100% local)', 'ok');
}
function avgBrightness(data) {
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) { sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; n++; }
  return Math.round(sum / n / 2.55);
}

/* ============================================================
   VISTA: TIENDAMAX
   ============================================================ */
RENDERERS.tiendamax = function () {
  const ps = NOVA.get(NOVA.keys.PRODUCTS, []);
  const low = ps.filter(p => p.stock <= 5);
  const invValue = ps.reduce((a, p) => a + p.stock * p.price, 0);
  const top = [...ps].sort((a, b) => b.sold - a.sold).slice(0, 3);
  $('#view-tiendamax').innerHTML = `
  <div class="viewhead"><h2>Tiendamax · Gestión de tienda</h2><p>Inventario persistente en tu dispositivo. Toca + / − para ajustar stock.</p></div>
  <div class="tiles" style="grid-template-columns:repeat(4,1fr)">
    <div class="tile">📦 Pedidos<span>42 hoy (demo)</span></div>
    <div class="tile">💰 Valor de inventario<span>${money(invValue)}</span></div>
    <div class="tile">⚠ Stock bajo<span>${low.length} productos</span></div>
    <div class="tile">🏷 Catálogo<span>${ps.length} productos</span></div>
  </div>
  <div class="grid" style="grid-template-columns:1.5fr 1fr;margin-top:12px">
    <article class="card">
      <div class="cardhead"><h3>Inventario</h3><span class="muted">${ps.length} PRODUCTOS</span></div>
      <div class="tblwrap"><table class="tbl">
        <thead><tr><th></th><th>Producto</th><th>SKU</th><th>Stock</th><th>Precio</th><th>Vendidos</th><th></th></tr></thead>
        <tbody>
        ${ps.map(p => `
          <tr>
            <td style="font-size:16px">${p.icon}</td>
            <td><b>${esc(p.name)}</b></td>
            <td class="muted">${esc(p.sku)}</td>
            <td>${p.stock <= 5 ? `<span class="tag ${p.stock <= 3 ? 'red' : 'yellow'}">${p.stock}</span>` : p.stock}</td>
            <td>${money(p.price)}</td>
            <td>${p.sold}</td>
            <td style="white-space:nowrap">
              <button class="button" data-stock="-1" data-id="${p.id}">−</button>
              <button class="button" data-stock="1" data-id="${p.id}">+</button>
              <button class="button danger" data-delprod="${p.id}">×</button>
            </td>
          </tr>`).join('')}
        </tbody></table></div>
    </article>
    <div style="display:grid;gap:12px;align-content:start">
      <article class="card">
        <div class="cardhead"><h3>Agregar producto</h3></div>
        <div class="panelbody">
          <div class="formgrid">
            <div class="field"><label>Icono</label><input id="prIcon" value="📦" maxlength="4"></div>
            <div class="field"><label>SKU</label><input id="prSku" placeholder="XX-000"></div>
          </div>
          <div class="field"><label>Nombre</label><input id="prName" placeholder="Ej. Mouse Inalámbrico"></div>
          <div class="formgrid">
            <div class="field"><label>Stock</label><input id="prStock" type="number" min="0" value="10"></div>
            <div class="field"><label>Precio ($)</label><input id="prPrice" type="number" min="0" value="499"></div>
          </div>
          <button class="button green" style="width:100%" id="prAdd">＋ Crear producto</button>
        </div>
      </article>
      <article class="card">
        <div class="cardhead"><h3>Más vendidos</h3></div>
        <div class="list">${top.map((p, i) => `
          <div class="row"><div class="thumb">${p.icon}</div>
          <div class="grow"><b>${esc(p.name)}</b><small>${p.sold} vendidos</small></div>
          <span class="tag">TOP ${i + 1}</span></div>`).join('')}</div>
      </article>
    </div>
  </div>`;
  $$('#view-tiendamax [data-stock]').forEach(b => b.onclick = () => {
    const ps2 = NOVA.get(NOVA.keys.PRODUCTS, []);
    const p = ps2.find(x => x.id === b.dataset.id);
    if (p) { p.stock = Math.max(0, p.stock + parseInt(b.dataset.stock, 10)); NOVA.set(NOVA.keys.PRODUCTS, ps2); NOVA.emit('data'); RENDERERS.tiendamax(); }
  });
  $$('#view-tiendamax [data-delprod]').forEach(b => b.onclick = () => {
    NOVA.set(NOVA.keys.PRODUCTS, NOVA.get(NOVA.keys.PRODUCTS, []).filter(p => p.id !== b.dataset.delprod));
    NOVA.emit('data'); RENDERERS.tiendamax(); toast('Producto eliminado', '', 1600);
  });
  $('#prAdd').onclick = () => {
    const name = $('#prName').value.trim(); if (!name) return toast('Escribe el nombre del producto.', 'warn');
    const ps2 = NOVA.get(NOVA.keys.PRODUCTS, []);
    ps2.push({ id: uid(), icon: $('#prIcon').value || '📦', name, sku: $('#prSku').value.trim() || 'N/A', stock: parseInt($('#prStock').value, 10) || 0, price: parseInt($('#prPrice').value, 10) || 0, sold: 0 });
    NOVA.set(NOVA.keys.PRODUCTS, ps2); NOVA.emit('data');
    toast('Producto creado', 'ok'); RENDERERS.tiendamax();
  };
};

/* ============================================================
   VISTA: NAVEGADOR
   ============================================================ */
RENDERERS.navegador = function () {
  const sites = [
    ['YouTube', '▶️', 'https://youtube.com'], ['Gmail', '✉️', 'https://mail.google.com'],
    ['WhatsApp Web', '💬', 'https://web.whatsapp.com'], ['Google Drive', '📁', 'https://drive.google.com'],
    ['Notion', '📘', 'https://notion.so'], ['Spotify', '🎵', 'https://open.spotify.com'],
    ['Maps', '🗺', 'https://maps.google.com'], ['Traductor', '🌐', 'https://translate.google.com']
  ];
  $('#view-navegador').innerHTML = `
  <div class="viewhead"><h2>Navegador</h2><p>Atajos rápidos. Se abren en una pestaña nueva (requieren internet).</p></div>
  <article class="card" style="max-width:720px">
    <div class="cardhead"><h3>Búsqueda web</h3><span class="muted">GOOGLE</span></div>
    <div class="panelbody">
      <div class="formrow">
        <input id="webQ" placeholder="Escribe qué buscar…" style="flex:1;background:rgba(6,17,32,.85);border:1px solid var(--line);border-radius:11px;padding:11px 13px;color:var(--text)">
        <button class="button green" id="webGo" style="padding:11px 18px">Buscar ⌕</button>
      </div>
    </div>
  </article>
  <div class="tiles" style="grid-template-columns:repeat(4,1fr);margin-top:12px">
    ${sites.map(([n, i, u]) => `<a class="tile" href="${u}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><b style="font-size:14px">${i}</b> ${n}<span>Abrir sitio ↗</span></a>`).join('')}
  </div>`;
  const go = () => { const q = $('#webQ').value.trim(); if (q) window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank', 'noopener'); };
  $('#webGo').onclick = go;
  $('#webQ').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
};

/* ============================================================
   VISTA: PLUGINS
   ============================================================ */
RENDERERS.plugins = function () {
  const saved = NOVA.get(NOVA.keys.SWITCH, {});
  const plugs = [
    ['Tiendamax', 'Tienda', '🛍', true], ['Google Calendar', 'Calendario', '📅', false],
    ['Gmail', 'Correo', '✉️', false], ['Google Drive', 'Archivos', '📁', false],
    ['WhatsApp', 'Mensajería', '💬', false], ['Notion', 'Documentos', '📘', false],
    ['Spotify', 'Música', '🎵', false], ['YouTube', 'Vídeos', '▶️', false],
    ['OpenAI', 'IA avanzada', '🤖', false], ['API personalizada', 'Conexiones', '🔌', false]
  ];
  $('#view-plugins').innerHTML = `
  <div class="viewhead"><h2>Plugins e integraciones</h2><p>Las conexiones reales requieren backend con OAuth. Por ahora se guarda tu preferencia localmente.</p></div>
  <article class="card" style="max-width:860px">
    <div class="cardhead"><h3>Catálogo de integraciones</h3><span class="muted">${plugs.filter(p => saved['plug_' + p[0]] ?? p[3]).length} CONECTADAS</span></div>
    <div class="tiles" style="grid-template-columns:repeat(3,1fr)">
      ${plugs.map(([n, d, i, def]) => {
        const on = saved['plug_' + n] ?? def;
        return `<button class="tile ${on ? 'on' : ''}" data-plug="${esc(n)}"><b style="font-size:15px">${i}</b> ${esc(n)}
          <span>${on ? '● Conectado — toca para desconectar' : '○ Desconectado — toca para conectar'}</span></button>`;
      }).join('')}
    </div>
  </article>`;
  $$('#view-plugins [data-plug]').forEach(b => b.onclick = () => {
    const k = 'plug_' + b.dataset.plug;
    const now = !(saved[k] ?? plugs.find(p => p[0] === b.dataset.plug)[3]);
    saved[k] = now; NOVA.set(NOVA.keys.SWITCH, saved);
    RENDERERS.plugins();
    toast(now ? `✦ ${b.dataset.plug} conectado (demo local)` : `${b.dataset.plug} desconectado`, now ? 'ok' : '', 1800);
  });
};

/* ============================================================
   Dashboard + respuestas del agente con datos reales
   ============================================================ */
function refreshDashboard() {
  const tasks = NOVA.get(NOVA.keys.TASKS, []);
  const evs = NOVA.get(NOVA.keys.EVENTS, []);
  const mem = NOVA.get(NOVA.keys.MEM, []);
  const rs = NOVA.get(NOVA.keys.ROUTINES, []);
  const ps = NOVA.get(NOVA.keys.PRODUCTS, []);
  const t = todayISO();

  const st = $('#statTasks'); if (st) st.textContent = tasks.filter(x => !x.done).length;
  const sm = $('#statMeetings'); if (sm) sm.textContent = evs.filter(e => e.date === t).length;
  const mc = $('#memCount'); if (mc) mc.textContent = mem.length;
  const mb = $('#memBar1'); const pct = Math.min(99, 20 + mem.length * 8);
  if (mb) { mb.style.width = pct + '%'; $('#memBar1T').textContent = pct + '%'; }

  const onR = rs.filter(r => r.on);
  const rt = $('#routinesTag'); if (rt) rt.textContent = `${onR.length} ACTIVAS`;
  const mr = $('#miniRoutines');
  if (mr) mr.innerHTML = rs.slice(0, 4).map(r => `
    <div class="routine"><span style="font-size:14px">${r.icon}</span>
      <div class="grow"><b style="font-size:10px">${esc(r.name)}</b><br><small class="muted">${esc(r.desc)}</small></div>
      <span class="switch ${r.on ? 'on' : ''}" data-miniroutine="${r.id}"></span></div>`).join('');
  if (mr) $$('#miniRoutines [data-miniroutine]').forEach(sw => sw.onclick = () => {
    const rs2 = NOVA.get(NOVA.keys.ROUTINES, []);
    const r = rs2.find(x => x.id === sw.dataset.miniroutine);
    if (r) { r.on = !r.on; NOVA.set(NOVA.keys.ROUTINES, rs2); NOVA.emit('data'); if (r.on) toast(`${r.icon} Rutina "${r.name}" activada`, 'ok'); }
  });

  const low = ps.filter(p => p.stock <= 5);
  const lt = $('#lowStockTag'); if (lt) lt.textContent = `${low.length} ALERTAS`;
  const ta = $('#tileAlerts'); if (ta) ta.textContent = `${low.length} alertas`;
  const ll = $('#lowStockList');
  if (ll) {
    const rows = low.slice(0, 3).map(p => `
      <div class="row"><div class="thumb">${p.icon}</div>
      <div class="grow"><b>${esc(p.name)}</b><small>SKU · ${esc(p.sku)}</small></div>
      <span class="tag ${p.stock <= 3 ? 'red' : 'yellow'}">${p.stock} uds.</span></div>`).join('');
    ll.innerHTML = rows + (low.length ? '' : '<div class="empty">Sin alertas de inventario 🎉</div>') +
      '<button class="button" style="margin-top:8px;width:100%" data-goto="tiendamax">Ver inventario completo</button>';
    if (typeof initRouterBinds === 'function') initRouterBinds();
  }

  // mini calendario del home
  const mcTag = $('#calMonthTag');
  if (mcTag) mcTag.textContent = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
  const miniCal = $('#miniCalendar');
  if (miniCal) {
    const y = new Date().getFullYear(), m = new Date().getMonth();
    const first = new Date(y, m, 1); const startOff = (first.getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const evMap = {};
    evs.forEach(e => { evMap[e.date] = (evMap[e.date] || 0) + 1; });
    let cells = '';
    for (let i = 0; i < startOff; i++) cells += '<b></b>';
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells += `<b class="${[iso === t ? 'today' : '', evMap[iso] ? 'hasdot' : ''].join(' ')}">${d}</b>`;
    }
    const todayEvs = evs.filter(e => e.date === t).sort((a, b) => a.time.localeCompare(b.time));
    miniCal.innerHTML = `<div class="days"><b>L</b><b>M</b><b>X</b><b>J</b><b>V</b><b>S</b><b>D</b>${cells}</div>` +
      (todayEvs.length ? todayEvs.slice(0, 4).map(e => `<div class="event">${e.time} · ${esc(e.title)}<br><span class="muted">${esc(e.place || '')}</span></div>`).join('') : '<div class="event">Sin eventos hoy</div>');
  }
}

/* --- Respuestas del agente con datos reales --- */
window.salesAnswerFn = () => {
  const ps = NOVA.get(NOVA.keys.PRODUCTS, []);
  const top = [...ps].sort((a, b) => b.sold - a.sold)[0];
  return `Hoy llevas $4,280 en 42 pedidos, un 18 por ciento más que ayer. El producto estrella es ${top ? top.name : 'Smart Watch Pro'}.`;
};
window.tasksAnswerFn = () => {
  const pend = NOVA.get(NOVA.keys.TASKS, []).filter(t => !t.done);
  if (!pend.length) return 'No tienes tareas pendientes. Todo despejado.';
  return `Tienes ${pend.length} tareas pendientes. Las más importantes: ` +
    pend.slice(0, 3).map(t => t.text).join('; ') + '.';
};
window.calendarAnswerFn = () => {
  const evs = NOVA.get(NOVA.keys.EVENTS, []).filter(e => e.date === todayISO()).sort((a, b) => a.time.localeCompare(b.time));
  if (!evs.length) return 'No tienes eventos para hoy.';
  return `Hoy tienes ${evs.length} eventos: ` + evs.map(e => `${e.time}, ${e.title}`).join('; ') + '.';
};
window.memoryAnswerFn = () => {
  const mem = NOVA.get(NOVA.keys.MEM, []);
  if (!mem.length) return 'Mi memoria está vacía. Dime "recuerda que…" y lo guardaré.';
  return `Tengo ${mem.length} recuerdos guardados. Por ejemplo: ${mem[0].text}.`;
};

/* --- Init de views --- */
document.addEventListener('DOMContentLoaded', () => {
  seedData();
  NOVA.on('data', refreshDashboard);
  // Reactividad: si cambia un dato, re-renderiza la vista dinámica abierta
  NOVA.on('data', () => {
    if (RENDERERS[currentView]) RENDERERS[currentView]();
  });
  refreshDashboard();
});
