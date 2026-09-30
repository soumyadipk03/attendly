# Attendly

A simple attendance register that lives on the internet and keeps all of its data in your own
Hugging Face dataset.

There is nothing to install and no separate database to maintain. Attendly is a web page. You sign
in with a Hugging Face API token, and your classes, student lists and attendance records load
straight from your dataset.

---

## 1. Signing in

The first thing you see is a sign-in box. Paste your Hugging Face API token into it and press
**Verify and continue**.

### Where do I get a token?

1. Go to <https://huggingface.co/settings/tokens> while logged in.
2. Press **+ Create new token**.
3. Give it a name like `attendly`.
4. Choose the **Write** permission. If you only want to look at attendance, **Read** is enough.
5. Copy the token that starts with `hf_` and paste it into Attendly.

> Keep this token to yourself. Anyone holding it can read or change your attendance data.

### Teacher or student?

Attendly works out what your token is allowed to do, and opens the right view automatically. You do
not have to pick a role.

| What Attendly found | What you get |
| --- | --- |
| The token can create a dataset | **Teacher view** — the full app: take attendance, see reports, manage classes, change settings |
| The token can only read | **Student view** — just the class list and attendance lookup |

To check the teacher permission, Attendly creates a small throwaway dataset, looks at the result, and
deletes it again straight away. It never writes a test file into your real attendance dataset, so your
dataset history stays clean.

### Does it remember me?

Yes. Your token is saved in your own browser, so you do not have to paste it every time. That also
means you are verified again each time you open the page — Attendly always re-checks your access
rather than trusting what it stored earlier.

To sign out, press **Sign out** at the top of the page. To remove the saved token completely, press
**Sign out** and then **Forget stored token**.

---

## 2. What each screen does

### Teacher view

**Take Attendance** — the daily register.

1. Pick the class.
2. Type the date the class ran, as `dd/mm/yyyy` — for example `31/08/2026` for 31 August 2026.
3. Type the time the class ran, for example `09:05` to `09:30`.
4. Tap each student to switch them between **Present** and **Absent**.
5. Press **Submit attendance**.

The date and the time are both required, and both start blank on purpose. A field turns red and
explains itself if what you typed is not a real date — typing `31/02` is refused rather than quietly
becoming 3 March. Both go blank again after every submit, so a session is never recorded against the
wrong day by accident.

### Submitting the same session twice

If you submit a date and time that have **already been recorded**, Attendly merges into that session
instead of adding a second copy. This makes correcting a register safe:

- Anyone you mark present this time is now present, even if they were absent before.
- Anyone already marked present **stays** present. Merging will never take a present away.
- Anyone already in that session keeps their row, even if this submit did not include them.
- Every other session in the month is left exactly as it was.

A presence recorded by mistake is therefore not something you can undo from the register — that is
deliberate, because quietly forgetting a class somebody attended is the worse mistake. Remove the row
from the dataset by hand if a present really was wrong.

**Show Attendance** — the report. Shows, for each student, how many classes they attended out of how
many were held, plus the percentage. You can narrow it to a single month or look at the whole
history. You can download it as a spreadsheet.

**Students** — your class list. Also where you create new classes and look up one student's history.
Both let you switch between **Total** and a **particular month**, so a student's attendance can be
read for one month or for the whole term.

**Accounts** — your token, the name of your dataset, and a button to reset the dataset with sample
data.

### Student view

**Attendance** — pick a class, choose whether you want the **total** or a **particular month**, then
search by roll number and press **View attendance**. You get the full list of classes that were held,
which ones the student attended, and their attendance percentage. Clicking any row in the class list
opens the same detail for that range.

---

## 3. Creating a class

1. Open **Students**.
2. In the **Create a class** box, type the class name, for example `mock1`.
3. Choose your roster file.
4. Press **Create class**.

The class name becomes the folder name in your dataset. Use letters, numbers, spaces and dashes —
slashes and dots at the start are refused so a class can never be written outside the data folder.

Your roster file must be a spreadsheet in this format, with these three column headings:

| name | roll_number | course |
| --- | --- | --- |
| Aarav Sharma | 01 | Computer Science |
| Meera Patel | 02 | Biology |

- The column headings are flexible: `Name`, `Roll No` and `Subject` work just as well.
- Roll numbers can be any length — `01`, `7` or a long student ID all work.
- A student with no roll number is given one automatically so nobody is silently dropped.
- One class can hold students from several courses. The list is always sorted by course first, then
  by roll number, so each course reads as one block.

If you use a class name that already exists, Attendly asks before replacing it. Replacing a class only
replaces the student list — attendance already recorded for that class is left untouched.

---

## 4. How your data is stored

Everything sits in one private Hugging Face dataset, in a plain folder structure you can open and read
yourself:

```
data/
  students/
    mock1/
      students.csv              the student list for class mock1
  attendance/
    mock1/
      2026-09.csv               everything recorded in September 2026
      2026-10.csv               everything recorded in October 2026
```

- One attendance file per class per month. Nothing is ever deleted or summarised out from under you.
- Every file is plain CSV, so you can open it in any spreadsheet program.
- The date is written in the file as `yyyy-mm-dd` so it sorts correctly, even though you type it as
  `dd/mm/yyyy`.
- Attendance figures are worked out from the recorded rows each time you look, so a corrected row
  corrects the report immediately.

---

## 5. Sample data

**Accounts → Reset dataset** deletes your dataset and rebuilds it with two example classes, `mock1`
and `mock2`, including student lists and three months of attendance.

This is destructive — anything you have already recorded in that dataset is removed. Attendly always
asks first. Only use it while trying the app out.

---

## 6. Things worth knowing

**Please do not close the tab while saving.** Attendly shows a warning while it is writing, and asks
your browser to confirm before you leave. Your browser can still ignore that prompt, so if you must
step away, wait for the confirmation message first.

**The dataset loads by itself.** There is no Load button. Once you are verified, your data is pulled
in automatically.

**Signing in checks your access every time.** This means your permissions are never stale, but it
also means the first sign-in of a session takes a moment longer than the ones after it.

**This is protection by screen, not by lock.** Attendly decides what to show based on your token, but
your token is stored in your browser. Anyone with access to your browser or your device can see it.
For anything sensitive, treat the dataset as private and give tokens out carefully.

---

## 7. If something goes wrong

| What you see | What it means | What to do |
| --- | --- | --- |
| "This token cannot read or write the dataset" | The token is valid but the dataset is not there yet | Press **Reset dataset** on Accounts to create it |
| "Verification failed" | The token is wrong, revoked, or is an organisation/app token | Create a new personal token and try again |
| A date field is red | What you typed is not a real `dd/mm/yyyy` date | The field under it says what is wrong |
| Submit is greyed out | The date or the slot is missing or invalid | Fill in both required fields |
| No classes showing | The dataset exists but is empty | Press **Reset dataset**, or upload a roster |
| Stuck on "Verifying your access" | The check is still running | Press **Cancel** to go back to the sign-in box |

---

## 8. Running it yourself

Attendly is a static web page. To work on it:

```bash
npm install
npm run dev      # start a local copy
npm run build    # check it compiles and prepare it for publishing
```

It publishes itself to GitHub Pages every time you push to `main`, so there is no separate deploy
step.

Technical details — architecture, data format, security notes — are in [TECH_README.md](TECH_README.md).
