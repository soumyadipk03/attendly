# Attendly

Attendly is a static-only attendance dashboard built with React, Vite, TypeScript, and Tailwind CSS. There is no app backend, no database server, and no runtime API layer.

**All student data lives in a Hugging Face dataset.** Nothing is hardcoded in the app: the class list, the rosters, and the attendance history are pulled from the dataset at runtime, and new sessions are pushed back into it from the browser.

## Dataset layout

The app reads and writes one folder tree inside a private Hugging Face dataset:

```
data/
  students/
    class/
      mock1/
        students.csv
      mock2/
        students.csv
  attendance/
    class/
      mock1/
        010726_090000_attendance.csv
        010826_090000_attendance.csv
        ...
      mock2/
        ...
```

- `students.csv` has exactly three columns: `name`, `roll_number`, `course`. The class name comes from the folder, not from a column. `roll_number` is free-form: one digit, several digits, or a long id all work, and it is compared numerically when the roster is ordered. Students inside one class folder can be on different courses, so the roster is always displayed ordered by **course first, then roll number** (courses become contiguous groups).
- Each attendance file is **one class held**. The filename carries the session date (`ddmmyy`) and the **slot start** (`tttttt`), so the frontend can order every file in a class chronologically and group it by month.
- Attendance CSVs have six columns: `roll_number`, `name`, `course`, `status` (`present` or `absent`), `slot`, `note`. `roll_number` is the join key against the roster.
- `slot` holds the **user-defined range** for that session, for example `09:05 to 09:30`. Only the start time is encoded in the filename; the full range lives in this column.

## How the app uses it

| Tab | Behaviour |
| --- | --- |
| Take Attendance | Pick a class, set the slot the class runs in (from/to), toggle each student, submit. The session is written to `data/attendance/class/<class>/ddmmyy_tttttt_attendance.csv` and the dataset is re-read. |
| Show Attendance | Pick a class, then a range. **Monthly** shows one selected month, **Total** shows everything. Lists classes attended / total classes held plus an attendance percentage per student, and the session files grouped by month with their slot. |
| Students | Roster for the **selected class only** — roll no, name, course, grouped by course and searchable. |
| Accounts | Hugging Face token, token verification, and the dataset actions below. |

The dataset loads by itself as soon as the app opens, so there is no Load button. On Accounts:

- **Reset dataset** deletes the dataset repo, recreates it, and seeds the `mock1` and `mock2` classes with rosters and three months of attendance sessions. This is the only place sample data exists, and it only ever runs when you press the button.
- **Verify HF token** checks the token and then pulls the dataset, which is what a first-time user needs.
- **Clear HF token** drops the token and the cached dataset from the browser.

## Architecture

- React + Vite + TypeScript
- Tailwind CSS
- GitHub Pages deployment
- `@huggingface/hub` used directly from the browser with a personal read/write token
- `localStorage` holds only the token and UI preferences (selected class, range, month). Rosters and attendance are never cached there.

## Local development

```bash
npm install
npm run dev
```

## Secrets

No local `.env` file is needed. For GitHub Actions, set:

- `HF_API` = your Hugging Face API token (repository secret), used by `.github/workflows/hf-dataset-setup.yml`

The dataset repo name defaults to `attendly-data` and is editable in the app, so each account uses its own `<username>/attendly-data`.

## Deployment

`.github/workflows/deploy-gh-pages.yml` builds and publishes to GitHub Pages on every push to `main`. No `npm run deploy` step is needed.
