# Georgian AI customer assistant

A website chat assistant for small businesses that answers in Georgian from the company's own data.
Repeated questions are answered for free from approved templates; new questions go to Claude Haiku 5.5 with prompt caching. Every answer is logged with its route, tokens and cost.

- **Ready answers first.** Matches Georgian written in Georgian *or* Latin letters ("ra girs?" = "რა ღირს?").
- **Grounded answers.** Haiku only sees the company's knowledge and is told to hand off instead of guessing.
- **Learns from use.** New questions become suggested templates; a person approves them in `/admin`.
- **One line to embed** on any site via `public/widget.js`.
- **Multi-company.** A new company is a folder of JSON and Markdown, no code changes.

Stack: Next.js 14, TypeScript, PostgreSQL, Anthropic SDK. Deploys to Railway.

```bash
npm install && cp .env.example .env
npm run db:migrate && npm run seed
npm run test:router
npm run dev
```

The demo company, FixLab, is fictional.

Full write-up in Georgian, including architecture, costs and deployment: [ARCHITECTURE.md](ARCHITECTURE.md).
