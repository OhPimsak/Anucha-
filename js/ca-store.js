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

  const baseReport = () => ({ reflection: "", cqi: "", teachingEval: "" });

  /** สร้าง state ราย course จากรายการนิยามรายวิชา (seed + custom) ผสานกับที่บันทึกไว้ */
  function buildCourseStates(defs, savedCourses) {
    const courses = {};
    defs.forEach((def) => {
      const sv = (savedCourses || {})[def.id] || {};
      courses[def.id] = {
        setup: Object.assign(clone(def.setup), sv.setup || {}),
        students: Array.isArray(sv.students) ? sv.students : clone(def.students || []),
        report: Object.assign(baseReport(), sv.report || {}),
      };
    });
    return courses;
  }

  function defaults() {
    const { CA_COURSES } = window.CA_DATA;
    return {
      currentCourseId: CA_COURSES[0].id,
      customCourses: [],
      courses: buildCourseStates(CA_COURSES, null),
    };
  }

  function read() {
    const { CA_COURSES } = window.CA_DATA;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const saved = JSON.parse(raw);
      const customCourses = Array.isArray(saved.customCourses) ? saved.customCourses : [];
      const defs = CA_COURSES.concat(customCourses);
      const courses = buildCourseStates(defs, saved.courses);
      const currentCourseId =
        saved.currentCourseId && courses[saved.currentCourseId]
          ? saved.currentCourseId
          : CA_COURSES[0].id;
      return { currentCourseId, customCourses, courses };
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

    /** เพิ่มรายวิชาที่ผู้ใช้สร้างเอง (เก็บนิยามไว้ใน customCourses) */
    addCourse(def) {
      const s = read();
      s.customCourses.push(def);
      s.courses[def.id] = {
        setup: clone(def.setup),
        students: clone(def.students || []),
        report: baseReport(),
      };
      s.currentCourseId = def.id;
      write(s);
      return s;
    },

    /** ลบรายวิชาที่ผู้ใช้สร้างเอง (ลบ seed ไม่ได้) */
    removeCourse(courseId) {
      const s = read();
      const isCustom = s.customCourses.some((c) => c.id === courseId);
      if (!isCustom) return s; // กันการลบรายวิชาตั้งต้น
      s.customCourses = s.customCourses.filter((c) => c.id !== courseId);
      delete s.courses[courseId];
      if (s.currentCourseId === courseId) s.currentCourseId = window.CA_DATA.CA_COURSES[0].id;
      write(s);
      return s;
    },

    /** ตรวจว่ารหัสรายวิชาซ้ำหรือไม่ (ทั้ง seed และ custom) */
    courseExists(courseId) {
      const { CA_COURSES } = window.CA_DATA;
      const s = read();
      return CA_COURSES.some((c) => c.id === courseId) || s.customCourses.some((c) => c.id === courseId);
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
