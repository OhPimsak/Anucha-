/**
 * store.js — จัดการความก้าวหน้าการเรียนรู้ของผู้เรียน
 * เก็บข้อมูลใน localStorage ของเบราว์เซอร์ ไม่มีการส่งข้อมูลออกภายนอก
 *
 * โครงสร้างที่เก็บ:
 *   {
 *     completed: { "<lessonId>": true, ... },   // บทเรียนที่เรียนจบ
 *     quiz:      { "<lessonId>": { correct: bool, choice: number }, ... }
 *   }
 */
(function () {
  const KEY = "anucha-lms-progress-v1";

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { completed: {}, quiz: {} };
      const data = JSON.parse(raw);
      return {
        completed: data.completed || {},
        quiz: data.quiz || {},
      };
    } catch (e) {
      console.warn("อ่านข้อมูลความก้าวหน้าไม่สำเร็จ, เริ่มใหม่", e);
      return { completed: {}, quiz: {} };
    }
  }

  function write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("บันทึกข้อมูลความก้าวหน้าไม่สำเร็จ", e);
    }
  }

  const Store = {
    getState() {
      return read();
    },

    isLessonComplete(lessonId) {
      return !!read().completed[lessonId];
    },

    setLessonComplete(lessonId, value) {
      const state = read();
      if (value) {
        state.completed[lessonId] = true;
      } else {
        delete state.completed[lessonId];
      }
      write(state);
      return state;
    },

    getQuizResult(lessonId) {
      return read().quiz[lessonId] || null;
    },

    setQuizResult(lessonId, choice, correct) {
      const state = read();
      state.quiz[lessonId] = { choice, correct };
      write(state);
      return state;
    },

    /** นับจำนวนบทเรียนทั้งหมดในรายวิชา */
    countLessons(course) {
      return course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
    },

    /** นับบทเรียนที่เรียนจบในรายวิชา */
    countCompleted(course) {
      const completed = read().completed;
      let n = 0;
      course.modules.forEach((m) =>
        m.lessons.forEach((l) => {
          if (completed[l.id]) n += 1;
        })
      );
      return n;
    },

    /** เปอร์เซ็นต์ความก้าวหน้าของรายวิชา (0-100) */
    courseProgress(course) {
      const total = this.countLessons(course);
      if (total === 0) return 0;
      return Math.round((this.countCompleted(course) / total) * 100);
    },

    /** ล้างข้อมูลความก้าวหน้าทั้งหมด */
    reset() {
      write({ completed: {}, quiz: {} });
    },
  };

  window.LMS_STORE = Store;
})();
