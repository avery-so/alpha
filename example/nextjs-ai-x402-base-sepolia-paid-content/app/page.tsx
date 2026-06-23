"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { type FormEvent, useMemo, useState } from "react";

interface PaidContentSuccess {
  ok: true;
  status: number;
  body: unknown;
  transactionHash?: string;
}

interface PaidContentFailure {
  ok: false;
  reason: string;
  status: number;
}

type PaidContentOutput = PaidContentSuccess | PaidContentFailure;

export default function Home() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const isBusy = status === "submitted" || status === "streaming";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();

    if (text.length === 0 || isBusy) {
      return;
    }

    sendMessage({ text });
    setInput("");
  }

  return (
    <main className="chat-shell">
      <header className="app-header">
        <h1>Base Sepolia Paid Content</h1>
        <p>
          Ask DeepSeek to read a paid x402 endpoint. The server-side tool pays with the workspace
          Alpha SDK and returns the paid response.
        </p>
      </header>

      <section className="message-list" aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>Try: Call readPaidContent once and summarize the paid response.</p>
          </div>
        ) : (
          messages.map((message) => (
            <article className={`message message-${message.role}`} key={message.id}>
              <div className="message-role">{message.role}</div>
              <div className="message-content">
                {message.parts.map((part, index) => (
                  <MessagePart key={`${message.id}-${index}`} part={part} />
                ))}
              </div>
            </article>
          ))
        )}
      </section>

      <form className="composer" onSubmit={handleSubmit}>
        <input
          aria-label="Message"
          autoComplete="off"
          disabled={isBusy}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask DeepSeek to read paid content..."
          value={input}
        />
        <button disabled={isBusy || input.trim().length === 0} type="submit">
          {isBusy ? "Reading" : "Send"}
        </button>
      </form>
    </main>
  );
}

function MessagePart({ part }: { part: UIMessage["parts"][number] }) {
  if (part.type === "text") {
    return <span>{part.text}</span>;
  }

  if (part.type === "tool-readPaidContent") {
    return <PaidContentToolPart output={part.output as PaidContentOutput | undefined} />;
  }

  return null;
}

function PaidContentToolPart({ output }: { output: PaidContentOutput | undefined }) {
  const formattedBody = useMemo(() => {
    if (output === undefined || !output.ok) {
      return "";
    }

    return formatJson(output.body);
  }, [output]);

  if (output === undefined) {
    return (
      <aside className="tool-result">
        <header>
          <h2>readPaidContent</h2>
          <span className="tool-status">Running</span>
        </header>
      </aside>
    );
  }

  if (!output.ok) {
    return (
      <aside className="tool-result">
        <header>
          <h2>readPaidContent</h2>
          <span className="tool-status tool-status-error">Failed</span>
        </header>
        <p className="tool-error">
          {output.reason} returned status {output.status}.
        </p>
      </aside>
    );
  }

  return (
    <aside className="tool-result">
      <header>
        <h2>readPaidContent</h2>
        <span className="tool-status">Succeeded · {output.status}</span>
      </header>
      {output.transactionHash === undefined ? null : (
        <a
          className="transaction-link"
          href={`https://sepolia.basescan.org/tx/${output.transactionHash}`}
          rel="noreferrer"
          target="_blank"
        >
          View transaction on BaseScan
        </a>
      )}
      <pre className="json-output">{formattedBody}</pre>
    </aside>
  );
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
