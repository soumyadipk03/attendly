import { Database, Eye, EyeOff, KeyRound, ShieldCheck, Sprout, Trash2 } from 'lucide-react'
import { GhostButton, PageHeading, Panel, StatCard } from '../components/ui'
import type { DatasetController } from '../hooks/useDataset'
import { repoIdFor } from '../lib/hfDataset'
import { MOCK_CLASS_NAMES } from '../lib/mockSeed'
import { useState } from 'react'

export function Accounts({ app }: { app: DatasetController }) {
  const {
    token,
    setToken,
    clearToken,
    repoName,
    setRepoName,
    account,
    status,
    snapshot,
    isVerifying,
    isSeeding,
    verifyToken,
    seedDataset,
  } = app

  const [showToken, setShowToken] = useState(false)
  const targetRepo = account ? repoIdFor(account.name, repoName) : `<your-hf-username>/${repoName}`
  const loadedClasses = Object.keys(snapshot).length
  const loadedMonths = Object.values(snapshot).reduce((total, entry) => total + entry.months.length, 0)

  const confirmSeed = () => {
    app.setModal({
      type: 'confirm',
      title: 'Reset the dataset with sample data?',
      message: `This deletes ${targetRepo} and rebuilds it with the ${MOCK_CLASS_NAMES.join(' and ')} class folders, including students.csv rosters and three months of attendance sessions. Anything already in the dataset is removed.`,
      confirmText: 'Reset dataset',
      onConfirm: () => {
        app.setModal(null)
        void seedDataset()
      },
    })
  }

  return (
    <Panel>
      <PageHeading
        eyebrow="Accounts"
        title="Hugging Face access"
        actions={<ShieldCheck className="h-5 w-5 text-indigo-500" />}
      />

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
        <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">Hugging Face API token</label>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="hf_xxxxxxxxxxxxx"
            className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => setShowToken((current) => !current)}
            className="text-slate-500 transition hover:text-indigo-600"
            aria-label={showToken ? 'Hide HF token' : 'Show HF token'}
          >
            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Needed for private dataset reads and writes. Kept in this browser only.
        </p>
      </div>

      <label className="mt-4 block rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
        <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">Dataset repo</span>
        <input
          value={repoName}
          onChange={(event) => setRepoName(event.target.value)}
          placeholder="attendly-data"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
        />
        <span className="mt-2 block font-mono text-xs text-slate-500">{targetRepo}</span>
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        {!token.trim() ? (
          <GhostButton onClick={verifyToken} disabled={isVerifying}>
            <KeyRound className="h-4 w-4" />
            {isVerifying ? 'Verifying...' : 'Verify HF token'}
          </GhostButton>
        ) : null}

        <button
          type="button"
          onClick={confirmSeed}
          disabled={!token.trim() || isSeeding}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sprout className="h-4 w-4" />
          {isSeeding ? 'Resetting dataset...' : 'Reset dataset'}
        </button>

        <GhostButton onClick={clearToken} disabled={!token}>
          <Trash2 className="h-4 w-4" />
          Clear HF token
        </GhostButton>
      </div>

<p className="mt-3 text-xs text-slate-500">
        The dataset loads by itself when Attendly opens, so there is no Load button. Each class has one
        <span className="font-mono">data/attendance/{'<'}{'class'}{'>'}/{'<'}{'YYYY-MM'}{'>'}.csv</span> that accumulates
        every session. The report counts distinct date+slot pairs as classes held.
        Reset dataset writes the sample classes {MOCK_CLASS_NAMES.join(' and ')}.
      </p>

      {account ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Verified account</p>
          <div className="mt-3 space-y-1">
            <p className="text-base font-medium text-slate-900">{account.fullname}</p>
            <p>Username: {account.name}</p>
            {account.email ? <p>Email: {account.email}</p> : null}
            <p>Orgs: {account.orgs.length > 0 ? account.orgs.join(', ') : 'none'}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Classes cached" value={String(loadedClasses)} hint="from the dataset" />
        <StatCard label="Month files" value={String(loadedMonths)} hint="in the dataset" />
        <StatCard
          label="Data source"
          value="Hugging Face"
          hint={`${targetRepo}`}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-medium text-slate-900">
            <Database className="h-4 w-4 text-indigo-500" />
            Status
          </p>
        </div>
        <p className="mt-2">{status}</p>
      </div>
    </Panel>
  )
}
