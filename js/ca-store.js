/**
 * ca-store.js — เก็บข้อมูลที่ผู้สอนแก้ไขในระบบ CA ลง localStorage
 * ครอบคลุม: การตั้งค่า (น้ำหนัก/เกณฑ์ผ่าน/สเกลเกรด), รายชื่อ+คะแนนนักศึกษา,
 *           และข้อความสรุปในรายงานรายวิชา (Reflection/CQI/ผลประเมินการสอน)
 *
 * ข้อมูลทั้งหมดอยู่ในเครื่องผู้ใช้ ไม่มีการส่งออกภายนอก
 */
(function () {
  const KEY = "anucha-ca-" + (window.CA_DATA?.CA_COURSE?.code || "course") + "-v1";

  // โคลนข้อมูลตั้งต้นแบบ deep copy เพื่อไม่ให้แก้ค่าใน CA_DATA โดยตรง
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function defaults() {
    const { CA_SETUP, CA_STUDENTS } = window.CA_DATA;
    return {
      setup: {
        weights: clone(CA_SETUP.weights),
        pass: clone(CA_SETUP.pass),
        scaleIndex: CA_SETUP.scaleIndex,
      },
      students: clone(CA_STUDENTS),
      report: { reflection: "", cqi: "", teachingEval: "" },
    };
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const saved = JSON.parse(raw);
      const d = defaults();
      // ผสานแบบตื้น ๆ เพื่อรองรับโครงสร้างที่เพิ่มภายหลัง
      return {
        setup: Object.assign(d.setup, saved.setup || {}),
        students: Array.isArray(saved.students) ? saved.students : d.students,
        report: Object.assign(d.report, saved.report || {}),
      };
    } catch (e) {
      console.warn("อ่านข้อมูล CA ไม่สำเร็จ ใช้ค่าเริ่มต้น", e);
      return defaults();
    }
  }

  function write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("บันทึกข้อมูล CA ไม่สำเร็จ", e);
    }
  }

  const CAStore = {
    getState: read,

    saveSetup(setup) {
      const s = read();
      s.setup = Object.assign(s.setup, setup);
      write(s);
      return s;
    },

    saveStudents(students) {
      const s = read();
      s.students = students;
      write(s);
      return s;
    },

    /** อัปเดตคะแนน CLO หนึ่งช่องของนักศึกษาคนหนึ่ง (value เป็นเศษส่วน 0–1 หรือ null) */
    updateScore(studentId, cloId, value) {
      const s = read();
      const st = s.students.find((x) => x.id === studentId);
      if (st) {
        st.scores = st.scores || {};
        st.scores[cloId] = value;
        write(s);
      }
      return s;
    },

    addStudent(student) {
      const s = read();
      s.students.push(student);
      write(s);
      return s;
    },

    removeStudent(studentId) {
      const s = read();
      s.students = s.students.filter((x) => x.id !== studentId);
      write(s);
      return s;
    },

    saveReport(report) {
      const s = read();
      s.report = Object.assign(s.report, report);
      write(s);
      return s;
    },

    /** คืนค่าเริ่มต้นทั้งหมด (ลบข้อมูลที่แก้ไข) */
    reset() {
      localStorage.removeItem(KEY);
      return defaults();
    },
  };

  window.CA_STORE = CAStore;
})();
