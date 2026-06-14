/**
 * ca.js — ระบบ CA (Course Assessment) แบบ OBE
 * เชื่อม PLO → CLO → Skill ของหลักสูตร เข้ากับการกรอกคะแนนและการตัดเกรดอัตโนมัติ
 *
 * หน้าย่อย (เข้าผ่าน hash routing ของ app.js):
 *   #/ca           ภาพรวมรายวิชา + แผนการสอนราย CLO/สัปดาห์ (CA)
 *   #/ca/criteria  เกณฑ์การบรรลุ CLO และสัดส่วนคะแนน
 *   #/ca/setup     ตั้งค่าน้ำหนัก CLO / เกณฑ์ผ่าน / สเกลเกรด
 *   #/ca/scores    กรอกคะแนนรายบุคคล (คำนวณผล/เกรดอัตโนมัติ)
 *   #/ca/report    รายงานสรุปรายวิชา (CLO attainment, การกระจายเกรด, GPA)
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

  // ---------- เครื่องคำนวณผลลัพธ์ (Assessment Engine) ----------
  function currentScale(setup) {
    return D.CA_SETUP.scales.find((s) => s.id === setup.scaleIndex) || D.CA_SETUP.scales[0];
  }

  function gradeFromTotal(total, scale) {
    for (const [th, g] of scale.bands) {
      if (total >= th) return g;
    }
    return "F";
  }

  /** ประเมินผลของนักศึกษาหนึ่งคน */
  function evalStudent(st, setup, scale) {
    const scores = st.scores || {};
    const cloPass = {};
    let total = 0;
    let hasAll = true;
    D.CA_CLOS.forEach((c) => {
      const v = scores[c.id];
      if (v == null || v === "" || isNaN(v)) {
        hasAll = false;
        cloPass[c.id] = null;
      } else {
        cloPass[c.id] = v >= setup.pass[c.id];
        total += v * setup.weights[c.id];
      }
    });
    if (!hasAll) return { cloPass, hasAll: false, overall: "IP", total: null, grade: "IP" };
    const overall = D.CA_CLOS.every((c) => cloPass[c.id]) ? "PASS" : "FAIL";
    return { cloPass, hasAll: true, overall, total, grade: gradeFromTotal(total, scale) };
  }

  /** สรุปผลทั้งรายวิชา */
  function courseReport(state) {
    const { setup, students } = state;
    const scale = currentScale(setup);
    const evals = students.map((st) => ({ st, ev: evalStudent(st, setup, scale) }));
    const completed = evals.filter((e) => e.ev.hasAll);
    const ip = students.length - completed.length;
    const passCount = completed.filter((e) => e.ev.overall === "PASS").length;

    const cloStats = {};
    D.CA_CLOS.forEach((c) => {
      const vals = students
        .map((s) => (s.scores ? s.scores[c.id] : null))
        .filter((v) => v != null && v !== "" && !isNaN(v));
      const sum = vals.reduce((a, b) => a + b, 0);
      const passN = vals.filter((v) => v >= setup.pass[c.id]).length;
      cloStats[c.id] = {
        avg: vals.length ? sum / vals.length : 0,
        passRate: vals.length ? passN / vals.length : 0,
        count: vals.length,
      };
    });

    const avgTotal = completed.length
      ? completed.reduce((a, e) => a + e.ev.total, 0) / completed.length
      : 0;

    const order = ["A", "B+", "B", "C+", "C", "D+", "D", "F"];
    const dist = {};
    order.forEach((g) => (dist[g] = 0));
    completed.forEach((e) => (dist[e.ev.grade] = (dist[e.ev.grade] || 0) + 1));

    const gp = D.CA_SETUP.gradePoints;
    let pts = 0;
    completed.forEach((e) => (pts += gp[e.ev.grade] || 0));
    const gpa = completed.length ? pts / completed.length : 0;

    return {
      n: students.length, ip, completed: completed.length, passCount,
      passRate: completed.length ? passCount / completed.length : 0,
      cloStats, avgTotal, dist, gpa, order, evals,
    };
  }

  // ---------- แถบเมนูย่อยของระบบ CA ----------
  function subnav(active) {
    const tabs = [
      ["", "ภาพรวม (CA)"],
      ["criteria", "เกณฑ์การบรรลุ CLO"],
      ["setup", "ตั้งค่า"],
      ["scores", "กรอกคะแนน"],
      ["report", "รายงานรายวิชา"],
    ];
    return `<nav class="ca-subnav">${tabs
      .map(
        ([k, label]) =>
          `<a href="#/ca${k ? "/" + k : ""}" data-link class="${active === k ? "active" : ""}">${label}</a>`
      )
      .join("")}</nav>`;
  }

  function courseHeader() {
    const c = D.CA_COURSE;
    return `
      <div class="ca-coursebar">
        <div>
          <span class="badge" style="--accent:#0f766e">${esc(c.code)}</span>
          <strong>${esc(c.name)}</strong>
        </div>
        <div class="muted">หน่วยกิต ${esc(c.credits)} · ภาคเรียน ${esc(c.semester)} · ${esc(c.instructors.join(", "))}</div>
      </div>`;
  }

  // ---------- หน้าภาพรวม (CA) ----------
  function viewOverview() {
    const c = D.CA_COURSE;
    const plos = c.plos
      .map((p) => `<li><strong>${esc(p.id)}:</strong> ${esc(p.text)}</li>`)
      .join("");

    const rows = D.CA_WEEKS.map((w) => `
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
      ${subnav("")}
      ${courseHeader()}
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
            <thead>
              <tr>
                <th>สัปดาห์</th><th>PLO</th><th>CLO</th><th>Skill / ระดับ</th>
                <th>วิธีประเมิน</th><th>เครื่องมือ</th><th>เกณฑ์การบรรลุ</th><th>ประเภท</th>
                <th>ทฤษฎี</th><th>ปฏิบัติ/กิจกรรม</th><th>ศึกษาด้วยตนเอง</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>`;
  }

  // ---------- หน้าเกณฑ์การบรรลุ CLO ----------
  function viewCriteria() {
    const blocks = D.CA_CLOS.map((c) => {
      const sumW = c.components.reduce((a, x) => a + (x.weight || 0), 0);
      const rows = c.components
        .map((m) => `
          <tr>
            <td>${esc(m.method)}</td>
            <td class="num">${esc(m.weight)}</td>
            <td>${esc(m.detail)}</td>
            <td class="num">${esc(m.count)}</td>
            <td class="num">${esc(m.hours)}</td>
            <td>${esc(m.tool)}</td>
            <td>${esc(m.feedback)}</td>
            <td>${esc(m.when)}</td>
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

    return `${subnav("criteria")}${courseHeader()}
      <p class="muted">สัดส่วนคะแนนของแต่ละองค์ประกอบใช้รวมกันเป็นคะแนน CLO (เต็ม 100 ต่อ CLO) ก่อนถ่วงน้ำหนักเป็นคะแนนรวมรายวิชาในหน้า “ตั้งค่า”</p>
      ${blocks}`;
  }

  // ---------- หน้าตั้งค่า ----------
  function viewSetup(state) {
    const s = state.setup;
    const sumW = D.CA_CLOS.reduce((a, c) => a + (s.weights[c.id] || 0), 0);
    const wRows = D.CA_CLOS.map((c) => `
      <tr>
        <td>${esc(c.id)} <span class="muted">(${esc(c.plo)})</span></td>
        <td><input type="number" class="cell-input" data-kind="weight" data-clo="${c.id}" min="0" max="1" step="0.05" value="${s.weights[c.id]}"></td>
        <td><input type="number" class="cell-input" data-kind="pass" data-clo="${c.id}" min="0" max="1" step="0.05" value="${s.pass[c.id]}"></td>
      </tr>`).join("");

    const scaleOpts = D.CA_SETUP.scales
      .map((sc) => `<option value="${sc.id}" ${sc.id === s.scaleIndex ? "selected" : ""}>${esc(sc.name)}</option>`)
      .join("");

    const scale = currentScale(s);
    const bandRows = scale.bands
      .filter(([th]) => th > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([th, g]) => `<tr><td>≥ ${pct(th, 0)}</td><td><strong>${g}</strong></td></tr>`)
      .join("");

    return `${subnav("setup")}${courseHeader()}
      <section class="ca-grid">
        <div class="card">
          <h3>น้ำหนัก CLO และเกณฑ์ผ่าน</h3>
          <table class="ca-table compact">
            <thead><tr><th>CLO</th><th>น้ำหนัก (รวม = 1.00)</th><th>เกณฑ์ผ่าน (เศษส่วน)</th></tr></thead>
            <tbody>${wRows}</tbody>
            <tfoot><tr><td>รวมน้ำหนัก</td><td id="weight-sum" class="${Math.abs(sumW - 1) < 1e-9 ? "ok" : "warn"}">${round(sumW, 2)}</td><td></td></tr></tfoot>
          </table>
          <div class="form-row">
            <label>สเกลการตัดเกรด</label>
            <select id="scale-select" class="cell-input">${scaleOpts}</select>
          </div>
          <div class="ca-actions">
            <button class="btn btn-primary" id="save-setup">บันทึกการตั้งค่า</button>
            <button class="btn btn-outline" id="reset-ca">คืนค่าเริ่มต้นทั้งระบบ</button>
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
  function viewScores(state) {
    const scale = currentScale(state.setup);
    const head = D.CA_CLOS.map((c) => `<th class="num">${esc(c.id)}%</th>`).join("");
    const passHead = D.CA_CLOS.map((c) => `<th>${esc(c.id)}</th>`).join("");

    const rows = state.students.map((st, idx) => {
      const ev = evalStudent(st, state.setup, scale);
      const inputs = D.CA_CLOS.map((c) => {
        const v = st.scores ? st.scores[c.id] : null;
        const shown = v == null || v === "" || isNaN(v) ? "" : round(v * 100, 2);
        return `<td><input type="number" class="score-input" data-sid="${esc(st.id)}" data-clo="${c.id}" min="0" max="100" step="0.01" value="${shown}" placeholder="–"></td>`;
      }).join("");
      const passCells = D.CA_CLOS.map((c) => {
        const p = ev.cloPass[c.id];
        const cls = p == null ? "ip" : p ? "pass" : "fail";
        const txt = p == null ? "–" : p ? "ผ่าน" : "ไม่ผ่าน";
        return `<td><span class="pill ${cls}">${txt}</span></td>`;
      }).join("");
      const overallCls = ev.overall === "PASS" ? "pass" : ev.overall === "FAIL" ? "fail" : "ip";
      return `
        <tr>
          <td class="num muted">${idx + 1}</td>
          <td class="nowrap">${esc(st.id)}</td>
          <td>${esc(st.name)}</td>
          ${inputs}
          ${passCells}
          <td><span class="pill ${overallCls}">${ev.overall}</span></td>
          <td class="num">${ev.total == null ? "–" : pct(ev.total, 2)}</td>
          <td class="num"><strong>${ev.grade}</strong></td>
          <td><button class="icon-btn del-student" data-sid="${esc(st.id)}" title="ลบ">✕</button></td>
        </tr>`;
    }).join("");

    return `${subnav("scores")}${courseHeader()}
      <div class="ca-toolbar">
        <span class="muted">กรอกคะแนน CLO เป็นร้อยละ (0–100) ระบบคำนวณผลผ่าน คะแนนรวม และเกรดอัตโนมัติ · สเกล: <strong>${esc(scale.name)}</strong></span>
        <div class="ca-actions">
          <button class="btn btn-outline" id="export-csv">ส่งออก CSV</button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="ca-table score-table">
          <thead>
            <tr>
              <th>#</th><th>รหัสนักศึกษา</th><th>ชื่อ-สกุล</th>
              ${head}
              ${passHead}
              <th>สรุป</th><th>รวม%</th><th>เกรด</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="card add-student">
        <h3>เพิ่มนักศึกษา</h3>
        <div class="form-inline">
          <input type="text" id="new-sid" class="cell-input" placeholder="รหัสนักศึกษา">
          <input type="text" id="new-name" class="cell-input" placeholder="ชื่อ-สกุล">
          <button class="btn btn-primary" id="add-student">เพิ่ม</button>
        </div>
      </div>`;
  }

  // ---------- หน้ารายงานรายวิชา ----------
  function viewReport(state) {
    const r = courseReport(state);
    const scale = currentScale(state.setup);

    const cloRows = D.CA_CLOS.map((c) => {
      const s = r.cloStats[c.id];
      return `<tr>
        <td>${esc(c.id)}</td>
        <td>${esc(c.text)}</td>
        <td class="num">${pct(s.avg, 1)}</td>
        <td class="num">${pct(s.passRate, 0)}</td>
      </tr>`;
    }).join("");

    const distRows = r.order.map((g) => {
      const n = r.dist[g] || 0;
      const p = r.completed ? (n / r.completed) * 100 : 0;
      return `<tr><td><strong>${g}</strong></td><td class="num">${n}</td><td class="num">${p.toFixed(1)}%</td>
        <td><span class="bar" style="width:${p}%"></span></td></tr>`;
    }).join("");

    const rep = state.report;
    return `${subnav("report")}${courseHeader()}
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

  // ---------- การผูกเหตุการณ์หลังเรนเดอร์ ----------
  function bind(container, sub) {
    if (sub === "setup") bindSetup(container);
    else if (sub === "scores") bindScores(container);
    else if (sub === "report") bindReport(container);
  }

  function bindSetup(container) {
    const save = container.querySelector("#save-setup");
    const msg = container.querySelector("#setup-msg");
    save.addEventListener("click", () => {
      const setup = Store.getState().setup;
      container.querySelectorAll('[data-kind]').forEach((inp) => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) setup[inp.dataset.kind][inp.dataset.clo] = v;
      });
      setup.scaleIndex = parseInt(container.querySelector("#scale-select").value, 10);
      const sumW = D.CA_CLOS.reduce((a, c) => a + (setup.weights[c.id] || 0), 0);
      Store.saveSetup(setup);
      msg.textContent =
        Math.abs(sumW - 1) < 1e-9
          ? "บันทึกเรียบร้อย ✓"
          : `บันทึกแล้ว — แต่ผลรวมน้ำหนัก = ${round(sumW, 2)} (ควรเท่ากับ 1.00)`;
      rerender();
    });
    container.querySelector("#reset-ca").addEventListener("click", () => {
      if (confirm("คืนค่าเริ่มต้นทั้งระบบ CA? คะแนนและการตั้งค่าที่แก้ไขจะถูกลบทั้งหมด")) {
        Store.reset();
        rerender();
      }
    });
  }

  function bindScores(container) {
    container.querySelectorAll(".score-input").forEach((inp) => {
      inp.addEventListener("change", () => {
        const raw = inp.value.trim();
        let val = null;
        if (raw !== "") {
          const num = parseFloat(raw);
          if (!isNaN(num)) val = Math.max(0, Math.min(100, num)) / 100;
        }
        Store.updateScore(inp.dataset.sid, inp.dataset.clo, val);
        rerender();
      });
    });
    container.querySelectorAll(".del-student").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("ลบนักศึกษาคนนี้ออกจากรายวิชา?")) {
          Store.removeStudent(btn.dataset.sid);
          rerender();
        }
      });
    });
    container.querySelector("#add-student").addEventListener("click", () => {
      const sid = container.querySelector("#new-sid").value.trim();
      const name = container.querySelector("#new-name").value.trim();
      if (!sid || !name) {
        alert("กรุณากรอกรหัสนักศึกษาและชื่อ-สกุล");
        return;
      }
      Store.addStudent({ id: sid, name, scores: {} });
      rerender();
    });
    const exp = container.querySelector("#export-csv");
    if (exp) exp.addEventListener("click", exportCsv);
  }

  function bindReport(container) {
    container.querySelector("#save-report").addEventListener("click", () => {
      Store.saveReport({
        reflection: container.querySelector("#rep-reflection").value,
        cqi: container.querySelector("#rep-cqi").value,
        teachingEval: container.querySelector("#rep-eval").value,
      });
      container.querySelector("#report-msg").textContent = "บันทึกรายงานเรียบร้อย ✓";
    });
  }

  // ---------- ส่งออก CSV ----------
  function exportCsv() {
    const state = Store.getState();
    const scale = currentScale(state.setup);
    const headers = [
      "Student_ID", "ชื่อ-สกุล",
      ...D.CA_CLOS.map((c) => c.id + "%"),
      ...D.CA_CLOS.map((c) => c.id + "_PASS"),
      "Overall_Status", "Course_Total%", "Grade",
    ];
    const lines = [headers.join(",")];
    state.students.forEach((st) => {
      const ev = evalStudent(st, state.setup, scale);
      const cells = [
        st.id, st.name,
        ...D.CA_CLOS.map((c) => {
          const v = st.scores ? st.scores[c.id] : null;
          return v == null || isNaN(v) ? "" : round(v * 100, 2);
        }),
        ...D.CA_CLOS.map((c) => (ev.cloPass[c.id] == null ? "" : ev.cloPass[c.id] ? "PASS" : "FAIL")),
        ev.overall,
        ev.total == null ? "" : round(ev.total * 100, 2),
        ev.grade,
      ];
      lines.push(cells.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","));
    });
    const csv = "﻿" + lines.join("\r\n"); // BOM เพื่อให้ Excel อ่านภาษาไทยได้
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CA_${D.CA_COURSE.code}_scores.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- จุดเข้าหลัก ----------
  let _container = null;
  let _sub = "";

  function rerender() {
    render(_container, ["ca", _sub].filter(Boolean));
  }

  function render(container, parts) {
    _container = container;
    const sub = parts[1] || "";
    _sub = sub;
    const state = Store.getState();
    let html;
    switch (sub) {
      case "criteria": html = viewCriteria(); break;
      case "setup": html = viewSetup(state); break;
      case "scores": html = viewScores(state); break;
      case "report": html = viewReport(state); break;
      default: html = viewOverview(); break;
    }
    container.innerHTML = `<div class="ca-module">${html}</div>`;
    window.scrollTo(0, 0);
    bind(container, sub);
  }

  window.CA = { render };
})();
