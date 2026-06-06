"use client";

import { useState, useTransition } from "react";
import { runIngestNow } from "./actions";

export function IngestButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await runIngestNow();
            setMsg(r.ok ? `Synced. ${JSON.stringify(r.summary)}` : `Error: ${r.error}`);
          })
        }
        disabled={pending}
        className="rounded-lg bg-neon px-4 py-2 font-semibold text-neon-foreground disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Sync results now"}
      </button>
      {msg && <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{msg}</pre>}
    </div>
  );
}
