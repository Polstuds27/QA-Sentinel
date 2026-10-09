import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { addAgent, revokeAgent, setPublicUrl, uploadLink, type Agent, type ServerInfo } from "@/lib/server"

// A QR code is always dark on white, whatever the theme, or phone cameras struggle with it.
function Qr({ text }: { text: string }) {
  const [src, setSrc] = useState("")
  useEffect(() => {
    let live = true
    void QRCode.toDataURL(text, { margin: 1, width: 440, color: { dark: "#111111", light: "#ffffff" } }).then((url) => {
      if (live) setSrc(url)
    })
    return () => { live = false }
  }, [text])
  return src ? <img src={src} alt="QR code of this upload link" className="size-44 border border-foreground bg-paper p-2" /> : null
}

// Agents and their phones: add an agent, hand them their upload link, turn a device off.
function Devices({
  online,
  info,
  agents,
  onChange,
}: {
  online: boolean
  info: ServerInfo | null
  agents: Agent[]
  onChange: () => void
}) {
  const [name, setName] = useState("")
  const [device, setDevice] = useState("")
  const [base, setBase] = useState("")
  const [tunnel, setTunnel] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState("")

  const addresses = [...(info?.lanUrls ?? []), ...(info?.publicUrl ? [info.publicUrl] : [])]
  const address = addresses.includes(base) ? base : (addresses[0] ?? "")

  if (!online) {
    return (
      <p className="max-w-[60ch] text-muted-foreground">
        The upload server is not running, so phones cannot send recordings yet. Start it in a terminal with <span className="font-medium text-foreground">npm run server</span> (in the frontend folder), then come back to this tab.
      </p>
    )
  }

  const run = async (work: () => Promise<unknown>) => {
    setError("")
    try {
      await work()
      onChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            const agent = await addAgent(name, device)
            setName("")
            setDevice("")
            setOpen(agent.id)
          })
        }}
      >
        <Field className="w-auto min-w-48 flex-1">
          <FieldLabel htmlFor="agent-name">Agent name</FieldLabel>
          <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jason Cruz" />
        </Field>
        <Field className="w-auto min-w-40 flex-1">
          <FieldLabel htmlFor="agent-device">Device</FieldLabel>
          <Input id="agent-device" value={device} onChange={(e) => setDevice(e.target.value)} placeholder="iPhone" />
        </Field>
        <Button type="submit" disabled={!name.trim()}>Add agent</Button>
      </form>
      {error && <p role="alert" className="border border-destructive px-4 py-3 text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-3">
        <Field orientation="horizontal" className="w-auto flex-wrap">
          <FieldLabel htmlFor="server-address">Phones reach this laptop at</FieldLabel>
          <select
            id="server-address"
            value={address}
            onChange={(e) => setBase(e.target.value)}
            className="h-10 min-w-0 border border-input bg-background px-3 text-base transition-colors duration-200 hover:border-foreground md:text-sm"
          >
            {addresses.map((a) => (
              <option key={a} value={a}>{a}{a === info?.publicUrl ? " (tunnel)" : " (same Wi-Fi)"}</option>
            ))}
          </select>
        </Field>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              const saved = await setPublicUrl(tunnel)
              setBase(saved.publicUrl)
              setTunnel("")
            })
          }}
        >
          <Field className="w-auto min-w-64 flex-1">
            <FieldLabel htmlFor="tunnel-url">Tunnel address (optional)</FieldLabel>
            <Input id="tunnel-url" value={tunnel} onChange={(e) => setTunnel(e.target.value)} placeholder={info?.publicUrl || "https://something.trycloudflare.com"} />
          </Field>
          <Button type="submit" variant="outline">{tunnel.trim() || !info?.publicUrl ? "Save" : "Remove tunnel"}</Button>
        </form>
        <p className="label max-w-[70ch] text-muted-foreground">
          On the same Wi-Fi a recording goes straight from the phone to this laptop. Through a tunnel it passes through that company's servers on the way, so use one only for phones that cannot join this Wi-Fi.
        </p>
      </div>

      {agents.length === 0 ? (
        <p className="text-muted-foreground">No agents yet. Add one above to get their upload link.</p>
      ) : (
        <ul className="border-b border-border">
          {agents.map((a) => {
            const link = uploadLink(address, a)
            return (
              <li key={a.id} className="flex flex-col gap-4 border-t border-border py-5">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-3">
                      <span className="text-xl font-medium tracking-tight">{a.name}</span>
                      {a.revokedAt && <Badge variant="destructive">Turned off</Badge>}
                    </span>
                    <span className="label text-muted-foreground">
                      {a.device} · {a.lastUploadAt ? `last upload ${new Date(a.lastUploadAt).toLocaleString()}` : "no uploads yet"}
                    </span>
                  </div>
                  {!a.revokedAt && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Hide link" : "Show link"}</Button>
                      {revoking === a.id ? (
                        <>
                          <Button size="sm" variant="destructive" onClick={() => { setRevoking(null); void run(() => revokeAgent(a.id)) }}>Turn off this device</Button>
                          <Button size="sm" variant="ghost" onClick={() => setRevoking(null)}>Cancel</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setRevoking(a.id)}>Revoke</Button>
                      )}
                    </div>
                  )}
                </div>
                {open === a.id && !a.revokedAt && (
                  <div className="flex flex-wrap items-start gap-6">
                    <Qr text={link} />
                    <div className="flex min-w-0 flex-1 basis-64 flex-col gap-3">
                      <p className="label text-muted-foreground">Upload link for {a.name}. It is their key: anyone who has it can send recordings as them.</p>
                      <p className="border border-border px-3 py-2 text-sm break-all select-all">{link}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="self-start"
                        onClick={() => void navigator.clipboard.writeText(link).then(() => { setCopied(a.id); setTimeout(() => setCopied(null), 1500) })}
                      >
                        {copied === a.id ? "Copied" : "Copy link"}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export { Devices }
