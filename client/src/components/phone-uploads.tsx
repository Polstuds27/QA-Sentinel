import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import type { Agent, Recording } from "@/lib/server"

// Recordings sent in from phones, newest first: waiting → being scored → scored.
function PhoneUploads({
  recordings,
  agents,
  stage,
  aiOn,
  onOpen,
  onRetry,
}: {
  recordings: Recording[]
  agents: Agent[]
  /** What the recording being scored is doing right now. */
  stage: string
  aiOn: boolean
  onOpen: (callId: string) => void
  onRetry: (recording: Recording) => void
}) {
  const [agentId, setAgentId] = useState("")
  const shown = recordings.filter((r) => !agentId || r.agentId === agentId)
  const waiting = recordings.filter((r) => r.status === "uploaded").length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel htmlFor="upload-agent">Agent</FieldLabel>
          <select
            id="upload-agent"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="h-10 border border-input bg-background px-3 text-base transition-colors duration-200 hover:border-foreground md:text-sm"
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
        {waiting > 0 && !aiOn && <p className="label text-destructive">{waiting} waiting. Tick Local AI to start scoring them.</p>}
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground">Nothing has been sent from a phone yet.</p>
      ) : (
        <ul className="border-b border-border">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border py-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium break-all">{r.name}</span>
                <span className="label text-muted-foreground">
                  {r.agent} · {r.device} · {new Date(r.uploadedAt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                {r.status === "uploaded" && <span className="text-muted-foreground">Waiting</span>}
                {r.status === "processing" && (
                  <>
                    <Spinner className="text-primary" aria-label="Working" />
                    <span>{stage || "Scoring"}</span>
                  </>
                )}
                {r.status === "scored" && (
                  <>
                    {r.callStatus && <Badge variant={r.callStatus === "red" ? "destructive" : r.callStatus}>{r.score} / 100</Badge>}
                    {r.callId && <Button size="sm" variant="outline" onClick={() => onOpen(r.callId!)}>Open</Button>}
                  </>
                )}
                {r.status === "failed" && (
                  <>
                    <span className="max-w-[40ch] text-destructive">{r.error ?? "Could not be scored."}</span>
                    <Button size="sm" variant="outline" onClick={() => onRetry(r)}>Try again</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export { PhoneUploads }
