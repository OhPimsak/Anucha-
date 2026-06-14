/**
 * ca-store.js — เก็บข้อมูลที่ผู้สอนแก้ไขในระบบ CA (หลายรายวิชา) ลง localStorage
 *
 * โครงสร้างที่เก็บ:
 *   {
 *     currentCourseId: "<id>",
 *     courses: {
 *       "<courseId>": { setup, students[], report{reflection,cqi,teachingEval} }
 *     }
 *   }
 * ข้อมูลทั้งหมดอยู่ในเครื่องผู้ใช้ ไม่มีการส่งออกภายนอก
 */
(function () {
  const KEY = "anucha-ca-multi-v1";
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function defaults() {
    const { CA_COURSES } = window.CA_DATA;
    const courses = {};
    CA_COURSES.forEach((c) => {
      courses[c.id] = {
        setup: clone(c.setup),
        students: clone(c.students),
        report: { reflection: "", cqi: "", teachingEval: "" },
      };
    });
    return { currentCourseId: CA_COURSES[0].id, courses };
  }

  function read() {
    const d = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return d;
      const saved = JSON.parse(raw);
      // ผสานราย course เพื่อรองรับรายวิชาที่เพิ่มในภายหลัง
      const courses = {};
      Object.keys(d.courses).forEach((id) => {
        const base = d.courses[id];
        const sv = (saved.courses || {})[id] || {};
        courses[id] = {
          setup: Object.assign(clone(base.setup), sv.setup || {}),
          students: Array.isArray(sv.students) ? sv.students : base.students,
          report: Object.assign(clone(base.report), sv.report || {}),
        };
      });
      const currentCourseId =
        saved.currentCourseId && courses[saved.currentCourseId]
          ? saved.currentCourseId
          : d.currentCourseId;
      return { currentCourseId, courses };
    } catch (e) {
      console.warn("อ่านข้อมูล CA ไม่สำเร็จ ใช้ค่าเริ่มต้น", e);
      return d;
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

    getCourse(courseId) {
      return read().courses[courseId] || null;
    },

    setCurrentCourse(courseId) {
      const s = read();
      if (s.courses[courseId]) {
        s.currentCourseId = courseId;
        write(s);
      }
      return s;
    },

    saveSetup(courseId, setup) {
      const s = read();
      s.courses[courseId].setup = Object.assign(s.courses[courseId].setup, setup);
      write(s);
      return s;
    },

    saveStudents(courseId, students) {
      const s = read();
      s.courses[courseId].students = students;
      write(s);
      return s;
    },

    saveReport(courseId, report) {
      const s = read();
      s.courses[courseId].report = Object.assign(s.courses[courseId].report, report);
      write(s);
      return s;
    },

    /** คืนค่าเริ่มต้นทั้งระบบ (ทุกรายวิชา) */
    reset() {
      localStorage.removeItem(KEY);
      return defaults();
    },

    /** คืนค่าเริ่มต้นเฉพาะรายวิชาเดียว */
    resetCourse(courseId) {
      const s = read();
      const { CA_COURSES } = window.CA_DATA;
      const def = CA_COURSES.find((c) => c.id === courseId);
      if (def) {
        s.courses[courseId] = {
          setup: clone(def.setup),
          students: clone(def.students),
          report: { reflection: "", cqi: "", teachingEval: "" },
        };
        write(s);
      }
      return s;
    },
  };

  window.CA_STORE = CAStore;
})();
