/**
 * ca.js — ระบบ CA (Course Assessment) แบบ OBE รองรับหลายรายวิชา
 * เชื่อม PLO → CLO → Skill ของหลักสูตร เข้ากับการกรอกคะแนนและการตัดเกรดอัตโนมัติ
 *
 * ความสามารถ:
 *   - เลือกรายวิชาได้หลายวิชา (course selector)
 *   - กรอกคะแนนระดับ CLO โดยตรง หรือ ระดับองค์ประกอบย่อย (Quiz/ชิ้นงาน/อัตนัย/นำเสนอ)
 *     ที่ระบบรวมเป็น CLO% ให้อัตโนมัติ (ตาม entryMode ของรายวิชา)
 *   - นำเข้าคะแนนจากไฟล์ CSV และส่งออกเป็น CSV
 *
 * หน้าย่อย (hash routing): #/ca, #/ca/criteria, #/ca/setup, #/ca/scores, #/ca/report
 */
(function () {
  const D = window.CA_DATA;
  const Store = window.CA_STORE;

  // ---------- ยูทิลิตี้ ----------
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, "<br>");
  const pct = (x, d = 1) => (x == null || isNaN(x) ? "–" : (x * 100).toFixed(d) + "%");
  const round = (x, d = 2) => Math.round(x * Math.pow(10, d)) / Math.pow(10, d);
  const num = (v) => (v == null || v === "" || isNaN(v) ? null : +v);

  const courseDef = (id) => D.CA_COURSES.find((c) => c.id === id);

  // ---------- เครื่องคำนวณผลลัพธ์ (Assessment Engine) ----------
  function scaleById(idx) {
    return D.CA_GRADE_SCALES.find((s) => s.id === idx) || D.CA_GRADE_SCALES[0];
  }

  function gradeFromTotal(total, scale) {
    for (const [th, g] of scale.bands) if (total >= th) return g;
    return "F";
  }

  /** คำนวณ CLO% (เศษส่วน 0–1) จากคะแนนองค์ประกอบย่อย — ต้องกรอกครบทุกองค์ประกอบ */
  function cloFromComponents(clo, comp) {
    if (!comp) return null;
    let acc = 0;
    let complete = true;
    clo.components.forEach((m) => {
      const v = num(comp[m.id]);
      if (v == null) complete = false;
      else acc += v * m.weight; // score(0–100) × weight(รวม=100)
    });
    return complete && clo.components.length ? acc / 10000 : null;
  }

  /** คืนคะแนน CLO ของนักศึกษา โดยอิง entryMode ของรายวิชา */
  function cloScore(def, setup, st, clo) {
    if (setup.entryMode === "component") return cloFromComponents(clo, st.comp);
    return num(st.scores ? st.scores[clo.id] : null);
  }

  /** ประเมินผลของนักศึกษาหนึ่งคนในรายวิชาหนึ่ง */
  function evalStudent(def, setup, scale, st) {
    const cloPass = {};
    const cloVal = {};
    let total = 0;
    let hasAll = true;
    def.clos.forEach((c) => {
      const v = cloScore(def, setup, st, c);
      cloVal[c.id] = v;
      if (v == null) {
        hasAll = false;
        cloPass[c.id] = null;
      } else {
        cloPass[c.id] = v >= setup.pass[c.id];
        total += v * setup.weights[c.id];
      }
    });
    if (!hasAll) return { cloPass, cloVal, hasAll: false, overall: "IP", total: null, grade: "IP" };
    const overall = def.clos.every((c) => cloPass[c.id]) ? "PASS" : "FAIL";
    return { cloPass, cloVal, hasAll: true, overall, total, grade: gradeFromTotal(total, scale) };
  }

  function courseReport(def, cs) {
    const { setup, students } = cs;
    const scale = scaleById(setup.scaleIndex);
    const evals = students.map((st) => ({ st, ev: evalStudent(def, setup, scale, st) }));
    const completed = evals.filter((e) => e.ev.hasAll);
    const ip = students.length - completed.length;
    const passCount = completed.filter((e) => e.ev.overall === "PASS").length;

    const cloStats = {};
    def.clos.forEach((c) => {
      const vals = evals.map((e) => e.ev.cloVal[c.id]).filter((v) => v != null);
      const sum = vals.reduce((a, b) => a + b, 0);
      const passN = vals.filter((v) => v >= setup.pass[c.id]).length;
      cloStats[c.id] = {
        avg: vals.length ? sum / vals.length : 0,
        passRate: vals.length ? passN / vals.length : 0,
        count: vals.length,
      };
    });

    const avgTotal = completed.length
      ? completed.reduce((a, e) => a + e.ev.total, 0) / completed.length : 0;

    const order = ["A", "B+", "B", "C+", "C", "D+", "D", "F"];
    const dist = {};
    order.forEach((g) => (dist[g] = 0));
    completed.forEach((e) => (dist[e.ev.grade] = (dist[e.ev.grade] || 0) + 1));

    const gp = D.CA_GRADE_POINTS;
    let pts = 0;
    completed.forEach((e) => (pts += gp[e.ev.grade] || 0));
    const gpa = completed.length ? pts / completed.length : 0;

    return {
      n: students.length, ip, completed: completed.length, passCount,
      passRate: completed.length ? passCount / completed.length : 0,
      cloStats, avgTotal, dist, gpa, order, evals,
    };
  }

  // ---------- ส่วนหัว: ตัวเลือกรายวิชา + แถบเมนูย่อย ----------
  function courseSelector(currentId) {
    const opts = D.CA_COURSES.map(
      (c) =>
        `<option value="${esc(c.id)}" ${c.id === currentId ? "selected" : ""}>${esc(c.course.code)} — ${esc(c.course.name)}</option>`
    ).join("");
    return `<div class="ca-course-select">
        <label for="course-select">รายวิชา</label>
        <select id="course-select" class="cell-input">${opts}</select>
      </div>`;
  }

  function subnav(active, currentId) {
    const tabs = [
      ["", "ภาพรวม (CA)"],
      ["criteria", "เกณฑ์การบรรลุ CLO"],
      ["setup", "ตั้งค่า"],
      ["scores", "กรอกคะแนน"],
      ["report", "รายงานรายวิชา"],
    ];
    return `<div class="ca-head">
      ${courseSelector(currentId)}
      <nav class="ca-subnav">${tabs
        .map(([k, label]) => `<a href="#/ca${k ? "/" + k : ""}" data-link class="${active === k ? "active" : ""}">${label}</a>`)
        .join("")}</nav>
    </div>`;
  }

  function courseHeader(def, setup) {
    const c = def.course;
    const mode = setup.entryMode === "component" ? "กรอกระดับองค์ประกอบย่อย" : "กรอกระดับ CLO";
    return `
      <div class="ca-coursebar">
        <div>
          <span class="badge" style="--accent:#0f766e">${esc(c.code)}</span>
          <strong>${esc(c.name)}</strong>
        </div>
        <div class="muted">หน่วยกิต ${esc(c.credits)} · ภาคเรียน ${esc(c.semester)} · ${esc(c.instructors.join(", "))} · <span class="chip">${mode}</span></div>
      </div>`;
  }

  // ---------- หน้าภาพรวม (CA) ----------
  function viewOverview(def, cs) {
    const c = def.course;
    const plos = c.plos.map((p) => `<li><strong>${esc(p.id)}:</strong> ${esc(p.text)}</li>`).join("");
    const rows = def.weeks.map((w) => `
      <tr>
        <td class="nowrap">${esc(w.week)}</td>
        <td class="nowrap">${esc(w.plo)}</td>
        <td class="nowrap">${esc(w.clo)}</td>
        <td>${esc(w.skill)}<br><span class="chip">${esc(w.level)}</span></td>
        <td>${nl2br(w.assessMethod)}</td>
        <td>${nl2br(w.assessTool)}</td>
        <td>${nl2br(w.criteria)}</td>
        <td class="nowrap">${esc(w.assessType)}</td>
        <td>${nl2br(w.theory)}</td>
        <td>${nl2br(w.practice)}</td>
        <td>${nl2br(w.selfStudy)}</td>
      </tr>`).join("");

    return `
      <section class="ca-grid">
        <div class="card">
          <h3>ข้อมูลรายวิชา</h3>
          <dl class="kv">
            <dt>คณะ</dt><dd>${esc(c.faculty)}</dd>
            <dt>หลักสูตร</dt><dd>${esc(c.program)}</dd>
            <dt>กลุ่มวิชา</dt><dd>${esc(c.group)} · ${esc(c.year)}</dd>
            <dt>ผู้รับผิดชอบ</dt><dd>${esc(c.owner)}</dd>
            <dt>ระดับการรองรับ PLO</dt><dd>${esc(c.ploSupport)}</dd>
          </dl>
        </div>
        <div class="card">
          <h3>ผลลัพธ์การเรียนรู้ระดับหลักสูตร (PLO)</h3>
          <ul class="check-list">${plos}</ul>
          <p class="muted" style="margin-top:12px">คำอธิบายรายวิชา</p>
          <p>${esc(c.description)}</p>
        </div>
      </section>
      <section>
        <h3>แผนการจัดการเรียนรู้และการประเมิน (รายสัปดาห์)</h3>
        <div class="table-scroll">
          <table class="ca-table">
            <thead><tr>
              <th>สัปดาห์</th><th>PLO</th><th>CLO</th><th>Skill / ระดับ</th>
              <th>วิธีประเมิน</th><th>เครื่องมือ</th><th>เกณฑ์การบรรลุ</th><th>ประเภท</th>
              <th>ทฤษฎี</th><th>ปฏิบัติ/กิจกรรม</th><th>ศึกษาด้วยตนเอง</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;
  }

  // ---------- หน้าเกณฑ์การบรรลุ CLO ----------
  function viewCriteria(def, cs) {
    const blocks = def.clos.map((c) => {
      const sumW = c.components.reduce((a, x) => a + (x.weight || 0), 0);
      const rows = c.components.map((m) => `
        <tr>
          <td>${esc(m.method)}</td><td class="num">${esc(m.weight)}</td><td>${esc(m.detail)}</td>
          <td class="num">${esc(m.count)}</td><td class="num">${esc(m.hours)}</td>
          <td>${esc(m.tool)}</td><td>${esc(m.feedback)}</td><td>${esc(m.when)}</td>
        </tr>`).join("");
      return `
        <div class="card ca-clo-card">
          <div class="ca-clo-head">
            <span class="badge" style="--accent:#0f766e">${esc(c.id)}</span>
            <span>${esc(c.text)}</span>
            <span class="chip">${esc(c.plo)}</span>
            <span class="chip pass">เกณฑ์การบรรลุ ${esc(c.pass)}%</span>
          </div>
          <div class="table-scroll">
            <table class="ca-table">
              <thead><tr>
                <th>วิธีการประเมิน</th><th class="num">น้ำหนัก</th><th>รายละเอียด</th>
                <th class="num">จำนวน</th><th class="num">ชม./ครั้ง</th><th>เครื่องมือ</th>
                <th>การให้ Feedback</th><th>ช่วงเวลา</th>
              </tr></thead>
              <tbody>${rows}</tbody>
              <tfoot><tr><td>รวมน้ำหนัก</td><td class="num">${sumW}</td><td colspan="6"></td></tr></tfoot>
            </table>
          </div>
        </div>`;
    }).join("");
    return `<p class="muted">สัดส่วนคะแนนของแต่ละองค์ประกอบรวมกันเป็นคะแนน CLO (เต็ม 100 ต่อ CLO) ก่อนถ่วงน้ำหนักเป็นคะแนนรวมรายวิชา</p>${blocks}`;
  }

  // ---------- หน้าตั้งค่า ----------
  function viewSetup(def, cs) {
    const s = cs.setup;
    const sumW = def.clos.reduce((a, c) => a + (s.weights[c.id] || 0), 0);
    const wRows = def.clos.map((c) => `
      <tr>
        <td>${esc(c.id)} <span class="muted">(${esc(c.plo)})</span></td>
        <td><input type="number" class="cell-input" data-kind="weights" data-clo="${c.id}" min="0" max="1" step="0.05" value="${s.weights[c.id]}"></td>
        <td><input type="number" class="cell-input" data-kind="pass" data-clo="${c.id}" min="0" max="1" step="0.05" value="${s.pass[c.id]}"></td>
      </tr>`).join("");
    const scaleOpts = D.CA_GRADE_SCALES.map(
      (sc) => `<option value="${sc.id}" ${sc.id === s.scaleIndex ? "selected" : ""}>${esc(sc.name)}</option>`).join("");
    const scale = scaleById(s.scaleIndex);
    const bandRows = scale.bands.filter(([th]) => th > 0).sort((a, b) => a[0] - b[0])
      .map(([th, g]) => `<tr><td>≥ ${pct(th, 0)}</td><td><strong>${g}</strong></td></tr>`).join("");

    return `
      <section class="ca-grid">
        <div class="card">
          <h3>น้ำหนัก CLO และเกณฑ์ผ่าน</h3>
          <table class="ca-table compact">
            <thead><tr><th>CLO</th><th>น้ำหนัก (รวม = 1.00)</th><th>เกณฑ์ผ่าน (เศษส่วน)</th></tr></thead>
            <tbody>${wRows}</tbody>
            <tfoot><tr><td>รวมน้ำหนัก</td><td id="weight-sum" class="${Math.abs(sumW - 1) < 1e-9 ? "ok" : "warn"}">${round(sumW, 2)}</td><td></td></tr></tfoot>
          </table>
          <div class="form-row">
            <label>วิธีกรอกคะแนน</label>
            <select id="mode-select" class="cell-input">
              <option value="clo" ${s.entryMode === "clo" ? "selected" : ""}>กรอกระดับ CLO (กรอกคะแนน CLO% โดยตรง)</option>
              <option value="component" ${s.entryMode === "component" ? "selected" : ""}>กรอกระดับองค์ประกอบย่อย (รวมเป็น CLO% อัตโนมัติ)</option>
            </select>
          </div>
          <div class="form-row">
            <label>สเกลการตัดเกรด</label>
            <select id="scale-select" class="cell-input">${scaleOpts}</select>
          </div>
          <div class="ca-actions">
            <button class="btn btn-primary" id="save-setup">บันทึกการตั้งค่า</button>
            <button class="btn btn-outline" id="reset-course">คืนค่าเริ่มต้นรายวิชานี้</button>
            <button class="btn btn-outline" id="reset-ca">คืนค่าทั้งระบบ</button>
          </div>
          <p class="muted" id="setup-msg"></p>
        </div>
        <div class="card">
          <h3>ตารางเทียบเกรด — ${esc(scale.name)}</h3>
          <table class="ca-table compact">
            <thead><tr><th>คะแนนรวมรายวิชา</th><th>เกรด</th></tr></thead>
            <tbody>${bandRows}<tr><td>ต่ำกว่าเกณฑ์</td><td><strong>F</strong></td></tr></tbody>
          </table>
          <p class="muted">คะแนนรวมรายวิชา = Σ (คะแนน CLO × น้ำหนัก CLO)</p>
        </div>
      </section>`;
  }

  // ---------- หน้ากรอกคะแนน ----------
  let _focusClo = null; // CLO ที่เลือกดูองค์ประกอบ (โหมด component)

  function viewScores(def, cs) {
    const setup = cs.setup;
    const scale = scaleById(setup.scaleIndex);
    const component = setup.entryMode === "component";

    if (component && (!_focusClo || !def.clos.some((c) => c.id === _focusClo))) {
      _focusClo = def.clos[0].id;
    }
    const focusClo = component ? def.clos.find((c) => c.id === _focusClo) : null;

    // หัวตาราง
    let compHead = "";
    if (component) {
      compHead = focusClo.components
        .map((m) => `<th class="num" title="${esc(m.detail)}">${esc(m.method)}<br><span class="muted">(${m.weight}%)</span></th>`)
        .join("");
    }
    const cloHead = def.clos.map((c) => `<th class="num">${esc(c.id)}%</th>`).join("");
    const passHead = def.clos.map((c) => `<th>${esc(c.id)}</th>`).join("");

    const rows = cs.students.map((st, idx) => {
      const ev = evalStudent(def, setup, scale, st);
      let compCells = "";
      if (component) {
        compCells = focusClo.components.map((m) => {
          const v = st.comp ? st.comp[m.id] : null;
          const shown = v == null || v === "" || isNaN(v) ? "" : round(v, 2);
          return `<td><input type="number" class="comp-input" data-sid="${esc(st.id)}" data-clo="${focusClo.id}" data-comp="${m.id}" min="0" max="100" step="0.01" value="${shown}" placeholder="–"></td>`;
        }).join("");
      }
      const cloCells = def.clos.map((c) => {
        const v = ev.cloVal[c.id];
        if (component) {
          // โหมดองค์ประกอบ: CLO% เป็นค่าที่คำนวณ (อ่านอย่างเดียว)
          return `<td class="num derived">${v == null ? "–" : pct(v, 1)}</td>`;
        }
        const shown = v == null ? "" : round(v * 100, 2);
        return `<td><input type="number" class="score-input" data-sid="${esc(st.id)}" data-clo="${c.id}" min="0" max="100" step="0.01" value="${shown}" placeholder="–"></td>`;
      }).join("");
      const passCells = def.clos.map((c) => {
        const p = ev.cloPass[c.id];
        const cls = p == null ? "ip" : p ? "pass" : "fail";
        const txt = p == null ? "–" : p ? "ผ่าน" : "ไม่ผ่าน";
        return `<td><span class="pill ${cls}">${txt}</span></td>`;
      }).join("");
      const oCls = ev.overall === "PASS" ? "pass" : ev.overall === "FAIL" ? "fail" : "ip";
      return `
        <tr>
          <td class="num muted">${idx + 1}</td>
          <td class="nowrap">${esc(st.id)}</td>
          <td>${esc(st.name)}</td>
          ${compCells}
          ${cloCells}
          ${passCells}
          <td><span class="pill ${oCls}">${ev.overall}</span></td>
          <td class="num">${ev.total == null ? "–" : pct(ev.total, 2)}</td>
          <td class="num"><strong>${ev.grade}</strong></td>
          <td><button class="icon-btn del-student" data-sid="${esc(st.id)}" title="ลบ">✕</button></td>
        </tr>`;
    }).join("");

    const focusSelector = component
      ? `<div class="ca-focus">
          <label>องค์ประกอบของ</label>
          <select id="focus-clo" class="cell-input">
            ${def.clos.map((c) => `<option value="${c.id}" ${c.id === _focusClo ? "selected" : ""}>${esc(c.id)} — ${esc(c.text)}</option>`).join("")}
          </select>
        </div>` : "";

    const modeNote = component
      ? `คะแนนองค์ประกอบกรอกเป็นร้อยละ (0–100) · คอลัมน์ <strong>CLO%</strong> คำนวณอัตโนมัติเมื่อกรอกองค์ประกอบของ CLO นั้นครบทุกช่อง`
      : `กรอกคะแนน CLO เป็นร้อยละ (0–100) · ระบบคำนวณผ่าน คะแนนรวม และเกรดอัตโนมัติ`;

    return `
      <div class="ca-toolbar">
        <span class="muted">${modeNote} · สเกล: <strong>${esc(scale.name)}</strong></span>
        <div class="ca-actions">
          <button class="btn btn-outline" id="import-csv-btn">นำเข้า CSV</button>
          <button class="btn btn-outline" id="export-csv">ส่งออก CSV</button>
          <input type="file" id="import-file" accept=".csv,text/csv" style="display:none">
        </div>
      </div>
      ${focusSelector}
      <div class="table-scroll">
        <table class="ca-table score-table">
          <thead><tr>
            <th>#</th><th>รหัสนักศึกษา</th><th>ชื่อ-สกุล</th>
            ${component ? `<th class="grp" colspan="${focusClo.components.length}">องค์ประกอบของ ${esc(focusClo.id)}</th>` : ""}
            <th class="grp" colspan="${def.clos.length}">คะแนน CLO</th>
            <th class="grp" colspan="${def.clos.length}">ผลการบรรลุ</th>
            <th rowspan="2">สรุป</th><th rowspan="2">รวม%</th><th rowspan="2">เกรด</th><th rowspan="2"></th>
          </tr>
          <tr class="sub">
            <th></th><th></th><th></th>
            ${compHead}
            ${cloHead}
            ${passHead}
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="20" class="muted" style="text-align:center;padding:24px">ยังไม่มีนักศึกษา — เพิ่มด้านล่าง หรือ นำเข้า CSV</td></tr>`}</tbody>
        </table>
      </div>
      <div class="card add-student">
        <h3>เพิ่มนักศึกษา</h3>
        <div class="form-inline">
          <input type="text" id="new-sid" class="cell-input" placeholder="รหัสนักศึกษา">
          <input type="text" id="new-name" class="cell-input" placeholder="ชื่อ-สกุล">
          <button class="btn btn-primary" id="add-student">เพิ่ม</button>
        </div>
        <p class="muted" id="scores-msg"></p>
      </div>`;
  }

  // ---------- หน้ารายงานรายวิชา ----------
  function viewReport(def, cs) {
    const r = courseReport(def, cs);
    const scale = scaleById(cs.setup.scaleIndex);
    const cloRows = def.clos.map((c) => {
      const s = r.cloStats[c.id];
      return `<tr><td>${esc(c.id)}</td><td>${esc(c.text)}</td>
        <td class="num">${pct(s.avg, 1)}</td><td class="num">${pct(s.passRate, 0)}</td></tr>`;
    }).join("");
    const distRows = r.order.map((g) => {
      const n = r.dist[g] || 0;
      const p = r.completed ? (n / r.completed) * 100 : 0;
      return `<tr><td><strong>${g}</strong></td><td class="num">${n}</td><td class="num">${p.toFixed(1)}%</td>
        <td><span class="bar" style="width:${p}%"></span></td></tr>`;
    }).join("");
    const rep = cs.report;
    return `
      <section class="stat-grid">
        <div class="stat-box"><strong>${r.n}</strong><span>นักศึกษา</span></div>
        <div class="stat-box"><strong>${r.passCount}</strong><span>ผ่านรายวิชา</span></div>
        <div class="stat-box"><strong>${r.ip}</strong><span>กำลังเรียน (IP)</span></div>
        <div class="stat-box"><strong>${pct(r.avgTotal, 1)}</strong><span>คะแนนเฉลี่ยรวม</span></div>
        <div class="stat-box"><strong>${pct(r.passRate, 0)}</strong><span>อัตราผ่าน</span></div>
        <div class="stat-box"><strong>${round(r.gpa, 2)}</strong><span>GPA ชั้นเรียน</span></div>
      </section>
      <section class="ca-grid">
        <div class="card">
          <h3>การบรรลุผลลัพธ์การเรียนรู้ (CLO Attainment)</h3>
          <table class="ca-table compact">
            <thead><tr><th>CLO</th><th>รายละเอียด</th><th class="num">เฉลี่ย</th><th class="num">อัตราผ่าน</th></tr></thead>
            <tbody>${cloRows}</tbody>
          </table>
        </div>
        <div class="card">
          <h3>การกระจายเกรด (สเกล ${esc(scale.name)})</h3>
          <table class="ca-table compact dist-table">
            <thead><tr><th>เกรด</th><th class="num">จำนวน</th><th class="num">%</th><th></th></tr></thead>
            <tbody>${distRows}</tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <h3>สรุปและการปรับปรุง (CQI)</h3>
        <div class="form-row"><label>จุดเด่น/ปัญหาที่พบ (Reflection)</label>
          <textarea id="rep-reflection" rows="3" class="cell-input">${esc(rep.reflection)}</textarea></div>
        <div class="form-row"><label>มาตรการปรับปรุงเทอมหน้า (CQI)</label>
          <textarea id="rep-cqi" rows="3" class="cell-input">${esc(rep.cqi)}</textarea></div>
        <div class="form-row"><label>ผลการประเมินการสอน / ข้อเสนอแนะ</label>
          <textarea id="rep-eval" rows="3" class="cell-input">${esc(rep.teachingEval)}</textarea></div>
        <div class="ca-actions"><button class="btn btn-primary" id="save-report">บันทึกรายงาน</button>
          <span class="muted" id="report-msg"></span></div>
      </section>`;
  }

  // ---------- การผูกเหตุการณ์ ----------
  function bindCommon(container) {
    const sel = container.querySelector("#course-select");
    if (sel) sel.addEventListener("change", () => {
      Store.setCurrentCourse(sel.value);
      _focusClo = null;
      rerender();
    });
  }

  function bindSetup(container, courseId, def) {
    container.querySelector("#save-setup").addEventListener("click", () => {
      const setup = Store.getCourse(courseId).setup;
      container.querySelectorAll("[data-kind]").forEach((inp) => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) setup[inp.dataset.kind][inp.dataset.clo] = v;
      });
      setup.scaleIndex = parseInt(container.querySelector("#scale-select").value, 10);
      setup.entryMode = container.querySelector("#mode-select").value;
      const sumW = def.clos.reduce((a, c) => a + (setup.weights[c.id] || 0), 0);
      Store.saveSetup(courseId, setup);
      container.querySelector("#setup-msg").textContent =
        Math.abs(sumW - 1) < 1e-9 ? "บันทึกเรียบร้อย ✓"
          : `บันทึกแล้ว — แต่ผลรวมน้ำหนัก = ${round(sumW, 2)} (ควรเท่ากับ 1.00)`;
      rerender();
    });
    container.querySelector("#reset-course").addEventListener("click", () => {
      if (confirm("คืนค่าเริ่มต้นเฉพาะรายวิชานี้? คะแนนและการตั้งค่าของรายวิชานี้จะถูกลบ")) {
        Store.resetCourse(courseId);
        rerender();
      }
    });
    container.querySelector("#reset-ca").addEventListener("click", () => {
      if (confirm("คืนค่าเริ่มต้นทั้งระบบ CA? ข้อมูลที่แก้ไขทุกรายวิชาจะถูกลบ")) {
        Store.reset();
        rerender();
      }
    });
  }

  function bindScores(container, courseId, def) {
    const focus = container.querySelector("#focus-clo");
    if (focus) focus.addEventListener("change", () => { _focusClo = focus.value; rerender(); });

    // กรอกคะแนน CLO โดยตรง
    container.querySelectorAll(".score-input").forEach((inp) => {
      inp.addEventListener("change", () => {
        const cs = Store.getCourse(courseId);
        const st = cs.students.find((x) => x.id === inp.dataset.sid);
        if (st) {
          st.scores = st.scores || {};
          const raw = inp.value.trim();
          let val = null;
          if (raw !== "") { const n = parseFloat(raw); if (!isNaN(n)) val = Math.max(0, Math.min(100, n)) / 100; }
          st.scores[inp.dataset.clo] = val;
          Store.saveStudents(courseId, cs.students);
        }
        rerender();
      });
    });

    // กรอกคะแนนองค์ประกอบย่อย
    container.querySelectorAll(".comp-input").forEach((inp) => {
      inp.addEventListener("change", () => {
        const cs = Store.getCourse(courseId);
        const st = cs.students.find((x) => x.id === inp.dataset.sid);
        if (st) {
          st.comp = st.comp || {};
          const raw = inp.value.trim();
          let val = null;
          if (raw !== "") { const n = parseFloat(raw); if (!isNaN(n)) val = Math.max(0, Math.min(100, n)); }
          if (val == null) delete st.comp[inp.dataset.comp];
          else st.comp[inp.dataset.comp] = val;
          Store.saveStudents(courseId, cs.students);
        }
        rerender();
      });
    });

    container.querySelectorAll(".del-student").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("ลบนักศึกษาคนนี้ออกจากรายวิชา?")) {
          const cs = Store.getCourse(courseId);
          Store.saveStudents(courseId, cs.students.filter((x) => x.id !== btn.dataset.sid));
          rerender();
        }
      });
    });

    container.querySelector("#add-student").addEventListener("click", () => {
      const sid = container.querySelector("#new-sid").value.trim();
      const name = container.querySelector("#new-name").value.trim();
      if (!sid || !name) { alert("กรุณากรอกรหัสนักศึกษาและชื่อ-สกุล"); return; }
      const cs = Store.getCourse(courseId);
      if (cs.students.some((x) => x.id === sid)) { alert("มีรหัสนักศึกษานี้อยู่แล้ว"); return; }
      cs.students.push({ id: sid, name, scores: {}, comp: {} });
      Store.saveStudents(courseId, cs.students);
      rerender();
    });

    const expBtn = container.querySelector("#export-csv");
    if (expBtn) expBtn.addEventListener("click", () => exportCsv(courseId, def));
    const impBtn = container.querySelector("#import-csv-btn");
    const impFile = container.querySelector("#import-file");
    if (impBtn && impFile) {
      impBtn.addEventListener("click", () => impFile.click());
      impFile.addEventListener("change", () => {
        const f = impFile.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => importCsv(courseId, def, reader.result, container);
        reader.readAsText(f, "utf-8");
      });
    }
  }

  function bindReport(container, courseId) {
    container.querySelector("#save-report").addEventListener("click", () => {
      Store.saveReport(courseId, {
        reflection: container.querySelector("#rep-reflection").value,
        cqi: container.querySelector("#rep-cqi").value,
        teachingEval: container.querySelector("#rep-eval").value,
      });
      container.querySelector("#report-msg").textContent = "บันทึกรายงานเรียบร้อย ✓";
    });
  }

  // ---------- ส่งออก CSV ----------
  function exportCsv(courseId, def) {
    const cs = Store.getCourse(courseId);
    const scale = scaleById(cs.setup.scaleIndex);
    const headers = [
      "Student_ID", "ชื่อ-สกุล",
      ...def.clos.map((c) => c.id + "%"),
      ...def.clos.map((c) => c.id + "_PASS"),
      "Overall_Status", "Course_Total%", "Grade",
    ];
    const lines = [headers.join(",")];
    cs.students.forEach((st) => {
      const ev = evalStudent(def, cs.setup, scale, st);
      const cells = [
        st.id, st.name,
        ...def.clos.map((c) => (ev.cloVal[c.id] == null ? "" : round(ev.cloVal[c.id] * 100, 2))),
        ...def.clos.map((c) => (ev.cloPass[c.id] == null ? "" : ev.cloPass[c.id] ? "PASS" : "FAIL")),
        ev.overall,
        ev.total == null ? "" : round(ev.total * 100, 2),
        ev.grade,
      ];
      lines.push(cells.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","));
    });
    download(`CA_${def.course.code}_scores.csv`, "﻿" + lines.join("\r\n"));
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- นำเข้า CSV ----------
  /** แปลงข้อความ CSV เป็น array ของ array (รองรับ field มีเครื่องหมายคำพูด/คอมมา/ขึ้นบรรทัด) */
  function parseCsv(text) {
    text = text.replace(/^﻿/, "");
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* ข้าม */ }
      else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  function importCsv(courseId, def, text, container) {
    const msg = container.querySelector("#scores-msg");
    let rows;
    try { rows = parseCsv(text); } catch (e) { msg.textContent = "อ่านไฟล์ไม่สำเร็จ"; return; }
    if (!rows.length) { msg.textContent = "ไฟล์ว่างเปล่า"; return; }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idCol = header.findIndex((h) => /student_?id|รหัส/.test(h));
    const nameCol = header.findIndex((h) => /name|ชื่อ/.test(h));
    // จับคู่คอลัมน์ CLO เช่น "clo1%" หรือ "clo1"
    const cloCols = {};
    def.clos.forEach((c) => {
      const key = c.id.toLowerCase();
      const idx = header.findIndex((h) => h.replace(/[%\s]/g, "") === key);
      if (idx >= 0) cloCols[c.id] = idx;
    });
    if (idCol < 0) { msg.textContent = "ไม่พบคอลัมน์รหัสนักศึกษา (Student_ID)"; return; }
    if (!Object.keys(cloCols).length) { msg.textContent = "ไม่พบคอลัมน์คะแนน CLO (เช่น CLO1%)"; return; }

    const cs = Store.getCourse(courseId);
    const byId = {};
    cs.students.forEach((s) => (byId[s.id] = s));
    let added = 0, updated = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const id = (r[idCol] || "").trim();
      if (!id) continue;
      let st = byId[id];
      if (!st) {
        st = { id, name: nameCol >= 0 ? (r[nameCol] || "").trim() : id, scores: {}, comp: {} };
        cs.students.push(st); byId[id] = st; added++;
      } else {
        if (nameCol >= 0 && (r[nameCol] || "").trim()) st.name = r[nameCol].trim();
        updated++;
      }
      st.scores = st.scores || {};
      Object.keys(cloCols).forEach((cloId) => {
        const raw = (r[cloCols[cloId]] || "").trim();
        if (raw === "") return;
        const n = parseFloat(raw.replace("%", ""));
        if (!isNaN(n)) st.scores[cloId] = Math.max(0, Math.min(100, n)) / 100;
      });
    }
    // นำเข้าเป็นคะแนน CLO โดยตรง — สลับรายวิชาเป็นโหมด CLO เพื่อให้คะแนนที่นำเข้าถูกใช้คำนวณ
    if (cs.setup.entryMode !== "clo") {
      cs.setup.entryMode = "clo";
      Store.saveSetup(courseId, cs.setup);
    }
    Store.saveStudents(courseId, cs.students);
    msg.textContent = `นำเข้าสำเร็จ ✓ เพิ่มใหม่ ${added} คน ปรับปรุง ${updated} คน` +
      (cs.setup.entryMode === "clo" ? "" : "");
    rerender();
  }

  // ---------- จุดเข้าหลัก ----------
  let _container = null, _sub = "";

  function rerender() { render(_container, ["ca", _sub].filter(Boolean)); }

  function render(container, parts) {
    _container = container;
    const sub = parts[1] || "";
    _sub = sub;
    const state = Store.getState();
    const courseId = state.currentCourseId;
    const def = courseDef(courseId);
    const cs = state.courses[courseId];

    let body;
    switch (sub) {
      case "criteria": body = viewCriteria(def, cs); break;
      case "setup": body = viewSetup(def, cs); break;
      case "scores": body = viewScores(def, cs); break;
      case "report": body = viewReport(def, cs); break;
      default: body = viewOverview(def, cs); break;
    }
    container.innerHTML = `<div class="ca-module">${subnav(sub, courseId)}${courseHeader(def, cs.setup)}${body}</div>`;
    window.scrollTo(0, 0);

    bindCommon(container);
    if (sub === "setup") bindSetup(container, courseId, def);
    else if (sub === "scores") bindScores(container, courseId, def);
    else if (sub === "report") bindReport(container, courseId);
  }

  window.CA = { render };
})();
