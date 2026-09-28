# Attendly

Attendly is a static-only attendance dashboard built with React, Vite, TypeScript, and Tailwind CSS. There is no app backend, no database server, and no runtime API layer.

**All student data lives in a Hugging Face dataset.** Nothing is hardcoded in the app: the class list, the rosters, and the attendance history are pulled from the dataset at runtime, and new sessions are pushed back into it from the browser.

## Dataset layout

The app reads and writes one folder tree inside a private Hugging Face dataset:

```
data/
  students/
    mock1/
      students.csv
    mock2/
      students.csv
  attendance/
    mock1/
      2026-07/                 # month folders are numeric YYYY-MM
        010726_090000_attendance.csv
        010826_090000_attendance.csv
        ...
      2026-07.csv              # squashed summary, once the month is finished
      2026-08/
        ...
    mock2/
      ...
```

- `students.csv` has exactly three columns: `name`, `roll_number`, `course`. The class name comes from the folder, not from a column. `roll_number` is free-form: one digit, several digits, or a long id all work, and it is compared numerically when the roster is ordered. Students inside one class folder can be on different courses, so the roster is always displayed ordered by **course first, then roll number** (courses become contiguous groups).
- Attendance lives **one month deep**. Month folders are numeric `YYYY-MM`, never a month name.
- Each attendance file is **one class held**. The filename carries the session date (`ddmmyy`) and the **slot start** (`tttttt`), so the frontend can order every file in a class chronologically and group it by month.
- Attendance CSVs have six columns: `roll_number`, `name`, `course`, `status` (`present` or `absent`), `slot`, `note`. `roll_number` is the join key against the roster.
- `slot` holds the **user-defined range** for that session, for example `09:05 to 09:30`. Only the start time is encoded in the filename; the full range lives in this column.

## Squashing finished months

When a class holds **two or more month folders**, the older ones are finished, and Attendly offers to squash them. Each finished month becomes a single `<class>/<YYYY-MM>.csv` with one row per student:

```
roll_number,name,course,classes_attended,classes_held,attendance_percentage
1,Ann,Bio,2,3,67
```

Both sides are plain counts, so a squashed month adds up exactly as it did before and the report is unchanged. Show Attendance lists a squashed month as a single summary row instead of its individual files.

The write and the cleanup are deliberately separate API calls, shown as one dialog:

1. Upload `<month>.csv`, then **read it back** to prove it is intact.
2. Only then delete that month's daily files.

If the upload or the read-back fails, nothing is deleted, so a failure cannot lose a month. If a month somehow has both a summary and daily files, the summary wins so the same classes held are never counted twice.

## How the app uses it

| Tab | Behaviour |
| --- | --- |
| Take Attendance | Pick a class, set the slot the class runs in (from/to), toggle each student, submit. The session is written to `data/attendance/<class>/<YYYY-MM>/ddmmyy_tttttt_attendance.csv` and the dataset is re-read. |
| Show Attendance | Pick a class, then a range. **Monthly** shows one selected month, **Total** shows everything. Lists classes attended / total classes held plus an attendance percentage per student, and the months with their session files or squash summary. |
| Students | Roster for the **selected class only** — roll no, name, course, grouped by course and searchable. **Create a class** uploads a roster CSV under a class name you choose. |
| Accounts | Hugging Face token, token verification, and the dataset actions below. |

The dataset loads by itself as soon as the app opens, so there is no Load button. On Accounts:

- **Reset dataset** deletes the dataset repo, recreates it, and seeds the `mock1` and `mock2` classes with rosters and three months of attendance sessions. This is the only place sample data exists, and it only ever runs when you press the button.
- **Verify HF token** checks the token and then pulls the dataset, which is what a first-time user needs.
- **Clear HF token** drops the token and the cached dataset from the browser.

### Creating a class from a CSV

The **Create a class** panel on Students turns a roster CSV into a class. Pick a class name, choose a `.csv`, and press **Create class**: the file is pushed to `data/students/<class>/students.csv` under that name, whatever the uploaded file was called, and the dataset is re-read so the new class appears immediately.

Two checks run before anything is written:

- The CSV is parsed first. A file that yields no students is refused, because a roster that cannot be read would otherwise create a class folder that just renders empty with no explanation.
- The class name is checked as a folder segment. Slashes, `..`, leading dots, control characters and surrounding spaces are rejected rather than rewritten, so a name like `../evil` can never point the write outside `data/students/`.

Choosing a name that already exists asks before overwriting, and only replaces the roster; attendance already recorded for that class is left alone. Header aliases are accepted, so `Name` / `Roll No` / `Subject` works as well as the exact `name,roll_number,course`.

## Writing to Hugging Face

Every write (seeding, submitting attendance, creating a class, squashing) shows a blocking progress dialog with a warning banner telling you not to close the tab, and a `beforeunload` handler asks the browser to confirm before you navigate away.

Browsers do not allow a page to stop you closing a tab outright. `beforeunload` only triggers the browser's own "Leave site?" prompt, which some browsers and mobile skip. The dialog copy is therefore worded as a warning, not a guarantee.

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
