"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { type FormEvent, useState } from "react";

interface SearchResult {
  title: string;
  url: string;
  text: string;
}

interface SearchSuccess {
  ok: true;
  results: SearchResult[];
}

interface SearchFailure {
  ok: false;
  reason: string;
  status: number;
}

type SearchOutput = SearchSuccess | SearchFailure;

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
        <h1>x402 Exa Search</h1>
        <p>
          Ask a research question. The assistant can call Exa Search through an
          x402 payment using the workspace Alpha SDK.
        </p>
      </header>

      <section className="message-list" aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>
              Try: Search for the latest public examples of x402 paid APIs and
              summarize what developers can build with them.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              className={`message message-${message.role}`}
              key={message.id}
            >
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
          placeholder="Ask about something current..."
          value={input}
        />
        <button disabled={isBusy || input.trim().length === 0} type="submit">
          {isBusy ? "Searching" : "Send"}
        </button>
      </form>
    </main>
  );
}

function MessagePart({ part }: { part: UIMessage["parts"][number] }) {
  if (part.type === "text") {
    return <span>{part.text}</span>;
  }

  if (part.type === "tool-searchExa") {
    return <SearchToolPart output={part.output as SearchOutput | undefined} />;
  }

  return null;
}

function SearchToolPart({ output }: { output: SearchOutput | undefined }) {
  if (output === undefined) {
    return (
      <aside className="tool-result">
        <header>
          <h2>Exa Search</h2>
          <span className="tool-status">Running</span>
        </header>
      </aside>
    );
  }

  if (!output.ok) {
    return (
      <aside className="tool-result">
        <header>
          <h2>Exa Search</h2>
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
        <h2>Exa Search</h2>
        <span className="tool-status">{output.results.length} results</span>
      </header>
      <ul className="result-list">
        {output.results.map((result) => (
          <li key={result.url}>
            <a href={result.url} rel="noreferrer" target="_blank">
              {result.title || result.url}
            </a>
            {result.text.length > 0 ? <p>{result.text}</p> : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
