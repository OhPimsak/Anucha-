/**
 * app.js — ตรรกะหลักของระบบจัดการเรียนรู้ (SPA)
 * ใช้ hash-based routing ทำงานได้แม้เปิดไฟล์ตรง ๆ ในเบราว์เซอร์
 */
(function () {
  const { INSTRUCTOR, COURSES } = window.LMS_DATA;
  const Store = window.LMS_STORE;
  const app = document.getElementById("app");

  // ---------- ยูทิลิตี้ ----------
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  const findCourse = (id) => COURSES.find((c) => c.id === id);

  function findLesson(course, lessonId) {
    for (const m of course.modules) {
      const l = m.lessons.find((x) => x.id === lessonId);
      if (l) return { module: m, lesson: l };
    }
    return null;
  }

  /** คืนบทเรียนถัดไป (ข้ามโมดูล) หรือ null ถ้าจบแล้ว */
  function nextLesson(course, lessonId) {
    const flat = [];
    course.modules.forEach((m) => m.lessons.forEach((l) => flat.push(l)));
    const idx = flat.findIndex((l) => l.id === lessonId);
    return idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;
  }

  function progressBar(pct, color) {
    return `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <span style="width:${pct}%;background:${color || "#2563eb"}"></span>
    </div>`;
  }

  // ---------- หน้าต่าง ๆ ----------
  function viewHome() {
    const cards = COURSES.map((c) => {
      const pct = Store.courseProgress(c);
      return `
        <a class="course-card" href="#/course/${c.id}" data-link style="--accent:${c.color}">
          <div class="course-card-top">
            <span class="badge">${esc(c.code)}</span>
            <span class="muted">${c.credits} หน่วยกิต</span>
          </div>
          <h3>${esc(c.title)}</h3>
          <p class="muted">${esc(c.summary)}</p>
          ${progressBar(pct, c.color)}
          <span class="course-card-progress">${pct}% เรียนจบ</span>
        </a>`;
    }).join("");

    return `
      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">ระบบจัดการเรียนรู้ออนไลน์</p>
          <h1>เรียนรู้ไปกับ<br />${esc(INSTRUCTOR.name)}</h1>
          <p class="lead">${esc(INSTRUCTOR.bio)}</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/courses" data-link>ดูรายวิชาทั้งหมด</a>
            <a class="btn btn-ghost" href="#/about" data-link>เกี่ยวกับผู้สอน</a>
          </div>
        </div>
        <div class="hero-stats">
          <div class="stat"><strong>${COURSES.length}</strong><span>รายวิชา</span></div>
          <div class="stat"><strong>${COURSES.reduce((s, c) => s + Store.countLessons(c), 0)}</strong><span>บทเรียน</span></div>
          <div class="stat"><strong>${INSTRUCTOR.expertise.length}</strong><span>สาขาเชี่ยวชาญ</span></div>
        </div>
      </section>

      <section>
        <div class="section-head">
          <h2>รายวิชาแนะนำ</h2>
          <a href="#/courses" data-link class="link">ทั้งหมด →</a>
        </div>
        <div class="course-grid">${cards}</div>
      </section>`;
  }

  function viewCourses() {
    const cards = COURSES.map((c) => {
      const pct = Store.courseProgress(c);
      return `
        <a class="course-card" href="#/course/${c.id}" data-link style="--accent:${c.color}">
          <div class="course-card-top">
            <span class="badge">${esc(c.code)}</span>
            <span class="muted">${esc(c.level)}</span>
          </div>
          <h3>${esc(c.title)}</h3>
          <p class="muted">${esc(c.summary)}</p>
          ${progressBar(pct, c.color)}
          <span class="course-card-progress">${pct}% เรียนจบ · ${Store.countLessons(c)} บทเรียน</span>
        </a>`;
    }).join("");

    return `
      <nav class="breadcrumb"><a href="#/" data-link>หน้าแรก</a> / รายวิชา</nav>
      <div class="section-head"><h1>รายวิชาทั้งหมด</h1></div>
      <div class="course-grid">${cards}</div>`;
  }

  function viewCourse(id) {
    const course = findCourse(id);
    if (!course) return viewNotFound();
    const pct = Store.courseProgress(course);

    const modules = course.modules
      .map((m) => {
        const lessons = m.lessons
          .map((l) => {
            const done = Store.isLessonComplete(l.id);
            return `
              <a class="lesson-row ${done ? "done" : ""}" href="#/course/${course.id}/lesson/${l.id}" data-link>
                <span class="lesson-check">${done ? "✓" : ""}</span>
                <span class="lesson-title">${esc(l.title)}</span>
                <span class="lesson-meta">${esc(l.type)} · ${l.duration} นาที</span>
              </a>`;
          })
          .join("");
        return `<div class="module"><h3>${esc(m.title)}</h3><div class="lesson-list">${lessons}</div></div>`;
      })
      .join("");

    const objectives = course.objectives
      .map((o) => `<li>${esc(o)}</li>`)
      .join("");

    return `
      <nav class="breadcrumb"><a href="#/" data-link>หน้าแรก</a> / <a href="#/courses" data-link>รายวิชา</a> / ${esc(course.code)}</nav>
      <section class="course-hero" style="--accent:${course.color}">
        <span class="badge">${esc(course.code)} · ${esc(course.level)} · ${course.credits} หน่วยกิต</span>
        <h1>${esc(course.title)}</h1>
        <p class="lead">${esc(course.description)}</p>
        ${progressBar(pct, course.color)}
        <span class="course-card-progress">${pct}% เรียนจบ (${Store.countCompleted(course)}/${Store.countLessons(course)} บทเรียน)</span>
      </section>

      <section class="course-body">
        <div class="course-main">
          <h2>เนื้อหารายวิชา</h2>
          ${modules}
        </div>
        <aside class="course-aside">
          <div class="card">
            <h3>จุดประสงค์การเรียนรู้</h3>
            <ul class="check-list">${objectives}</ul>
          </div>
          <div class="card">
            <h3>ผู้สอน</h3>
            <p><strong>${esc(INSTRUCTOR.name)}</strong></p>
            <p class="muted">${esc(INSTRUCTOR.nameEn)}</p>
          </div>
        </aside>
      </section>`;
  }

  function viewLesson(courseId, lessonId) {
    const course = findCourse(courseId);
    if (!course) return viewNotFound();
    const found = findLesson(course, lessonId);
    if (!found) return viewNotFound();
    const { module, lesson } = found;

    const done = Store.isLessonComplete(lesson.id);
    const paragraphs = lesson.content.map((p) => `<p>${esc(p)}</p>`).join("");
    const next = nextLesson(course, lesson.id);

    const quizHtml = lesson.quiz ? renderQuiz(lesson) : "";

    const nextBtn = next
      ? `<a class="btn btn-primary" href="#/course/${course.id}/lesson/${next.id}" data-link>บทเรียนถัดไป →</a>`
      : `<a class="btn btn-primary" href="#/course/${course.id}" data-link>กลับสู่รายวิชา</a>`;

    return `
      <nav class="breadcrumb">
        <a href="#/" data-link>หน้าแรก</a> /
        <a href="#/course/${course.id}" data-link>${esc(course.code)}</a> /
        บทเรียน
      </nav>
      <article class="lesson" style="--accent:${course.color}">
        <p class="eyebrow">${esc(module.title)}</p>
        <h1>${esc(lesson.title)}</h1>
        <p class="muted lesson-meta-line">${esc(lesson.type)} · ใช้เวลาประมาณ ${lesson.duration} นาที</p>
        <div class="lesson-content">${paragraphs}</div>
        ${quizHtml}
        <div class="lesson-actions">
          <button class="btn ${done ? "btn-success" : "btn-outline"}" id="toggle-complete" data-lesson="${lesson.id}">
            ${done ? "✓ เรียนจบแล้ว" : "ทำเครื่องหมายว่าเรียนจบ"}
          </button>
          ${nextBtn}
        </div>
      </article>`;
  }

  function renderQuiz(lesson) {
    const q = lesson.quiz;
    const prev = Store.getQuizResult(lesson.id);
    const options = q.options
      .map(
        (opt, i) => `
        <button class="quiz-option" data-choice="${i}">
          <span class="quiz-letter">${String.fromCharCode(65 + i)}</span>
          <span>${esc(opt)}</span>
        </button>`
      )
      .join("");

    return `
      <div class="quiz" data-lesson="${lesson.id}" data-answer="${q.answer}">
        <h3>แบบฝึกท้ายบท</h3>
        <p class="quiz-question">${esc(q.question)}</p>
        <div class="quiz-options">${options}</div>
        <div class="quiz-feedback" data-explain="${esc(q.explain)}">${
          prev
            ? `<span class="${prev.correct ? "correct" : "incorrect"}">${
                prev.correct ? "✓ ถูกต้อง! " : "✗ ยังไม่ถูก "
              }${esc(q.explain)}</span>`
            : ""
        }</div>
      </div>`;
  }

  function viewAbout() {
    const exp = INSTRUCTOR.expertise.map((e) => `<li>${esc(e)}</li>`).join("");
    const courseLinks = COURSES.map(
      (c) => `<li><a href="#/course/${c.id}" data-link>${esc(c.title)}</a></li>`
    ).join("");
    return `
      <nav class="breadcrumb"><a href="#/" data-link>หน้าแรก</a> / เกี่ยวกับผู้สอน</nav>
      <section class="about">
        <div class="about-avatar">${esc(INSTRUCTOR.name.replace(/[^อ-๛]/, "").slice(0, 1) || "อ")}</div>
        <div>
          <h1>${esc(INSTRUCTOR.name)}</h1>
          <p class="muted">${esc(INSTRUCTOR.nameEn)}</p>
          <p class="lead">${esc(INSTRUCTOR.bio)}</p>
          <p><a class="link" href="mailto:${esc(INSTRUCTOR.email)}">${esc(INSTRUCTOR.email)}</a></p>
        </div>
      </section>
      <section class="course-body">
        <div class="card">
          <h3>สาขาความเชี่ยวชาญ</h3>
          <ul class="check-list">${exp}</ul>
        </div>
        <div class="card">
          <h3>รายวิชาที่สอน</h3>
          <ul class="link-list">${courseLinks}</ul>
        </div>
      </section>`;
  }

  function viewProgress() {
    const rows = COURSES.map((c) => {
      const pct = Store.courseProgress(c);
      return `
        <div class="progress-row">
          <div class="progress-row-head">
            <a href="#/course/${c.id}" data-link>${esc(c.title)}</a>
            <span class="muted">${Store.countCompleted(c)}/${Store.countLessons(c)} บทเรียน</span>
          </div>
          ${progressBar(pct, c.color)}
        </div>`;
    }).join("");

    const totalLessons = COURSES.reduce((s, c) => s + Store.countLessons(c), 0);
    const totalDone = COURSES.reduce((s, c) => s + Store.countCompleted(c), 0);
    const overall = totalLessons ? Math.round((totalDone / totalLessons) * 100) : 0;

    return `
      <nav class="breadcrumb"><a href="#/" data-link>หน้าแรก</a> / ความก้าวหน้า</nav>
      <div class="section-head"><h1>ความก้าวหน้าของฉัน</h1></div>
      <section class="overall-card">
        <div class="overall-pct">${overall}%</div>
        <div>
          <p>คุณเรียนจบไปแล้ว <strong>${totalDone}</strong> จาก <strong>${totalLessons}</strong> บทเรียน</p>
          ${progressBar(overall, "#2563eb")}
        </div>
      </section>
      <section class="progress-list">${rows}</section>
      <button class="btn btn-outline" id="reset-progress">ล้างความก้าวหน้าทั้งหมด</button>`;
  }

  function viewNotFound() {
    return `
      <section class="notfound">
        <h1>ไม่พบหน้านี้</h1>
        <p class="muted">ลิงก์อาจไม่ถูกต้อง หรือเนื้อหาถูกย้ายแล้ว</p>
        <a class="btn btn-primary" href="#/" data-link>กลับหน้าแรก</a>
      </section>`;
  }

  // ---------- จัดการเหตุการณ์หลังเรนเดอร์ ----------
  function bindLessonEvents() {
    const toggle = document.getElementById("toggle-complete");
    if (toggle) {
      toggle.addEventListener("click", () => {
        const id = toggle.dataset.lesson;
        const newVal = !Store.isLessonComplete(id);
        Store.setLessonComplete(id, newVal);
        render(); // เรนเดอร์ใหม่เพื่ออัปเดตสถานะ
      });
    }

    const quiz = document.querySelector(".quiz");
    if (quiz) {
      const answer = parseInt(quiz.dataset.answer, 10);
      const lessonId = quiz.dataset.lesson;
      const feedback = quiz.querySelector(".quiz-feedback");
      const explain = feedback.dataset.explain;

      // คืนสถานะคำตอบเดิม (ถ้ามี)
      const prev = Store.getQuizResult(lessonId);
      if (prev) markQuizChoice(quiz, prev.choice, answer);

      quiz.querySelectorAll(".quiz-option").forEach((btn) => {
        btn.addEventListener("click", () => {
          const choice = parseInt(btn.dataset.choice, 10);
          const correct = choice === answer;
          Store.setQuizResult(lessonId, choice, correct);
          markQuizChoice(quiz, choice, answer);
          feedback.innerHTML = `<span class="${correct ? "correct" : "incorrect"}">${
            correct ? "✓ ถูกต้อง! " : "✗ ยังไม่ถูก "
          }${esc(explain)}</span>`;
        });
      });
    }
  }

  function markQuizChoice(quiz, choice, answer) {
    quiz.querySelectorAll(".quiz-option").forEach((btn) => {
      const i = parseInt(btn.dataset.choice, 10);
      btn.classList.remove("selected", "correct", "incorrect");
      if (i === answer) btn.classList.add("correct");
      if (i === choice && choice !== answer) btn.classList.add("incorrect");
      if (i === choice) btn.classList.add("selected");
    });
  }

  function bindProgressEvents() {
    const reset = document.getElementById("reset-progress");
    if (reset) {
      reset.addEventListener("click", () => {
        if (confirm("ต้องการล้างความก้าวหน้าทั้งหมดใช่หรือไม่? การกระทำนี้ย้อนกลับไม่ได้")) {
          Store.reset();
          render();
        }
      });
    }
  }

  // ---------- เราเตอร์ ----------
  function parseRoute() {
    const hash = location.hash.replace(/^#/, "") || "/";
    const parts = hash.split("/").filter(Boolean); // เช่น ['course','id','lesson','lid']
    return parts;
  }

  function render() {
    const parts = parseRoute();
    let html;

    // ระบบ CA แยกเป็นโมดูลของตัวเอง — มอบหมายให้ window.CA จัดการการเรนเดอร์ทั้งหมด
    if (parts[0] === "ca" && window.CA) {
      updateActiveNav("ca");
      window.CA.render(app, parts);
      return;
    }

    if (parts.length === 0) {
      html = viewHome();
    } else if (parts[0] === "courses") {
      html = viewCourses();
    } else if (parts[0] === "about") {
      html = viewAbout();
    } else if (parts[0] === "progress") {
      html = viewProgress();
    } else if (parts[0] === "course" && parts[2] === "lesson") {
      html = viewLesson(parts[1], parts[3]);
    } else if (parts[0] === "course" && parts[1]) {
      html = viewCourse(parts[1]);
    } else {
      html = viewNotFound();
    }

    app.innerHTML = html;
    window.scrollTo(0, 0);
    updateActiveNav(parts[0] || "");
    bindLessonEvents();
    bindProgressEvents();
  }

  function updateActiveNav(section) {
    const map = { "": "#/", courses: "#/courses", ca: "#/ca", about: "#/about", progress: "#/progress" };
    document.querySelectorAll(".main-nav a").forEach((a) => {
      const href = a.getAttribute("href");
      a.classList.toggle("active", href === (map[section] || "#/"));
    });
  }

  // ---------- เริ่มต้น ----------
  function init() {
    document.getElementById("year").textContent = new Date().getFullYear() + 543; // พ.ศ.

    window.addEventListener("hashchange", render);

    // จัดการเมนูบนมือถือ
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.querySelector(".main-nav");
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (e) => {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
