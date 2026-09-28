import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Field, PrimaryButton, Panel, PageHeading } from '../components/ui'
import type { DatasetController } from '../hooks/useDataset'

export function Login({ app }: { app: DatasetController }) {
  const { token, setToken, verifyToken, isVerifying, status } = app
  const [inputToken, setInputToken] = useState(token)

  const handleVerify = () => {
    setToken(inputToken)
    verifyToken()
  }

  return (
    <Panel className="max-w-md mx-auto mt-12">
      <PageHeading eyebrow="Sign in" title="Attendly" />
      <p className="text-sm text-slate-600">
        Enter your Hugging Face API token to access the dataset. The token must have read and write access to your private datasets.
      </p>
      <Field label="HF API token" hint="Stored locally in your browser. Never sent anywhere except Hugging Face.">
        <input
          type="password"
          value={inputToken}
          onChange={(e) => setInputToken(e.target.value)}
          placeholder="hf_..."
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400"
        />
      </Field>
      <PrimaryButton onClick={handleVerify} disabled={isVerifying || !inputToken.trim()}>
        {isVerifying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying...
          </>
        ) : (
          'Verify & load dataset'
        )}
      </PrimaryButton>
      {status && <p className="mt-4 text-sm text-slate-600">{status}</p>}
    </Panel>
  )
}