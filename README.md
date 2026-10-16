# 🎤 Olympia Music Class Tracker

A simple weekly tracker for a vocal (singing) teacher. For each kid it tracks:

- **Attendance**: Present / Absent
- **Lesson learnt** that week
- **Practice lesson** (homework for the week)
- **Missed classes**: counted automatically, this month and in total
- **Songs & skills**: each kid's songs and skills, marked Learning → Got it → Performance-ready
- **Fees**: monthly status (Paid / Partial / Unpaid), amount, and date paid

Kids are split into weekly **batches** (Wednesday and Friday to start). Add future batches with a day, time, and start date under **Students → Batches**, and switch between them at the top.

Click any kid's name to see their full history.

## 🔒 Privacy

This repository only holds the app's code. **Kids' names, attendance, and fees are never uploaded.** Everything you type is saved only in the browser you're using.

That means:
- Use **Download backup** now and then to keep a copy (a reminder pops up every 30 days).
- To use another device, download a backup on the first one and choose **Restore backup** on the second.
- Clearing your browser data will erase the class data, so back it up first.

## Files

- `index.html`: the page
- `styles.css`: the look
- `app.js`: everything else

The site is published with GitHub Pages, and every push to `main` updates it.

## Editing

- **Class info**: everything on the page is editable in place (names, past weeks, fees, song titles).
- **Settings (⚙️)**: class name, your name, and the parent-message greeting and sign-off.
- **The app itself**: open https://github.dev/abridgejm/music-class-progress (or press `.` on the GitHub repo page), edit a file, then commit from the Source Control panel. The site updates in about a minute.
