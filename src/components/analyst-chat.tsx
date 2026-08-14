"use client";

import { FormEvent, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, LoaderCircle, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnalystMessage } from "@/lib/ai/analyst";

export function AnalystChat({ enabled }: { enabled: boolean }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat<AnalystMessage>({
    transport: new DefaultChatTransport({ api: "/api/analyst" }),
  });
  const busy = status === "submitted" || status === "streaming";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!enabled || busy || !input.trim()) return;
    void sendMessage({ text: input.trim() });
    setInput("");
  };

  return <>
    <div className="min-h-[410px] space-y-6 p-5 sm:p-8">
      {messages.length === 0 && <div className="flex gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Bot className="size-4" /></div><div className="max-w-xl rounded-2xl rounded-tl-sm bg-white/[0.04] p-4 text-sm leading-6"><p>I can help analyze your last 30 days. Try asking:</p><div className="mt-3 flex flex-wrap gap-2">{["Which campaign has the highest AOV?","Why did cancellations increase?","Summarize Meta delivery health"].map(q=><button type="button" disabled={!enabled} onClick={()=>setInput(q)} key={q} className="rounded-full border border-white/10 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed">{q}</button>)}</div></div></div>}
      {messages.map(message => <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}>{message.role !== "user" && <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Bot className="size-4" /></div>}<div className={`max-w-2xl rounded-2xl p-4 text-sm leading-6 ${message.role === "user" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-white/[0.04]"}`}>{message.parts.map((part,index)=>part.type === "text" ? <span key={index} className="whitespace-pre-wrap">{part.text}</span> : null)}</div>{message.role === "user" && <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06]"><UserRound className="size-4" /></div>}</div>)}
      {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Analyzing aggregate data…</div>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </div>
    <form onSubmit={submit} className="flex gap-2 border-t border-white/[0.07] p-4"><Input value={input} onChange={event=>setInput(event.target.value)} placeholder="Ask about orders, revenue or Meta events…" disabled={!enabled || busy} /><Button type="submit" size="icon" disabled={!enabled || busy || !input.trim()} aria-label="Send"><Send className="size-4" /></Button></form>
    {!enabled&&<p className="px-5 pb-4 text-xs text-amber-300">Add OPENAI_API_KEY to enable the analyst. No data is being sent.</p>}
  </>;
}
