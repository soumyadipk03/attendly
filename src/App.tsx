import { useState } from 'react'
import { KeyRound, Menu, Sparkles, X } from 'lucide-react'
import { Modal } from './components/ui'
import { useDataset } from './hooks/useDataset'
import { Accounts } from './pages/Accounts'
import { ShowAttendance } from './pages/ShowAttendance'
import { Students } from './pages/Students'
import { TakeAttendance } from './pages/TakeAttendance'
import { Login } from './pages/Login'

const NAV_ITEMS = [
  { id: 'attendance', label: 'Take Attendance' },
  { id: 'overview', label: 'Show Attendance' },
  { id: 'students', label: 'Students' },
  { id: 'accounts', label: 'Accounts' },
] as const

type PageId = (typeof NAV_ITEMS)[number]['id']

export default function App() {
  const app = useDataset()
  const [currentPage, setCurrentPage] = useState<PageId>('attendance')
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  // If there is no HF token stored, show a login screen and hide the entire
  // app shell until the user has been verified.
  if (!app.token) {
    return <Login app={app} />
  }

  const goTo = (page: PageId) => {
    setCurrentPage(page)
    setIsMobileNavOpen(false)
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'attendance':
        return <TakeAttendance app={app} />
      case 'overview':
        return <ShowAttendance app={app} />
      case 'students':
        return <Students app={app} />
      case 'accounts':
        return <Accounts app={app} />
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f5f7ff_0%,_#eef2ff_22%,_#f8fafc_48%,_#f3f4f6_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[30px] border border-slate-200 bg-white/80 p-4 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur-md sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-700">
                <Sparkles className="h-3.5 w-3.5" />
                Attendly
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                Attendance, simplified for modern cohorts.
              </h1>
            </div>

            <button
              type="button"
              aria-label="Toggle navigation menu"
              onClick={() => setIsMobileNavOpen((current) => !current)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 lg:hidden"
            >
              {isMobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 shadow-sm">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-indigo-500" />
              <span>{app.token ? 'HF token stored locally' : 'No HF token saved yet'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-200 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                {app.classNames.length} classes
              </span>
              <span className="text-slate-500">loaded from the Hugging Face dataset</span>
            </div>
          </div>

          <nav
            className={`${isMobileNavOpen ? 'mt-4 flex' : 'mt-6 hidden'} flex-col gap-2 lg:mt-6 lg:flex lg:flex-row lg:flex-wrap`}
          >
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(item.id)}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                  currentPage === item.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </header>

        {renderPage()}
      </div>

      <Modal modal={app.modal} onClose={() => app.setModal(null)} />
    </div>
  )
}
