import { useState } from 'react'
import { Loader2, ShieldCheck, Eye, AlertTriangle } from 'lucide-react'
import { Field, GhostButton, Modal, Panel, PrimaryButton } from '../components/ui'
import type { DatasetController } from '../hooks/useDataset'

export function Login({ app }: { app: DatasetController }) {
  const { token, clearToken, verifyToken, isVerifying, status } = app
  // Seeded from the stored token so a reload does not force a retype, but the
  // field stays locally controlled until verification actually succeeds.
  const [inputToken, setInputToken] = useState(token)

  // The token is handed to verifyToken directly. Calling setToken and then
  // verifyToken() in the same event verified the *previous* token value,
  // because the state update had not been applied yet.
  const handleVerify = () => {
    const attempt = inputToken.trim()
    if (!attempt) {
      return
    }
    setInputToken(attempt)
    void verifyToken(attempt)
  }

  const handleForget = () => {
    setInputToken('')
    clearToken()
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f5f7ff_0%,_#eef2ff_22%,_#f8fafc_48%,_#f3f4f6_100%)] text-slate-900">
      <div className="mx-auto max-w-md px-4 py-12">
        <Panel className="mt-0">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600">Attendly</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in to continue</h1>
          <p className="mt-2 text-sm text-slate-600">
            Paste a Hugging Face API token. Attendly checks what the token can do and opens the matching
            view: teachers get the full attendance tools, read-only tokens get the roster lookup only.
          </p>

          <div className="mt-5">
            <Field label="HF API token" hint="Kept in this browser only, and sent nowhere except Hugging Face.">
              <input
                type="password"
                value={inputToken}
                onChange={(event) => setInputToken(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleVerify()
                  }
                }}
                placeholder="hf_..."
                autoComplete="off"
                spellCheck={false}
                disabled={isVerifying}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <PrimaryButton onClick={handleVerify} disabled={isVerifying || !inputToken.trim()}>
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking access...
                </>
              ) : (
                'Verify and continue'
              )}
            </PrimaryButton>
            {token ? (
              <GhostButton onClick={handleForget} disabled={isVerifying}>
                Forget stored token
              </GhostButton>
            ) : null}
          </div>

          {status ? (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>{status}</span>
            </div>
          ) : null}

          <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span>
                <strong className="font-medium text-slate-700">Teacher</strong> — the token can create a repo, so the
                full app is unlocked. Write access is tested in a throwaway repo that is deleted right after, never in
                your dataset.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
              <span>
                <strong className="font-medium text-slate-700">Student</strong> — the token can read the dataset but
                not create repos, so only the class roster and attendance lookup are shown.
              </span>
            </p>
          </div>
        </Panel>
      </div>

      {/* Verification failures are reported while this screen is showing, so
          the dialog has to live here and not only in the signed-in shell. */}
      <Modal modal={app.modal} onClose={() => app.setModal(null)} />
    </div>
  )
}
