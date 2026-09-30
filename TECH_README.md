# Attendly — Technical Reference

Audience: developers and maintainers. For day-to-day usage see [README.md](README.md). For the
reasoning behind the structure see [DESIGN.md](DESIGN.md). For rules when changing this codebase see
[AGENT.md](AGENT.md).

---

## 1. What this is

A static single-page app. No backend, no server, no database process. The browser talks directly to
the Hugging Face Hub API using a user-supplied personal access token.

```
Browser (React SPA)
   │  @huggingface/hub  — whoAmI / listFiles / downloadFile / uploadFiles / createRepo / deleteRepo
   ▼
Hugging Face Hub  ──►  <username>/attendly-data  (a private dataset repo, plain CSV files)
```

Everything the app knows lives in that dataset. There is no runtime mock and no bundled fixture data;
`src/lib/mockSeed.ts` exists only to power the explicit **Reset dataset** button.

### Stack

| Concern | Choice |
| --- | --- |
| UI | React 19 + TypeScript, function components, no router |
| Build | Vite 8 |
| Styling | Tailwind CSS 3 |
| Icons | lucide-react |
| HF access | `@huggingface/hub` v2, called from the browser |
| Lint | oxlint (`npm run lint`) |
| Types | `tsc -b` in strict mode, wired into `npm run build` |
| Tests | none yet — see [AGENT.md](AGENT.md) |
| Deploy | GitHub Pages via `.github/workflows/deploy-gh-pages.yml` |

### Commands

```bash
npm install
npm run dev       # vite dev server
npm run build     # tsc -b && vite build  -> dist/
npm run preview   # serve the built dist/
npm run lint      # oxlint
```

There is no `npm run deploy`; pushing to `main` publishes to GitHub Pages. There is no `.env` file —
the token comes from the user at runtime and lives only in `localStorage`.

---

## 2. Source layout

```
src/
  main.tsx                 React root
  App.tsx                  Auth gate, role-based nav, page switch, sign-out
  index.css                Tailwind entry
  components/
    ui.tsx                 Panel, PageHeading, StatCard, Field, buttons, EmptyState, Modal
    ClassPicker.tsx        Class <select> with datalist
  pages/
    Login.tsx              Token entry, teacher/student explainer, failure dialogs
    TakeAttendance.tsx     dd/mm/yyyy + slot entry, per-student toggles, submit
    ShowAttendance.tsx     Class report with Total/Monthly scope + CSV export
    Students.tsx           Roster, class creation, roll lookup, student detail panel
    Accounts.tsx           Token draft, repo name, Reset dataset, status
  hooks/
    useDataset.ts          All state and every Hugging Face call
  lib/
    types.ts               Shared types, incl. AuthStatus
    hfDataset.ts           Thin wrapper over @huggingface/hub
    records.ts             CSV <-> domain objects, session keys, mergeAttendanceRows
    csv.ts                 Minimal RFC-4180-ish parser/serializer
    datasetLayout.ts       Paths, class-name validation, ddmmyyyy helpers, slot helpers
    attendance.ts          Derived stats: classes held, attended, percentage
    report.ts              Report assembly, month formatting, tone helpers
    mockSeed.ts            Sample data for Reset dataset only
```

The architecture is deliberately one-directional:

```
pages/*.tsx  ──calls──►  useDataset()  ──calls──►  lib/hfDataset.ts  ──►  @huggingface/hub
     │                        │
     └──── reads snapshots ───┘
                    lib/records.ts, lib/attendance.ts, lib/report.ts   (pure, no I/O)
```

- `lib/records.ts`, `lib/attendance.ts`, `lib/report.ts`, `lib/datasetLayout.ts`, `lib/csv.ts` are
  **pure**. They take values and return values. No network, no storage, no clock (except where a
  `now` parameter is passed in). This is where logic should be tested.
- `lib/hfDataset.ts` is the only module that imports `@huggingface/hub`.
- `hooks/useDataset.ts` owns all mutable state and is the only thing pages talk to.
- Pages never import `@huggingface/hub` and never touch `localStorage`.

---

## 3. Data model

All data is CSV inside one dataset repo. Default repo name `attendly-data`, overridable in the app,
so each account uses `<username>/attendly-data`.

```
data/
  students/
    <class>/
      students.csv
  attendance/
    <class>/
      <YYYY-MM>.csv
      <YYYY-MM>.csv
```

### `students.csv` — `ROSTER_HEADER`

```
name,roll_number,course
Aarav Sharma,01,Computer Science
Meera Patel,02,Biology
```

- Class identity comes from the **folder**, not a column.
- `roll_number` is the join key against attendance. It is free-form (one digit, many digits, or a long
  id) and is normalized by stripping leading zeros (`normalizeRollNumber`).
- Header aliases are accepted on read: `name`/`student_name`/`full_name`, `roll_number`/`rollnumber`/
  `roll`/`roll_no`/`rollno`, `course`/`subject`/`program`.
- Students in one class may belong to different courses. Display order is **course first, then roll
  number numerically** (`sortStudents`), so courses form contiguous groups.
- A duplicate roll number keeps only its first occurrence.
- A row with neither name nor roll number is dropped; a missing roll number or name is filled in
  rather than losing the student.

### `<YYYY-MM>.csv` — `MONTH_HEADER`

```
roll_number,name,course,date,slot,status,classes_attended,classes_held
01,Aarav Sharma,Computer Science,2026-08-31,09:00 to 09:30,present,1,1
```

- **One file per class per month.** Rows accumulate; nothing is ever summarised away or deleted.
- `date` is stored **ISO `yyyy-mm-dd`** while the UI types **ddmmyyyy**. Storage stays ISO because
  `date.slice(0, 7)` derives the month and lexical sorting gives chronological order. See
  [§6](#6-date-handling-ddmmyyyy-ui--yyyy-mm-dd-storage).
- `slot` is the human range, e.g. `09:00 to 09:30`. Either end may be blank; `formatSlotRange`
  renders whatever was typed.
- `status` is `present` or `absent`. `parseStatus` treats anything not equal to `present` as absent,
  so a corrupted cell fails closed (absent) rather than inventing a presence.
- `classes_attended` / `classes_held` are **written but not trusted**. They are re-derived from the
  rows on every read by `withRecountedTotals`, and the report (`attendance.ts`) ignores them
  entirely and computes from rows. They exist in the file for human readability when the CSV is
  opened in a spreadsheet. *Known open item: the user asked for these columns to be dropped from the
  file; see [AGENT.md](AGENT.md).*

### Sessions and "classes held"

A **session** is one `date` + `slot` pair, keyed by `sessionKey(date, slot)`. "Classes held" is the
count of **distinct session keys in scope**, not the count of rows — otherwise a class held once but
recorded for 60 students would count as 60 classes. `heldInScope` builds that set.

---

## 4. Writing attendance

`submitAttendance` in `hooks/useDataset.ts`:

1. Guards: teacher role, class selected, roster non-empty, date valid, slot valid.
2. `readMonth` the target `<YYYY-MM>.csv` (returns `null` if it does not exist yet).
3. Build `newRows`: one row per roster member for this `date`+`slot`, status from the draft
   (default `absent`).
4. `mergeAttendanceRows(existingRows, newRows)`.
5. `withRecountedTotals` the result.
6. `uploadFiles` the whole file back, then `loadDataset` to refresh the snapshot.

### Merge semantics

`mergeAttendanceRows` (`lib/records.ts`) is the important part. When the incoming rows target a
`date`+`slot` that already exists:

| Existing | Incoming | Result |
| --- | --- | --- |
| absent | present | **present** |
| present | absent | **present** (never downgraded) |
| present | present | present |
| absent | absent | absent |
| present | *not in payload* | present (kept) |
| *not in session* | present | added (row created) |
| any other session | — | copied through untouched |

Invariants:

- **Present is monotonic.** A merge can only add presences. Because silently forgetting a class
  somebody attended is the worse failure, un-recording a presence requires editing the dataset by
  hand. This is a deliberate product decision, not an oversight.
- **The union is kept.** Nobody is dropped: students already in the session but absent from the
  payload keep their row.
- **Duplicate rows collapse.** If a session somehow already has two rows for one student, they
  collapse to one, preferring `present`.
- **Other sessions are untouched.** They are filtered out and passed through verbatim.

Because merge is keyed on the payload's own `date`+`slot`, a brand-new session simply appends.

### Known limitation: not a true atomic append

Step 2 reads the file and step 6 rewrites it whole. That is **read-modify-write**, not an append
primitive. Two teachers submitting the same class in the same month at the same moment can lose one
of the two writes (last upload wins, and the loser's rows are gone).

`@huggingface/hub` v2 exposes `uploadFiles` (whole-file commit) and `deleteFiles`, but no
server-side append. Closing this properly needs either optimistic concurrency (compare a hash of the
file before overwriting, retry on mismatch) or a commit-per-session file layout. Tracked in
[AGENT.md](AGENT.md); do not claim append-only atomicity in user-facing copy.

---

## 5. Authentication and roles

### The state machine

`authStatus` in `lib/types.ts`:

```
'signed-out'  ──verify──►  'checking'  ──┬──can create a repo──►  'teacher'
     ▲                        │          │
     │                        │          └──can read dataset───►  'student'
     └──────failure───────────┴─────────────no usable access──────┘
```

- `isVerified = authStatus === 'teacher' || authStatus === 'student'`
- `canWrite   = authStatus === 'teacher'`
- `isChecking = authStatus === 'checking'`

`isVerified` and `canWrite` are **derived**, never stored. This is deliberate: a stored role flag can
drift from the gate, and they cannot drift from a single source of truth.

### The verification sequence (`verifyToken(candidate?)`)

1. `authStatus = 'checking'`.
2. `resolveAccount(token)` → `whoAmI`. Rejects app tokens and tokens with no account name.
3. Persist the token to `localStorage` **only after** it resolves.
4. `probeWriteAccess`: `createRepo` on `attendly-access-probe-<timestamp>`, then `deleteRepo` it in a
   `finally`. Success ⇒ teacher. If the delete fails, the user is told the repo name so it can be
   removed manually.
5. If creation was refused, `loadDataset` is attempted to confirm *read* access. Only if that
   succeeds is the session granted as `student`. Otherwise the token is discarded and the error is
   shown on the login screen.
6. Any failure ⇒ `signed-out`, token removed from state and storage, error surfaced in a dialog.

### Why the probe repo, and what it does not prove

The probe never touches `<username>/attendly-data`, so the dataset's commit history stays clean and no
attendance file is at risk.

It proves **repo-creation permission**, not write access to the dataset specifically. A token scoped
to repos under an organisation namespace might create a repo yet fail on the dataset. Treat "teacher"
as "can create repos and has been seen to read the dataset", not as a formal write grant.

### Why `verifyToken` takes the candidate token

`Login` used to call `setToken(token)` then `verifyToken()` in one event handler. React applies the
state update asynchronously, so `verifyToken`'s closure still saw the **previous** token value — it
short-circuited on empty and never contacted Hugging Face, while `setToken` had already stored the
token. The app then sat on `!app.isVerified` forever with no way back to the login form.

`verifyToken(candidate?)` now takes the token as an argument and only falls back to state when called
with no argument. **Never pass `verifyToken` directly as an event handler** — it would receive a
`MouseEvent` as `candidate`. Wrap it: `onClick={() => void verifyToken(token)}`.

### Layered write protection

1. Nav omits teacher pages for `student`.
2. Pages hide write controls when `!canWrite`.
3. `requireWriteAccess()` re-checks inside `seedDataset`, `submitAttendance` and `uploadRoster`.
   Hiding a button is not authorization.

### Token storage

`localStorage` key `attendly-hf-token`, plus UI preferences `attendly-selected-class`,
`attendly-range-mode`, `attendly-range-month`, `attendly-hf-repo`. Rosters and attendance are **never**
cached in storage — the snapshot lives in React state only, so signing out genuinely drops the data.

An earlier version also wrote a second plaintext copy to `attendly-verified-cache`. It was removed:
role is derived from `authStatus`, so the cache bought nothing and doubled the token's exposure.

### Security posture — read this before claiming the gate is secure

This app is **UI-gated, not secured.** It is a static bundle; the token is in the browser.

- Any user can open DevTools, read `localStorage`, and extract the token.
- Any user can call `submitAttendance` / `seedDataset` directly from the console, bypassing the UI.
- There is no server to enforce anything.

Real enforcement requires a backend that holds the token (never shipped to the browser), exposes a
narrow API, and authenticates the caller — e.g. OAuth + an HttpOnly session cookie. The role model
and the merge rules are already server-ready for that. Until then, treat "teacher" as a convenience
gate and keep the dataset private.

---

## 6. Date handling: ddmmyyyy UI, yyyy-mm-dd storage

The user types `dd/mm/yyyy`; the dataset stores `yyyy-mm-dd`. Conversion happens at the UI boundary
only.

| Helper | Role |
| --- | --- |
| `sanitizeDateDigits(value)` | Digits only, capped at 8. Backs both the input and the setter. |
| `formatDateForInput(digits)` | `31082026` → `31/08/2026`, live as the user types. |
| `parseDateDigits(digits)` | `ddmmyyyy` → ISO, or `null`. **Validates a real calendar date.** |
| `formatDateDigits(iso)` | ISO → `ddmmyyyy`, for display. |

`parseDateDigits` round-trips through `Date` and compares all three fields, so `31/02/2026` and
`29/02/2026` return `null` instead of rolling over into March. The typed value is kept in
`sessionDateDigits`; `sessionDate` is the derived ISO string, `''` when invalid.

Why not store ddmmyyyy: `date.slice(0, 7)` derives the month for the month file and for report scoping,
and lexical string sort on `date` gives chronological order. Both depend on ISO ordering. `dd/mm/yyyy`
breaks both.

### Slot

Also blank by default and required. `isSlotRangeValid` requires a start; if an end is given it must be
strictly after the start. `defaultSlotRange()` returns `{ start: '', end: '' }` on purpose — a
pre-filled time would be a guess at when the class actually ran.

---

## 7. Class-name validation

Class names are user input that become **folder segments**, so `isValidClassName` restricts them to a
single safe segment. It **rejects** rather than sanitises, so a bad name stays visible instead of
silently becoming something else:

- length 1–64
- no leading/trailing whitespace, no leading `.`
- no `/`, no `\`, no control characters (`< 32`, `127`)

`../evil` is refused, so a write can never escape `data/students/`.

---

## 8. Load and refresh

`loadDataset(repo, token, onProgress)`:

1. `repoExists` → clear error if the dataset is absent, pointing at **Reset dataset**.
2. `listFiles` under `data/students` and `data/attendance` (recursive).
3. Class names derived from `classNameOf(path)` (index 2 of `data/<root>/<class>/...`), unioned from
   both roots, sorted.
4. Per class (concurrency 4): roster + months (concurrency 6), each month re-counted via
   `withRecountedTotals`.
5. Progress percentages are coarse but monotonic: 8 → 20 → 20..90 → 100.

Loading happens **once per successful sign-in**, guarded by `loadedForRef`, which is reset whenever the
session is invalidated so signing out and back in always reloads. The read-only probe in
`verifyToken` hands its own result to `setSnapshot` and marks the ref, so a read-only sign-in does not
fetch the dataset twice.

---

## 9. Write safety

- Every write opens a blocking `Modal` with `type: 'progress'` and a `warning`. Continue/close are
  disabled until the write settles — nothing can be dismissed mid-write.
- A `beforeunload` handler is registered while `isWriting` is true. It only triggers the browser's own
  "Leave site?" prompt; it cannot block the tab, and some browsers and mobile skip it. The copy says
  *warning*, never *guarantee*.
- `uploadRoster` parses the roster before writing and refuses a file that yields no students.
- Overwriting an existing class asks first via a `confirm` modal, and only replaces the roster.

---

## 10. Git

```bash
git config user.name  "Soumyadip"
git config user.email "223991178+soumyadipk03@users.noreply.github.com"
```

Per-command identity is used because this machine's global git config is unset. Workflow: implement →
`npx tsc -b && npm run lint && npm run build && git diff --check` → stage intended files → commit.
No force-push, no history rewriting, no commits the user did not ask for.

CI has **no test step** — `deploy-gh-pages.yml` only runs `npm ci && npm run build` on pushes to
`main`. `tsc -b` in `npm run build` is the only automated gate.

---

## 11. Reference tables

### Attendance columns

| Column | Stored | Read from | Notes |
| --- | --- | --- | --- |
| `roll_number` | yes | `ROLL_ALIASES` | Join key; leading zeros stripped |
| `name` | yes | `NAME_ALIASES` | Denormalised for readable CSVs |
| `course` | yes | `COURSE_ALIASES` | Denormalised |
| `date` | ISO | `DATE_ALIASES` | Typed as ddmmyyyy in the UI |
| `slot` | yes | `SLOT_ALIASES` | `"09:00 to 09:30"` |
| `status` | yes | `STATUS_ALIASES` | Anything not `present` → absent |
| `classes_attended` | yes | ignored | Re-derived on read |
| `classes_held` | yes | ignored | Re-derived on read |

### localStorage keys

| Key | Purpose |
| --- | --- |
| `attendly-hf-token` | HF personal access token |
| `attendly-hf-repo` | Dataset repo name |
| `attendly-selected-class` | Last selected class |
| `attendly-range-mode` | `total` or `monthly` |
| `attendly-range-month` | Last selected `YYYY-MM` |

---

## 12. Known limitations

1. **Read-modify-write race** on `<YYYY-MM>.csv` — see [§4](#known-limitation-not-a-true-atomic-append).
2. **`classes_attended` / `classes_held` are still written** to the CSV, though never trusted. The
   product decision is to drop the columns and derive everything.
3. **No automated tests.** Pure helpers in `lib/` are the natural first target.
4. **No server-side authorization** — see [§5](#security-posture--read-this-before-claiming-the-gate-is-secure).
5. **No router.** The active page is React state; there is no URL to bookmark or share.
6. **`sessionNote` is not persisted.** It is UI-only and cleared with the form.
